# ILM — Next stage plan

Rewrite this file when priorities change. It always describes *the current planned next stage*, not historical stages.

---

## Stage 4d: Funding Manager — grants, budgets, expenses

**Why now.** Protocol (Stage 3), Account (Stage 4a), Project (Stage 4b), and Supply (Stage 4c) are all in production. The remaining authorial gap is money: PIs need to know what grants are open, how the budget is allocated across projects, and what's been spent. The `funding-manager` app is currently an auth-shell stub with no schema. Building it on the same UI kit + Supabase RLS + audit pattern that Supply just validated keeps the lift modest.

**Scope for this stage.** Three capabilities:

1. **Grants** — lab-scoped funding sources (agency, grant number, PI, period, total amount, status).
2. **Budgets / allocations** — per-grant line items grouped by category (personnel, supplies, equipment, travel, other) and optionally allocated to specific projects so PIs can see how a grant is divided.
3. **Expenses** — actual charges against an allocation, with date / amount / vendor / description / linked supply order or project. The Supply Manager's `orders` table is the natural feed for supply expenses; this stage adds the manual-entry path and the link.

Out of scope for this stage: invoice scanning, multi-currency, automatic feeds from institutional accounting, payroll burden calculations, cost-share tracking. Deferred to follow-ups.

### Step 1 — Schema migration

Create `supabase/migrations/YYYYMMDDHHMMSS_funding_manager.sql`:

- `grants` — `(id, lab_id, name, agency, grant_number, pi_user_id nullable, status: planning/active/closed/awarded/rejected, total_amount numeric, currency text default 'USD', period_start date, period_end date, notes, created_by, timestamps)`. RLS lab-scoped.
- `grant_allocations` — `(id, grant_id, lab_id, project_id nullable, category: personnel/supplies/equipment/travel/other, label text, allocated_amount numeric, notes, timestamps)`. A null `project_id` means lab-wide / unassigned.
- `expenses` — `(id, lab_id, grant_id, allocation_id nullable, project_id nullable, supply_order_id nullable, description, vendor, amount numeric, occurred_at date, recorded_by, notes, timestamps)`.
- `updated_at` triggers on all three.
- **RLS** — read for any lab member; create/edit/delete for lab admins. Loosen later if PIs want member-recorded expenses.
- **RPCs (SECURITY DEFINER, audit-logged)** — `create_grant`, `update_grant`, `archive_grant`; `create_allocation`, `update_allocation`, `delete_allocation`; `record_expense`, `update_expense`, `delete_expense`. Audit each state-changing call.
- **Audit** — entries on grant status changes, allocation create/delete, expense create/update/delete. Routine field edits on a grant can stay un-logged.

### Step 2 — Shared types + adapter

- `apps/funding-manager/src/lib/cloudAdapter.ts` mirrors `apps/supply-manager/src/lib/cloudAdapter.ts` — exported types + the seven hydration query + per-RPC helpers.
- `apps/funding-manager/src/lib/useFundingWorkspace.ts` mirrors `useSupplyWorkspace`: snapshot state, identity-aware action wrappers, `hydrate()` after each mutation.

### Step 3 — Frontend screens

Tabs in `apps/funding-manager` (built on `@ilm/ui` primitives — `AppShell` / `Panel` / `Table` / `Modal` / `Button` / `StatusPill`, etc., same approach Supply Manager just validated):

- **Grants** — list with search + status filter; cards show agency, grant #, PI, period, totals (allocated vs. spent vs. remaining). Admin actions: New / Edit / Archive.
- **Budget** — per-grant breakdown: allocations grouped by category, with project breakdown beneath. Spent / remaining bar per allocation.
- **Expenses** — table with date / vendor / category / project / amount; filters by grant / project / category / date range. "Link supply order" picker pulls from `orders` so supply receipts can be charged in one click.
- **Overview** — lab-level dashboard: total active funding, spend by category, top grants by remaining balance, expiring-soon banner.

### Step 4 — Cross-app link from Supply

When a supply order is marked received, surface a "Charge to grant" button in the order card that opens a Funding Manager modal pre-filled with the order's vendor / total / linked project. Saves an `expenses` row pointing back at the supply order. No schema change needed beyond the optional `supply_order_id` column on `expenses`.

### Step 5 — Deployment + docs

- Funding Manager is already wired into `.github/workflows/deploy-protocol-manager-pages.yml`; just verify the build still passes.
- Update `docs/features.md` with a "Funding Manager (Stage 4d)" section on ship.

### Tradeoffs

- **Allocation granularity.** v1 lets allocations target a project or stay lab-wide; further sub-budgeting (per-experiment, per-investigator) is out of scope. Add a parent allocation FK later if labs ask for nesting.
- **Expense source.** Manual entry + supply-order link covers ~90% of charges for a small lab. Institutional ERP feeds, P-card imports, and effort reporting are deferred to a follow-up stage.
- **Status machine.** Grants get a flat status field rather than a draft/review workflow — the data is administrative, not authorial, and a single lab admin enters it. If grant *applications* (pre-award) become a use case, revisit with a draft/submit/reject flow modeled on the Project review gating.

---

## After this stage

- **UI kit Phase E.** Write `packages/ui/README.md` + `docs/design-system.md` covering the primitives, the `--rl-*` token contract, and the "first use local, second use promote" rule. Phase D is already done (Account / Project / Protocol all run on `AppShell`).
- **Stage 4e — Supply Manager v2.** Per-experiment consumption logging (links `experiments` to a new `stock_movements` ledger), supplier/catalog import, barcode scanning, lot/expiry alerts. The current single-row-per-item stock model upgrades to an append-only ledger when this lands.
- **Stage 4f — Reporting / exports.** Cross-app digests: weekly lab-activity summary, grant-period spend report, protocol publication log. Probably edge-function generated, surfaced as a downloadable HTML/PDF.
- **Rotatable share-link token.** Today the Account share link embeds a raw lab UUID. A signed HMAC with a server-stored secret + a "rotate" button in the share-link section would make leaked links revocable.
- **Deferred housekeeping.** Fractional `sort_order`, layout polish (InfoTab responsive grid, roadmap card ellipsis, recycle-bin visual differentiation), dead-code simplify pass.
