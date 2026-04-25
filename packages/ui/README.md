# @ilm/ui

Shared React and CSS UI package for Integrated Lab Manager.

Import order for every app:

```ts
import "@ilm/ui/tokens.css";
import "@ilm/ui/reset.css";
import "@ilm/ui/primitives.css";
```

Use the package for shared shell, primitive controls, auth screens, app switching,
and lab administration panels. Keep app CSS for workflow-specific layout and
domain-specific compositions only.

## Shell

Use `AppShell`, `AppTopbar`, `AppSubbar`, `AppContent`, `AppSidebarSection`, and
`AppWordmark` for outer app structure.

```tsx
<AppShell sidebar={<Navigation />} sidebarAriaLabel="Module navigation">
  <AppTopbar title="Supply Manager" actions={<AppSwitcher currentApp="supply-manager" />} />
  <AppSubbar tabs={<ModuleTabs />} />
  <AppContent>
    <ModuleView />
  </AppContent>
</AppShell>
```

Restyle the shell with CSS custom properties instead of replacing the structure:

```css
.supply-shell {
  --rl-shell-sidebar-width: 280px;
  --rl-shell-content-max: 1280px;
}
```

If a module pins its sidebar with `position: sticky`, release that behavior under
the AppShell collapse breakpoint:

```css
@media (max-width: 900px) {
  .module-shell > .rl-shell-sidebar {
    position: static;
    height: auto;
    overflow-y: visible;
  }
}
```

## Primitives

Prefer shared primitives before adding app-local equivalents:

- `Button`: primary, secondary, ghost, danger, ink variants; sm/md sizes.
- `FormField`, `Input`, `Textarea`, `Select`, `CheckboxField`, `FormRow`.
- `Panel`, `SectionHeader`, `CardGrid`.
- `Tabs`, `TabButton`, `TabPanel`.
- `Modal`, `ConfirmDialog`.
- `Table`, `TableEmpty`, `TableLoading`.
- `Badge`, `StatusPill`.
- `EmptyState`, `ErrorBanner`, `InlineError`, `InlineNote`.

Every primitive accepts `className`. Most visual choices are backed by CSS custom
properties such as `--rl-btn-bg`, `--rl-panel-bg`, and `--rl-modal-width`, so a
single instance can be adapted without forking the component.

## Do / Don't

Do:

- Compose new module screens from shared shell and primitives first.
- Add app-local CSS only for workflow-specific arrangements.
- Promote a local component into `@ilm/ui` when a second app needs it.
- Keep responsive behavior aligned with AppShell breakpoints.

Don't:

- Add new one-off button, tab, modal, badge, table, or card styles in an app
  when an `@ilm/ui` primitive already covers the behavior.
- Recreate token aliases such as app-specific color or font variables.
- Override primitive markup to achieve a local visual effect; use `className` or
  CSS custom properties instead.

## Design Docs

- [`../../docs/design-system.md`](../../docs/design-system.md) - product design
  principles, typography, color, layout, asset rules, and PR gates.
- [`../../docs/ui-alignment.md`](../../docs/ui-alignment.md) - implementation
  plan and migration history for tokens, primitives, and the app shell.
