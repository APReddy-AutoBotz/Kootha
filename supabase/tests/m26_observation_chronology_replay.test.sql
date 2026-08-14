-- Exact-head regressions for M26 observation chronology and null-selector replay.
-- Fixtures are synthetic/disposable and cannot satisfy physical readiness.
\connect postgres supabase_admin
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

reset role;
insert into public.user_profiles(auth_user_id,display_name,role)
values('26100000-0000-0000-0000-000000000001','M26 chronology admin','admin');
insert into public.vehicles(id,vehicle_number,vehicle_type,city)
values('26100000-0000-0000-0000-000000000002','M26-CHRONOLOGY-VEHICLE','auto','Test');

set local role authenticated;
select set_config('request.jwt.claim.sub','26100000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select lives_ok($$
 select public.admin_create_m24f_capability_manifest_v1(
   'm26-chronology-fixture','1','synthetic chronology fixture','direct_http','hmac_signature',
   true,true,true,true,true,false,true,false,array[]::text[],
   'synthetic test only','synthetic test only'
 )
$$,'chronology fixture manifest creation executes');
select lives_ok($$
 select public.admin_create_m24f_candidate_v1(
   'M26 chronology fixture','synthetic chronology fixture','direct_http','hmac_signature',
   'unknown','not_required','unknown','supported','stable_event_id','synthetic test only'
 )
$$,'chronology fixture candidate creation executes');
select lives_ok($$
 select public.admin_update_m24f_candidate_metadata_v1(
   (select id from public.m24f_adapter_candidates where safe_display_name='M26 chronology fixture'),
   (select id from public.m24f_adapter_capability_manifests where adapter_id='m26-chronology-fixture' and adapter_version='1'),
   'verified_sandbox','documented','documented','not_assessed','unverified_assumption','not_assessed',null,'synthetic test only'
 )
$$,'chronology fixture candidate binds the manifest');
select lives_ok($$
 select public.admin_record_m24f_certification_v1(
   (select id from public.m24f_adapter_candidates where safe_display_name='M26 chronology fixture'),
   'm26-chronology-fixture','1','synthetic_conformance','passed',1,1,repeat('a',64),'synthetic chronology acceptance'
 )
$$,'chronology fixture certification executes');
select lives_ok($$
 select public.admin_record_m24f_certification_scenarios_v1(
   (select id from public.m24f_certification_runs
     where candidate_id=(select id from public.m24f_adapter_candidates where safe_display_name='M26 chronology fixture')
     order by completed_at desc,id desc limit 1),
   array['fixture_authentication'],array['authentication'],array[true],array['passed']
 )
$$,'chronology fixture certification scenario persists');
select lives_ok($$
 select public.admin_decide_m24f_candidate_v1(
   (select id from public.m24f_adapter_candidates where safe_display_name='M26 chronology fixture'),
   'technically_compatible','fixture_certified','synthetic chronology acceptance'
 )
$$,'chronology fixture becomes technically compatible');
select lives_ok($$
 select public.admin_decide_m24f_candidate_v1(
   (select id from public.m24f_adapter_candidates where safe_display_name='M26 chronology fixture'),
   'approved_by_ap','fixture_approved','synthetic chronology acceptance'
 )
$$,'chronology fixture records explicit AP approval');
select lives_ok($$
 select public.admin_register_gps_device(
   'M26-CHRONOLOGY','Fixture','Model','generic_http','https','M26-CHRONOLOGY-SERIAL',
   null,null,null,null,'1','synthetic test'
 )
$$,'chronology fixture device registration executes');
select lives_ok($$
 select public.admin_link_gps_device_vehicle(
   (select id from public.gps_devices where device_code='M26-CHRONOLOGY'),
   '26100000-0000-0000-0000-000000000002',clock_timestamp()-interval '2 hours','fixture','fixture'
 )
$$,'chronology fixture vehicle link executes');
select lives_ok($$
 select public.admin_record_gps_device_event(
   (select id from public.gps_devices where device_code='M26-CHRONOLOGY'),
   'installed',clock_timestamp()-interval '110 minutes','26100000-0000-0000-0000-000000000002',null,'fixture','fixture'
 )
$$,'chronology fixture installation executes');
select lives_ok($$
 select public.admin_change_gps_device_status(
   (select id from public.gps_devices where device_code='M26-CHRONOLOGY'),'active',null
 )
$$,'chronology fixture activation executes');

