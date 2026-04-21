-- ILM initial schema: auth-linked profiles, labs, memberships, projects,
-- protocols, and protocol revisions. Row Level Security is enabled on every
-- app table; authorization is driven by lab_memberships (never by
-- user-editable metadata).

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Shared updated_at trigger
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Auto-create a profile row when a new auth user is provisioned.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- labs
-- ---------------------------------------------------------------------------

create table if not exists public.labs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger labs_set_updated_at
before update on public.labs
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- lab_memberships
-- ---------------------------------------------------------------------------

create table if not exists public.lab_memberships (
  lab_id uuid not null references public.labs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (lab_id, user_id)
);

create index if not exists lab_memberships_user_id_idx
  on public.lab_memberships (user_id);

-- ---------------------------------------------------------------------------
-- Membership helpers (SECURITY DEFINER to avoid RLS recursion)
-- ---------------------------------------------------------------------------

create or replace function public.is_lab_member(target_lab_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lab_memberships m
    where m.lab_id = target_lab_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.lab_role(target_lab_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.lab_memberships
  where lab_id = target_lab_id
    and user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_lab_admin(target_lab_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.lab_role(target_lab_id) in ('owner', 'admin');
$$;

-- When a lab is created, make the creator its owner.
create or replace function public.handle_new_lab()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into public.lab_memberships (lab_id, user_id, role)
    values (new.id, new.created_by, 'owner')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_lab_created on public.labs;
create trigger on_lab_created
after insert on public.labs
for each row execute function public.handle_new_lab();

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  name text not null,
  description text,
  status text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_lab_id_idx on public.projects (lab_id);

create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- protocols
-- ---------------------------------------------------------------------------

create table if not exists public.protocols (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text not null,
  description text,
  schema_version text not null default '1.0.0',
  review_status text,
  lifecycle_status text,
  validation_status text,
  document_json jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists protocols_lab_id_idx on public.protocols (lab_id);
create index if not exists protocols_project_id_idx on public.protocols (project_id);

create trigger protocols_set_updated_at
before update on public.protocols
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- protocol_revisions
-- ---------------------------------------------------------------------------

create table if not exists public.protocol_revisions (
  id uuid primary key default gen_random_uuid(),
  protocol_id uuid not null references public.protocols(id) on delete cascade,
  lab_id uuid not null references public.labs(id) on delete cascade,
  document_json jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists protocol_revisions_protocol_id_idx
  on public.protocol_revisions (protocol_id, created_at desc);
create index if not exists protocol_revisions_lab_id_idx
  on public.protocol_revisions (lab_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles            enable row level security;
alter table public.labs                enable row level security;
alter table public.lab_memberships     enable row level security;
alter table public.projects            enable row level security;
alter table public.protocols           enable row level security;
alter table public.protocol_revisions  enable row level security;

-- profiles: users manage only their own row
create policy profiles_select_self on public.profiles
  for select using (auth.uid() = id);

create policy profiles_insert_self on public.profiles
  for insert with check (auth.uid() = id);

create policy profiles_update_self on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- labs: members see their labs; any authenticated user can create a lab;
-- only owners/admins can update; only owners can delete.
create policy labs_select_member on public.labs
  for select using (public.is_lab_member(id));

create policy labs_insert_authenticated on public.labs
  for insert with check (auth.uid() is not null and auth.uid() = created_by);

create policy labs_update_admin on public.labs
  for update using (public.is_lab_admin(id))
  with check (public.is_lab_admin(id));

create policy labs_delete_owner on public.labs
  for delete using (public.lab_role(id) = 'owner');

-- lab_memberships: members can read memberships of labs they belong to.
-- Writes are admin-only via RLS; first-version invitation flow is handled
-- out-of-band (dashboard / SQL) or through the new-lab trigger.
create policy lab_memberships_select_member on public.lab_memberships
  for select using (public.is_lab_member(lab_id));

create policy lab_memberships_insert_admin on public.lab_memberships
  for insert with check (public.is_lab_admin(lab_id));

create policy lab_memberships_update_admin on public.lab_memberships
  for update using (public.is_lab_admin(lab_id))
  with check (public.is_lab_admin(lab_id));

create policy lab_memberships_delete_admin on public.lab_memberships
  for delete using (public.is_lab_admin(lab_id));

-- projects: any member can read/write; delete restricted to admins.
create policy projects_select_member on public.projects
  for select using (public.is_lab_member(lab_id));

create policy projects_insert_member on public.projects
  for insert with check (public.is_lab_member(lab_id));

create policy projects_update_member on public.projects
  for update using (public.is_lab_member(lab_id))
  with check (public.is_lab_member(lab_id));

create policy projects_delete_admin on public.projects
  for delete using (public.is_lab_admin(lab_id));

-- protocols: any member can read/write; delete restricted to admins.
create policy protocols_select_member on public.protocols
  for select using (public.is_lab_member(lab_id));

create policy protocols_insert_member on public.protocols
  for insert with check (public.is_lab_member(lab_id));

create policy protocols_update_member on public.protocols
  for update using (public.is_lab_member(lab_id))
  with check (public.is_lab_member(lab_id));

create policy protocols_delete_admin on public.protocols
  for delete using (public.is_lab_admin(lab_id));

-- protocol_revisions: members may read and append; no updates; delete admin.
create policy protocol_revisions_select_member on public.protocol_revisions
  for select using (public.is_lab_member(lab_id));

create policy protocol_revisions_insert_member on public.protocol_revisions
  for insert with check (public.is_lab_member(lab_id));

create policy protocol_revisions_delete_admin on public.protocol_revisions
  for delete using (public.is_lab_admin(lab_id));
