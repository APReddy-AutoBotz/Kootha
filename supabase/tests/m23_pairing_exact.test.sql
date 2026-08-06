begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

insert into public.drivers(id,name,phone,approval_status,onboarding_status)
values('29000000-0000-0000-0000-000000000001','M23 Pairing Driver','9000000029','approved','approved');
insert into public.vehicles(id,vehicle_number,vehicle_type,onboarding_status,active)
values('29000000-0000-0000-0000-000000000002','M23-PAIRING-VEHICLE','van','approved',true);
insert into public.user_profiles(auth_user_id,display_name,role)
values('29000000-0000-0000-0000-000000000014','M23 Pairing Admin','admin');
insert into public.ad_works(id,title,tracking_type,mobile_location_proof_required)
values('29000000-0000-0000-0000-000000000003','M23 Pairing Work','both',true);
insert into public.ad_work_assignments(id,ad_work_id,driver_id,vehicle_id,status)
values('29000000-0000-0000-0000-000000000004','29000000-0000-0000-0000-000000000003','29000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000002','ready_for_execution');
insert into public.ad_work_days(id,ad_work_id,work_date,driver_id,vehicle_id,execution_status,execution_started_at)
values('29000000-0000-0000-0000-000000000005','29000000-0000-0000-0000-000000000003','2026-07-31','29000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000002','running','2026-07-31 08:00+00');
insert into public.m21_assignment_history(id,assignment_id,ad_work_id,driver_id,vehicle_id,assignment_status,effective_from,effective_until,history_origin)
values('29000000-0000-0000-0000-000000000006','29000000-0000-0000-0000-000000000004','29000000-0000-0000-0000-000000000003','29000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000002','assigned','2026-07-31 08:00+00','2026-07-31 09:00+00','observed');
insert into public.m21_release_history(id,ad_work_id,release_status,effective_from,effective_until,history_origin)
values('29000000-0000-0000-0000-000000000007','29000000-0000-0000-0000-000000000003','released_to_driver','2026-07-31 08:00+00','2026-07-31 09:00+00','observed');
insert into public.m21_execution_history(id,ad_work_day_id,execution_status,effective_from,effective_until,history_origin)
values('29000000-0000-0000-0000-000000000008','29000000-0000-0000-0000-000000000005','running','2026-07-31 08:00+00','2026-07-31 09:00+00','observed');
insert into public.gps_devices(id,device_code,vendor,model,adapter_type,protocol_type,status,installation_state,gps_readiness,gsm_readiness)
values('29000000-0000-0000-0000-000000000009','M23-PAIRING-DEVICE','Synthetic','M23','generic_http','https','active','installed','ready','ready');
insert into public.gps_device_vehicle_links(id,gps_device_id,vehicle_id,is_primary,effective_from,effective_until,change_reason,created_by_admin,closed_by_admin,closed_at)
values('29000000-0000-0000-0000-000000000010','29000000-0000-0000-0000-000000000009','29000000-0000-0000-0000-000000000002',true,'2026-07-31 08:00+00','2026-07-31 09:00+00','M23 pairing','29000000-0000-0000-0000-000000000014','29000000-0000-0000-0000-000000000014','2026-07-31 09:00+00');
insert into public.tracking_sessions(id,ad_work_day_id,ad_work_id,assignment_id,source_type,status,started_at,tracking_mode,driver_id,vehicle_id,gps_device_id,gps_device_vehicle_link_id,assignment_history_id,execution_history_id,synthetic)
values
 ('29000000-0000-0000-0000-000000000011','29000000-0000-0000-0000-000000000005','29000000-0000-0000-0000-000000000003','29000000-0000-0000-0000-000000000004','device','running','2026-07-31 08:00+00','physical_device','29000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000002','29000000-0000-0000-0000-000000000009','29000000-0000-0000-0000-000000000010','29000000-0000-0000-0000-000000000006','29000000-0000-0000-0000-000000000008',true),
 ('29000000-0000-0000-0000-000000000012','29000000-0000-0000-0000-000000000005','29000000-0000-0000-0000-000000000003',null,'mobile','running','2026-07-31 08:00+00','phone_location','29000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000002',null,null,null,null,true);
