-- Stage 4.A.2 - project review gating and recycle bin
--
-- Adds a draft/review/publish/recycle workflow to projects so that any
-- member can initiate a project (as a draft visible only to themselves +
-- admins) and admins approve or recycle. Mirrors the protocol review
-- model at a lighter weight: no snapshot table, state lives directly on
-- the project row. Lead assignment happens automatically for the
-- creator of a draft.

-- 1) Schema changes --------------------------------------------------------

alter table public.projects
  add column if not exists state text not null default 'published'
    check (state in ('draft', 'published', 'deleted'));

alter table public.projects
  add column if not exists deleted_at timestamptz;

-- Existing rows stay visible: mark anything without an explicit state as
-- published. (No-op when the column is freshly created because of the
-- default above, but written explicitly so repeat-runs stay idempotent.)
update public.projects set state = 'published' where state is null;

create index if not exists projects_state_idx
  on public.projects (lab_id, state);

create index if not exists projects_deleted_at_idx
  on public.projects (lab_id) where deleted_at is not null;

-- 2) ensure_general_project: make sure General is published ---------------

create or replace function public.ensure_general_project(p_lab_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
begin
  select id into v_project_id
    from public.projects
   where lab_id = p_lab_id
     and lower(name) = 'general'
   order by created_at asc
   limit 1;

  if v_project_id is null then
    insert into public.projects (lab_id, name, description, status, approval_required, state)
    values (
      p_lab_id,
      'General',
      'Shared project that exists in every lab. Protocols published here skip review.',
      'active',
      false,
      'published'
    )
    returning id into v_project_id;
  else
    update public.projects
       set state = 'published',
           deleted_at = null,
           approval_required = false
     where id = v_project_id
       and (state <> 'published' or deleted_at is not null or approval_required <> false);
  end if;

  return v_project_id;
end;
$$;

-- 3) RLS: redo policies so drafts are creator+admin only -----------------

alter table public.projects enable row level security;

drop policy if exists projects_select_member on public.projects;
create policy projects_select_member on public.projects
  for select using (
    public.is_lab_member(lab_id)
    and (
      state = 'published'
      or (state = 'draft' and created_by = auth.uid())
      or public.is_lab_admin(lab_id)
    )
  );

-- Direct INSERTs are disabled for clients; creation flows through
-- create_project_draft (SECURITY DEFINER). ensure_general_project handles
-- the auto-seeded General project.
drop policy if exists projects_insert_member on public.projects;

-- Creator can edit their own draft's metadata. Admins can always edit.
-- Non-admin members can still rename/touch published projects they don't
-- own (kept permissive for now to match the earlier lab-wide edit model).
drop policy if exists projects_update_member on public.projects;
create policy projects_update_member on public.projects
  for update using (
    public.is_lab_member(lab_id)
    and (
      state = 'published'
      or public.is_lab_admin(lab_id)
      or (state = 'draft' and created_by = auth.uid())
    )
  )
  with check (
    public.is_lab_member(lab_id)
    and (
      state = 'published'
      or public.is_lab_admin(lab_id)
      or (state = 'draft' and created_by = auth.uid())
    )
  );

-- Only admins can hard-delete directly. Creator-withdraw of a draft
-- routes through the security-definer RPC below.
drop policy if exists projects_delete_admin on public.projects;
create policy projects_delete_admin on public.projects
  for delete using (public.is_lab_admin(lab_id));

-- 4) RPCs ----------------------------------------------------------------

-- 4a) create_project_draft: inserts a draft project and auto-assigns the
-- creator as a project lead. Any lab member may call it.
create or replace function public.create_project_draft(
  p_lab_id uuid,
  p_name text,
  p_description text default null,
  p_approval_required boolean default true,
  p_status text default 'planning'
) returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.projects%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.is_lab_member(p_lab_id) then
    raise exception 'not a member of lab %', p_lab_id using errcode = '42501';
  end if;

  insert into public.projects (
    lab_id, name, description, status, approval_required, state,
    created_by, updated_by
  ) values (
    p_lab_id,
    coalesce(nullif(btrim(p_name), ''), 'Untitled project'),
    nullif(btrim(coalesce(p_description, '')), ''),
    coalesce(nullif(btrim(p_status), ''), 'planning'),
    coalesce(p_approval_required, true),
    'draft',
    v_uid, v_uid
  )
  returning * into v_row;

  insert into public.project_leads (project_id, user_id)
  values (v_row.id, v_uid)
  on conflict (project_id, user_id) do nothing;

  return v_row;
end;
$$;

-- 4b) withdraw_project_draft: creator or admin removes a draft entirely.
create or replace function public.withdraw_project_draft(p_project_id uuid)
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
  if v_proj.state <> 'draft' then
    raise exception 'only drafts can be withdrawn' using errcode = '22023';
  end if;
  if v_proj.created_by <> v_uid and not public.is_lab_admin(v_proj.lab_id) then
    raise exception 'not permitted to withdraw this draft' using errcode = '42501';
  end if;

  delete from public.projects where id = p_project_id;
end;
$$;

-- 4c) approve_project: admin publishes a draft.
create or replace function public.approve_project(p_project_id uuid)
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
    raise exception 'only lab admins may approve projects' using errcode = '42501';
  end if;
  if v_proj.state <> 'draft' then
    raise exception 'only drafts can be approved' using errcode = '22023';
  end if;

  update public.projects
     set state = 'published',
         updated_by = v_uid
   where id = p_project_id
   returning * into v_proj;
  return v_proj;
end;
$$;

-- 4d) reject_project: admin rejects a draft (deletes it outright).
create or replace function public.reject_project(p_project_id uuid)
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
    raise exception 'only lab admins may reject projects' using errcode = '42501';
  end if;
  if v_proj.state <> 'draft' then
    raise exception 'only drafts can be rejected' using errcode = '22023';
  end if;

  delete from public.projects where id = p_project_id;
end;
$$;

-- 4e) recycle_project: admin soft-deletes a published project.
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
  return v_proj;
end;
$$;

-- 4f) restore_project: admin restores a recycled project.
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
  return v_proj;
end;
$$;

-- 4g) permanent_delete_project: admin hard-deletes from the recycle bin.
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

  delete from public.projects where id = p_project_id;
end;
$$;

-- 4h) list_deleted_projects: convenience read for the admin recycle view.
create or replace function public.list_deleted_projects(p_lab_id uuid)
returns setof public.projects
language sql
security definer
set search_path = public
as $$
  select *
    from public.projects
   where lab_id = p_lab_id
     and state = 'deleted'
     and public.is_lab_admin(p_lab_id)
   order by deleted_at desc nulls last;
$$;

-- 5) Grants --------------------------------------------------------------

grant execute on function public.create_project_draft(uuid, text, text, boolean, text) to authenticated;
grant execute on function public.withdraw_project_draft(uuid)                          to authenticated;
grant execute on function public.approve_project(uuid)                                 to authenticated;
grant execute on function public.reject_project(uuid)                                  to authenticated;
grant execute on function public.recycle_project(uuid)                                 to authenticated;
grant execute on function public.restore_project(uuid)                                 to authenticated;
grant execute on function public.permanent_delete_project(uuid)                        to authenticated;
grant execute on function public.list_deleted_projects(uuid)                           to authenticated;
