begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

insert into public.drivers(id,name,phone,approval_status,onboarding_status)
values('28000000-0000-0000-0000-000000000001','M23 Replacement Driver','9000000028','approved','approved');
insert into public.vehicles(id,vehicle_number,vehicle_type,onboarding_status,active)
values('28000000-0000-0000-0000-000000000002','M23-REPLACEMENT-VEHICLE','van','approved',true);
insert into public.user_profiles(auth_user_id,display_name,role)
values('28000000-0000-0000-0000-000000000003','M23 Replacement Admin','admin');
insert into public.gps_devices(id,device_code,vendor,model,adapter_type,protocol_type,status,installation_state,gps_readiness,gsm_readiness)
values
  ('28000000-0000-0000-0000-000000000004','M23-REPLACEMENT-A','Synthetic','M23','generic_http','https','active','installed','ready','ready'),
  ('28000000-0000-0000-0000-000000000005','M23-REPLACEMENT-B','Synthetic','M23','generic_http','https','active','installed','ready','ready'),
  ('28000000-0000-0000-0000-000000000018','M23-REPLACEMENT-C','Synthetic','M23','generic_http','https','active','installed','ready','ready');
insert into public.gps_device_credential_metadata(id,gps_device_id,credential_key_id,status,verification_material_hash,issued_at,expires_at,created_by_admin)
values('28000000-0000-0000-0000-000000000006','28000000-0000-0000-0000-000000000004','m23-replacement-key','active',repeat('b',64),'2026-07-31 07:00+00','2026-08-01 07:00+00','28000000-0000-0000-0000-000000000003');
insert into public.ad_works(id,title,tracking_type,mobile_location_proof_required)
values('28000000-0000-0000-0000-000000000007','M23 Replacement Work','both',true);
insert into public.ad_work_assignments(id,ad_work_id,driver_id,vehicle_id,status)
values('28000000-0000-0000-0000-000000000008','28000000-0000-0000-0000-000000000007','28000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000002','ready_for_execution');
insert into public.ad_work_days(id,ad_work_id,work_date,driver_id,vehicle_id,execution_status,execution_started_at)
values('28000000-0000-0000-0000-000000000009','28000000-0000-0000-0000-000000000007','2026-07-31','28000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000002','running','2026-07-31 08:00+00');
insert into public.m21_assignment_history(id,assignment_id,ad_work_id,driver_id,vehicle_id,assignment_status,effective_from,effective_until,history_origin)
values('28000000-0000-0000-0000-000000000010','28000000-0000-0000-0000-000000000008','28000000-0000-0000-0000-000000000007','28000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000002','assigned','2026-07-31 08:00+00','2026-07-31 10:00+00','observed');
insert into public.m21_release_history(id,ad_work_id,release_status,effective_from,effective_until,history_origin)
values('28000000-0000-0000-0000-000000000011','28000000-0000-0000-0000-000000000007','released_to_driver','2026-07-31 08:00+00','2026-07-31 10:00+00','observed');
insert into public.m21_execution_history(id,ad_work_day_id,execution_status,effective_from,effective_until,history_origin)
values('28000000-0000-0000-0000-000000000012','28000000-0000-0000-0000-000000000009','running','2026-07-31 08:00+00','2026-07-31 10:00+00','observed');
insert into public.gps_device_vehicle_links(id,gps_device_id,vehicle_id,is_primary,effective_from,effective_until,change_reason,created_by_admin,closed_by_admin,closed_at)
values
  ('28000000-0000-0000-0000-000000000013','28000000-0000-0000-0000-000000000004','28000000-0000-0000-0000-000000000002',true,'2026-07-31 08:00+00','2026-07-31 09:00+00','M23 replacement A','28000000-0000-0000-0000-000000000003','28000000-0000-0000-0000-000000000003','2026-07-31 09:00+00'),
  ('28000000-0000-0000-0000-000000000014','28000000-0000-0000-0000-000000000005','28000000-0000-0000-0000-000000000002',true,'2026-07-31 09:00+00',null,'M23 replacement B','28000000-0000-0000-0000-000000000003',null,null);
