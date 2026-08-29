begin;

select plan(36);

select ok(
  position(
    'assignment.status'
    in lower(pg_get_functiondef(
      'public.driver_mark_mobile_location_permission_missing(text,text,uuid)'::regprocedure
    ))
  ) > 0,
  'Permission-missing RPC qualifies assignment status against its table alias'
);

select ok(
  position(
    'session_row.status'
    in lower(pg_get_functiondef(
      'public.driver_mark_mobile_location_permission_missing(text,text,uuid)'::regprocedure
    ))
  ) > 0,
  'Permission-missing RPC qualifies tracking-session status against its table alias'
);

select ok(
  has_function_privilege(
    'anon',
    'public.driver_mark_mobile_location_permission_missing(text,text,uuid)',
    'EXECUTE'
  ),
  'Anonymous work-code flow can mark location permission missing'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.driver_mark_mobile_location_permission_missing(text,text,uuid)',
    'EXECUTE'
  ),
  'Authenticated role cannot bypass the anonymous work-code boundary'
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.driver_mark_mobile_location_permission_missing(text,text,uuid)',
    'EXECUTE'
  ),
  'Service role is excluded from the phone permission-missing RPC'
);

select ok(
  position(
    'assignment.status'
    in lower(pg_get_functiondef(
      'public.driver_start_mobile_tracking(text,text,uuid,boolean)'::regprocedure
    ))
  ) > 0,
  'Start-tracking RPC qualifies assignment status against its table alias'
);

select ok(
  position(
    'session_row.status'
    in lower(pg_get_functiondef(
      'public.driver_start_mobile_tracking(text,text,uuid,boolean)'::regprocedure
    ))
  ) > 0,
  'Start-tracking RPC qualifies tracking-session status against its table alias'
);

select ok(
  has_function_privilege(
    'anon',
    'public.driver_start_mobile_tracking(text,text,uuid,boolean)',
    'EXECUTE'
  ),
  'Anonymous work-code flow can start phone tracking'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.driver_start_mobile_tracking(text,text,uuid,boolean)',
    'EXECUTE'
  ),
  'Authenticated role cannot bypass the phone start boundary'
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.driver_start_mobile_tracking(text,text,uuid,boolean)',
    'EXECUTE'
  ),
  'Service role is excluded from the phone start RPC'
);

select ok(
  position(
    'on conflict do nothing'
    in lower(pg_get_functiondef(
      'public.driver_record_mobile_location_point(text,text,uuid,numeric,numeric,numeric,numeric,numeric,timestamptz,text)'::regprocedure
    ))
  ) > 0,
  'Point-write idempotency avoids ambiguous TABLE-output conflict targets'
);

select ok(
  position(
    'session_row.point_count'
    in lower(pg_get_functiondef(
      'public.driver_record_mobile_location_point(text,text,uuid,numeric,numeric,numeric,numeric,numeric,timestamptz,text)'::regprocedure
    ))
  ) > 0,
  'Point-write RPC qualifies session counters against their table alias'
);

select ok(
  has_function_privilege(
    'anon',
    'public.driver_record_mobile_location_point(text,text,uuid,numeric,numeric,numeric,numeric,numeric,timestamptz,text)',
    'EXECUTE'
  ),
  'Anonymous work-code flow can record a phone point'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.driver_record_mobile_location_point(text,text,uuid,numeric,numeric,numeric,numeric,numeric,timestamptz,text)',
    'EXECUTE'
  ),
  'Authenticated role cannot bypass the phone point boundary'
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.driver_record_mobile_location_point(text,text,uuid,numeric,numeric,numeric,numeric,numeric,timestamptz,text)',
    'EXECUTE'
  ),
  'Service role is excluded from the phone point RPC'
);

select ok(
  position(
    'session_row.point_count + v_synced_count'
    in lower(pg_get_functiondef(
      'public.driver_sync_mobile_location_points(text,text,uuid,jsonb,integer)'::regprocedure
    ))
  ) > 0,
  'Offline-sync RPC qualifies the persisted point counter against its table alias'
);

select ok(
  position(
    'on conflict do nothing'
    in lower(pg_get_functiondef(
      'public.driver_sync_mobile_location_points(text,text,uuid,jsonb,integer)'::regprocedure
    ))
  ) > 0,
  'Offline-sync idempotency avoids ambiguous TABLE-output conflict targets'
);

select ok(
  has_function_privilege(
    'anon',
    'public.driver_sync_mobile_location_points(text,text,uuid,jsonb,integer)',
    'EXECUTE'
  ),
  'Anonymous work-code flow can sync buffered phone points'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.driver_sync_mobile_location_points(text,text,uuid,jsonb,integer)',
    'EXECUTE'
  ),
  'Authenticated role cannot bypass the phone sync boundary'
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.driver_sync_mobile_location_points(text,text,uuid,jsonb,integer)',
    'EXECUTE'
  ),
  'Service role is excluded from the phone sync RPC'
);

