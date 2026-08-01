begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into public.drivers(id,name,phone,approval_status,onboarding_status)
values('24000000-0000-0000-0000-000000000001','M23 Episode Driver','9000000024','approved','approved');
insert into public.vehicles(id,vehicle_number,vehicle_type,onboarding_status,active)
values('24000000-0000-0000-0000-000000000002','M23-EPISODE-VEHICLE','van','approved',true);
insert into public.user_profiles(auth_user_id,display_name,role)
values('24000000-0000-0000-0000-000000000003','M23 Episode Admin','admin');
insert into public.gps_devices(id,device_code,vendor,model,adapter_type,protocol_type,status,installation_state,gps_readiness,gsm_readiness)
values('24000000-0000-0000-0000-000000000004','M23-EPISODE-DEVICE','Synthetic','M23','generic_http','https','active','installed','ready','ready');
insert into public.gps_device_credential_metadata(id,gps_device_id,credential_key_id,status,verification_material_hash,issued_at,expires_at,created_by_admin)
values('24000000-0000-0000-0000-000000000005','24000000-0000-0000-0000-000000000004','m23-episode-key','active',repeat('b',64),'2026-07-31 07:00+00','2026-08-01 07:00+00','24000000-0000-0000-0000-000000000003');
insert into public.ad_works(id,title,tracking_type,mobile_location_proof_required)
values('24000000-0000-0000-0000-000000000006','M23 Episode Work','both',true);
insert into public.ad_work_assignments(id,ad_work_id,driver_id,vehicle_id,status)
values('24000000-0000-0000-0000-000000000007','24000000-0000-0000-0000-000000000006','24000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000002','ready_for_execution');
insert into public.ad_work_days(id,ad_work_id,work_date,driver_id,vehicle_id,execution_status,execution_started_at)
values('24000000-0000-0000-0000-000000000008','24000000-0000-0000-0000-000000000006','2026-07-31','24000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000002','running','2026-07-31 08:00+00');
insert into public.m21_assignment_history(id,assignment_id,ad_work_id,driver_id,vehicle_id,assignment_status,effective_from,effective_until,history_origin)
values('24000000-0000-0000-0000-000000000009','24000000-0000-0000-0000-000000000007','24000000-0000-0000-0000-000000000006','24000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000002','assigned','2026-07-31 08:00+00','2026-07-31 09:00+00','observed');
insert into public.m21_release_history(id,ad_work_id,release_status,effective_from,effective_until,history_origin)
values('24000000-0000-0000-0000-000000000010','24000000-0000-0000-0000-000000000006','released_to_driver','2026-07-31 08:00+00','2026-07-31 09:00+00','observed');
insert into public.m21_execution_history(id,ad_work_day_id,execution_status,effective_from,effective_until,history_origin)
values('24000000-0000-0000-0000-000000000011','24000000-0000-0000-0000-000000000008','running','2026-07-31 08:00+00','2026-07-31 09:00+00','observed');
insert into public.gps_device_vehicle_links(id,gps_device_id,vehicle_id,is_primary,effective_from,effective_until,change_reason,created_by_admin,closed_by_admin,closed_at)
values('24000000-0000-0000-0000-000000000012','24000000-0000-0000-0000-000000000004','24000000-0000-0000-0000-000000000002',true,'2026-07-31 08:00+00','2026-07-31 09:00+00','M23 episode fixture','24000000-0000-0000-0000-000000000003','24000000-0000-0000-0000-000000000003','2026-07-31 09:00+00');
insert into public.tracking_sessions(id,ad_work_day_id,ad_work_id,source_type,status,started_at,tracking_mode,driver_id,vehicle_id,synthetic)
values('24000000-0000-0000-0000-000000000013','24000000-0000-0000-0000-000000000008','24000000-0000-0000-0000-000000000006','mobile','running','2026-07-31 08:00+00','phone_location','24000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000002',true);
insert into public.tracking_sessions(id,ad_work_day_id,ad_work_id,assignment_id,source_type,status,started_at,tracking_mode,driver_id,vehicle_id,gps_device_id,gps_device_vehicle_link_id,assignment_history_id,execution_history_id,synthetic)
values('24000000-0000-0000-0000-000000000014','24000000-0000-0000-0000-000000000008','24000000-0000-0000-0000-000000000006','24000000-0000-0000-0000-000000000007','device','running','2026-07-31 08:00+00','physical_device','24000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000002','24000000-0000-0000-0000-000000000004','24000000-0000-0000-0000-000000000012','24000000-0000-0000-0000-000000000009','24000000-0000-0000-0000-000000000011',true);

