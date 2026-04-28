-- Stage 4d-lite — Funding Directory
--
-- A privacy-preserving directory of PI-approved funding aliases used to route
-- approved supply order requests to the correct grant. This module intentionally
-- DOES NOT track budgets, balances, burn rate, expenses, salary allocations, or
-- any other financial accounting concern. Only the minimum metadata needed for
-- order routing is stored: nickname, grant identifier, validity window, brief
-- usage note, and visibility scope.
--
-- Roles today: lab `owner` and `admin` act as "reviewers / lab managers / PI".
-- Lab `member` is the regular requester. A richer role taxonomy (separate `pi`,
-- `reviewer`, `lab_manager` tiers) can be layered later via lab_memberships
-- without changing the column or RPC contracts here. See `roleNote` markers
-- throughout this file and in module docs.

-- ---------------------------------------------------------------------------
-- 1) Tables
-- ---------------------------------------------------------------------------

-- 1.1) funding_sources — the directory rows
create table if not exists public.funding_sources (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  nickname text not null,
  grant_identifier text not null,
  pi_id uuid references auth.users(id) on delete set null,
  valid_start_date date,
  valid_end_date date,
  brief_note text,
  visibility text not null default 'reviewer_only'
    check (visibility in ('reviewer_only', 'lab_visible_alias')),
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Disallow inverted validity windows at the storage layer.
  check (
    valid_start_date is null
    or valid_end_date is null
    or valid_end_date >= valid_start_date
  )
);

create index if not exists funding_sources_lab_id_idx
  on public.funding_sources (lab_id);
create index if not exists funding_sources_lab_archived_idx
  on public.funding_sources (lab_id, archived_at);
create index if not exists funding_sources_pi_idx
  on public.funding_sources (pi_id);

drop trigger if exists funding_sources_set_updated_at on public.funding_sources;
create trigger funding_sources_set_updated_at
before update on public.funding_sources
for each row execute function public.set_updated_at();

-- 1.2) funding_defaults — remembered "this item / project goes to this grant"
-- One row per (lab_id, item_id, project_id) tuple. Writes are upserts driven
-- by the order-approval RPC; nulls in item_id / project_id express broader
-- defaults (item-only, project-only, project + category).
create table if not exists public.funding_defaults (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  funding_source_id uuid not null references public.funding_sources(id) on delete cascade,
  item_id uuid references public.items(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  category text
    check (category is null or category in ('reagent', 'consumable', 'supply', 'sample', 'other')),
  confidence_level text not null
    check (confidence_level in
      ('exact_item_project', 'exact_item', 'category_project', 'project_default')),
  set_by_user_id uuid references auth.users(id) on delete set null,
  last_used_order_id uuid references public.order_requests(id) on delete set null,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Postgres 15+: NULLS NOT DISTINCT lets a single unique key cover the four
-- key shapes (item+project, item-only, category+project, project-only).
create unique index if not exists funding_defaults_unique_key
  on public.funding_defaults (lab_id, item_id, project_id, category)
  nulls not distinct;

create index if not exists funding_defaults_lab_id_idx
  on public.funding_defaults (lab_id);
create index if not exists funding_defaults_funding_source_idx
  on public.funding_defaults (funding_source_id);

drop trigger if exists funding_defaults_set_updated_at on public.funding_defaults;
create trigger funding_defaults_set_updated_at
before update on public.funding_defaults
for each row execute function public.set_updated_at();

-- 1.3) Extend order_requests with the funding-routing columns. Each is a soft
-- pointer (ON DELETE SET NULL) so archiving / hard-deleting a funding source
-- never breaks history.
alter table public.order_requests
  add column if not exists requested_funding_source_id uuid
    references public.funding_sources(id) on delete set null;
alter table public.order_requests
  add column if not exists suggested_funding_source_id uuid
    references public.funding_sources(id) on delete set null;
alter table public.order_requests
  add column if not exists approved_funding_source_id uuid
    references public.funding_sources(id) on delete set null;
alter table public.order_requests
  add column if not exists funding_assignment_status text not null default 'unassigned';
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'order_requests_funding_assignment_status_check'
  ) then
    alter table public.order_requests
      add constraint order_requests_funding_assignment_status_check
      check (funding_assignment_status in
        ('unassigned', 'suggested', 'assigned', 'changed', 'not_required'));
  end if;
