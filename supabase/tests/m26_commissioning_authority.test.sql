-- Executable pgTAP acceptance for the M26 single-writer authority boundary.
-- All fixtures are synthetic/disposable. Nothing in this test represents
-- hardware selection or real field evidence.
\connect postgres supabase_admin
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Structural authority and privilege gates.
select has_table('public','physical_pilot_repository_authority','repository authority is database owned');
select has_table('public','physical_pilot_evidence_telemetry_receipts','physical passes freeze authoritative M21 receipt bindings');
select has_trigger('public','physical_pilot_evidence_receipts','physical_pilot_evidence_reason_codes_safe','evidence reasons cross the DB privacy boundary');
select has_trigger('public','physical_pilot_evidence_telemetry_receipts','physical_pilot_evidence_telemetry_immutable','physical telemetry bindings are immutable');
select has_trigger('public','telemetry_receipts','telemetry_receipts_m26_serialize','all M21 telemetry receipts serialize with M26 evidence authority');
select has_trigger('public','telemetry_identity_conflicts','telemetry_identity_conflicts_m26_serialize','identity conflicts serialize with M26 evidence authority');
select ok(
  pg_get_constraintdef((
    select oid from pg_constraint
    where conrelid='public.physical_pilot_evidence_receipts'::regclass
      and conname='m26_evidence_telemetry_count_check'
  )) ilike '%telemetry_count >= 0%'
  and pg_get_constraintdef((
    select oid from pg_constraint
    where conrelid='public.physical_pilot_evidence_receipts'::regclass
      and conname='m26_evidence_telemetry_count_check'
  )) ilike '%disposition%pass%telemetry_count > 0%',
  'zero telemetry is allowed only for truthful non-pass evidence'
);
select ok(
  pg_get_functiondef('public.service_record_physical_pilot_evidence_v1(uuid,uuid,bigint,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,boolean,boolean,text,text,boolean,boolean,text,text[],text)'::regprocedure)
    ilike '%v_failure_free:=not public.m26_has_authoritative_failure_v1%'
  and pg_get_functiondef('public.service_record_physical_pilot_evidence_v1(uuid,uuid,bigint,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,boolean,boolean,text,text,boolean,boolean,text,text[],text)'::regprocedure)
    ilike '%v_authoritative_telemetry_count=0%',
  'physical pass is fail-closed on rejected/conflicting truth and empty M21 evidence'
);
select ok(
  pg_get_functiondef('public.admin_get_physical_pilot_readiness_v1(uuid)'::regprocedure)
    ilike '%and e.classification=''physical''%'
  and pg_get_functiondef('public.admin_get_physical_pilot_readiness_v1(uuid)'::regprocedure)
    ilike '%order by e.observation_ended_at desc,%'
  and pg_get_functiondef('public.admin_get_physical_pilot_readiness_v1(uuid)'::regprocedure)
    ilike '%e.observation_started_at desc,%'
  and pg_get_functiondef('public.admin_get_physical_pilot_readiness_v1(uuid)'::regprocedure)
    ilike '%e.recorded_at desc,%'
  and pg_get_functiondef('public.admin_get_physical_pilot_readiness_v1(uuid)'::regprocedure)
    ilike '%e_latest.disposition=''pass''%',
  'readiness uses physical observation chronology rather than receipt arrival order'
);
select ok(
  pg_get_functiondef('public.admin_transition_physical_pilot_commissioning_v1(uuid,uuid,uuid,bigint,uuid,text,text,text,integer)'::regprocedure)
    ilike '%v_row.state=''draft'' and p_new_state=''draft''%'
  and pg_get_functiondef('public.admin_transition_physical_pilot_commissioning_v1(uuid,uuid,uuid,bigint,uuid,text,text,text,integer)'::regprocedure)
    ilike '%v_effective_heartbeat:=v_row.expected_heartbeat_seconds%',
  'state-only transitions preserve canonical commissioning configuration'
);
select ok(
  has_function_privilege('service_role','public.service_record_physical_pilot_evidence_v1(uuid,uuid,bigint,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,boolean,boolean,text,text,boolean,boolean,text,text[],text)','EXECUTE')
  and not has_function_privilege('authenticated','public.service_record_physical_pilot_evidence_v1(uuid,uuid,bigint,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,boolean,boolean,text,text,boolean,boolean,text,text[],text)','EXECUTE'),
  'only service role can record evidence through the sanctioned RPC'
);
select ok(not exists(
 select 1
 from unnest(array['anon','authenticated','service_role']) role_name,
      unnest(array[
        'physical_pilot_commissioning','physical_pilot_commissioning_receipts',
        'physical_pilot_network_validation_receipts','physical_pilot_evidence_receipts',
        'physical_pilot_evidence_telemetry_receipts','physical_pilot_repository_authority'
      ]) table_name,
      unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) privilege_name
 where has_table_privilege(role_name,format('public.%I',table_name),privilege_name)
),'browser and service roles have no direct M26 authority-table mutation path');
select ok(not exists(
 select 1 from unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) privilege_name
 where has_table_privilege('service_role','public.telemetry_receipts',privilege_name)
),'service role cannot forge authoritative M21 telemetry');

