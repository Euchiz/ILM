-- Collapse the "initial_order_placed" / "back_ordered" pair on
-- public.orders.status into a single "order_placed" value.
--
-- The two states never carried distinct meaning in practice — every order
-- starts as "placed" and the back-ordered nuance is captured in the order
-- note / vendor communication. Merging them simplifies the lifecycle and
-- the surfacing UI (status pill + dropdown).

-- 1) Drop the existing CHECK so we can rewrite values without violating it.
alter table public.orders
  drop constraint if exists orders_status_check;

-- 2) Migrate existing rows.
update public.orders
   set status = 'order_placed'
 where status in ('initial_order_placed', 'back_ordered');

-- 3) Re-add the constraint over the new value set.
alter table public.orders
  add constraint orders_status_check
  check (status in (
    'order_placed',
    'shipped',
    'partially_received',
    'received',
    'cancelled'
  ));

-- 4) Update the default for new rows.
alter table public.orders
  alter column status set default 'order_placed';

-- 5) Rewrite the lifecycle RPCs that reference the old values. Both keep
-- their existing signatures so cloudAdapter callers are unaffected.

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
    'order_placed',
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
    and p_status not in ('order_placed', 'shipped', 'partially_received', 'cancelled') then
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
