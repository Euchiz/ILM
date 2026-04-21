-- Stage 4.A.4 - project roadmap ordering
--
-- Adds stable sort columns so the project outline can support drag/drop
-- reordering for milestones and experiments.

alter table public.milestones
  add column if not exists sort_order integer;

with ranked as (
  select
    id,
    row_number() over (
      partition by project_id
      order by due_date nulls last, created_at, id
    ) * 1024 as next_sort_order
  from public.milestones
)
update public.milestones as milestone
set sort_order = ranked.next_sort_order
from ranked
where milestone.id = ranked.id
  and coalesce(milestone.sort_order, 0) = 0;

alter table public.milestones
  alter column sort_order set default 1024;

update public.milestones
set sort_order = 1024
where sort_order is null;

alter table public.milestones
  alter column sort_order set not null;

create index if not exists milestones_project_id_sort_order_idx
  on public.milestones (project_id, sort_order);

alter table public.experiments
  add column if not exists sort_order integer;

with ranked as (
  select
    id,
    row_number() over (
      partition by project_id
      order by milestone_id nulls last, created_at, id
    ) * 1024 as next_sort_order
  from public.experiments
)
update public.experiments as experiment
set sort_order = ranked.next_sort_order
from ranked
where experiment.id = ranked.id
  and coalesce(experiment.sort_order, 0) = 0;

alter table public.experiments
  alter column sort_order set default 1024;

update public.experiments
set sort_order = 1024
where sort_order is null;

alter table public.experiments
  alter column sort_order set not null;

create index if not exists experiments_project_id_sort_order_idx
  on public.experiments (project_id, sort_order);
