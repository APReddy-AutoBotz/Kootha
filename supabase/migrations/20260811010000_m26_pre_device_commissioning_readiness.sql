-- M26 pre-device commissioning authority. Software can record and revalidate proof,
-- but cannot create physical observations, select hardware, or expose identifiers.

create table public.physical_pilot_repository_authority (
  generation bigint generated always as identity primary key,
  repository_head_sha text not null check (repository_head_sha ~ '^([a-f0-9]{40}|[a-f0-9]{64})$'),
  workflow_run_id text not null check (char_length(workflow_run_id) between 1 and 160 and public.m24f_is_safe_metadata(workflow_run_id)),
  recorded_at timestamptz not null default clock_timestamp()
);

create table public.physical_pilot_commissioning (
  id uuid primary key default gen_random_uuid(), gps_device_id uuid not null unique references public.gps_devices(id) on delete restrict,
  selected_candidate_id uuid not null references public.m24f_adapter_candidates(id) on delete restrict,
  selected_manifest_id uuid not null references public.m24f_adapter_capability_manifests(id) on delete restrict,
  selected_certification_run_id uuid not null references public.m24f_certification_runs(id) on delete restrict,
  state text not null default 'draft' check (state in ('draft','commissioning','suspended','decommissioned')),
  network_configuration_class text, expected_heartbeat_seconds integer check (expected_heartbeat_seconds between 10 and 86400),
  version bigint not null default 1 check (version > 0), last_transition_key uuid not null,
  created_by_admin uuid not null references public.user_profiles(auth_user_id) on delete restrict, created_at timestamptz not null default clock_timestamp(),
  updated_by_admin uuid not null references public.user_profiles(auth_user_id) on delete restrict, updated_at timestamptz not null default clock_timestamp(),
  check (network_configuration_class is null or char_length(network_configuration_class) between 1 and 80)
);

create table public.physical_pilot_commissioning_receipts (
  id uuid primary key default gen_random_uuid(), commissioning_id uuid not null references public.physical_pilot_commissioning(id) on delete restrict,
  transition_key uuid not null unique, from_state text, to_state text not null, expected_version bigint not null check (expected_version >= 0), resulting_version bigint not null,
  reason_code text not null check (char_length(reason_code) between 1 and 80), actor_id uuid not null references public.user_profiles(auth_user_id) on delete restrict,
  recorded_at timestamptz not null default clock_timestamp(), safe_receipt jsonb not null,
  check (safe_receipt = safe_receipt - array['secret','token','credential','latitude','longitude','raw_payload','payload'])
);

create table public.physical_pilot_network_validation_receipts (
  id uuid primary key, commissioning_id uuid not null references public.physical_pilot_commissioning(id) on delete restrict,
  commissioning_version bigint not null, gps_device_id uuid not null references public.gps_devices(id) on delete restrict,
  vehicle_link_id uuid not null references public.gps_device_vehicle_links(id) on delete restrict,
  installation_event_id uuid not null references public.gps_device_lifecycle_events(id) on delete restrict,
  credential_id uuid not null references public.gps_device_credential_metadata(id) on delete restrict,
  certification_run_id uuid not null references public.m24f_certification_runs(id) on delete restrict,
  repository_authority_generation bigint not null references public.physical_pilot_repository_authority(generation) on delete restrict,
  repository_head_sha text not null check (repository_head_sha ~ '^([a-f0-9]{40}|[a-f0-9]{64})$'),
  workflow_run_id text not null check (char_length(workflow_run_id) between 1 and 160 and public.m24f_is_safe_metadata(workflow_run_id)),
  network_configuration_class text not null check (char_length(network_configuration_class) between 1 and 80),
  configuration_identity_hash text not null check (configuration_identity_hash ~ '^[a-f0-9]{64}$'),
  validated_at timestamptz not null, recorded_at timestamptz not null default clock_timestamp()
);

