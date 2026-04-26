-- Stage 4c — Supply Manager
--
-- Lab-scoped supply tracking: catalog items, project associations, append-only
-- inventory checks, order requests with admin review, vendor orders, and
-- received stock lots. Equipment is intentionally not modeled here.
--
-- All tables are lab-scoped; reads are gated by lab membership (with item
-- visibility narrowed by project membership where the item is project-scoped).
-- Writes that change state run through SECURITY DEFINER RPCs that emit audit
-- entries on every transition.

-- ---------------------------------------------------------------------------
-- 1) Tables
-- ---------------------------------------------------------------------------

-- 1.1) items
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  name text not null,
  details text,
  classification text not null
    check (classification in ('reagent', 'consumable', 'supply', 'sample', 'other')),
  default_unit text,
  storage_location text,
  catalog_number text,
  preferred_vendor text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists items_lab_id_idx on public.items (lab_id);
create index if not exists items_lab_active_idx on public.items (lab_id, is_active);
create index if not exists items_classification_idx on public.items (lab_id, classification);

drop trigger if exists items_set_updated_at on public.items;
create trigger items_set_updated_at
before update on public.items
for each row execute function public.set_updated_at();

-- 1.2) item_projects
create table if not exists public.item_projects (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  association_type text
    check (association_type is null or association_type in ('primary', 'shared', 'temporary', 'general')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- A general row has project_id = null. A scoped row has both. Disallow
-- duplicate (item, project) links.
create unique index if not exists item_projects_unique_scoped
  on public.item_projects (item_id, project_id) where project_id is not null;
create unique index if not exists item_projects_unique_general
  on public.item_projects (item_id) where project_id is null;
create index if not exists item_projects_project_id_idx
  on public.item_projects (project_id);

-- 1.3) inventory_checks (append-only)
create table if not exists public.inventory_checks (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  stock_status text not null
    check (stock_status in ('plenty', 'medium', 'low', 'out', 'unknown')),
  estimated_quantity numeric,
  unit text,
  location text,
  note text,
  checked_by uuid references auth.users(id) on delete set null,
  checked_at timestamptz not null default now()
);

create index if not exists inventory_checks_item_id_idx
  on public.inventory_checks (item_id, checked_at desc);

-- 1.4) order_requests
create table if not exists public.order_requests (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'approved', 'denied', 'withdrawn',
                      'ordered', 'received', 'cancelled')),
  reason text,
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_requests_lab_id_idx
  on public.order_requests (lab_id, status);
create index if not exists order_requests_requested_by_idx
  on public.order_requests (requested_by);

drop trigger if exists order_requests_set_updated_at on public.order_requests;
create trigger order_requests_set_updated_at
before update on public.order_requests
for each row execute function public.set_updated_at();

-- 1.5) order_request_items
create table if not exists public.order_request_items (
  id uuid primary key default gen_random_uuid(),
  order_request_id uuid not null references public.order_requests(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  requested_quantity numeric,
  unit text,
  priority text
    check (priority is null or priority in ('low', 'normal', 'high', 'urgent')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists order_request_items_request_idx
  on public.order_request_items (order_request_id);
create index if not exists order_request_items_item_idx
  on public.order_request_items (item_id);

-- 1.6) orders
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_request_id uuid not null references public.order_requests(id) on delete cascade,
  company text,
  order_number text,
  tracking_number text,
  status text not null default 'initial_order_placed'
    check (status in ('initial_order_placed', 'back_ordered', 'shipped',
                      'partially_received', 'received', 'cancelled')),
  placed_by uuid references auth.users(id) on delete set null,
  placed_at timestamptz,
  expected_arrival timestamptz,
  received_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_request_idx on public.orders (order_request_id);
create index if not exists orders_status_idx on public.orders (status);

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

-- 1.7) stock_lots
create table if not exists public.stock_lots (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  lot_number text,
  received_quantity numeric,
  unit text,
  expiration_date date,
  storage_location text,
  received_by uuid references auth.users(id) on delete set null,
  received_at timestamptz not null default now(),
  note text
);

create index if not exists stock_lots_item_idx on public.stock_lots (item_id, received_at desc);
create index if not exists stock_lots_order_idx on public.stock_lots (order_id);

-- ---------------------------------------------------------------------------
-- 2) Helpers
-- ---------------------------------------------------------------------------