set local role anon;

select throws_ok(
  $$select * from public.driver_sync_mobile_location_points(
      '9000000000',
      'FAKE00',
      '00000000-0000-4000-8000-000000000000',
      (select jsonb_agg('{}'::jsonb) from generate_series(1, 101)),
      101
    )$$,
  '22000',
  'Location sync batch must contain at most 100 points',
  'Offline sync rejects oversized batches before any session or point processing'
);

reset role;

insert into public.drivers (
  id, name, phone, approval_status, onboarding_status
) values (
  '36100000-0000-4000-8000-000000000001',
  'M29 Permission Missing Driver', '9000000136', 'approved', 'approved'
);

insert into public.vehicles (
  id, vehicle_number, vehicle_type, onboarding_status, active
) values (
  '36100000-0000-4000-8000-000000000002',
  'M29-PERMISSION-MISSING', 'van', 'approved', true
);

insert into public.ad_works (
  id, title, start_date, end_date, number_of_days,
  status, planning_status, assignment_status,
  execution_release_status, execution_overall_status,
  closure_status, execution_mode, driver_required, vehicle_required,
  mobile_location_proof_required,
  work_access_code_hash, work_access_code_hint, work_access_code_created_at
) values (
  '36100000-0000-4000-8000-000000000101',
  'Permission missing ambiguity closure',
  current_date, current_date, 1,
  'scheduled', 'planned', 'ready_for_execution',
  'released_to_driver', 'running',
  'not_ready', 'driver_app', true, true,
  true,
  public.m6_hash_work_code('DENY36'), 'NY36', clock_timestamp()
);

insert into public.ad_work_assignments (
  id, ad_work_id, driver_id, vehicle_id, status
) values (
  '36100000-0000-4000-8000-000000000201',
  '36100000-0000-4000-8000-000000000101',
  '36100000-0000-4000-8000-000000000001',
  '36100000-0000-4000-8000-000000000002',
  'ready_for_execution'
);

insert into public.ad_work_days (
  id, ad_work_id, work_date, status, planning_status, execution_status,
  driver_id, vehicle_id
) values (
  '36100000-0000-4000-8000-000000000301',
  '36100000-0000-4000-8000-000000000101',
  current_date, 'scheduled', 'planned', 'running',
  '36100000-0000-4000-8000-000000000001',
  '36100000-0000-4000-8000-000000000002'
);

set local role anon;

select lives_ok(
  $$select * from public.driver_mark_mobile_location_permission_missing(
      '9000000136',
      'DENY36',
      '36100000-0000-4000-8000-000000000301'
    )$$,
  'Physical Android permission denial records a lifecycle state without SQL ambiguity'
);

reset role;

select is(
  (
    select session_row.status::text
    from public.tracking_sessions as session_row
    where session_row.ad_work_day_id = '36100000-0000-4000-8000-000000000301'
    order by session_row.created_at desc
    limit 1
  ),
  'permission_missing',
  'Permission denial leaves the tracking session permission_missing'
);

select is(
  (
    select session_row.stop_reason::text
    from public.tracking_sessions as session_row
    where session_row.ad_work_day_id = '36100000-0000-4000-8000-000000000301'
    order by session_row.created_at desc
    limit 1
  ),
  'permission_removed',
  'Permission denial records the privacy-safe permission_removed reason'
);

select is(
  (
    select session_row.tracking_health_status
    from public.tracking_sessions as session_row
    where session_row.ad_work_day_id = '36100000-0000-4000-8000-000000000301'
    order by session_row.created_at desc
    limit 1
  ),
  'permission_missing',
  'Permission denial keeps tracking health aligned with the permission-missing lifecycle'
);

set local role anon;

select lives_ok(
  $$select * from public.driver_start_mobile_tracking(
      '9000000136',
      'DENY36',
      '36100000-0000-4000-8000-000000000301',
      true
    )$$,
  'Physical Android foreground start creates or resumes a running phone session without SQL ambiguity'
);

reset role;

select is(
  (
    select session_row.status::text
    from public.tracking_sessions as session_row
    where session_row.ad_work_day_id = '36100000-0000-4000-8000-000000000301'
    order by session_row.created_at desc
    limit 1
  ),
  'running',
  'Foreground start leaves the tracking session running'
);

select is(
  (
    select session_row.tracking_health_status
    from public.tracking_sessions as session_row
    where session_row.ad_work_day_id = '36100000-0000-4000-8000-000000000301'
    order by session_row.created_at desc
    limit 1
  ),
  'no_recent_update',
  'Foreground restart clears stale permission-missing health before the first new point'
);

