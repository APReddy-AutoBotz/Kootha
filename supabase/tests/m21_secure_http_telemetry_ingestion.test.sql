begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

select has_table('public', 'telemetry_receipts', 'receipt table exists');
select has_table('public', 'telemetry_stream_state', 'stream state exists');
select has_table('public', 'telemetry_identity_conflicts', 'safe conflict evidence exists');
select has_table('public', 'telemetry_sensor_observations', 'typed observations exist');
select has_table('public', 'm21_rate_limit_buckets', 'database rate buckets exist');
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
        'm21_release_history', 'm21_execution_history'
      )
      and not c.relrowsecurity
  ),
  'RLS is immediate on all M21 evidence/state tables'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.m21_consume_rate_limit(text,text,integer,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.m21_consume_rate_limit(text,text,integer,timestamptz)',
    'EXECUTE'
  ),
  'clients cannot call rate-limit RPC'
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
  (select allowed from public.m21_consume_rate_limit(
    'device', repeat('a', 64), 100, '2030-01-01T00:00:00Z'
  )),
  true,
  'first bounded device batch is allowed'
);
select is(
  (select allowed from public.m21_consume_rate_limit(
    'device', repeat('a', 64), 100, '2030-01-01T00:00:00Z'
  )),
  true,
  'rate bucket update is deterministic'
);
select throws_ok(
  $$select * from public.m21_consume_rate_limit(
    'device', 'raw-ip-is-not-allowed', 1, clock_timestamp()
  )$$,
  '22023',
  'Invalid rate-limit input',
  'raw identifiers cannot enter rate-limit storage'
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
