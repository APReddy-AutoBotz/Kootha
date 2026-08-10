begin;
create extension if not exists pgtap with schema extensions;
select plan(102);

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
-- Match prohibited storage concepts at identifier boundaries. The exceptions are
-- narrowly enumerated declarative capability metadata; in particular,
-- webhook_direction is a bounded enum, not an endpoint, URL, or payload channel.
select is((select count(*)::integer from information_schema.columns where table_schema='public' and table_name like 'm24f_%' and column_name ~* '(^|_)(credentials?|passwords?|passwds?|secrets?|tokens?|api_keys?|auth(_entication|_orization)?_headers?|authorization|ciphertexts?|key_material|vendor_endpoint|endpoint_url|callbacks?|webhooks?|callback_urls?|webhook_urls?|latitude|longitude|coordinates?|physical_device_evidence|raw(_vendor)?_?payload)($|_)' and column_name not in ('documented_payload_size_bytes','server_only_secret_required','secret_storage_requirement','key_id_available','webhook_direction')),0,'M24F tables contain no credentials, secrets, raw vendor payloads, coordinates, vendor endpoints, or physical-device evidence');
select is((select count(*)::integer from information_schema.columns where table_schema='public' and table_name like 'm25_%' and column_name ~* '(^|_)(credentials?|passwords?|passwds?|secrets?|tokens?|api_keys?|auth(_entication|_orization)?_headers?|authorization|ciphertexts?|key_material|vendor_endpoint|endpoint_url|callbacks?|webhooks?|callback_urls?|webhook_urls?|latitude|longitude|coordinates?|physical_device_evidence|raw(_vendor)?_?payload)($|_)' and column_name not in ('documented_payload_size_bytes','server_only_secret_required','secret_storage_requirement','key_id_available')),0,'M25 tables contain no credentials, secrets, raw vendor payloads, coordinates, vendor endpoints, or physical-device evidence');
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
select ok(exists(select 1 from pg_constraint where conrelid='public.m24f_certification_runs'::regclass and conname='m24f_passed_requires_nonvacuous_synthetic_check'),'passed certification requires nonvacuous successful synthetic evidence');
select ok(pg_get_functiondef('public.admin_decide_m24f_candidate_v1(uuid,text,text,text)'::regprocedure) ilike '%approved_by_ap%' and pg_get_functiondef('public.admin_decide_m24f_candidate_v1(uuid,text,text,text)'::regprocedure) ilike '%m24f_assert_persisted_scenario_truth%','AP approval revalidates the latest successful certification evidence');
select ok(pg_get_functiondef('public.admin_promote_m25_signal_to_alert_v1(uuid,text,text)'::regprocedure) ilike '%m25_signal_review_history%' and pg_get_functiondef('public.admin_promote_m25_signal_to_alert_v1(uuid,text,text)'::regprocedure) ilike '%h.new_state=s.state%','signal promotion requires matching immutable review evidence');
select ok(pg_get_functiondef('public.admin_list_m22_alerts_v1(text,text,text,text,uuid,uuid,uuid,boolean,boolean,integer)'::regprocedure) ilike '%statistical_signal%','authoritative alert list includes promoted statistical signals');
select ok(pg_get_functiondef('public.admin_get_m22_alert_detail_v1(uuid)'::regprocedure) ilike '%statistical_signal%','authoritative alert detail includes promoted statistical signals');

