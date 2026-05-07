-- create_dataset previously coalesced p_owner_user_id / p_contact_user_id to
-- the calling user, which made it impossible to create a dataset with no
-- owner / no contact (the form's "None" option had no effect — the calling
-- user was always written back). The columns are nullable
-- (`on delete set null`), so honor an explicit null instead of substituting
-- the caller. Callers that genuinely want a default still get one — the
-- client passes args.userId for that case.

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
    p_owner_user_id,
    p_contact_user_id,
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

grant execute on function public.create_dataset(
  uuid, text, text, text, text, text, text, uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text[], jsonb, text
) to authenticated;
