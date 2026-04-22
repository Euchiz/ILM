-- Stage 4 hardening — submission history, audit log, owner role, reject-to-draft
--
-- Addresses findings in docs/product-review-2026-04-22.md:
--   * Rejection requires a comment and returns the record to draft (unsubmitted)
--     rather than hard-deleting it.
--   * Project approval is allowed for designated project leads (who may be
--     plain members), matching the existing protocol approval rule.
--   * Submit/reject/approve events append to a per-record submission_history
--     log, rendered in the frontend "Submission History" drawer.
--   * State transitions (submit/approve/reject/recycle/restore/purge) write
--     to a new append-only audit_log table.
--   * Owner role gains exclusive promote_member_to_admin /
--     demote_admin_to_member RPCs.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_lab_owner(target_lab_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.lab_role(target_lab_id) = 'owner';
$$;

grant execute on function public.is_lab_owner(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Submission history columns
-- ---------------------------------------------------------------------------

alter table public.protocol_drafts
  add column if not exists submission_history jsonb not null default '[]'::jsonb;

alter table public.projects
  add column if not exists submission_history jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------

create table if not exists public.audit_log (
  id          bigserial primary key,
  lab_id      uuid not null references public.labs(id) on delete cascade,
  domain      text not null,
  record_id   uuid not null,
  event       text not null,
  actor       uuid references auth.users(id) on delete set null,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists audit_log_lab_created_idx
  on public.audit_log (lab_id, created_at desc);

create index if not exists audit_log_record_idx
  on public.audit_log (domain, record_id);

alter table public.audit_log enable row level security;

drop policy if exists audit_log_select_member on public.audit_log;
create policy audit_log_select_member on public.audit_log
  for select using (public.is_lab_member(lab_id));

-- Inserts happen only via SECURITY DEFINER RPCs.

create or replace function public._log_audit(
  p_lab_id    uuid,
  p_domain    text,
  p_record_id uuid,
  p_event     text,
  p_detail    jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (lab_id, domain, record_id, event, actor, detail)
  values (p_lab_id, p_domain, p_record_id, p_event, auth.uid(), coalesce(p_detail, '{}'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Submission history helpers
-- ---------------------------------------------------------------------------

create or replace function public._history_entry(
  p_event text,
  p_comment text
) returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'type', p_event,
    'actor', auth.uid(),
    'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'comment', coalesce(nullif(btrim(coalesce(p_comment, '')), ''), null)
  );
$$;

-- ---------------------------------------------------------------------------
-- Protocol submit_draft — accept optional comment; append history
-- ---------------------------------------------------------------------------

create or replace function public.submit_draft(
  p_draft_id uuid,
  p_comment  text default null
)
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
  v_entry jsonb;
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

  v_entry := public._history_entry('submitted', p_comment);

  if not v_approval_required then
    v_published_id := public._publish_document(
      v_draft.protocol_id, v_draft.lab_id, v_draft.project_id,
      v_draft.document_json, v_uid
    );
    insert into public.protocol_submissions
      (lab_id, project_id, protocol_id, submitter_id, document_json,
       status, review_comment, reviewed_by, reviewed_at)
    values
      (v_draft.lab_id, v_draft.project_id, v_published_id, v_uid,
       v_draft.document_json, 'approved', p_comment, v_uid, now())
    returning id into v_submission_id;
    perform public._log_audit(v_draft.lab_id, 'protocol', v_published_id, 'submit_auto_publish',
      jsonb_build_object('submission_id', v_submission_id, 'comment', p_comment));
    delete from public.protocol_drafts where id = v_draft.id;
    return v_submission_id;
  end if;

  insert into public.protocol_submissions
    (lab_id, project_id, protocol_id, submitter_id, document_json)
  values
    (v_draft.lab_id, v_draft.project_id, v_draft.protocol_id, v_uid,
     v_draft.document_json)
  returning id into v_submission_id;

  update public.protocol_drafts
     set submission_history = submission_history || v_entry,
         updated_at = now()
   where id = v_draft.id;

  perform public._log_audit(v_draft.lab_id, 'protocol', coalesce(v_draft.protocol_id, v_submission_id), 'submit',
    jsonb_build_object('submission_id', v_submission_id, 'comment', p_comment));

  return v_submission_id;
end;
$$;

grant execute on function public.submit_draft(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Protocol approve_submission — audit log + history append on draft (if it
-- still exists) + allow admin OR lead (already via is_project_lead).
-- ---------------------------------------------------------------------------

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

  delete from public.protocol_drafts
    where user_id = v_sub.submitter_id and protocol_id = v_published_id;

  perform public._log_audit(v_sub.lab_id, 'protocol', v_published_id, 'approve',
    jsonb_build_object('submission_id', p_submission_id, 'comment', p_comment));

  return v_published_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Protocol reject_submission — require comment, append to draft history,
-- leave submission status=rejected so the draft is unsubmitted again.
-- ---------------------------------------------------------------------------

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
  v_trimmed text := nullif(btrim(coalesce(p_comment, '')), '');
  v_entry jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if v_trimmed is null then
    raise exception 'rejection requires a comment' using errcode = '22023';
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
        review_comment = v_trimmed,
        reviewed_by = v_uid,
        reviewed_at = now()
    where id = p_submission_id;

  v_entry := public._history_entry('rejected', v_trimmed);
  update public.protocol_drafts
    set submission_history = submission_history || v_entry,
        updated_at = now()
    where user_id = v_sub.submitter_id
      and (
        (v_sub.protocol_id is not null and protocol_id = v_sub.protocol_id)
        or (v_sub.protocol_id is null and protocol_id is null)
      );

  perform public._log_audit(v_sub.lab_id, 'protocol', coalesce(v_sub.protocol_id, p_submission_id), 'reject',
    jsonb_build_object('submission_id', p_submission_id, 'comment', v_trimmed));
end;
$$;

-- ---------------------------------------------------------------------------
-- Project submit/approve/reject — history, comments, allow lead
-- ---------------------------------------------------------------------------

create or replace function public.submit_project_for_review(
  p_project_id uuid,
  p_comment    text default null
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_proj public.projects%rowtype;
  v_entry jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into v_proj from public.projects where id = p_project_id;
  if not found then
    raise exception 'project not found' using errcode = '02000';
  end if;
  if v_proj.state <> 'draft' then
    raise exception 'only drafts can be submitted for review' using errcode = '22023';
  end if;
  if v_proj.created_by <> v_uid and not public.is_lab_admin(v_proj.lab_id) then
    raise exception 'not permitted to submit this draft for review' using errcode = '42501';
  end if;

  v_entry := public._history_entry('submitted', p_comment);

  update public.projects
     set review_requested_at = now(),
         review_requested_by = v_uid,
         updated_by = v_uid,
         submission_history = submission_history || v_entry
   where id = p_project_id
   returning * into v_proj;

  perform public._log_audit(v_proj.lab_id, 'project', p_project_id, 'submit',
    jsonb_build_object('comment', p_comment));

  return v_proj;
end;
$$;

grant execute on function public.submit_project_for_review(uuid, text) to authenticated;

create or replace function public.approve_project(
  p_project_id uuid,
  p_comment    text default null
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_proj public.projects%rowtype;
  v_entry jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into v_proj from public.projects where id = p_project_id;
  if not found then
    raise exception 'project not found' using errcode = '02000';
  end if;
  if not (public.is_lab_admin(v_proj.lab_id) or public.is_project_lead(p_project_id)) then
    raise exception 'only lab admins or designated project leads may approve projects' using errcode = '42501';
  end if;
  if v_proj.state <> 'draft' then
    raise exception 'only drafts can be approved' using errcode = '22023';
  end if;

  v_entry := public._history_entry('approved', p_comment);

  update public.projects
     set state = 'published',
         review_requested_at = null,
         review_requested_by = null,
         updated_by = v_uid,
         submission_history = submission_history || v_entry
   where id = p_project_id
   returning * into v_proj;

  perform public._log_audit(v_proj.lab_id, 'project', p_project_id, 'approve',
    jsonb_build_object('comment', p_comment));

  return v_proj;
end;
$$;

grant execute on function public.approve_project(uuid, text) to authenticated;

-- reject_project — return to draft state with required comment, do NOT
-- delete. Allowed for admin OR project lead.
drop function if exists public.reject_project(uuid);

create or replace function public.reject_project(
  p_project_id uuid,
  p_comment    text
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_proj public.projects%rowtype;
  v_trimmed text := nullif(btrim(coalesce(p_comment, '')), '');
  v_entry jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if v_trimmed is null then
    raise exception 'rejection requires a comment' using errcode = '22023';
  end if;
  select * into v_proj from public.projects where id = p_project_id;
  if not found then
    raise exception 'project not found' using errcode = '02000';
  end if;
  if not (public.is_lab_admin(v_proj.lab_id) or public.is_project_lead(p_project_id)) then
    raise exception 'only lab admins or designated project leads may reject projects' using errcode = '42501';
  end if;
  if v_proj.state <> 'draft' then
    raise exception 'only drafts can be rejected' using errcode = '22023';
  end if;
  if v_proj.review_requested_at is null then
    raise exception 'project is not currently submitted for review' using errcode = '22023';
  end if;

  v_entry := public._history_entry('rejected', v_trimmed);

  update public.projects
     set review_requested_at = null,
         review_requested_by = null,
         updated_by = v_uid,
         submission_history = submission_history || v_entry
   where id = p_project_id
   returning * into v_proj;

  perform public._log_audit(v_proj.lab_id, 'project', p_project_id, 'reject',
    jsonb_build_object('comment', v_trimmed));

  return v_proj;
end;
$$;

grant execute on function public.reject_project(uuid, text) to authenticated;

-- Audit transitions on recycle/restore/purge for projects (no behavior change)
create or replace function public.recycle_project(p_project_id uuid)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_proj public.projects%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into v_proj from public.projects where id = p_project_id;
  if not found then
    raise exception 'project not found' using errcode = '02000';
  end if;
  if not public.is_lab_admin(v_proj.lab_id) then
    raise exception 'only lab admins may recycle projects' using errcode = '42501';
  end if;
  if lower(v_proj.name) = 'general' then
    raise exception 'cannot recycle the General project' using errcode = '22023';
  end if;
  if v_proj.state = 'deleted' then
    return v_proj;
  end if;

  update public.projects
     set state = 'deleted',
         deleted_at = now(),
         updated_by = v_uid
   where id = p_project_id
   returning * into v_proj;

  perform public._log_audit(v_proj.lab_id, 'project', p_project_id, 'recycle', '{}'::jsonb);
  return v_proj;
end;
$$;

create or replace function public.restore_project(p_project_id uuid)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_proj public.projects%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into v_proj from public.projects where id = p_project_id;
  if not found then
    raise exception 'project not found' using errcode = '02000';
  end if;
  if not public.is_lab_admin(v_proj.lab_id) then
    raise exception 'only lab admins may restore projects' using errcode = '42501';
  end if;
  if v_proj.state <> 'deleted' then
    return v_proj;
  end if;

  update public.projects
     set state = 'published',
         deleted_at = null,
         updated_by = v_uid
   where id = p_project_id
   returning * into v_proj;

  perform public._log_audit(v_proj.lab_id, 'project', p_project_id, 'restore', '{}'::jsonb);
  return v_proj;
end;
$$;

create or replace function public.permanent_delete_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_proj public.projects%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into v_proj from public.projects where id = p_project_id;
  if not found then
    raise exception 'project not found' using errcode = '02000';
  end if;
  if not public.is_lab_admin(v_proj.lab_id) then
    raise exception 'only lab admins may purge projects' using errcode = '42501';
  end if;

  perform public._log_audit(v_proj.lab_id, 'project', p_project_id, 'purge',
    jsonb_build_object('name', v_proj.name));
  delete from public.projects where id = p_project_id;
end;
$$;

-- Audit transitions on protocol recycle/restore/purge (no behavior change)
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
  perform public._log_audit(v_lab_id, 'protocol', p_id, 'recycle', '{}'::jsonb);
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
  perform public._log_audit(v_lab_id, 'protocol', p_id, 'restore', '{}'::jsonb);
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
  perform public._log_audit(v_lab_id, 'protocol', p_id, 'purge', '{}'::jsonb);
  delete from public.protocols where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Owner-only role management
-- ---------------------------------------------------------------------------

create or replace function public.promote_member_to_admin(
  p_lab_id  uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_current text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.is_lab_owner(p_lab_id) then
    raise exception 'only lab owners may promote members' using errcode = '42501';
  end if;
  select role into v_current from public.lab_memberships
    where lab_id = p_lab_id and user_id = p_user_id;
  if v_current is null then
    raise exception 'user is not a member of this lab' using errcode = '22023';
  end if;
  if v_current = 'owner' then
    raise exception 'cannot change the owner role via this RPC' using errcode = '22023';
  end if;
  update public.lab_memberships
     set role = 'admin'
   where lab_id = p_lab_id and user_id = p_user_id;
  perform public._log_audit(p_lab_id, 'membership', p_user_id, 'promote_admin', '{}'::jsonb);
end;
$$;

create or replace function public.demote_admin_to_member(
  p_lab_id  uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_current text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.is_lab_owner(p_lab_id) then
    raise exception 'only lab owners may demote admins' using errcode = '42501';
  end if;
  select role into v_current from public.lab_memberships
    where lab_id = p_lab_id and user_id = p_user_id;
  if v_current is null then
    raise exception 'user is not a member of this lab' using errcode = '22023';
  end if;
  if v_current = 'owner' then
    raise exception 'cannot demote the lab owner' using errcode = '22023';
  end if;
  if v_current <> 'admin' then
    return;
  end if;
  update public.lab_memberships
     set role = 'member'
   where lab_id = p_lab_id and user_id = p_user_id;
  perform public._log_audit(p_lab_id, 'membership', p_user_id, 'demote_admin', '{}'::jsonb);
end;
$$;

grant execute on function public.promote_member_to_admin(uuid, uuid) to authenticated;
grant execute on function public.demote_admin_to_member(uuid, uuid) to authenticated;