insert into public.gps_device_credential_metadata(id,gps_device_id,credential_key_id,status,verification_material_hash,issued_at,expires_at,created_by_admin)
values('29000000-0000-0000-0000-000000000013','29000000-0000-0000-0000-000000000009','m23-pair-key','active',repeat('a',64),'2026-07-31 07:00+00','2026-08-01 07:00+00','29000000-0000-0000-0000-000000000014');
insert into public.location_points(id,tracking_session_id,source,device_id,driver_id,vehicle_id,recorded_at,received_at,lat,lng,accuracy_meters,quality,ad_work_id,ad_work_day_id,assignment_id,telemetry_receipt_id,synthetic,gps_device_vehicle_link_id,assignment_history_id,execution_history_id)
values
 ('29100000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000012','phone',null,'29000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000002','2026-07-31 08:00:00+00','2026-07-31 08:00:00+00',17,78,10,'good','29000000-0000-0000-0000-000000000003','29000000-0000-0000-0000-000000000005','29000000-0000-0000-0000-000000000004',null,true,null,'29000000-0000-0000-0000-000000000006','29000000-0000-0000-0000-000000000008'),
 ('29100000-0000-0000-0000-000000000002','29000000-0000-0000-0000-000000000012','phone',null,'29000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000002','2026-07-31 08:00:05+00','2026-07-31 08:00:05+00',17,78,10,'good','29000000-0000-0000-0000-000000000003','29000000-0000-0000-0000-000000000005','29000000-0000-0000-0000-000000000004',null,true,null,'29000000-0000-0000-0000-000000000006','29000000-0000-0000-0000-000000000008'),
 ('29100000-0000-0000-0000-000000000003','29000000-0000-0000-0000-000000000012','phone',null,'29000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000002','2026-07-31 08:03:00+00','2026-07-31 08:03:00+00',17,78,10,'good','29000000-0000-0000-0000-000000000003','29000000-0000-0000-0000-000000000005','29000000-0000-0000-0000-000000000004',null,true,null,'29000000-0000-0000-0000-000000000006','29000000-0000-0000-0000-000000000008'),
 ('29100000-0000-0000-0000-000000000004','29000000-0000-0000-0000-000000000012','phone',null,'29000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000002','2026-07-31 08:05:00+00','2026-07-31 08:05:00+00',17,78,10,'good','29000000-0000-0000-0000-000000000003','29000000-0000-0000-0000-000000000005','29000000-0000-0000-0000-000000000004',null,true,null,'29000000-0000-0000-0000-000000000006','29000000-0000-0000-0000-000000000008'),
 ('29100000-0000-0000-0000-000000000005','29000000-0000-0000-0000-000000000012','phone',null,'29000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000002','2026-07-31 08:07:00+00','2026-07-31 08:07:00+00',17,78,10,'good','29000000-0000-0000-0000-000000000003','29000000-0000-0000-0000-000000000005','29000000-0000-0000-0000-000000000004',null,true,null,'29000000-0000-0000-0000-000000000006','29000000-0000-0000-0000-000000000008');