create table public.physical_pilot_evidence_receipts (
  id uuid primary key, commissioning_id uuid not null references public.physical_pilot_commissioning(id) on delete restrict,
  commissioning_version bigint not null, selected_candidate_id uuid not null references public.m24f_adapter_candidates(id) on delete restrict,
  certification_run_id uuid not null references public.m24f_certification_runs(id) on delete restrict,
  repository_authority_generation bigint not null references public.physical_pilot_repository_authority(generation) on delete restrict,
  repository_head_sha text not null check (repository_head_sha ~ '^([a-f0-9]{40}|[a-f0-9]{64})$'), workflow_run_id text not null check (char_length(workflow_run_id) between 1 and 160),
  manifest_id uuid not null references public.m24f_adapter_capability_manifests(id) on delete restrict,
  gps_device_id uuid not null references public.gps_devices(id) on delete restrict, device_identity_hash text not null check (device_identity_hash ~ '^[a-f0-9]{64}$'),
  installation_receipt_id uuid not null references public.gps_device_lifecycle_events(id) on delete restrict,
  vehicle_link_id uuid not null references public.gps_device_vehicle_links(id) on delete restrict,
  credential_id uuid not null references public.gps_device_credential_metadata(id) on delete restrict, credential_verified_at timestamptz not null,
  network_validation_receipt_id uuid not null references public.physical_pilot_network_validation_receipts(id) on delete restrict,
  network_configuration_class text not null, classification text not null check (classification in ('synthetic','physical')),
  physical_evidence boolean generated always as (classification = 'physical') stored,
  observation_started_at timestamptz not null, observation_ended_at timestamptz not null,
  telemetry_count bigint not null check (telemetry_count between 1 and 10000000), authentication_passed boolean not null, replay_passed boolean not null,
  sequence_outcome text not null check (sequence_outcome in ('passed','failed','not_supported')),
  reconnect_outcome text not null check (reconnect_outcome in ('passed','failed','not_supported')),
  health_passed boolean not null, freshness_passed boolean not null, disposition text not null check (disposition in ('pass','partial','blocked')),
  reason_codes text[] not null default '{}', operator_id_hash text not null check (operator_id_hash ~ '^[a-f0-9]{64}$'), recorded_at timestamptz not null default clock_timestamp(),
  check (observation_ended_at > observation_started_at),
  check (cardinality(reason_codes) <= 20)
);

create or replace function public.m26_current_certification_run_v1(p_candidate_id uuid,p_manifest_id uuid)
returns uuid language sql stable security invoker set search_path=pg_catalog,public as $$
  select r.id from public.m24f_certification_runs r
  join public.m24f_adapter_candidates c on c.id=r.candidate_id
  join public.m24f_adapter_capability_manifests m on m.id=r.manifest_id
  where r.id=(select x.id from public.m24f_certification_runs x where x.candidate_id=p_candidate_id order by x.completed_at desc nulls last,x.id desc limit 1)
    and r.candidate_id=p_candidate_id and r.manifest_id=p_manifest_id and c.manifest_id=p_manifest_id
    and c.decision_status='approved_by_ap' and c.certification_status='passed'
    and r.certification_state='passed' and r.certification_level='synthetic_conformance' and r.synthetic
    and r.scenario_count>0 and r.passed_count=r.scenario_count and r.failed_count=0
    and r.adapter_id=m.adapter_id and r.adapter_version=m.adapter_version
    and public.m24f_assert_persisted_scenario_truth(r.id)
    and exists(select 1 from public.m24f_candidate_decision_history h where h.candidate_id=c.id and h.new_status='approved_by_ap' and h.manifest_id=p_manifest_id and h.certification_run_id=r.id)
$$;

create or replace function public.m26_validate_reason_codes_v1() returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare v_reason text;
begin
 if cardinality(new.reason_codes)>20 then raise exception 'Too many evidence reason codes' using errcode='22023'; end if;
 foreach v_reason in array new.reason_codes loop
  if v_reason is null or char_length(v_reason) not between 1 and 80 or not public.m24f_is_safe_metadata(v_reason)
  then raise exception 'Unsafe evidence reason code' using errcode='22023'; end if;
 end loop;
 return new;
end $$;
create trigger physical_pilot_evidence_reason_codes_safe before insert on public.physical_pilot_evidence_receipts for each row execute function public.m26_validate_reason_codes_v1();

create or replace function public.m26_reject_immutable_change() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin raise exception 'Readiness receipts are immutable' using errcode='42501'; end $$;
create trigger physical_pilot_commissioning_receipts_immutable before update or delete on public.physical_pilot_commissioning_receipts for each row execute function public.m26_reject_immutable_change();
create trigger physical_pilot_network_receipts_immutable before update or delete on public.physical_pilot_network_validation_receipts for each row execute function public.m26_reject_immutable_change();
create trigger physical_pilot_evidence_receipts_immutable before update or delete on public.physical_pilot_evidence_receipts for each row execute function public.m26_reject_immutable_change();
create trigger physical_pilot_repository_authority_immutable before update or delete on public.physical_pilot_repository_authority for each row execute function public.m26_reject_immutable_change();

create or replace function public.service_rotate_physical_pilot_repository_authority_v1(p_repository_head_sha text,p_workflow_run_id text)
returns bigint language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_generation bigint;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service authority required' using errcode='42501'; end if;
 if p_repository_head_sha !~ '^([a-f0-9]{40}|[a-f0-9]{64})$' or p_workflow_run_id is null or char_length(p_workflow_run_id) not between 1 and 160 or not public.m24f_is_safe_metadata(p_workflow_run_id)
 then raise exception 'Invalid repository authority' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtext('m26_repository_authority'));
 insert into public.physical_pilot_repository_authority(repository_head_sha,workflow_run_id)
 values(p_repository_head_sha,p_workflow_run_id) returning generation into v_generation;
 return v_generation;
