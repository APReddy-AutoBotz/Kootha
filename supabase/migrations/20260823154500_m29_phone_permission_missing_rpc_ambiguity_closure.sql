-- M29 physical Android closure: the TABLE-returning output column named
-- `status` is also a PL/pgSQL variable. Qualify every table column in the
-- start and permission-denied paths so they cannot fail with SQLSTATE 42702
-- before recording their privacy-safe lifecycle state.
set search_path = public;

create or replace function public.driver_start_mobile_tracking(
  p_mobile text,
  p_work_code text,
  p_ad_work_day_id uuid,
  p_driver_consent boolean
)
returns table(tracking_session_id uuid, status text, point_count integer, result_message text)
language plpgsql
security definer
set search_path = pg_catalog, public
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
  from public.ad_works as aw
  join public.ad_work_assignments as assignment
    on assignment.ad_work_id = aw.id
  join public.drivers as driver_record
    on driver_record.id = assignment.driver_id
  where aw.execution_release_status = 'released_to_driver'
    and aw.work_access_code_hash = public.m6_hash_work_code(p_work_code)
    and public.m6_normalize_mobile(driver_record.phone) = public.m6_normalize_mobile(p_mobile)
    and assignment.status = 'ready_for_execution'
  limit 1;

  if not found then
    raise exception 'Invalid work code or mobile number' using errcode = '42501';
  end if;

  select assignment.* into v_assignment
  from public.ad_work_assignments as assignment
  where assignment.ad_work_id = v_ad_work.id
    and assignment.status = 'ready_for_execution';

  select driver_record.* into v_driver
  from public.drivers as driver_record
  where driver_record.id = v_assignment.driver_id;

  select day_row.* into v_day
  from public.ad_work_days as day_row
  where day_row.id = p_ad_work_day_id
    and day_row.ad_work_id = v_ad_work.id
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

  select session_row.* into v_session
  from public.tracking_sessions as session_row
  where session_row.ad_work_id = v_ad_work.id
    and session_row.ad_work_day_id = v_day.id
    and session_row.driver_id = v_assignment.driver_id
    and session_row.tracking_mode = 'phone_location'
    and session_row.status in ('not_started', 'running', 'paused', 'failed', 'permission_missing')
  order by session_row.updated_at desc, session_row.created_at desc
  limit 1
  for update;

  if found then
    update public.tracking_sessions as session_row
    set status = 'running',
        started_at = coalesce(session_row.started_at, now()),
        ended_at = null,
        stopped_by = null,
        stop_reason = null,
        quality_status = case
          when session_row.point_count > 0 then session_row.quality_status
          else 'unknown'::public.location_quality
        end,
        updated_at = now()
    where session_row.id = v_session.id
    returning session_row.id into v_session_id;
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
  select session_row.id,
         session_row.status::text,
         session_row.point_count,
         'Location Proof Running.'::text
  from public.tracking_sessions as session_row
  where session_row.id = v_session_id;
end;
$$;

revoke all on function public.driver_start_mobile_tracking(
  text, text, uuid, boolean
) from public, anon, authenticated, service_role;

