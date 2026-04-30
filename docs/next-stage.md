# ILM - Next stage plan

Rewrite this file when priorities change. It always describes *the current planned next stage*, not historical stages.

---

## Stage 4f: Data Hub - v1 hardening + cross-app surfacing

**Why now.** Data Hub now has the first end-to-end dataset registry: lab-scoped schema, RLS, library search/filtering, dataset detail pages, versions, storage references, project links, and access/reuse requests. The next useful work is tightening the edges after real lab use starts.

**Scope for this stage.** Four incremental follow-ups:

1. **Home dashboard card.** Add a small Data Hub card to the Account overview: recently updated datasets, pending access requests to review, and a quick link to `/data-hub/`.
2. **Project cross-links.** Surface datasets linked to each project inside Project Manager, grouped by relationship type (`generated-by`, `used-by`, `derived-from`, etc.).
3. **Visibility audit pass.** Add SQL smoke tests or documented manual checks for `request-required`, `restricted`, and `private` datasets, especially storage-link visibility before and after approval.
4. **Dataset detail polish.** Improve relationship-specific project linking, request history grouping, and version lineage readability after seeing real metadata density.

Out of scope: file upload/storage, checksum indexing, HPC directory crawling, Globus/S3/Drive integration, DOI/Zenodo/GEO/SRA submission helpers, and automated duplicate detection.

### Step 1 - Home dashboard card

- Extend the Account app's dashboard query with Data Hub counts and recent rows.
- Show pending review count for owners/admins/dataset owners.
- Link to `${siteRoot}/data-hub/` and `${siteRoot}/data-hub/#requests`.

### Step 2 - Project cross-links

- In Project Manager, add a read-only "Datasets" section to project detail views.
- Pull `dataset_project_links` for the active lab/project and display dataset status/access badges.
- Keep edits in Data Hub for now; Project Manager should deep-link to the dataset detail page.

### Step 3 - Visibility checks

- Document or automate checks for:
  - lab member can discover `request-required` metadata but cannot see storage links before approval;
  - approved requester can see storage links;
  - `restricted` is hidden until approval except for owner/contact/admin;
  - `private` remains owner/contact/admin only.

### Step 4 - Detail polish

- Allow per-project relationship choice instead of one relationship applied to all selected projects in the dataset form.
- Make parent/derived version lineage more visually obvious.
- Add clearer grouping for requests to review vs my requests vs request history.

---

## Deferred

- **Stage 4d-full - Funding Manager (financial).** The lightweight directory shipped (alias / grant id / validity / brief note for routing approved orders). Full financial tracking remains deferred unless a lab requests it.
- **Stage 4e Scheduler polish.** Daily-use quick record and stricter calendar visibility are still useful, but Data Hub follow-up is now the active priority.
- **UI kit Phase F.** `packages/ui/README.md` + `docs/design-system.md` describing primitives, the `--rl-*` token contract, and the "first use local, second use promote" rule.
- **Stage 4f Supply Manager v2.** Per-experiment consumption logging, supplier/catalog import, barcode scanning, lot/expiry alerts.
- **Stage 4g Reporting / exports.** Cross-app digests and export surfaces.
- **Rotatable share-link token.** Replace the raw lab UUID in the Account share link with a signed HMAC + revocation.
- **Deferred housekeeping.** Fractional `sort_order`, layout polish, recycle-bin differentiation, and dead-code cleanup.
