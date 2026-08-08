begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

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

select * from finish();
rollback;