select ok(not public.m24f_is_safe_metadata('10.0.0.1:8443/hook'),'bare IP endpoints are rejected');
select ok(not public.m24f_is_safe_metadata('12.34567 77.65432'),'space-delimited coordinates are rejected');
select ok(not public.m24f_is_safe_metadata('<payload device="x">'),'XML payload fragments are rejected');
select ok(not public.m24f_is_safe_metadata('IMEI 490154203237518'),'physical-device identifiers are rejected');
select ok(exists(select 1 from pg_constraint where conname='m25_job_identity_safe_check'),'queue cohort identities enforce safe metadata');
select ok(pg_get_functiondef('public.admin_decide_m24f_candidate_v1(uuid,text,text,text)'::regprocedure) ilike '%m24f_assert_persisted_scenario_truth%','candidate approval trusts persisted scenarios');
select ok(pg_get_functiondef('public.m25_enqueue_feature_scope_v1(text,text,timestamptz,timestamptz,uuid,uuid,text,text,boolean)'::regprocedure) ilike '%input_watermark=excluded.input_watermark%','exact input replay is a no-op');
select ok(pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure) ilike '%generated_at < excluded.generated_at%','older windows cannot replace current signals');
select ok(pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure) ilike '%consecutive_windows%','SQL worker enforces configured consecutive windows');
select ok(pg_get_functiondef('public.admin_promote_m25_signal_to_alert_v1(uuid,text,text)'::regprocedure) ilike '%h.evaluation_id=s.evaluation_id%','promotion review is bound to exact evaluation');
select ok(pg_get_functiondef('public.admin_list_m22_alerts_v1(text,text,text,text,uuid,uuid,uuid,boolean,boolean,integer)'::regprocedure) ilike '%phone_physical_sustained_mismatch%','retained M23 alert identity remains visible and filterable');

select ok(not public.m24f_is_safe_metadata('hooks.vendor.example/v1/ingest'),'scheme-less hostname paths are rejected');
select ok(not public.m24f_is_safe_metadata('api.vendor.example:8443/hook'),'scheme-less hostname ports are rejected');
select ok(not public.m24f_is_safe_metadata('hooks.vendor.example'),'bare scheme-less hostname endpoints are rejected');
select ok(not public.m24f_is_safe_metadata('api.vendor.example:8443'),'bare scheme-less hostname ports are rejected');
select ok(public.m24f_is_safe_metadata('Vendor compatibility is documented.'),'ordinary dotted-free prose remains accepted');
select ok(not public.m24f_is_safe_metadata('audit' || chr(127) || 'suffix'),'DEL is rejected from safe metadata');
select ok(not public.m24f_is_safe_metadata('audit' || chr(128) || 'suffix'),'C1 range start is rejected from safe metadata');
select ok(not public.m24f_is_safe_metadata('audit' || chr(159) || 'suffix'),'C1 range end is rejected from safe metadata');
select ok(public.m24f_is_safe_metadata('Webhook direction is inbound only.'),'bounded declarative webhook metadata remains accepted');
select ok(pg_get_functiondef('public.admin_record_m24f_certification_scenarios_v1(uuid,text[],text[],boolean[],text[])'::regprocedure) ilike '%v_existing>=v_declared%' and exists(select 1 from pg_trigger where tgname='m24f_certification_scenario_immutability' and not tgisinternal),'certification scenario evidence closes at its declared count');
select ok(pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure) ilike '%newer.generation>fs.generation%','baselines and readiness use authoritative snapshot generations');
select ok(pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure) ilike '%source_generation < excluded.source_generation%','same-period corrected evaluations advance current signal state');
select ok(pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure) ilike '%count(distinct (fs.scope_key_hash,fs.period_start,fs.period_end))%','readiness counts stable work-day session identities');

