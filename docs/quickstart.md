# ILM Quickstart

This guide gets a local ILM environment running against your Supabase project.

## 1) Prerequisites

- Node.js 24+ (recommended)
- npm 11+
- A Supabase project you control

> HPC note: if `npm` is unavailable on host, run npm commands via Singularity:
>
> ```bash
> singularity exec --bind /mnt/isilon/wang_lab/zac/projects/ILM:/work docker://node:24-slim sh -c "cd /work && <npm command>"
> ```

## 2) Clone + install

```bash
git clone https://github.com/Euchiz/ILM.git
cd ILM
npm install
```

## 3) Configure environment

Create `.env.local` at repo root:

```bash
cp .env.example .env.local
```

Set:

```bash
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-public-key>
```

Only use the **anon** key in frontend env. Do **not** use the service-role key.

## 4) Apply Supabase schema

Run all SQL migrations in `supabase/migrations/` (via Supabase SQL editor or Supabase CLI):

- Tables include labs/memberships, protocols, projects, supply, scheduler, funding directory, and data hub domains.
- RLS policies are included in migrations and are required for correct app behavior.

## 5) Run locally

From repo root:

```bash
npm run dev
```

This starts workspace dev servers (per root scripts). Open the URL shown by Vite.

## 6) Useful commands

```bash
npm run build
npm run lint
npm run typecheck
```

If your environment needs containerized npm, wrap each command with the Singularity command shown above.

## 7) GitHub Pages deployment essentials

In GitHub repository settings, add Actions secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Deploy pipeline builds static bundles for root + sibling app paths under `/ILM/`.

## 8) First-run sanity checks

After sign-up/sign-in:

1. Create a lab in the lab picker.
2. Verify Home (`/ILM/`) loads dashboard cards.
3. Open Protocol / Project / Supply / Scheduler / Data Hub and confirm data reads/writes succeed.
4. Confirm role-based behaviors (member vs admin/owner) are enforced.

## 9) Where to look next

- Current delivered capabilities: `docs/features.md`
- Planned next stage: `docs/next-stage.md`
- New module scaffolding: `docs/module-development.md`
