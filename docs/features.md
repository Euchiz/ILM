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

## Account shell (`apps/account`)

- Dedicated app at `/account/`, reachable by clicking the login status box in any other app.
- Dashboard mounts `LabSettingsPanel` (owner promote/demote), `LabMembersPanel` (invite + remove), `LabJoinRequestsPanel` (approve/reject pending requests with required comment), and `LabShareLinkPanel` (copyable `/account/join/<uuid>` URL).
- Join-by-link route at `/account/join/<lab-uuid>`: signed-out users see auth shell; signed-in members get "Open this lab"; non-members see lab name preview + "Request to join" form with optional message and self-cancel.
- Shared `AccountLinkCard` in `@ilm/ui` renders the login status box consistently across placeholder apps (`funding-manager`, `supply-manager`).

## Protocol Manager (Stage 3b — production)

- Visual protocol editor with typed steps (reagent, instrument, parameter, observation, wait, decision).
- Draft → submit → review → publish flow. Drafts are per-user (`protocol_drafts`), submissions are frozen snapshots (`protocol_submissions`), published copies live in `protocols`, append-only `protocol_revisions` on approval.
- Projects carry `approval_required`; the auto-created "General" project publishes immediately on submit.
- Hard delete with 30-day recycle bin (`protocols.deleted_at`).
- Per-draft `submission_history` log, opened from a script-size link left of the Summary tab (drafts only).
- Reviewer rejection requires a non-empty comment; submitter comment on submit is optional.
- localStorage → cloud migration banner for pre-Supabase data.
- Save-draft button becomes an "Autosaved" caption while editing an existing draft; it stays as an explicit commit button when editing on top of a published protocol.

## Project Manager (Stage 4a — production)

- Projects, milestones, experiments; drag-reorder roadmap with 1024-gap `sort_order`.
- Project leads (`project_leads`) independent of admin role.
- Review gate: approve/reject is allowed for lab admins **or** project leads of that specific project. Rejection requires a comment and returns the draft to unsubmitted.
- Per-draft `submission_history` with a link in the view tab nav (drafts only).
- Recycle bin for published projects; withdraw for drafts.
- Experiments link to protocols; `completedAt >= startedAt` is validated client-side.
- Personnel tab shows `ProjectLeadsPanel` and the roster. Lab-wide owner settings now live in the Account app.

## Audit & security

- `audit_log` table captures state transitions only (submit / approve / reject / recycle / restore / purge). Draft edits and roadmap reorders are not logged.
- `.gitleaks.toml` + `.github/workflows/secret-scan.yml` run gitleaks on push / PR / manual dispatch.

## Known gaps (see `next-stage.md`)

- `funding-manager` and `supply-manager` are auth-shell stubs with no schema or adapter.
- Share-link token is a raw lab UUID; a rotatable HMAC token is a deferred follow-up.
