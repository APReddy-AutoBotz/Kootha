\set ON_ERROR_STOP on

do $$
begin
  if not exists(
    select 1 from public.alerts
    where id='44000000-0000-0000-0000-000000000011'
      and status='new' and origin='legacy_pre_m22'
      and rule_id is null and created_at='2026-07-27 01:00:00+00'
  ) then raise exception 'legacy open alert was not conservatively preserved'; end if;
  if not exists(
    select 1 from public.alerts
    where id='44000000-0000-0000-0000-000000000012'
      and status='resolved' and origin='legacy_pre_m22'
      and rule_id is null and resolved_at='2026-07-27 01:02:00+00'
  ) then raise exception 'legacy resolved alert was not preserved'; end if;
  if (select count(*) from public.alert_status_history
      where alert_id in(
        '44000000-0000-0000-0000-000000000011',
        '44000000-0000-0000-0000-000000000012'))<>2
  then raise exception 'legacy status history was not created exactly once'; end if;
  if not exists(
    select 1 from public.tracking_sessions
    where id='44000000-0000-0000-0000-000000000009'
      and tracking_mode='phone_location' and point_count=1
  ) then raise exception 'phone tracking session changed during upgrade'; end if;
  if not exists(
    select 1 from public.location_points
    where id='44000000-0000-0000-0000-000000000010'
      and source='phone' and telemetry_receipt_id is null
  ) then raise exception 'phone location evidence changed during upgrade'; end if;
  if (select count(*) from public.tracking_sessions
      where tracking_mode='physical_device')<>1
  then raise exception 'physical tracking session count changed during upgrade'; end if;
  if (select count(*) from public.location_points
      where source='physical_device')<>1
  then raise exception 'physical point count changed during upgrade'; end if;
  if (select count(*) from public.telemetry_receipts)<>1
  then raise exception 'M21 receipt count changed during upgrade'; end if;
  if (select count(*) from public.telemetry_identity_conflicts)<>1
  then raise exception 'M21 conflict count changed during upgrade'; end if;
  if not exists(select 1 from public.gps_devices
      where id='44000000-0000-0000-0000-000000000004'
        and status='active' and installation_state='installed')
  then raise exception 'active device state changed during upgrade'; end if;
  if not exists(select 1 from public.gps_devices
      where id='44000000-0000-0000-0000-000000000014'
        and status='retired' and installation_state='removed')
  then raise exception 'terminal device state changed during upgrade'; end if;
  if not exists(select 1 from public.m22_rule_policies where enabled)
  then raise exception 'M22 provisional rule policies were not installed'; end if;
end $$;

select json_build_object(
  'legacy_alerts_preserved',2,
  'phone_sessions_preserved',1,
  'phone_points_preserved',1,
  'physical_sessions_preserved',1,
  'physical_points_preserved',1,
  'm21_receipts_preserved',1,
  'm21_conflicts_preserved',1,
  'active_and_terminal_devices_preserved',true,
  'result','pass'
) as m22_upgrade_evidence;
