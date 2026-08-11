-- M26 pre-device commissioning authority. This is a software-only gate: it cannot
-- create physical evidence, choose hardware, or expose credentials/payloads.

create table public.physical_pilot_commissioning (
  id uuid primary key default gen_random_uuid(),
  gps_device_id uuid not null unique references public.gps_devices(id) on delete restrict,
  selected_candidate_id uuid not null references public.m24f_adapter_candidates(id) on delete restrict,
  selected_manifest_id uuid not null references public.m24f_adapter_capability_manifests(id) on delete restrict,
  state text not null default 'draft' check (state in ('draft','commissioning','suspended','decommissioned')),
  network_configuration_class text,
  network_validated_at timestamptz,
  expected_heartbeat_seconds integer check (expected_heartbeat_seconds between 10 and 86400),
  version bigint not null default 1 check (version > 0),
  last_transition_key uuid not null,
  created_by_admin uuid not null references public.user_profiles(auth_user_id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_by_admin uuid not null references public.user_profiles(auth_user_id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  check (network_configuration_class is null or char_length(network_configuration_class) between 1 and 80),
  check (network_validated_at is null or network_configuration_class is not null)
);

create table public.physical_pilot_commissioning_receipts (
  id uuid primary key default gen_random_uuid(),
  commissioning_id uuid not null references public.physical_pilot_commissioning(id) on delete restrict,
  transition_key uuid not null unique,
  from_state text,
  to_state text not null,
  resulting_version bigint not null,
  reason_code text not null check (char_length(reason_code) between 1 and 80),
  actor_id uuid not null references public.user_profiles(auth_user_id) on delete restrict,
  recorded_at timestamptz not null default clock_timestamp(),
  safe_receipt jsonb not null,
  check (safe_receipt = safe_receipt - array['secret','token','credential','latitude','longitude','raw_payload','payload'])
);

create table public.physical_pilot_evidence_receipts (
  id uuid primary key,
  commissioning_id uuid not null references public.physical_pilot_commissioning(id) on delete restrict,
  repository_head_sha text not null check (repository_head_sha ~ '^[a-f0-9]{40,64}$'),
  workflow_run_id text not null check (char_length(workflow_run_id) between 1 and 160),
  manifest_id uuid not null references public.m24f_adapter_capability_manifests(id) on delete restrict,
  device_identity_hash text not null check (device_identity_hash ~ '^[a-f0-9]{64}$'),
  installation_receipt_id uuid not null,
  vehicle_link_id uuid not null references public.gps_device_vehicle_links(id) on delete restrict,
  network_configuration_class text not null,
  classification text not null check (classification in ('synthetic','physical')),
  physical_evidence boolean generated always as (classification = 'physical') stored,
  observation_started_at timestamptz not null,
  observation_ended_at timestamptz not null,
  telemetry_count bigint not null check (telemetry_count > 0),
  authentication_passed boolean not null,
  replay_passed boolean not null,
  sequence_outcome text not null check (sequence_outcome in ('passed','failed','not_supported')),
  reconnect_outcome text not null check (reconnect_outcome in ('passed','failed','not_supported')),
  health_passed boolean not null,
  freshness_passed boolean not null,
  disposition text not null check (disposition in ('pass','partial','blocked')),
  reason_codes text[] not null default '{}',
  operator_id_hash text not null check (operator_id_hash ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz not null default clock_timestamp(),
  check (observation_ended_at > observation_started_at),
  check (classification <> 'physical' or (disposition = 'pass' and authentication_passed and replay_passed and health_passed and freshness_passed)),
  check (cardinality(reason_codes) <= 20)
);

create or replace function public.m26_reject_immutable_change()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'Readiness receipts are immutable' using errcode = '42501';
end;
$$;
create trigger physical_pilot_commissioning_receipts_immutable before update or delete on public.physical_pilot_commissioning_receipts for each row execute function public.m26_reject_immutable_change();
create trigger physical_pilot_evidence_receipts_immutable before update or delete on public.physical_pilot_evidence_receipts for each row execute function public.m26_reject_immutable_change();

create or replace function public.admin_transition_physical_pilot_commissioning_v1(
  p_device_id uuid, p_candidate_id uuid, p_manifest_id uuid, p_expected_version bigint,
  p_transition_key uuid, p_new_state text, p_reason_code text,
  p_network_configuration_class text default null, p_network_validated_at timestamptz default null,
  p_expected_heartbeat_seconds integer default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_actor uuid; v_row public.physical_pilot_commissioning%rowtype; v_candidate public.m24f_adapter_candidates%rowtype; v_manifest public.m24f_adapter_capability_manifests%rowtype;
begin
  v_actor := public.require_admin();
  if p_new_state not in ('draft','commissioning','suspended','decommissioned') or p_reason_code !~ '^[a-z0-9_]{1,80}$' then raise exception 'Invalid commissioning transition' using errcode='22023'; end if;
  select * into v_candidate from public.m24f_adapter_candidates where id=p_candidate_id;
  select * into v_manifest from public.m24f_adapter_capability_manifests where id=p_manifest_id;
  if v_candidate.id is null or v_candidate.decision_status <> 'approved_by_ap' or v_candidate.certification_status <> 'passed' or v_candidate.manifest_id is distinct from p_manifest_id then raise exception 'Selected adapter is not approved and certified' using errcode='42501'; end if;
  if v_manifest.id is null then raise exception 'Selected manifest not found' using errcode='22023'; end if;
  select * into v_row from public.physical_pilot_commissioning where gps_device_id=p_device_id for update;
  if v_row.id is null then
    if p_expected_version <> 0 or p_new_state <> 'draft' then raise exception 'Stale commissioning version' using errcode='40001'; end if;
    insert into public.physical_pilot_commissioning(gps_device_id,selected_candidate_id,selected_manifest_id,state,network_configuration_class,network_validated_at,expected_heartbeat_seconds,last_transition_key,created_by_admin,updated_by_admin)
    values(p_device_id,p_candidate_id,p_manifest_id,p_new_state,p_network_configuration_class,p_network_validated_at,p_expected_heartbeat_seconds,p_transition_key,v_actor,v_actor) returning * into v_row;
  else
    if v_row.last_transition_key=p_transition_key then return jsonb_build_object('receipt_id',(select id from public.physical_pilot_commissioning_receipts where transition_key=p_transition_key),'version',v_row.version,'replayed',true); end if;
    if v_row.version<>p_expected_version then raise exception 'Stale commissioning version' using errcode='40001'; end if;
    if v_row.state='decommissioned' or (v_row.state='suspended' and p_new_state not in ('draft','decommissioned')) then raise exception 'Blocked commissioning transition' using errcode='42501'; end if;
    update public.physical_pilot_commissioning set state=p_new_state,selected_candidate_id=p_candidate_id,selected_manifest_id=p_manifest_id,network_configuration_class=p_network_configuration_class,network_validated_at=p_network_validated_at,expected_heartbeat_seconds=p_expected_heartbeat_seconds,version=version+1,last_transition_key=p_transition_key,updated_by_admin=v_actor,updated_at=clock_timestamp() where id=v_row.id returning * into v_row;
  end if;
  insert into public.physical_pilot_commissioning_receipts(commissioning_id,transition_key,from_state,to_state,resulting_version,reason_code,actor_id,safe_receipt)
  values(v_row.id,p_transition_key,null,p_new_state,v_row.version,p_reason_code,v_actor,jsonb_build_object('contract_version','m26-readiness-v1','device_id',p_device_id,'candidate_id',p_candidate_id,'manifest_id',p_manifest_id,'state',p_new_state,'version',v_row.version)) returning id into p_device_id;
  return jsonb_build_object('receipt_id',p_device_id,'version',v_row.version,'replayed',false);
end;
$$;

create or replace function public.admin_get_physical_pilot_readiness_v1(p_device_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public stable as $$
declare v_device public.gps_devices%rowtype; v_comm public.physical_pilot_commissioning%rowtype; v_candidate public.m24f_adapter_candidates%rowtype; v_manifest public.m24f_adapter_capability_manifests%rowtype; v_stage text; v_reasons text[]='{}'; v_credential boolean=false; v_install boolean=false; v_link boolean=false; v_physical boolean=false;
begin
  perform public.require_admin();
  select * into v_device from public.gps_devices where id=p_device_id;
  select * into v_comm from public.physical_pilot_commissioning where gps_device_id=p_device_id;
  if v_comm.id is not null then select * into v_candidate from public.m24f_adapter_candidates where id=v_comm.selected_candidate_id; select * into v_manifest from public.m24f_adapter_capability_manifests where id=v_comm.selected_manifest_id; end if;
  select exists(select 1 from public.gps_device_credential_metadata where gps_device_id=p_device_id and status='active' and (expires_at is null or expires_at>clock_timestamp())) into v_credential;
  select exists(select 1 from public.gps_device_lifecycle_events where gps_device_id=p_device_id and event_type='installed') into v_install;
  select exists(select 1 from public.gps_device_vehicle_links where gps_device_id=p_device_id and effective_until is null) into v_link;
  select exists(select 1 from public.physical_pilot_evidence_receipts e where e.commissioning_id=v_comm.id and e.classification='physical' and e.disposition='pass' and e.repository_head_sha=current_setting('app.repository_head_sha',true) and e.manifest_id=v_comm.selected_manifest_id and e.network_configuration_class=v_comm.network_configuration_class) into v_physical;
  if v_comm.id is null then v_stage:='awaiting_hardware_selection'; v_reasons:=array['hardware_not_selected'];
  elsif v_comm.state in ('suspended','decommissioned') or v_device.status in ('suspended','retired','removed','not_working') then v_stage:='blocked'; v_reasons:=array['device_not_operational'];
  elsif v_candidate.decision_status<>'approved_by_ap' or v_candidate.certification_status<>'passed' or v_candidate.manifest_id is distinct from v_comm.selected_manifest_id then v_stage:='awaiting_adapter_implementation'; v_reasons:=array['adapter_not_certified'];
  elsif v_device.id is null then v_stage:='awaiting_device_registration'; v_reasons:=array['device_not_registered'];
  elsif not v_credential then v_stage:='awaiting_credentials'; v_reasons:=array['credential_not_active'];
  elsif not v_link or not v_install then v_stage:='awaiting_installation'; v_reasons:=array_remove(array[case when not v_link then 'vehicle_link_missing' end,case when not v_install then 'installation_not_recorded' end],null);
  elsif v_comm.network_validated_at is null then v_stage:='awaiting_network_validation'; v_reasons:=array['network_not_validated'];
  elsif not v_physical then v_stage:='awaiting_real_telemetry'; v_reasons:=array['physical_evidence_missing'];
  else v_stage:='ready_for_controlled_physical_pilot'; end if;
  return jsonb_build_object('contractVersion','m26-readiness-v1','deviceId',p_device_id,'stage',v_stage,'blockingReasons',v_reasons,'selectedAdapter',case when v_comm.id is null then null else jsonb_build_object('candidateId',v_comm.selected_candidate_id,'adapterId',v_manifest.adapter_id,'adapterVersion',v_manifest.adapter_version) end,'credentialReady',v_credential,'installationReady',v_install and v_link,'networkReady',v_comm.network_validated_at is not null,'physicalEvidence',v_physical,'derivedAt',clock_timestamp());
end;
$$;

alter table public.physical_pilot_commissioning enable row level security;
alter table public.physical_pilot_commissioning_receipts enable row level security;
alter table public.physical_pilot_evidence_receipts enable row level security;
revoke all on public.physical_pilot_commissioning, public.physical_pilot_commissioning_receipts, public.physical_pilot_evidence_receipts from public, anon, authenticated;
create policy "M26 admin commissioning reads" on public.physical_pilot_commissioning for select to authenticated using (public.is_admin());
create policy "M26 admin commissioning receipt reads" on public.physical_pilot_commissioning_receipts for select to authenticated using (public.is_admin());
create policy "M26 admin evidence receipt reads" on public.physical_pilot_evidence_receipts for select to authenticated using (public.is_admin());
grant select on public.physical_pilot_commissioning, public.physical_pilot_commissioning_receipts, public.physical_pilot_evidence_receipts to authenticated;
revoke all on function public.admin_transition_physical_pilot_commissioning_v1(uuid,uuid,uuid,bigint,uuid,text,text,text,timestamptz,integer), public.admin_get_physical_pilot_readiness_v1(uuid) from public, anon;
grant execute on function public.admin_transition_physical_pilot_commissioning_v1(uuid,uuid,uuid,bigint,uuid,text,text,text,timestamptz,integer), public.admin_get_physical_pilot_readiness_v1(uuid) to authenticated;

