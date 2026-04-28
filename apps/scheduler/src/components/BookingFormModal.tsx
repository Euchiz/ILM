import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Badge,
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
  BookingRecord,
  BookingType,
  BookResourceArgs,
  ProjectOption,
  ProtocolOption,
  ResourceRecord,
} from "../lib/cloudAdapter";
import {
  formatDateTime,
  isoToLocalInput,
  localInputToIso,
} from "../lib/datetime";

const BOOKING_TYPES: BookingType[] = [
  "experiment",
  "daily_use",
  "maintenance",
  "calibration",
  "training",
];

const titleCase = (value: string) =>
  value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : typeof err === "string" ? err : "Unexpected error";

interface FormState {
  resource_id: string;
  start: string;
  end: string;
  title: string;
  booking_type: BookingType;
  project_id: string;
  protocol_id: string;
  purpose: string;
  sample_count: string;
  notes: string;
}

const buildInitialState = (
  initialResourceId: string | null,
  initialStartIso: string | null | undefined,
  initialEndIso: string | null | undefined
): FormState => ({
  resource_id: initialResourceId ?? "",
  start: isoToLocalInput(initialStartIso ?? new Date().toISOString()),
  end: isoToLocalInput(
    initialEndIso ?? new Date(Date.now() + 60 * 60 * 1000).toISOString()
  ),
  title: "",
  booking_type: "experiment",
  project_id: "",
  protocol_id: "",
  purpose: "",
  sample_count: "",
  notes: "",
});

export interface BookingFormModalProps {
  open: boolean;
  onClose: () => void;
  onBook: (args: BookResourceArgs) => Promise<unknown>;
  onCheckConflicts: (args: {
    resourceId: string;
    startTime: string;
    endTime: string;
    excludeBookingId?: string | null;
  }) => Promise<BookingRecord[]>;
  resources: ResourceRecord[];
  projects: ProjectOption[];
  protocols: ProtocolOption[];
  initialResourceId?: string | null;
  initialStartIso?: string | null;
  initialEndIso?: string | null;
}

