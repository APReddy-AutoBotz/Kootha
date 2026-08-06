create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

insert into public.drivers(id,name,phone,approval_status,onboarding_status)
values('2b000000-0000-0000-0000-000000000001','M23 Due Parallel Driver','9000000031','approved','approved');
insert into public.vehicles(id,vehicle_number,vehicle_type,onboarding_status,active)
values('2b000000-0000-0000-0000-000000000002','M23-DUE-PARALLEL-VEHICLE','van','approved',true);
insert into public.ad_works(id,title,tracking_type,mobile_location_proof_required)
values('2b000000-0000-0000-0000-000000000003','M23 Due Parallel Work','mobile',true);
insert into public.ad_work_days(id,ad_work_id,work_date,driver_id,vehicle_id,execution_status,execution_started_at)
select format('2b100000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,
  '2b000000-0000-0000-0000-000000000003','2026-08-02'::date+n,
  '2b000000-0000-0000-0000-000000000001','2b000000-0000-0000-0000-000000000002','planned',null
from generate_series(0,4) n;
insert into public.m21_execution_history(id,ad_work_day_id,execution_status,effective_from,effective_until,history_origin)
values('2b200000-0000-0000-0000-000000000000','2b100000-0000-0000-0000-000000000000','running','2026-08-02 00:00+00','2026-08-02 01:00+00','observed');
insert into public.m23_comparison_snapshots(
  id,ad_work_day_id,ad_work_id,execution_history_id,policy_id,policy_version,authority_scope_key,input_hash,
  source_expectation,overall_outcome,finality,evaluation_phase,synthetic,build_complete)
values('2b300000-0000-0000-0000-000000000000','2b100000-0000-0000-0000-000000000000','2b000000-0000-0000-0000-000000000003',
  '2b200000-0000-0000-0000-000000000000','phone-device-comparison','m23-pilot-v1',
  public.m22_safe_digest('m23-due-parallel-scope'),public.m22_safe_digest('m23-due-parallel-input'),
  'both_expected','awaiting_sources','provisional_active_work','active_work',true,true);
insert into public.m23_comparison_heads(authority_scope_key,policy_id,policy_version,snapshot_id,updated_at)
select authority_scope_key,policy_id,policy_version,id,clock_timestamp()
from public.m23_comparison_snapshots where id='2b300000-0000-0000-0000-000000000000';
delete from public.m23_comparison_jobs where ad_work_id='2b000000-0000-0000-0000-000000000003';
insert into public.m23_comparison_jobs(id,ad_work_day_id,ad_work_id,policy_id,policy_version,state,next_attempt_at,completed_at,processing_generation,completed_generation)
select '2b400000-0000-0000-0000-000000000000','2b100000-0000-0000-0000-000000000000','2b000000-0000-0000-0000-000000000003','phone-device-comparison','m23-pilot-v1','completed','2026-08-02 00:00+00','2026-08-02 00:00+00',1,1;
insert into public.m23_comparison_jobs(id,ad_work_day_id,ad_work_id,policy_id,policy_version,state,next_attempt_at)
select format('2b400000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,
  format('2b100000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,
  '2b000000-0000-0000-0000-000000000003','phone-device-comparison','m23-pilot-v1','pending','2026-08-02 00:00+00'
from generate_series(1,4) n;
update public.m23_due_sweep_state set cursor_ad_work_day_id=null,cursor_policy_id=null,cursor_policy_version=null,cursor_job_id=null;

create or replace function public.m23_hold_due_cursor_for_test()
returns integer language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  perform 1 from public.m23_due_sweep_state where id=true for update;
  perform pg_sleep(2);
  return 1;
end;
$$;

\connect postgres supabase_admin

select plan(10);
select dblink_connect_u('m23_due_1','dbname=postgres');
select dblink_connect_u('m23_due_2','dbname=postgres');
select dblink_connect_u('m23_due_3','dbname=postgres');
select dblink_connect_u('m23_due_4','dbname=postgres');
select dblink_connect_u('m23_due_5','dbname=postgres');
select dblink_send_query('m23_due_1',$$select public.m23_enqueue_due_comparison_jobs('2026-08-02 00:05+00',1)$$);
select dblink_send_query('m23_due_2',$$select public.m23_enqueue_due_comparison_jobs('2026-08-02 00:05+00',1)$$);
select dblink_send_query('m23_due_3',$$select public.m23_enqueue_due_comparison_jobs('2026-08-02 00:05+00',1)$$);
select dblink_send_query('m23_due_4',$$select public.m23_enqueue_due_comparison_jobs('2026-08-02 00:05+00',1)$$);
select dblink_send_query('m23_due_5',$$select public.m23_enqueue_due_comparison_jobs('2026-08-02 00:05+00',1)$$);
create temp table m23_due_results(enqueued integer);
insert into m23_due_results select enqueued from dblink_get_result('m23_due_1') as r(enqueued integer);
insert into m23_due_results select enqueued from dblink_get_result('m23_due_2') as r(enqueued integer);
insert into m23_due_results select enqueued from dblink_get_result('m23_due_3') as r(enqueued integer);
insert into m23_due_results select enqueued from dblink_get_result('m23_due_4') as r(enqueued integer);
insert into m23_due_results select enqueued from dblink_get_result('m23_due_5') as r(enqueued integer);
select is((select count(*)::integer from m23_due_results),5,'five concurrent due sweeps complete');
select is((select sum(enqueued)::integer from m23_due_results),1,'exactly one concurrent invocation owns due discovery');
select is((select state from public.m23_comparison_jobs where id='2b400000-0000-0000-0000-000000000000'),'pending','the single due job is requeued once');
select ok((select cursor_job_id is null or exists(select 1 from public.m23_comparison_jobs j where j.id=cursor_job_id) from public.m23_due_sweep_state),'due cursor remains valid after concurrent sweeps');

select dblink_connect_u('m23_due_lock','dbname=postgres');
select dblink_send_query('m23_due_lock',$$select public.m23_hold_due_cursor_for_test()$$);
select pg_sleep(0.25);
select dblink_disconnect('m23_due_1');
select dblink_disconnect('m23_due_2');
select dblink_disconnect('m23_due_3');
select dblink_disconnect('m23_due_4');
select dblink_disconnect('m23_due_5');
select dblink_connect_u('m23_due_1','dbname=postgres');
select dblink_connect_u('m23_due_2','dbname=postgres');
select dblink_connect_u('m23_due_3','dbname=postgres');
select dblink_connect_u('m23_due_4','dbname=postgres');
select dblink_connect_u('m23_due_5','dbname=postgres');
select dblink_send_query('m23_due_1',$$select public.m23_process_comparison_queue(1,'2026-08-02 00:05+00')$$);
select dblink_send_query('m23_due_2',$$select public.m23_process_comparison_queue(1,'2026-08-02 00:05+00')$$);
select dblink_send_query('m23_due_3',$$select public.m23_process_comparison_queue(1,'2026-08-02 00:05+00')$$);
select dblink_send_query('m23_due_4',$$select public.m23_process_comparison_queue(1,'2026-08-02 00:05+00')$$);
select dblink_send_query('m23_due_5',$$select public.m23_process_comparison_queue(1,'2026-08-02 00:05+00')$$);
select pg_sleep(0.35);
select ok(dblink_is_busy('m23_due_1')=0 and dblink_is_busy('m23_due_2')=0 and dblink_is_busy('m23_due_3')=0 and dblink_is_busy('m23_due_4')=0 and dblink_is_busy('m23_due_5')=0,'queue RPCs continue while another session holds the due cursor lock');
select pg_sleep(2.1);
select * from dblink_get_result('m23_due_lock') as r(done integer);
create temp table m23_queue_results(result jsonb);
insert into m23_queue_results select result from dblink_get_result('m23_due_1') as r(result jsonb);
insert into m23_queue_results select result from dblink_get_result('m23_due_2') as r(result jsonb);
insert into m23_queue_results select result from dblink_get_result('m23_due_3') as r(result jsonb);
insert into m23_queue_results select result from dblink_get_result('m23_due_4') as r(result jsonb);
insert into m23_queue_results select result from dblink_get_result('m23_due_5') as r(result jsonb);
select is((select count(*)::integer from m23_queue_results),5,'five queue RPCs return exact results');
select is((select sum((result->>'claimed')::integer)::integer from m23_queue_results),5,'five concurrent workers claim five jobs exactly once');
select is((select sum((result->>'completed')::integer)::integer from m23_queue_results),5,'five concurrent workers complete five jobs exactly once');
select is((select sum((result->>'retry_or_failed')::integer)::integer from m23_queue_results),0,'concurrent workers produce no retry or failure counts');
select is((select count(*)::integer from public.m23_comparison_jobs where ad_work_id='2b000000-0000-0000-0000-000000000003' and state='completed'),5,'all parallel queue jobs complete without lost work');
select dblink_disconnect('m23_due_lock');
select dblink_disconnect('m23_due_1');
select dblink_disconnect('m23_due_2');
select dblink_disconnect('m23_due_3');
select dblink_disconnect('m23_due_4');
select dblink_disconnect('m23_due_5');

delete from public.m23_comparison_jobs where ad_work_id='2b000000-0000-0000-0000-000000000003';
delete from public.m23_comparison_heads where snapshot_id='2b300000-0000-0000-0000-000000000000';
delete from public.m23_comparison_snapshots where id='2b300000-0000-0000-0000-000000000000';
delete from public.m21_execution_history where id='2b200000-0000-0000-0000-000000000000';
delete from public.ad_work_days where ad_work_id='2b000000-0000-0000-0000-000000000003';
delete from public.ad_works where id='2b000000-0000-0000-0000-000000000003';
delete from public.drivers where id='2b000000-0000-0000-0000-000000000001';
delete from public.vehicles where id='2b000000-0000-0000-0000-000000000002';
update public.m23_due_sweep_state set cursor_ad_work_day_id=null,cursor_policy_id=null,cursor_policy_version=null,cursor_job_id=null;
drop function public.m23_hold_due_cursor_for_test();
