# ILM — Next stage plan

Rewrite this file when priorities change. It always describes *the current planned next stage*, not historical stages.

---

## Stage 4e: Scheduler — calendar, bookings, unscheduled tasks

**Why now.** Projects + protocols define what needs to happen and supply tracks what's on hand. The remaining authorial gap is *time and equipment* — when work is scheduled, who's holding the microscope on Tuesday, and what's queued but not yet on the calendar. Foundation has shipped (schema + RLS + lifecycle RPCs + Vite app shell on the `calendar` nav slot); the four views and their modals are the remaining work. Funding Manager (Stage 4d) is paused — labs asked for scheduling first.

**Scope for this stage.** Four views, all hosted inside `apps/scheduler` and bound to `useSchedulerWorkspace`:

1. **Calendar** — weekly grid with day / week / month toggles (week is required, others if practical). Event cards colored by `event_type`. New / edit / delete event. Basic recurrence (none / daily / weekly / biweekly / monthly) — store the rule string, expand instances client-side for the visible window.
2. **Bookings** — table / card list filtered by resource, project, status, "my bookings", date range. New booking form runs `book_resource` RPC; surfaces hard-conflict errors with a `ConflictWarning` panel. Lifecycle actions: cancel, complete (with usage_record), approve / deny (admins).
3. **Unscheduled tasks** — task cards from `planned_tasks` where `status in ('planned','ready_to_schedule')`. New task button. "Schedule" opens a converter that calls `schedule_planned_task` with event-only / booking-only / both args.
4. **Resources** — admin-managed equipment registry with filters (category / location / status / booking mode / active). Add / edit / archive. Resource detail card with current + upcoming bookings.

Out of scope for this stage: Google Calendar sync, notifications, auto-scheduling, multi-user real-time collaboration, RRULE exception editing beyond the basic `recurrence_exceptions` array, analytics dashboard.

### Step 1 — Calendar view

- Weekly grid component (Sun/Mon-anchored, configurable later). Render events from `events` snapshot whose `[start_time, end_time]` window intersects the visible week, plus expanded instances of recurring events.
- `EventForm` modal (create / edit) — title, type, start/end, location, project / protocol / linked task, visibility, recurrence rule. Calls `createCalendarEvent` / `updateCalendarEvent`.
- Status badge by `event_type` (use existing `Badge` / `StatusPill` primitives). Color tokens added in `styles.css`.

### Step 2 — Bookings view

- Bookings table with the filter bar described above. Existing `Table` / `StatusPill` primitives.
- `BookingForm` modal that pre-checks for conflicts using `findBookingConflicts` (server RPC) before calling `bookResource`. On conflict-error response, render `ConflictWarning` listing the overlapping bookings.
- Cancel / complete / approve / deny actions wired to the existing RPCs. Completion modal collects `usage_record` and optional `actual_start_time` / `actual_end_time`.

### Step 3 — Unscheduled tasks view

- Card grid sorted by priority + preferred_start_date.
- "Schedule" opens a modal with three modes: event only, booking only, both. Both modes share start/end and link the new event to the new booking via `calendar_event_id` (the RPC handles that).
- Status flips to `scheduled` automatically inside the RPC; UI reflects the new `scheduled_event_id` / `scheduled_booking_id`.

### Step 4 — Resources view

- Admin-only table with `New / Edit / Archive` actions. Members see a read-only registry with availability status badges.
- `ResourceForm` modal — covers all schema fields including buffers, min/max durations, required training, booking mode + policy, responsible person.
- Archived toggle hides `is_active = false` resources by default (mirrors Supply Manager pattern).

### Step 5 — Daily-use bookings & cross-app surfacing

- Confirm `daily_use` booking_type works end-to-end on a soft-booking resource (no conflict block, overlap allowed). Already supported in the schema; just wire the form preset.
- Surface upcoming bookings on the home dashboard's Upcoming Schedule card (currently a placeholder).

### Step 6 — Docs

- Update `docs/features.md` Scheduler section as views ship.
- Add a "Scheduler" subsection to `docs/module-development.md` if any new convention emerges (e.g. RRULE expansion helper) that future modules should reuse.

### Tradeoffs

- **Recurrence model.** v1 stores a free-form `recurrence_rule` text. We expand instances client-side for the rendered window — easier than persisting expanded rows, simple to extend later. Full RRULE editing (BYDAY, COUNT, UNTIL) is out of scope.
- **Visibility enforcement.** The `visibility` column is stored but RLS treats every event as lab-visible for now (members read all). Tightening to `private` / `project` requires a join through `project_members`; deferred until a lab actually needs it.
- **Conflict UX.** Server RPC raises `errcode 23P01` on hard conflict and the frontend re-runs `find_booking_conflicts` to render the offending rows. We don't have an admin "force override" button yet — admins can already book through the conflict because the RPC's check is gated by `is_lab_admin`.

---

## Deferred

- **Stage 4d — Funding Manager.** Grants / budgets / allocations / expenses, plus a "Charge to grant" button on received Supply orders. Spec is preserved in git history (was the previous next-stage); revive when the Scheduler MVP is in production.
- **UI kit Phase F.** `packages/ui/README.md` + `docs/design-system.md` describing primitives, the `--rl-*` token contract, and the "first use local, second use promote" rule. Phase E (LabShell unification) shipped.
- **Stage 4f — Supply Manager v2.** Per-experiment consumption logging (links `experiments` to a new `stock_movements` ledger), supplier/catalog import, barcode scanning, lot/expiry alerts.
- **Stage 4g — Reporting / exports.** Cross-app digests (weekly lab activity, grant-period spend, protocol publication log).
- **Rotatable share-link token.** Replace the raw lab UUID in the Account share link with a signed HMAC + revocation.
- **Deferred housekeeping.** Fractional `sort_order`, layout polish (InfoTab responsive grid, roadmap card ellipsis, recycle-bin visual differentiation), dead-code simplify pass.
