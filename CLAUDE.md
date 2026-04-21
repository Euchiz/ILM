# ILM (Integrated Lab Manager)

## Repository

- GitHub: https://github.com/Euchiz/ILM.git
- Local path: `/mnt/isilon/wang_lab/zac/projects/ILM`
- Primary branch: `main`

## Project Structure

npm workspaces monorepo:

**Apps** (`apps/`):
- `funding-manager`
- `project-manager`
- `protocol-manager`
- `supply-manager`

**Packages** (`packages/`):
- `ai-import` (`@ilm/ai-import`)
- `types` (`@ilm/types`)
- `ui` (`@ilm/ui`)
- `utils` (`@ilm/utils`)
- `validation` (`@ilm/validation`)

## npm / Node Environment

When running on HPC node: `npm` is not available on the host. All npm commands must be run via Singularity:

```bash
singularity exec --bind /mnt/isilon/wang_lab/zac/projects/ILM:/work docker://node:24-slim sh -c "cd /work && <npm command>"
```

The SIF image is cached locally. Node version: 24-slim. npm version: 11.12.1.

When running on windows PC: `npm` is already installed.

## Common Commands

```bash
# Install dependencies
singularity exec --bind /mnt/isilon/wang_lab/zac/projects/ILM:/work docker://node:24-slim sh -c "cd /work && npm install"

# Build all workspaces
singularity exec --bind /mnt/isilon/wang_lab/zac/projects/ILM:/work docker://node:24-slim sh -c "cd /work && npm run build"

# Lint all workspaces
singularity exec --bind /mnt/isilon/wang_lab/zac/projects/ILM:/work docker://node:24-slim sh -c "cd /work && npm run lint"

# Typecheck all workspaces
singularity exec --bind /mnt/isilon/wang_lab/zac/projects/ILM:/work docker://node:24-slim sh -c "cd /work && npm run typecheck"

# Dev server (protocol-manager)
singularity exec --bind /mnt/isilon/wang_lab/zac/projects/ILM:/work docker://node:24-slim sh -c "cd /work && npm run dev"
```

## Supabase Migration Plan (in-flight, 2026-04)

Migrating ILM from browser-only storage (localStorage) to Supabase Postgres +
Supabase Auth, while keeping the frontend deployable to GitHub Pages (no custom
backend). Auth model: each user has a personal account; users belong to one or
more shared `labs` via `lab_memberships`; all data is scoped to a lab and
protected by RLS.

### Data model

Relational tables (preferred for structured data):
- `profiles` — one row per `auth.users` user (display_name, email)
- `labs` — shared workspace (name, slug, created_by)
- `lab_memberships` — (lab_id, user_id, role in {owner,admin,member})
- `projects` — lab-scoped projects (name, description, status)
- `protocols` — lab-scoped protocol records, structured columns +
  `document_json jsonb` for the protocol body. `document_json` is the ONLY
  jsonb payload; other domains (projects, supply, funding) should use
  normalized columns.
- `protocol_revisions` — append-only snapshot of protocol `document_json`

RLS on all tables; authorization driven by `lab_memberships`, never by
user-editable metadata or frontend checks.

### Staged implementation

**Stage 1 — Foundation (current)**
- `supabase/migrations/` with schema, triggers (`updated_at`), RLS policies
- `packages/utils` exposes a Supabase browser client reading
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (fail loudly if missing)
- Root README / docs: how to create a Supabase project, env var setup,
  GitHub Pages deployment notes, service-role key warning
- No runtime wiring of the client into apps yet

**Stage 2 — Auth shell**
- `packages/ui`: auth screens (sign up, sign in, sign out, password reset),
  `AuthProvider` + session state, protected-route wrapper
- Lab selection + "create lab" onboarding (creator becomes `owner`)
- Zero-lab / multi-lab / single-lab auto-open behavior
- Invitations remain dashboard-admin only for now

**Stage 3 — Storage cutover (protocol-manager) with review-gated publishing**
See `docs/stage-3-plan.md` for the full plan. Summary:
- Published `protocols` are read-only to everyone except via RPC. Every
  edit goes through a **draft → submit → review → publish** flow.
- New tables: `protocol_drafts` (per-user sandbox), `protocol_submissions`
  (frozen snapshots), `project_leads` (admins designate reviewers).
- `projects.approval_required` toggle; each lab auto-gets a "General"
  project with `approval_required=false` so edits there publish directly.
- Hard delete with 30-day recycle bin (`protocols.deleted_at`).
- `protocol_revisions` is written **only on approval**.
- Shipped in two PRs: 3a (schema + RPCs + RLS), 3b (UI cutover, drafts,
  submissions panel, recycle bin, localStorage→cloud migration banner).

**Stage 4 — Extend to other apps**
- Wire the same auth/lab shell into `funding-manager`, `project-manager`,
  `supply-manager` using normalized tables (not `document_json`) when their
  schemas land

### Non-negotiables
- Static frontend only; no custom backend server
- Only `VITE_SUPABASE_URL` + anon key in the browser; service-role key
  never committed or shipped
- RLS enforced on every app table
- Preserve existing JSON import/export
