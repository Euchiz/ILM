-- Stage 4e — Scheduler
--
-- Lab-scoped time/resource coordination: equipment registry, calendar events,
-- equipment bookings (with conflict detection), and a queue of planned tasks
-- that have not yet been scheduled.
--
-- All tables are lab-scoped. Reads are gated by lab membership; writes follow
-- the standard pattern (member self-create, admin manage). Hard-booking
-- conflict detection runs through a SECURITY DEFINER RPC so the overlap check
-- happens server-side.

-- ---------------------------------------------------------------------------
-- 1) Tables
-- ---------------------------------------------------------------------------

-- 1.1) resources — equipment / bookable resources
create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  name text not null,
  description text,
  category text not null default 'general'
    check (category in ('sequencer', 'microscope', 'thermocycler', 'centrifuge',
                        'incubator', 'qpcr', 'imaging', 'general', 'other')),
  location text,
  availability_status text not null default 'available'
    check (availability_status in ('available', 'offline', 'maintenance', 'restricted')),
  booking_mode text not null default 'hard_booking'
    check (booking_mode in ('hard_booking', 'soft_booking')),
  booking_policy text not null default 'open'
    check (booking_policy in ('open', 'approval_required', 'admin_only')),
  minimum_booking_duration_minutes integer,
  maximum_booking_duration_minutes integer,
  setup_buffer_minutes integer not null default 0,
  cleanup_buffer_minutes integer not null default 0,
  required_training boolean not null default false,
  responsible_person_id uuid references auth.users(id) on delete set null,
  linked_protocol_id uuid references public.protocols(id) on delete set null,
  notes text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists resources_lab_id_idx on public.resources (lab_id);
create index if not exists resources_lab_active_idx on public.resources (lab_id, is_active);
create index if not exists resources_category_idx on public.resources (lab_id, category);

drop trigger if exists resources_set_updated_at on public.resources;
create trigger resources_set_updated_at
before update on public.resources
for each row execute function public.set_updated_at();

-- 1.2) calendar_events — scheduled events (meetings, experiments, deadlines, …)
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  title text not null,
  description text,
  event_type text not null default 'general'
    check (event_type in ('meeting', 'experiment', 'reminder', 'deadline',
                          'maintenance', 'general')),
  start_time timestamptz not null,
  end_time timestamptz not null,
  location text,
  linked_project_id uuid references public.projects(id) on delete set null,
  linked_protocol_id uuid references public.protocols(id) on delete set null,
  linked_task_id uuid,
  organizer_user_id uuid references auth.users(id) on delete set null,
  participant_user_ids uuid[] not null default '{}',
  visibility text not null default 'lab'
    check (visibility in ('private', 'project', 'lab', 'equipment_visible')),
  recurrence_rule text,
  recurrence_exceptions timestamptz[] not null default '{}',
  status text not null default 'scheduled'
    check (status in ('scheduled', 'cancelled', 'completed')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_time_window check (end_time > start_time)
);

create index if not exists calendar_events_lab_idx on public.calendar_events (lab_id);
create index if not exists calendar_events_window_idx
  on public.calendar_events (lab_id, start_time, end_time);
create index if not exists calendar_events_project_idx
  on public.calendar_events (linked_project_id);

drop trigger if exists calendar_events_set_updated_at on public.calendar_events;
create trigger calendar_events_set_updated_at
before update on public.calendar_events
for each row execute function public.set_updated_at();

-- 1.3) bookings — equipment reservations
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  lab_id uuid not null references public.labs(id) on delete cascade,
  calendar_event_id uuid references public.calendar_events(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  protocol_id uuid references public.protocols(id) on delete set null,
  planned_task_id uuid,
  title text,
  start_time timestamptz not null,
  end_time timestamptz not null,
  setup_buffer_minutes integer not null default 0,
  cleanup_buffer_minutes integer not null default 0,
  booking_type text not null default 'experiment'
    check (booking_type in ('experiment', 'daily_use', 'maintenance',
                            'calibration', 'training')),
  status text not null default 'approved'
    check (status in ('draft', 'requested', 'approved', 'denied', 'active',
                      'completed', 'cancelled', 'no_show')),
  approval_user_id uuid references auth.users(id) on delete set null,
  purpose text,
  sample_count integer,
  notes text,
  actual_start_time timestamptz,
  actual_end_time timestamptz,
  usage_record text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_time_window check (end_time > start_time)
);

