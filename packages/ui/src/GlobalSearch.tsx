import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { getSupabaseClient } from "@ilm/utils";
import { appUrl } from "./AppSwitcher";
import { useAuth } from "./auth/AuthProvider";

// Static page registry. Each entry is a navigable destination — either a
// top-level app or a major subtab inside one. Keep this in sync when an app
// adds or removes a top-level tab. The hash strings here must match the
// values each app's `useState` initializer accepts (see e.g.
// apps/protocol-manager/src/App.tsx).
type AppKey =
  | "home"
  | "project-manager"
  | "protocol-manager"
  | "supply-manager"
  | "funding-manager"
  | "data-hub"
  | "scheduler";

type PageEntry = {
  id: string;
  label: string;
  group: string;
  keywords?: string[];
  app: AppKey;
  hash?: string;
};

const PAGES: PageEntry[] = [
  { id: "home/overview", label: "Overview", group: "Home", app: "home" },
  { id: "home/team", label: "Team", group: "Home", app: "home", hash: "team", keywords: ["members", "lab"] },
  { id: "home/settings", label: "Settings", group: "Home", app: "home", hash: "settings", keywords: ["preferences", "account"] },
  { id: "home/analytics", label: "Analytics", group: "Home", app: "home", hash: "analytics" },
  { id: "home/reports", label: "Reports", group: "Home", app: "home", hash: "reports" },

  { id: "projects/overview", label: "Projects · Overview", group: "Projects", app: "project-manager", hash: "overview" },
  { id: "projects/library", label: "Projects · Library", group: "Projects", app: "project-manager", hash: "library", keywords: ["browse"] },
  { id: "projects/review", label: "Projects · Review", group: "Projects", app: "project-manager", hash: "review", keywords: ["approval"] },

  { id: "protocols/overview", label: "Protocols · Overview", group: "Protocols", app: "protocol-manager", hash: "overview" },
  { id: "protocols/library", label: "Protocols · Library", group: "Protocols", app: "protocol-manager", hash: "library" },
  { id: "protocols/reviews", label: "Protocols · Reviews", group: "Protocols", app: "protocol-manager", hash: "reviews", keywords: ["approval"] },
  { id: "protocols/recycle", label: "Protocols · Recycle Bin", group: "Protocols", app: "protocol-manager", hash: "recycle", keywords: ["trash", "deleted"] },

  { id: "inventory/warehouse", label: "Inventory · Warehouse", group: "Inventory", app: "supply-manager", hash: "warehouse", keywords: ["catalog", "items", "supplies"] },
  { id: "inventory/orders", label: "Inventory · Orders", group: "Inventory", app: "supply-manager", hash: "orders", keywords: ["purchase"] },
  { id: "inventory/review", label: "Inventory · Order Review", group: "Inventory", app: "supply-manager", hash: "review", keywords: ["approval"] },
  { id: "inventory/my-items", label: "Inventory · My Items", group: "Inventory", app: "supply-manager", hash: "my-items" },

  { id: "funding", label: "Funding Directory", group: "Funding", app: "funding-manager", keywords: ["grants", "alias"] },

  { id: "data-hub/library", label: "Data Hub · Library", group: "Data Hub", app: "data-hub", keywords: ["datasets", "browse"] },
  { id: "data-hub/my", label: "Data Hub · My Datasets", group: "Data Hub", app: "data-hub", hash: "my-datasets", keywords: ["mine", "owner"] },
  { id: "data-hub/requests", label: "Data Hub · Access Requests", group: "Data Hub", app: "data-hub", hash: "requests", keywords: ["share"] },

  { id: "schedule/calendar", label: "Schedule · Calendar", group: "Schedule", app: "scheduler", hash: "calendar" },
  { id: "schedule/bookings", label: "Schedule · Bookings", group: "Schedule", app: "scheduler", hash: "bookings", keywords: ["reservations"] },
  { id: "schedule/unscheduled", label: "Schedule · Unscheduled", group: "Schedule", app: "scheduler", hash: "unscheduled", keywords: ["tasks"] },
  { id: "schedule/resources", label: "Schedule · Resources", group: "Schedule", app: "scheduler", hash: "resources", keywords: ["equipment"] },
];

const APP_HREF: Record<AppKey, string> = {
  "home": "",
  "project-manager": "project-manager/",
  "protocol-manager": "protocol-manager/",
  "supply-manager": "supply-manager/",
  "funding-manager": "funding-manager/",
  "data-hub": "data-hub/",
  "scheduler": "scheduler/",
};

const buildPageHref = (page: PageEntry, baseUrl: string) => {
  const root = appUrl(APP_HREF[page.app], baseUrl);
  return page.hash ? `${root}#/${page.hash}` : root;
};

const matchScore = (page: PageEntry, queryLower: string): number => {
  if (!queryLower) return 0;
  const haystack = [page.label, page.group, ...(page.keywords ?? [])]
    .join(" ")
    .toLowerCase();
  if (!haystack.includes(queryLower)) return -1;
  // Prefer matches that hit the start of the label.
  if (page.label.toLowerCase().startsWith(queryLower)) return 0;
  if (page.group.toLowerCase().startsWith(queryLower)) return 1;
  return 2;
};