-- Returns the lab id that owns a given order_request.
create or replace function public.order_request_lab(p_request_id uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  select lab_id from public.order_requests where id = p_request_id;
$$;

-- A user can see an item if:
--   - they are a lab admin (sees everything in lab), OR
--   - the item is active AND (
--       it has no project-scoped associations (lab-wide / general), OR
--       at least one item_projects row marks it as general, OR
--       the user is a member of a linked project
--     )
create or replace function public.can_access_supply_item(p_item_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.items i
    where i.id = p_item_id
      and public.is_lab_member(i.lab_id)
      and (
        public.is_lab_admin(i.lab_id)
        or (
          i.is_active
          and (
            not exists (
              select 1 from public.item_projects ip
              where ip.item_id = i.id and ip.project_id is not null
            )
            or exists (
              select 1 from public.item_projects ip
              where ip.item_id = i.id
                and (ip.association_type = 'general' or ip.project_id is null)
            )
            or exists (
              select 1 from public.item_projects ip
              join public.project_members pm
                on pm.project_id = ip.project_id
               and pm.user_id = auth.uid()
              where ip.item_id = i.id
            )
          )
        )
      )
  );
$$;

grant execute on function public.order_request_lab(uuid) to authenticated;
grant execute on function public.can_access_supply_item(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------------------------

alter table public.items                enable row level security;
alter table public.item_projects        enable row level security;
alter table public.inventory_checks     enable row level security;
alter table public.order_requests       enable row level security;
alter table public.order_request_items  enable row level security;
alter table public.orders               enable row level security;
alter table public.stock_lots           enable row level security;

-- 3.1) items
drop policy if exists items_select on public.items;
create policy items_select on public.items
  for select using (public.can_access_supply_item(id));

-- Members can create items (so users can self-serve add a new reagent);
-- only admins can edit or delete after creation.
drop policy if exists items_insert on public.items;
create policy items_insert on public.items
  for insert with check (
    public.is_lab_member(lab_id)
    and (created_by is null or created_by = auth.uid())
  );

drop policy if exists items_update_admin on public.items;
create policy items_update_admin on public.items
  for update using (public.is_lab_admin(lab_id))
  with check (public.is_lab_admin(lab_id));

drop policy if exists items_delete_admin on public.items;
create policy items_delete_admin on public.items
  for delete using (public.is_lab_admin(lab_id));

-- 3.2) item_projects — visibility follows the parent item.
drop policy if exists item_projects_select on public.item_projects;
create policy item_projects_select on public.item_projects
  for select using (public.can_access_supply_item(item_id));

drop policy if exists item_projects_insert on public.item_projects;
create policy item_projects_insert on public.item_projects
  for insert with check (
    exists (
      select 1 from public.items i
      where i.id = item_projects.item_id
        and public.is_lab_member(i.lab_id)
    )
  );

drop policy if exists item_projects_delete on public.item_projects;
create policy item_projects_delete on public.item_projects
  for delete using (
    exists (
      select 1 from public.items i
      where i.id = item_projects.item_id
        and (public.is_lab_admin(i.lab_id) or i.created_by = auth.uid())
    )
  );

-- 3.3) inventory_checks — anyone who can see the item can append a check.
drop policy if exists inventory_checks_select on public.inventory_checks;
create policy inventory_checks_select on public.inventory_checks
  for select using (public.can_access_supply_item(item_id));

drop policy if exists inventory_checks_insert on public.inventory_checks;
create policy inventory_checks_insert on public.inventory_checks
  for insert with check (
    public.can_access_supply_item(item_id)
    and (checked_by is null or checked_by = auth.uid())
  );

drop policy if exists inventory_checks_delete_admin on public.inventory_checks;
create policy inventory_checks_delete_admin on public.inventory_checks
  for delete using (
    exists (
      select 1 from public.items i
      where i.id = inventory_checks.item_id and public.is_lab_admin(i.lab_id)
    )
  );