end $$;
alter table public.order_requests
  add column if not exists funding_assigned_by uuid
    references auth.users(id) on delete set null;
alter table public.order_requests
  add column if not exists funding_assigned_at timestamptz;

create index if not exists order_requests_approved_funding_idx
  on public.order_requests (approved_funding_source_id);

-- ---------------------------------------------------------------------------
-- 2) RLS — funding_sources & funding_defaults are admin-only at the SQL
--    boundary. Members never touch the tables directly; they read a redacted
--    list via list_funding_sources(). This keeps grant_identifier off the
--    wire entirely for non-reviewers, which is the point of this module.
-- ---------------------------------------------------------------------------

alter table public.funding_sources  enable row level security;
alter table public.funding_defaults enable row level security;

drop policy if exists funding_sources_select_admin on public.funding_sources;
create policy funding_sources_select_admin on public.funding_sources
  for select using (public.is_lab_admin(lab_id));

drop policy if exists funding_sources_write_admin on public.funding_sources;
create policy funding_sources_write_admin on public.funding_sources
  for all using (public.is_lab_admin(lab_id))
  with check (public.is_lab_admin(lab_id));

drop policy if exists funding_defaults_select_admin on public.funding_defaults;
create policy funding_defaults_select_admin on public.funding_defaults
  for select using (public.is_lab_admin(lab_id));

drop policy if exists funding_defaults_write_admin on public.funding_defaults;
create policy funding_defaults_write_admin on public.funding_defaults
  for all using (public.is_lab_admin(lab_id))
  with check (public.is_lab_admin(lab_id));

-- ---------------------------------------------------------------------------
-- 3) Read RPC — redacted listing for members, full rows for admins
-- ---------------------------------------------------------------------------