set local role anon;

select lives_ok(
  $$select * from public.driver_record_mobile_location_point(
      '9000000136',
      'DENY36',
      (
        select assigned.mobile_tracking_session_id
        from public.driver_get_assigned_work('9000000136', 'DENY36') as assigned
        limit 1
      ),
      0,
      0,
      5,
      null,
      null,
      clock_timestamp(),
      'm29-synthetic-point-1'
    )$$,
  'Physical Android point write succeeds with bounded synthetic coordinates'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.location_points as point_row
    where point_row.ad_work_day_id = '36100000-0000-4000-8000-000000000301'
  ),
  1,
  'First client point id creates exactly one persisted point'
);

set local role anon;

select lives_ok(
  $$select * from public.driver_record_mobile_location_point(
      '9000000136',
      'DENY36',
      (
        select assigned.mobile_tracking_session_id
        from public.driver_get_assigned_work('9000000136', 'DENY36') as assigned
        limit 1
      ),
      0,
      0,
      5,
      null,
      null,
      clock_timestamp(),
      'm29-synthetic-point-1'
    )$$,
  'Retrying the same client point id succeeds idempotently'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.location_points as point_row
    where point_row.ad_work_day_id = '36100000-0000-4000-8000-000000000301'
  ),
  1,
  'Duplicate client point id does not create a second persisted point'
);

set local role anon;

select is(
  (
    select sync_result.synced_count
    from public.driver_sync_mobile_location_points(
      '9000000136',
      'DENY36',
      (
        select assigned.mobile_tracking_session_id
        from public.driver_get_assigned_work('9000000136', 'DENY36') as assigned
        limit 1
      ),
      jsonb_build_array(jsonb_build_object(
        'local_id', 'm29-synthetic-offline-1',
        'client_point_id', 'm29-synthetic-offline-1',
        'tracking_session_id', (
          select assigned.mobile_tracking_session_id
          from public.driver_get_assigned_work('9000000136', 'DENY36') as assigned
          limit 1
        ),
        'ad_work_id', '36100000-0000-4000-8000-000000000101',
        'ad_work_day_id', '36100000-0000-4000-8000-000000000301',
        'assignment_id', '36100000-0000-4000-8000-000000000201',
        'driver_id', '36100000-0000-4000-8000-000000000001',
        'vehicle_id', '36100000-0000-4000-8000-000000000002',
        'latitude', 0,
        'longitude', 0,
        'accuracy', 5,
        'speed', null,
        'heading', null,
        'captured_at', clock_timestamp(),
        'sync_status', 'pending',
        'retry_count', 0,
        'last_sync_attempt_at', null
      )),
      1
    ) as sync_result
  ),
  1,
  'First buffered client point is accepted by the offline-sync RPC'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.location_points as point_row
    where point_row.ad_work_day_id = '36100000-0000-4000-8000-000000000301'
  ),
  2,
  'Offline sync creates exactly one additional persisted point'
);

set local role anon;

select is(
  (
    select sync_result.duplicate_count
    from public.driver_sync_mobile_location_points(
      '9000000136',
      'DENY36',
      (
        select assigned.mobile_tracking_session_id
        from public.driver_get_assigned_work('9000000136', 'DENY36') as assigned
        limit 1
      ),
      jsonb_build_array(jsonb_build_object(
        'local_id', 'm29-synthetic-offline-1',
        'client_point_id', 'm29-synthetic-offline-1',
        'tracking_session_id', (
          select assigned.mobile_tracking_session_id
          from public.driver_get_assigned_work('9000000136', 'DENY36') as assigned
          limit 1
        ),
        'ad_work_id', '36100000-0000-4000-8000-000000000101',
        'ad_work_day_id', '36100000-0000-4000-8000-000000000301',
        'assignment_id', '36100000-0000-4000-8000-000000000201',
        'driver_id', '36100000-0000-4000-8000-000000000001',
        'vehicle_id', '36100000-0000-4000-8000-000000000002',
        'latitude', 0,
        'longitude', 0,
        'accuracy', 5,
        'speed', null,
        'heading', null,
        'captured_at', clock_timestamp(),
        'sync_status', 'sync_failed',
        'retry_count', 1,
        'last_sync_attempt_at', clock_timestamp()
      )),
      1
    ) as sync_result
  ),
  1,
  'Retrying the same buffered client point is reported as a duplicate'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.location_points as point_row
    where point_row.ad_work_day_id = '36100000-0000-4000-8000-000000000301'
  ),
  2,
  'Duplicate offline retry does not create another persisted point'
);

select * from finish();

rollback;
