# ILM — Features delivered

Cumulative log of what's shipped. Update after each PR that lands meaningful functionality. Keep this file describing *current state*, not history — when something is replaced, rewrite the bullet, don't append a note.

---

## Foundation

- **Monorepo**: npm workspaces with apps (`account`, `funding-manager`, `project-manager`, `protocol-manager`, `scheduler`, `supply-manager`) and shared packages (`@ilm/ai-import`, `@ilm/types`, `@ilm/ui`, `@ilm/utils`, `@ilm/validation`).
- **Supabase backend**: Postgres schema under `supabase/migrations/`, Supabase Auth for identity, RLS on every app table.
- **Static deploy**: GitHub Pages, no custom backend server; only `VITE_SUPABASE_URL` + anon key ship to the browser.

## Auth & labs

- Email/password sign-up, sign-in, sign-out, password reset.
- `AuthProvider` + protected-route wrapper; `activeLabId` persisted to `localStorage` and rehydrated on load.
- Lab roles: `owner` / `admin` / `member`. `is_lab_member`, `is_lab_admin`, `is_lab_owner`, `lab_role`, `is_project_lead` helpers in SQL.
- Owner-only RPCs `promote_member_to_admin` / `demote_admin_to_member`.
- Invite-by-email RPC (`invite_member_to_lab`) surfaced via `LabMembersPanel`.
- **Self-serve join flow**: `lab_join_requests` table + `request_lab_join` / `approve_lab_join` / `reject_lab_join` / `cancel_lab_join` / `lookup_lab_by_id` RPCs. Rejection requires a comment; one pending request per user per lab.
- **LabPicker empty state**: create-new-lab or paste-invite-link.

## Protocol Manager (Stage 3 — production)

- Visual protocol editor with typed steps (reagent, instrument, parameter, observation, wait, decision).
- Draft → submit → review → publish flow. Drafts are per-user (`protocol_drafts`), submissions are frozen snapshots (`protocol_submissions`), published copies live in `protocols`, append-only `protocol_revisions` on approval.
- Projects carry `approval_required`; the auto-created "General" project publishes immediately on submit.
- Hard delete with 30-day recycle bin (`protocols.deleted_at`).
- Per-draft `submission_history` log, opened from a script-size link left of the Summary tab (drafts only).
- Reviewer rejection requires a non-empty comment; submitter comment on submit is optional.
- localStorage → cloud migration banner for pre-Supabase data.
- Save-draft button becomes an "Autosaved" caption while editing an existing draft; it stays as an explicit commit button when editing on top of a published protocol.

## Account / Home app (Stage 4a — production)

