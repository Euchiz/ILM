# Integrated Lab Manager (ILM)

Integrated Lab Manager is a static-first, Supabase-backed lab operations platform built as an npm workspaces monorepo. It provides modular apps for protocols, projects, inventory/supply, scheduling, funding-directory routing, and dataset registry workflows.

## What is shipped today

ILM is now a mature multi-app suite with production Supabase + RLS workflows:

- **Account / Home** (`/`) — lab-wide operations dashboard, membership/roles, invitations, join requests, and cross-app review routing.
- **Protocol Manager** (`/protocol-manager/`) — typed protocol editor with draft → submit → review → publish and append-only revisions.
- **Project Manager** (`/project-manager/`) — projects, milestones, experiments, project leads, review gates, recycle bin, GitHub activity.
- **Supply Manager** (`/supply-manager/`) — item catalog, stock checks, request/review/order/receipt lifecycle, lots, project visibility.
- **Funding Manager (4d-lite)** (`/funding-manager/`) — grant alias directory used for supply approval routing (not financial accounting).
- **Scheduler** (`/scheduler/`) — resources, events, bookings, and unscheduled task-to-booking/event conversion.
- **Data Hub** (`/data-hub/`) — dataset registry with versions, storage references, project links, and access request/review.

For the currently planned follow-up scope, see [`docs/next-stage.md`](docs/next-stage.md).

## Architecture at a glance

- **Frontend only** (GitHub Pages deploy), no custom backend server.
- **React + TypeScript + Vite** per app.
- **Supabase Postgres + Auth** for persistence and identity.
- **Row Level Security on every app table**; authorization is data-driven from `lab_memberships` and domain ownership/role policies.
- **Shared UI & types** through internal packages (`@ilm/ui`, `@ilm/types`, `@ilm/utils`, `@ilm/validation`, `@ilm/ai-import`).

## Monorepo layout

```text
apps/
  account/
  data-hub/
  funding-manager/
  project-manager/
  protocol-manager/
  scheduler/
  supply-manager/
packages/
  ai-import/
  types/
  ui/
  utils/
  validation/
supabase/
  migrations/
docs/
```

## Quickstart

Use the dedicated quickstart guide:

- **[`docs/quickstart.md`](docs/quickstart.md)** — prerequisites, local setup, env vars, Supabase bootstrap, dev/build/test commands, and GitHub Pages notes.

## Security model (non-negotiables)

- Browser receives only:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- **Never** expose Supabase `service_role` key in frontend code, `.env*`, CI logs, or shipped artifacts.
- Keep RLS enabled and tested on every table powering app data.

## Product docs

- [`docs/features.md`](docs/features.md) — living “what’s shipped now” feature inventory.
- [`docs/next-stage.md`](docs/next-stage.md) — active planned next stage.
- [`docs/module-development.md`](docs/module-development.md) — module scaffolding conventions with shared `<LabShell>` chrome.

## Deployment

ILM deploys to GitHub Pages via GitHub Actions from `main`.

- Site root (Account/Home): `https://euchiz.github.io/ILM/`
- App paths: `/protocol-manager/`, `/project-manager/`, `/supply-manager/`, `/funding-manager/`, `/scheduler/`, `/data-hub/`

Set repository secrets for build-time env injection:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## License

See [`LICENSE`](LICENSE) if present; otherwise follow repository owner guidance.
