alter type public.tracking_session_status add value if not exists 'failed';
alter type public.tracking_session_status add value if not exists 'permission_missing';
alter type public.tracking_source add value if not exists 'phone';

alter table public.ad_works
  add column if not exists mobile_location_proof_required boolean not null default false,
  add column if not exists mobile_location_proof_note text,
  add column if not exists mobile_location_tracking_mode text not null default 'phone_location';

alter table public.tracking_sessions
  add column if not exists ad_work_id uuid references public.ad_works(id) on delete cascade,
  add column if not exists assignment_id uuid references public.ad_work_assignments(id) on delete restrict,
  add column if not exists driver_id uuid references public.drivers(id) on delete restrict,
  add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null,
  add column if not exists tracking_mode text not null default 'phone_location',
  add column if not exists last_update_at timestamptz,
  add column if not exists point_count integer not null default 0,
  add column if not exists quality_status public.location_quality not null default 'unknown',
  add column if not exists updated_at timestamptz not null default now();

alter table public.location_points
  add column if not exists ad_work_id uuid references public.ad_works(id) on delete cascade,
  add column if not exists ad_work_day_id uuid references public.ad_work_days(id) on delete cascade,
  add column if not exists assignment_id uuid references public.ad_work_assignments(id) on delete restrict,
  add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null,
  add column if not exists heading numeric(8, 2);

create index if not exists tracking_sessions_ad_work_status_idx
  on public.tracking_sessions(ad_work_id, status, updated_at desc);

create index if not exists tracking_sessions_day_status_idx
  on public.tracking_sessions(ad_work_day_id, status, updated_at desc);

create index if not exists location_points_session_received_idx
  on public.location_points(tracking_session_id, received_at desc);

