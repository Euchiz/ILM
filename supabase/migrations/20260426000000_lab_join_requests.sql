-- Lab join requests — self-serve onboarding via share link.
--
-- Users paste a lab share link (containing the lab UUID), request to join,
-- and an admin/owner approves or rejects. Complements invite-by-email, which
-- stays the right fit for "I know Alice's address."

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table if not exists public.lab_join_requests (
  id           uuid primary key default gen_random_uuid(),
  lab_id       uuid not null references public.labs(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  message      text,
  status       text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  review_comment text,
  reviewed_by  uuid references auth.users(id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists lab_join_requests_one_pending_idx
  on public.lab_join_requests (lab_id, user_id)
  where status = 'pending';

create index if not exists lab_join_requests_lab_status_idx
  on public.lab_join_requests (lab_id, status);

drop trigger if exists lab_join_requests_set_updated_at on public.lab_join_requests;
create trigger lab_join_requests_set_updated_at
before update on public.lab_join_requests
for each row execute function public.set_updated_at();

alter table public.lab_join_requests enable row level security;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

drop policy if exists lab_join_requests_select_self on public.lab_join_requests;
create policy lab_join_requests_select_self on public.lab_join_requests
  for select using (user_id = auth.uid());

drop policy if exists lab_join_requests_select_admin on public.lab_join_requests;
create policy lab_join_requests_select_admin on public.lab_join_requests
  for select using (public.is_lab_admin(lab_id));

-- Writes are only allowed via RPCs (which run security definer). Deny direct DML.
drop policy if exists lab_join_requests_no_insert on public.lab_join_requests;
create policy lab_join_requests_no_insert on public.lab_join_requests
  for insert with check (false);

drop policy if exists lab_join_requests_no_update on public.lab_join_requests;
create policy lab_join_requests_no_update on public.lab_join_requests
  for update using (false) with check (false);

drop policy if exists lab_join_requests_no_delete on public.lab_join_requests;
create policy lab_join_requests_no_delete on public.lab_join_requests
  for delete using (false);

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- lookup_lab_by_id — share-link preview. Any authenticated user can resolve a
-- lab UUID to its display name, so the join screen can show "Request to join
-- <Lab Name>?" even when the caller isn't a member yet. No other fields leak.
create or replace function public.lookup_lab_by_id(p_lab_id uuid)
returns table (
  id uuid,
  name text,
  already_member boolean,
  has_pending_request boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  return query
  select
    l.id,
    l.name,
    exists (
      select 1 from public.lab_memberships m
      where m.lab_id = l.id and m.user_id = v_uid
    ) as already_member,
    exists (
      select 1 from public.lab_join_requests r
      where r.lab_id = l.id and r.user_id = v_uid and r.status = 'pending'
    ) as has_pending_request
  from public.labs l
  where l.id = p_lab_id;
end;
$$;

grant execute on function public.lookup_lab_by_id(uuid) to authenticated;

-- request_lab_join — create a pending request.
create or replace function public.request_lab_join(
  p_lab_id uuid,
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_request_id uuid;
  v_lab_exists boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select exists(select 1 from public.labs where id = p_lab_id) into v_lab_exists;
  if not v_lab_exists then
    raise exception 'lab not found' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.lab_memberships
    where lab_id = p_lab_id and user_id = v_uid
  ) then
    raise exception 'already a member of this lab' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.lab_join_requests
    where lab_id = p_lab_id and user_id = v_uid and status = 'pending'
  ) then
    raise exception 'a pending request already exists' using errcode = '22023';
  end if;

  insert into public.lab_join_requests (lab_id, user_id, message)
  values (p_lab_id, v_uid, nullif(trim(coalesce(p_message, '')), ''))
  returning id into v_request_id;

  return v_request_id;
end;
$$;

grant execute on function public.request_lab_join(uuid, text) to authenticated;

-- list_lab_join_requests — admin view of pending/recent join requests.
create or replace function public.list_lab_join_requests(
  p_lab_id uuid,
  p_status text default 'pending'
)
returns table (
  id uuid,
  lab_id uuid,
  user_id uuid,
  display_name text,
  email text,
  message text,
  status text,
  review_comment text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_lab_admin(p_lab_id) then
    raise exception 'only lab admins can view join requests' using errcode = '42501';
  end if;

  return query
  select
    r.id,
    r.lab_id,
    r.user_id,
    p.display_name,
    p.email,
    r.message,
    r.status,
    r.review_comment,
    r.reviewed_by,
    r.reviewed_at,
    r.created_at
  from public.lab_join_requests r
  left join public.profiles p on p.id = r.user_id
  where r.lab_id = p_lab_id
    and (p_status is null or r.status = p_status)
  order by r.created_at desc;
end;
$$;

grant execute on function public.list_lab_join_requests(uuid, text) to authenticated;

-- approve_lab_join — admin/owner only; inserts membership with role='member'.
create or replace function public.approve_lab_join(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_lab_id uuid;
  v_user_id uuid;
  v_status text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select lab_id, user_id, status
    into v_lab_id, v_user_id, v_status
  from public.lab_join_requests
  where id = p_request_id;

  if v_lab_id is null then
    raise exception 'request not found' using errcode = '22023';
  end if;
  if not public.is_lab_admin(v_lab_id) then
    raise exception 'only lab admins can approve requests' using errcode = '42501';
  end if;
  if v_status <> 'pending' then
    raise exception 'request is not pending' using errcode = '22023';
  end if;

  insert into public.lab_memberships (lab_id, user_id, role)
  values (v_lab_id, v_user_id, 'member')
  on conflict (lab_id, user_id) do nothing;

  update public.lab_join_requests
    set status = 'approved',
        reviewed_by = v_uid,
        reviewed_at = now()
  where id = p_request_id;
end;
$$;

grant execute on function public.approve_lab_join(uuid) to authenticated;

-- reject_lab_join — admin/owner only; comment required.
create or replace function public.reject_lab_join(
  p_request_id uuid,
  p_comment text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_lab_id uuid;
  v_status text;
  v_comment text := nullif(trim(coalesce(p_comment, '')), '');
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if v_comment is null then
    raise exception 'a comment is required to reject a request' using errcode = '22023';
  end if;

  select lab_id, status into v_lab_id, v_status
  from public.lab_join_requests
  where id = p_request_id;

  if v_lab_id is null then
    raise exception 'request not found' using errcode = '22023';
  end if;
  if not public.is_lab_admin(v_lab_id) then
    raise exception 'only lab admins can reject requests' using errcode = '42501';
  end if;
  if v_status <> 'pending' then
    raise exception 'request is not pending' using errcode = '22023';
  end if;

  update public.lab_join_requests
    set status = 'rejected',
        review_comment = v_comment,
        reviewed_by = v_uid,
        reviewed_at = now()
  where id = p_request_id;
end;
$$;

grant execute on function public.reject_lab_join(uuid, text) to authenticated;

-- cancel_lab_join — requester only.
create or replace function public.cancel_lab_join(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_user_id uuid;
  v_status text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select user_id, status into v_user_id, v_status
  from public.lab_join_requests
  where id = p_request_id;

  if v_user_id is null then
    raise exception 'request not found' using errcode = '22023';
  end if;
  if v_user_id <> v_uid then
    raise exception 'only the requester can cancel' using errcode = '42501';
  end if;
  if v_status <> 'pending' then
    raise exception 'request is not pending' using errcode = '22023';
  end if;

  update public.lab_join_requests
    set status = 'cancelled'
  where id = p_request_id;
end;
$$;

grant execute on function public.cancel_lab_join(uuid) to authenticated;
