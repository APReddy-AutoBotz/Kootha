-- M21: Generic Secure HTTP Telemetry Ingestion
-- Server-only receipt, replay, event-time authority, and physical tracking
-- persistence. Raw request bodies and rejected coordinates are never stored.

create extension if not exists "btree_gist";
set search_path = public;

-- Rebuild without CASCADE so the canonical physical source is usable in this transaction.
alter table public.location_points alter column source drop default;
alter table public.location_points alter column source type text using source::text;
drop type public.tracking_source;
create type public.tracking_source as enum
  ('mobile', 'device', 'phone', 'physical_device');
alter table public.location_points alter column source type public.tracking_source
  using source::public.tracking_source;
alter table public.location_points alter column source
  set default 'mobile'::public.tracking_source;

alter table public.tracking_sessions
  drop constraint if exists tracking_sessions_m9_tracking_mode_check;
alter table public.tracking_sessions
  add constraint tracking_sessions_m21_tracking_mode_check
  check (tracking_mode in ('phone_location', 'physical_device'));

alter table public.tracking_sessions
  add column if not exists gps_device_id uuid references public.gps_devices(id) on delete restrict,
  add column if not exists synthetic boolean not null default false;

create unique index if not exists tracking_sessions_m21_physical_unique
  on public.tracking_sessions (ad_work_day_id, gps_device_id, tracking_mode)
  where tracking_mode = 'physical_device';

create table public.m21_ingestion_policies (
  policy_version text primary key,
  effective_from timestamptz not null,
  effective_until timestamptz,
  live_freshness_seconds integer not null,
  delayed_backfill_seconds integer not null,
  future_clock_skew_seconds integer not null,
  reorder_window_sequences integer not null,
  active boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  constraint m21_ingestion_policies_bounds_check check (
    char_length(policy_version) between 1 and 32
    and live_freshness_seconds between 1 and 3600
    and delayed_backfill_seconds between 60 and 604800
    and future_clock_skew_seconds between 0 and 600
    and reorder_window_sequences between 1 and 10000
    and (effective_until is null or effective_until > effective_from)
  )
);

create unique index m21_ingestion_policies_one_active
  on public.m21_ingestion_policies (active) where active;

insert into public.m21_ingestion_policies (
  policy_version, effective_from, live_freshness_seconds,
  delayed_backfill_seconds, future_clock_skew_seconds,
  reorder_window_sequences, active
) values ('m21-pilot-v1', clock_timestamp(), 120, 86400, 30, 128, true);

create table public.m21_rate_limit_policies (
  policy_version text not null,
  scope text not null,
  window_seconds integer not null,
  request_limit integer not null,
  event_limit integer not null,
  retention_seconds integer not null,
  active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  primary key (policy_version, scope),
  constraint m21_rate_limit_policies_scope_check
    check (scope in ('unauthenticated', 'device', 'global')),
  constraint m21_rate_limit_policies_bounds_check check (
    char_length(policy_version) between 1 and 32
    and window_seconds between 1 and 3600
    and request_limit between 1 and 100000
    and event_limit between 1 and 1000000
    and retention_seconds between window_seconds and 604800
  )
);

-- Provisional pilot controls. They are configurable and are not an approved
-- production policy.
insert into public.m21_rate_limit_policies
  (policy_version, scope, window_seconds, request_limit, event_limit, retention_seconds)
values
  ('m21-pilot-v1', 'unauthenticated', 60, 60, 60, 86400),
  ('m21-pilot-v1', 'device', 60, 120, 6000, 86400),
  ('m21-pilot-v1', 'global', 60, 300, 12000, 86400);

