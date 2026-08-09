begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

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
select is((select count(*)::integer from public.m25_feature_values v join public.m25_feature_snapshots s on s.id=v.snapshot_id where s.scope_key_hash=repeat('e',64) and s.synthetic),27,'one snapshot contains all typed feature values');
select is((select count(*)::integer from public.m25_feature_values v join public.m25_feature_snapshots s on s.id=v.snapshot_id where s.scope_key_hash=repeat('e',64) and v.observation_status='unavailable' and (v.sample_count<>0 or v.coverage_score<>0)),0,'unavailable features never masquerade as covered observations');
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

select * from finish();
rollback;
