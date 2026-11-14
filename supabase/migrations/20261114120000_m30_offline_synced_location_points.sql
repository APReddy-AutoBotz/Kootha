-- M30: mark phone points that arrive from the driver's offline buffer.
--
-- The phone test on 14 Nov 2026 found that points synced from the offline
-- buffer were stored with offline_synced = false, so admin could not tell them
-- apart from live points. driver_sync_mobile_location_points is the only path
-- for buffered points (live points use driver_record_mobile_location_point),
-- so it now sets offline_synced = true on insert.
--
-- The function is otherwise copied unchanged from
-- 20260823154500_m29_phone_permission_missing_rpc_ambiguity_closure.sql.
-- driver_sync_mobile_location_points_v2 calls it and needs no change.
set search_path = public;

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
        or length(v_client_point_id) > 96
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
        or v_lng > 180
        or v_captured_at > now() + interval '5 minutes'
        or (
          v_day.execution_started_at is not null
          and v_captured_at < v_day.execution_started_at
        ) then
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
        quality,
        offline_synced
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
        v_quality,
        true
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
