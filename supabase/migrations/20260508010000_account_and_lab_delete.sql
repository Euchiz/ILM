-- Account & lab destructive actions
--
-- Issue: users had no in-app way to permanently remove their own account or
-- to dissolve a lab they own. Adds two SECURITY DEFINER RPCs that the new
-- "Danger zone" panel in SettingsView calls. Both are intentionally blunt:
-- we rely on FK ON DELETE CASCADE chains established in earlier migrations
-- (lab_memberships → labs / users; projects/items/datasets/etc. → labs;
-- profiles → users) so a single delete tears down the dependent rows.
--
-- Safety rules:
--   * delete_lab requires the caller be that lab's owner.
--   * delete_my_account refuses if the caller is the sole owner of any lab,
--     so no lab ever ends up orphaned. The user must delete the lab (or
--     promote another owner — already supported via lab_memberships UPDATE)
--     before they can dispose of their own account.

-- ---------------------------------------------------------------------------
-- delete_lab — owner-only, cascades to every lab-scoped row.
-- ---------------------------------------------------------------------------

create or replace function public.delete_lab(p_lab_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_lab_id is null then
    raise exception 'Lab id is required' using errcode = '22023';
  end if;

  select role into v_role
  from public.lab_memberships
  where lab_id = p_lab_id
    and user_id = v_uid
  limit 1;

  if v_role is null or v_role <> 'owner' then
    raise exception 'Only the lab owner can delete the lab' using errcode = '42501';
  end if;

  -- Lab cascades take care of memberships, projects, milestones,
  -- experiments, items, item_projects, inventory_checks, order_requests,
  -- order_request_items, orders, stock_lots, calendar_events, bookings,
  -- planned_tasks, datasets, dataset_*, funding_sources, etc. (every
  -- domain table is `references public.labs(id) on delete cascade`).
  delete from public.labs where id = p_lab_id;
end;
$$;

grant execute on function public.delete_lab(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- delete_my_account — wipes the calling user from auth.users. The cascade
-- removes profile + memberships; orphan-protection blocks the call if the
-- user is the sole owner of any lab.
-- ---------------------------------------------------------------------------

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_orphan_count integer;
  v_orphan_names text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Find labs the caller solely owns. A lab is "sole-owned" by the caller
  -- when there's exactly one membership with role='owner' and it belongs
  -- to the caller.
  with caller_owner_labs as (
    select lab_id
    from public.lab_memberships
    where user_id = v_uid and role = 'owner'
  ),
  sole_owner_labs as (
    select col.lab_id
    from caller_owner_labs col
    where (
      select count(*) from public.lab_memberships m2
      where m2.lab_id = col.lab_id and m2.role = 'owner'
    ) = 1
  )
  select count(*),
         string_agg(l.name, ', ' order by l.name)
    into v_orphan_count, v_orphan_names
  from sole_owner_labs s
  join public.labs l on l.id = s.lab_id;

  if coalesce(v_orphan_count, 0) > 0 then
    raise exception
      'Cannot delete account while you are the sole owner of: %. Delete the lab(s) or promote another owner first.',
      v_orphan_names
      using errcode = '42501';
  end if;

  -- Drop the user. Cascades remove profile + memberships; lab.created_by
  -- columns are `on delete set null` so co-owned labs keep functioning.
  delete from auth.users where id = v_uid;
end;
$$;

grant execute on function public.delete_my_account() to authenticated;
