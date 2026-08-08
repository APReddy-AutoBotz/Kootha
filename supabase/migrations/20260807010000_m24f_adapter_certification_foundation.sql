-- M24F: vendor-neutral adapter certification foundation.
-- This migration is synthetic/software-only. It does not select a vendor,
-- store credentials, provision hardware, or create a production endpoint.

-- Free-form certification metadata is deliberately more restrictive than a
-- length check.  This immutable predicate is also used by table constraints so
-- service-role/direct SQL writes cannot bypass the RPC validation boundary.
create or replace function public.m24f_is_safe_metadata(p_value text)
returns boolean language sql immutable parallel safe set search_path = pg_catalog
as $$
  select p_value is null or (
    p_value !~ '[{}\[\]]'
    and p_value !~* '(^|[[:space:][:punct:]])(bearer[[:space:]]+[a-z0-9._~+/=-]{8,}|(api[_ -]?key|access[_ -]?token|refresh[_ -]?token|authorization|credential|password|secret)[[:space:]]*[:=][[:space:]]*[^[:space:]]{4,})'
    and p_value !~* '(https?|mqtts?|wss?)://|([a-z0-9-]+\.)+[a-z]{2,}([/:][^[:space:]]*)?'
    and p_value !~ '(^|[^A-Za-z0-9_+/=-])[A-Za-z0-9_+/=-]{24,}([^A-Za-z0-9_+/=-]|$)'
    and p_value !~* '(^|[^0-9])[-+]?[0-9]{1,3}\.[0-9]{4,}[[:space:]]*[,/][[:space:]]*[-+]?[0-9]{1,3}\.[0-9]{4,}([^0-9]|$)'
    and p_value !~* '(^|[[:space:]])(raw[_ -]?payload|payload[_ -]?(fragment|body|contents?|data))([[:space:]:=]|$)'
  )
$$;

create table public.m24f_adapter_capability_manifests (
  id uuid primary key default gen_random_uuid(),
  contract_version text not null default 'm24f-adapter-v1',
  adapter_id text not null,
  adapter_version text not null,
  vendor_device_family_label text not null,
  transport_type text not null,
  authentication_type text not null,
  webhook_direction text not null,
  documented_payload_size_bytes integer not null,
  documented_events_per_minute integer not null,
  batching_supported boolean not null,
  key_id_available boolean not null,
  rotation_supported boolean not null,
  revocation_supported boolean not null,
  signature_timestamp_supported boolean not null,
  server_only_secret_required boolean not null,
  stable_event_id_available boolean not null,
  sequence_available boolean not null,
  stream_epoch_available boolean not null,
  device_timestamp_available boolean not null,
  timestamp_authority text not null,
  offline_buffering_supported boolean not null,
  heartbeat_supported boolean not null,
  battery_supported boolean not null,
  external_power_supported boolean not null,
  gps_fix_supported boolean not null,
  gsm_signal_supported boolean not null,
  location_supported boolean not null,
  approved_sensor_metrics text[] not null default '{}',
  acknowledgement_semantics text not null,
  retry_semantics text not null,
  secret_storage_requirement text not null,
  sandbox_availability text not null,
  data_residency_note text not null,
  support_escalation_note text not null,
  certification_state text not null default 'not_started',
  certification_level text not null default 'manifest_only',
  evidence_level text not null default 'manifest_only',
  synthetic_state text not null default 'synthetic_only',
  created_by_admin uuid,
  created_at timestamptz not null default clock_timestamp(),
  constraint m24f_manifest_contract_check check (contract_version = 'm24f-adapter-v1'),
  constraint m24f_manifest_identity_check check (
    char_length(adapter_id) between 1 and 64
    and char_length(adapter_version) between 1 and 32
    and char_length(vendor_device_family_label) between 1 and 160
    and public.m24f_is_safe_metadata(adapter_id)
    and public.m24f_is_safe_metadata(adapter_version)
    and public.m24f_is_safe_metadata(vendor_device_family_label)
  ),
  constraint m24f_manifest_transport_check check (transport_type in ('vendor_webhook','vendor_polling','direct_http','mqtt','tcp','udp')),
  constraint m24f_manifest_auth_check check (authentication_type in ('bearer','hmac_signature','api_key','mutual_tls','protocol_native')),
  constraint m24f_manifest_direction_check check (webhook_direction in ('inbound','outbound','bidirectional')),
  constraint m24f_manifest_numeric_bounds check (
    documented_payload_size_bytes between 1 and 10485760
    and documented_events_per_minute between 1 and 1000000
  ),
  constraint m24f_manifest_timestamp_check check (timestamp_authority in ('device','vendor_cloud','server_receipt')),
  constraint m24f_manifest_ack_check check (acknowledgement_semantics in ('per_event','per_batch','none')),
  constraint m24f_manifest_retry_check check (retry_semantics in ('same_event_id','new_event_id','undocumented')),
  constraint m24f_manifest_secret_check check (secret_storage_requirement in ('server_secret_store','mutual_tls_store','none','not_documented')),
  constraint m24f_manifest_sandbox_check check (sandbox_availability in ('available','unavailable','unknown')),
  constraint m24f_manifest_state_check check (
    certification_state in ('not_started','in_progress','passed','failed','expired')
    and certification_level in ('manifest_only','synthetic_conformance','sandbox_conformance','physical_pilot','production_authorized')
    and evidence_level in ('none','manifest_only','synthetic_conformance','sandbox_conformance','physical_pilot')
    and synthetic_state in ('synthetic_only','sandbox_only','non_synthetic_evidence','mixed_evidence')
  ),
  constraint m24f_manifest_notes_check check (
    char_length(data_residency_note) between 1 and 500
    and char_length(support_escalation_note) between 1 and 500
    and cardinality(approved_sensor_metrics) <= 16
    and approved_sensor_metrics <@ array['fuel_level','temperature','door_state','vibration','external_power','ignition','tamper']::text[]
    and public.m24f_is_safe_metadata(data_residency_note)
    and public.m24f_is_safe_metadata(support_escalation_note)
  )
);

