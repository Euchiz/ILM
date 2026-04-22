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
