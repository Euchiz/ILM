# Stage 3 — Cloud storage for protocols with a review-gated publication model

This is the concrete plan for cutting `apps/protocol-manager` over from
`localStorage` to Supabase, with a **draft → submit → review → publish**
flow rather than direct writes.

Locked decisions (answers to the open questions from planning):

| # | Decision |
|---|---|
| 1 | Every published protocol must go through review. Users can keep server-side drafts that only they see. |
| 2 | Self-approval is allowed (a project lead can approve their own submission). |
| 3 | Each lab gets a default **General** project; approval is not required there (all edits publish immediately). |
| 4 | Drafts are last-write-wins. Users can create multiple versions if they want. |
| 5 | Hard delete with a 30-day recycle bin. Items in the bin can be restored or permanently purged. |
| 6 | A new revision row is only written when a submission is approved. |

## Concepts

- **Protocol** — the single published row. Visible to every lab member.
- **Draft** — a per-user, per-protocol working copy, server-side. Only the
  author sees it. A draft with `protocol_id = null` represents a brand-new
  protocol being composed.
- **Submission** — a frozen snapshot of a draft, created when the user hits
  "Submit for review". A submission has `status ∈ {pending, approved,
  rejected, withdrawn}`.
- **Approval** — an RPC run by a project lead that copies the submission's
  `document_json` into `protocols`, appends a row to `protocol_revisions`,
  and clears the submitter's draft.
- **Recycle bin** — `protocols.deleted_at` is nullable. Soft-deleted rows
  stay for 30 days and are hidden from normal views; a lead can restore or
  permanently delete.

## Schema additions (Stage 3a migration)

```sql
-- Project leads (admins designate leads per project)
create table public.project_leads (
  project_id uuid references public.projects(id) on delete cascade,
  user_id    uuid references auth.users(id)       on delete cascade,
  created_at timestamptz default now(),
  primary key (project_id, user_id)
);

-- Per-project approval toggle. Default true; the auto-created General
-- project is false.
alter table public.projects
  add column approval_required boolean not null default true;

-- Soft-delete on protocols
alter table public.protocols
  add column deleted_at timestamptz;
create index on public.protocols (lab_id) where deleted_at is null;

-- Drafts (server-side per-user sandbox)
create table public.protocol_drafts (
  id           uuid primary key default gen_random_uuid(),
  lab_id       uuid not null references public.labs(id) on delete cascade,
  project_id   uuid references public.projects(id) on delete set null,
  protocol_id  uuid references public.protocols(id) on delete cascade,   -- null = new protocol
  user_id      uuid not null references auth.users(id) on delete cascade,
  document_json jsonb not null,
  updated_at   timestamptz not null default now()
);
create unique index protocol_drafts_one_per_user_per_protocol
  on public.protocol_drafts (user_id, protocol_id)
  where protocol_id is not null;

-- Submissions (frozen at submit time)
create type public.submission_status
  as enum ('pending', 'approved', 'rejected', 'withdrawn');

create table public.protocol_submissions (
  id            uuid primary key default gen_random_uuid(),
  lab_id        uuid not null references public.labs(id) on delete cascade,
  project_id    uuid not null references public.projects(id) on delete cascade,
  protocol_id   uuid references public.protocols(id) on delete set null,  -- null until approved-new
  submitter_id  uuid not null references auth.users(id) on delete set null,
  document_json jsonb not null,
  status        public.submission_status not null default 'pending',
  review_comment text,
  reviewed_by   uuid references auth.users(id) on delete set null,
  reviewed_at   timestamptz,
  submitted_at  timestamptz not null default now()
);
```

## RLS

- `protocols` — SELECT: lab members where `deleted_at is null`. INSERT /
  UPDATE / DELETE: **none directly**; all writes go through RPCs.
- `protocol_drafts` — owner-only (`user_id = auth.uid()` + `is_lab_member`).
- `protocol_submissions` — SELECT: submitter, project leads, lab admins.
  INSERT: via `submit_draft` RPC. UPDATE: via `approve/reject/withdraw`
  RPCs.
- `project_leads` — SELECT: lab members. INSERT / DELETE: lab admins.

## RPCs (all SECURITY DEFINER where they need to bypass RLS)

