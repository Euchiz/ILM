import { useCallback, useEffect, useState } from "react";
import {
  addInventoryCheck as rpcAddInventoryCheck,
  addOrderRequestItem as rpcAddOrderRequestItem,
  approveOrderRequest as rpcApproveOrderRequest,
  archiveItem as rpcArchiveItem,
  cancelOrderRequest as rpcCancelOrderRequest,
  createItem as rpcCreateItem,
  createOrderRequestDraft as rpcCreateOrderRequestDraft,
  deleteOrderRequest as rpcDeleteOrderRequest,
  denyOrderRequest as rpcDenyOrderRequest,
  linkItemToProject as rpcLinkItemToProject,
  listSupplyWorkspace,
  placeSupplyOrder as rpcPlaceSupplyOrder,
  receiveSupplyOrder as rpcReceiveSupplyOrder,
  removeOrderRequestItem as rpcRemoveOrderRequestItem,
  submitOrderRequest as rpcSubmitOrderRequest,
  unarchiveItem as rpcUnarchiveItem,
  unlinkItemFromProject as rpcUnlinkItemFromProject,
  updateItem as rpcUpdateItem,
  updateOrderRequestItem as rpcUpdateOrderRequestItem,
  updateOrderRequestMeta as rpcUpdateOrderRequestMeta,
  updateSupplyOrder as rpcUpdateSupplyOrder,
  withdrawOrderRequest as rpcWithdrawOrderRequest,
  type InventoryCheckRecord,
  type ItemAssociationType,
  type ItemClassification,
  type ItemProjectRecord,
  type ItemRecord,
  type OrderRecord,
  type OrderRequestItemRecord,
  type OrderRequestRecord,
  type OrderStatus,
  type ProjectOptionRecord,
  type ReceiveLotInput,
  type RequestPriority,
  type StockLotRecord,
  type StockStatus,
  type SupplyWorkspaceSnapshot,
} from "./cloudAdapter";

export type WorkspaceStatus = "idle" | "loading" | "ready" | "error";

export interface UseSupplyWorkspaceValue extends SupplyWorkspaceSnapshot {
  status: WorkspaceStatus;
  error: string | null;
  refresh: () => Promise<void>;

  createItem: (args: {
    name: string;
    classification: ItemClassification;
    details?: string | null;
    defaultUnit?: string | null;
    storageLocation?: string | null;
    catalogNumber?: string | null;
    preferredVendor?: string | null;
    projectLinks?: Array<{ projectId: string | null; associationType?: ItemAssociationType | null }>;
  }) => Promise<ItemRecord>;

  updateItem: (args: {
    itemId: string;
    name?: string;
    classification?: ItemClassification;
    details?: string | null;
    defaultUnit?: string | null;
    storageLocation?: string | null;
    catalogNumber?: string | null;
    preferredVendor?: string | null;
    isActive?: boolean;
  }) => Promise<ItemRecord>;

  archiveItem: (itemId: string) => Promise<ItemRecord>;
  unarchiveItem: (itemId: string) => Promise<ItemRecord>;

  linkItemToProject: (args: {
    itemId: string;
    projectId: string | null;
    associationType?: ItemAssociationType | null;
  }) => Promise<ItemProjectRecord>;
  unlinkItemFromProject: (linkId: string) => Promise<void>;

  addInventoryCheck: (args: {
    itemId: string;
    stockStatus: StockStatus;
    estimatedQuantity?: number | null;
    unit?: string | null;
    location?: string | null;
    note?: string | null;
  }) => Promise<InventoryCheckRecord>;

  createOrderRequestDraft: (args: {
    projectId?: string | null;
    reason?: string | null;
  }) => Promise<OrderRequestRecord>;
  updateOrderRequestMeta: (args: {
    requestId: string;
    projectId?: string | null;
    reason?: string | null;
  }) => Promise<OrderRequestRecord>;
  deleteOrderRequest: (requestId: string) => Promise<void>;

  addOrderRequestItem: (args: {
    requestId: string;
    itemId: string;
    requestedQuantity?: number | null;
    unit?: string | null;
    priority?: RequestPriority | null;
    note?: string | null;
  }) => Promise<OrderRequestItemRecord>;
  updateOrderRequestItem: (args: {
    requestItemId: string;
    requestedQuantity?: number | null;
    unit?: string | null;
    priority?: RequestPriority | null;
    note?: string | null;
  }) => Promise<OrderRequestItemRecord>;
  removeOrderRequestItem: (requestItemId: string) => Promise<void>;

