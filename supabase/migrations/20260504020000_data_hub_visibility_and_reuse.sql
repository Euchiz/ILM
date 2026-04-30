-- Data Hub visibility/reuse refinement
--
-- - open-lab and request-required metadata appears in every lab member's library
-- - restricted/private metadata appears only to selected users (approved access),
--   owner/contact, and admins
-- - open-lab datasets do not need an access request; users directly record use

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

create or replace function public.record_dataset_use(
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
  if not public.is_lab_member(v_dataset.lab_id) then
    raise exception 'not a member of this lab' using errcode = '42501';
  end if;
  if v_dataset.access_level <> 'open-lab' then
    raise exception 'only open-lab datasets can record use without review' using errcode = '22023';
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
    intended_use, requested_access_type, status, reviewer_user_id,
    decision_note, reviewed_at
  ) values (
    v_dataset.lab_id,
    p_dataset_id,
    p_dataset_version_id,
    v_uid,
    p_project_id,
    v_intended_use,
    coalesce(p_requested_access_type, 'reuse-in-project'),
    'approved',
    v_uid,
    'Open-lab dataset; use recorded directly.',
    now()
  )
  returning * into v_row;

  if p_project_id is not null then
    insert into public.dataset_project_links (
      lab_id, dataset_id, project_id, relationship_type, note, created_by
    ) values (
      v_dataset.lab_id,
      p_dataset_id,
      p_project_id,
      'used-by',
      'Created from open-lab recorded use',
      v_uid
    )
    on conflict (dataset_id, project_id, relationship_type) do nothing;
  end if;

  perform public._log_audit(v_dataset.lab_id, 'dataset_access_request', v_row.id, 'record_use',
    jsonb_build_object('dataset_id', p_dataset_id, 'project_id', p_project_id));
  return v_row;
end;
$$;

grant execute on function public.record_dataset_use(
  uuid, uuid, uuid, text, text
) to authenticated;
