import { getSupabaseClient } from "@ilm/utils";

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type ResourceCategory =
  | "sequencer"
  | "microscope"
  | "thermocycler"
  | "centrifuge"
  | "incubator"
  | "qpcr"
  | "imaging"
  | "general"
  | "other";

export type ResourceAvailabilityStatus =
  | "available"
  | "offline"
  | "maintenance"
  | "restricted";

export type BookingMode = "hard_booking" | "soft_booking";

export type BookingPolicy = "open" | "approval_required" | "admin_only";

export type EventType =
  | "meeting"
  | "experiment"
  | "reminder"
  | "deadline"
  | "maintenance"
  | "general";

export type EventVisibility = "private" | "project" | "lab" | "equipment_visible";

export type EventStatus = "scheduled" | "cancelled" | "completed";

export type BookingType =
  | "experiment"
  | "daily_use"
  | "maintenance"
  | "calibration"
  | "training";

export type BookingStatus =
  | "draft"
  | "requested"
  | "approved"
  | "denied"
  | "active"
  | "completed"
  | "cancelled"
  | "no_show";

export type PlannedTaskPriority = "low" | "normal" | "high" | "urgent";

export type PlannedTaskStatus =
  | "planned"
  | "ready_to_schedule"
  | "scheduled"
  | "completed"
  | "cancelled";

