create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

insert into public.ad_works(id,title,tracking_type,mobile_location_proof_required)
values('2c000000-0000-0000-0000-000000000001','M23 Alert Parallel Work','both',true);
insert into public.ad_work_days(id,ad_work_id,work_date,execution_status,execution_started_at)
values('2c000000-0000-0000-0000-000000000002','2c000000-0000-0000-0000-000000000001','2026-08-03','running','2026-08-03 08:00+00');
insert into public.m23_comparison_snapshots(
  id,ad_work_day_id,ad_work_id,policy_id,policy_version,authority_scope_key,input_hash,source_expectation,
  phone_eligible_count,physical_eligible_count,pair_count,acceptable_pair_count,match_count,mismatch_candidate_count,
  insufficient_quality_count,unpaired_phone_count,unpaired_physical_count,sustained_pair_count,
  sustained_first_pair_at,sustained_last_pair_at,overall_outcome,finality,evaluation_phase,synthetic,build_complete)
values('2c000000-0000-0000-0000-000000000003','2c000000-0000-0000-0000-000000000002','2c000000-0000-0000-0000-000000000001',
  'phone-device-comparison','m23-pilot-v1',public.m22_safe_digest('m23-alert-parallel-scope'),public.m22_safe_digest('m23-alert-parallel-input'),
  'both_expected',3,3,3,3,0,3,0,0,0,3,'2026-08-03 08:02+00','2026-08-03 08:07+00',
  'sustained_mismatch','provisional_active_work','active_work',true,true);
create or replace function public.m23_alert_parallel_observe(p_snapshot_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_policy public.m23_comparison_policies%rowtype; v_alert_id uuid;
begin
  select * into v_policy from public.m23_comparison_policies where policy_id='phone-device-comparison' and policy_version='m23-pilot-v1';
  perform public.m23_sync_mismatch_alert(p_snapshot_id,'sustained_mismatch',300,v_policy);
  select id into v_alert_id from public.alerts where m23_comparison_snapshot_id=p_snapshot_id order by episode_number desc,id desc limit 1;
  return v_alert_id;
end;
$$;

\connect postgres supabase_admin

select plan(4);
select dblink_connect_u('m23_alert_c1','dbname=postgres');
select dblink_connect_u('m23_alert_c2','dbname=postgres');
select dblink_send_query('m23_alert_c1',$$select public.m23_alert_parallel_observe('2c000000-0000-0000-0000-000000000003')$$);
select dblink_send_query('m23_alert_c2',$$select public.m23_alert_parallel_observe('2c000000-0000-0000-0000-000000000003')$$);
create temp table m23_alert_parallel_results(alert_id uuid);
insert into m23_alert_parallel_results select id from dblink_get_result('m23_alert_c1') as r(id uuid);
insert into m23_alert_parallel_results select id from dblink_get_result('m23_alert_c2') as r(id uuid);
select is((select count(distinct alert_id)::integer from m23_alert_parallel_results),1,'concurrent mismatch observations share one alert episode');
select is((select count(*)::integer from public.alerts where source='comparison' and m23_comparison_snapshot_id='2c000000-0000-0000-0000-000000000003'),1,'concurrent mismatch observations create exactly one active episode');
select is((select max(episode_number)::integer from public.alerts where source='comparison' and m23_comparison_snapshot_id='2c000000-0000-0000-0000-000000000003'),1,'concurrent opening assigns one deterministic episode number');
select is((select count(*)::integer from public.m23_comparison_alert_context where authority_scope_key=public.m22_safe_digest('m23-alert-parallel-scope')),1,'concurrent opening records one context row');
select dblink_disconnect('m23_alert_c1');
select dblink_disconnect('m23_alert_c2');

set session_replication_role=replica;
delete from public.m23_comparison_alert_context where authority_scope_key=public.m22_safe_digest('m23-alert-parallel-scope');
delete from public.alert_status_history where alert_id in (select id from public.alerts where source='comparison' and m23_comparison_snapshot_id='2c000000-0000-0000-0000-000000000003');
delete from public.audit_logs where entity_type='alert' and entity_id in (select id from public.alerts where source='comparison' and m23_comparison_snapshot_id='2c000000-0000-0000-0000-000000000003');
delete from public.alerts where source='comparison' and m23_comparison_snapshot_id='2c000000-0000-0000-0000-000000000003';
delete from public.m23_comparison_snapshots where id='2c000000-0000-0000-0000-000000000003';
delete from public.ad_work_days where id='2c000000-0000-0000-0000-000000000002';
delete from public.ad_works where id='2c000000-0000-0000-0000-000000000001';
set session_replication_role=origin;