-- Canonical DB/shared safe-metadata parity table. These expectations are bound
-- to the final M24F catalog/privacy closure, not the superseded foundation body.
select ok(not exists(
 select 1
 from (values
   ('ordinary_reason',true),
   (repeat('a',23),true),
   (repeat('a',24),true),
   (repeat('f',32),true),
   (repeat('F',32),true),
   ('prefix-'||repeat('a',24),true),
   (repeat('a',12)||' '||repeat('b',12),true),
   ('credential=fixture-secret',false),
   ('https://evidence.example/path',false),
   ('evidence.example/path',false),
   ('12.34567, 77.45678',false),
   ('12.34567 77.45678',false),
   ('raw_payload fragment',false),
   ('{"payload":true}',false),
   ('Abcdefghijklmnopqrstuvwx12345678',false),
   ('0123456789abcdef0123456789abcdef',true),
   ('aa:bb:cc:dd:ee:ff',false),
   ('490154203237518',false),
   ('adapter_generation_7',true)
 ) as cases(value,expected)
 where public.m24f_is_safe_metadata(value) is distinct from expected
),'database safe-metadata truth matches the final shared parity fixture');

-- Executable state-machine journey.
reset role;
insert into public.user_profiles(auth_user_id,display_name,role)
values('26000000-0000-0000-0000-000000000001','M26 fixture admin','admin');
insert into public.vehicles(id,vehicle_number,vehicle_type,city)
values('26000000-0000-0000-0000-000000000002','M26-FIXTURE-VEHICLE','auto','Test');

