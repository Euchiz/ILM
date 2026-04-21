-- Stage 4.A - project-manager normalized workspace
--
-- Adds milestones and experiments as first-class lab-scoped tables so the
-- project-manager app can stop being a placeholder shell and operate directly
-- on normalized rows.

create table if not exists public.milestones (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text,
  due_date date,
  status text not null default 'planned'
    check (status in ('planned', 'in_progress', 'done', 'cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists milestones_lab_id_idx
  on public.milestones (lab_id);

create index if not exists milestones_project_id_idx
  on public.milestones (project_id, due_date);

drop trigger if exists milestones_set_updated_at on public.milestones;
create trigger milestones_set_updated_at
before update on public.milestones
for each row execute function public.set_updated_at();

create table if not exists public.experiments (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  protocol_id uuid references public.protocols(id) on delete set null,
  title text not null,
  notes text,
  status text not null default 'planned'
    check (status in ('planned', 'running', 'completed', 'failed')),
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists experiments_lab_id_idx
  on public.experiments (lab_id);

create index if not exists experiments_project_id_idx
  on public.experiments (project_id, created_at desc);

create index if not exists experiments_protocol_id_idx
  on public.experiments (protocol_id);

drop trigger if exists experiments_set_updated_at on public.experiments;
create trigger experiments_set_updated_at
before update on public.experiments
for each row execute function public.set_updated_at();

alter table public.milestones enable row level security;
alter table public.experiments enable row level security;

drop policy if exists milestones_select_member on public.milestones;
create policy milestones_select_member on public.milestones
  for select using (public.is_lab_member(lab_id));

drop policy if exists milestones_insert_member on public.milestones;
create policy milestones_insert_member on public.milestones
  for insert with check (public.is_lab_member(lab_id));

drop policy if exists milestones_update_member on public.milestones;
create policy milestones_update_member on public.milestones
  for update using (public.is_lab_member(lab_id))
  with check (public.is_lab_member(lab_id));

drop policy if exists milestones_delete_admin on public.milestones;
create policy milestones_delete_admin on public.milestones
  for delete using (public.is_lab_admin(lab_id));

drop policy if exists experiments_select_member on public.experiments;
create policy experiments_select_member on public.experiments
  for select using (public.is_lab_member(lab_id));

drop policy if exists experiments_insert_member on public.experiments;
create policy experiments_insert_member on public.experiments
  for insert with check (public.is_lab_member(lab_id));

drop policy if exists experiments_update_member on public.experiments;
create policy experiments_update_member on public.experiments
  for update using (public.is_lab_member(lab_id))
  with check (public.is_lab_member(lab_id));

drop policy if exists experiments_delete_admin on public.experiments;
create policy experiments_delete_admin on public.experiments
  for delete using (public.is_lab_admin(lab_id));
