import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@ilm/utils";

export type ProjectStateCounts = {
  draft: number;
  published: number;
  deleted: number;
  total: number;
};

export type ProtocolStats = {
  total: number;
  active: number;
  inReview: number;
  archived: number;
};

export type InventoryStats = {
  total: number;
  reagents: number;
  consumables: number;
  supplies: number;
  samples: number;
  equipment: number;
  kits: number;
  other: number;
  criticalLow: number;
  inOrder: number;
  unchecked: number;
};

export type TeamStats = {
  total: number;
  owners: number;
  admins: number;
  members: number;
  recentAvatars: {
    id: string;
    name: string | null;
    email: string | null;
    headshotUrl: string | null;
  }[];
};

export type PendingReviews = {
  protocols: number;
  projects: number;
  orders: number;
  members: number;
  bookings: number;
  datasets: number;
};

export type ScheduleEntry = {
  id: string;
  title: string;
  startTime: string;
  endTime: string | null;
  kind: "event" | "booking";
  location: string | null;
};

export type ActivityEntry = {
  id: string;
  kind: "protocol" | "project" | "item" | "order" | "booking";
  label: string;
  context: string;
  timestamp: string;
};

export type DashboardData = {
  projects: ProjectStateCounts;
  protocols: ProtocolStats;
  inventory: InventoryStats;
  team: TeamStats;
  pending: PendingReviews;
  schedule: ScheduleEntry[];
  activity: ActivityEntry[];
  isProjectLead: boolean;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const emptyState: Omit<DashboardData, "refresh"> = {
  projects: { draft: 0, published: 0, deleted: 0, total: 0 },
  protocols: { total: 0, active: 0, inReview: 0, archived: 0 },
  inventory: {
    total: 0,
    reagents: 0,
    consumables: 0,
    supplies: 0,
    samples: 0,
    equipment: 0,
    kits: 0,
    other: 0,
    criticalLow: 0,
    inOrder: 0,
    unchecked: 0,
  },
  team: { total: 0, owners: 0, admins: 0, members: 0, recentAvatars: [] },
  pending: { protocols: 0, projects: 0, orders: 0, members: 0, bookings: 0, datasets: 0 },
  schedule: [],
  activity: [],
  isProjectLead: false,
  loading: true,
  refreshing: false,
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

export const useDashboardData = (
  labId: string | null,
  userId: string | null,
  role: "owner" | "admin" | "member" | null = null
): DashboardData => {
  const [state, setState] = useState<Omit<DashboardData, "refresh">>(emptyState);

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      if (!labId) {
        setState({ ...emptyState, loading: false });
        return;
      }
      setState((prev) => ({
        ...prev,
        loading: mode === "initial" ? true : prev.loading,
        refreshing: mode === "refresh",
        error: null,
      }));

      const supabase = getSupabaseClient();
      const nowIso = new Date().toISOString();

      try {
        const [
          projectsRes,
          protocolsRes,
          itemsRes,
          lowChecksRes,
          membersRes,
          pendingProtocolsRes,
          pendingOrdersRes,
          pendingJoinRes,
          pendingBookingsRes,
          pendingDatasetRequestsRes,
          eventsRes,
          bookingsRes,
          recentOrdersRes,
          projectLeadRes,
          inOrderItemsRes,
        ] = await Promise.all([
          supabase.from("projects").select("id, state, updated_at, name, review_requested_at").eq("lab_id", labId),
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
            .order("checked_at", { ascending: false })
            .limit(2000),
          supabase.rpc("list_lab_members", { p_lab_id: labId }),
          supabase
            .from("protocol_submissions")
            .select("id", { count: "exact", head: true })
            .eq("lab_id", labId)
            .eq("status", "pending"),
          supabase
            .from("order_requests")
            .select("id, status, updated_at, created_at, reason", { count: "exact" })
            .eq("lab_id", labId)
            .eq("status", "submitted")
            .order("created_at", { ascending: false })
            .limit(50),
          supabase.rpc("list_lab_join_requests", { p_lab_id: labId, p_status: "pending" }),
          supabase
            .from("bookings")
            .select("id, title, start_time, end_time, status, updated_at", { count: "exact" })
            .eq("lab_id", labId)
            .eq("status", "requested")
            .order("start_time", { ascending: true })
            .limit(50),
          supabase
            .from("dataset_access_requests")
            .select(
              "id, requester_user_id, datasets!inner(lab_id, owner_user_id, contact_user_id)",
              { count: "exact" }
            )
            .eq("lab_id", labId)
            .eq("status", "pending")
            .eq("datasets.lab_id", labId)
            .limit(200),
          supabase
            .from("calendar_events")
            .select("id, title, start_time, end_time, location, status")
            .eq("lab_id", labId)
            .gte("start_time", nowIso)
            .neq("status", "cancelled")
            .order("start_time", { ascending: true })
            .limit(8),
          supabase
            .from("bookings")
            .select("id, title, start_time, end_time, status")
            .eq("lab_id", labId)
            .gte("start_time", nowIso)
            .in("status", ["approved", "active", "requested"])
            .order("start_time", { ascending: true })
            .limit(8),
          supabase
            .from("order_requests")
            .select("id, reason, status, updated_at")
            .eq("lab_id", labId)
            .order("updated_at", { ascending: false })
            .limit(6),
          userId
            ? supabase
                .from("project_leads")
                .select("project_id, projects!inner(lab_id)")
                .eq("user_id", userId)
                .eq("projects.lab_id", labId)
                .limit(1)
            : Promise.resolve({ data: [], error: null } as unknown as { data: unknown[]; error: null }),
          // Items currently "in order": distinct item_ids appearing in
          // order_request_items whose parent order_request is open
          // (submitted / approved / ordered) within this lab.
          supabase
            .from("order_request_items")
            .select("item_id, order_requests!inner(lab_id, status)")
            .eq("order_requests.lab_id", labId)
            .in("order_requests.status", ["submitted", "approved", "ordered"]),
        ]);

        // Projects
        type ProjectRow = {
          id: string;
          state: string;
          updated_at: string;
          name: string;
          review_requested_at: string | null;
        };
        const projectRows = (projectsRes.data as ProjectRow[] | null) ?? [];
        const projects: ProjectStateCounts = {
          draft: projectRows.filter((r) => r.state === "draft").length,
          published: projectRows.filter((r) => r.state === "published").length,
          deleted: projectRows.filter((r) => r.state === "deleted").length,
          total: projectRows.filter((r) => r.state === "published").length,
        };
        const pendingProjectsCount = projectRows.filter(
          (r) => r.state === "draft" && r.review_requested_at !== null
        ).length;

        // Protocols
        const protocolRows = (protocolsRes.data as ProtocolRow[] | null) ?? [];
        let active = 0;
        let inReview = 0;
        let archived = 0;
        for (const row of protocolRows) {
          const fromDoc = readDocStatus(row.document_json);
          const lifecycle = (row.lifecycle_status ?? fromDoc.lifecycle ?? "").toLowerCase();
          const review = (row.review_status ?? fromDoc.review ?? "").toLowerCase();
          if (lifecycle === "archived") archived += 1;
          else if (lifecycle === "active") active += 1;
          if (review === "reviewing" || review === "pending" || review === "submitted") inReview += 1;
        }
        const protocols: ProtocolStats = { total: protocolRows.length, active, inReview, archived };

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
          equipment: byClass("equipment"),
          kits: byClass("kit"),
          other: byClass("other"),
          criticalLow: 0,
          inOrder: 0,
          unchecked: 0,
        };

        // Walk the latest check per item to find the active stock_status, and
        // record which items have ever been checked (for the "unchecked" count).
        type CheckRow = { item_id: string; stock_status: string; checked_at: string };
        const checkRows = (lowChecksRes.data as CheckRow[] | null) ?? [];
        const latestStatus = new Map<string, string>();
        for (const r of checkRows) {
          // Rows arrive sorted by checked_at desc, so the first time we see an
          // item_id is the latest check.
          if (!latestStatus.has(r.item_id)) latestStatus.set(r.item_id, r.stock_status);
        }
        let lowCount = 0;
        for (const status of latestStatus.values()) {
          if (status === "low" || status === "out") lowCount += 1;
        }
        inventory.criticalLow = lowCount;
        const activeItemIds = new Set(itemRows.map((r) => r.id));
        let uncheckedCount = 0;
        for (const id of activeItemIds) {
          if (!latestStatus.has(id)) uncheckedCount += 1;
        }
        inventory.unchecked = uncheckedCount;

        // Items currently in an open order
        type OrderItemRow = { item_id: string };
        const orderItemRows = (inOrderItemsRes.data as OrderItemRow[] | null) ?? [];
        const inOrderSet = new Set<string>();
        for (const r of orderItemRows) {
          if (activeItemIds.has(r.item_id)) inOrderSet.add(r.item_id);
        }
        inventory.inOrder = inOrderSet.size;

        // Team
        type MemberRow = {
          user_id: string;
          role: "owner" | "admin" | "member";
          display_name: string | null;
          email: string | null;
          headshot_url: string | null;
          joined_at: string;
        };
        const memberRows = ((membersRes.data as MemberRow[] | null) ?? []).filter(Boolean);
        const team: TeamStats = {
          total: memberRows.length,
          owners: memberRows.filter((m) => m.role === "owner").length,
          admins: memberRows.filter((m) => m.role === "admin").length,
          members: memberRows.filter((m) => m.role === "member").length,
          recentAvatars: memberRows.slice(0, 7).map((m) => ({
            id: m.user_id,
            name: m.display_name,
            email: m.email,
            headshotUrl: m.headshot_url,
          })),
        };

        // Pending counts
        type PendingJoinRow = { id: string };
        const joinRows = (pendingJoinRes.data as PendingJoinRow[] | null) ?? [];
        type PendingDatasetRequestRow = {
          id: string;
          requester_user_id: string | null;
          datasets:
            | { owner_user_id: string | null; contact_user_id: string | null }
            | { owner_user_id: string | null; contact_user_id: string | null }[]
            | null;
        };
        const datasetRequestRows =
          (pendingDatasetRequestsRes.data as PendingDatasetRequestRow[] | null) ?? [];
        const isLabReviewer = role === "owner" || role === "admin";
        const pendingDatasetRequestsCount = isLabReviewer
          ? (pendingDatasetRequestsRes.count ?? datasetRequestRows.length)
          : datasetRequestRows.filter((row) => {
              const dataset = Array.isArray(row.datasets) ? row.datasets[0] : row.datasets;
              return (
                userId &&
                row.requester_user_id !== userId &&
                (dataset?.owner_user_id === userId || dataset?.contact_user_id === userId)
              );
            }).length;
        const pending: PendingReviews = {
          protocols: pendingProtocolsRes.count ?? 0,
          projects: pendingProjectsCount,
          orders: pendingOrdersRes.count ?? 0,
          members: joinRows.length,
          bookings: pendingBookingsRes.count ?? 0,
          datasets: pendingDatasetRequestsCount,
        };

        // Schedule (calendar_events + upcoming bookings, merged + sorted)
        type EventRow = {
          id: string;
          title: string;
          start_time: string;
          end_time: string | null;
          location: string | null;
          status: string;
        };
        type BookingRow = {
          id: string;
          title: string | null;
          start_time: string;
          end_time: string | null;
          status: string;
        };
        const eventRows = (eventsRes.data as EventRow[] | null) ?? [];
        const bookingRows = (bookingsRes.data as BookingRow[] | null) ?? [];
        const schedule: ScheduleEntry[] = [
          ...eventRows.map((e) => ({
            id: `event-${e.id}`,
            title: e.title,
            startTime: e.start_time,
            endTime: e.end_time,
            kind: "event" as const,
            location: e.location,
          })),
          ...bookingRows.map((b) => ({
            id: `booking-${b.id}`,
            title: b.title ?? "Resource booking",
            startTime: b.start_time,
            endTime: b.end_time,
            kind: "booking" as const,
            location: null,
          })),
        ]
          .sort((a, b) => a.startTime.localeCompare(b.startTime))
          .slice(0, 5);

        // Activity feed: union recent updates across protocols/projects/items/orders/bookings
        type OrderRow = { id: string; reason: string | null; status: string; updated_at: string };
        const orderRows = (recentOrdersRes.data as OrderRow[] | null) ?? [];
        const stream: ActivityEntry[] = [];
        for (const r of protocolRows.slice(0, 6)) {
          stream.push({
            id: `protocol-${r.id}`,
            kind: "protocol",
            label: `Protocol "${r.title}" updated`,
            context: formatRelative(r.updated_at),
            timestamp: r.updated_at,
          });
        }
        for (const r of [...projectRows].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6)) {
          stream.push({
            id: `project-${r.id}`,
            kind: "project",
            label: `Project "${r.name}" updated`,
            context: formatRelative(r.updated_at),
            timestamp: r.updated_at,
          });
        }
        for (const r of [...itemRows].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6)) {
          stream.push({
            id: `item-${r.id}`,
            kind: "item",
            label: `Item "${r.name}" updated`,
            context: formatRelative(r.updated_at),
            timestamp: r.updated_at,
          });
        }
        for (const r of orderRows) {
          stream.push({
            id: `order-${r.id}`,
            kind: "order",
            label: `Order request ${r.status}`,
            context: formatRelative(r.updated_at),
            timestamp: r.updated_at,
          });
        }
        stream.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

        // Project lead?
        type LeadRow = { project_id: string };
        const leadRows = (projectLeadRes.data as LeadRow[] | null) ?? [];

        setState({
          projects,
          protocols,
          inventory,
          team,
          pending,
          schedule,
          activity: stream.slice(0, 6),
          isProjectLead: leadRows.length > 0,
          loading: false,
          refreshing: false,
          error: null,
        });
      } catch (err) {
        setState((prev) => ({ ...prev, loading: false, refreshing: false, error: errorMessage(err) }));
      }
    },
    [labId, role, userId]
  );

  // Initial load + reload on labId/userId change.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await load("initial");
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  // Refresh when the tab becomes visible again (so metrics pick up changes
  // made in another window/app without a hard refresh).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && labId) {
        void load("refresh");
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [labId, load]);

  const refresh = useCallback(async () => {
    await load("refresh");
  }, [load]);

  return { ...state, refresh };
};

export const formatRelativeTime = formatRelative;
