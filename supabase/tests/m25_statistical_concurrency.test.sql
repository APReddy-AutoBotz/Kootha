-- Run this test as the disposable database owner so its two-session concurrency
-- harness can use dblink_connect_u without granting that privileged entry point
-- to any production role. This is the same local-Supabase-only pattern used by
-- the retained M22/M23 parallel pgTAP suites.
\connect postgres supabase_admin

begin;
create extension if not exists pgtap with schema extensions;
select plan(110);

select has_function('public','m25_enqueue_feature_scope_v1',array['text','text','timestamp with time zone','timestamp with time zone','uuid','uuid','text','text','boolean'],'bounded M25 enqueue RPC exists');
select has_function('public','m25_process_statistical_queue',array['integer','timestamp with time zone'],'bounded M25 queue RPC exists');
select ok(pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure) ilike '%skip locked%','M25 queue claims use SKIP LOCKED');
select ok(pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure) ilike '%attempt_count%','M25 queue has bounded retry state');
select ok(pg_get_functiondef('public.m25_enqueue_feature_scope_v1(text,text,timestamptz,timestamptz,uuid,uuid,text,text,boolean)'::regprocedure) ilike '%on conflict%','M25 scope enqueue is idempotent');
select is((select count(*)::integer from public.m25_feature_definitions),27,'queue has the complete feature catalog');

select lives_ok($$select public.m25_enqueue_feature_scope_v1('fleet_day',repeat('e',64),'2026-08-07 00:00+00','2026-08-08 00:00+00',null,null,null,null,true)$$,'first M25 scope enqueue succeeds');
create temporary table m25_test_watermark as
select input_watermark from public.m25_feature_extraction_jobs
where scope_key_hash=repeat('e',64) and synthetic;
select lives_ok($$select public.m25_enqueue_feature_scope_v1('fleet_day',repeat('e',64),'2026-08-07 00:00+00','2026-08-08 00:00+00',null,null,null,null,true)$$,'repeated M25 scope enqueue succeeds');
select is((select count(*)::integer from public.m25_feature_extraction_jobs where scope_key_hash=repeat('e',64) and synthetic),1,'repeated enqueue does not create duplicate queue rows');
select is((select generation from public.m25_feature_extraction_jobs where scope_key_hash=repeat('e',64) and synthetic),1,'exact replay preserves the generation watermark');
select is((select input_watermark from public.m25_feature_extraction_jobs where scope_key_hash=repeat('e',64) and synthetic),(select input_watermark from m25_test_watermark),'exact replay preserves the authoritative input watermark');
select lives_ok($$select public.m25_process_statistical_queue(50,'2030-01-01 00:00+00')$$,'bounded M25 queue processing succeeds');
select is((select count(*)::integer from public.m25_feature_snapshots where scope_key_hash=repeat('e',64) and synthetic),1,'one completed generation produces one snapshot');
select lives_ok($$select public.m25_enqueue_feature_scope_v1('fleet_day',repeat('e',64),'2026-08-07 00:00+00','2026-08-08 00:00+00',null,null,null,null,true)$$,'exact replay after completion succeeds');
select is((select generation from public.m25_feature_extraction_jobs where scope_key_hash=repeat('e',64) and synthetic),1,'exact replay after completion remains a no-op');
select lives_ok($$select public.m25_process_statistical_queue(50,'2030-01-01 00:00+00')$$,'no-op replay does not require duplicate processing');
select is((select count(*)::integer from public.m25_feature_snapshots where scope_key_hash=repeat('e',64) and synthetic),1,'exact replay retains one immutable snapshot');
select is(
  (select count(*)::integer from public.m25_feature_values v join public.m25_feature_snapshots s on s.id=v.snapshot_id where s.scope_key_hash=repeat('e',64) and s.synthetic),
  (select count(*)::integer from public.m25_feature_definitions where active and availability_status='implemented'),
  'one snapshot contains exactly the active implemented feature catalog');
