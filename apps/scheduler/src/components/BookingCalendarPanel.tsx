import { useEffect, useMemo, useState } from "react";
import {
  Button,
  EmptyState,
  FormField,
  FormRow,
  Panel,
  SectionHeader,
  Select,
} from "@ilm/ui";
import type { BookingRecord, ResourceRecord } from "../lib/cloudAdapter";
import {
  HOUR_MS,
  addDays,
  formatTime,
  formatWeekLabel,
  isToday,
  startOfDay,
  startOfWeek,
} from "../lib/datetime";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const VISIBLE_HOURS = Array.from({ length: 13 }, (_, i) => i + 7); // 07:00 – 19:00

const minutesSinceMidnight = (d: Date) => d.getHours() * 60 + d.getMinutes();

const INACTIVE_STATUSES = new Set<BookingRecord["status"]>([
  "completed",
  "cancelled",
  "no_show",
  "denied",
]);

const HIDDEN_STATUSES = new Set<BookingRecord["status"]>(["draft"]);

interface PositionedBooking {
  booking: BookingRecord;
  start: Date;
  end: Date;
  day: number;
  top: number;
  height: number;
}

export interface BookingCalendarPanelProps {
  bookings: BookingRecord[];
  resources: ResourceRecord[];
}

export const BookingCalendarPanel = ({ bookings, resources }: BookingCalendarPanelProps) => {
  const activeResources = useMemo(
    () => resources.filter((r) => r.is_active),
    [resources]
  );

  const [selectedId, setSelectedId] = useState<string>("");
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));

  // Default to the first active resource once data arrives.
  useEffect(() => {
    if (!selectedId && activeResources.length > 0) {
      setSelectedId(activeResources[0].id);
    }
  }, [activeResources, selectedId]);

  const weekStartDay = useMemo(() => startOfDay(weekStart), [weekStart]);
  const weekEndDay = useMemo(() => addDays(weekStartDay, 7), [weekStartDay]);

  const selectedResource = useMemo(
    () => activeResources.find((r) => r.id === selectedId) ?? null,
    [activeResources, selectedId]
  );

  const positioned = useMemo<PositionedBooking[]>(() => {
    if (!selectedId) return [];
    const out: PositionedBooking[] = [];
    for (const booking of bookings) {
      if (booking.resource_id !== selectedId) continue;
      if (HIDDEN_STATUSES.has(booking.status)) continue;
      const start = new Date(booking.start_time);
      const end = new Date(booking.end_time);
      if (
        end.getTime() <= weekStartDay.getTime() ||
        start.getTime() >= weekEndDay.getTime()
      ) {
        continue;
      }
      const day = Math.floor(
        (startOfDay(start).getTime() - weekStartDay.getTime()) / (HOUR_MS * 24)
      );
      if (day < 0 || day > 6) continue;
      const startMin = Math.max(VISIBLE_HOURS[0] * 60, minutesSinceMidnight(start));
      const endMin = Math.min(
        (VISIBLE_HOURS[VISIBLE_HOURS.length - 1] + 1) * 60,
        minutesSinceMidnight(end)
      );
      if (endMin <= startMin) continue;
      const top = (startMin - VISIBLE_HOURS[0] * 60) / 60;
      const height = Math.max(0.75, (endMin - startMin) / 60);
      out.push({ booking, start, end, day, top, height });
    }
    return out.sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [bookings, selectedId, weekStartDay, weekEndDay]);

  const bookingsByDay = useMemo(() => {
    const buckets: PositionedBooking[][] = Array.from({ length: 7 }, () => []);
    for (const item of positioned) buckets[item.day].push(item);
    return buckets;
  }, [positioned]);

  return (
    <Panel className="sch-calendar-panel">
      <SectionHeader
        title={selectedResource ? `${selectedResource.name} schedule` : "Resource schedule"}
        meta={`${formatWeekLabel(weekStartDay)} • ${positioned.length} booking${positioned.length === 1 ? "" : "s"}`}
        actions={
          <div className="sch-cal-toolbar">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setWeekStart(addDays(weekStartDay, -7))}
            >
              ◀ Prev
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setWeekStart(startOfWeek(new Date()))}
            >
              Today
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setWeekStart(addDays(weekStartDay, 7))}
            >
              Next ▶
            </Button>
          </div>
        }
      />
      <FormRow className="sch-filter-row">
        <FormField label="Resource">
          <Select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={activeResources.length === 0}
          >
            {activeResources.length === 0 ? (
              <option value="">No active resources</option>
            ) : (
              activeResources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} {r.booking_mode === "soft_booking" ? "(soft)" : ""}
                </option>
              ))
            )}
          </Select>
        </FormField>
      </FormRow>
      {!selectedResource ? (
        <EmptyState
          title="No active resources"
          description="Add a resource to start visualizing its schedule."
        />
      ) : (
        <div
          className="sch-cal-grid"
          style={{ ["--sch-cal-rows" as string]: VISIBLE_HOURS.length }}
        >
          <div className="sch-cal-grid-corner" />
          {DAY_LABELS.map((label, idx) => {
            const day = addDays(weekStartDay, idx);
            return (
              <div
                key={label}
                className={[
                  "sch-cal-day-head",
                  isToday(day) ? "is-today" : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className="sch-cal-day-label">{label}</span>
                <span className="sch-cal-day-num">{day.getDate()}</span>
              </div>
            );
          })}
          <div className="sch-cal-hour-col">
            {VISIBLE_HOURS.map((hour) => (
              <div key={hour} className="sch-cal-hour-cell">
                <span>{hour.toString().padStart(2, "0")}:00</span>
              </div>
            ))}
          </div>
          {Array.from({ length: 7 }, (_, dayIdx) => (
            <div key={dayIdx} className="sch-cal-day-col">
              {VISIBLE_HOURS.map((hour) => (
                <div key={hour} className="sch-cal-slot" />
              ))}
              {bookingsByDay[dayIdx].map((entry, entryIdx) => {
                const isInactive = INACTIVE_STATUSES.has(entry.booking.status);
                const labelTitle =
                  entry.booking.title ??
                  entry.booking.booking_type.replace(/_/g, " ");
                return (
                  <div
                    key={`${entry.booking.id}-${entryIdx}`}
                    className={[
                      "sch-cal-event",
                      `sch-cal-booking--${entry.booking.status}`,
                      isInactive ? "is-inactive" : null,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{
                      top: `calc(${entry.top} * var(--sch-cal-row))`,
                      height: `calc(${entry.height} * var(--sch-cal-row))`,
                    }}
                    title={`${labelTitle} • ${entry.booking.status} • ${formatTime(entry.start)} – ${formatTime(entry.end)}`}
                  >
                    <span className="sch-cal-event-card">
                      <span className="sch-cal-event-title">{labelTitle}</span>
                      <span className="sch-cal-event-meta">
                        {formatTime(entry.start)} – {formatTime(entry.end)}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
};