```
save_draft(p_protocol_id uuid, p_project_id uuid, p_document jsonb) returns uuid
  upsert draft for current user; returns draft id.

discard_draft(p_draft_id uuid) returns void

submit_draft(p_draft_id uuid) returns uuid
  if projects.approval_required = false: directly publish (no submission row
  persisted beyond 'approved'); else create submission with status 'pending'.

withdraw_submission(p_submission_id uuid) returns void
  submitter-only, pending-only.

approve_submission(p_submission_id uuid, p_comment text) returns uuid
  checks caller is project lead (or lab admin). Copies document to
  protocols (insert or update), writes a protocol_revisions row, clears
  submitter's draft, marks submission 'approved'.

reject_submission(p_submission_id uuid, p_comment text) returns void
  project lead or admin; marks 'rejected'.

soft_delete_protocol(p_id uuid) returns void
  any lab member; sets deleted_at = now().

restore_protocol(p_id uuid) returns void
  any lab member; clears deleted_at if within 30 days.

permanent_delete_protocol(p_id uuid) returns void
  project lead or lab admin only; real DELETE.

assign_project_lead(p_project_id uuid, p_user_id uuid) returns void
revoke_project_lead(p_project_id uuid, p_user_id uuid) returns void
  lab admin only.

create_general_project_for_lab(p_lab_id uuid) returns uuid
  (internal, called from on_lab_created trigger)
```

## Triggers / defaults

- `on_lab_created` (existing) — extended: after creating the owner
  membership, also insert a `projects` row `(name='General',
  approval_required=false)` scoped to the lab.
- `enforce_drafts_user_id` — BEFORE INSERT on `protocol_drafts`, sets
  `user_id = auth.uid()` (so the client can't impersonate).
- **30-day purge** — cron or a manual admin RPC `purge_old_deleted()`. For
  now a manual RPC is fine; we can schedule via `pg_cron` later if it's
  available on the plan.

## UI changes (Stage 3b — separate PR)

- `apps/protocol-manager/src/lib/protocolLibrary.ts` — rewrite as cloud
  adapter. Reads published protocols scoped to `activeLab.id` (+ user's
  drafts). Keeps same public surface where possible so `App.tsx` stays
  close to current shape.
- `apps/protocol-manager/src/state/protocolState.ts` — routes edits to
  the draft store (debounced cloud save on the user's draft — not
  touching `protocols`). Removes the autosave-to-localStorage path.
- New button row in the protocol header:
  - **Save draft** — no-op label, surfaces "Saved just now" indicator.
  - **Submit for review** — freezes the draft into a submission.
  - **Discard draft** — clears server-side draft.
- New side panel for project leads: "Pending submissions" list →
  approve / reject with comment.
- New "Recycle bin" view in the library: shows `deleted_at` rows, restore
  / permanent-delete actions.
- **Migration banner**: on first mount where `activeLab` is set, if
  `localStorage` contains `ilm.protocol-manager.library.v2`, offer to
  upload those protocols into the General project of the current lab.
  After success, clear the key.

## Out of scope for Stage 3

- Realtime / multi-tab live updates (explicit refresh only).
- A dedicated revision-diff viewer (revisions are written but not browsed).
- Cross-project protocol moves.
- Role management UI beyond assigning project leads (comes with Stage 4).
- `pg_cron` wiring for the 30-day purge (manual RPC until then).

## Sequencing

- **PR-3a (this next PR)** — migration + RPCs + updated RLS + backfill:
  - new tables & columns
  - `create_general_project_for_lab` and trigger wiring
  - all RPCs
  - RLS rewritten for protocols (RPC-gated)
  - backfill: create General project in every existing lab
  - no UI changes

  Verify end-to-end from SQL editor: submit a draft, approve, see
  `protocols` + `protocol_revisions` update.

- **PR-3b** — protocol-manager cutover:
  - adapter rewrite, draft/submit/review UI, recycle bin, migration banner

- **PR-3c** *(optional small follow-up)* — `pg_cron` 30-day purge job.

## Open points to revisit before 3b

- Exact UX copy for the Submit / Approve / Reject modals.
- Whether to notify users in-app when their submission is reviewed
  (probably a toast + a "Reviews" inbox — defer to Stage 4).
- Concurrency: if two leads approve the same submission simultaneously,
  the second call should fail gracefully (RPC uses `FOR UPDATE` on the
  submission row).
