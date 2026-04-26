# Adding a new ILM module (Facility, Funding, …)

Every ILM module — Account/home, Project Manager, Protocol Manager, Supply
Manager, Funding Manager (Stage 4d), the upcoming Facility / Calendar
modules — ships as its own Vite app under `apps/<name>/` but renders inside
the **shared `<LabShell>` chrome** from `@ilm/ui`. That gives the user a
consistent left sidebar (10 nav items), topbar, profile orb, and sign-out
button across every page, even though each app deploys to its own URL
(`/ILM/<name>/`).

Use this guide when scaffolding a new module. Reading it should take five
minutes; following it is mostly copy/paste.

---

## 1. Pick the nav slot

`LabNavId` (in [packages/ui/src/LabShell.tsx](../packages/ui/src/LabShell.tsx))
is the closed enum of sidebar items:

```
"overview" | "projects" | "protocols" | "inventory" |
"funding"  | "calendar" | "team"      | "analytics" |
"reports"  | "settings"
```

If your module corresponds to one of these slots, use that id directly. The
sidebar will mark it active.

If your module is brand new (e.g. **"facility"**), add it to `LabNavId` and
the `NAV_ITEMS` table in `LabShell.tsx`. For each new id, supply:

- a glyph (single Unicode character)
- a `buildHref` callback. If your module is its own app, it's
  `(_, base) => appUrl("<your-app>/", base)`. If it's an internal route on
  the home shell, it's `(root) => \`${root}#/<your-route>\``.
- a `tone`: `"external"` for a sibling app, `"internal"` for a hash route on
  the home shell, `"soon"` for a placeholder.

> Bias toward reusing an existing slot — adding a new top-level item is a
> design decision, not just a code change. Check with the design lead first.

## 2. Scaffold the Vite app

```
apps/<your-app>/
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  src/
    main.tsx
    App.tsx
    styles.css
```

Copy the smallest existing app (`apps/funding-manager`) as a template — it
already wires `AuthGate`, the `LabShell`, and the right CSS imports.

Keep your `vite.config.ts` minimal:

```ts
import { defineConfig } from "vite";
const base = process.env.VITE_BASE_PATH ?? "/";
export default defineConfig({ base, server: { port: 51XX } });
```

Pick an unused dev port (5173–5180 are taken). The `VITE_BASE_PATH` env var
is what the deploy workflow uses to mount your dist under
`/ILM/<your-app>/`.

## 3. Wire the shell

Your `App.tsx` should look like this:

```tsx
import {
  CardGrid,
  LabShell,
  LabTopbar,
  Panel,
  SectionHeader,
  useAuth,
} from "@ilm/ui";

const APP_BASE_URL = import.meta.env.BASE_URL;

export const App = () => {
  const { activeLab } = useAuth();

  return (
    <LabShell
      activeNavId="facility"          // matches the LabNavId for your slot
      baseUrl={APP_BASE_URL}
      topbar={
        <LabTopbar
          kicker="FACILITY"
          title="Facility Manager"
          subtitle="Equipment registry, maintenance windows, and room booking."
        />
      }
      subbar={/* optional <nav> for app-local section tabs */}
    >
      {/* main app content */}
    </LabShell>
  );
};
```

Things you do **not** need to ship:

- A custom sidebar (the shared shell owns it).
- An `AppSwitcher` / `AccountLinkCard` in the topbar (the sidebar owns app
  navigation and the profile orb owns the account link).
- A "Sign out" button (the shared sidebar has one).

Things you typically **do** ship:

- A subbar with your app's section tabs (Library / Review / Edit / etc.).
  Look at `apps/supply-manager/src/App.tsx` and
  `apps/project-manager/src/App.tsx` for the standard pattern: a flex row of
  `.<prefix>-subtab` buttons with an `is-active` modifier and an underline.
- A primary action button at the right end of the subbar
  (`+ New facility`, etc.).

## 4. Wire the CSS

Your `styles.css` must import shared layers in this order (then add
app-local rules below):

```css
@import "../../../packages/ui/src/tokens.css";
@import "../../../packages/ui/src/reset.css";
@import "../../../packages/ui/src/primitives/primitives.css";
@import "../../../packages/ui/src/lab-shell.css";

/* ===== <YourApp> app-local styles ====================================
   Shell + topbar come from lab-shell.css. Everything below should be
   prefixed with a unique 2-3 letter app prefix (e.g. .fm-* for facility).
   ==================================================================== */
```

Use a unique prefix for every selector you add. Existing prefixes in use:

| App              | Prefix |
| ---------------- | ------ |
| Account / home   | `ovw-` (overview cards), `acct-` (forms/lists) |
| Project Manager  | `pm-`  |
| Protocol Manager | `protocol-` |
| Supply Manager   | `sm-`  |
| Funding Manager  | `funding-` |

For your new module, pick a 2-3 letter prefix and stick to it everywhere.

## 5. Add a deploy step

Open
[`.github/workflows/deploy-protocol-manager-pages.yml`](../.github/workflows/deploy-protocol-manager-pages.yml)
and add **two** stanzas:

```yaml
- name: Build <Your App> for Pages
  run: npm run build -w @ilm/<your-app>
  env:
    VITE_BASE_PATH: /ILM/<your-app>/
    VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
    VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
```

…and update the `Assemble Pages artifact` step:

```yaml
mkdir -p .pages-dist/<your-app> ...
cp -R apps/<your-app>/dist/. .pages-dist/<your-app>/
```

The Account app stays at the bare site root; everything else lives under a
named subpath.

## 6. Wire it into AppSwitcher (only if it's a sibling app)

In [`packages/ui/src/AppSwitcher.tsx`](../packages/ui/src/AppSwitcher.tsx),
add your slug to `APP_ROOT_SEGMENTS` so cross-app URL resolution still walks
back to the site root from your subpath:

```ts
const APP_ROOT_SEGMENTS = new Set<string>([
  "protocol-manager/",
  "project-manager/",
  "supply-manager/",
  "funding-manager/",
  "<your-app>/",
]);
```

The same set lives in `LabPicker.tsx`'s known-apps array — add it there too.

## 7. Auth, lab scoping, and Supabase

- `AuthGate` from `@ilm/ui` already wraps `<App />` in your `main.tsx`.
  Inside the app, call `useAuth()` for `{ user, profile, activeLab }`.
- All app data must be **lab-scoped**. Add a `lab_id uuid not null
  references public.labs(id) on delete cascade` column on every new table,
  enable RLS, and gate access through `is_lab_member(lab_id)` /
  `is_lab_admin(lab_id)`.
- State changes that affect ownership / lifecycle should go through
  `SECURITY DEFINER` RPCs that call `_log_audit`. See the Supply Manager
  migration (`supabase/migrations/20260430000000_supply_manager.sql`) for
  the canonical pattern.

## 8. Two living docs to update

When the module ships:

- [`docs/features.md`](features.md) — add a section describing what shipped.
- [`docs/next-stage.md`](next-stage.md) — rewrite if your module was the
  current planned stage.

That's it. Anything else in the previous app's setup (`AppSwitcher`,
`AccountLinkCard`, custom sidebars, custom topbars) is now **legacy** — do
not copy those patterns into a new module.
