-- M26 physical truth convergence. Physical readiness is backed by immutable M21 receipts;
-- synthetic and caller-supplied summaries can never mint physical acceptance.

create table public.physical_pilot_evidence_telemetry_receipts (
 evidence_receipt_id uuid not null references public.physical_pilot_evidence_receipts(id) on delete restrict,
 telemetry_receipt_id uuid not null references public.telemetry_receipts(id) on delete restrict,
 primary key(evidence_receipt_id,telemetry_receipt_id), unique(telemetry_receipt_id)
);
alter table public.physical_pilot_evidence_telemetry_receipts enable row level security;
revoke all on public.physical_pilot_evidence_telemetry_receipts from public,anon,authenticated,service_role;
create trigger physical_pilot_evidence_telemetry_immutable before update or delete on public.physical_pilot_evidence_telemetry_receipts for each row execute function public.m26_reject_immutable_change();

create or replace function public.m26_is_authoritative_observation_v1(
 p_received_at timestamptz,p_captured_at timestamptz,p_network_validated_at timestamptz,
 p_observation_started_at timestamptz,p_observation_ended_at timestamptz
) returns boolean language sql immutable set search_path=pg_catalog,public as $$
 select coalesce(
  p_received_at>=greatest(p_network_validated_at,p_observation_started_at)
  and p_received_at<=p_observation_ended_at
  and p_captured_at>=p_observation_started_at
  and p_captured_at<=p_observation_ended_at,
  false
 )
$$;
revoke all on function public.m26_is_authoritative_observation_v1(timestamptz,timestamptz,timestamptz,timestamptz,timestamptz) from public,anon,authenticated,service_role;

create index if not exists telemetry_identity_conflicts_m26_scope_idx
 on public.telemetry_identity_conflicts(gps_device_id,first_seen_at,last_seen_at,reason_code,original_receipt_id);
create index if not exists telemetry_receipts_m26_conflict_scope_idx
 on public.telemetry_receipts(gps_device_id,credential_id,gps_device_vehicle_link_id,adapter_id,adapter_version,received_at,captured_at,id);
create index if not exists telemetry_receipts_m26_rejection_idx
 on public.telemetry_receipts(gps_device_id,credential_id,adapter_id,adapter_version,received_at)
 where disposition='rejected';

create or replace function public.m26_lock_device_authority_v1(p_device_id uuid)
returns void language plpgsql set search_path=pg_catalog,public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_device_id::text,0));
end $$;
revoke all on function public.m26_lock_device_authority_v1(uuid) from public,anon,authenticated,service_role;

create or replace function public.m26_serialize_conflict_authority_v1()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 perform public.m26_lock_device_authority_v1(new.gps_device_id);
 return new;
end $$;
revoke all on function public.m26_serialize_conflict_authority_v1() from public,anon,authenticated,service_role;
create trigger telemetry_identity_conflicts_m26_serialize
before insert or update on public.telemetry_identity_conflicts
for each row execute function public.m26_serialize_conflict_authority_v1();

create or replace function public.m26_serialize_rejected_receipt_authority_v1()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 if new.disposition='rejected' then
  perform public.m26_lock_device_authority_v1(new.gps_device_id);
 end if;
 return new;
end $$;
revoke all on function public.m26_serialize_rejected_receipt_authority_v1() from public,anon,authenticated,service_role;
create trigger telemetry_receipts_m26_rejected_serialize
before insert or update on public.telemetry_receipts
for each row when (new.disposition='rejected')
execute function public.m26_serialize_rejected_receipt_authority_v1();

create or replace function public.m26_has_authoritative_failure_v1(
 p_device_id uuid,p_credential_id uuid,p_adapter_id text,p_adapter_version text,
 p_observation_started_at timestamptz
) returns boolean language sql stable set search_path=pg_catalog,public as $$
 select exists(
  select 1
  from public.telemetry_identity_conflicts c
  join public.telemetry_receipts t on t.id=c.original_receipt_id
  where c.gps_device_id=p_device_id and t.gps_device_id=p_device_id
    and t.adapter_id=p_adapter_id and t.adapter_version=p_adapter_version
    and c.reason_code in ('event_identity_conflict','sequence_replay_invalid')
    and c.last_seen_at>=p_observation_started_at
 ) or exists(
  select 1
  from public.telemetry_receipts t
  where t.gps_device_id=p_device_id
    and t.credential_id=p_credential_id
    and t.adapter_id=p_adapter_id and t.adapter_version=p_adapter_version
    and not t.synthetic and t.disposition='rejected'
    and t.received_at>=p_observation_started_at
 )
$$;
revoke all on function public.m26_has_authoritative_failure_v1(uuid,uuid,text,text,timestamptz) from public,anon,authenticated,service_role;

