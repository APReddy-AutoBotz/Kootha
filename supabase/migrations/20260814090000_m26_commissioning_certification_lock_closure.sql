-- M26 commissioning/certification serialization closure.
-- Exact transition replay remains receipt-first and independent of mutable authority.
-- Genuinely new commissioning mutations acquire device -> repository authority
-- before reading candidate/manifest/current certification and mutating commissioning.

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
  perform pg_advisory_xact_lock(hashtext('m26_repository_authority'));

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