select ok(exists(select 1 from information_schema.columns where table_schema='public' and table_name='m24f_certification_runs' and column_name='manifest_id'),'certification runs persist exact manifest identity');
select ok(pg_get_functiondef('public.admin_record_m24f_certification_v1(uuid,text,text,text,text,integer,integer,text,text)'::regprocedure) ilike '%trim(p_adapter_id)<>v_manifest.adapter_id%' and pg_get_functiondef('public.admin_decide_m24f_candidate_v1(uuid,text,text,text)'::regprocedure) ilike '%v_latest.manifest_id is distinct from v_manifest_id%','certification and decisions require exact current manifest identity');
select ok(pg_get_functiondef('public.admin_update_m24f_candidate_metadata_v1(uuid,uuid,text,text,text,text,text,text,text,text)'::regprocedure) ilike '%authorizing manifest identity is frozen%','authorizing manifest cannot be replaced after certification or decision');
select ok(exists(select 1 from information_schema.columns where table_schema='public' and table_name='m24f_candidate_decision_history' and column_name='certification_run_id') and pg_get_functiondef('public.admin_decide_m24f_candidate_v1(uuid,text,text,text)'::regprocedure) ilike '%manifest_id,certification_run_id%','decision history versions the exact authorizing manifest and certification run');
select is(round(public.m25_robust_score_v1(13,10,2,8,12,'high_bad'),8),round(0.6745::numeric*3/2,8),'SQL MAD scoring uses the canonical robust factor');
select is(round(public.m25_robust_score_v1(13,10,0,8,12,'high_bad'),8),round(0.6745::numeric*3/(4::numeric/1.349),8),'SQL IQR fallback uses IQR divided by 1.349 and the robust factor');
select ok(public.m25_robust_score_v1(13,10,0,8,12,'high_bad')>0.68 and public.m25_robust_score_v1(13,10,0,8,12,'high_bad')<0.69,'IQR fallback preserves deterministic threshold-boundary semantics');
select ok(exists(select 1 from pg_trigger where tgname='m25_mark_authoritative_correction') and pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure) ilike '%dependency_cause_snapshot_id is distinct from s_id%','historical corrections requeue dependent later windows idempotently');
select ok(pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure) ilike '%sig.generated_at>j.period_end%' and pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure) ilike '%state=''insufficient_data''%','stale later signals are invalidated before dependent reevaluation');


select ok(pg_get_functiondef('public.admin_record_m24f_certification_v1(uuid,text,text,text,text,integer,integer,text,text)'::regprocedure) ilike '%m24f_certification_recorded%' and pg_get_functiondef('public.admin_record_m24f_certification_v1(uuid,text,text,text,text,integer,integer,text,text)'::regprocedure) ilike '%certification_run_id%', 'certification recording emits central audit evidence bound to the exact run');
select ok(pg_get_functiondef('public.admin_record_m24f_certification_v1(uuid,text,text,text,text,integer,integer,text,text)'::regprocedure) ilike '%m20a_require_admin%' and not has_function_privilege('anon','public.admin_record_m24f_certification_v1(uuid,text,text,text,text,integer,integer,text,text)','EXECUTE'), 'certification audit emission retains tenant admin authority');
select ok(pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure) ilike '%order by authoritative_correction_pending desc,period_end,period_start,next_attempt_at,created_at,id%', 'historical correction dependencies are claimed in chronological evidence order, independent of enqueue order');
select ok(pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure) ilike '%authoritative_correction_pending=true,dependency_cause_snapshot_id=s_id%' and pg_get_functiondef('public.m25_process_statistical_queue(integer,timestamptz)'::regprocedure) ilike '%later.period_end=(select min(next_period.period_end)%', 'historical corrections propagate idempotently through each next affected period');

select ok(exists(select 1 from pg_trigger where tgname='m24f_invalidate_approval_on_certification' and not tgisinternal),
  'later failed or expired certification invalidates prior AP authority at the write boundary');
select ok(pg_get_functiondef('public.m24f_invalidate_approval_on_certification_v1()'::regprocedure)
  not ilike '%new.certification_state not in (''failed'',''expired'')%'
  and pg_get_functiondef('public.m24f_invalidate_approval_on_certification_v1()'::regprocedure)
  ilike '%v_previous in (''technically_compatible'',''approved_by_ap'')%technically_blocked%',
  'every new certification requires a fresh technical and AP decision, including a run initially declared passed');
