begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

select has_function('public','m25_enqueue_feature_scope_v1',array['text','text','timestamp with time zone','timestamp with time zone','uuid','uuid','text','text','boolean'],'bounded M25 enqueue RPC exists');
select has_function('public','m25_process_statistical_queue',array['integer','timestamp with time zone'],'bounded M25 queue RPC exists');
select ok(pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure) ilike '%skip locked%','M25 queue claims use SKIP LOCKED');
select ok(pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure) ilike '%attempt_count%','M25 queue has bounded retry state');
select ok(pg_get_functiondef('public.m25_enqueue_feature_scope_v1(text,text,timestamptz,timestamptz,uuid,uuid,text,text,boolean)'::regprocedure) ilike '%on conflict%','M25 scope enqueue is idempotent');
select is((select count(*)::integer from public.m25_feature_definitions),27,'queue has the complete feature catalog');

select lives_ok($$select public.m25_enqueue_feature_scope_v1('fleet_day',repeat('e',64),'2026-08-07 00:00+00','2026-08-08 00:00+00',null,null,'synthetic-v1','synthetic-model',true)$$,'first M25 scope enqueue succeeds');
select lives_ok($$select public.m25_enqueue_feature_scope_v1('fleet_day',repeat('e',64),'2026-08-07 00:00+00','2026-08-08 00:00+00',null,null,'synthetic-v1','synthetic-model',true)$$,'repeated M25 scope enqueue succeeds');
select is((select count(*)::integer from public.m25_feature_extraction_jobs where scope_key_hash=repeat('e',64) and synthetic),1,'repeated enqueue does not create duplicate queue rows');
select is((select generation from public.m25_feature_extraction_jobs where scope_key_hash=repeat('e',64) and synthetic),2,'repeated enqueue advances the generation watermark');
select lives_ok($$select public.m25_process_statistical_queue(50,'2030-01-01 00:00+00')$$,'bounded M25 queue processing succeeds');
select is((select count(*)::integer from public.m25_feature_snapshots where scope_key_hash=repeat('e',64) and synthetic),1,'one completed generation produces one snapshot');
select is((select count(*)::integer from public.m25_feature_values v join public.m25_feature_snapshots s on s.id=v.snapshot_id where s.scope_key_hash=repeat('e',64) and s.synthetic),27,'one snapshot contains all typed feature values');

select * from finish();
rollback;
