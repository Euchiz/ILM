-- Stage 3a — Review-gated protocol publication
--
-- Published protocols are now read-only to every lab member; writes happen
-- only through SECURITY DEFINER RPCs that enforce the draft → submit →
-- review → approve lifecycle.
--
-- New pieces:
--   * public.project_leads              — admin-designated reviewers per project
--   * projects.approval_required        — toggle; default true, General = false
--   * protocols.deleted_at              — 30-day recycle bin
--   * public.protocol_drafts            — per-user sandbox (server-side)
--   * public.protocol_submissions       — frozen snapshots awaiting review
--   * RPCs: save_draft, discard_draft, submit_draft, withdraw_submission,
--           approve_submission, reject_submission, soft_delete_protocol,
--           restore_protocol, permanent_delete_protocol,
--           assign_project_lead, revoke_project_lead, purge_old_deleted
--   * Auto-creation of a "General" project (approval_required=false) on new
--     labs, plus a backfill for labs that already exist.
--
-- See docs/stage-3-plan.md for the full rationale.

-- ---------------------------------------------------------------------------
-- Schema additions
-- ---------------------------------------------------------------------------

alter table public.projects
  add column if not exists approval_required boolean not null default true;

alter table public.protocols
  add column if not exists deleted_at timestamptz;

create index if not exists protocols_lab_active_idx
  on public.protocols (lab_id)
  where deleted_at is null;

create index if not exists protocols_deleted_at_idx
  on public.protocols (deleted_at)
  where deleted_at is not null;

-- Project leads (admin designates; everyone else is an implicit member via
-- lab_memberships)
create table if not exists public.project_leads (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists project_leads_user_id_idx
  on public.project_leads (user_id);

-- Per-user draft sandbox
create table if not exists public.protocol_drafts (
  id            uuid primary key default gen_random_uuid(),
  lab_id        uuid not null references public.labs(id) on delete cascade,
  project_id    uuid references public.projects(id) on delete set null,
  protocol_id   uuid references public.protocols(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  document_json jsonb not null,
  updated_at    timestamptz not null default now()
);

-- One draft per (user, protocol) for existing protocols. New-protocol
-- drafts (protocol_id IS NULL) are unconstrained — the user may compose
-- several at once.
create unique index if not exists protocol_drafts_one_per_user_per_protocol
  on public.protocol_drafts (user_id, protocol_id)
  where protocol_id is not null;

create index if not exists protocol_drafts_lab_idx
  on public.protocol_drafts (lab_id);

drop trigger if exists protocol_drafts_set_updated_at on public.protocol_drafts;
create trigger protocol_drafts_set_updated_at
before update on public.protocol_drafts
for each row execute function public.set_updated_at();

-- Submissions
do $$
begin
  if not exists (select 1 from pg_type where typname = 'submission_status') then
    create type public.submission_status
      as enum ('pending', 'approved', 'rejected', 'withdrawn');
  end if;
end $$;

create table if not exists public.protocol_submissions (
  id             uuid primary key default gen_random_uuid(),
  lab_id         uuid not null references public.labs(id) on delete cascade,
  project_id     uuid not null references public.projects(id) on delete cascade,
  protocol_id    uuid references public.protocols(id) on delete set null,
  submitter_id   uuid references auth.users(id) on delete set null,
  document_json  jsonb not null,
  status         public.submission_status not null default 'pending',
  review_comment text,
  reviewed_by    uuid references auth.users(id) on delete set null,
  reviewed_at    timestamptz,
  submitted_at   timestamptz not null default now()
);

create index if not exists protocol_submissions_lab_status_idx
  on public.protocol_submissions (lab_id, status);
create index if not exists protocol_submissions_project_status_idx
  on public.protocol_submissions (project_id, status);
create index if not exists protocol_submissions_submitter_idx
  on public.protocol_submissions (submitter_id);

-- ---------------------------------------------------------------------------
-- Authorisation helper
-- ---------------------------------------------------------------------------

create or replace function public.is_project_lead(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.project_leads pl
    where pl.project_id = target_project_id
      and pl.user_id = auth.uid()
  )
  or exists (
    select 1 from public.projects p
    join public.lab_memberships m
      on m.lab_id = p.lab_id and m.user_id = auth.uid()
    where p.id = target_project_id
      and m.role in ('owner', 'admin')
  );
$$;

-- ---------------------------------------------------------------------------
-- General-project bootstrap
-- ---------------------------------------------------------------------------

create or replace function public.ensure_general_project(p_lab_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.projects
  where lab_id = p_lab_id and name = 'General'
  limit 1;

  if v_id is null then
    insert into public.projects (lab_id, name, description, approval_required)
    values (p_lab_id, 'General', 'Shared workspace with no review gate', false)
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- Extend handle_new_lab: after creating the owner membership, also create
-- the General project.
create or replace function public.handle_new_lab()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into public.lab_memberships (lab_id, user_id, role)
    values (new.id, new.created_by, 'owner')
    on conflict do nothing;
  end if;
  perform public.ensure_general_project(new.id);
  return new;
end;
$$;

-- Backfill General project for every existing lab
do $$
declare
  r record;
begin
  for r in select id from public.labs loop
    perform public.ensure_general_project(r.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RLS on new tables + rewrite of protocols write policies
-- ---------------------------------------------------------------------------

alter table public.project_leads         enable row level security;
alter table public.protocol_drafts       enable row level security;
alter table public.protocol_submissions  enable row level security;

-- project_leads: members can read, admins manage
drop policy if exists project_leads_select_member on public.project_leads;
create policy project_leads_select_member on public.project_leads
  for select using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and public.is_lab_member(p.lab_id)
    )
  );

drop policy if exists project_leads_insert_admin on public.project_leads;
create policy project_leads_insert_admin on public.project_leads
  for insert with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id and public.is_lab_admin(p.lab_id)
    )
  );

