-- Executable pgTAP guardrails for the M26 single-writer authority boundary.
\connect postgres supabase_admin
begin;
create extension if not exists pgtap with schema extensions;
select plan(76);
select has_table('public','physical_pilot_evidence_telemetry_receipts','physical passes freeze authoritative M21 receipt bindings');
select has_trigger('public','physical_pilot_evidence_telemetry_receipts','physical_pilot_evidence_telemetry_immutable','physical telemetry bindings are immutable');
select ok(pg_get_functiondef('public.service_record_physical_pilot_evidence_v1(uuid,uuid,bigint,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,boolean,boolean,text,text,boolean,boolean,text,text[],text)'::regprocedure) ilike '%Physical pass requires authoritative non-synthetic telemetry%','physical pass requires database-proven M21 telemetry');
select ok(not exists(select 1 from (values
 ('ordinary_reason',true),(repeat('a',23),true),(repeat('a',24),true),(repeat('f',32),true),(repeat('F',32),true),
 ('prefix-'||repeat('a',24),true),(repeat('a',12)||' '||repeat('b',12),true),('credential=fixture-secret',false),
 ('https://evidence.example/path',false),('evidence.example/path',false),('12.34567, 77.45678',false),
 ('12.34567 77.45678',false),('raw_payload fragment',false),('{"payload":true}',false),
 ('Abcdefghijklmnopqrstuvwx12345678',false),('0123456789abcdef0123456789abcdef',true),
 ('aa:bb:cc:dd:ee:ff',false),('490154203237518',false),('adapter_generation_7',true)
) as cases(value,expected) where public.m24f_is_safe_metadata(value) is distinct from expected),'database safe-metadata boundary table matches shared parity cases');
select has_table('public','physical_pilot_repository_authority','repository authority is database owned');
select has_column('public','physical_pilot_repository_authority','generation','repository authority has immutable generations');
select has_column('public','physical_pilot_evidence_receipts','repository_authority_generation','evidence freezes the authority generation');
select has_trigger('public','physical_pilot_repository_authority','physical_pilot_repository_authority_immutable','repository authority is append only');
select has_column('public','physical_pilot_commissioning','selected_certification_run_id','commissioning freezes its authoritative certification run');
select has_column('public','physical_pilot_commissioning_receipts','expected_version','immutable transition identity records expected version');
select has_column('public','physical_pilot_evidence_receipts','certification_run_id','physical evidence freezes its certification run');
select has_trigger('public','physical_pilot_evidence_receipts','physical_pilot_evidence_reason_codes_safe','all evidence inserts cross the safe reason-code trigger');
select ok(pg_get_functiondef('public.m26_current_certification_run_v1(uuid,uuid)'::regprocedure) ilike '%order by x.completed_at desc nulls last,x.id desc limit 1%','certification authority selects the current run');
select ok(pg_get_functiondef('public.m26_current_certification_run_v1(uuid,uuid)'::regprocedure) ilike '%r.certification_state=''passed''%' and pg_get_functiondef('public.m26_current_certification_run_v1(uuid,uuid)'::regprocedure) ilike '%h.certification_run_id=r.id%','current run must be successful and exactly AP-approved');
select ok(pg_get_functiondef('public.admin_transition_physical_pilot_commissioning_v1(uuid,uuid,uuid,bigint,uuid,text,text,text,integer)'::regprocedure) ilike '%p_expected_version is null%','transition rejects null optimistic-lock versions');
select ok(pg_get_functiondef('public.admin_transition_physical_pilot_commissioning_v1(uuid,uuid,uuid,bigint,uuid,text,text,text,integer)'::regprocedure) ilike '%v_receipt.expected_version is distinct from p_expected_version%','replay identity includes expected version');
select ok(pg_get_functiondef('public.admin_transition_physical_pilot_commissioning_v1(uuid,uuid,uuid,bigint,uuid,text,text,text,integer)'::regprocedure) ilike '%selected_certification_run_id=v_certification_run_id%','updates rebind the canonical run');
select ok(pg_get_functiondef('public.service_record_physical_pilot_network_validation_v1(uuid,uuid,bigint,uuid,uuid,uuid,uuid,text,text,timestamptz,text,text)'::regprocedure) ilike '%c.version is distinct from p_expected_version%','network writer rejects null and stale versions');
select ok(pg_get_functiondef('public.service_record_physical_pilot_evidence_v1(uuid,uuid,bigint,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,boolean,boolean,text,text,boolean,boolean,text,text[],text)'::regprocedure) ilike '%c.selected_certification_run_id is distinct from public.m26_current_certification_run_v1%','evidence rejects stale or wrong certification runs');
select ok(pg_get_functiondef('public.service_record_physical_pilot_evidence_v1(uuid,uuid,bigint,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,boolean,boolean,text,text,boolean,boolean,text,text[],text)'::regprocedure) ilike '%m24f_is_safe_metadata(reason)%','evidence ingest rejects unsafe reason codes');
select ok(pg_get_functiondef('public.m26_validate_reason_codes_v1()'::regprocedure) ilike '%char_length(v_reason) not between 1 and 80%' and pg_get_functiondef('public.m26_validate_reason_codes_v1()'::regprocedure) ilike '%m24f_is_safe_metadata(v_reason)%','DB trigger bounds and privacy-checks every reason code');
select ok(pg_get_functiondef('public.admin_get_physical_pilot_readiness_v1(uuid)'::regprocedure) ilike '%m26_current_certification_run_v1(c.selected_candidate_id,c.selected_manifest_id) is distinct from c.selected_certification_run_id%','readiness revalidates current certification authority');
select ok(pg_get_functiondef('public.admin_get_physical_pilot_readiness_v1(uuid)'::regprocedure) ilike '%e.certification_run_id=c.selected_certification_run_id%','readiness requires evidence from the frozen exact run');
select ok(pg_get_functiondef('public.service_rotate_physical_pilot_repository_authority_v1(text,text)'::regprocedure) ilike '%service_role%' and pg_get_functiondef('public.service_rotate_physical_pilot_repository_authority_v1(text,text)'::regprocedure) ilike '%pg_advisory_xact_lock%','only serialized service authority rotates the repository pin');
select ok(pg_get_functiondef('public.service_record_physical_pilot_evidence_v1(uuid,uuid,bigint,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,boolean,boolean,text,text,boolean,boolean,text,text[],text)'::regprocedure) not ilike '%current_setting(%' and pg_get_functiondef('public.service_record_physical_pilot_evidence_v1(uuid,uuid,bigint,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,boolean,boolean,text,text,boolean,boolean,text,text[],text)'::regprocedure) ilike '%repository_authority_generation%','evidence uses the database pin rather than session settings');
select ok(pg_get_functiondef('public.service_record_physical_pilot_evidence_v1(uuid,uuid,bigint,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,boolean,boolean,text,text,boolean,boolean,text,text[],text)'::regprocedure) ilike '%physical evidence receipt replay conflict%' and pg_get_functiondef('public.service_record_physical_pilot_evidence_v1(uuid,uuid,bigint,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,boolean,boolean,text,text,boolean,boolean,text,text[],text)'::regprocedure) ilike '%e.reason_codes is distinct from p_reason_codes%','evidence replay is exact and conflicting reuse fails');
select ok(pg_get_functiondef('public.admin_get_physical_pilot_readiness_v1(uuid)'::regprocedure) ilike '%e.credential_verified_at<=k.last_verified_at%','later verification of the same credential preserves evidence');
select ok(pg_get_functiondef('public.admin_transition_physical_pilot_commissioning_v1(uuid,uuid,uuid,bigint,uuid,text,text,text,integer)'::regprocedure) ilike '%m24f_is_safe_metadata(p_network_configuration_class)%','commissioning rejects unsafe network metadata');
select ok(pg_get_functiondef('public.service_record_physical_pilot_network_validation_v1(uuid,uuid,bigint,uuid,uuid,uuid,uuid,text,text,timestamptz,text,text)'::regprocedure) ilike '%setup_reopened%' and pg_get_functiondef('public.service_record_physical_pilot_network_validation_v1(uuid,uuid,bigint,uuid,uuid,uuid,uuid,text,text,timestamptz,text,text)'::regprocedure) not ilike '%event_type in (''reactivated''%','routine reactivation does not invalidate installation authority');
select ok(pg_get_functiondef('public.admin_get_physical_pilot_readiness_v1(uuid)'::regprocedure) ilike '%repository_authority_generation=r.generation%','readiness rejects replaced repository authority');
select ok(has_function_privilege('service_role','public.service_rotate_physical_pilot_repository_authority_v1(text,text)','EXECUTE') and not has_function_privilege('authenticated','public.service_rotate_physical_pilot_repository_authority_v1(text,text)','EXECUTE'),'clients cannot rotate repository authority');
select ok(not exists(
 select 1 from unnest(array['anon','authenticated','service_role']) role_name,
  unnest(array['physical_pilot_commissioning','physical_pilot_commissioning_receipts','physical_pilot_network_validation_receipts','physical_pilot_evidence_receipts','physical_pilot_evidence_telemetry_receipts','physical_pilot_repository_authority']) table_name,
  unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) privilege_name
 where has_table_privilege(role_name,format('public.%I',table_name),privilege_name)
),'browser and service roles have no direct DML or truncate path across the M26 authority surface');
select ok(not exists(select 1 from unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) privilege_name where has_table_privilege('service_role','public.telemetry_receipts',privilege_name)),'service role cannot forge authoritative M21 telemetry rows');
select ok(has_function_privilege('service_role','public.service_record_physical_pilot_network_validation_v1(uuid,uuid,bigint,uuid,uuid,uuid,uuid,text,text,timestamptz,text,text)','EXECUTE'),'service role retains the sanctioned network-validation RPC');
select ok(has_function_privilege('service_role','public.service_record_physical_pilot_evidence_v1(uuid,uuid,bigint,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,boolean,boolean,text,text,boolean,boolean,text,text[],text)','EXECUTE'),'service role retains the sanctioned evidence RPC');
select ok(pg_get_functiondef('public.service_record_physical_pilot_evidence_v1(uuid,uuid,bigint,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,boolean,boolean,text,text,boolean,boolean,text,text[],text)'::regprocedure) ilike '%m26_is_authoritative_observation_v1(t.received_at,t.captured_at,n.validated_at,p_observation_started_at,p_observation_ended_at)%','physical ingest uses the canonical authoritative receipt boundary');
select ok(pg_get_functiondef('public.admin_get_physical_pilot_readiness_v1(uuid)'::regprocedure) ilike '%m26_is_authoritative_observation_v1(t.received_at,t.captured_at,n.validated_at,e.observation_started_at,e.observation_ended_at)%','readiness revalidates the canonical authoritative receipt boundary');
select ok(pg_get_functiondef('public.m26_is_authoritative_observation_v1(timestamptz,timestamptz,timestamptz,timestamptz,timestamptz)'::regprocedure) ilike '%p_captured_at>=%' and pg_get_functiondef('public.m26_is_authoritative_observation_v1(timestamptz,timestamptz,timestamptz,timestamptz,timestamptz)'::regprocedure) ilike '%p_received_at>=%','captured-time validity remains separate from server receipt chronology');
select is(public.m26_is_authoritative_observation_v1('2026-08-12 10:00:00+00','2026-08-12 10:00:06+00','2026-08-12 10:00:05+00','2026-08-12 10:00:05+00','2026-08-12 10:01:00+00'),false,'receipt arriving before validation is rejected despite post-validation captured time');
select is(public.m26_is_authoritative_observation_v1('2026-08-12 10:00:05+00','2026-08-12 10:00:05+00','2026-08-12 10:00:05+00','2026-08-12 10:00:05+00','2026-08-12 10:01:00+00'),true,'exact server validation and observation boundary is inclusive');
select is(public.m26_is_authoritative_observation_v1('2026-08-12 10:00:06+00','2026-08-12 10:00:05+00','2026-08-12 10:00:05+00','2026-08-12 10:00:05+00','2026-08-12 10:01:00+00'),true,'receipt after validation counts while captured-time validity is evaluated separately');