select is(
  (select array_agg(v.feature_id order by v.feature_id) from public.m25_feature_values v join public.m25_feature_snapshots s on s.id=v.snapshot_id where s.scope_key_hash=repeat('e',64) and s.synthetic),
  (select array_agg(feature_id order by feature_id) from public.m25_feature_definitions where active and availability_status='implemented'),
  'snapshot feature identities exactly match the active implemented catalog');
select is((select count(*)::integer from public.m25_feature_values v join public.m25_feature_snapshots s on s.id=v.snapshot_id join public.m25_feature_definitions f on f.feature_id=v.feature_id where s.scope_key_hash=repeat('e',64) and not f.active),0,'inactive unavailable definitions emit no fake feature observations');
select is((select count(*)::integer from public.m25_baseline_versions b join public.m25_feature_definitions f on f.feature_id=b.metric where not f.active),0,'inactive unavailable definitions cannot contribute to baselines');
select is((select count(*)::integer from public.m25_signal_evaluations e join public.m25_statistical_signal_definitions d on d.signal_id=e.signal_id join public.m25_feature_definitions f on f.feature_id=d.metric where not f.active),0,'inactive unavailable definitions cannot contribute to signal evaluation or downstream readiness');
select throws_ok($$select public.m25_enqueue_feature_scope_v1('device_work_day',repeat('a',64),'2026-08-07','2026-08-08',null,null,null,null,true)$$,'22023','Invalid bounded M25 feature scope dimensions','work-day scope requires both exact dimensions');
select throws_ok($$select public.m25_enqueue_feature_scope_v1('fleet_day',repeat('b',64),'2026-08-07','2026-08-08',null,null,'mixed-adapter',null,true)$$,'22023','Invalid bounded M25 feature scope dimensions','fleet scope cannot carry a misleading adapter cohort');
select ok(pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure) ilike '%r.ad_work_day_id=j.ad_work_day_id%','authoritative selector constrains exact work day');
select ok(pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure) ilike '%r.adapter_version=j.adapter_version%','authoritative selector constrains exact adapter version');
select ok(pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure) ilike '%d.model=j.device_model%','authoritative selector constrains exact device model');
select is((select count(*)::integer from public.m25_readiness_assessments where source_snapshot_id in (select id from public.m25_feature_snapshots where scope_key_hash=repeat('e',64))),1,'readiness persistence is idempotently keyed to its source snapshot');

-- Model a newly observed authoritative source watermark, then prove that enqueue
-- advances it once and that the immediately repeated enqueue is again a no-op.
update public.m25_feature_extraction_jobs set input_watermark=repeat('f',64)
where scope_key_hash=repeat('e',64) and synthetic;
select lives_ok($$select public.m25_enqueue_feature_scope_v1('fleet_day',repeat('e',64),'2026-08-07 00:00+00','2026-08-08 00:00+00',null,null,null,null,true)$$,'changed authoritative input watermark reenqueues processing');
select is((select generation from public.m25_feature_extraction_jobs where scope_key_hash=repeat('e',64) and synthetic),2,'changed authoritative input watermark advances generation exactly once');
select lives_ok($$select public.m25_enqueue_feature_scope_v1('fleet_day',repeat('e',64),'2026-08-07 00:00+00','2026-08-08 00:00+00',null,null,null,null,true)$$,'replay of the changed watermark succeeds');
select is((select generation from public.m25_feature_extraction_jobs where scope_key_hash=repeat('e',64) and synthetic),2,'replay of the changed watermark does not advance generation again');

select lives_ok($$select public.m25_process_statistical_queue(50,'2030-01-01 00:00+00')$$,'changed generation processes successfully');
select is((select count(*)::integer from public.m25_feature_snapshots where scope_key_hash=repeat('e',64) and synthetic),2,'changed evidence retains two immutable snapshot generations');
select is((select count(*)::integer from public.m25_feature_snapshots latest join public.m25_feature_snapshots prior on prior.id=latest.supersedes_snapshot_id where latest.scope_key_hash=repeat('e',64) and latest.generation=2 and prior.generation=1),1,'corrected snapshot explicitly supersedes its prior generation');
select is((select count(*)::integer from public.m25_feature_snapshots fs where fs.scope_key_hash=repeat('e',64) and fs.synthetic and not exists(select 1 from public.m25_feature_snapshots newer where newer.scope=fs.scope and newer.scope_key_hash=fs.scope_key_hash and newer.period_start=fs.period_start and newer.period_end=fs.period_end and newer.feature_version=fs.feature_version and newer.synthetic=fs.synthetic and newer.generation>fs.generation)),1,'only one generation is authoritative for a scope-period');
select is((select max(reviewed_work_day_sessions) from public.m25_readiness_assessments where source_snapshot_id in (select id from public.m25_feature_snapshots where scope_key_hash=repeat('e',64))),0,'corrected non-work-day snapshots cannot inflate work-day session readiness');