create unique index m24f_manifest_identity_unique
  on public.m24f_adapter_capability_manifests(adapter_id, adapter_version);

create table public.m24f_adapter_candidates (
  id uuid primary key default gen_random_uuid(),
  safe_display_name text not null,
  device_family text not null,
  transport_type text not null,
  authentication_type text not null,
  hosting_expectation text not null default 'unknown',
  sim_network_requirement text not null default 'unknown',
  installation_requirement text not null default 'unknown',
  offline_buffering text not null default 'unknown',
  event_identity_capability text not null default 'unknown',
  vendor_sandbox_status text not null default 'not_assessed',
  documentation_status text not null default 'not_assessed',
  data_residency_status text not null default 'not_assessed',
  commercial_status text not null default 'not_assessed',
  cost_evidence_status text not null default 'unverified_assumption',
  compliance_evidence_status text not null default 'not_assessed',
  certification_status text not null default 'not_started',
  decision_status text not null default 'not_assessed',
  manifest_id uuid references public.m24f_adapter_capability_manifests(id) on delete restrict,
  blocking_reason text,
  safe_notes text,
  created_by_admin uuid,
  created_at timestamptz not null default clock_timestamp(),
  updated_by_admin uuid,
  updated_at timestamptz not null default clock_timestamp(),
  constraint m24f_candidate_text_bounds check (
    char_length(safe_display_name) between 1 and 160
    and char_length(device_family) between 1 and 160
    and (blocking_reason is null or char_length(blocking_reason) between 1 and 500)
    and (safe_notes is null or char_length(safe_notes) between 1 and 500)
    and public.m24f_is_safe_metadata(safe_display_name)
    and public.m24f_is_safe_metadata(device_family)
    and public.m24f_is_safe_metadata(blocking_reason)
    and public.m24f_is_safe_metadata(safe_notes)
  ),
  constraint m24f_candidate_transport_check check (transport_type in ('vendor_webhook','vendor_polling','direct_http','mqtt','tcp','udp')),
  constraint m24f_candidate_auth_check check (authentication_type in ('bearer','hmac_signature','api_key','mutual_tls','protocol_native')),
  constraint m24f_candidate_hosting_check check (hosting_expectation in ('vendor_cloud','kootha_gateway','hybrid','unknown')),
  constraint m24f_candidate_sim_check check (sim_network_requirement in ('required','not_required','unknown')),
  constraint m24f_candidate_install_check check (installation_requirement in ('wired','obd','portable','certified_fitment','unknown')),
  constraint m24f_candidate_identity_check check (offline_buffering in ('supported','unsupported','unknown') and event_identity_capability in ('stable_event_id','sequence_only','neither','unknown')),
  constraint m24f_candidate_assessment_check check (
    vendor_sandbox_status in ('not_assessed','documented','missing','verified_sandbox','verified_non_synthetic')
    and documentation_status in ('not_assessed','documented','missing','verified_sandbox','verified_non_synthetic')
    and data_residency_status in ('not_assessed','documented','missing','verified_sandbox','verified_non_synthetic')
    and commercial_status in ('not_assessed','documented','missing','verified_sandbox','verified_non_synthetic')
    and compliance_evidence_status in ('not_assessed','documented','missing','verified_sandbox','verified_non_synthetic')
  ),
  constraint m24f_candidate_state_check check (
    cost_evidence_status in ('unverified_assumption','indicative_range','confirmed_quote','approved_commitment')
    and certification_status in ('not_started','in_progress','passed','failed','expired')
    and decision_status in ('not_assessed','candidate','technically_compatible','technically_blocked','awaiting_commercial_review','awaiting_compliance_review','approved_by_ap','rejected','retired')
  )
);

