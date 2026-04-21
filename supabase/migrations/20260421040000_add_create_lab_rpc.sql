-- Workaround for Supabase's new asymmetric-key JWT system: auth.uid() is
-- populated at the top of a SQL/PLPGSQL function body but returns NULL
-- inside BEFORE INSERT trigger bodies and RLS WITH CHECK expressions on
-- the same request. That breaks the `labs` INSERT policy.
--
-- create_lab() reads auth.uid() once at entry (where it works), then does
-- the INSERT with SECURITY DEFINER so the RLS check is bypassed. It also
-- inserts the owner membership directly — the on_lab_created AFTER trigger
-- is a no-op if auth.uid() is null in trigger context, so we do not rely
-- on it.

create or replace function public.create_lab(p_name text, p_slug text default null)
returns public.labs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_lab public.labs%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  insert into public.labs (name, slug, created_by)
  values (p_name, nullif(btrim(p_slug), ''), v_uid)
  returning * into v_lab;

  insert into public.lab_memberships (lab_id, user_id, role)
  values (v_lab.id, v_uid, 'owner')
  on conflict (lab_id, user_id) do nothing;

  return v_lab;
end;
$$;

grant execute on function public.create_lab(text, text) to authenticated;