export const BookingFormModal = ({
  open,
  onClose,
  onBook,
  onCheckConflicts,
  resources,
  projects,
  protocols,
  initialResourceId,
  initialStartIso,
  initialEndIso,
}: BookingFormModalProps) => {
  const [state, setState] = useState<FormState>(() =>
    buildInitialState(initialResourceId ?? null, initialStartIso, initialEndIso)
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<BookingRecord[] | null>(null);

  useEffect(() => {
    if (open) {
      setState(buildInitialState(initialResourceId ?? null, initialStartIso, initialEndIso));
      setError(null);
      setConflicts(null);
    }
  }, [open, initialResourceId, initialStartIso, initialEndIso]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((prev) => ({ ...prev, [key]: value }));

  const activeResources = useMemo(
    () => resources.filter((r) => r.is_active),
    [resources]
  );

  const selectedResource = useMemo(
    () => activeResources.find((r) => r.id === state.resource_id) ?? null,
    [activeResources, state.resource_id]
  );

  const handleCheckConflicts = async () => {
    setError(null);
    setConflicts(null);
    if (!state.resource_id) {
      setError("Pick a resource first.");
      return;
    }
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
    setBusy(true);
    try {
      const overlapping = await onCheckConflicts({
        resourceId: state.resource_id,
        startTime: startIso,
        endTime: endIso,
      });
      setConflicts(overlapping);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError(null);

    const startIso = localInputToIso(state.start);
    const endIso = localInputToIso(state.end);
    if (!state.resource_id) {
      setError("Pick a resource.");
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

    const sampleCount = state.sample_count ? Number.parseInt(state.sample_count, 10) : null;
    if (state.sample_count && (sampleCount === null || Number.isNaN(sampleCount))) {
      setError("Sample count must be a number.");
      return;
    }

    setBusy(true);
    try {
      await onBook({
        resource_id: state.resource_id,
        start_time: startIso,
        end_time: endIso,
        title: state.title.trim() || null,
        booking_type: state.booking_type,
        project_id: state.project_id || null,
        protocol_id: state.protocol_id || null,
        purpose: state.purpose.trim() || null,
        sample_count: sampleCount,
        notes: state.notes.trim() || null,
      });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="New booking"
      width="wide"
      actions={
        <>
          <Button
            variant="ghost"
            onClick={() => void handleCheckConflicts()}
            disabled={busy || !state.resource_id}
          >
            Check conflicts
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="booking-form" disabled={busy}>
            Book
          </Button>
        </>
      }
    >
      <form id="booking-form" className="sch-form" onSubmit={handleSubmit}>
        {error ? <InlineError>{error}</InlineError> : null}
        <FormField label="Resource">
          <Select
            value={state.resource_id}
            onChange={(e) => {
              update("resource_id", e.target.value);
              setConflicts(null);
            }}
            required
          >
            <option value="" disabled>
              Pick a resource…
            </option>
            {activeResources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.availability_status !== "available" ? ` — ${r.availability_status}` : ""}
                {r.booking_mode === "soft_booking" ? " (soft)" : ""}
              </option>
            ))}
          </Select>
        </FormField>
        {selectedResource ? (
          <InlineNote>
            <Badge tone={selectedResource.booking_mode === "hard_booking" ? "info" : "neutral"}>
              {selectedResource.booking_mode === "hard_booking" ? "Hard booking" : "Soft / overlap allowed"}
            </Badge>{" "}
            {selectedResource.booking_policy === "approval_required"
              ? "Bookings require admin approval."
              : selectedResource.booking_policy === "admin_only"
              ? "Only admins can book this resource."
              : "Open booking — no approval required."}
            {(selectedResource.setup_buffer_minutes > 0 ||
              selectedResource.cleanup_buffer_minutes > 0) && (
              <>
                {" "}Buffers: {selectedResource.setup_buffer_minutes}m setup /{" "}
                {selectedResource.cleanup_buffer_minutes}m cleanup.
              </>
            )}
          </InlineNote>
        ) : null}
        <FormRow>
          <FormField label="Start">
            <Input
              type="datetime-local"
              value={state.start}
              onChange={(e) => {
                update("start", e.target.value);
                setConflicts(null);
              }}
              required
            />
          </FormField>
          <FormField label="End">
            <Input
              type="datetime-local"
              value={state.end}
              onChange={(e) => {
                update("end", e.target.value);
                setConflicts(null);
              }}
              required
            />
          </FormField>
        </FormRow>
        <FormRow>
          <FormField label="Title">
            <Input
              value={state.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="e.g. PCR-92 thermocycle"
            />
          </FormField>
          <FormField label="Booking type">
            <Select
              value={state.booking_type}
              onChange={(e) => update("booking_type", e.target.value as BookingType)}
            >
              {BOOKING_TYPES.map((t) => (
                <option key={t} value={t}>
                  {titleCase(t)}
                </option>
              ))}
            </Select>
          </FormField>
        </FormRow>
        <FormRow>
          <FormField label="Linked project">
            <Select
              value={state.project_id}
              onChange={(e) => update("project_id", e.target.value)}
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
              value={state.protocol_id}
              onChange={(e) => update("protocol_id", e.target.value)}
            >
              <option value="">None</option>
              {protocols.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Sample count">
            <Input
              type="number"
              min={0}
              value={state.sample_count}
              onChange={(e) => update("sample_count", e.target.value)}
              placeholder="—"
            />
          </FormField>
        </FormRow>
        <FormField label="Purpose">
          <Textarea
            value={state.purpose}
            onChange={(e) => update("purpose", e.target.value)}
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
        {conflicts !== null ? (
          <div className="sch-conflict-panel">
            {conflicts.length === 0 ? (
              <InlineNote>No conflicts found in the requested window.</InlineNote>
            ) : (
              <>
                <InlineError>
                  {conflicts.length} overlapping booking{conflicts.length === 1 ? "" : "s"} —
                  hard bookings will be blocked.
                </InlineError>
                <ul className="sch-conflict-list">
                  {conflicts.map((c) => (
                    <li key={c.id}>
                      <strong>{c.title ?? "(untitled booking)"}</strong>{" "}
                      <span>
                        {formatDateTime(c.start_time)} – {formatDateTime(c.end_time)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : null}
      </form>
    </Modal>
  );
};
