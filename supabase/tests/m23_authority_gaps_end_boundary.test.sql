begin;
create extension if not exists pgtap with schema extensions;
select plan(84);

insert into public.drivers(id,name,phone,approval_status,onboarding_status)
values('2a000000-0000-0000-0000-000000000001','M23 Authority Gap Driver','900000002a','approved','approved');
insert into public.vehicles(id,vehicle_number,vehicle_type,onboarding_status,active)
values('2a000000-0000-0000-0000-000000000002','M23-AUTHORITY-GAP-VEHICLE','van','approved',true);
insert into public.user_profiles(auth_user_id,display_name,role)
values('2a000000-0000-0000-0000-000000000003','M23 Authority Gap Admin','admin');

insert into public.ad_works(id,title,tracking_type,mobile_location_proof_required)
values
  ('2a000000-0000-0000-0000-000000000010','M23 Assignment Gap Work','mobile',true),
  ('2a000000-0000-0000-0000-000000000020','M23 Release Gap Work','mobile',true),
  ('2a000000-0000-0000-0000-000000000030','M23 Link Gap Work','both',true);
insert into public.ad_work_assignments(id,ad_work_id,driver_id,vehicle_id,status)
values
  ('2a000000-0000-0000-0000-000000000011','2a000000-0000-0000-0000-000000000010','2a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000002','ready_for_execution'),
  ('2a000000-0000-0000-0000-000000000021','2a000000-0000-0000-0000-000000000020','2a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000002','ready_for_execution'),
  ('2a000000-0000-0000-0000-000000000031','2a000000-0000-0000-0000-000000000030','2a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000002','ready_for_execution');
insert into public.ad_work_days(id,ad_work_id,work_date,driver_id,vehicle_id,execution_status,execution_started_at)
values
  ('2a000000-0000-0000-0000-000000000012','2a000000-0000-0000-0000-000000000010','2026-07-31','2a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000002','running','2026-07-31 08:00+00'),
  ('2a000000-0000-0000-0000-000000000022','2a000000-0000-0000-0000-000000000020','2026-07-31','2a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000002','running','2026-07-31 08:00+00'),
  ('2a000000-0000-0000-0000-000000000032','2a000000-0000-0000-0000-000000000030','2026-07-31','2a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000002','running','2026-07-31 08:00+00');

insert into public.m21_assignment_history(id,assignment_id,ad_work_id,driver_id,vehicle_id,assignment_status,effective_from,effective_until,history_origin)
values
  ('2a000000-0000-0000-0000-000000000013','2a000000-0000-0000-0000-000000000011','2a000000-0000-0000-0000-000000000010','2a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000002','assigned','2026-07-31 08:00+00','2026-07-31 09:00+00','observed'),
  ('2a000000-0000-0000-0000-000000000019','2a000000-0000-0000-0000-000000000011','2a000000-0000-0000-0000-000000000010','2a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000002','not_assigned','2026-07-31 09:00+00','2026-07-31 10:00+00','observed'),
  ('2a000000-0000-0000-0000-000000000014','2a000000-0000-0000-0000-000000000011','2a000000-0000-0000-0000-000000000010','2a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000002','assigned','2026-07-31 10:00+00','2026-07-31 11:00+00','observed'),
  ('2a000000-0000-0000-0000-000000000023','2a000000-0000-0000-0000-000000000021','2a000000-0000-0000-0000-000000000020','2a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000002','assigned','2026-07-31 08:00+00','2026-07-31 11:00+00','observed'),
  ('2a000000-0000-0000-0000-000000000033','2a000000-0000-0000-0000-000000000031','2a000000-0000-0000-0000-000000000030','2a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000002','assigned','2026-07-31 08:00+00','2026-07-31 11:00+00','observed');
