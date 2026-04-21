# Stage 4 — Extend auth/lab shell to the other apps

Stage 4 wires `funding-manager`, `project-manager`, and `supply-manager`
onto the same Supabase foundation that protocol-manager uses, plus the
cross-app admin surfaces (member management, project-lead assignment)
that Stage 3 deliberately deferred.

**Non-negotiable carried over from earlier stages:** these domains use
**normalized tables**, not `document_json`. That JSONB payload is
protocol-specific and does not generalise.

## Who owns what

| Domain | App | Source of truth | Review flow? |
|---|---|---|---|
| Projects, milestones, experiments | `project-manager` | `projects`, `milestones`, `experiments` | No (members edit directly; audit via `created_by` / `updated_by`) |
| Reagents, vendors, inventory, orders | `supply-manager` | `reagents`, `vendors`, `inventory_counts`, `orders` | No |
| Grants, budgets, allocations, expenses | `funding-manager` | `grants`, `budgets`, `allocations`, `expenses` | **Yes** for budget commits; all members can propose, admins/leads approve |
| Protocols | `protocol-manager` | `protocols` + drafts/submissions (Stage 3) | Yes (Stage 3) |

Review flow reused only where it makes sense — for funding, a
simplified variant of the Stage-3 submission model.

## Shared groundwork (lands first in Stage 4)

### 4.0 — Cross-app navigation + per-app AuthGate

- `apps/funding-manager/src/main.tsx`, `apps/project-manager/src/main.tsx`,
  `apps/supply-manager/src/main.tsx` — each wraps its app in `<AuthGate>`
  and imports `@ilm/ui/auth.css` (same pattern as protocol-manager).
- `packages/ui` — add an `AppSwitcher` component (small header nav) that
  links between the 4 apps. Each deployed app is its own GitHub Pages
  subpath; the switcher uses `import.meta.env.BASE_URL` + known
  app-base mapping.
- Decide whether the 4 apps remain separate Vite builds (today) or get
  merged into one SPA. Default: keep separate builds, ship the switcher
  as a small cross-link row. Revisit if routing between them feels
  painful.

### 4.1 — Member & lead management UI

New area inside `packages/ui`, mountable from any app:

- `<LabMembersPanel />`
  - Admins see the full lab roster with roles.
  - Actions: promote to admin / demote to member; remove member (with
    confirmation); invite by email (via the existing Supabase "invite
    user" flow — needs a small server-side piece or Supabase dashboard
    for now).
- `<ProjectLeadsPanel projectId>`
  - Admins assign/revoke project leads using `assign_project_lead` /
    `revoke_project_lead` from Stage 3a.
  - Used from project-manager's project detail view.

Dependencies:

- Add `invite_member_to_lab(p_lab_id, p_email, p_role)` RPC
  (SECURITY DEFINER; admin-only). In the first cut this can just insert
  a pending row into a new `lab_invitations` table; email delivery
  itself is handled by Supabase Auth (invite flow) or out-of-band.

### 4.2 — Shared typed client layer

Grow `packages/utils` (or a new `packages/db`) with per-table typed
adapters to avoid every app re-implementing the same `.from(...)` +
error-surfacing boilerplate:

```
export const labScoped = <T>(table: string, labId: string) =>
  supabase.from(table).select('*').eq('lab_id', labId);
```

Plus shape types derived from the DB. Don't auto-generate — hand-write
per table so JSON column shapes stay intentional.

## Per-app cutovers

Each follows the same template:

1. **Migration** — new tables + RLS. All lab-scoped; SELECT for
   members, INSERT/UPDATE for members (or RPC-gated if review is
   required), DELETE policy per domain.
2. **Adapter** — `apps/<app>/src/lib/cloudAdapter.ts` wrapping RPCs and
   SELECTs.
3. **Hook** — `apps/<app>/src/lib/use<Domain>.ts` hydrating on
   `activeLab.id` change.
4. **App.tsx refactor** — replace any localStorage state with the hook.
5. **Import/export** — if the existing app has JSON import/export,
   preserve it; translate payload ⇄ normalized rows on the adapter edge.

### 4.A — project-manager

**Tables** (proposed):

