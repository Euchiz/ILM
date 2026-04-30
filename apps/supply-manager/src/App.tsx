import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Badge,
  Button,
  CheckboxField,
  EmptyState,
  ErrorBanner,
  FormField,
  FormRow,
  InlineError,
  InlineNote,
  Input,
  LabShell,
  LabTopbar,
  Modal,
  Panel,
  SectionHeader,
  Select,
  StatusPill,
  Table,
  TableEmpty,
  TableLoading,
  Textarea,
  useAuth,
  type StatusTone,
} from "@ilm/ui";
import { useSupplyWorkspace } from "./lib/useSupplyWorkspace";
import { suggestFundingSourceForOrder, type FundingSuggestion } from "./lib/suggestFunding";
import {
  fundingVisibilityLabel,
  getFundingStatus,
  isFundingSourceAssignable,
} from "@ilm/utils";
import type {
  FundingSourceRecord,
  InventoryCheckRecord,
  ItemAssociationType,
  ItemClassification,
  ItemProjectRecord,
  ItemRecord,
  OrderRecord,
  OrderRequestItemRecord,
  OrderRequestRecord,
  OrderRequestStatus,
  OrderStatus,
  ReceiveLotInput,
  RequestPriority,
  StockLotRecord,
  StockStatus,
} from "./lib/cloudAdapter";

const APP_BASE_URL = import.meta.env.BASE_URL;

const CLASSIFICATIONS: ItemClassification[] = [
  "reagent",
  "consumable",
  "supply",
  "sample",
  "equipment",
  "kit",
  "other",
];
const STOCK_STATUSES: StockStatus[] = ["plenty", "medium", "low", "out", "unknown"];
const REQUEST_PRIORITIES: RequestPriority[] = ["low", "normal", "high", "urgent"];
const ASSOCIATION_TYPES: ItemAssociationType[] = ["primary", "shared", "temporary", "general"];
const NON_RECEIVED_ORDER_STATUSES: Exclude<OrderStatus, "received">[] = [
  "order_placed",
  "shipped",
  "partially_received",
  "cancelled",
];

const STALE_CHECK_DAYS = 60;

type SidebarTab = "warehouse" | "orders" | "review" | "my-items";

type ModalState =
  | { kind: "none" }
  | { kind: "new-item" }
  | { kind: "edit-item"; itemId: string }
  | { kind: "inventory-check"; itemId: string }
  | { kind: "new-request"; presetItemIds?: string[] | null }
  | { kind: "edit-request"; requestId: string }
  | { kind: "review-request"; requestId: string; mode: "approve" | "deny" }
  | { kind: "place-order"; requestId: string }
  | { kind: "update-order"; orderId: string }
  | { kind: "receive-order"; orderId: string }
  | { kind: "bulk-check"; itemIds: string[] }
  | { kind: "bulk-projects"; itemIds: string[] }
  | { kind: "bulk-location"; itemIds: string[] };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const statusLabel = (value: string) =>
  value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown; details?: unknown; hint?: unknown };
    if (typeof candidate.message === "string" && candidate.message.trim() !== "") {
      const detail =
        typeof candidate.details === "string" && candidate.details.trim() !== ""
          ? ` (${candidate.details})`
          : typeof candidate.hint === "string" && candidate.hint.trim() !== ""
          ? ` (${candidate.hint})`
          : "";
      return candidate.message + detail;
    }
  }
  return "Unexpected error";
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
};

const daysSince = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const ms = Date.now() - new Date(value).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 86_400_000);
};

const stockStatusTone = (status: StockStatus): StatusTone => {
  switch (status) {
    case "plenty":
      return "active";
    case "medium":
      return "validated";
    case "low":
      return "blocked";
    case "out":
      return "rejected";
    default:
      return "neutral";
  }
};

const requestStatusTone = (status: OrderRequestStatus): StatusTone => {
  switch (status) {
    case "draft":
      return "draft";
    case "submitted":
      return "submitted";
    case "approved":
      return "active";
    case "denied":
      return "rejected";
    case "withdrawn":
      return "deleted";
    case "ordered":
      return "reviewed";
    case "received":
      return "validated";
    case "cancelled":
      return "cancelled";
    default:
      return "neutral";
  }
};

const orderStatusTone = (status: OrderStatus): StatusTone => {
  switch (status) {
    case "order_placed":
      return "submitted";
    case "shipped":
      return "reviewing";
    case "partially_received":
      return "validated";
    case "received":
      return "active";
    case "cancelled":
      return "cancelled";
    default:
      return "neutral";
  }
};

const priorityTone = (priority: RequestPriority | null | undefined): StatusTone => {
  if (priority === "urgent") return "blocked";
  if (priority === "high") return "submitted";
  if (priority === "low") return "neutral";
  return "neutral";
};

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------

