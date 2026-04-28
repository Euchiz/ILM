import { useEffect, useState, type FormEvent } from "react";
import {
  Button,
  CheckboxField,
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
  BookingMode,
  BookingPolicy,
  ProtocolOption,
  ResourceAvailabilityStatus,
  ResourceCategory,
  ResourceInput,
  ResourceRecord,
} from "../lib/cloudAdapter";

const CATEGORIES: ResourceCategory[] = [
  "sequencer",
  "microscope",
  "thermocycler",
  "centrifuge",
  "incubator",
  "qpcr",
  "imaging",
  "general",
  "other",
];

const AVAILABILITY: ResourceAvailabilityStatus[] = [
  "available",
  "offline",
  "maintenance",
  "restricted",
];

const BOOKING_MODES: BookingMode[] = ["hard_booking", "soft_booking"];

const BOOKING_POLICIES: BookingPolicy[] = ["open", "approval_required", "admin_only"];

const titleCase = (value: string) =>
  value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : typeof err === "string" ? err : "Unexpected error";

interface FormState {
  name: string;
  description: string;
  category: ResourceCategory;
  location: string;
  availability_status: ResourceAvailabilityStatus;
  booking_mode: BookingMode;
  booking_policy: BookingPolicy;
  setup_buffer_minutes: string;
  cleanup_buffer_minutes: string;
  minimum_booking_duration_minutes: string;
  maximum_booking_duration_minutes: string;
  required_training: boolean;
  linked_protocol_id: string;
  notes: string;
  is_active: boolean;
}

const buildState = (initial: ResourceRecord | null): FormState => {
  if (initial) {
    return {
      name: initial.name,
      description: initial.description ?? "",
      category: initial.category,
      location: initial.location ?? "",
      availability_status: initial.availability_status,
      booking_mode: initial.booking_mode,
      booking_policy: initial.booking_policy,
      setup_buffer_minutes: String(initial.setup_buffer_minutes ?? 0),
      cleanup_buffer_minutes: String(initial.cleanup_buffer_minutes ?? 0),
      minimum_booking_duration_minutes: initial.minimum_booking_duration_minutes
        ? String(initial.minimum_booking_duration_minutes)
        : "",
      maximum_booking_duration_minutes: initial.maximum_booking_duration_minutes
        ? String(initial.maximum_booking_duration_minutes)
        : "",
      required_training: initial.required_training,
      linked_protocol_id: initial.linked_protocol_id ?? "",
      notes: initial.notes ?? "",
      is_active: initial.is_active,
    };
  }
  return {
    name: "",
    description: "",
    category: "general",
    location: "",
    availability_status: "available",
    booking_mode: "hard_booking",
    booking_policy: "open",
    setup_buffer_minutes: "0",
    cleanup_buffer_minutes: "0",
    minimum_booking_duration_minutes: "",
    maximum_booking_duration_minutes: "",
    required_training: false,
    linked_protocol_id: "",
    notes: "",
    is_active: true,
  };
};

const parseOptionalInt = (value: string): number | null => {
  if (!value) return null;
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
};

export interface ResourceFormModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (data: ResourceInput) => Promise<unknown>;
  onUpdate: (
    resourceId: string,
    data: Partial<ResourceInput> & { is_active?: boolean }
  ) => Promise<unknown>;
  onArchive?: (resourceId: string) => Promise<unknown>;
  initial: ResourceRecord | null;
  protocols: ProtocolOption[];
}

