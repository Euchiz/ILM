-- Data Hub write RPCs
--
-- Supabase's JWT/RLS behavior can reject direct INSERT/UPDATE WITH CHECK
-- paths even when the user is valid. Keep Data Hub state changes on the
-- SECURITY DEFINER path used elsewhere in ILM.

create or replace function public._dataset_storage_type(p_storage_uri text)
returns text
language sql immutable set search_path = public as $$
  select case
    when p_storage_uri is null or btrim(p_storage_uri) = '' then 'path'
    when lower(p_storage_uri) like 'http://%' or lower(p_storage_uri) like 'https://%' then 'url'
    when lower(p_storage_uri) like 'doi:%' or lower(p_storage_uri) like '%doi.org/%' then 'doi'
    when p_storage_uri ~* '^(geo|sra|ena|prjna|gse|srp|erp)' then 'accession'
    else 'path'
  end;
$$;

create or replace function public._replace_dataset_children(
  p_lab_id uuid,
  p_dataset_id uuid,
  p_tags text[] default '{}',
  p_project_links jsonb default '[]'::jsonb,
  p_storage_uri text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_tag text;
  v_link jsonb;
  v_project_id uuid;
  v_relationship text;
  v_storage_uri text := nullif(btrim(coalesce(p_storage_uri, '')), '');
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_project_links, '[]'::jsonb)) <> 'array' then
    raise exception 'project links must be a json array' using errcode = '22023';
  end if;

  delete from public.dataset_tags where dataset_id = p_dataset_id;
  delete from public.dataset_project_links where dataset_id = p_dataset_id;
  delete from public.dataset_storage_links
    where dataset_id = p_dataset_id and dataset_version_id is null;

  foreach v_tag in array coalesce(p_tags, '{}')
  loop
    v_tag := nullif(btrim(v_tag), '');
    if v_tag is not null then
      insert into public.dataset_tags (lab_id, dataset_id, tag)
      values (p_lab_id, p_dataset_id, v_tag)
      on conflict (dataset_id, tag) do nothing;
    end if;
  end loop;

  for v_link in select * from jsonb_array_elements(coalesce(p_project_links, '[]'::jsonb))
  loop
    v_project_id := nullif(v_link->>'project_id', '')::uuid;
    v_relationship := coalesce(nullif(btrim(v_link->>'relationship_type'), ''), 'used-by');

    if v_relationship not in ('generated-by', 'used-by', 'derived-from',
                              'supports-publication', 'external-reference',
                              'validation', 'training', 'benchmark') then
      raise exception 'invalid dataset project relationship: %', v_relationship using errcode = '22023';
    end if;

    if not exists (
      select 1 from public.projects p
      where p.id = v_project_id and p.lab_id = p_lab_id
    ) then
      raise exception 'project is not in this lab' using errcode = '22023';
    end if;

    insert into public.dataset_project_links (
      lab_id, dataset_id, project_id, relationship_type, note, created_by
    ) values (
      p_lab_id,
      p_dataset_id,
      v_project_id,
      v_relationship,
      nullif(btrim(coalesce(v_link->>'note', '')), ''),
      v_uid
    )
    on conflict (dataset_id, project_id, relationship_type) do nothing;
  end loop;

  if v_storage_uri is not null then
    insert into public.dataset_storage_links (
      lab_id, dataset_id, dataset_version_id, label, storage_uri, storage_type, created_by
    ) values (
      p_lab_id,
      p_dataset_id,
      null,
      'Primary location',
      v_storage_uri,
      public._dataset_storage_type(v_storage_uri),
      v_uid
    );
  end if;
end;
$$;