export const App = () => {
  const { user, profile, activeLab } = useAuth();
  const isAdmin = activeLab?.role === "owner" || activeLab?.role === "admin";
  const workspace = useSupplyWorkspace(activeLab?.id ?? null, user?.id ?? null);
  const { status, error, refresh } = workspace;

  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(() => {
    if (typeof window === "undefined") return "warehouse";
    const hash = window.location.hash.replace(/^#\/?/, "").toLowerCase();
    if (hash === "review" || hash === "orders" || hash === "warehouse" || hash === "my-items") {
      return hash as SidebarTab;
    }
    return "warehouse";
  });
  const [modal, setModal] = useState<ModalState>({ kind: "none" });
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  const toggleItemSelected = (id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const setAllSelected = (ids: string[], on: boolean) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };
  const clearSelection = () => setSelectedItemIds(new Set());

  // Filters
  const [search, setSearch] = useState("");
  const [classificationFilter, setClassificationFilter] = useState<ItemClassification | "all">("all");
  const [showArchived, setShowArchived] = useState(false);
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [stockFilter, setStockFilter] = useState<StockStatus | "all">("all");
  const [storageFilter, setStorageFilter] = useState<string>("all");
  const [ordersFilter, setOrdersFilter] = useState<"active" | "mine" | "received" | "all">("active");

  // ---------------------------------------------------------------------
  // Computed maps
  // ---------------------------------------------------------------------

  const itemsById = useMemo(
    () => new Map(workspace.items.map((item) => [item.id, item])),
    [workspace.items]
  );

  const projectsById = useMemo(
    () => new Map(workspace.projects.map((p) => [p.id, p])),
    [workspace.projects]
  );

  const fundingSourcesById = useMemo(
    () => new Map(workspace.fundingSources.map((s) => [s.id, s])),
    [workspace.fundingSources]
  );

  const assignableFundingSources = useMemo(
    () => workspace.fundingSources.filter((s) => isFundingSourceAssignable(s)),
    [workspace.fundingSources]
  );

  const latestCheckByItem = useMemo(() => {
    const map = new Map<string, InventoryCheckRecord>();
    for (const check of workspace.inventoryChecks) {
      const prior = map.get(check.item_id);
      if (!prior || new Date(check.checked_at) > new Date(prior.checked_at)) {
        map.set(check.item_id, check);
      }
    }
    return map;
  }, [workspace.inventoryChecks]);

  const checksByItem = useMemo(() => {
    const map = new Map<string, InventoryCheckRecord[]>();
    for (const check of workspace.inventoryChecks) {
      const arr = map.get(check.item_id) ?? [];
      arr.push(check);
      map.set(check.item_id, arr);
    }
    return map;
  }, [workspace.inventoryChecks]);

  const linksByItem = useMemo(() => {
    const map = new Map<string, ItemProjectRecord[]>();
    for (const link of workspace.itemProjects) {
      const arr = map.get(link.item_id) ?? [];
      arr.push(link);
      map.set(link.item_id, arr);
    }
    return map;
  }, [workspace.itemProjects]);

  const requestItemsByRequest = useMemo(() => {
    const map = new Map<string, OrderRequestItemRecord[]>();
    for (const ri of workspace.orderRequestItems) {
      const arr = map.get(ri.order_request_id) ?? [];
      arr.push(ri);
      map.set(ri.order_request_id, arr);
    }
    return map;
  }, [workspace.orderRequestItems]);

  const ordersByRequest = useMemo(() => {
    const map = new Map<string, OrderRecord[]>();
    for (const order of workspace.orders) {
      const arr = map.get(order.order_request_id) ?? [];
      arr.push(order);
      map.set(order.order_request_id, arr);
    }
    return map;
  }, [workspace.orders]);

  const lotsByOrder = useMemo(() => {
    const map = new Map<string, StockLotRecord[]>();
    for (const lot of workspace.stockLots) {
      if (!lot.order_id) continue;
      const arr = map.get(lot.order_id) ?? [];
      arr.push(lot);
      map.set(lot.order_id, arr);
    }
    return map;
  }, [workspace.stockLots]);

  const myProjectIds = useMemo(
    () => new Set(workspace.myProjectIds),
    [workspace.myProjectIds]
  );

  const isMyItem = (item: ItemRecord) => {
    const links = linksByItem.get(item.id) ?? [];
    if (links.length === 0) return true; // general lab-wide
    return links.some(
      (l) =>
        l.association_type === "general" ||
        l.project_id === null ||
        (l.project_id && myProjectIds.has(l.project_id))
    );
  };

  // ---------------------------------------------------------------------
  // Filtered warehouse rows
  // ---------------------------------------------------------------------

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return workspace.items.filter((item) => {
      if (!showArchived && !item.is_active) return false;
      if (classificationFilter !== "all" && item.classification !== classificationFilter) return false;
      if (stockFilter !== "all") {
        const latest = latestCheckByItem.get(item.id);
        const itemStatus = latest?.stock_status ?? "unknown";
        if (itemStatus !== stockFilter) return false;
      }
      if (storageFilter !== "all" && (item.storage_location ?? "") !== storageFilter) return false;
      if (projectFilter !== "all") {
        const links = linksByItem.get(item.id) ?? [];
        if (projectFilter === "general") {
          const isGeneral =
            links.length === 0 ||
            links.some((l) => l.association_type === "general" || l.project_id === null);
          if (!isGeneral) return false;
        } else if (!links.some((l) => l.project_id === projectFilter)) {
          return false;
        }
      }
      if (query) {
        const haystack = [
          item.name,
          item.details,
          item.preferred_vendor,
          item.catalog_number,
          item.storage_location,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [
    workspace.items,
    search,
    showArchived,
    classificationFilter,
    stockFilter,
    storageFilter,
    projectFilter,
    latestCheckByItem,
    linksByItem,
  ]);

  const storageOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of workspace.items) {
      if (item.storage_location) set.add(item.storage_location);
    }
    return Array.from(set).sort();
  }, [workspace.items]);

  // ---------------------------------------------------------------------
  // Filtered order request rows
  // ---------------------------------------------------------------------

  const visibleRequests = useMemo(() => {
    return workspace.orderRequests.filter((req) => {
      if (ordersFilter === "mine") return req.requested_by === user?.id;
      if (ordersFilter === "received") return req.status === "received";
      if (ordersFilter === "active") {
        return ["draft", "submitted", "approved", "ordered"].includes(req.status);
      }
      return true;
    });
  }, [workspace.orderRequests, ordersFilter, user?.id]);

  const pendingReviewRequests = useMemo(
    () => workspace.orderRequests.filter((r) => r.status === "submitted"),
    [workspace.orderRequests]
  );

  const myActiveRequests = useMemo(
    () =>
      workspace.orderRequests.filter(
        (r) => r.requested_by === user?.id && r.status !== "received" && r.status !== "denied"
      ),
    [workspace.orderRequests, user?.id]
  );

  // ---------------------------------------------------------------------
  // My items list (project-scoped + general)
  // ---------------------------------------------------------------------

  const myItems = useMemo(
    () => workspace.items.filter((item) => item.is_active && isMyItem(item)),
    [workspace.items, linksByItem, myProjectIds]
  );

  const myLowOrUnknown = useMemo(
    () =>
      myItems.filter((item) => {
        const latest = latestCheckByItem.get(item.id);
        const status = latest?.stock_status ?? "unknown";
        return status === "low" || status === "out" || status === "unknown";
      }),
    [myItems, latestCheckByItem]
  );

  const myStaleItems = useMemo(
    () =>
      myItems.filter((item) => {
        const latest = latestCheckByItem.get(item.id);
        if (!latest) return true;
        const days = daysSince(latest.checked_at);
        return days !== null && days > STALE_CHECK_DAYS;
      }),
    [myItems, latestCheckByItem]
  );

  // ---------------------------------------------------------------------
  // Action wrappers
  // ---------------------------------------------------------------------

  const wrap = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setActionError(null);
    try {
      return await fn();
    } catch (err) {
      setActionError(errorMessage(err));
      return null;
    }
  };

  const handleArchive = async (item: ItemRecord) => {
    if (!window.confirm(`Archive "${item.name}"?`)) return;
    await wrap(() => workspace.archiveItem(item.id));
  };

  const handleUnarchive = async (item: ItemRecord) => {
    await wrap(() => workspace.unarchiveItem(item.id));
  };

  const handleBulkArchive = async () => {
    const ids = [...selectedItemIds];
    if (ids.length === 0) return;
    if (!window.confirm(`Archive ${ids.length} item${ids.length === 1 ? "" : "s"}?`)) return;
    await wrap(async () => {
      for (const id of ids) await workspace.archiveItem(id);
    });
    clearSelection();
  };

  const handleBulkUnarchive = async () => {
    const ids = [...selectedItemIds];
    if (ids.length === 0) return;
    await wrap(async () => {
      for (const id of ids) await workspace.unarchiveItem(id);
    });
    clearSelection();
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedItemIds];
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Permanently delete ${ids.length} item${ids.length === 1 ? "" : "s"}? This cannot be undone.`
      )
    )
      return;
    await wrap(async () => {
      for (const id of ids) await workspace.deleteItem(id);
    });
    clearSelection();
  };

  const handleDeleteRequest = async (req: OrderRequestRecord) => {
    if (!window.confirm("Delete this draft request?")) return;
    await wrap(() => workspace.deleteOrderRequest(req.id));
  };

  const handleSubmitRequest = async (req: OrderRequestRecord) => {
    const items = requestItemsByRequest.get(req.id) ?? [];
    if (items.length === 0) {
      setActionError("Add at least one item to the request before submitting.");
      return;
    }
    await wrap(() => workspace.submitOrderRequest(req.id));
  };

  const handleWithdrawRequest = async (req: OrderRequestRecord) => {
    if (!window.confirm("Withdraw this submitted request?")) return;
    await wrap(() => workspace.withdrawOrderRequest(req.id));
  };

  const handleCancelRequest = async (req: OrderRequestRecord) => {
    if (!window.confirm("Cancel this request?")) return;
    await wrap(() => workspace.cancelOrderRequest(req.id));
  };

  // ---------------------------------------------------------------------
  // Subbar tabs (rendered inside LabShell's subbar slot)
  // ---------------------------------------------------------------------

  const subbarTabs = (
    <nav className="sm-subbar-tabs" aria-label="Supply manager sections">
      <button
        type="button"
        className={`sm-subtab${sidebarTab === "warehouse" ? " is-active" : ""}`}
        onClick={() => setSidebarTab("warehouse")}
      >
        Warehouse
      </button>
      <button
        type="button"
        className={`sm-subtab${sidebarTab === "orders" ? " is-active" : ""}`}
        onClick={() => setSidebarTab("orders")}
      >
        Orders
        {myActiveRequests.length > 0 ? (
          <span className="sm-subtab-badge">{myActiveRequests.length}</span>
        ) : null}
      </button>
      <button
        type="button"
        className={`sm-subtab${sidebarTab === "review" ? " is-active" : ""}`}
        onClick={() => setSidebarTab("review")}
        disabled={!isAdmin && pendingReviewRequests.length === 0}
      >
        Review
        {isAdmin && pendingReviewRequests.length > 0 ? (
          <span className="sm-subtab-badge">{pendingReviewRequests.length}</span>
        ) : null}
      </button>
      <button
        type="button"
        className={`sm-subtab${sidebarTab === "my-items" ? " is-active" : ""}`}
        onClick={() => setSidebarTab("my-items")}
      >
        My Items
      </button>
      <span className="sm-subbar-spacer" />
      <Button size="sm" variant="primary" onClick={() => setModal({ kind: "new-item" })}>
        + New item
      </Button>
    </nav>
  );

  // ---------------------------------------------------------------------
  // Render: panels
  // ---------------------------------------------------------------------

  const renderBulkBar = (visibleIds: string[]) => {
    const selectedHere = visibleIds.filter((id) => selectedItemIds.has(id));
    if (selectedHere.length === 0) return null;
    return (
      <div className="sm-bulk-bar">
        <span className="sm-bulk-count">
          <strong>{selectedHere.length}</strong> selected
        </span>
        <div className="sm-bulk-actions">
          <Button size="sm" onClick={() => setModal({ kind: "bulk-check", itemIds: selectedHere })}>
            Bulk check
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => setModal({ kind: "new-request", presetItemIds: selectedHere })}
          >
            Request order
          </Button>
          <Button size="sm" onClick={() => setModal({ kind: "bulk-projects", itemIds: selectedHere })}>
            Add project link
          </Button>
          <Button size="sm" onClick={() => setModal({ kind: "bulk-location", itemIds: selectedHere })}>
            Set location
          </Button>
          {isAdmin ? (
            <>
              <Button size="sm" variant="danger" onClick={() => void handleBulkArchive()}>
                Archive
              </Button>
              <Button size="sm" onClick={() => void handleBulkUnarchive()}>
                Restore
              </Button>
              <Button size="sm" variant="danger" onClick={() => void handleBulkDelete()}>
                Delete
              </Button>
            </>
          ) : null}
          <Button size="sm" onClick={clearSelection}>
            Clear
          </Button>
        </div>
      </div>
    );
  };

  const renderItemsTable = (items: ItemRecord[], emptyHint: string) => {
    const visibleIds = items.map((i) => i.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedItemIds.has(id));
    const someSelected = visibleIds.some((id) => selectedItemIds.has(id));

    return (
      <>
        {renderBulkBar(visibleIds)}
        <Table className="sm-item-table">
          <thead>
            <tr>
              <th style={{ width: "2rem" }}>
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = !allSelected && someSelected;
                  }}
                  onChange={(e) => setAllSelected(visibleIds, e.target.checked)}
                />
              </th>
              <th>Name</th>
              <th>Class</th>
              <th>Stock</th>
              <th>Last check</th>
              <th>Storage</th>
              <th>Vendor</th>
              <th>Projects</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {status === "loading" ? (
              <TableLoading colSpan={10} />
            ) : items.length === 0 ? (
              <TableEmpty colSpan={10}>{emptyHint}</TableEmpty>
            ) : (
              items.map((item) => {
                const latest = latestCheckByItem.get(item.id);
                const stock = latest?.stock_status ?? "unknown";
                const checkDays = daysSince(latest?.checked_at);
                const stale = checkDays === null || checkDays > STALE_CHECK_DAYS;
                const links = linksByItem.get(item.id) ?? [];
                const projectNames = links
                  .map((l) =>
                    l.project_id ? projectsById.get(l.project_id)?.name ?? "Unknown" : "General"
                  )
                  .filter((v, i, a) => a.indexOf(v) === i);
                return (
                  <tr key={item.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${item.name}`}
                        checked={selectedItemIds.has(item.id)}
                        onChange={() => toggleItemSelected(item.id)}
                      />
                    </td>
                    <td>
                      <strong>{item.name}</strong>
                      {item.details ? (
                        <div style={{ color: "var(--rl-muted)", fontSize: "0.78rem" }}>{item.details}</div>
                      ) : null}
                    </td>
                    <td>{statusLabel(item.classification)}</td>
                    <td>
                      <StatusPill status={stockStatusTone(stock)} label={statusLabel(stock)} />
                    </td>
                    <td>
                      {latest ? (
                        <span title={formatDateTime(latest.checked_at)}>
                          {formatDate(latest.checked_at)}
                          {stale ? <span className="sm-warning-note"> ⚠ {checkDays ?? "—"}d</span> : null}
                        </span>
                      ) : (
                        <span className="sm-warning-note">Never checked</span>
                      )}
                    </td>
                    <td>{item.storage_location ?? "—"}</td>
                    <td>
                      {item.preferred_vendor ?? "—"}
                      {item.catalog_number ? (
                        <div style={{ color: "var(--rl-muted)", fontSize: "0.78rem" }}>
                          {item.catalog_number}
                        </div>
                      ) : null}
                    </td>
                    <td>{projectNames.length === 0 ? "General" : projectNames.join(", ")}</td>
                    <td>
                      {item.is_active ? (
                        <Badge tone="success">Active</Badge>
                      ) : (
                        <Badge tone="neutral">Archived</Badge>
                      )}
                    </td>
                    <td className="sm-row-actions">
                      <Button size="sm" onClick={() => setModal({ kind: "inventory-check", itemId: item.id })}>
                        Check
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setModal({ kind: "new-request", presetItemIds: [item.id] })}
                      >
                        Request
                      </Button>
                      <Button size="sm" onClick={() => setModal({ kind: "edit-item", itemId: item.id })}>
                        Edit
                      </Button>
                      {isAdmin ? (
                        item.is_active ? (
                          <Button size="sm" variant="danger" onClick={() => void handleArchive(item)}>
                            Archive
                          </Button>
                        ) : (
                          <Button size="sm" onClick={() => void handleUnarchive(item)}>
                            Restore
                          </Button>
                        )
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
      </>
    );
  };

  const warehousePanel = (
    <Panel>
      <SectionHeader
        title="Warehouse"
        meta={`${filteredItems.length} of ${workspace.items.length}`}
        actions={
          <Button variant="primary" size="sm" onClick={() => setModal({ kind: "new-item" })}>
            New item
          </Button>
        }
      />
      <WarehouseToolbar
        search={search}
        onSearch={setSearch}
        classification={classificationFilter}
        onClassification={setClassificationFilter}
        stock={stockFilter}
        onStock={setStockFilter}
        storage={storageFilter}
        onStorage={setStorageFilter}
        storageOptions={storageOptions}
        project={projectFilter}
        onProject={setProjectFilter}
        projects={workspace.projects}
        showArchived={showArchived}
        onShowArchived={setShowArchived}
        canShowArchived={isAdmin}
      />
      {renderItemsTable(
        filteredItems,
        workspace.items.length === 0
          ? "No items yet — create one to get started."
          : "No items match the current filters."
      )}
    </Panel>
  );

  const ordersPanel = (
    <Panel>
      <SectionHeader
        title="Orders"
        meta={`${visibleRequests.length} of ${workspace.orderRequests.length}`}
        actions={
          <Button variant="primary" size="sm" onClick={() => setModal({ kind: "new-request" })}>
            New request
          </Button>
        }
      />
      <div className="sm-toolbar">
        <FormField label="Show">
          <Select
            value={ordersFilter}
            onChange={(e) => setOrdersFilter(e.target.value as typeof ordersFilter)}
          >
            <option value="active">Active</option>
            <option value="mine">My requests</option>
            <option value="received">Received</option>
            <option value="all">All</option>
          </Select>
        </FormField>
      </div>
      {visibleRequests.length === 0 ? (
        <EmptyState
          boxed
          title="No requests"
          description="Create a new order request to get started."
          action={
            <Button variant="primary" onClick={() => setModal({ kind: "new-request" })}>
              New request
            </Button>
          }
        />
      ) : (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {visibleRequests.map((req) => (
            <RequestCard
              key={req.id}
              request={req}
              items={requestItemsByRequest.get(req.id) ?? []}
              orders={ordersByRequest.get(req.id) ?? []}
              itemsById={itemsById}
              projectsById={projectsById}
              fundingSourcesById={fundingSourcesById}
              assignableFundingSources={assignableFundingSources}
              currentUserId={user?.id ?? null}
              isAdmin={isAdmin}
              lotsByOrder={lotsByOrder}
              onContinueDraft={() => setModal({ kind: "edit-request", requestId: req.id })}
              onSubmit={() => void handleSubmitRequest(req)}
              onWithdraw={() => void handleWithdrawRequest(req)}
              onDeleteDraft={() => void handleDeleteRequest(req)}
              onCancel={() => void handleCancelRequest(req)}
              onPlaceOrder={() => setModal({ kind: "place-order", requestId: req.id })}
              onUpdateOrder={(orderId) => setModal({ kind: "update-order", orderId })}
              onReceiveOrder={(orderId) => setModal({ kind: "receive-order", orderId })}
              /* Funding assignment is set/changed only during review. The
                 Orders tab shows the funding line read-only. */
            />
          ))}
        </div>
      )}
    </Panel>
  );

  const reviewPanel = isAdmin ? (
    <Panel>
      <SectionHeader title="Review queue" meta={`${pendingReviewRequests.length} pending`} />
      {pendingReviewRequests.length === 0 ? (
        <EmptyState boxed title="No requests awaiting review" description="Submitted requests will appear here for admin approval." />
      ) : (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {pendingReviewRequests.map((req) => (
            <RequestCard
              key={req.id}
              request={req}
              items={requestItemsByRequest.get(req.id) ?? []}
              orders={ordersByRequest.get(req.id) ?? []}
              itemsById={itemsById}
              projectsById={projectsById}
              fundingSourcesById={fundingSourcesById}
              assignableFundingSources={assignableFundingSources}
              currentUserId={user?.id ?? null}
              isAdmin={isAdmin}
              lotsByOrder={lotsByOrder}
              onApprove={() => setModal({ kind: "review-request", requestId: req.id, mode: "approve" })}
              onDeny={() => setModal({ kind: "review-request", requestId: req.id, mode: "deny" })}
              onSetFunding={(fundingSourceId) =>
                void wrap(() => workspace.setOrderFunding(req.id, fundingSourceId))
              }
              onClearFunding={() =>
                void wrap(() => workspace.clearOrderFunding(req.id))
              }
            />
          ))}
        </div>
      )}
    </Panel>
  ) : (
    <Panel>
      <SectionHeader title="Review" />
      <EmptyState
        boxed
        title="Admins only"
        description="Only lab owners and admins can approve or deny order requests."
      />
    </Panel>
  );

  const myItemsPanel = (
    <Panel>
      <SectionHeader title="My Items" meta={`${myItems.length} items`} />
      <div className="sm-stats-grid">
        <div className="sm-stats-card">
          <span>Active items</span>
          <strong>{myItems.length}</strong>
        </div>
        <div className="sm-stats-card">
          <span>Low / out / unknown</span>
          <strong>{myLowOrUnknown.length}</strong>
        </div>
        <div className="sm-stats-card">
          <span>Stale ({STALE_CHECK_DAYS}+ days)</span>
          <strong>{myStaleItems.length}</strong>
        </div>
        <div className="sm-stats-card">
          <span>My open requests</span>
          <strong>{myActiveRequests.length}</strong>
        </div>
      </div>

      {renderItemsTable(
        myItems,
        "Items associated with your projects (or general lab items) will appear here."
      )}
    </Panel>
  );

  // ---------------------------------------------------------------------
  // Modal renderer
  // ---------------------------------------------------------------------

  const closeModal = () => setModal({ kind: "none" });

  const renderModal = () => {
    switch (modal.kind) {
      case "none":
        return null;
      case "new-item":
        return (
          <ItemFormModal
            mode="create"
            projects={workspace.projects}
            onClose={closeModal}
            onSubmit={async (values) => {
              const result = await wrap(() => workspace.createItem(values));
              if (result) closeModal();
            }}
          />
        );
      case "edit-item": {
        const item = itemsById.get(modal.itemId);
        if (!item) return null;
        return (
          <ItemFormModal
            mode="edit"
            item={item}
            projects={workspace.projects}
            existingLinks={linksByItem.get(item.id) ?? []}
            onClose={closeModal}
            onSubmit={async (values) => {
              const result = await wrap(() =>
                workspace.updateItem({ itemId: item.id, ...values })
              );
              if (result) closeModal();
            }}
            onAddLink={async (values) => {
              await wrap(() =>
                workspace.linkItemToProject({
                  itemId: item.id,
                  projectId: values.projectId,
                  associationType: values.associationType,
                })
              );
            }}
            onRemoveLink={async (linkId) => {
              await wrap(() => workspace.unlinkItemFromProject(linkId));
            }}
          />
        );
      }
      case "inventory-check": {
        const item = itemsById.get(modal.itemId);
        if (!item) return null;
        return (
          <InventoryCheckModal
            item={item}
            history={checksByItem.get(item.id) ?? []}
            onClose={closeModal}
            onSubmit={async (values) => {
              const result = await wrap(() => workspace.addInventoryCheck({ itemId: item.id, ...values }));
              if (result) closeModal();
            }}
          />
        );
      }
      case "new-request":
        return (
          <NewRequestModal
            projects={workspace.projects}
            myProjectIds={workspace.myProjectIds}
            presetItems={
              modal.presetItemIds
                ? modal.presetItemIds
                    .map((id) => itemsById.get(id))
                    .filter((i): i is ItemRecord => Boolean(i))
                : []
            }
            onClose={closeModal}
            onCreate={async ({ projectId, reason }) => {
              const created = await wrap(() => workspace.createOrderRequestDraft({ projectId, reason }));
              if (created) {
                const ids = modal.presetItemIds ?? [];
                if (ids.length > 0) {
                  for (const id of ids) {
                    const item = itemsById.get(id);
                    await wrap(() =>
                      workspace.addOrderRequestItem({
                        requestId: created.id,
                        itemId: id,
                        priority: "normal",
                        unit: item?.default_unit ?? null,
                      })
                    );
                  }
                }
                setSelectedItemIds(new Set());
                setModal({ kind: "edit-request", requestId: created.id });
              }
            }}
          />
        );
      case "edit-request": {
        const req = workspace.orderRequests.find((r) => r.id === modal.requestId);
        if (!req) return null;
        return (
          <EditRequestModal
            request={req}
            requestItems={requestItemsByRequest.get(req.id) ?? []}
            allItems={workspace.items.filter((i) => i.is_active)}
            projects={workspace.projects}
            itemsById={itemsById}
            onClose={closeModal}
            onUpdateMeta={async (values) => {
              await wrap(() => workspace.updateOrderRequestMeta({ requestId: req.id, ...values }));
            }}
            onAddItem={async (values) => {
              await wrap(() => workspace.addOrderRequestItem({ requestId: req.id, ...values }));
            }}
            onUpdateItem={async (values) => {
              await wrap(() => workspace.updateOrderRequestItem(values));
            }}
            onRemoveItem={async (id) => {
              await wrap(() => workspace.removeOrderRequestItem(id));
            }}
            onSubmit={async () => {
              const result = await wrap(() => workspace.submitOrderRequest(req.id));
              if (result) closeModal();
            }}
            onAbort={async () => {
              const result = await wrap(() => workspace.deleteOrderRequest(req.id));
              if (result !== null) closeModal();
            }}
            latestCheckByItem={latestCheckByItem}
          />
        );
      }
      case "review-request": {
        const req = workspace.orderRequests.find((r) => r.id === modal.requestId);
        if (!req) return null;
        const reqItems = requestItemsByRequest.get(req.id) ?? [];
        const suggestion =
          modal.mode === "approve"
            ? suggestFundingSourceForOrder({
                request: req,
                requestItems: reqItems,
                itemsById,
                fundingSources: workspace.fundingSources,
                fundingDefaults: workspace.fundingDefaults,
              })
            : null;
        return (
          <ReviewRequestModal
            request={req}
            requestItems={reqItems}
            itemsById={itemsById}
            projectsById={projectsById}
            mode={modal.mode}
            suggestion={suggestion}
            assignableFundingSources={assignableFundingSources}
            onClose={closeModal}
            onApprove={async ({ note, fundingSourceId, fundingRequired }) => {
              const result = await wrap(() =>
                workspace.approveOrderRequest(req.id, {
                  note,
                  fundingSourceId,
                  fundingRequired,
                })
              );
              if (result) closeModal();
            }}
            onDeny={async (note) => {
              const result = await wrap(() => workspace.denyOrderRequest(req.id, note));
              if (result) closeModal();
            }}
          />
        );
      }
      case "place-order": {
        const req = workspace.orderRequests.find((r) => r.id === modal.requestId);
        if (!req) return null;
        return (
          <PlaceOrderModal
            request={req}
            requestItems={requestItemsByRequest.get(req.id) ?? []}
            itemsById={itemsById}
            onClose={closeModal}
            onSubmit={async (values) => {
              const result = await wrap(() =>
                workspace.placeSupplyOrder({ requestId: req.id, ...values })
              );
              if (result) closeModal();
            }}
          />
        );
      }
      case "update-order": {
        const order = workspace.orders.find((o) => o.id === modal.orderId);
        if (!order) return null;
        return (
          <UpdateOrderModal
            order={order}
            onClose={closeModal}
            onSubmit={async (values) => {
              const result = await wrap(() =>
                workspace.updateSupplyOrder({ orderId: order.id, ...values })
              );
              if (result) closeModal();
            }}
          />
        );
      }
      case "receive-order": {
        const order = workspace.orders.find((o) => o.id === modal.orderId);
        if (!order) return null;
        const req = workspace.orderRequests.find((r) => r.id === order.order_request_id);
        const items = req ? requestItemsByRequest.get(req.id) ?? [] : [];
        return (
          <ReceiveOrderModal
            order={order}
            requestItems={items}
            itemsById={itemsById}
            onClose={closeModal}
            onSubmit={async (values) => {
              const result = await wrap(() =>
                workspace.receiveSupplyOrder({ orderId: order.id, ...values })
              );
              if (result) closeModal();
            }}
          />
        );
      }
      case "bulk-check": {
        const items = modal.itemIds
          .map((id) => itemsById.get(id))
          .filter((i): i is ItemRecord => Boolean(i));
        if (items.length === 0) return null;
        return (
          <BulkInventoryCheckModal
            items={items}
            onClose={closeModal}
            onSubmit={async (values) => {
              const result = await wrap(async () => {
                for (const item of items) {
                  await workspace.addInventoryCheck({ itemId: item.id, ...values });
                }
                return true;
              });
              if (result) {
                clearSelection();
                closeModal();
              }
            }}
          />
        );
      }
      case "bulk-projects": {
        const items = modal.itemIds
          .map((id) => itemsById.get(id))
          .filter((i): i is ItemRecord => Boolean(i));
        if (items.length === 0) return null;
        return (
          <BulkProjectsModal
            items={items}
            projects={workspace.projects}
            onClose={closeModal}
            onSubmit={async ({ projectId, associationType }) => {
              const result = await wrap(async () => {
                for (const item of items) {
                  await workspace.linkItemToProject({
                    itemId: item.id,
                    projectId,
                    associationType,
                  });
                }
                return true;
              });
              if (result) {
                clearSelection();
                closeModal();
              }
            }}
          />
        );
      }
      case "bulk-location": {
        const items = modal.itemIds
          .map((id) => itemsById.get(id))
          .filter((i): i is ItemRecord => Boolean(i));
        if (items.length === 0) return null;
        return (
          <BulkLocationModal
            items={items}
            onClose={closeModal}
            onSubmit={async ({ storageLocation }) => {
              const result = await wrap(async () => {
                for (const item of items) {
                  await workspace.updateItem({ itemId: item.id, storageLocation });
                }
                return true;
              });
              if (result) {
                clearSelection();
                closeModal();
              }
            }}
          />
        );
      }
    }
  };

  // ---------------------------------------------------------------------
  // Shell
  // ---------------------------------------------------------------------

  return (
    <LabShell
      activeNavId="inventory"
      baseUrl={APP_BASE_URL}
      className="sm-shell"
      topbar={
        <LabTopbar
          kicker="INVENTORY"
          title={statusLabel(sidebarTab.replace(/-/g, " "))}
          subtitle="Items, vendor orders, and inventory checks for the active lab."
          meta={
            <Button size="sm" onClick={() => void refresh()} disabled={status === "loading"}>
              {status === "loading" ? "Refreshing…" : "Refresh"}
            </Button>
          }
        />
      }
      subbar={subbarTabs}
    >
      {error ? <ErrorBanner className="sm-page-error">{error}</ErrorBanner> : null}
      {actionError ? <ErrorBanner className="sm-page-error">{actionError}</ErrorBanner> : null}

      {!activeLab ? (
        <Panel>
          <EmptyState
            title="Select a lab"
            description="Pick a lab from the lab picker to see its supply catalog."
          />
        </Panel>
      ) : sidebarTab === "warehouse" ? (
        warehousePanel
      ) : sidebarTab === "orders" ? (
        ordersPanel
      ) : sidebarTab === "review" ? (
        reviewPanel
      ) : (
        myItemsPanel
      )}

      {renderModal()}
    </LabShell>
  );
};

