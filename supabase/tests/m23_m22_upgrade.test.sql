begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into public.drivers(id,name,phone,approval_status,onboarding_status)
values('27000000-0000-0000-0000-000000000001','M23 Upgrade Driver','9000000027','approved','approved');
insert into public.vehicles(id,vehicle_number,vehicle_type,onboarding_status,active)
values('27000000-0000-0000-0000-000000000002','M23-UPGRADE-VEHICLE','van','approved',true);
insert into public.user_profiles(auth_user_id,display_name,role)
values('27000000-0000-0000-0000-000000000003','M23 Upgrade Admin','admin');
insert into public.gps_devices(id,device_code,vendor,model,adapter_type,protocol_type,status,installation_state,gps_readiness,gsm_readiness)
values('27000000-0000-0000-0000-000000000004','M23-UPGRADE-DEVICE','Synthetic','M23','generic_http','https','active','installed','ready','ready');
insert into public.gps_device_credential_metadata(id,gps_device_id,credential_key_id,status,verification_material_hash,issued_at,expires_at,created_by_admin)
values('27000000-0000-0000-0000-000000000005','27000000-0000-0000-0000-000000000004','m23-upgrade-key','active',repeat('b',64),'2026-07-31 07:00+00','2026-08-01 07:00+00','27000000-0000-0000-0000-000000000003');
insert into public.ad_works(id,title,tracking_type,mobile_location_proof_required)
values('27000000-0000-0000-0000-000000000006','M23 Upgrade Work','both',true);
insert into public.ad_work_assignments(id,ad_work_id,driver_id,vehicle_id,status)
values('27000000-0000-0000-0000-000000000007','27000000-0000-0000-0000-000000000006','27000000-0000-0000-0000-000000000001','27000000-0000-0000-0000-000000000002','ready_for_execution');
insert into public.ad_work_days(id,ad_work_id,work_date,driver_id,vehicle_id,execution_status,execution_started_at)
values('27000000-0000-0000-0000-000000000008','27000000-0000-0000-0000-000000000006','2026-07-31','27000000-0000-0000-0000-000000000001','27000000-0000-0000-0000-000000000002','running','2026-07-31 08:00+00');
insert into public.m21_assignment_history(id,assignment_id,ad_work_id,driver_id,vehicle_id,assignment_status,effective_from,effective_until,history_origin)
values('27000000-0000-0000-0000-000000000009','27000000-0000-0000-0000-000000000007','27000000-0000-0000-0000-000000000006','27000000-0000-0000-0000-000000000001','27000000-0000-0000-0000-000000000002','assigned','2026-07-31 08:00+00','2026-07-31 09:00+00','observed');
insert into public.m21_release_history(id,ad_work_id,release_status,effective_from,effective_until,history_origin)
values('27000000-0000-0000-0000-000000000010','27000000-0000-0000-0000-000000000006','released_to_driver','2026-07-31 08:00+00','2026-07-31 09:00+00','observed');
insert into public.m21_execution_history(id,ad_work_day_id,execution_status,effective_from,effective_until,history_origin)
values('27000000-0000-0000-0000-000000000011','27000000-0000-0000-0000-000000000008','running','2026-07-31 08:00+00','2026-07-31 09:00+00','observed');
insert into public.gps_device_vehicle_links(id,gps_device_id,vehicle_id,is_primary,effective_from,effective_until,change_reason,created_by_admin,closed_by_admin,closed_at)
values('27000000-0000-0000-0000-000000000012','27000000-0000-0000-0000-000000000004','27000000-0000-0000-0000-000000000002',true,'2026-07-31 08:00+00','2026-07-31 09:00+00','M23 upgrade fixture','27000000-0000-0000-0000-000000000003','27000000-0000-0000-0000-000000000003','2026-07-31 09:00+00');
insert into public.tracking_sessions(id,ad_work_day_id,ad_work_id,source_type,status,started_at,tracking_mode,driver_id,vehicle_id,synthetic)
values('27000000-0000-0000-0000-000000000013','27000000-0000-0000-0000-000000000008','27000000-0000-0000-0000-000000000006','mobile','running','2026-07-31 08:00+00','phone_location','27000000-0000-0000-0000-000000000001','27000000-0000-0000-0000-000000000002',true);
insert into public.tracking_sessions(id,ad_work_day_id,ad_work_id,assignment_id,source_type,status,started_at,tracking_mode,driver_id,vehicle_id,gps_device_id,gps_device_vehicle_link_id,assignment_history_id,execution_history_id,synthetic)
values('27000000-0000-0000-0000-000000000014','27000000-0000-0000-0000-000000000008','27000000-0000-0000-0000-000000000006','27000000-0000-0000-0000-000000000007','device','running','2026-07-31 08:00+00','physical_device','27000000-0000-0000-0000-000000000001','27000000-0000-0000-0000-000000000002','27000000-0000-0000-0000-000000000004','27000000-0000-0000-0000-000000000012','27000000-0000-0000-0000-000000000009','27000000-0000-0000-0000-000000000011',true);