with points(t) as (values
  ('2026-07-31 08:00+00'::timestamptz),('2026-07-31 08:01+00'),('2026-07-31 08:02+00'),
  ('2026-07-31 08:04+00'),('2026-07-31 08:07+00'),('2026-07-31 08:12+00'))
insert into public.location_points(id,tracking_session_id,source,driver_id,vehicle_id,recorded_at,received_at,lat,lng,accuracy_meters,quality,ad_work_id,ad_work_day_id,assignment_id,assignment_history_id,execution_history_id,synthetic)
select gen_random_uuid(),'24000000-0000-0000-0000-000000000013','phone','24000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000002',t,t,17,78,10,'good','24000000-0000-0000-0000-000000000006','24000000-0000-0000-0000-000000000008','24000000-0000-0000-0000-000000000007','24000000-0000-0000-0000-000000000009','24000000-0000-0000-0000-000000000011',true from points;
with points(t) as (values
  ('2026-07-31 08:00+00'::timestamptz),('2026-07-31 08:01+00'),('2026-07-31 08:02+00'),
  ('2026-07-31 08:04+00'),('2026-07-31 08:07+00'),('2026-07-31 08:12+00'))
insert into public.telemetry_receipts(id,gps_device_id,credential_id,adapter_id,adapter_version,idempotency_identity,content_hash,raw_payload_hash,captured_at,received_at,normalized_at,disposition,reason_code,freshness,offline_backfill,quality,synthetic,processing_version,ad_work_id,ad_work_day_id,assignment_id,driver_id,vehicle_id,gps_device_vehicle_link_id,assignment_history_id,execution_history_id,tracking_session_id)
select gen_random_uuid(),'24000000-0000-0000-0000-000000000004','24000000-0000-0000-0000-000000000005','m23','1',format('m23-episode-%s',row_number() over()),repeat('a',64),repeat('c',64),t,t,t,'accepted_live','accepted','live',false,'valid',true,'m23','24000000-0000-0000-0000-000000000006','24000000-0000-0000-0000-000000000008','24000000-0000-0000-0000-000000000007','24000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000002','24000000-0000-0000-0000-000000000012','24000000-0000-0000-0000-000000000009','24000000-0000-0000-0000-000000000011','24000000-0000-0000-0000-000000000014' from points;
insert into public.location_points(id,tracking_session_id,source,device_id,driver_id,vehicle_id,recorded_at,received_at,lat,lng,accuracy_meters,quality,ad_work_id,ad_work_day_id,assignment_id,telemetry_receipt_id,altitude_meters,satellite_count,freshness,offline_backfill,synthetic,gps_device_vehicle_link_id,assignment_history_id,execution_history_id)
select gen_random_uuid(),'24000000-0000-0000-0000-000000000014','physical_device','24000000-0000-0000-0000-000000000004','24000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000002',tr.captured_at,tr.received_at,case when tr.captured_at='2026-07-31 08:01+00' then 17 else 17.01 end,case when tr.captured_at='2026-07-31 08:01+00' then 78 else 78.01 end,10,'good','24000000-0000-0000-0000-000000000006','24000000-0000-0000-0000-000000000008','24000000-0000-0000-0000-000000000007',tr.id,0,10,tr.freshness,false,true,'24000000-0000-0000-0000-000000000012','24000000-0000-0000-0000-000000000009','24000000-0000-0000-0000-000000000011'
from public.telemetry_receipts tr where tr.tracking_session_id='24000000-0000-0000-0000-000000000014';

