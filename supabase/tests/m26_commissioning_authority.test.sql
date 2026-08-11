-- Executable pgTAP guardrails for the M26 single-writer authority boundary.
\connect postgres supabase_admin
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);
select has_column('public','physical_pilot_commissioning','selected_certification_run_id','commissioning freezes its authoritative certification run');
select has_column('public','physical_pilot_commissioning_receipts','expected_version','immutable transition identity records expected version');
select has_column('public','physical_pilot_evidence_receipts','certification_run_id','physical evidence freezes its certification run');
select has_trigger('public','physical_pilot_evidence_receipts','physical_pilot_evidence_reason_codes_safe','all evidence inserts cross the safe reason-code trigger');
select ok(pg_get_functiondef('public.m26_current_certification_run_v1(uuid,uuid)'::regprocedure) ilike '%order by x.completed_at desc nulls last,x.id desc limit 1%','certification authority selects the current run');
select ok(pg_get_functiondef('public.m26_current_certification_run_v1(uuid,uuid)'::regprocedure) ilike '%r.certification_state=''passed''%' and pg_get_functiondef('public.m26_current_certification_run_v1(uuid,uuid)'::regprocedure) ilike '%h.certification_run_id=r.id%','current run must be successful and exactly AP-approved');
select ok(pg_get_functiondef('public.admin_transition_physical_pilot_commissioning_v1(uuid,uuid,uuid,bigint,uuid,text,text,text,integer)'::regprocedure) ilike '%p_expected_version is null%','transition rejects null optimistic-lock versions');
select ok(pg_get_functiondef('public.admin_transition_physical_pilot_commissioning_v1(uuid,uuid,uuid,bigint,uuid,text,text,text,integer)'::regprocedure) ilike '%v_receipt.expected_version is distinct from p_expected_version%','replay identity includes expected version');
select ok(pg_get_functiondef('public.admin_transition_physical_pilot_commissioning_v1(uuid,uuid,uuid,bigint,uuid,text,text,text,integer)'::regprocedure) ilike '%selected_certification_run_id=v_certification_run_id%','updates rebind the canonical run');
select ok(pg_get_functiondef('public.service_record_physical_pilot_network_validation_v1(uuid,uuid,bigint,uuid,uuid,uuid,uuid,text,text,timestamptz)'::regprocedure) ilike '%c.version is distinct from p_expected_version%','network writer rejects null and stale versions');
select ok(pg_get_functiondef('public.service_record_physical_pilot_evidence_v1(uuid,uuid,bigint,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,boolean,boolean,text,text,boolean,boolean,text,text[],text)'::regprocedure) ilike '%c.selected_certification_run_id is distinct from public.m26_current_certification_run_v1%','evidence rejects stale or wrong certification runs');
select ok(pg_get_functiondef('public.service_record_physical_pilot_evidence_v1(uuid,uuid,bigint,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,boolean,boolean,text,text,boolean,boolean,text,text[],text)'::regprocedure) ilike '%m24f_is_safe_metadata(reason)%','evidence ingest rejects unsafe reason codes');
select ok(pg_get_functiondef('public.m26_validate_reason_codes_v1()'::regprocedure) ilike '%char_length(v_reason) not between 1 and 80%' and pg_get_functiondef('public.m26_validate_reason_codes_v1()'::regprocedure) ilike '%m24f_is_safe_metadata(v_reason)%','DB trigger bounds and privacy-checks every reason code');
select ok(pg_get_functiondef('public.admin_get_physical_pilot_readiness_v1(uuid)'::regprocedure) ilike '%m26_current_certification_run_v1(c.selected_candidate_id,c.selected_manifest_id) is distinct from c.selected_certification_run_id%','readiness revalidates current certification authority');
select ok(pg_get_functiondef('public.admin_get_physical_pilot_readiness_v1(uuid)'::regprocedure) ilike '%e.certification_run_id=c.selected_certification_run_id%','readiness requires evidence from the frozen exact run');
select * from finish();
rollback;
