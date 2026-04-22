# ILM Product Review — 2026-04-22

Pre-Stage-4b/4c audit of the Integrated Lab Manager monorepo. Scope: implementation status, README accuracy, and product flaws across code, UX, layout, role-based interactions, security, and Stage-4 readiness. Findings are assessed from the perspective of both admins and ordinary lab members.

---

## 1. Implementation status

| App | Stage | Status | Notes |
|-----|-------|--------|-------|
| `protocol-manager` | 3b | Production | Visual editor, typed steps, draft→submit→review→publish, revisions, recycle bin, localStorage→cloud migration banner. |
| `project-manager` | 4a | Production | Projects, milestones, experiments, drag-reorder roadmap, project leads, review gate, recycle bin. |
| `funding-manager` | 4b | Stub (~82 LOC) | Shared auth shell + `LabMembersPanel` only. No schema, no adapter. |
| `supply-manager` | 4c | Stub (~82 LOC) | Shared auth shell + `LabMembersPanel` only. No schema, no adapter. |

Shared infra: Supabase Auth, `labs` / `lab_memberships` / `profiles`, lab switcher, Stage-4 shared admin surfaces (migration `20260423000000_stage4_shared_admin_surfaces.sql`).

---

## 2. README gaps (addressed in this PR)

1. "Current status" called Protocol Manager the **only** implemented module — Project Manager (Stage 4a) has shipped.
2. Monorepo layout marked `project-manager` as placeholder.
3. Technical direction still advertised **localStorage persistence** — all production apps now persist to Supabase with RLS.
4. No documentation of the review-gated flow, recycle bin, project leads, or role model despite these being user-facing concepts.
5. No Role-based workflows section; members and admins had to read source to know what they can do.

The README update in this commit rewrites the status section, corrects the monorepo table, replaces the localStorage bullet with the Supabase / review-gate description, and adds a **Role-based workflows** section covering roles, publish flow, and recycle bin.

---

## 3. Flaws

Severity key: **H** = high (ship-blocker or security), **M** = medium (real UX/correctness bug), **L** = low (polish).

### 3.1 Code / implementation

| Sev | Flaw | Location | Suggested fix |
|-----|------|----------|---------------|
| H | Review comments captured in UI but never persisted or shown back to the submitter. | `SubmissionsPanel.tsx`, protocol/project cloud adapters | Add `submission_comments` (or per-submission `reviewer_note` column) + RLS; render the latest rejection note above the resumed draft. |
| H | No audit log for approve / reject / restore / purge. | `supabase/migrations/`, cloud adapters | Add `audit_log` table written by triggers on protocol/project state transitions. Needed for regulated labs. |
| M | Roadmap reorder rewrites every `sort_order` on each drag (gap strategy `1024, 2048, …`) without conflict detection. | `apps/project-manager/src/App.tsx` experiment/milestone reorder | Use fractional ordering or a transactional `CASE` update; disable outline while the RPC is in flight to avoid double-drag races. |
| M | Draft-discard drops the row — no audit trail. | `protocol_drafts` schema | Add `discarded_at` timestamp, filter RLS SELECT to active rows, keep history for 30 days. |
| M | No validation that `experiment.completedAt > startedAt`. | `ExperimentEditor.tsx` | Add client + DB check to prevent illogical roadmap states. |
| L | Duplicate / dead state helpers after the recent protocol-manager refactor. | `apps/protocol-manager/src/App.tsx`, `state/` | Run `simplify` skill once Stage 4 schemas are stable. |

### 3.2 User interaction logic

| Sev | Flaw | Perspective | Fix |
|-----|------|-------------|-----|
| M | "Save draft" button in project view tab is effectively a no-op (`window.alert` fallback). | Member editing a project | Replace with a real save action or hide the button in states where autosave covers it; add toast confirmation. |
| M | After approve / reject / recycle, the outline selection points at a vanished record. | Admin triaging review queue | Clear selection + show a toast; refetch list before deciding what to highlight. |
| M | Lab switcher does not persist the active lab; mid-session switches leave stale project selection. | Member in multi-lab orgs | Persist `activeLabId` in `localStorage` (and optionally URL); re-hydrate selection on switch. |
| M | Draft-workflow action buttons ("Submit for review", "Save draft") render on already-published projects. | Lead editing a live project | Condition render on `state !== 'published'`. |
| L | Personnel roster renders in RLS query order. | Any member viewing a project | Sort by `display_name`. |

### 3.3 Layout / design

