begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

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

create function pg_temp.m21_rpc_with_stale_health(
  p_identity text,
  p_hash text,
  p_epoch text,
  p_sequence bigint,
  p_captured timestamptz,
  p_received timestamptz,
  p_lat numeric,
  p_lng numeric
) returns text
language sql
as $$
  select result.disposition
  from public.m21_persist_telemetry_event(
    '22000000-0000-0000-0000-000000000005',
    'generic_http', '1', p_identity, p_hash, repeat('e', 64), p_identity,
    p_epoch, p_sequence, p_captured, p_received, p_received,
    p_lat, p_lng, null, 5, null, null, 8,
    true, 99, true, 'stale-firmware', 'none', -70,
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
  'duplicate_conflict',
  'changed-content identity reuse is typed as a duplicate conflict'
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
  pg_temp.m21_rpc(
    'sequence-conflict', repeat('1', 64), 'boot-1', 1,
    (select captured_at from m21_rpc_times),
    (select received_at + interval '3 seconds' from m21_rpc_times),
    15.2, 80.2, true
  ),
  'duplicate_conflict',
  'changed content at an existing stream sequence is a duplicate conflict'
);

update public.gps_devices
set battery_status = 'critical', external_power_status = 'disconnected',
    firmware_version = 'newer-current', gsm_readiness = 'degraded'
where id = '22000000-0000-0000-0000-000000000004';
select is(
  pg_temp.m21_rpc_with_stale_health(
    'delayed-health', repeat('2', 64), 'boot-2', 2,
    (select captured_at + interval '2 milliseconds' from m21_rpc_times),
    (select received_at + interval '3 minutes' from m21_rpc_times),
    15.3, 80.3
  ),
  'accepted_delayed',
  'stale in-work location and health evidence is accepted only as delayed'
);
select ok(
  (select battery_status = 'critical'
       and external_power_status = 'disconnected'
       and firmware_version = 'newer-current'
       and gps_readiness = 'ready'
       and gsm_readiness = 'degraded'
       and last_heartbeat_at = (
         select received_at from public.telemetry_receipts
         where idempotency_identity = 'live-1')
       and last_telemetry_at = (
         select received_at from public.telemetry_receipts
         where idempotency_identity = 'live-1')
   from public.gps_devices
   where id = '22000000-0000-0000-0000-000000000004'),
  'accepted delayed evidence cannot overwrite current health projections'
);


insert into public.drivers (
  id, name, phone, approval_status, onboarding_status
) values (
  '22000000-0000-0000-0000-000000000012',
  'Synthetic Replacement Driver', '9000000122', 'approved', 'approved'
);
update public.ad_work_assignments
set driver_id = '22000000-0000-0000-0000-000000000012'
where id = '22000000-0000-0000-0000-000000000007';
create temp table m21_reassigned_context as
select id as assignment_history_id, effective_from
from public.m21_assignment_history
where assignment_id = '22000000-0000-0000-0000-000000000007'
order by effective_from desc limit 1;
select is(
  pg_temp.m21_rpc(
    'new-driver-live', repeat('6', 64), 'boot-6', 6,
    (select effective_from from m21_reassigned_context),
    (select effective_from + interval '1 second' from m21_reassigned_context),
    15.7, 80.7, true
  ),
  'accepted_live',
  'event captured after driver reassignment uses the new authority history'
);
select ok(
  (select count(*) = 2
   from public.tracking_sessions
   where execution_history_id = (
     select execution_history_id from public.telemetry_receipts
     where idempotency_identity = 'live-1'
   ))
  and exists (
    select 1 from public.tracking_sessions
    where driver_id = '22000000-0000-0000-0000-000000000002'
  )
  and exists (
    select 1 from public.tracking_sessions
    where driver_id = '22000000-0000-0000-0000-000000000012'
      and assignment_history_id = (
        select assignment_history_id from m21_reassigned_context
      )
  ),
  'driver change creates a separate coherent authority-context session'
);
select is(
  pg_temp.m21_rpc(
    'old-driver-delayed', repeat('7', 64), 'boot-7', 7,
    (select captured_at + interval '4 milliseconds' from m21_rpc_times),
    (select received_at + interval '3 minutes' from m21_rpc_times),
    15.8, 80.8, true
  ),
  'accepted_delayed',
  'historical assignment capture remains valid after driver reassignment'
);
update public.ad_work_days
set execution_status = 'on_break',
    break_started_at = clock_timestamp(),
    execution_updated_at = clock_timestamp()
where id = '22000000-0000-0000-0000-000000000008';
select ok(
  not exists (
    select 1 from public.tracking_sessions
    where tracking_mode = 'physical_device'
      and (status <> 'paused' or tracking_health_status <> 'stopped'
        or stop_reason is distinct from 'break_started')
  ),
  'authoritative break pauses and stops the physical session'
);
select is(
  pg_temp.m21_rpc(
    'during-break', repeat('3', 64), 'boot-3', 3,
    (select captured_at + interval '3 milliseconds' from m21_rpc_times),
    clock_timestamp(), 15.4, 80.4, true
  ),
  'accepted_delayed',
  'point captured while running may arrive during break as delayed evidence'
);
select ok(
  not exists (
    select 1 from public.tracking_sessions
    where tracking_mode = 'physical_device'
      and (status <> 'paused' or tracking_health_status <> 'stopped')
  ),
  'delayed evidence received during break cannot reopen a live session'
);