create index m24f_candidate_admin_list_idx on public.m24f_adapter_candidates(decision_status, updated_at desc);

create table public.m24f_certification_runs (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references public.m24f_adapter_candidates(id) on delete restrict,
  adapter_id text not null,
  adapter_version text not null,
  certification_level text not null,
  certification_state text not null,
  synthetic boolean not null default true,
  scenario_count integer not null,
  passed_count integer not null,
  failed_count integer not null,
  result_digest text not null,
  safe_summary text not null,
  started_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  created_by_admin uuid,
  constraint m24f_run_identity_check check (char_length(adapter_id) between 1 and 64 and char_length(adapter_version) between 1 and 32),
  constraint m24f_run_state_check check (certification_level in ('manifest_only','synthetic_conformance','sandbox_conformance','physical_pilot','production_authorized') and certification_state in ('not_started','in_progress','passed','failed','expired')),
  constraint m24f_run_synthetic_level_check check (synthetic and certification_level in ('manifest_only','synthetic_conformance')),
  constraint m24f_run_counts_check check (synthetic and scenario_count between 0 and 200 and passed_count between 0 and scenario_count and failed_count = scenario_count - passed_count),
  constraint m24f_run_digest_check check (result_digest ~ '^[0-9a-f]{64}$' and char_length(safe_summary) between 1 and 500 and public.m24f_is_safe_metadata(safe_summary))
);

create table public.m24f_certification_scenarios (
  id uuid primary key default gen_random_uuid(),
  certification_run_id uuid not null references public.m24f_certification_runs(id) on delete restrict,
  scenario_id text not null,
  category text not null,
  passed boolean not null,
  reason_code text not null,
  synthetic boolean not null default true,
  checked_at timestamptz not null default clock_timestamp(),
  constraint m24f_scenario_bounds_check check (char_length(scenario_id) between 1 and 100 and char_length(reason_code) between 1 and 100 and public.m24f_is_safe_metadata(scenario_id) and public.m24f_is_safe_metadata(reason_code) and category in ('authentication','parsing','normalization','replay_and_sequence','work_and_privacy','safe_output'))
);

create table public.m24f_candidate_decision_history (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.m24f_adapter_candidates(id) on delete restrict,
  previous_status text,
  new_status text not null,
  actor_admin_id uuid,
  reason text not null,
  safe_note text not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint m24f_decision_history_status_check check (new_status in ('not_assessed','candidate','technically_compatible','technically_blocked','awaiting_commercial_review','awaiting_compliance_review','approved_by_ap','rejected','retired') and (previous_status is null or previous_status in ('not_assessed','candidate','technically_compatible','technically_blocked','awaiting_commercial_review','awaiting_compliance_review','approved_by_ap','rejected','retired'))),
  constraint m24f_decision_history_text_check check (char_length(reason) between 1 and 160 and char_length(safe_note) between 1 and 500 and public.m24f_is_safe_metadata(reason) and public.m24f_is_safe_metadata(safe_note))
);

create or replace function public.m24f_protect_immutable()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if current_setting('app.m24f_compaction', true) = 'on' and tg_table_name = 'm24f_certification_scenarios' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'M24F certification history is immutable' using errcode = '55000';
end;
$$;

create trigger m24f_decision_history_immutable before update or delete on public.m24f_candidate_decision_history for each row execute function public.m24f_protect_immutable();
create trigger m24f_scenario_immutable before update or delete on public.m24f_certification_scenarios for each row execute function public.m24f_protect_immutable();

