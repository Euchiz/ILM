-- Settings improvements:
--   * Add profiles.headshot_url so users can attach a small avatar image
--     (stored as a data URL — no Supabase Storage bucket needed).
--   * Refresh list_lab_members to surface headshot_url to the client.
--   * Add rename_lab RPC enforcing owner-only lab renames, since the
--     existing RLS update policy permits admins as well.

-- ---------------------------------------------------------------------------
-- profiles.headshot_url
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists headshot_url text;

-- ---------------------------------------------------------------------------
-- list_lab_members: include headshot_url
-- ---------------------------------------------------------------------------

drop function if exists public.list_lab_members(uuid);

create or replace function public.list_lab_members(p_lab_id uuid)
returns table (
  user_id uuid,
  role text,
  display_name text,
  email text,
  headshot_url text,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.user_id,
    m.role,
    p.display_name,
    p.email,
    p.headshot_url,
    m.created_at as joined_at
  from public.lab_memberships m
  left join public.profiles p on p.id = m.user_id
  where m.lab_id = p_lab_id
    and public.is_lab_member(p_lab_id)
  order by
    case m.role
      when 'owner' then 0
      when 'admin' then 1
      else 2
    end,
    coalesce(p.display_name, p.email, m.user_id::text);
$$;

grant execute on function public.list_lab_members(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- rename_lab: owner-only
-- ---------------------------------------------------------------------------

create or replace function public.rename_lab(p_lab_id uuid, p_name text)
returns public.labs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_name text;
  v_lab public.labs;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  v_name := nullif(btrim(p_name), '');
  if v_name is null then
    raise exception 'Lab name cannot be empty' using errcode = '22023';
  end if;

  select role into v_role
  from public.lab_memberships
  where lab_id = p_lab_id and user_id = v_uid
  limit 1;

  if v_role is null or v_role <> 'owner' then
    raise exception 'Only the lab owner can rename the lab' using errcode = '42501';
  end if;

  update public.labs
  set name = v_name
  where id = p_lab_id
  returning * into v_lab;

  return v_lab;
end;
$$;

grant execute on function public.rename_lab(uuid, text) to authenticated;