reset role;
update public.gps_devices
set gps_readiness='ready',gsm_readiness='degraded'
where device_code='M26-CHRONOLOGY';
insert into public.gps_device_credential_metadata(
 id,gps_device_id,credential_key_id,status,issued_at,expires_at,last_verified_at,created_by_admin
)
select '26100000-0000-0000-0000-000000000006',id,'fixture-key','active',
       clock_timestamp()-interval '100 minutes',clock_timestamp()+interval '1 day',
       clock_timestamp()-interval '90 minutes','26100000-0000-0000-0000-000000000001'
from public.gps_devices where device_code='M26-CHRONOLOGY';

set local role authenticated;
select set_config('request.jwt.claim.sub','26100000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select lives_ok($$
 select public.admin_transition_physical_pilot_commissioning_v1(
   (select id from public.gps_devices where device_code='M26-CHRONOLOGY'),
   (select id from public.m24f_adapter_candidates where safe_display_name='M26 chronology fixture'),
   (select id from public.m24f_adapter_capability_manifests where adapter_id='m26-chronology-fixture' and adapter_version='1'),
   0,'26100000-0000-0000-0000-000000000007','draft','fixture_create','fixture_network',45
 )
$$,'chronology draft commissioning transition executes');
select lives_ok($$
 select public.admin_transition_physical_pilot_commissioning_v1(
   (select id from public.gps_devices where device_code='M26-CHRONOLOGY'),
   (select id from public.m24f_adapter_candidates where safe_display_name='M26 chronology fixture'),
   (select id from public.m24f_adapter_capability_manifests where adapter_id='m26-chronology-fixture' and adapter_version='1'),
   1,'26100000-0000-0000-0000-000000000008','commissioning','fixture_start_null',null,null
 )
$$,'state-only transition accepts omitted selectors and preserves effective configuration');
select is(
 (select network_configuration_class from public.physical_pilot_commissioning
  where gps_device_id=(select id from public.gps_devices where device_code='M26-CHRONOLOGY')),
 'fixture_network','omitted network selector preserves current configuration'
);
select is(
 (select expected_heartbeat_seconds from public.physical_pilot_commissioning
  where gps_device_id=(select id from public.gps_devices where device_code='M26-CHRONOLOGY')),
 45,'omitted heartbeat selector preserves current configuration'
);
select ok(
 (select safe_receipt ? 'requested_network_configuration_class'
  from public.physical_pilot_commissioning_receipts
  where transition_key='26100000-0000-0000-0000-000000000008'),
 'receipt explicitly freezes the requested network selector key'
);
select is(
 (select jsonb_typeof(safe_receipt->'requested_network_configuration_class')
  from public.physical_pilot_commissioning_receipts
  where transition_key='26100000-0000-0000-0000-000000000008'),
 'null','receipt preserves requested JSON null instead of replacing it with effective truth'
);
select ok((public.admin_transition_physical_pilot_commissioning_v1(
   (select id from public.gps_devices where device_code='M26-CHRONOLOGY'),
   (select id from public.m24f_adapter_candidates where safe_display_name='M26 chronology fixture'),
   (select id from public.m24f_adapter_capability_manifests where adapter_id='m26-chronology-fixture' and adapter_version='1'),
   1,'26100000-0000-0000-0000-000000000008','commissioning','fixture_start_null',null,null
 )->>'replayed')::boolean,
 'exact state-only replay with null selectors returns the immutable receipt'
);
select throws_ok($$
 select public.admin_transition_physical_pilot_commissioning_v1(
   (select id from public.gps_devices where device_code='M26-CHRONOLOGY'),
   (select id from public.m24f_adapter_candidates where safe_display_name='M26 chronology fixture'),
   (select id from public.m24f_adapter_capability_manifests where adapter_id='m26-chronology-fixture' and adapter_version='1'),
   1,'26100000-0000-0000-0000-000000000008','commissioning','fixture_start_null','fixture_network',45
 )
$$,'22023','Transition key request mismatch','changed selectors cannot reuse a null-selector transition receipt');

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
join public.m24f_adapter_candidates a on a.safe_display_name='M26 chronology fixture'
join public.m24f_adapter_capability_manifests m on m.adapter_id='m26-chronology-fixture' and m.adapter_version='1'
join public.gps_device_vehicle_links l on l.gps_device_id=d.id and l.effective_until is null
join public.gps_device_lifecycle_events i on i.gps_device_id=d.id and i.event_type='installed'
where d.device_code='M26-CHRONOLOGY'
order by i.effective_at desc,i.created_at desc limit 1 \gset

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select lives_ok($$
 select public.service_rotate_physical_pilot_repository_authority_v1(repeat('b',40),'chronology_workflow')
$$,'chronology repository authority rotation executes');
select lives_ok(format(
 'select public.service_record_physical_pilot_network_validation_v1(%L,%L,2,%L,%L,%L,%L,%L,%L,%L,%L,%L)',
 '26100000-0000-0000-0000-000000000009',:'fixture_commissioning_id',:'fixture_device_id',
 :'fixture_link_id',:'fixture_installation_id','26100000-0000-0000-0000-000000000006',
 'fixture_network',repeat('c',64),clock_timestamp()-interval '60 minutes',repeat('b',40),'chronology_workflow'
),'chronology network validation executes');

