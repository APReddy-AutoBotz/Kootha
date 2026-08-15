begin;
select plan(15);

select has_function('public','m26_try_repository_authority_lock_v1',array[]::text[],'repository authority lock helper exists');
select has_function('public','m26_serialize_certification_authority_v1',array[]::text[],'certification serialization trigger function exists');
select has_function('public','m26_revalidate_network_receipt_authority_v1',array[]::text[],'network receipt revalidation trigger function exists');

select has_trigger('public','m24f_adapter_capability_manifests','m24f_manifest_m26_repository_serialize','manifest mutations share repository authority');
select has_trigger('public','m24f_adapter_candidates','m24f_candidate_m26_repository_serialize','candidate mutations share repository authority');
select has_trigger('public','m24f_certification_runs','m24f_run_m26_repository_serialize','certification runs share repository authority');
select has_trigger('public','m24f_certification_scenarios','m24f_scenario_m26_repository_serialize','certification scenarios share repository authority');
select has_trigger('public','m24f_candidate_decision_history','m24f_decision_m26_repository_serialize','candidate decisions share repository authority');
select has_trigger('public','physical_pilot_network_validation_receipts','physical_pilot_network_receipts_m26_authority_revalidate','network receipts revalidate current authority');

select ok(position('pg_try_advisory_xact_lock(hashtext(''m26_repository_authority''))' in pg_get_functiondef('public.m26_try_repository_authority_lock_v1()'::regprocedure)) > 0,'certification writers use the readiness repository lock key');
select ok(position('m26_lock_device_authority_v1(new.gps_device_id)' in pg_get_functiondef('public.m26_revalidate_network_receipt_authority_v1()'::regprocedure)) > 0,'network validation locks device first');
select ok(position('pg_advisory_xact_lock(hashtext(''m26_repository_authority''))' in pg_get_functiondef('public.m26_revalidate_network_receipt_authority_v1()'::regprocedure)) > 0,'network validation locks repository second');
select ok(position('m26_current_certification_run_v1(' in pg_get_functiondef('public.m26_revalidate_network_receipt_authority_v1()'::regprocedure)) > 0,'network validation rechecks certification under locks');

select ok(not has_function_privilege('authenticated','public.m26_try_repository_authority_lock_v1()','EXECUTE'),'authenticated cannot invoke repository lock helper directly');
select ok(not has_function_privilege('service_role','public.m26_revalidate_network_receipt_authority_v1()','EXECUTE'),'service role cannot invoke network trigger function directly');

select * from finish();
rollback;