export const ResourceFormModal = ({
  open,
  onClose,
  onCreate,
  onUpdate,
  onArchive,
  initial,
  protocols,
}: ResourceFormModalProps) => {
  const [state, setState] = useState<FormState>(() => buildState(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);

  useEffect(() => {
    if (open) {
      setState(buildState(initial));
      setError(null);
      setConfirmArchive(false);
    }
  }, [open, initial]);

  const isEdit = initial !== null;

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (!state.name.trim()) {
      setError("Name is required.");
      return;
    }
    setBusy(true);
    try {
      const payload: ResourceInput = {
        name: state.name.trim(),
        description: state.description.trim() || null,
        category: state.category,
        location: state.location.trim() || null,
        availability_status: state.availability_status,
        booking_mode: state.booking_mode,
        booking_policy: state.booking_policy,
        setup_buffer_minutes: parseOptionalInt(state.setup_buffer_minutes) ?? 0,
        cleanup_buffer_minutes: parseOptionalInt(state.cleanup_buffer_minutes) ?? 0,
        minimum_booking_duration_minutes: parseOptionalInt(state.minimum_booking_duration_minutes),
        maximum_booking_duration_minutes: parseOptionalInt(state.maximum_booking_duration_minutes),
        required_training: state.required_training,
        linked_protocol_id: state.linked_protocol_id || null,
        notes: state.notes.trim() || null,
      };
      if (isEdit && initial) {
        await onUpdate(initial.id, { ...payload, is_active: state.is_active });
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

  const handleArchive = async () => {
    if (!isEdit || !initial || !onArchive) return;
    setBusy(true);
    setError(null);
    try {
      await onArchive(initial.id);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setConfirmArchive(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={isEdit ? "Edit resource" : "New resource"}
      width="wide"
      actions={
        <>
          {isEdit && onArchive && initial?.is_active ? (
            <Button
              variant="danger"
              onClick={() => setConfirmArchive(true)}
              disabled={busy}
            >
              Archive
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="resource-form" disabled={busy}>
            {isEdit ? "Save changes" : "Create resource"}
          </Button>
        </>
      }
    >
      <form id="resource-form" className="sch-form" onSubmit={handleSubmit}>
        {error ? <InlineError>{error}</InlineError> : null}
        <FormRow>
          <FormField label="Name">
            <Input
              value={state.name}
              onChange={(e) => update("name", e.target.value)}
              required
            />
          </FormField>
          <FormField label="Category">
            <Select
              value={state.category}
              onChange={(e) => update("category", e.target.value as ResourceCategory)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {titleCase(c)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Location">
            <Input
              value={state.location}
              onChange={(e) => update("location", e.target.value)}
              placeholder="Bench C / Cold room"
            />
          </FormField>
        </FormRow>
        <FormRow>
          <FormField label="Availability">
            <Select
              value={state.availability_status}
              onChange={(e) =>
                update("availability_status", e.target.value as ResourceAvailabilityStatus)
              }
            >
              {AVAILABILITY.map((s) => (
                <option key={s} value={s}>
                  {titleCase(s)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Booking mode">
            <Select
              value={state.booking_mode}
              onChange={(e) => update("booking_mode", e.target.value as BookingMode)}
            >
              {BOOKING_MODES.map((m) => (
                <option key={m} value={m}>
                  {m === "hard_booking" ? "Hard booking (exclusive)" : "Soft booking (overlap allowed)"}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Booking policy">
            <Select
              value={state.booking_policy}
              onChange={(e) => update("booking_policy", e.target.value as BookingPolicy)}
            >
              {BOOKING_POLICIES.map((p) => (
                <option key={p} value={p}>
                  {titleCase(p)}
                </option>
              ))}
            </Select>
          </FormField>
        </FormRow>
        <FormRow>
          <FormField label="Setup buffer (min)">
            <Input
              type="number"
              min={0}
              value={state.setup_buffer_minutes}
              onChange={(e) => update("setup_buffer_minutes", e.target.value)}
            />
          </FormField>
          <FormField label="Cleanup buffer (min)">
            <Input
              type="number"
              min={0}
              value={state.cleanup_buffer_minutes}
              onChange={(e) => update("cleanup_buffer_minutes", e.target.value)}
            />
          </FormField>
          <FormField label="Min duration (min)">
            <Input
              type="number"
              min={0}
              value={state.minimum_booking_duration_minutes}
              onChange={(e) => update("minimum_booking_duration_minutes", e.target.value)}
              placeholder="—"
            />
          </FormField>
          <FormField label="Max duration (min)">
            <Input
              type="number"
              min={0}
              value={state.maximum_booking_duration_minutes}
              onChange={(e) => update("maximum_booking_duration_minutes", e.target.value)}
              placeholder="—"
            />
          </FormField>
        </FormRow>
        <FormRow>
          <FormField label="Linked protocol / SOP">
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
          <FormField label="Active">
            <CheckboxField
              label="Resource is active"
              checked={state.is_active}
              onChange={(e) => update("is_active", e.target.checked)}
            />
          </FormField>
          <FormField label="Training required">
            <CheckboxField
              label="Users must be trained"
              checked={state.required_training}
              onChange={(e) => update("required_training", e.target.checked)}
            />
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
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        onConfirm={handleArchive}
        title="Archive this resource?"
        description="The resource will be hidden from booking lists by default. Existing bookings stay intact."
        confirmLabel="Archive"
        tone="danger"
        busy={busy}
      />
    </Modal>
  );
};
