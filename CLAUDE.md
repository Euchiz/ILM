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

## Supabase Migration (Stage 4c — Supply Manager next)

ILM has moved from browser-only storage to Supabase Postgres + Supabase Auth,
while staying deployable to GitHub Pages (no custom backend). Auth model: each
user has a personal account; users belong to one or more shared `labs` via
`lab_memberships`; all data is scoped to a lab and protected by RLS.

### Data model

Relational tables (preferred for structured data):
- `profiles` — one row per `auth.users` user (display_name, email)
- `labs` — shared workspace (name, slug, created_by)
- `lab_memberships` — (lab_id, user_id, role in {owner,admin,member})
- `projects` — lab-scoped projects (name, description, status) + milestones, experiments, project_leads
- `protocols` — lab-scoped, structured columns + `document_json jsonb` for
  the protocol body. `document_json` is the ONLY jsonb payload; other domains
  (projects, supply, funding) use normalized columns.
- `protocol_revisions` — append-only snapshot of protocol `document_json`

RLS on all tables; authorization driven by `lab_memberships`, never by
user-editable metadata or frontend checks.

### Stage status

**Done**
- **Stage 1 — Foundation**: migrations, RLS, Supabase client in `packages/utils`, env/deploy docs.
- **Stage 2 — Auth shell**: sign in/up/out, `AuthProvider`, protected routes, lab picker + create-lab onboarding.
- **Stage 3 — Protocol Manager**: visual editor, draft → submit → review → publish, append-only revisions, recycle bin.
- **Stage 4a — Account / Home app**: hosts the lab-wide overview dashboard at the site root, plus tier hierarchy (owner > admin > member), invitations + join requests, share links, auto-claim under hash routes (`#/team`, `#/settings`).
- **Stage 4b — Project Manager**: projects/milestones/experiments, project leads, review gate, recycle bin, GitHub repo activity per project.

**Current**
- **Stage 4c — Supply Manager**: stock + orders + storage locations. See `docs/next-stage.md`.

**Deferred**
- **Stage 4d — Funding Manager**: grants / budgets / allocations / expenses.

### Living docs
- `docs/features.md` — cumulative summary of what's shipped. Update after each meaningful PR.
- `docs/next-stage.md` — current planned next stage. Rewrite when priorities change. Read before starting a new session.
- `docs/module-development.md` — how to scaffold a new module (Facility, Calendar, Funding, …) so it inherits the shared `<LabShell>` chrome and follows the deploy / RLS conventions. Read before starting a new app.

### Non-negotiables
- Static frontend only; no custom backend server
- Only `VITE_SUPABASE_URL` + anon key in the browser; service-role key
  never committed or shipped
- RLS enforced on every app table
- Preserve existing JSON import/export