insert into public.tracking_sessions(id,ad_work_day_id,ad_work_id,source_type,status,started_at,tracking_mode,driver_id,vehicle_id,synthetic)
values('28000000-0000-0000-0000-000000000015','28000000-0000-0000-0000-000000000009','28000000-0000-0000-0000-000000000007','mobile','running','2026-07-31 08:00+00','phone_location','28000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000002',true);
insert into public.tracking_sessions(id,ad_work_day_id,ad_work_id,assignment_id,source_type,status,started_at,tracking_mode,driver_id,vehicle_id,gps_device_id,gps_device_vehicle_link_id,assignment_history_id,execution_history_id,synthetic)
values
  ('28000000-0000-0000-0000-000000000016','28000000-0000-0000-0000-000000000009','28000000-0000-0000-0000-000000000007','28000000-0000-0000-0000-000000000008','device','running','2026-07-31 08:00+00','physical_device','28000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000002','28000000-0000-0000-0000-000000000004','28000000-0000-0000-0000-000000000013','28000000-0000-0000-0000-000000000010','28000000-0000-0000-0000-000000000012',true),
  ('28000000-0000-0000-0000-000000000017','28000000-0000-0000-0000-000000000009','28000000-0000-0000-0000-000000000007','28000000-0000-0000-0000-000000000008','device','running','2026-07-31 09:00+00','physical_device','28000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000002','28000000-0000-0000-0000-000000000005','28000000-0000-0000-0000-000000000014','28000000-0000-0000-0000-000000000010','28000000-0000-0000-0000-000000000012',true);
insert into public.location_points(id,tracking_session_id,source,driver_id,vehicle_id,recorded_at,received_at,lat,lng,accuracy_meters,quality,ad_work_id,ad_work_day_id,assignment_id,assignment_history_id,execution_history_id,synthetic)
values
  ('28100000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000015','phone','28000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000002','2026-07-31 08:10+00','2026-07-31 08:10+00',17,78,10,'good','28000000-0000-0000-0000-000000000007','28000000-0000-0000-0000-000000000009','28000000-0000-0000-0000-000000000008','28000000-0000-0000-0000-000000000010','28000000-0000-0000-0000-000000000012',true),
  ('28100000-0000-0000-0000-000000000002','28000000-0000-0000-0000-000000000015','phone','28000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000002','2026-07-31 08:50+00','2026-07-31 08:50+00',17,78,10,'good','28000000-0000-0000-0000-000000000007','28000000-0000-0000-0000-000000000009','28000000-0000-0000-0000-000000000008','28000000-0000-0000-0000-000000000010','28000000-0000-0000-0000-000000000012',true),
  ('28100000-0000-0000-0000-000000000003','28000000-0000-0000-0000-000000000015','phone','28000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000002','2026-07-31 09:00+00','2026-07-31 09:00+00',17,78,10,'good','28000000-0000-0000-0000-000000000007','28000000-0000-0000-0000-000000000009','28000000-0000-0000-0000-000000000008','28000000-0000-0000-0000-000000000010','28000000-0000-0000-0000-000000000012',true),
  ('28100000-0000-0000-0000-000000000004','28000000-0000-0000-0000-000000000015','phone','28000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000002','2026-07-31 09:10+00','2026-07-31 09:10+00',17,78,10,'good','28000000-0000-0000-0000-000000000007','28000000-0000-0000-0000-000000000009','28000000-0000-0000-0000-000000000008','28000000-0000-0000-0000-000000000010','28000000-0000-0000-0000-000000000012',true);