const navigateTo = (href: string) => {
  if (typeof window === "undefined") return;
  const target = new URL(href, window.location.href);
  const samePath =
    target.origin === window.location.origin && target.pathname === window.location.pathname;
  if (samePath) {
    // Same SPA — push hash and reload so the app re-reads it on mount. The
    // apps only parse the hash at startup, so a soft hash change wouldn't
    // switch tabs.
    if (target.hash !== window.location.hash) {
      window.location.hash = target.hash;
    }
    window.location.reload();
  } else {
    window.location.href = target.toString();
  }
};

// ---------------------------------------------------------------------------
// Record search — query the active lab's tables by name and surface direct
// links to the matching record. Each result navigates to the parent app with
// a `#/{tab}/{id}` deep link; the apps below opt-in to that route shape and
// open the record on mount.
// ---------------------------------------------------------------------------

type RecordKind = "project" | "protocol" | "item" | "dataset" | "event";

type RecordEntry = {
  id: string;
  recordId: string;
  kind: RecordKind;
  label: string;
  group: string;
  href: string;
};

const RECORD_GROUP_LABEL: Record<RecordKind, string> = {
  project: "Project",
  protocol: "Protocol",
  item: "Item",
  dataset: "Dataset",
  event: "Event",
};

const buildRecordHref = (kind: RecordKind, recordId: string, baseUrl: string): string => {
  const escaped = encodeURIComponent(recordId);
  switch (kind) {
    case "project":
      return `${appUrl(APP_HREF["project-manager"], baseUrl)}#/library/${escaped}`;
    case "protocol":
      return `${appUrl(APP_HREF["protocol-manager"], baseUrl)}#/library/${escaped}`;
    case "item":
      return `${appUrl(APP_HREF["supply-manager"], baseUrl)}#/warehouse/${escaped}`;
    case "dataset":
      return `${appUrl(APP_HREF["data-hub"], baseUrl)}#dataset/${escaped}`;
    case "event":
      return `${appUrl(APP_HREF["scheduler"], baseUrl)}#/calendar/${escaped}`;
  }
};

const escapeIlikeWildcards = (value: string) =>
  value.replace(/[\\%_]/g, (ch) => `\\${ch}`);

async function searchRecords(
  query: string,
  labId: string,
  baseUrl: string
): Promise<RecordEntry[]> {
  const trimmed = query.trim();
  if (!trimmed || !labId) return [];
  const supabase = getSupabaseClient();
  const pattern = `%${escapeIlikeWildcards(trimmed)}%`;
  const limit = 5;

  type ProjectRow = { id: string; name: string };
  type ProtocolRow = { id: string; title: string };
  type ItemRow = { id: string; name: string };
  type DatasetRow = { id: string; name: string };
  type EventRow = { id: string; title: string };

  const [projectsRes, protocolsRes, itemsRes, datasetsRes, eventsRes] =
    await Promise.all([
      supabase
        .from("projects")
        .select("id, name")
        .eq("lab_id", labId)
        .neq("state", "deleted")
        .ilike("name", pattern)
        .order("updated_at", { ascending: false })
        .limit(limit),
      supabase
        .from("protocols")
        .select("id, title")
        .eq("lab_id", labId)
        .ilike("title", pattern)
        .order("updated_at", { ascending: false })
        .limit(limit),
      supabase
        .from("items")
        .select("id, name")
        .eq("lab_id", labId)
        .eq("is_active", true)
        .ilike("name", pattern)
        .order("updated_at", { ascending: false })
        .limit(limit),
      supabase
        .from("datasets")
        .select("id, name")
        .eq("lab_id", labId)
        .is("archived_at", null)
        .ilike("name", pattern)
        .order("updated_at", { ascending: false })
        .limit(limit),
      supabase
        .from("calendar_events")
        .select("id, title")
        .eq("lab_id", labId)
        .neq("status", "cancelled")
        .ilike("title", pattern)
        .order("start_time", { ascending: false })
        .limit(limit),
    ]);

  const out: RecordEntry[] = [];
  for (const row of (projectsRes.data as ProjectRow[] | null) ?? []) {
    out.push({
      id: `record-project-${row.id}`,
      recordId: row.id,
      kind: "project",
      label: row.name,
      group: RECORD_GROUP_LABEL.project,
      href: buildRecordHref("project", row.id, baseUrl),
    });
  }
  for (const row of (protocolsRes.data as ProtocolRow[] | null) ?? []) {
    out.push({
      id: `record-protocol-${row.id}`,
      recordId: row.id,
      kind: "protocol",
      label: row.title,
      group: RECORD_GROUP_LABEL.protocol,
      href: buildRecordHref("protocol", row.id, baseUrl),
    });
  }
  for (const row of (itemsRes.data as ItemRow[] | null) ?? []) {
    out.push({
      id: `record-item-${row.id}`,
      recordId: row.id,
      kind: "item",
      label: row.name,
      group: RECORD_GROUP_LABEL.item,
      href: buildRecordHref("item", row.id, baseUrl),
    });
  }
  for (const row of (datasetsRes.data as DatasetRow[] | null) ?? []) {
    out.push({
      id: `record-dataset-${row.id}`,
      recordId: row.id,
      kind: "dataset",
      label: row.name,
      group: RECORD_GROUP_LABEL.dataset,
      href: buildRecordHref("dataset", row.id, baseUrl),
    });
  }
  for (const row of (eventsRes.data as EventRow[] | null) ?? []) {
    out.push({
      id: `record-event-${row.id}`,
      recordId: row.id,
      kind: "event",
      label: row.title,
      group: RECORD_GROUP_LABEL.event,
      href: buildRecordHref("event", row.id, baseUrl),
    });
  }
  return out;
}

