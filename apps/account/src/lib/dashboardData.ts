import { useEffect, useState } from "react";
import { getSupabaseClient } from "@ilm/utils";

export type ProjectStateCounts = {
  draft: number;
  published: number;
  deleted: number;
  total: number;
};

export type ProtocolSummary = {
  id: string;
  title: string;
  description: string | null;
  lifecycleStatus: string | null;
  reviewStatus: string | null;
  updatedAt: string;
};

export type ProtocolStats = {
  total: number;
  active: number;
  inReview: number;
  archived: number;
  recent: ProtocolSummary[];
};

export type InventoryStats = {
  total: number;
  reagents: number;
  consumables: number;
  supplies: number;
  samples: number;
  other: number;
  criticalLow: number;
};

export type TeamStats = {
  total: number;
  owners: number;
  admins: number;
  members: number;
  recentAvatars: { id: string; label: string; email: string | null }[];
};

export type ActivityEntry = {
  id: string;
  kind: "protocol" | "project" | "item";
  label: string;
  context: string;
  timestamp: string;
};

export type DashboardData = {
  projects: ProjectStateCounts;
  protocols: ProtocolStats;
  inventory: InventoryStats;
  team: TeamStats;
  activity: ActivityEntry[];
  loading: boolean;
  error: string | null;
};

