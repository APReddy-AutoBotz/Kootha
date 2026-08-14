-- M26 network-validation lock-order closure.
-- Exact receipt replay remains first and independent of mutable authority.
-- New receipts acquire device -> repository before any commissioning row lock.

create or replace function public.service_record_physical_pilot_network_validation_v1(
  p_receipt_id uuid,
  p_commissioning_id uuid,
  p_expected_version bigint,
  p_device_id uuid,
  p_vehicle_link_id uuid,
  p_installation_event_id uuid,
  p_credential_id uuid,
  p_network_configuration_class text,
  p_configuration_identity_hash text,
  p_validated_at timestamptz,
  p_repository_head_sha text,
  p_workflow_run_id text
) returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  c public.physical_pilot_commissioning%rowtype;
  l public.gps_device_vehicle_links%rowtype;
  i public.gps_device_lifecycle_events%rowtype;
  k public.gps_device_credential_metadata%rowtype;
  r public.physical_pilot_repository_authority%rowtype;
  n public.physical_pilot_network_validation_receipts%rowtype;
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'Service authority required' using errcode='42501';
  end if;
  if p_network_configuration_class is null
    or char_length(p_network_configuration_class) not between 1 and 80
    or not public.m24f_is_safe_metadata(p_network_configuration_class)
  then
    raise exception 'Unsafe network configuration class' using errcode='22023';
  end if;

  -- Serialize identical in-flight requests and resolve exact replay before
  -- consulting any mutable commissioning/certification/repository authority.
  perform pg_advisory_xact_lock(hashtext(p_receipt_id::text));
  select * into n
  from public.physical_pilot_network_validation_receipts
  where id=p_receipt_id;
  if n.id is not null then
    if n.commissioning_id is distinct from p_commissioning_id
      or n.commissioning_version is distinct from p_expected_version
      or n.gps_device_id is distinct from p_device_id
      or n.vehicle_link_id is distinct from p_vehicle_link_id
      or n.installation_event_id is distinct from p_installation_event_id
      or n.credential_id is distinct from p_credential_id
      or n.network_configuration_class is distinct from p_network_configuration_class
      or n.configuration_identity_hash is distinct from p_configuration_identity_hash
      or n.validated_at is distinct from p_validated_at
      or n.repository_head_sha is distinct from p_repository_head_sha
      or n.workflow_run_id is distinct from p_workflow_run_id
    then
      raise exception 'Network validation receipt replay conflict' using errcode='22023';
    end if;
    return n.id;
  end if;

  -- New receipt authority uses the canonical ordering shared by readiness:
  -- device first, repository/certification second, row locks only afterwards.
  perform public.m26_lock_device_authority_v1(p_device_id);
  perform pg_advisory_xact_lock(hashtext('m26_repository_authority'));

  select * into c
  from public.physical_pilot_commissioning
  where id=p_commissioning_id
  for update;
  select * into l
  from public.gps_device_vehicle_links
  where id=p_vehicle_link_id
  for share;
  select * into i
  from public.gps_device_lifecycle_events
  where id=p_installation_event_id
  for share;
  select * into k
  from public.gps_device_credential_metadata
  where id=p_credential_id
  for share;
  select * into r
  from public.physical_pilot_repository_authority
  order by generation desc
  limit 1
  for share;

  if c.id is null
    or c.state<>'commissioning'
    or c.version is distinct from p_expected_version
    or c.gps_device_id<>p_device_id
    or c.network_configuration_class is distinct from p_network_configuration_class
    or l.gps_device_id is distinct from p_device_id
    or l.effective_until is not null
    or not l.is_primary
    or i.gps_device_id is distinct from p_device_id
    or i.vehicle_id is distinct from l.vehicle_id
    or i.event_type<>'installed'
    or i.effective_at<l.effective_from
    or exists(
      select 1
      from public.gps_device_lifecycle_events x
      where x.gps_device_id=p_device_id
        and x.event_type in ('installed','removed','replaced','lost','stolen','retired','setup_reopened')
        and (x.effective_at,x.created_at)>(i.effective_at,i.created_at)
    )
    or k.gps_device_id is distinct from p_device_id
    or k.status<>'active'
    or k.last_verified_at is null
    or k.last_verified_at<i.effective_at
    or (k.expires_at is not null and k.expires_at<=p_validated_at)
    or r.generation is null
    or r.repository_head_sha is distinct from p_repository_head_sha
    or r.workflow_run_id is distinct from p_workflow_run_id
    or c.selected_certification_run_id is distinct from public.m26_current_certification_run_v1(c.selected_candidate_id,c.selected_manifest_id)
    or p_configuration_identity_hash !~ '^[a-f0-9]{64}$'
    or p_validated_at>clock_timestamp()
    or p_validated_at<greatest(i.effective_at,k.last_verified_at)
  then
    raise exception 'Network validation is not bound to current authority' using errcode='42501';
  end if;

  insert into public.physical_pilot_network_validation_receipts(
    id,commissioning_id,commissioning_version,gps_device_id,vehicle_link_id,
    installation_event_id,credential_id,certification_run_id,
    repository_authority_generation,repository_head_sha,workflow_run_id,
    network_configuration_class,configuration_identity_hash,validated_at
  ) values(
    p_receipt_id,c.id,c.version,p_device_id,l.id,i.id,k.id,
    c.selected_certification_run_id,r.generation,r.repository_head_sha,
    r.workflow_run_id,p_network_configuration_class,
    p_configuration_identity_hash,p_validated_at
  );
  return p_receipt_id;
end;
$$;

revoke all on function public.service_record_physical_pilot_network_validation_v1(
  uuid,uuid,bigint,uuid,uuid,uuid,uuid,text,text,timestamptz,text,text
) from public,anon,authenticated;
grant execute on function public.service_record_physical_pilot_network_validation_v1(
  uuid,uuid,bigint,uuid,uuid,uuid,uuid,text,text,timestamptz,text,text
) to service_role;
