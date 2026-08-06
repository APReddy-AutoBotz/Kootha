begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

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

select is(public.m23_evaluate_work_day('2a000000-0000-0000-0000-000000000012','phone-device-comparison','m23-pilot-v1','2026-07-31 09:30+00'),2,'assignment history and current assignment gap are evaluated separately');
select is((select count(*)::integer from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000012' and safe_reason_code='no_current_assignment'),1,'assignment gap creates one deterministic gap scope');
select is((select overall_outcome from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000012' and safe_reason_code='no_current_assignment'),'comparison_unavailable','assignment gap fails closed');
select is((select pair_count from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000012' and safe_reason_code='no_current_assignment'),0,'assignment gap contains no pairs');
select ok(not exists(select 1 from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000012' and overall_outcome in ('phone_missing','physical_device_missing','both_missing')),'assignment gap is not misclassified as missing source');
select is(public.m23_evaluate_work_day('2a000000-0000-0000-0000-000000000012','phone-device-comparison','m23-pilot-v1','2026-07-31 10:30+00'),2,'later assignment episode is evaluated without replacing the historical episode');
select ok(exists(select 1 from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000012' and assignment_history_id='2a000000-0000-0000-0000-000000000014'),'later assignment history is a separate scope');
select is((select count(*)::integer from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000012' and safe_reason_code='no_current_assignment'),1,'repeated current assessment does not create a second assignment gap');

select is(public.m23_evaluate_work_day('2a000000-0000-0000-0000-000000000022','phone-device-comparison','m23-pilot-v1','2026-07-31 09:30+00'),2,'release history and current release gap are evaluated separately');
select ok(exists(select 1 from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000022' and release_history_id='2a000000-0000-0000-0000-000000000025'),'release episode A is retained');
select is((select count(*)::integer from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000022' and safe_reason_code='no_current_release'),1,'release gap creates one scope');
select is((select overall_outcome from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000022' and safe_reason_code='no_current_release'),'comparison_unavailable','release gap fails closed');
select ok(not exists(select 1 from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000022' and safe_reason_code='ambiguous_release_authority'),'sequential releases are not globally marked ambiguous');
select is(public.m23_evaluate_work_day('2a000000-0000-0000-0000-000000000022','phone-device-comparison','m23-pilot-v1','2026-07-31 10:30+00'),2,'release episode B is independently evaluated');
select ok(exists(select 1 from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000022' and release_history_id='2a000000-0000-0000-0000-000000000027'),'release episode B is a separate scope');
select is((select count(*)::integer from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000022' and safe_reason_code='no_current_release'),1,'release gap remains one stable historical record');

select is(public.m23_evaluate_work_day('2a000000-0000-0000-0000-000000000032','phone-device-comparison','m23-pilot-v1','2026-07-31 09:30+00'),2,'link history and current link gap are evaluated separately');
select ok(exists(select 1 from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000032' and gps_device_vehicle_link_id='2a000000-0000-0000-0000-000000000043'),'link episode A is retained');
select is((select count(*)::integer from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000032' and safe_reason_code='no_current_device_link'),1,'link gap creates one scope');
select is((select overall_outcome from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000032' and safe_reason_code='no_current_device_link'),'comparison_unavailable','link gap fails closed');
select is((select pair_count from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000032' and safe_reason_code='no_current_device_link'),0,'link gap contains no pairs');
select is(public.m23_evaluate_work_day('2a000000-0000-0000-0000-000000000032','phone-device-comparison','m23-pilot-v1','2026-07-31 10:30+00'),2,'later link episode is independently evaluated');
select ok(exists(select 1 from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000032' and gps_device_vehicle_link_id='2a000000-0000-0000-0000-000000000044'),'link episode B is a separate scope');
select is((select count(*)::integer from public.m23_comparison_snapshots where ad_work_day_id='2a000000-0000-0000-0000-000000000032' and safe_reason_code='no_current_device_link'),1,'link gap remains one stable historical record');

select * from finish();
rollback;