select ok(pg_get_functiondef('public.m25_enqueue_feature_scope_v1(text,text,timestamptz,timestamptz,uuid,uuid,text,text,boolean)'::regprocedure) ilike '%telemetry_identity_conflicts%'
  and pg_get_functiondef('public.m25_enqueue_feature_scope_v1(text,text,timestamptz,timestamptz,uuid,uuid,text,text,boolean)'::regprocedure) ilike '%c.last_seen_at%'
  and pg_get_functiondef('public.m25_enqueue_feature_scope_v1(text,text,timestamptz,timestamptz,uuid,uuid,text,text,boolean)'::regprocedure) ilike '%c.incoming_content_hash%',
  'input watermark binds exact scoped identity-conflict evidence');
select ok(regexp_replace(
    pg_get_functiondef('public.m25_enqueue_feature_scope_v1(text,text,timestamptz,timestamptz,uuid,uuid,text,text,boolean)'::regprocedure),
    '[[:space:]]','','g'
  ) ilike '%r.captured_at>=p_period_start%r.captured_at<p_period_end%',
  'late conflict evidence is assigned to the original receipt capture period');
select ok(pg_get_functiondef('public.m25_enqueue_feature_scope_v1(text,text,timestamptz,timestamptz,uuid,uuid,text,text,boolean)'::regprocedure)
  not ilike '%c.first_seen_at >= p_period_start%',
  'conflict discovery time cannot contaminate an unrelated later period watermark');
select ok(pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure)
  ilike '%count(DISTINCT r.id)%' and pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure)
  ilike '%r.captured_at >= j.period_start%r.captured_at < j.period_end%',
  'worker counts each affected scoped receipt once regardless of conflict row multiplicity');
select ok(pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure)
  not ilike '%WHERE c.first_seen_at >= j.period_start%',
  'worker conflict numerator and receipt denominator use the same historical population');

-- Prove that successful generations do not consume a lifetime retry budget.
select lives_ok($$
do $generations$
declare n integer;
begin
  perform public.m25_enqueue_feature_scope_v1('fleet_day',repeat('c',64),'2026-08-09','2026-08-10',null,null,null,null,true);
  for n in 2..10 loop
    update public.m25_feature_extraction_jobs set state='completed',attempt_count=1,
      input_watermark=repeat(substr('0123456789abcdef',n,1),64)
    where scope_key_hash=repeat('c',64) and synthetic;
    perform public.m25_enqueue_feature_scope_v1('fleet_day',repeat('c',64),'2026-08-09','2026-08-10',null,null,null,null,true);
  end loop;
end
$generations$;
$$,'more than eight successive changed generations can be enqueued');
select ok((select generation=10 and state='pending' and attempt_count=0 and safe_failure_reason_code is null
  from public.m25_feature_extraction_jobs where scope_key_hash=repeat('c',64) and synthetic),
  'each changed generation receives a fresh bounded retry budget');

update public.m25_feature_extraction_jobs set state='failed',attempt_count=8,
  safe_failure_reason_code='attempts_exhausted',input_watermark=repeat('f',64)
where scope_key_hash=repeat('c',64) and synthetic;
select lives_ok($$select public.m25_enqueue_feature_scope_v1('fleet_day',repeat('c',64),'2026-08-09','2026-08-10',null,null,null,null,true)$$,
  'a changed watermark revives an exhausted prior generation');