insert into public.location_points(id,tracking_session_id,source,driver_id,vehicle_id,recorded_at,received_at,lat,lng,accuracy_meters,quality,ad_work_id,ad_work_day_id,assignment_id,assignment_history_id,execution_history_id,synthetic)
values('27000000-0000-0000-0000-000000000015','27000000-0000-0000-0000-000000000013','phone','27000000-0000-0000-0000-000000000001','27000000-0000-0000-0000-000000000002','2026-07-31 08:02+00','2026-07-31 08:02+00',17,78,10,'good','27000000-0000-0000-0000-000000000006','27000000-0000-0000-0000-000000000008','27000000-0000-0000-0000-000000000007','27000000-0000-0000-0000-000000000009','27000000-0000-0000-0000-000000000011',true);
insert into public.telemetry_receipts(id,gps_device_id,credential_id,adapter_id,adapter_version,idempotency_identity,content_hash,raw_payload_hash,captured_at,received_at,normalized_at,disposition,reason_code,freshness,offline_backfill,quality,synthetic,processing_version,ad_work_id,ad_work_day_id,assignment_id,driver_id,vehicle_id,gps_device_vehicle_link_id,assignment_history_id,execution_history_id,tracking_session_id)
values('27000000-0000-0000-0000-000000000016','27000000-0000-0000-0000-000000000004','27000000-0000-0000-0000-000000000005','m23','1','m23-upgrade-receipt',repeat('a',64),repeat('c',64),'2026-07-31 08:02+00','2026-07-31 08:02+00','2026-07-31 08:02+00','accepted_live','accepted','live',false,'valid',true,'m23','27000000-0000-0000-0000-000000000006','27000000-0000-0000-0000-000000000008','27000000-0000-0000-0000-000000000007','27000000-0000-0000-0000-000000000001','27000000-0000-0000-0000-000000000002','27000000-0000-0000-0000-000000000012','27000000-0000-0000-0000-000000000009','27000000-0000-0000-0000-000000000011','27000000-0000-0000-0000-000000000014');
insert into public.location_points(id,tracking_session_id,source,device_id,driver_id,vehicle_id,recorded_at,received_at,lat,lng,accuracy_meters,quality,ad_work_id,ad_work_day_id,assignment_id,telemetry_receipt_id,synthetic,gps_device_vehicle_link_id,assignment_history_id,execution_history_id)
values('27000000-0000-0000-0000-000000000017','27000000-0000-0000-0000-000000000014','physical_device','27000000-0000-0000-0000-000000000004','27000000-0000-0000-0000-000000000001','27000000-0000-0000-0000-000000000002','2026-07-31 08:02+00','2026-07-31 08:02+00',17,78,10,'good','27000000-0000-0000-0000-000000000006','27000000-0000-0000-0000-000000000008','27000000-0000-0000-0000-000000000007','27000000-0000-0000-0000-000000000016',true,'27000000-0000-0000-0000-000000000012','27000000-0000-0000-0000-000000000009','27000000-0000-0000-0000-000000000011');

create temp table m23_upgrade_ids(label text primary key,id uuid);
insert into m23_upgrade_ids values
('m22-signal-active',(select id from public.m22_rule_signals where false));
delete from m23_upgrade_ids;
insert into public.m22_rule_signals(signal_key,signal_kind,reason_code,occurred_at,adapter_id,created_at)
values(public.m22_safe_digest('m23-upgrade-active'),'adapter_rejection','invalid_coordinate','2026-07-31 08:03+00','m23-upgrade','2026-07-31 08:03+00') returning id;
insert into m23_upgrade_ids select 'm22-signal-active',id from public.m22_rule_signals where signal_key=public.m22_safe_digest('m23-upgrade-active');
insert into m23_upgrade_ids select 'm22-alert-active',public.m22_apply_rule_observation((select id from m23_upgrade_ids where label='m22-signal-active'),'invalid_coordinate','2026-07-31 08:03+00','adapter_rejection','m23-upgrade');
insert into public.m22_rule_signals(signal_key,signal_kind,reason_code,occurred_at,adapter_id,created_at)
values(public.m22_safe_digest('m23-upgrade-terminal'),'adapter_rejection','invalid_coordinate','2026-07-31 08:04+00','m23-upgrade','2026-07-31 08:04+00');
insert into m23_upgrade_ids select 'm22-signal-terminal',id from public.m22_rule_signals where signal_key=public.m22_safe_digest('m23-upgrade-terminal');
insert into m23_upgrade_ids select 'm22-alert-terminal',public.m22_apply_rule_observation((select id from m23_upgrade_ids where label='m22-signal-terminal'),'invalid_coordinate','2026-07-31 08:04+00','adapter_rejection','m23-upgrade-terminal');

