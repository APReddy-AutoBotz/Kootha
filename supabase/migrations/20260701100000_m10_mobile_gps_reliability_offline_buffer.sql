alter table public.tracking_sessions
  add column if not exists tracking_health_status text not null default 'stopped',
  add column if not exists client_pending_point_count integer not null default 0,
  add column if not exists client_last_capture_at timestamptz,
  add column if not exists last_successful_sync_at timestamptz,
  add column if not exists last_sync_attempt_at timestamptz,
  add column if not exists sync_failure_count integer not null default 0,
  add column if not exists sync_error_message text;

alter table public.location_points
  add column if not exists client_point_id text;

create unique index if not exists location_points_session_client_point_idx
  on public.location_points(tracking_session_id, client_point_id);

create index if not exists tracking_sessions_health_status_idx
  on public.tracking_sessions(ad_work_id, tracking_health_status, updated_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tracking_sessions_m10_health_status_check'
  ) then
    alter table public.tracking_sessions
      add constraint tracking_sessions_m10_health_status_check
      check (tracking_health_status in ('healthy', 'no_recent_update', 'permission_missing', 'offline_saving', 'sync_pending', 'sync_failed', 'stopped'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'tracking_sessions_m10_client_pending_check'
  ) then
    alter table public.tracking_sessions
      add constraint tracking_sessions_m10_client_pending_check
      check (client_pending_point_count >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'tracking_sessions_m10_sync_failure_check'
  ) then
    alter table public.tracking_sessions
      add constraint tracking_sessions_m10_sync_failure_check
      check (sync_failure_count >= 0);
  end if;
end $$;

alter table public.tracking_sessions enable row level security;
alter table public.location_points enable row level security;

create or replace function public.m10_tracking_health_status(
  p_status public.tracking_session_status,
  p_pending_count integer,
  p_last_update_at timestamptz,
  p_sync_failure_count integer
)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when p_status = 'permission_missing' then 'permission_missing'
    when p_status in ('stopped', 'completed') then 'stopped'
    when coalesce(p_sync_failure_count, 0) > 0 then 'sync_failed'
    when coalesce(p_pending_count, 0) > 0 then 'sync_pending'
    when p_status = 'running' and (p_last_update_at is null or p_last_update_at < now() - interval '15 minutes') then 'no_recent_update'
    when p_status = 'running' then 'healthy'
    when p_status = 'paused' then 'stopped'
    else 'stopped'
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
  assignment_id uuid,
  driver_id uuid,
  vehicle_id uuid,
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
  mobile_last_location_update_at timestamptz,
  mobile_tracking_health_status text,
  mobile_pending_point_count integer,
  mobile_last_successful_sync_at timestamptz,
  mobile_last_capture_at timestamptz
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
    assignment.id,
    assignment.driver_id,
    assignment.vehicle_id,
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
    session_row.last_update_at,
    coalesce(session_row.tracking_health_status, public.m10_tracking_health_status(session_row.status, session_row.client_pending_point_count, session_row.last_update_at, session_row.sync_failure_count), 'stopped'),
    coalesce(session_row.client_pending_point_count, 0),
    session_row.last_successful_sync_at,
    session_row.client_last_capture_at
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

drop function if exists public.driver_record_mobile_location_point(text, text, uuid, numeric, numeric, numeric, numeric, numeric, timestamptz);
create or replace function public.driver_record_mobile_location_point(
  p_mobile text,
  p_work_code text,
  p_tracking_session_id uuid,
  p_lat numeric,
  p_lng numeric,
  p_accuracy numeric default null,
  p_speed numeric default null,
  p_heading numeric default null,
  p_captured_at timestamptz default null,
  p_client_point_id text default null
)
returns table(tracking_session_id uuid, point_count integer, quality_status text, tracking_health_status text, client_point_id text, result_message text)
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
  v_client_point_id text := nullif(trim(coalesce(p_client_point_id, '')), '');
  v_inserted_id uuid;
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
    client_point_id,
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
    v_client_point_id,
    'phone',
    coalesce(p_captured_at, now()),
    p_lat,
    p_lng,
    p_accuracy,
    p_speed,
    p_heading,
    v_quality
  ) on conflict (tracking_session_id, client_point_id) do nothing
  returning id into v_inserted_id;

  update public.tracking_sessions
  set point_count = point_count + case when v_inserted_id is null then 0 else 1 end,
      last_update_at = case when v_inserted_id is null then last_update_at else now() end,
      client_last_capture_at = greatest(coalesce(client_last_capture_at, '-infinity'::timestamptz), coalesce(p_captured_at, now())),
      last_successful_sync_at = now(),
      last_sync_attempt_at = now(),
      client_pending_point_count = 0,
      sync_failure_count = 0,
      sync_error_message = null,
      quality_status = case when v_inserted_id is null then quality_status else v_quality end,
      tracking_health_status = 'healthy',
      updated_at = now()
  where id = v_session.id;

  return query
  select tracking.id, tracking.point_count, tracking.quality_status::text, tracking.tracking_health_status, v_client_point_id, case when v_inserted_id is null then 'Location update already saved.' else 'Location update saved.' end
  from public.tracking_sessions tracking
  where tracking.id = v_session.id;
