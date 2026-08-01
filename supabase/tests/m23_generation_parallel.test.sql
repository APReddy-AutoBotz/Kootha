create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

insert into public.drivers(id,name,phone,approval_status,onboarding_status)
values('25000000-0000-0000-0000-000000000001','M23 Generation Driver','9000000025','approved','approved');
insert into public.vehicles(id,vehicle_number,vehicle_type,onboarding_status,active)
values('25000000-0000-0000-0000-000000000002','M23-GENERATION-VEHICLE','van','approved',true);
insert into public.ad_works(id,title,tracking_type,mobile_location_proof_required)
values('25000000-0000-0000-0000-000000000006','M23 Generation Work','mobile',true);
insert into public.ad_work_days(id,ad_work_id,work_date,driver_id,vehicle_id,execution_status,execution_started_at)
values('25000000-0000-0000-0000-000000000008','25000000-0000-0000-0000-000000000006','2026-07-31','25000000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000002','planned',null);
-- A prior interrupted local-only test must not leave an orphaned queue row
-- that could be selected by the bounded worker sweep.
delete from public.m23_comparison_jobs j
where not exists(select 1 from public.ad_work_days w where w.id=j.ad_work_day_id);

select public.m23_enqueue_comparison_job('25000000-0000-0000-0000-000000000008');

\connect postgres supabase_admin
select dblink_connect_u('m23_g1','dbname=postgres');
select dblink_connect_u('m23_g2','dbname=postgres');
select plan(10);
select ok((select count(*) from public.m23_comparison_jobs where ad_work_day_id='25000000-0000-0000-0000-000000000008')=1,'initial comparison job is coalesced by work day and policy');
update public.m23_comparison_jobs set state='processing',processing_generation=requested_generation,
  dirty_after_claim=false,locked_at=clock_timestamp()
where ad_work_day_id='25000000-0000-0000-0000-000000000008';
select dblink_send_query('m23_g1',$$ select pg_sleep(1.5); $$);
select pg_sleep(0.2);
select dblink_send_query('m23_g2',$$
  select public.m23_enqueue_comparison_job('25000000-0000-0000-0000-000000000008');
$$);
create temp table m23_enqueue_result(result text);
insert into m23_enqueue_result select * from dblink_get_result('m23_g2') as r(result text);
select pg_sleep(1.6);
select * from dblink_get_result('m23_g1') as r(slept text);
update public.m23_comparison_jobs set
  state=case when requested_generation>processing_generation then 'pending' else 'completed' end,
  completed_generation=processing_generation,
  dirty_after_claim=(requested_generation>processing_generation),locked_at=null,updated_at=clock_timestamp()
where ad_work_day_id='25000000-0000-0000-0000-000000000008';
create temp table m23_generation_result as
select state,requested_generation,processing_generation,completed_generation,dirty_after_claim
from public.m23_comparison_jobs where ad_work_day_id='25000000-0000-0000-0000-000000000008';
select ok((select count(*) from m23_generation_result)=1 and (select count(*) from m23_enqueue_result)=1,'parallel claim and arrival both complete');
select is((select requested_generation from m23_generation_result),3::bigint,'arrival during processing increments the requested generation watermark');
select is((select state from m23_generation_result),'pending','completion re-enters pending when a newer generation arrived');
select is((select dirty_after_claim from m23_generation_result),true,'dirty watermark prevents a lost wakeup');
select is((select count(*)::integer from public.m23_comparison_jobs where ad_work_day_id='25000000-0000-0000-0000-000000000008'),1,'parallel arrivals remain one coalesced job');
select is((public.m23_process_comparison_queue(1,clock_timestamp())->>'completed')::integer,1,'next worker processes the pending generation');
select ok((select state='completed' and requested_generation=3 and completed_generation=3 and not dirty_after_claim from public.m23_comparison_jobs where ad_work_day_id='25000000-0000-0000-0000-000000000008'),'completed generation catches up without another point');
update public.m23_comparison_jobs set state='processing',locked_at='2026-07-01 00:00+00',processing_generation=completed_generation where ad_work_day_id='25000000-0000-0000-0000-000000000008';
select is((public.m23_process_comparison_queue(1,clock_timestamp())->>'completed')::integer,1,'stale processing lock is recoverable');
select is((select count(*)::integer from public.customer_updates),0,'generation workers create no customer side effects');
select * from finish();
select dblink_disconnect('m23_g1');
select dblink_disconnect('m23_g2');

delete from public.m23_comparison_jobs where ad_work_day_id='25000000-0000-0000-0000-000000000008';
set session_replication_role=replica;
delete from public.m21_execution_history where ad_work_day_id='25000000-0000-0000-0000-000000000008';
delete from public.m21_assignment_history where ad_work_id='25000000-0000-0000-0000-000000000006';
delete from public.m21_release_history where ad_work_id='25000000-0000-0000-0000-000000000006';
set session_replication_role=origin;
delete from public.ad_work_days where id='25000000-0000-0000-0000-000000000008';
delete from public.ad_works where id='25000000-0000-0000-0000-000000000006';
delete from public.drivers where id='25000000-0000-0000-0000-000000000001';
delete from public.vehicles where id='25000000-0000-0000-0000-000000000002';
