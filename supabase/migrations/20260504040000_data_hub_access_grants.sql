-- Data Hub: explicit allow-list for restricted/private datasets
--
-- Reworks the four access tiers around a clearer mental model:
--
--   open-lab          everyone in the lab discovers + sees storage; uses are
--                     recorded directly (no review)
--   request-required  everyone in the lab discovers metadata; storage URL is
--                     hidden until the owner approves a request
--   restricted        only owner-assigned users discover the dataset at all;
--                     no public request flow, the owner curates the list
--   private           same allow-list mechanism as restricted; signals stricter
--                     intent (default = owner only)
--
-- For any tier where a viewer is not yet permitted, metadata is visible (when
-- the tier exposes metadata) but storage URLs are not.

create table if not exists public.dataset_access_grants (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  dataset_id uuid not null references public.datasets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  note text,
  unique(dataset_id, user_id)
);

create index if not exists dataset_access_grants_dataset_idx
  on public.dataset_access_grants (dataset_id);
create index if not exists dataset_access_grants_user_idx
  on public.dataset_access_grants (user_id);
create index if not exists dataset_access_grants_lab_idx
  on public.dataset_access_grants (lab_id);

alter table public.dataset_access_grants enable row level security;

-- ---------------------------------------------------------------------------
-- View helpers
-- ---------------------------------------------------------------------------

create or replace function public.has_dataset_access_grant(p_dataset_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.dataset_access_grants g
    where g.dataset_id = p_dataset_id
      and g.user_id = auth.uid()
  );
$$;

grant execute on function public.has_dataset_access_grant(uuid) to authenticated;

create or replace function public.can_view_dataset(p_dataset_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.datasets d
    where d.id = p_dataset_id
      and public.is_lab_member(d.lab_id)
      and (
        d.access_level in ('open-lab', 'request-required')
        or public.is_lab_admin(d.lab_id)
        or d.owner_user_id = auth.uid()
        or d.contact_user_id = auth.uid()
        or public.has_dataset_access_grant(d.id)
      )
  );
$$;

create or replace function public.can_view_dataset_storage(p_dataset_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.datasets d
    where d.id = p_dataset_id
      and public.is_lab_member(d.lab_id)
      and (
        d.access_level = 'open-lab'
        or public.is_lab_admin(d.lab_id)
        or d.owner_user_id = auth.uid()
        or d.contact_user_id = auth.uid()
        or (
          d.access_level = 'request-required'
          and exists (
            select 1
            from public.dataset_access_requests r
            where r.dataset_id = d.id
              and r.requester_user_id = auth.uid()
              and r.status = 'approved'
          )
        )
        or (
          d.access_level in ('restricted', 'private')
          and public.has_dataset_access_grant(d.id)
        )
      )
  );
$$;

grant execute on function public.can_view_dataset(uuid) to authenticated;
grant execute on function public.can_view_dataset_storage(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS for grants
-- ---------------------------------------------------------------------------

-- A granted user only needs to know their own grant exists (so the dataset
-- shows up in their library). The full grant list — i.e. who else has access —
-- is curator-only (owner / contact / admin / created_by).
drop policy if exists dataset_access_grants_select on public.dataset_access_grants;
create policy dataset_access_grants_select on public.dataset_access_grants
  for select using (
    user_id = auth.uid()
    or public.can_edit_dataset(dataset_id)
  );

drop policy if exists dataset_access_grants_insert on public.dataset_access_grants;
create policy dataset_access_grants_insert on public.dataset_access_grants
  for insert with check (
    public.can_edit_dataset(dataset_id)
    and exists (
      select 1 from public.datasets d
      where d.id = dataset_access_grants.dataset_id
        and d.lab_id = dataset_access_grants.lab_id
    )
    and exists (
      select 1 from public.lab_memberships m
      where m.lab_id = dataset_access_grants.lab_id
        and m.user_id = dataset_access_grants.user_id
    )
  );

drop policy if exists dataset_access_grants_delete on public.dataset_access_grants;
create policy dataset_access_grants_delete on public.dataset_access_grants
  for delete using (public.can_edit_dataset(dataset_id));

-- ---------------------------------------------------------------------------
-- Grant/revoke RPCs
-- ---------------------------------------------------------------------------

create or replace function public.grant_dataset_access(
  p_dataset_id uuid,
  p_user_id uuid,
  p_note text default null
) returns public.dataset_access_grants
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_dataset public.datasets%rowtype;
  v_row public.dataset_access_grants%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into v_dataset from public.datasets where id = p_dataset_id;
  if not found then
    raise exception 'dataset not found' using errcode = '02000';
  end if;
  if not public.can_edit_dataset(p_dataset_id) then
    raise exception 'not permitted to manage access for this dataset' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.lab_memberships m
    where m.lab_id = v_dataset.lab_id and m.user_id = p_user_id
  ) then
    raise exception 'user is not a member of this lab' using errcode = '22023';
  end if;

  insert into public.dataset_access_grants (
    lab_id, dataset_id, user_id, granted_by, note
  ) values (
    v_dataset.lab_id,
    p_dataset_id,
    p_user_id,
    v_uid,
    nullif(btrim(coalesce(p_note, '')), '')
  )
  on conflict (dataset_id, user_id)
    do update set granted_by = excluded.granted_by, note = excluded.note
  returning * into v_row;

  perform public._log_audit(v_dataset.lab_id, 'dataset_access_grant', v_row.id, 'grant',
    jsonb_build_object('dataset_id', p_dataset_id, 'user_id', p_user_id));
  return v_row;
