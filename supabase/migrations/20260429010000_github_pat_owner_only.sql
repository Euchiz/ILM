-- Tighten GitHub PAT management to lab owner only (previously any lab admin).
-- The UI has always gated the GitHub-integration panel behind the owner role;
-- this migration brings the RPCs into line so a non-owner admin can't set or
-- clear the PAT via a direct RPC call either.

create or replace function public.set_lab_github_pat(
  p_lab_id uuid,
  p_pat text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_lab_owner(p_lab_id) then
    raise exception 'Only the lab owner can set the GitHub PAT.'
      using errcode = '42501';
  end if;
  if p_pat is null or length(btrim(p_pat)) = 0 then
    raise exception 'PAT cannot be empty. Use clear_lab_github_pat to remove it.'
      using errcode = '22023';
  end if;
  update public.labs set github_pat = btrim(p_pat) where id = p_lab_id;
end;
$$;

create or replace function public.clear_lab_github_pat(p_lab_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_lab_owner(p_lab_id) then
    raise exception 'Only the lab owner can clear the GitHub PAT.'
      using errcode = '42501';
  end if;
  update public.labs set github_pat = null where id = p_lab_id;
end;
$$;
