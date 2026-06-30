create extension if not exists "pgcrypto";

do $$
begin
  create type public.app_role as enum ('owner', 'admin', 'staff', 'driver');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.enquiry_source as enum ('website', 'phone_call', 'whatsapp', 'admin');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.enquiry_status as enum ('new', 'contacted', 'converted', 'rejected');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.driver_approval_status as enum ('waiting_for_approval', 'approved', 'rejected', 'need_more_details');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.driver_availability_status as enum ('available', 'not_available');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.gps_device_status as enum ('active', 'inactive', 'not_connected', 'integration_pending');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.package_type as enum ('basic', 'standard', 'premium');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.ad_work_status as enum ('enquiry', 'scheduled', 'running', 'paused', 'completed', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.tracking_type as enum ('mobile', 'device', 'both');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.ad_work_day_status as enum ('scheduled', 'running', 'paused', 'completed', 'missed', 'rescheduled');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.area_coverage_status as enum ('pending', 'covered', 'missed', 'manual');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.tracking_session_status as enum ('not_started', 'running', 'paused', 'stopped', 'completed');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.tracking_source as enum ('mobile', 'device');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.location_quality as enum ('good', 'weak', 'unknown');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.stopped_by_type as enum ('driver', 'admin', 'system');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.proof_upload_type as enum ('photo', 'audio', 'video');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.alert_type as enum ('long_stop', 'gps_lost', 'network_lost', 'missed_area', 'device_not_responding', 'mismatch');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.alert_severity as enum ('info', 'warning', 'critical');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.alert_status as enum ('open', 'resolved');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.customer_update_type as enum ('scheduled', 'started', 'in_progress', 'area_covered', 'completed', 'report_ready', 'manual');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.customer_update_channel as enum ('copy', 'whatsapp', 'sms', 'api_later');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.customer_update_sent_status as enum ('draft', 'copied', 'sent', 'failed');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.report_status as enum ('draft', 'generated', 'shared', 'disabled');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.payment_status as enum ('not_paid', 'advance_paid', 'partially_paid', 'fully_paid', 'refund_adjustment');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.audit_actor_type as enum ('admin', 'driver', 'system');
exception when duplicate_object then null;
end $$;

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  display_name text,
  phone text,
  role public.app_role not null default 'staff',
  created_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_name text,
  phone text not null,
  city text,
  address text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.enquiries (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  business_name text,
  phone text not null,
  city text,
  required_areas text,
  preferred_start_date date,
  number_of_days integer not null default 1 check (number_of_days > 0),
  source public.enquiry_source not null default 'website',
  status public.enquiry_status not null default 'new',
  message text,
  created_at timestamptz not null default now()
);

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null unique,
  city text,
  service_areas text[] not null default '{}',
  approval_status public.driver_approval_status not null default 'waiting_for_approval',
  availability_status public.driver_availability_status not null default 'not_available',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid references public.drivers(id) on delete set null,
  vehicle_number text not null,
  vehicle_type text not null default 'other',
  mic_available boolean not null default false,
  active boolean not null default true,
  city text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.gps_devices (
  id uuid primary key default gen_random_uuid(),
  device_code text not null unique,
  provider_name text,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  status public.gps_device_status not null default 'not_connected',
  ingest_token_hash text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  district text,
  state text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.areas (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  name text not null,
  center_lat numeric(10, 7),
  center_lng numeric(10, 7),
  radius_meters integer,
  boundary_polygon jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (city_id, name)
);

create table if not exists public.ad_works (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete restrict,
  title text not null,
  city_id uuid references public.cities(id) on delete restrict,
  package_type public.package_type not null default 'basic',
  start_date date,
  end_date date,
  status public.ad_work_status not null default 'scheduled',
  tracking_type public.tracking_type not null default 'mobile',
  customer_live_enabled boolean not null default false,
  payment_status public.payment_status not null default 'not_paid',
  total_amount numeric(12, 2) not null default 0,
  paid_amount numeric(12, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  check (paid_amount >= 0),
  check (total_amount >= 0)
);

create table if not exists public.ad_work_days (
  id uuid primary key default gen_random_uuid(),
  ad_work_id uuid not null references public.ad_works(id) on delete cascade,
  work_date date not null,
  planned_start_time time,
  planned_end_time time,
  actual_start_time timestamptz,
  actual_end_time timestamptz,
  status public.ad_work_day_status not null default 'scheduled',
  driver_id uuid references public.drivers(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  gps_device_id uuid references public.gps_devices(id) on delete set null,
  summary_note text,
  created_at timestamptz not null default now()
);

create table if not exists public.ad_work_areas (
  id uuid primary key default gen_random_uuid(),
  ad_work_id uuid not null references public.ad_works(id) on delete cascade,
  ad_work_day_id uuid references public.ad_work_days(id) on delete cascade,
  area_id uuid not null references public.areas(id) on delete restrict,
  status public.area_coverage_status not null default 'pending',
  first_covered_at timestamptz,
  manual_note text,
  created_at timestamptz not null default now()
);

create table if not exists public.tracking_sessions (
  id uuid primary key default gen_random_uuid(),
  ad_work_day_id uuid not null references public.ad_work_days(id) on delete cascade,
  source_type public.tracking_type not null default 'mobile',
  status public.tracking_session_status not null default 'not_started',
  started_at timestamptz,
  ended_at timestamptz,
  stopped_by public.stopped_by_type,
  stop_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.location_points (
  id uuid primary key default gen_random_uuid(),
  tracking_session_id uuid not null references public.tracking_sessions(id) on delete cascade,
  source public.tracking_source not null default 'mobile',
  device_id uuid references public.gps_devices(id) on delete set null,
  driver_id uuid references public.drivers(id) on delete set null,
  recorded_at timestamptz not null,
  received_at timestamptz not null default now(),
  lat numeric(10, 7) not null,
  lng numeric(10, 7) not null,
  accuracy_meters numeric(8, 2),
  speed numeric(8, 2),
  offline_synced boolean not null default false,
  quality public.location_quality not null default 'unknown',
  created_at timestamptz not null default now()
);

create table if not exists public.proof_uploads (
  id uuid primary key default gen_random_uuid(),
  ad_work_day_id uuid references public.ad_work_days(id) on delete cascade,
  type public.proof_upload_type not null,
  file_path text not null,
  uploaded_by uuid,
  recorded_at timestamptz,
  lat numeric(10, 7),
  lng numeric(10, 7),
  note text,
  customer_visible boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  ad_work_day_id uuid references public.ad_work_days(id) on delete cascade,
  type public.alert_type not null,
  severity public.alert_severity not null default 'warning',
  status public.alert_status not null default 'open',
  message text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_note text
);

create table if not exists public.customer_updates (
  id uuid primary key default gen_random_uuid(),
  ad_work_id uuid references public.ad_works(id) on delete cascade,
  ad_work_day_id uuid references public.ad_work_days(id) on delete cascade,
  type public.customer_update_type not null,
  message text not null,
  channel public.customer_update_channel not null default 'copy',
  sent_status public.customer_update_sent_status not null default 'draft',
  sent_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  ad_work_id uuid not null references public.ad_works(id) on delete cascade,
  public_token text unique,
  status public.report_status not null default 'draft',
  generated_at timestamptz,
  generated_by uuid,
  report_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_type public.audit_actor_type not null default 'system',
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  created_at timestamptz not null default now(),
  safe_details jsonb not null default '{}'::jsonb
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'app_settings',
    'user_profiles',
    'customers',
    'enquiries',
    'drivers',
    'vehicles',
    'gps_devices',
    'cities',
    'areas',
    'ad_works',
    'ad_work_days',
    'ad_work_areas',
    'tracking_sessions',
    'location_points',
    'proof_uploads',
    'alerts',
    'customer_updates',
    'reports',
    'audit_logs'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

insert into public.app_settings (key, value)
values ('product_name', 'Prachar')
on conflict (key) do update set value = excluded.value, updated_at = now();

insert into public.cities (name, district, state, active)
values
  ('Ongole', 'Prakasam', 'Andhra Pradesh', true),
  ('Addanki', 'Bapatla', 'Andhra Pradesh', true)
on conflict (name) do update
set district = excluded.district,
    state = excluded.state,
    active = excluded.active;

insert into public.areas (city_id, name, radius_meters, active)
select cities.id, seed_areas.area_name, 800, true
from public.cities
join (
  values
    ('Ongole', 'Main Road'),
    ('Ongole', 'Market Area'),
    ('Ongole', 'Bus Stand'),
    ('Ongole', 'Colony'),
    ('Ongole', 'Village'),
    ('Ongole', 'Junction'),
    ('Addanki', 'Main Road'),
    ('Addanki', 'Market Area'),
    ('Addanki', 'Bus Stand'),
    ('Addanki', 'Colony'),
    ('Addanki', 'Village'),
    ('Addanki', 'Junction')
) as seed_areas(city_name, area_name) on seed_areas.city_name = cities.name
on conflict (city_id, name) do update
set radius_meters = excluded.radius_meters,
    active = excluded.active;
