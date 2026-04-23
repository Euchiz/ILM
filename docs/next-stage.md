# ILM — Next stage plan

Rewrite this file when priorities change. It always describes *the current planned next stage*, not historical stages.

---

## Stage 4c-pre: Shared UI kit (before Supply Manager)

**Why now.** Protocol, Project, and Account each grew their own `styles.css` (2810 / 1060 / 454 lines). Tokens are already shared via `packages/ui/src/tokens.css`, but every app aliases them under a different prefix and reimplements the same button / card / tab / table / modal patterns. Building Supply Manager on this as-is would mean another 1000-line copy-paste or visual drift. Do the foundation first so Supply is built *on* the kit, not retrofitted later.

**Scope.** Phases A + B + C from [`ui-alignment.md`](ui-alignment.md):

- **Phase A — Token hygiene** (~0.5 day): delete per-app alias vars (`--ilm-*`, `--pm-*`, `--acct-*`), use `--rl-*` directly; codify radii / shadows / spacing / z-index into `tokens.css`; add `@ilm/ui/reset.css` for shared boilerplate.
- **Phase B — Primitives** (~1–2 days): extract `Button`, `Input/Textarea/Select/FormField`, `Card/Panel/SectionHeader`, `Tabs`, `Modal/Drawer/ConfirmDialog`, `Table`, `Badge/Tag/StatusPill`, `EmptyState/ErrorBanner/InlineToast` from Protocol Manager into `@ilm/ui/primitives/`. Each exposes `className` pass-through + CSS-var variant slots for extension.
- **Phase C — AppShell** (~0.5 day): single `<AppShell>` owning top bar (lab switcher + `AppSwitcher` + `AccountLinkCard`), page container, nav slot. Collapse the per-app variants.

Phases D (migrate Account / Project / Protocol) and E (docs) are deferred until after Supply Manager ships — the kit gets battle-tested on Supply first, then the legacy apps migrate.

**Exit criteria.** Supply Manager's screens can be built without re-implementing any primitive that's already in the kit (buttons, cards, modals, tabs, tables, badges, inputs). App-specific *compositions* are fine — e.g. the Storage tab's location tree view lives in `apps/supply-manager` on first use, following the "first use local, second use promote" rule from [`ui-alignment.md`](ui-alignment.md).

See [`ui-alignment.md`](ui-alignment.md) for the full plan, extension contract, and re-skinning story.

---

## Stage 4c: Supply Manager — stock + orders

**Why now.** Protocol Manager (Stage 3), Account (Stage 4a), and Project Manager (Stage 4b) are in production. Day-to-day bench work depends on knowing what reagents/consumables are on hand and what's on order; funding/accounting (Stage 4d) can wait. Supply is also a prerequisite for linking experiments to actual consumption. The `supply-manager` app is currently an auth shell with no schema. **Built on top of the shared UI kit from Stage 4c-pre** — no new one-off component CSS.

**Scope for this stage.** Three capabilities:

1. **Items + stock** — a lab-scoped catalog of supply items (reagents, consumables, equipment) with current quantity on hand and storage location.
2. **Orders** — purchase requests that flow pending → ordered → received (or cancelled), with receipt quantities feeding back into stock.
3. **Storage locations** — a shallow hierarchy (room → shelf/freezer/fridge) so items can be filed and found.

Out of scope for this stage: lot/expiry tracking per receipt, barcode scanning, per-experiment consumption logging, supplier/catalog integrations. Deferred to follow-ups.

### Step 1 — Schema migration

Create `supabase/migrations/YYYYMMDDHHMMSS_supply_manager.sql`:

- `storage_locations` — `(id, lab_id, parent_id nullable, name, kind: room/shelf/freezer/fridge/cabinet/other, notes, timestamps)`; RLS lab-scoped; admin write, member read.
- `supply_items` — `(id, lab_id, name, category, unit (e.g. mL/box/tube), vendor, catalog_no, reorder_threshold numeric, location_id nullable, notes, created_by, timestamps)`; unique `(lab_id, catalog_no)` partial index when catalog_no is not null.
- `stock_levels` — `(item_id primary key, on_hand numeric, updated_at, updated_by)`; kept in sync by the RPCs below (single row per item; simpler than a ledger for v1).
- `supply_orders` — `(id, lab_id, item_id, quantity numeric, status: pending/ordered/received/cancelled, requested_by, ordered_by, ordered_at, received_by, received_at, received_quantity numeric nullable, comment, timestamps)`.
- `updated_at` triggers on all four.
- **RLS** — lab-scoped via `lab_id` (or item's lab for `stock_levels`). Read for any lab member; create/edit items + locations restricted to `is_lab_admin` OR the item's `created_by`; all members can create orders (requests); only admins can transition to `ordered` / `cancelled`; `received` can be recorded by any admin or the original requester.
- **RPCs** (SECURITY DEFINER, audit-logged on state transitions):
  - `upsert_supply_item(...)` / `delete_supply_item(p_item_id)` — admin-only for delete.
  - `adjust_stock(p_item_id, p_delta numeric, p_reason text)` — manual correction; audit entry.
  - `request_supply_order(p_item_id, p_quantity, p_comment?)` — any member; status=pending.
  - `mark_order_ordered(p_order_id, p_comment?)` — admin; status=ordered, stamps `ordered_by/at`.
  - `mark_order_received(p_order_id, p_received_quantity, p_comment?)` — admin or requester; status=received, increments `stock_levels.on_hand` by `received_quantity`, stamps `received_by/at`.
  - `cancel_supply_order(p_order_id, p_comment)` — admin or requester; comment required.
- **Audit** — `_log_audit` entries on order state transitions and manual stock adjustments. Item/location edits are not logged.

### Step 2 — Shared types + adapter

- `packages/types`: `StorageLocation`, `SupplyItem`, `StockLevel`, `SupplyOrder`, status unions.
- `apps/supply-manager/src/adapters/useSupplyWorkspace.ts`: mirrors `useProjectWorkspace` — one subscription per lab, local normalization, optimistic updates on the RPC verbs.

### Step 3 — Frontend screens

Tabs in `apps/supply-manager`:

- **Stock** — searchable/filterable item table: name, category, location, on-hand vs. reorder threshold (visual flag when below), last-updated. Inline "Adjust" action opens a quantity diff modal (calls `adjust_stock`). "Request order" button prefills the order form.
- **Orders** — two sections: *Pending* (awaiting admin action with Order / Cancel buttons) and *In transit* (ordered, awaiting receipt, with Receive form). History log below. Admin-only actions gated on `activeLab.role`.
- **Storage** — tree view of locations (room → shelf/freezer) with item counts per node. Admin CRUD on locations.
- **Reorder alerts** — dashboard widget on the Stock tab: items below their `reorder_threshold` with a one-click "Request order" prefilled to the delta.

### Step 4 — Deployment + docs

- Register `supply-manager` build in `.github/workflows/deploy-protocol-manager-pages.yml`.
- Wrap the app in `<AppShell>` from `@ilm/ui` (introduced in Stage 4c-pre Phase C). `AppShell` already owns the top bar, `AppSwitcher`, and `AccountLinkCard` — don't mount them separately.
- Update `docs/features.md` with a "Supply Manager (Stage 4c)" section on ship.

### Tradeoffs

- **Single stock row vs. ledger.** v1 keeps one `on_hand` number per item, mutated by RPCs. A full append-only `stock_movements` ledger is more auditable but adds a table + join. We get 80% of the value from the audit log on the RPCs that touch stock; upgrade to a ledger when lot/expiry tracking lands.
- **Location hierarchy depth.** Two-level (room → container) is enough for most labs. Modeled as a self-referential `parent_id` so deeper nesting is possible without a schema change, but the UI only renders two levels for v1.
- **Order approval.** Skipping a pending→approved admin gate before ordering keeps the flow short; admins are the ones who actually place orders anyway, so the "place order" click is the de-facto approval. Revisit if labs want multi-admin sign-off.

---

## After this stage

- **UI kit Phases D + E.** Migrate Account / Project / Protocol onto the shared primitives; write `packages/ui/README.md` + `docs/design-system.md`. See [`ui-alignment.md`](ui-alignment.md).
- **Stage 4d — Funding Manager.** `grants / budgets / allocations / expenses` with RLS + SECURITY DEFINER RPCs + audit. Takes over the experimental expense fields currently on `projects`. Deferred because accounting is not blocking day-to-day lab use.
- **Stage 4e — Supply Manager v2.** Per-receipt lot/expiry tracking, supplier/catalog import, per-experiment consumption logging (links `experiments` to `stock_movements`).
- **Rotatable share-link token.** Today the Account share link embeds a raw lab UUID. A signed HMAC with a server-stored secret + a "rotate" button in the share-link section would make leaked links revocable.
- **Deferred housekeeping.** Fractional `sort_order`, layout polish (InfoTab responsive grid, roadmap card ellipsis, recycle-bin visual differentiation), dead-code simplify pass.
