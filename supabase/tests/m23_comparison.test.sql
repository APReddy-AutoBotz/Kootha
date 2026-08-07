begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

insert into public.drivers(id,name,phone,approval_status,onboarding_status)
values('23000000-0000-0000-0000-000000000001','M23 Synthetic Driver','9000000023','approved','approved');
insert into public.vehicles(id,vehicle_number,vehicle_type,onboarding_status,active)
values('23000000-0000-0000-0000-000000000002','M23-SYNTHETIC-VEHICLE','van','approved',true);
insert into public.user_profiles(auth_user_id,display_name,role)
values('23000000-0000-0000-0000-000000000003','M23 SQL Admin','admin');
insert into public.gps_devices(id,device_code,vendor,model,adapter_type,protocol_type,status,installation_state,gps_readiness,gsm_readiness)
values('23000000-0000-0000-0000-000000000004','M23-SYNTHETIC-DEVICE','Synthetic','M23','generic_http','https','active','installed','ready','ready');
insert into public.gps_device_credential_metadata(id,gps_device_id,credential_key_id,status,verification_material_hash,issued_at,expires_at,created_by_admin)
values('23000000-0000-0000-0000-000000000005','23000000-0000-0000-0000-000000000004','m23-key','active',repeat('b',64),'2026-07-31 07:00+00','2026-08-01 07:00+00','23000000-0000-0000-0000-000000000003');
insert into public.ad_works(id,title,tracking_type,mobile_location_proof_required)
values('23000000-0000-0000-0000-000000000006','M23 Synthetic Work','both',true);
insert into public.ad_work_assignments(id,ad_work_id,driver_id,vehicle_id,status)
values('23000000-0000-0000-0000-000000000007','23000000-0000-0000-0000-000000000006','23000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000002','ready_for_execution');
insert into public.ad_work_days(id,ad_work_id,work_date,driver_id,vehicle_id,execution_status,execution_started_at)
values('23000000-0000-0000-0000-000000000008','23000000-0000-0000-0000-000000000006','2026-07-31','23000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000002','running','2026-07-31 08:00+00');
insert into public.m21_assignment_history(id,assignment_id,ad_work_id,driver_id,vehicle_id,assignment_status,effective_from,effective_until,history_origin)
values('23000000-0000-0000-0000-000000000009','23000000-0000-0000-0000-000000000007','23000000-0000-0000-0000-000000000006','23000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000002','assigned','2026-07-31 08:00+00','2026-07-31 09:00+00','observed');
insert into public.m21_release_history(id,ad_work_id,release_status,effective_from,effective_until,history_origin)
values('23000000-0000-0000-0000-000000000010','23000000-0000-0000-0000-000000000006','released_to_driver','2026-07-31 08:00+00','2026-07-31 09:00+00','observed');
insert into public.m21_execution_history(id,ad_work_day_id,execution_status,effective_from,effective_until,history_origin)
values('23000000-0000-0000-0000-000000000011','23000000-0000-0000-0000-000000000008','running','2026-07-31 08:00+00','2026-07-31 09:00+00','observed');
insert into public.gps_device_vehicle_links(id,gps_device_id,vehicle_id,is_primary,effective_from,effective_until,change_reason,created_by_admin,closed_by_admin,closed_at)
values('23000000-0000-0000-0000-000000000012','23000000-0000-0000-0000-000000000004','23000000-0000-0000-0000-000000000002',true,'2026-07-31 08:00+00','2026-07-31 09:00+00','M23 synthetic','23000000-0000-0000-0000-000000000003','23000000-0000-0000-0000-000000000003','2026-07-31 09:00+00');
insert into public.tracking_sessions(id,ad_work_day_id,ad_work_id,source_type,status,started_at,tracking_mode,driver_id,vehicle_id,synthetic)
values('23000000-0000-0000-0000-000000000013','23000000-0000-0000-0000-000000000008','23000000-0000-0000-0000-000000000006','mobile','running','2026-07-31 08:00+00','phone_location','23000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000002',true);
insert into public.tracking_sessions(id,ad_work_day_id,ad_work_id,assignment_id,source_type,status,started_at,tracking_mode,driver_id,vehicle_id,gps_device_id,gps_device_vehicle_link_id,assignment_history_id,execution_history_id,synthetic)
values('23000000-0000-0000-0000-000000000014','23000000-0000-0000-0000-000000000008','23000000-0000-0000-0000-000000000006','23000000-0000-0000-0000-000000000007','device','running','2026-07-31 08:00+00','physical_device','23000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000002','23000000-0000-0000-0000-000000000004','23000000-0000-0000-0000-000000000012','23000000-0000-0000-0000-000000000009','23000000-0000-0000-0000-000000000011',true);

