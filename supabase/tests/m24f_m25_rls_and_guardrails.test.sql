begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

select has_table('public','m24f_adapter_capability_manifests','M24F capability manifests exist');
select has_table('public','m24f_adapter_candidates','M24F candidates exist');
select has_table('public','m24f_certification_runs','M24F certification runs exist');
select has_table('public','m24f_certification_scenarios','M24F certification scenarios exist');
select has_table('public','m24f_candidate_decision_history','M24F decision history exists');
select has_table('public','m25_feature_definitions','M25 feature definitions exist');
select has_table('public','m25_feature_extraction_jobs','M25 bounded extraction queue exists');
select has_table('public','m25_feature_snapshots','M25 feature snapshots exist');
select has_table('public','m25_feature_values','M25 typed feature values exist');
select has_table('public','m25_baseline_versions','M25 baseline versions exist');
select has_table('public','m25_statistical_signal_definitions','M25 signal definitions exist');
select has_table('public','m25_statistical_signals','M25 signals exist');
select has_table('public','m25_signal_review_history','M25 signal review history exists');
select has_table('public','m25_readiness_assessments','M25 readiness assessments exist');
select has_table('public','m25_analysis_versions','M25 analysis governance exists');

select ok(
  (select count(*) = 15 and bool_and(c.relrowsecurity)
   from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in (
       'm24f_adapter_capability_manifests','m24f_adapter_candidates','m24f_certification_runs',
       'm24f_certification_scenarios','m24f_candidate_decision_history','m25_feature_definitions',
       'm25_feature_extraction_jobs','m25_feature_snapshots','m25_feature_values','m25_baseline_versions',
       'm25_statistical_signal_definitions','m25_statistical_signals','m25_signal_review_history',
       'm25_readiness_assessments','m25_analysis_versions'
     )),
  'all M24F and M25 persistence tables have RLS enabled'
);
select is((select count(*)::integer from public.m25_feature_definitions),27,'all 27 M25 features are seeded');
select is((select count(*)::integer from public.m25_statistical_signal_definitions),18,'all 18 M25 signals are seeded');
select ok(exists(select 1 from public.m25_analysis_versions where analysis_version='m25-statistical-v1' and kind='robust_statistical_baseline' and status='active'),'deterministic statistical analysis is active');
select ok(not exists(select 1 from public.m25_analysis_versions where kind in ('offline_ml_candidate','reviewed_ml_model') and status='active'),'ML analysis cannot be active in M25');
select ok((select pg_get_constraintdef(oid) ilike '%statistical_signal%' from pg_catalog.pg_constraint where conname='alerts_m22_source_check' and conrelid='public.alerts'::regclass),'existing alert platform accepts the explicit statistical source');
-- Match prohibited storage concepts at identifier boundaries. A bare `payload`
-- substring is intentionally not prohibited: documented_payload_size_bytes is
-- bounded capability metadata, not a payload. Raw payload columns remain caught.
select is((select count(*)::integer from information_schema.columns where table_schema='public' and table_name like 'm24f_%' and column_name ~* '(^|_)(credentials?|secrets?|tokens?|api_keys?|authorization|ciphertexts?|key_material|vendor_endpoint|endpoint_url|latitude|longitude|coordinates?|physical_device_evidence|raw(_vendor)?_?payload)($|_)' and column_name not in ('documented_payload_size_bytes','server_only_secret_required','secret_storage_requirement','key_id_available')),0,'M24F tables contain no credentials, secrets, raw vendor payloads, coordinates, vendor endpoints, or physical-device evidence');
select is((select count(*)::integer from information_schema.columns where table_schema='public' and table_name like 'm25_%' and column_name ~* '(^|_)(credentials?|secrets?|tokens?|api_keys?|authorization|ciphertexts?|key_material|vendor_endpoint|endpoint_url|latitude|longitude|coordinates?|physical_device_evidence|raw(_vendor)?_?payload)($|_)' and column_name not in ('documented_payload_size_bytes','server_only_secret_required','secret_storage_requirement','key_id_available')),0,'M25 tables contain no credentials, secrets, raw vendor payloads, coordinates, vendor endpoints, or physical-device evidence');
select has_function('public','admin_record_m24f_certification_scenarios_v1',array['uuid','text[]','text[]','boolean[]','text[]'],'typed M24F scenario persistence RPC exists');
select has_function('public','admin_get_m25_intelligence_readiness_v1',array['integer'],'safe M25 readiness RPC exists');
select has_function('public','admin_promote_m25_signal_to_alert_v1',array['uuid','text','text'],'explicit M25 alert promotion RPC exists');
select ok(not has_function_privilege('anon','public.m24f_compact_certification_runs(integer,timestamptz)','EXECUTE') and not has_function_privilege('authenticated','public.m24f_compact_certification_runs(integer,timestamptz)','EXECUTE'),'M24F compaction is service-only');
select ok(not has_function_privilege('anon','public.m25_process_statistical_queue(integer,timestamptz)','EXECUTE') and not has_function_privilege('authenticated','public.m25_process_statistical_queue(integer,timestamptz)','EXECUTE'),'M25 queue processing is service-only');

select ok(public.m24f_is_safe_metadata('Bounded synthetic certification note.'),'ordinary bounded certification metadata is accepted');
select ok(not public.m24f_is_safe_metadata('Authorization: Bearer abcdefghijklmnop'),'bearer credentials are rejected by value');
select ok(not public.m24f_is_safe_metadata('api_key=vendor-secret-value'),'API keys are rejected by value');
select ok(not public.m24f_is_safe_metadata('send to https://vendor.example/device'),'vendor endpoints are rejected by value');
select ok(not public.m24f_is_safe_metadata('position 12.34567, 77.65432'),'coordinate pairs are rejected by value');
select ok(not public.m24f_is_safe_metadata('raw payload: {device:sample}'),'raw payload fragments are rejected by value');
select ok((select pg_get_constraintdef(oid) ilike '%observation_status%' from pg_catalog.pg_constraint where conname='m25_feature_value_observation_check'),'unavailable features require zero sample and coverage');
select ok(pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure) ilike '%promoted_alert_id is null%' and pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure) not ilike '%insert into public.alerts%','statistical worker preserves reviewed signals and has zero automatic alert side effects');

select * from finish();
rollback;