create index if not exists bookings_resource_window_idx
  on public.bookings (resource_id, start_time, end_time);
create index if not exists bookings_lab_idx on public.bookings (lab_id);
create index if not exists bookings_user_idx on public.bookings (user_id);
create index if not exists bookings_project_idx on public.bookings (project_id);
create index if not exists bookings_status_idx on public.bookings (lab_id, status);

drop trigger if exists bookings_set_updated_at on public.bookings;
create trigger bookings_set_updated_at
before update on public.bookings
for each row execute function public.set_updated_at();

-- 1.4) planned_tasks — experiment work that has not yet been scheduled
create table if not exists public.planned_tasks (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  title text not null,
  description text,
  project_id uuid references public.projects(id) on delete set null,
  protocol_id uuid references public.protocols(id) on delete set null,
  experiment_id uuid,
  assigned_user_id uuid references auth.users(id) on delete set null,
  estimated_duration_minutes integer,
  required_resource_ids uuid[] not null default '{}',
  preferred_start_date date,
  preferred_end_date date,
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'planned'
    check (status in ('planned', 'ready_to_schedule', 'scheduled',
                      'completed', 'cancelled')),
  generated_from_protocol_step_id uuid,
  scheduled_event_id uuid references public.calendar_events(id) on delete set null,
  scheduled_booking_id uuid references public.bookings(id) on delete set null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists planned_tasks_lab_status_idx
  on public.planned_tasks (lab_id, status);
create index if not exists planned_tasks_project_idx
  on public.planned_tasks (project_id);
create index if not exists planned_tasks_assigned_idx
  on public.planned_tasks (assigned_user_id);

drop trigger if exists planned_tasks_set_updated_at on public.planned_tasks;
create trigger planned_tasks_set_updated_at
before update on public.planned_tasks
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2) RLS
-- ---------------------------------------------------------------------------

alter table public.resources       enable row level security;
alter table public.calendar_events enable row level security;
alter table public.bookings        enable row level security;
alter table public.planned_tasks   enable row level security;

-- 2.1) resources — lab members read; admins write.
drop policy if exists resources_select on public.resources;
create policy resources_select on public.resources
  for select using (public.is_lab_member(lab_id));

drop policy if exists resources_insert_admin on public.resources;
create policy resources_insert_admin on public.resources
  for insert with check (public.is_lab_admin(lab_id));

drop policy if exists resources_update_admin on public.resources;
create policy resources_update_admin on public.resources
  for update using (public.is_lab_admin(lab_id))
  with check (public.is_lab_admin(lab_id));

drop policy if exists resources_delete_admin on public.resources;
create policy resources_delete_admin on public.resources
  for delete using (public.is_lab_admin(lab_id));

-- 2.2) calendar_events — lab members read; members create/edit own; admins
-- can edit/delete any.
drop policy if exists calendar_events_select on public.calendar_events;
create policy calendar_events_select on public.calendar_events
  for select using (public.is_lab_member(lab_id));

drop policy if exists calendar_events_insert on public.calendar_events;
create policy calendar_events_insert on public.calendar_events
  for insert with check (
    public.is_lab_member(lab_id)
    and (organizer_user_id is null or organizer_user_id = auth.uid())
  );

drop policy if exists calendar_events_update on public.calendar_events;
create policy calendar_events_update on public.calendar_events
  for update using (
    public.is_lab_admin(lab_id)
    or organizer_user_id = auth.uid()
  )
  with check (
    public.is_lab_admin(lab_id)
    or organizer_user_id = auth.uid()
  );

drop policy if exists calendar_events_delete on public.calendar_events;
create policy calendar_events_delete on public.calendar_events
  for delete using (
    public.is_lab_admin(lab_id)
    or organizer_user_id = auth.uid()
  );