insert into public.location_points(id,tracking_session_id,source,driver_id,vehicle_id,recorded_at,received_at,lat,lng,accuracy_meters,quality,ad_work_id,ad_work_day_id,assignment_id,assignment_history_id,execution_history_id,synthetic)
select gen_random_uuid(),'23000000-0000-0000-0000-000000000013','phone','23000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000002',t,t,17,78,10,'good','23000000-0000-0000-0000-000000000006','23000000-0000-0000-0000-000000000008','23000000-0000-0000-0000-000000000007','23000000-0000-0000-0000-000000000009','23000000-0000-0000-0000-000000000011',true
from generate_series('2026-07-31 08:00+00'::timestamptz,'2026-07-31 08:10+00'::timestamptz,'5 minutes') t;

insert into public.telemetry_receipts(id,gps_device_id,credential_id,adapter_id,adapter_version,idempotency_identity,content_hash,raw_payload_hash,captured_at,received_at,normalized_at,disposition,reason_code,freshness,offline_backfill,quality,synthetic,processing_version,ad_work_id,ad_work_day_id,assignment_id,driver_id,vehicle_id,gps_device_vehicle_link_id,assignment_history_id,execution_history_id,tracking_session_id)
select gen_random_uuid(),'23000000-0000-0000-0000-000000000004','23000000-0000-0000-0000-000000000005','m23','1',format('m23-%s',row_number() over()),repeat('a',64),repeat('c',64),t,t,t,'accepted_live','accepted','live',false,'valid',true,'m23','23000000-0000-0000-0000-000000000006','23000000-0000-0000-0000-000000000008','23000000-0000-0000-0000-000000000007','23000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000002','23000000-0000-0000-0000-000000000012','23000000-0000-0000-0000-000000000009','23000000-0000-0000-0000-000000000011','23000000-0000-0000-0000-000000000014'
from generate_series('2026-07-31 08:00+00'::timestamptz,'2026-07-31 08:10+00'::timestamptz,'5 minutes') t;

insert into public.location_points(id,tracking_session_id,source,device_id,driver_id,vehicle_id,recorded_at,received_at,lat,lng,accuracy_meters,quality,ad_work_id,ad_work_day_id,assignment_id,telemetry_receipt_id,altitude_meters,satellite_count,freshness,offline_backfill,synthetic,gps_device_vehicle_link_id,assignment_history_id,execution_history_id)
select gen_random_uuid(),'23000000-0000-0000-0000-000000000014','physical_device','23000000-0000-0000-0000-000000000004','23000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000002',tr.captured_at,tr.received_at,17,78,10,'good','23000000-0000-0000-0000-000000000006','23000000-0000-0000-0000-000000000008','23000000-0000-0000-0000-000000000007',tr.id,0,10,tr.freshness,false,true,'23000000-0000-0000-0000-000000000012','23000000-0000-0000-0000-000000000009','23000000-0000-0000-0000-000000000011'
from public.telemetry_receipts tr where tr.tracking_session_id='23000000-0000-0000-0000-000000000014';

