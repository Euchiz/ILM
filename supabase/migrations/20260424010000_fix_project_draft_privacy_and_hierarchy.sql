-- Stage 4.A.3 - Fix project draft privacy + milestone hierarchy
--
-- Repairs the project draft workflow by:
--   * making create_project_draft compatible with the existing project_leads table
--   * adding experiments.milestone_id so the UI can nest experiments under milestones
--   * aligning milestone / experiment / project_lead visibility with project draft state

alter table public.experiments
  add column if not exists milestone_id uuid references public.milestones(id) on delete cascade;

create index if not exists experiments_milestone_id_idx
  on public.experiments (milestone_id);

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
        or (p.state = 'draft' and (p.created_by = auth.uid() or public.is_lab_admin(p.lab_id)))
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
      and (
        (p.state = 'published' and public.is_lab_member(p.lab_id))
        or (p.state = 'draft' and (p.created_by = auth.uid() or public.is_lab_admin(p.lab_id)))
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
  select exists (
    select 1
    from public.projects p
    where p.id = target_project_id
      and (
        public.is_lab_admin(p.lab_id)
        or (p.state = 'draft' and p.created_by = auth.uid())
      )
  );
$$;

drop policy if exists project_leads_select_member on public.project_leads;
create policy project_leads_select_member on public.project_leads
  for select using (public.can_view_project_workspace(project_id));

drop policy if exists milestones_select_member on public.milestones;
create policy milestones_select_member on public.milestones
  for select using (public.can_view_project_workspace(project_id));

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

drop policy if exists milestones_delete_admin on public.milestones;
create policy milestones_delete_moderated on public.milestones
  for delete using (public.can_delete_project_workspace_item(project_id));

drop policy if exists experiments_select_member on public.experiments;
create policy experiments_select_member on public.experiments
  for select using (public.can_view_project_workspace(project_id));

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

drop policy if exists experiments_delete_admin on public.experiments;
create policy experiments_delete_moderated on public.experiments
  for delete using (public.can_delete_project_workspace_item(project_id));

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