update public.ad_work_days
set execution_status = 'running',
    last_resumed_at = clock_timestamp(),
    execution_updated_at = clock_timestamp()
where id = '22000000-0000-0000-0000-000000000008';
create temp table m21_resumed_interval as
select id as execution_history_id, effective_from
from public.m21_execution_history
where ad_work_day_id = '22000000-0000-0000-0000-000000000008'
  and execution_status = 'running'
order by effective_from desc limit 1;
update public.ad_work_days
set execution_status = 'completed',
    execution_completed_at = clock_timestamp(),
    execution_updated_at = clock_timestamp()
where id = '22000000-0000-0000-0000-000000000008';
select is(
  pg_temp.m21_rpc(
    'first-after-end', repeat('4', 64), 'boot-4', 4,
    (select effective_from from m21_resumed_interval),
    (select effective_from + interval '1 second'
     from public.m21_execution_history
     where ad_work_day_id = '22000000-0000-0000-0000-000000000008'
       and execution_status = 'completed'
     order by effective_from desc limit 1),
    15.5, 80.5, true
  ),
  'accepted_delayed',
  'first point for an authority episode may backfill after End Work'
);
select ok(
  (select status = 'completed' and tracking_health_status = 'stopped'
       and stop_reason = 'work_ended' and ended_at = (
         select effective_from from public.m21_execution_history
         where ad_work_day_id = '22000000-0000-0000-0000-000000000008'
           and execution_status = 'completed'
         order by effective_from desc limit 1
       )
   from public.tracking_sessions
   where execution_history_id = (
     select execution_history_id from m21_resumed_interval
   )),
  'first delayed point after End Work creates a completed stopped session'
);
select is(
  pg_temp.m21_rpc(
    'second-after-end', repeat('5', 64), 'boot-4', 5,
    (select effective_from from m21_resumed_interval),
    (select effective_from + interval '2 seconds'
     from public.m21_execution_history
     where ad_work_day_id = '22000000-0000-0000-0000-000000000008'
       and execution_status = 'completed'
     order by effective_from desc limit 1),
    15.6, 80.6, true
  ),
  'accepted_delayed',
  'second delayed point reuses the completed authority-episode session'
);
select ok(
  (select count(*) = 1 and min(status) = 'completed'
       and min(tracking_health_status) = 'stopped'
       and min(started_at) = (select effective_from from m21_resumed_interval)
   from public.tracking_sessions
   where execution_history_id = (
     select execution_history_id from m21_resumed_interval
   )),
  'serialized delayed points create one terminal session with conservative start'
);

update public.ad_works
set execution_release_status = 'access_revoked',
    work_access_revoked_at = clock_timestamp()
where id = '22000000-0000-0000-0000-000000000006';
select is(
  pg_temp.m21_rpc(
    'historical-release', repeat('8', 64), 'boot-8', 8,
    (select effective_from from m21_resumed_interval),
    clock_timestamp(), 15.9, 80.9, true
  ),
  'accepted_delayed',
  'historical released capture remains valid after receipt-time release revocation'
);
update public.gps_device_vehicle_links
set effective_until = clock_timestamp(), closed_at = clock_timestamp(),
    closed_by_admin = '22000000-0000-0000-0000-000000000001'
where gps_device_id = '22000000-0000-0000-0000-000000000004'
  and effective_until is null;
select is(
  pg_temp.m21_rpc(
    'historical-link', repeat('9', 64), 'boot-9', 9,
    (select effective_from from m21_resumed_interval),
    clock_timestamp(), 16.0, 81.0, true
  ),
  'accepted_delayed',
  'historical link capture remains valid after receipt-time link closure'
);
select ok(
  not exists (
    select 1
    from public.location_points p
    join public.telemetry_receipts r on r.id = p.telemetry_receipt_id
    join public.tracking_sessions s on s.id = p.tracking_session_id
    where row(p.device_id, p.assignment_id, p.driver_id, p.vehicle_id,
              p.gps_device_vehicle_link_id, p.assignment_history_id,
              p.execution_history_id)
      is distinct from
          row(r.gps_device_id, r.assignment_id, r.driver_id, r.vehicle_id,
              r.gps_device_vehicle_link_id, r.assignment_history_id,
              r.execution_history_id)
       or row(p.device_id, p.assignment_id, p.driver_id, p.vehicle_id,
              p.gps_device_vehicle_link_id, p.assignment_history_id,
              p.execution_history_id)
      is distinct from
          row(s.gps_device_id, s.assignment_id, s.driver_id, s.vehicle_id,
              s.gps_device_vehicle_link_id, s.assignment_history_id,
              s.execution_history_id)
  ),
  'every physical point agrees with receipt and session authority references'
);
select is(
  (select last_heartbeat_at from public.gps_devices
   where id = '22000000-0000-0000-0000-000000000004'),
  (select max(received_at) from public.telemetry_receipts
   where disposition = 'accepted_live'),
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
  not exists (
    select 1 from public.location_points p
    join public.telemetry_receipts r on r.id = p.telemetry_receipt_id
    where r.idempotency_identity = 'off-work-health'
  )
  and (select point_count = 0 from public.tracking_sessions
       where id = '22000000-0000-0000-0000-000000000009'),
  'health-only event stores no coordinate and phone count remains unchanged'
);

select * from finish();
rollback;