set local role authenticated;
select set_config('request.jwt.claim.sub','26000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select lives_ok($$
 select public.admin_create_m24f_capability_manifest_v1(
   'm26-fixture','1','synthetic fixture','direct_http','hmac_signature',
   true,true,true,true,true,false,true,false,array[]::text[],
   'synthetic test only','synthetic test only'
 )
$$,'fixture manifest creation executes');
select lives_ok($$
 select public.admin_create_m24f_candidate_v1(
   'M26 fixture','synthetic fixture','direct_http','hmac_signature',
   'unknown','not_required','unknown','supported','stable_event_id','synthetic test only'
 )
$$,'fixture candidate creation executes');
select lives_ok($$
 select public.admin_update_m24f_candidate_metadata_v1(
   (select id from public.m24f_adapter_candidates where safe_display_name='M26 fixture'),
   (select id from public.m24f_adapter_capability_manifests where adapter_id='m26-fixture' and adapter_version='1'),
   'verified_sandbox','documented','documented','not_assessed','unverified_assumption','not_assessed',null,'synthetic test only'
 )
$$,'fixture candidate binds the manifest');
select lives_ok($$
 select public.admin_record_m24f_certification_v1(
   (select id from public.m24f_adapter_candidates where safe_display_name='M26 fixture'),
   'm26-fixture','1','synthetic_conformance','passed',1,1,repeat('a',64),'synthetic acceptance'
 )
$$,'fixture certification run executes');
select lives_ok($$
 select public.admin_record_m24f_certification_scenarios_v1(
   (select id from public.m24f_certification_runs
     where candidate_id=(select id from public.m24f_adapter_candidates where safe_display_name='M26 fixture')
     order by completed_at desc,id desc limit 1),
   array['fixture_authentication'],array['authentication'],array[true],array['passed']
 )
$$,'fixture certification scenario persists');
select lives_ok($$
 select public.admin_decide_m24f_candidate_v1(
   (select id from public.m24f_adapter_candidates where safe_display_name='M26 fixture'),
   'technically_compatible','fixture_certified','synthetic acceptance'
 )
$$,'fixture becomes technically compatible');
select lives_ok($$
 select public.admin_decide_m24f_candidate_v1(
   (select id from public.m24f_adapter_candidates where safe_display_name='M26 fixture'),
   'approved_by_ap','fixture_approved','synthetic acceptance'
 )
$$,'fixture records explicit AP approval');
select lives_ok($$
 select public.admin_register_gps_device(
   'M26-FIXTURE','Fixture','Model','generic_http','https','M26-FIXTURE-SERIAL',
   null,null,null,null,'1','synthetic test'
 )
$$,'fixture device registration executes');
select lives_ok($$
 select public.admin_link_gps_device_vehicle(
   (select id from public.gps_devices where device_code='M26-FIXTURE'),
   '26000000-0000-0000-0000-000000000002',clock_timestamp(),'fixture','fixture'
 )
$$,'fixture vehicle link executes');
select lives_ok($$
 select public.admin_record_gps_device_event(
   (select id from public.gps_devices where device_code='M26-FIXTURE'),
   'installed',clock_timestamp(),'26000000-0000-0000-0000-000000000002',null,'fixture','fixture'
 )
$$,'fixture installation executes');
select lives_ok($$
 select public.admin_change_gps_device_status(
   (select id from public.gps_devices where device_code='M26-FIXTURE'),'active',null
 )
$$,'fixture activation executes');

reset role;
update public.gps_devices
set gps_readiness='ready',gsm_readiness='degraded'
where device_code='M26-FIXTURE';
insert into public.gps_device_credential_metadata(
 id,gps_device_id,credential_key_id,status,issued_at,expires_at,last_verified_at,created_by_admin
)
select '26000000-0000-0000-0000-000000000006',id,'fixture-key','active',
       clock_timestamp(),clock_timestamp()+interval '1 day',clock_timestamp(),
       '26000000-0000-0000-0000-000000000001'
from public.gps_devices where device_code='M26-FIXTURE';