insert into public.m23_comparison_policies(policy_id,policy_version,effective_from,enabled,pair_window_seconds,maximum_phone_accuracy_meters,maximum_physical_accuracy_meters,minimum_pair_count,sustained_mismatch_distance_meters,sustained_mismatch_duration_seconds,maximum_sustained_episode_gap_seconds,missing_source_grace_seconds,backfill_window_seconds,safe_provisional_policy_note)
values
('m23-episode-test','v1','2027-02-01 00:00+00',false,60,100,100,3,250,300,180,120,86400,'Synthetic episode segmentation test policy.'),
('m23-episode-four','v1','2027-02-02 00:00+00',false,60,100,100,4,250,300,180,120,86400,'Synthetic one-fewer-pair test policy.'),
('m23-episode-duration','v1','2027-02-03 00:00+00',false,60,100,100,3,250,301,180,120,86400,'Synthetic one-instant-below-duration test policy.');
create temp table m23_episode_first on commit drop as
select public.m23_evaluate_scope('24000000-0000-0000-0000-000000000008','24000000-0000-0000-0000-000000000011','24000000-0000-0000-0000-000000000009','24000000-0000-0000-0000-000000000012','24000000-0000-0000-0000-000000000004','m23-episode-test','v1','2026-07-31 08:20+00') snapshot_id;
grant select on m23_episode_first to authenticated;
select is((select overall_outcome from public.m23_comparison_snapshots where id=(select snapshot_id from m23_episode_first)),'sustained_mismatch','latest qualifying mismatch episode wins over an old isolated candidate');
select is((select sustained_pair_count from public.m23_comparison_snapshots where id=(select snapshot_id from m23_episode_first)),3,'sustained episode has exact pair count');
select is((select sustained_first_pair_at from public.m23_comparison_snapshots where id=(select snapshot_id from m23_episode_first)),'2026-07-31 08:02+00','match closes the old episode and starts the later one');
select is((select sustained_last_pair_at from public.m23_comparison_snapshots where id=(select snapshot_id from m23_episode_first)),'2026-07-31 08:07+00','gap above the configured boundary splits the later episode');
select ok((select minimum_conservative_separation_meters>250 and maximum_conservative_separation_meters>=minimum_conservative_separation_meters from public.m23_comparison_snapshots where id=(select snapshot_id from m23_episode_first)),'episode stores conservative separation bounds');
select ok((select condition_active from public.alerts where m23_comparison_snapshot_id=(select snapshot_id from m23_episode_first)),'sustained snapshot opens a comparison alert');
insert into public.m23_comparison_snapshots(
  ad_work_day_id,ad_work_id,driver_id,vehicle_id,assignment_history_id,execution_history_id,
  gps_device_id,gps_device_vehicle_link_id,policy_id,policy_version,pairing_algorithm_version,
  authority_scope_key,input_watermark,input_hash,generated_at,source_expectation,
  phone_eligible_count,physical_eligible_count,pair_count,acceptable_pair_count,match_count,
  mismatch_candidate_count,insufficient_quality_count,unpaired_phone_count,unpaired_physical_count,
  sustained_pair_count,overall_outcome,finality,evaluation_phase,synthetic,build_complete)
select s.ad_work_day_id,s.ad_work_id,s.driver_id,s.vehicle_id,s.assignment_history_id,s.execution_history_id,
  s.gps_device_id,s.gps_device_vehicle_link_id,s.policy_id,s.policy_version,s.pairing_algorithm_version,
  s.authority_scope_key,s.input_watermark,public.m22_safe_digest('episode-inconclusive'),clock_timestamp()+interval '1 second','both_expected',
  0,0,0,0,0,0,0,0,0,0,'insufficient_pairs','provisional_active_work','active_work',true,true
from public.m23_comparison_snapshots s where s.id=(select snapshot_id from m23_episode_first);
do $$ declare v_policy public.m23_comparison_policies%rowtype; v_snapshot uuid;
begin select * into v_policy from public.m23_comparison_policies where policy_id='m23-episode-test' and policy_version='v1';
  select id into v_snapshot from public.m23_comparison_snapshots where input_hash=public.m22_safe_digest('episode-inconclusive');
  perform public.m23_sync_mismatch_alert(v_snapshot,'insufficient_pairs',null,v_policy);
end $$;
select ok((select condition_active from public.alerts where m23_comparison_snapshot_id=(select snapshot_id from m23_episode_first)),'inconclusive snapshot preserves the active alert');
select ok((select count(*)>0 from public.audit_logs where action='m23_comparison_inconclusive_observed' and entity_type='m23_comparison'),'inconclusive comparison is auditable without implying recovery');
insert into public.m23_comparison_snapshots(
  ad_work_day_id,ad_work_id,driver_id,vehicle_id,assignment_history_id,execution_history_id,
  gps_device_id,gps_device_vehicle_link_id,policy_id,policy_version,pairing_algorithm_version,
  authority_scope_key,input_watermark,input_hash,generated_at,source_expectation,
  phone_eligible_count,physical_eligible_count,pair_count,acceptable_pair_count,match_count,
  mismatch_candidate_count,insufficient_quality_count,unpaired_phone_count,unpaired_physical_count,
  sustained_pair_count,overall_outcome,finality,evaluation_phase,synthetic,build_complete)
select s.ad_work_day_id,s.ad_work_id,s.driver_id,s.vehicle_id,s.assignment_history_id,s.execution_history_id,
  s.gps_device_id,s.gps_device_vehicle_link_id,s.policy_id,s.policy_version,s.pairing_algorithm_version,
  s.authority_scope_key,s.input_watermark,public.m22_safe_digest('episode-recovery'),clock_timestamp()+interval '2 seconds','both_expected',
  3,3,3,3,3,0,0,0,0,0,'paired_match','provisional_active_work','active_work',true,true
