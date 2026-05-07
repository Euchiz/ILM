import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { appUrl } from "./AppSwitcher";

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

export interface GlobalSearchProps {
  /** Pass `import.meta.env.BASE_URL` from the host app. */
  baseUrl: string;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
}

export const GlobalSearch = ({
  baseUrl,
  placeholder = "Search projects, protocols, inventory…",
  className,
  style,
}: GlobalSearchProps) => {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listboxId = useId();

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as PageEntry[];
    const scored = PAGES.map((page) => ({ page, score: matchScore(page, q) }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => a.score - b.score || a.page.label.localeCompare(b.page.label));
    return scored.slice(0, 12).map((entry) => entry.page);
  }, [query]);

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

  const choose = (page: PageEntry) => {
    const href = buildPageHref(page, baseUrl);
    navigateTo(href);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (matches.length === 0) return;
      setActiveIdx((idx) => (idx + 1) % matches.length);
      setOpen(true);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (matches.length === 0) return;
      setActiveIdx((idx) => (idx - 1 + matches.length) % matches.length);
      setOpen(true);
    } else if (event.key === "Enter") {
      const target = matches[activeIdx];
      if (target) {
        event.preventDefault();
        choose(target);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

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
        aria-expanded={open && matches.length > 0}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && matches[activeIdx] ? `${listboxId}-${activeIdx}` : undefined
        }
      />
      <span className="ils-search-glyph" aria-hidden="true">⌕</span>
      {open && query.trim().length > 0 ? (
        <ul className="ils-search-results" id={listboxId} role="listbox">
          {matches.length === 0 ? (
            <li className="ils-search-empty" role="presentation">
              No matching pages.
            </li>
          ) : (
            matches.map((page, idx) => (
              <li
                key={page.id}
                id={`${listboxId}-${idx}`}
                role="option"
                aria-selected={idx === activeIdx}
                className={[
                  "ils-search-result",
                  idx === activeIdx ? "is-active" : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
                onMouseEnter={() => setActiveIdx(idx)}
                onMouseDown={(event) => {
                  // mousedown so the click fires before blur dismisses the list
                  event.preventDefault();
                  choose(page);
                }}
              >
                <span className="ils-search-result-label">{page.label}</span>
                <span className="ils-search-result-group">{page.group}</span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
};