-- Returns a row per funding source visible to the caller in the given lab:
--   * lab admins / owners: full row, grant_identifier included
--   * lab members: grant_identifier is null, and only sources marked
--     visibility = 'lab_visible_alias' AND not archived are returned
--   * non-members: nothing
-- The shape is stable so the frontend can consume the same rows from either
-- tier; the redaction is what differs.
create or replace function public.list_funding_sources(p_lab_id uuid)
returns table (
  id uuid,
  lab_id uuid,
  nickname text,
  grant_identifier text,
  pi_id uuid,
  valid_start_date date,
  valid_end_date date,
  brief_note text,
  visibility text,
  archived_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  caller_can_see_grant_identifier boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_is_admin boolean := public.is_lab_admin(p_lab_id);
  v_is_member boolean := public.is_lab_member(p_lab_id);
begin
  if not v_is_member then
    return;
  end if;

  return query
    select
      fs.id,
      fs.lab_id,
      fs.nickname,
      case when v_is_admin then fs.grant_identifier else null end as grant_identifier,
      fs.pi_id,
      fs.valid_start_date,
      fs.valid_end_date,
      fs.brief_note,
      fs.visibility,
      fs.archived_at,
      fs.created_by,
      fs.updated_by,
      fs.created_at,
      fs.updated_at,
      v_is_admin as caller_can_see_grant_identifier
    from public.funding_sources fs
    where fs.lab_id = p_lab_id
      and (
        v_is_admin
        or (
          fs.visibility = 'lab_visible_alias'
          and fs.archived_at is null
        )
      )
    order by fs.archived_at nulls first, fs.nickname;
end;
$$;

grant execute on function public.list_funding_sources(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Write RPCs — funding source lifecycle (admin-gated, audit-logged)
-- ---------------------------------------------------------------------------

create or replace function public.create_funding_source(
  p_lab_id uuid,
  p_nickname text,
  p_grant_identifier text,
  p_pi_id uuid default null,
  p_valid_start_date date default null,
  p_valid_end_date date default null,
  p_brief_note text default null,
  p_visibility text default 'reviewer_only'
)
returns public.funding_sources
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.funding_sources%rowtype;
  v_nickname text := nullif(btrim(coalesce(p_nickname, '')), '');
  v_grant text := nullif(btrim(coalesce(p_grant_identifier, '')), '');
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- roleNote: today only owners/admins may write the directory. Future role
  -- expansion (e.g. a dedicated `pi` tier) should be checked here as well.
  if not public.is_lab_admin(p_lab_id) then
    raise exception 'only lab admins may create funding sources' using errcode = '42501';
  end if;
  if v_nickname is null then
    raise exception 'nickname is required' using errcode = '22023';
  end if;
  if v_grant is null then
    raise exception 'grant identifier is required' using errcode = '22023';
  end if;
  if p_visibility not in ('reviewer_only', 'lab_visible_alias') then
    raise exception 'invalid visibility value' using errcode = '22023';
  end if;

  insert into public.funding_sources (
    lab_id, nickname, grant_identifier, pi_id,
    valid_start_date, valid_end_date, brief_note,
    visibility, created_by, updated_by
  ) values (
    p_lab_id, v_nickname, v_grant, p_pi_id,
    p_valid_start_date, p_valid_end_date,
    nullif(btrim(coalesce(p_brief_note, '')), ''),
    p_visibility, v_uid, v_uid
  )
  returning * into v_row;

  perform public._log_audit(p_lab_id, 'funding_source', v_row.id, 'create',
    jsonb_build_object('nickname', v_row.nickname, 'visibility', v_row.visibility));
  return v_row;
end;
$$;

create or replace function public.update_funding_source(
  p_id uuid,
  p_nickname text default null,
  p_grant_identifier text default null,
  p_pi_id uuid default null,
  p_clear_pi boolean default false,
  p_valid_start_date date default null,
  p_clear_valid_start boolean default false,
  p_valid_end_date date default null,
  p_clear_valid_end boolean default false,
  p_brief_note text default null,
  p_clear_brief_note boolean default false,
  p_visibility text default null
)
returns public.funding_sources
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.funding_sources%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_row from public.funding_sources where id = p_id;
  if not found then
    raise exception 'funding source not found' using errcode = '02000';
  end if;
  if not public.is_lab_admin(v_row.lab_id) then
    raise exception 'only lab admins may edit funding sources' using errcode = '42501';
  end if;
  if p_visibility is not null
     and p_visibility not in ('reviewer_only', 'lab_visible_alias') then
    raise exception 'invalid visibility value' using errcode = '22023';
  end if;

  update public.funding_sources
     set nickname = coalesce(nullif(btrim(coalesce(p_nickname, '')), ''), nickname),
         grant_identifier = coalesce(nullif(btrim(coalesce(p_grant_identifier, '')), ''), grant_identifier),
         pi_id = case when p_clear_pi then null else coalesce(p_pi_id, pi_id) end,
         valid_start_date = case when p_clear_valid_start then null else coalesce(p_valid_start_date, valid_start_date) end,
         valid_end_date = case when p_clear_valid_end then null else coalesce(p_valid_end_date, valid_end_date) end,
         brief_note = case when p_clear_brief_note then null
                           else coalesce(nullif(btrim(coalesce(p_brief_note, '')), ''), brief_note) end,
         visibility = coalesce(p_visibility, visibility),
         updated_by = v_uid
   where id = p_id
   returning * into v_row;

  perform public._log_audit(v_row.lab_id, 'funding_source', p_id, 'update',
    jsonb_build_object('nickname', v_row.nickname));
  return v_row;
end;
$$;

create or replace function public.archive_funding_source(p_id uuid)
returns public.funding_sources
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.funding_sources%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into v_row from public.funding_sources where id = p_id;
  if not found then
    raise exception 'funding source not found' using errcode = '02000';
  end if;
  if not public.is_lab_admin(v_row.lab_id) then
    raise exception 'only lab admins may archive funding sources' using errcode = '42501';
  end if;
  update public.funding_sources
     set archived_at = coalesce(archived_at, now()),
         updated_by = v_uid
   where id = p_id
   returning * into v_row;
  perform public._log_audit(v_row.lab_id, 'funding_source', p_id, 'archive', '{}'::jsonb);
  return v_row;
end;
$$;

create or replace function public.restore_funding_source(p_id uuid)
returns public.funding_sources
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.funding_sources%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into v_row from public.funding_sources where id = p_id;
  if not found then
    raise exception 'funding source not found' using errcode = '02000';
  end if;
  if not public.is_lab_admin(v_row.lab_id) then
    raise exception 'only lab admins may restore funding sources' using errcode = '42501';
  end if;
  update public.funding_sources
     set archived_at = null,
         updated_by = v_uid
   where id = p_id
   returning * into v_row;
  perform public._log_audit(v_row.lab_id, 'funding_source', p_id, 'restore', '{}'::jsonb);
  return v_row;
end;
$$;

grant execute on function public.create_funding_source(uuid, text, text, uuid, date, date, text, text) to authenticated;
grant execute on function public.update_funding_source(uuid, text, text, uuid, boolean, date, boolean, date, boolean, text, boolean, text) to authenticated;
grant execute on function public.archive_funding_source(uuid) to authenticated;
grant execute on function public.restore_funding_source(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Approval-time funding assignment
-- ---------------------------------------------------------------------------

-- Internal helper: write the funding_defaults rows that future suggestions
-- will draw from. Called by approve_order_request and set_order_funding when
-- a real funding source is attached. Writes one row per item line in the
-- request, plus a category/project fallback. All upserts.
create or replace function public._seed_funding_defaults(
  p_request_id uuid,
  p_funding_source_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_lab_id uuid;
  v_project_id uuid;
  v_uid uuid := auth.uid();
  v_item record;
begin
  select r.lab_id, r.project_id into v_lab_id, v_project_id
    from public.order_requests r
   where r.id = p_request_id;
  if v_lab_id is null then
    return;
  end if;

  for v_item in
    select ri.item_id, i.classification
      from public.order_request_items ri
      join public.items i on i.id = ri.item_id
     where ri.order_request_id = p_request_id
  loop
    -- Tier 1: exact item + project (or item + null project if request was general)
    insert into public.funding_defaults (
      lab_id, funding_source_id, item_id, project_id, category,
      confidence_level, set_by_user_id, last_used_order_id, last_used_at
    ) values (
      v_lab_id, p_funding_source_id, v_item.item_id, v_project_id, null,
      case when v_project_id is null then 'exact_item' else 'exact_item_project' end,
      v_uid, p_request_id, now()
    )
    on conflict (lab_id, item_id, project_id, category)
    do update set
      funding_source_id = excluded.funding_source_id,
      confidence_level = excluded.confidence_level,
      set_by_user_id = excluded.set_by_user_id,
      last_used_order_id = excluded.last_used_order_id,
      last_used_at = excluded.last_used_at;

    -- Tier 2 fallback: item-only (regardless of project) — only when a project
    -- was attached. If the request was already general, Tier 1 already covered
    -- this shape and we'd double-write the same key.
    if v_project_id is not null then
      insert into public.funding_defaults (
        lab_id, funding_source_id, item_id, project_id, category,
        confidence_level, set_by_user_id, last_used_order_id, last_used_at
      ) values (
        v_lab_id, p_funding_source_id, v_item.item_id, null, null,
        'exact_item', v_uid, p_request_id, now()
      )
      on conflict (lab_id, item_id, project_id, category)
      do update set
        funding_source_id = excluded.funding_source_id,
        set_by_user_id = excluded.set_by_user_id,
        last_used_order_id = excluded.last_used_order_id,
        last_used_at = excluded.last_used_at;
    end if;

    -- Tier 3: (category, project) fallback so a sibling item in the same
    -- project + classification later gets a useful suggestion.
    if v_project_id is not null then
      insert into public.funding_defaults (
        lab_id, funding_source_id, item_id, project_id, category,
        confidence_level, set_by_user_id, last_used_order_id, last_used_at
      ) values (
        v_lab_id, p_funding_source_id, null, v_project_id, v_item.classification,
        'category_project', v_uid, p_request_id, now()
      )
      on conflict (lab_id, item_id, project_id, category)
      do update set
        funding_source_id = excluded.funding_source_id,
        set_by_user_id = excluded.set_by_user_id,
        last_used_order_id = excluded.last_used_order_id,
        last_used_at = excluded.last_used_at;
    end if;
  end loop;

  -- Tier 4: project default — most-recent funding source applied to anything
  -- in this project. One row per (project, null item, null category).
  if v_project_id is not null then
    insert into public.funding_defaults (
      lab_id, funding_source_id, item_id, project_id, category,
      confidence_level, set_by_user_id, last_used_order_id, last_used_at
    ) values (
      v_lab_id, p_funding_source_id, null, v_project_id, null,
      'project_default', v_uid, p_request_id, now()
    )
    on conflict (lab_id, item_id, project_id, category) where true
    do update set
      funding_source_id = excluded.funding_source_id,
      set_by_user_id = excluded.set_by_user_id,
      last_used_order_id = excluded.last_used_order_id,
      last_used_at = excluded.last_used_at;
  end if;
end;
$$;

-- approve_order_request gains an optional funding source. We drop & recreate
-- because Postgres can't add params to an existing function in place. The new
-- signature is a strict superset (extra args have defaults) so existing
-- positional callers keep working.
drop function if exists public.approve_order_request(uuid, text);

create or replace function public.approve_order_request(
  p_request_id uuid,
  p_note text default null,
  p_funding_source_id uuid default null,
  p_funding_required boolean default true
)
returns public.order_requests
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.order_requests%rowtype;
  v_funding public.funding_sources%rowtype;
  v_assignment_status text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_row from public.order_requests where id = p_request_id;
  if not found then
    raise exception 'order request not found' using errcode = '02000';
  end if;
  if not public.is_lab_admin(v_row.lab_id) then
    raise exception 'only lab admins may approve requests' using errcode = '42501';
  end if;
  if v_row.status <> 'submitted' then
    raise exception 'only submitted requests can be approved' using errcode = '22023';
  end if;

  -- Funding-side validation. A reviewer may approve without a funding source
  -- only if the request is explicitly marked not_required.
  if p_funding_source_id is not null then
    select * into v_funding from public.funding_sources where id = p_funding_source_id;
    if not found or v_funding.lab_id <> v_row.lab_id then
      raise exception 'funding source is not in this lab' using errcode = '22023';
    end if;
    if v_funding.archived_at is not null then
      raise exception 'cannot assign an archived funding source' using errcode = '22023';
    end if;
    v_assignment_status := 'assigned';
  elsif p_funding_required then
    raise exception 'a funding source is required to approve this request (or pass p_funding_required = false)' using errcode = '22023';
  else
    v_assignment_status := 'not_required';
  end if;

  update public.order_requests
     set status = 'approved',
         review_note = nullif(btrim(coalesce(p_note, '')), ''),
         reviewed_by = v_uid,
         reviewed_at = now(),
         approved_funding_source_id = p_funding_source_id,
         funding_assignment_status = v_assignment_status,
         funding_assigned_by = case when p_funding_source_id is not null then v_uid else null end,
         funding_assigned_at = case when p_funding_source_id is not null then now() else null end
   where id = p_request_id
   returning * into v_row;

  if p_funding_source_id is not null then
    perform public._seed_funding_defaults(p_request_id, p_funding_source_id);
  end if;

  perform public._log_audit(v_row.lab_id, 'order_request', p_request_id, 'approve',
    jsonb_build_object(
      'note', v_row.review_note,
      'funding_source_id', p_funding_source_id,
      'funding_status', v_assignment_status
    ));
  return v_row;
end;
$$;

grant execute on function public.approve_order_request(uuid, text, uuid, boolean) to authenticated;

-- Standalone funding assignment — used to change or attach a funding source
-- after the initial approval.
create or replace function public.set_order_funding(
  p_request_id uuid,
  p_funding_source_id uuid
)
returns public.order_requests
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.order_requests%rowtype;
  v_funding public.funding_sources%rowtype;
  v_prev uuid;
  v_new_status text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_row from public.order_requests where id = p_request_id;
  if not found then
    raise exception 'order request not found' using errcode = '02000';
  end if;
  if not public.is_lab_admin(v_row.lab_id) then
    raise exception 'only lab admins may assign funding' using errcode = '42501';
  end if;
  if v_row.status not in ('submitted', 'approved', 'ordered') then
    raise exception 'cannot change funding for a request in this state' using errcode = '22023';
  end if;

  select * into v_funding from public.funding_sources where id = p_funding_source_id;
  if not found or v_funding.lab_id <> v_row.lab_id then
    raise exception 'funding source is not in this lab' using errcode = '22023';
  end if;
  if v_funding.archived_at is not null then
    raise exception 'cannot assign an archived funding source' using errcode = '22023';
  end if;

  v_prev := v_row.approved_funding_source_id;
  v_new_status := case
    when v_prev is null then 'assigned'
    when v_prev = p_funding_source_id then v_row.funding_assignment_status
    else 'changed'
  end;

  update public.order_requests
     set approved_funding_source_id = p_funding_source_id,
         funding_assignment_status = v_new_status,
         funding_assigned_by = v_uid,
         funding_assigned_at = now()
   where id = p_request_id
   returning * into v_row;

  perform public._seed_funding_defaults(p_request_id, p_funding_source_id);

  perform public._log_audit(v_row.lab_id, 'order_request', p_request_id, 'set_funding',
    jsonb_build_object(
      'funding_source_id', p_funding_source_id,
      'previous_funding_source_id', v_prev,
      'funding_status', v_new_status
    ));
  return v_row;
end;
$$;

create or replace function public.clear_order_funding(p_request_id uuid)
returns public.order_requests
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.order_requests%rowtype;
  v_prev uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_row from public.order_requests where id = p_request_id;
  if not found then
    raise exception 'order request not found' using errcode = '02000';
  end if;
  if not public.is_lab_admin(v_row.lab_id) then
    raise exception 'only lab admins may clear funding' using errcode = '42501';
  end if;
  if v_row.status not in ('submitted', 'approved', 'ordered') then
    raise exception 'cannot clear funding for a request in this state' using errcode = '22023';
  end if;

  v_prev := v_row.approved_funding_source_id;

  update public.order_requests
     set approved_funding_source_id = null,
         funding_assignment_status = 'unassigned',
         funding_assigned_by = null,
         funding_assigned_at = null
   where id = p_request_id
   returning * into v_row;

  perform public._log_audit(v_row.lab_id, 'order_request', p_request_id, 'clear_funding',
    jsonb_build_object('previous_funding_source_id', v_prev));
  return v_row;
end;
$$;

grant execute on function public.set_order_funding(uuid, uuid) to authenticated;
grant execute on function public.clear_order_funding(uuid) to authenticated;
