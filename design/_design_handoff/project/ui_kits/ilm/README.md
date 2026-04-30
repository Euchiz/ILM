# ILM — Integrated Lab Manager UI Kit

A pixel-faithful recreation of the Viridian Blue Labs Integrated Lab Manager OS dashboard, derived from the `Euchiz/ILM` source code (`apps/account/`, `packages/ui/`).

## Files
- `index.html` — interactive clickthrough (auth → lab picker → overview → team → settings)
- `Shell.jsx` — `LabSidebar`, `LabTopbar`, `LabShell`, `Avatar`
- `Overview.jsx` — `StatusHero`, `ScheduleCard`, `ReviewQueue`, `InventoryCard`, `ActivityFeed`, `TeamCard`
- `Team.jsx` — team roster + invite drawer
- `Settings.jsx` — profile + lab settings forms
- `Auth.jsx` — sign-in screen
- `LabPicker.jsx` — lab picker modal
- `kit.css` — kit-local styles (re-exports tokens from `../../colors_and_type.css` and recreates `ils-*` + `ovw-*` classes)

## Components covered
Sidebar nav (with letter glyphs, active state, status orb, profile, sign-out) · Topbar (kicker + title + subtitle, search field, org tag) · Status hero (LAB OPERATING STATUS + 3 metrics + infinity art) · Upcoming schedule timeline · Review queue tiles · Inventory radar card · Activity feed · Team overview · Buttons / pills / fields / avatars from primitives.

## Coverage notes
Functional auth, persistence, and review flows are simplified to local React state — this is a UI kit, not production. Visual accuracy is the goal.