select ok((select generation=11 and state='pending' and attempt_count=0 and safe_failure_reason_code is null
  from public.m25_feature_extraction_jobs where scope_key_hash=repeat('c',64) and synthetic),
  'exhausted failure state does not strand corrected evidence');


select ok(pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure)
  ilike '%order by authoritative_correction_pending desc,period_end,period_start,next_attempt_at,created_at,id%',
  'out-of-order enqueue timestamps cannot overtake chronological correction evidence');
select ok(pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure)
  ilike '%later.period_end=(select min(next_period.period_end)%'
  and pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure)
  ilike '%authoritative_correction_pending=true,dependency_cause_snapshot_id=s_id%',
  'multi-period corrections cascade one bounded authoritative period at a time');


select ok(
  replace(pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure), E'\n', ' ')
    ilike '%when generation=claimed_generation and not dirty_after_claim then false%else authoritative_correction_pending end%',
  'dirty concurrent claims retain authoritative correction evidence for their corrected retry');
select is(public.m25_signal_state_v1(1.99,3,2,'investigate',2,2,true),'normal',
  'a prior investigating signal clears below the clearing threshold');
select is(public.m25_signal_state_v1(2,3,2,'investigate',2,2,true),'watch',
  'a prior investigating signal remains watch at the clearing threshold');
select is(public.m25_signal_state_v1(2.5,3,2,'investigate',2,2,true),'watch',
  'a prior investigating signal remains watch inside hysteresis');
select is(public.m25_signal_state_v1(3,3,2,'normal',2,2,true),'investigate',
  'the opening threshold investigates with required consecutive support');
select is(public.m25_signal_state_v1(3,3,2,'normal',1,2,true),'watch',
  'the opening threshold remains watch before consecutive support');
select is(public.m25_signal_state_v1(2.5,3,2,'watch',2,2,true),'normal',
  'only the prior investigating state retains hysteresis');
select is(public.m25_signal_state_v1(3,3,2,'investigate',2,2,false),'insufficient_data',
  'support gates remain authoritative before hysteresis');

select ok(
  regexp_replace(pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure),'[[:space:]]','','g')
    ilike '%select*intostrictjfrompublic.m25_feature_extraction_jobswhereid=j.idforupdate;%updatepublic.m25_feature_extraction_jobssetstate=''processing''%select*intostrictjfrompublic.m25_feature_extraction_jobswhereid=j.id;%',
  'each batched job reloads its authoritative live generation and correction marker before artifact construction');
select ok(
  pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure)
    ilike '%from public.m25_signal_evaluations prior%prior.period_end<j.period_end%order by prior.period_end desc,prior.source_generation desc%',
  'hysteresis reads the latest authoritative evaluation before the current period');
select ok(
  pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure)
    not ilike '%select sig.state into v_previous_state from public.m25_statistical_signals sig%',
  'an invalidated current signal row cannot supply historical hysteresis state');
select is(public.m25_signal_state_v1(2.5,3,2,'investigate',2,2,true),'watch',
  'P1-to-P2-to-P3 reconstruction preserves watch inside hysteresis after a prior investigating period');

select ok(
  pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure)
    ilike '%j.period_end::text,j.generation::text,v_baseline_version%',
  'evaluation identity includes the authoritative source generation');
select ok(
  pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure)
    ilike '%generated_at = excluded.generated_at%source_generation < excluded.source_generation%',
  'a corrected same-period generation replaces stale current signal evidence');
select ok(
  pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure)
    not ilike '%state not in (''reviewed'',''suppressed'') and (public.m25_statistical_signals.generated_at%',
  'reviewed same-period state cannot block authoritative correction replacement');
select ok(
  pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure)
    ilike '%generated_at = excluded.generated_at%source_generation < excluded.source_generation%'
  and pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure)
    not ilike '%state not in (''reviewed'',''suppressed'') and (public.m25_statistical_signals.generated_at%',
  'suppressed same-period state also yields to the newest authoritative evaluation');
select ok(
  pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure)
    ilike '%promoted_alert_id is null%',
  'same-period correction remains fail closed after explicit promotion');
