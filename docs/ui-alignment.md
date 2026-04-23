# UI alignment plan

Shared design system for all ILM apps. Drafted 2026-04-23.

## Why

Protocol Manager, Project Manager, and Account each grew their own `styles.css` (2810 / 1060 / 454 lines). They already share `packages/ui/src/tokens.css` and the auth/admin shells, but every app reimplements the same button / card / tab / table / modal patterns and aliases shared tokens under a different prefix (`--ilm-*`, `--pm-*`, `--acct-*`). Building Supply Manager (Stage 4c) on this as-is guarantees either another 1000-line copy-paste or visual drift.

## Goal

Promote `@ilm/ui` into a real design system: tokens + reset + primitives + app shell. New apps compose from the shared kit instead of restyling. Future re-skins (e.g. importing a design from an AI tool) change `tokens.css` or swap a primitive, not every app.

## Non-goals

- Switching CSS strategy (Tailwind, CSS Modules, CSS-in-JS). Vanilla CSS + tokens works today; swapping is a separate decision.
- Vendoring shadcn/Radix. Revisit only if a future design import demands it.
- Exhaustive primitive coverage. Only extract patterns used in 2+ apps today or needed by Supply.

## Starting point

**Already shared (`packages/ui`):**
- `tokens.css` — Rhine Lab palette, type scale, spacing (imported by every app).
- `AuthProvider`, `AuthScreen`, `AuthGate`, `LabPicker` (+ `auth.css`).
- `AccountLinkCard`, `AppSwitcher`, `SubmissionHistoryLink`.
- Admin panels: `LabMembersPanel`, `LabJoinRequestsPanel`, `LabSettingsPanel`, `LabShareLinkPanel`, `ProjectLeadsPanel`.

**Duplicated per app:**
- Token alias layer (`--ilm-*`, `--pm-*`, `--acct-*` all point at the same `--rl-*`).
- Reset boilerplate (box-sizing, body bg, focus ring, button reset).
- Buttons, inputs, cards, tabs, tables, modals, badges, empty states.

## Phases

### Phase A — Token hygiene (~0.5 day)

1. Delete per-app alias variables. Use `--rl-*` directly across all apps. Also reconcile the font-family drift (Protocol uses `var(--rl-font-sans)`, Project/Account hard-code `"Space Grotesk", Arial, sans-serif`) — all apps should read the token.
2. Codify tokens that only exist inline today: radii, shadows, spacing scale, z-index layers, transition durations.
3. Add `@ilm/ui/reset.css` for the shared boilerplate each app's `styles.css` opens with. Add `"./reset.css": "./src/reset.css"` to `packages/ui/package.json` exports (alongside the existing `./tokens.css` and `./auth.css`). Each app imports `tokens.css` + `reset.css`.

**Payoff:** mechanical find-replace; makes Phase B primitives shareable without collisions.

### Phase B — Extract primitives ✅ shipped

Primitives live in `packages/ui/src/primitives/`, styles in `packages/ui/src/primitives/primitives.css` (exported as `@ilm/ui/primitives.css`), all scoped under `.rl-*`. Sourced from Project Manager (forms, panels, tabs, modal, feedback) and Protocol Manager (buttons, status badges).

Shipped:
- `Button` — variants: primary / secondary / ghost / danger / ink; sizes sm/md; `block` modifier.
- `FormField` + `Input`, `Textarea`, `Select`, `CheckboxField`, `FormRow` — label + hint + error contract; `invalid` prop swaps to error styling.
- `Panel`, `SectionHeader`, `CardGrid` — bordered container + titled section header + responsive card grid.
- `Tabs`, `TabButton`, `TabPanel` — controlled tabs with `aria-selected`.
- `Modal`, `ConfirmDialog` — backdrop + dialog with narrow/default/wide widths; Esc/backdrop dismiss; `ConfirmDialog` wraps Modal with primary/danger tone.
- `Table`, `TableEmpty`, `TableLoading` — sticky header, hover row, empty + loading rows.
- `Badge` (tones: neutral/info/success/warning/danger) + `StatusPill` (workflow statuses: draft/submitted/reviewing/reviewed/published/validated/active/archived/rejected/failed/blocked/proposed/cancelled/deleted/neutral).
- `EmptyState`, `ErrorBanner`, `InlineError`, `InlineNote`.

