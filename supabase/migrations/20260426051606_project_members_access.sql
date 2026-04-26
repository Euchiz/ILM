-- Project members access tier
--
-- Adds a project-level "member" tier below project leads. Project leads
-- (including implicit lab owners/admins) can assign members, and project
-- metadata/workspace edits are limited to users with project member access
-- or higher.

create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists project_members_user_id_idx
  on public.project_members (user_id);

alter table public.project_members enable row level security;

create or replace function public.is_project_member(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_project_lead(target_project_id)
  or exists (
    select 1
    from public.project_members pm
    where pm.project_id = target_project_id
      and pm.user_id = auth.uid()
  );
$$;

grant execute on function public.is_project_member(uuid) to authenticated;

create or replace function public.can_view_project_workspace(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = target_project_id
      and (
        (p.state = 'published' and public.is_lab_member(p.lab_id))
        or (
          p.state = 'draft'
          and (
            p.created_by = auth.uid()
            or public.is_lab_admin(p.lab_id)
            or public.is_project_member(p.id)
          )
        )
        or (p.state = 'deleted' and public.is_lab_admin(p.lab_id))
      )
  );
$$;

create or replace function public.can_edit_project_workspace(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = target_project_id
      and p.state <> 'deleted'
      and (
        public.is_project_member(p.id)
        or (p.state = 'draft' and p.created_by = auth.uid())
      )
  );
$$;

create or replace function public.can_delete_project_workspace_item(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_edit_project_workspace(target_project_id);
$$;

drop policy if exists project_members_select_workspace on public.project_members;
create policy project_members_select_workspace on public.project_members
  for select using (public.can_view_project_workspace(project_id));

drop policy if exists project_members_insert_lead on public.project_members;
create policy project_members_insert_lead on public.project_members
  for insert with check (
    public.is_project_lead(project_id)
    and exists (
      select 1
      from public.projects p
      join public.lab_memberships m
        on m.lab_id = p.lab_id
       and m.user_id = project_members.user_id
      where p.id = project_members.project_id
    )
  );

drop policy if exists project_members_delete_lead on public.project_members;
create policy project_members_delete_lead on public.project_members
  for delete using (public.is_project_lead(project_id));

drop policy if exists projects_select_member on public.projects;
create policy projects_select_member on public.projects
  for select using (public.can_view_project_workspace(id));

drop policy if exists projects_update_member on public.projects;
create policy projects_update_member on public.projects
  for update using (public.can_edit_project_workspace(id))
  with check (
    public.can_edit_project_workspace(id)
    and public.is_lab_member(lab_id)
  );

drop policy if exists milestones_insert_member on public.milestones;
create policy milestones_insert_member on public.milestones
  for insert with check (
    public.can_edit_project_workspace(project_id)
    and public.is_lab_member(lab_id)
  );

drop policy if exists milestones_update_member on public.milestones;
create policy milestones_update_member on public.milestones
  for update using (public.can_edit_project_workspace(project_id))
  with check (
    public.can_edit_project_workspace(project_id)
    and public.is_lab_member(lab_id)
  );

drop policy if exists milestones_delete_moderated on public.milestones;
create policy milestones_delete_moderated on public.milestones
  for delete using (public.can_delete_project_workspace_item(project_id));

drop policy if exists experiments_insert_member on public.experiments;
create policy experiments_insert_member on public.experiments
  for insert with check (
    public.can_edit_project_workspace(project_id)
    and public.is_lab_member(lab_id)
  );

drop policy if exists experiments_update_member on public.experiments;
create policy experiments_update_member on public.experiments
  for update using (public.can_edit_project_workspace(project_id))
  with check (
    public.can_edit_project_workspace(project_id)
    and public.is_lab_member(lab_id)
  );

drop policy if exists experiments_delete_moderated on public.experiments;
create policy experiments_delete_moderated on public.experiments
  for delete using (public.can_delete_project_workspace_item(project_id));

insert into public.project_members (project_id, user_id, created_by)
select p.id, p.created_by, p.created_by
from public.projects p
join public.lab_memberships m
  on m.lab_id = p.lab_id
 and m.user_id = p.created_by
 and m.role = 'member'
where p.created_by is not null
on conflict (project_id, user_id) do nothing;

create or replace function public.assign_project_member(
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

  select lab_id into v_lab_id
  from public.projects
  where id = p_project_id;

  if v_lab_id is null then
    raise exception 'project not found' using errcode = '42501';
  end if;

  if not public.is_project_lead(p_project_id) then
    raise exception 'only project leads can assign members' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.lab_memberships
    where lab_id = v_lab_id
      and user_id = p_user_id
  ) then
    raise exception 'user is not a member of this lab' using errcode = '22023';
  end if;

  insert into public.project_members (project_id, user_id, created_by)
  values (p_project_id, p_user_id, v_uid)
  on conflict (project_id, user_id) do nothing;

  perform public._log_audit(v_lab_id, 'project_member', p_project_id, 'assign',
    jsonb_build_object('user_id', p_user_id));
end;
$$;

create or replace function public.revoke_project_member(
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

  select lab_id into v_lab_id
  from public.projects
  where id = p_project_id;

  if v_lab_id is null then
    raise exception 'project not found' using errcode = '42501';
  end if;

  if not public.is_project_lead(p_project_id) then
    raise exception 'only project leads can revoke members' using errcode = '42501';
  end if;

  delete from public.project_members
  where project_id = p_project_id
    and user_id = p_user_id;

  perform public._log_audit(v_lab_id, 'project_member', p_project_id, 'revoke',
    jsonb_build_object('user_id', p_user_id));
end;
$$;

grant execute on function public.assign_project_member(uuid, uuid) to authenticated;
grant execute on function public.revoke_project_member(uuid, uuid) to authenticated;