select ok(
  pg_get_functiondef('public.admin_promote_m25_signal_to_alert_v1(uuid,text,text)'::regprocedure)
    ilike '%h.evaluation_id=s.evaluation_id%',
  'stale review evidence cannot authorize promotion of a newer evaluation');
select ok(
  pg_get_functiondef('public.admin_transition_m25_signal_review_v1(uuid,text,text,text,text)'::regprocedure)
    ilike '%s.evaluation_id%',
  'a fresh review binds to the newest evaluation and can satisfy promotion authority');

select ok(
  pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure)
    ilike '%generated_at < excluded.generated_at%'
  and pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure)
    not ilike '%generated_at < excluded.generated_at%state not in (''reviewed'',''suppressed'')%',
  'a newer authoritative period replaces a reviewed or suppressed older signal');
select ok(
  pg_get_functiondef('public.admin_promote_m25_signal_to_alert_v1(uuid,text,text)'::regprocedure)
    ilike '%newer.period_end>s.generated_at%newer.source_generation>s.source_generation%',
  'promotion rejects a stale current projection when a newer authoritative evaluation exists');
select ok(
  pg_get_functiondef('public.admin_promote_m25_signal_to_alert_v1(uuid,text,text)'::regprocedure)
    ilike '%h.evaluation_id=s.evaluation_id%',
  'promotion requires a matching immutable review for the newest current evaluation');

select has_function('public','m25_signal_authority_lock_v1',array['text','text','boolean'],
  'shared M25 signal authority lock exists');
select has_trigger('public','m25_signal_evaluations','m25_evaluation_authority_serialization',
  'authoritative evaluation writes acquire the shared episode lock');
select ok(
  pg_get_functiondef('public.admin_promote_m25_signal_to_alert_v1(uuid,text,text)'::regprocedure)
    ilike '%perform public.m25_signal_authority_lock_v1(s.signal_id,s.scope_key_hash,s.synthetic)%select * into s from public.m25_statistical_signals where id=p_signal_id for update%',
  'promotion acquires episode serialization before locking and re-reading the signal');
select ok(
  pg_get_functiondef('public.admin_promote_m25_signal_to_alert_v1(uuid,text,text)'::regprocedure)
    ilike '%current_evaluation.evaluation_id=s.evaluation_id%current_evaluation.source_generation=s.source_generation%',
  'promotion requires the exact current authoritative evaluation after serialization');

-- Executable two-session evidence for the reviewed-evidence race. Evaluation
-- publication holds the same transaction lock promotion must acquire, so the
-- promotion-side authority check cannot run until the newer evaluation commits.
create extension if not exists dblink with schema extensions;
-- The test-owner entry point is required here because local Supabase's direct
-- PostgreSQL endpoint uses trust authentication. Ordinary dblink_connect rejects
-- that endpoint for non-superusers even when a password is included, because the
-- server does not challenge for it. No reusable credential is persisted.
select dblink_connect_u('m25_eval_writer','dbname=postgres');
select dblink_connect_u('m25_promoter','dbname=postgres');
select dblink_send_query('m25_eval_writer',$race$
  with authority_lock as materialized (
    select public.m25_signal_authority_lock_v1('rejection_rate_shift',repeat('9',64),true)
  ), lock_pause as materialized (
    select pg_sleep(1.5) from authority_lock
  )
  select 1 from lock_pause;
$race$);
do $wait_for_evaluation_lock$
declare n integer:=0;
begin
  while not exists(select 1 from pg_catalog.pg_locks where locktype='advisory' and granted and pid<>pg_backend_pid()) loop
    perform pg_sleep(0.05); n:=n+1;
    if n>40 then raise exception 'evaluation authority lock was not acquired'; end if;
  end loop;
end
$wait_for_evaluation_lock$;
select dblink_send_query('m25_promoter',$race$
  with authority_lock as materialized (
    select public.m25_signal_authority_lock_v1('rejection_rate_shift',repeat('9',64),true)
  )
  select 1 from authority_lock;
$race$);
select pg_sleep(0.2);
select is(dblink_is_busy('m25_promoter'),1,
  'promotion waits while an authoritative evaluation transaction is committing');
