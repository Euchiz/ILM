# Integrated Lab Manager

Integrated Lab Manager is a modular monorepo for structured lab operations software.

## Current status

Three apps are production-ready on Supabase with RLS-enforced workflows:

- **Protocol Manager** (Stage 3) — visual protocol designer with typed steps, draft → submit → review → publish flow, append-only revisions, and a 30-day recycle bin.
- **Account / Home** (Stage 4a) — lab-wide overview dashboard at the site root, with profile, lab membership, invitations, join requests, and share links living under hash routes (`#/team`, `#/settings`). Strict tier hierarchy (owner > admin > member).
- **Project Manager** (Stage 4b) — project lifecycle with milestones, experiments, roadmap drag-reorder, project leads, review-gated publish flow, and per-project GitHub repo activity.

**Supply Manager** (Stage 4c) is the current in-flight stage — see [`docs/next-stage.md`](docs/next-stage.md). **Funding Manager** (Stage 4d) is deferred. Both are scaffolded auth shells today.

## Monorepo layout

```text
integrated-lab-manager/
├─ apps/
│  ├─ protocol-manager/      # Stage 3  — production
│  ├─ account/               # Stage 4a — production
│  ├─ project-manager/       # Stage 4b — production
│  ├─ supply-manager/        # Stage 4c — in flight (auth shell only)
│  └─ funding-manager/       # Stage 4d — deferred (auth shell only)
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

- TypeScript across the monorepo (npm workspaces)
- React + Vite for every app
- Static frontend — no custom backend server; deployable to GitHub Pages
- Supabase (Postgres + Auth) for storage, with Row Level Security on every table
- Canonical protocol JSON model (`document_json`) with schema versioning; other domains use normalized columns
- Review-gated publishing: drafts are per-user sandboxes, submissions are frozen snapshots, revisions are written only on approval
- Soft-delete with 30-day recycle bin across protocols and projects

## Getting started

```bash
npm install
npm run dev
```

Then open the local URL shown by Vite.

## GitHub Pages

All five apps are bundled into a single GitHub Pages deploy from the `main` branch via GitHub Actions.

- Production URL: `https://euchiz.github.io/ILM/` — the home overview dashboard (Account app)
- Sibling apps live at `https://euchiz.github.io/ILM/protocol-manager/`, `/project-manager/`, `/supply-manager/`, `/funding-manager/`
- Workflow file: `.github/workflows/deploy-protocol-manager-pages.yml`

For local development, every app runs at `/`. For the GitHub Pages build, the workflow sets `VITE_BASE_PATH=/ILM/` for the home shell and `VITE_BASE_PATH=/ILM/<app>/` for each sibling so static assets resolve correctly on the project site URL.

## Role-based workflows

Each lab membership carries a role of `owner`, `admin`, or `member`. Roles are stored in `lab_memberships` and enforced by RLS.

- **Member** — can create personal drafts (protocols, projects), edit their own drafts, and submit them for review. Can view all published records in the lab.
- **Project lead** — a member designated via `project_leads` on a specific project. Inherits edit rights on that project's roadmap, milestones, and experiments.
- **Admin** — can approve or reject submissions, move items to the recycle bin, restore or permanently delete them, and manage project lead assignments.
- **Owner** — admin privileges plus lab-level settings (future: invitations, role changes).

Publishing flow (protocols and projects):

1. Member creates a draft (private, owner-scoped).
2. Member submits — a frozen snapshot is stored in `protocol_submissions` / project submission state.
3. Admin (or designated lead) approves → a new revision is appended and the record is published. Reject returns the draft with reviewer comments.
4. Projects marked `approval_required = false` (e.g. the auto-created "General" project) publish directly without the review step.

Recycle bin:

- Soft-delete sets `deleted_at`. Records are recoverable for 30 days, then eligible for permanent purge.
- Only admins see the recycle bin and can restore or permanently delete.

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
