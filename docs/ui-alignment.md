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

### Phase C — Shared app shell ✅ shipped

Shell primitives live in `packages/ui/src/primitives/AppShell.tsx`, styles in
`packages/ui/src/primitives/primitives.css`, all scoped under `.rl-shell*` /
`.rl-topbar*` / `.rl-subbar*` / `.rl-content*` / `.rl-wordmark*`.

Shipped:
- `AppShell` — full-viewport grid with optional `sidebar` slot + `main` column; collapses to a single column under 900px.
- `AppTopbar` — `brand` / `kicker` / `title` / `subtitle` / `actions` slots; fits `AppSwitcher`, `AccountLinkCard`, and lab-context controls.
- `AppSubbar` — optional secondary strip with `kicker` / `description` / `tabs` slots for app-specific nav.
- `AppContent` — consistent page container with shared padding, `narrow` and `flush` modifiers, and a max-width ceiling.
- `AppWordmark` — product mark button (`glyph` + product / module lines) for returning to the module home.
- `AppSidebarSection` — labelled section inside the sidebar.

All variant slots are backed by CSS custom properties (`--rl-shell-sidebar-width`, `--rl-shell-topbar-bg`, `--rl-shell-content-max`, ...) so apps restyle locally without forking the primitive.

**First consumer.** Supply Manager (Stage 4c's placeholder shell) is now built directly on `AppShell` + `AppTopbar` + `AppContent` + shared `Panel` / `CardGrid` / `SectionHeader` primitives. Its `styles.css` is down to ~55 lines of truly supply-specific compositions (stat grid, hero card).

### Phase D — Migrate legacy apps ✅ shipped (shell migration)

Account, Project Manager, and Protocol Manager now all compose their outer shell from `@ilm/ui` primitives instead of per-app shell CSS:

- **Account** — `AppShell` with sidebar slot, `AppTopbar`, `AppSubbar` (tabs), `AppContent`, and `AppSidebarSection` for the left-panel boxes. The app-local `.acct-shell`, `.acct-main`, `.acct-topbar`, and `.acct-main-body` rules are gone; only `--rl-shell-sidebar-*` overrides + the inner card/section bits remain.
- **Project Manager** — `AppShell` with sidebar slot, `AppTopbar`, `AppContent`, and `AppSidebarSection` for the rail nav. `.pm-shell`, `.pm-main`, `.pm-topbar*`, and `.pm-main-body` have collapsed into token overrides + a thin `gap` tweak.
- **Protocol Manager** — `AppShell` (no sidebar), `AppTopbar`, and `AppSubbar` for both the home view and the module workspace. The app-local `.protocol-shell` keeps its viewport-locking behaviour via `.rl-shell-main` overrides since Protocol's body region (sidebar + workspace under the subbar) still uses a unique grid that doesn't fit `AppShell`'s sidebar slot. The distinctive serif italic wordmark stays as app-local markup rather than `AppWordmark`, which is styled for a green-square glyph.

Supply Manager was *not* part of this phase — it was built on A+B+C during Stage 4c and is the kit's first consumer.

What remains app-local (and should stay that way for now): Protocol Manager's two-column body layout (side rail + workspace under the subbar), all three apps' bespoke sidebar / rail visuals, and everything below the shell (cards, tables, editors).

### Phase E — Document - shipped

- `packages/ui/README.md` documents import order, shell usage, primitive inventory,
  customization hooks, responsive sidebar handling, and do/don't guidance.
- `docs/design-system.md` documents the Viridian Blue Labs direction, token
  expectations, primitive promotion rules, and PR gates.
- PR gate: no new one-off buttons/cards in app CSS when an `@ilm/ui` primitive
  already covers the behavior.

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