select * from dblink_get_result('m25_eval_writer') as r(done integer);
select is((select done from dblink_get_result('m25_promoter') as r(done integer)),1,
  'promotion proceeds only after current evaluation authority is visible');
select is(dblink_disconnect('m25_eval_writer'),'OK','evaluation concurrency session closes');
select is(dblink_disconnect('m25_promoter'),'OK','promotion concurrency session closes');

-- Positive and fail-closed authority cases use real admin RPCs. The current
-- evaluation must be reviewed; an immutable review of a superseded evaluation
-- remains history but cannot authorize an alert.
insert into public.user_profiles(auth_user_id,display_name,role)
values('25000000-0000-0000-0000-000000000013','M25 Serialization Admin','admin');
insert into public.m25_signal_evaluations(evaluation_id,signal_id,scope_key_hash,synthetic,period_end,state,anomalous,baseline_version,source_generation)
values
  (repeat('1',64),'rejection_rate_shift',repeat('7',64),true,'2026-08-13 00:00+00','watch',true,'serialization-current-v1',1),
  (repeat('2',64),'rejection_rate_shift',repeat('8',64),true,'2026-08-13 00:00+00','watch',true,'serialization-stale-v1',1);
insert into public.m25_statistical_signals(id,signal_id,signal_episode_id,metric,scope,scope_key_hash,direction,state,observed_value,baseline_median,baseline_mad,fallback_statistic,robust_score,sample_count,support_level,coverage_score,baseline_version,explanation_code,rule_fallback,synthetic,generated_at,evaluation_id,source_generation)
values
  ('25000000-0000-0000-0000-000000000071','rejection_rate_shift','serialization-current','rejection_rate','fleet_day',repeat('7',64),'high_bad','watch',0.5,0.1,0.1,'mad',3.1,8,'synthetic_only',1,'serialization-current-v1','rejection_rate_shift','Admin review only.',true,'2026-08-13 00:00+00',repeat('1',64),1),
  ('25000000-0000-0000-0000-000000000072','rejection_rate_shift','serialization-stale','rejection_rate','fleet_day',repeat('8',64),'high_bad','watch',0.5,0.1,0.1,'mad',3.1,8,'synthetic_only',1,'serialization-stale-v1','rejection_rate_shift','Admin review only.',true,'2026-08-13 00:00+00',repeat('2',64),1);

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub','25000000-0000-0000-0000-000000000013')::text,true);
select throws_ok(
  $$select public.admin_promote_m25_signal_to_alert_v1('25000000-0000-0000-0000-000000000071','serialization gate','Current evaluation requires review.')$$,
  '55000','A matching review of the newest authoritative evaluation is required before promotion',
  'an unreviewed current evaluation cannot be promoted');
select lives_ok(
  $$select public.admin_transition_m25_signal_review_v1('25000000-0000-0000-0000-000000000071','reviewed','confirmed_operational_issue','serialization review','Current evaluation reviewed.')$$,
  'the current authoritative evaluation can receive an immutable review');
select lives_ok(
  $$select public.admin_promote_m25_signal_to_alert_v1('25000000-0000-0000-0000-000000000071','serialization promotion','Current reviewed evaluation promoted.')$$,
  'promotion succeeds after the exact current evaluation is reviewed');
select lives_ok(
  $$select public.admin_transition_m25_signal_review_v1('25000000-0000-0000-0000-000000000072','reviewed','confirmed_operational_issue','stale review','Original evaluation reviewed.')$$,
  'the older evaluation review is retained immutably');
reset role;
insert into public.m25_signal_evaluations(evaluation_id,signal_id,scope_key_hash,synthetic,period_end,state,anomalous,baseline_version,source_generation)
values(repeat('3',64),'rejection_rate_shift',repeat('8',64),true,'2026-08-14 00:00+00','watch',true,'serialization-newer-v2',2);
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub','25000000-0000-0000-0000-000000000013')::text,true);
select throws_ok(
  $$select public.admin_promote_m25_signal_to_alert_v1('25000000-0000-0000-0000-000000000072','stale promotion','Superseded evaluation must fail closed.')$$,
  '55000','A matching review of the newest authoritative evaluation is required before promotion',
  'a newer authoritative evaluation makes the old matching review non-promotable');
