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

## Account app (Stage 4a — production)

- Dedicated app at `/account/`, reachable by clicking the login status box in any other app.
- **Flat two-panel layout**: left sidebar with profile, active lab tier (owner / admin / member) + capability blurb, project counts, and a "Join or create another lab…" shortcut that reopens `LabPicker` without clearing the current active lab. Right main area with tabbed Lab Management (Members / Invitations & Requests).
- **Strict tier hierarchy** (owner > admin > member; one tier per user per lab, enforced by PK on `lab_memberships`):
  - Admins + owner can promote members to admin and remove members.
  - Only the owner can demote admins to member or remove admins.
  - Owner is immutable via RPCs (`promote_member_to_admin`, `demote_admin_to_member`, `remove_lab_member`).
- **Invitations & requests** in one tab: invite-by-email with role choice, pending-invitation list, copyable `/account/join/<uuid>` share link, and join-request queue with approve / reject-with-required-comment.
- **Auto-claim on sign-in**: `claim_pending_invitations` RPC converts matching-email pending invitations to memberships when the user signs in.
- **Join-by-link route** at `/account/join/<lab-uuid>`: signed-out users hit the auth shell; existing members get "Open this lab"; non-members see a lab-name preview + "Request to join" form with optional message + self-cancel.
- **GitHub Pages SPA fallback** routed to the Account shell so deep links like `/account/join/<uuid>` resolve.
- **Real-time badge updates**: role changes refresh both the members roster and the `AuthProvider` labs array so the sidebar tier badge updates without a reload.
- Shared `AccountLinkCard` in `@ilm/ui` renders the login status box consistently across placeholder apps (`funding-manager`, `supply-manager`).

## Project Manager (Stage 4b — production)

- Projects, milestones, experiments; drag-reorder roadmap with 1024-gap `sort_order`.
- Project leads (`project_leads`) independent of admin role.
- Review gate: approve/reject is allowed for lab admins **or** project leads of that specific project. Rejection requires a comment and returns the draft to unsubmitted.
- Per-draft `submission_history` with a link in the view tab nav (drafts only).
- Recycle bin for published projects; withdraw for drafts.
- Experiments link to protocols; `completedAt >= startedAt` is validated client-side.
- Personnel tab shows `ProjectLeadsPanel` and the roster. Lab-wide owner settings now live in the Account app.
- **GitHub repo link per project**: optional `github_repo_url` on projects, editable from the Edit tab. Library cards show "last push {relative time}" in the bottom-right corner when a repo is linked, with a one-click refresh button. Status is cached in `project_repo_status` and fetched on demand by the `fetch-github-activity` edge function using a lab-scoped PAT (admin-managed, stored service-role-only on `labs.github_pat`, never sent to the browser).

## Audit & security

- `audit_log` table captures state transitions only (submit / approve / reject / recycle / restore / purge). Draft edits and roadmap reorders are not logged.
- `.gitleaks.toml` + `.github/workflows/secret-scan.yml` run gitleaks on push / PR / manual dispatch.

## Known gaps (see `next-stage.md`)

- `supply-manager` (Stage 4c) is the current in-flight stage — auth-shell stub today, schema + adapter + screens still to build.
- `funding-manager` (Stage 4d) is deferred — auth-shell stub with no schema or adapter.
- Share-link token is a raw lab UUID; a rotatable HMAC token is a deferred follow-up.
