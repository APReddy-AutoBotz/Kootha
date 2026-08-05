begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into public.drivers(id,name,phone,approval_status,onboarding_status)
values('2a000000-0000-0000-0000-000000000001','M23 Due Driver','9000000030','approved','approved');
insert into public.vehicles(id,vehicle_number,vehicle_type,onboarding_status,active)
values('2a000000-0000-0000-0000-000000000002','M23-DUE-VEHICLE','van','approved',true);
insert into public.ad_works(id,title,tracking_type,mobile_location_proof_required)
values('2a000000-0000-0000-0000-000000000003','M23 Due Work','mobile',true);

insert into public.ad_work_days(id,ad_work_id,work_date,driver_id,vehicle_id,execution_status,execution_started_at)
select format('2a100000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,
  '2a000000-0000-0000-0000-000000000003','2026-01-01'::date+n,
  '2a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000002','running','2026-08-01 00:00+00'
from generate_series(0,150) n;
insert into public.m21_execution_history(id,ad_work_day_id,execution_status,effective_from,effective_until,history_origin)
select format('2a200000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,
  format('2a100000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,'running',
  case when n=0 then '2026-08-01 00:04+00'::timestamptz else '2026-08-01 00:00+00'::timestamptz end,
  '2026-08-01 01:00+00','observed'
from generate_series(0,150) n;
insert into public.m23_comparison_snapshots(
  id,ad_work_day_id,ad_work_id,execution_history_id,policy_id,policy_version,authority_scope_key,input_hash,
  source_expectation,overall_outcome,finality,evaluation_phase,synthetic,build_complete)
select format('2a300000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,
  format('2a100000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,
  '2a000000-0000-0000-0000-000000000003',format('2a200000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,'phone-device-comparison','m23-pilot-v1',
  public.m22_safe_digest(format('m23-due-scope-%s',n)),public.m22_safe_digest(format('m23-due-input-%s',n)),
  'both_expected','awaiting_sources','provisional_active_work','active_work',true,true
from generate_series(0,150) n;
insert into public.m23_comparison_heads(authority_scope_key,policy_id,policy_version,snapshot_id,updated_at)
select s.authority_scope_key,s.policy_id,s.policy_version,s.id,'2026-08-01 00:00+00'
from public.m23_comparison_snapshots s where s.ad_work_id='2a000000-0000-0000-0000-000000000003';
update public.m23_comparison_jobs set state='completed',completed_at='2026-08-01 00:00+00',locked_at=null,
  processing_generation=requested_generation,completed_generation=requested_generation,dirty_after_claim=false,safe_failure_reason_code=null
where ad_work_id='2a000000-0000-0000-0000-000000000003';

select public.m23_enqueue_due_comparison_jobs('2026-08-01 00:05+00',1);
select is((select state from public.m23_comparison_jobs where ad_work_day_id='2a100000-0000-0000-0000-000000000000'),'completed','a due head from another work day cannot requeue the sentinel job');
select public.m23_enqueue_due_comparison_jobs('2026-08-01 00:05+00',10);
select public.m23_enqueue_due_comparison_jobs('2026-08-01 00:05+00',10);
select public.m23_enqueue_due_comparison_jobs('2026-08-01 00:05+00',10);
select public.m23_enqueue_due_comparison_jobs('2026-08-01 00:05+00',10);
select public.m23_enqueue_due_comparison_jobs('2026-08-01 00:05+00',10);
select public.m23_enqueue_due_comparison_jobs('2026-08-01 00:05+00',10);
select public.m23_enqueue_due_comparison_jobs('2026-08-01 00:05+00',10);
select public.m23_enqueue_due_comparison_jobs('2026-08-01 00:05+00',10);
select public.m23_enqueue_due_comparison_jobs('2026-08-01 00:05+00',10);
select public.m23_enqueue_due_comparison_jobs('2026-08-01 00:05+00',10);
select public.m23_enqueue_due_comparison_jobs('2026-08-01 00:05+00',10);
select public.m23_enqueue_due_comparison_jobs('2026-08-01 00:05+00',10);
select public.m23_enqueue_due_comparison_jobs('2026-08-01 00:05+00',10);
select public.m23_enqueue_due_comparison_jobs('2026-08-01 00:05+00',10);
select public.m23_enqueue_due_comparison_jobs('2026-08-01 00:05+00',10);
select is((select count(*)::integer from public.m23_comparison_jobs where ad_work_id='2a000000-0000-0000-0000-000000000003' and state='pending'),150,'repeated bounded sweeps eventually requeue every due job');
select is((select count(*)::integer from public.m23_comparison_jobs where ad_work_day_id='2a100000-0000-0000-0000-000000000000' and state='completed'),1,'the non-due sentinel remains completed');
select is((select count(*)::integer from public.m23_comparison_jobs where ad_work_id='2a000000-0000-0000-0000-000000000003' and state='pending' and ad_work_day_id<>'2a100000-0000-0000-0000-000000000000'),150,'only due work is requeued and later jobs are not starved');
select * from finish();
rollback;