select ok(pg_get_functiondef('public.m24f_invalidate_approval_on_certification_v1()'::regprocedure)
  ilike '%m24f_candidate_decision_history%manifest_id,certification_run_id%',
  'certification invalidation appends exact immutable decision evidence');

select ok(pg_get_functiondef('public.m24f_invalidate_approval_on_certification_v1()'::regprocedure)
  not ilike '%certification_state not in%'
  and pg_get_functiondef('public.m24f_invalidate_approval_on_certification_v1()'::regprocedure)
  ilike '%technically_compatible%approved_by_ap%',
  'every newly inserted certification run immediately supersedes prior technical and AP authority');
select ok(pg_get_functiondef('public.admin_record_m24f_certification_v1(uuid,text,text,text,text,integer,integer,text,text)'::regprocedure)
  ilike '%m24f_assert_persisted_scenario_truth(v_latest.id)%'
  and pg_get_functiondef('public.admin_record_m24f_certification_v1(uuid,text,text,text,text,integer,integer,text,text)'::regprocedure)
  ilike '%h.certification_run_id=v_latest.id%return v_latest.id%',
  'only exact replay of fully persisted certification evidence bound to current AP authority is idempotent');
select ok(pg_get_functiondef('public.admin_decide_m24f_candidate_v1(uuid,text,text,text)'::regprocedure)
  ilike '%m24f_assert_persisted_scenario_truth(v_latest.id)%'
  and pg_get_functiondef('public.admin_decide_m24f_candidate_v1(uuid,text,text,text)'::regprocedure)
  ilike '%certification_run_id%',
  'fresh authority still requires complete current scenario truth and binds the exact run');

select is(public.m25_support_level_v1(0,false),'none','zero observations have no support');
select is(public.m25_support_level_v1(1,false),'low','one observation has low support');
select is(public.m25_support_level_v1(2,false),'low','two observations remain low support');
select is(public.m25_support_level_v1(3,false),'moderate','three observations reach moderate support');
select is(public.m25_support_level_v1(7,false),'moderate','seven observations remain moderate support');
select is(public.m25_support_level_v1(8,false),'moderate','eight observations remain moderate support');
select is(public.m25_support_level_v1(19,false),'moderate','nineteen observations remain moderate support');
select is(public.m25_support_level_v1(20,false),'strong','twenty observations reach strong support');
select is(public.m25_support_level_v1(1,true),'synthetic_only','synthetic evidence retains its canonical support label');

select ok(not public.m24f_is_safe_metadata('AbCdEfGhIjKlMnOpQrStUvWxYz123456'),'unlabelled credential-shaped opaque tokens are rejected');
select ok(public.m24f_is_safe_metadata(repeat('a',64)),'plain hexadecimal digests remain safe declarative metadata');
select ok(not public.m24f_is_safe_metadata('00:11:22:33:44:55'),'bare MAC addresses are rejected');
select ok(not public.m24f_is_safe_metadata('490154203237518'),'bare Luhn-valid IMEI-shaped values are rejected');
select ok(public.m24f_is_safe_metadata('synthetic-adapter-v1.2'),'bounded synthetic adapter identifiers remain accepted');
select ok(not exists(select 1 from public.m25_feature_definitions where active and availability_status<>'implemented'),'active features are exactly those with implemented authoritative extraction');
select is((select count(*)::integer from public.m25_feature_definitions where active),6,'only the six authoritative receipt/conflict features remain active');
select ok(not exists(select 1 from public.m25_statistical_signal_definitions s join public.m25_feature_definitions f on f.feature_id=s.metric where s.active and not f.active),'active signals cannot depend on unavailable features');
select ok(pg_get_functiondef('public.admin_get_or_create_m24f_reference_manifest_v1()'::regprocedure) ilike '%pg_advisory_xact_lock%' and pg_get_functiondef('public.admin_get_or_create_m24f_reference_manifest_v1()'::regprocedure) ilike '%select id into v_id%','reference synthetic manifest lookup is serialized and reusable');

select * from finish();
rollback;