insert into public.m21_release_history(id,ad_work_id,release_status,effective_from,effective_until,history_origin)
values
  ('2a000000-0000-0000-0000-000000000015','2a000000-0000-0000-0000-000000000010','released_to_driver','2026-07-31 08:00+00','2026-07-31 09:00+00','observed'),
  ('2a000000-0000-0000-0000-000000000016','2a000000-0000-0000-0000-000000000010','released_to_driver','2026-07-31 10:00+00','2026-07-31 11:00+00','observed'),
  ('2a000000-0000-0000-0000-000000000025','2a000000-0000-0000-0000-000000000020','released_to_driver','2026-07-31 08:00+00','2026-07-31 09:00+00','observed'),
  ('2a000000-0000-0000-0000-000000000026','2a000000-0000-0000-0000-000000000020','access_revoked','2026-07-31 09:00+00','2026-07-31 10:00+00','observed'),
  ('2a000000-0000-0000-0000-000000000027','2a000000-0000-0000-0000-000000000020','released_to_driver','2026-07-31 10:00+00','2026-07-31 11:00+00','observed'),
  ('2a000000-0000-0000-0000-000000000035','2a000000-0000-0000-0000-000000000030','released_to_driver','2026-07-31 08:00+00','2026-07-31 11:00+00','observed');
insert into public.m21_execution_history(id,ad_work_day_id,execution_status,effective_from,effective_until,history_origin)
values
  ('2a000000-0000-0000-0000-000000000017','2a000000-0000-0000-0000-000000000012','running','2026-07-31 08:00+00','2026-07-31 11:00+00','observed'),
  ('2a000000-0000-0000-0000-000000000028','2a000000-0000-0000-0000-000000000022','running','2026-07-31 08:00+00','2026-07-31 11:00+00','observed'),
  ('2a000000-0000-0000-0000-000000000036','2a000000-0000-0000-0000-000000000032','running','2026-07-31 08:00+00','2026-07-31 11:00+00','observed');

insert into public.gps_devices(id,device_code,vendor,model,adapter_type,protocol_type,status,installation_state,gps_readiness,gsm_readiness)
values
  ('2a000000-0000-0000-0000-000000000041','M23-GAP-A','Synthetic','M23','generic_http','https','active','installed','ready','ready'),
  ('2a000000-0000-0000-0000-000000000042','M23-GAP-B','Synthetic','M23','generic_http','https','active','installed','ready','ready');
insert into public.gps_device_vehicle_links(id,gps_device_id,vehicle_id,is_primary,effective_from,effective_until,change_reason,created_by_admin,closed_by_admin,closed_at)
values
  ('2a000000-0000-0000-0000-000000000043','2a000000-0000-0000-0000-000000000041','2a000000-0000-0000-0000-000000000002',true,'2026-07-31 08:00+00','2026-07-31 09:00+00','M23 gap link A','2a000000-0000-0000-0000-000000000003','2a000000-0000-0000-0000-000000000003','2026-07-31 09:00+00'),
  ('2a000000-0000-0000-0000-000000000044','2a000000-0000-0000-0000-000000000042','2a000000-0000-0000-0000-000000000002',true,'2026-07-31 10:00+00','2026-07-31 11:00+00','M23 gap link B','2a000000-0000-0000-0000-000000000003','2a000000-0000-0000-0000-000000000003','2026-07-31 11:00+00');
insert into public.m21_release_history(id,ad_work_id,release_status,effective_from,effective_until,history_origin)
values('2a000000-0000-0000-0000-000000000018','2a000000-0000-0000-0000-000000000010','access_revoked','2026-07-31 09:30+00','2026-07-31 09:45+00','observed');

