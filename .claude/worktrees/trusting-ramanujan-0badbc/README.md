# Integrated Lab Manager

Integrated Lab Manager is a modular monorepo for structured lab operations software.

## Current status

The first implemented module is **Protocol Manager**, a browser-based protocol designer for wet-lab workflows with structured JSON storage.

## Monorepo layout

```text
integrated-lab-manager/
├─ apps/
│  ├─ protocol-manager/      # implemented in this phase
│  ├─ supply-manager/        # placeholder
│  ├─ project-manager/       # placeholder
│  └─ funding-manager/       # placeholder
├─ packages/
│  ├─ ai-import/             # AI import instructions + helpers
│  ├─ types/                 # shared protocol TypeScript model
│  ├─ validation/            # validation + normalization helpers
│  ├─ utils/                 # ids + generic utility helpers
│  └─ ui/                    # shared lightweight UI primitives
├─ examples/
│  └─ protocols/             # example protocol JSON files
└─ docs/
```

## Technical direction

- TypeScript across repo
- React + Vite for Protocol Manager
- static frontend-first architecture
- canonical protocol JSON model with schema versioning and extension support
- localStorage persistence (autosave) for the first release

## Getting started

```bash
npm install
npm run dev
```

Then open the local URL shown by Vite.

## GitHub Pages

The Protocol Manager app is configured to deploy to GitHub Pages from the `main` branch via GitHub Actions.

- Production URL: `https://euchiz.github.io/ILM/`
- Workflow file: `.github/workflows/deploy-protocol-manager-pages.yml`

For local development, the app still runs at `/`. For the GitHub Pages build, the workflow sets `VITE_BASE_PATH=/ILM/` so static assets resolve correctly on the project site URL.

## Supabase backend

ILM is moving from browser-only storage to Supabase (Postgres + Auth) while keeping the frontend static and deployable to GitHub Pages. No custom backend server is required.

### Auth and workspace model

- Each user has a personal account via Supabase Auth (email + password).
- Users belong to one or more `labs` (shared workspaces) through `lab_memberships` with a role of `owner`, `admin`, or `member`.
- All lab data (projects, protocols, revisions) is scoped to a `lab_id` and protected by Row Level Security. Authorization is driven by membership rows, not by the client.

### Keys and secrets

Only two values are needed in the browser. Both are safe to ship:

- `VITE_SUPABASE_URL` — your project URL, e.g. `https://xxxx.supabase.co`
- `VITE_SUPABASE_ANON_KEY` — the project's anon (public) API key

**Never** place the Supabase service-role key in the frontend, in `.env*` files, or in GitHub Actions logs. It bypasses RLS and must live only in the Supabase dashboard or trusted server-side tooling.

### One-time Supabase setup

1. Create a project at https://supabase.com.
2. In the SQL editor (or via `supabase db push` if you use the CLI), apply the migrations under [`supabase/migrations/`](supabase/migrations/). This creates `profiles`, `labs`, `lab_memberships`, `projects`, `protocols`, `protocol_revisions`, plus triggers and RLS policies.
3. In **Authentication → Providers**, enable Email. Set the Site URL to your GitHub Pages URL (e.g. `https://euchiz.github.io/ILM/`) and add it under Redirect URLs.
4. Copy the project URL and the anon public key from **Settings → API**.

### Local development

Copy `.env.example` to `.env.local` at the repo root (or inside `apps/protocol-manager/`) and fill in your values:

```bash
cp .env.example .env.local
# then edit .env.local
```

Vite will pick these up automatically when you run `npm run dev`.

### GitHub Pages deployment

Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as **Repository Secrets** (Settings → Secrets and variables → Actions). The deploy workflow injects them into the build step as environment variables so they land in the bundle. Changing a secret requires re-running the workflow.

### Migrations

SQL migrations live in [`supabase/migrations/`](supabase/migrations/). Apply them in order via the Supabase SQL editor or the Supabase CLI (`supabase db push`).
