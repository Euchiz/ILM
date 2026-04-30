-- Data Hub
--
-- Lab-scoped dataset registry for discoverability, access/reuse requests,
-- project links, storage references, and lightweight version lineage. ILM
-- stores metadata and locations only, not raw dataset files.

-- ---------------------------------------------------------------------------
-- 1) Tables
-- ---------------------------------------------------------------------------

create table if not exists public.datasets (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,

  name text not null,
  description text,
  dataset_type text not null default 'other'
    check (dataset_type in ('sequencing', 'imaging', 'flow-cytometry',
                            'proteomics', 'metabolomics', 'simulation',
                            'annotation', 'clinical', 'external-reference',
                            'other')),
  source_type text not null default 'internal-generated'
    check (source_type in ('internal-generated', 'external-public',
                           'collaborator-shared', 'vendor-provided',
                           'user-uploaded-metadata', 'other')),
  status text not null default 'planned'
    check (status in ('planned', 'generating', 'raw-available', 'processing',
                      'processed', 'validated', 'archived', 'deprecated')),
  access_level text not null default 'request-required'
    check (access_level in ('open-lab', 'request-required', 'restricted',
                            'private')),

  owner_user_id uuid references auth.users(id) on delete set null,
  contact_user_id uuid references auth.users(id) on delete set null,

  organism text,
  sample_type text,
  assay_platform text,

  -- Kept for compatibility with the implementation brief. The app writes
  -- storage references to dataset_storage_links so sensitive locations can be
  -- hidden by RLS while metadata remains discoverable.
  primary_storage_uri text,
  external_accession text,
  citation text,
  license text,
  usage_conditions text,

  recommended_use text,
  not_recommended_use text,
  qc_summary text,
  notes text,

  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists datasets_lab_idx on public.datasets (lab_id);
create index if not exists datasets_owner_idx on public.datasets (owner_user_id);
create index if not exists datasets_status_idx on public.datasets (lab_id, status);
create index if not exists datasets_access_level_idx on public.datasets (lab_id, access_level);
create index if not exists datasets_updated_idx on public.datasets (lab_id, updated_at desc);

drop trigger if exists datasets_set_updated_at on public.datasets;
create trigger datasets_set_updated_at
before update on public.datasets
for each row execute function public.set_updated_at();

create table if not exists public.dataset_versions (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  dataset_id uuid not null references public.datasets(id) on delete cascade,
  version_name text not null,
  version_type text not null default 'processed'
    check (version_type in ('raw', 'processed', 'analysis-ready', 'derived',
                            'annotation', 'figure-source', 'model-input',
                            'other')),
  description text,
  storage_uri text,
  parent_version_id uuid references public.dataset_versions(id) on delete set null,
  processing_summary text,
  software_environment text,
  qc_summary text,
  file_summary text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dataset_versions_dataset_idx on public.dataset_versions (dataset_id);
create index if not exists dataset_versions_lab_idx on public.dataset_versions (lab_id);

drop trigger if exists dataset_versions_set_updated_at on public.dataset_versions;
create trigger dataset_versions_set_updated_at
before update on public.dataset_versions
for each row execute function public.set_updated_at();

create table if not exists public.dataset_project_links (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  dataset_id uuid not null references public.datasets(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  relationship_type text not null default 'used-by'
    check (relationship_type in ('generated-by', 'used-by', 'derived-from',
                                 'supports-publication', 'external-reference',
                                 'validation', 'training', 'benchmark')),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(dataset_id, project_id, relationship_type)
);

create index if not exists dataset_project_links_dataset_idx on public.dataset_project_links (dataset_id);
create index if not exists dataset_project_links_project_idx on public.dataset_project_links (project_id);
create index if not exists dataset_project_links_lab_idx on public.dataset_project_links (lab_id);

create table if not exists public.dataset_access_requests (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  dataset_id uuid not null references public.datasets(id) on delete cascade,
  dataset_version_id uuid references public.dataset_versions(id) on delete set null,
  requester_user_id uuid references auth.users(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  intended_use text not null,
  requested_access_type text not null default 'reuse-in-project',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'denied', 'withdrawn')),
  reviewer_user_id uuid references auth.users(id) on delete set null,
  decision_note text,
  conditions text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  withdrawn_at timestamptz
);

create index if not exists dataset_access_requests_dataset_idx on public.dataset_access_requests (dataset_id);
create index if not exists dataset_access_requests_requester_idx on public.dataset_access_requests (requester_user_id);
create index if not exists dataset_access_requests_status_idx on public.dataset_access_requests (lab_id, status);

create table if not exists public.dataset_tags (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  dataset_id uuid not null references public.datasets(id) on delete cascade,
  tag text not null,
  created_at timestamptz not null default now(),
  unique(dataset_id, tag)
);

create index if not exists dataset_tags_dataset_idx on public.dataset_tags (dataset_id);
create index if not exists dataset_tags_tag_idx on public.dataset_tags (lab_id, tag);

create table if not exists public.dataset_storage_links (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  dataset_id uuid not null references public.datasets(id) on delete cascade,
  dataset_version_id uuid references public.dataset_versions(id) on delete cascade,
  label text,
  storage_uri text not null,
  storage_type text not null default 'path'
    check (storage_type in ('path', 'url', 'accession', 'doi', 'publication',
                            'other')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists dataset_storage_links_dataset_idx on public.dataset_storage_links (dataset_id);
create index if not exists dataset_storage_links_version_idx on public.dataset_storage_links (dataset_version_id);
create index if not exists dataset_storage_links_lab_idx on public.dataset_storage_links (lab_id);

-- ---------------------------------------------------------------------------
-- 2) Helpers
-- ---------------------------------------------------------------------------

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
        or (
          d.access_level = 'restricted'
          and exists (
            select 1
            from public.dataset_access_requests r
            where r.dataset_id = d.id
              and r.requester_user_id = auth.uid()
              and r.status = 'approved'
          )
        )
      )
  );
$$;

create or replace function public.can_edit_dataset(p_dataset_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.datasets d
    where d.id = p_dataset_id
      and (
        public.is_lab_admin(d.lab_id)
        or d.owner_user_id = auth.uid()
        or d.contact_user_id = auth.uid()
        or d.created_by = auth.uid()
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
        or exists (
          select 1
          from public.dataset_access_requests r
          where r.dataset_id = d.id
            and r.requester_user_id = auth.uid()
            and r.status = 'approved'
        )
      )
  );
$$;

grant execute on function public.can_view_dataset(uuid) to authenticated;
grant execute on function public.can_edit_dataset(uuid) to authenticated;
grant execute on function public.can_view_dataset_storage(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------------------------

alter table public.datasets enable row level security;
alter table public.dataset_versions enable row level security;
alter table public.dataset_project_links enable row level security;
alter table public.dataset_access_requests enable row level security;
alter table public.dataset_tags enable row level security;
alter table public.dataset_storage_links enable row level security;

drop policy if exists datasets_select on public.datasets;
create policy datasets_select on public.datasets
  for select using (public.can_view_dataset(id));

drop policy if exists datasets_insert on public.datasets;
create policy datasets_insert on public.datasets
  for insert with check (
    public.is_lab_member(lab_id)
    and (created_by is null or created_by = auth.uid())
    and (updated_by is null or updated_by = auth.uid())
  );

drop policy if exists datasets_update on public.datasets;
create policy datasets_update on public.datasets
  for update using (public.can_edit_dataset(id))
  with check (public.can_edit_dataset(id));

drop policy if exists datasets_delete_admin on public.datasets;
create policy datasets_delete_admin on public.datasets
  for delete using (public.is_lab_admin(lab_id));

drop policy if exists dataset_versions_select on public.dataset_versions;
create policy dataset_versions_select on public.dataset_versions
  for select using (public.can_view_dataset(dataset_id));

drop policy if exists dataset_versions_insert on public.dataset_versions;
create policy dataset_versions_insert on public.dataset_versions
  for insert with check (
    public.can_edit_dataset(dataset_id)
    and exists (
      select 1 from public.datasets d
      where d.id = dataset_versions.dataset_id
        and d.lab_id = dataset_versions.lab_id
    )
  );

drop policy if exists dataset_versions_update on public.dataset_versions;
create policy dataset_versions_update on public.dataset_versions
  for update using (public.can_edit_dataset(dataset_id))
  with check (public.can_edit_dataset(dataset_id));

drop policy if exists dataset_versions_delete on public.dataset_versions;
create policy dataset_versions_delete on public.dataset_versions
  for delete using (public.can_edit_dataset(dataset_id));

drop policy if exists dataset_project_links_select on public.dataset_project_links;
create policy dataset_project_links_select on public.dataset_project_links
  for select using (public.can_view_dataset(dataset_id));

drop policy if exists dataset_project_links_insert on public.dataset_project_links;
create policy dataset_project_links_insert on public.dataset_project_links
  for insert with check (
    public.can_edit_dataset(dataset_id)
    and exists (
      select 1
      from public.projects p
      where p.id = dataset_project_links.project_id
        and p.lab_id = dataset_project_links.lab_id
    )
  );

drop policy if exists dataset_project_links_delete on public.dataset_project_links;
create policy dataset_project_links_delete on public.dataset_project_links
  for delete using (public.can_edit_dataset(dataset_id));

drop policy if exists dataset_access_requests_select on public.dataset_access_requests;
create policy dataset_access_requests_select on public.dataset_access_requests
  for select using (
    public.is_lab_admin(lab_id)
    or requester_user_id = auth.uid()
    or exists (
      select 1 from public.datasets d
      where d.id = dataset_access_requests.dataset_id
        and (d.owner_user_id = auth.uid() or d.contact_user_id = auth.uid())
    )
  );

drop policy if exists dataset_access_requests_insert on public.dataset_access_requests;
create policy dataset_access_requests_insert on public.dataset_access_requests
  for insert with check (
    public.is_lab_member(lab_id)
    and requester_user_id = auth.uid()
    and status = 'pending'
    and public.can_view_dataset(dataset_id)
    and exists (
      select 1 from public.datasets d
      where d.id = dataset_access_requests.dataset_id
        and d.lab_id = dataset_access_requests.lab_id
    )
  );

drop policy if exists dataset_access_requests_delete on public.dataset_access_requests;
create policy dataset_access_requests_delete on public.dataset_access_requests
  for delete using (
    public.is_lab_admin(lab_id)
    or requester_user_id = auth.uid()
  );

drop policy if exists dataset_tags_select on public.dataset_tags;
create policy dataset_tags_select on public.dataset_tags
  for select using (public.can_view_dataset(dataset_id));

drop policy if exists dataset_tags_insert on public.dataset_tags;
create policy dataset_tags_insert on public.dataset_tags
  for insert with check (
    public.can_edit_dataset(dataset_id)
    and exists (
      select 1 from public.datasets d
      where d.id = dataset_tags.dataset_id
        and d.lab_id = dataset_tags.lab_id
    )
  );

drop policy if exists dataset_tags_delete on public.dataset_tags;
create policy dataset_tags_delete on public.dataset_tags
  for delete using (public.can_edit_dataset(dataset_id));

drop policy if exists dataset_storage_links_select on public.dataset_storage_links;
create policy dataset_storage_links_select on public.dataset_storage_links
  for select using (public.can_view_dataset_storage(dataset_id));

drop policy if exists dataset_storage_links_insert on public.dataset_storage_links;
create policy dataset_storage_links_insert on public.dataset_storage_links
  for insert with check (
    public.can_edit_dataset(dataset_id)
    and exists (
      select 1 from public.datasets d
      where d.id = dataset_storage_links.dataset_id
        and d.lab_id = dataset_storage_links.lab_id
    )
    and (
      dataset_version_id is null
      or exists (
        select 1 from public.dataset_versions v
        where v.id = dataset_storage_links.dataset_version_id
          and v.dataset_id = dataset_storage_links.dataset_id
          and v.lab_id = dataset_storage_links.lab_id
      )
    )
  );

drop policy if exists dataset_storage_links_delete on public.dataset_storage_links;
create policy dataset_storage_links_delete on public.dataset_storage_links
  for delete using (public.can_edit_dataset(dataset_id));

-- ---------------------------------------------------------------------------
-- 4) RPCs
-- ---------------------------------------------------------------------------

create or replace function public.archive_dataset(p_dataset_id uuid)
returns public.datasets
language plpgsql security definer set search_path = public as $$
declare
  v_row public.datasets%rowtype;
begin
  select * into v_row from public.datasets where id = p_dataset_id;
  if not found then
    raise exception 'dataset not found' using errcode = '02000';
  end if;
  if not public.can_edit_dataset(p_dataset_id) then
    raise exception 'not permitted to archive this dataset' using errcode = '42501';
  end if;

  update public.datasets
     set archived_at = coalesce(archived_at, now()),
         status = 'archived',
         updated_by = auth.uid()
   where id = p_dataset_id
   returning * into v_row;

  perform public._log_audit(v_row.lab_id, 'dataset', p_dataset_id, 'archive', '{}'::jsonb);
  return v_row;
end;
$$;

create or replace function public.restore_dataset(p_dataset_id uuid)
returns public.datasets
language plpgsql security definer set search_path = public as $$
declare
  v_row public.datasets%rowtype;
begin
  select * into v_row from public.datasets where id = p_dataset_id;
  if not found then
    raise exception 'dataset not found' using errcode = '02000';
  end if;
  if not public.can_edit_dataset(p_dataset_id) then
    raise exception 'not permitted to restore this dataset' using errcode = '42501';
  end if;

  update public.datasets
     set archived_at = null,
         status = case when status = 'archived' then 'processed' else status end,
         updated_by = auth.uid()
   where id = p_dataset_id
   returning * into v_row;

  perform public._log_audit(v_row.lab_id, 'dataset', p_dataset_id, 'restore', '{}'::jsonb);
  return v_row;
end;
$$;

create or replace function public.withdraw_dataset_access_request(p_request_id uuid)
returns public.dataset_access_requests
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.dataset_access_requests%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_row from public.dataset_access_requests where id = p_request_id;
  if not found then
    raise exception 'dataset request not found' using errcode = '02000';
  end if;
  if v_row.requester_user_id <> v_uid and not public.is_lab_admin(v_row.lab_id) then
    raise exception 'not permitted to withdraw this request' using errcode = '42501';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'only pending requests can be withdrawn' using errcode = '22023';
  end if;

  update public.dataset_access_requests
     set status = 'withdrawn',
         withdrawn_at = now()
   where id = p_request_id
   returning * into v_row;

  perform public._log_audit(v_row.lab_id, 'dataset_access_request', p_request_id, 'withdraw', '{}'::jsonb);
  return v_row;
end;
$$;

create or replace function public.review_dataset_access_request(
  p_request_id uuid,
  p_status text,
  p_decision_note text default null,
  p_conditions text default null,
  p_create_project_link boolean default true
)
returns public.dataset_access_requests
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.dataset_access_requests%rowtype;
  v_dataset public.datasets%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_status not in ('approved', 'denied') then
    raise exception 'review status must be approved or denied' using errcode = '22023';
  end if;

  select * into v_row from public.dataset_access_requests where id = p_request_id;
  if not found then
    raise exception 'dataset request not found' using errcode = '02000';
  end if;

  select * into v_dataset from public.datasets where id = v_row.dataset_id;
  if not found then
    raise exception 'dataset not found' using errcode = '02000';
  end if;

  if not (
    public.is_lab_admin(v_dataset.lab_id)
    or v_dataset.owner_user_id = v_uid
    or v_dataset.contact_user_id = v_uid
  ) then
    raise exception 'not permitted to review this request' using errcode = '42501';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'only pending requests can be reviewed' using errcode = '22023';
  end if;

  update public.dataset_access_requests
     set status = p_status,
         reviewer_user_id = v_uid,
         decision_note = nullif(btrim(coalesce(p_decision_note, '')), ''),
         conditions = nullif(btrim(coalesce(p_conditions, '')), ''),
         reviewed_at = now()
   where id = p_request_id
   returning * into v_row;

  if p_status = 'approved'
     and p_create_project_link
     and v_row.project_id is not null then
    insert into public.dataset_project_links (
      lab_id, dataset_id, project_id, relationship_type, note, created_by
    ) values (
      v_row.lab_id, v_row.dataset_id, v_row.project_id, 'used-by',
      'Created from approved access request', v_uid
    )
    on conflict (dataset_id, project_id, relationship_type) do nothing;
  end if;

  perform public._log_audit(v_row.lab_id, 'dataset_access_request', p_request_id, p_status,
    jsonb_build_object('dataset_id', v_row.dataset_id, 'project_id', v_row.project_id));
  return v_row;
end;
$$;

grant execute on function public.archive_dataset(uuid) to authenticated;
grant execute on function public.restore_dataset(uuid) to authenticated;
grant execute on function public.withdraw_dataset_access_request(uuid) to authenticated;
grant execute on function public.review_dataset_access_request(uuid, text, text, text, boolean) to authenticated;
