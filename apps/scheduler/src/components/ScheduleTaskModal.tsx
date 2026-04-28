import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Button,
  FormField,
  FormRow,
  InlineError,
  InlineNote,
  Input,
  Modal,
  Select,
  Textarea,
} from "@ilm/ui";
import type {
  EventType,
  PlannedTaskRecord,
  ProjectOption,
  ProtocolOption,
  ResourceRecord,
  SchedulePlannedTaskBookingArgs,
  SchedulePlannedTaskEventArgs,
} from "../lib/cloudAdapter";
import {
  isoToLocalInput,
  localInputToIso,
} from "../lib/datetime";

const EVENT_TYPES: EventType[] = [
  "meeting",
  "experiment",
  "reminder",
  "deadline",
  "maintenance",
  "general",
];

const titleCase = (value: string) =>
  value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : typeof err === "string" ? err : "Unexpected error";

type ScheduleMode = "event_only" | "booking_only" | "event_and_booking";

interface FormState {
  mode: ScheduleMode;
  start: string;
  end: string;
  event_type: EventType;
  location: string;
  resource_id: string;
  notes: string;
}

const buildState = (task: PlannedTaskRecord | null): FormState => {
  const fallbackStart = task?.preferred_start_date
    ? new Date(`${task.preferred_start_date}T09:00`).toISOString()
    : new Date().toISOString();
  const durationMs = (task?.estimated_duration_minutes ?? 60) * 60_000;
  const fallbackEnd = new Date(new Date(fallbackStart).getTime() + durationMs).toISOString();
  return {
    mode: task && task.required_resource_ids.length > 0 ? "event_and_booking" : "event_only",
    start: isoToLocalInput(fallbackStart),
    end: isoToLocalInput(fallbackEnd),
    event_type: "experiment",
    location: "",
    resource_id: task?.required_resource_ids[0] ?? "",
    notes: "",
  };
};

export interface ScheduleTaskModalProps {
  open: boolean;
  onClose: () => void;
  task: PlannedTaskRecord | null;
  resources: ResourceRecord[];
  projects: ProjectOption[];
  protocols: ProtocolOption[];
  onSchedule: (args: {
    taskId: string;
    event?: SchedulePlannedTaskEventArgs | null;
    booking?: SchedulePlannedTaskBookingArgs | null;
  }) => Promise<unknown>;
}

export const ScheduleTaskModal = ({
  open,
  onClose,
  task,
  resources,
  projects,
  protocols,
  onSchedule,
}: ScheduleTaskModalProps) => {
  const [state, setState] = useState<FormState>(() => buildState(task));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setState(buildState(task));
      setError(null);
    }
  }, [open, task]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((prev) => ({ ...prev, [key]: value }));

  const projectName = useMemo(
    () => (task?.project_id ? projects.find((p) => p.id === task.project_id)?.name : null),
    [projects, task?.project_id]
  );

  const protocolName = useMemo(
    () => (task?.protocol_id ? protocols.find((p) => p.id === task.protocol_id)?.name : null),
    [protocols, task?.protocol_id]
  );

  const activeResources = resources.filter((r) => r.is_active);

  const needsBooking = state.mode !== "event_only";
  const needsEvent = state.mode !== "booking_only";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !task) return;
    setError(null);
    const startIso = localInputToIso(state.start);
    const endIso = localInputToIso(state.end);
    if (!startIso || !endIso) {
      setError("Start and end times are required.");
      return;
    }
    if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
      setError("End time must be after start time.");
      return;
    }
    if (needsBooking && !state.resource_id) {
      setError("Pick a resource for the booking.");
      return;
    }

    setBusy(true);
    try {
      await onSchedule({
        taskId: task.id,
        event: needsEvent
          ? {
              title: task.title,
              description: task.description,
              event_type: state.event_type,
              start_time: startIso,
              end_time: endIso,
              location: state.location.trim() || null,
              project_id: task.project_id,
              protocol_id: task.protocol_id,
              notes: state.notes.trim() || null,
            }
          : null,
        booking: needsBooking
          ? {
              resource_id: state.resource_id,
              start_time: startIso,
              end_time: endIso,
              title: task.title,
              booking_type: "experiment",
              project_id: task.project_id,
              protocol_id: task.protocol_id,
              planned_task_id: task.id,
              purpose: task.description ?? null,
              notes: state.notes.trim() || null,
            }
          : null,
      });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!task) return null;

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={`Schedule “${task.title}”`}
      width="wide"
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="schedule-task-form" disabled={busy}>
            Schedule
          </Button>
        </>
      }
    >
      <form id="schedule-task-form" className="sch-form" onSubmit={handleSubmit}>
        {error ? <InlineError>{error}</InlineError> : null}
        {(projectName || protocolName) && (
          <InlineNote>
            {projectName ? <>Project: <strong>{projectName}</strong>. </> : null}
            {protocolName ? <>Protocol: <strong>{protocolName}</strong>.</> : null}
          </InlineNote>
        )}
        <FormField label="Schedule as">
          <Select
            value={state.mode}
            onChange={(e) => update("mode", e.target.value as ScheduleMode)}
          >
            <option value="event_only">Calendar event only</option>
            <option value="booking_only">Equipment booking only</option>
            <option value="event_and_booking">Both — event linked to booking</option>
          </Select>
        </FormField>
        <FormRow>
          <FormField label="Start">
            <Input
              type="datetime-local"
              value={state.start}
              onChange={(e) => update("start", e.target.value)}
              required
            />
          </FormField>
          <FormField label="End">
            <Input
              type="datetime-local"
              value={state.end}
              onChange={(e) => update("end", e.target.value)}
              required
            />
          </FormField>
        </FormRow>
        {needsEvent ? (
          <FormRow>
            <FormField label="Event type">
              <Select
                value={state.event_type}
                onChange={(e) => update("event_type", e.target.value as EventType)}
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {titleCase(t)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Location">
              <Input
                value={state.location}
                onChange={(e) => update("location", e.target.value)}
                placeholder="Optional"
              />
            </FormField>
          </FormRow>
        ) : null}
        {needsBooking ? (
          <FormField label="Resource">
            <Select
              value={state.resource_id}
              onChange={(e) => update("resource_id", e.target.value)}
              required
            >
              <option value="" disabled>
                Pick a resource…
              </option>
              {activeResources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} {r.booking_mode === "soft_booking" ? "(soft)" : ""}
                </option>
              ))}
            </Select>
          </FormField>
        ) : null}
        <FormField label="Notes">
          <Textarea
            value={state.notes}
            onChange={(e) => update("notes", e.target.value)}
            rows={2}
          />
        </FormField>
      </form>
    </Modal>
  );
};