// ===========================================================================
// Sub-components
// ===========================================================================

// ---------------------------------------------------------------------------
// Warehouse toolbar
// ---------------------------------------------------------------------------

const WarehouseToolbar = ({
  search,
  onSearch,
  classification,
  onClassification,
  stock,
  onStock,
  storage,
  onStorage,
  storageOptions,
  project,
  onProject,
  projects,
  showArchived,
  onShowArchived,
  canShowArchived,
}: {
  search: string;
  onSearch: (v: string) => void;
  classification: ItemClassification | "all";
  onClassification: (v: ItemClassification | "all") => void;
  stock: StockStatus | "all";
  onStock: (v: StockStatus | "all") => void;
  storage: string;
  onStorage: (v: string) => void;
  storageOptions: string[];
  project: string;
  onProject: (v: string) => void;
  projects: { id: string; name: string }[];
  showArchived: boolean;
  onShowArchived: (v: boolean) => void;
  canShowArchived: boolean;
}) => (
  <div className="sm-toolbar">
    <FormField label="Search" className="sm-toolbar-grow">
      <Input
        type="search"
        placeholder="Name, vendor, catalog #…"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
      />
    </FormField>
    <FormField label="Classification">
      <Select value={classification} onChange={(e) => onClassification(e.target.value as ItemClassification | "all")}>
        <option value="all">All</option>
        {CLASSIFICATIONS.map((c) => (
          <option key={c} value={c}>
            {statusLabel(c)}
          </option>
        ))}
      </Select>
    </FormField>
    <FormField label="Stock">
      <Select value={stock} onChange={(e) => onStock(e.target.value as StockStatus | "all")}>
        <option value="all">All</option>
        {STOCK_STATUSES.map((s) => (
          <option key={s} value={s}>
            {statusLabel(s)}
          </option>
        ))}
      </Select>
    </FormField>
    <FormField label="Storage">
      <Select value={storage} onChange={(e) => onStorage(e.target.value)}>
        <option value="all">All</option>
        {storageOptions.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>
    </FormField>
    <FormField label="Project">
      <Select value={project} onChange={(e) => onProject(e.target.value)}>
        <option value="all">All</option>
        <option value="general">General / lab-wide</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
    </FormField>
    {canShowArchived ? (
      <CheckboxField
        label="Show archived"
        checked={showArchived}
        onChange={(e) => onShowArchived(e.target.checked)}
      />
    ) : null}
  </div>
);

// ---------------------------------------------------------------------------
// Funding assignment line (rendered inside RequestCard)
// ---------------------------------------------------------------------------

const FundingAssignmentLine = ({
  request,
  fundingSourcesById,
  assignableFundingSources,
  isAdmin,
  onSetFunding,
  onClearFunding,
}: {
  request: OrderRequestRecord;
  fundingSourcesById: Map<string, FundingSourceRecord>;
  assignableFundingSources: FundingSourceRecord[];
  isAdmin: boolean;
  onSetFunding?: (fundingSourceId: string) => void;
  onClearFunding?: () => void;
}) => {
  const status = request.funding_assignment_status;
  const assigned = request.approved_funding_source_id
    ? fundingSourcesById.get(request.approved_funding_source_id) ?? null
    : null;
  const assignedStatus = assigned ? getFundingStatus(assigned) : null;

  // Member-facing summary. Members never see grant identifier and never see
  // the funding dropdown.
  if (!isAdmin) {
    if (request.status === "draft" || status === "unassigned") return null;
    if (status === "not_required") {
      return (
        <InlineNote>
          <strong>Funding:</strong> not required for this order.
        </InlineNote>
      );
    }
    return (
      <InlineNote>
        <strong>Funding:</strong>{" "}
        {assigned
          ? `Assigned by reviewer — ${assigned.nickname}`
          : "Assigned by reviewer."}
      </InlineNote>
    );
  }

  // Admin view: show the assignment with the grant id, and let them change
  // or clear it while the request is still actionable.
  const canChange =
    !!onSetFunding &&
    (request.status === "submitted" ||
      request.status === "approved" ||
      request.status === "ordered");

  return (
    <div className="sm-funding-line">
      <div className="sm-funding-line-summary">
        <strong>Funding:</strong>{" "}
        {status === "unassigned" ? (
          <span style={{ color: "var(--rl-muted)" }}>Unassigned</span>
        ) : status === "not_required" ? (
          <Badge tone="neutral">Not required</Badge>
        ) : assigned ? (
          <>
            <strong>{assigned.nickname}</strong>
            {assigned.grant_identifier ? (
              <code className="sm-funding-grant-id">{assigned.grant_identifier}</code>
            ) : null}
            {assignedStatus ? (
              <Badge tone={assignedStatus.badgeTone}>{assignedStatus.label}</Badge>
            ) : null}
            {status === "changed" ? <Badge tone="info">Changed</Badge> : null}
          </>
        ) : (
          <em style={{ color: "var(--rl-muted)" }}>Source unavailable</em>
        )}
      </div>
      {canChange ? (
        <div className="sm-funding-line-actions">
          <Select
            value={assigned?.id ?? ""}
            onChange={(e) => {
              const value = e.target.value;
              if (value) onSetFunding!(value);
            }}
          >
            <option value="">Change funding source…</option>
            {assignableFundingSources.map((s) => {
              const st = getFundingStatus(s);
              return (
                <option key={s.id} value={s.id}>
                  {s.nickname} ({st.label})
                </option>
              );
            })}
          </Select>
          {assigned && onClearFunding ? (
            <Button size="sm" variant="ghost" onClick={onClearFunding}>
              Clear
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Request card (shared by Orders and Review tabs)
// ---------------------------------------------------------------------------

const RequestCard = ({
  request,
  items,
  orders,
  itemsById,
  projectsById,
  fundingSourcesById,
  assignableFundingSources,
  currentUserId,
  isAdmin,
  lotsByOrder,
  onContinueDraft,
  onSubmit,
  onWithdraw,
  onDeleteDraft,
  onCancel,
  onPlaceOrder,
  onUpdateOrder,
  onReceiveOrder,
  onApprove,
  onDeny,
  onSetFunding,
  onClearFunding,
}: {
  request: OrderRequestRecord;
  items: OrderRequestItemRecord[];
  orders: OrderRecord[];
  itemsById: Map<string, ItemRecord>;
  projectsById: Map<string, { id: string; name: string }>;
  fundingSourcesById: Map<string, FundingSourceRecord>;
  assignableFundingSources: FundingSourceRecord[];
  currentUserId: string | null;
  isAdmin: boolean;
  lotsByOrder: Map<string, StockLotRecord[]>;
  onContinueDraft?: () => void;
  onSubmit?: () => void;
  onWithdraw?: () => void;
  onDeleteDraft?: () => void;
  onCancel?: () => void;
  onPlaceOrder?: () => void;
  onUpdateOrder?: (orderId: string) => void;
  onReceiveOrder?: (orderId: string) => void;
  onApprove?: () => void;
  onDeny?: () => void;
  onSetFunding?: (fundingSourceId: string) => void;
  onClearFunding?: () => void;
}) => {
  const isMine = request.requested_by === currentUserId;
  const canAct = (isAdmin || isMine) && request.status === "draft";
  const canSubmit = isMine && request.status === "draft";
  const canWithdraw = isMine && request.status === "submitted";
  const canCancelInFlight = (isAdmin || isMine) && (request.status === "approved" || request.status === "ordered");
  const canPlace = isAdmin && request.status === "approved";
  const project = request.project_id ? projectsById.get(request.project_id) : null;

  return (
    <div className="sm-request-card">
      <div className="sm-request-card-head">
        <div>
          <h3>
            Request {formatDate(request.created_at)}
            {project ? ` · ${project.name}` : " · General"}
          </h3>
          <div className="sm-request-card-meta">
            {items.length} {items.length === 1 ? "item" : "items"}
            {request.reason ? ` · ${request.reason}` : ""}
          </div>
        </div>
        <StatusPill status={requestStatusTone(request.status)} label={statusLabel(request.status)} />
      </div>

      {items.length > 0 ? (
        <div className="sm-request-items">
          {items.map((ri) => {
            const item = itemsById.get(ri.item_id);
            return (
              <div key={ri.id} className="sm-request-item">
                <span className="sm-request-item-name">{item?.name ?? "Unknown item"}</span>
                <span>
                  {ri.requested_quantity ?? "?"} {ri.unit ?? item?.default_unit ?? ""}
                </span>
                <span>
                  {ri.priority ? (
                    <Badge tone={priorityTone(ri.priority) === "blocked" ? "danger" : priorityTone(ri.priority) === "submitted" ? "warning" : "neutral"}>
                      {statusLabel(ri.priority)}
                    </Badge>
                  ) : null}
                </span>
                <span style={{ color: "var(--rl-muted)", fontSize: "0.78rem" }}>{ri.note ?? ""}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <InlineNote>No items yet.</InlineNote>
      )}

      {request.review_note ? (
        <InlineNote>
          <strong>Review note:</strong> {request.review_note}
          {request.reviewed_at ? ` (${formatDateTime(request.reviewed_at)})` : null}
        </InlineNote>
      ) : null}

      <FundingAssignmentLine
        request={request}
        fundingSourcesById={fundingSourcesById}
        assignableFundingSources={assignableFundingSources}
        isAdmin={isAdmin}
        onSetFunding={onSetFunding}
        onClearFunding={onClearFunding}
      />


      {orders.length > 0 ? (
        <div style={{ display: "grid", gap: "0.4rem" }}>
          {orders.map((order) => {
            const lots = lotsByOrder.get(order.id) ?? [];
            return (
              <div
                key={order.id}
                style={{
                  display: "grid",
                  gap: "0.4rem",
                  padding: "0.55rem 0.7rem",
                  border: "1px solid var(--rl-line)",
                  borderRadius: "var(--rl-radius-sm)",
                  background: "var(--rl-soft)",
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <strong>{order.company || "Vendor TBD"}</strong>
                    {order.order_number ? <span style={{ color: "var(--rl-muted)", marginLeft: "0.4rem" }}>#{order.order_number}</span> : null}
                  </div>
                  <StatusPill status={orderStatusTone(order.status)} label={statusLabel(order.status)} />
                </div>
                <div style={{ color: "var(--rl-muted)", fontSize: "0.8rem" }}>
                  Placed {formatDate(order.placed_at)}
                  {order.expected_arrival ? ` · expected ${formatDate(order.expected_arrival)}` : ""}
                  {order.tracking_number ? ` · tracking ${order.tracking_number}` : ""}
                  {order.received_at ? ` · received ${formatDate(order.received_at)}` : ""}
                </div>
                {lots.length > 0 ? (
                  <div style={{ fontSize: "0.78rem", color: "var(--rl-fg-2)" }}>
                    Lots: {lots.map((l) => `${l.lot_number ?? "—"}${l.received_quantity ? ` (${l.received_quantity}${l.unit ?? ""})` : ""}`).join(", ")}
                  </div>
                ) : null}
                {isAdmin && order.status !== "received" && order.status !== "cancelled" ? (
                  <div className="sm-request-actions">
                    <Button size="sm" onClick={() => onUpdateOrder?.(order.id)}>
                      Update
                    </Button>
                    <Button size="sm" variant="primary" onClick={() => onReceiveOrder?.(order.id)}>
                      Receive
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="sm-request-actions">
        {canAct && onContinueDraft ? (
          <Button size="sm" onClick={onContinueDraft}>
            Continue draft
          </Button>
        ) : null}
        {canAct && onDeleteDraft ? (
          <Button size="sm" variant="danger" onClick={onDeleteDraft}>
            Delete
          </Button>
        ) : null}
        {canSubmit && onSubmit ? (
          <Button size="sm" variant="primary" onClick={onSubmit}>
            Submit for review
          </Button>
        ) : null}
        {canWithdraw && onWithdraw ? (
          <Button size="sm" variant="danger" onClick={onWithdraw}>
            Withdraw
          </Button>
        ) : null}
        {canPlace && onPlaceOrder ? (
          <Button size="sm" variant="primary" onClick={onPlaceOrder}>
            Mark as ordered
          </Button>
        ) : null}
        {canCancelInFlight && onCancel ? (
          <Button size="sm" variant="danger" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        {onApprove ? (
          <Button size="sm" variant="primary" onClick={onApprove}>
            Approve
          </Button>
        ) : null}
        {onDeny ? (
          <Button size="sm" variant="danger" onClick={onDeny}>
            Deny
          </Button>
        ) : null}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Item form modal
// ---------------------------------------------------------------------------

interface ItemFormValues {
  name: string;
  classification: ItemClassification;
  details: string | null;
  defaultUnit: string | null;
  storageLocation: string | null;
  catalogNumber: string | null;
  preferredVendor: string | null;
  projectLinks?: Array<{ projectId: string | null; associationType?: ItemAssociationType | null }>;
}

const ItemFormModal = ({
  mode,
  item,
  projects,
  existingLinks,
  onClose,
  onSubmit,
  onAddLink,
  onRemoveLink,
}: {
  mode: "create" | "edit";
  item?: ItemRecord;
  projects: { id: string; name: string }[];
  existingLinks?: ItemProjectRecord[];
  onClose: () => void;
  onSubmit: (values: ItemFormValues) => Promise<void>;
  onAddLink?: (values: { projectId: string | null; associationType: ItemAssociationType | null }) => Promise<void>;
  onRemoveLink?: (linkId: string) => Promise<void>;
}) => {
  const [name, setName] = useState(item?.name ?? "");
  const [classification, setClassification] = useState<ItemClassification>(
    item?.classification ?? "reagent"
  );
  const [details, setDetails] = useState(item?.details ?? "");
  const [defaultUnit, setDefaultUnit] = useState(item?.default_unit ?? "");
  const [storageLocation, setStorageLocation] = useState(item?.storage_location ?? "");
  const [catalogNumber, setCatalogNumber] = useState(item?.catalog_number ?? "");
  const [preferredVendor, setPreferredVendor] = useState(item?.preferred_vendor ?? "");
  const [projectLink, setProjectLink] = useState<string>("general");
  const [associationType, setAssociationType] = useState<ItemAssociationType>("primary");
  const [linkBusy, setLinkBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const values: ItemFormValues = {
        name: name.trim(),
        classification,
        details: details.trim() || null,
        defaultUnit: defaultUnit.trim() || null,
        storageLocation: storageLocation.trim() || null,
        catalogNumber: catalogNumber.trim() || null,
        preferredVendor: preferredVendor.trim() || null,
      };
      if (mode === "create" && projectLink !== "none") {
        values.projectLinks =
          projectLink === "general"
            ? [{ projectId: null, associationType: "general" }]
            : [{ projectId: projectLink, associationType }];
      }
      await onSubmit(values);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleAddLink = async () => {
    if (!onAddLink) return;
    setLinkBusy(true);
    setError(null);
    try {
      await onAddLink({
        projectId: projectLink === "general" ? null : projectLink,
        associationType: projectLink === "general" ? "general" : associationType,
      });
      setProjectLink("general");
      setAssociationType("primary");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLinkBusy(false);
    }
  };

  const handleRemoveLink = async (linkId: string) => {
    if (!onRemoveLink) return;
    setLinkBusy(true);
    setError(null);
    try {
      await onRemoveLink(linkId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLinkBusy(false);
    }
  };

  // Hide project picks that are already linked.
  const linkedProjectIds = new Set(
    (existingLinks ?? [])
      .map((l) => l.project_id)
      .filter((id): id is string => Boolean(id))
  );
  const availableProjects = projects.filter((p) => !linkedProjectIds.has(p.id));
  const generalAlreadyLinked = (existingLinks ?? []).some((l) => l.project_id === null);

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "create" ? "New item" : `Edit ${item?.name}`}
      width="wide"
    >
      <form className="sm-modal-form" onSubmit={handleSubmit}>
        {error ? <InlineError>{error}</InlineError> : null}
        <FormField label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </FormField>
        <FormRow>
          <FormField label="Classification">
            <Select value={classification} onChange={(e) => setClassification(e.target.value as ItemClassification)}>
              {CLASSIFICATIONS.map((c) => (
                <option key={c} value={c}>
                  {statusLabel(c)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Default unit">
            <Input
              placeholder="mL, box, tube…"
              value={defaultUnit}
              onChange={(e) => setDefaultUnit(e.target.value)}
            />
          </FormField>
        </FormRow>
        <FormField label="Details">
          <Textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} />
        </FormField>
        <FormRow>
          <FormField label="Storage location">
            <Input
              value={storageLocation}
              onChange={(e) => setStorageLocation(e.target.value)}
              placeholder="e.g. -80 freezer A, shelf 2"
            />
          </FormField>
          <FormField label="Preferred vendor">
            <Input value={preferredVendor} onChange={(e) => setPreferredVendor(e.target.value)} />
          </FormField>
          <FormField label="Catalog #">
            <Input value={catalogNumber} onChange={(e) => setCatalogNumber(e.target.value)} />
          </FormField>
        </FormRow>
        {mode === "create" ? (
          <FormRow>
            <FormField label="Project association">
              <Select value={projectLink} onChange={(e) => setProjectLink(e.target.value)}>
                <option value="general">General / lab-wide</option>
                <option value="none">No association (skip)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </FormField>
            {projectLink !== "general" && projectLink !== "none" ? (
              <FormField label="Association type">
                <Select
                  value={associationType}
                  onChange={(e) => setAssociationType(e.target.value as ItemAssociationType)}
                >
                  {ASSOCIATION_TYPES.map((a) => (
                    <option key={a} value={a}>
                      {statusLabel(a)}
                    </option>
                  ))}
                </Select>
              </FormField>
            ) : null}
          </FormRow>
        ) : null}

        {mode === "edit" && onAddLink && onRemoveLink ? (
          <>
            <SectionHeader title="Project associations" meta={`${(existingLinks ?? []).length}`} />
            {(existingLinks ?? []).length === 0 ? (
              <InlineNote>No project associations yet — this item is treated as general / lab-wide.</InlineNote>
            ) : (
              <ul style={{ display: "grid", gap: "0.4rem", margin: 0, padding: 0, listStyle: "none" }}>
                {(existingLinks ?? []).map((l) => {
                  const project = l.project_id ? projects.find((p) => p.id === l.project_id) : null;
                  return (
                    <li
                      key={l.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "0.4rem 0.6rem",
                        border: "1px solid var(--rl-line)",
                        borderRadius: "var(--rl-radius-sm)",
                      }}
                    >
                      <span>
                        <strong>{project?.name ?? "General"}</strong>
                        {l.association_type ? (
                          <span style={{ color: "var(--rl-muted)", marginLeft: "0.4rem" }}>
                            ({statusLabel(l.association_type)})
                          </span>
                        ) : null}
                      </span>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => void handleRemoveLink(l.id)}
                        disabled={linkBusy}
                      >
                        Unlink
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            <FormRow>
              <FormField label="Add project">
                <Select value={projectLink} onChange={(e) => setProjectLink(e.target.value)}>
                  {!generalAlreadyLinked ? (
                    <option value="general">General / lab-wide</option>
                  ) : null}
                  {availableProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              {projectLink !== "general" ? (
                <FormField label="Association type">
                  <Select
                    value={associationType}
                    onChange={(e) => setAssociationType(e.target.value as ItemAssociationType)}
                  >
                    {ASSOCIATION_TYPES.map((a) => (
                      <option key={a} value={a}>
                        {statusLabel(a)}
                      </option>
                    ))}
                  </Select>
                </FormField>
              ) : null}
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <Button
                  size="sm"
                  onClick={() => void handleAddLink()}
                  disabled={linkBusy || (projectLink === "general" && generalAlreadyLinked)}
                >
                  Add link
                </Button>
              </div>
            </FormRow>
          </>
        ) : null}

        <div className="rl-modal-actions">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Saving…" : mode === "create" ? "Create item" : "Save changes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Inventory check modal
// ---------------------------------------------------------------------------

const InventoryCheckModal = ({
  item,
  history,
  onClose,
  onSubmit,
}: {
  item: ItemRecord;
  history: InventoryCheckRecord[];
  onClose: () => void;
  onSubmit: (values: {
    stockStatus: StockStatus;
    estimatedQuantity: number | null;
    unit: string | null;
    location: string | null;
    note: string | null;
  }) => Promise<void>;
}) => {
  const [stockStatus, setStockStatus] = useState<StockStatus>("medium");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState(item.default_unit ?? "");
  const [location, setLocation] = useState(item.storage_location ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const numericQty = quantity.trim() ? Number(quantity) : null;
      if (numericQty !== null && Number.isNaN(numericQty)) {
        setError("Quantity must be a number.");
        setBusy(false);
        return;
      }
      await onSubmit({
        stockStatus,
        estimatedQuantity: numericQty,
        unit: unit.trim() || null,
        location: location.trim() || null,
        note: note.trim() || null,
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Check stock — ${item.name}`} width="default">
      <form className="sm-modal-form" onSubmit={handleSubmit}>
        {error ? <InlineError>{error}</InlineError> : null}
        <FormRow>
          <FormField label="Stock status">
            <Select value={stockStatus} onChange={(e) => setStockStatus(e.target.value as StockStatus)}>
              {STOCK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Estimated quantity">
            <Input
              type="number"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </FormField>
          <FormField label="Unit">
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
          </FormField>
        </FormRow>
        <FormField label="Location">
          <Input value={location} onChange={(e) => setLocation(e.target.value)} />
        </FormField>
        <FormField label="Note">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
        {history.length > 0 ? (
          <details>
            <summary style={{ cursor: "pointer", color: "var(--rl-muted)" }}>
              History ({history.length})
            </summary>
            <ul style={{ margin: "0.5rem 0", paddingLeft: "1rem", display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
              {history
                .slice()
                .sort((a, b) => +new Date(b.checked_at) - +new Date(a.checked_at))
                .slice(0, 10)
                .map((c) => (
                  <li key={c.id}>
                    <strong>{statusLabel(c.stock_status)}</strong> · {formatDateTime(c.checked_at)}
                    {c.estimated_quantity ? ` · ${c.estimated_quantity}${c.unit ?? ""}` : ""}
                    {c.note ? ` — ${c.note}` : ""}
                  </li>
                ))}
            </ul>
          </details>
        ) : null}
        <div className="rl-modal-actions">
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Saving…" : "Add check"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Bulk action modals (warehouse / my-items selection)
// ---------------------------------------------------------------------------

const BulkInventoryCheckModal = ({
  items,
  onClose,
  onSubmit,
}: {
  items: ItemRecord[];
  onClose: () => void;
  onSubmit: (values: {
    stockStatus: StockStatus;
    estimatedQuantity: number | null;
    unit: string | null;
    location: string | null;
    note: string | null;
  }) => Promise<void>;
}) => {
  const [stockStatus, setStockStatus] = useState<StockStatus>("medium");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        stockStatus,
        estimatedQuantity: null,
        unit: null,
        location: null,
        note: note.trim() || null,
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Bulk inventory check — ${items.length} items`} width="default">
      <form className="sm-modal-form" onSubmit={handleSubmit}>
        {error ? <InlineError>{error}</InlineError> : null}
        <InlineNote>
          Records the same status for {items.length} items. Use a per-item check if you need to record
          quantity, unit, or location.
        </InlineNote>
        <FormField label="Stock status">
          <Select value={stockStatus} onChange={(e) => setStockStatus(e.target.value as StockStatus)}>
            {STOCK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Note (optional)">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
        <div className="rl-modal-actions">
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Saving…" : "Apply check"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

const BulkProjectsModal = ({
  items,
  projects,
  onClose,
  onSubmit,
}: {
  items: ItemRecord[];
  projects: { id: string; name: string }[];
  onClose: () => void;
  onSubmit: (values: {
    projectId: string | null;
    associationType: ItemAssociationType | null;
  }) => Promise<void>;
}) => {
  const [projectId, setProjectId] = useState("general");
  const [associationType, setAssociationType] = useState<ItemAssociationType>("primary");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        projectId: projectId === "general" ? null : projectId,
        associationType: projectId === "general" ? "general" : associationType,
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Add project link — ${items.length} items`} width="default">
      <form className="sm-modal-form" onSubmit={handleSubmit}>
        {error ? <InlineError>{error}</InlineError> : null}
        <InlineNote>
          Adds the same project association to {items.length} items. Items already linked to this project
          will fail individually but the rest will succeed.
        </InlineNote>
        <FormRow>
          <FormField label="Project">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="general">General / lab-wide</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </FormField>
          {projectId !== "general" ? (
            <FormField label="Association type">
              <Select
                value={associationType}
                onChange={(e) => setAssociationType(e.target.value as ItemAssociationType)}
              >
                {ASSOCIATION_TYPES.map((a) => (
                  <option key={a} value={a}>
                    {statusLabel(a)}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : null}
        </FormRow>
        <div className="rl-modal-actions">
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Saving…" : "Add link"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

const BulkLocationModal = ({
  items,
  onClose,
  onSubmit,
}: {
  items: ItemRecord[];
  onClose: () => void;
  onSubmit: (values: { storageLocation: string | null }) => Promise<void>;
}) => {
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ storageLocation: location.trim() || null });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Set storage location — ${items.length} items`} width="default">
      <form className="sm-modal-form" onSubmit={handleSubmit}>
        {error ? <InlineError>{error}</InlineError> : null}
        <FormField label="Storage location">
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="-80 freezer A, shelf 2 (leave blank to clear)"
          />
        </FormField>
        <InlineNote>Bulk location updates require admin permissions on each item.</InlineNote>
        <div className="rl-modal-actions">
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Saving…" : "Apply location"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// New request modal — creates a draft, optionally seeded with one item
// ---------------------------------------------------------------------------

const NewRequestModal = ({
  projects,
  myProjectIds,
  presetItems,
  onClose,
  onCreate,
}: {
  projects: { id: string; name: string }[];
  myProjectIds: string[];
  presetItems: ItemRecord[];
  onClose: () => void;
  onCreate: (values: { projectId: string | null; reason: string | null }) => Promise<void>;
}) => {
  const myProjects = useMemo(
    () => projects.filter((p) => myProjectIds.includes(p.id)),
    [projects, myProjectIds]
  );
  const [projectId, setProjectId] = useState<string>("none");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onCreate({
        projectId: projectId === "none" ? null : projectId,
        reason: reason.trim() || null,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="New order request" width="default">
      <form className="sm-modal-form" onSubmit={handleSubmit}>
        {presetItems.length > 0 ? (
          <InlineNote>
            {presetItems.length === 1 ? (
              <>
                <strong>{presetItems[0].name}</strong> will be added to the draft.
              </>
            ) : (
              <>
                <strong>{presetItems.length} items</strong> will be added to the draft:{" "}
                {presetItems.map((i) => i.name).join(", ")}
              </>
            )}
          </InlineNote>
        ) : null}
        <FormField label="Project (optional)">
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="none">— None —</option>
            {(myProjects.length > 0 ? myProjects : projects).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Reason / note">
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this order needed?"
          />
        </FormField>
        <div className="rl-modal-actions">
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            Continue to draft
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Edit (continue) request modal
// ---------------------------------------------------------------------------

const EditRequestModal = ({
  request,
  requestItems,
  allItems,
  projects,
  itemsById,
  latestCheckByItem,
  onClose,
  onUpdateMeta,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  onSubmit,
  onAbort,
}: {
  request: OrderRequestRecord;
  requestItems: OrderRequestItemRecord[];
  allItems: ItemRecord[];
  projects: { id: string; name: string }[];
  itemsById: Map<string, ItemRecord>;
  latestCheckByItem: Map<string, InventoryCheckRecord>;
  onClose: () => void;
  onUpdateMeta: (values: { projectId?: string | null; reason?: string | null }) => Promise<void>;
  onAddItem: (values: {
    itemId: string;
    requestedQuantity: number | null;
    unit: string | null;
    priority: RequestPriority | null;
    note: string | null;
  }) => Promise<void>;
  onUpdateItem: (values: {
    requestItemId: string;
    requestedQuantity?: number | null;
    unit?: string | null;
    priority?: RequestPriority | null;
    note?: string | null;
  }) => Promise<void>;
  onRemoveItem: (requestItemId: string) => Promise<void>;
  onSubmit: () => Promise<void>;
  onAbort: () => Promise<void>;
}) => {
  const [projectId, setProjectId] = useState<string>(request.project_id ?? "none");
  const [reason, setReason] = useState(request.reason ?? "");
  const [pickItemId, setPickItemId] = useState<string>("");
  const [pickQty, setPickQty] = useState("");
  const [pickUnit, setPickUnit] = useState("");
  const [pickPriority, setPickPriority] = useState<RequestPriority>("normal");
  const [pickNote, setPickNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync picker unit with selected item's default unit
  useEffect(() => {
    if (pickItemId) {
      const item = itemsById.get(pickItemId);
      if (item?.default_unit && !pickUnit) setPickUnit(item.default_unit);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickItemId]);

  const handleMetaSave = async () => {
    setBusy(true);
    setError(null);
    try {
      await onUpdateMeta({
        projectId: projectId === "none" ? null : projectId,
        reason: reason.trim() || null,
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleAddPick = async () => {
    if (!pickItemId) {
      setError("Select an item.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const qty = pickQty.trim() ? Number(pickQty) : null;
      if (qty !== null && Number.isNaN(qty)) {
        setError("Quantity must be a number.");
        return;
      }
      await onAddItem({
        itemId: pickItemId,
        requestedQuantity: qty,
        unit: pickUnit.trim() || null,
        priority: pickPriority,
        note: pickNote.trim() || null,
      });
      setPickItemId("");
      setPickQty("");
      setPickUnit("");
      setPickNote("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      // persist meta first
      await onUpdateMeta({
        projectId: projectId === "none" ? null : projectId,
        reason: reason.trim() || null,
      });
      await onSubmit();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const usedItemIds = new Set(requestItems.map((ri) => ri.item_id));
  const availableItems = allItems.filter((i) => !usedItemIds.has(i.id));

  return (
    <Modal
      open
      onClose={onClose}
      title="Continue draft request"
      width="wide"
    >
      <div className="sm-modal-form">
        {error ? <InlineError>{error}</InlineError> : null}

        <FormRow>
          <FormField label="Project">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="none">— None —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </FormField>
        </FormRow>
        <FormField label="Reason / note">
          <Textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </FormField>
        <div className="rl-modal-actions" style={{ justifyContent: "flex-start" }}>
          <Button size="sm" onClick={() => void handleMetaSave()} disabled={busy}>
            Save meta
          </Button>
        </div>

        <SectionHeader title="Items" meta={`${requestItems.length}`} />
        {requestItems.length === 0 ? (
          <InlineNote>No items yet — add at least one before submitting.</InlineNote>
        ) : (
          <ul style={{ display: "grid", gap: "0.4rem", margin: 0, padding: 0, listStyle: "none" }}>
            {requestItems.map((ri) => {
              const item = itemsById.get(ri.item_id);
              const latest = item ? latestCheckByItem.get(item.id) : null;
              const days = daysSince(latest?.checked_at);
              const stale = days === null || days > STALE_CHECK_DAYS;
              return (
                <li
                  key={ri.id}
                  style={{
                    display: "grid",
                    gap: "0.3rem",
                    padding: "0.55rem 0.7rem",
                    border: "1px solid var(--rl-line)",
                    borderRadius: "var(--rl-radius-sm)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.4rem" }}>
                    <strong>{item?.name ?? "Unknown item"}</strong>
                    <Button size="sm" variant="danger" onClick={() => void onRemoveItem(ri.id)} disabled={busy}>
                      Remove
                    </Button>
                  </div>
                  {stale ? (
                    <InlineNote>
                      <span className="sm-warning-note">
                        ⚠ Last checked {days === null ? "never" : `${days} days ago`} — better check before ordering.
                      </span>
                    </InlineNote>
                  ) : null}
                  <div className="sm-modal-grid-3">
                    <FormField label="Quantity">
                      <Input
                        type="number"
                        step="any"
                        defaultValue={ri.requested_quantity ?? ""}
                        onBlur={(e) =>
                          void onUpdateItem({
                            requestItemId: ri.id,
                            requestedQuantity: e.target.value.trim() ? Number(e.target.value) : null,
                          })
                        }
                      />
                    </FormField>
                    <FormField label="Unit">
                      <Input
                        defaultValue={ri.unit ?? ""}
                        onBlur={(e) =>
                          void onUpdateItem({ requestItemId: ri.id, unit: e.target.value.trim() || null })
                        }
                      />
                    </FormField>
                    <FormField label="Priority">
                      <Select
                        defaultValue={ri.priority ?? "normal"}
                        onChange={(e) =>
                          void onUpdateItem({ requestItemId: ri.id, priority: e.target.value as RequestPriority })
                        }
                      >
                        {REQUEST_PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {statusLabel(p)}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                  </div>
                  <FormField label="Note">
                    <Input
                      defaultValue={ri.note ?? ""}
                      onBlur={(e) => void onUpdateItem({ requestItemId: ri.id, note: e.target.value.trim() || null })}
                    />
                  </FormField>
                </li>
              );
            })}
          </ul>
        )}

        <Panel>
          <SectionHeader title="Add an item" />
          <div className="sm-modal-grid-2">
            <FormField label="Item">
              <Select value={pickItemId} onChange={(e) => setPickItemId(e.target.value)}>
                <option value="">— Select —</option>
                {availableItems.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Priority">
              <Select value={pickPriority} onChange={(e) => setPickPriority(e.target.value as RequestPriority)}>
                {REQUEST_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {statusLabel(p)}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <div className="sm-modal-grid-3">
            <FormField label="Quantity">
              <Input type="number" step="any" value={pickQty} onChange={(e) => setPickQty(e.target.value)} />
            </FormField>
            <FormField label="Unit">
              <Input value={pickUnit} onChange={(e) => setPickUnit(e.target.value)} />
            </FormField>
            <FormField label="Note">
              <Input value={pickNote} onChange={(e) => setPickNote(e.target.value)} />
            </FormField>
          </div>
          <div className="rl-modal-actions" style={{ justifyContent: "flex-start" }}>
            <Button size="sm" variant="primary" onClick={() => void handleAddPick()} disabled={busy || !pickItemId}>
              Add to request
            </Button>
          </div>
        </Panel>

        <div className="rl-modal-actions">
          <Button
            variant="danger"
            onClick={async () => {
              if (!window.confirm("Discard this draft request and all its items?")) return;
              setBusy(true);
              try {
                await onAbort();
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
          >
            Abort draft
          </Button>
          <Button onClick={onClose} disabled={busy}>Close</Button>
          <Button
            variant="primary"
            onClick={() => void handleSubmit()}
            disabled={busy || requestItems.length === 0}
          >
            Submit for review
          </Button>
        </div>
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Review request modal (admin)
// ---------------------------------------------------------------------------

const ReviewRequestModal = ({
  request,
  requestItems,
  itemsById,
  projectsById,
  mode,
  suggestion,
  assignableFundingSources,
  onClose,
  onApprove,
  onDeny,
}: {
  request: OrderRequestRecord;
  requestItems: OrderRequestItemRecord[];
  itemsById: Map<string, ItemRecord>;
  projectsById: Map<string, { id: string; name: string }>;
  mode: "approve" | "deny";
  suggestion: FundingSuggestion | null;
  assignableFundingSources: FundingSourceRecord[];
  onClose: () => void;
  onApprove: (args: {
    note: string | null;
    fundingSourceId: string | null;
    fundingRequired: boolean;
  }) => Promise<void>;
  onDeny: (note: string) => Promise<void>;
}) => {
  // Pre-select the suggestion if it's still assignable (active or expiring,
  // but not archived/expired). An invalid suggestion forces a fresh pick.
  const initialFundingId =
    mode === "approve" && suggestion && !suggestion.invalid
      ? suggestion.fundingSource.id
      : "";

  const [note, setNote] = useState("");
  const [fundingSourceId, setFundingSourceId] = useState<string>(initialFundingId);
  const [fundingNotRequired, setFundingNotRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const project = request.project_id ? projectsById.get(request.project_id) : null;

  const selectedFunding = fundingSourceId
    ? assignableFundingSources.find((s) => s.id === fundingSourceId) ?? null
    : null;
  const selectedStatus = selectedFunding ? getFundingStatus(selectedFunding) : null;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (mode === "deny") {
      if (!note.trim()) {
        setError("A denial note is required.");
        return;
      }
      setBusy(true);
      try {
        await onDeny(note);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setBusy(false);
      }
      return;
    }

    // Approve path: require either a funding source or the explicit
    // "not required" toggle. Mirrors the SQL-side validation so the user
    // gets a clearer message before round-tripping.
    if (!fundingNotRequired && !fundingSourceId) {
      setError(
        "Pick a funding source for this approval, or check 'funding not required' if this order should bypass routing."
      );
      return;
    }

    setBusy(true);
    try {
      await onApprove({
        note: note.trim() || null,
        fundingSourceId: fundingNotRequired ? null : fundingSourceId,
        fundingRequired: !fundingNotRequired,
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "approve" ? "Approve request" : "Deny request"}
      width="default"
    >
      <form className="sm-modal-form" onSubmit={handleSubmit}>
        {error ? <InlineError>{error}</InlineError> : null}
        <div>
          <strong>{project?.name ?? "General"}</strong>
          {request.reason ? <p style={{ margin: "0.4rem 0 0" }}>{request.reason}</p> : null}
        </div>
        <ul style={{ display: "grid", gap: "0.3rem", margin: 0, padding: 0, listStyle: "none" }}>
          {requestItems.map((ri) => {
            const item = itemsById.get(ri.item_id);
            return (
              <li key={ri.id} style={{ fontSize: "0.85rem" }}>
                <strong>{item?.name ?? "—"}</strong> — {ri.requested_quantity ?? "?"} {ri.unit ?? ""}
                {ri.priority ? ` (${statusLabel(ri.priority)})` : ""}
                {ri.note ? ` — ${ri.note}` : ""}
              </li>
            );
          })}
        </ul>

        {mode === "approve" ? (
          <fieldset className="sm-funding-fieldset">
            <legend>Funding assignment</legend>

            {suggestion ? (
              <InlineNote>
                <strong>Suggested:</strong> {suggestion.fundingSource.nickname}
                {" — "}
                {suggestion.reason}
                {suggestion.invalid ? (
                  <>
                    {" "}
                    <Badge tone="danger">{suggestion.status.label}</Badge> Previously used
                    funding source is no longer assignable. Please choose a new one.
                  </>
                ) : (
                  <>
                    {" "}
                    <Badge tone={suggestion.status.badgeTone}>{suggestion.status.label}</Badge>
                  </>
                )}
              </InlineNote>
            ) : null}

            <FormField label="Approved funding source">
              <Select
                value={fundingSourceId}
                onChange={(e) => setFundingSourceId(e.target.value)}
                disabled={fundingNotRequired}
              >
                <option value="">— Select a funding source —</option>
                {assignableFundingSources.map((s) => {
                  const status = getFundingStatus(s);
                  return (
                    <option key={s.id} value={s.id}>
                      {s.nickname} ({status.label})
                      {s.grant_identifier ? ` · ${s.grant_identifier}` : ""}
                    </option>
                  );
                })}
              </Select>
            </FormField>

            {selectedFunding && selectedStatus ? (
              <div className="sm-funding-detail">
                <div>
                  <span className="sm-funding-meta">Grant identifier</span>
                  <code>{selectedFunding.grant_identifier ?? "—"}</code>
                </div>
                <div>
                  <span className="sm-funding-meta">Status</span>
                  <Badge tone={selectedStatus.badgeTone}>{selectedStatus.label}</Badge>
                </div>
                <div>
                  <span className="sm-funding-meta">Visibility</span>
                  <Badge tone="neutral">{fundingVisibilityLabel(selectedFunding.visibility)}</Badge>
                </div>
                {selectedStatus.kind === "ending_soon" || selectedStatus.kind === "expiring_soon" ? (
                  <InlineNote>
                    This funding source expires in {selectedStatus.daysUntilExpiration} day
                    {selectedStatus.daysUntilExpiration === 1 ? "" : "s"}. Confirm before
                    assigning it to this order.
                  </InlineNote>
                ) : null}
              </div>
            ) : null}

            <CheckboxField
              label="Funding not required for this order"
              hint="Use sparingly — most orders should be routed to a funding source."
              checked={fundingNotRequired}
              onChange={(e) => setFundingNotRequired(e.target.checked)}
            />
          </fieldset>
        ) : null}

        <FormField label={mode === "approve" ? "Approval note (optional)" : "Denial reason (required)"}>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
        <div className="rl-modal-actions">
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            type="submit"
            variant={mode === "approve" ? "primary" : "danger"}
            disabled={busy}
          >
            {busy ? "Saving…" : mode === "approve" ? "Approve" : "Deny"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Place order modal (admin)
// ---------------------------------------------------------------------------

const PlaceOrderModal = ({
  request: _request,
  requestItems,
  itemsById,
  onClose,
  onSubmit,
}: {
  request: OrderRequestRecord;
  requestItems: OrderRequestItemRecord[];
  itemsById: Map<string, ItemRecord>;
  onClose: () => void;
  onSubmit: (values: {
    company: string | null;
    orderNumber: string | null;
    trackingNumber: string | null;
    expectedArrival: string | null;
    note: string | null;
  }) => Promise<void>;
}) => {
  // Pre-fill vendor with the most common preferred_vendor among the request's
  // items (admins almost always order from a single supplier per request).
  const defaultVendor = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ri of requestItems) {
      const vendor = itemsById.get(ri.item_id)?.preferred_vendor?.trim();
      if (!vendor) continue;
      counts.set(vendor, (counts.get(vendor) ?? 0) + 1);
    }
    let top: string | null = null;
    let topCount = 0;
    for (const [vendor, count] of counts.entries()) {
      if (count > topCount) {
        top = vendor;
        topCount = count;
      }
    }
    return top ?? "";
  }, [requestItems, itemsById]);

  const [company, setCompany] = useState(defaultVendor);
  const [orderNumber, setOrderNumber] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [expected, setExpected] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        company: company.trim() || null,
        orderNumber: orderNumber.trim() || null,
        trackingNumber: trackingNumber.trim() || null,
        expectedArrival: expected ? new Date(expected).toISOString() : null,
        note: note.trim() || null,
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Mark as ordered" width="default">
      <form className="sm-modal-form" onSubmit={handleSubmit}>
        {error ? <InlineError>{error}</InlineError> : null}
        {requestItems.length > 0 ? (
          <>
            <SectionHeader title="Items in this request" meta={`${requestItems.length}`} />
            <Table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Vendor</th>
                  <th>Catalog #</th>
                </tr>
              </thead>
              <tbody>
                {requestItems.map((ri) => {
                  const item = itemsById.get(ri.item_id);
                  return (
                    <tr key={ri.id}>
                      <td>{item?.name ?? "Unknown"}</td>
                      <td>
                        {ri.requested_quantity ?? "—"}
                        {ri.unit ? ` ${ri.unit}` : ""}
                      </td>
                      <td>{item?.preferred_vendor ?? "—"}</td>
                      <td>{item?.catalog_number ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </>
        ) : null}
        <FormRow>
          <FormField label="Vendor">
            <Input value={company} onChange={(e) => setCompany(e.target.value)} />
          </FormField>
          <FormField label="Order #">
            <Input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
          </FormField>
        </FormRow>
        <FormRow>
          <FormField label="Tracking #">
            <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} />
          </FormField>
          <FormField label="Expected arrival">
            <Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
          </FormField>
        </FormRow>
        <FormField label="Note">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
        <div className="rl-modal-actions">
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Saving…" : "Place order"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Update order modal (admin)
// ---------------------------------------------------------------------------

const UpdateOrderModal = ({
  order,
  onClose,
  onSubmit,
}: {
  order: OrderRecord;
  onClose: () => void;
  onSubmit: (values: {
    company: string | null;
    orderNumber: string | null;
    trackingNumber: string | null;
    status: Exclude<OrderStatus, "received">;
    expectedArrival: string | null;
    note: string | null;
  }) => Promise<void>;
}) => {
  const safeStatus: Exclude<OrderStatus, "received"> =
    order.status === "received" ? "partially_received" : order.status;
  const [company, setCompany] = useState(order.company ?? "");
  const [orderNumber, setOrderNumber] = useState(order.order_number ?? "");
  const [trackingNumber, setTrackingNumber] = useState(order.tracking_number ?? "");
  const [orderStatus, setOrderStatus] = useState<Exclude<OrderStatus, "received">>(safeStatus);
  const [expected, setExpected] = useState(order.expected_arrival ? order.expected_arrival.slice(0, 10) : "");
  const [note, setNote] = useState(order.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        company: company.trim() || null,
        orderNumber: orderNumber.trim() || null,
        trackingNumber: trackingNumber.trim() || null,
        status: orderStatus,
        expectedArrival: expected ? new Date(expected).toISOString() : null,
        note: note.trim() || null,
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Update order" width="default">
      <form className="sm-modal-form" onSubmit={handleSubmit}>
        {error ? <InlineError>{error}</InlineError> : null}
        <FormRow>
          <FormField label="Status">
            <Select
              value={orderStatus}
              onChange={(e) => setOrderStatus(e.target.value as Exclude<OrderStatus, "received">)}
            >
              {NON_RECEIVED_ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Expected arrival">
            <Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
          </FormField>
        </FormRow>
        <FormRow>
          <FormField label="Vendor">
            <Input value={company} onChange={(e) => setCompany(e.target.value)} />
          </FormField>
          <FormField label="Order #">
            <Input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
          </FormField>
        </FormRow>
        <FormField label="Tracking #">
          <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} />
        </FormField>
        <FormField label="Note">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
        <InlineNote>To mark this order as received, use the "Receive" action so lots can be recorded.</InlineNote>
        <div className="rl-modal-actions">
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Receive order modal (admin or requester)
// ---------------------------------------------------------------------------

interface ReceiveLotDraft extends ReceiveLotInput {
  key: string;
}

const ReceiveOrderModal = ({
  order,
  requestItems,
  itemsById,
  onClose,
  onSubmit,
}: {
  order: OrderRecord;
  requestItems: OrderRequestItemRecord[];
  itemsById: Map<string, ItemRecord>;
  onClose: () => void;
  onSubmit: (values: {
    lots: ReceiveLotInput[];
    partial: boolean;
    markInventoryFull: boolean;
    note: string | null;
  }) => Promise<void>;
}) => {
  const [lots, setLots] = useState<ReceiveLotDraft[]>(() =>
    requestItems.map((ri, i) => ({
      key: `${ri.id}-${i}`,
      itemId: ri.item_id,
      lotNumber: null,
      receivedQuantity: ri.requested_quantity ?? null,
      unit: ri.unit ?? itemsById.get(ri.item_id)?.default_unit ?? null,
      expirationDate: null,
      storageLocation: itemsById.get(ri.item_id)?.storage_location ?? null,
      note: null,
    }))
  );
  const [partial, setPartial] = useState(false);
  const [markInventoryFull, setMarkInventoryFull] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateLot = (key: string, patch: Partial<ReceiveLotDraft>) => {
    setLots((prev) => prev.map((lot) => (lot.key === key ? { ...lot, ...patch } : lot)));
  };

  const removeLot = (key: string) => {
    setLots((prev) => prev.filter((lot) => lot.key !== key));
  };

  const addExtraLot = () => {
    if (requestItems.length === 0) return;
    setLots((prev) => [
      ...prev,
      {
        key: `extra-${prev.length}-${Date.now()}`,
        itemId: requestItems[0].item_id,
        lotNumber: null,
        receivedQuantity: null,
        unit: null,
        expirationDate: null,
        storageLocation: null,
        note: null,
      },
    ]);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const sanitized = lots.map(({ key: _key, ...rest }) => rest);
      await onSubmit({
        lots: sanitized,
        partial,
        markInventoryFull,
        note: note.trim() || null,
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Receive order" width="wide">
      <form className="sm-modal-form" onSubmit={handleSubmit}>
        {error ? <InlineError>{error}</InlineError> : null}
        <InlineNote>
          Recording lots is optional but recommended for reagents and samples. You can keep the lot list empty and just
          mark the order received.
        </InlineNote>

        {lots.length === 0 ? (
          <EmptyState boxed title="No lots" description="Add a lot to capture lot number, expiry, or received quantity." />
        ) : (
          <ul style={{ display: "grid", gap: "0.5rem", margin: 0, padding: 0, listStyle: "none" }}>
            {lots.map((lot) => {
              const item = itemsById.get(lot.itemId);
              return (
                <li
                  key={lot.key}
                  style={{
                    display: "grid",
                    gap: "0.4rem",
                    padding: "0.55rem 0.7rem",
                    border: "1px solid var(--rl-line)",
                    borderRadius: "var(--rl-radius-sm)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.4rem" }}>
                    <FormField label="Item">
                      <Select
                        value={lot.itemId}
                        onChange={(e) => updateLot(lot.key, { itemId: e.target.value })}
                      >
                        {requestItems.map((ri) => (
                          <option key={ri.id} value={ri.item_id}>
                            {itemsById.get(ri.item_id)?.name ?? "Unknown"}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                    <Button size="sm" variant="danger" onClick={() => removeLot(lot.key)}>
                      Remove
                    </Button>
                  </div>
                  <div className="sm-modal-grid-3">
                    <FormField label="Lot #">
                      <Input
                        value={lot.lotNumber ?? ""}
                        onChange={(e) => updateLot(lot.key, { lotNumber: e.target.value || null })}
                      />
                    </FormField>
                    <FormField label="Quantity">
                      <Input
                        type="number"
                        step="any"
                        value={lot.receivedQuantity ?? ""}
                        onChange={(e) =>
                          updateLot(lot.key, {
                            receivedQuantity: e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                      />
                    </FormField>
                    <FormField label="Unit">
                      <Input
                        value={lot.unit ?? ""}
                        onChange={(e) => updateLot(lot.key, { unit: e.target.value || null })}
                        placeholder={item?.default_unit ?? ""}
                      />
                    </FormField>
                  </div>
                  <div className="sm-modal-grid-2">
                    <FormField label="Expiration">
                      <Input
                        type="date"
                        value={lot.expirationDate ?? ""}
                        onChange={(e) => updateLot(lot.key, { expirationDate: e.target.value || null })}
                      />
                    </FormField>
                    <FormField label="Storage location">
                      <Input
                        value={lot.storageLocation ?? ""}
                        onChange={(e) => updateLot(lot.key, { storageLocation: e.target.value || null })}
                        placeholder={item?.storage_location ?? ""}
                      />
                    </FormField>
                  </div>
                  <FormField label="Note">
                    <Input
                      value={lot.note ?? ""}
                      onChange={(e) => updateLot(lot.key, { note: e.target.value || null })}
                    />
                  </FormField>
                </li>
              );
            })}
          </ul>
        )}

        <div className="rl-modal-actions" style={{ justifyContent: "flex-start" }}>
          <Button size="sm" onClick={addExtraLot} disabled={requestItems.length === 0}>
            + Add another lot
          </Button>
        </div>

        <FormField label="Receipt note">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
        <CheckboxField
          label="Partial receipt (don't close the order)"
          checked={partial}
          onChange={(e) => setPartial(e.target.checked)}
        />
        <CheckboxField
          label="Auto-record an inventory check marking these items as plenty"
          checked={markInventoryFull}
          onChange={(e) => setMarkInventoryFull(e.target.checked)}
        />

        <div className="rl-modal-actions">
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Saving…" : partial ? "Record partial receipt" : "Mark received"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