select is(public.m23_evaluate_work_day('2a000000-0000-0000-0000-000000000012','phone-device-comparison','m23-pilot-v1','2026-07-31 09:30+00'),2,'assignment history and current assignment gap are evaluated separately');
select is((select count(*)::integer from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000012' and safe_reason_code='no_current_assignment'),1,'same-context assignment gap segments coalesce across unrelated release boundaries');
select is((select scope_effective_from from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000012' and safe_reason_code='no_current_assignment'),'2026-07-31 09:00+00'::timestamptz,'assignment gap starts at the non-authorizing row boundary');
select is((select scope_effective_until from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000012' and safe_reason_code='no_current_assignment'),'2026-07-31 10:00+00'::timestamptz,'assignment gap ends at the next active assignment boundary');
select is((select finality from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000012' and safe_reason_code='no_current_assignment'),'provisional_active_work','active assignment gap has active-work finality');
select is((select overall_outcome from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000012' and safe_reason_code='no_current_assignment'),'comparison_unavailable','assignment gap fails closed');
select is((select pair_count from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000012' and safe_reason_code='no_current_assignment'),0,'assignment gap contains no pairs');
select ok(not exists(select 1 from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000012' and overall_outcome in ('phone_missing','physical_device_missing','both_missing')),'assignment gap is not misclassified as missing source');
select is(public.m23_evaluate_work_day('2a000000-0000-0000-0000-000000000012','phone-device-comparison','m23-pilot-v1','2026-07-31 10:30+00'),3,'historical assignment gap and later assignment episode are all evaluated');
select ok(exists(select 1 from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000012' and assignment_history_id='2a000000-0000-0000-0000-000000000014'),'later assignment history is a separate scope');
select is((select count(*)::integer from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000012' and safe_reason_code='no_current_assignment'),2,'time-driven reevaluation creates a gap successor snapshot');
select is((select count(distinct authority_scope_key)::integer from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000012' and safe_reason_code='no_current_assignment'),1,'assignment gap identity is stable across finality phases');
select is((select count(*)::integer from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000012' and safe_reason_code='no_current_assignment' and is_latest),1,'only the newest assignment gap snapshot is latest');
select ok(exists(select 1 from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000012' and safe_reason_code='no_current_assignment' and finality='provisional_active_work' and not is_latest),'prior assignment gap snapshot remains immutable history');
select is((select finality from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000012' and safe_reason_code='no_current_assignment' and is_latest),'provisional_backfill_open','closed assignment gap advances to backfill finality without new points');
select ok(not exists(select 1 from public.m23_comparison_pairs cp join public.m23_comparison_snapshots s on s.id=cp.snapshot_id where s.ad_work_day_id='2a000000-0000-0000-0000-000000000012' and s.safe_reason_code='no_current_assignment'),'assignment gap has no selected technical evidence');
select is(public.m23_evaluate_work_day('2a000000-0000-0000-0000-000000000012','phone-device-comparison','m23-pilot-v1','2026-07-31 10:30+00'),3,'repeated assignment reevaluation is idempotent');
select is((select count(*)::integer from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000012' and safe_reason_code='no_current_assignment'),2,'repeated assignment reevaluation does not amplify snapshots');

select is(public.m23_evaluate_work_day('2a000000-0000-0000-0000-000000000022','phone-device-comparison','m23-pilot-v1','2026-07-31 09:30+00'),2,'release history and current release gap are evaluated separately');
select ok(exists(select 1 from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000022' and release_history_id='2a000000-0000-0000-0000-000000000025'),'release episode A is retained');
select is((select count(*)::integer from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000022' and safe_reason_code='no_current_release'),1,'release gap creates one scope');
select is((select scope_effective_from from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000022' and safe_reason_code='no_current_release'),'2026-07-31 09:00+00'::timestamptz,'release gap starts at release revocation');
select is((select scope_effective_until from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000022' and safe_reason_code='no_current_release'),'2026-07-31 10:00+00'::timestamptz,'release gap ends at the next released interval');
select is((select finality from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000022' and safe_reason_code='no_current_release'),'provisional_active_work','active release gap has active-work finality');
select is((select overall_outcome from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000022' and safe_reason_code='no_current_release'),'comparison_unavailable','release gap fails closed');
select ok(not exists(select 1 from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000022' and safe_reason_code='ambiguous_release_authority'),'sequential releases are not globally marked ambiguous');
select is(public.m23_evaluate_work_day('2a000000-0000-0000-0000-000000000022','phone-device-comparison','m23-pilot-v1','2026-07-31 10:30+00'),3,'historical release gap and later release episode are all evaluated');
select ok(exists(select 1 from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000022' and release_history_id='2a000000-0000-0000-0000-000000000027'),'release episode B is a separate scope');
select is((select count(*)::integer from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000022' and safe_reason_code='no_current_release'),2,'release gap receives a finality successor snapshot');
select is((select count(distinct authority_scope_key)::integer from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000022' and safe_reason_code='no_current_release'),1,'release gap identity is stable');
select ok(not exists(select 1 from public.m23_comparison_pairs cp join public.m23_comparison_snapshots s on s.id=cp.snapshot_id where s.ad_work_day_id='2a000000-0000-0000-0000-000000000022' and s.safe_reason_code='no_current_release'),'release gap has no selected technical evidence');

select is(public.m23_evaluate_work_day('2a000000-0000-0000-0000-000000000032','phone-device-comparison','m23-pilot-v1','2026-07-31 09:30+00'),2,'link history and current link gap are evaluated separately');
select ok(exists(select 1 from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000032' and gps_device_vehicle_link_id='2a000000-0000-0000-0000-000000000043'),'link episode A is retained');
select is((select count(*)::integer from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000032' and safe_reason_code='no_current_device_link'),1,'link gap creates one scope');
select is((select scope_effective_from from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000032' and safe_reason_code='no_current_device_link'),'2026-07-31 09:00+00'::timestamptz,'link gap starts at device-link replacement');
select is((select scope_effective_until from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000032' and safe_reason_code='no_current_device_link'),'2026-07-31 10:00+00'::timestamptz,'link gap ends at the next device-link boundary');
select is((select finality from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000032' and safe_reason_code='no_current_device_link'),'provisional_active_work','active link gap has active-work finality');
select is((select overall_outcome from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000032' and safe_reason_code='no_current_device_link'),'comparison_unavailable','link gap fails closed');
select is((select pair_count from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000032' and safe_reason_code='no_current_device_link'),0,'link gap contains no pairs');
select is(public.m23_evaluate_work_day('2a000000-0000-0000-0000-000000000032','phone-device-comparison','m23-pilot-v1','2026-07-31 10:30+00'),3,'historical link gap and later link episode are all evaluated');
select ok(exists(select 1 from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000032' and gps_device_vehicle_link_id='2a000000-0000-0000-0000-000000000044'),'link episode B is a separate scope');
select is((select count(*)::integer from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000032' and safe_reason_code='no_current_device_link'),2,'link gap receives a finality successor snapshot');
select is((select count(distinct authority_scope_key)::integer from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000032' and safe_reason_code='no_current_device_link'),1,'link gap identity is stable');
select ok(not exists(select 1 from public.m23_comparison_pairs cp join public.m23_comparison_snapshots s on s.id=cp.snapshot_id where s.ad_work_day_id='2a000000-0000-0000-0000-000000000032' and s.safe_reason_code='no_current_device_link'),'link gap has no selected technical evidence');

-- An open gap is closed by the running execution boundary, even when no later
-- active authority row exists. End Work produces a historical, non-active gap
-- successor without inventing a missing-source outcome.
insert into public.ad_works(id,title,tracking_type,mobile_location_proof_required)
values('2a000000-0000-0000-0000-000000000040','M23 Open Gap Work','mobile',true);
insert into public.ad_work_assignments(id,ad_work_id,driver_id,vehicle_id,status)
values('2a000000-0000-0000-0000-000000000041','2a000000-0000-0000-0000-000000000040','2a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000002','ready_for_execution');
insert into public.ad_work_days(id,ad_work_id,work_date,driver_id,vehicle_id,execution_status,execution_started_at)
values('2a000000-0000-0000-0000-000000000042','2a000000-0000-0000-0000-000000000040','2026-07-31','2a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000002','running','2026-07-31 08:00+00');
insert into public.m21_assignment_history(id,assignment_id,ad_work_id,driver_id,vehicle_id,assignment_status,effective_from,effective_until,history_origin)
values('2a000000-0000-0000-0000-000000000043','2a000000-0000-0000-0000-000000000041','2a000000-0000-0000-0000-000000000040','2a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000002','assigned','2026-07-31 08:00+00','2026-07-31 11:00+00','observed');
insert into public.m21_release_history(id,ad_work_id,release_status,effective_from,effective_until,history_origin)
values
  ('2a000000-0000-0000-0000-000000000044','2a000000-0000-0000-0000-000000000040','released_to_driver','2026-07-31 08:00+00','2026-07-31 09:00+00','observed'),
  ('2a000000-0000-0000-0000-000000000045','2a000000-0000-0000-0000-000000000040','access_revoked','2026-07-31 09:00+00','2026-07-31 11:00+00','observed');
insert into public.m21_execution_history(id,ad_work_day_id,execution_status,effective_from,effective_until,history_origin)
values
  ('2a000000-0000-0000-0000-000000000046','2a000000-0000-0000-0000-000000000042','running','2026-07-31 08:00+00','2026-07-31 11:00+00','observed'),
  ('2a000000-0000-0000-0000-000000000047','2a000000-0000-0000-0000-000000000042','completed','2026-07-31 11:00+00',null,'observed');
select ok(exists(select 1 from public.m21_execution_history where id='2a000000-0000-0000-0000-000000000047' and execution_status='completed'),'open-gap fixture has an End Work successor');
select is(public.m23_evaluate_work_day('2a000000-0000-0000-0000-000000000042','phone-device-comparison','m23-pilot-v1','2026-07-31 09:30+00'),2,'open release gap is emitted with its preceding valid scope');
select is((select scope_effective_from from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000042' and safe_reason_code='no_current_release'),'2026-07-31 09:00+00'::timestamptz,'open release gap starts at revocation');
select is((select scope_effective_until from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000042' and safe_reason_code='no_current_release'),'2026-07-31 11:00+00'::timestamptz,'open release gap closes at End Work');
select is((select finality from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000042' and safe_reason_code='no_current_release'),'provisional_active_work','open gap is active before End Work');
select is((select overall_outcome from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000042' and safe_reason_code='no_current_release'),'comparison_unavailable','open gap is unavailable rather than missing');
select is(public.m23_evaluate_work_day('2a000000-0000-0000-0000-000000000042','phone-device-comparison','m23-pilot-v1','2026-07-31 11:30+00'),2,'End Work reevaluates the open gap without a new point');
select is((select finality from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000042' and safe_reason_code='no_current_release' and is_latest),'provisional_backfill_open','End Work closes active finality into backfill finality');
select ok(not exists(select 1 from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000042' and safe_reason_code='no_current_release' and is_latest and finality='provisional_active_work'),'no active open gap remains after End Work');
select is((select count(distinct authority_scope_key)::integer from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000042' and safe_reason_code='no_current_release'),1,'open gap scope identity remains stable through End Work');
select ok(not exists(select 1 from public.m23_comparison_pairs cp join public.m23_comparison_snapshots s on s.id=cp.snapshot_id where s.ad_work_day_id='2a000000-0000-0000-0000-000000000042' and s.safe_reason_code='no_current_release'),'open gap has no selected technical evidence');

-- A release gap must split when the enclosing assignment changes, even though
-- the safe reason remains no_current_release.  The two assignment episodes
-- deliberately use different driver and vehicle identities.
insert into public.drivers(id,name,phone,approval_status,onboarding_status)
values('2a000000-0000-0000-0000-000000000006','M23 Gap Context Driver B','900000002b','approved','approved');
insert into public.vehicles(id,vehicle_number,vehicle_type,onboarding_status,active)
values('2a000000-0000-0000-0000-000000000007','M23-GAP-CONTEXT-VEHICLE-B','van','approved',true);
insert into public.ad_works(id,title,tracking_type,mobile_location_proof_required)
values('2a000000-0000-0000-0000-000000000050','M23 Release Context Work','mobile',true);
insert into public.ad_work_assignments(id,ad_work_id,driver_id,vehicle_id,status)
values
  ('2a000000-0000-0000-0000-000000000051','2a000000-0000-0000-0000-000000000050','2a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000002','ready_for_execution'),
  ('2a000000-0000-0000-0000-000000000059','2a000000-0000-0000-0000-000000000050','2a000000-0000-0000-0000-000000000006','2a000000-0000-0000-0000-000000000007','ready_for_execution');
insert into public.ad_work_days(id,ad_work_id,work_date,driver_id,vehicle_id,execution_status,execution_started_at)
values('2a000000-0000-0000-0000-000000000052','2a000000-0000-0000-0000-000000000050','2026-07-31','2a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000002','running','2026-07-31 08:00+00');
insert into public.m21_assignment_history(id,assignment_id,ad_work_id,driver_id,vehicle_id,assignment_status,effective_from,effective_until,history_origin)
values
  ('2a000000-0000-0000-0000-000000000053','2a000000-0000-0000-0000-000000000051','2a000000-0000-0000-0000-000000000050','2a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000002','assigned','2026-07-31 08:00+00','2026-07-31 09:30+00','observed'),
  ('2a000000-0000-0000-0000-000000000054','2a000000-0000-0000-0000-000000000059','2a000000-0000-0000-0000-000000000050','2a000000-0000-0000-0000-000000000006','2a000000-0000-0000-0000-000000000007','assigned','2026-07-31 09:30+00','2026-07-31 11:00+00','observed');
insert into public.m21_release_history(id,ad_work_id,release_status,effective_from,effective_until,history_origin)
values
  ('2a000000-0000-0000-0000-000000000055','2a000000-0000-0000-0000-000000000050','released_to_driver','2026-07-31 08:00+00','2026-07-31 09:00+00','observed'),
  ('2a000000-0000-0000-0000-000000000056','2a000000-0000-0000-0000-000000000050','access_revoked','2026-07-31 09:00+00','2026-07-31 10:00+00','observed'),
  ('2a000000-0000-0000-0000-000000000057','2a000000-0000-0000-0000-000000000050','released_to_driver','2026-07-31 10:00+00','2026-07-31 11:00+00','observed');
insert into public.m21_execution_history(id,ad_work_day_id,execution_status,effective_from,effective_until,history_origin)
values('2a000000-0000-0000-0000-000000000058','2a000000-0000-0000-0000-000000000052','running','2026-07-31 08:00+00','2026-07-31 11:00+00','observed');
select is(public.m23_evaluate_work_day('2a000000-0000-0000-0000-000000000052','phone-device-comparison','m23-pilot-v1','2026-07-31 10:30+00'),4,'release gap splits into predecessor and successor assignment contexts');
select is((select count(*)::integer from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000052' and safe_reason_code='no_current_release'),2,'release gap has one scope per assignment context');
select is((select scope_effective_from from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000052' and assignment_history_id='2a000000-0000-0000-0000-000000000053' and safe_reason_code='no_current_release'),'2026-07-31 09:00+00'::timestamptz,'release gap A starts at release loss');
select is((select scope_effective_until from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000052' and assignment_history_id='2a000000-0000-0000-0000-000000000053' and safe_reason_code='no_current_release'),'2026-07-31 09:30+00'::timestamptz,'release gap A ends at assignment replacement');
select is((select scope_effective_from from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000052' and assignment_history_id='2a000000-0000-0000-0000-000000000054' and safe_reason_code='no_current_release'),'2026-07-31 09:30+00'::timestamptz,'release gap B starts at assignment replacement');
select is((select scope_effective_until from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000052' and assignment_history_id='2a000000-0000-0000-0000-000000000054' and safe_reason_code='no_current_release'),'2026-07-31 10:00+00'::timestamptz,'release gap B ends at restored release');
select is((select driver_id from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000052' and assignment_history_id='2a000000-0000-0000-0000-000000000054' and safe_reason_code='no_current_release'),'2a000000-0000-0000-0000-000000000006'::uuid,'release gap B retains its assignment driver');
select is((select vehicle_id from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000052' and assignment_history_id='2a000000-0000-0000-0000-000000000054' and safe_reason_code='no_current_release'),'2a000000-0000-0000-0000-000000000007'::uuid,'release gap B retains its assignment vehicle');
select is((select count(distinct authority_scope_key)::integer from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000052' and safe_reason_code='no_current_release'),2,'release context changes produce distinct stable scope keys');
select ok(not exists(select 1 from public.m23_comparison_pairs cp join public.m23_comparison_snapshots s on s.id=cp.snapshot_id where s.ad_work_day_id='2a000000-0000-0000-0000-000000000052' and s.safe_reason_code='no_current_release'),'release context gaps have no selected pairs');
select ok(not exists(select 1 from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000052' and safe_reason_code='no_current_release' and overall_outcome in ('phone_missing','physical_device_missing','both_missing','isolated_mismatch','sustained_mismatch')),'release context gaps have no missing or mismatch outcome');
select ok(not exists(select 1 from public.alerts a join public.m23_comparison_snapshots s on s.id=a.m23_comparison_snapshot_id where s.ad_work_day_id='2a000000-0000-0000-0000-000000000052' and s.safe_reason_code='no_current_release'),'release context gaps have no alert side effect');

-- A link gap must split when only the release-history context changes.
insert into public.ad_works(id,title,tracking_type,mobile_location_proof_required)
values('2a000000-0000-0000-0000-000000000060','M23 Release Link Context Work','both',true);
insert into public.ad_work_assignments(id,ad_work_id,driver_id,vehicle_id,status)
values('2a000000-0000-0000-0000-000000000061','2a000000-0000-0000-0000-000000000060','2a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000002','ready_for_execution');
insert into public.ad_work_days(id,ad_work_id,work_date,driver_id,vehicle_id,execution_status,execution_started_at)
values('2a000000-0000-0000-0000-000000000062','2a000000-0000-0000-0000-000000000060','2026-07-31','2a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000002','running','2026-07-31 08:00+00');
insert into public.m21_assignment_history(id,assignment_id,ad_work_id,driver_id,vehicle_id,assignment_status,effective_from,effective_until,history_origin)
values('2a000000-0000-0000-0000-000000000063','2a000000-0000-0000-0000-000000000061','2a000000-0000-0000-0000-000000000060','2a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000002','assigned','2026-07-31 08:00+00','2026-07-31 11:00+00','observed');
insert into public.m21_release_history(id,ad_work_id,release_status,effective_from,effective_until,history_origin)
values
  ('2a000000-0000-0000-0000-000000000064','2a000000-0000-0000-0000-000000000060','released_to_driver','2026-07-31 08:00+00','2026-07-31 09:30+00','observed'),
  ('2a000000-0000-0000-0000-000000000065','2a000000-0000-0000-0000-000000000060','released_to_driver','2026-07-31 09:30+00','2026-07-31 11:00+00','observed');
insert into public.m21_execution_history(id,ad_work_day_id,execution_status,effective_from,effective_until,history_origin)
values('2a000000-0000-0000-0000-000000000066','2a000000-0000-0000-0000-000000000062','running','2026-07-31 08:00+00','2026-07-31 11:00+00','observed');
select is(public.m23_evaluate_work_day('2a000000-0000-0000-0000-000000000062','phone-device-comparison','m23-pilot-v1','2026-07-31 10:30+00'),4,'link gap splits across release contexts');
select is((select count(*)::integer from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000062' and safe_reason_code='no_current_device_link'),2,'link gap has one scope per release context');
select is((select scope_effective_from from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000062' and release_history_id='2a000000-0000-0000-0000-000000000064' and safe_reason_code='no_current_device_link'),'2026-07-31 09:00+00'::timestamptz,'release-context link gap A starts at link loss');
select is((select scope_effective_until from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000062' and release_history_id='2a000000-0000-0000-0000-000000000064' and safe_reason_code='no_current_device_link'),'2026-07-31 09:30+00'::timestamptz,'release-context link gap A ends at release replacement');
select is((select scope_effective_from from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000062' and release_history_id='2a000000-0000-0000-0000-000000000065' and safe_reason_code='no_current_device_link'),'2026-07-31 09:30+00'::timestamptz,'release-context link gap B starts at release replacement');
select is((select scope_effective_until from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000062' and release_history_id='2a000000-0000-0000-0000-000000000065' and safe_reason_code='no_current_device_link'),'2026-07-31 10:00+00'::timestamptz,'release-context link gap B ends at link restoration');
select is((select count(distinct authority_scope_key)::integer from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000062' and safe_reason_code='no_current_device_link'),2,'release context changes produce distinct link-gap keys');
select ok(not exists(select 1 from public.m23_comparison_pairs cp join public.m23_comparison_snapshots s on s.id=cp.snapshot_id where s.ad_work_day_id='2a000000-0000-0000-0000-000000000062' and s.safe_reason_code='no_current_device_link'),'release-context link gaps have no selected pairs');
select ok(not exists(select 1 from public.alerts a join public.m23_comparison_snapshots s on s.id=a.m23_comparison_snapshot_id where s.ad_work_day_id='2a000000-0000-0000-0000-000000000062' and s.safe_reason_code='no_current_device_link'),'release-context link gaps have no alert side effect');

-- A link gap must also split when the assignment-history context changes.
insert into public.ad_works(id,title,tracking_type,mobile_location_proof_required)
values('2a000000-0000-0000-0000-000000000070','M23 Assignment Link Context Work','both',true);
insert into public.ad_work_assignments(id,ad_work_id,driver_id,vehicle_id,status)
values
  ('2a000000-0000-0000-0000-000000000071','2a000000-0000-0000-0000-000000000070','2a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000002','ready_for_execution'),
  ('2a000000-0000-0000-0000-000000000072','2a000000-0000-0000-0000-000000000070','2a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000002','ready_for_execution');
insert into public.ad_work_days(id,ad_work_id,work_date,driver_id,vehicle_id,execution_status,execution_started_at)
values('2a000000-0000-0000-0000-000000000073','2a000000-0000-0000-0000-000000000070','2026-07-31','2a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000002','running','2026-07-31 08:00+00');
insert into public.m21_assignment_history(id,assignment_id,ad_work_id,driver_id,vehicle_id,assignment_status,effective_from,effective_until,history_origin)
values
  ('2a000000-0000-0000-0000-000000000074','2a000000-0000-0000-0000-000000000071','2a000000-0000-0000-0000-000000000070','2a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000002','assigned','2026-07-31 08:00+00','2026-07-31 09:30+00','observed'),
  ('2a000000-0000-0000-0000-000000000075','2a000000-0000-0000-0000-000000000072','2a000000-0000-0000-0000-000000000070','2a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000002','assigned','2026-07-31 09:30+00','2026-07-31 11:00+00','observed');
insert into public.m21_release_history(id,ad_work_id,release_status,effective_from,effective_until,history_origin)
values('2a000000-0000-0000-0000-000000000076','2a000000-0000-0000-0000-000000000070','released_to_driver','2026-07-31 08:00+00','2026-07-31 11:00+00','observed');
insert into public.m21_execution_history(id,ad_work_day_id,execution_status,effective_from,effective_until,history_origin)
values('2a000000-0000-0000-0000-000000000077','2a000000-0000-0000-0000-000000000073','running','2026-07-31 08:00+00','2026-07-31 11:00+00','observed');
select is(public.m23_evaluate_work_day('2a000000-0000-0000-0000-000000000073','phone-device-comparison','m23-pilot-v1','2026-07-31 10:30+00'),4,'link gap splits across assignment contexts');
select is((select count(*)::integer from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000073' and safe_reason_code='no_current_device_link'),2,'assignment-context link gap has two scopes');
select is((select scope_effective_from from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000073' and assignment_history_id='2a000000-0000-0000-0000-000000000074' and safe_reason_code='no_current_device_link'),'2026-07-31 09:00+00'::timestamptz,'assignment-context link gap A starts at link loss');
select is((select scope_effective_until from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000073' and assignment_history_id='2a000000-0000-0000-0000-000000000074' and safe_reason_code='no_current_device_link'),'2026-07-31 09:30+00'::timestamptz,'assignment-context link gap A ends at assignment replacement');
select is((select scope_effective_from from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000073' and assignment_history_id='2a000000-0000-0000-0000-000000000075' and safe_reason_code='no_current_device_link'),'2026-07-31 09:30+00'::timestamptz,'assignment-context link gap B starts at assignment replacement');
select is((select scope_effective_until from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000073' and assignment_history_id='2a000000-0000-0000-0000-000000000075' and safe_reason_code='no_current_device_link'),'2026-07-31 10:00+00'::timestamptz,'assignment-context link gap B ends at link restoration');
select is((select count(distinct authority_scope_key)::integer from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000073' and safe_reason_code='no_current_device_link'),2,'assignment context changes produce distinct link-gap keys');
select ok(not exists(select 1 from public.m23_comparison_pairs cp join public.m23_comparison_snapshots s on s.id=cp.snapshot_id where s.ad_work_day_id='2a000000-0000-0000-0000-000000000073' and s.safe_reason_code='no_current_device_link'),'assignment-context link gaps have no selected pairs');

select * from finish();
rollback;
