-- Add `equipment` and `kit` to the items.classification check constraint.
--
-- The original supply_manager migration restricted classification to
-- ('reagent', 'consumable', 'supply', 'sample', 'other'). Labs need to track
-- equipment (durable instruments / hardware) and kits (bundled assay kits)
-- as first-class categories alongside the existing taxonomy.

alter table public.items
  drop constraint if exists items_classification_check;

alter table public.items
  add constraint items_classification_check
  check (classification in (
    'reagent',
    'consumable',
    'supply',
    'sample',
    'equipment',
    'kit',
    'other'
  ));
