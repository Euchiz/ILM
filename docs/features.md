# ILM — Features delivered

Cumulative log of what's shipped. Update after each PR that lands meaningful functionality. Keep this file describing *current state*, not history — when something is replaced, rewrite the bullet, don't append a note.

---

## Foundation

- **Monorepo**: npm workspaces with apps (`funding-manager`, `project-manager`, `protocol-manager`, `supply-manager`) and shared packages (`@ilm/ai-import`, `@ilm/types`, `@ilm/ui`, `@ilm/utils`, `@ilm/validation`).
- **Supabase backend**: Postgres schema under `supabase/migrations/`, Supabase Auth for identity, RLS on every app table.
- **Static deploy**: GitHub Pages, no custom backend server; only `VITE_SUPABASE_URL` + anon key ship to the browser.

## Auth & labs

- Email/password sign-up, sign-in, sign-out, password reset.
- `AuthProvider` + protected-route wrapper; `activeLabId` persisted to `localStorage` and rehydrated on load.
- Lab roles: `owner` / `admin` / `member`. `is_lab_member`, `is_lab_admin`, `is_lab_owner`, `lab_role`, `is_project_lead` helpers in SQL.
- Owner-only RPCs `promote_member_to_admin` / `demote_admin_to_member`; shared `LabSettingsPanel` exposes them (currently mounted inside the project Personnel tab).
- Invite-by-email RPC (`invite_member_to_lab`) and `LabMembersPanel` exist in `@ilm/ui` but are **not yet mounted** in any production app surface.

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
- Personnel tab sorts roster by display name; shows `LabSettingsPanel` (owner-only) and `ProjectLeadsPanel`.

## Audit & security

- `audit_log` table captures state transitions only (submit / approve / reject / recycle / restore / purge). Draft edits and roadmap reorders are not logged.
- `.gitleaks.toml` + `.github/workflows/secret-scan.yml` run gitleaks on push / PR / manual dispatch.

## Known gaps (see `next-stage.md`)

- No top-level Lab Settings surface — owners with no projects can't reach `LabSettingsPanel`.
- Admins cannot invite members through any mounted UI (RPC exists).
- Registered users cannot request to join a lab — no self-serve onboarding.
- `funding-manager` and `supply-manager` are auth-shell stubs with no schema or adapter.