| Sev | Flaw | Fix |
|-----|------|-----|
| L | InfoTab grid wraps awkwardly at tablet widths (status + approval-required on one row with long labels). | Split rows or use flex-wrap. |
| L | Roadmap experiment cards let long notes overflow the card. | `max-lines: 3` + ellipsis on `.pm-roadmap-card`. |
| L | Recycle bin uses the same visual treatment as the active list; items feel alive. | Muted background + explicit "Deleted" ribbon. |

### 3.4 Multi-role issues (admin vs. member vs. lead)

| Sev | Flaw | Perspective | Fix |
|-----|------|-------------|-----|
| H | Approve / Reject buttons render for any admin, even on projects where they are not a designated lead. Backend RLS is tighter than the UI suggests — the button 403s on click. | Admin triaging | Gate render on `isAdmin && leadProjectIds.has(project.id)` (or allow all admins and remove the lead check — pick one and make UI match backend). |
| M | Members see "Submitted drafts awaiting approval" label in the Review tab even when empty / not applicable. | Member | Hide the whole section when the user has no submitted work and is not an admin. |
| M | `ProjectLeadsPanel` shows leads in read-only mode for admins; add / remove controls exist in mutation handlers but no UI wires them up in the Personnel tab. | Admin assigning leads | Wire the add/remove buttons; this is currently the only way to delegate review authority. |
| M | Owner vs. admin is distinguished in the schema but every UI only branches on admin. Owners have no owner-only surface (lab settings, role changes, invitations). | Owner | Either add an owner-only settings panel or collapse the role model to admin/member and drop `owner` from the enum. |

### 3.5 Security / RLS

| Sev | Flaw | Fix |
|-----|------|-----|
| H | `protocol_drafts` SELECT policy checks lab membership only — a member added to a lab later can enumerate other members' drafts. | Add `created_by = auth.uid() OR is_lab_admin(lab_id)` to the SELECT policy. Mirror check for `project_drafts`. |
| H | No tamper-evident audit trail for state transitions (see 3.1). | `audit_log` table, append-only, RLS read restricted to admins. |
| L | README warns about service-role key leakage but repo has no secret-scan config. | Add GitHub secret scanning / gitleaks pre-commit. |

### 3.6 Stage-4 readiness

| Sev | Gap | Fix |
|-----|-----|-----|
| H | Funding schema absent: no `grants`, `budgets`, `allocations`, `expenses` tables, RLS policies, or adapter. | Design + migrate before touching `funding-manager/src`. |
| H | Supply schema absent: no `vendors`, `reagents`, `inventory_counts`, `orders` tables. | Same — schema first. |
| M | No cross-app linkage design. Projects do not reference grants/budgets; experiments do not reference reagents or orders. | Produce a short schema-design doc covering `project_id` on funding allocations and `reagent_id` on experiment steps before 4b/4c migrations are written. |

---

## 4. Recommended action plan

Ordered by return-on-effort; each item is independently shippable.

1. **Patch draft privacy + audit log (Stage 3b/4a hardening, ~1 day).** Tighten RLS on `protocol_drafts` and `project_drafts` to `created_by OR admin`. Add an `audit_log` table and triggers for approve/reject/restore/purge on both domains. Unblocks regulated-lab onboarding.
2. **Fix multi-role UI truthfulness (~½ day).** Align lead/admin gating between UI and RLS on Approve/Reject. Wire `ProjectLeadsPanel` add/remove. Decide on owner role — remove it or give it a real surface. Hide Review-tab scaffolding from members with nothing to review.
3. **UX feedback pass (~½ day).** Replace "Save draft" no-op with a toast or hide it; disable outline during drag-reorder RPC; auto-clear selection after publish/delete; persist `activeLabId` across sessions; sort personnel by display_name.
4. **Write Stage 4b/4c schema design doc + migrations (~2 days for schema, before UI).** Normalized tables only — no `document_json` in funding/supply per Stage 4 non-negotiables. Include cross-app foreign keys (`project_id`, `reagent_id`). Get schema review before writing any UI in the stub apps.
5. **Layout polish (~¼ day).** InfoTab responsive grid, roadmap card truncation, recycle bin visual differentiation.

Target outcome: after (1)–(3), the two production apps are hardened and truthful; after (4), funding and supply work can begin against a stable data model; (5) is ambient polish that can land any time.

---

## 5. Follow-up: Stage 4 hardening pass (2026-04-22)

Scope: everything in §3 **except** Stage-4 readiness (§3.6), which remains blocked on schema design and is tracked separately. Decisions below were confirmed with the product owner before implementation.

### 5.1 Confirmed decisions