grant execute on function public.driver_start_mobile_tracking(
  text, text, uuid, boolean
) to anon;

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
returns table(
  tracking_session_id uuid,
  point_count integer,
  quality_status text,
  tracking_health_status text,
  client_point_id text,
  result_message text
)
language plpgsql
security definer
set search_path = pg_catalog, public
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
  if p_lat is null or p_lng is null
    or p_lat < -90 or p_lat > 90
    or p_lng < -180 or p_lng > 180 then
    raise exception 'Location point is invalid' using errcode = '22000';
  end if;

  select session_row.* into v_session
  from public.tracking_sessions as session_row
  where session_row.id = p_tracking_session_id
  for update;

  if not found then
    raise exception 'Location Proof session not found' using errcode = 'P0002';
  end if;

  select aw.* into v_ad_work
  from public.ad_works as aw
  where aw.id = v_session.ad_work_id;

  select day_row.* into v_day
  from public.ad_work_days as day_row
  where day_row.id = v_session.ad_work_day_id;

  select assignment.* into v_assignment
  from public.ad_work_assignments as assignment
  where assignment.id = v_session.assignment_id;

  select driver_record.* into v_driver
  from public.drivers as driver_record
  where driver_record.id = v_session.driver_id;

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
  ) on conflict do nothing
  returning id into v_inserted_id;

  update public.tracking_sessions as session_row
  set point_count = session_row.point_count + case when v_inserted_id is null then 0 else 1 end,
      last_update_at = case when v_inserted_id is null then session_row.last_update_at else now() end,
      client_last_capture_at = greatest(
        coalesce(session_row.client_last_capture_at, '-infinity'::timestamptz),
        coalesce(p_captured_at, now())
      ),
      last_successful_sync_at = now(),
      last_sync_attempt_at = now(),
      client_pending_point_count = 0,
      sync_failure_count = 0,
      sync_error_message = null,
      quality_status = case when v_inserted_id is null then session_row.quality_status else v_quality end,
      tracking_health_status = 'healthy',
      updated_at = now()
  where session_row.id = v_session.id;

  return query
  select session_row.id,
         session_row.point_count,
         session_row.quality_status::text,
         session_row.tracking_health_status,
         v_client_point_id,
         case
           when v_inserted_id is null then 'Location update already saved.'
           else 'Location update saved.'
         end
  from public.tracking_sessions as session_row
  where session_row.id = v_session.id;
end;
$$;

revoke all on function public.driver_record_mobile_location_point(
  text, text, uuid, numeric, numeric, numeric, numeric, numeric, timestamptz, text
) from public, anon, authenticated, service_role;

grant execute on function public.driver_record_mobile_location_point(
  text, text, uuid, numeric, numeric, numeric, numeric, numeric, timestamptz, text
) to anon;

