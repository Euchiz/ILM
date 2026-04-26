-- Fix: Supply Manager item visibility regressions
--
-- The original `can_access_supply_item` had two gaps that surfaced the moment
-- a non-admin lab member created a new item and linked it to a specific
-- project:
--
--   1. The check joined `item_projects` to `project_members` directly, so
--      project *leads* (who are not always rows in `project_members`) were
--      treated as outsiders and lost visibility of items in their own
--      projects.
--   2. There was no fallback for the item's creator. As soon as the
--      `INSERT items` was followed by an `INSERT item_projects` with a
--      non-null `project_id`, RLS hid the just-inserted row from the user
--      that created it — which made the `RETURNING *` after the link insert
--      return zero rows and PostgREST throw PGRST116 ("JSON object requested,
--      multiple (or no) rows returned"). The frontend surfaced this as an
--      opaque "Unexpected error" on the warehouse page.
--
-- Allowing the creator to always read their own item closes the regression
-- without weakening the project-scoped visibility rule for other users, and
-- routing project visibility through `is_project_member` keeps leads in
-- sync with members.

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