drop policy if exists project_leads_delete_admin on public.project_leads;
create policy project_leads_delete_admin on public.project_leads
  for delete using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and public.is_lab_admin(p.lab_id)
    )
  );

-- protocol_drafts: owner only
drop policy if exists protocol_drafts_owner_all on public.protocol_drafts;
create policy protocol_drafts_owner_all on public.protocol_drafts
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_lab_member(lab_id));

-- protocol_submissions:
--   SELECT: submitter sees own; project leads & lab admins see all in their
--   project. No direct writes — all via RPC.
drop policy if exists protocol_submissions_select on public.protocol_submissions;
create policy protocol_submissions_select on public.protocol_submissions
  for select using (
    submitter_id = auth.uid()
    or public.is_project_lead(project_id)
    or public.is_lab_admin(lab_id)
  );

-- Rewrite protocols write policies: all direct writes forbidden.
-- SELECT stays; INSERT/UPDATE/DELETE are removed so the RPC path is the
-- only way in/out.
drop policy if exists protocols_insert_member on public.protocols;
drop policy if exists protocols_update_member on public.protocols;
drop policy if exists protocols_delete_admin  on public.protocols;

-- Tighten SELECT to active rows. Recycle-bin lookups happen through an RPC.
drop policy if exists protocols_select_member on public.protocols;
create policy protocols_select_member on public.protocols
  for select using (
    public.is_lab_member(lab_id) and deleted_at is null
  );

