-- M26 exact-head review closure.
-- Physical-run chronology, not receipt arrival order, is the readiness authority.
-- Receipt replay also preserves the distinction between an explicitly omitted
-- selector (JSON null) and the effective retained commissioning value.

create or replace function public.admin_transition_physical_pilot_commissioning_v1(
  p_device_id uuid,p_candidate_id uuid,p_manifest_id uuid,p_expected_version bigint,p_transition_key uuid,p_new_state text,p_reason_code text,
  p_network_configuration_class text default null,p_expected_heartbeat_seconds integer default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_actor uuid;
  v_row public.physical_pilot_commissioning%rowtype;
  v_candidate public.m24f_adapter_candidates%rowtype;
  v_manifest public.m24f_adapter_capability_manifests%rowtype;
  v_certification_run_id uuid;
  v_from text;
  v_receipt public.physical_pilot_commissioning_receipts%rowtype;
  v_effective_network_class text;
  v_effective_heartbeat integer;
begin
  v_actor:=public.m20a_require_admin();
  perform pg_advisory_xact_lock(hashtext(p_transition_key::text));

  if p_expected_version is null then
    raise exception 'Expected commissioning version is required' using errcode='22023';
  end if;
  if p_transition_key is null then
    raise exception 'Transition key is required' using errcode='22023';
  end if;
  if p_new_state not in ('draft','commissioning','suspended','decommissioned')
     or p_reason_code !~ '^[a-z0-9_]{1,80}$' then
    raise exception 'Invalid commissioning transition' using errcode='22023';
  end if;
  if p_network_configuration_class is not null and (
      char_length(p_network_configuration_class) not between 1 and 80
      or not public.m24f_is_safe_metadata(p_network_configuration_class)
  ) then
    raise exception 'Unsafe network configuration class' using errcode='22023';
  end if;
  if p_expected_heartbeat_seconds is not null
     and p_expected_heartbeat_seconds not between 10 and 86400 then
    raise exception 'Invalid expected heartbeat' using errcode='22023';
  end if;

  -- New receipts always contain the requested_* keys, even when the value is
  -- JSON null. Key existence therefore distinguishes an omitted state-only
  -- selector from the retained effective value. Older receipts did not have
  -- requested_* keys and deliberately fall back to their original selector.
  select * into v_receipt
  from public.physical_pilot_commissioning_receipts
  where transition_key=p_transition_key;
  if v_receipt.id is not null then
    if v_receipt.expected_version is distinct from p_expected_version
       or v_receipt.to_state is distinct from p_new_state
       or v_receipt.reason_code is distinct from p_reason_code
       or v_receipt.safe_receipt->>'device_id' is distinct from p_device_id::text
       or v_receipt.safe_receipt->>'candidate_id' is distinct from p_candidate_id::text
       or v_receipt.safe_receipt->>'manifest_id' is distinct from p_manifest_id::text
       or (
         case
           when v_receipt.safe_receipt ? 'requested_network_configuration_class'
             then v_receipt.safe_receipt->>'requested_network_configuration_class'
           else v_receipt.safe_receipt->>'network_configuration_class'
         end
       ) is distinct from p_network_configuration_class
       or (
         case
           when v_receipt.safe_receipt ? 'requested_expected_heartbeat_seconds'
             then v_receipt.safe_receipt->>'requested_expected_heartbeat_seconds'
           else v_receipt.safe_receipt->>'expected_heartbeat_seconds'
         end
       ) is distinct from p_expected_heartbeat_seconds::text
    then
      raise exception 'Transition key request mismatch' using errcode='22023';
    end if;
    return jsonb_build_object(
      'receipt_id',v_receipt.id,
      'version',v_receipt.resulting_version,
      'replayed',true
    );
  end if;

  -- Exact receipt replay remains independent of mutable authority. Only a real
  -- commissioning mutation enters the shared per-device M26 serialization law.
  perform public.m26_lock_device_authority_v1(p_device_id);

  select * into v_candidate from public.m24f_adapter_candidates where id=p_candidate_id;
  select * into v_manifest from public.m24f_adapter_capability_manifests where id=p_manifest_id;
  v_certification_run_id:=public.m26_current_certification_run_v1(p_candidate_id,p_manifest_id);
  if v_candidate.id is null or v_manifest.id is null or v_certification_run_id is null then
    raise exception 'Selected adapter is not approved by the current successful certification authority' using errcode='42501';
  end if;

  select * into v_row
  from public.physical_pilot_commissioning
  where gps_device_id=p_device_id
  for update;

  if v_row.id is null then
    if p_expected_version is distinct from 0 or p_new_state<>'draft' then
      raise exception 'Stale commissioning version' using errcode='40001';
    end if;
    v_from:=null;
    v_effective_network_class:=p_network_configuration_class;
    v_effective_heartbeat:=p_expected_heartbeat_seconds;
    insert into public.physical_pilot_commissioning(
      gps_device_id,selected_candidate_id,selected_manifest_id,selected_certification_run_id,
      state,network_configuration_class,expected_heartbeat_seconds,last_transition_key,
      created_by_admin,updated_by_admin
    ) values(
      p_device_id,p_candidate_id,p_manifest_id,v_certification_run_id,
      p_new_state,v_effective_network_class,v_effective_heartbeat,p_transition_key,
      v_actor,v_actor
    ) returning * into v_row;
  else
    if v_row.version is distinct from p_expected_version then
      raise exception 'Stale commissioning version' using errcode='40001';
    end if;
    if v_row.state='decommissioned'
       or (v_row.state='suspended' and p_new_state not in ('draft','decommissioned')) then
      raise exception 'Blocked commissioning transition' using errcode='42501';
    end if;

    v_from:=v_row.state;
    if v_row.state='draft' and p_new_state='draft' then
      v_effective_network_class:=p_network_configuration_class;
      v_effective_heartbeat:=p_expected_heartbeat_seconds;
    else
      v_effective_network_class:=v_row.network_configuration_class;
      v_effective_heartbeat:=v_row.expected_heartbeat_seconds;
    end if;

    update public.physical_pilot_commissioning
    set state=p_new_state,
        selected_candidate_id=p_candidate_id,
        selected_manifest_id=p_manifest_id,
        selected_certification_run_id=v_certification_run_id,
        network_configuration_class=v_effective_network_class,
        expected_heartbeat_seconds=v_effective_heartbeat,
        version=version+1,
        last_transition_key=p_transition_key,
        updated_by_admin=v_actor,
        updated_at=clock_timestamp()
    where id=v_row.id
    returning * into v_row;
  end if;

  insert into public.physical_pilot_commissioning_receipts(
    commissioning_id,transition_key,from_state,to_state,expected_version,
    resulting_version,reason_code,actor_id,safe_receipt
  ) values(
    v_row.id,p_transition_key,v_from,p_new_state,p_expected_version,
    v_row.version,p_reason_code,v_actor,
    jsonb_build_object(
      'contract_version','m26-readiness-v1',
      'device_id',p_device_id,
      'candidate_id',p_candidate_id,
      'manifest_id',p_manifest_id,
      'state',p_new_state,
      'requested_network_configuration_class',p_network_configuration_class,
      'requested_expected_heartbeat_seconds',p_expected_heartbeat_seconds::text,
      'network_configuration_class',v_effective_network_class,
      'expected_heartbeat_seconds',v_effective_heartbeat::text,
      'expected_version',p_expected_version,
      'certification_run_id',v_certification_run_id,
      'version',v_row.version
    )
  ) returning * into v_receipt;

  return jsonb_build_object(
    'receipt_id',v_receipt.id,
    'version',v_row.version,
    'replayed',false
  );
end $$;

create or replace function public.admin_get_physical_pilot_readiness_v1(p_device_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public volatile as $$
declare
 d public.gps_devices%rowtype;
 c public.physical_pilot_commissioning%rowtype;
 a public.m24f_adapter_candidates%rowtype;
 m public.m24f_adapter_capability_manifests%rowtype;
 l public.gps_device_vehicle_links%rowtype;
 i public.gps_device_lifecycle_events%rowtype;
 k public.gps_device_credential_metadata%rowtype;
 n public.physical_pilot_network_validation_receipts%rowtype;
 r public.physical_pilot_repository_authority%rowtype;
 e_latest public.physical_pilot_evidence_receipts%rowtype;
 v_stage text;
 v_reasons text[]='{}';
 v_physical boolean=false;
begin
 perform public.m20a_require_admin();
 perform public.m26_lock_device_authority_v1(p_device_id);
 -- Repository rotation uses this same lock. Acquiring it before the latest
 -- generation read prevents a committed rotation from being missed by a ready response.
 perform pg_advisory_xact_lock(hashtext('m26_repository_authority'));

 select * into d from public.gps_devices where id=p_device_id;
 select * into c from public.physical_pilot_commissioning where gps_device_id=p_device_id;
 if c.id is not null then
  select * into a from public.m24f_adapter_candidates where id=c.selected_candidate_id;
  select * into m from public.m24f_adapter_capability_manifests where id=c.selected_manifest_id;
 end if;
 select * into l
 from public.gps_device_vehicle_links
 where gps_device_id=p_device_id and is_primary and effective_until is null;
 select * into i
 from public.gps_device_lifecycle_events x
 where x.gps_device_id=p_device_id and x.event_type='installed'
   and not exists(
    select 1 from public.gps_device_lifecycle_events y
    where y.gps_device_id=p_device_id
      and y.event_type in ('installed','removed','replaced','lost','stolen','retired','setup_reopened')
      and (y.effective_at,y.created_at)>(x.effective_at,x.created_at)
   )
 order by x.effective_at desc,x.created_at desc limit 1;
 select * into k
 from public.gps_device_credential_metadata
 where gps_device_id=p_device_id
   and status='active'
   and last_verified_at is not null
   and (expires_at is null or expires_at>clock_timestamp())
 order by last_verified_at desc,id limit 1;
 select * into r
 from public.physical_pilot_repository_authority
 order by generation desc limit 1;

 if c.id is not null then
  select * into n
  from public.physical_pilot_network_validation_receipts x
  where x.commissioning_id=c.id
    and x.commissioning_version=c.version
    and x.gps_device_id=p_device_id
    and x.vehicle_link_id=l.id
    and x.installation_event_id=i.id
    and x.credential_id=k.id
    and x.network_configuration_class=c.network_configuration_class
    and x.certification_run_id=c.selected_certification_run_id
    and x.repository_authority_generation=r.generation
    and x.repository_head_sha=r.repository_head_sha
    and x.workflow_run_id=r.workflow_run_id
  order by x.validated_at desc limit 1;

  -- Physical observation chronology is authoritative. Receipt arrival order is
  -- only a deterministic tie-breaker, so delayed submission of an older run can
  -- never supersede a newer physical failure/pass.
  select * into e_latest
  from public.physical_pilot_evidence_receipts e
  where e.commissioning_id=c.id
    and e.commissioning_version=c.version
    and e.selected_candidate_id=c.selected_candidate_id
    and e.certification_run_id=c.selected_certification_run_id
    and e.manifest_id=c.selected_manifest_id
    and e.gps_device_id=p_device_id
    and e.device_identity_hash=public.m22_safe_digest(p_device_id::text)
    and e.vehicle_link_id=l.id
    and e.installation_receipt_id=i.id
    and e.credential_id=k.id
    and e.credential_verified_at<=k.last_verified_at
    and e.network_validation_receipt_id=n.id
    and e.network_configuration_class=c.network_configuration_class
    and e.repository_authority_generation=r.generation
    and e.repository_head_sha=r.repository_head_sha
    and e.workflow_run_id=r.workflow_run_id
    and e.classification='physical'
  order by e.observation_ended_at desc,
           e.observation_started_at desc,
           e.recorded_at desc,
           e.id desc
  limit 1;

  if e_latest.id is null then
   -- Synthetic evidence is retained for operator visibility but never used as
   -- physical readiness authority. Keep its display selection chronological too.
   select * into e_latest
   from public.physical_pilot_evidence_receipts e
   where e.commissioning_id=c.id
     and e.commissioning_version=c.version
     and e.selected_candidate_id=c.selected_candidate_id
     and e.certification_run_id=c.selected_certification_run_id
     and e.manifest_id=c.selected_manifest_id
     and e.gps_device_id=p_device_id
     and e.vehicle_link_id=l.id
     and e.installation_receipt_id=i.id
     and e.credential_id=k.id
     and e.network_validation_receipt_id=n.id
     and e.repository_authority_generation=r.generation
     and e.repository_head_sha=r.repository_head_sha
     and e.workflow_run_id=r.workflow_run_id
   order by e.observation_ended_at desc,
            e.observation_started_at desc,
            e.recorded_at desc,
            e.id desc
   limit 1;
  end if;

  if e_latest.id is not null
     and e_latest.classification='physical'
     and e_latest.physical_evidence
     and e_latest.disposition='pass'
     and e_latest.telemetry_count>0
     and e_latest.telemetry_count=(
       select count(*)
       from public.physical_pilot_evidence_telemetry_receipts et
       join public.telemetry_receipts t on t.id=et.telemetry_receipt_id
       where et.evidence_receipt_id=e_latest.id
         and not t.synthetic
         and t.gps_device_id=e_latest.gps_device_id
         and t.credential_id=e_latest.credential_id
         and t.gps_device_vehicle_link_id=e_latest.vehicle_link_id
         and t.adapter_id=m.adapter_id
         and t.adapter_version=m.adapter_version
         and public.m26_is_authoritative_observation_v1(
           t.received_at,t.captured_at,n.validated_at,
           e_latest.observation_started_at,e_latest.observation_ended_at
         )
     )
     and e_latest.authentication_passed
     and e_latest.replay_passed
     and not public.m26_has_authoritative_failure_v1(
       e_latest.gps_device_id,e_latest.credential_id,
       m.adapter_id,m.adapter_version,e_latest.observation_started_at
     )
     and e_latest.freshness_passed
     and e_latest.health_passed
     and e_latest.sequence_outcome<>'failed'
     and e_latest.reconnect_outcome<>'failed'
     and (e_latest.sequence_outcome<>'not_supported' or not m.sequence_available)
     and (e_latest.reconnect_outcome<>'not_supported' or not m.offline_buffering_supported)
  then
   v_physical:=true;
  end if;
 end if;

 if c.id is null then
  v_stage:='awaiting_hardware_selection';
  v_reasons:=array['hardware_not_selected'];
 elsif c.state in ('suspended','decommissioned')
   or d.status::text is distinct from 'active'
   or d.gps_readiness is distinct from 'ready'
   or d.gsm_readiness not in ('ready','degraded') then
  v_stage:='blocked';
  v_reasons:=array['device_not_operational'];
 elsif c.state<>'commissioning' then
  v_stage:='awaiting_adapter_implementation';
  v_reasons:=array['selected_candidate_not_approved'];
 elsif public.m26_current_certification_run_v1(c.selected_candidate_id,c.selected_manifest_id)
       is distinct from c.selected_certification_run_id then
  v_stage:='awaiting_adapter_implementation';
  v_reasons:=array['adapter_not_certified'];
 elsif d.id is null then
  v_stage:='awaiting_device_registration';
  v_reasons:=array['device_not_registered'];
 elsif k.id is null then
  v_stage:='awaiting_credentials';
  v_reasons:=array['credential_not_active'];
 elsif l.id is null or i.id is null or i.event_type<>'installed'
   or i.vehicle_id is distinct from l.vehicle_id
   or i.effective_at<l.effective_from
   or d.installation_state<>'installed' then
  v_stage:='awaiting_installation';
  v_reasons:=array['installation_not_recorded'];
 elsif n.id is null then
  v_stage:='awaiting_network_validation';
  v_reasons:=array['network_not_validated'];
 elsif not v_physical and e_latest.id is not null then
  v_stage:='physical_evidence_required';
  v_reasons:=array[
    'physical_evidence_'||e_latest.disposition,
    case when e_latest.classification='synthetic'
      then 'synthetic_evidence_non_ready'
      else 'physical_outcomes_not_passed'
    end
  ];
 elsif not v_physical then
  v_stage:='physical_evidence_required';
  v_reasons:=array['physical_evidence_missing'];
 else
  v_stage:='ready_for_controlled_physical_pilot';
 end if;

 return jsonb_build_object(
  'contractVersion','m26-readiness-v1',
  'deviceId',p_device_id,
  'stage',v_stage,
  'blockingReasons',v_reasons,
  'commissioning',case when c.id is null then null else jsonb_build_object(
    'id',c.id,'state',c.state,'version',c.version,
    'candidateId',c.selected_candidate_id,'manifestId',c.selected_manifest_id,
    'certificationRunId',c.selected_certification_run_id,
    'networkConfigurationClass',c.network_configuration_class,
    'expectedHeartbeatSeconds',c.expected_heartbeat_seconds
  ) end,
  'selectedAdapter',case when c.id is null then null else jsonb_build_object(
    'candidateId',c.selected_candidate_id,'manifestId',c.selected_manifest_id,
    'certificationRunId',c.selected_certification_run_id,
    'adapterId',m.adapter_id,'adapterVersion',m.adapter_version
  ) end,
  'credentialReady',k.id is not null,
  'installationReady',l.id is not null and i.event_type='installed'
    and i.vehicle_id=l.vehicle_id and i.effective_at>=l.effective_from
    and d.installation_state='installed',
  'networkReady',n.id is not null,
  'physicalEvidence',v_physical,
  'derivedAt',clock_timestamp()
 );
end $$;

revoke all on function public.admin_transition_physical_pilot_commissioning_v1(uuid,uuid,uuid,bigint,uuid,text,text,text,integer)
  from public,anon;
grant execute on function public.admin_transition_physical_pilot_commissioning_v1(uuid,uuid,uuid,bigint,uuid,text,text,text,integer)
  to authenticated;
revoke all on function public.admin_get_physical_pilot_readiness_v1(uuid)
  from public,anon;
grant execute on function public.admin_get_physical_pilot_readiness_v1(uuid)
  to authenticated;
