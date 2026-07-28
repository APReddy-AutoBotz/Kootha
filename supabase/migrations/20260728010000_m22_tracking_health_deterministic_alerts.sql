-- M22 Tracking Health and Deterministic Alerts
-- Provisional pilot policy only. This migration does not represent AP production-policy approval.

-- Replace the two legacy alert enums without CASCADE so all required values are
-- transactionally usable in this single forward migration. Existing IDs and rows remain intact.
alter type public.alert_status rename to alert_status_legacy_m22;
create type public.alert_status as enum (
  'new','acknowledged','investigating','resolved','false_alarm','ignored'
);
alter table public.alerts alter column status drop default;
alter table public.alerts alter column status type public.alert_status
  using (case when status::text = 'open' then 'new' else status::text end)::public.alert_status;
alter table public.alerts alter column status set default 'new'::public.alert_status;
drop type public.alert_status_legacy_m22;

alter type public.alert_type rename to alert_type_legacy_m22;
create type public.alert_type as enum (
  'long_stop','gps_lost','network_lost','missed_area','device_not_responding','mismatch',
  'heartbeat_missing','location_update_missing','device_offline','battery_low',
  'external_power_removed','gps_fix_missing','gsm_signal_weak','impossible_speed',
  'identity_conflict','sequence_conflict','sequence_gap','out_of_order',
  'invalid_coordinate','unsupported_sensor_observation','delayed_backfill_expired',
  'captured_after_end_work','off_work_location_attempt','vehicle_link_not_effective',
  'assignment_not_effective','authority_ambiguous','unknown_device_or_credential',
  'reconnect_or_live_recovery'
);
alter table public.alerts alter column type type public.alert_type
  using type::text::public.alert_type;
drop type public.alert_type_legacy_m22;
create table public.m22_rule_policies (
  rule_id text not null,
  rule_version text not null,
  effective_from timestamptz not null,
  effective_until timestamptz,
  enabled boolean not null default true,
  default_severity public.alert_severity not null,
  escalation_severity public.alert_severity,
  opening_threshold numeric,
  clearing_threshold numeric,
  duration_seconds integer,
  window_seconds integer,
  required_count integer not null default 1,
  cooldown_seconds integer not null default 0,
  value_unit text,
  evaluation_source text not null,
  evidence_timing text not null,
  movement_radius_meters numeric,
  maximum_speed_kph numeric,
  maximum_accuracy_meters numeric,
  created_at timestamptz not null default clock_timestamp(),
  safe_policy_note text not null,
  primary key (rule_id, rule_version),
  constraint m22_rule_policies_rule_check check (rule_id in (
    'heartbeat_missing','location_update_missing','device_offline','battery_low',
    'external_power_removed','gps_fix_missing','gsm_signal_weak','long_stop',
    'impossible_speed','identity_conflict','sequence_conflict','sequence_gap',
    'out_of_order','invalid_coordinate','unsupported_sensor_observation',
    'delayed_backfill_expired','captured_after_end_work','off_work_location_attempt',
    'vehicle_link_not_effective','assignment_not_effective','authority_ambiguous',
    'unknown_device_or_credential','reconnect_or_live_recovery'
  )),
  constraint m22_rule_policies_bounds_check check (
    char_length(rule_version) between 1 and 32
    and (effective_until is null or effective_until > effective_from)
  ),
  constraint m22_rule_policies_typed_bounds_check check (
    (opening_threshold is null or opening_threshold >= 0)
    and (clearing_threshold is null or clearing_threshold >= 0)
    and (duration_seconds is null or duration_seconds between 1 and 2592000)
    and (window_seconds is null or window_seconds between 1 and 2592000)
    and required_count between 1 and 100000
    and cooldown_seconds between 0 and 2592000
    and (movement_radius_meters is null or movement_radius_meters between 0 and 100000)
    and (maximum_speed_kph is null or maximum_speed_kph between 1 and 2000)
    and (maximum_accuracy_meters is null or maximum_accuracy_meters between 1 and 100000)
  ),
  constraint m22_rule_policies_source_check check (
    evaluation_source in ('telemetry_receipt','identity_conflict','device_health',
      'location_points','authority_receipt','adapter_rejection','authentication_failure',
      'health_sweep','recovery')
  ),
  constraint m22_rule_policies_timing_check
    check (evidence_timing in ('live_only','live_or_historical','historical_only')),
  constraint m22_rule_policies_text_check check (
    (value_unit is null or value_unit in (
      'seconds','minutes','percentage','dbm','meters','kilometers_per_hour',
      'count','boolean','state'
    ))
    and char_length(safe_policy_note) between 1 and 500
    and safe_policy_note not like '%://%'
  )
);

create extension if not exists btree_gist with schema extensions;
alter table public.m22_rule_policies
  add constraint m22_rule_policies_no_effective_overlap
  exclude using gist (
    rule_id with =,
    tstzrange(effective_from, coalesce(effective_until, 'infinity'::timestamptz), '[)') with &&
  ) where (enabled);

-- Exact, effective-dated, typed provisional pilot catalog. All 23 M22 rule IDs are present.
insert into public.m22_rule_policies (
  rule_id, rule_version, effective_from, default_severity, escalation_severity,
  opening_threshold, clearing_threshold, duration_seconds, window_seconds,
  required_count, cooldown_seconds, value_unit, evaluation_source, evidence_timing,
  movement_radius_meters, maximum_speed_kph, maximum_accuracy_meters, safe_policy_note
) values
('heartbeat_missing','m22-pilot-v1','2026-07-28 00:00:00+00','warning',null,120,30,120,120,1,120,'seconds','health_sweep','live_only',null,null,null,'Provisional configurable pilot: expected telemetry profile is 15 seconds; no AP production-policy approval.'),
('location_update_missing','m22-pilot-v1','2026-07-28 00:00:00+00','warning',null,120,30,120,120,1,120,'seconds','health_sweep','live_only',null,null,null,'Provisional configurable pilot; running work only, excluding recorded breaks.'),
('device_offline','m22-pilot-v1','2026-07-28 00:00:00+00','critical',null,600,120,600,600,1,300,'seconds','health_sweep','live_only',null,null,null,'Provisional configurable pilot; deliberately longer than ordinary missing-update warnings.'),
('battery_low','m22-pilot-v1','2026-07-28 00:00:00+00','warning','critical',20,25,null,300,2,120,'percentage','device_health','live_only',null,null,null,'Provisional configurable pilot; one episode escalates rather than opening competing alerts.'),
('external_power_removed','m22-pilot-v1','2026-07-28 00:00:00+00','warning',null,1,0,null,300,2,120,'boolean','device_health','live_only',null,null,null,'Provisional configurable pilot.'),
('gps_fix_missing','m22-pilot-v1','2026-07-28 00:00:00+00','warning',null,1,0,120,300,2,120,'boolean','device_health','live_only',null,null,null,'Provisional configurable pilot.'),
('gsm_signal_weak','m22-pilot-v1','2026-07-28 00:00:00+00','warning','critical',95,85,null,300,2,120,'dbm','device_health','live_only',null,null,null,'Provisional configurable pilot; stored magnitude represents negative dBm threshold.'),
('long_stop','m22-pilot-v1','2026-07-28 00:00:00+00','warning',null,900,300,900,1200,4,300,'seconds','location_points','live_only',50,null,100,'Provisional configurable pilot; same authority episode and running work only.'),
('impossible_speed','m22-pilot-v1','2026-07-28 00:00:00+00','warning','critical',140,100,null,300,1,300,'kilometers_per_hour','location_points','live_or_historical',null,140,100,'Provisional configurable physical-point-only pilot.'),
('identity_conflict','m22-pilot-v1','2026-07-28 00:00:00+00','warning',null,1,0,null,300,1,300,'count','identity_conflict','live_or_historical',null,null,null,'Provisional configurable pilot; changed-content reuse only.'),
('sequence_conflict','m22-pilot-v1','2026-07-28 00:00:00+00','warning',null,1,0,null,300,1,300,'count','identity_conflict','live_or_historical',null,null,null,'Provisional configurable pilot; changed-content sequence reuse only.'),
('sequence_gap','m22-pilot-v1','2026-07-28 00:00:00+00','warning',null,1,0,null,300,1,300,'count','telemetry_receipt','live_or_historical',null,null,null,'Provisional configurable pilot.'),
('out_of_order','m22-pilot-v1','2026-07-28 00:00:00+00','info',null,1,0,null,300,1,300,'count','telemetry_receipt','live_or_historical',null,null,null,'Provisional configurable bounded-reorder pilot.'),
('invalid_coordinate','m22-pilot-v1','2026-07-28 00:00:00+00','warning',null,1,0,null,300,1,300,'count','adapter_rejection','live_or_historical',null,null,null,'Provisional configurable pilot; rejected coordinates are never retained.'),
('unsupported_sensor_observation','m22-pilot-v1','2026-07-28 00:00:00+00','info',null,1,0,null,300,1,300,'count','adapter_rejection','live_or_historical',null,null,null,'Provisional configurable pilot; bounded approved-sensor rejection only.'),
('delayed_backfill_expired','m22-pilot-v1','2026-07-28 00:00:00+00','warning',null,86400,0,null,86400,1,600,'seconds','authority_receipt','historical_only',null,null,null,'Provisional configurable pilot; separate from two-minute live freshness.'),
('captured_after_end_work','m22-pilot-v1','2026-07-28 00:00:00+00','warning',null,1,0,null,300,1,300,'count','authority_receipt','live_or_historical',null,null,null,'Provisional configurable pilot using stable M21 receipt reason.'),
('off_work_location_attempt','m22-pilot-v1','2026-07-28 00:00:00+00','warning',null,1,0,null,300,1,300,'count','authority_receipt','live_or_historical',null,null,null,'Provisional configurable pilot using stable M21 receipt reason.'),
('vehicle_link_not_effective','m22-pilot-v1','2026-07-28 00:00:00+00','critical',null,1,0,null,300,1,300,'count','authority_receipt','live_or_historical',null,null,null,'Provisional configurable pilot using authoritative link history.'),
('assignment_not_effective','m22-pilot-v1','2026-07-28 00:00:00+00','critical',null,1,0,null,300,1,300,'count','authority_receipt','live_or_historical',null,null,null,'Provisional configurable pilot using authoritative assignment history.'),
('authority_ambiguous','m22-pilot-v1','2026-07-28 00:00:00+00','critical',null,1,0,null,300,1,300,'count','authority_receipt','live_or_historical',null,null,null,'Provisional configurable pilot; no authority is inferred.'),
('unknown_device_or_credential','m22-pilot-v1','2026-07-28 00:00:00+00','warning','critical',5,0,null,300,5,600,'count','authentication_failure','live_or_historical',null,null,null,'Provisional configurable pilot; keyed fingerprint aggregation threshold prevents single-request noise.'),
('reconnect_or_live_recovery','m22-pilot-v1','2026-07-28 00:00:00+00','info',null,1,0,null,120,1,0,'state','recovery','live_only',null,null,null,'Provisional recovery-only signal; it does not create a noisy recovery alert.');

