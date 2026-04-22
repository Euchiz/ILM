-- Stage 4a.1 — GitHub repo link per project + lab-scoped PAT + cached repo status.
--
-- Projects gain an optional `github_repo_url`. Each lab can store a single
-- GitHub Personal Access Token (fine-grained, read-only on the relevant repos)
-- that the edge function `fetch-github-activity` uses to pull `pushed_at` from
-- the GitHub API. The PAT is never exposed to the browser — the column is only
-- readable by `service_role`. A per-project cache table (`project_repo_status`)
-- holds the last fetched timestamp; lab members read it, only the edge function
-- (via service role) writes it.

-- ---------------------------------------------------------------------------
-- Projects: github_repo_url
-- ---------------------------------------------------------------------------

alter table public.projects
  add column if not exists github_repo_url text;

-- ---------------------------------------------------------------------------
-- Labs: github_pat (service-role only)
-- ---------------------------------------------------------------------------

alter table public.labs
  add column if not exists github_pat text;

comment on column public.labs.github_pat is
  'Shared GitHub PAT used by the fetch-github-activity edge function. '
  'Readable only by service_role; writable only via set_lab_github_pat RPC.';

-- Revoke PAT visibility from authenticated users. Reads/writes on labs via
-- existing RLS policies should never expose this column because those policies
-- select explicit columns — but as defense-in-depth we add a column-level
-- restriction: authenticated users cannot SELECT/UPDATE github_pat directly.
revoke select (github_pat) on public.labs from authenticated, anon;
revoke update (github_pat) on public.labs from authenticated, anon;

-- ---------------------------------------------------------------------------
-- RPC: admin-only PAT management
-- ---------------------------------------------------------------------------

create or replace function public.set_lab_github_pat(
  p_lab_id uuid,
  p_pat text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_lab_admin(p_lab_id) then
    raise exception 'Only lab admins can set the GitHub PAT.'
      using errcode = '42501';
  end if;
  if p_pat is null or length(btrim(p_pat)) = 0 then
    raise exception 'PAT cannot be empty. Use clear_lab_github_pat to remove it.'
      using errcode = '22023';
  end if;
  update public.labs set github_pat = btrim(p_pat) where id = p_lab_id;
end;
$$;

revoke all on function public.set_lab_github_pat(uuid, text) from public;
grant execute on function public.set_lab_github_pat(uuid, text) to authenticated;

create or replace function public.clear_lab_github_pat(p_lab_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_lab_admin(p_lab_id) then
    raise exception 'Only lab admins can clear the GitHub PAT.'
      using errcode = '42501';
  end if;
  update public.labs set github_pat = null where id = p_lab_id;
end;
$$;

revoke all on function public.clear_lab_github_pat(uuid) from public;
grant execute on function public.clear_lab_github_pat(uuid) to authenticated;

create or replace function public.lab_github_pat_configured(p_lab_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  has_pat boolean;
begin
  if not public.is_lab_member(p_lab_id) then
    return false;
  end if;
  select github_pat is not null and length(btrim(github_pat)) > 0
    into has_pat
    from public.labs
    where id = p_lab_id;
  return coalesce(has_pat, false);
end;
$$;

revoke all on function public.lab_github_pat_configured(uuid) from public;
grant execute on function public.lab_github_pat_configured(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- project_repo_status — per-project cache of GitHub activity
-- ---------------------------------------------------------------------------

create table if not exists public.project_repo_status (
  project_id uuid primary key references public.projects(id) on delete cascade,
  lab_id uuid not null references public.labs(id) on delete cascade,
  pushed_at timestamptz,
  default_branch text,
  html_url text,
  error text,
  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_repo_status_lab_id_idx
  on public.project_repo_status (lab_id);

drop trigger if exists project_repo_status_set_updated_at on public.project_repo_status;
create trigger project_repo_status_set_updated_at
before update on public.project_repo_status
for each row execute function public.set_updated_at();

alter table public.project_repo_status enable row level security;

drop policy if exists project_repo_status_select_member on public.project_repo_status;
create policy project_repo_status_select_member on public.project_repo_status
  for select using (public.is_lab_member(lab_id));

-- No INSERT/UPDATE/DELETE policies: writes go through the fetch-github-activity
-- edge function using service_role, which bypasses RLS.
