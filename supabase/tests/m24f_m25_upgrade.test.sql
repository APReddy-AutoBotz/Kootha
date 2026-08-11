begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select has_table('public','gps_devices','M20A device registry remains present');
select has_table('public','telemetry_receipts','M21 canonical receipt boundary remains present');
select has_table('public','m22_rule_signals','M22 deterministic rule evidence remains present');
select has_table('public','m23_comparison_snapshots','M23 comparison evidence remains present');
select has_table('public','m24f_adapter_candidates','M24F is additive');
select has_table('public','m25_statistical_signals','M25 is additive');
select ok(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('m24f_alerts','m25_alerts','m25_ml_predictions')),'M24F/M25 do not create competing alert or prediction masters');
select ok(exists(select 1 from pg_constraint where conrelid='public.alerts'::regclass and conname='alerts_m22_source_check'),'existing alerts source constraint remains the authority boundary');
select ok(exists(select 1 from public.m25_analysis_versions where analysis_version='m25-statistical-v1' and status='active'),'M25 upgrade leaves deterministic statistical analysis active');
select ok(not exists(select 1 from public.m25_analysis_versions where status='active' and kind in ('offline_ml_candidate','reviewed_ml_model')),'upgrade does not activate ML');
select ok(exists(select 1 from pg_proc where proname='admin_list_m24f_adapter_readiness_v1'),'M24F admin readiness RPC is installed');
select ok(exists(select 1 from pg_proc where proname='admin_get_m25_intelligence_readiness_v1'),'M25 admin readiness RPC is installed');

select * from finish();
rollback;