end;
$$;

create or replace function public.driver_sync_mobile_location_points(
  p_mobile text,
  p_work_code text,
  p_tracking_session_id uuid,
  p_points jsonb,
  p_client_pending_count integer default 0
)
returns table(
  tracking_session_id uuid,
  synced_count integer,
  duplicate_count integer,
  failed_count integer,
  accepted_client_point_ids text[],
  point_count integer,
  tracking_health_status text,
  last_successful_sync_at timestamptz,
  result_message text
)
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
  v_point jsonb;
  v_client_point_id text;
  v_ad_work_id uuid;
  v_day_id uuid;
  v_assignment_id uuid;
  v_driver_id uuid;
  v_vehicle_id uuid;
  v_lat numeric;
  v_lng numeric;
  v_accuracy numeric;
  v_speed numeric;
  v_heading numeric;
  v_captured_at timestamptz;
  v_quality public.location_quality;
  v_inserted_id uuid;
  v_synced_count integer := 0;
  v_duplicate_count integer := 0;
  v_failed_count integer := 0;
  v_accepted_ids text[] := '{}';
  v_remaining_pending integer := 0;
  v_last_capture timestamptz;
  v_health text;
begin
  if jsonb_typeof(coalesce(p_points, '[]'::jsonb)) <> 'array' then
    raise exception 'Location points payload must be an array' using errcode = '22000';
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
    or v_assignment.status <> 'ready_for_execution'
    or v_session.tracking_mode <> 'phone_location' then
    raise exception 'Invalid work code or mobile number' using errcode = '42501';
  end if;

  if coalesce(v_ad_work.mobile_location_proof_required, false) is false then
    raise exception 'Phone Location Proof is not required for this work' using errcode = '22000';
  end if;

  if coalesce(v_ad_work.execution_overall_status, 'not_started') = 'cancelled' then
    raise exception 'Location sync is not available for cancelled work' using errcode = '22000';
  end if;

  if coalesce(v_ad_work.closure_status, 'not_ready') = 'cancelled' then
    raise exception 'Location sync is not available for cancelled work' using errcode = '22000';
  end if;

  for v_point in select value from jsonb_array_elements(coalesce(p_points, '[]'::jsonb)) loop
    begin
      v_client_point_id := nullif(trim(coalesce(v_point->>'client_point_id', v_point->>'local_id', '')), '');
      v_ad_work_id := (v_point->>'ad_work_id')::uuid;
      v_day_id := (v_point->>'ad_work_day_id')::uuid;
      v_assignment_id := (v_point->>'assignment_id')::uuid;
      v_driver_id := (v_point->>'driver_id')::uuid;
      v_vehicle_id := nullif(v_point->>'vehicle_id', '')::uuid;
      v_lat := (v_point->>'latitude')::numeric;
      v_lng := (v_point->>'longitude')::numeric;
      v_accuracy := nullif(v_point->>'accuracy', '')::numeric;
      v_speed := nullif(v_point->>'speed', '')::numeric;
      v_heading := nullif(v_point->>'heading', '')::numeric;
      v_captured_at := coalesce(nullif(v_point->>'captured_at', '')::timestamptz, now());

      if v_client_point_id is null
        or v_ad_work_id <> v_ad_work.id
        or v_day_id <> v_day.id
        or v_assignment_id <> v_assignment.id
        or v_driver_id <> v_assignment.driver_id
        or v_vehicle_id is distinct from v_assignment.vehicle_id
        or v_lat is null or v_lng is null or v_lat < -90 or v_lat > 90 or v_lng < -180 or v_lng > 180 then
        v_failed_count := v_failed_count + 1;
        continue;
      end if;

      if v_day.execution_status = 'running' then
        if v_session.status <> 'running' then
          v_failed_count := v_failed_count + 1;
          continue;
        end if;
      elsif v_day.execution_status in ('completed', 'issue_reported') then
        if v_day.execution_completed_at is null or v_captured_at > v_day.execution_completed_at then
          v_failed_count := v_failed_count + 1;
          continue;
        end if;
      else
        v_failed_count := v_failed_count + 1;
        continue;
      end if;

      v_quality := public.m9_quality_from_accuracy(v_accuracy);
      v_inserted_id := null;

      insert into public.location_points (
        tracking_session_id,
        ad_work_id,
        ad_work_day_id,
        assignment_id,
        driver_id,
        vehicle_id,
        client_point_id,
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
        v_client_point_id,
        'phone',
        v_captured_at,
        v_lat,
        v_lng,
        v_accuracy,
        v_speed,
        v_heading,
        v_quality
      ) on conflict (tracking_session_id, client_point_id) do nothing
      returning id into v_inserted_id;

      if v_inserted_id is null then
        v_duplicate_count := v_duplicate_count + 1;
      else
        v_synced_count := v_synced_count + 1;
      end if;

      v_accepted_ids := array_append(v_accepted_ids, v_client_point_id);
      v_last_capture := greatest(coalesce(v_last_capture, '-infinity'::timestamptz), v_captured_at);
    exception when others then
      v_failed_count := v_failed_count + 1;
    end;
  end loop;

  v_remaining_pending := greatest(coalesce(p_client_pending_count, 0) - coalesce(array_length(v_accepted_ids, 1), 0), 0);
  v_health := case
    when v_failed_count > 0 then 'sync_failed'
    when v_remaining_pending > 0 then 'sync_pending'
    else public.m10_tracking_health_status(v_session.status, v_remaining_pending, now(), 0)
  end;

  update public.tracking_sessions
  set point_count = point_count + v_synced_count,
      last_update_at = case when v_synced_count > 0 then now() else last_update_at end,
      client_last_capture_at = case when v_last_capture is null then client_last_capture_at else greatest(coalesce(client_last_capture_at, v_last_capture), v_last_capture) end,
      last_successful_sync_at = case when v_synced_count + v_duplicate_count > 0 then now() else last_successful_sync_at end,
      last_sync_attempt_at = now(),
      client_pending_point_count = v_remaining_pending,
      sync_failure_count = case when v_failed_count > 0 then sync_failure_count + v_failed_count else 0 end,
      sync_error_message = case when v_failed_count > 0 then 'Some offline points could not sync.' else null end,
      tracking_health_status = v_health,
      updated_at = now()
  where id = v_session.id;

  return query
  select tracking.id,
         v_synced_count,
         v_duplicate_count,
         v_failed_count,
         v_accepted_ids,
         tracking.point_count,
         tracking.tracking_health_status,
         tracking.last_successful_sync_at,
         case
           when v_failed_count > 0 then 'Sync Failed.'
           when v_synced_count + v_duplicate_count > 0 then 'Location Synced.'
           else 'No pending points to sync.'
         end
  from public.tracking_sessions tracking
  where tracking.id = v_session.id;
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
        tracking_health_status = case when client_pending_point_count > 0 then 'sync_pending' else 'stopped' end,
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
        tracking_health_status = case when client_pending_point_count > 0 then 'sync_pending' else 'stopped' end,
        updated_at = now()
    where ad_work_day_id = new.id
      and tracking_mode = 'phone_location'
      and status in ('not_started', 'running', 'paused', 'failed', 'permission_missing');
  end if;

  return new;