create or replace function public.driver_mark_mobile_location_permission_missing(
  p_mobile text,
  p_work_code text,
  p_ad_work_day_id uuid
)
returns table(tracking_session_id uuid, status text, result_message text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ad_work public.ad_works%rowtype;
  v_assignment public.ad_work_assignments%rowtype;
  v_day public.ad_work_days%rowtype;
  v_session_id uuid;
begin
  select aw.* into v_ad_work
  from public.ad_works as aw
  join public.ad_work_assignments as assignment
    on assignment.ad_work_id = aw.id
  join public.drivers as driver_record
    on driver_record.id = assignment.driver_id
  where aw.execution_release_status = 'released_to_driver'
    and aw.work_access_code_hash = public.m6_hash_work_code(p_work_code)
    and public.m6_normalize_mobile(driver_record.phone) = public.m6_normalize_mobile(p_mobile)
    and assignment.status = 'ready_for_execution'
  limit 1;

  if not found then
    raise exception 'Invalid work code or mobile number' using errcode = '42501';
  end if;

  select assignment.* into v_assignment
  from public.ad_work_assignments as assignment
  where assignment.ad_work_id = v_ad_work.id
    and assignment.status = 'ready_for_execution';

  select day_row.* into v_day
  from public.ad_work_days as day_row
  where day_row.id = p_ad_work_day_id
    and day_row.ad_work_id = v_ad_work.id;

  if not found then
    raise exception 'Work day not found' using errcode = 'P0002';
  end if;

  if coalesce(v_ad_work.mobile_location_proof_required, false) is false
    or v_day.execution_status <> 'running' then
    raise exception 'Location Permission Needed only during active assigned work' using errcode = '22000';
  end if;

  select session_row.id into v_session_id
  from public.tracking_sessions as session_row
  where session_row.ad_work_id = v_ad_work.id
    and session_row.ad_work_day_id = v_day.id
    and session_row.driver_id = v_assignment.driver_id
    and session_row.tracking_mode = 'phone_location'
    and session_row.status in ('not_started', 'running', 'paused', 'failed', 'permission_missing')
  order by session_row.updated_at desc, session_row.created_at desc
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
    update public.tracking_sessions as session_row
    set status = 'permission_missing',
        stopped_by = 'driver',
        stop_reason = 'permission_removed',
        ended_at = now(),
        updated_at = now()
    where session_row.id = v_session_id;
  end if;

  return query
  select v_session_id,
         'permission_missing'::text,
         'Location Permission Needed.'::text;
end;
$$;

revoke all on function public.driver_mark_mobile_location_permission_missing(
  text, text, uuid
) from public, anon, authenticated, service_role;

grant execute on function public.driver_mark_mobile_location_permission_missing(
  text, text, uuid
) to anon;

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
set search_path = pg_catalog, public
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

  select session_row.* into v_session
  from public.tracking_sessions as session_row
  where session_row.id = p_tracking_session_id
  for update;

  if not found then
    raise exception 'Location Proof session not found' using errcode = 'P0002';
  end if;

  select aw.* into v_ad_work
  from public.ad_works as aw
  where aw.id = v_session.ad_work_id;

  select day_row.* into v_day
  from public.ad_work_days as day_row
  where day_row.id = v_session.ad_work_day_id;

  select assignment.* into v_assignment
  from public.ad_work_assignments as assignment
  where assignment.id = v_session.assignment_id;

  select driver_record.* into v_driver
  from public.drivers as driver_record
  where driver_record.id = v_session.driver_id;

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

  if coalesce(v_ad_work.execution_overall_status, 'not_started') = 'cancelled'
    or coalesce(v_ad_work.closure_status, 'not_ready') = 'cancelled' then
    raise exception 'Location sync is not available for cancelled work' using errcode = '22000';
  end if;

  for v_point in
    select point_value.value
    from jsonb_array_elements(coalesce(p_points, '[]'::jsonb)) as point_value(value)
  loop
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
        or v_lat is null
        or v_lng is null
        or v_lat < -90
        or v_lat > 90
        or v_lng < -180
        or v_lng > 180 then
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
      ) on conflict do nothing
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

  v_remaining_pending := greatest(
    coalesce(p_client_pending_count, 0) - coalesce(array_length(v_accepted_ids, 1), 0),
    0
  );
  v_health := case
    when v_failed_count > 0 then 'sync_failed'
    when v_remaining_pending > 0 then 'sync_pending'
    else public.m10_tracking_health_status(v_session.status, v_remaining_pending, now(), 0)
  end;

  update public.tracking_sessions as session_row
  set point_count = session_row.point_count + v_synced_count,
      last_update_at = case when v_synced_count > 0 then now() else session_row.last_update_at end,
      client_last_capture_at = case
        when v_last_capture is null then session_row.client_last_capture_at
        else greatest(coalesce(session_row.client_last_capture_at, v_last_capture), v_last_capture)
      end,
      last_successful_sync_at = case
        when v_synced_count + v_duplicate_count > 0 then now()
        else session_row.last_successful_sync_at
      end,
      last_sync_attempt_at = now(),
      client_pending_point_count = v_remaining_pending,
      sync_failure_count = case
        when v_failed_count > 0 then session_row.sync_failure_count + v_failed_count
        else 0
      end,
      sync_error_message = case
        when v_failed_count > 0 then 'Some offline points could not sync.'
        else null
      end,
      tracking_health_status = v_health,
      updated_at = now()
  where session_row.id = v_session.id;

  return query
  select session_row.id,
         v_synced_count,
         v_duplicate_count,
         v_failed_count,
         v_accepted_ids,
         session_row.point_count,
         session_row.tracking_health_status,
         session_row.last_successful_sync_at,
         case
           when v_failed_count > 0 then 'Sync Failed.'
           when v_synced_count + v_duplicate_count > 0 then 'Location Synced.'
           else 'No pending points to sync.'
         end
  from public.tracking_sessions as session_row
  where session_row.id = v_session.id;
end;
$$;

revoke all on function public.driver_sync_mobile_location_points(
  text, text, uuid, jsonb, integer
) from public, anon, authenticated, service_role;

grant execute on function public.driver_sync_mobile_location_points(
  text, text, uuid, jsonb, integer
) to anon;