-- 2.3) bookings — lab members read; members create own (subject to
-- conflict-checking RPC for hard bookings); members edit/cancel own non-
-- terminal bookings; admins can edit/delete any.
drop policy if exists bookings_select on public.bookings;
create policy bookings_select on public.bookings
  for select using (public.is_lab_member(lab_id));

drop policy if exists bookings_insert on public.bookings;
create policy bookings_insert on public.bookings
  for insert with check (
    public.is_lab_member(lab_id)
    and (user_id is null or user_id = auth.uid())
  );

drop policy if exists bookings_update on public.bookings;
create policy bookings_update on public.bookings
  for update using (
    public.is_lab_admin(lab_id)
    or (user_id = auth.uid() and status in ('draft', 'requested', 'approved', 'active'))
  )
  with check (
    public.is_lab_admin(lab_id)
    or (user_id = auth.uid() and status in ('draft', 'requested', 'approved',
                                            'active', 'completed', 'cancelled'))
  );

drop policy if exists bookings_delete on public.bookings;
create policy bookings_delete on public.bookings
  for delete using (
    public.is_lab_admin(lab_id)
    or (user_id = auth.uid() and status in ('draft', 'requested'))
  );

-- 2.4) planned_tasks — lab members read; members create/edit own; admins
-- manage all.
drop policy if exists planned_tasks_select on public.planned_tasks;
create policy planned_tasks_select on public.planned_tasks
  for select using (public.is_lab_member(lab_id));

drop policy if exists planned_tasks_insert on public.planned_tasks;
create policy planned_tasks_insert on public.planned_tasks
  for insert with check (
    public.is_lab_member(lab_id)
    and (created_by is null or created_by = auth.uid())
  );

drop policy if exists planned_tasks_update on public.planned_tasks;
create policy planned_tasks_update on public.planned_tasks
  for update using (
    public.is_lab_admin(lab_id)
    or created_by = auth.uid()
    or assigned_user_id = auth.uid()
  )
  with check (
    public.is_lab_admin(lab_id)
    or created_by = auth.uid()
    or assigned_user_id = auth.uid()
  );

drop policy if exists planned_tasks_delete on public.planned_tasks;
create policy planned_tasks_delete on public.planned_tasks
  for delete using (
    public.is_lab_admin(lab_id)
    or created_by = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 3) Conflict detection helper
-- ---------------------------------------------------------------------------

-- Returns the bookings that overlap a proposed window for a given resource,
-- after applying the resource's setup/cleanup buffers. Soft-booking resources
-- never produce conflicts (overlaps are visible but allowed).
create or replace function public.find_booking_conflicts(
  p_resource_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_exclude_booking_id uuid default null
)
returns setof public.bookings
language plpgsql stable security definer set search_path = public as $$
declare
  v_resource public.resources%rowtype;
  v_setup interval;
  v_cleanup interval;
  v_window_start timestamptz;
  v_window_end timestamptz;
