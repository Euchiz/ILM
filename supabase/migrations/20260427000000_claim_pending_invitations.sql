-- Auto-claim pending lab_invitations on sign-in by email match.
--
-- Email delivery is out of band. When a user signs up / signs in with an
-- email address that has one or more `pending` lab_invitations rows, convert
-- those to actual lab_memberships and mark the invitation accepted.

create or replace function public.claim_pending_invitations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_claimed integer := 0;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select lower(email) into v_email from auth.users where id = v_uid;
  if v_email is null or v_email = '' then
    return 0;
  end if;

  with matching as (
    select id, lab_id, role
    from public.lab_invitations
    where status = 'pending'
      and lower(email) = v_email
  ),
  inserted as (
    insert into public.lab_memberships (lab_id, user_id, role)
    select lab_id, v_uid, role from matching
    on conflict (lab_id, user_id) do nothing
    returning lab_id
  ),
  accepted as (
    update public.lab_invitations
      set status = 'accepted', updated_at = now()
    where id in (select id from matching)
    returning 1
  )
  select count(*) into v_claimed from accepted;

  return v_claimed;
end;
$$;

grant execute on function public.claim_pending_invitations() to authenticated;