insert into public.telemetry_receipts(id,gps_device_id,credential_id,adapter_id,adapter_version,idempotency_identity,content_hash,raw_payload_hash,captured_at,received_at,normalized_at,disposition,reason_code,freshness,offline_backfill,quality,synthetic,processing_version,ad_work_id,ad_work_day_id,assignment_id,driver_id,vehicle_id,gps_device_vehicle_link_id,assignment_history_id,execution_history_id,tracking_session_id)
select format('28200000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,
  case when n<=2 then '28000000-0000-0000-0000-000000000004'::uuid else '28000000-0000-0000-0000-000000000005'::uuid end,
  '28000000-0000-0000-0000-000000000006','m23','1',format('m23-replacement-%s',n),repeat('a',64),repeat('c',64),at,at,at,'accepted_live','accepted','live',false,'valid',true,'m23','28000000-0000-0000-0000-000000000007','28000000-0000-0000-0000-000000000009','28000000-0000-0000-0000-000000000008','28000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000002',case when n<=2 then '28000000-0000-0000-0000-000000000013'::uuid else '28000000-0000-0000-0000-000000000014'::uuid end,'28000000-0000-0000-0000-000000000010','28000000-0000-0000-0000-000000000012',case when n<=2 then '28000000-0000-0000-0000-000000000016'::uuid else '28000000-0000-0000-0000-000000000017'::uuid end
from (values (1,'2026-07-31 08:10+00'::timestamptz),(2,'2026-07-31 08:50+00'),(3,'2026-07-31 09:00+00'),(4,'2026-07-31 09:10+00')) p(n,at);
insert into public.location_points(id,tracking_session_id,source,device_id,driver_id,vehicle_id,recorded_at,received_at,lat,lng,accuracy_meters,quality,ad_work_id,ad_work_day_id,assignment_id,telemetry_receipt_id,altitude_meters,satellite_count,freshness,offline_backfill,synthetic,gps_device_vehicle_link_id,assignment_history_id,execution_history_id)
select format('28300000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,
  case when n<=2 then '28000000-0000-0000-0000-000000000016'::uuid else '28000000-0000-0000-0000-000000000017'::uuid end,
  'physical_device',case when n<=2 then '28000000-0000-0000-0000-000000000004'::uuid else '28000000-0000-0000-0000-000000000005'::uuid end,'28000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000002',at,at,17,78,10,'good','28000000-0000-0000-0000-000000000007','28000000-0000-0000-0000-000000000009','28000000-0000-0000-0000-000000000008',format('28200000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,0,10,'live',false,true,case when n<=2 then '28000000-0000-0000-0000-000000000013'::uuid else '28000000-0000-0000-0000-000000000014'::uuid end,'28000000-0000-0000-0000-000000000010','28000000-0000-0000-0000-000000000012'
from (values (1,'2026-07-31 08:10+00'::timestamptz),(2,'2026-07-31 08:50+00'),(3,'2026-07-31 09:00+00'),(4,'2026-07-31 09:10+00')) p(n,at);

select is(public.m23_evaluate_work_day('28000000-0000-0000-0000-000000000009','phone-device-comparison','m23-pilot-v1','2026-07-31 09:20+00'),2,'one running execution with two sequential links produces two scopes');
select is((select count(*)::integer from public.m23_comparison_snapshots where ad_work_day_id='28000000-0000-0000-0000-000000000009'),2,'sequential replacement produces two snapshots');
select ok(not exists(select 1 from public.m23_comparison_snapshots where ad_work_day_id='28000000-0000-0000-0000-000000000009' and overall_outcome='comparison_unavailable'),'sequential non-overlapping links are not ambiguous');
select is((select count(*)::integer from public.m23_comparison_pairs where snapshot_id in (select id from public.m23_comparison_snapshots where gps_device_vehicle_link_id='28000000-0000-0000-0000-000000000013')),2,'points before replacement pair only with device A');
select is((select count(*)::integer from public.m23_comparison_pairs where snapshot_id in (select id from public.m23_comparison_snapshots where gps_device_vehicle_link_id='28000000-0000-0000-0000-000000000014')),2,'points after replacement pair only with device B');
select ok(not exists(select 1 from public.m23_comparison_pairs cp join public.m23_comparison_snapshots s on s.id=cp.snapshot_id where s.gps_device_vehicle_link_id='28000000-0000-0000-0000-000000000013' and cp.physical_point_id in ('28300000-0000-0000-0000-000000000003','28300000-0000-0000-0000-000000000004')),'no pair crosses the replacement boundary');
select ok(exists(select 1 from public.m23_comparison_pairs cp join public.m23_comparison_snapshots s on s.id=cp.snapshot_id where s.gps_device_vehicle_link_id='28000000-0000-0000-0000-000000000014' and cp.phone_captured_at='2026-07-31 09:00+00' and cp.physical_captured_at='2026-07-31 09:00+00'),'exact boundary capture belongs to the replacement scope');

update public.ad_work_days
set execution_status='completed',execution_completed_at=clock_timestamp()
where id='28000000-0000-0000-0000-000000000009';
select ok(exists(select 1 from public.m21_execution_history where ad_work_day_id='28000000-0000-0000-0000-000000000009' and execution_status='completed'),'End Work records a subsequent completed history row');
select is(public.m23_evaluate_work_day('28000000-0000-0000-0000-000000000009','phone-device-comparison','m23-pilot-v1','2026-07-31 10:30+00'),2,'completed execution history does not create a second authority scope');
select is((select count(distinct execution_history_id)::integer from public.m23_comparison_snapshots where ad_work_day_id='28000000-0000-0000-0000-000000000009'),1,'ended running history remains the only snapshot authority through finality');
select ok(not exists(select 1 from public.m23_comparison_snapshots where ad_work_day_id='28000000-0000-0000-0000-000000000009' and overall_outcome in ('comparison_unavailable','phone_missing','physical_device_missing','both_missing')),'completed history does not introduce missing or unavailable outcomes');
select public.m23_evaluate_scope('28000000-0000-0000-0000-000000000009','28000000-0000-0000-0000-000000000012','28000000-0000-0000-0000-000000000010',null,null,'phone-device-comparison','m23-pilot-v1','2026-07-31 10:30+00');
select is((select overall_outcome from public.m23_comparison_snapshots where ad_work_day_id='28000000-0000-0000-0000-000000000009' order by created_at desc,id desc limit 1),'comparison_unavailable','an incomplete device authority shape fails closed once');
select is((select count(*)::integer from public.m23_comparison_pairs where snapshot_id=(select id from public.m23_comparison_snapshots where ad_work_day_id='28000000-0000-0000-0000-000000000009' order by created_at desc,id desc limit 1)),0,'fail-closed authority context contains no technical pair detail');

update public.m23_comparison_jobs set state='completed',completed_at=clock_timestamp(),locked_at=null,processing_generation=requested_generation,completed_generation=requested_generation,dirty_after_claim=false,safe_failure_reason_code=null where ad_work_day_id='28000000-0000-0000-0000-000000000009';
update public.gps_device_vehicle_links set effective_until='2026-07-31 09:30+00',closed_by_admin='28000000-0000-0000-0000-000000000003',closed_at='2026-07-31 09:30+00' where id='28000000-0000-0000-0000-000000000014';
insert into public.gps_device_vehicle_links(id,gps_device_id,vehicle_id,is_primary,effective_from,effective_until,change_reason,created_by_admin,closed_by_admin,closed_at)
values('28000000-0000-0000-0000-000000000019','28000000-0000-0000-0000-000000000018','28000000-0000-0000-0000-000000000002',true,'2026-07-31 09:30+00','2026-07-31 10:00+00','M23 replacement C','28000000-0000-0000-0000-000000000003','28000000-0000-0000-0000-000000000003','2026-07-31 10:00+00');
select ok((select state='pending' and requested_generation>completed_generation from public.m23_comparison_jobs where ad_work_day_id='28000000-0000-0000-0000-000000000009'),'link closure and replacement enqueue work without a new point');

-- A synthetic/non-synthetic change is a new evidence classification for the
-- same immutable authority scope.  It must not be paired or converted into a
-- missing-source result, and a link closure must retain the same scope key.
update public.location_points
set synthetic=false
where id='28100000-0000-0000-0000-000000000004';
select public.m23_evaluate_scope('28000000-0000-0000-0000-000000000009','28000000-0000-0000-0000-000000000012','28000000-0000-0000-0000-000000000010','28000000-0000-0000-0000-000000000014','28000000-0000-0000-0000-000000000005','phone-device-comparison','m23-pilot-v1','2026-07-31 09:20+00');
select is((select count(*)::integer from public.m23_comparison_snapshots where gps_device_vehicle_link_id='28000000-0000-0000-0000-000000000014'),2,'evidence classification successor remains in the same link scope');
select is((select count(*)::integer from public.m23_comparison_snapshots where gps_device_vehicle_link_id='28000000-0000-0000-0000-000000000014' and overall_outcome='paired_match'),1,'the original all-synthetic snapshot remains paired');
select is((select overall_outcome from public.m23_comparison_snapshots where gps_device_vehicle_link_id='28000000-0000-0000-0000-000000000014' order by created_at desc,id desc limit 1),'comparison_unavailable','mixed evidence fails closed');
select is((select safe_reason_code from public.m23_comparison_snapshots where gps_device_vehicle_link_id='28000000-0000-0000-0000-000000000014' order by created_at desc,id desc limit 1),'mixed_evidence_classification','mixed evidence has a bounded safe reason');
select is((select synthetic from public.m23_comparison_snapshots where gps_device_vehicle_link_id='28000000-0000-0000-0000-000000000014' order by created_at desc,id desc limit 1),false,'mixed evidence is not concealed as synthetic');
select is((select pair_count from public.m23_comparison_snapshots where gps_device_vehicle_link_id='28000000-0000-0000-0000-000000000014' order by created_at desc,id desc limit 1),0,'mixed evidence creates no selected pairs');
select is((select scope_effective_from from public.m23_comparison_snapshots where gps_device_vehicle_link_id='28000000-0000-0000-0000-000000000014' order by created_at desc,id desc limit 1),'2026-07-31 09:00+00'::timestamptz,'scope start is persisted exactly');
select is((select scope_effective_until from public.m23_comparison_snapshots where gps_device_vehicle_link_id='28000000-0000-0000-0000-000000000014' order by created_at desc,id desc limit 1),'2026-07-31 09:30+00'::timestamptz,'scope closure is persisted exactly');
select is((select count(distinct authority_scope_key)::integer from public.m23_comparison_snapshots where gps_device_vehicle_link_id='28000000-0000-0000-0000-000000000014'),1,'scope identity excludes interval closure');
select ok(not exists(select 1 from public.alerts a join public.m23_comparison_snapshots s on s.id=a.m23_comparison_snapshot_id where s.gps_device_vehicle_link_id='28000000-0000-0000-0000-000000000014' and s.overall_outcome='comparison_unavailable'),'mixed evidence creates no false missing or mismatch alert');

-- A supplied inactive/nonexistent assignment identity must fail closed even
-- when the driver, vehicle, release, link and device values are otherwise
-- valid.  The function must not compare by UUID-shaped input alone.
select public.m23_evaluate_scope('28000000-0000-0000-0000-000000000009','28000000-0000-0000-0000-000000000012','28000000-0000-0000-0000-000000000023','28000000-0000-0000-0000-000000000014','28000000-0000-0000-0000-000000000005','phone-device-comparison','m23-pilot-v1','2026-07-31 09:20+00');
select is((select overall_outcome from public.m23_comparison_snapshots where ad_work_day_id='28000000-0000-0000-0000-000000000009' and assignment_history_id is null order by created_at desc,id desc limit 1),'comparison_unavailable','inactive assignment fails closed');
select is((select safe_reason_code from public.m23_comparison_snapshots where ad_work_day_id='28000000-0000-0000-0000-000000000009' and assignment_history_id is null order by created_at desc,id desc limit 1),'inactive_assignment','inactive assignment has a bounded safe reason');
select ok(not exists(select 1 from public.m23_comparison_snapshots where ad_work_day_id='28000000-0000-0000-0000-000000000009' and assignment_history_id is null and overall_outcome in ('phone_missing','physical_device_missing','both_missing')),'inactive assignment does not produce a false missing-source outcome');
select is((select pair_count from public.m23_comparison_snapshots where ad_work_day_id='28000000-0000-0000-0000-000000000009' and assignment_history_id is null order by created_at desc,id desc limit 1),0,'inactive assignment scope contains no pairs');
select ok(not exists(select 1 from public.alerts a join public.m23_comparison_snapshots s on s.id=a.m23_comparison_snapshot_id where s.ad_work_day_id='28000000-0000-0000-0000-000000000009' and s.assignment_history_id is null),'inactive assignment has no customer-side alert effect');
select * from finish();
rollback;