create or replace function public.admin_create_m24f_capability_manifest_v1(
  p_adapter_id text,
  p_adapter_version text,
  p_vendor_device_family_label text,
  p_transport_type text,
  p_authentication_type text,
  p_stable_event_id_available boolean,
  p_sequence_available boolean,
  p_stream_epoch_available boolean,
  p_device_timestamp_available boolean,
  p_offline_buffering_supported boolean,
  p_batching_supported boolean,
  p_heartbeat_supported boolean,
  p_location_supported boolean,
  p_approved_sensor_metrics text[] default '{}',
  p_data_residency_note text default 'Not assessed.',
  p_support_escalation_note text default 'Not assessed.'
) returns uuid language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_actor uuid; v_id uuid;
begin
  v_actor := public.m20a_require_admin();
  if p_adapter_id is null or char_length(trim(p_adapter_id)) not between 1 and 64
    or p_adapter_version is null or char_length(trim(p_adapter_version)) not between 1 and 32
    or p_vendor_device_family_label is null or char_length(trim(p_vendor_device_family_label)) not between 1 and 160
    or p_data_residency_note is null or char_length(trim(p_data_residency_note)) not between 1 and 500
    or p_support_escalation_note is null or char_length(trim(p_support_escalation_note)) not between 1 and 500
    or cardinality(p_approved_sensor_metrics) > 16 then
    raise exception 'Invalid bounded M24F capability manifest' using errcode = '22023';
  end if;
  insert into public.m24f_adapter_capability_manifests(
    adapter_id, adapter_version, vendor_device_family_label, transport_type,
    authentication_type, webhook_direction, documented_payload_size_bytes,
    documented_events_per_minute, batching_supported, key_id_available,
    rotation_supported, revocation_supported, signature_timestamp_supported,
    server_only_secret_required, stable_event_id_available, sequence_available,
    stream_epoch_available, device_timestamp_available, timestamp_authority,
    offline_buffering_supported, heartbeat_supported, battery_supported,
    external_power_supported, gps_fix_supported, gsm_signal_supported,
    location_supported, approved_sensor_metrics, acknowledgement_semantics,
    retry_semantics, secret_storage_requirement, sandbox_availability,
    data_residency_note, support_escalation_note, created_by_admin
  ) values (
    trim(p_adapter_id), trim(p_adapter_version), trim(p_vendor_device_family_label),
    p_transport_type, p_authentication_type, 'inbound', 65536, 600,
    p_batching_supported, p_authentication_type = 'hmac_signature',
    p_authentication_type = 'hmac_signature', p_authentication_type = 'hmac_signature',
    p_authentication_type in ('hmac_signature','bearer','api_key','mutual_tls'),
    true, p_stable_event_id_available, p_sequence_available, p_stream_epoch_available,
    p_device_timestamp_available, 'device', p_offline_buffering_supported,
    p_heartbeat_supported, true, true, true, true, true, p_location_supported,
    coalesce(p_approved_sensor_metrics, '{}'), 'per_batch', 'same_event_id',
    'server_secret_store', 'unknown', trim(p_data_residency_note),
    trim(p_support_escalation_note), v_actor
  ) returning id into v_id;
  insert into public.audit_logs(actor_type, actor_id, action, entity_type, entity_id, safe_details)
  values ('admin', v_actor, 'm24f_capability_manifest_created', 'm24f_adapter_capability_manifest', v_id, jsonb_build_object('adapter_id',p_adapter_id,'adapter_version',p_adapter_version));
  return v_id;
end;
$$;

create or replace function public.admin_create_m24f_candidate_v1(
  p_safe_display_name text,
  p_device_family text,
  p_transport_type text,
  p_authentication_type text,
  p_hosting_expectation text default 'unknown',
  p_sim_network_requirement text default 'unknown',
  p_installation_requirement text default 'unknown',
  p_offline_buffering text default 'unknown',
  p_event_identity_capability text default 'unknown',
  p_safe_notes text default null
) returns uuid language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_actor uuid; v_id uuid;
begin
  v_actor := public.m20a_require_admin();
  if p_safe_display_name is null or char_length(trim(p_safe_display_name)) not between 1 and 160
    or p_device_family is null or char_length(trim(p_device_family)) not between 1 and 160
    or (p_safe_notes is not null and char_length(p_safe_notes) > 500) then
    raise exception 'Invalid bounded M24F candidate metadata' using errcode = '22023';
  end if;
  insert into public.m24f_adapter_candidates(
    safe_display_name, device_family, transport_type, authentication_type,
    hosting_expectation, sim_network_requirement, installation_requirement,
    offline_buffering, event_identity_capability, safe_notes, created_by_admin,
    updated_by_admin
  ) values (
    trim(p_safe_display_name), trim(p_device_family), p_transport_type,
    p_authentication_type, p_hosting_expectation, p_sim_network_requirement,
    p_installation_requirement, p_offline_buffering, p_event_identity_capability,
    nullif(trim(p_safe_notes), ''), v_actor, v_actor
  ) returning id into v_id;
  insert into public.m24f_candidate_decision_history(candidate_id, previous_status, new_status, actor_admin_id, reason, safe_note)
  values (v_id, null, 'not_assessed', v_actor, 'candidate_created', 'Software-only candidate record created; AP selection remains pending.');
  insert into public.audit_logs(actor_type, actor_id, action, entity_type, entity_id, safe_details)
  values ('admin', v_actor, 'm24f_candidate_created', 'm24f_adapter_candidate', v_id, jsonb_build_object('contract_version','m24f-adapter-v1'));
  return v_id;