create index if not exists location_points_ad_work_received_idx
  on public.location_points(ad_work_id, received_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ad_works_m9_tracking_mode_check'
  ) then
    alter table public.ad_works
      add constraint ad_works_m9_tracking_mode_check
      check (mobile_location_tracking_mode = 'phone_location');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'tracking_sessions_m9_tracking_mode_check'
  ) then
    alter table public.tracking_sessions
      add constraint tracking_sessions_m9_tracking_mode_check
      check (tracking_mode = 'phone_location');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'tracking_sessions_m9_point_count_check'
  ) then
    alter table public.tracking_sessions
      add constraint tracking_sessions_m9_point_count_check
      check (point_count >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'tracking_sessions_m9_stop_reason_check'
  ) then
    alter table public.tracking_sessions
      add constraint tracking_sessions_m9_stop_reason_check
      check (stop_reason is null or stop_reason in ('work_ended', 'break_started', 'admin_stopped', 'permission_removed', 'app_error', 'other'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'location_points_m9_lat_lng_check'
  ) then
    alter table public.location_points
      add constraint location_points_m9_lat_lng_check
      check (lat between -90 and 90 and lng between -180 and 180);
  end if;
end $$;

alter table public.ad_works enable row level security;
alter table public.tracking_sessions enable row level security;
alter table public.location_points enable row level security;

drop policy if exists "Admin users can view tracking sessions" on public.tracking_sessions;
create policy "Admin users can view tracking sessions"
  on public.tracking_sessions
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admin users can view location points" on public.location_points;
create policy "Admin users can view location points"
  on public.location_points
  for select
  to authenticated
  using (public.is_admin());

revoke all on public.tracking_sessions from anon;
revoke all on public.tracking_sessions from authenticated;
revoke all on public.location_points from anon;
revoke all on public.location_points from authenticated;
grant select on public.tracking_sessions to authenticated;
grant select on public.location_points to authenticated;

create or replace function public.set_mobile_location_proof(
  p_ad_work_id uuid,
  p_required boolean,
  p_note text default null
)
returns table(ad_work_id uuid, mobile_location_proof_required boolean, mobile_location_tracking_mode text, result_message text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  update public.ad_works
  set mobile_location_proof_required = coalesce(p_required, false),
      mobile_location_proof_note = nullif(trim(coalesce(p_note, '')), ''),
      mobile_location_tracking_mode = 'phone_location',
      customer_live_enabled = false,
      live_tracking_enabled = false,
      updated_at = now()
  where id = p_ad_work_id;

  if not found then
    raise exception 'Ad Work not found' using errcode = 'P0002';
  end if;

  return query select p_ad_work_id, coalesce(p_required, false), 'phone_location'::text, 'Phone Location Proof saved.'::text;
end;
$$;

create or replace function public.m9_quality_from_accuracy(p_accuracy numeric)
returns public.location_quality
language sql
immutable
set search_path = public
as $$
  select case
    when p_accuracy is null then 'unknown'::public.location_quality
    when p_accuracy <= 50 then 'good'::public.location_quality
    else 'weak'::public.location_quality
  end;
$$;

drop function if exists public.driver_get_assigned_work(text, text);
create or replace function public.driver_get_assigned_work(
  p_mobile text,
  p_work_code text
)
returns table(
  ad_work_id uuid,
  ad_work_day_id uuid,
  business_name text,
  city text,
  areas_to_cover text,
  advertisement_details text,
  planned_date date,
  planned_start_time time,
  planned_end_time time,
  execution_status text,
  vehicle_number text,
  special_instructions text,
  mobile_location_proof_required boolean,
  mobile_location_proof_note text,
  mobile_location_tracking_mode text,
  mobile_tracking_session_id uuid,
  mobile_tracking_status text,
  mobile_location_point_count integer,
  mobile_last_location_update_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad_work public.ad_works%rowtype;
begin
  select aw.* into v_ad_work
  from public.ad_works aw
  join public.ad_work_assignments assignment on assignment.ad_work_id = aw.id
  join public.drivers driver_record on driver_record.id = assignment.driver_id
  where aw.execution_release_status = 'released_to_driver'
    and aw.work_access_code_hash = public.m6_hash_work_code(p_work_code)
    and public.m6_normalize_mobile(driver_record.phone) = public.m6_normalize_mobile(p_mobile)
    and assignment.status = 'ready_for_execution'
  limit 1;

  if not found then
    raise exception 'Invalid work code or mobile number' using errcode = '42501';
  end if;

  return query
  select
    aw.id,
    day_row.id,
    aw.business_name,
    aw.city,
    coalesce(day_row.areas_to_cover, aw.areas_to_cover),
    aw.advertisement_details,
    day_row.work_date,
    day_row.planned_start_time,
    day_row.planned_end_time,
    day_row.execution_status,
    vehicle_record.vehicle_number,
    aw.special_instructions,
    coalesce(aw.mobile_location_proof_required, false),
    aw.mobile_location_proof_note,
    aw.mobile_location_tracking_mode,
    session_row.id,
    coalesce(session_row.status::text, 'not_started'),
    coalesce(session_row.point_count, 0),
    session_row.last_update_at
  from public.ad_works aw
  join public.ad_work_assignments assignment on assignment.ad_work_id = aw.id
  join public.vehicles vehicle_record on vehicle_record.id = assignment.vehicle_id
  join public.ad_work_days day_row on day_row.ad_work_id = aw.id
  left join lateral (
    select tracking.*
    from public.tracking_sessions tracking
    where tracking.ad_work_day_id = day_row.id
      and tracking.driver_id = assignment.driver_id
      and tracking.tracking_mode = 'phone_location'
    order by tracking.updated_at desc, tracking.created_at desc
    limit 1
  ) session_row on true
  where aw.id = v_ad_work.id
  order by day_row.work_date asc;
end;
$$;

create or replace function public.driver_start_mobile_tracking(
  p_mobile text,
  p_work_code text,
  p_ad_work_day_id uuid,
  p_driver_consent boolean
)
returns table(tracking_session_id uuid, status text, point_count integer, result_message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad_work public.ad_works%rowtype;
  v_assignment public.ad_work_assignments%rowtype;
  v_day public.ad_work_days%rowtype;
  v_driver public.drivers%rowtype;
  v_session public.tracking_sessions%rowtype;
  v_session_id uuid;
begin
  if coalesce(p_driver_consent, false) is false then
    raise exception 'Location proof consent is required' using errcode = '42501';
  end if;

  select aw.* into v_ad_work
  from public.ad_works aw
  join public.ad_work_assignments assignment on assignment.ad_work_id = aw.id
  join public.drivers driver_record on driver_record.id = assignment.driver_id
  where aw.execution_release_status = 'released_to_driver'
    and aw.work_access_code_hash = public.m6_hash_work_code(p_work_code)
    and public.m6_normalize_mobile(driver_record.phone) = public.m6_normalize_mobile(p_mobile)
    and assignment.status = 'ready_for_execution'
  limit 1;

  if not found then
    raise exception 'Invalid work code or mobile number' using errcode = '42501';
  end if;

  select * into v_assignment
  from public.ad_work_assignments
  where ad_work_id = v_ad_work.id
    and status = 'ready_for_execution';

  select * into v_driver
  from public.drivers
  where id = v_assignment.driver_id;

  select * into v_day
  from public.ad_work_days
  where id = p_ad_work_day_id
    and ad_work_id = v_ad_work.id
  for update;

  if not found then
    raise exception 'Work day not found' using errcode = 'P0002';
  end if;

  if coalesce(v_ad_work.mobile_location_proof_required, false) is false then
    raise exception 'Phone Location Proof is not required for this work' using errcode = '22000';
  end if;

  if v_day.execution_status <> 'running' then
    raise exception 'Location Proof starts only during work' using errcode = '22000';
  end if;

  if v_day.work_date <> current_date then
    raise exception 'Location Proof is available only for today''s work' using errcode = '22000';
  end if;

  if coalesce(v_ad_work.closure_status, 'not_ready') in ('closed', 'closed_with_issues', 'cancelled')
    or coalesce(v_ad_work.execution_overall_status, 'not_started') in ('completed', 'cancelled') then
    raise exception 'Location Proof is not available after work is closed' using errcode = '22000';
  end if;

  select * into v_session
  from public.tracking_sessions
  where ad_work_id = v_ad_work.id
    and ad_work_day_id = v_day.id
    and driver_id = v_assignment.driver_id
    and tracking_mode = 'phone_location'
    and status in ('not_started', 'running', 'paused', 'failed', 'permission_missing')
  order by updated_at desc, created_at desc
  limit 1
  for update;

  if found then
    update public.tracking_sessions
    set status = 'running',
        started_at = coalesce(started_at, now()),
        ended_at = null,
        stopped_by = null,
        stop_reason = null,
        quality_status = case when point_count > 0 then quality_status else 'unknown'::public.location_quality end,
        updated_at = now()
    where id = v_session.id
    returning id into v_session_id;
  else
    insert into public.tracking_sessions (
      ad_work_id,
      ad_work_day_id,
      assignment_id,
      driver_id,
      vehicle_id,
      source_type,
      tracking_mode,
      status,
      started_at,
      point_count,
      quality_status,
      updated_at
    ) values (
      v_ad_work.id,
      v_day.id,
      v_assignment.id,
      v_assignment.driver_id,
      v_assignment.vehicle_id,
      'mobile',
      'phone_location',
      'running',
      now(),
      0,
      'unknown',
      now()
    ) returning id into v_session_id;
  end if;

  return query
  select tracking.id, tracking.status::text, tracking.point_count, 'Location Proof Running.'::text
  from public.tracking_sessions tracking
  where tracking.id = v_session_id;
end;
$$;

create or replace function public.driver_mark_mobile_location_permission_missing(
  p_mobile text,
  p_work_code text,
  p_ad_work_day_id uuid
)
returns table(tracking_session_id uuid, status text, result_message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad_work public.ad_works%rowtype;
  v_assignment public.ad_work_assignments%rowtype;
  v_day public.ad_work_days%rowtype;
  v_session_id uuid;
begin
  select aw.* into v_ad_work
  from public.ad_works aw
  join public.ad_work_assignments assignment on assignment.ad_work_id = aw.id
  join public.drivers driver_record on driver_record.id = assignment.driver_id
  where aw.execution_release_status = 'released_to_driver'
    and aw.work_access_code_hash = public.m6_hash_work_code(p_work_code)
    and public.m6_normalize_mobile(driver_record.phone) = public.m6_normalize_mobile(p_mobile)
    and assignment.status = 'ready_for_execution'
  limit 1;

  if not found then
    raise exception 'Invalid work code or mobile number' using errcode = '42501';
  end if;

  select * into v_assignment from public.ad_work_assignments where ad_work_id = v_ad_work.id and status = 'ready_for_execution';
  select * into v_day from public.ad_work_days where id = p_ad_work_day_id and ad_work_id = v_ad_work.id;

  if not found then
    raise exception 'Work day not found' using errcode = 'P0002';
  end if;

  if coalesce(v_ad_work.mobile_location_proof_required, false) is false or v_day.execution_status <> 'running' then
    raise exception 'Location Permission Needed only during active assigned work' using errcode = '22000';
  end if;

  select id into v_session_id
  from public.tracking_sessions
  where ad_work_id = v_ad_work.id
    and ad_work_day_id = v_day.id
    and driver_id = v_assignment.driver_id
    and tracking_mode = 'phone_location'
    and status in ('not_started', 'running', 'paused', 'failed', 'permission_missing')
  order by updated_at desc, created_at desc
  limit 1
  for update;

  if v_session_id is null then
    insert into public.tracking_sessions (
      ad_work_id,
      ad_work_day_id,
      assignment_id,
      driver_id,
      vehicle_id,
      source_type,
      tracking_mode,
      status,
      stopped_by,
      stop_reason,
      quality_status,
      ended_at,
      updated_at
    ) values (
      v_ad_work.id,
      v_day.id,
      v_assignment.id,
      v_assignment.driver_id,
      v_assignment.vehicle_id,
      'mobile',
      'phone_location',
      'permission_missing',
      'driver',
      'permission_removed',
      'unknown',
      now(),
      now()
    )
    returning id into v_session_id;
  else
    update public.tracking_sessions
    set status = 'permission_missing',
        stopped_by = 'driver',
        stop_reason = 'permission_removed',
        ended_at = now(),
        updated_at = now()
    where id = v_session_id;
  end if;

  return query select v_session_id, 'permission_missing'::text, 'Location Permission Needed.'::text;
end;
$$;

create or replace function public.driver_record_mobile_location_point(
  p_mobile text,
  p_work_code text,
  p_tracking_session_id uuid,
  p_lat numeric,
  p_lng numeric,
  p_accuracy numeric default null,
  p_speed numeric default null,
  p_heading numeric default null,
  p_captured_at timestamptz default null
)
returns table(tracking_session_id uuid, point_count integer, quality_status text, result_message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.tracking_sessions%rowtype;
  v_ad_work public.ad_works%rowtype;
  v_day public.ad_work_days%rowtype;
  v_assignment public.ad_work_assignments%rowtype;
  v_driver public.drivers%rowtype;
  v_quality public.location_quality;
begin
  if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'Location point is invalid' using errcode = '22000';
  end if;

  select * into v_session
  from public.tracking_sessions
  where id = p_tracking_session_id
  for update;

  if not found then
    raise exception 'Location Proof session not found' using errcode = 'P0002';
  end if;

  select * into v_ad_work from public.ad_works where id = v_session.ad_work_id;
  select * into v_day from public.ad_work_days where id = v_session.ad_work_day_id;
  select * into v_assignment from public.ad_work_assignments where id = v_session.assignment_id;
  select * into v_driver from public.drivers where id = v_session.driver_id;

  if v_ad_work.execution_release_status <> 'released_to_driver'
    or v_ad_work.work_access_code_hash <> public.m6_hash_work_code(p_work_code)
    or public.m6_normalize_mobile(v_driver.phone) <> public.m6_normalize_mobile(p_mobile)
    or v_assignment.status <> 'ready_for_execution' then
    raise exception 'Invalid work code or mobile number' using errcode = '42501';
  end if;

  if coalesce(v_ad_work.mobile_location_proof_required, false) is false then
    raise exception 'Phone Location Proof is not required for this work' using errcode = '22000';
  end if;

  if v_session.status <> 'running' or v_day.execution_status <> 'running' then
    raise exception 'Location points are saved only while work is running' using errcode = '22000';
  end if;

  if coalesce(v_ad_work.closure_status, 'not_ready') in ('closed', 'closed_with_issues', 'cancelled') then
    raise exception 'Location points are not saved after work is closed' using errcode = '22000';
  end if;

  v_quality := public.m9_quality_from_accuracy(p_accuracy);

  insert into public.location_points (
    tracking_session_id,
    ad_work_id,
    ad_work_day_id,
    assignment_id,
    driver_id,
    vehicle_id,
    source,
    recorded_at,
    lat,
    lng,
    accuracy_meters,
    speed,
    heading,
    quality
  ) values (
    v_session.id,
    v_ad_work.id,
    v_day.id,
    v_assignment.id,
    v_assignment.driver_id,
    v_assignment.vehicle_id,
    'phone',
    coalesce(p_captured_at, now()),
    p_lat,
    p_lng,
    p_accuracy,
    p_speed,
    p_heading,
    v_quality
  );

  update public.tracking_sessions
  set point_count = point_count + 1,
      last_update_at = now(),
      quality_status = v_quality,
      updated_at = now()
  where id = v_session.id;

  return query
  select tracking.id, tracking.point_count, tracking.quality_status::text, 'Location update saved.'::text
  from public.tracking_sessions tracking
  where tracking.id = v_session.id;
end;
$$;

create or replace function public.driver_stop_mobile_tracking(
  p_mobile text,
  p_work_code text,
  p_tracking_session_id uuid,
  p_stop_reason text default 'other'
)
returns table(tracking_session_id uuid, status text, stop_reason text, result_message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.tracking_sessions%rowtype;
  v_ad_work public.ad_works%rowtype;
  v_driver public.drivers%rowtype;
  v_reason text := coalesce(nullif(trim(p_stop_reason), ''), 'other');
  v_status public.tracking_session_status := 'stopped';
begin
  if v_reason not in ('work_ended', 'break_started', 'admin_stopped', 'permission_removed', 'app_error', 'other') then
    raise exception 'Invalid stop reason' using errcode = '22000';
  end if;

  select * into v_session
  from public.tracking_sessions
  where id = p_tracking_session_id
  for update;

  if not found then
    raise exception 'Location Proof session not found' using errcode = 'P0002';
  end if;

  select * into v_ad_work from public.ad_works where id = v_session.ad_work_id;
  select * into v_driver from public.drivers where id = v_session.driver_id;

  if v_ad_work.work_access_code_hash <> public.m6_hash_work_code(p_work_code)
    or public.m6_normalize_mobile(v_driver.phone) <> public.m6_normalize_mobile(p_mobile) then
    raise exception 'Invalid work code or mobile number' using errcode = '42501';
  end if;

  if v_reason = 'break_started' then
    v_status := 'paused';
  end if;

  update public.tracking_sessions
  set status = v_status,
      ended_at = now(),
      stopped_by = 'driver',
      stop_reason = v_reason,
      updated_at = now()
  where id = v_session.id;

  return query select v_session.id, v_status::text, v_reason, case when v_status = 'paused' then 'Location Proof Paused.' else 'Location Proof Stopped.' end;
end;
$$;

create or replace function public.admin_stop_mobile_tracking(p_tracking_session_id uuid)
returns table(tracking_session_id uuid, status text, stop_reason text, result_message text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  update public.tracking_sessions
  set status = 'stopped',
      ended_at = now(),
      stopped_by = 'admin',
      stop_reason = 'admin_stopped',
      updated_at = now()
  where id = p_tracking_session_id
    and status in ('not_started', 'running', 'paused', 'failed', 'permission_missing');

  if not found then
    raise exception 'Location Proof session not found' using errcode = 'P0002';
  end if;

  return query select p_tracking_session_id, 'stopped'::text, 'admin_stopped'::text, 'Location Proof stopped.'::text;
end;
$$;

create or replace function public.m9_stop_tracking_for_day_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.execution_status = old.execution_status then
    return new;
  end if;

  if new.execution_status = 'on_break' then
    update public.tracking_sessions
    set status = 'paused',
        ended_at = now(),
        stopped_by = 'driver',
        stop_reason = 'break_started',
        updated_at = now()
    where ad_work_day_id = new.id
      and tracking_mode = 'phone_location'
      and status = 'running';
  elsif new.execution_status in ('completed', 'cancelled', 'issue_reported') then
    update public.tracking_sessions
    set status = 'stopped',
        ended_at = now(),
        stopped_by = 'driver',
        stop_reason = case when new.execution_status = 'completed' then 'work_ended' else 'other' end,
        updated_at = now()
    where ad_work_day_id = new.id
      and tracking_mode = 'phone_location'
      and status in ('not_started', 'running', 'paused', 'failed', 'permission_missing');
  end if;

  return new;
end;
$$;

drop trigger if exists m9_stop_tracking_for_day_status_trigger on public.ad_work_days;
create trigger m9_stop_tracking_for_day_status_trigger
  after update of execution_status on public.ad_work_days
  for each row
  execute function public.m9_stop_tracking_for_day_status();

create or replace function public.m9_stop_tracking_for_ad_work_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.execution_release_status = 'access_revoked'
    or coalesce(new.closure_status, 'not_ready') in ('closed', 'closed_with_issues', 'cancelled')
    or coalesce(new.execution_overall_status, 'not_started') in ('completed', 'cancelled') then
    update public.tracking_sessions
    set status = 'stopped',
        ended_at = now(),
        stopped_by = 'admin',
        stop_reason = case when new.execution_overall_status = 'completed' then 'work_ended' else 'admin_stopped' end,
        updated_at = now()
    where ad_work_id = new.id
      and tracking_mode = 'phone_location'
      and status in ('not_started', 'running', 'paused', 'failed', 'permission_missing');
  end if;

  return new;
end;
$$;

drop trigger if exists m9_stop_tracking_for_ad_work_lock_trigger on public.ad_works;
create trigger m9_stop_tracking_for_ad_work_lock_trigger
  after update of execution_release_status, execution_overall_status, closure_status on public.ad_works
  for each row
  execute function public.m9_stop_tracking_for_ad_work_lock();

revoke all on function public.set_mobile_location_proof(uuid, boolean, text) from public;
grant execute on function public.set_mobile_location_proof(uuid, boolean, text) to authenticated;

revoke all on function public.driver_get_assigned_work(text, text) from public;
grant execute on function public.driver_get_assigned_work(text, text) to anon;

revoke all on function public.driver_start_mobile_tracking(text, text, uuid, boolean) from public;
grant execute on function public.driver_start_mobile_tracking(text, text, uuid, boolean) to anon;

revoke all on function public.driver_mark_mobile_location_permission_missing(text, text, uuid) from public;
grant execute on function public.driver_mark_mobile_location_permission_missing(text, text, uuid) to anon;

revoke all on function public.driver_record_mobile_location_point(text, text, uuid, numeric, numeric, numeric, numeric, numeric, timestamptz) from public;
grant execute on function public.driver_record_mobile_location_point(text, text, uuid, numeric, numeric, numeric, numeric, numeric, timestamptz) to anon;

revoke all on function public.driver_stop_mobile_tracking(text, text, uuid, text) from public;
grant execute on function public.driver_stop_mobile_tracking(text, text, uuid, text) to anon;

revoke all on function public.admin_stop_mobile_tracking(uuid) from public;
grant execute on function public.admin_stop_mobile_tracking(uuid) to authenticated;