begin
  select * into v_resource from public.resources where id = p_resource_id;
  if not found then
    raise exception 'resource not found' using errcode = '02000';
  end if;
  if not public.is_lab_member(v_resource.lab_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  -- Soft bookings tolerate overlap — return no conflicts.
  if v_resource.booking_mode = 'soft_booking' then
    return;
  end if;

  v_setup := make_interval(mins => coalesce(v_resource.setup_buffer_minutes, 0));
  v_cleanup := make_interval(mins => coalesce(v_resource.cleanup_buffer_minutes, 0));
  v_window_start := p_start_time - v_setup;
  v_window_end := p_end_time + v_cleanup;

  return query
    select *
      from public.bookings b
     where b.resource_id = p_resource_id
       and b.status in ('requested', 'approved', 'active')
       and (p_exclude_booking_id is null or b.id <> p_exclude_booking_id)
       and tstzrange(b.start_time - v_setup, b.end_time + v_cleanup, '[)')
           && tstzrange(v_window_start, v_window_end, '[)');
end;
$$;

grant execute on function public.find_booking_conflicts(uuid, timestamptz, timestamptz, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 4) RPCs — booking lifecycle (server-side conflict-checked)
-- ---------------------------------------------------------------------------

-- 4.1) book_resource — creates a booking after conflict + policy checks.
create or replace function public.book_resource(
  p_resource_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_title text default null,
  p_booking_type text default 'experiment',
  p_project_id uuid default null,
  p_protocol_id uuid default null,
  p_planned_task_id uuid default null,
  p_calendar_event_id uuid default null,
  p_purpose text default null,
  p_sample_count integer default null,
  p_notes text default null
)
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_resource public.resources%rowtype;
  v_status text;
  v_duration_minutes integer;
  v_conflict_count integer;
  v_booking public.bookings%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_end_time <= p_start_time then
    raise exception 'end_time must be after start_time' using errcode = '22023';
  end if;

  select * into v_resource from public.resources where id = p_resource_id;
  if not found then
    raise exception 'resource not found' using errcode = '02000';
  end if;
  if not public.is_lab_member(v_resource.lab_id) then
    raise exception 'not a member of this lab' using errcode = '42501';
  end if;
  if not v_resource.is_active then
    raise exception 'resource is archived' using errcode = '22023';
  end if;
  if v_resource.availability_status in ('offline', 'maintenance')
     and not public.is_lab_admin(v_resource.lab_id) then
    raise exception 'resource is % and cannot be booked', v_resource.availability_status
      using errcode = '22023';
  end if;
  if v_resource.booking_policy = 'admin_only'
     and not public.is_lab_admin(v_resource.lab_id) then
    raise exception 'this resource is admin-only' using errcode = '42501';
  end if;

  v_duration_minutes := ceil(extract(epoch from (p_end_time - p_start_time)) / 60.0);
  if v_resource.minimum_booking_duration_minutes is not null
     and v_duration_minutes < v_resource.minimum_booking_duration_minutes then
    raise exception 'booking shorter than minimum % minutes',
      v_resource.minimum_booking_duration_minutes using errcode = '22023';
  end if;
  if v_resource.maximum_booking_duration_minutes is not null
     and v_duration_minutes > v_resource.maximum_booking_duration_minutes
     and not public.is_lab_admin(v_resource.lab_id) then
    raise exception 'booking longer than maximum % minutes',
      v_resource.maximum_booking_duration_minutes using errcode = '22023';
  end if;

  -- Hard-conflict detection. Soft bookings short-circuit inside the helper.
  if v_resource.booking_mode = 'hard_booking' then
    select count(*) into v_conflict_count
      from public.find_booking_conflicts(p_resource_id, p_start_time, p_end_time, null);
    if v_conflict_count > 0 and not public.is_lab_admin(v_resource.lab_id) then
      raise exception 'time conflicts with % existing booking(s)', v_conflict_count
        using errcode = '23P01';
    end if;
  end if;

  v_status := case
    when v_resource.booking_policy = 'approval_required'
         and not public.is_lab_admin(v_resource.lab_id) then 'requested'
    else 'approved'
  end;

  insert into public.bookings (
    resource_id, lab_id, calendar_event_id, user_id, project_id, protocol_id,
    planned_task_id, title, start_time, end_time,
    setup_buffer_minutes, cleanup_buffer_minutes,
    booking_type, status, purpose, sample_count, notes
  ) values (
    p_resource_id, v_resource.lab_id, p_calendar_event_id, v_uid, p_project_id,
    p_protocol_id, p_planned_task_id,
    nullif(btrim(coalesce(p_title, '')), ''),
    p_start_time, p_end_time,
    coalesce(v_resource.setup_buffer_minutes, 0),
    coalesce(v_resource.cleanup_buffer_minutes, 0),
    coalesce(p_booking_type, 'experiment'),
    v_status,
    nullif(btrim(coalesce(p_purpose, '')), ''),
    p_sample_count,
    nullif(btrim(coalesce(p_notes, '')), '')
  )
  returning * into v_booking;

  perform public._log_audit(v_resource.lab_id, 'booking', v_booking.id, 'book',
    jsonb_build_object('resource_id', p_resource_id, 'status', v_status,
                       'mode', v_resource.booking_mode));
  return v_booking;