  submitOrderRequest: (requestId: string) => Promise<OrderRequestRecord>;
  withdrawOrderRequest: (requestId: string) => Promise<OrderRequestRecord>;
  approveOrderRequest: (requestId: string, note?: string | null) => Promise<OrderRequestRecord>;
  denyOrderRequest: (requestId: string, note: string) => Promise<OrderRequestRecord>;
  cancelOrderRequest: (requestId: string) => Promise<OrderRequestRecord>;

  placeSupplyOrder: (args: {
    requestId: string;
    company?: string | null;
    orderNumber?: string | null;
    trackingNumber?: string | null;
    expectedArrival?: string | null;
    note?: string | null;
  }) => Promise<OrderRecord>;
  updateSupplyOrder: (args: {
    orderId: string;
    company?: string | null;
    orderNumber?: string | null;
    trackingNumber?: string | null;
    status?: Exclude<OrderStatus, "received">;
    expectedArrival?: string | null;
    note?: string | null;
  }) => Promise<OrderRecord>;
  receiveSupplyOrder: (args: {
    orderId: string;
    lots: ReceiveLotInput[];
    partial?: boolean;
    markInventoryFull?: boolean;
    note?: string | null;
  }) => Promise<OrderRecord>;
}

const EMPTY_ARRAY: [] = [];

const EMPTY_SNAPSHOT: SupplyWorkspaceSnapshot = {
  items: EMPTY_ARRAY,
  itemProjects: EMPTY_ARRAY,
  inventoryChecks: EMPTY_ARRAY,
  orderRequests: EMPTY_ARRAY,
  orderRequestItems: EMPTY_ARRAY,
  orders: EMPTY_ARRAY,
  stockLots: EMPTY_ARRAY,
  projects: EMPTY_ARRAY,
  myProjectIds: EMPTY_ARRAY,
};

