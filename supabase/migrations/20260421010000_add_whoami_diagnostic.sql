-- Diagnostic RPC: returns what the PostgREST request looks like at the DB
-- from the caller's perspective. Useful for proving whether a JWT is being
-- verified and translated into `auth.uid()` / `auth.role()`.
--
-- Call from the browser as:
--   await supabase.rpc('whoami')
-- Anyone can call it; it returns no secrets.

create or replace function public.whoami()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'auth_uid', auth.uid(),
    'auth_role', auth.role(),
    'current_user', current_user,
    'request_role_claim', nullif(current_setting('request.jwt.claim.role', true), ''),
    'request_sub_claim', nullif(current_setting('request.jwt.claim.sub', true), '')
  );
$$;

grant execute on function public.whoami() to anon, authenticated;