const empty: DashboardData = {
  projects: { draft: 0, published: 0, deleted: 0, total: 0 },
  protocols: { total: 0, active: 0, inReview: 0, archived: 0, recent: [] },
  inventory: { total: 0, reagents: 0, consumables: 0, supplies: 0, samples: 0, other: 0, criticalLow: 0 },
  team: { total: 0, owners: 0, admins: 0, members: 0, recentAvatars: [] },
  activity: [],
  loading: true,
  error: null,
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Unexpected error");

const formatRelative = (iso: string): string => {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "";
  const diffMs = Date.now() - ts;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs < minute) return "just now";
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}d ago`;
  return new Date(iso).toLocaleDateString();
};

type ProtocolRow = {
  id: string;
  title: string;
  description: string | null;
  lifecycle_status: string | null;
  review_status: string | null;
  updated_at: string;
  document_json: { protocol?: { metadata?: Record<string, unknown> } } | null;
};

const readDocStatus = (doc: ProtocolRow["document_json"]): { lifecycle: string | null; review: string | null } => {
  const meta = doc?.protocol?.metadata;
  return {
    lifecycle: typeof meta?.lifecycleStatus === "string" ? (meta.lifecycleStatus as string) : null,
    review: typeof meta?.reviewStatus === "string" ? (meta.reviewStatus as string) : null,
  };
};

export const useDashboardData = (labId: string | null): DashboardData => {
  const [data, setData] = useState<DashboardData>(empty);

  useEffect(() => {
    if (!labId) {
      setData({ ...empty, loading: false });
      return;
    }
    let cancelled = false;
    setData((prev) => ({ ...prev, loading: true, error: null }));

    const supabase = getSupabaseClient();

    (async () => {
      try {
        const [projectsRes, protocolsRes, itemsRes, lowChecksRes, membersRes] = await Promise.all([
          supabase.from("projects").select("id, state, updated_at, name").eq("lab_id", labId),
          supabase
            .from("protocols")
            .select("id, title, description, lifecycle_status, review_status, updated_at, document_json")
            .eq("lab_id", labId)
            .order("updated_at", { ascending: false }),
          supabase
            .from("items")
            .select("id, classification, updated_at, name")
            .eq("lab_id", labId)
            .eq("is_active", true),
          supabase
            .from("inventory_checks")
            .select("item_id, stock_status, checked_at, items!inner(lab_id)")
            .eq("items.lab_id", labId)
            .in("stock_status", ["low", "out"])
            .order("checked_at", { ascending: false })
            .limit(200),
          supabase.rpc("list_lab_members", { p_lab_id: labId }),
        ]);

        if (cancelled) return;

        // Projects
        type ProjectRow = { id: string; state: string; updated_at: string; name: string };
        const projectRows = (projectsRes.data as ProjectRow[] | null) ?? [];
        const projects: ProjectStateCounts = {
          draft: projectRows.filter((r) => r.state === "draft").length,
          published: projectRows.filter((r) => r.state === "published").length,
          deleted: projectRows.filter((r) => r.state === "deleted").length,
          total: projectRows.filter((r) => r.state !== "deleted").length,
        };

        // Protocols
        const protocolRows = (protocolsRes.data as ProtocolRow[] | null) ?? [];
        let active = 0;
        let inReview = 0;
        let archived = 0;
        const recent: ProtocolSummary[] = [];
        for (const row of protocolRows) {
          const fromDoc = readDocStatus(row.document_json);
          const lifecycle = (row.lifecycle_status ?? fromDoc.lifecycle ?? "").toLowerCase();
          const review = (row.review_status ?? fromDoc.review ?? "").toLowerCase();
          if (lifecycle === "archived") archived += 1;
          else if (lifecycle === "active") active += 1;
          if (review === "reviewing" || review === "pending" || review === "submitted") inReview += 1;
          if (recent.length < 4) {
            recent.push({
              id: row.id,
              title: row.title,
              description: row.description,
              lifecycleStatus: row.lifecycle_status ?? fromDoc.lifecycle,
              reviewStatus: row.review_status ?? fromDoc.review,
              updatedAt: row.updated_at,
            });
          }
        }
        const protocols: ProtocolStats = {
          total: protocolRows.length,
          active,
          inReview,
          archived,
          recent,
        };

        // Inventory
        type ItemRow = { id: string; classification: string; updated_at: string; name: string };
        const itemRows = (itemsRes.data as ItemRow[] | null) ?? [];
        const byClass = (c: string) => itemRows.filter((r) => r.classification === c).length;
        const inventory: InventoryStats = {
          total: itemRows.length,
          reagents: byClass("reagent"),
          consumables: byClass("consumable"),
          supplies: byClass("supply"),
          samples: byClass("sample"),
          other: byClass("other"),
          criticalLow: 0,
        };

        // Critical low: latest inventory_check per item with status low|out
        type LowRow = { item_id: string; stock_status: string; checked_at: string };
        const lowRows = (lowChecksRes.data as LowRow[] | null) ?? [];
        const seenLow = new Set<string>();
        for (const r of lowRows) {
          if (seenLow.has(r.item_id)) continue;
          seenLow.add(r.item_id);
        }
        inventory.criticalLow = seenLow.size;

        // Team
        type MemberRow = { user_id: string; role: "owner" | "admin" | "member"; display_name: string | null; email: string | null; joined_at: string };
        const memberRows = ((membersRes.data as MemberRow[] | null) ?? []).filter(Boolean);
        const team: TeamStats = {
          total: memberRows.length,
          owners: memberRows.filter((m) => m.role === "owner").length,
          admins: memberRows.filter((m) => m.role === "admin").length,
          members: memberRows.filter((m) => m.role === "member").length,
          recentAvatars: memberRows.slice(0, 7).map((m) => ({
            id: m.user_id,
            label: (m.display_name || m.email || "?").slice(0, 2).toUpperCase(),
            email: m.email,
          })),
        };

        // Activity feed: union recent updates across protocols/projects/items.
        const stream: ActivityEntry[] = [];
        for (const r of protocolRows.slice(0, 6)) {
          stream.push({
            id: `protocol-${r.id}`,
            kind: "protocol",
            label: `Protocol "${r.title}" was updated`,
            context: formatRelative(r.updated_at),
            timestamp: r.updated_at,
          });
        }
        for (const r of [...projectRows].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6)) {
          stream.push({
            id: `project-${r.id}`,
            kind: "project",
            label: `Project "${r.name}" was updated`,
            context: formatRelative(r.updated_at),
            timestamp: r.updated_at,
          });
        }
        for (const r of [...itemRows].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6)) {
          stream.push({
            id: `item-${r.id}`,
            kind: "item",
            label: `Inventory item "${r.name}" was updated`,
            context: formatRelative(r.updated_at),
            timestamp: r.updated_at,
          });
        }
        stream.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

        setData({
          projects,
          protocols,
          inventory,
          team,
          activity: stream.slice(0, 5),
          loading: false,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        setData({ ...empty, loading: false, error: errorMessage(err) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [labId]);

  return data;
};

export const formatRelativeTime = formatRelative;
