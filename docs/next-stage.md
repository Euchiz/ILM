# ILM — Next stage plan

Rewrite this file when priorities change. It always describes *the current planned next stage*, not historical stages.

---

## Stage 4e: Scheduler — polish + cross-app surfacing

**Why now.** The four core views (Calendar / Bookings / Unscheduled / Resources) and all of their modals shipped on top of the foundation schema + RPCs. Remaining work is the polish around the edges: cross-app surfacing on the home dashboard, a quick daily-use record path, and the visibility-enforcement tightening called out in the original tradeoffs.

**Scope for this stage.** Three small pieces, all incremental:

1. **Home dashboard — Upcoming Schedule card.** The Account app's Overview page already has a placeholder "Upcoming Schedule" slot. Pull from `apps/scheduler`'s `useSchedulerWorkspace`-equivalent query: top 5 upcoming `bookings` + `calendar_events` (next 7 days) for the current lab, sorted by start_time. Click-through deep-links to the Scheduler with the matching week pre-selected. No new RPCs — the existing select policies are enough.
2. **Daily-use quick record.** On a soft-booking resource, drop a one-click "Record use" action that calls `book_resource` with `booking_type = 'daily_use'` and a default 30-min window starting now. This is the "no strict booking, but record it" path from the spec. Surface it in `ResourcesView` for soft-booking resources only.
3. **Visibility tightening.** Add an optional RLS clause to `calendar_events_select` so `visibility = 'private'` rows are only visible to the organizer + admins, and `visibility = 'project'` rows require membership in `linked_project_id`. Default `lab` and `equipment_visible` keep current behavior. Migrations-only change; the UI already writes the field.

Out of scope: Google Calendar sync, notifications, auto-scheduling optimization, full RRULE editing, calendar export.

### Step 1 — Home dashboard card

- Extend `apps/account`'s `useDashboardData` (or sibling) with a Scheduler block: union the next 7 days of `calendar_events` (status `scheduled`) and `bookings` (status `approved` / `active`), order by start_time, slice 5.
- Render in the Overview page's existing Upcoming Schedule slot, with a "Open Scheduler" link that resolves to `${siteRoot}/scheduler/`.

### Step 2 — Daily-use quick record

- In `ResourcesView`, when `booking_mode === 'soft_booking'` and the user is a lab member, expose a "Record use" button alongside Edit. Opens a tiny modal with project / sample-count / notes; defaults to a `daily_use` 30-min window from now.
- Reuse `bookResource` — no schema change.

### Step 3 — Visibility RLS

- New migration: rewrite `calendar_events_select` to OR together `visibility in ('lab','equipment_visible')`, `(visibility = 'private' and (organizer_user_id = auth.uid() or is_lab_admin(lab_id)))`, and `(visibility = 'project' and linked_project_id is not null and exists project_members)`.
- Add a single audit-friendly test query in the migration body.

### Step 4 — Docs

- Update `docs/features.md` Scheduler section to mention the home dashboard card + daily-use action + visibility tightening when each lands.

### Tradeoffs

- **Visibility default.** Existing rows default to `lab` so the stricter SELECT clause changes nothing for them. Net new private events surface only to organizer + admins; that matches the principle of least access without breaking historical data.
- **Daily-use UX.** A separate one-click button avoids forcing users through the full booking form for "I just used the Qubit" flows. The data model is the same (`bookings` row with `booking_type = 'daily_use'`).

---

## Deferred

- **Stage 4d — Funding Manager.** Grants / budgets / allocations / expenses, plus a "Charge to grant" button on received Supply orders. Spec is preserved in git history (was the previous next-stage); revive when the Scheduler MVP is in production.
- **UI kit Phase F.** `packages/ui/README.md` + `docs/design-system.md` describing primitives, the `--rl-*` token contract, and the "first use local, second use promote" rule. Phase E (LabShell unification) shipped.
- **Stage 4f — Supply Manager v2.** Per-experiment consumption logging (links `experiments` to a new `stock_movements` ledger), supplier/catalog import, barcode scanning, lot/expiry alerts.
- **Stage 4g — Reporting / exports.** Cross-app digests (weekly lab activity, grant-period spend, protocol publication log).
- **Rotatable share-link token.** Replace the raw lab UUID in the Account share link with a signed HMAC + revocation.
- **Deferred housekeeping.** Fractional `sort_order`, layout polish (InfoTab responsive grid, roadmap card ellipsis, recycle-bin visual differentiation), dead-code simplify pass.