grant select on m23_upgrade_ids to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','27000000-0000-0000-0000-000000000003',true);
select lives_ok(format('select public.admin_transition_alert(%L,%L,%L,%L)',(select id from m23_upgrade_ids where label='m22-alert-terminal'),'acknowledged','upgrade review','acknowledged before M23'),'M22 terminal episode acknowledges before M23');
select lives_ok(format('select public.admin_transition_alert(%L,%L,%L,%L)',(select id from m23_upgrade_ids where label='m22-alert-terminal'),'investigating','upgrade investigation','investigated before M23'),'M22 terminal episode investigates before M23');
select lives_ok(format('select public.admin_transition_alert(%L,%L,%L,%L)',(select id from m23_upgrade_ids where label='m22-alert-terminal'),'resolved','upgrade resolution','resolved before M23'),'M22 terminal episode resolves before M23');
select lives_ok(format('select public.admin_get_m22_alert_technical_values_v1(%L)',(select id from m23_upgrade_ids where label='m22-alert-active')),'M22 security-sensitive technical access is exercised before M23');
reset role;

select is((select count(*)::integer from public.m21_assignment_history where id='27000000-0000-0000-0000-000000000009'),1,'M21 assignment history fixture exists before comparison');
select is((select count(*)::integer from public.telemetry_receipts where id='27000000-0000-0000-0000-000000000016'),1,'M21 receipt exists before comparison');
select is((select count(*)::integer from public.location_points where id in ('27000000-0000-0000-0000-000000000015','27000000-0000-0000-0000-000000000017')),2,'phone and physical points exist before comparison');
select is((select count(*)::integer from public.alert_status_history where alert_id=(select id from m23_upgrade_ids where label='m22-alert-terminal')),4,'M22 terminal status history is present before comparison');
select ok((select alert_id is not null and condition_active from public.m22_rule_state where dedupe_key=public.m22_safe_digest('invalid_coordinate|adapter_rejection|m23-upgrade')),'M22 active rule state is present before comparison');
select is((select count(*)::integer from public.audit_logs where entity_id=(select id from m23_upgrade_ids where label='m22-alert-active') and action='alert_technical_values_viewed'),1,'M22 security audit evidence is present before comparison');

select is((select count(*)::integer from public.m23_evaluate_work_day('27000000-0000-0000-0000-000000000008','phone-device-comparison','m23-pilot-v1','2026-07-31 08:10+00')),1,'M23 evaluates the preserved M21 authority and source fixture');
select ok(exists(select 1 from public.m23_comparison_snapshots where ad_work_day_id='27000000-0000-0000-0000-000000000008'),'M23 snapshot is added without replacing M22 evidence');
select is((select count(*)::integer from public.telemetry_receipts where id='27000000-0000-0000-0000-000000000016'),1,'M21 receipt remains after M23 evaluation');
select is((select count(*)::integer from public.location_points where id in ('27000000-0000-0000-0000-000000000015','27000000-0000-0000-0000-000000000017')),2,'phone and physical points remain after M23 evaluation');
select is((select status::text from public.alerts where id=(select id from m23_upgrade_ids where label='m22-alert-terminal')),'resolved','M22 terminal alert remains resolved after M23');
select ok((select condition_active from public.alerts where id=(select id from m23_upgrade_ids where label='m22-alert-active')),'M22 active alert episode remains active after M23');
select is((select count(*)::integer from public.alert_status_history where alert_id=(select id from m23_upgrade_ids where label='m22-alert-terminal')),4,'M22 terminal history remains immutable after M23');
select ok((select alert_id is not null and condition_active from public.m22_rule_state where dedupe_key=public.m22_safe_digest('invalid_coordinate|adapter_rejection|m23-upgrade')),'M22 rule state remains active after M23');
select is((select count(*)::integer from public.audit_logs where entity_id=(select id from m23_upgrade_ids where label='m22-alert-active') and action='alert_technical_values_viewed'),1,'M22 security audit evidence remains after M23');
select is((select count(*)::integer from public.customer_updates),0,'M22 to M23 upgrade has no customer side effect');

select * from finish();
rollback;
