-- Data Hub: tighten `private` to creator + admins only
--
-- Earlier passes treated private and restricted as the same allow-list
-- mechanism. Per the product model the two should diverge:
--
--   private     visible only to the dataset's creator/owner and lab
--               admins/owner. The contact field does not grant view, and
--               grants are refused — there is no way to share with other
--               members short of changing the access level.
--   restricted  visible to owner, contact, lab admins, AND any user the
--               owner explicitly grants access. Requests still rejected.
--
-- This keeps `private` meaningful as the "do not share" tier and `restricted`
-- as "share with a curated subset".

create or replace function public.can_view_dataset(p_dataset_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.datasets d
    where d.id = p_dataset_id
      and public.is_lab_member(d.lab_id)
      and (
        case d.access_level
          when 'open-lab' then true
          when 'request-required' then true
          when 'restricted' then
            public.is_lab_admin(d.lab_id)
            or d.owner_user_id = auth.uid()
            or d.created_by = auth.uid()
            or d.contact_user_id = auth.uid()
            or public.has_dataset_access_grant(d.id)
          when 'private' then
            public.is_lab_admin(d.lab_id)
            or d.owner_user_id = auth.uid()
            or d.created_by = auth.uid()
          else false
        end
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
        case d.access_level
          when 'open-lab' then true
          when 'request-required' then
            public.is_lab_admin(d.lab_id)
            or d.owner_user_id = auth.uid()
            or d.contact_user_id = auth.uid()
            or exists (
              select 1
              from public.dataset_access_requests r
              where r.dataset_id = d.id
                and r.requester_user_id = auth.uid()
                and r.status = 'approved'
            )
          when 'restricted' then
            public.is_lab_admin(d.lab_id)
            or d.owner_user_id = auth.uid()
            or d.created_by = auth.uid()
            or d.contact_user_id = auth.uid()
            or public.has_dataset_access_grant(d.id)
          when 'private' then
            public.is_lab_admin(d.lab_id)
            or d.owner_user_id = auth.uid()
            or d.created_by = auth.uid()
          else false
        end
      )
  );
$$;

grant execute on function public.can_view_dataset(uuid) to authenticated;
grant execute on function public.can_view_dataset_storage(uuid) to authenticated;

-- Refuse grants on private datasets so the UI's lack of grant management for
-- private cannot be circumvented via direct RPC.
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
  if v_dataset.access_level = 'private' then
    raise exception 'private datasets cannot be shared; switch to restricted to grant access'
      using errcode = '42501';
  end if;
  if v_dataset.access_level not in ('restricted') then
    raise exception 'only restricted datasets use the grant list (open-lab/request-required do not need grants)'
      using errcode = '22023';
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

grant execute on function public.grant_dataset_access(uuid, uuid, text) to authenticated;

-- Drop any stale grants attached to a dataset that has since been switched to
-- private, so the access list does not silently re-activate if the dataset is
-- ever flipped back to restricted.
create or replace function public._purge_grants_on_private()
returns trigger
language plpgsql as $$
begin
  if new.access_level = 'private' and (old.access_level is null or old.access_level <> 'private') then
    delete from public.dataset_access_grants where dataset_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists datasets_purge_grants_on_private on public.datasets;
create trigger datasets_purge_grants_on_private
after update of access_level on public.datasets
for each row execute function public._purge_grants_on_private();