end;
$$;

create or replace function public.admin_update_m24f_candidate_metadata_v1(
  p_candidate_id uuid,
  p_manifest_id uuid default null,
  p_vendor_sandbox_status text default null,
  p_documentation_status text default null,
  p_data_residency_status text default null,
  p_commercial_status text default null,
  p_cost_evidence_status text default null,
  p_compliance_evidence_status text default null,
  p_blocking_reason text default null,
  p_safe_notes text default null
) returns uuid language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_actor uuid; v_id uuid;
begin
  v_actor := public.m20a_require_admin();
  if p_blocking_reason is not null and char_length(p_blocking_reason) > 500 or p_safe_notes is not null and char_length(p_safe_notes) > 500 then
    raise exception 'Invalid bounded M24F metadata' using errcode = '22023';
  end if;
  update public.m24f_adapter_candidates set
    manifest_id = coalesce(p_manifest_id, manifest_id),
    vendor_sandbox_status = coalesce(p_vendor_sandbox_status, vendor_sandbox_status),
    documentation_status = coalesce(p_documentation_status, documentation_status),
    data_residency_status = coalesce(p_data_residency_status, data_residency_status),
    commercial_status = coalesce(p_commercial_status, commercial_status),
    cost_evidence_status = coalesce(p_cost_evidence_status, cost_evidence_status),
    compliance_evidence_status = coalesce(p_compliance_evidence_status, compliance_evidence_status),
    blocking_reason = case when p_blocking_reason is null then blocking_reason else nullif(trim(p_blocking_reason),'') end,
    safe_notes = case when p_safe_notes is null then safe_notes else nullif(trim(p_safe_notes),'') end,
    updated_by_admin = v_actor, updated_at = clock_timestamp()
  where id = p_candidate_id returning id into v_id;
  if v_id is null then raise exception 'M24F candidate not found' using errcode = 'P0002'; end if;
  insert into public.audit_logs(actor_type, actor_id, action, entity_type, entity_id, safe_details)
  values ('admin', v_actor, 'm24f_candidate_metadata_updated', 'm24f_adapter_candidate', v_id, jsonb_build_object('contract_version','m24f-adapter-v1'));
  return v_id;
end;
$$;

create or replace function public.admin_record_m24f_certification_v1(
  p_candidate_id uuid,
  p_adapter_id text,
  p_adapter_version text,
  p_certification_level text,
  p_certification_state text,
  p_scenario_count integer,
  p_passed_count integer,
  p_result_digest text,
  p_safe_summary text
) returns uuid language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_actor uuid; v_id uuid; v_failed integer;
begin
  v_actor := public.m20a_require_admin();
  if p_certification_level not in ('manifest_only','synthetic_conformance') then
    raise exception 'M24F physical and production certification are deferred beyond this software-only milestone' using errcode = '55000';
  end if;
  if p_candidate_id is null or p_scenario_count not between 0 and 200 or p_passed_count not between 0 and p_scenario_count
    or p_result_digest is null or p_result_digest !~ '^[0-9a-f]{64}$'
    or p_safe_summary is null or char_length(p_safe_summary) not between 1 and 500 then
    raise exception 'Invalid M24F certification result' using errcode = '22023';
  end if;
  v_failed := p_scenario_count - p_passed_count;
  insert into public.m24f_certification_runs(
    candidate_id, adapter_id, adapter_version, certification_level,
    certification_state, synthetic, scenario_count, passed_count, failed_count,
    result_digest, safe_summary, completed_at, created_by_admin
  ) values (
    p_candidate_id, p_adapter_id, p_adapter_version, p_certification_level,
    p_certification_state, true, p_scenario_count, p_passed_count, v_failed,
    p_result_digest, p_safe_summary, clock_timestamp(), v_actor
  ) returning id into v_id;
  update public.m24f_adapter_candidates set certification_status = p_certification_state, updated_by_admin = v_actor, updated_at = clock_timestamp() where id = p_candidate_id;
  insert into public.audit_logs(actor_type, actor_id, action, entity_type, entity_id, safe_details)
  values ('admin', v_actor, 'm24f_certification_recorded', 'm24f_certification_run', v_id, jsonb_build_object('candidate_id',p_candidate_id,'passed_count',p_passed_count,'scenario_count',p_scenario_count,'synthetic',true));
  return v_id;
