# Stage 3b — App.tsx cutover plan

This is the **follow-up** refactor after PR-3b's foundation lands. The
foundation already gives us:

- `apps/protocol-manager/src/lib/cloudAdapter.ts` — thin RPC wrappers.
- `apps/protocol-manager/src/lib/useCloudProtocols.ts` — hook that owns
  `protocols`, `bindings`, `projects`, `generalProjectId` for a given
  `labId`, plus `replaceProtocol` / `addProtocol` / `removeProtocol` /
  `saveDraft` / `discardDraft` / `submitDraft` / `setProject` / `refresh`.
- `apps/protocol-manager/src/components/MigrationBanner.tsx`
- `apps/protocol-manager/src/components/SubmissionsPanel.tsx`
- `apps/protocol-manager/src/components/RecycleBinPanel.tsx`

The next PR plugs these into `apps/protocol-manager/src/App.tsx` (~1744
lines today). Outline below — keep each bullet small enough to verify.

## 1. Replace library state source

Today:

```ts
const [libraryState, setLibraryState] = useState<ProtocolLibraryState>(() => loadLibraryState());
// plus
useEffect(() => {
  localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(libraryState, null, 2));
  localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(doc, null, 2));
}, [doc, libraryState]);
```

After:

- `const { activeLab } = useAuth();`
- `const cloud = useCloudProtocols(activeLab?.id ?? null);`
- Derive a shim `libraryState = { protocols: cloud.protocols, activeProtocolId }` where `activeProtocolId` is persisted per-lab in
  `localStorage.getItem('ilm.protocol-manager.activeId.' + activeLab.id)`.
- Delete both `localStorage.setItem` calls above. `loadLibraryState`, `createInitialLibrary`, and `normalizeLibraryState` remain available for import flows.

## 2. Rewire state mutators

Every `setLibraryState(...)` today mutates the in-memory library
directly. Classify each call site into:

- **edit-in-place** (step/section/block edits, metadata updates): call
  `cloud.replaceProtocol(clientId, nextDoc)`. Marks dirty.
- **add-new** (new protocol modal, import, duplicate): call
  `await cloud.addProtocol(nextDoc)`. Creates a server-side draft.
- **remove** (delete button): call `await cloud.removeProtocol(clientId)`.
  This soft-deletes any published row and drops any draft.
- **activate** (select a protocol): update the local per-lab active-id
  only — no cloud call.

Search targets inside App.tsx:

```
grep -n setLibraryState apps/protocol-manager/src/App.tsx
grep -n replaceActiveProtocol apps/protocol-manager/src/App.tsx
grep -n appendProtocolToLibrary apps/protocol-manager/src/App.tsx
```

Every hit needs a decision.

## 3. Header: Save / Submit / Discard

Add three buttons near the protocol title. Their enabled state and label
come from the active binding (`cloud.bindings[activeProtocolId]`).

- **Save draft** — enabled when `dirty`. Calls `cloud.saveDraft(id)`.
- **Submit for review** — enabled when `dirty` or the user has a saved
  draft but no open submission. Calls `cloud.submitDraft(id)`. Show a
  small toast: "Submitted" (approval-required projects) or "Published"
  (General / free-write projects).
- **Discard draft** — visible only when `binding.draftId`. Calls
  `cloud.discardDraft(id)`. Reverts to the published version via
  `cloud.refresh()`.

Dirty indicator: tiny dot next to the title when `binding.dirty === true`.

## 4. Project picker

Current metadata UI has a free-text `project` field via
`updateProtocolMetadata`. Replace it with a `<select>` populated from
`cloud.projects`, bound to `binding.projectId`:

```tsx
<select
  value={binding.projectId}
  onChange={(e) => cloud.setProject(doc.protocol.id, e.target.value)}
>
  {cloud.projects.map((p) => (
    <option key={p.id} value={p.id}>
      {p.name}{!p.approval_required ? " (no review)" : ""}
    </option>
  ))}
</select>
```

When a protocol is reassigned to an `approval_required=true` project,
subsequent Submit clicks route through the review flow automatically
(server decides). No client-side branching needed.

Keep the legacy free-text `metadata.project` writing the selected
project's **name** so JSON exports stay interoperable.

## 5. Admin / reviews view

Add a new sidebar entry (maybe "Reviews") that renders:

- `<MigrationBanner …>` at the top (only while the local library key
  still has uncloud'd rows).
- `<SubmissionsPanel labId userId leadProjectIds onPublished=refresh />`.
- `<RecycleBinPanel labId onChanged=refresh />`.

`leadProjectIds` comes from a new small helper using
`cloudAdapter.listProjectLeads(labId)` filtered to the current user —
plus union with all projects where `is_lab_admin` is true (compute once
by looking at the user's `lab_memberships.role` via the Auth context's
`activeLab.role`).

Expose a hook `useProjectLeadProjects(labId)` that returns the set, so
the panel can stay simple.

## 6. Migration banner placement

Mount `<MigrationBanner>` unconditionally at the top of the Library
sidebar (visible from any view). It self-hides if there's nothing to
migrate or the user dismisses it.

Props to supply:

- `labId` / `labName` from `useAuth().activeLab`.
- `generalProjectId` from `cloud.generalProjectId`.
- `cloudProtocols` — either pass `cloud.protocols` mapped to the row
  shape it expects, OR extend `useCloudProtocols` to also expose the
  raw `CloudProtocolRow[]` so the banner has exact cloud ids. The
  second is cleaner.
- `onUploaded = () => void cloud.refresh()`.

## 7. Styling

The new components reference class names that aren't defined yet:

- `ilm-migration-banner`, `ilm-migration-banner-actions`,
  `ilm-migration-banner-error`
- `ilm-submissions-panel`, `ilm-submissions-header`,
  `ilm-submissions-filter`, `ilm-submissions-list`,
  `ilm-submissions-item`, `ilm-submissions-item-head`,
  `ilm-submissions-title`, `ilm-submissions-comment`,
  `ilm-submissions-actions`, `ilm-submissions-review`,
  `ilm-submissions-review-buttons`
- `ilm-recycle-bin`, `ilm-recycle-bin-header`, `ilm-recycle-bin-list`,
  `ilm-recycle-bin-item`, `ilm-recycle-bin-title`,
  `ilm-recycle-bin-actions`

Two options:

1. Extend `packages/ui/src/auth/auth.css` with these, keeping the
   existing `ilm-*` aesthetic.
2. Add a new `apps/protocol-manager/src/styles/cloud.css` imported from
   `main.tsx`.

Prefer (2) — keeps `@ilm/ui` focused on auth/lab shell styling.

## 8. JSON import/export

- **Import**: unchanged UI. Handler switches from
  `setLibraryState(appendProtocolToLibrary(...))` to
  `await cloud.addProtocol(normalizedDoc)`. Imports land as drafts in the
  General project so the user can review before submitting.
- **Export**: unchanged. The in-memory `doc` is still the source; cloud
  fetches have already hydrated it.

## 9. Empty / error states

- `cloud.status === "loading"` → spinner where the protocol list would
  render. Don't render the editor until a doc exists (or an empty-state
  hero with a "Create your first protocol" button).
- `cloud.status === "error"` → banner with `cloud.error` and a Retry
  button.
- `activeLab === null` → `AuthGate` already shows the lab picker; this
  branch shouldn't render.

## 10. Out of scope for this refactor (follow-ups)

- Realtime subscriptions (re-hydrate on explicit refresh only).
- Diff viewer for submissions (show raw JSON panel for now when a
  reviewer wants to inspect — SubmissionsPanel could add a collapsible
  "View JSON" section later).
- Project lead management UI (admins can seed via SQL editor until a UI
  lands in Stage 4).
- Per-protocol "who has drafts open" indicator (requires a view across
  `protocol_drafts.user_id`).

## Acceptance checklist

Before merging 3b's App.tsx refactor:

- [ ] `localStorage.setItem(LIBRARY_STORAGE_KEY, ...)` and
      `localStorage.setItem(LEGACY_STORAGE_KEY, ...)` are gone from
      App.tsx.
- [ ] Navigating to the app with no cloud data shows an empty state and
      a working "Create new protocol" flow that writes to
      `protocol_drafts`.
- [ ] Editing a field marks the binding dirty and enables Save.
- [ ] Save in General project publishes immediately; save in any other
      project creates a pending submission visible in the SubmissionsPanel.
- [ ] Approve from SubmissionsPanel updates the corresponding protocol
      and appends a revision in `protocol_revisions`.
- [ ] Soft-delete moves a protocol to RecycleBinPanel; Restore returns
      it; Permanent-delete removes it.
- [ ] `typecheck` + `lint` pass across all workspaces.
- [ ] Manual browser smoke in the deployed Pages build with a real
      Supabase project.
