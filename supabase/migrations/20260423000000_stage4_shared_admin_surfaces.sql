-- Stage 4.1 - Shared member and project-lead admin surfaces
--
-- Adds:
--   * public.lab_invitations
--   * list_lab_members / update_lab_member_role / remove_lab_member
--   * invite_member_to_lab
--
-- These support the shared admin UI in packages/ui. Invitation delivery is
-- intentionally out-of-band for this first cut; we persist pending invites so
-- admins have a source of truth while the Auth-side email flow is wired later.

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------

create table if not exists public.lab_invitations (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'member')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists lab_invitations_one_pending_per_email_idx
  on public.lab_invitations (lab_id, email)
  where status = 'pending';

drop trigger if exists lab_invitations_set_updated_at on public.lab_invitations;
create trigger lab_invitations_set_updated_at
before update on public.lab_invitations
for each row execute function public.set_updated_at();

alter table public.lab_invitations enable row level security;

drop policy if exists lab_invitations_select_admin on public.lab_invitations;
create policy lab_invitations_select_admin on public.lab_invitations
  for select using (public.is_lab_admin(lab_id));

drop policy if exists lab_invitations_insert_admin on public.lab_invitations;
create policy lab_invitations_insert_admin on public.lab_invitations
  for insert with check (public.is_lab_admin(lab_id));

drop policy if exists lab_invitations_update_admin on public.lab_invitations;
create policy lab_invitations_update_admin on public.lab_invitations
  for update using (public.is_lab_admin(lab_id))
  with check (public.is_lab_admin(lab_id));

drop policy if exists lab_invitations_delete_admin on public.lab_invitations;
create policy lab_invitations_delete_admin on public.lab_invitations
  for delete using (public.is_lab_admin(lab_id));

-- ---------------------------------------------------------------------------
-- Member roster RPCs
-- ---------------------------------------------------------------------------

create or replace function public.list_lab_members(p_lab_id uuid)
returns table (
  user_id uuid,
  role text,
  display_name text,
  email text,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.user_id,
    m.role,
    p.display_name,
    p.email,
    m.created_at as joined_at
  from public.lab_memberships m
  left join public.profiles p on p.id = m.user_id
  where m.lab_id = p_lab_id
    and public.is_lab_member(p_lab_id)
  order by
    case m.role
      when 'owner' then 0
      when 'admin' then 1
      else 2
    end,
    coalesce(p.display_name, p.email, m.user_id::text);
$$;

create or replace function public.update_lab_member_role(
  p_lab_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_caller_role text;
  v_target_role text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'member') then
    raise exception 'invalid role' using errcode = '22023';
  end if;

  v_caller_role := public.lab_role(p_lab_id);
  if v_caller_role not in ('owner', 'admin') then
    raise exception 'only lab admins can update member roles' using errcode = '42501';
  end if;

  select role into v_target_role
  from public.lab_memberships
  where lab_id = p_lab_id and user_id = p_user_id;

  if v_target_role is null then
    raise exception 'member not found' using errcode = '42501';
  end if;
  if v_target_role = 'owner' then
    raise exception 'owner role cannot be changed here' using errcode = '22023';
  end if;

  update public.lab_memberships
    set role = p_role
  where lab_id = p_lab_id and user_id = p_user_id;
end;
$$;

create or replace function public.remove_lab_member(
  p_lab_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_caller_role text;
  v_target_role text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  v_caller_role := public.lab_role(p_lab_id);
  if v_caller_role not in ('owner', 'admin') then
    raise exception 'only lab admins can remove members' using errcode = '42501';
  end if;

  select role into v_target_role
  from public.lab_memberships
  where lab_id = p_lab_id and user_id = p_user_id;

  if v_target_role is null then
    raise exception 'member not found' using errcode = '42501';
  end if;
  if v_target_role = 'owner' then
    raise exception 'owners cannot be removed here' using errcode = '22023';
  end if;

  delete from public.lab_memberships
  where lab_id = p_lab_id and user_id = p_user_id;
end;
$$;

create or replace function public.invite_member_to_lab(
  p_lab_id uuid,
  p_email text,
  p_role text default 'member'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(trim(p_email));
  v_existing_user_id uuid;
  v_invitation_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.is_lab_admin(p_lab_id) then
    raise exception 'only lab admins can invite members' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'member') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  if v_email = '' then
    raise exception 'email is required' using errcode = '22023';
  end if;

  select id into v_existing_user_id
  from public.profiles
  where lower(email) = v_email
  limit 1;

  if v_existing_user_id is not null and exists (
    select 1 from public.lab_memberships
    where lab_id = p_lab_id and user_id = v_existing_user_id
  ) then
    raise exception 'user is already a member of this lab' using errcode = '22023';
  end if;

  insert into public.lab_invitations (lab_id, email, role, invited_by)
  values (p_lab_id, v_email, p_role, v_uid)
  on conflict (lab_id, email) where status = 'pending'
    do update set
      role = excluded.role,
      invited_by = excluded.invited_by,
      updated_at = now()
  returning id into v_invitation_id;

  return v_invitation_id;
end;
$$;

grant execute on function public.list_lab_members(uuid) to authenticated;
grant execute on function public.update_lab_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_lab_member(uuid, uuid) to authenticated;
grant execute on function public.invite_member_to_lab(uuid, text, text) to authenticated;
