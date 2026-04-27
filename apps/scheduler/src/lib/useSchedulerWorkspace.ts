import { useCallback, useEffect, useState } from "react";
import {
  approveBooking as rpcApproveBooking,
  archiveResource as rpcArchiveResource,
  bookResource as rpcBookResource,
  cancelBooking as rpcCancelBooking,
  completeBooking as rpcCompleteBooking,
  createCalendarEvent as rpcCreateCalendarEvent,
  createPlannedTask as rpcCreatePlannedTask,
  createResource as rpcCreateResource,
  deleteCalendarEvent as rpcDeleteCalendarEvent,
  deletePlannedTask as rpcDeletePlannedTask,
  denyBooking as rpcDenyBooking,
  findBookingConflicts as rpcFindBookingConflicts,
  listSchedulerWorkspace,
  schedulePlannedTask as rpcSchedulePlannedTask,
  updateCalendarEvent as rpcUpdateCalendarEvent,
  updatePlannedTask as rpcUpdatePlannedTask,
  updateResource as rpcUpdateResource,
  type BookingRecord,
  type BookResourceArgs,
  type CalendarEventInput,
  type CalendarEventRecord,
  type PlannedTaskInput,
  type PlannedTaskRecord,
  type ResourceInput,
  type ResourceRecord,
  type SchedulePlannedTaskBookingArgs,
  type SchedulePlannedTaskEventArgs,
  type SchedulerWorkspaceSnapshot,
} from "./cloudAdapter";

export type WorkspaceStatus = "idle" | "loading" | "ready" | "error";

export interface UseSchedulerWorkspaceValue extends SchedulerWorkspaceSnapshot {
  status: WorkspaceStatus;
  error: string | null;
  refresh: () => Promise<void>;

  createResource: (data: ResourceInput) => Promise<ResourceRecord>;
  updateResource: (
    resourceId: string,
    data: Partial<ResourceInput> & { is_active?: boolean }
  ) => Promise<ResourceRecord>;
  archiveResource: (resourceId: string) => Promise<ResourceRecord>;

  createCalendarEvent: (data: CalendarEventInput) => Promise<CalendarEventRecord>;
  updateCalendarEvent: (
    eventId: string,
    data: Parameters<typeof rpcUpdateCalendarEvent>[0]["data"]
  ) => Promise<CalendarEventRecord>;
  deleteCalendarEvent: (eventId: string) => Promise<void>;

  bookResource: (args: BookResourceArgs) => Promise<BookingRecord>;
  cancelBooking: (bookingId: string, note?: string | null) => Promise<BookingRecord>;
  completeBooking: (args: {
    bookingId: string;
    usageRecord?: string | null;
    actualStartTime?: string | null;
    actualEndTime?: string | null;
  }) => Promise<BookingRecord>;
  approveBooking: (bookingId: string, note?: string | null) => Promise<BookingRecord>;
  denyBooking: (bookingId: string, note: string) => Promise<BookingRecord>;
  findBookingConflicts: typeof rpcFindBookingConflicts;

  createPlannedTask: (data: PlannedTaskInput) => Promise<PlannedTaskRecord>;
  updatePlannedTask: (
    taskId: string,
    data: Partial<PlannedTaskInput>
  ) => Promise<PlannedTaskRecord>;
  deletePlannedTask: (taskId: string) => Promise<void>;
  schedulePlannedTask: (args: {
    taskId: string;
    event?: SchedulePlannedTaskEventArgs | null;
    booking?: SchedulePlannedTaskBookingArgs | null;
  }) => Promise<PlannedTaskRecord>;
}

const EMPTY_SNAPSHOT: SchedulerWorkspaceSnapshot = {
  resources: [],
  events: [],
  bookings: [],
  plannedTasks: [],
  projects: [],
  protocols: [],
};

