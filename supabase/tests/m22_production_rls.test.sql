begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

select ok((select c.relrowsecurity from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='alerts'), 'alerts RLS is enabled');
select ok((select c.relrowsecurity from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='alert_status_history'), 'alert_status_history RLS is enabled');
select ok((select c.relrowsecurity from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='alert_notes'), 'alert_notes RLS is enabled');
select ok((select c.relrowsecurity from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='m22_rule_policies'), 'm22_rule_policies RLS is enabled');
select ok((select c.relrowsecurity from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='m22_rule_signals'), 'm22_rule_signals RLS is enabled');
select ok((select c.relrowsecurity from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='m22_rule_evaluation_queue'), 'm22_rule_evaluation_queue RLS is enabled');
select ok((select c.relrowsecurity from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='m22_auth_failure_aggregates'), 'm22_auth_failure_aggregates RLS is enabled');
select ok((select c.relrowsecurity from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='m22_rule_state'), 'm22_rule_state RLS is enabled');
select ok((select c.relrowsecurity from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='m22_rule_assessments'), 'm22_rule_assessments RLS is enabled');
select ok((select c.relrowsecurity from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='m22_health_sweep_cursor'), 'health sweep cursor RLS is enabled');

select table_privs_are('public','m22_rule_signals','authenticated',array[]::text[]);
select table_privs_are('public','m22_rule_evaluation_queue','authenticated',array[]::text[]);
select table_privs_are('public','m22_auth_failure_aggregates','authenticated',array[]::text[]);
select table_privs_are('public','m22_rule_state','authenticated',array[]::text[]);
select table_privs_are('public','m22_health_sweep_cursor','authenticated',array[]::text[]);
select table_privs_are('public','alert_status_history','anon',array[]::text[]);
select table_privs_are('public','alert_notes','anon',array[]::text[]);
select table_privs_are('public','alerts','anon',array[]::text[]);
select function_privs_are('public','m22_process_rule_queue',
  array['integer','timestamp with time zone'],'authenticated',array[]::text[]);
select function_privs_are('public','m22_record_sanitized_signal',
  array['text','text','text','timestamp with time zone','uuid','uuid','text'],
  'authenticated',array[]::text[]);
select function_privs_are('public','m22_record_adapter_rejection_batch',
  array['text','timestamp with time zone','uuid','integer','integer'],
  'authenticated',array[]::text[]);
select function_privs_are('public','m22_compact_operational_rows',
  array['integer','timestamp with time zone'],'authenticated',array[]::text[]);
select function_privs_are('public','admin_list_m22_alerts',
  array['text','text','text','text','uuid','uuid','uuid','boolean','boolean','integer'],
  'authenticated',array[]::text[]);
select function_privs_are('public','admin_list_m22_alerts_v1',
  array['text','text','text','text','uuid','uuid','uuid','boolean','boolean','integer'],
  'authenticated',array['EXECUTE']);
select function_privs_are('public','admin_get_m22_alert_technical_values_v1',
  array['uuid'],'authenticated',array['EXECUTE']);

select * from finish();
rollback;