-- 3.4) order_requests — admins see everything; requesters see their own; all
-- lab members see non-draft requests so the orders/history view works.
drop policy if exists order_requests_select on public.order_requests;
create policy order_requests_select on public.order_requests
  for select using (
    public.is_lab_member(lab_id)
    and (
      public.is_lab_admin(lab_id)
      or requested_by = auth.uid()
      or status <> 'draft'
    )
  );

-- Direct INSERT is gated to lab members; status must start as 'draft' or
-- 'submitted'. Status transitions go through RPCs.
drop policy if exists order_requests_insert on public.order_requests;
create policy order_requests_insert on public.order_requests
  for insert with check (
    public.is_lab_member(lab_id)
    and (requested_by is null or requested_by = auth.uid())
    and status in ('draft', 'submitted')
  );

-- Requester can edit their own draft (reason, project_id). Admin can edit
-- any non-draft for review notes. Status changes go through RPCs.
drop policy if exists order_requests_update on public.order_requests;
create policy order_requests_update on public.order_requests
  for update using (
    public.is_lab_admin(lab_id)
    or (requested_by = auth.uid() and status = 'draft')
  )
  with check (
    public.is_lab_admin(lab_id)
    or (requested_by = auth.uid() and status = 'draft')
  );

drop policy if exists order_requests_delete on public.order_requests;
create policy order_requests_delete on public.order_requests
  for delete using (
    public.is_lab_admin(lab_id)
    or (requested_by = auth.uid() and status = 'draft')
  );

-- 3.5) order_request_items — follow the parent request's visibility.
drop policy if exists order_request_items_select on public.order_request_items;
create policy order_request_items_select on public.order_request_items
  for select using (
    exists (
      select 1 from public.order_requests r
      where r.id = order_request_items.order_request_id
        and public.is_lab_member(r.lab_id)
        and (
          public.is_lab_admin(r.lab_id)
          or r.requested_by = auth.uid()
          or r.status <> 'draft'
        )
    )
  );

drop policy if exists order_request_items_write on public.order_request_items;
create policy order_request_items_write on public.order_request_items
  for all using (
    exists (
      select 1 from public.order_requests r
      where r.id = order_request_items.order_request_id
        and (
          public.is_lab_admin(r.lab_id)
          or (r.requested_by = auth.uid() and r.status = 'draft')
        )
    )
  )
  with check (
    exists (
      select 1 from public.order_requests r
      where r.id = order_request_items.order_request_id
        and (
          public.is_lab_admin(r.lab_id)
          or (r.requested_by = auth.uid() and r.status = 'draft')
        )
    )
  );

-- 3.6) orders — lab members read; admins write. (Receiving an order is also
-- allowed for the original requester via an RPC, not a direct UPDATE.)
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
  for select using (
    exists (
      select 1 from public.order_requests r
      where r.id = orders.order_request_id and public.is_lab_member(r.lab_id)
    )
  );

drop policy if exists orders_write_admin on public.orders;
create policy orders_write_admin on public.orders
  for all using (
    exists (
      select 1 from public.order_requests r
      where r.id = orders.order_request_id and public.is_lab_admin(r.lab_id)
    )
  )
  with check (
    exists (
      select 1 from public.order_requests r
      where r.id = orders.order_request_id and public.is_lab_admin(r.lab_id)
    )
  );

-- 3.7) stock_lots — lab members read; admins write directly. The receive
-- RPC also lets the original requester add lots when receiving an order.
drop policy if exists stock_lots_select on public.stock_lots;
create policy stock_lots_select on public.stock_lots
  for select using (public.can_access_supply_item(item_id));