- The Account shell now serves as the **site root**: deployed at `/ILM/` (was `/ILM/account/`). All sibling apps live under named subpaths (`/ILM/protocol-manager/`, `/ILM/project-manager/`, `/ILM/supply-manager/`, `/ILM/funding-manager/`). The previous Protocol Manager "Operations Hub" landing page is gone — Protocol Manager mounts directly at `/ILM/protocol-manager/`.
- **Home dashboard layout**: persistent sidebar with the full ILM nav (Overview, Projects, Protocols, Inventory, Funding, Calendar, Team, Analytics, Reports, Settings) plus a system-status card and profile/orb at the bottom. External nav items deep-link to sibling apps via `appUrl(...)`; internal items use hash routing (`#/team`, `#/settings`, `#/calendar`, `#/analytics`, `#/reports`) so the static deploy keeps a single root entry point. Calendar / Analytics / Reports render `PlaceholderView` "future stage" cards.
- **Overview dashboard** (#/) is a real-time status monitor:
  - Hero `LAB OPERATING STATUS` block — status word + three live metrics (active projects, team members, requests pending review) + a refresh button that re-runs every query. The hero art is `design/assets/infinity.png`.
  - **Upcoming Schedule** card — merged `calendar_events` + future `bookings` (status not cancelled), sorted by start time, top 5.
  - **Requests pending review** — full-width row with role-aware quick-jump tiles (count + label + arrow → opens the relevant app's review tab via hash deep-link). Owner sees Projects + Order requests + Member requests; admin adds Bookings; project leads see Protocols only. Counts come from `protocol_submissions` (pending), `projects` (draft + `review_requested_at`), `order_requests` (submitted), `lab_join_requests` (pending), `bookings` (requested).
  - **Inventory status** — replaces the old resource-utilization grid; uses `design/assets/radar.png` as a backdrop for classification counts (reagents / consumables / supplies-samples-other / critical-low) plus a stock-coverage bar pulled from the latest `inventory_checks`.
  - **Activity feed** — recent updates unioned across protocols, projects, items, and order requests (kind-coded dots).
  - **Team overview** — avatars + role breakdown.
  - The dashboard auto-refreshes when the tab becomes visible again so figures stay current after edits in another window. A faded `design/assets/lab-corridor.png` anchors the page's bottom-left corner.
  - All metrics fetch in parallel via `useDashboardData(labId, userId)`.
- **Cross-app review deep links**: `project-manager`, `supply-manager`, `protocol-manager`, and `scheduler` each read the URL hash on mount to select the matching sidebar tab (e.g. `#review`, `#reviews`, `#bookings`), enabling one-click jumps from the home page.
- **Team page** (#/team) hosts the Members + Invitations & Requests tabs (previously the Account dashboard).
- **Settings page** (#/settings) covers the profile, active-lab tier blurb, lab-picker shortcut, and a placeholder for future lab settings.
- **Strict tier hierarchy** (owner > admin > member; one tier per user per lab, enforced by PK on `lab_memberships`):
  - Admins + owner can promote members to admin and remove members.
  - Only the owner can demote admins to member or remove admins.
  - Owner is immutable via RPCs (`promote_member_to_admin`, `demote_admin_to_member`, `remove_lab_member`).
- **Invitations & requests** under the Team tab: invite-by-email with role choice, pending-invitation list, copyable `/join/<uuid>` share link (now off the site root), and join-request queue with approve / reject-with-required-comment.
- **Auto-claim on sign-in**: `claim_pending_invitations` RPC converts matching-email pending invitations to memberships when the user signs in.
- **Join-by-link route** at `/join/<lab-uuid>` (was `/account/join/...`): signed-out users hit the auth shell; existing members get "Open this lab"; non-members see a lab-name preview + "Request to join" form with optional message + self-cancel.
- **GitHub Pages SPA fallback** routed to the home shell so deep links like `/ILM/join/<uuid>` resolve.
- **Real-time badge updates**: role changes refresh both the members roster and the `AuthProvider` labs array so the sidebar tier badge updates without a reload.
- Shared `AccountLinkCard` in `@ilm/ui` renders the login status box across sibling apps and links back to the site root (the home dashboard).

## Project Manager (Stage 4b — production)

- Projects, milestones, experiments; drag-reorder roadmap with 1024-gap `sort_order`.
- Project leads (`project_leads`) independent of admin role.
- Review gate: approve/reject is allowed for lab admins **or** project leads of that specific project. Rejection requires a comment and returns the draft to unsubmitted.
- Per-draft `submission_history` with a link in the view tab nav (drafts only).
- Recycle bin for published projects; withdraw for drafts.
- Experiments link to protocols; `completedAt >= startedAt` is validated client-side.
- Personnel tab shows `ProjectLeadsPanel` and the roster. Lab-wide owner settings now live in the Account app.
- **GitHub repo link per project**: optional `github_repo_url` on projects, editable from the Edit tab. Library cards show "last push {relative time}" in the bottom-right corner when a repo is linked, with a one-click refresh button. Status is cached in `project_repo_status` and fetched on demand by the `fetch-github-activity` edge function using a lab-scoped PAT (admin-managed, stored service-role-only on `labs.github_pat`, never sent to the browser).

## Shared UI kit (Stage 4c-pre)

- **Phase A — tokens + reset.** `@ilm/ui/tokens.css` owns the full `--rl-*` design-token set (colors, type scale, spacing, radii, z-index, motion); `@ilm/ui/reset.css` factors out the boilerplate each app's `styles.css` used to repeat. Per-app `--acct-*` / `--pm-*` / `--ilm-*` alias layers are gone.
- **Phase B — primitives.** `@ilm/ui` now exports `Button`, `FormField` + `Input` / `Textarea` / `Select` / `CheckboxField` + `FormRow`, `Panel` + `SectionHeader` + `CardGrid`, `Tabs` + `TabButton` + `TabPanel`, `Modal` + `ConfirmDialog`, `Table` + `TableEmpty` + `TableLoading`, `Badge` + `StatusPill`, `EmptyState` + `ErrorBanner` + `InlineError` + `InlineNote`. Styles ship in `@ilm/ui/primitives.css`; every primitive exposes CSS custom properties (`--rl-btn-bg`, `--rl-panel-bg`, `--rl-badge-fg`, ...) so apps can restyle a single usage without forking the primitive. Existing apps keep their local CSS until Phase D — Supply Manager (Stage 4c) is the first consumer.
- **Phase C — AppShell.** `@ilm/ui` now exports `AppShell`, `AppTopbar`, `AppSubbar`, `AppContent`, `AppWordmark`, `AppSidebarSection` — a single shared shell that owns the full-viewport layout (optional left sidebar + main column), the topbar (`brand` / `kicker` / `title` / `subtitle` / `actions` slots for `AppSwitcher`, `AccountLinkCard`, lab-context controls), an optional subbar with tabs slot, and a consistent page container with shared padding and max-width. CSS variables (`--rl-shell-sidebar-width`, `--rl-shell-topbar-bg`, `--rl-shell-content-max`, ...) let apps re-skin locally. Supply Manager was the first consumer and drops to ~55 lines of supply-specific compositions.
- **Phase D — legacy apps migrated.** Account, Project Manager, and Protocol Manager now all compose their outer shell from `AppShell` / `AppTopbar` / `AppSubbar` / `AppContent` / `AppSidebarSection` instead of per-app shell CSS. Token overrides (`--rl-shell-sidebar-width`, `--rl-shell-sidebar-bg`, ...) preserve each app's distinctive look; Protocol Manager keeps its app-local two-column body (side rail + workspace under the subbar) since that grid doesn't fit `AppShell`'s sidebar slot.
- **Phase E — unified `LabShell`.** All five apps (Account/home, Project Manager, Protocol Manager, Supply Manager, Funding Manager) now render inside a shared `<LabShell>` from `@ilm/ui` (`packages/ui/src/LabShell.tsx` + `lab-shell.css`). The shell owns the persistent left sidebar with all 10 nav items (Overview, Projects, Protocols, Inventory, Funding, Calendar, Team, Analytics, Reports, Settings), the SYSTEM STATUS card, the profile orb, the sign-out button, and the topbar (kicker / title / subtitle / search / org). External nav items deep-link to sibling apps via `appUrl(...)`; internal items use hash routes back to the home shell. Each app keeps a thin app-local subbar (a horizontal tab strip) for its section nav. See [`docs/module-development.md`](module-development.md) for the pattern when adding a new module (Facility, Calendar, …).

## Supply Manager (Stage 4c — production)

- **Schema.** Seven lab-scoped tables behind RLS: `items` (catalog identity), `item_projects` (many-to-many project links with `primary` / `shared` / `temporary` / `general` association types — a row with `project_id = null` or `association_type = 'general'` flags lab-wide visibility), `inventory_checks` (append-only stock-check log), `order_requests` + `order_request_items` (multi-item requests with `draft → submitted → approved/denied/withdrawn → ordered → received/cancelled` states), `orders` (vendor / tracking / placed-by per approved request, with `order_placed → shipped → partially_received → received` flow; back-ordered nuance lives in the order note), `stock_lots` (received lots with lot number, expiration, storage). Equipment is intentionally absent — that lives in a future module.
- **Visibility.** `can_access_supply_item(item_id)` gates item / inventory-check / stock-lot reads: lab admins see everything; members see active items that are either lab-wide (no project links or `association_type = 'general'`) or linked to a project they belong to. Order requests are visible to admins and the requester; non-draft requests are visible to all lab members so the orders log is shared.
- **Lifecycle RPCs (SECURITY DEFINER + audit-logged).** `submit_order_request`, `withdraw_order_request`, `approve_order_request`, `deny_order_request` (note required), `cancel_order_request`, `place_supply_order`, `update_supply_order`, `receive_supply_order` (admin or original requester; accepts a jsonb array of lots and optionally records a 'plenty' inventory check per item).
- **Frontend.** `apps/supply-manager` ships four sidebar tabs built on the shared `@ilm/ui` primitives — only ~250 lines of `sm-*` app-local CSS for sidebar + toolbars + composer cards, everything else is `Panel` / `Table` / `Modal` / `Button` / `Badge` / `StatusPill` / `FormField`:
  - **Warehouse** — full item catalog with search, classification / project / stock / storage filters, archived toggle (admin-only), inline actions (Check / Request / Projects / Edit / Archive). Stock pill is driven by the latest `inventory_checks` row; checks older than 60 days flag with ⚠.
  - **Orders** — request cards filtered by Active / Mine / Received / All. Each card shows status, items, attached vendor orders, lots, and lifecycle actions appropriate to the viewer (continue draft, submit, withdraw, mark ordered, update, receive, cancel).
  - **Review** — admin-only queue of submitted requests with approve / deny dialogs (denial requires a note).
  - **My Items** — project-scoped dashboard: counts of active / low-or-unknown / stale / open-requests, a "Reorder candidates" table with one-click request prefill, and the user's full project-scoped item list.
- **Modals.** `ItemFormModal` (create + edit), `InventoryCheckModal` (with check history viewer), `LinkProjectsModal` (manage project associations), `NewRequestModal` (creates a draft, optionally seeded from a Warehouse row), `EditRequestModal` (continue draft, add / edit / remove items inline, surfaces ⚠ stale-check warnings per item), `ReviewRequestModal` (approve / deny with note), `PlaceOrderModal`, `UpdateOrderModal`, `ReceiveOrderModal` (multi-lot receipt with optional auto-recorded inventory check).

## Scheduler (Stage 4e — foundation)

- **Schema.** Four lab-scoped tables behind RLS: `resources` (equipment / bookable resources with category, location, availability_status, booking_mode `hard_booking | soft_booking`, booking_policy `open | approval_required | admin_only`, setup / cleanup buffers, min / max duration, required_training, responsible_person, optional `linked_protocol_id`), `calendar_events` (lab events with `event_type`, start / end window with check constraint, optional links to project / protocol / planned task, organizer + participant array, visibility `private | project | lab | equipment_visible`, `recurrence_rule` text + `recurrence_exceptions` timestamptz array, status `scheduled | cancelled | completed`), `bookings` (resource reservations with FK to resource + optional calendar event / planned task / project / protocol, copied setup/cleanup buffers, booking_type `experiment | daily_use | maintenance | calibration | training`, status `draft | requested | approved | denied | active | completed | cancelled | no_show`, actual start/end times + usage_record), `planned_tasks` (unscheduled work queue with priority `low | normal | high | urgent`, status `planned | ready_to_schedule | scheduled | completed | cancelled`, `required_resource_ids` array, `scheduled_event_id` / `scheduled_booking_id` back-links).
- **Visibility / writes.** Lab members read all four tables. `resources` are admin-write only. `calendar_events` and `planned_tasks` allow members to create / edit / delete their own (organizer / created_by / assigned_user_id); admins manage all. Bookings allow members to create their own and edit non-terminal own bookings; admins override.
- **Lifecycle RPCs (SECURITY DEFINER + audit-logged).** `book_resource` (server-side conflict + policy + duration check; auto-routes to `requested` for `approval_required` resources, otherwise `approved`), `cancel_booking`, `complete_booking` (records usage_record + actual start/end), `approve_booking`, `deny_booking` (note required), `schedule_planned_task` (converts a task into a calendar event and/or a booking, links the IDs back on the task, marks status `scheduled`).
- **Conflict detection helper.** `find_booking_conflicts(resource_id, start, end, exclude_booking_id)` returns overlapping bookings using `tstzrange` overlap operator. Setup/cleanup buffers from the resource extend the window on both sides; soft-booking resources short-circuit and never report conflicts. Hard conflicts block non-admin booking; admins can override.
- **Frontend.** `apps/scheduler` runs inside the shared `<LabShell>` at `/ILM/scheduler/`, mounted to the `calendar` sidebar slot. `cloudAdapter.ts` types every record + RPC; `useSchedulerWorkspace` hydrates a `{ resources, events, bookings, plannedTasks, projects, protocols }` snapshot and wraps each mutation with `await hydrate()`. Built on the shared `@ilm/ui` primitives (`Panel` / `Modal` / `Button` / `Table` / `FormField` / `StatusPill` / `Badge` / `EmptyState` / `InlineError`); only ~340 lines of `sch-*` app-local CSS for the week-grid + filter row + task cards. Four subbar tabs:
  - **Calendar** — Monday-anchored week grid (07:00–19:00 visible window) with prev / today / next nav and a `+ New event` button. Events render as colored cards (left-border tone per `event_type`) absolute-positioned on the day column. Click an event to edit; `EventFormModal` covers title / type / visibility / start–end / location / linked project / linked protocol / recurrence (none / daily / weekly / biweekly / monthly) / notes; recurring events are expanded client-side via `expandRecurrence()` for the visible window only, honoring `recurrence_exceptions`.
  - **Bookings** — table with resource / project / status / from–to / "mine only" filters. Status pills + setup/cleanup buffer awareness. Lifecycle actions per row (Approve / Deny / Complete / Cancel) gated by ownership and admin role; complete + deny use a `window.prompt` for the usage / denial note.
  - **Unscheduled** — task cards sorted by priority + preferred_start_date, with status filter (default = open: `planned` + `ready_to_schedule`). `PlannedTaskFormModal` captures title / project / protocol / priority / status / estimated duration / preferred start–end / required resources (multi-select checkbox grid) / notes. `ScheduleTaskModal` converts a task into an event-only / booking-only / both — both mode links the new event and booking via `calendar_event_id` through `schedule_planned_task`.
  - **Resources** — admin-managed table with search + category / availability / booking-mode / archived filters; non-admins see read-only with an inline note. `ResourceFormModal` covers every schema field including buffers, min/max duration, training requirement, booking_policy, linked protocol, archive.
  - **Conflict UX.** `BookingFormModal` exposes a "Check conflicts" action that calls `find_booking_conflicts` server-side and renders the overlapping bookings inline before save. On submit, hard-conflict RPC errors surface in the same form as an `InlineError`.

## Funding Directory (Stage 4d-lite — production)

A privacy-preserving alias book for routing approved supply orders to the right grant. **Not** a financial management system: no budgets, balances, burn rate, expenses, salary allocations, invoice parsing, or expenditure analytics are stored anywhere in this module. The only thing this directory holds is the minimum metadata needed to attach the correct grant identifier when a reviewer approves a `supply` order request.

- **Schema.** Two new tables behind RLS plus six columns added to `order_requests`:
  - `funding_sources` — lab-scoped directory rows: `nickname`, `grant_identifier`, `pi_id`, `valid_start_date`, `valid_end_date`, `brief_note`, `visibility ∈ {reviewer_only, lab_visible_alias}`, `archived_at`. The validity window is enforced (`valid_end_date >= valid_start_date`).
  - `funding_defaults` — append/upsert log of "this item / project goes to this grant", with `confidence_level ∈ {exact_item_project, exact_item, category_project, project_default}` and `last_used_order_id`. A unique index on `(lab_id, item_id, project_id, category)` (`NULLS NOT DISTINCT`) lets one row express any of the four key shapes.
  - `order_requests` gains `requested_funding_source_id`, `suggested_funding_source_id`, `approved_funding_source_id`, `funding_assignment_status ∈ {unassigned, suggested, assigned, changed, not_required}`, `funding_assigned_by`, `funding_assigned_at`. All FKs `ON DELETE SET NULL`, so archive / hard-delete of a funding source never breaks history.
- **Privacy at the SQL boundary, not the UI.** `funding_sources` and `funding_defaults` are admin-only direct-read. Members hit a SECURITY DEFINER `list_funding_sources(p_lab_id)` RPC that returns the row shape with `grant_identifier` set to `null` for non-admins and only surfaces sources flagged `lab_visible_alias`. The grant identifier never travels to a non-reviewer's browser, even via joins.
- **Lifecycle RPCs (SECURITY DEFINER + audit-logged).** `create_funding_source`, `update_funding_source` (with explicit `clear_*` flags so callers can null fields), `archive_funding_source`, `restore_funding_source`. Hard delete is intentionally absent — archive instead.
- **Approval-time assignment.** `approve_order_request` was extended to `(p_request_id, p_note, p_funding_source_id, p_funding_required)`. Approval rejects if no funding source is supplied unless `p_funding_required = false` — in that case the request flips to `funding_assignment_status = 'not_required'`. Approval with a funding source seeds `funding_defaults` rows for tier 1 (item + project), tier 2 (item-only), tier 3 (category + project), and tier 4 (project default) so future suggestions get progressively better. Existing positional callers keep working because the new params have defaults.
- **Post-approval changes.** `set_order_funding(p_request_id, p_funding_source_id)` and `clear_order_funding(p_request_id)` let reviewers swap or clear the assignment for `submitted` / `approved` / `ordered` requests; both refuse archived sources, audit-log the change, and set `funding_assignment_status = 'changed'` when overwriting an existing assignment.
- **Suggestion engine.** Client-side `suggestFundingSourceForOrder` in Supply Manager walks all order line items against `funding_defaults`, sorted by tier then recency. An expired/archived best match is returned but flagged `invalid` — the UI labels it "Previously used funding source is no longer assignable" and forces the reviewer to pick a fresh one.
- **Status badges.** `getFundingStatus` in `@ilm/utils` derives Active / Expiring soon (31–60 d) / Ending in N days (≤30 d) / Expired / Archived from `valid_end_date` + `archived_at`. Badge tones flow through to both apps.
- **Funding Manager app — the directory itself.** `apps/funding-manager` is now a full directory page: filterable / searchable table (status / PI / visibility / archived), add / edit / archive / restore actions for admins, member view that hides grant identifiers and only renders `lab_visible_alias` rows. Form validation enforces required nickname + grant identifier and inverted-window detection; visibility is a hard pick.
- **Supply Manager integration.** The Review modal now requires a funding source before approve unless the reviewer explicitly toggles "funding not required". The selected source's grant identifier and validity-window badge are shown next to the picker, with an inline warning when the source is within 30 days of expiration. Funding is set or changed **only inside the Review tab** (during the review modal flow, or via the inline change-source dropdown on a still-actionable card in the Review tab) — the Orders tab renders the funding line read-only for everyone, including admins, so the assignment can't be edited outside the review path. Members see only "Funding: assigned by reviewer — {nickname}" with no grant id anywhere.
- **Roles today.** `admin` / `owner` act as the spec's "reviewer / lab manager / PI" tier; `member` is the regular requester. A future role expansion (a dedicated `pi` or `reviewer` tier on `lab_memberships`) can be layered on without touching the column or RPC contracts — see `roleNote` markers in `supabase/migrations/20260502000000_funding_directory.sql`.

## Audit & security

- `audit_log` table captures state transitions only — submit / approve / reject / recycle / restore / purge for projects and protocols, plus submit / withdraw / approve / deny / cancel / place / update / receive for supply orders. Draft edits, roadmap reorders, and inventory checks are not logged.
- `.gitleaks.toml` + `.github/workflows/secret-scan.yml` run gitleaks on push / PR / manual dispatch.

## Known gaps (see `next-stage.md`)

- `funding-manager` Stage 4d shipped as a **lightweight directory** (alias / grant-id / validity / brief note for order routing). Full grants / budgets / allocations / expenses tracking is still deferred — see `next-stage.md` if a future stage takes that on.
- `scheduler` (Stage 4e) — first views shipped. Follow-ups: surface upcoming bookings on the home dashboard's Upcoming Schedule card, add a daily-use quick-record path on a soft-booking resource, tighten event visibility (`private` / `project`) in RLS once a lab needs it.
- Share-link token is a raw lab UUID; a rotatable HMAC token is a deferred follow-up.
