begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select ok((select indexdef ilike '%unique%' from pg_indexes
  where schemaname='public' and indexname='alerts_m22_active_episode_unique'),
  'concurrent active episodes have a unique index');
select function_lang_is('public','m22_apply_rule_observation',
  array['uuid','text','timestamp with time zone','text','text','uuid','uuid','numeric','alert_severity'],
  'plpgsql','observation transaction is authoritative in PostgreSQL');
select function_returns('public','m22_apply_rule_observation',
  array['uuid','text','timestamp with time zone','text','text','uuid','uuid','numeric','alert_severity'],
  'uuid','observation transaction returns the episode');
select ok(pg_get_functiondef('public.m22_apply_rule_observation(uuid,text,timestamptz,text,text,uuid,uuid,numeric,public.alert_severity)'::regprocedure)
  ilike '%pg_advisory_xact_lock%','dedupe transaction takes a context lock');
select ok(pg_get_functiondef('public.m22_process_rule_queue(integer,timestamptz)'::regprocedure)
  ilike '%skip locked%','queue claims use SKIP LOCKED');
select ok(pg_get_functiondef('public.m22_process_rule_queue(integer,timestamptz)'::regprocedure)
  ilike '%attempt_count%','queue processing has bounded retry state');

select * from finish();
rollback;
