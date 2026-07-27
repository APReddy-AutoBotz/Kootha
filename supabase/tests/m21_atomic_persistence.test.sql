begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into public.user_profiles (auth_user_id, display_name, role)
values ('22000000-0000-0000-0000-000000000001', 'M21 RPC Admin', 'admin');
insert into public.drivers (
  id, name, phone, approval_status, onboarding_status
) values (
  '22000000-0000-0000-0000-000000000002',
  'Synthetic RPC Driver', '9000000022', 'approved', 'approved'
);
insert into public.vehicles (
  id, vehicle_number, vehicle_type, onboarding_status, active
) values (
  '22000000-0000-0000-0000-000000000003',
  'M21-RPC-VEHICLE', 'van', 'approved', true
);
insert into public.gps_devices (
  id, device_code, vendor, model, adapter_type, protocol_type,
  status, installation_state, gps_readiness, gsm_readiness
) values (
  '22000000-0000-0000-0000-000000000004',
  'M21-RPC-DEVICE', 'Synthetic', 'RPC', 'generic_http', 'https',
  'active', 'installed', 'ready', 'ready'
);
insert into public.gps_device_vehicle_links (
  gps_device_id, vehicle_id, effective_from, change_reason, created_by_admin
) values (
  '22000000-0000-0000-0000-000000000004',
  '22000000-0000-0000-0000-000000000003',
  clock_timestamp() - interval '1 minute', 'synthetic RPC fixture',
  '22000000-0000-0000-0000-000000000001'
);
insert into public.gps_device_credential_metadata (
  id, gps_device_id, credential_key_id, status, verification_material_hash,
  issued_at, expires_at, created_by_admin
) values (
  '22000000-0000-0000-0000-000000000005',
  '22000000-0000-0000-0000-000000000004',
  'm21-rpc-key', 'active', repeat('b', 64),
  clock_timestamp() - interval '1 hour',
  clock_timestamp() + interval '1 day',
  '22000000-0000-0000-0000-000000000001'
);
insert into public.ad_works (id, title)
values ('22000000-0000-0000-0000-000000000006', 'Synthetic RPC Work');
insert into public.ad_work_assignments (
  id, ad_work_id, driver_id, vehicle_id, status
) values (
  '22000000-0000-0000-0000-000000000007',
  '22000000-0000-0000-0000-000000000006',
  '22000000-0000-0000-0000-000000000002',
  '22000000-0000-0000-0000-000000000003',
  'ready_for_execution'
);
insert into public.ad_work_days (id, ad_work_id, work_date)
values (
  '22000000-0000-0000-0000-000000000008',
  '22000000-0000-0000-0000-000000000006', current_date
);
update public.ad_works
set execution_release_status = 'released_to_driver',
    work_access_code_created_at = clock_timestamp()
where id = '22000000-0000-0000-0000-000000000006';
update public.ad_work_days
set execution_status = 'running',
    execution_started_at = clock_timestamp(),
    execution_updated_at = clock_timestamp()
where id = '22000000-0000-0000-0000-000000000008';

insert into public.tracking_sessions (
  id, ad_work_id, ad_work_day_id, assignment_id, driver_id, vehicle_id,
  source_type, tracking_mode, status, started_at, point_count
) values (
  '22000000-0000-0000-0000-000000000009',
  '22000000-0000-0000-0000-000000000006',
  '22000000-0000-0000-0000-000000000008',
  '22000000-0000-0000-0000-000000000007',
  '22000000-0000-0000-0000-000000000002',
  '22000000-0000-0000-0000-000000000003',
  'mobile', 'phone_location', 'running', clock_timestamp(), 0
);

create function pg_temp.m21_rpc(
  p_identity text,
  p_hash text,
  p_epoch text,
  p_sequence bigint,
  p_captured timestamptz,
  p_received timestamptz,
  p_lat numeric,
  p_lng numeric,
  p_heartbeat boolean
) returns text
language sql
as $$
  select result.disposition
  from public.m21_persist_telemetry_event(
    '22000000-0000-0000-0000-000000000005',
    'generic_http', '1', p_identity, p_hash, repeat('e', 64), p_identity,
    p_epoch, p_sequence, p_captured, p_received, p_received,
    p_lat, p_lng, null, 5, null, null, 8,
    p_heartbeat, 50, true, 'm21-test', 'three_dimensional', -70,
    '[]'::jsonb, 'valid', 'simulator', true, 'm21-v1'
  ) result;
