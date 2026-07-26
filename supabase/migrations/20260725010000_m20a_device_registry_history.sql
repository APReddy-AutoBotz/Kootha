-- M20A: Physical Device Registry and History
-- This migration adds registry administration only. It does not add telemetry
-- ingestion, credentials, device connections, tracking sessions, or points.

create extension if not exists "btree_gist";
set search_path = public;

-- Replace the legacy enum in one migration transaction so canonical values can be used immediately.
alter table public.gps_devices alter column status drop default;
alter table public.gps_devices alter column status type text using status::text;
drop type public.gps_device_status;
create type public.gps_device_status as enum (
  'pending_setup',
  'active',
  'offline',
  'not_working',
  'suspended',
  'removed',
  'retired'
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'gps_devices'
      and column_name = 'provider_name'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'gps_devices'
      and column_name = 'vendor'
  ) then
    alter table public.gps_devices rename column provider_name to vendor;
  end if;
end
$$;

alter table public.gps_devices
  add column if not exists vendor text,
  add column if not exists model text,
  add column if not exists adapter_type text,
  add column if not exists protocol_type text,
  add column if not exists serial_number text,
  add column if not exists imei text,
  add column if not exists vendor_device_identifier text,
  add column if not exists custodian_driver_id uuid references public.drivers(id) on delete set null,
  add column if not exists installation_state text not null default 'pending',
  add column if not exists sim_provider_name text,
  add column if not exists firmware_version text,
  add column if not exists gps_readiness text not null default 'unknown',
  add column if not exists gsm_readiness text not null default 'unknown',
  add column if not exists external_power_status text not null default 'unknown',
  add column if not exists battery_status text not null default 'unknown',
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists last_telemetry_at timestamptz,
  add column if not exists admin_note text,
  add column if not exists updated_at timestamptz not null default now();

insert into public.audit_logs (
  actor_type, actor_id, action, entity_type, entity_id, safe_details
)
select
  'system', null, 'gps_device_legacy_vehicle_summary_quarantined',
  'gps_device', id,
  jsonb_build_object('gps_device_id', id, 'legacy_vehicle_id', vehicle_id)
from public.gps_devices
where vehicle_id is not null;

update public.gps_devices
set status = case status
  -- Legacy active rows require M20A identity, installation, and link review before activation.
  when 'active' then 'pending_setup'
  when 'inactive' then 'suspended'
  when 'not_connected' then 'pending_setup'
  when 'integration_pending' then 'pending_setup'
  else 'pending_setup'
end,
admin_note = coalesce(nullif(trim(admin_note), ''), nullif(trim(notes), '')),
vehicle_id = null,
updated_at = now();