select is((select count(*)::integer from public.m23_evaluate_work_day('23000000-0000-0000-0000-000000000008','phone-device-comparison','m23-pilot-v1','2026-07-31 08:20+00')),1,'one exact running authority scope evaluates');
select is((select source_expectation from public.m23_comparison_snapshots order by created_at desc limit 1),'both_expected','both sources are expected');
select is((select overall_outcome from public.m23_comparison_snapshots order by created_at desc limit 1),'paired_match','acceptable matching pairs produce paired_match');
select is((select pair_count from public.m23_comparison_snapshots order by created_at desc limit 1),3,'pair count is total pair count');
select is((select acceptable_pair_count from public.m23_comparison_snapshots order by created_at desc limit 1),3,'acceptable count excludes poor quality');
select is((select match_count from public.m23_comparison_snapshots order by created_at desc limit 1),3,'match count is behavioral');
select ok(not exists(select 1 from public.m23_comparison_snapshots where overall_outcome in ('phone_missing','physical_device_missing','both_missing') and source_expectation in ('neither_expected','phone_only','physical_only')),'source-only expectations never become missing');
select ok((select requested_generation>=completed_generation from public.m23_comparison_jobs where ad_work_day_id='23000000-0000-0000-0000-000000000008'),'queue records a generation watermark');

update public.ad_works set tracking_type='mobile',mobile_location_proof_required=true where id='23000000-0000-0000-0000-000000000006';
select diag(public.m23_evaluate_scope('23000000-0000-0000-0000-000000000008','23000000-0000-0000-0000-000000000011','23000000-0000-0000-0000-000000000009','23000000-0000-0000-0000-000000000012','23000000-0000-0000-0000-000000000004','phone-device-comparison','m23-pilot-v1','2026-07-31 08:20+00')::text);
select is((select overall_outcome from public.m23_comparison_snapshots order by created_at desc limit 1),'not_expected','phone-only with phone present is not_expected');
select is((select source_expectation from public.m23_comparison_snapshots order by created_at desc limit 1),'phone_only','phone-only expectation is explicit');
update public.ad_works set tracking_type='device',mobile_location_proof_required=false where id='23000000-0000-0000-0000-000000000006';
select diag(public.m23_evaluate_scope('23000000-0000-0000-0000-000000000008','23000000-0000-0000-0000-000000000011','23000000-0000-0000-0000-000000000009','23000000-0000-0000-0000-000000000012','23000000-0000-0000-0000-000000000004','phone-device-comparison','m23-pilot-v1','2026-07-31 08:20+00')::text);
select is((select overall_outcome from public.m23_comparison_snapshots order by created_at desc limit 1),'not_expected','physical-only with physical present is not_expected');
select is((select source_expectation from public.m23_comparison_snapshots order by created_at desc limit 1),'physical_only','physical-only expectation is explicit');
update public.ad_works set tracking_type='mobile',mobile_location_proof_required=false where id='23000000-0000-0000-0000-000000000006';
select diag(public.m23_evaluate_scope('23000000-0000-0000-0000-000000000008','23000000-0000-0000-0000-000000000011','23000000-0000-0000-0000-000000000009','23000000-0000-0000-0000-000000000012','23000000-0000-0000-0000-000000000004','phone-device-comparison','m23-pilot-v1','2026-07-31 08:20+00')::text);
select is((select overall_outcome from public.m23_comparison_snapshots order by created_at desc limit 1),'not_expected','neither expected is not_expected');
update public.ad_works set tracking_type='both',mobile_location_proof_required=true where id='23000000-0000-0000-0000-000000000006';
select diag(public.m23_evaluate_scope('23000000-0000-0000-0000-000000000008','23000000-0000-0000-0000-000000000011','23000000-0000-0000-0000-000000000009',null,null,'phone-device-comparison','m23-pilot-v1','2026-07-31 08:20+00')::text);
select is((select overall_outcome from public.m23_comparison_snapshots order by created_at desc limit 1),'comparison_unavailable','missing physical authority is ambiguous');

