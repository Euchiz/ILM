// Local-timezone helpers used by every Scheduler view. We keep them dumb on
// purpose — the Calendar grid renders one week, so a small set of pure
// functions plus a tiny recurrence expander is enough.

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

export const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);

export const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

export const addMonths = (date: Date, months: number) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
};

/** Monday-anchored start of week (consistent across views). */
export const startOfWeek = (date: Date) => {
  const day = startOfDay(date);
  const dow = day.getDay(); // 0 = Sunday
  const diff = (dow + 6) % 7; // Mon = 0
  return addDays(day, -diff);
};

export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export const isToday = (date: Date) => sameDay(date, new Date());

const pad = (n: number) => String(n).padStart(2, "0");

/** Convert an ISO timestamp to the local "YYYY-MM-DDTHH:mm" form expected
 *  by `<input type="datetime-local">`. Returns "" on a falsy input. */
export const isoToLocalInput = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Convert the value of `<input type="datetime-local">` back to an ISO string
 *  (uses local timezone). Returns null when the value is empty / invalid. */
export const localInputToIso = (value: string): string | null => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
};

/** Convert an ISO `date` (YYYY-MM-DD) to the value expected by `<input type="date">`. */
export const isoToDateInput = (iso: string | null | undefined): string => {
  if (!iso) return "";
  return iso.slice(0, 10);
};

export const formatDate = (value: string | Date | null | undefined) => {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
};

export const formatDateTime = (value: string | Date | null | undefined) => {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
};

export const formatTime = (value: string | Date | null | undefined) => {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
};

export const formatDuration = (
  startIso: string | null | undefined,
  endIso: string | null | undefined
): string => {
  if (!startIso || !endIso) return "—";
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (Number.isNaN(ms) || ms <= 0) return "—";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`;
};

export const formatWeekLabel = (start: Date) => {
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const monthFmt: Intl.DateTimeFormatOptions = { month: "short" };
  const dayFmt: Intl.DateTimeFormatOptions = { day: "numeric" };
  const yearFmt: Intl.DateTimeFormatOptions = { year: "numeric" };
  const startMonth = new Intl.DateTimeFormat(undefined, monthFmt).format(start);
  const endMonth = new Intl.DateTimeFormat(undefined, monthFmt).format(end);
  const startDay = new Intl.DateTimeFormat(undefined, dayFmt).format(start);
  const endDay = new Intl.DateTimeFormat(undefined, dayFmt).format(end);
  const year = new Intl.DateTimeFormat(undefined, yearFmt).format(start);
  return sameMonth
    ? `${startMonth} ${startDay} – ${endDay}, ${year}`
    : `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${year}`;
};

// ---------------------------------------------------------------------------
// Recurrence — minimal v1
// ---------------------------------------------------------------------------
//
// We store a flat string in `calendar_events.recurrence_rule`. v1 only
// supports plain frequency presets so the UI stays simple:
//
//   "FREQ=DAILY"       → repeat every day
//   "FREQ=WEEKLY"      → repeat every 7 days
//   "FREQ=BIWEEKLY"    → repeat every 14 days
//   "FREQ=MONTHLY"     → repeat every calendar month
//
// expandRecurrence yields concrete start/end pairs intersecting the visible
// window, skipping any timestamp present in the `exceptions` array.
//
// For an MVP the calendar only renders one week at a time, so this expander
// stops after a handful of iterations.

export type RecurrenceFreq = "none" | "daily" | "weekly" | "biweekly" | "monthly";

export const RECURRENCE_OPTIONS: Array<{ value: RecurrenceFreq; label: string; rule: string | null }> = [
  { value: "none", label: "Does not repeat", rule: null },
  { value: "daily", label: "Daily", rule: "FREQ=DAILY" },
  { value: "weekly", label: "Weekly", rule: "FREQ=WEEKLY" },
  { value: "biweekly", label: "Every two weeks", rule: "FREQ=BIWEEKLY" },
  { value: "monthly", label: "Monthly", rule: "FREQ=MONTHLY" },
];

export const ruleToFreq = (rule: string | null | undefined): RecurrenceFreq => {
  if (!rule) return "none";
  const upper = rule.toUpperCase();
  if (upper.includes("BIWEEKLY")) return "biweekly";
  if (upper.includes("DAILY")) return "daily";
  if (upper.includes("WEEKLY")) return "weekly";
  if (upper.includes("MONTHLY")) return "monthly";
  return "none";
};

export const freqToRule = (freq: RecurrenceFreq): string | null => {
  return RECURRENCE_OPTIONS.find((o) => o.value === freq)?.rule ?? null;
};

export interface RecurrenceInstance {
  /** ISO start time of the instance. */
  start: string;
  /** ISO end time of the instance. */
  end: string;
}

const advance = (date: Date, freq: RecurrenceFreq): Date => {
  switch (freq) {
    case "daily":
      return addDays(date, 1);
    case "weekly":
      return addDays(date, 7);
    case "biweekly":
      return addDays(date, 14);
    case "monthly":
      return addMonths(date, 1);
    default:
      return date;
  }
};

export function expandRecurrence(args: {
  rule: string | null | undefined;
  baseStartIso: string;
  baseEndIso: string;
  windowStart: Date;
  windowEnd: Date;
  exceptions?: string[];
  /** Safety cap so we never iterate forever on a malformed rule. */
  maxInstances?: number;
}): RecurrenceInstance[] {
  const freq = ruleToFreq(args.rule);
  const baseStart = new Date(args.baseStartIso);
  const baseEnd = new Date(args.baseEndIso);
  const span = baseEnd.getTime() - baseStart.getTime();
  if (Number.isNaN(span) || span <= 0) {
    return [];
  }
  const exceptions = new Set(
    (args.exceptions ?? []).map((iso) => new Date(iso).getTime())
  );
  const out: RecurrenceInstance[] = [];

  if (freq === "none") {
    if (
      baseEnd.getTime() > args.windowStart.getTime() &&
      baseStart.getTime() < args.windowEnd.getTime()
    ) {
      out.push({ start: baseStart.toISOString(), end: baseEnd.toISOString() });
    }
    return out;
  }

  const cap = args.maxInstances ?? 64;
  let cursor = new Date(baseStart);
  for (let i = 0; i < cap; i += 1) {
    const cursorEnd = new Date(cursor.getTime() + span);
    if (cursor.getTime() >= args.windowEnd.getTime()) break;
    if (
      cursorEnd.getTime() > args.windowStart.getTime() &&
      !exceptions.has(cursor.getTime())
    ) {
      out.push({ start: cursor.toISOString(), end: cursorEnd.toISOString() });
    }
    cursor = advance(cursor, freq);
  }
  return out;
}
