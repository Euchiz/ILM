# ILM — Next stage plan

Rewrite this file when priorities change. It always describes *the current planned next stage*, not historical stages.

---

## Stage: Funding Manager (Stage 4b)

**Why now.** Account app is complete. Of the remaining auth-shell stubs (`funding-manager`, `supply-manager`), funding has a cleaner domain model and project-manager already carries experimental expense fields that funding should take over — blocking cleanup there until funding lands.

### Step 1 — Schema migration

Create `supabase/migrations/YYYYMMDDHHMMSS_funding_manager.sql`:

- `grants` — `(id, lab_id, funder, title, amount_total numeric, currency, start_date, end_date, status: active/closed, notes, created_by, timestamps)`
- `budgets` — `(id, grant_id, fiscal_year int, amount numeric, notes)`; unique `(grant_id, fiscal_year)`
- `allocations` — `(id, budget_id, project_id, amount numeric, status: proposed/committed/declined, reviewed_by, reviewed_at, comment, created_by, timestamps)`
- `expenses` — `(id, allocation_id, amount numeric, category, occurred_on date, description, submitted_by, status: submitted/approved/rejected, reviewed_by, reviewed_at, comment, timestamps)`
- `updated_at` trigger on all four tables.
- **RLS**: lab-scoped via the parent chain (`grants.lab_id` → `budgets.grant_id` → `allocations.budget_id` → `expenses.allocation_id`). Read for any lab member; write on grants/budgets restricted to `is_lab_admin`; allocations writable by admins + project leads of the target project; expenses submittable by project leads and approvable by admins.
- **RPCs** (all SECURITY DEFINER, emit `_log_audit`):
  - `propose_allocation(p_budget_id, p_project_id, p_amount)` — inserts with status=proposed
  - `commit_allocation(p_allocation_id, p_comment?)` / `decline_allocation(p_allocation_id, p_comment)` — admin-only
  - `submit_expense(p_allocation_id, p_amount, p_category, p_occurred_on, p_description)` — project-lead or admin
  - `approve_expense(p_expense_id, p_comment?)` / `reject_expense(p_expense_id, p_comment)` — admin-only; reject requires comment
- **Audit**: entries on `commit / decline / approve / reject` (mirror project review pattern); draft edits are not logged.

### Step 2 — Remove experimental fields from `projects`

Project-manager carries in-progress expense-ish columns that predate the funding model. Drop them in the same migration (or an immediately-following one) once funding owns the domain — list them during the migration write-up. Guard with a data-migration step if any rows are populated.

### Step 3 — Shared types + adapter

- `packages/types`: `Grant`, `Budget`, `Allocation`, `Expense`, status unions.
- `packages/ui` (or `apps/funding-manager/src/adapters`): `useFundingWorkspace` hook mirroring `useProjectWorkspace` — one subscription per lab, local normalization, optimistic updates on the RPC verbs above.

### Step 4 — Frontend screens

- **Grants overview** — table of grants with fiscal-year budgets inlined; admins can create/edit/close.
- **Budget drill-down** — per-grant view: budget vs. committed vs. expensed; per-project allocation rows; inline allocation proposals for project leads.
- **Allocation queue** — admin review surface; approve/decline with optional comment; mirror the project review UX.
- **Expense ledger** — per-allocation entry log; submit form for leads; approval queue for admins with required-comment rejection.
- Reuse `SubmissionHistoryLink` pattern for per-allocation history.

### Step 5 — Deployment + docs

- Register the app in `.github/workflows/deploy-protocol-manager-pages.yml` (build step + artifact copy).
- Add `AccountLinkCard` to the funding-manager shell.
- Update `docs/features.md` under a new "Funding Manager (Stage 4b)" section once shipped.

### Tradeoffs

- **Scope of first ship.** Could stop after allocations (grants → budgets → allocations) and defer expenses. Recommend shipping the full loop so expense approval surfaces the audit pattern before supply-manager copies it.
- **Source of truth for committed dollars.** Allocations vs. expenses: commit-at-allocation keeps budgets tidy; commit-at-expense is more accurate but churns dashboards. Recommend commit-at-allocation with expense = actuals.
- **Currency.** Single-currency per grant column keeps math simple. Multi-currency conversion is explicitly out of scope for this stage.

---

## After this stage

- **Stage 4c — Supply Manager.** Schema design + adapter + UI; reuse funding's audit pattern for order/receive transitions.
- **Rotatable share-link token.** Today the Account share link embeds a raw lab UUID. A signed HMAC with a server-stored secret + a "rotate" button in the share-link section would make leaked links revocable.
- **Deferred housekeeping**: fractional `sort_order`, layout polish (InfoTab responsive grid, roadmap card ellipsis, recycle-bin visual differentiation), dead-code simplify pass.
