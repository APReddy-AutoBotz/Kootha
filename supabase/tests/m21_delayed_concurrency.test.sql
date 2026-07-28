create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

insert into public.user_profiles (auth_user_id, display_name, role)
values ('23000000-0000-0000-0000-000000000001', 'M21 Concurrency Admin', 'admin');
insert into public.drivers (id, name, phone, approval_status, onboarding_status)
values ('23000000-0000-0000-0000-000000000002', 'Concurrency Driver',
        '9000000023', 'approved', 'approved');
insert into public.vehicles (id, vehicle_number, vehicle_type, onboarding_status, active)
values ('23000000-0000-0000-0000-000000000003', 'M21-CONCURRENT', 'van', 'approved', true);
insert into public.gps_devices (
  id, device_code, vendor, model, adapter_type, protocol_type,
  status, installation_state, gps_readiness, gsm_readiness
) values (
  '23000000-0000-0000-0000-000000000004', 'M21-CONCURRENT-DEVICE',
  'Synthetic', 'Concurrency', 'generic_http', 'https',
  'active', 'installed', 'ready', 'ready'
);
insert into public.gps_device_vehicle_links (
  gps_device_id, vehicle_id, effective_from, change_reason, created_by_admin
) values (
  '23000000-0000-0000-0000-000000000004',
  '23000000-0000-0000-0000-000000000003',
  clock_timestamp() - interval '1 minute', 'synthetic concurrency fixture',
  '23000000-0000-0000-0000-000000000001'
);
insert into public.gps_device_credential_metadata (
  id, gps_device_id, credential_key_id, status, verification_material_hash,
  issued_at, expires_at, created_by_admin
) values (
  '23000000-0000-0000-0000-000000000005',
  '23000000-0000-0000-0000-000000000004',
  'm21-concurrent-key', 'active', repeat('b', 64),
  clock_timestamp() - interval '1 hour', clock_timestamp() + interval '1 day',
  '23000000-0000-0000-0000-000000000001'
);
insert into public.ad_works (id, title)
values ('23000000-0000-0000-0000-000000000006', 'Concurrency Work');
insert into public.ad_work_assignments (
  id, ad_work_id, driver_id, vehicle_id, status
) values (
  '23000000-0000-0000-0000-000000000007',
  '23000000-0000-0000-0000-000000000006',
  '23000000-0000-0000-0000-000000000002',
  '23000000-0000-0000-0000-000000000003', 'ready_for_execution'
);
insert into public.ad_work_days (id, ad_work_id, work_date)
values (
  '23000000-0000-0000-0000-000000000008',
  '23000000-0000-0000-0000-000000000006', current_date
);
update public.ad_works
set execution_release_status = 'released_to_driver',
    work_access_code_created_at = clock_timestamp()
where id = '23000000-0000-0000-0000-000000000006';
update public.ad_work_days
set execution_status = 'running', execution_started_at = clock_timestamp(),
    execution_updated_at = clock_timestamp()
where id = '23000000-0000-0000-0000-000000000008';

create table public.m21_concurrency_test_state (
  captured_at timestamptz not null,
  received_at timestamptz not null
);
insert into public.m21_concurrency_test_state
select effective_from, effective_from + interval '2 seconds'
from public.m21_execution_history
where ad_work_day_id = '23000000-0000-0000-0000-000000000008'
  and execution_status = 'running';
update public.ad_work_days
set execution_status = 'completed',
    execution_completed_at = (
      select captured_at + interval '1 second'
      from public.m21_concurrency_test_state
    ),
    execution_updated_at = clock_timestamp()
where id = '23000000-0000-0000-0000-000000000008';