alter table public.alerts
  add column rule_id text,
  add column rule_version text,
  add column source text not null default 'legacy',
  add column dedupe_key text,
  add column episode_number integer not null default 1,
  add column condition_active boolean not null default false,
  add column condition_cleared_at timestamptz,
  add column first_detected_at timestamptz,
  add column last_detected_at timestamptz,
  add column occurrence_count integer not null default 1,
  add column gps_device_id uuid references public.gps_devices(id) on delete restrict,
  add column vehicle_id uuid references public.vehicles(id) on delete restrict,
  add column ad_work_id uuid references public.ad_works(id) on delete restrict,
  add column assignment_id uuid references public.ad_work_assignments(id) on delete restrict,
  add column tracking_session_id uuid references public.tracking_sessions(id) on delete restrict,
  add column first_telemetry_receipt_id uuid references public.telemetry_receipts(id) on delete restrict,
  add column last_telemetry_receipt_id uuid references public.telemetry_receipts(id) on delete restrict,
  add column gps_device_vehicle_link_id uuid references public.gps_device_vehicle_links(id) on delete restrict,
  add column assignment_history_id uuid references public.m21_assignment_history(id) on delete restrict,
  add column execution_history_id uuid references public.m21_execution_history(id) on delete restrict,
  add column synthetic boolean not null default false,
  add column title text,
  add column observed_value numeric,
  add column threshold_value numeric,
  add column value_unit text,
  add column status_changed_at timestamptz,
  add column status_changed_by uuid,
  add column updated_at timestamptz,
  add column origin text not null default 'legacy_pre_m22';

update public.alerts
set first_detected_at = created_at,
    last_detected_at = created_at,
    status_changed_at = coalesce(resolved_at, created_at),
    updated_at = coalesce(resolved_at, created_at),
    condition_active = status = 'new'::public.alert_status,
    condition_cleared_at = case when status = 'resolved' then coalesce(resolved_at, created_at) end,
    source = 'legacy',
    origin = 'legacy_pre_m22';

alter table public.alerts alter column origin set default 'm22_rule_engine';

alter table public.alerts
  add constraint alerts_m22_policy_fk foreign key (rule_id, rule_version)
    references public.m22_rule_policies(rule_id, rule_version) on delete restrict,
  add constraint alerts_m22_rule_pair_check check ((rule_id is null) = (rule_version is null)),
  add constraint alerts_m22_source_check check (source in (
    'legacy','physical_device_live','physical_device_delayed','health_sweep',
    'adapter_rejection','authentication_failure','recovery'
  )),
  add constraint alerts_m22_occurrence_check check (occurrence_count between 1 and 1000000000),
  add constraint alerts_m22_episode_check check (episode_number between 1 and 1000000000),
  add constraint alerts_m22_condition_check check (
    (condition_active and condition_cleared_at is null) or not condition_active
  ),
  add constraint alerts_m22_bounds_check check (
    (dedupe_key is null or dedupe_key ~ '^[0-9a-f]{64}$')
    and (title is null or char_length(title) between 1 and 160)
    and char_length(message) between 1 and 500
    and (value_unit is null or value_unit in (
      'seconds','minutes','percentage','dbm','meters','kilometers_per_hour',
      'count','boolean','state'
    ))
    and origin in ('legacy_pre_m22','m22_rule_engine')
  );

create unique index alerts_m22_active_episode_unique
  on public.alerts (dedupe_key)
  where dedupe_key is not null
    and status in ('new'::public.alert_status,'acknowledged'::public.alert_status,'investigating'::public.alert_status);
create index alerts_m22_admin_list_idx
  on public.alerts (status, severity, last_detected_at desc);

create table public.alert_status_history (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.alerts(id) on delete restrict,
  previous_status public.alert_status,
  new_status public.alert_status not null,
  actor_type text not null,
  actor_admin_id uuid,
  reason text not null,
  note text not null,
  transition_at timestamptz not null default clock_timestamp(),
  safe_source text not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint alert_status_history_actor_check check (actor_type in ('admin','system','service')),
  constraint alert_status_history_source_check check (safe_source in ('legacy_upgrade','rule_engine','admin_rpc')),
  constraint alert_status_history_bounds_check check (
    char_length(reason) between 1 and 160 and char_length(note) between 1 and 500
  )
);

create table public.alert_notes (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.alerts(id) on delete restrict,
  actor_admin_id uuid not null,
  reason text not null,
  note text not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint alert_notes_bounds_check check (
    char_length(reason) between 1 and 160 and char_length(note) between 1 and 500
  )
);

insert into public.alert_status_history (
  alert_id, previous_status, new_status, actor_type, actor_admin_id,
  reason, note, transition_at, safe_source
)
select id, null, status, 'system', null, 'legacy_upgrade',
  'Legacy alert status preserved during M22 upgrade.',
  coalesce(status_changed_at, created_at), 'legacy_upgrade'
from public.alerts;