end;
$$;

-- 4.2) cancel_booking — owner or admin
create or replace function public.cancel_booking(p_booking_id uuid, p_note text default null)
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.bookings%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_row from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'booking not found' using errcode = '02000';
  end if;
  if v_row.user_id <> v_uid and not public.is_lab_admin(v_row.lab_id) then
    raise exception 'not permitted to cancel this booking' using errcode = '42501';
  end if;
  if v_row.status in ('completed', 'cancelled', 'no_show') then
    raise exception 'booking is already %', v_row.status using errcode = '22023';
  end if;

  update public.bookings
     set status = 'cancelled',
         notes = coalesce(nullif(btrim(coalesce(p_note, '')), ''), notes)
   where id = p_booking_id
   returning * into v_row;

  perform public._log_audit(v_row.lab_id, 'booking', p_booking_id, 'cancel', '{}'::jsonb);
  return v_row;
end;
$$;

-- 4.3) complete_booking — owner or admin marks a booking complete with usage notes
create or replace function public.complete_booking(
  p_booking_id uuid,
  p_usage_record text default null,
  p_actual_start_time timestamptz default null,
  p_actual_end_time timestamptz default null
)
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.bookings%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_row from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'booking not found' using errcode = '02000';
  end if;
  if v_row.user_id <> v_uid and not public.is_lab_admin(v_row.lab_id) then
    raise exception 'not permitted to complete this booking' using errcode = '42501';
  end if;
  if v_row.status not in ('approved', 'active', 'requested') then
    raise exception 'cannot complete a booking with status %', v_row.status
      using errcode = '22023';
  end if;

  update public.bookings
     set status = 'completed',
         usage_record = coalesce(nullif(btrim(coalesce(p_usage_record, '')), ''), usage_record),
         actual_start_time = coalesce(p_actual_start_time, actual_start_time, v_row.start_time),
         actual_end_time = coalesce(p_actual_end_time, actual_end_time, now())
   where id = p_booking_id
   returning * into v_row;

  perform public._log_audit(v_row.lab_id, 'booking', p_booking_id, 'complete', '{}'::jsonb);
  return v_row;
end;
$$;

-- 4.4) approve_booking / deny_booking — for resources with approval_required
create or replace function public.approve_booking(p_booking_id uuid, p_note text default null)
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.bookings%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_row from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'booking not found' using errcode = '02000';
  end if;
  if not public.is_lab_admin(v_row.lab_id) then
    raise exception 'only lab admins may approve bookings' using errcode = '42501';
  end if;
  if v_row.status <> 'requested' then
    raise exception 'only requested bookings can be approved' using errcode = '22023';
  end if;

  update public.bookings
     set status = 'approved',
         approval_user_id = v_uid,
         notes = coalesce(nullif(btrim(coalesce(p_note, '')), ''), notes)
   where id = p_booking_id
   returning * into v_row;

  perform public._log_audit(v_row.lab_id, 'booking', p_booking_id, 'approve', '{}'::jsonb);
  return v_row;
end;
$$;

create or replace function public.deny_booking(p_booking_id uuid, p_note text)
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.bookings%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if v_note is null then
    raise exception 'a denial note is required' using errcode = '22023';
  end if;

  select * into v_row from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'booking not found' using errcode = '02000';
  end if;
  if not public.is_lab_admin(v_row.lab_id) then
    raise exception 'only lab admins may deny bookings' using errcode = '42501';
  end if;
  if v_row.status <> 'requested' then
    raise exception 'only requested bookings can be denied' using errcode = '22023';
  end if;

  update public.bookings
     set status = 'denied',
         approval_user_id = v_uid,
         notes = v_note
   where id = p_booking_id
   returning * into v_row;

  perform public._log_audit(v_row.lab_id, 'booking', p_booking_id, 'deny',
    jsonb_build_object('note', v_note));
  return v_row;
end;
$$;

