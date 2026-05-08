-- Supply Manager — let lab members maintain operational item fields.
--
-- Problem: editing an item (e.g. setting a storage_location) from the Supply
-- Manager warehouse view surfaced "Cannot coerce the result to a single
-- JSON object (The result contains 0 rows)" for non-admin lab members. The
-- existing `items_update_admin` policy only let lab owners/admins write to
-- `public.items`, so the implicit `RETURNING *` after the UPDATE produced
-- zero rows under RLS and `.single()` rejected the result. The error
-- looked like a database fault but the underlying issue was a permission
-- denial — and on a row whose value happened to be NULL it was easy to
-- mistake for a column-coercion bug.
--
-- The "+ New item" form already lets any lab member create items, and the
-- visibility predicate (`items_select`) already lets project members read
-- items linked to their projects. It's reasonable for those same users to
-- maintain the operational fields (name, details, storage_location, …) of
-- the items they can already see. Archive / un-archive remain admin-only —
-- we keep `items_update_admin` and add a second permissive policy with a
-- WITH CHECK that pins `is_active = true`, so a member edit cannot soft-
-- delete the row.

-- The admin policy stays intact (still PERMISSIVE; either policy may grant
-- write access). Recreate it so the migration is idempotent.
drop policy if exists items_update_admin on public.items;
create policy items_update_admin on public.items
  for update using (public.is_lab_admin(lab_id))
  with check (public.is_lab_admin(lab_id));

-- New member-tier policy. Mirrors the visibility logic in `items_select`
-- but tightened: only active items, only members of the lab, and the WITH
-- CHECK forbids flipping `is_active = false` (archive) or moving the row
-- to another lab.
drop policy if exists items_update_member on public.items;
create policy items_update_member on public.items
  for update using (
    is_active = true
    and public.is_lab_member(lab_id)
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
  with check (
    is_active = true
    and public.is_lab_member(lab_id)
  );
