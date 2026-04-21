-- Relax the labs INSERT policy so creation only requires an authenticated
-- session. The previous policy compared `auth.uid() = created_by`, which
-- fails if the client sends `created_by` as any value other than exactly the
-- text form of auth.uid() for that request — an error-prone coupling.
--
-- Instead:
--   * Default `created_by` to `auth.uid()` at the column level
--   * Force `created_by` to `auth.uid()` via a BEFORE INSERT trigger (so a
--     user cannot impersonate another user by sending their id)
--   * Simplify the RLS check to `auth.uid() is not null`

alter table public.labs
  alter column created_by set default auth.uid();

create or replace function public.enforce_labs_created_by()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.created_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists enforce_labs_created_by on public.labs;
create trigger enforce_labs_created_by
before insert on public.labs
for each row execute function public.enforce_labs_created_by();

drop policy if exists labs_insert_authenticated on public.labs;
create policy labs_insert_authenticated on public.labs
  for insert
  with check (auth.uid() is not null);