create table public.m22_rule_signals (
  id uuid primary key default gen_random_uuid(),
  signal_key text not null unique,
  signal_kind text not null,
  reason_code text not null,
  occurred_at timestamptz not null,
  gps_device_id uuid references public.gps_devices(id) on delete restrict,
  telemetry_receipt_id uuid references public.telemetry_receipts(id) on delete restrict,
  identity_conflict_id uuid references public.telemetry_identity_conflicts(id) on delete restrict,
  adapter_id text,
  safe_fingerprint text,
  created_at timestamptz not null default clock_timestamp(),
  constraint m22_rule_signals_key_check check (signal_key ~ '^[0-9a-f]{64}$'),
  constraint m22_rule_signals_kind_check check (signal_kind in (
    'telemetry_receipt','identity_conflict','adapter_rejection',
    'authentication_failure','health_sweep','recovery'
  )),
  constraint m22_rule_signals_reason_check check (
    (signal_kind = 'telemetry_receipt' and reason_code = 'receipt_created')
    or (signal_kind = 'identity_conflict'
      and reason_code in ('event_identity_conflict','sequence_replay_invalid'))
    or (signal_kind = 'adapter_rejection'
      and reason_code in ('invalid_coordinate','unsupported_sensor_observation'))
    or (signal_kind = 'authentication_failure'
      and reason_code in ('presentation_missing','presentation_malformed',
        'credential_unknown','secret_invalid','device_ineligible'))
    or (signal_kind = 'health_sweep'
      and reason_code in ('heartbeat_missing','location_update_missing','device_offline'))
    or (signal_kind = 'recovery' and reason_code = 'reconnect_or_live_recovery')
  ),
  constraint m22_rule_signals_shape_check check (
    (signal_kind = 'telemetry_receipt'
      and telemetry_receipt_id is not null and gps_device_id is not null
      and identity_conflict_id is null and safe_fingerprint is null)
    or (signal_kind = 'identity_conflict'
      and identity_conflict_id is not null and gps_device_id is not null
      and telemetry_receipt_id is not null and safe_fingerprint is null)
    or (signal_kind = 'adapter_rejection'
      and identity_conflict_id is null and safe_fingerprint is null)
    or (signal_kind = 'authentication_failure'
      and safe_fingerprint ~ '^[0-9a-f]{64}$'
      and gps_device_id is null and telemetry_receipt_id is null
      and identity_conflict_id is null)
    or (signal_kind in ('health_sweep','recovery')
      and gps_device_id is not null and identity_conflict_id is null
      and safe_fingerprint is null)
  ),
  constraint m22_rule_signals_text_check check (
    (adapter_id is null or char_length(adapter_id) between 1 and 64)
    and char_length(reason_code) between 1 and 64
  )
);

create table public.m22_rule_evaluation_queue (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid not null unique references public.m22_rule_signals(id) on delete restrict,
  state text not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default clock_timestamp(),
  locked_at timestamptz,
  completed_at timestamptz,
  safe_failure_reason_code text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint m22_queue_state_check check (state in ('pending','processing','completed','failed')),
  constraint m22_queue_attempt_check check (attempt_count between 0 and 8),
  constraint m22_queue_failure_check check (
    safe_failure_reason_code is null or safe_failure_reason_code in (
      'policy_not_found','evidence_not_found','evidence_ineligible',
      'evaluation_failed','attempts_exhausted'
    )
  ),
  constraint m22_queue_completion_check check (
    (state = 'completed' and completed_at is not null)
    or (state <> 'completed' and completed_at is null)
  )
);
create index m22_rule_queue_claim_idx
  on public.m22_rule_evaluation_queue (next_attempt_at, created_at)
  where state in ('pending','processing');