end $$;

create or replace function public.admin_transition_physical_pilot_commissioning_v1(
  p_device_id uuid,p_candidate_id uuid,p_manifest_id uuid,p_expected_version bigint,p_transition_key uuid,p_new_state text,p_reason_code text,
  p_network_configuration_class text default null,p_expected_heartbeat_seconds integer default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_actor uuid; v_row public.physical_pilot_commissioning%rowtype; v_candidate public.m24f_adapter_candidates%rowtype;
 v_manifest public.m24f_adapter_capability_manifests%rowtype; v_certification_run_id uuid; v_from text; v_receipt public.physical_pilot_commissioning_receipts%rowtype;
begin
  v_actor:=public.m20a_require_admin();
  -- Serialize identical in-flight requests before the receipt-first lookup.
  -- The immutable receipt remains the replay authority after later state or
  -- certification changes.
  perform pg_advisory_xact_lock(hashtext(p_transition_key::text));
  if p_expected_version is null then raise exception 'Expected commissioning version is required' using errcode='22023'; end if;
  if p_new_state not in ('draft','commissioning','suspended','decommissioned') or p_reason_code !~ '^[a-z0-9_]{1,80}$' then raise exception 'Invalid commissioning transition' using errcode='22023'; end if;
  if p_network_configuration_class is not null and (char_length(p_network_configuration_class) not between 1 and 80 or not public.m24f_is_safe_metadata(p_network_configuration_class))
  then raise exception 'Unsafe network configuration class' using errcode='22023'; end if;
  -- Receipt-first replay is deliberately independent of mutable certification and
  -- current commissioning state. It makes response-loss recovery durable even
  -- after another transition or authority rotation.
  select * into v_receipt from public.physical_pilot_commissioning_receipts where transition_key=p_transition_key;
  if v_receipt.id is not null then
    if v_receipt.expected_version is distinct from p_expected_version or v_receipt.to_state is distinct from p_new_state or v_receipt.reason_code is distinct from p_reason_code
      or v_receipt.safe_receipt->>'device_id' is distinct from p_device_id::text
      or v_receipt.safe_receipt->>'candidate_id' is distinct from p_candidate_id::text or v_receipt.safe_receipt->>'manifest_id' is distinct from p_manifest_id::text
      or v_receipt.safe_receipt->>'network_configuration_class' is distinct from p_network_configuration_class
      or v_receipt.safe_receipt->>'expected_heartbeat_seconds' is distinct from p_expected_heartbeat_seconds::text
    then raise exception 'Transition key request mismatch' using errcode='22023'; end if;
    return jsonb_build_object('receipt_id',v_receipt.id,'version',v_receipt.resulting_version,'replayed',true);
  end if;
  select * into v_candidate from public.m24f_adapter_candidates where id=p_candidate_id;
  select * into v_manifest from public.m24f_adapter_capability_manifests where id=p_manifest_id;
  v_certification_run_id:=public.m26_current_certification_run_v1(p_candidate_id,p_manifest_id);
  if v_candidate.id is null or v_manifest.id is null or v_certification_run_id is null then raise exception 'Selected adapter is not approved by the current successful certification authority' using errcode='42501'; end if;
  select * into v_row from public.physical_pilot_commissioning where gps_device_id=p_device_id for update;
  if v_row.id is null then
    if p_expected_version is distinct from 0 or p_new_state<>'draft' then raise exception 'Stale commissioning version' using errcode='40001'; end if;
    v_from:=null;
    insert into public.physical_pilot_commissioning(gps_device_id,selected_candidate_id,selected_manifest_id,selected_certification_run_id,state,network_configuration_class,expected_heartbeat_seconds,last_transition_key,created_by_admin,updated_by_admin)
    values(p_device_id,p_candidate_id,p_manifest_id,v_certification_run_id,p_new_state,p_network_configuration_class,p_expected_heartbeat_seconds,p_transition_key,v_actor,v_actor) returning * into v_row;
  else
    if v_row.version is distinct from p_expected_version then raise exception 'Stale commissioning version' using errcode='40001'; end if;
    if v_row.state='decommissioned' or (v_row.state='suspended' and p_new_state not in ('draft','decommissioned')) then raise exception 'Blocked commissioning transition' using errcode='42501'; end if;
    v_from:=v_row.state;
    update public.physical_pilot_commissioning set state=p_new_state,selected_candidate_id=p_candidate_id,selected_manifest_id=p_manifest_id,selected_certification_run_id=v_certification_run_id,
      network_configuration_class=p_network_configuration_class,expected_heartbeat_seconds=p_expected_heartbeat_seconds,version=version+1,last_transition_key=p_transition_key,updated_by_admin=v_actor,updated_at=clock_timestamp()
    where id=v_row.id returning * into v_row;
  end if;
  insert into public.physical_pilot_commissioning_receipts(commissioning_id,transition_key,from_state,to_state,expected_version,resulting_version,reason_code,actor_id,safe_receipt)
  values(v_row.id,p_transition_key,v_from,p_new_state,p_expected_version,v_row.version,p_reason_code,v_actor,jsonb_build_object('contract_version','m26-readiness-v1','device_id',p_device_id,'candidate_id',p_candidate_id,'manifest_id',p_manifest_id,'state',p_new_state,'network_configuration_class',p_network_configuration_class,'expected_heartbeat_seconds',p_expected_heartbeat_seconds::text,'expected_version',p_expected_version,'certification_run_id',v_certification_run_id,'version',v_row.version)) returning * into v_receipt;
  return jsonb_build_object('receipt_id',v_receipt.id,'version',v_row.version,'replayed',false);
end $$;

-- Only a backend service-role path may create validation proof. All relational facts
-- are locked and checked before the immutable receipt is written.
create or replace function public.service_record_physical_pilot_network_validation_v1(
 p_receipt_id uuid,p_commissioning_id uuid,p_expected_version bigint,p_device_id uuid,p_vehicle_link_id uuid,p_installation_event_id uuid,
 p_credential_id uuid,p_network_configuration_class text,p_configuration_identity_hash text,p_validated_at timestamptz,
 p_repository_head_sha text,p_workflow_run_id text
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.physical_pilot_commissioning%rowtype; l public.gps_device_vehicle_links%rowtype; i public.gps_device_lifecycle_events%rowtype; k public.gps_device_credential_metadata%rowtype;
 r public.physical_pilot_repository_authority%rowtype; n public.physical_pilot_network_validation_receipts%rowtype;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service authority required' using errcode='42501'; end if;
 if p_network_configuration_class is null or char_length(p_network_configuration_class) not between 1 and 80 or not public.m24f_is_safe_metadata(p_network_configuration_class)
 then raise exception 'Unsafe network configuration class' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtext(p_receipt_id::text));
 select * into n from public.physical_pilot_network_validation_receipts where id=p_receipt_id;
 if n.id is not null then
  if n.commissioning_id is distinct from p_commissioning_id or n.commissioning_version is distinct from p_expected_version
   or n.gps_device_id is distinct from p_device_id or n.vehicle_link_id is distinct from p_vehicle_link_id
   or n.installation_event_id is distinct from p_installation_event_id or n.credential_id is distinct from p_credential_id
   or n.network_configuration_class is distinct from p_network_configuration_class or n.configuration_identity_hash is distinct from p_configuration_identity_hash
   or n.validated_at is distinct from p_validated_at or n.repository_head_sha is distinct from p_repository_head_sha
   or n.workflow_run_id is distinct from p_workflow_run_id
  then raise exception 'Network validation receipt replay conflict' using errcode='22023'; end if;
  return n.id;
 end if;
 select * into c from public.physical_pilot_commissioning where id=p_commissioning_id for update;
 select * into l from public.gps_device_vehicle_links where id=p_vehicle_link_id for share;
 select * into i from public.gps_device_lifecycle_events where id=p_installation_event_id for share;
 select * into k from public.gps_device_credential_metadata where id=p_credential_id for share;
 select * into r from public.physical_pilot_repository_authority order by generation desc limit 1 for share;
 if c.id is null or c.state<>'commissioning' or c.version is distinct from p_expected_version or c.gps_device_id<>p_device_id or c.network_configuration_class is distinct from p_network_configuration_class
   or l.gps_device_id is distinct from p_device_id or l.effective_until is not null or not l.is_primary
   or i.gps_device_id is distinct from p_device_id or i.vehicle_id is distinct from l.vehicle_id or i.event_type<>'installed' or i.effective_at<l.effective_from
   or exists(select 1 from public.gps_device_lifecycle_events x where x.gps_device_id=p_device_id and x.event_type in ('installed','removed','replaced','lost','stolen','retired','setup_reopened') and (x.effective_at,x.created_at)>(i.effective_at,i.created_at))
   or k.gps_device_id is distinct from p_device_id or k.status<>'active' or k.last_verified_at is null or k.last_verified_at<i.effective_at or (k.expires_at is not null and k.expires_at<=p_validated_at)
   or r.generation is null or r.repository_head_sha is distinct from p_repository_head_sha or r.workflow_run_id is distinct from p_workflow_run_id
   or c.selected_certification_run_id is distinct from public.m26_current_certification_run_v1(c.selected_candidate_id,c.selected_manifest_id)
   or p_configuration_identity_hash !~ '^[a-f0-9]{64}$' or p_validated_at>clock_timestamp() or p_validated_at<greatest(i.effective_at,k.last_verified_at)
 then raise exception 'Network validation is not bound to current authority' using errcode='42501'; end if;
 insert into public.physical_pilot_network_validation_receipts(id,commissioning_id,commissioning_version,gps_device_id,vehicle_link_id,installation_event_id,credential_id,certification_run_id,repository_authority_generation,repository_head_sha,workflow_run_id,network_configuration_class,configuration_identity_hash,validated_at)
 values(p_receipt_id,c.id,c.version,p_device_id,l.id,i.id,k.id,c.selected_certification_run_id,r.generation,r.repository_head_sha,r.workflow_run_id,p_network_configuration_class,p_configuration_identity_hash,p_validated_at);
 return p_receipt_id;
end $$;

create or replace function public.service_record_physical_pilot_evidence_v1(
 p_receipt_id uuid,p_commissioning_id uuid,p_expected_version bigint,p_candidate_id uuid,p_manifest_id uuid,p_repository_head_sha text,p_workflow_run_id text,
 p_device_id uuid,p_device_identity_hash text,p_installation_receipt_id uuid,p_vehicle_link_id uuid,p_credential_id uuid,p_network_validation_receipt_id uuid,
 p_classification text,p_observation_started_at timestamptz,p_observation_ended_at timestamptz,p_telemetry_count bigint,p_authentication_passed boolean,p_replay_passed boolean,
 p_sequence_outcome text,p_reconnect_outcome text,p_freshness_passed boolean,p_health_passed boolean,p_disposition text,p_reason_codes text[],p_operator_id_hash text
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.physical_pilot_commissioning%rowtype; m public.m24f_adapter_capability_manifests%rowtype; n public.physical_pilot_network_validation_receipts%rowtype;
 l public.gps_device_vehicle_links%rowtype; i public.gps_device_lifecycle_events%rowtype; k public.gps_device_credential_metadata%rowtype;
 r public.physical_pilot_repository_authority%rowtype; e public.physical_pilot_evidence_receipts%rowtype;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service authority required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtext(p_receipt_id::text));
 select * into c from public.physical_pilot_commissioning where id=p_commissioning_id for update;
 select * into m from public.m24f_adapter_capability_manifests where id=p_manifest_id for share;
 select * into n from public.physical_pilot_network_validation_receipts where id=p_network_validation_receipt_id for share;
 select * into l from public.gps_device_vehicle_links where id=p_vehicle_link_id for share;
 select * into i from public.gps_device_lifecycle_events where id=p_installation_receipt_id for share;
 select * into k from public.gps_device_credential_metadata where id=p_credential_id for share;
 select * into r from public.physical_pilot_repository_authority order by generation desc limit 1 for share;
 select * into e from public.physical_pilot_evidence_receipts where id=p_receipt_id;
 if e.id is not null then
  if e.commissioning_id is distinct from p_commissioning_id or e.commissioning_version is distinct from p_expected_version
   or e.selected_candidate_id is distinct from p_candidate_id or e.manifest_id is distinct from p_manifest_id
   or e.repository_head_sha is distinct from p_repository_head_sha or e.workflow_run_id is distinct from p_workflow_run_id
   or e.gps_device_id is distinct from p_device_id or e.device_identity_hash is distinct from p_device_identity_hash
   or e.installation_receipt_id is distinct from p_installation_receipt_id or e.vehicle_link_id is distinct from p_vehicle_link_id
   or e.credential_id is distinct from p_credential_id or e.network_validation_receipt_id is distinct from p_network_validation_receipt_id
   or e.classification is distinct from p_classification or e.observation_started_at is distinct from p_observation_started_at
   or e.observation_ended_at is distinct from p_observation_ended_at or e.telemetry_count is distinct from p_telemetry_count
   or e.authentication_passed is distinct from p_authentication_passed or e.replay_passed is distinct from p_replay_passed
   or e.sequence_outcome is distinct from p_sequence_outcome or e.reconnect_outcome is distinct from p_reconnect_outcome
   or e.freshness_passed is distinct from p_freshness_passed or e.health_passed is distinct from p_health_passed
   or e.disposition is distinct from p_disposition or e.reason_codes is distinct from p_reason_codes or e.operator_id_hash is distinct from p_operator_id_hash
  then raise exception 'Physical evidence receipt replay conflict' using errcode='22023'; end if;
  return e.id;
 end if;
 if c.id is null or c.state<>'commissioning' or c.version is distinct from p_expected_version or c.gps_device_id<>p_device_id or c.selected_candidate_id<>p_candidate_id or c.selected_manifest_id<>p_manifest_id
  or c.selected_certification_run_id is distinct from public.m26_current_certification_run_v1(p_candidate_id,p_manifest_id)
  or not exists(select 1 from public.m24f_adapter_candidates a where a.id=p_candidate_id and a.manifest_id=p_manifest_id and a.decision_status='approved_by_ap' and a.certification_status='passed')
  or r.generation is null or p_repository_head_sha is distinct from r.repository_head_sha or p_workflow_run_id is distinct from r.workflow_run_id
  or p_device_identity_hash is distinct from public.m22_safe_digest(p_device_id::text)
  or l.gps_device_id is distinct from p_device_id or l.effective_until is not null or not l.is_primary
  or i.gps_device_id is distinct from p_device_id or i.vehicle_id is distinct from l.vehicle_id or i.event_type<>'installed' or i.effective_at<l.effective_from
  or exists(select 1 from public.gps_device_lifecycle_events x where x.gps_device_id=p_device_id and x.event_type in ('installed','removed','replaced','lost','stolen','retired','setup_reopened') and (x.effective_at,x.created_at)>(i.effective_at,i.created_at))
  or k.gps_device_id is distinct from p_device_id or k.status<>'active' or k.last_verified_at is null or k.last_verified_at<i.effective_at or k.last_verified_at>p_observation_ended_at or (k.expires_at is not null and k.expires_at<=p_observation_ended_at)
  or n.commissioning_id is distinct from c.id or n.commissioning_version<>c.version or n.gps_device_id<>p_device_id or n.vehicle_link_id<>l.id or n.installation_event_id<>i.id or n.credential_id<>k.id or n.network_configuration_class<>c.network_configuration_class
  or n.certification_run_id<>c.selected_certification_run_id or n.repository_authority_generation<>r.generation or n.repository_head_sha<>r.repository_head_sha or n.workflow_run_id<>r.workflow_run_id
  or n.validated_at>p_observation_started_at or p_classification not in ('synthetic','physical') or p_disposition not in ('pass','partial','blocked')
  or p_sequence_outcome not in ('passed','failed','not_supported') or p_reconnect_outcome not in ('passed','failed','not_supported')
  or (p_sequence_outcome='not_supported' and m.sequence_available) or (p_reconnect_outcome='not_supported' and m.offline_buffering_supported)
  or exists(select 1 from unnest(p_reason_codes) reason where reason is null or char_length(reason) not between 1 and 80 or not public.m24f_is_safe_metadata(reason))
  or p_observation_ended_at<=p_observation_started_at or p_observation_ended_at>clock_timestamp() or p_telemetry_count not between 1 and 10000000 or cardinality(p_reason_codes)>20 or p_operator_id_hash !~ '^[a-f0-9]{64}$'
 then raise exception 'Physical evidence is not bound to current authority' using errcode='42501'; end if;
 insert into public.physical_pilot_evidence_receipts(id,commissioning_id,commissioning_version,selected_candidate_id,certification_run_id,repository_authority_generation,repository_head_sha,workflow_run_id,manifest_id,gps_device_id,device_identity_hash,installation_receipt_id,vehicle_link_id,credential_id,credential_verified_at,network_validation_receipt_id,network_configuration_class,classification,observation_started_at,observation_ended_at,telemetry_count,authentication_passed,replay_passed,sequence_outcome,reconnect_outcome,health_passed,freshness_passed,disposition,reason_codes,operator_id_hash)
 values(p_receipt_id,c.id,c.version,p_candidate_id,c.selected_certification_run_id,r.generation,p_repository_head_sha,p_workflow_run_id,m.id,p_device_id,p_device_identity_hash,i.id,l.id,k.id,k.last_verified_at,n.id,n.network_configuration_class,p_classification,p_observation_started_at,p_observation_ended_at,p_telemetry_count,p_authentication_passed,p_replay_passed,p_sequence_outcome,p_reconnect_outcome,p_health_passed,p_freshness_passed,p_disposition,p_reason_codes,p_operator_id_hash);
 return p_receipt_id;
end $$;

create or replace function public.admin_get_physical_pilot_readiness_v1(p_device_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public stable as $$
declare d public.gps_devices%rowtype; c public.physical_pilot_commissioning%rowtype; a public.m24f_adapter_candidates%rowtype; m public.m24f_adapter_capability_manifests%rowtype;
 l public.gps_device_vehicle_links%rowtype; i public.gps_device_lifecycle_events%rowtype; k public.gps_device_credential_metadata%rowtype; n public.physical_pilot_network_validation_receipts%rowtype;
 r public.physical_pilot_repository_authority%rowtype;
 e_latest public.physical_pilot_evidence_receipts%rowtype;
 v_stage text; v_reasons text[]='{}'; v_physical boolean=false;
begin
 perform public.m20a_require_admin();
 select * into d from public.gps_devices where id=p_device_id;
 select * into c from public.physical_pilot_commissioning where gps_device_id=p_device_id;
 if c.id is not null then select * into a from public.m24f_adapter_candidates where id=c.selected_candidate_id; select * into m from public.m24f_adapter_capability_manifests where id=c.selected_manifest_id; end if;
 select * into l from public.gps_device_vehicle_links where gps_device_id=p_device_id and is_primary and effective_until is null;
 select * into i from public.gps_device_lifecycle_events x where x.gps_device_id=p_device_id and x.event_type='installed'
  and not exists(select 1 from public.gps_device_lifecycle_events y where y.gps_device_id=p_device_id and y.event_type in ('installed','removed','replaced','lost','stolen','retired','setup_reopened') and (y.effective_at,y.created_at)>(x.effective_at,x.created_at))
  order by x.effective_at desc,x.created_at desc limit 1;
 select * into k from public.gps_device_credential_metadata where gps_device_id=p_device_id and status='active' and last_verified_at is not null and (expires_at is null or expires_at>clock_timestamp()) order by last_verified_at desc,id limit 1;
 select * into r from public.physical_pilot_repository_authority order by generation desc limit 1;
 if c.id is not null then
  select * into n from public.physical_pilot_network_validation_receipts x where x.commissioning_id=c.id and x.commissioning_version=c.version and x.gps_device_id=p_device_id
   and x.vehicle_link_id=l.id and x.installation_event_id=i.id and x.credential_id=k.id and x.network_configuration_class=c.network_configuration_class
   and x.certification_run_id=c.selected_certification_run_id and x.repository_authority_generation=r.generation
   and x.repository_head_sha=r.repository_head_sha and x.workflow_run_id=r.workflow_run_id order by x.validated_at desc limit 1;
  select * into e_latest from public.physical_pilot_evidence_receipts e where e.commissioning_id=c.id and e.commissioning_version=c.version order by e.recorded_at desc,e.id desc limit 1;
  select exists(select 1 from public.physical_pilot_evidence_receipts e where e.commissioning_id=c.id and e.commissioning_version=c.version and e.selected_candidate_id=c.selected_candidate_id
   and e.certification_run_id=c.selected_certification_run_id and e.manifest_id=c.selected_manifest_id and e.gps_device_id=p_device_id and e.device_identity_hash=public.m22_safe_digest(p_device_id::text)
   and e.vehicle_link_id=l.id and e.installation_receipt_id=i.id and e.credential_id=k.id and e.credential_verified_at<=k.last_verified_at
   and e.network_validation_receipt_id=n.id and e.network_configuration_class=c.network_configuration_class
   and e.repository_authority_generation=r.generation and e.repository_head_sha=r.repository_head_sha and e.workflow_run_id=r.workflow_run_id
   and e.classification='physical' and e.physical_evidence and e.disposition='pass' and e.authentication_passed and e.replay_passed and e.freshness_passed and e.health_passed
   and e.sequence_outcome<>'failed' and e.reconnect_outcome<>'failed' and (e.sequence_outcome<>'not_supported' or not m.sequence_available) and (e.reconnect_outcome<>'not_supported' or not m.offline_buffering_supported)) into v_physical;
 end if;
 if c.id is null then v_stage:='awaiting_hardware_selection';v_reasons:=array['hardware_not_selected'];
 elsif c.state in ('suspended','decommissioned') or d.status::text is distinct from 'active'
   or d.gps_readiness is distinct from 'ready' or d.gsm_readiness not in ('ready','degraded')
 then v_stage:='blocked';v_reasons:=array['device_not_operational'];
 elsif c.state<>'commissioning' then v_stage:='awaiting_adapter_implementation';v_reasons:=array['selected_candidate_not_approved'];
 elsif public.m26_current_certification_run_v1(c.selected_candidate_id,c.selected_manifest_id) is distinct from c.selected_certification_run_id then v_stage:='awaiting_adapter_implementation';v_reasons:=array['adapter_not_certified'];
 elsif d.id is null then v_stage:='awaiting_device_registration';v_reasons:=array['device_not_registered'];
 elsif k.id is null then v_stage:='awaiting_credentials';v_reasons:=array['credential_not_active'];
 elsif l.id is null or i.id is null or i.event_type<>'installed' or i.vehicle_id is distinct from l.vehicle_id or i.effective_at<l.effective_from or d.installation_state<>'installed' then v_stage:='awaiting_installation';v_reasons:=array['installation_not_recorded'];
 elsif n.id is null then v_stage:='awaiting_network_validation';v_reasons:=array['network_not_validated'];
 elsif not v_physical and e_latest.id is not null then v_stage:='physical_evidence_required';v_reasons:=array['physical_evidence_'||e_latest.disposition,case when e_latest.classification='synthetic' then 'synthetic_evidence_non_ready' else 'physical_outcomes_not_passed' end];
 elsif not v_physical then v_stage:='physical_evidence_required';v_reasons:=array['physical_evidence_missing'];
 else v_stage:='ready_for_controlled_physical_pilot'; end if;
 return jsonb_build_object('contractVersion','m26-readiness-v1','deviceId',p_device_id,'stage',v_stage,'blockingReasons',v_reasons,
  'commissioning',case when c.id is null then null else jsonb_build_object('id',c.id,'state',c.state,'version',c.version,'candidateId',c.selected_candidate_id,'manifestId',c.selected_manifest_id,'certificationRunId',c.selected_certification_run_id,'networkConfigurationClass',c.network_configuration_class,'expectedHeartbeatSeconds',c.expected_heartbeat_seconds) end,
  'selectedAdapter',case when c.id is null then null else jsonb_build_object('candidateId',c.selected_candidate_id,'manifestId',c.selected_manifest_id,'certificationRunId',c.selected_certification_run_id,'adapterId',m.adapter_id,'adapterVersion',m.adapter_version) end,
  'credentialReady',k.id is not null,'installationReady',l.id is not null and i.event_type='installed' and i.vehicle_id=l.vehicle_id and i.effective_at>=l.effective_from and d.installation_state='installed',
  'networkReady',n.id is not null,'physicalEvidence',v_physical,'derivedAt',clock_timestamp());
end $$;

alter table public.physical_pilot_commissioning enable row level security;
alter table public.physical_pilot_commissioning_receipts enable row level security;
alter table public.physical_pilot_network_validation_receipts enable row level security;
alter table public.physical_pilot_evidence_receipts enable row level security;
alter table public.physical_pilot_repository_authority enable row level security;
revoke all on public.physical_pilot_commissioning,public.physical_pilot_commissioning_receipts,public.physical_pilot_network_validation_receipts,public.physical_pilot_evidence_receipts from public,anon,authenticated;
revoke all on public.physical_pilot_repository_authority from public,anon,authenticated;
create policy "M26 admin commissioning reads" on public.physical_pilot_commissioning for select to authenticated using(public.is_admin());
create policy "M26 admin transition receipt reads" on public.physical_pilot_commissioning_receipts for select to authenticated using(public.is_admin());
create policy "M26 admin network receipt reads" on public.physical_pilot_network_validation_receipts for select to authenticated using(public.is_admin());
create policy "M26 admin evidence receipt reads" on public.physical_pilot_evidence_receipts for select to authenticated using(public.is_admin());
grant select on public.physical_pilot_commissioning,public.physical_pilot_commissioning_receipts,public.physical_pilot_network_validation_receipts,public.physical_pilot_evidence_receipts to authenticated;
revoke all on function public.m26_current_certification_run_v1(uuid,uuid),public.m26_validate_reason_codes_v1() from public,anon,authenticated;
revoke all on function public.service_rotate_physical_pilot_repository_authority_v1(text,text) from public,anon,authenticated;
grant execute on function public.service_rotate_physical_pilot_repository_authority_v1(text,text) to service_role;
revoke all on function public.admin_transition_physical_pilot_commissioning_v1(uuid,uuid,uuid,bigint,uuid,text,text,text,integer),public.admin_get_physical_pilot_readiness_v1(uuid) from public,anon;
grant execute on function public.admin_transition_physical_pilot_commissioning_v1(uuid,uuid,uuid,bigint,uuid,text,text,text,integer),public.admin_get_physical_pilot_readiness_v1(uuid) to authenticated;
revoke all on function public.service_record_physical_pilot_network_validation_v1(uuid,uuid,bigint,uuid,uuid,uuid,uuid,text,text,timestamptz,text,text),public.service_record_physical_pilot_evidence_v1(uuid,uuid,bigint,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,boolean,boolean,text,text,boolean,boolean,text,text[],text) from public,anon,authenticated;
grant execute on function public.service_record_physical_pilot_network_validation_v1(uuid,uuid,bigint,uuid,uuid,uuid,uuid,text,text,timestamptz,text,text),public.service_record_physical_pilot_evidence_v1(uuid,uuid,bigint,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,boolean,boolean,text,text,boolean,boolean,text,text[],text) to service_role;
