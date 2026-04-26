-- Fix: Supply Manager item visibility regressions
--
-- Two interacting bugs made `INSERT items ... RETURNING *` fail outright on
-- the warehouse "+ New item" form, surfacing as "new row violates row-level
-- security policy for table items" (a misleading message — INSERT without
-- RETURNING actually succeeds; it's the SELECT RLS on RETURNING that
-- denies the row).
--
--   1. The `items_select` policy delegated to `can_access_supply_item(id)`,
--      which re-queries `public.items` to check the row's lab_id /
--      is_active / created_by. Inside RLS evaluation of RETURNING from
--      the very same INSERT, that re-query does not see the just-inserted
--      row in the function's STABLE snapshot, so EXISTS returns false and
--      access is denied — even though the insert itself was authorized by
--      the WITH CHECK policy. Inlining the visibility logic so the policy
--      reads the new row's columns directly removes the recursion.
--
--   2. `can_access_supply_item` joined `item_projects` to `project_members`
--      directly, leaving project leads (who are not always rows in
--      `project_members`) without visibility of items in their own
--      projects. Routing the check through `is_project_member` keeps leads
--      and members in sync.
--
-- We also extend the visibility rule so the item's creator can always read
-- their own item — otherwise a non-admin who creates an item linked to a
-- single non-general project loses access the moment the link is added,
-- because the item no longer satisfies the "general/lab-wide" branch and
-- they are not yet a project_member.

drop policy if exists items_select on public.items;
create policy items_select on public.items
  for select using (
    public.is_lab_member(lab_id)
    and (
      public.is_lab_admin(lab_id)
      or created_by = auth.uid()
      or (
        is_active
        and (
          not exists (
            select 1 from public.item_projects ip
            where ip.item_id = items.id and ip.project_id is not null
          )
          or exists (
            select 1 from public.item_projects ip
            where ip.item_id = items.id
              and (ip.association_type = 'general' or ip.project_id is null)
          )
          or exists (
            select 1 from public.item_projects ip
            where ip.item_id = items.id
              and ip.project_id is not null
              and public.is_project_member(ip.project_id)
          )
        )
      )
    )
  );

-- Keep `can_access_supply_item` in sync for the dependent policies on
-- `item_projects`, `inventory_checks`, and `stock_lots`. These are not
-- subject to the RETURNING recursion because the parent items row is
-- already committed by the time those rows are inserted.
create or replace function public.can_access_supply_item(p_item_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.items i
    where i.id = p_item_id
      and public.is_lab_member(i.lab_id)
      and (
        public.is_lab_admin(i.lab_id)
        or i.created_by = auth.uid()
        or (
          i.is_active
          and (
            not exists (
              select 1 from public.item_projects ip
              where ip.item_id = i.id and ip.project_id is not null
            )
            or exists (
              select 1 from public.item_projects ip
              where ip.item_id = i.id
                and (ip.association_type = 'general' or ip.project_id is null)
            )
            or exists (
              select 1 from public.item_projects ip
              where ip.item_id = i.id
                and ip.project_id is not null
                and public.is_project_member(ip.project_id)
            )
          )
        )
      )
  );
$$;
