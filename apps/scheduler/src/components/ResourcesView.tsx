import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  EmptyState,
  FormField,
  FormRow,
  Input,
  InlineNote,
  Panel,
  SectionHeader,
  Select,
  StatusPill,
  Table,
  TableEmpty,
  type StatusTone,
} from "@ilm/ui";
import type {
  BookingMode,
  BookingRecord,
  ResourceAvailabilityStatus,
  ResourceCategory,
  ResourceRecord,
} from "../lib/cloudAdapter";
import { formatDateTime } from "../lib/datetime";

const STATUS_TONES: Record<ResourceAvailabilityStatus, StatusTone> = {
  available: "active",
  offline: "deleted",
  maintenance: "blocked",
  restricted: "submitted",
};

const titleCase = (value: string) =>
  value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export interface ResourcesViewProps {
  resources: ResourceRecord[];
  bookings: BookingRecord[];
  isAdmin: boolean;
  onNewResource: () => void;
  onEditResource: (resource: ResourceRecord) => void;
}

export const ResourcesView = ({
  resources,
  bookings,
  isAdmin,
  onNewResource,
  onEditResource,
}: ResourcesViewProps) => {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ResourceCategory | "all">("all");
  const [statusFilter, setStatusFilter] = useState<ResourceAvailabilityStatus | "all">("all");
  const [modeFilter, setModeFilter] = useState<BookingMode | "all">("all");
  const [showArchived, setShowArchived] = useState(false);

  const upcomingByResource = useMemo(() => {
    const now = Date.now();
    const map = new Map<string, BookingRecord[]>();
    for (const b of bookings) {
      if (b.status === "cancelled" || b.status === "denied") continue;
      if (new Date(b.end_time).getTime() < now - 24 * 3_600_000) continue;
      const arr = map.get(b.resource_id) ?? [];
      arr.push(b);
      map.set(b.resource_id, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    }
    return map;
  }, [bookings]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return resources.filter((r) => {
      if (!showArchived && !r.is_active) return false;
      if (categoryFilter !== "all" && r.category !== categoryFilter) return false;
      if (statusFilter !== "all" && r.availability_status !== statusFilter) return false;
      if (modeFilter !== "all" && r.booking_mode !== modeFilter) return false;
      if (query && !r.name.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [resources, search, categoryFilter, statusFilter, modeFilter, showArchived]);

  const categories: ResourceCategory[] = [
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

  return (
    <Panel>
      <SectionHeader
        title="Resources"
        meta={`${filtered.length} of ${resources.length}`}
        actions={
          isAdmin ? (
            <Button variant="primary" size="sm" onClick={onNewResource}>
              + New resource
            </Button>
          ) : null
        }
      />
      {!isAdmin ? (
        <InlineNote>Read-only — only lab admins can add or edit resources.</InlineNote>
      ) : null}
      <FormRow className="sch-filter-row">
        <FormField label="Search">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Resource name…"
          />
        </FormField>
        <FormField label="Category">
          <Select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as ResourceCategory | "all")}
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {titleCase(c)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Availability">
          <Select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as ResourceAvailabilityStatus | "all")
            }
          >
            <option value="all">Any availability</option>
            {(Object.keys(STATUS_TONES) as ResourceAvailabilityStatus[]).map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Booking mode">
          <Select
            value={modeFilter}
            onChange={(e) => setModeFilter(e.target.value as BookingMode | "all")}
          >
            <option value="all">Any mode</option>
            <option value="hard_booking">Hard booking</option>
            <option value="soft_booking">Soft booking</option>
          </Select>
        </FormField>
        <FormField label="Show archived">
          <label className="sch-toggle">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            <span>{showArchived ? "Including archived" : "Active only"}</span>
          </label>
        </FormField>
      </FormRow>
      {resources.length === 0 ? (
        <EmptyState
          title="No resources yet"
          description={
            isAdmin
              ? "Add the lab's first piece of equipment to start receiving bookings."
              : "Ask a lab admin to add equipment."
          }
          action={
            isAdmin ? (
              <Button variant="primary" onClick={onNewResource}>
                + New resource
              </Button>
            ) : null
          }
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Location</th>
              <th>Mode</th>
              <th>Availability</th>
              <th>Buffers</th>
              <th>Upcoming bookings</th>
              {isAdmin ? <th>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <TableEmpty colSpan={isAdmin ? 8 : 7}>
                No resources match the filters.
              </TableEmpty>
            ) : (
              filtered.map((r) => {
                const upcoming = upcomingByResource.get(r.id) ?? [];
                return (
                  <tr key={r.id}>
                    <td>
                      <div className="sch-cell-title">
                        {r.name}
                        {!r.is_active ? (
                          <Badge tone="neutral" className="sch-archived-pill">
                            archived
                          </Badge>
                        ) : null}
                      </div>
                      {r.description ? (
                        <div className="sch-cell-meta">{r.description}</div>
                      ) : null}
                    </td>
                    <td>{titleCase(r.category)}</td>
                    <td>{r.location ?? "—"}</td>
                    <td>
                      <Badge tone={r.booking_mode === "hard_booking" ? "info" : "neutral"}>
                        {r.booking_mode === "hard_booking" ? "hard" : "soft"}
                      </Badge>
                      <div className="sch-cell-meta">{titleCase(r.booking_policy)}</div>
                    </td>
                    <td>
                      <StatusPill status={STATUS_TONES[r.availability_status]}>
                        {titleCase(r.availability_status)}
                      </StatusPill>
                    </td>
                    <td>
                      {r.setup_buffer_minutes}m / {r.cleanup_buffer_minutes}m
                    </td>
                    <td>
                      {upcoming.length === 0 ? (
                        <span className="sch-muted">—</span>
                      ) : (
                        <ul className="sch-upcoming-list">
                          {upcoming.slice(0, 3).map((b) => (
                            <li key={b.id}>
                              <strong>{b.title ?? titleCase(b.booking_type)}</strong>{" "}
                              <span className="sch-cell-meta">
                                {formatDateTime(b.start_time)}
                              </span>
                            </li>
                          ))}
                          {upcoming.length > 3 ? (
                            <li className="sch-muted">+{upcoming.length - 3} more</li>
                          ) : null}
                        </ul>
                      )}
                    </td>
                    {isAdmin ? (
                      <td>
                        <Button size="sm" variant="ghost" onClick={() => onEditResource(r)}>
                          Edit
                        </Button>
                      </td>
                    ) : null}
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