export function useSchedulerWorkspace(args: {
  labId: string | null;
  userId: string | null;
}): UseSchedulerWorkspaceValue {
  const { labId, userId } = args;
  const [snapshot, setSnapshot] = useState<SchedulerWorkspaceSnapshot>(EMPTY_SNAPSHOT);
  const [status, setStatus] = useState<WorkspaceStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const hydrate = useCallback(async () => {
    if (!labId) {
      setSnapshot(EMPTY_SNAPSHOT);
      setStatus("idle");
      return;
    }
    setStatus("loading");
    setError(null);
    try {
      const next = await listSchedulerWorkspace(labId);
      setSnapshot(next);
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [labId]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const requireIdentity = useCallback(() => {
    if (!labId) throw new Error("No active lab selected.");
    if (!userId) throw new Error("No signed-in user available.");
    return { labId, userId };
  }, [labId, userId]);

  const createResource = useCallback<UseSchedulerWorkspaceValue["createResource"]>(
    async (data) => {
      const { labId: lab, userId: uid } = requireIdentity();
      const created = await rpcCreateResource({ labId: lab, userId: uid, data });
      await hydrate();
      return created;
    },
    [hydrate, requireIdentity]
  );

  const updateResource = useCallback<UseSchedulerWorkspaceValue["updateResource"]>(
    async (resourceId, data) => {
      const { userId: uid } = requireIdentity();
      const updated = await rpcUpdateResource({ resourceId, userId: uid, data });
      await hydrate();
      return updated;
    },
    [hydrate, requireIdentity]
  );

  const archiveResource = useCallback<UseSchedulerWorkspaceValue["archiveResource"]>(
    async (resourceId) => {
      const { userId: uid } = requireIdentity();
      const updated = await rpcArchiveResource(resourceId, uid);
      await hydrate();
      return updated;
    },
    [hydrate, requireIdentity]
  );

  const createCalendarEvent = useCallback<UseSchedulerWorkspaceValue["createCalendarEvent"]>(
    async (data) => {
      const { labId: lab, userId: uid } = requireIdentity();
      const created = await rpcCreateCalendarEvent({ labId: lab, userId: uid, data });
      await hydrate();
      return created;
    },
    [hydrate, requireIdentity]
  );

  const updateCalendarEvent = useCallback<UseSchedulerWorkspaceValue["updateCalendarEvent"]>(
    async (eventId, data) => {
      const { userId: uid } = requireIdentity();
      const updated = await rpcUpdateCalendarEvent({ eventId, userId: uid, data });
      await hydrate();
      return updated;
    },
    [hydrate, requireIdentity]
  );

  const deleteCalendarEvent = useCallback<UseSchedulerWorkspaceValue["deleteCalendarEvent"]>(
    async (eventId) => {
      requireIdentity();
      await rpcDeleteCalendarEvent(eventId);
      await hydrate();
    },
    [hydrate, requireIdentity]
  );

  const bookResource = useCallback<UseSchedulerWorkspaceValue["bookResource"]>(
    async (bookArgs) => {
      requireIdentity();
      const created = await rpcBookResource(bookArgs);
      await hydrate();
      return created;
    },
    [hydrate, requireIdentity]
  );

  const cancelBooking = useCallback<UseSchedulerWorkspaceValue["cancelBooking"]>(
    async (bookingId, note) => {
      requireIdentity();
      const updated = await rpcCancelBooking(bookingId, note);
      await hydrate();
      return updated;
    },
    [hydrate, requireIdentity]
  );

  const completeBooking = useCallback<UseSchedulerWorkspaceValue["completeBooking"]>(
    async (completeArgs) => {
      requireIdentity();
      const updated = await rpcCompleteBooking(completeArgs);
      await hydrate();
      return updated;
    },
    [hydrate, requireIdentity]
  );

  const approveBooking = useCallback<UseSchedulerWorkspaceValue["approveBooking"]>(
    async (bookingId, note) => {
      requireIdentity();
      const updated = await rpcApproveBooking(bookingId, note);
      await hydrate();
      return updated;
    },
    [hydrate, requireIdentity]
  );

  const denyBooking = useCallback<UseSchedulerWorkspaceValue["denyBooking"]>(
    async (bookingId, note) => {
      requireIdentity();
      const updated = await rpcDenyBooking(bookingId, note);
      await hydrate();
      return updated;
    },
    [hydrate, requireIdentity]
  );

  const createPlannedTask = useCallback<UseSchedulerWorkspaceValue["createPlannedTask"]>(
    async (data) => {
      const { labId: lab, userId: uid } = requireIdentity();
      const created = await rpcCreatePlannedTask({ labId: lab, userId: uid, data });
      await hydrate();
      return created;
    },
    [hydrate, requireIdentity]
  );

  const updatePlannedTask = useCallback<UseSchedulerWorkspaceValue["updatePlannedTask"]>(
    async (taskId, data) => {
      const { userId: uid } = requireIdentity();
      const updated = await rpcUpdatePlannedTask({ taskId, userId: uid, data });
      await hydrate();
      return updated;
    },
    [hydrate, requireIdentity]
  );

  const deletePlannedTask = useCallback<UseSchedulerWorkspaceValue["deletePlannedTask"]>(
    async (taskId) => {
      requireIdentity();
      await rpcDeletePlannedTask(taskId);
      await hydrate();
    },
    [hydrate, requireIdentity]
  );

  const schedulePlannedTask = useCallback<UseSchedulerWorkspaceValue["schedulePlannedTask"]>(
    async (scheduleArgs) => {
      requireIdentity();
      const updated = await rpcSchedulePlannedTask(scheduleArgs);
      await hydrate();
      return updated;
    },
    [hydrate, requireIdentity]
  );

  return {
    ...snapshot,
    status,
    error,
    refresh: hydrate,
    createResource,
    updateResource,
    archiveResource,
    createCalendarEvent,
    updateCalendarEvent,
    deleteCalendarEvent,
    bookResource,
    cancelBooking,
    completeBooking,
    approveBooking,
    denyBooking,
    findBookingConflicts: rpcFindBookingConflicts,
    createPlannedTask,
    updatePlannedTask,
    deletePlannedTask,
    schedulePlannedTask,
  };
}