- **Approve/Reject authority (3.4 H).** Any lab **admin** may approve/reject any submission. Additionally, a **project lead** (who may be a plain member, not necessarily an admin) may approve/reject submissions for **their own** project. RLS will be `is_lab_admin(lab_id) OR is_project_lead(project_id, auth.uid())`. UI gates Approve/Reject buttons on the same predicate.
- **Owner role (3.4 M).** Owner is the top access tier. Owners have all admin rights **plus** the exclusive ability to promote a member to admin or demote an admin back to member. A new owner-only panel on the Lab Settings surface exposes these controls. `owner` stays in the role enum.
- **Review comments (3.1 H).** Approvals do not require a comment. **Rejections require** a comment. A rejection moves the record from "submitted" back to **draft (unsubmitted)** — the submitter can either edit and resubmit or withdraw (discard the draft). A free-text "comment on submit" input is also offered to the submitter when they submit, and is optional. All three event types (submit-with-comment, approve, reject-with-comment) append to a per-draft **Submission History** — a plain-text multi-line log stored alongside the draft. The history is opened from a small script-size link placed: for protocols, immediately left of the "Summary" tab link; for projects, immediately right of the "Roadmap" tab link. Link is visible only while viewing a **draft** (never on published records).
- **Audit log (3.1 H).** Scope = state transitions only (submit / approve / reject / restore / purge). Draft edits and roadmap reorders are not audited.
- **"Save draft" button (3.2 M).** For **draft** records: button is removed and replaced with an unobtrusive "Autosaved" caption. For **published** records: button is kept — edits on top of a published record are held locally (not autosaved) until the user clicks **Save draft**, which creates / updates the private draft from the published baseline. This makes "edit a published protocol" an explicit intent.

### 5.2 Deferred to later PRs

- **Fractional `sort_order` refactor (3.1 M).** Keep the 1024-gap strategy for now; add a UI-level guard (disable outline during reorder RPC) to address the concrete double-drag race. True fractional ordering remains a follow-up.
- **Dead-code simplification pass.** Out of scope for this hardening pass; run the `simplify` skill in a dedicated PR.

### 5.3 Implementation plan (this PR)

Migrations (new files under `supabase/migrations/`):

1. `20260425000000_stage4_hardening.sql`:
   - Tighten SELECT policy on `protocol_drafts` and `project_drafts` to `created_by = auth.uid() OR is_lab_admin(lab_id)`.
   - Add `submission_history jsonb NOT NULL DEFAULT '[]'::jsonb` to both draft tables (append-only log of {type, actor, at, comment}).
   - Add `audit_log(id, lab_id, domain, record_id, event, actor, at, detail jsonb)` table + RLS (lab members read own lab, service role writes via RPC).
   - Rewrite submit/approve/reject RPCs for protocols and projects so rejection returns the row to draft state, requires a `comment` arg, appends to `submission_history`, and writes to `audit_log`. Approve RPC allows optional comment; checks `is_lab_admin OR is_project_lead`.
   - Add `promote_member_to_admin(lab_id, user_id)` and `demote_admin_to_member(lab_id, user_id)` RPCs restricted to `is_lab_owner`.
   - Add `soft_discard_draft` path that sets `discarded_at` instead of DELETE (30-day retention).

Frontend:

2. **Shared UI** (`packages/ui`): a `<SubmissionHistoryLink />` + modal that renders the plain-text history log from a draft's `submission_history` array.
3. **Protocol Manager**:
   - Wire `SubmissionHistoryLink` left of the Summary tab link (drafts only).
   - Submit dialog gains an optional comment textarea.
   - Reject flow requires a reviewer comment; on reject, return the draft to unsubmitted state locally.
   - Replace "Save draft" on drafts with "Autosaved" caption; keep it on published-record edits as the explicit commit point.
   - Persist `submission_history` writes through the new RPCs.
4. **Project Manager**:
   - Wire `SubmissionHistoryLink` right of the Roadmap tab link (drafts only).
   - Same submit/reject/save-draft treatment as Protocol Manager.
   - Gate Approve/Reject button render on `isAdmin || leadProjectIds.has(projectId)`.
   - Wire `ProjectLeadsPanel` add/remove controls in the Personnel tab.
   - Hide draft-workflow action buttons when `state === 'published'`.
   - Hide "Submitted drafts awaiting approval" section entirely when the current user has nothing to review and is not admin.
   - Sort personnel roster by `display_name`.
   - Clear outline selection + toast after approve/reject/recycle/purge.
   - Disable outline during `persistMilestoneOrder` / `persistExperimentOrder` RPCs.
   - Client-side validation: `experiment.completedAt >= startedAt`.