alter table public.gps_devices
  alter column status type public.gps_device_status using status::public.gps_device_status,
  alter column status set default 'pending_setup'::public.gps_device_status;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.gps_devices'::regclass
      and conname = 'gps_devices_m20a_status_check'
  ) then
    alter table public.gps_devices
      add constraint gps_devices_m20a_status_check
      check (status in (
        'pending_setup'::public.gps_device_status,
        'active'::public.gps_device_status,
        'offline'::public.gps_device_status,
        'not_working'::public.gps_device_status,
        'suspended'::public.gps_device_status,
        'removed'::public.gps_device_status,
        'retired'::public.gps_device_status
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.gps_devices'::regclass
      and conname = 'gps_devices_installation_state_check'
  ) then
    alter table public.gps_devices
      add constraint gps_devices_installation_state_check
      check (installation_state in ('pending', 'planned', 'installed', 'removed', 'not_working'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.gps_devices'::regclass
      and conname = 'gps_devices_gps_readiness_check'
  ) then
    alter table public.gps_devices
      add constraint gps_devices_gps_readiness_check
      check (gps_readiness in ('unknown', 'ready', 'degraded', 'unavailable'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.gps_devices'::regclass
      and conname = 'gps_devices_gsm_readiness_check'
  ) then
    alter table public.gps_devices
      add constraint gps_devices_gsm_readiness_check
      check (gsm_readiness in ('unknown', 'ready', 'degraded', 'unavailable'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.gps_devices'::regclass
      and conname = 'gps_devices_external_power_status_check'
  ) then
    alter table public.gps_devices
      add constraint gps_devices_external_power_status_check
      check (external_power_status in ('unknown', 'connected', 'disconnected', 'not_applicable'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.gps_devices'::regclass
      and conname = 'gps_devices_battery_status_check'
  ) then
    alter table public.gps_devices
      add constraint gps_devices_battery_status_check
      check (battery_status in ('unknown', 'normal', 'low', 'critical', 'not_applicable'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.gps_devices'::regclass
      and conname = 'gps_devices_active_identity_check'
  ) then
    alter table public.gps_devices
      add constraint gps_devices_active_identity_check
      check (
        status <> 'active'::public.gps_device_status
        or (
          nullif(trim(device_code), '') is not null
          and nullif(trim(vendor), '') is not null
          and nullif(trim(model), '') is not null
          and nullif(trim(adapter_type), '') is not null
          and nullif(trim(protocol_type), '') is not null
          and installation_state = 'installed'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.gps_devices'::regclass
      and conname = 'gps_devices_adapter_protocol_check'
  ) then
    alter table public.gps_devices
      add constraint gps_devices_adapter_protocol_check check (
        (adapter_type is null and protocol_type is null)
        or (adapter_type = 'generic_http' and protocol_type = 'https')
        or (adapter_type = 'vendor_cloud' and protocol_type = 'vendor_managed')
        or (adapter_type = 'other' and protocol_type = 'other')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.gps_devices'::regclass
      and conname = 'gps_devices_safe_text_bounds_check'
  ) then
    alter table public.gps_devices
      add constraint gps_devices_safe_text_bounds_check check (
        char_length(device_code) between 1 and 64
        and (vendor is null or char_length(vendor) between 1 and 120)
        and (model is null or char_length(model) between 1 and 120)
        and (serial_number is null or char_length(serial_number) <= 128)
        and (imei is null or char_length(imei) <= 32)
        and (vendor_device_identifier is null or char_length(vendor_device_identifier) <= 128)
        and (sim_provider_name is null or char_length(sim_provider_name) <= 120)
        and (firmware_version is null or char_length(firmware_version) <= 120)
        and (admin_note is null or char_length(admin_note) <= 500)
      );
  end if;
end
$$;

create unique index if not exists gps_devices_active_serial_unique
  on public.gps_devices (lower(trim(serial_number)))
  where status not in (
    'removed'::public.gps_device_status,
    'retired'::public.gps_device_status
  ) and nullif(trim(serial_number), '') is not null;

create unique index if not exists gps_devices_active_imei_unique
  on public.gps_devices (lower(trim(imei)))
  where status not in (
    'removed'::public.gps_device_status,
    'retired'::public.gps_device_status
  ) and nullif(trim(imei), '') is not null;

create unique index if not exists gps_devices_active_vendor_identifier_unique
  on public.gps_devices (lower(trim(vendor)), lower(trim(vendor_device_identifier)))
  where status not in (
    'removed'::public.gps_device_status,
    'retired'::public.gps_device_status
  ) and nullif(trim(vendor_device_identifier), '') is not null;

comment on column public.gps_devices.vehicle_id is
  'Non-authoritative current-link summary. gps_device_vehicle_links is authoritative.';
comment on column public.gps_devices.custodian_driver_id is
  'Optional non-authoritative custodian/contact. Never overrides the active Ad Work assignment.';
comment on column public.gps_devices.ingest_token_hash is
  'Legacy server-only verification material. Never expose through browser or RPC responses.';

create table if not exists public.gps_device_vehicle_links (
  id uuid primary key default gen_random_uuid(),
  gps_device_id uuid not null references public.gps_devices(id) on delete restrict,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  is_primary boolean not null default true,
  effective_from timestamptz not null,
  effective_until timestamptz,
  installation_reference_note text,
  change_reason text not null,
  created_by_admin uuid not null references public.user_profiles(auth_user_id) on delete restrict,
  created_at timestamptz not null default now(),
  closed_by_admin uuid references public.user_profiles(auth_user_id) on delete restrict,
  closed_at timestamptz,
  constraint gps_device_vehicle_links_primary_check check (is_primary),
  constraint gps_device_vehicle_links_interval_check
    check (effective_until is null or effective_until > effective_from),
  constraint gps_device_vehicle_links_text_bounds_check check (
    char_length(change_reason) between 1 and 500
    and (installation_reference_note is null or char_length(installation_reference_note) <= 500)
  ),
  constraint gps_device_vehicle_links_closure_check check (
    (effective_until is null and closed_by_admin is null and closed_at is null)
    or (effective_until is not null and closed_by_admin is not null and closed_at is not null)
  )
);

comment on table public.gps_device_vehicle_links is
  'Authoritative effective-dated physical-device-to-vehicle history. Payload vehicle IDs have no authority.';

create unique index if not exists gps_device_vehicle_links_current_device_unique
  on public.gps_device_vehicle_links (gps_device_id)
  where is_primary and effective_until is null;

create unique index if not exists gps_device_vehicle_links_current_vehicle_unique
  on public.gps_device_vehicle_links (vehicle_id)
  where is_primary and effective_until is null;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.gps_device_vehicle_links'::regclass
      and conname = 'gps_device_vehicle_links_device_interval_excl'
  ) then
    alter table public.gps_device_vehicle_links
      add constraint gps_device_vehicle_links_device_interval_excl
      exclude using gist (
        gps_device_id with =,
        tstzrange(effective_from, coalesce(effective_until, 'infinity'::timestamptz), '[)') with &&
      ) where (is_primary);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.gps_device_vehicle_links'::regclass
      and conname = 'gps_device_vehicle_links_vehicle_interval_excl'
  ) then
    alter table public.gps_device_vehicle_links
      add constraint gps_device_vehicle_links_vehicle_interval_excl
      exclude using gist (
        vehicle_id with =,
        tstzrange(effective_from, coalesce(effective_until, 'infinity'::timestamptz), '[)') with &&
      ) where (is_primary);
  end if;
end
$$;

create index if not exists gps_device_vehicle_links_device_history_idx
  on public.gps_device_vehicle_links (gps_device_id, effective_from desc);

create index if not exists gps_device_vehicle_links_vehicle_history_idx
  on public.gps_device_vehicle_links (vehicle_id, effective_from desc);

create table if not exists public.gps_device_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  gps_device_id uuid not null references public.gps_devices(id) on delete restrict,
  vehicle_id uuid references public.vehicles(id) on delete restrict,
  event_type text not null,
  effective_at timestamptz not null,
  reason text,
  related_replacement_device_id uuid references public.gps_devices(id) on delete restrict,
  created_by_admin uuid not null references public.user_profiles(auth_user_id) on delete restrict,
  created_at timestamptz not null default now(),
  safe_note text,
  constraint gps_device_lifecycle_events_type_check check (event_type in (
    'registered',
    'installation_planned',
    'installed',
    'removed',
    'replaced',
    'lost',
    'stolen',
    'suspended',
    'reactivated',
    'marked_not_working',
    'marked_offline',
    'retired',
    'setup_reopened'
  )),
  constraint gps_device_lifecycle_events_replacement_check check (
    event_type <> 'replaced' or related_replacement_device_id is not null
  ),
  constraint gps_device_lifecycle_events_text_bounds_check check (
    (reason is null or char_length(reason) <= 500)
    and (safe_note is null or char_length(safe_note) <= 500)
  )
);

create index if not exists gps_device_lifecycle_events_device_history_idx
  on public.gps_device_lifecycle_events (gps_device_id, effective_at desc, created_at desc);

create table if not exists public.gps_device_credential_metadata (
  id uuid primary key default gen_random_uuid(),
  gps_device_id uuid not null references public.gps_devices(id) on delete restrict,
  credential_key_id text not null,
  status text not null default 'pending',
  verification_material_hash text,
  issued_at timestamptz,
  expires_at timestamptz,
  rotated_at timestamptz,
  revoked_at timestamptz,
  rotated_from_credential_id uuid references public.gps_device_credential_metadata(id) on delete restrict,
  last_verified_at timestamptz,
  admin_note text,
  created_by_admin uuid not null references public.user_profiles(auth_user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gps_device_credential_metadata_status_check
    check (status in ('pending', 'active', 'rotating', 'revoked', 'expired')),
  constraint gps_device_credential_metadata_key_check
    check (nullif(trim(credential_key_id), '') is not null),
  constraint gps_device_credential_metadata_expiry_check
    check (expires_at is null or issued_at is null or expires_at > issued_at),
  constraint gps_device_credential_metadata_revoked_check
    check (status <> 'revoked' or revoked_at is not null),
  constraint gps_device_credential_metadata_expired_check
    check (status <> 'expired' or expires_at is not null),
  constraint gps_device_credential_metadata_text_bounds_check check (
    char_length(credential_key_id) between 1 and 128
    and (admin_note is null or char_length(admin_note) <= 500)
  )
);

comment on column public.gps_device_credential_metadata.verification_material_hash is
  'Server-only optional verification material. M20A does not issue or accept credentials.';

create unique index if not exists gps_device_credential_metadata_key_unique
  on public.gps_device_credential_metadata (gps_device_id, lower(trim(credential_key_id)));

create unique index if not exists gps_device_credential_metadata_one_active
  on public.gps_device_credential_metadata (gps_device_id)
  where status = 'active';

create unique index if not exists gps_device_credential_metadata_one_rotating
  on public.gps_device_credential_metadata (gps_device_id)
  where status = 'rotating';

create index if not exists gps_device_credential_metadata_device_idx
  on public.gps_device_credential_metadata (gps_device_id, created_at desc);

create or replace function public.m20a_set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists gps_devices_m20a_set_updated_at on public.gps_devices;
create trigger gps_devices_m20a_set_updated_at
before update on public.gps_devices
for each row execute function public.m20a_set_updated_at();

drop trigger if exists gps_device_credential_metadata_set_updated_at
  on public.gps_device_credential_metadata;
create trigger gps_device_credential_metadata_set_updated_at
before update on public.gps_device_credential_metadata
for each row execute function public.m20a_set_updated_at();

create or replace function public.m20a_protect_device_history()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Physical device registry history cannot be deleted'
    using errcode = '55000';
end;
$$;

drop trigger if exists gps_devices_m20a_no_delete on public.gps_devices;
create trigger gps_devices_m20a_no_delete
before delete on public.gps_devices
for each row execute function public.m20a_protect_device_history();

drop trigger if exists gps_device_vehicle_links_no_delete on public.gps_device_vehicle_links;
create trigger gps_device_vehicle_links_no_delete
before delete on public.gps_device_vehicle_links
for each row execute function public.m20a_protect_device_history();

drop trigger if exists gps_device_lifecycle_events_no_delete on public.gps_device_lifecycle_events;
create trigger gps_device_lifecycle_events_no_delete
before delete on public.gps_device_lifecycle_events
for each row execute function public.m20a_protect_device_history();

drop trigger if exists gps_device_credential_metadata_no_delete
  on public.gps_device_credential_metadata;
create trigger gps_device_credential_metadata_no_delete
before delete on public.gps_device_credential_metadata
for each row execute function public.m20a_protect_device_history();

create or replace function public.m20a_protect_vehicle_link_history()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.effective_until is not null
    or new.effective_until is null
    or new.effective_until < old.effective_from
    or new.closed_by_admin is null
    or new.closed_at is null
    or new.gps_device_id is distinct from old.gps_device_id
    or new.vehicle_id is distinct from old.vehicle_id
    or new.is_primary is distinct from old.is_primary
    or new.effective_from is distinct from old.effective_from
    or new.installation_reference_note is distinct from old.installation_reference_note
    or new.change_reason is distinct from old.change_reason
    or new.created_by_admin is distinct from old.created_by_admin
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Historical device-to-vehicle links are immutable; only an open link may be closed once'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists gps_device_vehicle_links_protect_history
  on public.gps_device_vehicle_links;
create trigger gps_device_vehicle_links_protect_history
before update on public.gps_device_vehicle_links
for each row execute function public.m20a_protect_vehicle_link_history();

create or replace function public.m20a_protect_lifecycle_event_history()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Device lifecycle events are immutable'
    using errcode = '55000';
end;
$$;

drop trigger if exists gps_device_lifecycle_events_no_update
  on public.gps_device_lifecycle_events;
create trigger gps_device_lifecycle_events_no_update
before update on public.gps_device_lifecycle_events
for each row execute function public.m20a_protect_lifecycle_event_history();

alter table public.gps_devices enable row level security;
alter table public.gps_device_vehicle_links enable row level security;
alter table public.gps_device_lifecycle_events enable row level security;
alter table public.gps_device_credential_metadata enable row level security;

drop policy if exists "Admin users can insert gps devices" on public.gps_devices;
drop policy if exists "Admin users can update gps devices" on public.gps_devices;
drop policy if exists "Admin users can delete gps devices" on public.gps_devices;
drop policy if exists "Admin users can view gps devices" on public.gps_devices;
create policy "Admin users can view gps devices"
  on public.gps_devices for select to authenticated
  using (public.is_admin());

create policy "Admin users can view device vehicle links"
  on public.gps_device_vehicle_links for select to authenticated
  using (public.is_admin());

create policy "Admin users can view device lifecycle events"
  on public.gps_device_lifecycle_events for select to authenticated
  using (public.is_admin());

create policy "Admin users can view safe device credential metadata"
  on public.gps_device_credential_metadata for select to authenticated
  using (public.is_admin());

create or replace view public.gps_device_admin_list
with (security_invoker = true)
as
select
  id,
  device_code,
  status,
  vendor,
  model,
  adapter_type,
  protocol_type,
  case when serial_number is null then null
       when char_length(serial_number) <= 4 then '****'
       else '****' || right(serial_number, 4) end as serial_number,
  case when imei is null then null
       when char_length(imei) <= 4 then '****'
       else '****' || right(imei, 4) end as imei,
  case when vendor_device_identifier is null then null
       when char_length(vendor_device_identifier) <= 4 then '****'
       else '****' || right(vendor_device_identifier, 4) end as vendor_device_identifier,
  custodian_driver_id,
  installation_state,
  sim_provider_name,
  firmware_version,
  gps_readiness,
  gsm_readiness,
  external_power_status,
  battery_status,
  last_heartbeat_at,
  last_telemetry_at,
  null::text as admin_note,
  created_at,
  updated_at
from public.gps_devices;

revoke all on public.gps_device_admin_list from public, anon, authenticated;
grant select on public.gps_device_admin_list to authenticated;

revoke all on public.gps_devices from anon, authenticated;
revoke all on public.gps_device_vehicle_links from anon, authenticated;
revoke all on public.gps_device_lifecycle_events from anon, authenticated;
revoke all on public.gps_device_credential_metadata from anon, authenticated;

grant select (
  id, device_code, vendor, model, adapter_type, protocol_type, serial_number, imei,
  vendor_device_identifier, custodian_driver_id, vehicle_id, status,
  installation_state, sim_provider_name, firmware_version, gps_readiness,
  gsm_readiness, external_power_status, battery_status, last_heartbeat_at,
  last_telemetry_at, admin_note, notes, created_at, updated_at
) on public.gps_devices to authenticated;

grant select on public.gps_device_vehicle_links to authenticated;
grant select on public.gps_device_lifecycle_events to authenticated;
grant select (
  id, gps_device_id, credential_key_id, status, issued_at, expires_at, rotated_at,
  revoked_at, rotated_from_credential_id, last_verified_at, admin_note,
  created_by_admin, created_at, updated_at
) on public.gps_device_credential_metadata to authenticated;

create or replace function public.m20a_require_admin()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.user_profiles profile
    where profile.auth_user_id = v_actor_id
  ) then
    raise exception 'Admin profile not found' using errcode = 'P0002';
  end if;
  return v_actor_id;
end;
$$;

create or replace function public.m20a_require_reason(p_reason text)
returns text
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_reason is null then
    raise exception 'A reason is required for this action' using errcode = '22023';
  end if;
  if char_length(v_reason) > 500 or v_reason ~ '[[:cntrl:]]' then
    raise exception 'Reason must be safe plain text of at most 500 characters'
      using errcode = '22023';
  end if;
  return v_reason;
end;
$$;

create or replace function public.m20a_validate_safe_text(
  p_value text,
  p_label text,
  p_max_length integer,
  p_required boolean default false
)
returns text
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v_value text := nullif(trim(coalesce(p_value, '')), '');
begin
  if p_required and v_value is null then
    raise exception '% is required', p_label using errcode = '22023';
  end if;
  if v_value is not null and (
    char_length(v_value) > p_max_length
    or v_value ~ '[[:cntrl:]]'
  ) then
    raise exception '% must be safe plain text of at most % characters',
      p_label, p_max_length using errcode = '22023';
  end if;
  return v_value;
end;
$$;

create or replace function public.m20a_validate_adapter_protocol(
  p_adapter_type text,
  p_protocol_type text
)
returns void
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
begin
  if not (
    (p_adapter_type = 'generic_http' and p_protocol_type = 'https')
    or (p_adapter_type = 'vendor_cloud' and p_protocol_type = 'vendor_managed')
    or (p_adapter_type = 'other' and p_protocol_type = 'other')
  ) then
    raise exception 'Unsupported adapter and protocol combination'
      using errcode = '22023';
  end if;
end;
$$;

create or replace function public.m20a_gps_device_is_proof_ready(p_device_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare
  v_ready boolean;
begin
  perform public.m20a_require_admin();
  select (
    d.status = 'active'::public.gps_device_status
    and d.installation_state = 'installed'
    and d.gps_readiness = 'ready'
    and d.gsm_readiness in ('ready', 'degraded')
    and nullif(trim(d.vendor), '') is not null
    and nullif(trim(d.model), '') is not null
    and nullif(trim(d.adapter_type), '') is not null
    and nullif(trim(d.protocol_type), '') is not null
    and exists (
      select 1 from public.gps_device_vehicle_links l
      where l.gps_device_id = d.id
        and l.is_primary
        and l.effective_from <= clock_timestamp()
        and l.effective_until is null
    )
    and exists (
      select 1 from public.gps_device_credential_metadata c
      where c.gps_device_id = d.id
        and c.status = 'active'
        and nullif(trim(c.verification_material_hash), '') is not null
        and (c.expires_at is null or c.expires_at > clock_timestamp())
        and c.revoked_at is null
    )
  )
  into v_ready
  from public.gps_devices d
  where d.id = p_device_id;
  return coalesce(v_ready, false);
end;
$$;

create or replace function public.admin_register_gps_device(
  p_device_code text,
  p_vendor text,
  p_model text,
  p_adapter_type text,
  p_protocol_type text,
  p_serial_number text default null,
  p_imei text default null,
  p_vendor_device_identifier text default null,
  p_custodian_driver_id uuid default null,
  p_sim_provider_name text default null,
  p_firmware_version text default null,
  p_admin_note text default null
)
returns table(gps_device_id uuid, result_message text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := public.m20a_require_admin();
  v_device_id uuid;
begin
  perform public.m20a_validate_safe_text(p_device_code, 'Device code', 64, true);
  perform public.m20a_validate_safe_text(p_vendor, 'Vendor', 120, true);
  perform public.m20a_validate_safe_text(p_model, 'Model', 120, true);
  perform public.m20a_validate_safe_text(p_serial_number, 'Serial number', 128);
  perform public.m20a_validate_safe_text(p_imei, 'IMEI', 32);
  perform public.m20a_validate_safe_text(p_vendor_device_identifier, 'Vendor device identifier', 128);
  perform public.m20a_validate_safe_text(p_sim_provider_name, 'SIM provider', 120);
  perform public.m20a_validate_safe_text(p_firmware_version, 'Firmware version', 120);
  perform public.m20a_validate_safe_text(p_admin_note, 'Admin note', 500);
  perform public.m20a_validate_adapter_protocol(trim(p_adapter_type), trim(p_protocol_type));
  if nullif(trim(coalesce(p_device_code, '')), '') is null then
    raise exception 'Device code is required' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_vendor, '')), '') is null
    or nullif(trim(coalesce(p_model, '')), '') is null
    or nullif(trim(coalesce(p_adapter_type, '')), '') is null
    or nullif(trim(coalesce(p_protocol_type, '')), '') is null
  then
    raise exception 'Vendor, model, adapter type and protocol type are required'
      using errcode = '22023';
  end if;
  if p_custodian_driver_id is not null
    and not exists (select 1 from public.drivers where id = p_custodian_driver_id)
  then
    raise exception 'Custodian driver not found' using errcode = 'P0002';
  end if;


  insert into public.gps_devices (
    device_code, vendor, model, adapter_type, protocol_type, serial_number, imei,
    vendor_device_identifier, custodian_driver_id, status, installation_state,
    sim_provider_name, firmware_version, admin_note
  ) values (
    trim(p_device_code), trim(p_vendor), trim(p_model), trim(p_adapter_type),
    trim(p_protocol_type), nullif(trim(coalesce(p_serial_number, '')), ''),
    nullif(trim(coalesce(p_imei, '')), ''),
    nullif(trim(coalesce(p_vendor_device_identifier, '')), ''),
    p_custodian_driver_id, 'pending_setup', 'pending',
    nullif(trim(coalesce(p_sim_provider_name, '')), ''),
    nullif(trim(coalesce(p_firmware_version, '')), ''),
    nullif(trim(coalesce(p_admin_note, '')), '')
  )
  returning id into v_device_id;

  insert into public.gps_device_lifecycle_events (
    gps_device_id, event_type, effective_at, reason, created_by_admin, safe_note
  ) values (
    v_device_id, 'registered', clock_timestamp(), 'Device registered',
    v_actor_id, nullif(trim(coalesce(p_admin_note, '')), '')
  );

  insert into public.audit_logs (
    actor_type, actor_id, action, entity_type, entity_id, safe_details
  ) values (
    'admin', v_actor_id, 'gps_device_registered', 'gps_device', v_device_id,
    jsonb_build_object('gps_device_id', v_device_id, 'status', 'pending_setup')
  );

  return query select v_device_id, 'Device registered.'::text;
end;
$$;

create or replace function public.admin_update_gps_device(
  p_device_id uuid,
  p_device_code text,
  p_vendor text,
  p_model text,
  p_adapter_type text,
  p_protocol_type text,
  p_serial_number text default null,
  p_imei text default null,
  p_vendor_device_identifier text default null,
  p_custodian_driver_id uuid default null,
  p_sim_provider_name text default null,
  p_firmware_version text default null,
  p_admin_note text default null
)
returns table(gps_device_id uuid, result_message text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := public.m20a_require_admin();
  v_device public.gps_devices%rowtype;
begin
  perform public.m20a_validate_safe_text(p_device_code, 'Device code', 64, true);
  perform public.m20a_validate_safe_text(p_vendor, 'Vendor', 120, true);
  perform public.m20a_validate_safe_text(p_model, 'Model', 120, true);
  perform public.m20a_validate_safe_text(p_serial_number, 'Serial number', 128);
  perform public.m20a_validate_safe_text(p_imei, 'IMEI', 32);
  perform public.m20a_validate_safe_text(p_vendor_device_identifier, 'Vendor device identifier', 128);
  perform public.m20a_validate_safe_text(p_sim_provider_name, 'SIM provider', 120);
  perform public.m20a_validate_safe_text(p_firmware_version, 'Firmware version', 120);
  perform public.m20a_validate_safe_text(p_admin_note, 'Admin note', 500);
  perform public.m20a_validate_adapter_protocol(trim(p_adapter_type), trim(p_protocol_type));
  select * into v_device from public.gps_devices
  where id = p_device_id for update;
  if not found then
    raise exception 'Device not found' using errcode = 'P0002';
  end if;
  if v_device.status = 'retired'::public.gps_device_status then
    raise exception 'Retired devices cannot be edited in the normal flow'
      using errcode = '55000';
  end if;
  if nullif(trim(coalesce(p_device_code, '')), '') is null
    or nullif(trim(coalesce(p_vendor, '')), '') is null
    or nullif(trim(coalesce(p_model, '')), '') is null
    or nullif(trim(coalesce(p_adapter_type, '')), '') is null
    or nullif(trim(coalesce(p_protocol_type, '')), '') is null
  then
    raise exception 'Device code, vendor, model, adapter type and protocol type are required'
      using errcode = '22023';
  end if;
  if p_custodian_driver_id is not null
    and not exists (select 1 from public.drivers where id = p_custodian_driver_id)
  then
    raise exception 'Custodian driver not found' using errcode = 'P0002';
  end if;

  if (
    trim(p_device_code) is distinct from v_device.device_code
    or trim(p_vendor) is distinct from v_device.vendor
    or trim(p_model) is distinct from v_device.model
    or trim(p_adapter_type) is distinct from v_device.adapter_type
    or trim(p_protocol_type) is distinct from v_device.protocol_type
    or nullif(trim(coalesce(p_serial_number, '')), '') is distinct from v_device.serial_number
    or nullif(trim(coalesce(p_imei, '')), '') is distinct from v_device.imei
    or nullif(trim(coalesce(p_vendor_device_identifier, '')), '') is distinct from v_device.vendor_device_identifier
  ) and (
    v_device.status <> 'pending_setup'::public.gps_device_status
    or v_device.installation_state <> 'pending'
    or exists (
      select 1 from public.gps_device_vehicle_links links
      where links.gps_device_id = p_device_id
    )
  ) then
    raise exception 'Hardware identity cannot be edited after installation or vehicle linking; use device replacement'
      using errcode = '55000';
  end if;

  update public.gps_devices set
    device_code = trim(p_device_code),
    vendor = trim(p_vendor),
    model = trim(p_model),
    adapter_type = trim(p_adapter_type),
    protocol_type = trim(p_protocol_type),
    serial_number = nullif(trim(coalesce(p_serial_number, '')), ''),
    imei = nullif(trim(coalesce(p_imei, '')), ''),
    vendor_device_identifier = nullif(trim(coalesce(p_vendor_device_identifier, '')), ''),
    custodian_driver_id = p_custodian_driver_id,
    sim_provider_name = nullif(trim(coalesce(p_sim_provider_name, '')), ''),
    firmware_version = nullif(trim(coalesce(p_firmware_version, '')), ''),
    admin_note = nullif(trim(coalesce(p_admin_note, '')), '')
  where id = p_device_id;

  insert into public.audit_logs (
    actor_type, actor_id, action, entity_type, entity_id, safe_details
  ) values (
    'admin', v_actor_id, 'gps_device_identity_changed', 'gps_device', p_device_id,
    jsonb_build_object('gps_device_id', p_device_id)
  );

  return query select p_device_id, 'Device updated.'::text;
end;
$$;

create or replace function public.admin_change_gps_device_status(
  p_device_id uuid,
  p_status text,
  p_reason text default null
)
returns table(gps_device_id uuid, result_message text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := public.m20a_require_admin();
  v_device public.gps_devices%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_event_type text;
begin
  perform public.m20a_validate_safe_text(p_reason, 'Reason', 500);
  if p_status not in (
    'pending_setup', 'active', 'offline', 'not_working',
    'suspended', 'removed', 'retired'
  ) then
    raise exception 'Invalid device status' using errcode = '22023';
  end if;

  select * into v_device from public.gps_devices
  where id = p_device_id for update;
  if not found then
    raise exception 'Device not found' using errcode = 'P0002';
  end if;
  if v_device.status::text = p_status then
    raise exception 'Device already has that status' using errcode = '22023';
  end if;
  if v_device.status = 'retired'::public.gps_device_status then
    raise exception 'Retired is terminal in the normal lifecycle'
      using errcode = '55000';
  end if;

  if not (
    (v_device.status = 'pending_setup' and p_status in ('active', 'suspended', 'removed', 'retired'))
    or (v_device.status = 'active' and p_status in ('offline', 'not_working', 'suspended', 'removed', 'retired'))
    or (v_device.status = 'offline' and p_status in ('active', 'not_working', 'suspended', 'removed', 'retired'))
    or (v_device.status = 'not_working' and p_status in ('active', 'suspended', 'removed', 'retired'))
    or (v_device.status = 'suspended' and p_status in ('active', 'removed', 'retired'))
    or (v_device.status = 'removed' and p_status in ('pending_setup', 'retired'))
  ) then
    raise exception 'Blocked device lifecycle transition: % to %', v_device.status, p_status
      using errcode = '55000';
  end if;

  if p_status in ('suspended', 'removed', 'retired')
    or (p_status = 'active' and v_device.status in (
      'offline'::public.gps_device_status,
      'not_working'::public.gps_device_status,
      'suspended'::public.gps_device_status
    ))
    or (p_status = 'pending_setup' and v_device.status = 'removed'::public.gps_device_status)
  then
    v_reason := public.m20a_require_reason(v_reason);
  end if;

  if p_status = 'active' then
    if v_device.installation_state <> 'installed'
      or nullif(trim(v_device.vendor), '') is null
      or nullif(trim(v_device.model), '') is null
      or nullif(trim(v_device.adapter_type), '') is null
      or nullif(trim(v_device.protocol_type), '') is null
      or not exists (
        select 1 from public.gps_device_vehicle_links links
        where links.gps_device_id = p_device_id
          and links.is_primary
          and links.effective_from <= clock_timestamp()
          and links.effective_until is null
      )
    then
      raise exception 'Active requires complete identity, installed state and a current vehicle link'
        using errcode = '55000';
    end if;
  end if;

  if p_status in ('removed', 'retired') then
    insert into public.audit_logs (
      actor_type, actor_id, action, entity_type, entity_id, safe_details
    )
    select
      'admin', v_actor_id, 'gps_device_vehicle_link_closed',
      'gps_device_vehicle_link', links.id,
      jsonb_build_object(
        'gps_device_id', p_device_id,
        'vehicle_id', links.vehicle_id,
        'reason', v_reason
      )
    from public.gps_device_vehicle_links links
    where links.gps_device_id = p_device_id
      and links.is_primary
      and links.effective_until is null;

    update public.gps_device_vehicle_links links
    set effective_until = greatest(links.effective_from, clock_timestamp()),
        closed_by_admin = v_actor_id,
        closed_at = clock_timestamp()
    where links.gps_device_id = p_device_id
      and links.is_primary
      and links.effective_until is null;
  end if;

  if p_status in ('suspended', 'removed', 'retired') then
    update public.gps_device_credential_metadata credentials
    set status = 'revoked',
        revoked_at = coalesce(credentials.revoked_at, clock_timestamp())
    where credentials.gps_device_id = p_device_id
      and credentials.status in ('pending', 'active', 'rotating');
  end if;

  update public.gps_devices
  set status = p_status::public.gps_device_status,
      installation_state = case
        when p_status in ('removed', 'retired') then 'removed'
        when p_status = 'not_working' then 'not_working'
        when p_status = 'pending_setup' then 'pending'
        else installation_state
      end,
      vehicle_id = case when p_status in ('removed', 'retired') then null else vehicle_id end
  where id = p_device_id;

  v_event_type := case
    when p_status = 'offline' then 'marked_offline'
    when p_status = 'not_working' then 'marked_not_working'
    when p_status = 'suspended' then 'suspended'
    when p_status = 'removed' then 'removed'
    when p_status = 'retired' then 'retired'
    when p_status = 'pending_setup' then 'setup_reopened'
    else 'reactivated'
  end;

  insert into public.gps_device_lifecycle_events (
    gps_device_id, vehicle_id, event_type, effective_at, reason, created_by_admin
  ) values (
    p_device_id, v_device.vehicle_id, v_event_type, clock_timestamp(),
    coalesce(v_reason, 'Lifecycle state changed'), v_actor_id
  );

  insert into public.audit_logs (
    actor_type, actor_id, action, entity_type, entity_id, safe_details
  ) values (
    'admin', v_actor_id, 'gps_device_status_changed', 'gps_device', p_device_id,
    jsonb_build_object(
      'gps_device_id', p_device_id,
      'from_status', v_device.status::text,
      'to_status', p_status,
      'reason', v_reason
    )
  );

  return query select p_device_id, 'Device status updated.'::text;
end;
$$;

create or replace function public.admin_link_gps_device_vehicle(
  p_device_id uuid,
  p_vehicle_id uuid,
  p_effective_from timestamptz default now(),
  p_note text default null,
  p_reason text default null
)
returns table(link_id uuid, result_message text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := public.m20a_require_admin();
  v_device public.gps_devices%rowtype;
  v_existing public.gps_device_vehicle_links%rowtype;
  v_link_id uuid;
  v_reason text;
begin
  perform public.m20a_validate_safe_text(p_note, 'Installation note', 500);
  perform public.m20a_validate_safe_text(p_reason, 'Reason', 500);
  if p_effective_from is null then
    raise exception 'Effective-from time is required' using errcode = '22023';
  end if;
  if p_effective_from > clock_timestamp() then
    raise exception 'Vehicle links cannot start in the future' using errcode = '22023';
  end if;

  select * into v_device from public.gps_devices
  where id = p_device_id for update;
  if not found then raise exception 'Device not found' using errcode = 'P0002'; end if;
  if p_effective_from < v_device.created_at
    or p_effective_from < coalesce((
      select max(effective_at) from public.gps_device_lifecycle_events
      where gps_device_id = p_device_id
    ), v_device.created_at)
  then
    raise exception 'Vehicle link cannot predate device history'
      using errcode = '22023';
  end if;
  if v_device.status in (
    'suspended'::public.gps_device_status,
    'removed'::public.gps_device_status,
    'retired'::public.gps_device_status
  ) then
    raise exception 'Device must be eligible for setup before linking'
      using errcode = '55000';
  end if;

  perform 1 from public.vehicles where id = p_vehicle_id for update;
  if not found then raise exception 'Vehicle not found' using errcode = 'P0002'; end if;

  select * into v_existing
  from public.gps_device_vehicle_links
  where gps_device_id = p_device_id and is_primary and effective_until is null
  for update;

  if found then
    if v_existing.vehicle_id = p_vehicle_id then
      raise exception 'Device is already linked to that vehicle' using errcode = '22023';
    end if;
    v_reason := public.m20a_require_reason(p_reason);
    if p_effective_from <= v_existing.effective_from then
      raise exception 'Reassignment cannot predate the current link'
        using errcode = '22023';
    end if;
    update public.gps_device_vehicle_links
    set effective_until = p_effective_from,
        closed_by_admin = v_actor_id,
        closed_at = clock_timestamp()
    where id = v_existing.id;
  else
    v_reason := coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'Initial vehicle link');
  end if;

  if exists (
    select 1 from public.gps_device_vehicle_links
    where vehicle_id = p_vehicle_id and is_primary and effective_until is null
  ) then
    raise exception 'Vehicle already has a current primary physical device'
      using errcode = '23505';
  end if;

  insert into public.gps_device_vehicle_links (
    gps_device_id, vehicle_id, effective_from, installation_reference_note,
    change_reason, created_by_admin
  ) values (
    p_device_id, p_vehicle_id, p_effective_from,
    nullif(trim(coalesce(p_note, '')), ''), v_reason, v_actor_id
  ) returning id into v_link_id;

  update public.gps_devices
  set vehicle_id = p_vehicle_id,
      status = case
        when status = 'active'::public.gps_device_status
          then 'pending_setup'::public.gps_device_status
        else status
      end,
      installation_state = 'planned'
  where id = p_device_id;

  if v_device.status = 'active'::public.gps_device_status then
    insert into public.audit_logs (
      actor_type, actor_id, action, entity_type, entity_id, safe_details
    ) values (
      'admin', v_actor_id, 'gps_device_status_changed', 'gps_device', p_device_id,
      jsonb_build_object(
        'gps_device_id', p_device_id,
        'from_status', 'active',
        'to_status', 'pending_setup',
        'reason', 'Vehicle link change requires installation confirmation'
      )
    );
  end if;

  insert into public.gps_device_lifecycle_events (
    gps_device_id, vehicle_id, event_type, effective_at, reason,
    created_by_admin, safe_note
  ) values (
    p_device_id, p_vehicle_id, 'installation_planned', p_effective_from,
    v_reason, v_actor_id, nullif(trim(coalesce(p_note, '')), '')
  );

  insert into public.audit_logs (
    actor_type, actor_id, action, entity_type, entity_id, safe_details
  ) values (
    'admin', v_actor_id,
    case when v_existing.id is null then 'gps_device_vehicle_linked'
         else 'gps_device_vehicle_reassigned' end,
    'gps_device_vehicle_link', v_link_id,
    jsonb_build_object(
      'gps_device_id', p_device_id,
      'vehicle_id', p_vehicle_id,
      'previous_link_id', v_existing.id,
      'reason', v_reason
    )
  );

  return query select v_link_id,
    case when v_existing.id is null then 'Vehicle linked.'
         else 'Vehicle reassigned.' end::text;
end;
$$;

create or replace function public.admin_remove_gps_device_vehicle(
  p_device_id uuid,
  p_effective_until timestamptz default now(),
  p_reason text default null,
  p_note text default null
)
returns table(link_id uuid, result_message text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := public.m20a_require_admin();
  v_reason text := public.m20a_require_reason(p_reason);
  v_device public.gps_devices%rowtype;
  v_link public.gps_device_vehicle_links%rowtype;
begin
  perform public.m20a_validate_safe_text(p_note, 'Removal note', 500);
  select * into v_device from public.gps_devices
  where id = p_device_id for update;
  if not found then raise exception 'Device not found' using errcode = 'P0002'; end if;

  select * into v_link from public.gps_device_vehicle_links
  where gps_device_id = p_device_id and is_primary and effective_until is null
  for update;
  if not found then raise exception 'Device has no current vehicle link' using errcode = 'P0002'; end if;
  if p_effective_until is null or p_effective_until <= v_link.effective_from
    or p_effective_until > clock_timestamp()
    or p_effective_until < coalesce((
      select max(effective_at) from public.gps_device_lifecycle_events
      where gps_device_id = p_device_id
    ), v_link.effective_from)
  then
    raise exception 'Invalid effective-until time' using errcode = '22023';
  end if;

  update public.gps_device_vehicle_links
  set effective_until = p_effective_until,
      closed_by_admin = v_actor_id,
      closed_at = clock_timestamp()
  where id = v_link.id;

  update public.gps_devices
  set vehicle_id = null,
      status = 'removed',
      installation_state = 'removed'
  where id = p_device_id;

  update public.gps_device_credential_metadata
  set status = 'revoked', revoked_at = coalesce(revoked_at, clock_timestamp())
  where gps_device_id = p_device_id and status in ('pending', 'active', 'rotating');

  insert into public.gps_device_lifecycle_events (
    gps_device_id, vehicle_id, event_type, effective_at, reason,
    created_by_admin, safe_note
  ) values (
    p_device_id, v_link.vehicle_id, 'removed', p_effective_until,
    v_reason, v_actor_id, nullif(trim(coalesce(p_note, '')), '')
  );

  insert into public.audit_logs (
    actor_type, actor_id, action, entity_type, entity_id, safe_details
  ) values (
    'admin', v_actor_id, 'gps_device_vehicle_link_removed',
    'gps_device_vehicle_link', v_link.id,
    jsonb_build_object(
      'gps_device_id', p_device_id,
      'vehicle_id', v_link.vehicle_id,
      'reason', v_reason
    )
  );

  return query select v_link.id, 'Vehicle link removed.'::text;
end;
$$;

create or replace function public.admin_record_gps_device_event(
  p_device_id uuid,
  p_event_type text,
  p_effective_at timestamptz default now(),
  p_vehicle_id uuid default null,
  p_related_device_id uuid default null,
  p_reason text default null,
  p_note text default null
)
returns table(event_id uuid, result_message text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := public.m20a_require_admin();
  v_device public.gps_devices%rowtype;
  v_event_id uuid;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_vehicle_id uuid;
begin
  perform public.m20a_validate_safe_text(p_note, 'Lifecycle note', 500);
  perform public.m20a_validate_safe_text(p_reason, 'Reason', 500);
  if p_event_type not in (
    'installation_planned', 'installed', 'removed', 'lost', 'stolen',
    'suspended', 'reactivated', 'marked_not_working', 'marked_offline',
    'retired', 'setup_reopened'
  ) then
    raise exception 'Invalid lifecycle event type' using errcode = '22023';
  end if;
  if p_effective_at is null then
    raise exception 'Effective time is required' using errcode = '22023';
  end if;
  if p_effective_at > clock_timestamp() then
    raise exception 'Lifecycle events cannot be future dated'
      using errcode = '22023';
  end if;
  if p_event_type in (
    'removed', 'lost', 'stolen', 'suspended', 'reactivated',
    'marked_not_working', 'retired', 'setup_reopened'
  ) then
    v_reason := public.m20a_require_reason(v_reason);
  end if;

  select * into v_device from public.gps_devices
  where id = p_device_id for update;
  if not found then raise exception 'Device not found' using errcode = 'P0002'; end if;
  if p_effective_at < v_device.created_at
    or p_effective_at < coalesce((
      select max(effective_at) from public.gps_device_lifecycle_events
      where gps_device_id = p_device_id
    ), v_device.created_at)
  then
    raise exception 'Lifecycle event cannot predate device history'
      using errcode = '22023';
  end if;
  if v_device.status = 'retired'::public.gps_device_status then
    raise exception 'Retired devices cannot receive normal lifecycle events'
      using errcode = '55000';
  end if;
  select links.vehicle_id into v_vehicle_id
  from public.gps_device_vehicle_links links
  where links.gps_device_id = p_device_id
    and links.is_primary
    and links.effective_from <= p_effective_at
    and (links.effective_until is null or links.effective_until > p_effective_at)
  order by links.effective_from desc
  limit 1;
  if p_vehicle_id is not null and p_vehicle_id is distinct from v_vehicle_id then
    raise exception 'Lifecycle vehicle must match authoritative link history'
      using errcode = '22023';
  end if;

  if p_event_type = 'installation_planned'
    and v_device.status::text not in ('pending_setup', 'offline')
  then
    raise exception 'Installation planning requires pending setup or offline status'
      using errcode = '55000';
  elsif p_event_type = 'installed'
    and v_device.status::text not in ('pending_setup', 'offline', 'active', 'not_working', 'suspended')
  then
    raise exception 'Installation cannot be recorded from the current status'
      using errcode = '55000';
  elsif p_event_type in ('lost', 'stolen', 'suspended')
    and v_device.status::text not in ('pending_setup', 'active', 'offline', 'not_working')
  then
    raise exception 'Suspension event cannot be recorded from the current status'
      using errcode = '55000';
  elsif p_event_type = 'marked_not_working'
    and v_device.status::text not in ('active', 'offline')
  then
    raise exception 'Not-working status requires an active or offline device'
      using errcode = '55000';
  elsif p_event_type = 'marked_offline'
    and v_device.status::text <> 'active'
  then
    raise exception 'Offline status requires an active device'
      using errcode = '55000';
  end if;

  if p_event_type = 'installed' then
    if not exists (
      select 1 from public.gps_device_vehicle_links
      where gps_device_id = p_device_id
        and vehicle_id = v_vehicle_id
        and is_primary
        and effective_from <= p_effective_at
        and effective_until is null
    ) then
      raise exception 'Installation requires a matching current vehicle link'
        using errcode = '55000';
    end if;
    update public.gps_devices set installation_state = 'installed'
    where id = p_device_id;
  elsif p_event_type = 'installation_planned' then
    update public.gps_devices set installation_state = 'planned'
    where id = p_device_id;
  elsif p_event_type in ('lost', 'stolen', 'suspended') then
    if v_device.status = 'retired'::public.gps_device_status then
      raise exception 'Retired is terminal' using errcode = '55000';
    end if;
    update public.gps_devices set status = 'suspended'
    where id = p_device_id;
    update public.gps_device_credential_metadata
    set status = 'revoked', revoked_at = coalesce(revoked_at, clock_timestamp())
    where gps_device_id = p_device_id and status in ('pending', 'active', 'rotating');
  elsif p_event_type = 'marked_not_working' then
    update public.gps_devices
    set status = 'not_working', installation_state = 'not_working'
    where id = p_device_id;
  elsif p_event_type = 'marked_offline' then
    update public.gps_devices set status = 'offline'
    where id = p_device_id;
  elsif p_event_type in ('removed', 'retired') then
    perform public.admin_change_gps_device_status(p_device_id, p_event_type, v_reason);
    return query
      select e.id, 'Device lifecycle recorded.'::text
      from public.gps_device_lifecycle_events e
      where e.gps_device_id = p_device_id and e.event_type = p_event_type
      order by e.created_at desc limit 1;
    return;
  elsif p_event_type in ('reactivated', 'setup_reopened') then
    perform public.admin_change_gps_device_status(
      p_device_id,
      case when p_event_type = 'reactivated' then 'active' else 'pending_setup' end,
      v_reason
    );
    return query
      select e.id, 'Device lifecycle recorded.'::text
      from public.gps_device_lifecycle_events e
      where e.gps_device_id = p_device_id and e.event_type = p_event_type
      order by e.created_at desc limit 1;
    return;
  end if;

  insert into public.gps_device_lifecycle_events (
    gps_device_id, vehicle_id, event_type, effective_at, reason,
    related_replacement_device_id, created_by_admin, safe_note
  ) values (
    p_device_id, v_vehicle_id, p_event_type,
    p_effective_at, coalesce(v_reason, 'Lifecycle event recorded'),
    p_related_device_id, v_actor_id, nullif(trim(coalesce(p_note, '')), '')
  ) returning id into v_event_id;

  insert into public.audit_logs (
    actor_type, actor_id, action, entity_type, entity_id, safe_details
  ) values (
    'admin', v_actor_id, 'gps_device_lifecycle_event_recorded',
    'gps_device_lifecycle_event', v_event_id,
    jsonb_build_object(
      'gps_device_id', p_device_id,
      'event_type', p_event_type,
      'reason', v_reason
    )
  );

  return query select v_event_id, 'Device lifecycle recorded.'::text;
end;
$$;

create or replace function public.admin_replace_gps_device(
  p_old_device_id uuid,
  p_new_device_id uuid,
  p_vehicle_id uuid,
  p_effective_at timestamptz default now(),
  p_reason text default null,
  p_note text default null
)
returns table(old_device_id uuid, new_device_id uuid, new_link_id uuid, result_message text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := public.m20a_require_admin();
  v_reason text := public.m20a_require_reason(p_reason);
  v_old public.gps_devices%rowtype;
  v_new public.gps_devices%rowtype;
  v_old_link public.gps_device_vehicle_links%rowtype;
  v_new_link_id uuid;
begin
  perform public.m20a_validate_safe_text(p_note, 'Replacement note', 500);
  if p_old_device_id = p_new_device_id then
    raise exception 'Replacement devices must be different' using errcode = '22023';
  end if;
  if p_effective_at is not null and p_effective_at > clock_timestamp() then
    raise exception 'Replacement cannot be future dated' using errcode = '22023';
  end if;
  if p_effective_at is null then
    raise exception 'Effective time is required' using errcode = '22023';
  end if;

  perform 1 from public.vehicles where id = p_vehicle_id for update;
  if not found then raise exception 'Vehicle not found' using errcode = 'P0002'; end if;

  select * into v_old from public.gps_devices
  where id = p_old_device_id for update;
  if not found then raise exception 'Old device not found' using errcode = 'P0002'; end if;
  select * into v_new from public.gps_devices
  where id = p_new_device_id for update;
  if not found then raise exception 'New device not found' using errcode = 'P0002'; end if;

  if v_new.status in (
    'suspended'::public.gps_device_status,
    'not_working'::public.gps_device_status,
    'removed'::public.gps_device_status,
    'retired'::public.gps_device_status
  ) then
    raise exception 'New device is not eligible for replacement installation'
      using errcode = '55000';
  end if;
  if nullif(trim(v_new.vendor), '') is null
    or nullif(trim(v_new.model), '') is null
    or nullif(trim(v_new.adapter_type), '') is null
    or nullif(trim(v_new.protocol_type), '') is null
  then
    raise exception 'New device identity is incomplete' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.gps_device_vehicle_links
    where gps_device_id = p_new_device_id and is_primary and effective_until is null
  ) then
    raise exception 'New device already has a current vehicle link'
      using errcode = '23505';
  end if;

  select * into v_old_link from public.gps_device_vehicle_links
  where gps_device_id = p_old_device_id
    and vehicle_id = p_vehicle_id
    and is_primary
    and effective_until is null
  for update;
  if not found then
    raise exception 'Old device is not currently linked to the selected vehicle'
      using errcode = 'P0002';
  end if;
  if p_effective_at <= v_old_link.effective_from
    or p_effective_at < v_new.created_at
    or p_effective_at < coalesce((
      select max(effective_at) from public.gps_device_lifecycle_events
      where gps_device_id in (p_old_device_id, p_new_device_id)
    ), p_effective_at)
  then
    raise exception 'Replacement cannot predate device or link history'
      using errcode = '22023';
  end if;

  update public.gps_device_vehicle_links
  set effective_until = p_effective_at,
      closed_by_admin = v_actor_id,
      closed_at = clock_timestamp()
  where id = v_old_link.id;

  update public.gps_devices
  set status = 'removed', installation_state = 'removed', vehicle_id = null
  where id = p_old_device_id;

  update public.gps_device_credential_metadata
  set status = 'revoked', revoked_at = coalesce(revoked_at, clock_timestamp())
  where gps_device_id = p_old_device_id and status in ('pending', 'active', 'rotating');

  insert into public.gps_device_vehicle_links (
    gps_device_id, vehicle_id, effective_from, installation_reference_note,
    change_reason, created_by_admin
  ) values (
    p_new_device_id, p_vehicle_id, p_effective_at,
    nullif(trim(coalesce(p_note, '')), ''), v_reason, v_actor_id
  ) returning id into v_new_link_id;

  update public.gps_devices
  set status = 'active', installation_state = 'installed', vehicle_id = p_vehicle_id
  where id = p_new_device_id;

  insert into public.gps_device_lifecycle_events (
    gps_device_id, vehicle_id, event_type, effective_at, reason,
    related_replacement_device_id, created_by_admin, safe_note
  ) values
    (
      p_old_device_id, p_vehicle_id, 'replaced', p_effective_at, v_reason,
      p_new_device_id, v_actor_id, nullif(trim(coalesce(p_note, '')), '')
    ),
    (
      p_new_device_id, p_vehicle_id, 'installed', p_effective_at, v_reason,
      p_old_device_id, v_actor_id, nullif(trim(coalesce(p_note, '')), '')
    );

  insert into public.audit_logs (
    actor_type, actor_id, action, entity_type, entity_id, safe_details
  ) values
    (
      'admin', v_actor_id, 'gps_device_replacement_recorded',
      'gps_device', p_old_device_id,
      jsonb_build_object(
        'old_device_id', p_old_device_id,
        'new_device_id', p_new_device_id,
        'vehicle_id', p_vehicle_id,
        'reason', v_reason
      )
    ),
    (
      'admin', v_actor_id, 'gps_device_replacement_installed',
      'gps_device', p_new_device_id,
      jsonb_build_object(
        'old_device_id', p_old_device_id,
        'new_device_id', p_new_device_id,
        'vehicle_id', p_vehicle_id
      )
    );

  return query
    select p_old_device_id, p_new_device_id, v_new_link_id,
      'Device replacement recorded.'::text;
end;
$$;

create or replace function public.admin_upsert_gps_device_credential_metadata(
  p_device_id uuid,
  p_credential_key_id text,
  p_status text,
  p_issued_at timestamptz default null,
  p_expires_at timestamptz default null,
  p_rotated_from_credential_id uuid default null,
  p_admin_note text default null
)
returns table(credential_id uuid, result_message text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := public.m20a_require_admin();
  v_device public.gps_devices%rowtype;
  v_existing public.gps_device_credential_metadata%rowtype;
  v_rotated public.gps_device_credential_metadata%rowtype;
  v_credential_id uuid;
  v_rows_updated integer;
begin
  perform public.m20a_validate_safe_text(p_credential_key_id, 'Credential key ID', 128, true);
  perform public.m20a_validate_safe_text(p_admin_note, 'Credential note', 500);
  if nullif(trim(coalesce(p_credential_key_id, '')), '') is null then
    raise exception 'Credential key ID is required' using errcode = '22023';
  end if;
  if p_status not in ('pending', 'active', 'rotating', 'revoked', 'expired') then
    raise exception 'Invalid credential metadata status' using errcode = '22023';
  end if;
  if p_expires_at is not null and p_issued_at is not null
    and p_expires_at <= p_issued_at
  then
    raise exception 'Credential expiry must follow issue time' using errcode = '22023';
  end if;
  if p_status = 'expired'
    and (p_expires_at is null or p_expires_at > clock_timestamp())
  then
    raise exception 'Expired credential metadata requires an elapsed expiry'
      using errcode = '22023';
  end if;
  if p_status in ('active', 'rotating')
    and p_expires_at is not null
    and p_expires_at <= clock_timestamp()
  then
    raise exception 'Active credential metadata cannot already be expired'
      using errcode = '22023';
  end if;
  if p_status = 'rotating' then
    raise exception 'Rotating status is managed on the active rotation source'
      using errcode = '22023';
  end if;

  select * into v_device from public.gps_devices
  where id = p_device_id for update;
  if not found then raise exception 'Device not found' using errcode = 'P0002'; end if;
  if v_device.status in (
    'suspended'::public.gps_device_status,
    'removed'::public.gps_device_status,
    'retired'::public.gps_device_status
  ) and p_status in ('active', 'rotating') then
    raise exception 'Ineligible devices cannot have active credential metadata'
      using errcode = '55000';
  end if;

  select * into v_existing
  from public.gps_device_credential_metadata
  where gps_device_id = p_device_id
    and lower(trim(credential_key_id)) = lower(trim(p_credential_key_id))
  for update;

  if p_rotated_from_credential_id is not null
    and p_status not in ('pending', 'active')
  then
    raise exception 'Revoked or expired metadata cannot begin a rotation'
      using errcode = '22023';
  end if;
  if p_rotated_from_credential_id is not null
    and v_existing.id = p_rotated_from_credential_id
  then
    raise exception 'Credential metadata cannot rotate from itself'
      using errcode = '22023';
  end if;

  if p_rotated_from_credential_id is not null then
    select * into v_rotated from public.gps_device_credential_metadata
    where id = p_rotated_from_credential_id for update;
    if not found or v_rotated.gps_device_id <> p_device_id then
      raise exception 'Rotation source credential metadata not found for device'
        using errcode = 'P0002';
    end if;
    if v_rotated.status <> 'active' then
      raise exception 'Rotation source credential metadata must be active'
        using errcode = '55000';
    end if;
    update public.gps_device_credential_metadata
    set status = 'rotating', rotated_at = coalesce(rotated_at, clock_timestamp())
    where id = p_rotated_from_credential_id
      and status = 'active';
    get diagnostics v_rows_updated = row_count;
    if v_rows_updated <> 1 then
      raise exception 'Rotation source credential metadata changed concurrently'
        using errcode = '40001';
    end if;
  end if;

  if v_existing.id is null then
    insert into public.gps_device_credential_metadata (
      gps_device_id, credential_key_id, status, issued_at, expires_at,
      revoked_at, rotated_from_credential_id, admin_note, created_by_admin
    ) values (
      p_device_id, trim(p_credential_key_id), p_status, p_issued_at, p_expires_at,
      case when p_status = 'revoked' then clock_timestamp() else null end,
      p_rotated_from_credential_id,
      nullif(trim(coalesce(p_admin_note, '')), ''), v_actor_id
    ) returning id into v_credential_id;
  else
    if v_existing.status in ('revoked', 'expired')
      and p_status <> v_existing.status
    then
      raise exception 'Revoked or expired credential metadata is terminal'
        using errcode = '55000';
    end if;
    if not (
      (v_existing.status = 'pending' and p_status in ('pending', 'active', 'revoked', 'expired'))
      or (v_existing.status = 'active' and p_status in ('active', 'revoked', 'expired'))
      or (v_existing.status = 'rotating' and p_status in ('revoked', 'expired'))
      or (v_existing.status = 'revoked' and p_status = 'revoked')
      or (v_existing.status = 'expired' and p_status = 'expired')
    ) then
      raise exception 'Blocked credential metadata transition'
        using errcode = '55000';
    end if;
    update public.gps_device_credential_metadata
    set status = p_status,
        issued_at = p_issued_at,
        expires_at = p_expires_at,
        revoked_at = case
          when p_status = 'revoked' then coalesce(revoked_at, clock_timestamp())
          else revoked_at
        end,
        rotated_from_credential_id = p_rotated_from_credential_id,
        admin_note = nullif(trim(coalesce(p_admin_note, '')), '')
    where id = v_existing.id
    returning id into v_credential_id;
  end if;

  insert into public.audit_logs (
    actor_type, actor_id, action, entity_type, entity_id, safe_details
  ) values (
    'admin', v_actor_id,
    case
      when p_status = 'revoked' then 'gps_device_credential_metadata_revoked'
      when p_rotated_from_credential_id is not null then 'gps_device_credential_metadata_rotated'
      else 'gps_device_credential_metadata_changed'
    end,
    'gps_device_credential_metadata', v_credential_id,
    jsonb_build_object(
      'gps_device_id', p_device_id,
      'credential_id', v_credential_id,
      'status', p_status,
      'rotated_from_credential_id', p_rotated_from_credential_id
    )
  );

  return query select v_credential_id, 'Credential metadata updated.'::text;
end;
$$;

revoke all on function public.m20a_set_updated_at() from public, anon, authenticated;
revoke all on function public.m20a_protect_device_history() from public, anon, authenticated;
revoke all on function public.m20a_protect_vehicle_link_history() from public, anon, authenticated;
revoke all on function public.m20a_protect_lifecycle_event_history() from public, anon, authenticated;
revoke all on function public.m20a_require_admin() from public, anon, authenticated;
revoke all on function public.m20a_require_reason(text) from public, anon, authenticated;
revoke all on function public.m20a_validate_safe_text(text, text, integer, boolean) from public, anon, authenticated;
revoke all on function public.m20a_validate_adapter_protocol(text, text) from public, anon, authenticated;

revoke all on function public.m20a_gps_device_is_proof_ready(uuid) from public, anon;
grant execute on function public.m20a_gps_device_is_proof_ready(uuid) to authenticated;

revoke all on function public.admin_register_gps_device(
  text, text, text, text, text, text, text, text, uuid, text, text, text
) from public, anon;
grant execute on function public.admin_register_gps_device(
  text, text, text, text, text, text, text, text, uuid, text, text, text
) to authenticated;

revoke all on function public.admin_update_gps_device(
  uuid, text, text, text, text, text, text, text, text, uuid, text, text, text
) from public, anon;
grant execute on function public.admin_update_gps_device(
  uuid, text, text, text, text, text, text, text, text, uuid, text, text, text
) to authenticated;

revoke all on function public.admin_change_gps_device_status(uuid, text, text)
  from public, anon;
grant execute on function public.admin_change_gps_device_status(uuid, text, text)
  to authenticated;

revoke all on function public.admin_link_gps_device_vehicle(
  uuid, uuid, timestamptz, text, text
) from public, anon;
grant execute on function public.admin_link_gps_device_vehicle(
  uuid, uuid, timestamptz, text, text
) to authenticated;

revoke all on function public.admin_remove_gps_device_vehicle(
  uuid, timestamptz, text, text
) from public, anon;
grant execute on function public.admin_remove_gps_device_vehicle(
  uuid, timestamptz, text, text
) to authenticated;

revoke all on function public.admin_record_gps_device_event(
  uuid, text, timestamptz, uuid, uuid, text, text
) from public, anon;
grant execute on function public.admin_record_gps_device_event(
  uuid, text, timestamptz, uuid, uuid, text, text
) to authenticated;

revoke all on function public.admin_replace_gps_device(
  uuid, uuid, uuid, timestamptz, text, text
) from public, anon;
grant execute on function public.admin_replace_gps_device(
  uuid, uuid, uuid, timestamptz, text, text
) to authenticated;

revoke all on function public.admin_upsert_gps_device_credential_metadata(
  uuid, text, text, timestamptz, timestamptz, uuid, text
) from public, anon;
grant execute on function public.admin_upsert_gps_device_credential_metadata(
  uuid, text, text, timestamptz, timestamptz, uuid, text
) to authenticated;