-- Missing-source precedence uses a later empty authority episode, so the
-- source is genuinely absent rather than hidden by the earlier fixture.
insert into public.m21_assignment_history(id,assignment_id,ad_work_id,driver_id,vehicle_id,assignment_status,effective_from,effective_until,history_origin)
values('23000000-0000-0000-0000-000000000021','23000000-0000-0000-0000-000000000007','23000000-0000-0000-0000-000000000006','23000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000002','assigned','2026-07-31 09:00+00','2026-07-31 10:00+00','observed');
insert into public.m21_release_history(id,ad_work_id,release_status,effective_from,effective_until,history_origin)
values('23000000-0000-0000-0000-000000000022','23000000-0000-0000-0000-000000000006','released_to_driver','2026-07-31 09:00+00','2026-07-31 10:00+00','observed');
insert into public.m21_execution_history(id,ad_work_day_id,execution_status,effective_from,effective_until,history_origin)
values('23000000-0000-0000-0000-000000000023','23000000-0000-0000-0000-000000000008','running','2026-07-31 09:00+00','2026-07-31 10:00+00','observed');
insert into public.gps_device_vehicle_links(id,gps_device_id,vehicle_id,is_primary,effective_from,effective_until,change_reason,created_by_admin,closed_by_admin,closed_at)
values('23000000-0000-0000-0000-000000000024','23000000-0000-0000-0000-000000000004','23000000-0000-0000-0000-000000000002',true,'2026-07-31 09:00+00','2026-07-31 10:00+00','M23 synthetic replacement','23000000-0000-0000-0000-000000000003','23000000-0000-0000-0000-000000000003','2026-07-31 10:00+00');
update public.ad_works set tracking_type='mobile',mobile_location_proof_required=true where id='23000000-0000-0000-0000-000000000006';
select diag(public.m23_evaluate_scope('23000000-0000-0000-0000-000000000008','23000000-0000-0000-0000-000000000023','23000000-0000-0000-0000-000000000021',null,null,'phone-device-comparison','m23-pilot-v1','2026-07-31 09:05+00')::text);
select is((select overall_outcome from public.m23_comparison_snapshots order by created_at desc limit 1),'not_expected','phone-only empty authority episode remains not_expected');
select is((select source_expectation from public.m23_comparison_snapshots order by created_at desc limit 1),'phone_only','phone-only empty authority episode remains expected');
update public.ad_works set tracking_type='device',mobile_location_proof_required=false where id='23000000-0000-0000-0000-000000000006';
select diag(public.m23_evaluate_scope('23000000-0000-0000-0000-000000000008','23000000-0000-0000-0000-000000000023','23000000-0000-0000-0000-000000000021','23000000-0000-0000-0000-000000000024','23000000-0000-0000-0000-000000000004','phone-device-comparison','m23-pilot-v1','2026-07-31 09:05+00')::text);
select is((select overall_outcome from public.m23_comparison_snapshots order by created_at desc limit 1),'not_expected','physical-only empty authority episode remains not_expected');
update public.ad_works set tracking_type='both',mobile_location_proof_required=true where id='23000000-0000-0000-0000-000000000006';
select diag(public.m23_evaluate_scope('23000000-0000-0000-0000-000000000008','23000000-0000-0000-0000-000000000023','23000000-0000-0000-0000-000000000021','23000000-0000-0000-0000-000000000024','23000000-0000-0000-0000-000000000004','phone-device-comparison','m23-pilot-v1','2026-07-31 09:05+00')::text);
select is((select overall_outcome from public.m23_comparison_snapshots order by created_at desc limit 1),'both_missing','both-expected empty authority episode is both_missing after grace');