```sql
create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references labs(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  description text,
  due_date date,
  status text check (status in ('planned','in_progress','done','cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.experiments (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references labs(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  protocol_id uuid references protocols(id) on delete set null,
  title text not null,
  notes text,
  status text check (status in ('planned','running','completed','failed')),
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- RLS: member read/write; admin delete.
- `experiments.protocol_id` is the cross-app handshake with
  protocol-manager — clicking an experiment opens the referenced
  protocol.

**UI highlights**:

- Project detail page: metadata + milestones table + experiments list +
  `<ProjectLeadsPanel>`.
- Project list: card per project showing counts.

### 4.B — supply-manager

**Tables** (proposed):

```sql
create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references labs(id) on delete cascade,
  name text not null,
  website text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reagents (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references labs(id) on delete cascade,
  name text not null,
  cas_number text,
  catalog_number text,
  vendor_id uuid references vendors(id) on delete set null,
  unit text,            -- e.g. "mg", "mL"
  storage text,         -- e.g. "-20°C"
  hazard_class text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inventory_counts (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references labs(id) on delete cascade,
  reagent_id uuid not null references reagents(id) on delete cascade,
  quantity numeric not null,
  counted_at timestamptz not null default now(),
  counted_by uuid references auth.users(id) on delete set null,
  notes text
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references labs(id) on delete cascade,
  reagent_id uuid references reagents(id) on delete set null,
  vendor_id uuid references vendors(id) on delete set null,
  quantity numeric,
  unit_price numeric,
  currency text default 'USD',
  status text check (status in ('requested','ordered','received','cancelled')),
  ordered_at timestamptz,
  received_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- RLS: member read/write; delete admin-only.
- Link to protocols later: `protocols.document_json` already references
  reagents by id inside its body. Stage 4 adds `reagents.id` as the
  canonical reference; import/export of protocols should map.

**UI highlights**:

- Reagent table with search + low-stock flag (derived from latest
  `inventory_counts.quantity`).
- Order queue with status transitions.

### 4.C — funding-manager

**Tables** (proposed):

```sql
create table public.grants (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references labs(id) on delete cascade,
  title text not null,
  funder text,
  grant_number text,
  total_amount numeric,
  currency text default 'USD',
  start_date date,
  end_date date,
  status text check (status in ('proposed','active','closed','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references labs(id) on delete cascade,
  grant_id uuid not null references grants(id) on delete cascade,
  category text not null,      -- e.g. "reagents", "equipment", "personnel"
  planned_amount numeric not null default 0,
  currency text default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.allocations (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references labs(id) on delete cascade,
  budget_id uuid not null references budgets(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  amount numeric not null,
  currency text default 'USD',
  status text check (status in ('proposed','committed','declined')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references labs(id) on delete cascade,
  allocation_id uuid references allocations(id) on delete set null,
  order_id uuid references orders(id) on delete set null,
  amount numeric not null,
  currency text default 'USD',
  incurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
```

- RLS: member read. `grants`, `budgets`, `expenses` write by members;
  `allocations.status = 'committed'` flip requires an RPC that checks
  caller is a lab admin. Simplified review flow vs. the protocol
  draft/submission split.
- RPCs:
  - `propose_allocation`, `commit_allocation` (admin-only),
    `decline_allocation` (admin-only).

**UI highlights**:

- Grant dashboard: remaining vs. committed per category.
- Allocation review queue (admin view).
- Expenses autopopulate from `orders.received` where
  `orders.created_by` linked the allocation (cross-app: supply-manager
  writes the order, funding-manager stamps it as an expense).

## Cross-cutting: identity & naming

- Lab slugs remain unique (already enforced by schema).
- Profile display_name becomes user-facing everywhere (already in
  `profiles`). Consider a profile-edit screen in `packages/ui` so
  users can update their display name without touching the DB.
- All list views should use server-side `order(...)` — avoid sorting
  large arrays client-side.

## Sequencing

- **PR-4.0** — shared: `AppSwitcher`, `<LabMembersPanel>`,
  `<ProjectLeadsPanel>`, `invite_member_to_lab` RPC + `lab_invitations`
  table. Touches `packages/ui` and all 4 app `main.tsx`.
- **PR-4.A** — project-manager cutover + `milestones` / `experiments`
  migration.
- **PR-4.B** — supply-manager cutover + `vendors` / `reagents` /
  `inventory_counts` / `orders` migration.
- **PR-4.C** — funding-manager cutover + `grants` / `budgets` /
  `allocations` / `expenses` migration + commit-allocation RPC.
- **PR-4.D (optional)** — cross-app links (experiment ⇄ protocol,
  order ⇄ allocation/expense).

Each PR should:

- Ship its migration(s) applied on the Supabase project before the
  corresponding frontend lands.
- Keep JSON import/export parity for any domain that had it previously.
- Run `npm run typecheck && npm run lint && npm run build` cleanly.

## Out of scope for Stage 4

- Mobile layout / PWA packaging.
- Realtime collaboration (still explicit refresh).
- Fine-grained attachments (file upload to Supabase Storage) — likely
  its own small stage before Stage 4.D if funding-manager needs receipts.
- Cross-lab federation / sharing.
- Analytics / reporting layer (dashboards that aggregate across the 4
  domains).

## Acceptance for Stage 4 as a whole

- [ ] Signing in and selecting a lab surfaces all 4 apps from a common
      switcher.
- [ ] Each app shows data scoped to the active lab only.
- [ ] Admins can manage membership and project leads from a single
      place reachable in every app.
- [ ] Protocol ⇄ experiment references resolve both ways (optional —
      nice-to-have for 4.D).
- [ ] No remaining `localStorage.setItem` of domain data in any app.
- [ ] RLS: attempting any write as a non-member via the REST API fails
      with 42501.