-- Fixture-backed acceptance: these assertions invoke the real writers and read
-- their persisted effects. All observations are explicit synthetic test data;
-- none represents field or hardware evidence.
reset role;
insert into public.user_profiles(auth_user_id,display_name,role) values('26000000-0000-0000-0000-000000000001','M26 fixture admin','admin');
insert into public.vehicles(id,vehicle_number,vehicle_type,city) values('26000000-0000-0000-0000-000000000002','M26-FIXTURE-VEHICLE','auto','Test');
set local role authenticated;
select set_config('request.jwt.claim.sub','26000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.admin_create_m24f_capability_manifest_v1('m26-fixture','1','synthetic fixture','direct_http','hmac_signature',true,true,true,true,true,false,true,false,array[]::text[],'synthetic test only','synthetic test only');
select ok((select battery_supported and external_power_supported and gps_fix_supported and gsm_signal_supported and not location_supported from public.m24f_adapter_capability_manifests where adapter_id='m26-fixture' and adapter_version='1'),'manifest RPC maps battery, external power, GPS, GSM, and requested location=false exactly');
select set_config('request.jwt.claim.sub','26000000-0000-0000-0000-000000000099',true);
select throws_ok($$select public.admin_create_m24f_capability_manifest_v1('m26-non-admin','1','synthetic fixture','direct_http','hmac_signature',true,true,true,true,true,false,true,false,'{}','synthetic test only','synthetic test only')$$,'42501',null,'non-admin manifest creation remains denied');
select set_config('request.jwt.claim.sub','26000000-0000-0000-0000-000000000001',true);
select public.admin_create_m24f_candidate_v1('M26 fixture','synthetic fixture','direct_http','hmac_signature','unknown','not_required','unknown','supported','stable_event_id','synthetic test only');
select public.admin_update_m24f_candidate_metadata_v1(
 (select id from public.m24f_adapter_candidates where safe_display_name='M26 fixture'),
 (select id from public.m24f_adapter_capability_manifests where adapter_id='m26-fixture' and adapter_version='1'),
 'verified_sandbox','documented','documented','not_assessed','unverified_assumption','not_assessed',null,'synthetic test only');
select public.admin_record_m24f_certification_v1((select id from public.m24f_adapter_candidates where safe_display_name='M26 fixture'),'m26-fixture','1','synthetic_conformance','passed',1,1,repeat('a',64),'synthetic acceptance');
select public.admin_record_m24f_certification_scenarios_v1(
 (select id from public.m24f_certification_runs where candidate_id=(select id from public.m24f_adapter_candidates where safe_display_name='M26 fixture') order by completed_at desc,id desc limit 1),
 array['fixture_authentication'],array['authentication'],array[true],array['passed']);
select public.admin_decide_m24f_candidate_v1((select id from public.m24f_adapter_candidates where safe_display_name='M26 fixture'),'technically_compatible','fixture_certified','synthetic acceptance');
select public.admin_decide_m24f_candidate_v1((select id from public.m24f_adapter_candidates where safe_display_name='M26 fixture'),'approved_by_ap','fixture_approved','synthetic acceptance');
select lives_ok($$select public.admin_register_gps_device('M26-FIXTURE','Fixture','Model','generic_http','https','M26-FIXTURE-SERIAL',null,null,null,null,'1','synthetic test')$$,'fixture device registration executes');
select lives_ok($$select public.admin_link_gps_device_vehicle((select id from public.gps_devices where device_code='M26-FIXTURE'),'26000000-0000-0000-0000-000000000002',clock_timestamp(),'fixture','fixture')$$,'fixture link executes');
select lives_ok($$select public.admin_record_gps_device_event((select id from public.gps_devices where device_code='M26-FIXTURE'),'installed',clock_timestamp(),'26000000-0000-0000-0000-000000000002',null,'fixture','fixture')$$,'fixture installation executes');
select lives_ok($$select public.admin_change_gps_device_status((select id from public.gps_devices where device_code='M26-FIXTURE'),'active',null)$$,'fixture activation executes');
reset role;
update public.gps_devices set gps_readiness='ready',gsm_readiness='degraded' where device_code='M26-FIXTURE';
insert into public.gps_device_credential_metadata(id,gps_device_id,credential_key_id,status,issued_at,expires_at,last_verified_at,created_by_admin)
select '26000000-0000-0000-0000-000000000006',id,'fixture-key','active',clock_timestamp(),clock_timestamp()+interval '1 day',clock_timestamp(),'26000000-0000-0000-0000-000000000001' from public.gps_devices where device_code='M26-FIXTURE';

set local role authenticated;
select set_config('request.jwt.claim.sub','26000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select lives_ok($$select public.admin_transition_physical_pilot_commissioning_v1((select id from public.gps_devices where device_code='M26-FIXTURE'),(select id from public.m24f_adapter_candidates where safe_display_name='M26 fixture'),(select id from public.m24f_adapter_capability_manifests where adapter_id='m26-fixture' and adapter_version='1'),0,'26000000-0000-0000-0000-000000000007','draft','fixture_create','fixture_network',60)$$,'draft transition executes');
select lives_ok($$select public.admin_transition_physical_pilot_commissioning_v1((select id from public.gps_devices where device_code='M26-FIXTURE'),(select id from public.m24f_adapter_candidates where safe_display_name='M26 fixture'),(select id from public.m24f_adapter_capability_manifests where adapter_id='m26-fixture' and adapter_version='1'),1,'26000000-0000-0000-0000-000000000008','commissioning','fixture_start','fixture_network',60)$$,'commissioning transition executes');
select is((select count(*)::integer from public.physical_pilot_commissioning_receipts where commissioning_id=(select id from public.physical_pilot_commissioning where gps_device_id=(select id from public.gps_devices where device_code='M26-FIXTURE'))),2,'transitions persist two immutable receipts');
select is((select from_state||'->'||to_state from public.physical_pilot_commissioning_receipts where transition_key='26000000-0000-0000-0000-000000000008'),'draft->commissioning','transition receipt preserves lineage');
select ok((public.admin_transition_physical_pilot_commissioning_v1((select id from public.gps_devices where device_code='M26-FIXTURE'),(select id from public.m24f_adapter_candidates where safe_display_name='M26 fixture'),(select id from public.m24f_adapter_capability_manifests where adapter_id='m26-fixture' and adapter_version='1'),1,'26000000-0000-0000-0000-000000000008','commissioning','fixture_start','fixture_network',60)->>'replayed')::boolean,'exact transition replay returns frozen receipt');
select throws_ok($$select public.admin_transition_physical_pilot_commissioning_v1((select id from public.gps_devices where device_code='M26-FIXTURE'),(select id from public.m24f_adapter_candidates where safe_display_name='M26 fixture'),(select id from public.m24f_adapter_capability_manifests where adapter_id='m26-fixture' and adapter_version='1'),2,'26000000-0000-0000-0000-000000000008','commissioning','fixture_start','fixture_network',60)$$,'22023','Transition key request mismatch','changed transition replay conflicts');

reset role;
-- Resolve internal fixture selectors as the disposable database owner.  The
-- service role intentionally has no direct registry/lifecycle table access;
-- its only application authority is through the sanctioned definer RPCs.
select d.id as fixture_device_id,c.id as fixture_commissioning_id,
 a.id as fixture_candidate_id,m.id as fixture_manifest_id,
 l.id as fixture_link_id,i.id as fixture_installation_id,
 public.m22_safe_digest(d.id::text) as fixture_device_digest
from public.gps_devices d
join public.physical_pilot_commissioning c on c.gps_device_id=d.id
join public.m24f_adapter_candidates a on a.safe_display_name='M26 fixture'
join public.m24f_adapter_capability_manifests m on m.adapter_id='m26-fixture' and m.adapter_version='1'
join public.gps_device_vehicle_links l on l.gps_device_id=d.id and l.effective_until is null
join public.gps_device_lifecycle_events i on i.gps_device_id=d.id and i.event_type='installed'
where d.device_code='M26-FIXTURE'
order by i.effective_at desc,i.created_at desc limit 1 \gset
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select lives_ok($$select public.service_rotate_physical_pilot_repository_authority_v1(repeat('b',40),'fixture_workflow')$$,'repository authority rotation executes');
select lives_ok(format('select public.service_record_physical_pilot_network_validation_v1(%L,%L,2,%L,%L,%L,%L,%L,%L,clock_timestamp(),%L,%L)','26000000-0000-0000-0000-000000000009',:'fixture_commissioning_id',:'fixture_device_id',:'fixture_link_id',:'fixture_installation_id','26000000-0000-0000-0000-000000000006','fixture_network',repeat('c',64),repeat('b',40),'fixture_workflow'),'network validation executes');
reset role;
select validated_at as fixture_network_validated_at from public.physical_pilot_network_validation_receipts where id='26000000-0000-0000-0000-000000000009' \gset
set local role service_role; select set_config('request.jwt.claim.role','service_role',true);
select lives_ok(format('select public.service_record_physical_pilot_network_validation_v1(%L,%L,2,%L,%L,%L,%L,%L,%L,%L,%L,%L)','26000000-0000-0000-0000-000000000009',:'fixture_commissioning_id',:'fixture_device_id',:'fixture_link_id',:'fixture_installation_id','26000000-0000-0000-0000-000000000006','fixture_network',repeat('c',64),:'fixture_network_validated_at',repeat('b',40),'fixture_workflow'),'exact network replay returns receipt');
select lives_ok(format('select public.service_record_physical_pilot_evidence_v1(%L,%L,2,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,clock_timestamp(),10,true,true,%L,%L,true,true,%L,%L,%L)','26000000-0000-0000-0000-000000000010',:'fixture_commissioning_id',:'fixture_candidate_id',:'fixture_manifest_id',repeat('b',40),'fixture_workflow',:'fixture_device_id',:'fixture_device_digest',:'fixture_installation_id',:'fixture_link_id','26000000-0000-0000-0000-000000000006','26000000-0000-0000-0000-000000000009','synthetic',:'fixture_network_validated_at','passed','passed','pass','{}',repeat('d',64)),'synthetic pass receipt is persisted as non-ready truth');
reset role; set local role authenticated; select set_config('request.jwt.claim.sub','26000000-0000-0000-0000-000000000001',true); select set_config('request.jwt.claim.role','authenticated',true);
select is(public.admin_get_physical_pilot_readiness_v1((select id from public.gps_devices where device_code='M26-FIXTURE'))->>'stage','physical_evidence_required','synthetic software journey terminates at physical evidence required');
reset role; set local role service_role; select set_config('request.jwt.claim.role','service_role',true);
select lives_ok(format('select public.service_record_physical_pilot_evidence_v1(%L,%L,2,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,clock_timestamp(),10,true,true,%L,%L,true,true,%L,%L,%L)','26000000-0000-0000-0000-000000000011',:'fixture_commissioning_id',:'fixture_candidate_id',:'fixture_manifest_id',repeat('b',40),'fixture_workflow',:'fixture_device_id',:'fixture_device_digest',:'fixture_installation_id',:'fixture_link_id','26000000-0000-0000-0000-000000000006','26000000-0000-0000-0000-000000000009','physical',:'fixture_network_validated_at','failed','passed','partial','{sequence_failed}',repeat('d',64)),'partial failed physical evidence is persisted');
reset role; set local role authenticated; select set_config('request.jwt.claim.sub','26000000-0000-0000-0000-000000000001',true); select set_config('request.jwt.claim.role','authenticated',true);
select is(public.admin_get_physical_pilot_readiness_v1((select id from public.gps_devices where device_code='M26-FIXTURE'))->>'stage','physical_evidence_required','partial evidence remains non-ready');
reset role; set local role service_role; select set_config('request.jwt.claim.role','service_role',true);
select throws_ok(format('select public.service_record_physical_pilot_evidence_v1(%L,%L,2,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,clock_timestamp(),10,true,true,%L,%L,true,true,%L,%L,%L)','26000000-0000-0000-0000-000000000012',:'fixture_commissioning_id',:'fixture_candidate_id',:'fixture_manifest_id',repeat('b',40),'fixture_workflow',:'fixture_device_id',:'fixture_device_digest',:'fixture_installation_id',:'fixture_link_id','26000000-0000-0000-0000-000000000006','26000000-0000-0000-0000-000000000009','physical',:'fixture_network_validated_at','passed','passed','pass','{}',repeat('d',64)),'42501','Physical pass requires authoritative non-synthetic telemetry','caller-supplied physical pass without M21 telemetry is rejected');
reset role;
select is((select count(*)::integer from public.physical_pilot_evidence_receipts where id='26000000-0000-0000-0000-000000000012'),0,'rejected no-telemetry pass creates no evidence receipt');
select observation_started_at as fixture_observation_started_at,observation_ended_at as fixture_observation_ended_at from public.physical_pilot_evidence_receipts where id='26000000-0000-0000-0000-000000000010' \gset
set local role authenticated; select set_config('request.jwt.claim.sub','26000000-0000-0000-0000-000000000001',true); select set_config('request.jwt.claim.role','authenticated',true);
select is(public.admin_get_physical_pilot_readiness_v1((select id from public.gps_devices where device_code='M26-FIXTURE'))->>'stage','physical_evidence_required','no-telemetry physical claim cannot mint readiness');
reset role; update public.gps_devices set gps_readiness='unavailable' where device_code='M26-FIXTURE'; set local role authenticated; select set_config('request.jwt.claim.sub','26000000-0000-0000-0000-000000000001',true); select set_config('request.jwt.claim.role','authenticated',true);
select is(public.admin_get_physical_pilot_readiness_v1((select id from public.gps_devices where device_code='M26-FIXTURE'))->>'stage','blocked','GPS unavailability immediately invalidates readiness');
reset role; update public.gps_devices set gps_readiness='ready',gsm_readiness='unavailable' where device_code='M26-FIXTURE'; set local role authenticated; select set_config('request.jwt.claim.sub','26000000-0000-0000-0000-000000000001',true); select set_config('request.jwt.claim.role','authenticated',true);
select is(public.admin_get_physical_pilot_readiness_v1((select id from public.gps_devices where device_code='M26-FIXTURE'))->>'stage','blocked','GSM unavailability immediately invalidates readiness');
reset role; update public.gps_devices set gsm_readiness='degraded' where device_code='M26-FIXTURE'; set local role authenticated; select set_config('request.jwt.claim.sub','26000000-0000-0000-0000-000000000001',true); select set_config('request.jwt.claim.role','authenticated',true);
select is(public.admin_get_physical_pilot_readiness_v1((select id from public.gps_devices where device_code='M26-FIXTURE'))->>'stage','physical_evidence_required','operational device remains gated without authoritative physical telemetry');

reset role; set local role service_role; select set_config('request.jwt.claim.role','service_role',true);
select lives_ok($$select public.service_rotate_physical_pilot_repository_authority_v1(repeat('e',40),'fixture_workflow_2')$$,'repository rotation executes');
select lives_ok(format('select public.service_record_physical_pilot_evidence_v1(%L,%L,2,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,10,true,true,%L,%L,true,true,%L,%L,%L)','26000000-0000-0000-0000-000000000010',:'fixture_commissioning_id',:'fixture_candidate_id',:'fixture_manifest_id',repeat('b',40),'fixture_workflow',:'fixture_device_id',:'fixture_device_digest',:'fixture_installation_id',:'fixture_link_id','26000000-0000-0000-0000-000000000006','26000000-0000-0000-0000-000000000009','synthetic',:'fixture_observation_started_at',:'fixture_observation_ended_at','passed','passed','pass','{}',repeat('d',64)),'evidence replay survives later repository rotation');
reset role; set local role authenticated; select set_config('request.jwt.claim.sub','26000000-0000-0000-0000-000000000001',true); select set_config('request.jwt.claim.role','authenticated',true);
select is(public.admin_get_physical_pilot_readiness_v1((select id from public.gps_devices where device_code='M26-FIXTURE'))->>'stage','awaiting_network_validation','repository rotation stales network and evidence without deleting receipts');

reset role;
update public.gps_device_credential_metadata set status='revoked',revoked_at=clock_timestamp() where id='26000000-0000-0000-0000-000000000006';
insert into public.gps_device_credential_metadata(id,gps_device_id,credential_key_id,status,issued_at,created_by_admin)
select '26000000-0000-0000-0000-000000000013',id,'fixture-key-rotated','pending',clock_timestamp(),'26000000-0000-0000-0000-000000000001' from public.gps_devices where device_code='M26-FIXTURE';
select ok((select status='revoked' from public.gps_device_credential_metadata where id='26000000-0000-0000-0000-000000000006') and (select status='pending' from public.gps_device_credential_metadata where id='26000000-0000-0000-0000-000000000013'),'credential rotation persists a new non-inheriting generation');
set local role authenticated; select set_config('request.jwt.claim.sub','26000000-0000-0000-0000-000000000001',true); select set_config('request.jwt.claim.role','authenticated',true);
select is(public.admin_get_physical_pilot_readiness_v1((select id from public.gps_devices where device_code='M26-FIXTURE'))->>'stage','awaiting_credentials','credential rotation invalidates readiness');

reset role; insert into public.vehicles(id,vehicle_number,vehicle_type,city) values('26000000-0000-0000-0000-000000000014','M26-FIXTURE-VEHICLE-2','auto','Test');
set local role authenticated; select set_config('request.jwt.claim.sub','26000000-0000-0000-0000-000000000001',true); select set_config('request.jwt.claim.role','authenticated',true);
select lives_ok($$select public.admin_link_gps_device_vehicle((select id from public.gps_devices where device_code='M26-FIXTURE'),'26000000-0000-0000-0000-000000000014',clock_timestamp(),null,'fixture reassignment')$$,'vehicle reassignment executes');
select is((select vehicle_id::text from public.gps_device_vehicle_links where gps_device_id=(select id from public.gps_devices where device_code='M26-FIXTURE') and effective_until is null),'26000000-0000-0000-0000-000000000014','reassignment rotates the current link authority');
select ok(exists(
 select 1
 from public.gps_devices d
 join public.gps_device_vehicle_links l on l.gps_device_id=d.id and l.is_primary and l.effective_until is null
 join lateral (
  select e.* from public.gps_device_lifecycle_events e
  where e.gps_device_id=d.id
  order by e.effective_at desc,e.created_at desc limit 1
 ) e on true
 where d.device_code='M26-FIXTURE'
  and d.status='pending_setup' and d.installation_state='planned'
  and l.vehicle_id='26000000-0000-0000-0000-000000000014'
  and e.event_type='installation_planned' and e.vehicle_id=l.vehicle_id
  and e.effective_at=l.effective_from
),'reassignment produces canonical planned pending-setup state and lifecycle binding');
select is(public.admin_get_physical_pilot_readiness_v1((select id from public.gps_devices where device_code='M26-FIXTURE'))->>'stage','blocked','reassignment remains non-ready until current physical setup evidence is completed');

reset role;
insert into public.m24f_certification_runs(id,candidate_id,manifest_id,adapter_id,adapter_version,certification_level,certification_state,synthetic,scenario_count,passed_count,failed_count,result_digest,safe_summary,completed_at)
values('26000000-0000-0000-0000-000000000015',(select id from public.m24f_adapter_candidates where safe_display_name='M26 fixture'),(select id from public.m24f_adapter_capability_manifests where adapter_id='m26-fixture' and adapter_version='1'),'m26-fixture','1','synthetic_conformance','failed',true,1,0,1,repeat('f',64),'synthetic failed rotation',clock_timestamp());
insert into public.m24f_certification_scenarios(certification_run_id,scenario_id,category,passed,reason_code,synthetic) values('26000000-0000-0000-0000-000000000015','rotated','authentication',false,'failed',true);
select ok(public.m26_current_certification_run_v1((select id from public.m24f_adapter_candidates where safe_display_name='M26 fixture'),(select id from public.m24f_adapter_capability_manifests where adapter_id='m26-fixture' and adapter_version='1')) is null,'failed certification rotation invalidates canonical certification authority');
select * from finish();
rollback;