create table public.m21_rate_limit_buckets (
  scope text not null,
  key_fingerprint text not null,
  window_started_at timestamptz not null,
  policy_version text not null,
  request_count integer not null default 0,
  event_count integer not null default 0,
  last_seen_at timestamptz not null,
  primary key (scope, key_fingerprint, window_started_at),
  foreign key (policy_version, scope)
    references public.m21_rate_limit_policies(policy_version, scope) on delete restrict,
  constraint m21_rate_limit_buckets_scope_check
    check (scope in ('unauthenticated', 'device', 'global')),
  constraint m21_rate_limit_buckets_fingerprint_check
    check (key_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint m21_rate_limit_buckets_counts_check
    check (request_count >= 0 and event_count >= 0)
);

create index m21_rate_limit_buckets_retention_idx
  on public.m21_rate_limit_buckets (last_seen_at);

create table public.m21_assignment_history (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.ad_work_assignments(id) on delete restrict,
  ad_work_id uuid not null references public.ad_works(id) on delete restrict,
  driver_id uuid not null references public.drivers(id) on delete restrict,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  assignment_status text not null,
  effective_from timestamptz not null,
  effective_until timestamptz,
  history_origin text not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint m21_assignment_history_status_check check (
    assignment_status in
      ('not_assigned', 'assigned', 'needs_review', 'ready_for_execution', 'cancelled')
  ),
  constraint m21_assignment_history_origin_check
    check (history_origin in ('legacy_baseline', 'observed')),
  constraint m21_assignment_history_interval_check
    check (effective_until is null or effective_until > effective_from)
);

alter table public.m21_assignment_history
  add constraint m21_assignment_history_ad_work_excl
  exclude using gist (
    ad_work_id with =,
    tstzrange(effective_from, coalesce(effective_until, 'infinity'::timestamptz), '[)') with &&
  );

create index m21_assignment_history_vehicle_time_idx
  on public.m21_assignment_history (vehicle_id, effective_from, effective_until);

create table public.m21_release_history (
  id uuid primary key default gen_random_uuid(),
  ad_work_id uuid not null references public.ad_works(id) on delete restrict,
  release_status text not null,
  effective_from timestamptz not null,
  effective_until timestamptz,
  history_origin text not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint m21_release_history_status_check
    check (release_status in ('not_released', 'released_to_driver', 'access_revoked')),
  constraint m21_release_history_origin_check
    check (history_origin in ('legacy_baseline', 'observed')),
  constraint m21_release_history_interval_check
    check (effective_until is null or effective_until > effective_from)
);

alter table public.m21_release_history
  add constraint m21_release_history_ad_work_excl
  exclude using gist (
    ad_work_id with =,
    tstzrange(effective_from, coalesce(effective_until, 'infinity'::timestamptz), '[)') with &&
  );

create table public.m21_execution_history (
  id uuid primary key default gen_random_uuid(),
  ad_work_day_id uuid not null references public.ad_work_days(id) on delete restrict,
  execution_status text not null,
  effective_from timestamptz not null,
  effective_until timestamptz,
  history_origin text not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint m21_execution_history_status_check check (
    execution_status in
      ('planned', 'ready', 'running', 'on_break', 'completed', 'issue_reported', 'cancelled')
  ),
  constraint m21_execution_history_origin_check
    check (history_origin in ('legacy_baseline', 'observed')),
  constraint m21_execution_history_interval_check
    check (effective_until is null or effective_until > effective_from)
);

alter table public.m21_execution_history
  add constraint m21_execution_history_day_excl
  exclude using gist (
    ad_work_day_id with =,
    tstzrange(effective_from, coalesce(effective_until, 'infinity'::timestamptz), '[)') with &&
  );

-- Existing current rows receive a conservative boundary only. M21 never
-- fabricates their earlier assignment, release, or execution history.
insert into public.m21_assignment_history (
  assignment_id, ad_work_id, driver_id, vehicle_id, assignment_status,
  effective_from, history_origin
)
select id, ad_work_id, driver_id, vehicle_id, status,
       clock_timestamp(), 'legacy_baseline'
from public.ad_work_assignments;

insert into public.m21_release_history (
  ad_work_id, release_status, effective_from, history_origin
)
select id, execution_release_status, clock_timestamp(), 'legacy_baseline'
from public.ad_works;

insert into public.m21_execution_history (
  ad_work_day_id, execution_status, effective_from, history_origin
)
select id, execution_status, clock_timestamp(), 'legacy_baseline'
from public.ad_work_days;

create or replace function public.m21_protect_effective_history()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'M21 effective history cannot be deleted' using errcode = '55000';
  end if;
  if old.effective_until is not null
     or new.effective_until is null
     or new.effective_until <= old.effective_from
     or new.id is distinct from old.id
     or new.assignment_id is distinct from old.assignment_id
     or new.ad_work_id is distinct from old.ad_work_id
     or new.driver_id is distinct from old.driver_id
     or new.vehicle_id is distinct from old.vehicle_id
     or new.assignment_status is distinct from old.assignment_status
     or new.effective_from is distinct from old.effective_from
     or new.history_origin is distinct from old.history_origin
     or new.created_at is distinct from old.created_at
  then
    raise exception 'M21 assignment history is immutable except for one interval closure'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function public.m21_protect_simple_effective_history()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'M21 effective history cannot be deleted' using errcode = '55000';
  end if;
  if old.effective_until is not null
     or new.effective_until is null
     or new.effective_until <= old.effective_from
  then
    raise exception 'M21 effective history is immutable except for one interval closure'
      using errcode = '55000';
  end if;
  if tg_table_name = 'm21_release_history' and (
    new.id is distinct from old.id
    or new.ad_work_id is distinct from old.ad_work_id
    or new.release_status is distinct from old.release_status
    or new.effective_from is distinct from old.effective_from
    or new.history_origin is distinct from old.history_origin
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'M21 release history is immutable except for one interval closure'
      using errcode = '55000';
  end if;
  if tg_table_name = 'm21_execution_history' and (
    new.id is distinct from old.id
    or new.ad_work_day_id is distinct from old.ad_work_day_id
    or new.execution_status is distinct from old.execution_status
    or new.effective_from is distinct from old.effective_from
    or new.history_origin is distinct from old.history_origin
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'M21 execution history is immutable except for one interval closure'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger m21_assignment_history_protect
before update or delete on public.m21_assignment_history
for each row execute function public.m21_protect_effective_history();
create trigger m21_release_history_protect
before update or delete on public.m21_release_history
for each row execute function public.m21_protect_simple_effective_history();
create trigger m21_execution_history_protect
before update or delete on public.m21_execution_history
for each row execute function public.m21_protect_simple_effective_history();

create or replace function public.m21_capture_assignment_history()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_at timestamptz := clock_timestamp();
begin
  if tg_op = 'INSERT' then
    insert into public.m21_assignment_history (
      assignment_id, ad_work_id, driver_id, vehicle_id, assignment_status,
      effective_from, history_origin
    ) values (
      new.id, new.ad_work_id, new.driver_id, new.vehicle_id, new.status,
      v_at, 'observed'
    );
  elsif row(new.driver_id, new.vehicle_id, new.status)
        is distinct from row(old.driver_id, old.vehicle_id, old.status) then
    update public.m21_assignment_history
    set effective_until = greatest(v_at, effective_from + interval '1 microsecond')
    where assignment_id = old.id and effective_until is null;
    insert into public.m21_assignment_history (
      assignment_id, ad_work_id, driver_id, vehicle_id, assignment_status,
      effective_from, history_origin
    ) values (
      new.id, new.ad_work_id, new.driver_id, new.vehicle_id, new.status,
      greatest(v_at, coalesce((
        select max(effective_until) from public.m21_assignment_history
        where assignment_id = old.id
      ), v_at)), 'observed'
    );
  end if;
  return new;
end;
$$;

create trigger m21_capture_assignment_history
after insert or update on public.ad_work_assignments
for each row execute function public.m21_capture_assignment_history();

create or replace function public.m21_capture_release_history()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_at timestamptz := clock_timestamp();
begin
  if new.execution_release_status is distinct from old.execution_release_status then
    update public.m21_release_history
    set effective_until = greatest(v_at, effective_from + interval '1 microsecond')
    where ad_work_id = old.id and effective_until is null;
    insert into public.m21_release_history (
      ad_work_id, release_status, effective_from, history_origin
    ) values (
      new.id, new.execution_release_status,
      greatest(v_at, coalesce((
        select max(effective_until) from public.m21_release_history
        where ad_work_id = old.id
      ), v_at)), 'observed'
    );
  end if;
  return new;
end;
$$;

create trigger m21_capture_release_history
after update of execution_release_status on public.ad_works
for each row execute function public.m21_capture_release_history();

create or replace function public.m21_capture_execution_history()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_at timestamptz := clock_timestamp();
begin
  if new.execution_status is distinct from old.execution_status then
    update public.m21_execution_history
    set effective_until = greatest(v_at, effective_from + interval '1 microsecond')
    where ad_work_day_id = old.id and effective_until is null;
    insert into public.m21_execution_history (
      ad_work_day_id, execution_status, effective_from, history_origin
    ) values (
      new.id, new.execution_status,
      greatest(v_at, coalesce((
        select max(effective_until) from public.m21_execution_history
        where ad_work_day_id = old.id
      ), v_at)), 'observed'
    );
  end if;
  return new;
end;
$$;

create trigger m21_capture_execution_history
after update of execution_status on public.ad_work_days
for each row execute function public.m21_capture_execution_history();

create table public.telemetry_receipts (
  id uuid primary key default gen_random_uuid(),
  gps_device_id uuid not null references public.gps_devices(id) on delete restrict,
  credential_id uuid not null references public.gps_device_credential_metadata(id) on delete restrict,
  adapter_id text not null,
  adapter_version text not null,
  idempotency_identity text not null,
  content_hash text not null,
  raw_payload_hash text not null,
  client_event_id text,
  stream_epoch text,
  sequence bigint,
  captured_at timestamptz not null,
  received_at timestamptz not null,
  normalized_at timestamptz not null,
  disposition text not null,
  reason_code text not null,
  freshness text not null,
  offline_backfill boolean not null,
  quality text not null,
  synthetic boolean not null,
  processing_version text not null,
  ad_work_id uuid references public.ad_works(id) on delete restrict,
  ad_work_day_id uuid references public.ad_work_days(id) on delete restrict,
  assignment_id uuid references public.ad_work_assignments(id) on delete restrict,
  driver_id uuid references public.drivers(id) on delete restrict,
  vehicle_id uuid references public.vehicles(id) on delete restrict,
  tracking_session_id uuid references public.tracking_sessions(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  constraint telemetry_receipts_text_bounds_check check (
    char_length(adapter_id) between 1 and 64
    and char_length(adapter_version) between 1 and 32
    and char_length(idempotency_identity) between 1 and 256
    and content_hash ~ '^[0-9a-f]{64}$'
    and raw_payload_hash ~ '^[0-9a-f]{64}$'
    and (client_event_id is null or char_length(client_event_id) between 1 and 128)
    and (stream_epoch is null or char_length(stream_epoch) between 1 and 128)
    and char_length(reason_code) between 1 and 64
    and char_length(processing_version) between 1 and 32
  ),
  constraint telemetry_receipts_stream_pair_check
    check ((stream_epoch is null) = (sequence is null) and (sequence is null or sequence >= 0)),
  constraint telemetry_receipts_disposition_check
    check (disposition in ('accepted_live', 'accepted_delayed', 'health_only', 'rejected')),
  constraint telemetry_receipts_freshness_check
    check (freshness in ('live', 'delayed', 'degraded_freshness', 'not_applicable')),
  constraint telemetry_receipts_quality_check
    check (quality in ('valid', 'degraded', 'suspect', 'rejected'))
);

create unique index telemetry_receipts_identity_unique
  on public.telemetry_receipts
    (gps_device_id, adapter_id, adapter_version, idempotency_identity);
create unique index telemetry_receipts_sequence_unique
  on public.telemetry_receipts
    (gps_device_id, adapter_id, adapter_version, stream_epoch, sequence)
  where stream_epoch is not null;
create index telemetry_receipts_device_received_idx
  on public.telemetry_receipts (gps_device_id, received_at desc);

create table public.telemetry_identity_conflicts (
  id uuid primary key default gen_random_uuid(),
  original_receipt_id uuid not null references public.telemetry_receipts(id) on delete restrict,
  gps_device_id uuid not null references public.gps_devices(id) on delete restrict,
  incoming_content_hash text not null,
  reason_code text not null,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  attempt_count integer not null default 1,
  created_at timestamptz not null default clock_timestamp(),
  constraint telemetry_identity_conflicts_dedupe_key unique (original_receipt_id, incoming_content_hash, reason_code),
  constraint telemetry_identity_conflicts_bounds_check check (
    incoming_content_hash ~ '^[0-9a-f]{64}$'
    and reason_code in ('event_identity_conflict', 'sequence_replay_invalid')
    and attempt_count between 1 and 1000000000
    and last_seen_at >= first_seen_at
  )
);

create table public.telemetry_stream_state (
  gps_device_id uuid not null references public.gps_devices(id) on delete restrict,
  adapter_id text not null,
  adapter_version text not null,
  stream_epoch text not null,
  high_water_sequence bigint not null,
  last_content_hash text not null,
  first_seen_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (gps_device_id, adapter_id, adapter_version, stream_epoch),
  constraint telemetry_stream_state_bounds_check check (
    char_length(adapter_id) between 1 and 64
    and char_length(adapter_version) between 1 and 32
    and char_length(stream_epoch) between 1 and 128
    and high_water_sequence >= 0
    and last_content_hash ~ '^[0-9a-f]{64}$'
  )
);

create table public.telemetry_sensor_observations (
  id uuid primary key default gen_random_uuid(),
  telemetry_receipt_id uuid not null references public.telemetry_receipts(id) on delete restrict,
  gps_device_id uuid not null references public.gps_devices(id) on delete restrict,
  ordinal smallint not null,
  metric text not null,
  value_type text not null,
  number_value numeric,
  boolean_value boolean,
  controlled_text_value text,
  unit text not null,
  captured_at timestamptz not null,
  source text not null,
  quality text not null,
  normalization_version text not null,
  synthetic boolean not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (telemetry_receipt_id, ordinal),
  constraint telemetry_sensor_observations_ordinal_check check (ordinal between 1 and 32),
  constraint telemetry_sensor_observations_metric_check check (
    metric in ('fuel_level', 'temperature', 'door_state', 'vibration',
               'external_power', 'ignition', 'tamper')
  ),
  constraint telemetry_sensor_observations_quality_check
    check (quality in ('good', 'degraded', 'unknown', 'invalid')),
  constraint telemetry_sensor_observations_source_check
    check (source in ('physical_device', 'simulator')),
  constraint telemetry_sensor_observations_typed_value_check check (
    (value_type = 'number' and number_value is not null
      and boolean_value is null and controlled_text_value is null
      and metric in ('fuel_level', 'temperature', 'vibration'))
    or
    (value_type = 'boolean' and number_value is null
      and boolean_value is not null and controlled_text_value is null
      and metric in ('external_power', 'ignition', 'tamper'))
    or
    (value_type = 'controlled_text' and number_value is null
      and boolean_value is null and controlled_text_value in ('open', 'closed', 'unknown')
      and metric = 'door_state')
  ),
  constraint telemetry_sensor_observations_unit_check check (
    (metric = 'fuel_level' and unit = 'percentage')
    or (metric = 'temperature' and unit = 'celsius')
    or (metric = 'door_state' and unit = 'state')
    or (metric = 'vibration' and unit = 'meters_per_second_squared')
    or (metric in ('external_power', 'ignition', 'tamper') and unit = 'boolean')
  ),
  constraint telemetry_sensor_observations_number_bounds_check check (
    number_value is null
    or (metric = 'fuel_level' and number_value between 0 and 100)
    or (metric = 'temperature' and number_value between -100 and 250)
    or (metric = 'vibration' and number_value between 0 and 1000)
  ),
  constraint telemetry_sensor_observations_text_bounds_check check (
    char_length(normalization_version) between 1 and 32
  )
);

alter table public.location_points
  add column if not exists telemetry_receipt_id uuid
    references public.telemetry_receipts(id) on delete restrict,
  add column if not exists altitude_meters numeric(9,2),
  add column if not exists satellite_count integer,
  add column if not exists freshness text,
  add column if not exists offline_backfill boolean not null default false,
  add column if not exists synthetic boolean not null default false;

create unique index location_points_telemetry_receipt_unique
  on public.location_points (telemetry_receipt_id)
  where telemetry_receipt_id is not null;

alter table public.location_points
  add constraint location_points_m21_physical_fields_check check (
    (telemetry_receipt_id is null)
    or (
      source = 'physical_device'::public.tracking_source
      and freshness in ('live', 'degraded_freshness')
      and (altitude_meters is null or altitude_meters between -1000 and 20000)
      and (satellite_count is null or satellite_count between 0 and 256)
    )
  );

create or replace function public.m21_protect_immutable_evidence()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'M21 telemetry evidence is immutable' using errcode = '55000';
end;
$$;

create trigger telemetry_receipts_immutable
before update or delete on public.telemetry_receipts
for each row execute function public.m21_protect_immutable_evidence();
create trigger telemetry_identity_conflicts_no_delete
before delete on public.telemetry_identity_conflicts
for each row execute function public.m21_protect_immutable_evidence();
create trigger telemetry_stream_state_no_delete
before delete on public.telemetry_stream_state
for each row execute function public.m21_protect_immutable_evidence();
create trigger telemetry_sensor_observations_immutable
before update or delete on public.telemetry_sensor_observations
for each row execute function public.m21_protect_immutable_evidence();

create or replace function public.m21_consume_rate_limit(
  p_scope text,
  p_key_fingerprint text,
  p_event_count integer,
  p_observed_at timestamptz default clock_timestamp()
)
returns table(
  allowed boolean,
  retry_after_seconds integer,
  reason_code text,
  policy_version text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_policy public.m21_rate_limit_policies%rowtype;
  v_window timestamptz;
  v_bucket public.m21_rate_limit_buckets%rowtype;
begin
  if p_scope not in ('unauthenticated', 'device', 'global')
     or p_key_fingerprint !~ '^[0-9a-f]{64}$'
     or p_event_count < 0 or p_event_count > 100 then
    raise exception 'Invalid rate-limit input' using errcode = '22023';
  end if;

  select * into strict v_policy
  from public.m21_rate_limit_policies
  where scope = p_scope and active
  order by created_at desc
  limit 1;

  v_window := to_timestamp(
    floor(extract(epoch from p_observed_at) / v_policy.window_seconds)
      * v_policy.window_seconds
  );

  insert into public.m21_rate_limit_buckets (
    scope, key_fingerprint, window_started_at, policy_version,
    request_count, event_count, last_seen_at
  ) values (
    p_scope, p_key_fingerprint, v_window, v_policy.policy_version,
    1, p_event_count, p_observed_at
  )
  on conflict (scope, key_fingerprint, window_started_at)
  do update set
    request_count = public.m21_rate_limit_buckets.request_count + 1,
    event_count = public.m21_rate_limit_buckets.event_count + excluded.event_count,
    last_seen_at = greatest(public.m21_rate_limit_buckets.last_seen_at, excluded.last_seen_at)
  returning * into v_bucket;

  delete from public.m21_rate_limit_buckets b
  where b.ctid in (
    select old_b.ctid
    from public.m21_rate_limit_buckets old_b
    join public.m21_rate_limit_policies old_p
      on old_p.policy_version = old_b.policy_version
     and old_p.scope = old_b.scope
    where old_b.last_seen_at < p_observed_at
          - make_interval(secs => old_p.retention_seconds)
    order by old_b.last_seen_at
    limit 1000
  );

  allowed := v_bucket.request_count <= v_policy.request_limit
             and v_bucket.event_count <= v_policy.event_limit;
  retry_after_seconds := case when allowed then 0 else greatest(
    1, least(v_policy.window_seconds,
      ceil(extract(epoch from
        (v_window + make_interval(secs => v_policy.window_seconds) - p_observed_at)
      ))::integer)
  ) end;
  reason_code := case when allowed then 'rate_limit_ok' else 'rate_limited' end;
  policy_version := v_policy.policy_version;
  return next;
end;
$$;

create or replace function public.m21_lookup_device_credential(
  p_claimed_device_code text,
  p_credential_key_id text,
  p_received_at timestamptz default clock_timestamp()
)
returns table(
  gps_device_id uuid,
  credential_id uuid,
  verification_material_hash text,
  eligible boolean
)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select d.id, c.id, c.verification_material_hash,
    (
      d.status = 'active'::public.gps_device_status
      and d.installation_state = 'installed'
      and c.verification_material_hash ~ '^[0-9a-f]{64}$'
      and c.issued_at is not null and c.issued_at <= p_received_at
      and (c.expires_at is null or c.expires_at > p_received_at)
      and (c.revoked_at is null or c.revoked_at > p_received_at)
      and (
        c.status in ('active', 'rotating')
        or (c.status = 'revoked' and c.revoked_at > p_received_at)
      )
      and d.gps_readiness = 'ready'
      and d.gsm_readiness in ('ready', 'degraded')
      and exists (
        select 1 from public.gps_device_vehicle_links link
        where link.gps_device_id = d.id and link.is_primary
          and link.effective_from <= p_received_at
          and (link.effective_until is null or link.effective_until > p_received_at)
      )
    )
  from public.gps_devices d
  join public.gps_device_credential_metadata c on c.gps_device_id = d.id
  where lower(trim(d.device_code)) = lower(trim(p_claimed_device_code))
    and lower(trim(c.credential_key_id)) = lower(trim(p_credential_key_id))
    and char_length(p_claimed_device_code) between 1 and 64
    and char_length(p_credential_key_id) between 1 and 128
  limit 1;
$$;

create or replace function public.m21_mark_credential_verified(
  p_credential_id uuid,
  p_received_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_updated integer;
begin
  update public.gps_device_credential_metadata c
  set last_verified_at = greatest(coalesce(c.last_verified_at, p_received_at), p_received_at)
  from public.gps_devices d
  where c.id = p_credential_id
    and d.id = c.gps_device_id
    and d.status = 'active'::public.gps_device_status
    and d.installation_state = 'installed'
    and c.issued_at <= p_received_at
    and (c.expires_at is null or c.expires_at > p_received_at)
    and (c.revoked_at is null or c.revoked_at > p_received_at)
    and c.status in ('active', 'rotating');
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.m21_persist_telemetry_event(
  p_credential_id uuid,
  p_adapter_id text,
  p_adapter_version text,
  p_idempotency_identity text,
  p_content_hash text,
  p_raw_payload_hash text,
  p_client_event_id text,
  p_stream_epoch text,
  p_sequence bigint,
  p_captured_at timestamptz,
  p_received_at timestamptz,
  p_normalized_at timestamptz,
  p_latitude numeric,
  p_longitude numeric,
  p_altitude_meters numeric,
  p_accuracy_meters numeric,
  p_speed_mps numeric,
  p_heading_degrees numeric,
  p_satellites integer,
  p_heartbeat boolean,
  p_battery_percent numeric,
  p_external_power boolean,
  p_firmware_version text,
  p_gps_fix text,
  p_gsm_signal_dbm numeric,
  p_observations jsonb,
  p_quality text,
  p_source text,
  p_synthetic boolean,
  p_processing_version text
)
returns table(
  disposition text,
  freshness text,
  offline_backfill boolean,
  quality text,
  reason_code text,
  retryable boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_credential public.gps_device_credential_metadata%rowtype;
  v_device public.gps_devices%rowtype;
  v_existing public.telemetry_receipts%rowtype;
  v_sequence_existing public.telemetry_receipts%rowtype;
  v_stream public.telemetry_stream_state%rowtype;
  v_policy public.m21_ingestion_policies%rowtype;
  v_link_count integer;
  v_assignment_count integer;
  v_release_count integer;
  v_execution_count integer;
  v_link public.gps_device_vehicle_links%rowtype;
  v_assignment public.m21_assignment_history%rowtype;
  v_day public.ad_work_days%rowtype;
  v_execution public.m21_execution_history%rowtype;
  v_actual_end timestamptz;
  v_receipt_id uuid := gen_random_uuid();
  v_session_id uuid;
  v_location boolean;
  v_work_valid boolean := false;
  v_sequence_gap boolean := false;
  v_out_of_order boolean := false;
  v_stream_found boolean := false;
  v_reason text;
  v_disposition text;
  v_freshness text;
  v_offline boolean := false;
  v_quality text;
  v_observation jsonb;
  v_ordinal integer := 0;
  v_value_type text;
  v_metric text;
  v_unit text;
  v_value jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if char_length(p_adapter_id) not between 1 and 64
     or char_length(p_adapter_version) not between 1 and 32
     or char_length(p_idempotency_identity) not between 1 and 256
     or p_content_hash !~ '^[0-9a-f]{64}$'
     or p_raw_payload_hash !~ '^[0-9a-f]{64}$'
     or (p_client_event_id is not null
         and char_length(p_client_event_id) not between 1 and 128)
     or (p_stream_epoch is null) <> (p_sequence is null)
     or p_sequence < 0
     or p_quality not in ('valid', 'degraded', 'suspect')
     or p_source not in ('physical_device', 'simulator')
     or char_length(p_processing_version) not between 1 and 32
     or p_normalized_at < p_received_at - interval '5 minutes'
     or p_normalized_at > v_now + interval '5 minutes'
  then
    raise exception 'Invalid canonical telemetry input' using errcode = '22023';
  end if;

  v_location := p_latitude is not null or p_longitude is not null;
  if (p_latitude is null) <> (p_longitude is null)
     or (p_latitude is not null and p_latitude not between -90 and 90)
     or (p_longitude is not null and p_longitude not between -180 and 180)
     or (p_altitude_meters is not null and p_altitude_meters not between -1000 and 20000)
     or (p_accuracy_meters is not null and p_accuracy_meters not between 0 and 100000)
     or (p_speed_mps is not null and p_speed_mps not between 0 and 200)
     or (p_heading_degrees is not null and p_heading_degrees not between 0 and 360)
     or (p_satellites is not null and p_satellites not between 0 and 256)
     or (p_battery_percent is not null and p_battery_percent not between 0 and 100)
     or (p_firmware_version is not null and char_length(p_firmware_version) > 64)
     or (p_gps_fix is not null
         and p_gps_fix not in ('none', 'two_dimensional', 'three_dimensional'))
     or (p_gsm_signal_dbm is not null and p_gsm_signal_dbm not between -200 and 0)
     or jsonb_typeof(coalesce(p_observations, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_observations, '[]'::jsonb)) > 32
  then
    raise exception 'Invalid bounded telemetry measurement' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_credential_id::text || ':' || p_adapter_id || ':' ||
      p_adapter_version || ':' || p_idempotency_identity, 21
    )
  );

  select * into v_credential
  from public.gps_device_credential_metadata
  where id = p_credential_id
  for share;
  if not found then
    raise exception 'Authentication context invalid' using errcode = '42501';
  end if;
  select * into v_device
  from public.gps_devices where id = v_credential.gps_device_id for share;
  if v_device.status <> 'active'::public.gps_device_status
     or v_device.installation_state <> 'installed'
     or v_device.adapter_type <> 'generic_http'
     or v_device.protocol_type <> 'https'
     or v_device.gps_readiness <> 'ready'
     or v_device.gsm_readiness not in ('ready', 'degraded')
     or coalesce(v_credential.verification_material_hash, '') !~ '^[0-9a-f]{64}$'
     or v_credential.issued_at is null
     or v_credential.issued_at > p_received_at
     or (v_credential.expires_at is not null and v_credential.expires_at <= p_received_at)
     or (v_credential.revoked_at is not null and v_credential.revoked_at <= p_received_at)
     or v_credential.status not in ('active', 'rotating')
  then
    raise exception 'Authentication context invalid' using errcode = '42501';
  end if;

  select * into v_existing
  from public.telemetry_receipts
  where gps_device_id = v_device.id
    and adapter_id = p_adapter_id
    and adapter_version = p_adapter_version
    and idempotency_identity = p_idempotency_identity
  for share;
  if found then
    if v_existing.content_hash = p_content_hash then
      return query select 'duplicate', 'not_applicable', false,
        v_existing.quality, 'duplicate_identical', false;
      return;
    end if;
    insert into public.telemetry_identity_conflicts (
      original_receipt_id, gps_device_id, incoming_content_hash, reason_code,
      first_seen_at, last_seen_at
    ) values (
      v_existing.id, v_device.id, p_content_hash, 'event_identity_conflict',
      p_received_at, p_received_at
    )
    on conflict on constraint telemetry_identity_conflicts_dedupe_key
    do update set
      last_seen_at = greatest(public.telemetry_identity_conflicts.last_seen_at,
                              excluded.last_seen_at),
      attempt_count = least(public.telemetry_identity_conflicts.attempt_count + 1,
                            1000000000);
    return query select 'rejected', 'not_applicable', false,
      'rejected', 'event_identity_conflict', false;
    return;
  end if;

  select * into v_policy
  from public.m21_ingestion_policies where active
  order by effective_from desc limit 1;

  if p_captured_at > p_received_at
       + make_interval(secs => v_policy.future_clock_skew_seconds) then
    v_reason := 'captured_time_invalid';
  end if;

  if p_stream_epoch is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        v_device.id::text || ':' || p_adapter_id || ':' ||
        p_adapter_version || ':' || p_stream_epoch, 22
      )
    );
    select * into v_sequence_existing
    from public.telemetry_receipts
    where gps_device_id = v_device.id
      and adapter_id = p_adapter_id
      and adapter_version = p_adapter_version
      and stream_epoch = p_stream_epoch
      and sequence = p_sequence
    for share;
    if found then
      if v_sequence_existing.content_hash = p_content_hash then
        return query select 'duplicate', 'not_applicable', false,
          v_sequence_existing.quality, 'duplicate_identical', false;
      else
        insert into public.telemetry_identity_conflicts (
          original_receipt_id, gps_device_id, incoming_content_hash, reason_code,
          first_seen_at, last_seen_at
        ) values (
          v_sequence_existing.id, v_device.id, p_content_hash,
          'sequence_replay_invalid', p_received_at, p_received_at
        )
        on conflict on constraint telemetry_identity_conflicts_dedupe_key
        do update set
          last_seen_at = greatest(public.telemetry_identity_conflicts.last_seen_at,
                                  excluded.last_seen_at),
          attempt_count = least(public.telemetry_identity_conflicts.attempt_count + 1,
                                1000000000);
        return query select 'rejected', 'not_applicable', false,
          'rejected', 'sequence_replay_invalid', false;
      end if;
      return;
    end if;

    select * into v_stream
    from public.telemetry_stream_state
    where gps_device_id = v_device.id
      and adapter_id = p_adapter_id
      and adapter_version = p_adapter_version
      and stream_epoch = p_stream_epoch
    for update;
    v_stream_found := found;
    if v_stream_found then
      if p_sequence < v_stream.high_water_sequence
         - v_policy.reorder_window_sequences then
        v_reason := 'sequence_replay_invalid';
      elsif p_sequence < v_stream.high_water_sequence then
        v_out_of_order := true;
      elsif p_sequence > v_stream.high_water_sequence + 1 then
        v_sequence_gap := true;
      end if;
    end if;
  end if;

  if v_reason is null then
    select count(*), min(l.id::text)::uuid into v_link_count, v_link.id
    from public.gps_device_vehicle_links l
    where l.gps_device_id = v_device.id and l.is_primary
      and l.effective_from <= p_captured_at
      and (l.effective_until is null or p_captured_at < l.effective_until);
    if v_link_count = 1 then
      select * into v_link from public.gps_device_vehicle_links
      where id = v_link.id for share;
      select count(*), min(h.id::text)::uuid into v_assignment_count, v_assignment.id
      from public.m21_assignment_history h
      where h.vehicle_id = v_link.vehicle_id
        and h.assignment_status in ('assigned', 'ready_for_execution')
        and h.effective_from <= p_captured_at
        and (h.effective_until is null or p_captured_at < h.effective_until);
      if v_assignment_count = 1 then
        select * into v_assignment from public.m21_assignment_history
        where id = v_assignment.id for share;
        select count(*) into v_release_count
        from public.m21_release_history r
        where r.ad_work_id = v_assignment.ad_work_id
          and r.release_status = 'released_to_driver'
          and r.effective_from <= p_captured_at
          and (r.effective_until is null or p_captured_at < r.effective_until);
        select count(*), min(d.id::text)::uuid, min(e.id::text)::uuid
          into v_execution_count, v_day.id, v_execution.id
        from public.ad_work_days d
        join public.m21_execution_history e on e.ad_work_day_id = d.id
        where d.ad_work_id = v_assignment.ad_work_id
          and e.execution_status = 'running'
          and e.effective_from <= p_captured_at
          and (
            e.effective_until is null
            or p_captured_at < e.effective_until
            or (
              p_captured_at = e.effective_until
              and exists (
                select 1 from public.m21_execution_history next_e
                where next_e.ad_work_day_id = e.ad_work_day_id
                  and next_e.effective_from = e.effective_until
                  and next_e.execution_status = 'completed'
              )
            )
          );
        if v_release_count = 1 and v_execution_count = 1 then
          select * into v_day from public.ad_work_days where id = v_day.id for share;
          select * into v_execution from public.m21_execution_history
          where id = v_execution.id for share;
          select min(effective_from) into v_actual_end
          from public.m21_execution_history
          where ad_work_day_id = v_day.id
            and execution_status = 'completed'
            and effective_from >= v_execution.effective_from;
          v_work_valid := true;
        elsif v_release_count > 1 or v_execution_count > 1 then
          v_reason := 'authority_ambiguous';
        else
          v_reason := 'outside_active_work';
        end if;
      elsif v_assignment_count > 1 then
        v_reason := 'authority_ambiguous';
      else
        v_reason := 'assignment_not_effective';
      end if;
    elsif v_link_count > 1 then
      v_reason := 'authority_ambiguous';
    else
      v_reason := 'vehicle_link_not_effective';
    end if;
  end if;

  if v_work_valid then
    if v_actual_end is not null
       and p_received_at > v_actual_end
         + make_interval(secs => v_policy.delayed_backfill_seconds) then
      v_work_valid := false;
      v_reason := 'delayed_backfill_expired';
    elsif v_actual_end is null
       and p_received_at > p_captured_at
         + make_interval(secs => v_policy.delayed_backfill_seconds) then
      v_work_valid := false;
      v_reason := 'delayed_backfill_expired';
    end if;
  end if;

  if v_work_valid and v_location then
    if (v_execution.effective_until is null
        or p_received_at <= v_execution.effective_until)
       and p_received_at - p_captured_at
         <= make_interval(secs => v_policy.live_freshness_seconds) then
      v_disposition := 'accepted_live';
      v_freshness := 'live';
    else
      v_disposition := 'accepted_delayed';
      v_freshness := 'degraded_freshness';
      v_offline := true;
    end if;
    v_reason := case when v_sequence_gap then 'sequence_gap'
                     when v_out_of_order then 'out_of_order_accepted'
                     else 'accepted' end;
    v_quality := case when p_quality = 'valid' and not v_sequence_gap
                      then 'valid' else 'degraded' end;
  elsif (
    p_heartbeat is not null or p_battery_percent is not null
    or p_external_power is not null or p_firmware_version is not null
    or p_gps_fix is not null or p_gsm_signal_dbm is not null
  ) and (
    v_work_valid
    or v_reason in (
      'vehicle_link_not_effective', 'assignment_not_effective',
      'outside_active_work'
    )
  ) then
    v_disposition := 'health_only';
    v_freshness := 'not_applicable';
    v_reason := coalesce(v_reason, 'health_only');
    v_quality := case when v_work_valid and p_quality <> 'suspect'
                      then p_quality else 'degraded' end;
  else
    v_disposition := 'rejected';
    v_freshness := 'not_applicable';
    v_reason := coalesce(v_reason, 'no_permitted_measurement');
    v_quality := 'rejected';
  end if;

  if p_stream_epoch is not null and v_disposition <> 'rejected' then
    if v_stream_found then
      if p_sequence > v_stream.high_water_sequence then
        update public.telemetry_stream_state
        set high_water_sequence = p_sequence,
            last_content_hash = p_content_hash, updated_at = p_received_at
        where gps_device_id = v_device.id
          and adapter_id = p_adapter_id
          and adapter_version = p_adapter_version
          and stream_epoch = p_stream_epoch;
      end if;
    else
      insert into public.telemetry_stream_state (
        gps_device_id, adapter_id, adapter_version, stream_epoch,
        high_water_sequence, last_content_hash, first_seen_at, updated_at
      ) values (
        v_device.id, p_adapter_id, p_adapter_version, p_stream_epoch,
        p_sequence, p_content_hash, p_received_at, p_received_at
      );
    end if;
  end if;

  if v_disposition in ('accepted_live', 'accepted_delayed') then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        v_device.id::text || ':' || v_day.id::text || ':physical-session', 23
      )
    );
    select id into v_session_id
    from public.tracking_sessions
    where ad_work_day_id = v_day.id
      and gps_device_id = v_device.id
      and tracking_mode = 'physical_device'
    for update;
    if not found then
      insert into public.tracking_sessions (
        ad_work_id, ad_work_day_id, assignment_id, driver_id, vehicle_id,
        gps_device_id, source_type, tracking_mode, status, started_at,
        last_update_at, point_count, quality_status, tracking_health_status,
        synthetic, updated_at
      ) values (
        v_assignment.ad_work_id, v_day.id, v_assignment.assignment_id,
        v_assignment.driver_id, v_assignment.vehicle_id, v_device.id,
        'device', 'physical_device', 'running', p_captured_at,
        p_captured_at, 0, 'unknown', 'healthy', p_synthetic, p_received_at
      ) returning id into v_session_id;
    end if;
  end if;

  insert into public.telemetry_receipts (
    id, gps_device_id, credential_id, adapter_id, adapter_version,
    idempotency_identity, content_hash, raw_payload_hash, client_event_id,
    stream_epoch, sequence, captured_at, received_at, normalized_at,
    disposition, reason_code, freshness, offline_backfill, quality, synthetic,
    processing_version, ad_work_id, ad_work_day_id, assignment_id, driver_id,
    vehicle_id, tracking_session_id
  ) values (
    v_receipt_id, v_device.id, v_credential.id, p_adapter_id, p_adapter_version,
    p_idempotency_identity, p_content_hash, p_raw_payload_hash, p_client_event_id,
    p_stream_epoch, p_sequence, p_captured_at, p_received_at, p_normalized_at,
    v_disposition, v_reason, v_freshness, v_offline, v_quality, p_synthetic,
    p_processing_version,
    case when v_work_valid then v_assignment.ad_work_id end,
    case when v_work_valid then v_day.id end,
    case when v_work_valid then v_assignment.assignment_id end,
    case when v_work_valid then v_assignment.driver_id end,
    case when v_work_valid then v_assignment.vehicle_id end,
    v_session_id
  );

  if v_disposition in ('accepted_live', 'accepted_delayed') then
    insert into public.location_points (
      tracking_session_id, ad_work_id, ad_work_day_id, assignment_id,
      driver_id, vehicle_id, device_id, source, recorded_at, received_at,
      lat, lng, altitude_meters, accuracy_meters, speed, heading,
      satellite_count, offline_synced, offline_backfill, freshness, quality,
      synthetic, telemetry_receipt_id
    ) values (
      v_session_id, v_assignment.ad_work_id, v_day.id,
      v_assignment.assignment_id, v_assignment.driver_id,
      v_assignment.vehicle_id, v_device.id, 'physical_device',
      p_captured_at, p_received_at, p_latitude, p_longitude,
      p_altitude_meters, p_accuracy_meters,
      case when p_speed_mps is null then null else p_speed_mps * 3.6 end,
      p_heading_degrees, p_satellites, v_offline, v_offline, v_freshness,
      case when v_quality = 'valid' then 'good'::public.location_quality
           when v_quality = 'degraded' then 'weak'::public.location_quality
           else 'unknown'::public.location_quality end,
      p_synthetic, v_receipt_id
    );
    update public.tracking_sessions
    set point_count = point_count + 1,
        last_update_at = greatest(coalesce(last_update_at, p_captured_at),
                                  p_captured_at),
        quality_status = case when v_quality = 'valid'
                              then 'good'::public.location_quality
                              else 'weak'::public.location_quality end,
        updated_at = p_received_at
    where id = v_session_id;

    for v_observation in
      select value from jsonb_array_elements(coalesce(p_observations, '[]'::jsonb))
    loop
      v_ordinal := v_ordinal + 1;
      if jsonb_typeof(v_observation) <> 'object'
         or exists (
           select 1 from jsonb_object_keys(v_observation) k
           where k not in (
             'contractVersion', 'capturedAt', 'deviceExternalId', 'source',
             'normalizationVersion', 'quality', 'synthetic', 'metric',
             'value', 'unit'
           )
         )
      then
        raise exception 'Unsupported sensor observation' using errcode = '22023';
      end if;
      v_metric := v_observation->>'metric';
      v_unit := v_observation->>'unit';
      v_value := v_observation->'value';
      v_value_type := case jsonb_typeof(v_value)
        when 'number' then 'number'
        when 'boolean' then 'boolean'
        when 'string' then 'controlled_text'
        else 'invalid'
      end;
      if (v_observation->>'capturedAt')::timestamptz is distinct from p_captured_at
         or v_observation->>'source' <> p_source
         or (v_observation->>'synthetic')::boolean is distinct from p_synthetic
      then
        raise exception 'Sensor observation binding mismatch' using errcode = '22023';
      end if;
      insert into public.telemetry_sensor_observations (
        telemetry_receipt_id, gps_device_id, ordinal, metric, value_type,
        number_value, boolean_value, controlled_text_value, unit, captured_at,
        source, quality, normalization_version, synthetic
      ) values (
        v_receipt_id, v_device.id, v_ordinal, v_metric, v_value_type,
        case when v_value_type = 'number' then (v_value #>> '{}')::numeric end,
        case when v_value_type = 'boolean' then (v_value #>> '{}')::boolean end,
        case when v_value_type = 'controlled_text' then v_value #>> '{}' end,
        v_unit, p_captured_at, p_source, v_observation->>'quality',
        v_observation->>'normalizationVersion', p_synthetic
      );
    end loop;
  end if;

  if v_disposition in ('accepted_live', 'accepted_delayed', 'health_only') and (
    p_heartbeat is not null or p_battery_percent is not null
     or p_external_power is not null or p_firmware_version is not null
     or p_gps_fix is not null or p_gsm_signal_dbm is not null) then
    update public.gps_devices
    set last_heartbeat_at = case when coalesce(p_heartbeat, false)
                                 then greatest(coalesce(last_heartbeat_at,
                                                       p_received_at), p_received_at)
                                 else last_heartbeat_at end,
        last_telemetry_at = case when v_disposition = 'accepted_live'
                                 then greatest(coalesce(last_telemetry_at,
                                                       p_received_at), p_received_at)
                                 else last_telemetry_at end,
        battery_status = case
          when p_battery_percent is null then battery_status
          when p_battery_percent <= 10 then 'critical'
          when p_battery_percent <= 25 then 'low'
          else 'normal' end,
        external_power_status = case
          when p_external_power is null then external_power_status
          when p_external_power then 'connected' else 'disconnected' end,
        firmware_version = coalesce(p_firmware_version, firmware_version),
        gps_readiness = case
          when p_gps_fix is null then gps_readiness
          when p_gps_fix = 'none' then 'unavailable'
          else 'ready' end,
        gsm_readiness = case
          when p_gsm_signal_dbm is null then gsm_readiness
          when p_gsm_signal_dbm < -110 then 'degraded'
          else 'ready' end
    where id = v_device.id;
  end if;

  return query select v_disposition, v_freshness, v_offline,
    v_quality, v_reason, false;
end;
$$;

alter table public.m21_ingestion_policies enable row level security;
alter table public.m21_rate_limit_policies enable row level security;
alter table public.m21_rate_limit_buckets enable row level security;
alter table public.m21_assignment_history enable row level security;
alter table public.m21_release_history enable row level security;
alter table public.m21_execution_history enable row level security;
alter table public.telemetry_receipts enable row level security;
alter table public.telemetry_identity_conflicts enable row level security;
alter table public.telemetry_stream_state enable row level security;
alter table public.telemetry_sensor_observations enable row level security;

create policy "Admins can view M21 assignment history"
  on public.m21_assignment_history for select to authenticated
  using (public.is_admin());
create policy "Admins can view M21 release history"
  on public.m21_release_history for select to authenticated
  using (public.is_admin());
create policy "Admins can view M21 execution history"
  on public.m21_execution_history for select to authenticated
  using (public.is_admin());
create policy "Admins can view telemetry receipts"
  on public.telemetry_receipts for select to authenticated
  using (public.is_admin());
create policy "Admins can view telemetry conflicts"
  on public.telemetry_identity_conflicts for select to authenticated
  using (public.is_admin());
create policy "Admins can view telemetry sensor observations"
  on public.telemetry_sensor_observations for select to authenticated
  using (public.is_admin());

revoke all on public.m21_ingestion_policies from public, anon, authenticated;
revoke all on public.m21_rate_limit_policies from public, anon, authenticated;
revoke all on public.m21_rate_limit_buckets from public, anon, authenticated;
revoke all on public.m21_assignment_history from public, anon, authenticated;
revoke all on public.m21_release_history from public, anon, authenticated;
revoke all on public.m21_execution_history from public, anon, authenticated;
revoke all on public.telemetry_receipts from public, anon, authenticated;
revoke all on public.telemetry_identity_conflicts from public, anon, authenticated;
revoke all on public.telemetry_stream_state from public, anon, authenticated;
revoke all on public.telemetry_sensor_observations from public, anon, authenticated;

grant select on public.m21_assignment_history to authenticated;
grant select on public.m21_release_history to authenticated;
grant select on public.m21_execution_history to authenticated;
grant select on public.telemetry_receipts to authenticated;
grant select on public.telemetry_identity_conflicts to authenticated;
grant select on public.telemetry_sensor_observations to authenticated;

revoke all on function public.m21_consume_rate_limit(text, text, integer, timestamptz)
  from public, anon, authenticated;
revoke all on function public.m21_lookup_device_credential(text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.m21_mark_credential_verified(uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.m21_persist_telemetry_event(
  uuid, text, text, text, text, text, text, text, bigint,
  timestamptz, timestamptz, timestamptz,
  numeric, numeric, numeric, numeric, numeric, numeric, integer,
  boolean, numeric, boolean, text, text, numeric, jsonb,
  text, text, boolean, text
) from public, anon, authenticated;

grant execute on function public.m21_consume_rate_limit(text, text, integer, timestamptz)
  to service_role;
grant execute on function public.m21_lookup_device_credential(text, text, timestamptz)
  to service_role;
grant execute on function public.m21_mark_credential_verified(uuid, timestamptz)
  to service_role;
grant execute on function public.m21_persist_telemetry_event(
  uuid, text, text, text, text, text, text, text, bigint,
  timestamptz, timestamptz, timestamptz,
  numeric, numeric, numeric, numeric, numeric, numeric, integer,
  boolean, numeric, boolean, text, text, numeric, jsonb,
  text, text, boolean, text
) to service_role;

comment on table public.telemetry_receipts is
  'Canonical-safe M21 receipt evidence. No raw payload, secret, or rejected coordinate is stored.';
comment on table public.telemetry_stream_state is
  'Server-only per-device adapter stream high-water state for bounded replay/reordering.';
comment on table public.telemetry_sensor_observations is
  'Typed approved sensor observations only; no arbitrary JSON values are stored.';

-- Final M21 trigger definitions use authoritative workflow timestamps.
create or replace function public.m21_capture_release_history()
returns trigger language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_at timestamptz := clock_timestamp();
  v_effective timestamptz;
begin
  if new.execution_release_status is distinct from old.execution_release_status then
    v_effective := case new.execution_release_status
      when 'released_to_driver' then new.work_access_code_created_at
      when 'access_revoked' then new.work_access_revoked_at
      else null end;
    select greatest(coalesce(v_effective, v_at),
      max(effective_from) + interval '1 microsecond') into v_effective
    from public.m21_release_history
    where ad_work_id = old.id and effective_until is null;
    update public.m21_release_history set effective_until = v_effective
    where ad_work_id = old.id and effective_until is null;
    insert into public.m21_release_history
      (ad_work_id, release_status, effective_from, history_origin)
    values (new.id, new.execution_release_status, v_effective, 'observed');
  end if;
  return new;
end;
$$;

create or replace function public.m21_capture_execution_history()
returns trigger language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_at timestamptz := clock_timestamp();
  v_effective timestamptz;
begin
  if new.execution_status is distinct from old.execution_status then
    v_effective := case
      when new.execution_status = 'running' and old.execution_status = 'on_break'
        then new.last_resumed_at
      when new.execution_status = 'running' then new.execution_started_at
      when new.execution_status = 'on_break' then new.break_started_at
      when new.execution_status = 'completed' then new.execution_completed_at
      else new.execution_updated_at end;
    select greatest(coalesce(v_effective, v_at),
      max(effective_from) + interval '1 microsecond') into v_effective
    from public.m21_execution_history
    where ad_work_day_id = old.id and effective_until is null;
    update public.m21_execution_history set effective_until = v_effective
    where ad_work_day_id = old.id and effective_until is null;
    insert into public.m21_execution_history
      (ad_work_day_id, execution_status, effective_from, history_origin)
    values (new.id, new.execution_status, v_effective, 'observed');
    if new.execution_status = 'completed' then
      update public.tracking_sessions
      set status = 'completed', ended_at = v_effective, stopped_by = 'system',
          stop_reason = 'work_ended', tracking_health_status = 'stopped',
          updated_at = v_at
      where ad_work_day_id = new.id and tracking_mode = 'physical_device'
        and status in ('not_started', 'running', 'paused');
    end if;
  end if;
  return new;
end;
$$;

drop function public.m21_lookup_device_credential(text, text, timestamptz);
create function public.m21_lookup_device_credential(
  p_claimed_device_code text, p_credential_key_id text,
  p_received_at timestamptz default clock_timestamp()
) returns table(
  gps_device_id uuid, device_code text, device_status text,
  installation_state text, gps_readiness text, gsm_readiness text,
  adapter_type text, protocol_type text, credential_id uuid,
  credential_key_id text, credential_status text,
  verification_material_hash text, issued_at timestamptz, expires_at timestamptz,
  rotated_at timestamptz, revoked_at timestamptz,
  has_active_rotation_successor boolean, eligible boolean
) language sql security definer
set search_path = pg_catalog, public
as $$
  select d.id, d.device_code, d.status::text, d.installation_state,
    d.gps_readiness, d.gsm_readiness, d.adapter_type, d.protocol_type,
    c.id, c.credential_key_id, c.status, c.verification_material_hash,
    c.issued_at, c.expires_at, c.rotated_at, c.revoked_at,
    exists (select 1 from public.gps_device_credential_metadata successor
      where successor.rotated_from_credential_id = c.id
        and successor.status = 'active' and successor.issued_at <= p_received_at
        and (successor.expires_at is null or successor.expires_at > p_received_at)
        and successor.revoked_at is null),
    (d.status = 'active'::public.gps_device_status
      and d.installation_state = 'installed'
      and c.verification_material_hash ~ '^[0-9a-f]{64}$'
      and c.issued_at is not null and c.issued_at <= p_received_at
      and (c.expires_at is null or c.expires_at > p_received_at)
      and (c.revoked_at is null or c.revoked_at > p_received_at)
      and c.status in ('active', 'rotating')
      and d.gps_readiness = 'ready'
      and d.gsm_readiness in ('ready', 'degraded')
      and exists (
        select 1 from public.gps_device_vehicle_links link
        where link.gps_device_id = d.id and link.is_primary
          and link.effective_from <= p_received_at
          and (link.effective_until is null or link.effective_until > p_received_at)
      ))
  from public.gps_devices d
  join public.gps_device_credential_metadata c on c.gps_device_id = d.id
  where lower(trim(d.device_code)) = lower(trim(p_claimed_device_code))
    and lower(trim(c.credential_key_id)) = lower(trim(p_credential_key_id))
    and char_length(p_claimed_device_code) between 1 and 64
    and char_length(p_credential_key_id) between 1 and 128
  limit 1;
$$;
revoke all on function public.m21_lookup_device_credential(text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.m21_lookup_device_credential(text, text, timestamptz)
  to service_role;

-- New work/day rows also receive an explicit post-M21 history boundary.
create or replace function public.m21_capture_release_history()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare v_at timestamptz := clock_timestamp(); v_effective timestamptz;
begin
  if tg_op = 'INSERT' then
    insert into public.m21_release_history
      (ad_work_id, release_status, effective_from, history_origin)
    values (new.id, new.execution_release_status,
            coalesce(new.created_at, v_at), 'observed');
  elsif new.execution_release_status is distinct from old.execution_release_status then
    v_effective := case new.execution_release_status
      when 'released_to_driver' then new.work_access_code_created_at
      when 'access_revoked' then new.work_access_revoked_at else null end;
    select greatest(coalesce(v_effective, v_at),
      max(effective_from) + interval '1 microsecond') into v_effective
    from public.m21_release_history
    where ad_work_id = old.id and effective_until is null;
    update public.m21_release_history set effective_until = v_effective
    where ad_work_id = old.id and effective_until is null;
    insert into public.m21_release_history
      (ad_work_id, release_status, effective_from, history_origin)
    values (new.id, new.execution_release_status, v_effective, 'observed');
  end if; return new;
end; $$;
drop trigger m21_capture_release_history on public.ad_works;
create trigger m21_capture_release_history
after insert or update of execution_release_status on public.ad_works
for each row execute function public.m21_capture_release_history();

create or replace function public.m21_capture_execution_history()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare v_at timestamptz := clock_timestamp(); v_effective timestamptz;
begin
  if tg_op = 'INSERT' then
    insert into public.m21_execution_history
      (ad_work_day_id, execution_status, effective_from, history_origin)
    values (new.id, new.execution_status, coalesce(new.created_at, v_at), 'observed');
  elsif new.execution_status is distinct from old.execution_status then
    v_effective := case
      when new.execution_status = 'running' and old.execution_status = 'on_break'
        then new.last_resumed_at
      when new.execution_status = 'running' then new.execution_started_at
      when new.execution_status = 'on_break' then new.break_started_at
      when new.execution_status = 'completed' then new.execution_completed_at
      else new.execution_updated_at end;
    select greatest(coalesce(v_effective, v_at),
      max(effective_from) + interval '1 microsecond') into v_effective
    from public.m21_execution_history
    where ad_work_day_id = old.id and effective_until is null;
    update public.m21_execution_history set effective_until = v_effective
    where ad_work_day_id = old.id and effective_until is null;
    insert into public.m21_execution_history
      (ad_work_day_id, execution_status, effective_from, history_origin)
    values (new.id, new.execution_status, v_effective, 'observed');
    if new.execution_status = 'completed' then
      update public.tracking_sessions
      set status = 'completed', ended_at = v_effective, stopped_by = 'system',
          stop_reason = 'work_ended', tracking_health_status = 'stopped',
          updated_at = v_at
      where ad_work_day_id = new.id and tracking_mode = 'physical_device'
        and status in ('not_started', 'running', 'paused');
    end if;
  end if; return new;
end; $$;
drop trigger m21_capture_execution_history on public.ad_work_days;
create trigger m21_capture_execution_history
after insert or update of execution_status on public.ad_work_days
for each row execute function public.m21_capture_execution_history();

create or replace function public.m21_protect_simple_effective_history()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'M21 effective history cannot be deleted' using errcode = '55000';
  end if;
  if old.effective_until is not null or new.effective_until is null
     or new.effective_until <= old.effective_from
     or (to_jsonb(new) - 'effective_until')
        is distinct from (to_jsonb(old) - 'effective_until') then
    raise exception 'M21 effective history is immutable except for one interval closure'
      using errcode = '55000';
  end if;
  return new;
end; $$;