type SearchEntry =
  | ({ entryKind: "page" } & PageEntry)
  | ({ entryKind: "record" } & RecordEntry);

export interface GlobalSearchProps {
  /** Pass `import.meta.env.BASE_URL` from the host app. */
  baseUrl: string;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
}

export const GlobalSearch = ({
  baseUrl,
  placeholder = "Search records, projects, protocols, inventory…",
  className,
  style,
}: GlobalSearchProps) => {
  const { activeLab } = useAuth();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [records, setRecords] = useState<RecordEntry[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listboxId = useId();

  const pageMatches = useMemo<PageEntry[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return PAGES.map((page) => ({ page, score: matchScore(page, q) }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => a.score - b.score || a.page.label.localeCompare(b.page.label))
      .slice(0, 8)
      .map((entry) => entry.page);
  }, [query]);

  // Debounced record search. We keep the previous results visible while a
  // new query is in flight to avoid the dropdown collapsing on each keystroke.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || !activeLab?.id) {
      setRecords([]);
      setRecordsLoading(false);
      return;
    }
    setRecordsLoading(true);
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void searchRecords(trimmed, activeLab.id, baseUrl)
        .then((results) => {
          if (cancelled) return;
          setRecords(results);
          setRecordsLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          setRecords([]);
          setRecordsLoading(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query, activeLab?.id, baseUrl]);

  const entries = useMemo<SearchEntry[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const list: SearchEntry[] = [];
    // Records first — they're the more specific match for a name query.
    for (const r of records) list.push({ entryKind: "record", ...r });
    for (const p of pageMatches) list.push({ entryKind: "page", ...p });
    return list;
  }, [pageMatches, records, query]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const choose = (entry: SearchEntry) => {
    const href =
      entry.entryKind === "page" ? buildPageHref(entry, baseUrl) : entry.href;
    navigateTo(href);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (entries.length === 0) return;
      setActiveIdx((idx) => (idx + 1) % entries.length);
      setOpen(true);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (entries.length === 0) return;
      setActiveIdx((idx) => (idx - 1 + entries.length) % entries.length);
      setOpen(true);
    } else if (event.key === "Enter") {
      const target = entries[activeIdx];
      if (target) {
        event.preventDefault();
        choose(target);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const trimmed = query.trim();
  const showDropdown = open && trimmed.length > 0;
  const showLoading = recordsLoading && entries.length === 0;
  const showEmpty = !recordsLoading && entries.length === 0;

  return (
    <div
      className={["ils-search ils-search--live", className].filter(Boolean).join(" ")}
      role="search"
      ref={containerRef}
      style={style}
    >
      <input
        ref={inputRef}
        type="search"
        className="ils-search-input"
        placeholder={placeholder}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (query) setOpen(true);
        }}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={showDropdown && entries.length > 0}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          showDropdown && entries[activeIdx] ? `${listboxId}-${activeIdx}` : undefined
        }
      />
      <span className="ils-search-glyph" aria-hidden="true">⌕</span>
      {showDropdown ? (
        <ul className="ils-search-results" id={listboxId} role="listbox">
          {showLoading ? (
            <li className="ils-search-empty" role="presentation">
              Searching records…
            </li>
          ) : showEmpty ? (
            <li className="ils-search-empty" role="presentation">
              No matching records or pages.
            </li>
          ) : (
            entries.map((entry, idx) => (
              <li
                key={entry.id}
                id={`${listboxId}-${idx}`}
                role="option"
                aria-selected={idx === activeIdx}
                className={[
                  "ils-search-result",
                  idx === activeIdx ? "is-active" : null,
                  entry.entryKind === "record" ? "is-record" : "is-page",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onMouseEnter={() => setActiveIdx(idx)}
                onMouseDown={(event) => {
                  // mousedown so the click fires before blur dismisses the list
                  event.preventDefault();
                  choose(entry);
                }}
              >
                <span className="ils-search-result-label">{entry.label}</span>
                <span className="ils-search-result-group">{entry.group}</span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
};
