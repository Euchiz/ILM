import { useEffect, useState, type FormEvent } from "react";
import {
  Button,
  ConfirmDialog,
  FormField,
  FormRow,
  InlineError,
  Input,
  Modal,
  Select,
  Textarea,
} from "@ilm/ui";
import type {
  CalendarEventInput,
  CalendarEventRecord,
  EventStatus,
  EventType,
  EventVisibility,
  ProjectOption,
  ProtocolOption,
} from "../lib/cloudAdapter";
import {
  RECURRENCE_OPTIONS,
  freqToRule,
  isoToLocalInput,
  localInputToIso,
  ruleToFreq,
  type RecurrenceFreq,
} from "../lib/datetime";

const EVENT_TYPES: EventType[] = [
  "meeting",
  "experiment",
  "reminder",
  "deadline",
  "maintenance",
  "general",
];

const VISIBILITIES: EventVisibility[] = ["private", "project", "lab", "equipment_visible"];

const EVENT_STATUSES: EventStatus[] = ["scheduled", "completed", "cancelled"];

const titleCase = (value: string) =>
  value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export interface EventFormModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (data: CalendarEventInput) => Promise<unknown>;
  onUpdate: (
    eventId: string,
    data: Partial<CalendarEventInput> & { status?: EventStatus }
  ) => Promise<unknown>;
  onDelete?: (eventId: string) => Promise<unknown>;
  initial: CalendarEventRecord | null;
  initialStartIso?: string | null;
  initialEndIso?: string | null;
  projects: ProjectOption[];
  protocols: ProtocolOption[];
}

interface FormState {
  title: string;
  description: string;
  event_type: EventType;
  start: string;
  end: string;
  location: string;
  linked_project_id: string;
  linked_protocol_id: string;
  visibility: EventVisibility;
  recurrence: RecurrenceFreq;
  status: EventStatus;
  notes: string;
}

const buildInitialState = (
  initial: CalendarEventRecord | null,
  fallbackStart: string | null | undefined,
  fallbackEnd: string | null | undefined
): FormState => {
  if (initial) {
    return {
      title: initial.title,
      description: initial.description ?? "",
      event_type: initial.event_type,
      start: isoToLocalInput(initial.start_time),
      end: isoToLocalInput(initial.end_time),
      location: initial.location ?? "",
      linked_project_id: initial.linked_project_id ?? "",
      linked_protocol_id: initial.linked_protocol_id ?? "",
      visibility: initial.visibility,
      recurrence: ruleToFreq(initial.recurrence_rule),
      status: initial.status,
      notes: initial.notes ?? "",
    };
  }
  return {
    title: "",
    description: "",
    event_type: "meeting",
    start: isoToLocalInput(fallbackStart ?? new Date().toISOString()),
    end: isoToLocalInput(fallbackEnd ?? new Date(Date.now() + 60 * 60 * 1000).toISOString()),
    location: "",
    linked_project_id: "",
    linked_protocol_id: "",
    visibility: "lab",
    recurrence: "none",
    status: "scheduled",
    notes: "",
  };
};

const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : typeof err === "string" ? err : "Unexpected error";

export const EventFormModal = ({
  open,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  initial,
  initialStartIso,
  initialEndIso,
  projects,
  protocols,
}: EventFormModalProps) => {
  const [state, setState] = useState<FormState>(() =>
    buildInitialState(initial, initialStartIso, initialEndIso)
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setState(buildInitialState(initial, initialStartIso, initialEndIso));
      setError(null);
      setConfirmDelete(false);
    }
  }, [open, initial, initialStartIso, initialEndIso]);

  const isEdit = initial !== null;

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError(null);

    const startIso = localInputToIso(state.start);
    const endIso = localInputToIso(state.end);
    if (!state.title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!startIso || !endIso) {
      setError("Start and end times are required.");
      return;
    }
    if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
      setError("End time must be after start time.");
      return;
    }

    setBusy(true);
    try {
      const payload: CalendarEventInput = {
        title: state.title.trim(),
        description: state.description.trim() || null,
        event_type: state.event_type,
        start_time: startIso,
        end_time: endIso,
        location: state.location.trim() || null,
        linked_project_id: state.linked_project_id || null,
        linked_protocol_id: state.linked_protocol_id || null,
        visibility: state.visibility,
        recurrence_rule: freqToRule(state.recurrence),
        notes: state.notes.trim() || null,
      };

      if (isEdit && initial) {
        await onUpdate(initial.id, { ...payload, status: state.status });
      } else {
        await onCreate(payload);
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!isEdit || !initial || !onDelete) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete(initial.id);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={isEdit ? "Edit event" : "New event"}
      width="wide"
      actions={
        <>
          {isEdit && onDelete ? (
            <Button
              variant="danger"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
            >
              Delete
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="event-form"
            disabled={busy}
          >
            {isEdit ? "Save changes" : "Create event"}
          </Button>
        </>
      }
    >
      <form id="event-form" className="sch-form" onSubmit={handleSubmit}>
        {error ? <InlineError>{error}</InlineError> : null}
        <FormField label="Title">
          <Input
            value={state.title}
            onChange={(e) => update("title", e.target.value)}
            placeholder="Lab meeting"
            required
          />
        </FormField>
        <FormRow>
          <FormField label="Type">
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
          <FormField label="Visibility">
            <Select
              value={state.visibility}
              onChange={(e) => update("visibility", e.target.value as EventVisibility)}
            >
              {VISIBILITIES.map((v) => (
                <option key={v} value={v}>
                  {titleCase(v)}
                </option>
              ))}
            </Select>
          </FormField>
          {isEdit ? (
            <FormField label="Status">
              <Select
                value={state.status}
                onChange={(e) => update("status", e.target.value as EventStatus)}
              >
                {EVENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {titleCase(s)}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : null}
        </FormRow>
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
        <FormRow>
          <FormField label="Location">
            <Input
              value={state.location}
              onChange={(e) => update("location", e.target.value)}
              placeholder="Conference room B"
            />
          </FormField>
          <FormField label="Repeats">
            <Select
              value={state.recurrence}
              onChange={(e) => update("recurrence", e.target.value as RecurrenceFreq)}
            >
              {RECURRENCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </FormField>
        </FormRow>
        <FormRow>
          <FormField label="Linked project">
            <Select
              value={state.linked_project_id}
              onChange={(e) => update("linked_project_id", e.target.value)}
            >
              <option value="">None</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Linked protocol">
            <Select
              value={state.linked_protocol_id}
              onChange={(e) => update("linked_protocol_id", e.target.value)}
            >
              <option value="">None</option>
              {protocols.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </FormField>
        </FormRow>
        <FormField label="Description">
          <Textarea
            value={state.description}
            onChange={(e) => update("description", e.target.value)}
            rows={2}
          />
        </FormField>
        <FormField label="Notes">
          <Textarea
            value={state.notes}
            onChange={(e) => update("notes", e.target.value)}
            rows={2}
          />
        </FormField>
      </form>
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Delete this event?"
        description="The event will be removed for everyone in the lab. This cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        busy={busy}
      />
    </Modal>
  );
};