-- Quality precedence fixtures: one poor pair and one exact inclusive boundary.
insert into public.location_points(id,tracking_session_id,source,driver_id,vehicle_id,recorded_at,received_at,lat,lng,accuracy_meters,quality,ad_work_id,ad_work_day_id,assignment_id,assignment_history_id,execution_history_id,synthetic)
values('23000000-0000-0000-0000-000000000015','23000000-0000-0000-0000-000000000013','phone','23000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000002','2026-07-31 08:15+00','2026-07-31 08:15+00',17,78,101,'good','23000000-0000-0000-0000-000000000006','23000000-0000-0000-0000-000000000008','23000000-0000-0000-0000-000000000007','23000000-0000-0000-0000-000000000009','23000000-0000-0000-0000-000000000011',true),
('23000000-0000-0000-0000-000000000016','23000000-0000-0000-0000-000000000013','phone','23000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000002','2026-07-31 08:20+00','2026-07-31 08:20+00',17,78,100,'good','23000000-0000-0000-0000-000000000006','23000000-0000-0000-0000-000000000008','23000000-0000-0000-0000-000000000007','23000000-0000-0000-0000-000000000009','23000000-0000-0000-0000-000000000011',true);
insert into public.telemetry_receipts(id,gps_device_id,credential_id,adapter_id,adapter_version,idempotency_identity,content_hash,raw_payload_hash,captured_at,received_at,normalized_at,disposition,reason_code,freshness,offline_backfill,quality,synthetic,processing_version,ad_work_id,ad_work_day_id,assignment_id,driver_id,vehicle_id,gps_device_vehicle_link_id,assignment_history_id,execution_history_id,tracking_session_id)
values('23000000-0000-0000-0000-000000000017','23000000-0000-0000-0000-000000000004','23000000-0000-0000-0000-000000000005','m23','1','m23-quality-poor',repeat('d',64),repeat('e',64),'2026-07-31 08:15+00','2026-07-31 08:15+00','2026-07-31 08:15+00','accepted_live','accepted','live',false,'valid',true,'m23','23000000-0000-0000-0000-000000000006','23000000-0000-0000-0000-000000000008','23000000-0000-0000-0000-000000000007','23000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000002','23000000-0000-0000-0000-000000000012','23000000-0000-0000-0000-000000000009','23000000-0000-0000-0000-000000000011','23000000-0000-0000-0000-000000000014'),
('23000000-0000-0000-0000-000000000018','23000000-0000-0000-0000-000000000004','23000000-0000-0000-0000-000000000005','m23','1','m23-quality-boundary',repeat('f',64),repeat('a',64),'2026-07-31 08:20+00','2026-07-31 08:20+00','2026-07-31 08:20+00','accepted_live','accepted','live',false,'valid',true,'m23','23000000-0000-0000-0000-000000000006','23000000-0000-0000-0000-000000000008','23000000-0000-0000-0000-000000000007','23000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000002','23000000-0000-0000-0000-000000000012','23000000-0000-0000-0000-000000000009','23000000-0000-0000-0000-000000000011','23000000-0000-0000-0000-000000000014');
insert into public.location_points(id,tracking_session_id,source,device_id,driver_id,vehicle_id,recorded_at,received_at,lat,lng,accuracy_meters,quality,ad_work_id,ad_work_day_id,assignment_id,telemetry_receipt_id,altitude_meters,satellite_count,freshness,offline_backfill,synthetic,gps_device_vehicle_link_id,assignment_history_id,execution_history_id)
values('23000000-0000-0000-0000-000000000019','23000000-0000-0000-0000-000000000014','physical_device','23000000-0000-0000-0000-000000000004','23000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000002','2026-07-31 08:15+00','2026-07-31 08:15+00',17,78,101,'good','23000000-0000-0000-0000-000000000006','23000000-0000-0000-0000-000000000008','23000000-0000-0000-0000-000000000007','23000000-0000-0000-0000-000000000017',0,10,'live',false,true,'23000000-0000-0000-0000-000000000012','23000000-0000-0000-0000-000000000009','23000000-0000-0000-0000-000000000011'),
('23000000-0000-0000-0000-000000000020','23000000-0000-0000-0000-000000000014','physical_device','23000000-0000-0000-0000-000000000004','23000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000002','2026-07-31 08:20+00','2026-07-31 08:20+00',17,78,100,'good','23000000-0000-0000-0000-000000000006','23000000-0000-0000-0000-000000000008','23000000-0000-0000-0000-000000000007','23000000-0000-0000-0000-000000000018',0,10,'live',false,true,'23000000-0000-0000-0000-000000000012','23000000-0000-0000-0000-000000000009','23000000-0000-0000-0000-000000000011');
select diag(public.m23_evaluate_scope('23000000-0000-0000-0000-000000000008','23000000-0000-0000-0000-000000000011','23000000-0000-0000-0000-000000000009','23000000-0000-0000-0000-000000000012','23000000-0000-0000-0000-000000000004','phone-device-comparison','m23-pilot-v1','2026-07-31 08:25+00')::text);
select is((select pair_count from public.m23_comparison_snapshots order by created_at desc limit 1),5,'quality fixture has five deterministic pairs');
select is((select acceptable_pair_count from public.m23_comparison_snapshots order by created_at desc limit 1),4,'one poor pair is excluded from acceptable count');
select is((select insufficient_quality_count from public.m23_comparison_snapshots order by created_at desc limit 1),1,'excessive accuracy is insufficient quality');
select is((select overall_outcome from public.m23_comparison_snapshots order by created_at desc limit 1),'paired_match','mixed acceptable and poor evidence remains paired_match');
select is((select max(phone_eligible_count) from public.m23_comparison_snapshots),5,'exact configured accuracy boundary remains eligible');

