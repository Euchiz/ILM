import {
  getSupabaseClient,
  type FundingAssignmentStatus,
  type FundingDefaultRecord,
  type FundingSourceRecord,
} from "@ilm/utils";

export type { FundingAssignmentStatus, FundingDefaultRecord, FundingSourceRecord };

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type ItemClassification = "reagent" | "consumable" | "supply" | "sample" | "other";

export type StockStatus = "plenty" | "medium" | "low" | "out" | "unknown";

export type ItemAssociationType = "primary" | "shared" | "temporary" | "general";

export type OrderRequestStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "denied"
  | "withdrawn"
  | "ordered"
  | "received"
  | "cancelled";

export type OrderStatus =
  | "order_placed"
  | "shipped"
  | "partially_received"
  | "received"
  | "cancelled";

export type RequestPriority = "low" | "normal" | "high" | "urgent";

export interface ItemRecord {
  id: string;
  lab_id: string;
  name: string;
  details: string | null;
  classification: ItemClassification;
  default_unit: string | null;
  storage_location: string | null;
  catalog_number: string | null;
  preferred_vendor: string | null;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ItemProjectRecord {
  id: string;
  item_id: string;
  project_id: string | null;
  association_type: ItemAssociationType | null;
  created_by: string | null;
  created_at: string;
}

export interface InventoryCheckRecord {
  id: string;
  item_id: string;
  stock_status: StockStatus;
  estimated_quantity: number | null;
  unit: string | null;
  location: string | null;
  note: string | null;
  checked_by: string | null;
  checked_at: string;
}

export interface OrderRequestRecord {
  id: string;
  lab_id: string;
  requested_by: string | null;
  project_id: string | null;
  status: OrderRequestStatus;
  reason: string | null;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  requested_funding_source_id: string | null;
  suggested_funding_source_id: string | null;
  approved_funding_source_id: string | null;
  funding_assignment_status: FundingAssignmentStatus;
  funding_assigned_by: string | null;
  funding_assigned_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderRequestItemRecord {
  id: string;
  order_request_id: string;
  item_id: string;
  requested_quantity: number | null;
  unit: string | null;
  priority: RequestPriority | null;
  note: string | null;
  created_at: string;
}

export interface OrderRecord {
  id: string;
  order_request_id: string;
  company: string | null;
  order_number: string | null;
  tracking_number: string | null;
  status: OrderStatus;
  placed_by: string | null;
  placed_at: string | null;
  expected_arrival: string | null;
  received_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface StockLotRecord {
  id: string;
  item_id: string;
  order_id: string | null;
  lot_number: string | null;
  received_quantity: number | null;
  unit: string | null;
  expiration_date: string | null;
  storage_location: string | null;
  received_by: string | null;
  received_at: string;
  note: string | null;
}

export interface ProjectOptionRecord {
  id: string;
  name: string;
}

export interface SupplyWorkspaceSnapshot {
  items: ItemRecord[];
  itemProjects: ItemProjectRecord[];
  inventoryChecks: InventoryCheckRecord[];
  orderRequests: OrderRequestRecord[];
  orderRequestItems: OrderRequestItemRecord[];
  orders: OrderRecord[];
  stockLots: StockLotRecord[];
  projects: ProjectOptionRecord[];
  myProjectIds: string[];
  fundingSources: FundingSourceRecord[];
  fundingDefaults: FundingDefaultRecord[];
}

const client = () => getSupabaseClient();

const ITEM_FIELDS =
  "id, lab_id, name, details, classification, default_unit, storage_location, catalog_number, preferred_vendor, is_active, created_by, updated_by, created_at, updated_at";

const ITEM_PROJECT_FIELDS =
  "id, item_id, project_id, association_type, created_by, created_at";

const INVENTORY_CHECK_FIELDS =
  "id, item_id, stock_status, estimated_quantity, unit, location, note, checked_by, checked_at";

const ORDER_REQUEST_FIELDS =
  "id, lab_id, requested_by, project_id, status, reason, review_note, reviewed_by, reviewed_at, requested_funding_source_id, suggested_funding_source_id, approved_funding_source_id, funding_assignment_status, funding_assigned_by, funding_assigned_at, created_at, updated_at";

const FUNDING_DEFAULT_FIELDS =
  "id, lab_id, funding_source_id, item_id, project_id, category, confidence_level, set_by_user_id, last_used_order_id, last_used_at, created_at, updated_at";

const ORDER_REQUEST_ITEM_FIELDS =
  "id, order_request_id, item_id, requested_quantity, unit, priority, note, created_at";

const ORDER_FIELDS =
  "id, order_request_id, company, order_number, tracking_number, status, placed_by, placed_at, expected_arrival, received_at, note, created_at, updated_at";

const STOCK_LOT_FIELDS =
  "id, item_id, order_id, lot_number, received_quantity, unit, expiration_date, storage_location, received_by, received_at, note";

// ---------------------------------------------------------------------------
// Hydration
// ---------------------------------------------------------------------------

export async function listSupplyWorkspace(
  labId: string,
  userId: string
): Promise<SupplyWorkspaceSnapshot> {
  const [
    itemsResult,
    itemProjectsResult,
    inventoryChecksResult,
    orderRequestsResult,
    orderRequestItemsResult,
    ordersResult,
    stockLotsResult,
    projectsResult,
    myProjectsResult,
    fundingSourcesResult,
    fundingDefaultsResult,
  ] = await Promise.all([
    client().from("items").select(ITEM_FIELDS).eq("lab_id", labId).order("name", { ascending: true }),
    client().from("item_projects").select(ITEM_PROJECT_FIELDS),
    client().from("inventory_checks").select(INVENTORY_CHECK_FIELDS).order("checked_at", { ascending: false }),
    client().from("order_requests").select(ORDER_REQUEST_FIELDS).eq("lab_id", labId).order("created_at", { ascending: false }),
    client().from("order_request_items").select(ORDER_REQUEST_ITEM_FIELDS),
    client().from("orders").select(ORDER_FIELDS).order("created_at", { ascending: false }),
    client().from("stock_lots").select(STOCK_LOT_FIELDS).order("received_at", { ascending: false }),
    client().from("projects").select("id, name").eq("lab_id", labId).order("name", { ascending: true }),
    client().from("project_members").select("project_id").eq("user_id", userId),
    client().rpc("list_funding_sources", { p_lab_id: labId }),
    // funding_defaults is admin-only at the SQL boundary; members get an
    // empty list back (RLS suppresses rows) and the suggestion engine
    // falls through to "no suggestion".
    client().from("funding_defaults").select(FUNDING_DEFAULT_FIELDS).eq("lab_id", labId),
  ]);

  if (itemsResult.error) throw itemsResult.error;
  if (itemProjectsResult.error) throw itemProjectsResult.error;
  if (inventoryChecksResult.error) throw inventoryChecksResult.error;
  if (orderRequestsResult.error) throw orderRequestsResult.error;
  if (orderRequestItemsResult.error) throw orderRequestItemsResult.error;
  if (ordersResult.error) throw ordersResult.error;
  if (stockLotsResult.error) throw stockLotsResult.error;
  if (projectsResult.error) throw projectsResult.error;
  if (myProjectsResult.error) throw myProjectsResult.error;
  if (fundingSourcesResult.error) throw fundingSourcesResult.error;
  // funding_defaults selection failure is non-fatal — members can't read it
  // and the suggestion engine handles an empty list gracefully.

  const myProjectIds = ((myProjectsResult.data ?? []) as Array<{ project_id: string }>).map(
    (row) => row.project_id
  );

  return {
    items: (itemsResult.data as ItemRecord[]) ?? [],
    itemProjects: (itemProjectsResult.data as ItemProjectRecord[]) ?? [],
    inventoryChecks: (inventoryChecksResult.data as InventoryCheckRecord[]) ?? [],
    orderRequests: (orderRequestsResult.data as OrderRequestRecord[]) ?? [],
    orderRequestItems: (orderRequestItemsResult.data as OrderRequestItemRecord[]) ?? [],
    orders: (ordersResult.data as OrderRecord[]) ?? [],
    stockLots: (stockLotsResult.data as StockLotRecord[]) ?? [],
    projects: (projectsResult.data as ProjectOptionRecord[]) ?? [],
    myProjectIds,
    fundingSources: (fundingSourcesResult.data as FundingSourceRecord[]) ?? [],
    fundingDefaults: fundingDefaultsResult.error
      ? []
      : ((fundingDefaultsResult.data as FundingDefaultRecord[]) ?? []),
  };
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export async function createItem(args: {
  labId: string;
  userId: string;
  name: string;
  classification: ItemClassification;
  details?: string | null;
  defaultUnit?: string | null;
  storageLocation?: string | null;
  catalogNumber?: string | null;
  preferredVendor?: string | null;
}): Promise<ItemRecord> {
  const { data, error } = await client()
    .from("items")
    .insert({
      lab_id: args.labId,
      name: args.name,
      classification: args.classification,
      details: args.details?.trim() || null,
      default_unit: args.defaultUnit?.trim() || null,
      storage_location: args.storageLocation?.trim() || null,
      catalog_number: args.catalogNumber?.trim() || null,
      preferred_vendor: args.preferredVendor?.trim() || null,
      created_by: args.userId,
      updated_by: args.userId,
    })
    .select(ITEM_FIELDS)
    .single();
  if (error) throw error;
  return data as ItemRecord;
}

export async function updateItem(args: {
  itemId: string;
  userId: string;
  name?: string;
  classification?: ItemClassification;
  details?: string | null;
  defaultUnit?: string | null;
  storageLocation?: string | null;
  catalogNumber?: string | null;
  preferredVendor?: string | null;
  isActive?: boolean;
}): Promise<ItemRecord> {
  const update: Record<string, unknown> = { updated_by: args.userId };
  if (args.name !== undefined) update.name = args.name;
  if (args.classification !== undefined) update.classification = args.classification;
  if (args.details !== undefined) update.details = args.details?.trim() || null;
  if (args.defaultUnit !== undefined) update.default_unit = args.defaultUnit?.trim() || null;
  if (args.storageLocation !== undefined) update.storage_location = args.storageLocation?.trim() || null;
  if (args.catalogNumber !== undefined) update.catalog_number = args.catalogNumber?.trim() || null;
  if (args.preferredVendor !== undefined) update.preferred_vendor = args.preferredVendor?.trim() || null;
  if (args.isActive !== undefined) update.is_active = args.isActive;

  const { data, error } = await client()
    .from("items")
    .update(update)
    .eq("id", args.itemId)
    .select(ITEM_FIELDS)
    .single();
  if (error) throw error;
  return data as ItemRecord;
}

export async function archiveItem(itemId: string, userId: string): Promise<ItemRecord> {
  return updateItem({ itemId, userId, isActive: false });
}

export async function unarchiveItem(itemId: string, userId: string): Promise<ItemRecord> {
  return updateItem({ itemId, userId, isActive: true });
}

export async function deleteItem(itemId: string): Promise<void> {
  const { error } = await client().from("items").delete().eq("id", itemId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Item ↔ project associations
// ---------------------------------------------------------------------------

export async function linkItemToProject(args: {
  itemId: string;
  userId: string;
  projectId: string | null;
  associationType?: ItemAssociationType | null;
}): Promise<ItemProjectRecord> {
  const { data, error } = await client()
    .from("item_projects")
    .insert({
      item_id: args.itemId,
      project_id: args.projectId,
      association_type: args.associationType ?? null,
      created_by: args.userId,
    })
    .select(ITEM_PROJECT_FIELDS)
    .single();
  if (error) throw error;
  return data as ItemProjectRecord;
}

export async function unlinkItemFromProject(linkId: string): Promise<void> {
  const { error } = await client().from("item_projects").delete().eq("id", linkId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Inventory checks (append-only)
// ---------------------------------------------------------------------------

export async function addInventoryCheck(args: {
  itemId: string;
  userId: string;
  stockStatus: StockStatus;
  estimatedQuantity?: number | null;
  unit?: string | null;
  location?: string | null;
  note?: string | null;
}): Promise<InventoryCheckRecord> {
  const { data, error } = await client()
    .from("inventory_checks")
    .insert({
      item_id: args.itemId,
      stock_status: args.stockStatus,
      estimated_quantity: args.estimatedQuantity ?? null,
      unit: args.unit?.trim() || null,
      location: args.location?.trim() || null,
      note: args.note?.trim() || null,
      checked_by: args.userId,
    })
    .select(INVENTORY_CHECK_FIELDS)
    .single();
  if (error) throw error;
  return data as InventoryCheckRecord;
}

// ---------------------------------------------------------------------------
// Order requests
// ---------------------------------------------------------------------------

export async function createOrderRequestDraft(args: {
  labId: string;
  userId: string;
  projectId?: string | null;
  reason?: string | null;
}): Promise<OrderRequestRecord> {
  const { data, error } = await client()
    .from("order_requests")
    .insert({
      lab_id: args.labId,
      requested_by: args.userId,
      project_id: args.projectId ?? null,
      reason: args.reason?.trim() || null,
      status: "draft",
    })
    .select(ORDER_REQUEST_FIELDS)
    .single();
  if (error) throw error;
  return data as OrderRequestRecord;
}

export async function updateOrderRequestMeta(args: {
  requestId: string;
  projectId?: string | null;
  reason?: string | null;
}): Promise<OrderRequestRecord> {
  const update: Record<string, unknown> = {};
  if (args.projectId !== undefined) update.project_id = args.projectId;
  if (args.reason !== undefined) update.reason = args.reason?.trim() || null;

  const { data, error } = await client()
    .from("order_requests")
    .update(update)
    .eq("id", args.requestId)
    .select(ORDER_REQUEST_FIELDS)
    .single();
  if (error) throw error;
  return data as OrderRequestRecord;
}

export async function deleteOrderRequest(requestId: string): Promise<void> {
  const { error } = await client().from("order_requests").delete().eq("id", requestId);
  if (error) throw error;
}

export async function addOrderRequestItem(args: {
  requestId: string;
  itemId: string;
  requestedQuantity?: number | null;
  unit?: string | null;
  priority?: RequestPriority | null;
  note?: string | null;
}): Promise<OrderRequestItemRecord> {
  const { data, error } = await client()
    .from("order_request_items")
    .insert({
      order_request_id: args.requestId,
      item_id: args.itemId,
      requested_quantity: args.requestedQuantity ?? null,
      unit: args.unit?.trim() || null,
      priority: args.priority ?? null,
      note: args.note?.trim() || null,
    })
    .select(ORDER_REQUEST_ITEM_FIELDS)
    .single();
  if (error) throw error;
  return data as OrderRequestItemRecord;
}

export async function updateOrderRequestItem(args: {
  requestItemId: string;
  requestedQuantity?: number | null;
  unit?: string | null;
  priority?: RequestPriority | null;
  note?: string | null;
}): Promise<OrderRequestItemRecord> {
  const update: Record<string, unknown> = {};
  if (args.requestedQuantity !== undefined) update.requested_quantity = args.requestedQuantity;
  if (args.unit !== undefined) update.unit = args.unit?.trim() || null;
  if (args.priority !== undefined) update.priority = args.priority;
  if (args.note !== undefined) update.note = args.note?.trim() || null;

  const { data, error } = await client()
    .from("order_request_items")
    .update(update)
    .eq("id", args.requestItemId)
    .select(ORDER_REQUEST_ITEM_FIELDS)
    .single();
  if (error) throw error;
  return data as OrderRequestItemRecord;
}

export async function removeOrderRequestItem(requestItemId: string): Promise<void> {
  const { error } = await client().from("order_request_items").delete().eq("id", requestItemId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Order request lifecycle (RPCs)
// ---------------------------------------------------------------------------

export async function submitOrderRequest(requestId: string): Promise<OrderRequestRecord> {
  const { data, error } = await client()
    .rpc("submit_order_request", { p_request_id: requestId })
    .single();
  if (error) throw error;
  return data as OrderRequestRecord;
}

export async function withdrawOrderRequest(requestId: string): Promise<OrderRequestRecord> {
  const { data, error } = await client()
    .rpc("withdraw_order_request", { p_request_id: requestId })
    .single();
  if (error) throw error;
  return data as OrderRequestRecord;
}

export async function approveOrderRequest(
  requestId: string,
  args?: {
    note?: string | null;
    fundingSourceId?: string | null;
    fundingRequired?: boolean;
  }
): Promise<OrderRequestRecord> {
  const { data, error } = await client()
    .rpc("approve_order_request", {
      p_request_id: requestId,
      p_note: args?.note ?? null,
      p_funding_source_id: args?.fundingSourceId ?? null,
      p_funding_required: args?.fundingRequired ?? true,
    })
    .single();
  if (error) throw error;
  return data as OrderRequestRecord;
}

export async function setOrderFunding(
  requestId: string,
  fundingSourceId: string
): Promise<OrderRequestRecord> {
  const { data, error } = await client()
    .rpc("set_order_funding", {
      p_request_id: requestId,
      p_funding_source_id: fundingSourceId,
    })
    .single();
  if (error) throw error;
  return data as OrderRequestRecord;
}

export async function clearOrderFunding(requestId: string): Promise<OrderRequestRecord> {
  const { data, error } = await client()
    .rpc("clear_order_funding", { p_request_id: requestId })
    .single();
  if (error) throw error;
  return data as OrderRequestRecord;
}

export async function denyOrderRequest(
  requestId: string,
  note: string
): Promise<OrderRequestRecord> {
  const trimmed = note.trim();
  if (!trimmed) throw new Error("A denial note is required.");
  const { data, error } = await client()
    .rpc("deny_order_request", { p_request_id: requestId, p_note: trimmed })
    .single();
  if (error) throw error;
  return data as OrderRequestRecord;
}

export async function cancelOrderRequest(requestId: string): Promise<OrderRequestRecord> {
  const { data, error } = await client()
    .rpc("cancel_order_request", { p_request_id: requestId })
    .single();
  if (error) throw error;
  return data as OrderRequestRecord;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export async function placeSupplyOrder(args: {
  requestId: string;
  company?: string | null;
  orderNumber?: string | null;
  trackingNumber?: string | null;
  expectedArrival?: string | null;
  note?: string | null;
}): Promise<OrderRecord> {
  const { data, error } = await client()
    .rpc("place_supply_order", {
      p_request_id: args.requestId,
      p_company: args.company ?? null,
      p_order_number: args.orderNumber ?? null,
      p_tracking_number: args.trackingNumber ?? null,
      p_expected_arrival: args.expectedArrival ?? null,
      p_note: args.note ?? null,
    })
    .single();
  if (error) throw error;
  return data as OrderRecord;
}

export async function updateSupplyOrder(args: {
  orderId: string;
  company?: string | null;
  orderNumber?: string | null;
  trackingNumber?: string | null;
  status?: Exclude<OrderStatus, "received">;
  expectedArrival?: string | null;
  note?: string | null;
}): Promise<OrderRecord> {
  const { data, error } = await client()
    .rpc("update_supply_order", {
      p_order_id: args.orderId,
      p_company: args.company ?? null,
      p_order_number: args.orderNumber ?? null,
      p_tracking_number: args.trackingNumber ?? null,
      p_status: args.status ?? null,
      p_expected_arrival: args.expectedArrival ?? null,
      p_note: args.note ?? null,
    })
    .single();
  if (error) throw error;
  return data as OrderRecord;
}

export interface ReceiveLotInput {
  itemId: string;
  lotNumber?: string | null;
  receivedQuantity?: number | null;
  unit?: string | null;
  expirationDate?: string | null;
  storageLocation?: string | null;
  note?: string | null;
}

export async function receiveSupplyOrder(args: {
  orderId: string;
  lots: ReceiveLotInput[];
  partial?: boolean;
  markInventoryFull?: boolean;
  note?: string | null;
}): Promise<OrderRecord> {
  const lotPayload = args.lots.map((lot) => ({
    item_id: lot.itemId,
    lot_number: lot.lotNumber ?? null,
    received_quantity: lot.receivedQuantity ?? null,
    unit: lot.unit ?? null,
    expiration_date: lot.expirationDate ?? null,
    storage_location: lot.storageLocation ?? null,
    note: lot.note ?? null,
  }));

  const { data, error } = await client()
    .rpc("receive_supply_order", {
      p_order_id: args.orderId,
      p_lots: lotPayload,
      p_partial: args.partial ?? false,
      p_mark_inventory_full: args.markInventoryFull ?? false,
      p_note: args.note ?? null,
    })
    .single();
  if (error) throw error;
  return data as OrderRecord;
}
