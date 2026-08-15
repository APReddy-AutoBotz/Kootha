-- M26 certification/network authority closure.
-- Readiness already serializes device -> repository. This migration makes
-- certification mutations share the repository lock and revalidates every
-- new network receipt under device -> repository before persistence.

create or replace function public.m26_try_repository_authority_lock_v1()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not pg_try_advisory_xact_lock(hashtext('m26_repository_authority')) then
    raise exception 'M26 repository/certification authority busy; retry transaction'
      using errcode = '40001';
  end if;
end;
$$;

create or replace function public.m26_serialize_certification_authority_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.m26_try_repository_authority_lock_v1();
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists m24f_manifest_m26_repository_serialize on public.m24f_adapter_capability_manifests;
create trigger m24f_manifest_m26_repository_serialize
  before insert or update or delete on public.m24f_adapter_capability_manifests
  for each row execute function public.m26_serialize_certification_authority_v1();

drop trigger if exists m24f_candidate_m26_repository_serialize on public.m24f_adapter_candidates;
create trigger m24f_candidate_m26_repository_serialize
  before insert or update or delete on public.m24f_adapter_candidates
  for each row execute function public.m26_serialize_certification_authority_v1();

drop trigger if exists m24f_run_m26_repository_serialize on public.m24f_certification_runs;
create trigger m24f_run_m26_repository_serialize
  before insert or update or delete on public.m24f_certification_runs
  for each row execute function public.m26_serialize_certification_authority_v1();

drop trigger if exists m24f_scenario_m26_repository_serialize on public.m24f_certification_scenarios;
create trigger m24f_scenario_m26_repository_serialize
  before insert or update or delete on public.m24f_certification_scenarios
  for each row execute function public.m26_serialize_certification_authority_v1();

drop trigger if exists m24f_decision_m26_repository_serialize on public.m24f_candidate_decision_history;
create trigger m24f_decision_m26_repository_serialize
  before insert or update or delete on public.m24f_candidate_decision_history
  for each row execute function public.m26_serialize_certification_authority_v1();

create or replace function public.m26_revalidate_network_receipt_authority_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  c public.physical_pilot_commissioning%rowtype;
  d public.gps_devices%rowtype;
  l public.gps_device_vehicle_links%rowtype;
  i public.gps_device_lifecycle_events%rowtype;
  k public.gps_device_credential_metadata%rowtype;
  r public.physical_pilot_repository_authority%rowtype;
  v_current_certification uuid;
begin
  perform public.m26_lock_device_authority_v1(new.gps_device_id);
  perform pg_advisory_xact_lock(hashtext('m26_repository_authority'));

  select * into c
  from public.physical_pilot_commissioning
  where id = new.commissioning_id
    and gps_device_id = new.gps_device_id;

  select * into d
  from public.gps_devices
  where id = new.gps_device_id;

  select * into l
  from public.gps_device_vehicle_links
  where gps_device_id = new.gps_device_id
    and is_primary
    and effective_until is null;

  select * into i
  from public.gps_device_lifecycle_events x
  where x.gps_device_id = new.gps_device_id
    and x.event_type = 'installed'
    and not exists (
      select 1
      from public.gps_device_lifecycle_events y
      where y.gps_device_id = new.gps_device_id
        and y.event_type in ('installed','removed','replaced','lost','stolen','retired','setup_reopened')
        and (y.effective_at, y.created_at) > (x.effective_at, x.created_at)
    )
  order by x.effective_at desc, x.created_at desc
  limit 1;

  select * into k
  from public.gps_device_credential_metadata
  where id = new.credential_id
    and gps_device_id = new.gps_device_id
    and status = 'active'
    and last_verified_at is not null
    and (expires_at is null or expires_at > clock_timestamp());

  select * into r
  from public.physical_pilot_repository_authority
  order by generation desc
  limit 1;

  if c.id is not null then
    v_current_certification := public.m26_current_certification_run_v1(
      c.selected_candidate_id,
      c.selected_manifest_id
    );
  end if;

  if c.id is null
    or c.version is distinct from new.commissioning_version
    or c.selected_certification_run_id is distinct from new.certification_run_id
    or v_current_certification is distinct from new.certification_run_id
    or c.network_configuration_class is distinct from new.network_configuration_class
    or d.id is null
    or d.status::text is distinct from 'active'
    or d.gps_readiness is distinct from 'ready'
    or d.gsm_readiness not in ('ready','degraded')
    or l.id is null
    or l.id is distinct from new.vehicle_link_id
    or i.id is null
    or i.id is distinct from new.installation_event_id
    or i.vehicle_id is distinct from l.vehicle_id
    or i.effective_at < l.effective_from
    or d.installation_state is distinct from 'installed'
    or k.id is null
    or r.generation is distinct from new.repository_authority_generation
    or r.repository_head_sha is distinct from new.repository_head_sha
    or r.workflow_run_id is distinct from new.workflow_run_id
  then
    raise exception 'Network validation authority changed; retry transaction'
      using errcode = '40001';
  end if;

  if new.validated_at > clock_timestamp() then
    raise exception 'Network validation timestamp cannot be in the future'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists physical_pilot_network_receipts_m26_authority_revalidate
  on public.physical_pilot_network_validation_receipts;
create trigger physical_pilot_network_receipts_m26_authority_revalidate
  before insert on public.physical_pilot_network_validation_receipts
  for each row execute function public.m26_revalidate_network_receipt_authority_v1();

revoke all on function public.m26_try_repository_authority_lock_v1() from public, anon, authenticated, service_role;
revoke all on function public.m26_serialize_certification_authority_v1() from public, anon, authenticated, service_role;
revoke all on function public.m26_revalidate_network_receipt_authority_v1() from public, anon, authenticated, service_role;