create or replace function public.service_record_physical_pilot_evidence_v1(
 p_receipt_id uuid,p_commissioning_id uuid,p_expected_version bigint,p_candidate_id uuid,p_manifest_id uuid,p_repository_head_sha text,p_workflow_run_id text,
 p_device_id uuid,p_device_identity_hash text,p_installation_receipt_id uuid,p_vehicle_link_id uuid,p_credential_id uuid,p_network_validation_receipt_id uuid,
 p_classification text,p_observation_started_at timestamptz,p_observation_ended_at timestamptz,p_telemetry_count bigint,p_authentication_passed boolean,p_replay_passed boolean,
 p_sequence_outcome text,p_reconnect_outcome text,p_freshness_passed boolean,p_health_passed boolean,p_disposition text,p_reason_codes text[],p_operator_id_hash text
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.physical_pilot_commissioning%rowtype; m public.m24f_adapter_capability_manifests%rowtype; n public.physical_pilot_network_validation_receipts%rowtype;
 l public.gps_device_vehicle_links%rowtype; i public.gps_device_lifecycle_events%rowtype; k public.gps_device_credential_metadata%rowtype;
 r public.physical_pilot_repository_authority%rowtype; e public.physical_pilot_evidence_receipts%rowtype;
 v_authoritative_telemetry_count bigint; v_sequence_proven boolean; v_reconnect_proven boolean; v_replay_proven boolean;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service authority required' using errcode='42501'; end if;
 if p_observation_ended_at-p_observation_started_at>interval '24 hours' then raise exception 'Physical evidence observation window exceeds 24 hours' using errcode='22023'; end if;
 perform public.m26_lock_device_authority_v1(p_device_id);
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
  or k.gps_device_id is distinct from p_device_id or k.status<>'active' or k.last_verified_at is null or k.last_verified_at<i.effective_at or (k.expires_at is not null and k.expires_at<=p_observation_ended_at)
  or n.commissioning_id is distinct from c.id or n.commissioning_version<>c.version or n.gps_device_id<>p_device_id or n.vehicle_link_id<>l.id or n.installation_event_id<>i.id or n.credential_id<>k.id or n.network_configuration_class<>c.network_configuration_class
  or n.certification_run_id<>c.selected_certification_run_id or n.repository_authority_generation<>r.generation or n.repository_head_sha<>r.repository_head_sha or n.workflow_run_id<>r.workflow_run_id
  or n.validated_at>p_observation_started_at or p_classification not in ('synthetic','physical') or p_disposition not in ('pass','partial','blocked')
  or p_sequence_outcome not in ('passed','failed','not_supported') or p_reconnect_outcome not in ('passed','failed','not_supported')
  or (p_sequence_outcome='not_supported' and m.sequence_available) or (p_reconnect_outcome='not_supported' and m.offline_buffering_supported)
  or exists(select 1 from unnest(p_reason_codes) reason where reason is null or char_length(reason) not between 1 and 80 or not public.m24f_is_safe_metadata(reason))
  or p_observation_ended_at<=p_observation_started_at or p_observation_ended_at>clock_timestamp() or p_telemetry_count not between 1 and 10000000 or cardinality(p_reason_codes)>20 or p_operator_id_hash !~ '^[a-f0-9]{64}$'
 then raise exception 'Physical evidence is not bound to current authority' using errcode='42501'; end if;
 if p_classification='physical' and p_disposition='pass' then
  v_replay_proven:=not public.m26_has_authoritative_failure_v1(p_device_id,p_credential_id,m.adapter_id,m.adapter_version,p_observation_started_at);
  select count(*)::bigint,
    coalesce(bool_and(t.stream_epoch is not null and t.sequence is not null),false),
    coalesce(bool_or(t.offline_backfill and t.disposition='accepted_delayed'),false)
  into v_authoritative_telemetry_count,v_sequence_proven,v_reconnect_proven
  from public.telemetry_receipts t
  where t.gps_device_id=p_device_id and t.credential_id=p_credential_id
    and t.gps_device_vehicle_link_id=p_vehicle_link_id
    and t.adapter_id=m.adapter_id and t.adapter_version=m.adapter_version
    and not t.synthetic and t.disposition in ('accepted_live','accepted_delayed')
    and t.quality in ('valid','degraded') and t.freshness in ('live','delayed','degraded_freshness')
    and public.m26_is_authoritative_observation_v1(t.received_at,t.captured_at,n.validated_at,p_observation_started_at,p_observation_ended_at);
  if v_sequence_proven then
   select not exists(
    select 1 from public.telemetry_receipts t
    where t.gps_device_id=p_device_id and t.credential_id=p_credential_id and t.gps_device_vehicle_link_id=p_vehicle_link_id
      and t.adapter_id=m.adapter_id and t.adapter_version=m.adapter_version and not t.synthetic
      and t.disposition in ('accepted_live','accepted_delayed')
      and public.m26_is_authoritative_observation_v1(t.received_at,t.captured_at,n.validated_at,p_observation_started_at,p_observation_ended_at)
    group by t.stream_epoch having count(distinct t.sequence)<>(max(t.sequence)-min(t.sequence)+1)
   ) into v_sequence_proven;
  end if;
  if v_authoritative_telemetry_count is distinct from p_telemetry_count
    or not p_authentication_passed or not v_replay_proven or p_replay_passed is distinct from v_replay_proven or not p_freshness_passed or not p_health_passed
    or (m.sequence_available and (p_sequence_outcome<>'passed' or not v_sequence_proven))
    or (not m.sequence_available and p_sequence_outcome<>'not_supported')
    or (m.offline_buffering_supported and (p_reconnect_outcome<>'passed' or not v_reconnect_proven))
    or (not m.offline_buffering_supported and p_reconnect_outcome<>'not_supported')
  then raise exception 'Physical pass requires authoritative non-synthetic telemetry' using errcode='42501'; end if;
 end if;
 insert into public.physical_pilot_evidence_receipts(id,commissioning_id,commissioning_version,selected_candidate_id,certification_run_id,repository_authority_generation,repository_head_sha,workflow_run_id,manifest_id,gps_device_id,device_identity_hash,installation_receipt_id,vehicle_link_id,credential_id,credential_verified_at,network_validation_receipt_id,network_configuration_class,classification,observation_started_at,observation_ended_at,telemetry_count,authentication_passed,replay_passed,sequence_outcome,reconnect_outcome,health_passed,freshness_passed,disposition,reason_codes,operator_id_hash)
 values(p_receipt_id,c.id,c.version,p_candidate_id,c.selected_certification_run_id,r.generation,p_repository_head_sha,p_workflow_run_id,m.id,p_device_id,p_device_identity_hash,i.id,l.id,k.id,k.last_verified_at,n.id,n.network_configuration_class,p_classification,p_observation_started_at,p_observation_ended_at,p_telemetry_count,p_authentication_passed,p_replay_passed,p_sequence_outcome,p_reconnect_outcome,p_health_passed,p_freshness_passed,p_disposition,p_reason_codes,p_operator_id_hash);
 if p_classification='physical' and p_disposition='pass' then
  insert into public.physical_pilot_evidence_telemetry_receipts(evidence_receipt_id,telemetry_receipt_id)
  select p_receipt_id,t.id from public.telemetry_receipts t
  where t.gps_device_id=p_device_id and t.credential_id=p_credential_id and t.gps_device_vehicle_link_id=p_vehicle_link_id
    and t.adapter_id=m.adapter_id and t.adapter_version=m.adapter_version and not t.synthetic
    and t.disposition in ('accepted_live','accepted_delayed') and t.quality in ('valid','degraded')
    and t.freshness in ('live','delayed','degraded_freshness')
    and public.m26_is_authoritative_observation_v1(t.received_at,t.captured_at,n.validated_at,p_observation_started_at,p_observation_ended_at);
 end if;
 return p_receipt_id;
end $$;

create or replace function public.admin_get_physical_pilot_readiness_v1(p_device_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public volatile as $$
declare d public.gps_devices%rowtype; c public.physical_pilot_commissioning%rowtype; a public.m24f_adapter_candidates%rowtype; m public.m24f_adapter_capability_manifests%rowtype;
 l public.gps_device_vehicle_links%rowtype; i public.gps_device_lifecycle_events%rowtype; k public.gps_device_credential_metadata%rowtype; n public.physical_pilot_network_validation_receipts%rowtype;
 r public.physical_pilot_repository_authority%rowtype;
 e_latest public.physical_pilot_evidence_receipts%rowtype;
 v_stage text; v_reasons text[]='{}'; v_physical boolean=false;
begin
 perform public.m20a_require_admin();
 perform public.m26_lock_device_authority_v1(p_device_id);
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
   and e.classification='physical' and e.physical_evidence and e.disposition='pass'
   and e.telemetry_count=(select count(*) from public.physical_pilot_evidence_telemetry_receipts et join public.telemetry_receipts t on t.id=et.telemetry_receipt_id where et.evidence_receipt_id=e.id and not t.synthetic and t.gps_device_id=e.gps_device_id and t.credential_id=e.credential_id and t.gps_device_vehicle_link_id=e.vehicle_link_id and t.adapter_id=m.adapter_id and t.adapter_version=m.adapter_version and public.m26_is_authoritative_observation_v1(t.received_at,t.captured_at,n.validated_at,e.observation_started_at,e.observation_ended_at)) and e.authentication_passed and e.replay_passed and not public.m26_has_authoritative_failure_v1(e.gps_device_id,e.credential_id,m.adapter_id,m.adapter_version,e.observation_started_at) and e.freshness_passed and e.health_passed
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

-- The service credential is an RPC caller, never a table writer.  Supabase's
-- default service-role grants bypass RLS, so every table capable of minting or
-- rewriting commissioning, network, telemetry, evidence, or readiness truth is
-- explicitly closed to direct DML (including TRUNCATE).
revoke all on public.physical_pilot_commissioning,
 public.physical_pilot_commissioning_receipts,
 public.physical_pilot_network_validation_receipts,
 public.physical_pilot_evidence_receipts,
 public.physical_pilot_evidence_telemetry_receipts,
 public.physical_pilot_repository_authority,
 public.telemetry_receipts,
 public.telemetry_identity_conflicts
from service_role;
