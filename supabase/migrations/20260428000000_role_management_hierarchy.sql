-- Role management hierarchy:
--   * One owner per lab (immutable via these RPCs).
--   * Admins and the owner can promote members -> admins and remove *members*.
--   * Only the owner can demote admin -> member or remove an admin.
--
-- Loosens `promote_member_to_admin` to admin-or-owner. Tightens
-- `remove_lab_member` to reject admin removals unless the caller is the
-- owner. `demote_admin_to_member` stays owner-only (Stage 4 hardening).

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
  if not public.is_lab_admin(p_lab_id) then
    raise exception 'only lab admins or the owner may promote members' using errcode = '42501';
  end if;
  select role into v_current from public.lab_memberships
    where lab_id = p_lab_id and user_id = p_user_id;
  if v_current is null then
    raise exception 'user is not a member of this lab' using errcode = '22023';
  end if;
  if v_current = 'owner' then
    raise exception 'cannot change the owner role via this RPC' using errcode = '22023';
  end if;
  if v_current = 'admin' then
    return;
  end if;
  update public.lab_memberships
     set role = 'admin'
   where lab_id = p_lab_id and user_id = p_user_id;
  perform public._log_audit(p_lab_id, 'membership', p_user_id, 'promote_admin', '{}'::jsonb);
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
    raise exception 'only lab admins or the owner can remove members' using errcode = '42501';
  end if;

  select role into v_target_role
  from public.lab_memberships
  where lab_id = p_lab_id and user_id = p_user_id;

  if v_target_role is null then
    raise exception 'member not found' using errcode = '42501';
  end if;
  if v_target_role = 'owner' then
    raise exception 'the owner cannot be removed' using errcode = '22023';
  end if;
  if v_target_role = 'admin' and v_caller_role <> 'owner' then
    raise exception 'only the owner can remove an admin' using errcode = '42501';
  end if;

  delete from public.lab_memberships
  where lab_id = p_lab_id and user_id = p_user_id;

  perform public._log_audit(p_lab_id, 'membership', p_user_id, 'remove', '{}'::jsonb);
end;
$$;
