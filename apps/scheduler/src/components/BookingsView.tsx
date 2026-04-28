import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  EmptyState,
  FormField,
  FormRow,
  Input,
  InlineError,
  Panel,
  SectionHeader,
  Select,
  StatusPill,
  Table,
  TableEmpty,
  type StatusTone,
} from "@ilm/ui";
import type {
  BookingRecord,
  BookingStatus,
  ProjectOption,
  ResourceRecord,
} from "../lib/cloudAdapter";
import { formatDateTime, formatDuration } from "../lib/datetime";

const STATUS_TONES: Record<BookingStatus, StatusTone> = {
  draft: "draft",
  requested: "submitted",
  approved: "active",
  denied: "rejected",
  active: "active",
  completed: "validated",
  cancelled: "cancelled",
  no_show: "blocked",
};

const FILTER_STATUSES: Array<BookingStatus | "all"> = [
  "all",
  "requested",
  "approved",
  "active",
  "completed",
  "cancelled",
  "no_show",
];

const titleCase = (value: string) =>
  value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : typeof err === "string" ? err : "Unexpected error";

export interface BookingsViewProps {
  bookings: BookingRecord[];
  resources: ResourceRecord[];
  projects: ProjectOption[];
  currentUserId: string | null;
  isAdmin: boolean;
  onNewBooking: () => void;
  onCancel: (bookingId: string) => Promise<unknown>;
  onComplete: (bookingId: string, usageRecord: string | null) => Promise<unknown>;
  onApprove: (bookingId: string) => Promise<unknown>;
  onDeny: (bookingId: string, note: string) => Promise<unknown>;
}