end;
$$;

create or replace function public.admin_record_m24f_certification_scenarios_v1(
  p_certification_run_id uuid,
  p_scenario_ids text[],
  p_categories text[],
  p_passed boolean[],
  p_reason_codes text[]
) returns integer language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_actor uuid; v_count integer := coalesce(cardinality(p_scenario_ids), 0); v_index integer;
begin
  v_actor := public.m20a_require_admin();
  if p_certification_run_id is null
    or p_scenario_ids is null or p_categories is null or p_passed is null or p_reason_codes is null
    or cardinality(p_categories) <> v_count or cardinality(p_passed) <> v_count
    or cardinality(p_reason_codes) <> v_count or v_count > 200 then
    raise exception 'Invalid bounded M24F certification scenarios' using errcode = '22023';
  end if;
  perform 1 from public.m24f_certification_runs where id = p_certification_run_id;
  if not found then raise exception 'M24F certification run not found' using errcode = 'P0002'; end if;
  if v_count > 0 then
    for v_index in 1..v_count loop
      if p_scenario_ids[v_index] is null or char_length(p_scenario_ids[v_index]) not between 1 and 100
        or p_reason_codes[v_index] is null or char_length(p_reason_codes[v_index]) not between 1 and 100
        or p_categories[v_index] not in ('authentication','parsing','normalization','replay_and_sequence','work_and_privacy','safe_output') then
        raise exception 'Invalid M24F certification scenario value' using errcode = '22023';
      end if;
      insert into public.m24f_certification_scenarios(certification_run_id, scenario_id, category, passed, reason_code, synthetic)
      values (p_certification_run_id, trim(p_scenario_ids[v_index]), p_categories[v_index], p_passed[v_index], trim(p_reason_codes[v_index]), true);
    end loop;
  end if;
  insert into public.audit_logs(actor_type, actor_id, action, entity_type, entity_id, safe_details)
  values ('admin', v_actor, 'm24f_certification_scenarios_recorded', 'm24f_certification_run', p_certification_run_id, jsonb_build_object('scenario_count', v_count, 'synthetic', true));
  return v_count;
end;
$$;

create or replace function public.admin_decide_m24f_candidate_v1(
  p_candidate_id uuid,
  p_new_status text,
  p_reason text,
  p_safe_note text
) returns uuid language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_actor uuid; v_previous text; v_id uuid; v_latest public.m24f_certification_runs%rowtype;
begin
  v_actor := public.m20a_require_admin();
  if p_reason is null or char_length(trim(p_reason)) not between 1 and 160 or p_safe_note is null or char_length(trim(p_safe_note)) not between 1 and 500 then
    raise exception 'A bounded M24F reason and note are required' using errcode = '22023';
  end if;
  select decision_status into v_previous from public.m24f_adapter_candidates where id = p_candidate_id for update;
  if v_previous is null then raise exception 'M24F candidate not found' using errcode = 'P0002'; end if;
  if p_new_status = 'technically_compatible' then
    select * into v_latest from public.m24f_certification_runs where candidate_id = p_candidate_id order by completed_at desc nulls last, id desc limit 1;
    if v_latest.id is null or v_latest.certification_state <> 'passed' then raise exception 'A passed synthetic certification is required' using errcode = '55000'; end if;
  end if;
  if p_new_status = 'approved_by_ap' and v_previous <> 'technically_compatible' then raise exception 'AP approval requires technical compatibility' using errcode = '55000'; end if;
  update public.m24f_adapter_candidates set decision_status = p_new_status, updated_by_admin = v_actor, updated_at = clock_timestamp() where id = p_candidate_id returning id into v_id;
  insert into public.m24f_candidate_decision_history(candidate_id, previous_status, new_status, actor_admin_id, reason, safe_note)
  values (p_candidate_id, v_previous, p_new_status, v_actor, trim(p_reason), trim(p_safe_note));
  insert into public.audit_logs(actor_type, actor_id, action, entity_type, entity_id, safe_details)
  values ('admin', v_actor, 'm24f_candidate_decision_recorded', 'm24f_adapter_candidate', v_id, jsonb_build_object('previous_status',v_previous,'new_status',p_new_status));
  return v_id;
