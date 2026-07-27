begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

select has_table('public', 'telemetry_receipts', 'receipt table exists');
select has_table('public', 'telemetry_stream_state', 'stream state exists');
select has_table('public', 'telemetry_identity_conflicts', 'safe conflict evidence exists');
select has_table('public', 'telemetry_sensor_observations', 'typed observations exist');
select has_table('public', 'm21_rate_limit_buckets', 'database rate buckets exist');
select has_table('public', 'm21_rate_limit_reservations', 'exact pre-auth reservations exist');
select has_table('public', 'm21_assignment_history', 'assignment history exists');
select has_table('public', 'm21_release_history', 'release history exists');
select has_table('public', 'm21_execution_history', 'execution history exists');

select ok(
  not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'telemetry_receipts', 'telemetry_stream_state',
        'telemetry_identity_conflicts', 'telemetry_sensor_observations',
        'm21_rate_limit_buckets', 'm21_assignment_history',
        'm21_rate_limit_reservations',
        'm21_release_history', 'm21_execution_history'
      )
      and not c.relrowsecurity
  ),
  'RLS is immediate on all M21 evidence/state tables'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.m21_reserve_unauthenticated_rate_limit(text,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.m21_reserve_unauthenticated_rate_limit(text,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.m21_consume_authenticated_rate_limits(text,text,integer,integer,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.m21_consume_authenticated_rate_limits(text,text,integer,integer,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.m21_mark_credential_verified(uuid,timestamptz,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.m21_mark_credential_verified(uuid,timestamptz,uuid)',
    'EXECUTE'
  ),
  'clients cannot call rate-limit or reservation-refund RPCs'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.m21_lookup_device_credential(text,text,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.m21_lookup_device_credential(text,text,timestamptz)',
    'EXECUTE'
  ),
  'clients cannot call credential lookup'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.m21_persist_telemetry_event(uuid,text,text,text,text,text,text,text,bigint,timestamptz,timestamptz,timestamptz,numeric,numeric,numeric,numeric,numeric,numeric,integer,boolean,numeric,boolean,text,text,numeric,jsonb,text,text,boolean,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.m21_persist_telemetry_event(uuid,text,text,text,text,text,text,text,bigint,timestamptz,timestamptz,timestamptz,numeric,numeric,numeric,numeric,numeric,numeric,integer,boolean,numeric,boolean,text,text,numeric,jsonb,text,text,boolean,text)',
    'EXECUTE'
  ),
  'atomic persistence RPC is service-only'
);

select is(
  (select request_limit from public.m21_rate_limit_policies
   where policy_version = 'm21-pilot-v1' and scope = 'device'),
  120,
  'provisional per-device request limit is versioned'
);
select is(
  (select event_limit from public.m21_rate_limit_policies
   where policy_version = 'm21-pilot-v1' and scope = 'global'),
  12000,
  'provisional global event limit supports bounded burst traffic'
);

select is(
  (select allowed from public.m21_consume_authenticated_rate_limits(
    repeat('a', 64), repeat('b', 64), 1, 100, '2030-01-01T00:00:00Z'
  )),
  true,
  'first bounded device batch is allowed'
);
select is(
  (select allowed from public.m21_consume_authenticated_rate_limits(
    repeat('a', 64), repeat('b', 64), 1, 100, '2030-01-01T00:00:00Z'
  )),
  true,
  'authenticated device/global bucket update is deterministic'
);
select throws_ok(
  $$select * from public.m21_consume_authenticated_rate_limits(
    'raw-id-is-not-allowed', repeat('b', 64), 1, 0, clock_timestamp()
  )$$,
  '22023',
  'Invalid rate-limit input',
  'raw identifiers cannot enter rate-limit storage'
);
select is(
  to_regprocedure('public.m21_consume_rate_limit(text,text,integer,timestamptz)'),
  null::regprocedure,
  'obsolete post-work limiter RPC no longer exists'
);
select ok(
  (
    select count(*) = 4 from pg_trigger
    where tgname in (
      'm21_lock_device_vehicle_authority', 'm21_lock_assignment_authority',
      'm21_lock_release_authority', 'm21_lock_execution_authority'
    )
      and not tgisinternal
      and (tgtype::integer & 1) = 0
      and (tgtype::integer & 2) = 2
  ),
  'all authority transitions acquire a BEFORE STATEMENT serialization lock'
);
select ok(
  position(
    'hashtextextended(''m21-authority-global'', 2100)'
    in pg_get_functiondef(
      'public.m21_lock_authority_transition()'::regprocedure
    )
  ) > 0
  and position(
    'hashtextextended(''m21-authority-global'', 2100)'
    in pg_get_functiondef(
      'public.m21_persist_telemetry_event(uuid,text,text,text,text,text,text,text,bigint,timestamptz,timestamptz,timestamptz,numeric,numeric,numeric,numeric,numeric,numeric,integer,boolean,numeric,boolean,text,text,numeric,jsonb,text,text,boolean,text)'::regprocedure
    )
  ) > 0,
  'transition and ingestion paths use the identical authority lock namespace'
);

insert into public.drivers (
  id, name, phone, approval_status, onboarding_status
) values (
  '21000000-0000-0000-0000-000000000001',
  'Synthetic M21 Driver', '9000000021', 'approved', 'approved'
);
insert into public.vehicles (
  id, vehicle_number, vehicle_type, onboarding_status, active
) values (
  '21000000-0000-0000-0000-000000000002',
  'M21-SYNTHETIC-VEHICLE', 'van', 'approved', true
);
insert into public.user_profiles (auth_user_id, display_name, role)
values (
  '21000000-0000-0000-0000-000000000003', 'M21 SQL Admin', 'admin'
);
insert into public.gps_devices (
  id, device_code, vendor, model, adapter_type, protocol_type,
  status, installation_state, gps_readiness, gsm_readiness
) values (
  '21000000-0000-0000-0000-000000000004',
  'M21-SYNTHETIC-DEVICE', 'Synthetic', 'M21', 'generic_http', 'https',
  'active', 'installed', 'ready', 'ready'
);
insert into public.gps_device_vehicle_links (
  gps_device_id, vehicle_id, effective_from, change_reason, created_by_admin
) values (
  '21000000-0000-0000-0000-000000000004',
  '21000000-0000-0000-0000-000000000002',
  clock_timestamp() - interval '1 minute', 'synthetic M21 fixture',
  '21000000-0000-0000-0000-000000000003'
);
insert into public.gps_device_credential_metadata (
  id, gps_device_id, credential_key_id, status, verification_material_hash,
  issued_at, expires_at, created_by_admin
) values (
  '21000000-0000-0000-0000-000000000005',
  '21000000-0000-0000-0000-000000000004',
  'm21-synthetic-key', 'active', repeat('b', 64),
  clock_timestamp() - interval '1 minute',
  clock_timestamp() + interval '1 day',
  '21000000-0000-0000-0000-000000000003'
);
insert into public.ad_works (id, title)
values ('21000000-0000-0000-0000-000000000006', 'Synthetic M21 Work');
insert into public.ad_work_assignments (
  id, ad_work_id, driver_id, vehicle_id, status
) values (
  '21000000-0000-0000-0000-000000000007',
  '21000000-0000-0000-0000-000000000006',
  '21000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000002',
  'ready_for_execution'
);
insert into public.ad_work_days (id, ad_work_id, work_date)
values (
  '21000000-0000-0000-0000-000000000008',
  '21000000-0000-0000-0000-000000000006',
  current_date
);

update public.ad_works
set execution_release_status = 'released_to_driver',
    work_access_code_created_at = clock_timestamp()
where id = '21000000-0000-0000-0000-000000000006';
update public.ad_work_days
set execution_status = 'running',
    execution_started_at = clock_timestamp(),
    execution_updated_at = clock_timestamp()
where id = '21000000-0000-0000-0000-000000000008';

create temp table m21_admitted_reservation as
select *
from public.m21_reserve_unauthenticated_rate_limit(
  repeat('c', 64), clock_timestamp()
);

select ok(
  (select allowed and reservation_id is not null
   from m21_admitted_reservation),
  'admitted pre-auth request receives an exact one-shot reservation'
);
select is(
  public.m21_mark_credential_verified(
    '21000000-0000-0000-0000-000000000099',
    clock_timestamp(),
    (select reservation_id from m21_admitted_reservation)
  ),
  false,
  'unknown credential cannot refund an admitted reservation'
);
select ok(
  (select request_count = 1
   from public.m21_rate_limit_buckets
   where scope = 'unauthenticated' and key_fingerprint = repeat('c', 64))
  and (select refunded_at is null
       from public.m21_rate_limit_reservations
       where id = (select reservation_id from m21_admitted_reservation)),
  'failed verification retains the request charge and unused reservation'
);
select is(
  public.m21_mark_credential_verified(
    '21000000-0000-0000-0000-000000000005',
    clock_timestamp(),
    (select reservation_id from m21_admitted_reservation)
  ),
  true,
  'eligible credential atomically consumes and refunds its exact reservation'
);
select ok(
  (select request_count = 0
   from public.m21_rate_limit_buckets
   where scope = 'unauthenticated' and key_fingerprint = repeat('c', 64))
  and (select refunded_at is not null
       from public.m21_rate_limit_reservations
       where id = (select reservation_id from m21_admitted_reservation)),
  'successful verification refunds exactly one request and seals reservation'
);
select is(
  public.m21_mark_credential_verified(
    '21000000-0000-0000-0000-000000000005',
    clock_timestamp(),
    (select reservation_id from m21_admitted_reservation)
  ),
  false,
  'replayed reservation cannot refund twice'
);
select is(
  (select request_count from public.m21_rate_limit_buckets
   where scope = 'unauthenticated' and key_fingerprint = repeat('c', 64)),
  0,
  'replayed refund cannot underflow the bucket'
);

create temp table m21_denied_reservations as
select attempt, result.*
from generate_series(1, 61) attempt
cross join lateral public.m21_reserve_unauthenticated_rate_limit(
  repeat('d', 64),
  date_trunc('minute', clock_timestamp()) + attempt * interval '1 microsecond'
) result;
select ok(
  (select not allowed and reservation_id is null
   from m21_denied_reservations where attempt = 61),
  'denied pre-auth request receives no reusable reservation'
);
select is(
  (select request_count from public.m21_rate_limit_buckets
   where scope = 'unauthenticated' and key_fingerprint = repeat('d', 64)),
  61,
  'denied pre-auth attempts remain charged'
);

create temp table m21_authenticated_denial as
select attempt, result.*
from generate_series(1, 121) attempt
cross join lateral public.m21_consume_authenticated_rate_limits(
  repeat('e', 64), repeat('f', 64), 1, 0,
  '2030-01-01T00:00:00Z'::timestamptz + attempt * interval '1 microsecond'
) result;
select is(
  (select allowed from m21_authenticated_denial where attempt = 121),
  false,
  'authenticated request reservation fails closed at the device limit'
);
select ok(
  (select request_count = 121 from public.m21_rate_limit_buckets
   where scope = 'device' and key_fingerprint = repeat('e', 64))
  and (select request_count = 121 from public.m21_rate_limit_buckets
       where scope = 'global' and key_fingerprint = repeat('f', 64)),
  'device and global charges commit together on aggregate denial'
);

select is(
  (select count(*)::integer from public.m21_assignment_history
   where assignment_id = '21000000-0000-0000-0000-000000000007'),
  1,
  'new assignments have an explicit reliable M21 boundary'
);
select is(
  (select release_status from public.m21_release_history
   where ad_work_id = '21000000-0000-0000-0000-000000000006'
   order by effective_from desc limit 1),
  'released_to_driver',
  'release transition history is preserved'
);
select is(
  (select execution_status from public.m21_execution_history
   where ad_work_day_id = '21000000-0000-0000-0000-000000000008'
   order by effective_from desc limit 1),
  'running',
  'Start Work history uses the authoritative transition'
);

select ok(
  (select eligible from public.m21_lookup_device_credential(
    'M21-SYNTHETIC-DEVICE', 'm21-synthetic-key', clock_timestamp()
  )),
  'service lookup marks the synthetic active credential eligible'
);
select is(
  (select count(*)::integer from public.m21_lookup_device_credential(
    'M21-UNKNOWN', 'm21-synthetic-key', clock_timestamp()
  )),
  0,
  'unknown credential hints return no distinguishable detail row'
);

update public.ad_work_days
set execution_status = 'on_break',
    break_started_at = clock_timestamp(),
    execution_updated_at = clock_timestamp()
where id = '21000000-0000-0000-0000-000000000008';
select is(
  (select execution_status from public.m21_execution_history
   where ad_work_day_id = '21000000-0000-0000-0000-000000000008'
   order by effective_from desc limit 1),
  'on_break',
  'break boundary is preserved'
);
update public.ad_work_days
set execution_status = 'running',
    last_resumed_at = clock_timestamp(),
    execution_updated_at = clock_timestamp()
where id = '21000000-0000-0000-0000-000000000008';
select is(
  (select execution_status from public.m21_execution_history
   where ad_work_day_id = '21000000-0000-0000-0000-000000000008'
   order by effective_from desc limit 1),
  'running',
  'resume boundary is preserved'
);
update public.ad_work_days
set execution_status = 'completed',
    execution_completed_at = clock_timestamp(),
    execution_updated_at = clock_timestamp()
where id = '21000000-0000-0000-0000-000000000008';
select is(
  (select execution_status from public.m21_execution_history
   where ad_work_day_id = '21000000-0000-0000-0000-000000000008'
   order by effective_from desc limit 1),
  'completed',
  'End Work boundary is preserved'
);
select ok(
  not exists (
    select 1 from public.tracking_sessions
    where tracking_mode = 'phone_location'
      and gps_device_id is not null
  ),
  'M21 history transitions do not mutate phone sessions'
);

select * from finish();
rollback;
