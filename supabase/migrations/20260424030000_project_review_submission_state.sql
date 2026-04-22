-- Stage 4.A.5 - explicit project review submission state
--
-- Keeps drafts private until the creator explicitly submits them for review.
-- Published projects continue to update directly without re-entering review.

alter table public.projects
  add column if not exists review_requested_at timestamptz;

alter table public.projects
  add column if not exists review_requested_by uuid references auth.users(id) on delete set null;

create index if not exists projects_review_requested_idx
  on public.projects (lab_id, review_requested_at)
  where review_requested_at is not null and state = 'draft';

create or replace function public.submit_project_for_review(p_project_id uuid)
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

  select * into v_proj
  from public.projects
  where id = p_project_id;

  if not found then
    raise exception 'project not found' using errcode = '02000';
  end if;

  if v_proj.state <> 'draft' then
    raise exception 'only drafts can be submitted for review' using errcode = '22023';
  end if;

  if v_proj.created_by <> v_uid and not public.is_lab_admin(v_proj.lab_id) then
    raise exception 'not permitted to submit this draft for review' using errcode = '42501';
  end if;

  update public.projects
     set review_requested_at = now(),
         review_requested_by = v_uid,
         updated_by = v_uid
   where id = p_project_id
   returning * into v_proj;

  return v_proj;
end;
$$;

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
         review_requested_at = null,
         review_requested_by = null,
         updated_by = v_uid
   where id = p_project_id
   returning * into v_proj;
  return v_proj;
end;
$$;

grant execute on function public.submit_project_for_review(uuid) to authenticated;