end;
$$;

create or replace function public.admin_list_m24f_adapter_readiness_v1(p_limit integer default 100)
returns jsonb language plpgsql security definer stable set search_path = pg_catalog, public
as $$
declare v_actor uuid; v_rows jsonb;
begin
  v_actor := public.m20a_require_admin();
  if p_limit not between 1 and 200 then raise exception 'Invalid bounded M24F limit' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(row_value order by updated_at desc, id), '[]'::jsonb) into v_rows from (
    select c.updated_at, c.id, jsonb_build_object(
      'candidateId', c.id, 'safeDisplayName', c.safe_display_name, 'deviceFamily', c.device_family,
      'transportType', c.transport_type, 'authenticationType', c.authentication_type,
      'hostingExpectation', c.hosting_expectation, 'offlineBuffering', c.offline_buffering,
      'eventIdentityCapability', c.event_identity_capability, 'vendorSandboxStatus', c.vendor_sandbox_status,
      'documentationStatus', c.documentation_status, 'dataResidencyStatus', c.data_residency_status,
      'commercialStatus', c.commercial_status, 'costEvidenceStatus', c.cost_evidence_status,
      'complianceEvidenceStatus', c.compliance_evidence_status, 'certificationStatus', c.certification_status,
      'decisionStatus', c.decision_status, 'blockingReason', c.blocking_reason, 'safeNotes', c.safe_notes,
      'manifestId', c.manifest_id, 'lastCertificationAt', r.completed_at,
      'lastCertificationState', r.certification_state, 'lastCertificationPassedCount', r.passed_count,
      'lastCertificationScenarioCount', r.scenario_count, 'adapterVersion', r.adapter_version
    ) row_value
    from public.m24f_adapter_candidates c
    left join lateral (select * from public.m24f_certification_runs x where x.candidate_id=c.id order by x.completed_at desc nulls last, x.id desc limit 1) r on true
    order by c.updated_at desc, c.id limit p_limit
  ) bounded;
  return jsonb_build_object('contractVersion','m24f-admin-v1','rows',v_rows);
end;
$$;

