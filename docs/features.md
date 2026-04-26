# ILM — Features delivered

Cumulative log of what's shipped. Update after each PR that lands meaningful functionality. Keep this file describing *current state*, not history — when something is replaced, rewrite the bullet, don't append a note.

---

## Foundation

- **Monorepo**: npm workspaces with apps (`account`, `funding-manager`, `project-manager`, `protocol-manager`, `supply-manager`) and shared packages (`@ilm/ai-import`, `@ilm/types`, `@ilm/ui`, `@ilm/utils`, `@ilm/validation`).
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
- **Overview dashboard** (#/) is a status monitor patterned on `design/web.png`: a hero `LAB OPERATING STATUS` block (status word + active-projects / protocols / team-members / compliance% metrics + flow-line SVG), Upcoming Schedule placeholder, Projects donut by state, recent Protocols list, Inventory radar with classification counts + critical-low pulled from the latest `inventory_checks`, Funding placeholder (Stage 4d shell), Activity Feed unioning recent `protocols` / `projects` / `items` updates, Resource Utilization sparklines, and a Team Overview card with avatars + role breakdown. Card data is fetched in parallel by `useDashboardData(labId)` and gracefully reports an inline error.
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

## Supply Manager (Stage 4c — production)

- **Schema.** Seven lab-scoped tables behind RLS: `items` (catalog identity), `item_projects` (many-to-many project links with `primary` / `shared` / `temporary` / `general` association types — a row with `project_id = null` or `association_type = 'general'` flags lab-wide visibility), `inventory_checks` (append-only stock-check log), `order_requests` + `order_request_items` (multi-item requests with `draft → submitted → approved/denied/withdrawn → ordered → received/cancelled` states), `orders` (vendor / tracking / placed-by per approved request, with `initial_order_placed → back_ordered → shipped → partially_received → received` flow), `stock_lots` (received lots with lot number, expiration, storage). Equipment is intentionally absent — that lives in a future module.
- **Visibility.** `can_access_supply_item(item_id)` gates item / inventory-check / stock-lot reads: lab admins see everything; members see active items that are either lab-wide (no project links or `association_type = 'general'`) or linked to a project they belong to. Order requests are visible to admins and the requester; non-draft requests are visible to all lab members so the orders log is shared.
- **Lifecycle RPCs (SECURITY DEFINER + audit-logged).** `submit_order_request`, `withdraw_order_request`, `approve_order_request`, `deny_order_request` (note required), `cancel_order_request`, `place_supply_order`, `update_supply_order`, `receive_supply_order` (admin or original requester; accepts a jsonb array of lots and optionally records a 'plenty' inventory check per item).
- **Frontend.** `apps/supply-manager` ships four sidebar tabs built on the shared `@ilm/ui` primitives — only ~250 lines of `sm-*` app-local CSS for sidebar + toolbars + composer cards, everything else is `Panel` / `Table` / `Modal` / `Button` / `Badge` / `StatusPill` / `FormField`:
  - **Warehouse** — full item catalog with search, classification / project / stock / storage filters, archived toggle (admin-only), inline actions (Check / Request / Projects / Edit / Archive). Stock pill is driven by the latest `inventory_checks` row; checks older than 60 days flag with ⚠.
  - **Orders** — request cards filtered by Active / Mine / Received / All. Each card shows status, items, attached vendor orders, lots, and lifecycle actions appropriate to the viewer (continue draft, submit, withdraw, mark ordered, update, receive, cancel).
  - **Review** — admin-only queue of submitted requests with approve / deny dialogs (denial requires a note).
  - **My Items** — project-scoped dashboard: counts of active / low-or-unknown / stale / open-requests, a "Reorder candidates" table with one-click request prefill, and the user's full project-scoped item list.
- **Modals.** `ItemFormModal` (create + edit), `InventoryCheckModal` (with check history viewer), `LinkProjectsModal` (manage project associations), `NewRequestModal` (creates a draft, optionally seeded from a Warehouse row), `EditRequestModal` (continue draft, add / edit / remove items inline, surfaces ⚠ stale-check warnings per item), `ReviewRequestModal` (approve / deny with note), `PlaceOrderModal`, `UpdateOrderModal`, `ReceiveOrderModal` (multi-lot receipt with optional auto-recorded inventory check).

## Audit & security

- `audit_log` table captures state transitions only — submit / approve / reject / recycle / restore / purge for projects and protocols, plus submit / withdraw / approve / deny / cancel / place / update / receive for supply orders. Draft edits, roadmap reorders, and inventory checks are not logged.
- `.gitleaks.toml` + `.github/workflows/secret-scan.yml` run gitleaks on push / PR / manual dispatch.

## Known gaps (see `next-stage.md`)

- `funding-manager` (Stage 4d) is deferred — auth-shell stub with no schema or adapter.
- Share-link token is a raw lab UUID; a rotatable HMAC token is a deferred follow-up.