create table public.m22_auth_failure_aggregates (
  safe_fingerprint text not null,
  adapter_id text not null,
  reason_code text not null,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  occurrence_count integer not null default 1,
  last_signal_id uuid not null references public.m22_rule_signals(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (safe_fingerprint, adapter_id, reason_code),
  constraint m22_auth_aggregate_fingerprint_check check (safe_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint m22_auth_aggregate_reason_check check (reason_code in (
    'presentation_missing','presentation_malformed','credential_unknown',
    'secret_invalid','device_ineligible'
  )),
  constraint m22_auth_aggregate_bounds_check check (
    char_length(adapter_id) between 1 and 64
    and occurrence_count between 1 and 1000000000
    and last_seen_at >= first_seen_at
  )
);

create table public.m22_rule_state (
  dedupe_key text primary key,
  rule_id text not null,
  rule_version text not null,
  alert_id uuid references public.alerts(id) on delete restrict,
  condition_active boolean not null default false,
  first_observed_at timestamptz,
  last_observed_at timestamptz,
  condition_cleared_at timestamptz,
  occurrence_count integer not null default 0,
  last_signal_id uuid references public.m22_rule_signals(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (rule_id, rule_version)
    references public.m22_rule_policies(rule_id, rule_version) on delete restrict,
  constraint m22_rule_state_key_check check (dedupe_key ~ '^[0-9a-f]{64}$'),
  constraint m22_rule_state_count_check check (occurrence_count between 0 and 1000000000),
  constraint m22_rule_state_clear_check check (
    (condition_active and condition_cleared_at is null) or not condition_active
  )
);

create table public.m22_rule_assessments (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid not null,
  rule_id text not null,
  rule_version text not null,
  outcome text not null,
  reason_code text not null,
  alert_id uuid references public.alerts(id) on delete restrict,
  observed_value numeric,
  threshold_value numeric,
  value_unit text,
  evidence_timing text not null,
  assessed_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  unique (signal_id, rule_id),
  foreign key (signal_id) references public.m22_rule_signals(id) on delete restrict,
  foreign key (rule_id, rule_version)
    references public.m22_rule_policies(rule_id, rule_version) on delete restrict,
  constraint m22_assessment_outcome_check
    check (outcome in ('opened','updated','cleared','no_change','ineligible')),
  constraint m22_assessment_reason_check check (char_length(reason_code) between 1 and 64),
  constraint m22_assessment_timing_check
    check (evidence_timing in ('live','delayed','historical','not_applicable')),
  constraint m22_assessment_unit_check check (
    value_unit is null or value_unit in (
      'seconds','minutes','percentage','dbm','meters','kilometers_per_hour',
      'count','boolean','state'
    )
  )
);

create or replace function public.m22_safe_digest(p_value text)
returns text language sql immutable strict
set search_path = pg_catalog, public
as $$ select encode(extensions.digest(p_value, 'sha256'), 'hex') $$;

create or replace function public.m22_policy_at(p_rule_id text, p_at timestamptz)
returns public.m22_rule_policies
language sql stable
set search_path = pg_catalog, public
as $$
  select p.* from public.m22_rule_policies p
  where p.rule_id = p_rule_id and p.enabled
    and p.effective_from <= p_at
    and (p.effective_until is null or p_at < p.effective_until)
  order by p.effective_from desc limit 1
$$;

create or replace function public.m22_enqueue_signal()
returns trigger language plpgsql set search_path = pg_catalog, public
as $$
begin
  insert into public.m22_rule_evaluation_queue(signal_id)
  values (new.id) on conflict (signal_id) do nothing;
  return new;
end;
$$;
create trigger m22_rule_signal_enqueue after insert on public.m22_rule_signals
for each row execute function public.m22_enqueue_signal();

create or replace function public.m22_capture_receipt_signal()
returns trigger language plpgsql set search_path = pg_catalog, public
as $$
begin
  insert into public.m22_rule_signals (
    signal_key, signal_kind, reason_code, occurred_at,
    gps_device_id, telemetry_receipt_id, adapter_id
  ) values (
    public.m22_safe_digest('receipt|' || new.id::text),
    'telemetry_receipt', 'receipt_created', new.received_at,
    new.gps_device_id, new.id, new.adapter_id
  ) on conflict (signal_key) do nothing;
  return new;
end;
$$;
create trigger telemetry_receipts_m22_signal after insert on public.telemetry_receipts
for each row execute function public.m22_capture_receipt_signal();

create or replace function public.m22_capture_conflict_signal()
returns trigger language plpgsql set search_path = pg_catalog, public
as $$
begin
  insert into public.m22_rule_signals (
    signal_key, signal_kind, reason_code, occurred_at, gps_device_id,
    telemetry_receipt_id, identity_conflict_id
  ) values (
    public.m22_safe_digest('conflict|' || new.id::text || '|' || new.attempt_count::text),
    'identity_conflict', new.reason_code, new.last_seen_at, new.gps_device_id,
    new.original_receipt_id, new.id
  ) on conflict (signal_key) do nothing;
  return new;
end;
$$;
create trigger telemetry_identity_conflicts_m22_signal
after insert or update of attempt_count on public.telemetry_identity_conflicts
for each row when (new.attempt_count > 0)
execute function public.m22_capture_conflict_signal();

create or replace function public.m22_record_sanitized_signal(
  p_signal_kind text,
  p_reason_code text,
  p_adapter_id text,
  p_occurred_at timestamptz default clock_timestamp(),
  p_gps_device_id uuid default null,
  p_telemetry_receipt_id uuid default null,
  p_safe_fingerprint text default null
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_id uuid; v_key text;
begin
  if p_signal_kind not in ('adapter_rejection','authentication_failure') then
    raise exception 'Unsupported sanitized signal kind' using errcode = '22023';
  end if;
  if p_adapter_id is null or char_length(trim(p_adapter_id)) not between 1 and 64 then
    raise exception 'Invalid adapter identifier' using errcode = '22023';
  end if;
  if p_occurred_at is null or p_occurred_at < clock_timestamp() - interval '7 days'
    or p_occurred_at > clock_timestamp() + interval '5 minutes'
  then raise exception 'Invalid signal time' using errcode = '22023'; end if;
  if p_signal_kind = 'adapter_rejection' then
    if p_reason_code not in ('invalid_coordinate','unsupported_sensor_observation')
      or p_safe_fingerprint is not null
    then raise exception 'Invalid adapter rejection signal' using errcode = '22023'; end if;
  else
    if p_reason_code not in ('presentation_missing','presentation_malformed',
      'credential_unknown','secret_invalid','device_ineligible')
      or p_safe_fingerprint !~ '^[0-9a-f]{64}$'
      or p_gps_device_id is not null or p_telemetry_receipt_id is not null
    then raise exception 'Invalid authentication failure signal' using errcode = '22023'; end if;
  end if;
  v_key := public.m22_safe_digest(concat_ws('|',p_signal_kind,p_reason_code,
    trim(p_adapter_id),coalesce(p_gps_device_id::text,''),
    coalesce(p_telemetry_receipt_id::text,''),coalesce(p_safe_fingerprint,''),
    extract(epoch from p_occurred_at)::text,gen_random_uuid()::text));
  insert into public.m22_rule_signals (
    signal_key,signal_kind,reason_code,occurred_at,gps_device_id,
    telemetry_receipt_id,adapter_id,safe_fingerprint
  ) values (
    v_key,p_signal_kind,p_reason_code,p_occurred_at,p_gps_device_id,
    p_telemetry_receipt_id,trim(p_adapter_id),p_safe_fingerprint
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.m22_rule_title(p_rule_id text)
returns text language sql immutable strict set search_path = pg_catalog
as $$
  select case p_rule_id
    when 'heartbeat_missing' then 'Device heartbeat missing'
    when 'location_update_missing' then 'Physical location update missing'
    when 'device_offline' then 'Physical device offline'
    when 'battery_low' then 'Device battery low'
    when 'external_power_removed' then 'External power removed'
    when 'gps_fix_missing' then 'GPS fix unavailable'
    when 'gsm_signal_weak' then 'GSM signal weak'
    when 'long_stop' then 'Long stop detected'
    when 'impossible_speed' then 'Implausible physical-device speed'
    when 'identity_conflict' then 'Telemetry identity conflict'
    when 'sequence_conflict' then 'Telemetry sequence conflict'
    when 'sequence_gap' then 'Telemetry sequence gap'
    when 'out_of_order' then 'Telemetry arrived out of order'
    when 'invalid_coordinate' then 'Invalid coordinate rejected'
    when 'unsupported_sensor_observation' then 'Unsupported sensor observation'
    when 'delayed_backfill_expired' then 'Delayed backfill expired'
    when 'captured_after_end_work' then 'Telemetry captured after End Work'
    when 'off_work_location_attempt' then 'Off-work location attempt'
    when 'vehicle_link_not_effective' then 'Vehicle link not effective'
    when 'assignment_not_effective' then 'Assignment not effective'
    when 'authority_ambiguous' then 'Tracking authority ambiguous'
    when 'unknown_device_or_credential' then 'Repeated device authentication failures'
    else 'Physical-device condition recovered'
  end
$$;

create or replace function public.m22_apply_rule_observation(
  p_signal_id uuid, p_rule_id text, p_detected_at timestamptz,
  p_source text, p_dedupe_context text, p_gps_device_id uuid default null,
  p_receipt_id uuid default null, p_observed_value numeric default null,
  p_severity public.alert_severity default null
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_policy public.m22_rule_policies%rowtype; v_receipt public.telemetry_receipts%rowtype;
  v_alert public.alerts%rowtype; v_alert_id uuid; v_episode integer; v_outcome text;
  v_severity public.alert_severity;
  v_key text := public.m22_safe_digest(p_rule_id || '|' || p_source || '|' || p_dedupe_context);
begin
  v_policy := public.m22_policy_at(p_rule_id,p_detected_at);
  if v_policy.rule_id is null then raise exception 'No effective M22 policy' using errcode='P0002'; end if;
  v_severity := coalesce(p_severity,v_policy.default_severity);
  perform pg_advisory_xact_lock(hashtextextended(v_key,22));
  select * into v_alert from public.alerts where dedupe_key=v_key
    and status::text not in ('resolved','false_alarm','ignored') for update;
  if p_receipt_id is not null then select * into v_receipt from public.telemetry_receipts where id=p_receipt_id; end if;
  if v_alert.id is null then
    select coalesce(max(episode_number),0)+1 into v_episode from public.alerts where dedupe_key=v_key;
    insert into public.alerts (
      ad_work_day_id,type,severity,status,message,created_at,rule_id,rule_version,
      source,dedupe_key,episode_number,condition_active,first_detected_at,last_detected_at,
      occurrence_count,gps_device_id,vehicle_id,ad_work_id,assignment_id,tracking_session_id,
      first_telemetry_receipt_id,last_telemetry_receipt_id,gps_device_vehicle_link_id,
      assignment_history_id,execution_history_id,synthetic,title,observed_value,
      threshold_value,value_unit,status_changed_at,updated_at,origin
    ) values (
      v_receipt.ad_work_day_id,p_rule_id::public.alert_type,v_severity,'new',
      public.m22_rule_title(p_rule_id)||'. Review technical evidence in the admin workspace.',
      p_detected_at,p_rule_id,v_policy.rule_version,p_source,v_key,v_episode,true,
      p_detected_at,p_detected_at,1,coalesce(p_gps_device_id,v_receipt.gps_device_id),
      v_receipt.vehicle_id,v_receipt.ad_work_id,v_receipt.assignment_id,
      v_receipt.tracking_session_id,p_receipt_id,p_receipt_id,
      v_receipt.gps_device_vehicle_link_id,v_receipt.assignment_history_id,
      v_receipt.execution_history_id,coalesce(v_receipt.synthetic,false),
      public.m22_rule_title(p_rule_id),p_observed_value,v_policy.opening_threshold,
      v_policy.value_unit,p_detected_at,p_detected_at,'m22_rule_engine'
    ) returning id into v_alert_id;
    insert into public.alert_status_history(
      alert_id,previous_status,new_status,actor_type,reason,note,transition_at,safe_source
    ) values (v_alert_id,null,'new','service','condition_opened',
      'Deterministic rule condition opened.',p_detected_at,'rule_engine');
    v_outcome := 'opened';
  else
    update public.alerts set condition_active=true,condition_cleared_at=null,
      last_detected_at=greatest(last_detected_at,p_detected_at),
      occurrence_count=least(occurrence_count+1,1000000000),
      severity=case when v_severity='critical' then v_severity else severity end,
      last_telemetry_receipt_id=coalesce(p_receipt_id,last_telemetry_receipt_id),
      observed_value=coalesce(p_observed_value,observed_value),updated_at=clock_timestamp()
    where id=v_alert.id returning id into v_alert_id;
    v_outcome := 'updated';
  end if;
  insert into public.m22_rule_state(
    dedupe_key,rule_id,rule_version,alert_id,condition_active,first_observed_at,
    last_observed_at,occurrence_count,last_signal_id
  ) values (v_key,p_rule_id,v_policy.rule_version,v_alert_id,true,p_detected_at,p_detected_at,1,p_signal_id)
  on conflict (dedupe_key) do update set rule_id=excluded.rule_id,
    rule_version=excluded.rule_version,alert_id=excluded.alert_id,condition_active=true,
    condition_cleared_at=null,
    first_observed_at=coalesce(public.m22_rule_state.first_observed_at,excluded.first_observed_at),
    last_observed_at=greatest(public.m22_rule_state.last_observed_at,excluded.last_observed_at),
    occurrence_count=least(public.m22_rule_state.occurrence_count+1,1000000000),
    last_signal_id=excluded.last_signal_id,updated_at=clock_timestamp();
  insert into public.m22_rule_assessments(
    signal_id,rule_id,rule_version,outcome,reason_code,alert_id,observed_value,
    threshold_value,value_unit,evidence_timing
  ) values (p_signal_id,p_rule_id,v_policy.rule_version,v_outcome,'threshold_met',
    v_alert_id,p_observed_value,v_policy.opening_threshold,v_policy.value_unit,
    case when p_source='physical_device_delayed' then 'delayed'
         when p_source='physical_device_live' then 'live' else 'not_applicable' end)
  on conflict (signal_id,rule_id) do nothing;
  insert into public.audit_logs(actor_type,action,entity_type,entity_id,safe_details)
  values ('system',case when v_outcome='opened' then 'alert_opened' else 'alert_occurrence_updated' end,
    'alert',v_alert_id,jsonb_build_object('rule_id',p_rule_id,'outcome',v_outcome));
  return v_alert_id;
end;
$$;

create or replace function public.m22_clear_rule_condition(
  p_signal_id uuid,p_rule_id text,p_source text,p_dedupe_context text,p_cleared_at timestamptz
) returns uuid language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_key text := public.m22_safe_digest(p_rule_id||'|'||p_source||'|'||p_dedupe_context);
  v_alert_id uuid; v_version text;
begin
  perform pg_advisory_xact_lock(hashtextextended(v_key,22));
  update public.alerts set condition_active=false,condition_cleared_at=p_cleared_at,
    updated_at=clock_timestamp() where dedupe_key=v_key and condition_active
    and status::text not in ('resolved','false_alarm','ignored')
  returning id,rule_version into v_alert_id,v_version;
  if v_alert_id is not null then
    update public.m22_rule_state set condition_active=false,condition_cleared_at=p_cleared_at,
      last_signal_id=p_signal_id,updated_at=clock_timestamp() where dedupe_key=v_key;
    insert into public.m22_rule_assessments(
      signal_id,rule_id,rule_version,outcome,reason_code,alert_id,evidence_timing
    ) values (p_signal_id,p_rule_id,v_version,'cleared','live_recovery',v_alert_id,'live')
    on conflict (signal_id,rule_id) do nothing;
    insert into public.audit_logs(actor_type,action,entity_type,entity_id,safe_details)
    values ('system','alert_condition_cleared','alert',v_alert_id,jsonb_build_object('rule_id',p_rule_id));
  end if;
  return v_alert_id;
end;
$$;

create or replace function public.m22_distance_m(
  p_lat1 numeric,p_lng1 numeric,p_lat2 numeric,p_lng2 numeric
) returns numeric language sql immutable strict set search_path = pg_catalog
as $$
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians((p_lat2-p_lat1)::double precision)/2),2)
    + cos(radians(p_lat1::double precision))*cos(radians(p_lat2::double precision))
    * power(sin(radians((p_lng2-p_lng1)::double precision)/2),2)
  ))::numeric
$$;

create or replace function public.m22_evaluate_signal(p_signal_id uuid,p_now timestamptz)
returns void language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  s public.m22_rule_signals%rowtype; r public.telemetry_receipts%rowtype;
  d public.gps_devices%rowtype; c public.telemetry_identity_conflicts%rowtype;
  p public.m22_rule_policies%rowtype; a public.m22_auth_failure_aggregates%rowtype;
  v_rule text; v_source text; v_context text; v_count integer;
  v_point record; v_prev record; v_speed numeric; v_distance numeric;
begin
  select * into strict s from public.m22_rule_signals where id=p_signal_id;
  if s.signal_kind='authentication_failure' then
    insert into public.m22_auth_failure_aggregates(
      safe_fingerprint,adapter_id,reason_code,first_seen_at,last_seen_at,
      occurrence_count,last_signal_id
    ) values (s.safe_fingerprint,s.adapter_id,s.reason_code,s.occurred_at,s.occurred_at,1,s.id)
    on conflict (safe_fingerprint,adapter_id,reason_code) do update set
      last_seen_at=greatest(public.m22_auth_failure_aggregates.last_seen_at,excluded.last_seen_at),
      occurrence_count=least(public.m22_auth_failure_aggregates.occurrence_count+1,1000000000),
      last_signal_id=excluded.last_signal_id,updated_at=clock_timestamp()
    returning * into a;
    p := public.m22_policy_at('unknown_device_or_credential',s.occurred_at);
    if a.occurrence_count >= p.required_count then
      perform public.m22_apply_rule_observation(s.id,'unknown_device_or_credential',
        s.occurred_at,'authentication_failure',s.safe_fingerprint||'|'||s.adapter_id,
        null,null,a.occurrence_count,null);
    else
      insert into public.m22_rule_assessments(
        signal_id,rule_id,rule_version,outcome,reason_code,observed_value,
        threshold_value,value_unit,evidence_timing
      ) values (s.id,'unknown_device_or_credential',p.rule_version,'no_change',
        'aggregate_below_threshold',a.occurrence_count,p.required_count,'count','not_applicable');
    end if;
    return;
  elsif s.signal_kind='adapter_rejection' then
    perform public.m22_apply_rule_observation(s.id,s.reason_code,s.occurred_at,
      'adapter_rejection',concat_ws('|',coalesce(s.gps_device_id::text,'adapter'),s.adapter_id),
      s.gps_device_id,s.telemetry_receipt_id,1,null);
    return;
  elsif s.signal_kind='identity_conflict' then
    select * into strict c from public.telemetry_identity_conflicts where id=s.identity_conflict_id;
    v_rule := case when c.reason_code='event_identity_conflict'
      then 'identity_conflict' else 'sequence_conflict' end;
    perform public.m22_apply_rule_observation(s.id,v_rule,s.occurred_at,
      'physical_device_delayed',c.gps_device_id::text,c.gps_device_id,
      c.original_receipt_id,c.attempt_count,null);
    return;
  elsif s.signal_kind='health_sweep' then
    perform public.m22_apply_rule_observation(s.id,s.reason_code,s.occurred_at,
      'health_sweep',s.gps_device_id::text,s.gps_device_id,null,null,null);
    return;
  elsif s.signal_kind='recovery' then
    perform public.m22_clear_rule_condition(s.id,'heartbeat_missing','health_sweep',
      s.gps_device_id::text,s.occurred_at);
    perform public.m22_clear_rule_condition(s.id,'device_offline','health_sweep',
      s.gps_device_id::text,s.occurred_at);
    return;
  end if;

  select * into strict r from public.telemetry_receipts where id=s.telemetry_receipt_id;
  select * into strict d from public.gps_devices where id=r.gps_device_id;
  v_source := case when r.disposition='accepted_delayed'
    then 'physical_device_delayed' else 'physical_device_live' end;
  v_context := concat_ws('|',r.gps_device_id::text,coalesce(r.vehicle_id::text,''),
    coalesce(r.ad_work_day_id::text,''),coalesce(r.execution_history_id::text,''));

  v_rule := case r.reason_code
    when 'sequence_gap' then 'sequence_gap'
    when 'out_of_order_accepted' then 'out_of_order'
    when 'delayed_backfill_expired' then 'delayed_backfill_expired'
    when 'captured_after_end_work' then 'captured_after_end_work'
    when 'outside_active_work' then 'off_work_location_attempt'
    when 'vehicle_link_not_effective' then 'vehicle_link_not_effective'
    when 'assignment_not_effective' then 'assignment_not_effective'
    when 'authority_ambiguous' then 'authority_ambiguous'
    else null end;
  if v_rule is not null then
    perform public.m22_apply_rule_observation(s.id,v_rule,r.received_at,v_source,
      v_context,r.gps_device_id,r.id,1,null);
  end if;

  -- Delayed evidence is historical only and never mutates or clears current health.
  if r.disposition='accepted_delayed' then return; end if;
  if r.disposition in ('accepted_live','health_only') then
    if d.battery_status in ('low','critical') then
      perform public.m22_apply_rule_observation(s.id,'battery_low',r.received_at,
        'physical_device_live',r.gps_device_id::text,r.gps_device_id,r.id,
        case d.battery_status when 'critical' then 10 else 20 end,
        case when d.battery_status='critical' then 'critical'::public.alert_severity else null end);
    else
      perform public.m22_clear_rule_condition(s.id,'battery_low','physical_device_live',
        r.gps_device_id::text,r.received_at);
    end if;
    if d.external_power_status='disconnected' then
      perform public.m22_apply_rule_observation(s.id,'external_power_removed',r.received_at,
        'physical_device_live',r.gps_device_id::text,r.gps_device_id,r.id,1,null);
    else
      perform public.m22_clear_rule_condition(s.id,'external_power_removed','physical_device_live',
        r.gps_device_id::text,r.received_at);
    end if;
    if d.gps_readiness='unavailable' then
      perform public.m22_apply_rule_observation(s.id,'gps_fix_missing',r.received_at,
        'physical_device_live',r.gps_device_id::text,r.gps_device_id,r.id,1,null);
    else
      perform public.m22_clear_rule_condition(s.id,'gps_fix_missing','physical_device_live',
        r.gps_device_id::text,r.received_at);
    end if;
    if d.gsm_readiness in ('degraded','unavailable') then
      perform public.m22_apply_rule_observation(s.id,'gsm_signal_weak',r.received_at,
        'physical_device_live',r.gps_device_id::text,r.gps_device_id,r.id,110,null);
    else
      perform public.m22_clear_rule_condition(s.id,'gsm_signal_weak','physical_device_live',
        r.gps_device_id::text,r.received_at);
    end if;
    if r.disposition='accepted_live' then
      perform public.m22_clear_rule_condition(s.id,'heartbeat_missing','health_sweep',
        r.gps_device_id::text,r.received_at);
      perform public.m22_clear_rule_condition(s.id,'location_update_missing','health_sweep',
        r.gps_device_id::text,r.received_at);
      perform public.m22_clear_rule_condition(s.id,'device_offline','health_sweep',
        r.gps_device_id::text,r.received_at);
    elsif r.disposition='health_only' then
      perform public.m22_clear_rule_condition(s.id,'heartbeat_missing','health_sweep',
        r.gps_device_id::text,r.received_at);
      perform public.m22_clear_rule_condition(s.id,'device_offline','health_sweep',
        r.gps_device_id::text,r.received_at);
    end if;
  end if;

  if r.disposition not in ('accepted_live','accepted_delayed') then return; end if;
  select lp.* into v_point from public.location_points lp where lp.telemetry_receipt_id=r.id;
  if v_point.id is null then return; end if;
  select lp.* into v_prev from public.location_points lp
  where lp.device_id=r.gps_device_id and lp.recorded_at<v_point.recorded_at
    and lp.execution_history_id=v_point.execution_history_id
    and lp.telemetry_receipt_id is not null
  order by lp.recorded_at desc limit 1;
  p := public.m22_policy_at('impossible_speed',r.captured_at);
  if v_prev.id is not null and extract(epoch from v_point.recorded_at-v_prev.recorded_at)>0
    and coalesce(v_point.accuracy_meters,0)<=p.maximum_accuracy_meters
    and coalesce(v_prev.accuracy_meters,0)<=p.maximum_accuracy_meters
  then
    v_distance := greatest(0,public.m22_distance_m(v_prev.lat,v_prev.lng,v_point.lat,v_point.lng)
      - coalesce(v_prev.accuracy_meters,0)-coalesce(v_point.accuracy_meters,0));
    v_speed := v_distance/extract(epoch from v_point.recorded_at-v_prev.recorded_at)*3.6;
    if v_speed>p.maximum_speed_kph then
      perform public.m22_apply_rule_observation(s.id,'impossible_speed',r.captured_at,
        v_source,v_context,r.gps_device_id,r.id,v_speed,null);
    end if;
  end if;
end;
$$;

create or replace function public.m22_process_rule_queue(
  p_batch_size integer default 50,
  p_now timestamptz default clock_timestamp()
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare q public.m22_rule_evaluation_queue%rowtype; v_claimed integer:=0;
  v_completed integer:=0; v_failed integer:=0;
begin
  if p_batch_size not between 1 and 200 or p_now is null then
    raise exception 'Invalid bounded queue request' using errcode='22023';
  end if;
  for q in select * from public.m22_rule_evaluation_queue
    where state in ('pending','processing') and next_attempt_at<=p_now
      and attempt_count<8
      and (state='pending' or locked_at<p_now-interval '5 minutes')
    order by next_attempt_at,created_at for update skip locked limit p_batch_size
  loop
    v_claimed:=v_claimed+1;
    update public.m22_rule_evaluation_queue set state='processing',
      attempt_count=attempt_count+1,locked_at=p_now,updated_at=clock_timestamp()
    where id=q.id;
    begin
      perform public.m22_evaluate_signal(q.signal_id,p_now);
      update public.m22_rule_evaluation_queue set state='completed',completed_at=clock_timestamp(),
        locked_at=null,safe_failure_reason_code=null,updated_at=clock_timestamp() where id=q.id;
      v_completed:=v_completed+1;
    exception when others then
      update public.m22_rule_evaluation_queue set
        state=case when attempt_count>=8 then 'failed' else 'pending' end,
        next_attempt_at=p_now+make_interval(secs=>least(300,5*(2^least(attempt_count,6)))::integer),
        locked_at=null,safe_failure_reason_code=case when attempt_count>=8
          then 'attempts_exhausted' else 'evaluation_failed' end,updated_at=clock_timestamp()
      where id=q.id;
      v_failed:=v_failed+1;
    end;
  end loop;
  return jsonb_build_object('claimed',v_claimed,'completed',v_completed,'retry_or_failed',v_failed);
end;
$$;

create or replace function public.m22_run_health_sweep(
  p_batch_size integer default 100,
  p_now timestamptz default clock_timestamp()
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare d public.gps_devices%rowtype; v_rule text; v_count integer:=0;
  v_age numeric; v_policy public.m22_rule_policies%rowtype; v_key text;
begin
  if p_batch_size not between 1 and 500 or p_now is null then
    raise exception 'Invalid bounded health sweep' using errcode='22023';
  end if;
  for d in select * from public.gps_devices
    where status='active' and installation_state='installed'
    order by id limit p_batch_size
  loop
    v_age:=extract(epoch from (p_now-coalesce(d.last_heartbeat_at,d.created_at)));
    v_policy:=public.m22_policy_at('device_offline',p_now);
    v_rule:=case when v_age>=v_policy.opening_threshold then 'device_offline'
      when v_age>=(public.m22_policy_at('heartbeat_missing',p_now)).opening_threshold
      then 'heartbeat_missing' else null end;
    if v_rule is not null then
      v_key:=public.m22_safe_digest(concat_ws('|','sweep',v_rule,d.id::text,
        floor(extract(epoch from p_now)/60)::text));
      insert into public.m22_rule_signals(
        signal_key,signal_kind,reason_code,occurred_at,gps_device_id
      ) values(v_key,'health_sweep',v_rule,p_now,d.id) on conflict(signal_key) do nothing;
      v_count:=v_count+1;
    end if;
    if exists(select 1 from public.tracking_sessions t
      join public.ad_work_days wd on wd.id=t.ad_work_day_id
      where t.gps_device_id=d.id and t.tracking_mode='physical_device'
        and t.status='running' and wd.status='running')
      and extract(epoch from(p_now-coalesce(d.last_telemetry_at,d.created_at))) >=
        (public.m22_policy_at('location_update_missing',p_now)).opening_threshold
    then
      v_key:=public.m22_safe_digest(concat_ws('|','sweep','location_update_missing',
        d.id::text,floor(extract(epoch from p_now)/60)::text));
      insert into public.m22_rule_signals(
        signal_key,signal_kind,reason_code,occurred_at,gps_device_id
      ) values(v_key,'health_sweep','location_update_missing',p_now,d.id)
      on conflict(signal_key) do nothing;
      v_count:=v_count+1;
    end if;
    if d.last_heartbeat_at>=p_now-interval '30 seconds' then
      v_key:=public.m22_safe_digest('recovery|'||d.id::text||'|'||d.last_heartbeat_at::text);
      insert into public.m22_rule_signals(
        signal_key,signal_kind,reason_code,occurred_at,gps_device_id
      ) values(v_key,'recovery','reconnect_or_live_recovery',p_now,d.id)
      on conflict(signal_key) do nothing;
    end if;
  end loop;
  return jsonb_build_object('devices_considered',least(p_batch_size,v_count),'signals_enqueued',v_count);
end;
$$;


create or replace function public.m22_protect_immutable()
returns trigger language plpgsql set search_path = pg_catalog
as $$ begin raise exception 'M22 evidence is immutable' using errcode='55000'; end; $$;

create trigger alert_status_history_immutable before update or delete on public.alert_status_history
for each row execute function public.m22_protect_immutable();
create trigger alert_notes_immutable before update or delete on public.alert_notes
for each row execute function public.m22_protect_immutable();
create trigger m22_rule_signals_immutable before update or delete on public.m22_rule_signals
for each row execute function public.m22_protect_immutable();
create trigger m22_rule_assessments_immutable before update or delete on public.m22_rule_assessments
for each row execute function public.m22_protect_immutable();
create trigger m22_rule_policies_immutable before update or delete on public.m22_rule_policies
for each row execute function public.m22_protect_immutable();

create or replace function public.m22_protect_alert_lifecycle()
returns trigger language plpgsql set search_path = pg_catalog
as $$
begin
  if new.status is distinct from old.status
    and current_setting('app.m22_admin_lifecycle',true) is distinct from 'on'
  then raise exception 'Alert lifecycle requires the admin RPC' using errcode='42501'; end if;
  return new;
end;
$$;
create trigger alerts_m22_lifecycle_guard before update on public.alerts
for each row execute function public.m22_protect_alert_lifecycle();

create or replace function public.admin_transition_alert(
  p_alert_id uuid,p_new_status text,p_reason text,p_note text
) returns table(alert_id uuid,status text,result_message text)
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_actor uuid:=public.m20a_require_admin(); v_alert public.alerts%rowtype;
  v_new public.alert_status;
begin
  if p_reason is null or char_length(trim(p_reason)) not between 1 and 160
    or p_note is null or char_length(trim(p_note)) not between 1 and 500
  then raise exception 'Bounded reason and note are required' using errcode='22023'; end if;
  if p_new_status not in ('acknowledged','investigating','resolved','false_alarm','ignored')
  then raise exception 'Invalid alert status' using errcode='22023'; end if;
  v_new:=p_new_status::public.alert_status;
  select * into v_alert from public.alerts where id=p_alert_id for update;
  if not found then raise exception 'Alert not found' using errcode='P0002'; end if;
  if v_alert.status::text in ('resolved','false_alarm','ignored') then
    raise exception 'Terminal alerts cannot be reopened in place' using errcode='55000';
  end if;
  if not (
    (v_alert.status::text='new' and p_new_status in
      ('acknowledged','investigating','resolved','false_alarm','ignored'))
    or (v_alert.status::text='acknowledged' and p_new_status in
      ('investigating','resolved','false_alarm','ignored'))
    or (v_alert.status::text='investigating' and p_new_status in
      ('resolved','false_alarm','ignored'))
  ) then raise exception 'Blocked alert transition' using errcode='55000'; end if;
  perform set_config('app.m22_admin_lifecycle','on',true);
  update public.alerts set status=v_new,status_changed_at=clock_timestamp(),
    status_changed_by=v_actor,updated_at=clock_timestamp(),
    resolved_at=case when p_new_status='resolved' then clock_timestamp() else resolved_at end,
    resolved_by=case when p_new_status='resolved' then v_actor else resolved_by end,
    resolution_note=case when p_new_status='resolved' then trim(p_note) else resolution_note end
  where id=p_alert_id;
  insert into public.alert_status_history(
    alert_id,previous_status,new_status,actor_type,actor_admin_id,reason,note,
    transition_at,safe_source
  ) values(p_alert_id,v_alert.status,v_new,'admin',v_actor,trim(p_reason),trim(p_note),
    clock_timestamp(),'admin_rpc');
  insert into public.audit_logs(actor_type,actor_id,action,entity_type,entity_id,safe_details)
  values('admin',v_actor,case p_new_status when 'acknowledged' then 'alert_status_acknowledged'
    when 'investigating' then 'alert_investigation_started'
    when 'resolved' then 'alert_resolved'
    when 'false_alarm' then 'alert_marked_false_alarm' else 'alert_ignored' end,
    'alert',p_alert_id,jsonb_build_object('previous_status',v_alert.status::text,
      'new_status',p_new_status,'reason',trim(p_reason)));
  return query select p_alert_id,p_new_status,'Alert status updated.'::text;
end;
$$;

create or replace function public.admin_add_alert_note(
  p_alert_id uuid,p_reason text,p_note text
) returns table(note_id uuid,result_message text)
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_actor uuid:=public.m20a_require_admin(); v_note_id uuid;
begin
  if p_reason is null or char_length(trim(p_reason)) not between 1 and 160
    or p_note is null or char_length(trim(p_note)) not between 1 and 500
  then raise exception 'Bounded reason and note are required' using errcode='22023'; end if;
  perform 1 from public.alerts where id=p_alert_id;
  if not found then raise exception 'Alert not found' using errcode='P0002'; end if;
  insert into public.alert_notes(alert_id,actor_admin_id,reason,note)
  values(p_alert_id,v_actor,trim(p_reason),trim(p_note)) returning id into v_note_id;
  insert into public.audit_logs(actor_type,actor_id,action,entity_type,entity_id,safe_details)
  values('admin',v_actor,'alert_note_added','alert',p_alert_id,
    jsonb_build_object('reason',trim(p_reason)));
  return query select v_note_id,'Alert note added.'::text;
end;
$$;

create or replace function public.admin_list_m22_alerts(
  p_status text default null,p_severity text default null,p_rule_id text default null,
  p_source text default null,p_gps_device_id uuid default null,p_vehicle_id uuid default null,
  p_ad_work_id uuid default null,p_synthetic boolean default null,
  p_condition_active boolean default null,p_limit integer default 100
) returns setof public.alerts
language plpgsql security definer stable set search_path = pg_catalog, public
as $$
begin
  perform public.m20a_require_admin();
  if p_limit not between 1 and 200 then raise exception 'Invalid bounded limit' using errcode='22023'; end if;
  if p_status is not null and p_status not in
    ('new','acknowledged','investigating','resolved','false_alarm','ignored')
  then raise exception 'Invalid status filter' using errcode='22023'; end if;
  if p_severity is not null and p_severity not in ('info','warning','critical')
  then raise exception 'Invalid severity filter' using errcode='22023'; end if;
  return query select a.* from public.alerts a where a.rule_id is not null
    and (p_status is null or a.status::text=p_status)
    and (p_severity is null or a.severity::text=p_severity)
    and (p_rule_id is null or a.rule_id=p_rule_id)
    and (p_source is null or a.source=p_source)
    and (p_gps_device_id is null or a.gps_device_id=p_gps_device_id)
    and (p_vehicle_id is null or a.vehicle_id=p_vehicle_id)
    and (p_ad_work_id is null or a.ad_work_id=p_ad_work_id)
    and (p_synthetic is null or a.synthetic=p_synthetic)
    and (p_condition_active is null or a.condition_active=p_condition_active)
  order by a.last_detected_at desc,a.id limit p_limit;
end;
$$;

create or replace function public.admin_get_m22_alert_detail(p_alert_id uuid)
returns jsonb language plpgsql security definer stable set search_path = pg_catalog, public
as $$
declare v_result jsonb;
begin
  perform public.m20a_require_admin();
  select jsonb_build_object(
    'alert',to_jsonb(a),
    'status_history',coalesce((select jsonb_agg(to_jsonb(h) order by h.transition_at)
      from public.alert_status_history h where h.alert_id=a.id),'[]'::jsonb),
    'notes',coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at)
      from public.alert_notes n where n.alert_id=a.id),'[]'::jsonb),
    'assessments',coalesce((select jsonb_agg(to_jsonb(x) order by x.assessed_at desc)
      from (select ra.id,ra.rule_id,ra.rule_version,ra.outcome,ra.reason_code,
        ra.observed_value,ra.threshold_value,ra.value_unit,ra.evidence_timing,ra.assessed_at
        from public.m22_rule_assessments ra where ra.alert_id=a.id
        order by ra.assessed_at desc limit 100) x),'[]'::jsonb)
  ) into v_result from public.alerts a where a.id=p_alert_id and a.rule_id is not null;
  if v_result is null then raise exception 'M22 alert not found' using errcode='P0002'; end if;
  return v_result;
end;
$$;

alter table public.alert_status_history enable row level security;
alter table public.alert_notes enable row level security;
alter table public.m22_rule_policies enable row level security;
alter table public.m22_rule_signals enable row level security;
alter table public.m22_rule_evaluation_queue enable row level security;
alter table public.m22_auth_failure_aggregates enable row level security;
alter table public.m22_rule_state enable row level security;
alter table public.m22_rule_assessments enable row level security;

create policy "Admins can read M22 alerts" on public.alerts for select to authenticated
using (public.is_admin());
create policy "Admins can read alert status history" on public.alert_status_history
for select to authenticated using (public.is_admin());
create policy "Admins can read alert notes" on public.alert_notes
for select to authenticated using (public.is_admin());
create policy "Admins can read M22 rule policies" on public.m22_rule_policies
for select to authenticated using (public.is_admin());
create policy "Admins can read M22 assessments" on public.m22_rule_assessments
for select to authenticated using (public.is_admin());

revoke all on public.alerts from public,anon,authenticated;
revoke all on public.alert_status_history from public,anon,authenticated;
revoke all on public.alert_notes from public,anon,authenticated;
revoke all on public.m22_rule_policies from public,anon,authenticated;
revoke all on public.m22_rule_signals from public,anon,authenticated;
revoke all on public.m22_rule_evaluation_queue from public,anon,authenticated;
revoke all on public.m22_auth_failure_aggregates from public,anon,authenticated;
revoke all on public.m22_rule_state from public,anon,authenticated;
revoke all on public.m22_rule_assessments from public,anon,authenticated;
grant select on public.alerts,public.alert_status_history,public.alert_notes,
  public.m22_rule_policies,public.m22_rule_assessments to authenticated;

revoke all on function public.m22_record_sanitized_signal(text,text,text,timestamptz,uuid,uuid,text)
  from public,anon,authenticated;
revoke all on function public.m22_process_rule_queue(integer,timestamptz)
  from public,anon,authenticated;
revoke all on function public.m22_run_health_sweep(integer,timestamptz)
  from public,anon,authenticated;
grant execute on function public.m22_record_sanitized_signal(text,text,text,timestamptz,uuid,uuid,text)
  to service_role;
grant execute on function public.m22_process_rule_queue(integer,timestamptz) to service_role;
grant execute on function public.m22_run_health_sweep(integer,timestamptz) to service_role;

revoke all on function public.admin_transition_alert(uuid,text,text,text)
  from public,anon,authenticated;
revoke all on function public.admin_add_alert_note(uuid,text,text)
  from public,anon,authenticated;
revoke all on function public.admin_list_m22_alerts(text,text,text,text,uuid,uuid,uuid,boolean,boolean,integer)
  from public,anon,authenticated;
revoke all on function public.admin_get_m22_alert_detail(uuid)
  from public,anon,authenticated;
grant execute on function public.admin_transition_alert(uuid,text,text,text) to authenticated;
grant execute on function public.admin_add_alert_note(uuid,text,text) to authenticated;
grant execute on function public.admin_list_m22_alerts(text,text,text,text,uuid,uuid,uuid,boolean,boolean,integer)
  to authenticated;
grant execute on function public.admin_get_m22_alert_detail(uuid) to authenticated;

comment on table public.m22_rule_policies is
  'Effective-dated typed M22 provisional pilot policies; not AP production-policy approval.';
comment on table public.m22_rule_signals is
  'Sanitized durable M22 signals. No payload, coordinates, secrets, customer data, Work Codes or raw identifiers.';
comment on table public.m22_auth_failure_aggregates is
  'Service-only keyed-fingerprint aggregates. Fingerprints are not credential-verification hashes.';


create or replace function public.m22_evaluate_long_stop(p_signal_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  s public.m22_rule_signals%rowtype; r public.telemetry_receipts%rowtype;
  p public.m22_rule_policies%rowtype; first_point record; current_point record;
  v_count integer; v_max_distance numeric; v_context text;
begin
  select * into strict s from public.m22_rule_signals where id=p_signal_id;
  if s.signal_kind<>'telemetry_receipt' then return; end if;
  select * into strict r from public.telemetry_receipts where id=s.telemetry_receipt_id;
  if r.disposition<>'accepted_live' or r.tracking_session_id is null then return; end if;
  p:=public.m22_policy_at('long_stop',r.captured_at);
  select lp.* into current_point from public.location_points lp
    where lp.telemetry_receipt_id=r.id;
  if current_point.id is null then return; end if;
  v_context:=concat_ws('|',r.gps_device_id::text,r.vehicle_id::text,
    r.ad_work_day_id::text,r.execution_history_id::text);
  if not exists(select 1 from public.tracking_sessions t
    where t.id=r.tracking_session_id and t.status='running')
  then
    perform public.m22_clear_rule_condition(s.id,'long_stop','physical_device_live',
      v_context,r.received_at);
    return;
  end if;
  select lp.* into first_point from public.location_points lp
    where lp.device_id=r.gps_device_id
      and lp.execution_history_id=r.execution_history_id
      and lp.tracking_session_id=r.tracking_session_id
      and lp.recorded_at between current_point.recorded_at
        - make_interval(secs=>p.duration_seconds) and current_point.recorded_at
      and lp.freshness='live'
      and coalesce(lp.accuracy_meters,0)<=p.maximum_accuracy_meters
    order by lp.recorded_at limit 1;
  if first_point.id is null then return; end if;
  select count(*)::integer,
    coalesce(max(public.m22_distance_m(first_point.lat,first_point.lng,lp.lat,lp.lng)
      + coalesce(lp.accuracy_meters,0)),0)
  into v_count,v_max_distance
  from public.location_points lp
  where lp.device_id=r.gps_device_id
    and lp.execution_history_id=r.execution_history_id
    and lp.tracking_session_id=r.tracking_session_id
    and lp.recorded_at between first_point.recorded_at and current_point.recorded_at
    and lp.freshness='live'
    and coalesce(lp.accuracy_meters,0)<=p.maximum_accuracy_meters;
  if v_count>=p.required_count
    and extract(epoch from(current_point.recorded_at-first_point.recorded_at))>=p.duration_seconds
    and v_max_distance<=p.movement_radius_meters
  then
    perform public.m22_apply_rule_observation(s.id,'long_stop',r.captured_at,
      'physical_device_live',v_context,r.gps_device_id,r.id,
      extract(epoch from(current_point.recorded_at-first_point.recorded_at)),null);
  elsif v_max_distance>p.movement_radius_meters then
    perform public.m22_clear_rule_condition(s.id,'long_stop','physical_device_live',
      v_context,r.received_at);
  end if;
end;
$$;

create or replace function public.m22_process_rule_queue(
  p_batch_size integer default 50,
  p_now timestamptz default clock_timestamp()
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare q public.m22_rule_evaluation_queue%rowtype; v_claimed integer:=0;
  v_completed integer:=0; v_failed integer:=0;
begin
  if p_batch_size not between 1 and 200 or p_now is null then
    raise exception 'Invalid bounded queue request' using errcode='22023';
  end if;
  for q in select * from public.m22_rule_evaluation_queue
    where state in ('pending','processing') and next_attempt_at<=p_now
      and attempt_count<8
      and (state='pending' or locked_at<p_now-interval '5 minutes')
    order by next_attempt_at,created_at for update skip locked limit p_batch_size
  loop
    v_claimed:=v_claimed+1;
    update public.m22_rule_evaluation_queue set state='processing',
      attempt_count=attempt_count+1,locked_at=p_now,updated_at=clock_timestamp()
    where id=q.id;
    begin
      perform public.m22_evaluate_signal(q.signal_id,p_now);
      perform public.m22_evaluate_long_stop(q.signal_id);
      update public.m22_rule_evaluation_queue set state='completed',completed_at=clock_timestamp(),
        locked_at=null,safe_failure_reason_code=null,updated_at=clock_timestamp() where id=q.id;
      v_completed:=v_completed+1;
    exception when others then
      update public.m22_rule_evaluation_queue set
        state=case when attempt_count>=8 then 'failed' else 'pending' end,
        next_attempt_at=p_now+make_interval(secs=>least(300,5*(2^least(attempt_count,6)))::integer),
        locked_at=null,safe_failure_reason_code=case when attempt_count>=8
          then 'attempts_exhausted' else 'evaluation_failed' end,updated_at=clock_timestamp()
      where id=q.id;
      v_failed:=v_failed+1;
    end;
  end loop;
  return jsonb_build_object('claimed',v_claimed,'completed',v_completed,'retry_or_failed',v_failed);
end;
$$;

revoke all on function public.m22_safe_digest(text) from public,anon,authenticated;
revoke all on function public.m22_policy_at(text,timestamptz) from public,anon,authenticated;
revoke all on function public.m22_enqueue_signal() from public,anon,authenticated;
revoke all on function public.m22_capture_receipt_signal() from public,anon,authenticated;
revoke all on function public.m22_capture_conflict_signal() from public,anon,authenticated;
revoke all on function public.m22_rule_title(text) from public,anon,authenticated;
revoke all on function public.m22_apply_rule_observation(
  uuid,text,timestamptz,text,text,uuid,uuid,numeric,public.alert_severity
) from public,anon,authenticated;
revoke all on function public.m22_clear_rule_condition(uuid,text,text,text,timestamptz)
  from public,anon,authenticated;
revoke all on function public.m22_distance_m(numeric,numeric,numeric,numeric)
  from public,anon,authenticated;
revoke all on function public.m22_evaluate_signal(uuid,timestamptz)
  from public,anon,authenticated;
revoke all on function public.m22_evaluate_long_stop(uuid)
  from public,anon,authenticated;
revoke all on function public.m22_protect_immutable() from public,anon,authenticated;
revoke all on function public.m22_protect_alert_lifecycle() from public,anon,authenticated;