reset role;

select ok(regexp_replace(pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure),'[[:space:]]','','g')
  ilike '%fs.scope=''device_model_day''%fs.device_modelisnotnull%',
  'non-model scopes cannot advance device-model-day readiness');
select ok(regexp_replace(pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure),'[[:space:]]','','g')
  ilike '%fs.scope=''device_work_day''%exists%observation_status=''observed''%sample_count>0%coverage_score>0%',
  'empty work-day generations cannot advance reviewed-session readiness');
select ok(regexp_replace(pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure),'[[:space:]]','','g')
  ilike '%count(distinct(fs.scope_key_hash,fs.period_start,fs.period_end))%',
  'qualifying authoritative work-day evidence counts once per stable session identity');
select ok(regexp_replace(pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure),'[[:space:]]','','g')
  ilike '%newer.generation>fs.generation%',
  'replayed and corrected readiness evidence remains deduplicated to the authoritative generation');

select ok(regexp_replace(pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure),'[[:space:]]','','g')
  ilike '%count(distinctfs.period_start::date)filter(whereexists(select1frompublic.m25_feature_valuesobservedwhereobserved.snapshot_id=fs.idandobserved.observation_status=''observed''andobserved.sample_count>0andobserved.coverage_score>0))%',
  'calendar-day readiness requires qualifying observed evidence');
select ok(regexp_replace(pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure),'[[:space:]]','','g')
  ilike '%count(distinct(fs.device_model,fs.period_start::date))filter(wherefs.scope=''device_model_day''andfs.device_modelisnotnullandexists(select1frompublic.m25_feature_valuesobservedwhereobserved.snapshot_id=fs.idandobserved.observation_status=''observed''andobserved.sample_count>0andobserved.coverage_score>0))%',
  'model-day readiness requires model-scoped qualifying observed evidence');
select ok(regexp_replace(pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure),'[[:space:]]','','g')
  not ilike '%count(distinctfs.period_start::date)::integerreviewed_calendar_days%',
  'empty authoritative snapshots do not advance calendar readiness');
select ok(regexp_replace(pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure),'[[:space:]]','','g')
  ilike '%notexists(select1frompublic.m25_feature_snapshotsnewerwhere%newer.generation>fs.generation)%',
  'mixed generations contribute only their latest authoritative snapshot');
select ok(regexp_replace(pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure),'[[:space:]]','','g')
  ilike '%count(distinctfs.period_start::date)filter(%',
  'qualifying calendar evidence counts exact distinct dates');
select ok(regexp_replace(pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure),'[[:space:]]','','g')
  ilike '%count(distinct(fs.device_model,fs.period_start::date))filter(%',
  'qualifying model evidence counts exact distinct model-day identities');

-- A promoted statistical cohort remains frozen while its alert is active. Once
-- the authoritative lifecycle closes that alert, a strictly newer evaluation
-- opens a new current episode without rewriting prior evaluations or reviews.
create temporary table m25_episode_history_counts as
select
  (select count(*) from public.m25_signal_evaluations where signal_id='rejection_rate_shift' and scope_key_hash=repeat('7',64)) evaluation_count,
  (select count(*) from public.m25_signal_review_history where signal_id='25000000-0000-0000-0000-000000000071') review_count,
  (select promoted_alert_id from public.m25_statistical_signals where id='25000000-0000-0000-0000-000000000071') alert_id;

select lives_ok($$
  insert into public.m25_signal_evaluations(evaluation_id,signal_id,scope_key_hash,synthetic,period_end,state,anomalous,baseline_version,source_generation)
  values(repeat('4',64),'rejection_rate_shift',repeat('7',64),true,'2026-08-15 00:00+00','watch',true,'active-alert-freeze-v1',2)
$$,'a newer evaluation may be retained immutably while the linked alert is active');
select ok((select promoted_alert_id is not null from public.m25_statistical_signals where id='25000000-0000-0000-0000-000000000071'),
  'an active promoted alert freezes the current signal episode');

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub','25000000-0000-0000-0000-000000000013')::text,true);
select lives_ok($$select public.admin_transition_alert((select promoted_alert_id from public.m25_statistical_signals where id='25000000-0000-0000-0000-000000000071'),'acknowledged','episode lifecycle','Acknowledged statistical alert.')$$,
  'statistical alerts retain acknowledge behavior');