drop policy if exists stock_lots_write_admin on public.stock_lots;
create policy stock_lots_write_admin on public.stock_lots
  for all using (
    exists (
      select 1 from public.items i
      where i.id = stock_lots.item_id and public.is_lab_admin(i.lab_id)
    )
  )
  with check (
    exists (
      select 1 from public.items i
      where i.id = stock_lots.item_id and public.is_lab_admin(i.lab_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 4) RPCs — order request lifecycle
-- ---------------------------------------------------------------------------

-- 4.1) submit_order_request — requester (or admin) flips draft → submitted
create or replace function public.submit_order_request(p_request_id uuid)
returns public.order_requests
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.order_requests%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_row from public.order_requests where id = p_request_id;
  if not found then
    raise exception 'order request not found' using errcode = '02000';
  end if;
  if v_row.status <> 'draft' then
    raise exception 'only drafts can be submitted' using errcode = '22023';
  end if;
  if v_row.requested_by <> v_uid and not public.is_lab_admin(v_row.lab_id) then
    raise exception 'not permitted to submit this request' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.order_request_items ri where ri.order_request_id = p_request_id
  ) then
    raise exception 'request must have at least one item' using errcode = '22023';
  end if;

  update public.order_requests
     set status = 'submitted'
   where id = p_request_id
   returning * into v_row;

  perform public._log_audit(v_row.lab_id, 'order_request', p_request_id, 'submit', '{}'::jsonb);
  return v_row;
end;
$$;

-- 4.2) withdraw_order_request — requester pulls back a submitted request
create or replace function public.withdraw_order_request(p_request_id uuid)
returns public.order_requests
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.order_requests%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_row from public.order_requests where id = p_request_id;
  if not found then
    raise exception 'order request not found' using errcode = '02000';
  end if;
  if v_row.status <> 'submitted' then
    raise exception 'only submitted requests can be withdrawn' using errcode = '22023';
  end if;
  if v_row.requested_by <> v_uid and not public.is_lab_admin(v_row.lab_id) then
    raise exception 'not permitted to withdraw this request' using errcode = '42501';
  end if;

  update public.order_requests
     set status = 'withdrawn'
   where id = p_request_id
   returning * into v_row;

  perform public._log_audit(v_row.lab_id, 'order_request', p_request_id, 'withdraw', '{}'::jsonb);
  return v_row;
end;
$$;

-- 4.3) approve_order_request — admin
create or replace function public.approve_order_request(
  p_request_id uuid,
  p_note text default null
)
returns public.order_requests
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.order_requests%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_row from public.order_requests where id = p_request_id;
  if not found then
    raise exception 'order request not found' using errcode = '02000';
  end if;
  if not public.is_lab_admin(v_row.lab_id) then
    raise exception 'only lab admins may approve requests' using errcode = '42501';
  end if;
  if v_row.status <> 'submitted' then
    raise exception 'only submitted requests can be approved' using errcode = '22023';
  end if;

  update public.order_requests
     set status = 'approved',
         review_note = nullif(btrim(coalesce(p_note, '')), ''),
         reviewed_by = v_uid,
         reviewed_at = now()
   where id = p_request_id
   returning * into v_row;

  perform public._log_audit(v_row.lab_id, 'order_request', p_request_id, 'approve',
    jsonb_build_object('note', v_row.review_note));
  return v_row;
end;
$$;

-- 4.4) deny_order_request — admin (note required)
create or replace function public.deny_order_request(
  p_request_id uuid,
  p_note text
)
returns public.order_requests
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.order_requests%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if v_note is null then
    raise exception 'a denial note is required' using errcode = '22023';
  end if;

  select * into v_row from public.order_requests where id = p_request_id;
  if not found then
    raise exception 'order request not found' using errcode = '02000';
  end if;
  if not public.is_lab_admin(v_row.lab_id) then
    raise exception 'only lab admins may deny requests' using errcode = '42501';
  end if;
  if v_row.status <> 'submitted' then
    raise exception 'only submitted requests can be denied' using errcode = '22023';
  end if;

  update public.order_requests
     set status = 'denied',
         review_note = v_note,
         reviewed_by = v_uid,
         reviewed_at = now()
   where id = p_request_id
   returning * into v_row;

  perform public._log_audit(v_row.lab_id, 'order_request', p_request_id, 'deny',
    jsonb_build_object('note', v_note));
  return v_row;
end;
$$;

-- 4.5) cancel_order_request — admin or requester (status -> cancelled)
create or replace function public.cancel_order_request(p_request_id uuid)
returns public.order_requests
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.order_requests%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_row from public.order_requests where id = p_request_id;
  if not found then
    raise exception 'order request not found' using errcode = '02000';
  end if;
  if v_row.requested_by <> v_uid and not public.is_lab_admin(v_row.lab_id) then
    raise exception 'not permitted to cancel this request' using errcode = '42501';
  end if;
  if v_row.status not in ('approved', 'ordered') then
    raise exception 'only approved or ordered requests can be cancelled' using errcode = '22023';
  end if;

  update public.order_requests
     set status = 'cancelled'
   where id = p_request_id
   returning * into v_row;

  perform public._log_audit(v_row.lab_id, 'order_request', p_request_id, 'cancel', '{}'::jsonb);
  return v_row;
