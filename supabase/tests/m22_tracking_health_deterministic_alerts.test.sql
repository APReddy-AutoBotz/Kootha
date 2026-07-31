begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

select is((select count(*)::integer from public.m22_rule_policies
  where rule_version='m22-pilot-v1'),23,'all 23 M22 pilot rules are seeded');
select is((select count(distinct rule_id)::integer from public.m22_rule_policies),23,
  'rule IDs are unique in the pilot catalog');
select ok((select bool_and(safe_policy_note ilike '%provisional%')
  from public.m22_rule_policies),'every pilot threshold is labelled provisional');
select is((select opening_threshold from public.m22_rule_policies
  where rule_id='heartbeat_missing'),120::numeric,'live freshness is two minutes');
select ok((select opening_threshold from public.m22_rule_policies
  where rule_id='device_offline') >
  (select opening_threshold from public.m22_rule_policies
  where rule_id='heartbeat_missing'),'offline threshold is longer than heartbeat warning');

select has_table('public','alerts','existing alerts master is extended');
select has_column('public','alerts','rule_id','alerts store rule ID');
select has_column('public','alerts','rule_version','alerts store exact rule version');
select has_column('public','alerts','dedupe_key','alerts store deterministic dedupe key');
select has_column('public','alerts','condition_cleared_at','alerts retain clear time');
select has_table('public','alert_status_history','status history exists');
select has_table('public','alert_notes','immutable notes exist');
select has_table('public','m22_rule_signals','durable sanitized signals exist');
select has_table('public','m22_rule_evaluation_queue','bounded evaluation queue exists');
select has_table('public','m22_auth_failure_aggregates','safe auth aggregates exist');
select has_table('public','m22_rule_assessments','rule assessments exist');
select has_table('public','m22_health_sweep_cursor','restart-safe health sweep cursor exists');
select has_column('public','m22_rule_signals','ad_work_day_id','health signals pin the work day');
select has_column('public','m22_rule_signals','tracking_session_id','health signals pin the physical session');
select has_column('public','m22_rule_signals','execution_history_id','health signals pin the authority episode');

select has_function('public','m22_process_rule_queue',array['integer','timestamp with time zone'],
  'bounded queue worker RPC exists');
select has_function('public','m22_run_health_sweep',array['integer','timestamp with time zone'],
  'bounded sweep RPC exists');
select has_function('public','admin_transition_alert',array['uuid','text','text','text'],
  'admin lifecycle RPC exists');
select has_function('public','m22_record_sanitized_signal',
  array['text','text','text','timestamp with time zone','uuid','uuid','text'],
  'narrow sanitized signal RPC exists');
select has_function('public','m22_compact_operational_rows',
  array['integer','timestamp with time zone'],'bounded operational compaction RPC exists');
select has_function('public','admin_get_m22_tracking_health_v1',
  array['uuid','date','date','integer','timestamp with time zone'],'bounded Tracking Health v1 RPC exists');
select has_function('public','admin_list_m22_alerts_v1',
  array['text','text','text','text','uuid','uuid','uuid','boolean','boolean','integer'],
  'safe alert-list v1 RPC exists');
select has_function('public','admin_get_m22_alert_technical_values_v1',array['uuid'],
  'separate audited technical-value RPC exists');

select * from finish();
rollback;
