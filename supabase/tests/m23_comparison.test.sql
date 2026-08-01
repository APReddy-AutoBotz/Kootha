begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

select ok(to_regclass('public.m23_comparison_policies') is not null, 'M23 policies exist');
select ok(to_regclass('public.m23_comparison_jobs') is not null, 'M23 bounded queue exists');
select ok(to_regclass('public.m23_comparison_snapshots') is not null, 'M23 snapshots exist');
select ok(to_regclass('public.m23_comparison_pairs') is not null, 'M23 pair evidence exists');
select ok(to_regclass('public.m23_comparison_review_history') is not null, 'M23 review history exists');
select ok(to_regclass('public.m23_comparison_heads') is not null, 'M23 latest heads exist');
select ok(to_regclass('public.m23_comparison_reviews') is not null, 'M23 current reviews exist');
select ok(to_regclass('public.m23_comparison_alert_context') is not null, 'M23 alert context exists');

select is((select policy_version from public.m23_comparison_policies limit 1), 'm23-pilot-v1', 'policy version is stable');
select is((select pair_window_seconds from public.m23_comparison_policies limit 1), 60, 'pairing window is 60 seconds');
select is((select sustained_mismatch_distance_meters::integer from public.m23_comparison_policies limit 1), 250, 'mismatch threshold is 250 metres');
select is((select sustained_mismatch_duration_seconds from public.m23_comparison_policies limit 1), 300, 'sustained episode is five minutes');
select is((select minimum_pair_count from public.m23_comparison_policies limit 1), 3, 'sustained episode requires three pairs');

select ok((select pg_get_constraintdef(oid) from pg_constraint where conname='alerts_m22_source_check') ~ 'comparison', 'comparison is an allowed alert source');
select function_lang_is('public','m23_evaluate_scope',array['uuid','uuid','uuid','uuid','uuid','text','text','timestamp with time zone'],'plpgsql');
select ok(pg_get_functiondef('public.m23_evaluate_scope(uuid,uuid,uuid,uuid,uuid,text,text,timestamptz)'::regprocedure) ~ 'm22_distance_m', 'Postgres owns distance calculation');
select ok(pg_get_functiondef('public.m23_evaluate_scope(uuid,uuid,uuid,uuid,uuid,text,text,timestamptz)'::regprocedure) ~ 'greatest\(0,v_raw-phone\.accuracy_meters-physical\.accuracy_meters\)', 'accuracy subtraction is conservative');
select ok(exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='m23_comparison_snapshots' and t.tgname='m23_snapshot_immutable'), 'snapshot immutability trigger exists');
select ok(exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='m23_comparison_pairs' and t.tgname='m23_pair_immutable'), 'pair immutability trigger exists');
select ok((select count(*)=8 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname in ('m23_comparison_policies','m23_comparison_jobs','m23_comparison_snapshots','m23_comparison_pairs','m23_comparison_review_history','m23_comparison_heads','m23_comparison_reviews','m23_comparison_alert_context')) , 'all M23 tables are present');
select table_privs_are('public','m23_comparison_pairs','authenticated',array[]::text[]);
select function_privs_are('public','m23_process_comparison_queue',array['integer','timestamp with time zone'],'authenticated',array[]::text[]);
select function_privs_are('public','m23_process_comparison_queue',array['integer','timestamp with time zone'],'service_role',array['EXECUTE']);
select function_privs_are('public','admin_list_m23_comparisons_v1',array['uuid','date','date','text','text','integer'],'authenticated',array['EXECUTE']);
select function_privs_are('public','admin_get_m23_comparison_detail_v1',array['uuid'],'authenticated',array['EXECUTE']);
select function_privs_are('public','admin_get_m23_comparison_technical_values_v1',array['uuid'],'authenticated',array['EXECUTE']);
select function_privs_are('public','admin_transition_m23_comparison_review',array['uuid','text','text','text'],'authenticated',array['EXECUTE']);
select ok(pg_get_functiondef('public.admin_get_m23_comparison_technical_values_v1(uuid)'::regprocedure) !~ '(latitude|longitude|\\blat\\b|\\blng\\b)', 'technical access exposes no coordinates');
select ok(pg_get_functiondef('public.run_data_retention(uuid[])'::regprocedure) ~ 'm23_comparison_pairs', 'retention preserves referenced comparison points');
select ok(pg_get_functiondef('public.m23_sync_mismatch_alert(uuid,text,numeric,public.m23_comparison_policies)'::regprocedure) ~ '''comparison''', 'comparison alert source is explicit');

select * from finish();
rollback;