end;
$$;

-- 4.6) place_supply_order — admin marks an approved request as ordered.
-- Creates an orders row tracking vendor/order details, flips the request
-- status to 'ordered'. Returns the new order id.
create or replace function public.place_supply_order(
  p_request_id uuid,
  p_company text default null,
  p_order_number text default null,
  p_tracking_number text default null,
  p_expected_arrival timestamptz default null,
  p_note text default null
)
returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_req public.order_requests%rowtype;
  v_order public.orders%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_req from public.order_requests where id = p_request_id;
  if not found then
    raise exception 'order request not found' using errcode = '02000';
  end if;
  if not public.is_lab_admin(v_req.lab_id) then
    raise exception 'only lab admins may place orders' using errcode = '42501';
  end if;
  if v_req.status <> 'approved' then
    raise exception 'only approved requests can be ordered' using errcode = '22023';
  end if;

  insert into public.orders (
    order_request_id, company, order_number, tracking_number,
    status, placed_by, placed_at, expected_arrival, note
  ) values (
    p_request_id,
    nullif(btrim(coalesce(p_company, '')), ''),
    nullif(btrim(coalesce(p_order_number, '')), ''),
    nullif(btrim(coalesce(p_tracking_number, '')), ''),
    'initial_order_placed',
    v_uid,
    now(),
    p_expected_arrival,
    nullif(btrim(coalesce(p_note, '')), '')
  )
  returning * into v_order;

  update public.order_requests
     set status = 'ordered'
   where id = p_request_id;

  perform public._log_audit(v_req.lab_id, 'order', v_order.id, 'place',
    jsonb_build_object('request_id', p_request_id, 'company', v_order.company));

  return v_order;
end;
$$;

-- 4.7) update_supply_order — admin updates vendor/tracking/status (excluding
-- the terminal 'received' transition, which goes through receive_supply_order
-- so lots can be appended atomically).
create or replace function public.update_supply_order(
  p_order_id uuid,
  p_company text default null,
  p_order_number text default null,
  p_tracking_number text default null,
  p_status text default null,
  p_expected_arrival timestamptz default null,
  p_note text default null
)
returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_lab_id uuid;
  v_order public.orders%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select r.lab_id into v_lab_id
    from public.orders o
    join public.order_requests r on r.id = o.order_request_id
   where o.id = p_order_id;
  if v_lab_id is null then
    raise exception 'order not found' using errcode = '02000';
  end if;
  if not public.is_lab_admin(v_lab_id) then
    raise exception 'only lab admins may update orders' using errcode = '42501';
  end if;
  if p_status is not null
    and p_status not in ('initial_order_placed', 'back_ordered', 'shipped',
                         'partially_received', 'cancelled') then
    raise exception 'use receive_supply_order to mark received' using errcode = '22023';
  end if;

  update public.orders
     set company = coalesce(nullif(btrim(coalesce(p_company, '')), ''), company),
         order_number = coalesce(nullif(btrim(coalesce(p_order_number, '')), ''), order_number),
         tracking_number = coalesce(nullif(btrim(coalesce(p_tracking_number, '')), ''), tracking_number),
         status = coalesce(p_status, status),
         expected_arrival = coalesce(p_expected_arrival, expected_arrival),
         note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), note)
   where id = p_order_id
   returning * into v_order;

  perform public._log_audit(v_lab_id, 'order', p_order_id, 'update',
    jsonb_build_object('status', v_order.status));
  return v_order;
end;
$$;