export interface ResourceRecord {
  id: string;
  lab_id: string;
  name: string;
  description: string | null;
  category: ResourceCategory;
  location: string | null;
  availability_status: ResourceAvailabilityStatus;
  booking_mode: BookingMode;
  booking_policy: BookingPolicy;
  minimum_booking_duration_minutes: number | null;
  maximum_booking_duration_minutes: number | null;
  setup_buffer_minutes: number;
  cleanup_buffer_minutes: number;
  required_training: boolean;
  responsible_person_id: string | null;
  linked_protocol_id: string | null;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CalendarEventRecord {
  id: string;
  lab_id: string;
  title: string;
  description: string | null;
  event_type: EventType;
  start_time: string;
  end_time: string;
  location: string | null;
  linked_project_id: string | null;
  linked_protocol_id: string | null;
  linked_task_id: string | null;
  organizer_user_id: string | null;
  participant_user_ids: string[];
  visibility: EventVisibility;
  recurrence_rule: string | null;
  recurrence_exceptions: string[];
  status: EventStatus;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingRecord {
  id: string;
  resource_id: string;
  lab_id: string;
  calendar_event_id: string | null;
  user_id: string | null;
  project_id: string | null;
  protocol_id: string | null;
  planned_task_id: string | null;
  title: string | null;
  start_time: string;
  end_time: string;
  setup_buffer_minutes: number;
  cleanup_buffer_minutes: number;
  booking_type: BookingType;
  status: BookingStatus;
  approval_user_id: string | null;
  purpose: string | null;
  sample_count: number | null;
  notes: string | null;
  actual_start_time: string | null;
  actual_end_time: string | null;
  usage_record: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlannedTaskRecord {
  id: string;
  lab_id: string;
  title: string;
  description: string | null;
  project_id: string | null;
  protocol_id: string | null;
  experiment_id: string | null;
  assigned_user_id: string | null;
  estimated_duration_minutes: number | null;
  required_resource_ids: string[];
  preferred_start_date: string | null;
  preferred_end_date: string | null;
  priority: PlannedTaskPriority;
  status: PlannedTaskStatus;
  generated_from_protocol_step_id: string | null;
  scheduled_event_id: string | null;
  scheduled_booking_id: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectOption {
  id: string;
  name: string;
}

export interface ProtocolOption {
  id: string;
  name: string;
}

export interface SchedulerWorkspaceSnapshot {
  resources: ResourceRecord[];
  events: CalendarEventRecord[];
  bookings: BookingRecord[];
  plannedTasks: PlannedTaskRecord[];
  projects: ProjectOption[];
  protocols: ProtocolOption[];
}

const client = () => getSupabaseClient();

const RESOURCE_FIELDS =
  "id, lab_id, name, description, category, location, availability_status, booking_mode, booking_policy, minimum_booking_duration_minutes, maximum_booking_duration_minutes, setup_buffer_minutes, cleanup_buffer_minutes, required_training, responsible_person_id, linked_protocol_id, notes, is_active, created_by, updated_by, created_at, updated_at";

const EVENT_FIELDS =
  "id, lab_id, title, description, event_type, start_time, end_time, location, linked_project_id, linked_protocol_id, linked_task_id, organizer_user_id, participant_user_ids, visibility, recurrence_rule, recurrence_exceptions, status, notes, created_by, updated_by, created_at, updated_at";

const BOOKING_FIELDS =
  "id, resource_id, lab_id, calendar_event_id, user_id, project_id, protocol_id, planned_task_id, title, start_time, end_time, setup_buffer_minutes, cleanup_buffer_minutes, booking_type, status, approval_user_id, purpose, sample_count, notes, actual_start_time, actual_end_time, usage_record, created_at, updated_at";

const PLANNED_TASK_FIELDS =
  "id, lab_id, title, description, project_id, protocol_id, experiment_id, assigned_user_id, estimated_duration_minutes, required_resource_ids, preferred_start_date, preferred_end_date, priority, status, generated_from_protocol_step_id, scheduled_event_id, scheduled_booking_id, notes, created_by, updated_by, created_at, updated_at";

// ---------------------------------------------------------------------------
// Hydration
// ---------------------------------------------------------------------------

export async function listSchedulerWorkspace(
  labId: string
): Promise<SchedulerWorkspaceSnapshot> {
  const [
    resourcesResult,
    eventsResult,
    bookingsResult,
    tasksResult,
    projectsResult,
    protocolsResult,
  ] = await Promise.all([
    client()
      .from("resources")
      .select(RESOURCE_FIELDS)
      .eq("lab_id", labId)
      .order("name", { ascending: true }),
    client()
      .from("calendar_events")
      .select(EVENT_FIELDS)
      .eq("lab_id", labId)
      .order("start_time", { ascending: true }),
    client()
      .from("bookings")
      .select(BOOKING_FIELDS)
      .eq("lab_id", labId)
      .order("start_time", { ascending: true }),
    client()
      .from("planned_tasks")
      .select(PLANNED_TASK_FIELDS)
      .eq("lab_id", labId)
      .order("created_at", { ascending: false }),
    client().from("projects").select("id, name").eq("lab_id", labId).order("name"),
    // PostgREST alias `name:title` returns the protocols.title column under
    // the key `name` so ProtocolOption keeps a single shape across modules.
    client().from("protocols").select("id, name:title").eq("lab_id", labId).order("title"),
  ]);

  if (resourcesResult.error) throw resourcesResult.error;
  if (eventsResult.error) throw eventsResult.error;
  if (bookingsResult.error) throw bookingsResult.error;
  if (tasksResult.error) throw tasksResult.error;
  if (projectsResult.error) throw projectsResult.error;
  if (protocolsResult.error) throw protocolsResult.error;

  return {
    resources: (resourcesResult.data as ResourceRecord[]) ?? [],
    events: (eventsResult.data as CalendarEventRecord[]) ?? [],
    bookings: (bookingsResult.data as BookingRecord[]) ?? [],
    plannedTasks: (tasksResult.data as PlannedTaskRecord[]) ?? [],
    projects: (projectsResult.data as ProjectOption[]) ?? [],
    protocols: (protocolsResult.data as ProtocolOption[]) ?? [],
  };
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

export interface ResourceInput {
  name: string;
  description?: string | null;
  category?: ResourceCategory;
  location?: string | null;
  availability_status?: ResourceAvailabilityStatus;
  booking_mode?: BookingMode;
  booking_policy?: BookingPolicy;
  minimum_booking_duration_minutes?: number | null;
  maximum_booking_duration_minutes?: number | null;
  setup_buffer_minutes?: number;
  cleanup_buffer_minutes?: number;
  required_training?: boolean;
  responsible_person_id?: string | null;
  linked_protocol_id?: string | null;
  notes?: string | null;
}

export async function createResource(args: {
  labId: string;
  userId: string;
  data: ResourceInput;
}): Promise<ResourceRecord> {
  const { data, error } = await client()
    .from("resources")
    .insert({
      lab_id: args.labId,
      created_by: args.userId,
      updated_by: args.userId,
      ...args.data,
    })
    .select(RESOURCE_FIELDS)
    .single();
  if (error) throw error;
  return data as ResourceRecord;
}

export async function updateResource(args: {
  resourceId: string;
  userId: string;
  data: Partial<ResourceInput> & { is_active?: boolean };
}): Promise<ResourceRecord> {
  const { data, error } = await client()
    .from("resources")
    .update({ ...args.data, updated_by: args.userId })
    .eq("id", args.resourceId)
    .select(RESOURCE_FIELDS)
    .single();
  if (error) throw error;
  return data as ResourceRecord;
}

export async function archiveResource(resourceId: string, userId: string) {
  return updateResource({ resourceId, userId, data: { is_active: false } });
}

// ---------------------------------------------------------------------------
// Calendar events
// ---------------------------------------------------------------------------

export interface CalendarEventInput {
  title: string;
  description?: string | null;
  event_type?: EventType;
  start_time: string;
  end_time: string;
  location?: string | null;
  linked_project_id?: string | null;
  linked_protocol_id?: string | null;
  linked_task_id?: string | null;
  participant_user_ids?: string[];
  visibility?: EventVisibility;
  recurrence_rule?: string | null;
  recurrence_exceptions?: string[];
  notes?: string | null;
}

export async function createCalendarEvent(args: {
  labId: string;
  userId: string;
  data: CalendarEventInput;
}): Promise<CalendarEventRecord> {
  const { data, error } = await client()
    .from("calendar_events")
    .insert({
      lab_id: args.labId,
      organizer_user_id: args.userId,
      created_by: args.userId,
      updated_by: args.userId,
      ...args.data,
    })
    .select(EVENT_FIELDS)
    .single();
  if (error) throw error;
  return data as CalendarEventRecord;
}

export async function updateCalendarEvent(args: {
  eventId: string;
  userId: string;
  data: Partial<CalendarEventInput> & { status?: EventStatus };
}): Promise<CalendarEventRecord> {
  const { data, error } = await client()
    .from("calendar_events")
    .update({ ...args.data, updated_by: args.userId })
    .eq("id", args.eventId)
    .select(EVENT_FIELDS)
    .single();
  if (error) throw error;
  return data as CalendarEventRecord;
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const { error } = await client().from("calendar_events").delete().eq("id", eventId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Bookings (server-side conflict-checked via RPC)
// ---------------------------------------------------------------------------

export interface BookResourceArgs {
  resource_id: string;
  start_time: string;
  end_time: string;
  title?: string | null;
  booking_type?: BookingType;
  project_id?: string | null;
  protocol_id?: string | null;
  planned_task_id?: string | null;
  calendar_event_id?: string | null;
  purpose?: string | null;
  sample_count?: number | null;
  notes?: string | null;
}

export async function bookResource(args: BookResourceArgs): Promise<BookingRecord> {
  const { data, error } = await client().rpc("book_resource", {
    p_resource_id: args.resource_id,
    p_start_time: args.start_time,
    p_end_time: args.end_time,
    p_title: args.title ?? null,
    p_booking_type: args.booking_type ?? "experiment",
    p_project_id: args.project_id ?? null,
    p_protocol_id: args.protocol_id ?? null,
    p_planned_task_id: args.planned_task_id ?? null,
    p_calendar_event_id: args.calendar_event_id ?? null,
    p_purpose: args.purpose ?? null,
    p_sample_count: args.sample_count ?? null,
    p_notes: args.notes ?? null,
  });
  if (error) throw error;
  return data as BookingRecord;
}

export async function cancelBooking(bookingId: string, note?: string | null) {
  const { data, error } = await client().rpc("cancel_booking", {
    p_booking_id: bookingId,
    p_note: note ?? null,
  });
  if (error) throw error;
  return data as BookingRecord;
}

export async function completeBooking(args: {
  bookingId: string;
  usageRecord?: string | null;
  actualStartTime?: string | null;
  actualEndTime?: string | null;
}) {
  const { data, error } = await client().rpc("complete_booking", {
    p_booking_id: args.bookingId,
    p_usage_record: args.usageRecord ?? null,
    p_actual_start_time: args.actualStartTime ?? null,
    p_actual_end_time: args.actualEndTime ?? null,
  });
  if (error) throw error;
  return data as BookingRecord;
}

export async function approveBooking(bookingId: string, note?: string | null) {
  const { data, error } = await client().rpc("approve_booking", {
    p_booking_id: bookingId,
    p_note: note ?? null,
  });
  if (error) throw error;
  return data as BookingRecord;
}

export async function denyBooking(bookingId: string, note: string) {
  const { data, error } = await client().rpc("deny_booking", {
    p_booking_id: bookingId,
    p_note: note,
  });
  if (error) throw error;
  return data as BookingRecord;
}

export async function findBookingConflicts(args: {
  resourceId: string;
  startTime: string;
  endTime: string;
  excludeBookingId?: string | null;
}): Promise<BookingRecord[]> {
  const { data, error } = await client().rpc("find_booking_conflicts", {
    p_resource_id: args.resourceId,
    p_start_time: args.startTime,
    p_end_time: args.endTime,
    p_exclude_booking_id: args.excludeBookingId ?? null,
  });
  if (error) throw error;
  return (data as BookingRecord[]) ?? [];
}

// ---------------------------------------------------------------------------
// Planned tasks
// ---------------------------------------------------------------------------

export interface PlannedTaskInput {
  title: string;
  description?: string | null;
  project_id?: string | null;
  protocol_id?: string | null;
  experiment_id?: string | null;
  assigned_user_id?: string | null;
  estimated_duration_minutes?: number | null;
  required_resource_ids?: string[];
  preferred_start_date?: string | null;
  preferred_end_date?: string | null;
  priority?: PlannedTaskPriority;
  status?: PlannedTaskStatus;
  notes?: string | null;
}

export async function createPlannedTask(args: {
  labId: string;
  userId: string;
  data: PlannedTaskInput;
}): Promise<PlannedTaskRecord> {
  const { data, error } = await client()
    .from("planned_tasks")
    .insert({
      lab_id: args.labId,
      created_by: args.userId,
      updated_by: args.userId,
      ...args.data,
    })
    .select(PLANNED_TASK_FIELDS)
    .single();
  if (error) throw error;
  return data as PlannedTaskRecord;
}

export async function updatePlannedTask(args: {
  taskId: string;
  userId: string;
  data: Partial<PlannedTaskInput>;
}): Promise<PlannedTaskRecord> {
  const { data, error } = await client()
    .from("planned_tasks")
    .update({ ...args.data, updated_by: args.userId })
    .eq("id", args.taskId)
    .select(PLANNED_TASK_FIELDS)
    .single();
  if (error) throw error;
  return data as PlannedTaskRecord;
}

export async function deletePlannedTask(taskId: string): Promise<void> {
  const { error } = await client().from("planned_tasks").delete().eq("id", taskId);
  if (error) throw error;
}

export interface SchedulePlannedTaskEventArgs {
  title?: string;
  description?: string | null;
  event_type?: EventType;
  start_time: string;
  end_time: string;
  location?: string | null;
  project_id?: string | null;
  protocol_id?: string | null;
  notes?: string | null;
}

export interface SchedulePlannedTaskBookingArgs extends BookResourceArgs {}

export async function schedulePlannedTask(args: {
  taskId: string;
  event?: SchedulePlannedTaskEventArgs | null;
  booking?: SchedulePlannedTaskBookingArgs | null;
}): Promise<PlannedTaskRecord> {
  const { data, error } = await client().rpc("schedule_planned_task", {
    p_task_id: args.taskId,
    p_event_args: args.event ?? null,
    p_booking_args: args.booking ?? null,
  });
  if (error) throw error;
  return data as PlannedTaskRecord;
}