$$;

create temp table m21_rpc_times as
select
  effective_from + interval '1 millisecond' as captured_at,
  effective_from + interval '1 second' as received_at
from public.m21_execution_history
where ad_work_day_id = '22000000-0000-0000-0000-000000000008'
  and execution_status = 'running';

select is(
  pg_temp.m21_rpc(
    'live-1', repeat('c', 64), 'boot-1', 1,
    (select captured_at from m21_rpc_times),
    (select received_at from m21_rpc_times),
    15, 80, true
  ),
  'accepted_live',
  'eligible current-context event is accepted'
);
select is(
  (select count(*)::integer from public.telemetry_receipts),
  1,
  'accepted event creates one receipt'
);
select is(
  (select count(*)::integer from public.tracking_sessions
   where tracking_mode = 'physical_device'),
  1,
  'accepted event creates one physical session'
);
select is(
  (select count(*)::integer from public.location_points
   where source = 'physical_device'),
  1,
  'accepted event creates one physical point'
);
select ok(
  (select tracking_mode = 'phone_location' and point_count = 0
   from public.tracking_sessions
   where id = '22000000-0000-0000-0000-000000000009'),
  'accepted physical event leaves phone session unchanged'
);

select is(
  pg_temp.m21_rpc(
    'live-1', repeat('c', 64), 'boot-1', 1,
    (select captured_at from m21_rpc_times),
    (select received_at + interval '1 second' from m21_rpc_times),
    15, 80, true
  ),
  'duplicate',
  'identical retry is acknowledged as duplicate'
);
select ok(
  (select count(*) = 1 from public.telemetry_receipts)
  and (select count(*) = 1 from public.location_points
       where source = 'physical_device')
  and (select point_count = 1 from public.tracking_sessions
       where tracking_mode = 'physical_device'),
  'identical retry causes no receipt, point, or count inflation'
);
select is(
  pg_temp.m21_rpc(
    'live-1', repeat('d', 64), 'boot-1', 1,
    (select captured_at from m21_rpc_times),
    (select received_at + interval '2 seconds' from m21_rpc_times),
    15.1, 80.1, true
  ),
  'rejected',
  'changed-content identity reuse is rejected'
);
select ok(
  (select count(*) = 1 from public.telemetry_identity_conflicts)
  and (select count(*) = 1 from public.location_points
       where source = 'physical_device'),
  'conflict records bounded evidence without another point'
);

select is(
  pg_temp.m21_rpc(
    'future-high', repeat('f', 64), 'boot-1', 999,
    clock_timestamp() + interval '2 minutes', clock_timestamp(),
    null, null, true
  ),
  'rejected',
  'future unsafe health event fails closed'
);
select is(
  (select high_water_sequence from public.telemetry_stream_state
   where stream_epoch = 'boot-1'),
  1::bigint,
  'unsafe high sequence does not poison stream state'
);
select is(
  (select last_heartbeat_at from public.gps_devices
   where id = '22000000-0000-0000-0000-000000000004'),
  (select received_at from public.telemetry_receipts
   where idempotency_identity = 'live-1'),
  'unsafe rejected health cannot mutate device summary'
);

select is(
  pg_temp.m21_rpc(
    'off-work-health', repeat('a', 64), 'off-work', 1,
    (select effective_from - interval '1 second'
     from public.gps_device_vehicle_links
     where gps_device_id = '22000000-0000-0000-0000-000000000004'),
    clock_timestamp(), null, null, true
  ),
  'health_only',
  'safe off-work heartbeat is retained as health only'
);
select ok(
  (select count(*) = 1 from public.location_points
   where source = 'physical_device')
  and (select point_count = 0 from public.tracking_sessions
       where id = '22000000-0000-0000-0000-000000000009'),
  'health-only event stores no coordinate and phone count remains unchanged'
);

select * from finish();
rollback;