-- 4.8) receive_supply_order — admin or original requester receives an order.
-- p_lots is a jsonb array of {item_id, lot_number?, received_quantity?, unit?,
-- expiration_date?, storage_location?, note?}. Each entry creates a stock_lots
-- row. Optionally creates an inventory_checks row per item with stock_status
-- 'plenty'. Flips order.status to 'received' (or 'partially_received' if
-- p_partial), and request.status to 'received' on full receipt.
create or replace function public.receive_supply_order(
  p_order_id uuid,
  p_lots jsonb default '[]'::jsonb,
  p_partial boolean default false,
  p_mark_inventory_full boolean default false,
  p_note text default null
)
returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_lab_id uuid;
  v_request_id uuid;
  v_requested_by uuid;
  v_order public.orders%rowtype;
  v_lot jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select r.lab_id, r.id, r.requested_by
    into v_lab_id, v_request_id, v_requested_by
    from public.orders o
    join public.order_requests r on r.id = o.order_request_id
   where o.id = p_order_id;
  if v_lab_id is null then
    raise exception 'order not found' using errcode = '02000';
  end if;
  if not public.is_lab_admin(v_lab_id) and v_requested_by <> v_uid then
    raise exception 'only lab admins or the requester may receive this order' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_lots, '[]'::jsonb)) <> 'array' then
    raise exception 'p_lots must be a jsonb array' using errcode = '22023';
  end if;

  for v_lot in select * from jsonb_array_elements(coalesce(p_lots, '[]'::jsonb))
  loop
    if (v_lot->>'item_id') is null then
      raise exception 'each lot entry needs item_id' using errcode = '22023';
    end if;

    -- Confirm the item belongs to the same lab as the order.
    if not exists (
      select 1 from public.items i
      where i.id = (v_lot->>'item_id')::uuid and i.lab_id = v_lab_id
    ) then
      raise exception 'lot item % is not in this lab', v_lot->>'item_id' using errcode = '22023';
    end if;

    insert into public.stock_lots (
      item_id, order_id, lot_number, received_quantity, unit,
      expiration_date, storage_location, received_by, note
    ) values (
      (v_lot->>'item_id')::uuid,
      p_order_id,
      nullif(btrim(coalesce(v_lot->>'lot_number', '')), ''),
      nullif(v_lot->>'received_quantity', '')::numeric,
      nullif(btrim(coalesce(v_lot->>'unit', '')), ''),
      nullif(v_lot->>'expiration_date', '')::date,
      nullif(btrim(coalesce(v_lot->>'storage_location', '')), ''),
      v_uid,
      nullif(btrim(coalesce(v_lot->>'note', '')), '')
    );

    if p_mark_inventory_full then
      insert into public.inventory_checks (
        item_id, stock_status, estimated_quantity, unit, location, note, checked_by
      ) values (
        (v_lot->>'item_id')::uuid,
        'plenty',
        nullif(v_lot->>'received_quantity', '')::numeric,
        nullif(btrim(coalesce(v_lot->>'unit', '')), ''),
        nullif(btrim(coalesce(v_lot->>'storage_location', '')), ''),
        'Auto-recorded on receipt',
        v_uid
      );
    end if;
  end loop;

  update public.orders
     set status = case when p_partial then 'partially_received' else 'received' end,
         received_at = case when p_partial then received_at else now() end,
         note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), note)
   where id = p_order_id
   returning * into v_order;

  if not p_partial then
    update public.order_requests
       set status = 'received'
     where id = v_request_id;
  end if;

  perform public._log_audit(v_lab_id, 'order', p_order_id, 'receive',
    jsonb_build_object('partial', p_partial,
                       'lot_count', jsonb_array_length(coalesce(p_lots, '[]'::jsonb))));

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Grants
-- ---------------------------------------------------------------------------

grant execute on function public.submit_order_request(uuid)             to authenticated;
grant execute on function public.withdraw_order_request(uuid)           to authenticated;
grant execute on function public.approve_order_request(uuid, text)      to authenticated;
grant execute on function public.deny_order_request(uuid, text)         to authenticated;
grant execute on function public.cancel_order_request(uuid)             to authenticated;
grant execute on function public.place_supply_order(uuid, text, text, text, timestamptz, text) to authenticated;
grant execute on function public.update_supply_order(uuid, text, text, text, text, timestamptz, text) to authenticated;
grant execute on function public.receive_supply_order(uuid, jsonb, boolean, boolean, text) to authenticated;
