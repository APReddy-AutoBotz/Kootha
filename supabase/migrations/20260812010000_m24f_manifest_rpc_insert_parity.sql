-- Forward repair for the retained M24F manifest writer. The original migration is
-- immutable; this replacement only corrects INSERT column/value parity.

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
    p_heartbeat_supported, true, true, true, true, p_location_supported,
    coalesce(p_approved_sensor_metrics, '{}'), 'per_batch', 'same_event_id',
    'server_secret_store', 'unknown', trim(p_data_residency_note),
    trim(p_support_escalation_note), v_actor
  ) returning id into v_id;
  insert into public.audit_logs(actor_type, actor_id, action, entity_type, entity_id, safe_details)
  values ('admin', v_actor, 'm24f_capability_manifest_created', 'm24f_adapter_capability_manifest', v_id, jsonb_build_object('adapter_id',p_adapter_id,'adapter_version',p_adapter_version));
  return v_id;
end;
$$;
