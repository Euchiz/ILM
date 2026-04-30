-- Data Hub: hard-delete RPCs + distinct private vs restricted semantics
--
-- Until now `archive_dataset` was the only removal path, leaving no way to
-- get rid of a mistakenly-created dataset. Add admin-only `delete_dataset`
-- and editor-scoped `delete_dataset_version` so the UI's delete button has a
-- backend to call.
--
-- Also disambiguate `restricted` and `private`. Previously both fell through
-- the same `can_view_dataset` branch (admin/owner/contact OR approved
-- request), so picking between them in the form had no behavioural effect.
-- New semantics:
--   open-lab          metadata + storage visible to every lab member
--   request-required  metadata visible to every lab member; storage gated
--   restricted        only owner/contact/admin discover by default; other
--                     members may submit access requests
--   private           only owner/contact/admin can see anything; new access
--                     requests are rejected

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

grant execute on function public.can_view_dataset(uuid) to authenticated;

create or replace function public.delete_dataset(p_dataset_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.datasets%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_row from public.datasets where id = p_dataset_id;
  if not found then
    raise exception 'dataset not found' using errcode = '02000';
  end if;
  if not public.is_lab_admin(v_row.lab_id) then
    raise exception 'only lab admins can delete a dataset' using errcode = '42501';
  end if;

  delete from public.datasets where id = p_dataset_id;
  perform public._log_audit(v_row.lab_id, 'dataset', p_dataset_id, 'delete',
    jsonb_build_object('name', v_row.name));
end;
$$;

create or replace function public.delete_dataset_version(p_version_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.dataset_versions%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_row from public.dataset_versions where id = p_version_id;
  if not found then
    raise exception 'dataset version not found' using errcode = '02000';
  end if;
  if not public.can_edit_dataset(v_row.dataset_id) then
    raise exception 'not permitted to delete this dataset version' using errcode = '42501';
  end if;

  delete from public.dataset_versions where id = p_version_id;
  perform public._log_audit(v_row.lab_id, 'dataset_version', p_version_id, 'delete',
    jsonb_build_object('dataset_id', v_row.dataset_id, 'version_name', v_row.version_name));
end;
$$;

-- Reject access requests for private datasets at the RPC layer so the UI can
-- relay a clear error rather than letting them stack up on a tier that does
-- not allow approvals.
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
  if v_dataset.access_level = 'private' then
    raise exception 'private datasets do not accept access requests; contact the owner directly'
      using errcode = '42501';
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

grant execute on function public.delete_dataset(uuid) to authenticated;
grant execute on function public.delete_dataset_version(uuid) to authenticated;