create or replace function public.admin_get_m24f_adapter_technical_values_v1(p_candidate_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_actor uuid; v_result jsonb;
begin
  v_actor := public.m20a_require_admin();
  select jsonb_build_object(
    'contractVersion','m24f-admin-v1','candidateId',c.id,'manifest',case when m.id is null then null else jsonb_build_object(
      'adapterId',m.adapter_id,'adapterVersion',m.adapter_version,'vendorDeviceFamilyLabel',m.vendor_device_family_label,
      'transportType',m.transport_type,'authenticationType',m.authentication_type,'stableEventIdAvailable',m.stable_event_id_available,
      'sequenceAvailable',m.sequence_available,'offlineBufferingSupported',m.offline_buffering_supported,
      'batchingSupported',m.batching_supported,'heartbeatSupported',m.heartbeat_supported,'locationSupported',m.location_supported,
      'approvedSensorMetrics',m.approved_sensor_metrics,'certificationState',m.certification_state,'evidenceLevel',m.evidence_level,
      'syntheticState',m.synthetic_state
    ) end
  ) into v_result
  from public.m24f_adapter_candidates c left join public.m24f_adapter_capability_manifests m on m.id=c.manifest_id
  where c.id=p_candidate_id;
  if v_result is null then raise exception 'M24F candidate not found' using errcode = 'P0002'; end if;
  insert into public.audit_logs(actor_type, actor_id, action, entity_type, entity_id, safe_details)
  values ('admin', v_actor, 'm24f_adapter_technical_values_viewed', 'm24f_adapter_candidate', p_candidate_id, jsonb_build_object('contract_version','m24f-admin-v1'));
  return v_result;
end;
$$;

create or replace function public.m24f_compact_certification_runs(p_batch_size integer default 100, p_now timestamptz default clock_timestamp())
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_deleted integer := 0;
begin
  if p_batch_size not between 1 and 500 then raise exception 'Invalid bounded M24F compaction batch' using errcode = '22023'; end if;
  perform set_config('app.m24f_compaction','on',true);
  with eligible as (
    select s.id from public.m24f_certification_scenarios s
    join public.m24f_certification_runs r on r.id=s.certification_run_id
    where r.completed_at < p_now - interval '30 days'
      and not exists (select 1 from public.m24f_adapter_candidates c where c.id=r.candidate_id)
    order by s.checked_at limit p_batch_size
  ) delete from public.m24f_certification_scenarios s using eligible e where s.id=e.id;
  get diagnostics v_deleted = row_count;
  return jsonb_build_object('deleted_rows',v_deleted,'batch_size',p_batch_size);
end;
$$;

alter table public.m24f_adapter_capability_manifests enable row level security;
alter table public.m24f_adapter_candidates enable row level security;
alter table public.m24f_certification_runs enable row level security;
alter table public.m24f_certification_scenarios enable row level security;
alter table public.m24f_candidate_decision_history enable row level security;

revoke all on public.m24f_adapter_capability_manifests, public.m24f_adapter_candidates, public.m24f_certification_runs, public.m24f_certification_scenarios, public.m24f_candidate_decision_history from public, anon, authenticated;
grant select on public.m24f_adapter_capability_manifests, public.m24f_adapter_candidates, public.m24f_certification_runs, public.m24f_certification_scenarios, public.m24f_candidate_decision_history to authenticated;

create policy "M24F admin reads only" on public.m24f_adapter_capability_manifests for select to authenticated using (public.is_admin());
create policy "M24F candidate admin reads only" on public.m24f_adapter_candidates for select to authenticated using (public.is_admin());
create policy "M24F run admin reads only" on public.m24f_certification_runs for select to authenticated using (public.is_admin());
create policy "M24F scenario admin reads only" on public.m24f_certification_scenarios for select to authenticated using (public.is_admin());
create policy "M24F decision history admin reads only" on public.m24f_candidate_decision_history for select to authenticated using (public.is_admin());

revoke all on function public.admin_create_m24f_capability_manifest_v1(text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text[],text,text) from public, anon, authenticated;
revoke all on function public.m24f_is_safe_metadata(text) from public, anon, authenticated;
revoke all on function public.admin_create_m24f_candidate_v1(text,text,text,text,text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.admin_update_m24f_candidate_metadata_v1(uuid,uuid,text,text,text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.admin_record_m24f_certification_v1(uuid,text,text,text,text,integer,integer,text,text) from public, anon, authenticated;
revoke all on function public.admin_record_m24f_certification_scenarios_v1(uuid,text[],text[],boolean[],text[]) from public, anon, authenticated;
revoke all on function public.admin_decide_m24f_candidate_v1(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.admin_list_m24f_adapter_readiness_v1(integer) from public, anon, authenticated;
revoke all on function public.admin_get_m24f_adapter_technical_values_v1(uuid) from public, anon, authenticated;
revoke all on function public.m24f_compact_certification_runs(integer,timestamptz) from public, anon, authenticated;
grant execute on function public.admin_create_m24f_capability_manifest_v1(text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text[],text,text) to authenticated;
grant execute on function public.admin_create_m24f_candidate_v1(text,text,text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.admin_update_m24f_candidate_metadata_v1(uuid,uuid,text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.admin_record_m24f_certification_v1(uuid,text,text,text,text,integer,integer,text,text) to authenticated;
grant execute on function public.admin_record_m24f_certification_scenarios_v1(uuid,text[],text[],boolean[],text[]) to authenticated;
grant execute on function public.admin_decide_m24f_candidate_v1(uuid,text,text,text) to authenticated;
grant execute on function public.admin_list_m24f_adapter_readiness_v1(integer) to authenticated;
grant execute on function public.admin_get_m24f_adapter_technical_values_v1(uuid) to authenticated;
grant execute on function public.m24f_compact_certification_runs(integer,timestamptz) to service_role;
grant execute on function public.m24f_is_safe_metadata(text) to authenticated, service_role;

comment on table public.m24f_adapter_capability_manifests is 'Bounded vendor-neutral capability manifests; no credential or arbitrary capability JSON is stored.';
comment on table public.m24f_adapter_candidates is 'Admin-only future adapter candidates. M24F does not select or authorize a vendor.';
comment on table public.m24f_certification_runs is 'Synthetic certification summaries and digests; raw payloads and secrets are never stored.';