export function useSupplyWorkspace(
  labId: string | null,
  userId: string | null
): UseSupplyWorkspaceValue {
  const [status, setStatus] = useState<WorkspaceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ItemRecord[]>(EMPTY_ARRAY);
  const [itemProjects, setItemProjects] = useState<ItemProjectRecord[]>(EMPTY_ARRAY);
  const [inventoryChecks, setInventoryChecks] = useState<InventoryCheckRecord[]>(EMPTY_ARRAY);
  const [orderRequests, setOrderRequests] = useState<OrderRequestRecord[]>(EMPTY_ARRAY);
  const [orderRequestItems, setOrderRequestItems] = useState<OrderRequestItemRecord[]>(EMPTY_ARRAY);
  const [orders, setOrders] = useState<OrderRecord[]>(EMPTY_ARRAY);
  const [stockLots, setStockLots] = useState<StockLotRecord[]>(EMPTY_ARRAY);
  const [projects, setProjects] = useState<ProjectOptionRecord[]>(EMPTY_ARRAY);
  const [myProjectIds, setMyProjectIds] = useState<string[]>(EMPTY_ARRAY);

  const hydrate = useCallback(async () => {
    if (!labId || !userId) {
      setItems(EMPTY_SNAPSHOT.items);
      setItemProjects(EMPTY_SNAPSHOT.itemProjects);
      setInventoryChecks(EMPTY_SNAPSHOT.inventoryChecks);
      setOrderRequests(EMPTY_SNAPSHOT.orderRequests);
      setOrderRequestItems(EMPTY_SNAPSHOT.orderRequestItems);
      setOrders(EMPTY_SNAPSHOT.orders);
      setStockLots(EMPTY_SNAPSHOT.stockLots);
      setProjects(EMPTY_SNAPSHOT.projects);
      setMyProjectIds(EMPTY_SNAPSHOT.myProjectIds);
      setStatus("idle");
      setError(null);
      return;
    }

    setStatus("loading");
    setError(null);
    try {
      const next = await listSupplyWorkspace(labId, userId);
      setItems(next.items);
      setItemProjects(next.itemProjects);
      setInventoryChecks(next.inventoryChecks);
      setOrderRequests(next.orderRequests);
      setOrderRequestItems(next.orderRequestItems);
      setOrders(next.orders);
      setStockLots(next.stockLots);
      setProjects(next.projects);
      setMyProjectIds(next.myProjectIds);
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [labId, userId]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const requireIdentity = useCallback(() => {
    if (!labId) throw new Error("No active lab selected.");
    if (!userId) throw new Error("No signed-in user available.");
    return { labId, userId };
  }, [labId, userId]);

  const createItem = useCallback<UseSupplyWorkspaceValue["createItem"]>(
    async (args) => {
      const { labId: lab, userId: uid } = requireIdentity();
      const created = await rpcCreateItem({
        labId: lab,
        userId: uid,
        name: args.name,
        classification: args.classification,
        details: args.details ?? null,
        defaultUnit: args.defaultUnit ?? null,
        storageLocation: args.storageLocation ?? null,
        catalogNumber: args.catalogNumber ?? null,
        preferredVendor: args.preferredVendor ?? null,
      });
      if (args.projectLinks && args.projectLinks.length > 0) {
        await Promise.all(
          args.projectLinks.map((link) =>
            rpcLinkItemToProject({
              itemId: created.id,
              userId: uid,
              projectId: link.projectId,
              associationType: link.associationType ?? null,
            })
          )
        );
      }
      await hydrate();
      return created;
    },
    [hydrate, requireIdentity]
  );

  const updateItem = useCallback<UseSupplyWorkspaceValue["updateItem"]>(
    async (args) => {
      const { userId: uid } = requireIdentity();
      const updated = await rpcUpdateItem({ ...args, userId: uid });
      await hydrate();
      return updated;
    },
    [hydrate, requireIdentity]
  );

  const archiveItem = useCallback<UseSupplyWorkspaceValue["archiveItem"]>(
    async (itemId) => {
      const { userId: uid } = requireIdentity();
      const updated = await rpcArchiveItem(itemId, uid);
      await hydrate();
      return updated;
    },
    [hydrate, requireIdentity]
  );

  const unarchiveItem = useCallback<UseSupplyWorkspaceValue["unarchiveItem"]>(
    async (itemId) => {
      const { userId: uid } = requireIdentity();
      const updated = await rpcUnarchiveItem(itemId, uid);
      await hydrate();
      return updated;
    },
    [hydrate, requireIdentity]
  );

  const linkItemToProject = useCallback<UseSupplyWorkspaceValue["linkItemToProject"]>(
    async (args) => {
      const { userId: uid } = requireIdentity();
      const link = await rpcLinkItemToProject({ ...args, userId: uid });
      await hydrate();
      return link;
    },
    [hydrate, requireIdentity]
  );

  const unlinkItemFromProject = useCallback<UseSupplyWorkspaceValue["unlinkItemFromProject"]>(
    async (linkId) => {
      requireIdentity();
      await rpcUnlinkItemFromProject(linkId);
      await hydrate();
    },
    [hydrate, requireIdentity]
  );

  const addInventoryCheck = useCallback<UseSupplyWorkspaceValue["addInventoryCheck"]>(
    async (args) => {
      const { userId: uid } = requireIdentity();
      const check = await rpcAddInventoryCheck({ ...args, userId: uid });
      await hydrate();
      return check;
    },
    [hydrate, requireIdentity]
  );

  const createOrderRequestDraft = useCallback<UseSupplyWorkspaceValue["createOrderRequestDraft"]>(
    async (args) => {
      const { labId: lab, userId: uid } = requireIdentity();
      const created = await rpcCreateOrderRequestDraft({ labId: lab, userId: uid, ...args });
      await hydrate();
      return created;
    },
    [hydrate, requireIdentity]
  );

  const updateOrderRequestMeta = useCallback<UseSupplyWorkspaceValue["updateOrderRequestMeta"]>(
    async (args) => {
      requireIdentity();
      const updated = await rpcUpdateOrderRequestMeta(args);
      await hydrate();
      return updated;
    },
    [hydrate, requireIdentity]
  );

  const deleteOrderRequest = useCallback<UseSupplyWorkspaceValue["deleteOrderRequest"]>(
    async (requestId) => {
      requireIdentity();
      await rpcDeleteOrderRequest(requestId);
      await hydrate();
    },
    [hydrate, requireIdentity]
  );

  const addOrderRequestItem = useCallback<UseSupplyWorkspaceValue["addOrderRequestItem"]>(
    async (args) => {
      requireIdentity();
      const item = await rpcAddOrderRequestItem(args);
      await hydrate();
      return item;
    },
    [hydrate, requireIdentity]
  );

  const updateOrderRequestItem = useCallback<UseSupplyWorkspaceValue["updateOrderRequestItem"]>(
    async (args) => {
      requireIdentity();
      const item = await rpcUpdateOrderRequestItem(args);
      await hydrate();
      return item;
    },
    [hydrate, requireIdentity]
  );

  const removeOrderRequestItem = useCallback<UseSupplyWorkspaceValue["removeOrderRequestItem"]>(
    async (requestItemId) => {
      requireIdentity();
      await rpcRemoveOrderRequestItem(requestItemId);
      await hydrate();
    },
    [hydrate, requireIdentity]
  );

  const submitOrderRequest = useCallback<UseSupplyWorkspaceValue["submitOrderRequest"]>(
    async (requestId) => {
      requireIdentity();
      const updated = await rpcSubmitOrderRequest(requestId);
      await hydrate();
      return updated;
    },
    [hydrate, requireIdentity]
  );

  const withdrawOrderRequest = useCallback<UseSupplyWorkspaceValue["withdrawOrderRequest"]>(
    async (requestId) => {
      requireIdentity();
      const updated = await rpcWithdrawOrderRequest(requestId);
      await hydrate();
      return updated;
    },
    [hydrate, requireIdentity]
  );

  const approveOrderRequest = useCallback<UseSupplyWorkspaceValue["approveOrderRequest"]>(
    async (requestId, note) => {
      requireIdentity();
      const updated = await rpcApproveOrderRequest(requestId, note);
      await hydrate();
      return updated;
    },
    [hydrate, requireIdentity]
  );

  const denyOrderRequest = useCallback<UseSupplyWorkspaceValue["denyOrderRequest"]>(
    async (requestId, note) => {
      requireIdentity();
      const updated = await rpcDenyOrderRequest(requestId, note);
      await hydrate();
      return updated;
    },
    [hydrate, requireIdentity]
  );

  const cancelOrderRequest = useCallback<UseSupplyWorkspaceValue["cancelOrderRequest"]>(
    async (requestId) => {
      requireIdentity();
      const updated = await rpcCancelOrderRequest(requestId);
      await hydrate();
      return updated;
    },
    [hydrate, requireIdentity]
  );

  const placeSupplyOrder = useCallback<UseSupplyWorkspaceValue["placeSupplyOrder"]>(
    async (args) => {
      requireIdentity();
      const order = await rpcPlaceSupplyOrder(args);
      await hydrate();
      return order;
    },
    [hydrate, requireIdentity]
  );

  const updateSupplyOrder = useCallback<UseSupplyWorkspaceValue["updateSupplyOrder"]>(
    async (args) => {
      requireIdentity();
      const order = await rpcUpdateSupplyOrder(args);
      await hydrate();
      return order;
    },
    [hydrate, requireIdentity]
  );

  const receiveSupplyOrder = useCallback<UseSupplyWorkspaceValue["receiveSupplyOrder"]>(
    async (args) => {
      requireIdentity();
      const order = await rpcReceiveSupplyOrder(args);
      await hydrate();
      return order;
    },
    [hydrate, requireIdentity]
  );

  return {
    status,
    error,
    items,
    itemProjects,
    inventoryChecks,
    orderRequests,
    orderRequestItems,
    orders,
    stockLots,
    projects,
    myProjectIds,
    refresh: hydrate,
    createItem,
    updateItem,
    archiveItem,
    unarchiveItem,
    linkItemToProject,
    unlinkItemFromProject,
    addInventoryCheck,
    createOrderRequestDraft,
    updateOrderRequestMeta,
    deleteOrderRequest,
    addOrderRequestItem,
    updateOrderRequestItem,
    removeOrderRequestItem,
    submitOrderRequest,
    withdrawOrderRequest,
    approveOrderRequest,
    denyOrderRequest,
    cancelOrderRequest,
    placeSupplyOrder,
    updateSupplyOrder,
    receiveSupplyOrder,
  };
}