Deferred to first real demand under the "first use local, second use promote" rule: `Drawer`, `InlineToast`, table column-sort affordances, `Tag` as a distinct primitive from `Badge`.

**Extension contract** — every primitive exposes:
- `className` pass-through for ad-hoc overrides.
- Variant slots backed by CSS custom properties (`--rl-btn-bg`, `--rl-panel-bg`, `--rl-badge-fg`, `--rl-modal-width`, ...) so apps restyle a single usage without forking the primitive.

### Phase C — Shared app shell (~0.5 day)

Single `<AppShell>` in `@ilm/ui` owning:
- Top bar: product name, lab switcher, `AppSwitcher`, `AccountLinkCard`.
- Consistent page container (max-width, padding, breakpoints).
- Slot for app-specific tabs/nav.

Protocol, Project, Account each have their own variant today — collapse them.

### Phase D — Migrate legacy apps

Supply Manager is *not* part of this phase — it's built directly on A+B+C during Stage 4c and is the kit's first consumer. Phase D migrates the three pre-existing apps, ordered by risk:

1. **Account** — 454 lines, smallest legacy surface.
2. **Project Manager** — 1060 lines.
3. **Protocol Manager** — 2810 lines, highest risk. Last.

Each migration: replace app-local classes with primitives, delete dead CSS, visual parity check in browser.

### Phase E — Document (~0.5 day)

- `packages/ui/README.md` — primitive usage, props, do/don't.
- `docs/design-system.md` — token reference, when to add a new primitive vs. extend one, the "first use local, second use promote" rule.
- PR gate: no new one-off buttons/cards in app CSS.

## Expandability

Two questions come up whenever a new module is built or a new design is imported. Both are designed for.

**Adding new elements (e.g. supply tables, quantity steppers).**
- *Compose first.* A supply table = `<Table>` + `<StatusPill>` for stock + `<Button>` for row actions. No package change.
- *Promote on second use.* Something genuinely new (e.g. `QuantityStepper`, `LocationTreeSelect`) stays local on first use; when a second app needs it, lift into `@ilm/ui/primitives/`. Keeps the shared package from becoming a junkyard.

**Re-skinning to a different design (e.g. v0 / Figma Make / Claude Artifacts output).**
- *Recolor/re-type whole system.* Edit `tokens.css`. Every primitive re-skins in one commit.
- *Swap a primitive's shape/markup.* Replace the file under `@ilm/ui/primitives/`. Props stay stable, apps untouched.
- *Full overhaul.* Fork tokens into a new theme file, flip an import. If the imported design assumes Tailwind / shadcn / Radix, decide at that point whether to port classes to CSS vars or vendor the dependency once in `@ilm/ui`.

## Tradeoffs

- **Do UI before Supply vs. ship Supply first.** Phases A+B+C land before Supply so it's built *on* the kit (including `<AppShell>`), not retrofitted. Cost: ~2–3 days of delay. Payoff: Supply's screens cost less and the kit is immediately battle-tested. Phases D+E defer until after Supply ships.
- **Scope of Phase B.** Must be timeboxed — every pattern is extractable, but only patterns that have 2+ consumers today or are obviously needed by Supply belong in v1.
- **CSS strategy.** Sticking with vanilla CSS + tokens is the path of least resistance. A Tailwind migration is possible later but shouldn't be coupled to this work.

## Sizing

| Phase | Effort |
| --- | --- |
| A — token hygiene | 0.5 day |
| B — primitives | 1–2 days |
| C — app shell | 0.5 day |
| D — migrate Account | ~0.5 day |
| D — migrate Project Manager | ~1 day |
| D — migrate Protocol Manager | ~2 days |
| E — docs | 0.5 day |

Supply Manager (Stage 4c) is built on top of A+B+C, so it incurs no migration cost. Per-app estimates scale with `styles.css` line count and the depth of bespoke layout each app carries.