reset role;
select validated_at as fixture_network_validated_at
from public.physical_pilot_network_validation_receipts
where id='26100000-0000-0000-0000-000000000009' \gset

-- Record the physically newer failed run first.
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select lives_ok(format(
 'select public.service_record_physical_pilot_evidence_v1(%L,%L,2,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,0,false,true,%L,%L,false,false,%L,%L,%L)',
 '26100000-0000-0000-0000-000000000010',:'fixture_commissioning_id',:'fixture_candidate_id',
 :'fixture_manifest_id',repeat('b',40),'chronology_workflow',:'fixture_device_id',:'fixture_device_digest',
 :'fixture_installation_id',:'fixture_link_id','26100000-0000-0000-0000-000000000006',
 '26100000-0000-0000-0000-000000000009','physical',
 (:'fixture_network_validated_at'::timestamptz + interval '20 minutes'),
 (:'fixture_network_validated_at'::timestamptz + interval '30 minutes'),
 'failed','failed','blocked','{newer_physical_blocked}',repeat('d',64)
),'newer physical blocked run persists');

-- Deliver an older run afterwards. Its recorded_at is newer, but its physical
-- observation chronology is older and must never become readiness-authoritative.
select lives_ok(format(
 'select public.service_record_physical_pilot_evidence_v1(%L,%L,2,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,0,false,true,%L,%L,false,false,%L,%L,%L)',
 '26100000-0000-0000-0000-000000000011',:'fixture_commissioning_id',:'fixture_candidate_id',
 :'fixture_manifest_id',repeat('b',40),'chronology_workflow',:'fixture_device_id',:'fixture_device_digest',
 :'fixture_installation_id',:'fixture_link_id','26100000-0000-0000-0000-000000000006',
 '26100000-0000-0000-0000-000000000009','physical',
 (:'fixture_network_validated_at'::timestamptz + interval '5 minutes'),
 (:'fixture_network_validated_at'::timestamptz + interval '10 minutes'),
 'failed','failed','partial','{delayed_older_partial}',repeat('d',64)
),'delayed older physical partial run persists after the newer blocked run');

reset role;
select ok(
 (select newer.observation_ended_at > older.observation_ended_at
         and newer.recorded_at < older.recorded_at
  from public.physical_pilot_evidence_receipts newer,
       public.physical_pilot_evidence_receipts older
  where newer.id='26100000-0000-0000-0000-000000000010'
    and older.id='26100000-0000-0000-0000-000000000011'),
 'fixture proves observation chronology and receipt arrival chronology disagree'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','26100000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select is(
 public.admin_get_physical_pilot_readiness_v1(:'fixture_device_id'::uuid)->>'stage',
 'physical_evidence_required',
 'out-of-order failed receipts remain non-ready'
);
select is(
 public.admin_get_physical_pilot_readiness_v1(:'fixture_device_id'::uuid)->'blockingReasons'->>0,
 'physical_evidence_blocked',
 'physically newer blocked run outranks a later-arriving older partial run'
);
select isnt(
 public.admin_get_physical_pilot_readiness_v1(:'fixture_device_id'::uuid)->'blockingReasons'->>0,
 'physical_evidence_partial',
 'receipt arrival order cannot replace physical-run chronology'
);

select * from finish();
rollback;