export const BookingsView = ({
  bookings,
  resources,
  projects,
  currentUserId,
  isAdmin,
  onNewBooking,
  onCancel,
  onComplete,
  onApprove,
  onDeny,
}: BookingsViewProps) => {
  const [resourceFilter, setResourceFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<BookingStatus | "all">("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingBookingId, setPendingBookingId] = useState<string | null>(null);

  const resourcesById = useMemo(
    () => new Map(resources.map((r) => [r.id, r])),
    [resources]
  );
  const projectsById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects]
  );

  const filteredBookings = useMemo(() => {
    const fromMs = fromDate ? new Date(fromDate).getTime() : null;
    const toMs = toDate ? new Date(toDate).getTime() + 86_400_000 : null;
    return bookings.filter((b) => {
      if (resourceFilter !== "all" && b.resource_id !== resourceFilter) return false;
      if (projectFilter !== "all" && b.project_id !== projectFilter) return false;
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (mineOnly && b.user_id !== currentUserId) return false;
      const startMs = new Date(b.start_time).getTime();
      if (fromMs !== null && startMs < fromMs) return false;
      if (toMs !== null && startMs >= toMs) return false;
      return true;
    });
  }, [
    bookings,
    resourceFilter,
    projectFilter,
    statusFilter,
    mineOnly,
    fromDate,
    toDate,
    currentUserId,
  ]);

  const wrap = async (id: string, op: () => Promise<unknown>) => {
    setActionError(null);
    setPendingBookingId(id);
    try {
      await op();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setPendingBookingId(null);
    }
  };

  const handleComplete = (booking: BookingRecord) => {
    const note = window.prompt("Usage notes (optional):", booking.usage_record ?? "");
    if (note === null) return;
    void wrap(booking.id, () => onComplete(booking.id, note.trim() || null));
  };

  const handleDeny = (booking: BookingRecord) => {
    const note = window.prompt("Reason for denial (required):", "");
    if (note === null) return;
    if (!note.trim()) {
      setActionError("A denial note is required.");
      return;
    }
    void wrap(booking.id, () => onDeny(booking.id, note.trim()));
  };

  const renderActions = (booking: BookingRecord) => {
    const mine = booking.user_id === currentUserId;
    const canEdit = isAdmin || mine;
    const isBusy = pendingBookingId === booking.id;
    const buttons: JSX.Element[] = [];
    if (booking.status === "requested" && isAdmin) {
      buttons.push(
        <Button
          key="approve"
          size="sm"
          variant="primary"
          onClick={() => void wrap(booking.id, () => onApprove(booking.id))}
          disabled={isBusy}
        >
          Approve
        </Button>
      );
      buttons.push(
        <Button
          key="deny"
          size="sm"
          variant="danger"
          onClick={() => handleDeny(booking)}
          disabled={isBusy}
        >
          Deny
        </Button>
      );
    }
    if (
      canEdit &&
      ["approved", "active", "requested"].includes(booking.status)
    ) {
      buttons.push(
        <Button
          key="complete"
          size="sm"
          variant="secondary"
          onClick={() => handleComplete(booking)}
          disabled={isBusy}
        >
          Complete
        </Button>
      );
    }
    if (
      canEdit &&
      !["completed", "cancelled", "no_show", "denied"].includes(booking.status)
    ) {
      buttons.push(
        <Button
          key="cancel"
          size="sm"
          variant="ghost"
          onClick={() => void wrap(booking.id, () => onCancel(booking.id))}
          disabled={isBusy}
        >
          Cancel
        </Button>
      );
    }
    return buttons.length === 0 ? <span className="sch-muted">—</span> : (
      <div className="sch-actions-row">{buttons}</div>
    );
  };

  return (
    <Panel>
      <SectionHeader
        title="Bookings"
        meta={`${filteredBookings.length} of ${bookings.length}`}
        actions={
          <Button variant="primary" size="sm" onClick={onNewBooking}>
            + New booking
          </Button>
        }
      />
      <FormRow className="sch-filter-row">
        <FormField label="Resource">
          <Select
            value={resourceFilter}
            onChange={(e) => setResourceFilter(e.target.value)}
          >
            <option value="all">All resources</option>
            {resources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Project">
          <Select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          >
            <option value="all">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Status">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as BookingStatus | "all")}
          >
            {FILTER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "Any status" : titleCase(s)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="From">
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </FormField>
        <FormField label="To">
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </FormField>
        <FormField label="Mine only">
          <label className="sch-toggle">
            <input
              type="checkbox"
              checked={mineOnly}
              onChange={(e) => setMineOnly(e.target.checked)}
            />
            <span>{mineOnly ? "On" : "Off"}</span>
          </label>
        </FormField>
      </FormRow>
      {actionError ? <InlineError>{actionError}</InlineError> : null}
      {bookings.length === 0 ? (
        <EmptyState
          title="No bookings yet"
          description="Reserve a resource to start tracking lab equipment usage."
          action={
            <Button variant="primary" onClick={onNewBooking}>
              + New booking
            </Button>
          }
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Resource</th>
              <th>Title</th>
              <th>When</th>
              <th>Duration</th>
              <th>Project</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredBookings.length === 0 ? (
              <TableEmpty colSpan={7}>No bookings match the filters.</TableEmpty>
            ) : (
              filteredBookings.map((b) => {
                const resource = resourcesById.get(b.resource_id);
                const project = b.project_id ? projectsById.get(b.project_id) : null;
                return (
                  <tr key={b.id}>
                    <td>
                      <div className="sch-cell-title">{resource?.name ?? "(deleted)"}</div>
                      {resource ? (
                        <Badge tone={resource.booking_mode === "hard_booking" ? "info" : "neutral"}>
                          {resource.booking_mode === "hard_booking" ? "hard" : "soft"}
                        </Badge>
                      ) : null}
                    </td>
                    <td>
                      <div className="sch-cell-title">{b.title ?? "—"}</div>
                      <div className="sch-cell-meta">{titleCase(b.booking_type)}</div>
                    </td>
                    <td>{formatDateTime(b.start_time)}</td>
                    <td>{formatDuration(b.start_time, b.end_time)}</td>
                    <td>{project?.name ?? "—"}</td>
                    <td>
                      <StatusPill status={STATUS_TONES[b.status]}>
                        {titleCase(b.status)}
                      </StatusPill>
                    </td>
                    <td>{renderActions(b)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
      )}
    </Panel>
  );
};