insert into public.m23_comparison_policies(policy_id,policy_version,effective_from,enabled,pair_window_seconds,maximum_phone_accuracy_meters,maximum_physical_accuracy_meters,minimum_pair_count,sustained_mismatch_distance_meters,sustained_mismatch_duration_seconds,maximum_sustained_episode_gap_seconds,missing_source_grace_seconds,backfill_window_seconds,safe_provisional_policy_note)
values('m23-quality-test','v1','2027-01-01 00:00+00',false,60,100,100,3,250,300,120,120,86400,'Synthetic quality precedence test policy.');
insert into public.m23_comparison_policies(policy_id,policy_version,effective_from,enabled,pair_window_seconds,maximum_phone_accuracy_meters,maximum_physical_accuracy_meters,minimum_pair_count,sustained_mismatch_distance_meters,sustained_mismatch_duration_seconds,maximum_sustained_episode_gap_seconds,missing_source_grace_seconds,backfill_window_seconds,safe_provisional_policy_note)
values('m23-missing-test','v1','2027-01-02 00:00+00',false,60,100,100,3,250,300,120,120,86400,'Synthetic missing-accuracy precedence test policy.'),
('m23-all-poor-test','v1','2027-01-03 00:00+00',false,60,100,100,3,250,300,120,120,86400,'Synthetic all-poor precedence test policy.');
update public.location_points set accuracy_meters=10 where tracking_session_id in ('23000000-0000-0000-0000-000000000013','23000000-0000-0000-0000-000000000014');
update public.location_points set accuracy_meters=101 where recorded_at <= '2026-07-31 08:10+00';
select diag(public.m23_evaluate_scope('23000000-0000-0000-0000-000000000008','23000000-0000-0000-0000-000000000011','23000000-0000-0000-0000-000000000009','23000000-0000-0000-0000-000000000012','23000000-0000-0000-0000-000000000004','m23-quality-test','v1','2026-07-31 08:26+00')::text);
select is((select insufficient_quality_count from public.m23_comparison_snapshots order by created_at desc limit 1),3,'three poor-quality pairs are counted exactly');
select is((select overall_outcome from public.m23_comparison_snapshots order by created_at desc limit 1),'insufficient_pairs','three poor pairs leave fewer than the configured acceptable-pair minimum');
update public.location_points set accuracy_meters=10;
update public.location_points set accuracy_meters=null where recorded_at='2026-07-31 08:20+00';
select diag(public.m23_evaluate_scope('23000000-0000-0000-0000-000000000008','23000000-0000-0000-0000-000000000011','23000000-0000-0000-0000-000000000009','23000000-0000-0000-0000-000000000012','23000000-0000-0000-0000-000000000004','m23-missing-test','v1','2026-07-31 08:27+00')::text);
select is((select insufficient_quality_count from public.m23_comparison_snapshots order by created_at desc limit 1),1,'missing accuracy is insufficient quality');
select is((select overall_outcome from public.m23_comparison_snapshots order by created_at desc limit 1),'paired_match','one missing-accuracy pair does not hide the four acceptable pairs');
update public.location_points set accuracy_meters=101 where tracking_session_id in ('23000000-0000-0000-0000-000000000013','23000000-0000-0000-0000-000000000014');
select diag(public.m23_evaluate_scope('23000000-0000-0000-0000-000000000008','23000000-0000-0000-0000-000000000011','23000000-0000-0000-0000-000000000009','23000000-0000-0000-0000-000000000012','23000000-0000-0000-0000-000000000004','m23-all-poor-test','v1','2026-07-31 08:26+00')::text);
select is((select overall_outcome from public.m23_comparison_snapshots order by created_at desc limit 1),'insufficient_quality','all-poor evidence never becomes paired_match');
select is((select acceptable_pair_count from public.m23_comparison_snapshots order by created_at desc limit 1),0,'all-poor evidence has zero acceptable pairs');
select is((select insufficient_quality_count from public.m23_comparison_snapshots order by created_at desc limit 1),5,'all five poor pairs are counted as insufficient quality');