create function public.m21_concurrency_test_call(p_identity text, p_sequence bigint)
returns text
language sql
as $$
  select result.disposition
  from public.m21_persist_telemetry_event(
    '23000000-0000-0000-0000-000000000005',
    'generic_http', '1', p_identity, encode(digest(p_identity, 'sha256'), 'hex'),
    repeat('e', 64), p_identity, 'concurrent-boot', p_sequence,
    (select captured_at from public.m21_concurrency_test_state),
    (select received_at from public.m21_concurrency_test_state),
    (select received_at from public.m21_concurrency_test_state),
    15, 80, null, 5, null, null, 8,
    false, null, null, null, null, null, '[]'::jsonb,
    'valid', 'simulator', true, 'm21-v1'
  ) result;
$$;

\connect postgres supabase_admin

begin;
select plan(4);
select dblink_connect_u('m21_c1', 'dbname=postgres');
select dblink_connect_u('m21_c2', 'dbname=postgres');
select dblink_send_query('m21_c1',
  $$select public.m21_concurrency_test_call('concurrent-a', 1)$$);
select dblink_send_query('m21_c2',
  $$select public.m21_concurrency_test_call('concurrent-b', 2)$$);
select is(
  (select disposition from dblink_get_result('m21_c1') as r(disposition text)),
  'accepted_delayed',
  'first simultaneous delayed call succeeds'
);
select is(
  (select disposition from dblink_get_result('m21_c2') as r(disposition text)),
  'accepted_delayed',
  'second simultaneous delayed call succeeds'
);
select ok(
  (select count(*) = 1 and min(status) = 'completed'
       and min(tracking_health_status) = 'stopped'
   from public.tracking_sessions
   where gps_device_id = '23000000-0000-0000-0000-000000000004'),
  'simultaneous first delayed points create one terminal physical session'
);
select ok(
  (select count(*) = 2 from public.telemetry_receipts
   where gps_device_id = '23000000-0000-0000-0000-000000000004')
  and (select count(*) = 2 from public.location_points
       where device_id = '23000000-0000-0000-0000-000000000004')
  and (select point_count = 2 from public.tracking_sessions
       where gps_device_id = '23000000-0000-0000-0000-000000000004'),
  'concurrent delayed writes create two receipts and points without inflation'
);
select * from finish();
commit;

select dblink_disconnect('m21_c1');
select dblink_disconnect('m21_c2');
set session_replication_role = replica;
delete from public.location_points
where device_id = '23000000-0000-0000-0000-000000000004';
delete from public.telemetry_stream_state
where gps_device_id = '23000000-0000-0000-0000-000000000004';
delete from public.telemetry_receipts
where gps_device_id = '23000000-0000-0000-0000-000000000004';
delete from public.tracking_sessions
where gps_device_id = '23000000-0000-0000-0000-000000000004';
delete from public.m21_execution_history
where ad_work_day_id = '23000000-0000-0000-0000-000000000008';
delete from public.m21_release_history
where ad_work_id = '23000000-0000-0000-0000-000000000006';
delete from public.m21_assignment_history
where assignment_id = '23000000-0000-0000-0000-000000000007';
delete from public.ad_work_days
where id = '23000000-0000-0000-0000-000000000008';
delete from public.ad_work_assignments
where id = '23000000-0000-0000-0000-000000000007';
delete from public.ad_works
where id = '23000000-0000-0000-0000-000000000006';
delete from public.gps_device_credential_metadata
where gps_device_id = '23000000-0000-0000-0000-000000000004';
delete from public.gps_device_vehicle_links
where gps_device_id = '23000000-0000-0000-0000-000000000004';
delete from public.gps_devices
where id = '23000000-0000-0000-0000-000000000004';
delete from public.vehicles
where id = '23000000-0000-0000-0000-000000000003';
delete from public.drivers
where id = '23000000-0000-0000-0000-000000000002';
delete from public.user_profiles
where auth_user_id = '23000000-0000-0000-0000-000000000001';
drop function public.m21_concurrency_test_call(text, bigint);
drop table public.m21_concurrency_test_state;
set session_replication_role = origin;
