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
  PlannedTaskInput,
  PlannedTaskPriority,
  PlannedTaskRecord,
  PlannedTaskStatus,
  ProjectOption,
  ProtocolOption,
  ResourceRecord,
} from "../lib/cloudAdapter";
import { isoToDateInput } from "../lib/datetime";

const PRIORITIES: PlannedTaskPriority[] = ["low", "normal", "high", "urgent"];
const STATUSES: PlannedTaskStatus[] = ["planned", "ready_to_schedule", "completed", "cancelled"];

const titleCase = (value: string) =>
  value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : typeof err === "string" ? err : "Unexpected error";

interface FormState {
  title: string;
  description: string;
  project_id: string;
  protocol_id: string;
  estimated_duration_minutes: string;
  preferred_start_date: string;
  preferred_end_date: string;
  priority: PlannedTaskPriority;
  status: PlannedTaskStatus;
  required_resource_ids: string[];
  notes: string;
}

const buildState = (initial: PlannedTaskRecord | null): FormState => {
  if (initial) {
    return {
      title: initial.title,
      description: initial.description ?? "",
      project_id: initial.project_id ?? "",
      protocol_id: initial.protocol_id ?? "",
      estimated_duration_minutes: initial.estimated_duration_minutes
        ? String(initial.estimated_duration_minutes)
        : "",
      preferred_start_date: isoToDateInput(initial.preferred_start_date),
      preferred_end_date: isoToDateInput(initial.preferred_end_date),
      priority: initial.priority,
      status: initial.status,
      required_resource_ids: initial.required_resource_ids,
      notes: initial.notes ?? "",
    };
  }
  return {
    title: "",
    description: "",
    project_id: "",
    protocol_id: "",
    estimated_duration_minutes: "",
    preferred_start_date: "",
    preferred_end_date: "",
    priority: "normal",
    status: "planned",
    required_resource_ids: [],
    notes: "",
  };
};

export interface PlannedTaskFormModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (data: PlannedTaskInput) => Promise<unknown>;
  onUpdate: (taskId: string, data: Partial<PlannedTaskInput>) => Promise<unknown>;
  onDelete?: (taskId: string) => Promise<unknown>;
  initial: PlannedTaskRecord | null;
  projects: ProjectOption[];
  protocols: ProtocolOption[];
  resources: ResourceRecord[];
}

export const PlannedTaskFormModal = ({
  open,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  initial,
  projects,
  protocols,
  resources,
}: PlannedTaskFormModalProps) => {
  const [state, setState] = useState<FormState>(() => buildState(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setState(buildState(initial));
      setError(null);
      setConfirmDelete(false);
    }
  }, [open, initial]);

  const isEdit = initial !== null;

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((prev) => ({ ...prev, [key]: value }));

  const toggleResource = (id: string) => {
    update(
      "required_resource_ids",
      state.required_resource_ids.includes(id)
        ? state.required_resource_ids.filter((rid) => rid !== id)
        : [...state.required_resource_ids, id]
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (!state.title.trim()) {
      setError("Title is required.");
      return;
    }
    const duration = state.estimated_duration_minutes
      ? Number.parseInt(state.estimated_duration_minutes, 10)
      : null;
    if (state.estimated_duration_minutes && (duration === null || Number.isNaN(duration))) {
      setError("Estimated duration must be a number of minutes.");
      return;
    }

    setBusy(true);
    try {
      const payload: PlannedTaskInput = {
        title: state.title.trim(),
        description: state.description.trim() || null,
        project_id: state.project_id || null,
        protocol_id: state.protocol_id || null,
        estimated_duration_minutes: duration,
        required_resource_ids: state.required_resource_ids,
        preferred_start_date: state.preferred_start_date || null,
        preferred_end_date: state.preferred_end_date || null,
        priority: state.priority,
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
      title={isEdit ? "Edit task" : "New planned task"}
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
          <Button variant="primary" type="submit" form="task-form" disabled={busy}>
            {isEdit ? "Save changes" : "Create task"}
          </Button>
        </>
      }
    >
      <form id="task-form" className="sch-form" onSubmit={handleSubmit}>
        {error ? <InlineError>{error}</InlineError> : null}
        <FormField label="Title">
          <Input
            value={state.title}
            onChange={(e) => update("title", e.target.value)}
            required
          />
        </FormField>
        <FormRow>
          <FormField label="Priority">
            <Select
              value={state.priority}
              onChange={(e) => update("priority", e.target.value as PlannedTaskPriority)}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {titleCase(p)}
                </option>
              ))}
            </Select>
          </FormField>
          {isEdit ? (
            <FormField label="Status">
              <Select
                value={state.status}
                onChange={(e) => update("status", e.target.value as PlannedTaskStatus)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {titleCase(s)}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : null}
          <FormField label="Estimated duration (min)">
            <Input
              type="number"
              min={0}
              value={state.estimated_duration_minutes}
              onChange={(e) => update("estimated_duration_minutes", e.target.value)}
            />
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
        </FormRow>
        <FormRow>
          <FormField label="Preferred start">
            <Input
              type="date"
              value={state.preferred_start_date}
              onChange={(e) => update("preferred_start_date", e.target.value)}
            />
          </FormField>
          <FormField label="Preferred end">
            <Input
              type="date"
              value={state.preferred_end_date}
              onChange={(e) => update("preferred_end_date", e.target.value)}
            />
          </FormField>
        </FormRow>
        <FormField label="Required resources">
          <div className="sch-resource-checkbox-grid">
            {resources.length === 0 ? (
              <span className="sch-muted">No resources defined yet.</span>
            ) : (
              resources.map((r) => (
                <label key={r.id} className="sch-resource-checkbox">
                  <input
                    type="checkbox"
                    checked={state.required_resource_ids.includes(r.id)}
                    onChange={() => toggleResource(r.id)}
                  />
                  <span>{r.name}</span>
                </label>
              ))
            )}
          </div>
        </FormField>
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
        title="Delete this task?"
        description="The task will be permanently removed."
        confirmLabel="Delete"
        tone="danger"
        busy={busy}
      />
    </Modal>
  );
};
