-- M26 evidence repository/certification serialization closure.
-- Exact response-loss replay remains receipt-first. New evidence then follows
-- receipt identity -> device -> repository/certification -> row authority -> insert.

create or replace function public.service_record_physical_pilot_evidence_v1(
 p_receipt_id uuid,p_commissioning_id uuid,p_expected_version bigint,p_candidate_id uuid,p_manifest_id uuid,p_repository_head_sha text,p_workflow_run_id text,
 p_device_id uuid,p_device_identity_hash text,p_installation_receipt_id uuid,p_vehicle_link_id uuid,p_credential_id uuid,p_network_validation_receipt_id uuid,
 p_classification text,p_observation_started_at timestamptz,p_observation_ended_at timestamptz,p_telemetry_count bigint,p_authentication_passed boolean,p_replay_passed boolean,
 p_sequence_outcome text,p_reconnect_outcome text,p_freshness_passed boolean,p_health_passed boolean,p_disposition text,p_reason_codes text[],p_operator_id_hash text
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 c public.physical_pilot_commissioning%rowtype;
 m public.m24f_adapter_capability_manifests%rowtype;
 n public.physical_pilot_network_validation_receipts%rowtype;
 l public.gps_device_vehicle_links%rowtype;
 i public.gps_device_lifecycle_events%rowtype;
 k public.gps_device_credential_metadata%rowtype;
 r public.physical_pilot_repository_authority%rowtype;
 e public.physical_pilot_evidence_receipts%rowtype;
 v_authoritative_telemetry_count bigint;
 v_sequence_proven boolean;
 v_reconnect_proven boolean;
 v_failure_free boolean;
begin
 if coalesce(auth.role(),'')<>'service_role' then
   raise exception 'Service authority required' using errcode='42501';
 end if;
 if p_receipt_id is null or p_observation_started_at is null or p_observation_ended_at is null
    or p_observation_ended_at<=p_observation_started_at
    or p_observation_ended_at-p_observation_started_at>interval '24 hours'
    or p_observation_ended_at>clock_timestamp() then
   raise exception 'Invalid physical evidence observation window' using errcode='22023';
 end if;
 if p_telemetry_count is null or p_telemetry_count not between 0 and 10000000
    or (p_disposition='pass' and p_telemetry_count=0) then
   raise exception 'Invalid physical evidence telemetry count' using errcode='22023';
 end if;
 if p_reason_codes is null or cardinality(p_reason_codes)>20 then
   raise exception 'Invalid physical evidence reason codes' using errcode='22023';
 end if;

 perform pg_advisory_xact_lock(hashtext(p_receipt_id::text));
 select * into e from public.physical_pilot_evidence_receipts where id=p_receipt_id;

 -- Exact response-loss replay is evaluated only against the frozen receipt.
 if e.id is not null then
  if e.commissioning_id is distinct from p_commissioning_id
   or e.commissioning_version is distinct from p_expected_version
   or e.selected_candidate_id is distinct from p_candidate_id
   or e.manifest_id is distinct from p_manifest_id
   or e.repository_head_sha is distinct from p_repository_head_sha
   or e.workflow_run_id is distinct from p_workflow_run_id
   or e.gps_device_id is distinct from p_device_id
   or e.device_identity_hash is distinct from p_device_identity_hash
   or e.installation_receipt_id is distinct from p_installation_receipt_id
   or e.vehicle_link_id is distinct from p_vehicle_link_id
   or e.credential_id is distinct from p_credential_id
   or e.network_validation_receipt_id is distinct from p_network_validation_receipt_id
   or e.classification is distinct from p_classification
   or e.observation_started_at is distinct from p_observation_started_at
   or e.observation_ended_at is distinct from p_observation_ended_at
   or e.telemetry_count is distinct from p_telemetry_count
   or e.authentication_passed is distinct from p_authentication_passed
   or e.replay_passed is distinct from p_replay_passed
   or e.sequence_outcome is distinct from p_sequence_outcome
   or e.reconnect_outcome is distinct from p_reconnect_outcome
   or e.freshness_passed is distinct from p_freshness_passed
   or e.health_passed is distinct from p_health_passed
   or e.disposition is distinct from p_disposition
   or e.reason_codes is distinct from p_reason_codes
   or e.operator_id_hash is distinct from p_operator_id_hash
  then
   raise exception 'Physical evidence receipt replay conflict' using errcode='22023';
  end if;
  return e.id;
 end if;

 -- New evidence freezes mutable authority only after exact replay has been
 -- resolved. Canonical order is device -> repository/certification before
 -- commissioning/manifest/network/lifecycle/credential/repository row reads.
 perform public.m26_lock_device_authority_v1(p_device_id);
 perform pg_advisory_xact_lock(hashtext('m26_repository_authority'));
 select * into c from public.physical_pilot_commissioning where id=p_commissioning_id for update;
 select * into m from public.m24f_adapter_capability_manifests where id=p_manifest_id for share;
 select * into n from public.physical_pilot_network_validation_receipts where id=p_network_validation_receipt_id for share;
 select * into l from public.gps_device_vehicle_links where id=p_vehicle_link_id for share;
 select * into i from public.gps_device_lifecycle_events where id=p_installation_receipt_id for share;
 select * into k from public.gps_device_credential_metadata where id=p_credential_id for share;
 select * into r from public.physical_pilot_repository_authority order by generation desc limit 1 for share;

 if c.id is null or c.state<>'commissioning'
  or c.version is distinct from p_expected_version
  or c.gps_device_id<>p_device_id
  or c.selected_candidate_id<>p_candidate_id
  or c.selected_manifest_id<>p_manifest_id
  or c.selected_certification_run_id is distinct from public.m26_current_certification_run_v1(p_candidate_id,p_manifest_id)
  or not exists(
    select 1 from public.m24f_adapter_candidates a
    where a.id=p_candidate_id and a.manifest_id=p_manifest_id
      and a.decision_status='approved_by_ap' and a.certification_status='passed'
  )
  or r.generation is null
  or p_repository_head_sha is distinct from r.repository_head_sha
  or p_workflow_run_id is distinct from r.workflow_run_id
  or p_device_identity_hash is distinct from public.m22_safe_digest(p_device_id::text)
  or l.gps_device_id is distinct from p_device_id or l.effective_until is not null or not l.is_primary
  or i.gps_device_id is distinct from p_device_id
  or i.vehicle_id is distinct from l.vehicle_id
  or i.event_type<>'installed'
  or i.effective_at<l.effective_from
  or exists(
    select 1 from public.gps_device_lifecycle_events x
    where x.gps_device_id=p_device_id
      and x.event_type in ('installed','removed','replaced','lost','stolen','retired','setup_reopened')
      and (x.effective_at,x.created_at)>(i.effective_at,i.created_at)
  )
  or k.gps_device_id is distinct from p_device_id
  or k.status<>'active'
  or k.last_verified_at is null
  or k.last_verified_at<i.effective_at
  or (k.expires_at is not null and k.expires_at<=p_observation_ended_at)
  or n.commissioning_id is distinct from c.id
  or n.commissioning_version<>c.version
  or n.gps_device_id<>p_device_id
  or n.vehicle_link_id<>l.id
  or n.installation_event_id<>i.id
  or n.credential_id<>k.id
  or n.network_configuration_class<>c.network_configuration_class
  or n.certification_run_id<>c.selected_certification_run_id
  or n.repository_authority_generation<>r.generation
  or n.repository_head_sha<>r.repository_head_sha
  or n.workflow_run_id<>r.workflow_run_id
  or n.validated_at>p_observation_started_at
  or p_classification not in ('synthetic','physical')
  or p_disposition not in ('pass','partial','blocked')
  or p_sequence_outcome not in ('passed','failed','not_supported')
  or p_reconnect_outcome not in ('passed','failed','not_supported')
  or (p_sequence_outcome='not_supported' and m.sequence_available)
  or (p_reconnect_outcome='not_supported' and m.offline_buffering_supported)
  or exists(
    select 1 from unnest(p_reason_codes) reason
    where reason is null or char_length(reason) not between 1 and 80
      or not public.m24f_is_safe_metadata(reason)
  )
  or p_operator_id_hash !~ '^[a-f0-9]{64}$'
 then
  raise exception 'Physical evidence is not bound to current authority' using errcode='42501';
 end if;

 if p_classification='physical' and p_disposition='pass' then
  -- Any authoritative rejection/conflict since the observation began blocks a
  -- pass. Because rejected writes share the device lock, this check cannot race
  -- a concurrent M21 rejection into a ready result.
  v_failure_free:=not public.m26_has_authoritative_failure_v1(
    p_device_id,p_credential_id,m.adapter_id,m.adapter_version,p_observation_started_at
  );

  select count(*)::bigint,
    coalesce(bool_and(t.stream_epoch is not null and t.sequence is not null),false),
    coalesce(bool_or(t.offline_backfill and t.disposition='accepted_delayed'),false)
  into v_authoritative_telemetry_count,v_sequence_proven,v_reconnect_proven
  from public.telemetry_receipts t
  where t.gps_device_id=p_device_id
    and t.credential_id=p_credential_id
    and t.gps_device_vehicle_link_id=p_vehicle_link_id
    and t.adapter_id=m.adapter_id
    and t.adapter_version=m.adapter_version
    and not t.synthetic
    and t.disposition in ('accepted_live','accepted_delayed')
    and t.quality in ('valid','degraded')
    and t.freshness in ('live','delayed','degraded_freshness')
    and public.m26_is_authoritative_observation_v1(
      t.received_at,t.captured_at,n.validated_at,
      p_observation_started_at,p_observation_ended_at
    );

  if v_sequence_proven then
   select not exists(
    select 1
    from public.telemetry_receipts t
    where t.gps_device_id=p_device_id
      and t.credential_id=p_credential_id
      and t.gps_device_vehicle_link_id=p_vehicle_link_id
      and t.adapter_id=m.adapter_id
      and t.adapter_version=m.adapter_version
      and not t.synthetic
      and t.disposition in ('accepted_live','accepted_delayed')
      and public.m26_is_authoritative_observation_v1(
        t.received_at,t.captured_at,n.validated_at,
        p_observation_started_at,p_observation_ended_at
      )
    group by t.stream_epoch
    having count(distinct t.sequence)<>(max(t.sequence)-min(t.sequence)+1)
   ) into v_sequence_proven;
  end if;

  if v_authoritative_telemetry_count is distinct from p_telemetry_count
    or v_authoritative_telemetry_count=0
    or not p_authentication_passed
    or not v_failure_free
    or p_replay_passed is distinct from true
    or not p_freshness_passed
    or not p_health_passed
    or (m.sequence_available and (p_sequence_outcome<>'passed' or not v_sequence_proven))
    or (not m.sequence_available and p_sequence_outcome<>'not_supported')
    or (m.offline_buffering_supported and (p_reconnect_outcome<>'passed' or not v_reconnect_proven))
    or (not m.offline_buffering_supported and p_reconnect_outcome<>'not_supported')
  then
   raise exception 'Physical pass requires authoritative non-synthetic telemetry' using errcode='42501';
  end if;
 end if;

 insert into public.physical_pilot_evidence_receipts(
  id,commissioning_id,commissioning_version,selected_candidate_id,
  certification_run_id,repository_authority_generation,repository_head_sha,
  workflow_run_id,manifest_id,gps_device_id,device_identity_hash,
  installation_receipt_id,vehicle_link_id,credential_id,credential_verified_at,
  network_validation_receipt_id,network_configuration_class,classification,
  observation_started_at,observation_ended_at,telemetry_count,
  authentication_passed,replay_passed,sequence_outcome,reconnect_outcome,
  health_passed,freshness_passed,disposition,reason_codes,operator_id_hash
 ) values(
  p_receipt_id,c.id,c.version,p_candidate_id,c.selected_certification_run_id,
  r.generation,p_repository_head_sha,p_workflow_run_id,m.id,p_device_id,
  p_device_identity_hash,i.id,l.id,k.id,k.last_verified_at,n.id,
  n.network_configuration_class,p_classification,p_observation_started_at,
  p_observation_ended_at,p_telemetry_count,p_authentication_passed,
  p_replay_passed,p_sequence_outcome,p_reconnect_outcome,p_health_passed,
  p_freshness_passed,p_disposition,p_reason_codes,p_operator_id_hash
 );

 if p_classification='physical' and p_disposition='pass' then
  insert into public.physical_pilot_evidence_telemetry_receipts(
    evidence_receipt_id,telemetry_receipt_id
  )
  select p_receipt_id,t.id
  from public.telemetry_receipts t
  where t.gps_device_id=p_device_id
    and t.credential_id=p_credential_id
    and t.gps_device_vehicle_link_id=p_vehicle_link_id
    and t.adapter_id=m.adapter_id
    and t.adapter_version=m.adapter_version
    and not t.synthetic
    and t.disposition in ('accepted_live','accepted_delayed')
    and t.quality in ('valid','degraded')
    and t.freshness in ('live','delayed','degraded_freshness')
    and public.m26_is_authoritative_observation_v1(
      t.received_at,t.captured_at,n.validated_at,
      p_observation_started_at,p_observation_ended_at
    );
 end if;

 return p_receipt_id;
end $$;

revoke all on function public.service_record_physical_pilot_evidence_v1(
 uuid,uuid,bigint,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,boolean,boolean,text,text,boolean,boolean,text,text[],text
) from public,anon,authenticated;
grant execute on function public.service_record_physical_pilot_evidence_v1(
 uuid,uuid,bigint,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,boolean,boolean,text,text,boolean,boolean,text,text[],text
) to service_role;