-- Same for revisions: RPCs write them; members can read.
drop policy if exists protocol_revisions_insert_member on public.protocol_revisions;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- save_draft: upsert the caller's draft for (protocol_id) or create a new
-- null-protocol draft. Returns the draft id.
create or replace function public.save_draft(
  p_protocol_id uuid,
  p_project_id  uuid,
  p_document    jsonb,
  p_draft_id    uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_lab_id uuid;
  v_draft_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Resolve lab from project (authoritative) — caller-supplied project_id
  -- is required.
  select lab_id into v_lab_id from public.projects where id = p_project_id;
  if v_lab_id is null then
    raise exception 'project not found' using errcode = '22023';
  end if;
  if not public.is_lab_member(v_lab_id) then
    raise exception 'not a member of this lab' using errcode = '42501';
  end if;

  if p_protocol_id is not null then
    -- Upsert on (user_id, protocol_id)
    insert into public.protocol_drafts
      (lab_id, project_id, protocol_id, user_id, document_json)
    values
      (v_lab_id, p_project_id, p_protocol_id, v_uid, p_document)
    on conflict (user_id, protocol_id) where protocol_id is not null
      do update set
        document_json = excluded.document_json,
        project_id    = excluded.project_id,
        updated_at    = now()
    returning id into v_draft_id;
  elsif p_draft_id is not null then
    -- Update an existing new-protocol draft
    update public.protocol_drafts
      set document_json = p_document,
          project_id    = p_project_id,
          updated_at    = now()
      where id = p_draft_id and user_id = v_uid
      returning id into v_draft_id;
    if v_draft_id is null then
      raise exception 'draft not found' using errcode = '42501';
    end if;
  else
    -- Brand-new draft for a brand-new protocol
    insert into public.protocol_drafts
      (lab_id, project_id, protocol_id, user_id, document_json)
    values
      (v_lab_id, p_project_id, null, v_uid, p_document)
    returning id into v_draft_id;
  end if;

  return v_draft_id;
end;
$$;

create or replace function public.discard_draft(p_draft_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  delete from public.protocol_drafts
    where id = p_draft_id and user_id = v_uid;
end;
$$;

-- Publishes a document directly to public.protocols (+ revision). Internal
-- helper used by approve_submission and by submit_draft for free-write
-- projects.
create or replace function public._publish_document(
  p_protocol_id uuid,
  p_lab_id      uuid,
  p_project_id  uuid,
  p_document    jsonb,
  p_author_id   uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pid uuid := p_protocol_id;
  v_title            text := coalesce(p_document->'protocol'->>'title', 'Untitled protocol');
  v_description      text := p_document->'protocol'->>'description';
  v_schema_version   text := coalesce(p_document->>'schemaVersion', '1.0.0');
  v_review_status    text := p_document->'protocol'->'metadata'->>'reviewStatus';
  v_lifecycle_status text := p_document->'protocol'->'metadata'->>'lifecycleStatus';
  v_validation_status text := p_document->'protocol'->'metadata'->>'validationStatus';
begin
  if v_pid is null then
    insert into public.protocols (
      lab_id, project_id, title, description, schema_version,
      review_status, lifecycle_status, validation_status,
      document_json, created_by, updated_by
    ) values (
      p_lab_id, p_project_id, v_title, v_description, v_schema_version,
      v_review_status, v_lifecycle_status, v_validation_status,
      p_document, p_author_id, p_author_id
    )
    returning id into v_pid;
  else
    update public.protocols set
      project_id         = p_project_id,
      title              = v_title,
      description        = v_description,
      schema_version     = v_schema_version,
      review_status      = v_review_status,
      lifecycle_status   = v_lifecycle_status,
      validation_status  = v_validation_status,
      document_json      = p_document,
      updated_by         = p_author_id,
      deleted_at         = null
    where id = v_pid;
  end if;

  insert into public.protocol_revisions
    (protocol_id, lab_id, document_json, created_by)
    values (v_pid, p_lab_id, p_document, p_author_id);

  return v_pid;
end;
$$;

create or replace function public.submit_draft(p_draft_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_draft public.protocol_drafts%rowtype;
  v_approval_required boolean;
  v_submission_id uuid;
  v_published_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_draft from public.protocol_drafts
    where id = p_draft_id and user_id = v_uid;
  if v_draft.id is null then
    raise exception 'draft not found' using errcode = '42501';
  end if;
  if v_draft.project_id is null then
    raise exception 'draft has no project' using errcode = '22023';
  end if;

  select approval_required into v_approval_required
    from public.projects where id = v_draft.project_id;

  if not v_approval_required then
    -- Free-write project: publish immediately, record as approved for
    -- auditing, clear the draft.
    v_published_id := public._publish_document(
      v_draft.protocol_id, v_draft.lab_id, v_draft.project_id,
      v_draft.document_json, v_uid
    );
    insert into public.protocol_submissions
      (lab_id, project_id, protocol_id, submitter_id, document_json,
       status, reviewed_by, reviewed_at)
    values
      (v_draft.lab_id, v_draft.project_id, v_published_id, v_uid,
       v_draft.document_json, 'approved', v_uid, now())
    returning id into v_submission_id;
    delete from public.protocol_drafts where id = v_draft.id;
    return v_submission_id;
  end if;

  -- Review required: create pending submission; leave draft in place so
  -- the user can keep iterating and resubmit if needed.
  insert into public.protocol_submissions
    (lab_id, project_id, protocol_id, submitter_id, document_json)
  values
    (v_draft.lab_id, v_draft.project_id, v_draft.protocol_id, v_uid,
     v_draft.document_json)
  returning id into v_submission_id;
  return v_submission_id;
end;
$$;

create or replace function public.withdraw_submission(p_submission_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sub public.protocol_submissions%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into v_sub from public.protocol_submissions
    where id = p_submission_id for update;
  if v_sub.id is null then
    raise exception 'submission not found' using errcode = '42501';
  end if;
  if v_sub.submitter_id <> v_uid then
    raise exception 'not your submission' using errcode = '42501';
  end if;
  if v_sub.status <> 'pending' then
    raise exception 'submission already reviewed' using errcode = '22023';
  end if;
  update public.protocol_submissions
    set status = 'withdrawn', reviewed_at = now(), reviewed_by = v_uid
    where id = p_submission_id;
end;
$$;

create or replace function public.approve_submission(
  p_submission_id uuid,
  p_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sub public.protocol_submissions%rowtype;
  v_published_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into v_sub from public.protocol_submissions
    where id = p_submission_id for update;
  if v_sub.id is null then
    raise exception 'submission not found' using errcode = '42501';
  end if;
  if v_sub.status <> 'pending' then
    raise exception 'submission already reviewed' using errcode = '22023';
  end if;
  if not public.is_project_lead(v_sub.project_id) then
    raise exception 'not a project lead' using errcode = '42501';
  end if;

  v_published_id := public._publish_document(
    v_sub.protocol_id, v_sub.lab_id, v_sub.project_id,
    v_sub.document_json, v_sub.submitter_id
  );

  update public.protocol_submissions
    set status = 'approved',
        review_comment = p_comment,
        reviewed_by = v_uid,
        reviewed_at = now(),
        protocol_id = v_published_id
    where id = p_submission_id;

  -- Clear the submitter's draft for this protocol now that it's published.
  delete from public.protocol_drafts
    where user_id = v_sub.submitter_id and protocol_id = v_published_id;

  return v_published_id;
end;
$$;

create or replace function public.reject_submission(
  p_submission_id uuid,
  p_comment text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sub public.protocol_submissions%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into v_sub from public.protocol_submissions
    where id = p_submission_id for update;
  if v_sub.id is null then
    raise exception 'submission not found' using errcode = '42501';
  end if;
  if v_sub.status <> 'pending' then
    raise exception 'submission already reviewed' using errcode = '22023';
  end if;
  if not public.is_project_lead(v_sub.project_id) then
    raise exception 'not a project lead' using errcode = '42501';
  end if;
  update public.protocol_submissions
    set status = 'rejected',
        review_comment = p_comment,
        reviewed_by = v_uid,
        reviewed_at = now()
    where id = p_submission_id;
end;
$$;

-- Recycle bin -------------------------------------------------------------

create or replace function public.soft_delete_protocol(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_lab_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select lab_id into v_lab_id from public.protocols where id = p_id;
  if v_lab_id is null then
    raise exception 'protocol not found' using errcode = '42501';
  end if;
  if not public.is_lab_member(v_lab_id) then
    raise exception 'not a lab member' using errcode = '42501';
  end if;
  update public.protocols set deleted_at = now() where id = p_id;
end;
$$;

create or replace function public.restore_protocol(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_lab_id uuid;
  v_deleted_at timestamptz;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select lab_id, deleted_at into v_lab_id, v_deleted_at
    from public.protocols where id = p_id;
  if v_lab_id is null then
    raise exception 'protocol not found' using errcode = '42501';
  end if;
  if not public.is_lab_member(v_lab_id) then
    raise exception 'not a lab member' using errcode = '42501';
  end if;
  if v_deleted_at is null then
    return;
  end if;
  if v_deleted_at < now() - interval '30 days' then
    raise exception 'deleted more than 30 days ago; cannot restore'
      using errcode = '22023';
  end if;
  update public.protocols set deleted_at = null where id = p_id;
end;
$$;

create or replace function public.permanent_delete_protocol(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_lab_id uuid;
  v_project_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select lab_id, project_id into v_lab_id, v_project_id
    from public.protocols where id = p_id;
  if v_lab_id is null then
    raise exception 'protocol not found' using errcode = '42501';
  end if;
  if v_project_id is not null
     and not public.is_project_lead(v_project_id)
     and not public.is_lab_admin(v_lab_id) then
    raise exception 'only project leads or lab admins can permanently delete'
      using errcode = '42501';
  end if;
  delete from public.protocols where id = p_id;
end;
$$;

create or replace function public.purge_old_deleted()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from public.protocols
    where deleted_at is not null
      and deleted_at < now() - interval '30 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Project-lead management -------------------------------------------------

create or replace function public.assign_project_lead(
  p_project_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_lab_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select lab_id into v_lab_id from public.projects where id = p_project_id;
  if v_lab_id is null then
    raise exception 'project not found' using errcode = '42501';
  end if;
  if not public.is_lab_admin(v_lab_id) then
    raise exception 'only lab admins can assign leads' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.lab_memberships
    where lab_id = v_lab_id and user_id = p_user_id
  ) then
    raise exception 'user is not a member of this lab' using errcode = '22023';
  end if;
  insert into public.project_leads (project_id, user_id)
    values (p_project_id, p_user_id)
    on conflict do nothing;
end;
$$;

create or replace function public.revoke_project_lead(
  p_project_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_lab_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select lab_id into v_lab_id from public.projects where id = p_project_id;
  if v_lab_id is null then
    raise exception 'project not found' using errcode = '42501';
  end if;
  if not public.is_lab_admin(v_lab_id) then
    raise exception 'only lab admins can revoke leads' using errcode = '42501';
  end if;
  delete from public.project_leads
    where project_id = p_project_id and user_id = p_user_id;
end;
$$;

-- Recycle-bin listing RPC (published RLS hides deleted rows from SELECT)
create or replace function public.list_deleted_protocols(p_lab_id uuid)
returns setof public.protocols
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.protocols
  where lab_id = p_lab_id
    and deleted_at is not null
    and public.is_lab_member(p_lab_id)
  order by deleted_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant execute on function public.save_draft(uuid, uuid, jsonb, uuid)         to authenticated;
grant execute on function public.discard_draft(uuid)                         to authenticated;
grant execute on function public.submit_draft(uuid)                          to authenticated;
grant execute on function public.withdraw_submission(uuid)                   to authenticated;
grant execute on function public.approve_submission(uuid, text)              to authenticated;
grant execute on function public.reject_submission(uuid, text)               to authenticated;
grant execute on function public.soft_delete_protocol(uuid)                  to authenticated;
grant execute on function public.restore_protocol(uuid)                      to authenticated;
grant execute on function public.permanent_delete_protocol(uuid)             to authenticated;
grant execute on function public.assign_project_lead(uuid, uuid)             to authenticated;
grant execute on function public.revoke_project_lead(uuid, uuid)             to authenticated;
grant execute on function public.list_deleted_protocols(uuid)                to authenticated;
grant execute on function public.is_project_lead(uuid)                       to authenticated;
-- purge_old_deleted is intentionally NOT granted to authenticated; run as
-- service role from an admin context or a future pg_cron job.
