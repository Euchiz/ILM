import { useMemo } from "react";
import { Badge, Button, EmptyState, Panel, SectionHeader } from "@ilm/ui";
import type { CalendarEventRecord } from "../lib/cloudAdapter";
import {
  HOUR_MS,
  addDays,
  expandRecurrence,
  formatTime,
  formatWeekLabel,
  isToday,
  startOfDay,
  startOfWeek,
} from "../lib/datetime";

const EVENT_TYPE_TONES: Record<
  CalendarEventRecord["event_type"],
  "neutral" | "info" | "success" | "warning" | "danger"
> = {
  meeting: "info",
  experiment: "success",
  reminder: "neutral",
  deadline: "danger",
  maintenance: "warning",
  general: "neutral",
};

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const VISIBLE_HOURS = Array.from({ length: 13 }, (_, i) => i + 7); // 07:00 – 19:00

interface CalendarViewProps {
  events: CalendarEventRecord[];
  weekStart: Date;
  onChangeWeek: (next: Date) => void;
  onCreateEvent: (rangeStartIso?: string, rangeEndIso?: string) => void;
  onSelectEvent: (event: CalendarEventRecord) => void;
}

interface PositionedEvent {
  event: CalendarEventRecord;
  /** Concrete start (after recurrence expansion). */
  start: Date;
  end: Date;
  /** Day column index 0..6 (Mon..Sun). */
  day: number;
  /** Top offset in `--sch-cal-row` units. */
  top: number;
  /** Height in `--sch-cal-row` units (min 0.75). */
  height: number;
}

const minutesSinceMidnight = (d: Date) => d.getHours() * 60 + d.getMinutes();

export const CalendarView = ({
  events,
  weekStart,
  onChangeWeek,
  onCreateEvent,
  onSelectEvent,
}: CalendarViewProps) => {
  const weekStartDay = useMemo(() => startOfDay(weekStart), [weekStart]);
  const weekEndDay = useMemo(() => addDays(weekStartDay, 7), [weekStartDay]);

  const positioned = useMemo<PositionedEvent[]>(() => {
    const out: PositionedEvent[] = [];
    for (const event of events) {
      if (event.status === "cancelled") continue;
      const instances = expandRecurrence({
        rule: event.recurrence_rule,
        baseStartIso: event.start_time,
        baseEndIso: event.end_time,
        windowStart: weekStartDay,
        windowEnd: weekEndDay,
        exceptions: event.recurrence_exceptions,
      });
      for (const inst of instances) {
        const start = new Date(inst.start);
        const end = new Date(inst.end);
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
        const top = (startMin - VISIBLE_HOURS[0] * 60) / 60; // hours from grid top
        const height = Math.max(0.75, (endMin - startMin) / 60);
        out.push({ event, start, end, day, top, height });
      }
    }
    return out.sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [events, weekStartDay, weekEndDay]);

  const eventsByDay = useMemo(() => {
    const buckets: PositionedEvent[][] = Array.from({ length: 7 }, () => []);
    for (const item of positioned) {
      buckets[item.day].push(item);
    }
    return buckets;
  }, [positioned]);

  return (
    <Panel className="sch-calendar-panel">
      <SectionHeader
        title={formatWeekLabel(weekStartDay)}
        meta={`${positioned.length} event${positioned.length === 1 ? "" : "s"}`}
        actions={
          <div className="sch-cal-toolbar">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onChangeWeek(addDays(weekStartDay, -7))}
            >
              ◀ Prev
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onChangeWeek(startOfWeek(new Date()))}
            >
              Today
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onChangeWeek(addDays(weekStartDay, 7))}
            >
              Next ▶
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => onCreateEvent()}
            >
              + New event
            </Button>
          </div>
        }
      />
      {events.length === 0 ? (
        <EmptyState
          title="No events yet"
          description="Create the lab's first event to populate the calendar."
          action={
            <Button variant="primary" onClick={() => onCreateEvent()}>
              + New event
            </Button>
          }
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
                <span>
                  {hour.toString().padStart(2, "0")}:00
                </span>
              </div>
            ))}
          </div>
          {Array.from({ length: 7 }, (_, dayIdx) => (
            <div key={dayIdx} className="sch-cal-day-col">
              {VISIBLE_HOURS.map((hour) => (
                <div key={hour} className="sch-cal-slot" />
              ))}
              {eventsByDay[dayIdx].map((entry, entryIdx) => (
                <button
                  key={`${entry.event.id}-${entryIdx}`}
                  type="button"
                  className={[
                    "sch-cal-event",
                    `sch-cal-event--${entry.event.event_type}`,
                  ].join(" ")}
                  style={{
                    top: `calc(${entry.top} * var(--sch-cal-row))`,
                    height: `calc(${entry.height} * var(--sch-cal-row))`,
                  }}
                  onClick={() => onSelectEvent(entry.event)}
                  aria-label={`${entry.event.title} at ${formatTime(entry.start)}`}
                >
                  <span className="sch-cal-event-title">{entry.event.title}</span>
                  <span className="sch-cal-event-meta">
                    {formatTime(entry.start)} – {formatTime(entry.end)}
                  </span>
                  <Badge tone={EVENT_TYPE_TONES[entry.event.event_type]}>
                    {entry.event.event_type}
                  </Badge>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
};