insert into public.telemetry_receipts(id,gps_device_id,credential_id,adapter_id,adapter_version,idempotency_identity,content_hash,raw_payload_hash,captured_at,received_at,normalized_at,disposition,reason_code,freshness,offline_backfill,quality,synthetic,processing_version,ad_work_id,ad_work_day_id,assignment_id,driver_id,vehicle_id,gps_device_vehicle_link_id,assignment_history_id,execution_history_id,tracking_session_id)
select format('29200000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,'29000000-0000-0000-0000-000000000009','29000000-0000-0000-0000-000000000013','m23','1',format('m23-pair-%s',n),repeat('b',64),repeat('c',64),at,at,at,'accepted_live','accepted','live',false,'valid',true,'m23','29000000-0000-0000-0000-000000000003','29000000-0000-0000-0000-000000000005','29000000-0000-0000-0000-000000000004','29000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000002','29000000-0000-0000-0000-000000000010','29000000-0000-0000-0000-000000000006','29000000-0000-0000-0000-000000000008','29000000-0000-0000-0000-000000000011'
from (values (1,'2026-07-31 08:00:04+00'::timestamptz),(2,'2026-07-31 08:00:50+00'),(3,'2026-07-31 08:03:05+00'),(4,'2026-07-31 08:04:50+00'),(5,'2026-07-31 08:05:10+00'),(6,'2026-07-31 08:08:00+00')) p(n,at);
insert into public.location_points(id,tracking_session_id,source,device_id,driver_id,vehicle_id,recorded_at,received_at,lat,lng,accuracy_meters,quality,ad_work_id,ad_work_day_id,assignment_id,telemetry_receipt_id,synthetic,gps_device_vehicle_link_id,assignment_history_id,execution_history_id)
select format('29300000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,'29000000-0000-0000-0000-000000000011','physical_device','29000000-0000-0000-0000-000000000009','29000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000002',at,at,17,78,10,'good','29000000-0000-0000-0000-000000000003','29000000-0000-0000-0000-000000000005','29000000-0000-0000-0000-000000000004',format('29200000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,true,'29000000-0000-0000-0000-000000000010','29000000-0000-0000-0000-000000000006','29000000-0000-0000-0000-000000000008'
from (values (1,'2026-07-31 08:00:04+00'::timestamptz),(2,'2026-07-31 08:00:50+00'),(3,'2026-07-31 08:03:05+00'),(4,'2026-07-31 08:04:50+00'),(5,'2026-07-31 08:05:10+00'),(6,'2026-07-31 08:08:00+00')) p(n,at);

select public.m23_evaluate_scope('29000000-0000-0000-0000-000000000005','29000000-0000-0000-0000-000000000008','29000000-0000-0000-0000-000000000006','29000000-0000-0000-0000-000000000010','29000000-0000-0000-0000-000000000009','phone-device-comparison','m23-pilot-v1','2026-07-31 08:10+00');
create temp table m23_pairing_first on commit drop as
select id from public.m23_comparison_snapshots
where ad_work_day_id='29000000-0000-0000-0000-000000000005'
order by created_at,id limit 1;
create temp table m23_pairing_first_relationship on commit drop as
select pair_identity from public.m23_comparison_pairs
where snapshot_id=(select id from m23_pairing_first)
  and phone_point_id='29100000-0000-0000-0000-000000000001';
grant select on m23_pairing_first to authenticated;
grant select on m23_pairing_first_relationship to authenticated;
select is((select pair_count from public.m23_comparison_snapshots order by created_at desc limit 1),5,'one-to-one pairing rematches a displaced phone and includes the inclusive boundary');
select is((select physical_point_id from public.m23_comparison_pairs cp join public.m23_comparison_snapshots s on s.id=cp.snapshot_id where s.ad_work_day_id='29000000-0000-0000-0000-000000000005' and cp.phone_captured_at='2026-07-31 08:00:05+00'),'29300000-0000-0000-0000-000000000002','the second phone receives its next available candidate');
select ok((select count(*)=count(distinct physical_point_id) from public.m23_comparison_pairs cp join public.m23_comparison_snapshots s on s.id=cp.snapshot_id where s.ad_work_day_id='29000000-0000-0000-0000-000000000005'),'physical points are never reused');
select is((select physical_point_id from public.m23_comparison_pairs cp join public.m23_comparison_snapshots s on s.id=cp.snapshot_id where s.ad_work_day_id='29000000-0000-0000-0000-000000000005' and cp.phone_captured_at='2026-07-31 08:05:00+00'),'29300000-0000-0000-0000-000000000004','stable tie chooses earlier physical capture time');
select is((select physical_point_id from public.m23_comparison_pairs cp join public.m23_comparison_snapshots s on s.id=cp.snapshot_id where s.ad_work_day_id='29000000-0000-0000-0000-000000000005' and cp.phone_captured_at='2026-07-31 08:07:00+00'),'29300000-0000-0000-0000-000000000006','inclusive pairing window is honored when ordinal pairing is not sufficient');
select is(public.m23_evaluate_scope('29000000-0000-0000-0000-000000000005','29000000-0000-0000-0000-000000000008','29000000-0000-0000-0000-000000000006','29000000-0000-0000-0000-000000000010','29000000-0000-0000-0000-000000000009','phone-device-comparison','m23-pilot-v1','2026-07-31 08:10+00'),(select id from public.m23_comparison_snapshots order by created_at desc limit 1),'deterministic rerun reuses the same snapshot');
select ok(not exists(select 1 from public.m23_comparison_pairs cp where cp.pair_identity<>public.m23_pair_identity('29000000-0000-0000-0000-000000000005','29000000-0000-0000-0000-000000000008','m23-pilot-v1',cp.phone_point_id,cp.physical_point_id)),'SQL pair identities match the independent M23 pairing oracle identity rule');

-- Delayed backfill changes the complete input set.  A successor snapshot must
-- recompute membership rather than inheriting the first cached relationship.
insert into public.telemetry_receipts(id,gps_device_id,credential_id,adapter_id,adapter_version,idempotency_identity,content_hash,raw_payload_hash,captured_at,received_at,normalized_at,disposition,reason_code,freshness,offline_backfill,quality,synthetic,processing_version,ad_work_id,ad_work_day_id,assignment_id,driver_id,vehicle_id,gps_device_vehicle_link_id,assignment_history_id,execution_history_id,tracking_session_id)
values('29400000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000009','29000000-0000-0000-0000-000000000013','m23','1','m23-delayed-physical',repeat('d',64),repeat('e',64), '2026-07-31 08:10+00','2026-07-31 08:10+00','2026-07-31 08:10+00','accepted_delayed','backfill','delayed',true,'valid',true,'m23','29000000-0000-0000-0000-000000000003','29000000-0000-0000-0000-000000000005','29000000-0000-0000-0000-000000000004','29000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000002','29000000-0000-0000-0000-000000000010','29000000-0000-0000-0000-000000000006','29000000-0000-0000-0000-000000000008','29000000-0000-0000-0000-000000000011');
insert into public.location_points(id,tracking_session_id,source,device_id,driver_id,vehicle_id,recorded_at,received_at,lat,lng,accuracy_meters,quality,ad_work_id,ad_work_day_id,assignment_id,telemetry_receipt_id,synthetic,gps_device_vehicle_link_id,assignment_history_id,execution_history_id)
values('29500000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000011','physical_device','29000000-0000-0000-0000-000000000009','29000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000002','2026-07-31 08:00+00','2026-07-31 08:10+00',17,78,10,'good','29000000-0000-0000-0000-000000000003','29000000-0000-0000-0000-000000000005','29000000-0000-0000-0000-000000000004','29400000-0000-0000-0000-000000000001',true,'29000000-0000-0000-0000-000000000010','29000000-0000-0000-0000-000000000006','29000000-0000-0000-0000-000000000008');
insert into public.location_points(id,tracking_session_id,source,device_id,driver_id,vehicle_id,recorded_at,received_at,lat,lng,accuracy_meters,quality,ad_work_id,ad_work_day_id,assignment_id,telemetry_receipt_id,synthetic,gps_device_vehicle_link_id,assignment_history_id,execution_history_id)
values('29600000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000012','phone',null,'29000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000002','2026-07-31 08:01:20+00','2026-07-31 08:10+00',17,78,10,'good','29000000-0000-0000-0000-000000000003','29000000-0000-0000-0000-000000000005','29000000-0000-0000-0000-000000000004',null,true,null,'29000000-0000-0000-0000-000000000006','29000000-0000-0000-0000-000000000008');
select public.m23_evaluate_scope('29000000-0000-0000-0000-000000000005','29000000-0000-0000-0000-000000000008','29000000-0000-0000-0000-000000000006','29000000-0000-0000-0000-000000000010','29000000-0000-0000-0000-000000000009','phone-device-comparison','m23-pilot-v1','2026-07-31 08:10+00');
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub','29000000-0000-0000-0000-000000000014')::text,true);
create temp table m23_pairing_successor on commit drop as
select id from public.m23_comparison_snapshots
where ad_work_day_id='29000000-0000-0000-0000-000000000005'
order by created_at desc,id desc limit 1;
create temp table m23_pairing_successor_relationship on commit drop as
select pair_identity from public.m23_comparison_pairs
where snapshot_id=(select id from m23_pairing_successor)
  and phone_point_id='29100000-0000-0000-0000-000000000001'
  and physical_point_id='29500000-0000-0000-0000-000000000001';
grant select on m23_pairing_successor_relationship to authenticated;
select is(jsonb_array_length(public.admin_get_m23_comparison_technical_values_v1((select id from m23_pairing_first))->'pairs'),
  (select pair_count from public.m23_comparison_snapshots where id=(select id from m23_pairing_first)),
  'first technical projection count equals first snapshot selected pair count');
select is(jsonb_array_length(public.admin_get_m23_comparison_technical_values_v1((select id from m23_pairing_successor))->'pairs'),
  (select pair_count from public.m23_comparison_snapshots where id=(select id from m23_pairing_successor)),
  'successor technical projection count equals successor selected pair count');
select ok((public.admin_get_m23_comparison_technical_values_v1((select id from m23_pairing_first)))::text like '%'||(select pair_identity from m23_pairing_first_relationship)||'%',
  'first technical projection contains first-snapshot relationship A');
select ok((public.admin_get_m23_comparison_technical_values_v1((select id from m23_pairing_successor)))::text not like '%'||(select pair_identity from m23_pairing_first_relationship)||'%',
  'successor technical projection excludes superseded first relationship A');
select ok((public.admin_get_m23_comparison_technical_values_v1((select id from m23_pairing_successor)))::text like '%'||(select pair_identity from m23_pairing_successor_relationship)||'%',
  'successor technical projection contains delayed relationship B');
select ok((public.admin_get_m23_comparison_technical_values_v1((select id from m23_pairing_first)))::text !~ 'phonePointId|physicalPointId|latitude|longitude|rawPayload|credential'
  and (public.admin_get_m23_comparison_technical_values_v1((select id from m23_pairing_successor)))::text !~ 'phonePointId|physicalPointId|latitude|longitude|rawPayload|credential',
  'technical projections contain no source identifiers or sensitive payload fields');
select ok((public.admin_get_m23_comparison_detail_v1((select id from m23_pairing_first))->'comparison'->>'technicalValuesAvailable')::boolean
  and (public.admin_get_m23_comparison_detail_v1((select id from m23_pairing_successor))->'comparison'->>'technicalValuesAvailable')::boolean,
  'detail technical availability is selected-pair specific for each snapshot');
reset role;

insert into public.m23_comparison_pair_evidence(
  first_snapshot_id,authority_scope_key,policy_id,policy_version,pair_identity,
  phone_point_id,physical_point_id,phone_captured_at,physical_captured_at,
  time_difference_milliseconds,raw_haversine_distance_meters,phone_accuracy_meters,
  physical_device_accuracy_meters,conservative_separation_meters,quality,outcome,synthetic)
select (select id from m23_pairing_first),s.authority_scope_key,s.policy_id,s.policy_version,
  public.m22_safe_digest('m23-unselected-cache-row'),
  '29100000-0000-0000-0000-000000000001','29300000-0000-0000-0000-000000000001',
  '2026-07-31 08:00+00','2026-07-31 08:00:04+00',4000,0,10,10,0,'acceptable','match',true
from public.m23_comparison_snapshots s where s.id=(select id from m23_pairing_first);
select ok((public.m23_compact_comparison_detail(100)->>'deletedEvidenceRows')::integer>=1,
  'service compaction removes superseded unselected cache rows in a fixed batch');
select ok(not exists(select 1 from public.m23_comparison_pair_evidence where pair_identity=public.m22_safe_digest('m23-unselected-cache-row'))
  and exists(select 1 from public.m23_comparison_pair_evidence ce join public.m23_comparison_pairs cp on cp.pair_identity=ce.pair_identity
    where cp.snapshot_id=(select id from m23_pairing_successor)),
  'compaction removes eligible cache rows while preserving latest selected evidence');
select is((public.m23_compact_comparison_detail(100)->>'deletedEvidenceRows')::integer,0,
  'evidence compaction is idempotent after eligible rows are removed');
select is((select count(*)::integer from public.m23_comparison_snapshots where ad_work_day_id='29000000-0000-0000-0000-000000000005'),2,'delayed evidence creates an immutable successor snapshot');
select is((select count(*)::integer from public.m23_comparison_pairs cp join public.m23_comparison_snapshots s on s.id=cp.snapshot_id where s.ad_work_day_id='29000000-0000-0000-0000-000000000005' and s.created_at=(select min(created_at) from public.m23_comparison_snapshots where ad_work_day_id='29000000-0000-0000-0000-000000000005')),5,'prior snapshot pair membership remains unchanged');
select ok(exists(select 1 from public.m23_comparison_pairs cp join public.m23_comparison_snapshots s on s.id=cp.snapshot_id where s.ad_work_day_id='29000000-0000-0000-0000-000000000005' and s.created_at>(select min(created_at) from public.m23_comparison_snapshots where ad_work_day_id='29000000-0000-0000-0000-000000000005') and cp.phone_point_id='29100000-0000-0000-0000-000000000001' and cp.physical_point_id='29500000-0000-0000-0000-000000000001'),'delayed physical input rematches the earliest phone deterministically');
select ok(exists(select 1 from public.m23_comparison_pairs cp join public.m23_comparison_snapshots s on s.id=cp.snapshot_id where s.ad_work_day_id='29000000-0000-0000-0000-000000000005' and s.created_at>(select min(created_at) from public.m23_comparison_snapshots where ad_work_day_id='29000000-0000-0000-0000-000000000005') and cp.phone_point_id='29600000-0000-0000-0000-000000000001'),'delayed phone input participates in the successor selection');
select ok(not exists(select snapshot_id from public.m23_comparison_pairs group by snapshot_id having count(*)<>count(distinct phone_point_id) or count(*)<>count(distinct physical_point_id)),'every snapshot remains one-to-one under three-way contention and rematching');
select is(public.m23_evaluate_scope('29000000-0000-0000-0000-000000000005','29000000-0000-0000-0000-000000000008','29000000-0000-0000-0000-000000000006','29000000-0000-0000-0000-000000000010','29000000-0000-0000-0000-000000000009','phone-device-comparison','m23-pilot-v1','2026-07-31 08:10+00'),(select id from public.m23_comparison_snapshots where ad_work_day_id='29000000-0000-0000-0000-000000000005' order by created_at desc,id desc limit 1),'identical complete input reuses the successor snapshot');
select * from finish();
rollback;