create or replace function public.create_dataset(
  p_lab_id uuid,
  p_name text,
  p_description text default null,
  p_dataset_type text default 'other',
  p_source_type text default 'internal-generated',
  p_status text default 'planned',
  p_access_level text default 'request-required',
  p_owner_user_id uuid default null,
  p_contact_user_id uuid default null,
  p_organism text default null,
  p_sample_type text default null,
  p_assay_platform text default null,
  p_external_accession text default null,
  p_citation text default null,
  p_license text default null,
  p_usage_conditions text default null,
  p_recommended_use text default null,
  p_not_recommended_use text default null,
  p_qc_summary text default null,
  p_notes text default null,
  p_tags text[] default '{}',
  p_project_links jsonb default '[]'::jsonb,
  p_storage_uri text default null
) returns public.datasets
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_storage_uri text := nullif(btrim(coalesce(p_storage_uri, '')), '');
  v_external_accession text := nullif(btrim(coalesce(p_external_accession, '')), '');
  v_citation text := nullif(btrim(coalesce(p_citation, '')), '');
  v_row public.datasets%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.is_lab_member(p_lab_id) then
    raise exception 'not a member of this lab' using errcode = '42501';
  end if;
  if v_name is null then
    raise exception 'dataset name is required' using errcode = '22023';
  end if;
  if v_storage_uri is null and v_external_accession is null and v_citation is null then
    raise exception 'add at least one storage URI, external accession, or citation' using errcode = '22023';
  end if;

  insert into public.datasets (
    lab_id, name, description, dataset_type, source_type, status, access_level,
    owner_user_id, contact_user_id, organism, sample_type, assay_platform,
    primary_storage_uri, external_accession, citation, license, usage_conditions,
    recommended_use, not_recommended_use, qc_summary, notes, created_by, updated_by
  ) values (
    p_lab_id,
    v_name,
    nullif(btrim(coalesce(p_description, '')), ''),
    coalesce(p_dataset_type, 'other'),
    coalesce(p_source_type, 'internal-generated'),
    coalesce(p_status, 'planned'),
    coalesce(p_access_level, 'request-required'),
    coalesce(p_owner_user_id, v_uid),
    coalesce(p_contact_user_id, p_owner_user_id, v_uid),
    nullif(btrim(coalesce(p_organism, '')), ''),
    nullif(btrim(coalesce(p_sample_type, '')), ''),
    nullif(btrim(coalesce(p_assay_platform, '')), ''),
    null,
    v_external_accession,
    v_citation,
    nullif(btrim(coalesce(p_license, '')), ''),
    nullif(btrim(coalesce(p_usage_conditions, '')), ''),
    nullif(btrim(coalesce(p_recommended_use, '')), ''),
    nullif(btrim(coalesce(p_not_recommended_use, '')), ''),
    nullif(btrim(coalesce(p_qc_summary, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_uid,
    v_uid
  )
  returning * into v_row;

  perform public._replace_dataset_children(
    p_lab_id, v_row.id, p_tags, p_project_links, v_storage_uri
  );
  perform public._log_audit(p_lab_id, 'dataset', v_row.id, 'create', '{}'::jsonb);
  return v_row;
end;
$$;

create or replace function public.update_dataset(
  p_dataset_id uuid,
  p_name text,
  p_description text default null,
  p_dataset_type text default 'other',
  p_source_type text default 'internal-generated',
  p_status text default 'planned',
  p_access_level text default 'request-required',
  p_owner_user_id uuid default null,
  p_contact_user_id uuid default null,
  p_organism text default null,
  p_sample_type text default null,
  p_assay_platform text default null,
  p_external_accession text default null,
  p_citation text default null,
  p_license text default null,
  p_usage_conditions text default null,
  p_recommended_use text default null,
  p_not_recommended_use text default null,
  p_qc_summary text default null,
  p_notes text default null,
  p_tags text[] default '{}',
  p_project_links jsonb default '[]'::jsonb,
  p_storage_uri text default null
) returns public.datasets
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_storage_uri text := nullif(btrim(coalesce(p_storage_uri, '')), '');
  v_external_accession text := nullif(btrim(coalesce(p_external_accession, '')), '');
  v_citation text := nullif(btrim(coalesce(p_citation, '')), '');
  v_row public.datasets%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into v_row from public.datasets where id = p_dataset_id;
  if not found then
    raise exception 'dataset not found' using errcode = '02000';
  end if;
  if not public.can_edit_dataset(p_dataset_id) then
    raise exception 'not permitted to edit this dataset' using errcode = '42501';
  end if;
  if v_name is null then
    raise exception 'dataset name is required' using errcode = '22023';
  end if;
  if v_storage_uri is null and v_external_accession is null and v_citation is null then
    raise exception 'add at least one storage URI, external accession, or citation' using errcode = '22023';
  end if;

  update public.datasets
     set name = v_name,
         description = nullif(btrim(coalesce(p_description, '')), ''),
         dataset_type = coalesce(p_dataset_type, 'other'),
         source_type = coalesce(p_source_type, 'internal-generated'),
         status = coalesce(p_status, 'planned'),
         access_level = coalesce(p_access_level, 'request-required'),
         owner_user_id = p_owner_user_id,
         contact_user_id = p_contact_user_id,
         organism = nullif(btrim(coalesce(p_organism, '')), ''),
         sample_type = nullif(btrim(coalesce(p_sample_type, '')), ''),
         assay_platform = nullif(btrim(coalesce(p_assay_platform, '')), ''),
         primary_storage_uri = null,
         external_accession = v_external_accession,
         citation = v_citation,
         license = nullif(btrim(coalesce(p_license, '')), ''),
         usage_conditions = nullif(btrim(coalesce(p_usage_conditions, '')), ''),
         recommended_use = nullif(btrim(coalesce(p_recommended_use, '')), ''),
         not_recommended_use = nullif(btrim(coalesce(p_not_recommended_use, '')), ''),
         qc_summary = nullif(btrim(coalesce(p_qc_summary, '')), ''),
         notes = nullif(btrim(coalesce(p_notes, '')), ''),
         updated_by = v_uid
   where id = p_dataset_id
   returning * into v_row;

  perform public._replace_dataset_children(
    v_row.lab_id, v_row.id, p_tags, p_project_links, v_storage_uri
  );
  perform public._log_audit(v_row.lab_id, 'dataset', v_row.id, 'update', '{}'::jsonb);
  return v_row;
end;
$$;

create or replace function public.create_dataset_version(
  p_dataset_id uuid,
  p_version_name text,
  p_version_type text default 'processed',
  p_description text default null,
  p_parent_version_id uuid default null,
  p_processing_summary text default null,
  p_software_environment text default null,
  p_qc_summary text default null,
  p_file_summary text default null,
  p_notes text default null,
  p_storage_uri text default null
) returns public.dataset_versions
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_name text := nullif(btrim(coalesce(p_version_name, '')), '');
  v_storage_uri text := nullif(btrim(coalesce(p_storage_uri, '')), '');
  v_dataset public.datasets%rowtype;
  v_row public.dataset_versions%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into v_dataset from public.datasets where id = p_dataset_id;
  if not found then
    raise exception 'dataset not found' using errcode = '02000';
  end if;
  if not public.can_edit_dataset(p_dataset_id) then
    raise exception 'not permitted to add a dataset version' using errcode = '42501';
  end if;
  if v_name is null then
    raise exception 'version name is required' using errcode = '22023';
  end if;
  if p_parent_version_id is not null and not exists (
    select 1 from public.dataset_versions v
    where v.id = p_parent_version_id and v.dataset_id = p_dataset_id
  ) then
    raise exception 'parent version must belong to this dataset' using errcode = '22023';
  end if;

  insert into public.dataset_versions (
    lab_id, dataset_id, version_name, version_type, description,
    storage_uri, parent_version_id, processing_summary, software_environment,
    qc_summary, file_summary, notes, created_by, updated_by
  ) values (
    v_dataset.lab_id,
    p_dataset_id,
    v_name,
    coalesce(p_version_type, 'processed'),
    nullif(btrim(coalesce(p_description, '')), ''),
    null,
    p_parent_version_id,
    nullif(btrim(coalesce(p_processing_summary, '')), ''),
    nullif(btrim(coalesce(p_software_environment, '')), ''),
    nullif(btrim(coalesce(p_qc_summary, '')), ''),
    nullif(btrim(coalesce(p_file_summary, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_uid,
    v_uid
  )
  returning * into v_row;

  if v_storage_uri is not null then
    insert into public.dataset_storage_links (
      lab_id, dataset_id, dataset_version_id, label, storage_uri, storage_type, created_by
    ) values (
      v_dataset.lab_id,
      p_dataset_id,
      v_row.id,
      v_row.version_name || ' location',
      v_storage_uri,
      public._dataset_storage_type(v_storage_uri),
      v_uid
    );
  end if;

  perform public._log_audit(v_dataset.lab_id, 'dataset_version', v_row.id, 'create',
    jsonb_build_object('dataset_id', p_dataset_id));
  return v_row;
end;
$$;

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

grant execute on function public._dataset_storage_type(text) to authenticated;
grant execute on function public.create_dataset(
  uuid, text, text, text, text, text, text, uuid, uuid, text, text, text,
  text, text, text, text, text, text, text, text, text[], jsonb, text
) to authenticated;
grant execute on function public.update_dataset(
  uuid, text, text, text, text, text, text, uuid, uuid, text, text, text,
  text, text, text, text, text, text, text, text, text[], jsonb, text
) to authenticated;
grant execute on function public.create_dataset_version(
  uuid, text, text, text, uuid, text, text, text, text, text, text
) to authenticated;
grant execute on function public.submit_dataset_access_request(
  uuid, uuid, uuid, text, text
) to authenticated;