end;
$$;

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
        tracking_health_status = case when client_pending_point_count > 0 then 'sync_pending' else 'stopped' end,
        updated_at = now()
    where ad_work_id = new.id
      and tracking_mode = 'phone_location'
      and status in ('not_started', 'running', 'paused', 'failed', 'permission_missing');
  end if;

  return new;
end;
$$;

update public.tracking_sessions
set tracking_health_status = public.m10_tracking_health_status(status, client_pending_point_count, last_update_at, sync_failure_count)
where tracking_mode = 'phone_location';

revoke all on function public.m10_tracking_health_status(public.tracking_session_status, integer, timestamptz, integer) from public;
grant execute on function public.m10_tracking_health_status(public.tracking_session_status, integer, timestamptz, integer) to authenticated, anon;

revoke all on function public.driver_get_assigned_work(text, text) from public;
grant execute on function public.driver_get_assigned_work(text, text) to anon;

revoke all on function public.driver_record_mobile_location_point(text, text, uuid, numeric, numeric, numeric, numeric, numeric, timestamptz, text) from public;
grant execute on function public.driver_record_mobile_location_point(text, text, uuid, numeric, numeric, numeric, numeric, numeric, timestamptz, text) to anon;

revoke all on function public.driver_sync_mobile_location_points(text, text, uuid, jsonb, integer) from public;
grant execute on function public.driver_sync_mobile_location_points(text, text, uuid, jsonb, integer) to anon;