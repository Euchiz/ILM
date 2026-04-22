# ILM — Next stage plan

Rewrite this file when priorities change. It always describes *the current planned next stage*, not historical stages.

---

## Stage: Funding Manager schema + adapter

**Why now.** With membership surfaces shipped in the Account app, the remaining auth-shell stubs (`funding-manager`, `supply-manager`) are the biggest gap. Funding first because it's a cleaner domain model (grants / budgets / allocations / expenses) and because project-manager already has experimental expense fields that funding should take over.

### Backend

New migration `YYYYMMDDHHMMSS_funding_manager.sql`:

- `grants` (lab_id, funder, title, amount, start_date, end_date, status, notes)
- `budgets` (grant_id, fiscal_year, amount)
- `allocations` (budget_id, project_id, amount, status: proposed/committed/declined)
- `expenses` (allocation_id, amount, category, occurred_on, description, submitted_by)
- RLS modeled on `projects`: lab-scoped, read for members, write for admins + project leads.
- RPCs: `propose_allocation`, `commit_allocation`, `decline_allocation` (admin-only), `submit_expense`, `approve_expense`, `reject_expense`.
- `audit_log` entries on commit / decline / approve / reject.

### Frontend

- `apps/funding-manager` adapter + hooks mirroring `useProjectWorkspace`.
- Screens: Grants overview, Budget drill-down, Allocation queue (admin review), Expense ledger.
- Reuse `SubmissionHistoryLink`, `LabMembersPanel` removed from the app (lives in Account shell now).

### Tradeoffs

- **Scope.** A first pass can ship grants + budgets + allocations and defer expenses. Recommend doing the full loop so expense approval surfaces the audit pattern before supply-manager copies it.
- **Source of truth for committed dollars.** Allocations vs. expenses: commit-at-allocation keeps budgets tidy; commit-at-expense is more accurate but churns dashboards. Recommend commit-at-allocation with expense = actuals.

---

## After this stage

- **Stage 4c (supply-manager)** — schema design + adapter + UI; reuse funding's audit pattern for order/receive transitions.
- **Rotatable share-link token**. Today the Account share link embeds a raw lab UUID. A signed HMAC with a server-stored secret + a "rotate" button in `LabShareLinkPanel` would make leaked links revocable.
- **Deferred housekeeping**: fractional `sort_order`, layout polish (InfoTab responsive grid, roadmap card ellipsis, recycle-bin visual differentiation), dead-code simplify pass.