end;
$$;

create or replace function public.revoke_dataset_access(p_grant_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.dataset_access_grants%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into v_row from public.dataset_access_grants where id = p_grant_id;
  if not found then
    raise exception 'access grant not found' using errcode = '02000';
  end if;
  if not public.can_edit_dataset(v_row.dataset_id) then
    raise exception 'not permitted to manage access for this dataset' using errcode = '42501';
  end if;

  delete from public.dataset_access_grants where id = p_grant_id;
  perform public._log_audit(v_row.lab_id, 'dataset_access_grant', p_grant_id, 'revoke',
    jsonb_build_object('dataset_id', v_row.dataset_id, 'user_id', v_row.user_id));
end;
$$;

grant execute on function public.grant_dataset_access(uuid, uuid, text) to authenticated;
grant execute on function public.revoke_dataset_access(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Requests are now only valid for `request-required`. Restricted and private
-- are owner-curated and reject submissions outright.
-- ---------------------------------------------------------------------------

create or replace function public.submit_dataset_access_request(
  p_dataset_id uuid,
  p_dataset_version_id uuid default null,
  p_project_id uuid default null,
  p_intended_use text default null,
  p_requested_access_type text default 'reuse-in-project'
) returns public.dataset_access_requests
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_intended_use text := nullif(btrim(coalesce(p_intended_use, '')), '');
  v_dataset public.datasets%rowtype;
  v_row public.dataset_access_requests%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into v_dataset from public.datasets where id = p_dataset_id;
  if not found then
    raise exception 'dataset not found' using errcode = '02000';
  end if;
  if v_dataset.access_level in ('restricted', 'private') then
    raise exception 'this dataset does not accept requests; ask the owner to grant access directly'
      using errcode = '42501';
  end if;
  if v_dataset.access_level = 'open-lab' then
    raise exception 'open-lab datasets do not need a request; record use directly'
      using errcode = '22023';
  end if;
  if not public.can_view_dataset(p_dataset_id) then
    raise exception 'dataset is not visible to this user' using errcode = '42501';
  end if;
  if v_intended_use is null then
    raise exception 'intended use is required' using errcode = '22023';
  end if;
  if p_dataset_version_id is not null and not exists (
    select 1 from public.dataset_versions v
    where v.id = p_dataset_version_id and v.dataset_id = p_dataset_id
  ) then
    raise exception 'version must belong to this dataset' using errcode = '22023';
  end if;
  if p_project_id is not null and not exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.lab_id = v_dataset.lab_id
  ) then
    raise exception 'project is not in this lab' using errcode = '22023';
  end if;

  insert into public.dataset_access_requests (
    lab_id, dataset_id, dataset_version_id, requester_user_id, project_id,
    intended_use, requested_access_type, status
  ) values (
    v_dataset.lab_id,
    p_dataset_id,
    p_dataset_version_id,
    v_uid,
    p_project_id,
    v_intended_use,
    coalesce(p_requested_access_type, 'reuse-in-project'),
    'pending'
  )
  returning * into v_row;

  perform public._log_audit(v_dataset.lab_id, 'dataset_access_request', v_row.id, 'submit',
    jsonb_build_object('dataset_id', p_dataset_id, 'project_id', p_project_id));
  return v_row;
end;
$$;