set local role authenticated;
select set_config('request.jwt.claim.sub','26000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select lives_ok($$
 select public.admin_transition_physical_pilot_commissioning_v1(
   (select id from public.gps_devices where device_code='M26-FIXTURE'),
   (select id from public.m24f_adapter_candidates where safe_display_name='M26 fixture'),
   (select id from public.m24f_adapter_capability_manifests where adapter_id='m26-fixture' and adapter_version='1'),
   0,'26000000-0000-0000-0000-000000000007','draft','fixture_create','fixture_network',45
 )
$$,'draft commissioning transition executes');
select lives_ok($$
 select public.admin_transition_physical_pilot_commissioning_v1(
   (select id from public.gps_devices where device_code='M26-FIXTURE'),
   (select id from public.m24f_adapter_candidates where safe_display_name='M26 fixture'),
   (select id from public.m24f_adapter_capability_manifests where adapter_id='m26-fixture' and adapter_version='1'),
   1,'26000000-0000-0000-0000-000000000008','commissioning','fixture_start','stale_browser_network',60
 )
$$,'state-only start executes despite stale browser form values');
select is(
 (select expected_heartbeat_seconds from public.physical_pilot_commissioning
  where gps_device_id=(select id from public.gps_devices where device_code='M26-FIXTURE')),
 45,
 'state-only start preserves the draft heartbeat'
);
select is(
 (select network_configuration_class from public.physical_pilot_commissioning
  where gps_device_id=(select id from public.gps_devices where device_code='M26-FIXTURE')),
 'fixture_network',
 'state-only start preserves the draft network class'
);
select is(
 (select safe_receipt->>'requested_expected_heartbeat_seconds'
  from public.physical_pilot_commissioning_receipts
  where transition_key='26000000-0000-0000-0000-000000000008'),
 '60',
 'transition receipt freezes the stale requested heartbeat separately from effective truth'
);
select is(
 (select safe_receipt->>'expected_heartbeat_seconds'
  from public.physical_pilot_commissioning_receipts
  where transition_key='26000000-0000-0000-0000-000000000008'),
 '45',
 'transition receipt freezes the effective heartbeat'
);
select ok((public.admin_transition_physical_pilot_commissioning_v1(
   (select id from public.gps_devices where device_code='M26-FIXTURE'),
   (select id from public.m24f_adapter_candidates where safe_display_name='M26 fixture'),
   (select id from public.m24f_adapter_capability_manifests where adapter_id='m26-fixture' and adapter_version='1'),
   1,'26000000-0000-0000-0000-000000000008','commissioning','fixture_start','stale_browser_network',60
 )->>'replayed')::boolean,
 'exact state transition replay returns its frozen receipt'
);
select throws_ok($$
 select public.admin_transition_physical_pilot_commissioning_v1(
   (select id from public.gps_devices where device_code='M26-FIXTURE'),
   (select id from public.m24f_adapter_candidates where safe_display_name='M26 fixture'),
   (select id from public.m24f_adapter_capability_manifests where adapter_id='m26-fixture' and adapter_version='1'),
   2,'26000000-0000-0000-0000-000000000008','commissioning','fixture_start','stale_browser_network',60
 )
$$,'22023','Transition key request mismatch','changed transition replay is fenced');

reset role;
select d.id as fixture_device_id,
       c.id as fixture_commissioning_id,
       a.id as fixture_candidate_id,
       m.id as fixture_manifest_id,
       l.id as fixture_link_id,
       i.id as fixture_installation_id,
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
select lives_ok($$
 select public.service_rotate_physical_pilot_repository_authority_v1(repeat('b',40),'fixture_workflow')
$$,'repository authority rotation executes');
select lives_ok(format(
 'select public.service_record_physical_pilot_network_validation_v1(%L,%L,2,%L,%L,%L,%L,%L,%L,clock_timestamp(),%L,%L)',
 '26000000-0000-0000-0000-000000000009',:'fixture_commissioning_id',:'fixture_device_id',
 :'fixture_link_id',:'fixture_installation_id','26000000-0000-0000-0000-000000000006',
 'fixture_network',repeat('c',64),repeat('b',40),'fixture_workflow'
),'network validation executes against the preserved canonical configuration');

reset role;
select validated_at as fixture_network_validated_at
from public.physical_pilot_network_validation_receipts
where id='26000000-0000-0000-0000-000000000009' \gset

set local role authenticated;
select set_config('request.jwt.claim.sub','26000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select is(
 public.admin_get_physical_pilot_readiness_v1(:'fixture_device_id'::uuid)->>'stage',
 'physical_evidence_required',
 'fully commissioned software state still requires real physical evidence'
);

reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select lives_ok(format(
 'select public.service_record_physical_pilot_evidence_v1(%L,%L,2,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,clock_timestamp(),0,false,true,%L,%L,false,false,%L,%L,%L)',
 '26000000-0000-0000-0000-000000000010',:'fixture_commissioning_id',:'fixture_candidate_id',
 :'fixture_manifest_id',repeat('b',40),'fixture_workflow',:'fixture_device_id',:'fixture_device_digest',
 :'fixture_installation_id',:'fixture_link_id','26000000-0000-0000-0000-000000000006',
 '26000000-0000-0000-0000-000000000009','physical',:'fixture_network_validated_at',
 'failed','failed','blocked','{authentication_failed}',repeat('d',64)
),'zero-telemetry blocked physical evidence is persisted');
reset role;
select is(
 (select telemetry_count from public.physical_pilot_evidence_receipts
  where id='26000000-0000-0000-0000-000000000010'),
 0::bigint,
 'blocked receipt truthfully stores zero telemetry'
);
select is(
 (select disposition from public.physical_pilot_evidence_receipts
  where id='26000000-0000-0000-0000-000000000010'),
 'blocked',
 'zero-telemetry evidence remains explicitly blocked'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','26000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select is(
 public.admin_get_physical_pilot_readiness_v1(:'fixture_device_id'::uuid)->>'stage',
 'physical_evidence_required',
 'latest blocked physical run cannot mint readiness'
);
select ok(
 (public.admin_get_physical_pilot_readiness_v1(:'fixture_device_id'::uuid)->'blockingReasons')
   ? 'physical_evidence_blocked',
 'readiness exposes the latest physical failure disposition'
);

reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select throws_ok(format(
 'select public.service_record_physical_pilot_evidence_v1(%L,%L,2,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,clock_timestamp(),1,true,true,%L,%L,true,true,%L,%L,%L)',
 '26000000-0000-0000-0000-000000000011',:'fixture_commissioning_id',:'fixture_candidate_id',
 :'fixture_manifest_id',repeat('b',40),'fixture_workflow',:'fixture_device_id',:'fixture_device_digest',
 :'fixture_installation_id',:'fixture_link_id','26000000-0000-0000-0000-000000000006',
 '26000000-0000-0000-0000-000000000009','physical',:'fixture_network_validated_at',
 'passed','passed','pass','{}',repeat('d',64)
),'42501','Physical pass requires authoritative non-synthetic telemetry',
'caller-supplied physical pass without M21 telemetry is rejected');
reset role;
select is(
 (select count(*)::integer from public.physical_pilot_evidence_receipts
  where id='26000000-0000-0000-0000-000000000011'),
 0,
 'rejected no-telemetry pass creates no evidence receipt'
);

-- Exact evidence replay must survive later mutable authority changes because the
-- immutable receipt is the response-loss authority.
select observation_started_at as fixture_observation_started_at,
       observation_ended_at as fixture_observation_ended_at
from public.physical_pilot_evidence_receipts
where id='26000000-0000-0000-0000-000000000010' \gset
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select lives_ok($$
 select public.service_rotate_physical_pilot_repository_authority_v1(repeat('e',40),'fixture_workflow_2')
$$,'later repository authority rotation executes');
select lives_ok(format(
 'select public.service_record_physical_pilot_evidence_v1(%L,%L,2,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,0,false,true,%L,%L,false,false,%L,%L,%L)',
 '26000000-0000-0000-0000-000000000010',:'fixture_commissioning_id',:'fixture_candidate_id',
 :'fixture_manifest_id',repeat('b',40),'fixture_workflow',:'fixture_device_id',:'fixture_device_digest',
 :'fixture_installation_id',:'fixture_link_id','26000000-0000-0000-0000-000000000006',
 '26000000-0000-0000-0000-000000000009','physical',:'fixture_observation_started_at',
 :'fixture_observation_ended_at','failed','failed','blocked','{authentication_failed}',repeat('d',64)
),'exact evidence replay survives later repository rotation');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','26000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select is(
 public.admin_get_physical_pilot_readiness_v1(:'fixture_device_id'::uuid)->>'stage',
 'awaiting_network_validation',
 'repository rotation invalidates current network/evidence readiness without deleting receipts'
);

select * from finish();
rollback;