-- 4.5) schedule_planned_task — converts a planned task to a calendar event
-- and/or booking. Either p_event_args or p_booking_args (or both) must be set.
create or replace function public.schedule_planned_task(
  p_task_id uuid,
  p_event_args jsonb default null,
  p_booking_args jsonb default null
)
returns public.planned_tasks
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_task public.planned_tasks%rowtype;
  v_event public.calendar_events%rowtype;
  v_booking public.bookings%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_event_args is null and p_booking_args is null then
    raise exception 'must supply event or booking args' using errcode = '22023';
  end if;

  select * into v_task from public.planned_tasks where id = p_task_id;
  if not found then
    raise exception 'planned task not found' using errcode = '02000';
  end if;
  if not public.is_lab_member(v_task.lab_id) then
    raise exception 'not a member of this lab' using errcode = '42501';
  end if;
  if v_task.status in ('scheduled', 'completed', 'cancelled') then
    raise exception 'task is already %', v_task.status using errcode = '22023';
  end if;

  if p_event_args is not null then
    insert into public.calendar_events (
      lab_id, title, description, event_type, start_time, end_time,
      location, linked_project_id, linked_protocol_id, linked_task_id,
      organizer_user_id, status, notes, created_by, updated_by
    ) values (
      v_task.lab_id,
      coalesce(nullif(btrim(coalesce(p_event_args->>'title', '')), ''), v_task.title),
      coalesce(p_event_args->>'description', v_task.description),
      coalesce(p_event_args->>'event_type', 'experiment'),
      (p_event_args->>'start_time')::timestamptz,
      (p_event_args->>'end_time')::timestamptz,
      nullif(btrim(coalesce(p_event_args->>'location', '')), ''),
      coalesce(nullif(p_event_args->>'project_id', '')::uuid, v_task.project_id),
      coalesce(nullif(p_event_args->>'protocol_id', '')::uuid, v_task.protocol_id),
      v_task.id,
      v_uid,
      'scheduled',
      nullif(btrim(coalesce(p_event_args->>'notes', '')), ''),
      v_uid,
      v_uid
    )
    returning * into v_event;
  end if;

  if p_booking_args is not null then
    v_booking := public.book_resource(
      (p_booking_args->>'resource_id')::uuid,
      (p_booking_args->>'start_time')::timestamptz,
      (p_booking_args->>'end_time')::timestamptz,
      coalesce(nullif(btrim(coalesce(p_booking_args->>'title', '')), ''), v_task.title),
      coalesce(p_booking_args->>'booking_type', 'experiment'),
      coalesce(nullif(p_booking_args->>'project_id', '')::uuid, v_task.project_id),
      coalesce(nullif(p_booking_args->>'protocol_id', '')::uuid, v_task.protocol_id),
      v_task.id,
      v_event.id,
      nullif(btrim(coalesce(p_booking_args->>'purpose', '')), ''),
      nullif(p_booking_args->>'sample_count', '')::integer,
      nullif(btrim(coalesce(p_booking_args->>'notes', '')), '')
    );
  end if;

  update public.planned_tasks
     set status = 'scheduled',
         scheduled_event_id = coalesce(v_event.id, scheduled_event_id),
         scheduled_booking_id = coalesce(v_booking.id, scheduled_booking_id),
         updated_by = v_uid
   where id = p_task_id
   returning * into v_task;

  perform public._log_audit(v_task.lab_id, 'planned_task', p_task_id, 'schedule',
    jsonb_build_object('event_id', v_event.id, 'booking_id', v_booking.id));
  return v_task;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Grants
-- ---------------------------------------------------------------------------

grant execute on function public.book_resource(
  uuid, timestamptz, timestamptz, text, text, uuid, uuid, uuid, uuid, text, integer, text
) to authenticated;
grant execute on function public.cancel_booking(uuid, text)            to authenticated;
grant execute on function public.complete_booking(uuid, text, timestamptz, timestamptz)
  to authenticated;
grant execute on function public.approve_booking(uuid, text)           to authenticated;
grant execute on function public.deny_booking(uuid, text)              to authenticated;
grant execute on function public.schedule_planned_task(uuid, jsonb, jsonb)
  to authenticated;