select lives_ok($$select public.admin_transition_alert((select promoted_alert_id from public.m25_statistical_signals where id='25000000-0000-0000-0000-000000000071'),'investigating','episode lifecycle','Investigating statistical alert.')$$,
  'statistical alerts retain investigate behavior');
select lives_ok($$select public.admin_transition_alert((select promoted_alert_id from public.m25_statistical_signals where id='25000000-0000-0000-0000-000000000071'),'resolved','episode lifecycle','Resolved statistical alert.')$$,
  'statistical alerts retain resolve behavior');
reset role;

select is((select condition_active from public.alerts where id=(select promoted_alert_id from public.m25_statistical_signals where id='25000000-0000-0000-0000-000000000071')),false,
  'terminal statistical transition clears the active condition');
select ok((select condition_cleared_at is not null from public.alerts where id=(select promoted_alert_id from public.m25_statistical_signals where id='25000000-0000-0000-0000-000000000071')),
  'terminal statistical transition persists the condition-cleared timestamp');
select is((select status::text from public.alerts where id=(select promoted_alert_id from public.m25_statistical_signals where id='25000000-0000-0000-0000-000000000071')),'resolved',
  'the historical statistical alert remains terminal');

select lives_ok($$
  insert into public.m25_signal_evaluations(evaluation_id,signal_id,scope_key_hash,synthetic,period_end,state,anomalous,baseline_version,source_generation)
  values(repeat('5',64),'rejection_rate_shift',repeat('7',64),true,'2026-08-16 00:00+00','watch',true,'new-episode-v1',3)
$$,'a newer evaluation reopens a cohort after terminal alert closure');
select is((select promoted_alert_id from public.m25_statistical_signals where id='25000000-0000-0000-0000-000000000071'),null::uuid,
  'the reopened current projection is eligible for a new reviewed episode');
select ok((select signal_episode_id like '%'||repeat('5',64) from public.m25_statistical_signals where id='25000000-0000-0000-0000-000000000071'),
  'the reopened projection has a distinct evaluation-bound episode identity');
select lives_ok($$
  insert into public.m25_signal_evaluations(evaluation_id,signal_id,scope_key_hash,synthetic,period_end,state,anomalous,baseline_version,source_generation)
  values(repeat('5',64),'rejection_rate_shift',repeat('7',64),true,'2026-08-16 00:00+00','watch',true,'new-episode-v1',3)
  on conflict(evaluation_id) do nothing
$$,'replaying the new evaluation is idempotent');
select is(
  (select count(*) from public.m25_signal_evaluations where signal_id='rejection_rate_shift' and scope_key_hash=repeat('7',64)),
  (select evaluation_count+2 from m25_episode_history_counts),
  'episode replay does not duplicate immutable evaluations');
select is(
  (select count(*) from public.m25_signal_review_history where signal_id='25000000-0000-0000-0000-000000000071'),
  (select review_count from m25_episode_history_counts),
  'episode closure does not mutate immutable review history');
select ok((select a.status::text='resolved' and not a.condition_active and a.condition_cleared_at is not null from public.alerts a join m25_episode_history_counts h on h.alert_id=a.id),
  'the prior alert remains immutable after its current projection reopens');
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub','25000000-0000-0000-0000-000000000013')::text,true);
select lives_ok($$select public.admin_list_m22_alerts_v1(p_limit=>20)$$,
  'alert list behavior remains available after statistical episode closure');
select lives_ok($$select public.admin_get_m22_alert_detail_v1((select alert_id from m25_episode_history_counts))$$,
  'terminal statistical alert detail remains available after cohort reopening');
reset role;

select * from finish();
rollback;