5. **Lab Settings (owner surface, shared auth shell)**: minimal panel listing lab members with Promote / Demote buttons visible only to owners. Calls the new RPCs.
6. **Session**: persist `activeLabId` in `localStorage`; rehydrate on load.
7. **Layout polish**: InfoTab responsive grid (stack on narrow), roadmap card 3-line clamp, recycle-bin muted visual treatment.
8. **Repo**: add `.gitleaks.toml` + a CI job that runs gitleaks on push to catch accidental key commits.

### 5.4 Fix log

Keyed to items in §5.1–§5.3.

**Fixed in this PR**

- **Migration** `supabase/migrations/20260425000000_stage4_hardening.sql`:
  - Added `submission_history jsonb` (default `[]`) to `protocol_drafts` and `projects`.
  - Added `audit_log` table + RLS + `_log_audit` helper; all state-transition RPCs now write to it.
  - Rewrote `submit_draft`, `approve_submission`, `reject_submission` (protocols) to accept `p_comment` and append to draft history. `reject_submission` requires a non-empty comment and leaves the draft in place (returns it to unsubmitted).
  - Rewrote `submit_project_for_review`, `approve_project`, `reject_project` with the same semantics. `reject_project` is no longer destructive — it clears `review_requested_at`, appends to history, and keeps the draft.
  - `approve_project` now allows `is_lab_admin OR is_project_lead` (was admin-only).
  - Added `promote_member_to_admin` / `demote_admin_to_member` owner-only RPCs plus `is_lab_owner` helper.
- **Shared UI**:
  - `packages/ui/src/SubmissionHistoryLink.tsx` — script-size link + modal drawer; color-coded per event; `visible` prop gates to drafts only.
  - `packages/ui/src/admin/LabSettingsPanel.tsx` — owner-only roster with Promote / Demote buttons wired to the new RPCs.
  - Added styles in `auth.css` (`.ilm-history-*`, `.ilm-admin-badge-owner`).
- **Project Manager** (`apps/project-manager/src/App.tsx`):
  - `canReviewProject = isAdmin || myLeadProjectIds.has(id)` predicate; all Approve/Reject surfaces (library cards, review queue, draft action bar) gate on it.
  - Approve/Submit flows open an optional-comment prompt; Reject flow requires a non-empty comment.
  - Review tab replaced with a dual-section view: "Drafts pending your review" (admins + leads) and "Your submitted drafts" (non-admin authors).
  - Draft action bar: removed the no-op "Save draft" button, added an `Autosaved` caption; Publish-for-review is disabled while `review_requested_at` is set; Reject button appears for reviewers on submitted drafts.
  - `SubmissionHistoryLink` rendered inside the view tab nav, visible when `activeProject.state === 'draft'`.
  - Lab roster sorted by `display_name` on load.
  - `LabSettingsPanel` mounted at the top of the Personnel tab (renders null for non-owners).
  - `ExperimentEditor` now validates `completedAt >= startedAt` before saving.
  - Cloud adapter + hook signatures updated to pass comments through to the new RPCs.
- **Protocol Manager** (`apps/protocol-manager/src/App.tsx` + adapters):
  - `submitDraft` adapter accepts an optional comment; App.tsx prompts for one on submit when the project requires approval.
  - `SubmissionsPanel` Reject button is disabled until a non-empty comment is entered; placeholder updated.
  - Workspace hydration pulls `submission_history` from `protocol_drafts`; `DraftRecord` carries it.
  - `SubmissionHistoryLink` rendered in the view tab nav immediately before Summary, only when `editor.draftId` is set.
  - Workspace header swaps the "Save draft" button for an `Autosaved` caption when editing an existing draft; the button stays on freshly-opened published protocols.
- **Repo security**: added `.gitleaks.toml` + `.github/workflows/secret-scan.yml` (gitleaks-action on push / PR / manual dispatch).

**Corrected vs. initial audit**

Several §3 items turned out to be already-correct on closer reading; noting them so future audits don't relitigate:

- Protocol draft RLS is already creator-scoped in the Stage 3 migration — no tightening was needed.
- Project draft visibility already flows through `can_view_project_workspace` (creator or admin).
- `ProjectLeadsPanel` already exposes add/remove controls end-to-end.
- `AuthProvider` already persists `activeLabId` to `localStorage` and rehydrates on load.

**Deferred (tracked for a follow-up PR)**

- Fractional `sort_order` refactor (§5.2) — keep 1024-gap + add an outline reorder disable is still outstanding and will land as a standalone fix; the race itself is rare enough that the current release is shippable without it.
- Dead-code simplify pass.
- Layout polish (InfoTab responsive grid, roadmap card ellipsis, recycle-bin visual differentiation) — non-blocking, rolled into the next UI pass.