from public.m23_comparison_snapshots s where s.id=(select snapshot_id from m23_episode_first);
do $$ declare v_policy public.m23_comparison_policies%rowtype; v_snapshot uuid;
begin select * into v_policy from public.m23_comparison_policies where policy_id='m23-episode-test' and policy_version='v1';
  select id into v_snapshot from public.m23_comparison_snapshots where input_hash=public.m22_safe_digest('episode-recovery');
  perform public.m23_sync_mismatch_alert(v_snapshot,'paired_match',0,v_policy);
end $$;
select ok(not (select condition_active from public.alerts where id=(select alert_id from public.m23_comparison_alert_context where first_snapshot_id=(select snapshot_id from m23_episode_first))),'only a qualifying newer paired match clears the condition');
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub','24000000-0000-0000-0000-000000000003')::text,true);
select diag(public.admin_transition_m23_comparison_review((select snapshot_id from m23_episode_first),'reviewing','triage','Synthetic evidence requires review.')::text);
select is((select status from public.m23_comparison_reviews where snapshot_id=(select snapshot_id from m23_episode_first)),'reviewing','review transition records reviewing');
select diag(public.admin_transition_m23_comparison_review((select snapshot_id from m23_episode_first),'reviewed_consistent','closed','Synthetic recovery was reviewed.')::text);
select is((select status from public.m23_comparison_reviews where snapshot_id=(select snapshot_id from m23_episode_first)),'reviewed_consistent','review transition records reviewed_consistent');
select is((select count(*)::integer from public.m23_comparison_review_history where snapshot_id=(select snapshot_id from m23_episode_first)),2,'review history stores each transition');
reset role;
select throws_ok(format('update public.m23_comparison_review_history set note=%L where snapshot_id=%L','tamper',(select snapshot_id from m23_episode_first)),'55000','M23 comparison review history is immutable','review history cannot be edited');
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub','24000000-0000-0000-0000-000000000003')::text,true);
select diag(public.admin_transition_m23_comparison_review((select snapshot_id from m23_episode_first),'dismissed_insufficient_evidence','dismiss','Synthetic evidence was dismissed.')::text);
select is((select status from public.m23_comparison_reviews where snapshot_id=(select snapshot_id from m23_episode_first)),'dismissed_insufficient_evidence','dismissed_insufficient_evidence is a terminal review state');
select throws_ok(format('select public.admin_transition_m23_comparison_review(%L,%L,%L,%L)',(select snapshot_id from m23_episode_first),'reviewing','reopen','Terminal review stays terminal.'),'55000','M23 review is terminal','terminal review cannot be silently reopened');
reset role;
select is((select public.m23_evaluate_scope('24000000-0000-0000-0000-000000000008','24000000-0000-0000-0000-000000000011','24000000-0000-0000-0000-000000000009','24000000-0000-0000-0000-000000000012','24000000-0000-0000-0000-000000000004','m23-episode-test','v1','2026-07-31 08:20+00')),(select snapshot_id from m23_episode_first),'same inputs deterministically reuse the same snapshot');
create temp table m23_episode_four on commit drop as
select public.m23_evaluate_scope('24000000-0000-0000-0000-000000000008','24000000-0000-0000-0000-000000000011','24000000-0000-0000-0000-000000000009','24000000-0000-0000-0000-000000000012','24000000-0000-0000-0000-000000000004','m23-episode-four','v1','2026-07-31 08:21+00') snapshot_id;
select is((select overall_outcome from public.m23_comparison_snapshots where id=(select snapshot_id from m23_episode_four)),'isolated_mismatch','one fewer qualifying pair does not become sustained');
create temp table m23_episode_duration on commit drop as
select public.m23_evaluate_scope('24000000-0000-0000-0000-000000000008','24000000-0000-0000-0000-000000000011','24000000-0000-0000-0000-000000000009','24000000-0000-0000-0000-000000000012','24000000-0000-0000-0000-000000000004','m23-episode-duration','v1','2026-07-31 08:22+00') snapshot_id;
select is((select overall_outcome from public.m23_comparison_snapshots where id=(select snapshot_id from m23_episode_duration)),'isolated_mismatch','one instant below duration does not become sustained');
select is((select count(*)::integer from public.m23_comparison_snapshots where policy_id='m23-episode-test'),3,'episode reruns add only deliberate phase snapshots');
select * from finish();
rollback;