select diag(public.m23_evaluate_scope('23000000-0000-0000-0000-000000000008','23000000-0000-0000-0000-000000000011','23000000-0000-0000-0000-000000000009','23000000-0000-0000-0000-000000000012','23000000-0000-0000-0000-000000000004','phone-device-comparison','m23-pilot-v1','2026-07-31 09:30+00')::text);
select is((select finality from public.m23_comparison_snapshots order by created_at desc limit 1),'provisional_backfill_open','work end advances finality without a new point');
select diag(public.m23_evaluate_scope('23000000-0000-0000-0000-000000000008','23000000-0000-0000-0000-000000000011','23000000-0000-0000-0000-000000000009','23000000-0000-0000-0000-000000000012','23000000-0000-0000-0000-000000000004','phone-device-comparison','m23-pilot-v1','2026-08-01 10:00+00')::text);
select is((select finality from public.m23_comparison_snapshots order by created_at desc limit 1),'final_backfill_closed','backfill closes without a new point');
select diag(public.m23_evaluate_scope('23000000-0000-0000-0000-000000000008','23000000-0000-0000-0000-000000000011','23000000-0000-0000-0000-000000000009','23000000-0000-0000-0000-000000000012','23000000-0000-0000-0000-000000000004','phone-device-comparison','m23-pilot-v1','2026-08-01 10:00+00')::text);
select is((select count(*)::integer from public.m23_comparison_snapshots where finality='final_backfill_closed'),1,'finality snapshot is idempotent at the same clock');

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub','23000000-0000-0000-0000-000000000003')::text,true);
create temp table m23_admin_snapshot on commit drop as
select id from public.m23_comparison_snapshots where overall_outcome='paired_match' order by generated_at desc limit 1;
select ok((public.admin_get_m23_comparison_detail_v1((select id from m23_admin_snapshot)))::text !~ 'minimumConservativeSeparationMeters|maxConservativeSeparationMeters|rawHaversineDistanceMeters|phoneAccuracyMeters|physicalDeviceAccuracyMeters','normal detail contains no technical values');
select throws_ok(format('select public.admin_get_m23_comparison_technical_values_v1(%L,null,101)',(select id from m23_admin_snapshot)),'22023','Invalid bounded M23 technical-value limit','technical RPC rejects a limit above 100');
select ok((public.admin_get_m23_comparison_technical_values_v1((select id from m23_admin_snapshot),null,2))::text !~ 'phonePointId|physicalPointId|latitude|longitude|rawPayload','technical RPC omits source ids and coordinates');
select ok(jsonb_array_length(public.admin_get_m23_comparison_technical_values_v1((select id from m23_admin_snapshot),null,2)->'pairs')<=2,'technical RPC is bounded');
select ok((select count(*)>0 from public.audit_logs where action='m23_comparison_technical_values_viewed' and entity_id=(select id from m23_admin_snapshot)),'technical access is audited without returned values');
select * from finish();
rollback;
