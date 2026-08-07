-- M25: explainable statistical intelligence and AI/ML readiness foundation.
-- All analysis is deterministic/statistical and admin-reviewed. No production
-- ML, model artifact, LLM coordinate processing, or customer-side effect is added.

alter table public.alerts drop constraint if exists alerts_m22_source_check;
alter table public.alerts add constraint alerts_m22_source_check check (source in (
  'legacy','physical_device_live','physical_device_delayed','health_sweep',
  'adapter_rejection','authentication_failure','recovery','comparison',
  'statistical_signal'
));

create table public.m25_feature_definitions (
  feature_id text primary key,
  feature_version text not null default 'm25-features-v1',
  unit text not null,
  source_kind text not null,
  ordered_observations boolean not null default false,
  minimum_coverage_score numeric not null default 0.5,
  description text not null,
  active boolean not null default true,
  constraint m25_feature_definition_version_check check (feature_version = 'm25-features-v1'),
  constraint m25_feature_definition_unit_check check (unit in ('count','rate','seconds','minutes','meters','count_per_hour')),
  constraint m25_feature_definition_source_check check (source_kind in ('telemetry_receipt','tracking_session','location_point','device_health','m22_rule_evidence','m23_comparison_snapshot','adapter_metadata')),
  constraint m25_feature_definition_bounds_check check (char_length(feature_id) between 1 and 80 and char_length(description) between 1 and 300 and minimum_coverage_score between 0 and 1)
);

insert into public.m25_feature_definitions(feature_id, unit, source_kind, ordered_observations, description)
values
 ('event_count','count','telemetry_receipt',false,'Count of authoritative telemetry receipts in the bounded scope.'),
 ('accepted_live_rate','rate','telemetry_receipt',false,'Accepted-live receipt rate.'),
 ('accepted_delayed_rate','rate','telemetry_receipt',false,'Accepted-delayed receipt rate.'),
 ('health_only_rate','rate','telemetry_receipt',false,'Health-only receipt rate after work/privacy resolution.'),
 ('rejection_rate','rate','telemetry_receipt',false,'Authoritative receipt rejection rate.'),
 ('duplicate_rate','rate','telemetry_receipt',false,'Identical duplicate rate from authoritative outcomes.'),
 ('identity_conflict_rate','rate','telemetry_receipt',false,'Changed-content identity conflict rate.'),
 ('sequence_gap_rate','rate','m22_rule_evidence',false,'Sequence-gap evidence rate.'),
 ('out_of_order_rate','rate','m22_rule_evidence',false,'Out-of-order evidence rate.'),
 ('median_interarrival_seconds','seconds','telemetry_receipt',true,'Median captured-time interarrival.'),
 ('p95_interarrival_seconds','seconds','telemetry_receipt',true,'P95 captured-time interarrival.'),
 ('heartbeat_coverage_rate','rate','device_health',false,'Heartbeat coverage rate.'),
 ('location_coverage_rate','rate','location_point',false,'Location coverage rate.'),
 ('median_accuracy_meters','meters','location_point',false,'Median authoritative location accuracy.'),
 ('p95_accuracy_meters','meters','location_point',false,'P95 authoritative location accuracy.'),
 ('battery_drop_per_hour','count_per_hour','device_health',true,'Battery percentage drop per elapsed hour.'),
 ('external_power_loss_minutes','minutes','device_health',true,'External-power loss duration.'),
 ('gps_fix_rate','rate','device_health',false,'GPS fix coverage rate.'),
 ('gsm_healthy_rate','rate','device_health',false,'GSM healthy coverage rate.'),
 ('long_stop_minutes','minutes','m22_rule_evidence',true,'Authoritative long-stop duration.'),
 ('impossible_speed_count','count','m22_rule_evidence',false,'Authoritative impossible-speed evidence count.'),
 ('comparison_pair_rate','rate','m23_comparison_snapshot',false,'M23 comparison pair coverage.'),
 ('mismatch_candidate_rate','rate','m23_comparison_snapshot',false,'M23 mismatch-candidate rate.'),
 ('sustained_mismatch_count','count','m23_comparison_snapshot',false,'M23 sustained mismatch count.'),
 ('phone_missing_minutes','minutes','m23_comparison_snapshot',true,'M23 phone-missing duration.'),
 ('physical_device_missing_minutes','minutes','m23_comparison_snapshot',true,'M23 physical-device-missing duration.'),
 ('insufficient_quality_rate','rate','m23_comparison_snapshot',false,'M22/M23 insufficient-quality rate.');

create table public.m25_feature_extraction_jobs (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  scope_key_hash text not null,
  gps_device_id uuid references public.gps_devices(id) on delete restrict,
  ad_work_day_id uuid references public.ad_work_days(id) on delete restrict,
  period_start timestamptz not null,
  period_end timestamptz not null,
  adapter_version text,
  device_model text,
  synthetic boolean not null default false,
  generation integer not null default 1,
  claimed_generation integer,
  state text not null default 'pending',
  dirty_after_claim boolean not null default false,
  attempt_count integer not null default 0,
  locked_at timestamptz,
  next_attempt_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  safe_failure_reason_code text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint m25_job_scope_check check (scope in ('device_work_day','device_day','device_model_day','adapter_version_day','fleet_day')),
  constraint m25_job_hash_check check (scope_key_hash ~ '^[0-9a-f]{64}$'),
  constraint m25_job_period_check check (period_end > period_start),
  constraint m25_job_state_check check (state in ('pending','processing','completed','failed')),
  constraint m25_job_attempt_check check (attempt_count between 0 and 8),
  constraint m25_job_text_check check ((adapter_version is null or char_length(adapter_version) between 1 and 32) and (device_model is null or char_length(device_model) between 1 and 160))
);

create unique index m25_feature_job_identity_unique on public.m25_feature_extraction_jobs(scope, scope_key_hash, period_start, period_end, synthetic);
create index m25_feature_job_claim_idx on public.m25_feature_extraction_jobs(next_attempt_at, created_at) where state in ('pending','processing');

create table public.m25_feature_snapshots (
  id uuid primary key default gen_random_uuid(),
  feature_version text not null default 'm25-features-v1',
  scope text not null,
  scope_key_hash text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  device_model text,
  adapter_version text,
  source_completeness numeric not null,
  synthetic boolean not null default false,
  generation integer not null,
  supersedes_snapshot_id uuid references public.m25_feature_snapshots(id) on delete restrict,
  build_complete boolean not null default false,
  generated_at timestamptz not null default clock_timestamp(),
  constraint m25_snapshot_version_check check (feature_version = 'm25-features-v1'),
  constraint m25_snapshot_scope_check check (scope in ('device_work_day','device_day','device_model_day','adapter_version_day','fleet_day')),
  constraint m25_snapshot_hash_check check (scope_key_hash ~ '^[0-9a-f]{64}$'),
  constraint m25_snapshot_period_check check (period_end > period_start),
  constraint m25_snapshot_completeness_check check (source_completeness between 0 and 1),
  constraint m25_snapshot_generation_check check (generation between 1 and 1000000000)
);

create unique index m25_snapshot_input_unique on public.m25_feature_snapshots(scope, scope_key_hash, period_start, period_end, feature_version, generation, synthetic);
create index m25_snapshot_scope_list_idx on public.m25_feature_snapshots(scope, period_end desc, generated_at desc);

create table public.m25_feature_values (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.m25_feature_snapshots(id) on delete restrict,
  feature_id text not null references public.m25_feature_definitions(feature_id) on delete restrict,
  numeric_value numeric not null,
  sample_count integer not null default 0,
  coverage_score numeric not null default 0,
  source_kind text not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(snapshot_id, feature_id),
  constraint m25_feature_value_number_check check (numeric_value = numeric_value and sample_count between 0 and 1000000000 and coverage_score between 0 and 1),
  constraint m25_feature_value_source_check check (source_kind in ('telemetry_receipt','tracking_session','location_point','device_health','m22_rule_evidence','m23_comparison_snapshot','adapter_metadata'))
);

create or replace function public.m25_protect_immutable()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if current_setting('app.m25_snapshot_build', true) = 'on' and tg_table_name = 'm25_feature_snapshots' and old.build_complete is false then return new; end if;
  if current_setting('app.m25_compaction', true) = 'on' and tg_table_name = 'm25_feature_values' then return old; end if;
  raise exception 'M25 evidence is immutable' using errcode = '55000';
end;
$$;

create trigger m25_snapshot_immutable before update or delete on public.m25_feature_snapshots for each row execute function public.m25_protect_immutable();
create trigger m25_feature_value_immutable before update or delete on public.m25_feature_values for each row execute function public.m25_protect_immutable();

create table public.m25_baseline_versions (
  id uuid primary key default gen_random_uuid(),
  baseline_version text not null,
  feature_version text not null default 'm25-features-v1',
  metric text not null references public.m25_feature_definitions(feature_id) on delete restrict,
  cohort_key text not null,
  device_model text,
  adapter_version text,
  work_category text,
  source_kind text not null,
  synthetic boolean not null default false,
  fallback_used text not null default 'exact_supported_cohort',
  sample_count integer not null,
  coverage_count integer not null,
  median numeric,
  median_absolute_deviation numeric,
  p10 numeric,
  p25 numeric,
  p75 numeric,
  p90 numeric,
  minimum numeric,
  maximum numeric,
  baseline_period_start timestamptz,
  baseline_period_end timestamptz,
  effective_from timestamptz not null default clock_timestamp(),
  effective_until timestamptz,
  active boolean not null default false,
  provisional boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  constraint m25_baseline_version_check check (feature_version = 'm25-features-v1' and char_length(baseline_version) between 1 and 64 and char_length(cohort_key) between 1 and 256),
  constraint m25_baseline_fallback_check check (fallback_used in ('exact_supported_cohort','broader_model_adapter_cohort','fleet_cohort','insufficient_data')),
  constraint m25_baseline_counts_check check (sample_count >= 0 and coverage_count >= 0 and coverage_count <= sample_count),
  constraint m25_baseline_period_check check (effective_until is null or effective_until > effective_from)
);

create unique index m25_baseline_active_unique on public.m25_baseline_versions(metric, cohort_key, effective_from) where active;
create index m25_baseline_lookup_idx on public.m25_baseline_versions(metric, cohort_key, active, effective_from desc);

create table public.m25_statistical_signal_definitions (
  signal_id text primary key,
  metric text not null references public.m25_feature_definitions(feature_id) on delete restrict,
  direction text not null,
  minimum_baseline_support integer not null default 8,
  minimum_current_support integer not null default 3,
  opening_threshold numeric not null default 3,
  clearing_threshold numeric not null default 2,
  consecutive_windows integer not null default 2,
  explanation_code text not null,
  rule_fallback text not null,
  provisional boolean not null default true,
  constraint m25_signal_definition_direction_check check (direction in ('high_bad','low_bad','two_sided')),
  constraint m25_signal_definition_bounds_check check (minimum_baseline_support between 1 and 1000000 and minimum_current_support between 1 and 1000000 and opening_threshold >= 0 and clearing_threshold >= 0 and clearing_threshold <= opening_threshold and consecutive_windows between 1 and 20 and char_length(explanation_code) between 1 and 100 and char_length(rule_fallback) between 1 and 300)
);

insert into public.m25_statistical_signal_definitions(signal_id, metric, direction, explanation_code, rule_fallback)
values
 ('telemetry_gap_shift','median_interarrival_seconds','high_bad','telemetry_gap_shift','Use M22 heartbeat/location rules as the operational fallback.'),
 ('delayed_backfill_rate_shift','accepted_delayed_rate','high_bad','delayed_backfill_rate_shift','Use M21 delayed-backfill and M22 historical evidence.'),
 ('rejection_rate_shift','rejection_rate','high_bad','rejection_rate_shift','Use M22 adapter-rejection evidence.'),
 ('duplicate_rate_shift','duplicate_rate','high_bad','duplicate_rate_shift','Use M21 duplicate and identity controls.'),
 ('sequence_disorder_shift','out_of_order_rate','high_bad','sequence_disorder_shift','Use M22 sequence and order rules.'),
 ('accuracy_degradation_shift','median_accuracy_meters','high_bad','accuracy_degradation_shift','Use M23 insufficient-quality outcomes.'),
 ('battery_drain_shift','battery_drop_per_hour','high_bad','battery_drain_shift','Use M22 battery health rule.'),
 ('gps_quality_shift','gps_fix_rate','low_bad','gps_quality_shift','Use M22 GPS-fix rule.'),
 ('gsm_quality_shift','gsm_healthy_rate','low_bad','gsm_quality_shift','Use M22 GSM rule.'),
 ('heartbeat_coverage_shift','heartbeat_coverage_rate','low_bad','heartbeat_coverage_shift','Use M22 heartbeat-missing rule.'),
 ('location_coverage_shift','location_coverage_rate','low_bad','location_coverage_shift','Use M22 location-update rule.'),
 ('long_stop_duration_shift','long_stop_minutes','high_bad','long_stop_duration_shift','Use M22 long-stop rule.'),
 ('impossible_speed_frequency_shift','impossible_speed_count','high_bad','impossible_speed_frequency_shift','Use M22 impossible-speed rule.'),
 ('comparison_quality_shift','comparison_pair_rate','low_bad','comparison_quality_shift','Use M23 comparison-unavailable and quality outcomes.'),
 ('mismatch_candidate_rate_shift','mismatch_candidate_rate','high_bad','mismatch_candidate_rate_shift','Use M23 reviewed comparison evidence.'),
 ('missing_source_duration_shift','physical_device_missing_minutes','high_bad','missing_source_duration_shift','Use M22 source-health review.'),
 ('adapter_version_behavior_shift','rejection_rate','high_bad','adapter_version_behavior_shift','Use adapter-versioned M22 rejection evidence.'),
 ('device_model_cohort_outlier','insufficient_quality_rate','high_bad','device_model_cohort_outlier','Use M22/M23 quality outcomes by cohort.');

create table public.m25_statistical_signals (
  id uuid primary key default gen_random_uuid(),
  signal_id text not null references public.m25_statistical_signal_definitions(signal_id) on delete restrict,
  signal_episode_id text not null,
  metric text not null references public.m25_feature_definitions(feature_id) on delete restrict,
  scope text not null,
  scope_key_hash text not null,
  direction text not null,
  state text not null,
  observed_value numeric,
  baseline_median numeric,
  baseline_mad numeric,
  fallback_statistic text not null default 'none',
  robust_score numeric,
  ewma_value numeric,
  sample_count integer not null default 0,
  support_level text not null,
  coverage_score numeric not null default 0,
  baseline_version text,
  feature_version text not null default 'm25-features-v1',
  analysis_version text not null default 'm25-statistical-v1',
  explanation_code text not null,
  rule_fallback text not null,
  synthetic boolean not null default false,
  promoted_alert_id uuid references public.alerts(id) on delete restrict,
  generated_at timestamptz not null default clock_timestamp(),
  constraint m25_signal_episode_unique unique(signal_id, scope_key_hash, synthetic),
  constraint m25_signal_scope_check check (scope in ('device_work_day','device_day','device_model_day','adapter_version_day','fleet_day') and scope_key_hash ~ '^[0-9a-f]{64}$'),
  constraint m25_signal_direction_check check (direction in ('high_bad','low_bad','two_sided')),
  constraint m25_signal_state_check check (state in ('insufficient_data','normal','watch','investigate','suppressed','reviewed')),
  constraint m25_signal_fallback_check check (fallback_statistic in ('mad','iqr','none')),
  constraint m25_signal_support_check check (support_level in ('none','low','moderate','strong','synthetic_only') and sample_count >= 0 and coverage_score between 0 and 1),
  constraint m25_signal_version_check check (feature_version = 'm25-features-v1' and analysis_version = 'm25-statistical-v1'),
  constraint m25_signal_text_check check (char_length(signal_episode_id) between 1 and 256 and char_length(explanation_code) between 1 and 100 and char_length(rule_fallback) between 1 and 300)
);

create index m25_signal_admin_list_idx on public.m25_statistical_signals(state, generated_at desc);

create table public.m25_signal_review_history (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid not null references public.m25_statistical_signals(id) on delete restrict,
  previous_state text not null,
  new_state text not null,
  review_label text not null,
  reviewer_admin_id uuid not null,
  reason text not null,
  note text not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint m25_review_state_check check (previous_state in ('insufficient_data','normal','watch','investigate','suppressed','reviewed') and new_state in ('insufficient_data','normal','watch','investigate','suppressed','reviewed') and review_label in ('confirmed_operational_issue','expected_behavior','false_positive','data_quality_problem','insufficient_evidence','requires_more_observation')),
  constraint m25_review_text_check check (char_length(reason) between 1 and 160 and char_length(note) between 1 and 500)
);

create or replace function public.m25_protect_review_history()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$ begin raise exception 'M25 signal review history is immutable' using errcode = '55000'; end; $$;
create trigger m25_review_history_immutable before update or delete on public.m25_signal_review_history for each row execute function public.m25_protect_review_history();

create table public.m25_readiness_assessments (
  id uuid primary key default gen_random_uuid(),
  readiness_version text not null default 'm25-readiness-v1',
  assessed_at timestamptz not null default clock_timestamp(),
  reviewed_calendar_days integer not null,
  reviewed_device_model_days integer not null,
  reviewed_work_day_sessions integer not null,
  device_count integer not null,
  device_model_diversity integer not null,
  adapter_version_diversity integer not null,
  feature_completeness numeric not null,
  missingness numeric not null,
  reviewed_label_count integer not null,
  positive_label_count integer not null,
  negative_label_count integer not null,
  label_prevalence numeric,
  false_positive_rate numeric,
  drift_evidence text not null,
  cohort_support text not null,
  train_holdout_feasibility text not null,
  synthetic_evidence boolean not null,
  real_reviewed_evidence boolean not null,
  security_status text not null default 'not_reviewed',
  pilot_status text not null default 'not_started',
  decision text not null,
  provisional_calendar_days integer not null default 28,
  provisional_calendar_days_max integer not null default 56,
  provisional_device_model_days integer not null default 30,
  provisional_work_day_sessions integer not null default 1000,
  created_at timestamptz not null default clock_timestamp(),
  constraint m25_readiness_version_check check (readiness_version = 'm25-readiness-v1'),
  constraint m25_readiness_counts_check check (reviewed_calendar_days >= 0 and reviewed_device_model_days >= 0 and reviewed_work_day_sessions >= 0 and device_count >= 0 and device_model_diversity >= 0 and adapter_version_diversity >= 0 and reviewed_label_count >= 0 and positive_label_count >= 0 and negative_label_count >= 0 and positive_label_count + negative_label_count <= reviewed_label_count and provisional_calendar_days between 28 and provisional_calendar_days_max and provisional_calendar_days_max between 28 and 56 and provisional_device_model_days = 30 and provisional_work_day_sessions = 1000),
  constraint m25_readiness_ratio_check check (feature_completeness between 0 and 1 and missingness between 0 and 1 and (label_prevalence is null or label_prevalence between 0 and 1) and (false_positive_rate is null or false_positive_rate between 0 and 1)),
  constraint m25_readiness_status_check check (drift_evidence in ('none','observed','insufficient_data') and cohort_support in ('none','low','moderate','strong','synthetic_only') and train_holdout_feasibility in ('not_ready','feasible','infeasible') and security_status in ('not_reviewed','reviewed') and pilot_status in ('not_started','approved','completed') and decision in ('insufficient_data','collection_in_progress','ready_for_offline_statistical_evaluation','ready_for_offline_ml_experiment','ready_for_model_review','production_ml_not_authorized'))
);
create index m25_readiness_latest_idx on public.m25_readiness_assessments(assessed_at desc);

create table public.m25_analysis_versions (
  analysis_version text primary key,
  kind text not null,
  status text not null,
  feature_version text not null default 'm25-features-v1',
  training_window_metadata text,
  holdout_design text,
  label_definition text,
  model_version text,
  performance_metrics text,
  drift_policy text,
  explanation_method text not null,
  rule_fallback text not null,
  human_review_policy text not null,
  ap_approved boolean not null default false,
  security_approved boolean not null default false,
  pilot_approved boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  constraint m25_analysis_kind_check check (kind in ('deterministic_rule','robust_statistical_baseline','offline_ml_candidate','reviewed_ml_model')),
  constraint m25_analysis_status_check check (status in ('draft','offline_evaluation','validated_offline','awaiting_approval','approved_disabled','active','retired','rejected')),
  constraint m25_analysis_version_check check (feature_version = 'm25-features-v1' and char_length(analysis_version) between 1 and 64 and char_length(explanation_method) between 1 and 300 and char_length(rule_fallback) between 1 and 300 and char_length(human_review_policy) between 1 and 300),
  constraint m25_no_ml_activation check (kind not in ('offline_ml_candidate','reviewed_ml_model') or status <> 'active')
);

insert into public.m25_analysis_versions(analysis_version, kind, status, explanation_method, rule_fallback, human_review_policy)
values ('m25-statistical-v1','robust_statistical_baseline','active','Median/MAD robust score with bounded IQR fallback.','M21/M22/M23 deterministic evidence remains authoritative.','Admin review required; no automatic operational action.');

create or replace function public.m25_protect_analysis_version()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if (new.kind in ('offline_ml_candidate','reviewed_ml_model') and new.status = 'active') then raise exception 'M25 production ML activation is not authorized' using errcode = '55000'; end if;
  return new;
end;
$$;
create trigger m25_analysis_version_guard before insert or update on public.m25_analysis_versions for each row execute function public.m25_protect_analysis_version();

create or replace function public.m25_enqueue_feature_scope_v1(
  p_scope text, p_scope_key_hash text, p_period_start timestamptz, p_period_end timestamptz,
  p_gps_device_id uuid default null, p_ad_work_day_id uuid default null,
  p_adapter_version text default null, p_device_model text default null, p_synthetic boolean default false
) returns uuid language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_id uuid;
begin
  if p_scope_key_hash !~ '^[0-9a-f]{64}$' or p_period_end <= p_period_start then raise exception 'Invalid bounded M25 feature scope' using errcode = '22023'; end if;
  insert into public.m25_feature_extraction_jobs(scope,scope_key_hash,gps_device_id,ad_work_day_id,period_start,period_end,adapter_version,device_model,synthetic)
  values(p_scope,p_scope_key_hash,p_gps_device_id,p_ad_work_day_id,p_period_start,p_period_end,p_adapter_version,p_device_model,p_synthetic)
  on conflict (scope,scope_key_hash,period_start,period_end,synthetic) do update set
    generation = public.m25_feature_extraction_jobs.generation + 1,
    state = case when public.m25_feature_extraction_jobs.state = 'processing' then 'processing' else 'pending' end,
    dirty_after_claim = case when public.m25_feature_extraction_jobs.state = 'processing' then true else public.m25_feature_extraction_jobs.dirty_after_claim end,
    next_attempt_at = clock_timestamp(), updated_at = clock_timestamp()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.m25_process_statistical_queue(p_batch_size integer default 50, p_now timestamptz default clock_timestamp())
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare j public.m25_feature_extraction_jobs%rowtype; s_id uuid; v_count integer; v_live integer; v_delayed integer; v_health integer; v_rejected integer; v_conflicts integer; v_feature record; v_value numeric; v_sample integer; v_completeness numeric; v_claimed integer:=0; v_built integer:=0; v_retries integer:=0;
begin
  if p_batch_size not between 1 and 200 then raise exception 'Invalid bounded M25 queue request' using errcode = '22023'; end if;
  for j in select * from public.m25_feature_extraction_jobs where state in ('pending','processing') and next_attempt_at <= p_now and attempt_count < 8 and (state='pending' or locked_at < p_now - interval '5 minutes') order by next_attempt_at,created_at for update skip locked limit p_batch_size loop
    v_claimed:=v_claimed+1;
    update public.m25_feature_extraction_jobs set state='processing', attempt_count=attempt_count+1, claimed_generation=generation, locked_at=p_now, updated_at=clock_timestamp() where id=j.id;
    begin
      select count(*)::integer, count(*) filter (where disposition='accepted_live')::integer, count(*) filter (where disposition='accepted_delayed')::integer, count(*) filter (where disposition='health_only')::integer, count(*) filter (where disposition='rejected')::integer into v_count,v_live,v_delayed,v_health,v_rejected from public.telemetry_receipts r where r.captured_at >= j.period_start and r.captured_at < j.period_end and (j.gps_device_id is null or r.gps_device_id=j.gps_device_id) and r.synthetic=j.synthetic;
      select count(*)::integer into v_conflicts from public.telemetry_identity_conflicts c where c.first_seen_at >= j.period_start and c.first_seen_at < j.period_end and (j.gps_device_id is null or c.gps_device_id=j.gps_device_id);
      perform set_config('app.m25_snapshot_build','on',true);
      insert into public.m25_feature_snapshots(feature_version,scope,scope_key_hash,period_start,period_end,device_model,adapter_version,source_completeness,synthetic,generation,build_complete)
      values('m25-features-v1',j.scope,j.scope_key_hash,j.period_start,j.period_end,j.device_model,j.adapter_version,case when v_count=0 then 0 else 1 end,j.synthetic,j.generation,true)
      on conflict (scope,scope_key_hash,period_start,period_end,feature_version,generation,synthetic) do nothing returning id into s_id;
      if s_id is null then select id into s_id from public.m25_feature_snapshots where scope=j.scope and scope_key_hash=j.scope_key_hash and period_start=j.period_start and period_end=j.period_end and generation=j.generation and synthetic=j.synthetic; end if;
      for v_feature in select feature_id,unit,source_kind from public.m25_feature_definitions where active order by feature_id loop
        v_value := case v_feature.feature_id
          when 'event_count' then v_count
          when 'accepted_live_rate' then case when v_count=0 then 0 else v_live::numeric/v_count end
          when 'accepted_delayed_rate' then case when v_count=0 then 0 else v_delayed::numeric/v_count end
          when 'health_only_rate' then case when v_count=0 then 0 else v_health::numeric/v_count end
          when 'rejection_rate' then case when v_count=0 then 0 else v_rejected::numeric/v_count end
          when 'identity_conflict_rate' then case when v_count=0 then 0 else v_conflicts::numeric/v_count end
          else 0 end;
        v_sample := case when v_feature.feature_id='event_count' then v_count else v_count end;
        insert into public.m25_feature_values(snapshot_id,feature_id,numeric_value,sample_count,coverage_score,source_kind) values(s_id,v_feature.feature_id,coalesce(v_value,0),v_sample,case when v_count=0 then 0 else 1 end,v_feature.source_kind) on conflict(snapshot_id,feature_id) do nothing;
      end loop;
      update public.m25_feature_extraction_jobs set state=case when generation=claimed_generation and not dirty_after_claim then 'completed' else 'pending' end, completed_at=case when generation=claimed_generation and not dirty_after_claim then clock_timestamp() else null end, dirty_after_claim=false, locked_at=null, safe_failure_reason_code=null, updated_at=clock_timestamp() where id=j.id;
      v_built:=v_built+1;
    exception when others then
      update public.m25_feature_extraction_jobs set state=case when attempt_count>=8 then 'failed' else 'pending' end, next_attempt_at=p_now+make_interval(secs=>least(300,5*(2^least(attempt_count,6)))::integer), locked_at=null, safe_failure_reason_code=case when attempt_count>=8 then 'attempts_exhausted' else 'evaluation_failed' end, updated_at=clock_timestamp() where id=j.id;
      v_retries:=v_retries+1;
    end;
  end loop;
  return jsonb_build_object('claimed',v_claimed,'feature_snapshots_built',v_built,'baselines_evaluated',0,'signals_evaluated',0,'readiness_assessments',0,'retry_or_failed',v_retries);
end;
$$;

create or replace function public.m25_compact_operational_rows(p_batch_size integer default 100, p_now timestamptz default clock_timestamp())
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_deleted integer:=0;
begin
  if p_batch_size not between 1 and 500 then raise exception 'Invalid bounded M25 compaction batch' using errcode='22023'; end if;
  perform set_config('app.m25_compaction','on',true);
  with eligible as (select id from public.m25_feature_extraction_jobs where state in ('completed','failed') and updated_at < p_now - interval '30 days' order by updated_at limit p_batch_size)
  update public.m25_feature_extraction_jobs set safe_failure_reason_code='compacted', updated_at=p_now where id in (select id from eligible);
  get diagnostics v_deleted=row_count;
  return jsonb_build_object('deleted_rows',v_deleted,'source_evidence_preserved',true,'reviewed_signals_preserved',true);
end;
$$;

create or replace function public.admin_get_m25_intelligence_readiness_v1(p_limit integer default 100)
returns jsonb language plpgsql security definer stable set search_path = pg_catalog, public
as $$
declare v_actor uuid; v_readiness jsonb; v_baselines jsonb; v_signals jsonb; v_governance jsonb;
begin
  v_actor := public.m20a_require_admin();
  if p_limit not between 1 and 200 then raise exception 'Invalid bounded M25 limit' using errcode='22023'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.effective_from desc),'[]'::jsonb) into v_baselines from (select metric,cohort_key,baseline_version,sample_count,coverage_count,median,median_absolute_deviation,effective_from,active,synthetic,fallback_used from public.m25_baseline_versions order by effective_from desc limit p_limit) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.generated_at desc),'[]'::jsonb) into v_signals from (select id,signal_id,metric,scope,state,observed_value,baseline_median,robust_score,support_level,coverage_score,baseline_version,explanation_code,rule_fallback,synthetic,generated_at,promoted_alert_id from public.m25_statistical_signals order by generated_at desc limit p_limit) x;
  select coalesce(to_jsonb(x),'{}'::jsonb) into v_readiness from (select * from public.m25_readiness_assessments order by assessed_at desc limit 1) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by analysis_version),'[]'::jsonb) into v_governance from (select analysis_version,kind,status,feature_version,explanation_method,rule_fallback,human_review_policy,ap_approved,security_approved,pilot_approved from public.m25_analysis_versions) x;
  return jsonb_build_object('contractVersion','m25-admin-v1','readiness',v_readiness,'baselines',v_baselines,'signals',v_signals,'governance',v_governance,'mlStatus','Not activated','technicalValuesAvailable',true);
end;
$$;

create or replace function public.admin_get_m25_signal_technical_values_v1(p_signal_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_actor uuid; v_result jsonb;
begin
  v_actor:=public.m20a_require_admin();
  select jsonb_build_object('contractVersion','m25-admin-v1','signalId',s.id,'observedValue',s.observed_value,'baselineMedian',s.baseline_median,'baselineMad',s.baseline_mad,'fallbackStatistic',s.fallback_statistic,'robustScore',s.robust_score,'ewmaValue',s.ewma_value,'sampleCount',s.sample_count,'coverageScore',s.coverage_score,'generatedAt',s.generated_at) into v_result from public.m25_statistical_signals s where s.id=p_signal_id;
  if v_result is null then raise exception 'M25 signal not found' using errcode='P0002'; end if;
  insert into public.audit_logs(actor_type,actor_id,action,entity_type,entity_id,safe_details) values('admin',v_actor,'m25_signal_technical_values_viewed','m25_statistical_signal',p_signal_id,jsonb_build_object('contract_version','m25-admin-v1'));
  return v_result;
end;
$$;

create or replace function public.admin_transition_m25_signal_review_v1(p_signal_id uuid,p_new_state text,p_review_label text,p_reason text,p_note text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_actor uuid; v_previous text; v_signal public.m25_statistical_signals%rowtype;
begin
  v_actor:=public.m20a_require_admin();
  if p_new_state not in ('suppressed','reviewed','watch','investigate','normal') or p_review_label not in ('confirmed_operational_issue','expected_behavior','false_positive','data_quality_problem','insufficient_evidence','requires_more_observation') or p_reason is null or char_length(trim(p_reason)) not between 1 and 160 or p_note is null or char_length(trim(p_note)) not between 1 and 500 then raise exception 'Invalid bounded M25 review' using errcode='22023'; end if;
  select * into v_signal from public.m25_statistical_signals where id=p_signal_id for update;
  if v_signal.id is null then raise exception 'M25 signal not found' using errcode='P0002'; end if;
  v_previous:=v_signal.state;
  insert into public.m25_signal_review_history(signal_id,previous_state,new_state,review_label,reviewer_admin_id,reason,note) values(p_signal_id,v_previous,p_new_state,p_review_label,v_actor,trim(p_reason),trim(p_note));
  update public.m25_statistical_signals set state=p_new_state where id=p_signal_id;
  insert into public.audit_logs(actor_type,actor_id,action,entity_type,entity_id,safe_details) values('admin',v_actor,'m25_statistical_signal_reviewed','m25_statistical_signal',p_signal_id,jsonb_build_object('previous_state',v_previous,'new_state',p_new_state,'review_label',p_review_label));
  return jsonb_build_object('contractVersion','m25-admin-v1','signalId',p_signal_id,'previousState',v_previous,'newState',p_new_state);
end;
$$;

create or replace function public.admin_promote_m25_signal_to_alert_v1(p_signal_id uuid,p_reason text,p_note text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_actor uuid; s public.m25_statistical_signals%rowtype; v_alert uuid; v_key text;
begin
  v_actor:=public.m20a_require_admin();
  if p_reason is null or char_length(trim(p_reason)) not between 1 and 160 or p_note is null or char_length(trim(p_note)) not between 1 and 500 then raise exception 'A bounded M25 promotion reason and note are required' using errcode='22023'; end if;
  select * into s from public.m25_statistical_signals where id=p_signal_id for update;
  if s.id is null then raise exception 'M25 signal not found' using errcode='P0002'; end if;
  if s.promoted_alert_id is not null then return jsonb_build_object('contractVersion','m25-admin-v1','signalId',p_signal_id,'alertId',s.promoted_alert_id,'created',false); end if;
  if s.state not in ('watch','investigate','reviewed') then raise exception 'Only an admin-reviewed statistical signal may be promoted' using errcode='55000'; end if;
  v_key:=public.m22_safe_digest(concat('m25-statistical-signal|',s.signal_id,'|',s.scope_key_hash,'|',s.synthetic::text));
  insert into public.alerts(ad_work_day_id,type,severity,status,message,created_at,source,dedupe_key,episode_number,condition_active,first_detected_at,last_detected_at,occurrence_count,gps_device_id,synthetic,title,observed_value,threshold_value,value_unit,status_changed_at,updated_at,origin)
  values(null,'device_not_responding','warning','new','Statistical signal requires operational review.',clock_timestamp(),'statistical_signal',v_key,1,true,s.generated_at,s.generated_at,1,null,s.synthetic,'Statistical signal review',s.observed_value,null,'count',clock_timestamp(),clock_timestamp(),'m22_rule_engine') returning id into v_alert;
  update public.m25_statistical_signals set promoted_alert_id=v_alert where id=p_signal_id;
  insert into public.alert_status_history(alert_id,previous_status,new_status,actor_type,actor_admin_id,reason,note,transition_at,safe_source) values(v_alert,null,'new','admin',v_actor,trim(p_reason),trim(p_note),clock_timestamp(),'admin_rpc');
  insert into public.audit_logs(actor_type,actor_id,action,entity_type,entity_id,safe_details) values('admin',v_actor,'m25_statistical_signal_promoted_to_alert','alert',v_alert,jsonb_build_object('signal_id',p_signal_id,'source','statistical_signal'));
  return jsonb_build_object('contractVersion','m25-admin-v1','signalId',p_signal_id,'alertId',v_alert,'created',true);
end;
$$;

alter table public.m25_feature_definitions enable row level security;
alter table public.m25_feature_extraction_jobs enable row level security;
alter table public.m25_feature_snapshots enable row level security;
alter table public.m25_feature_values enable row level security;
alter table public.m25_baseline_versions enable row level security;
alter table public.m25_statistical_signal_definitions enable row level security;
alter table public.m25_statistical_signals enable row level security;
alter table public.m25_signal_review_history enable row level security;
alter table public.m25_readiness_assessments enable row level security;
alter table public.m25_analysis_versions enable row level security;

revoke all on public.m25_feature_definitions,public.m25_feature_extraction_jobs,public.m25_feature_snapshots,public.m25_feature_values,public.m25_baseline_versions,public.m25_statistical_signal_definitions,public.m25_statistical_signals,public.m25_signal_review_history,public.m25_readiness_assessments,public.m25_analysis_versions from public,anon,authenticated;
grant select on public.m25_feature_definitions,public.m25_feature_snapshots,public.m25_feature_values,public.m25_baseline_versions,public.m25_statistical_signal_definitions,public.m25_statistical_signals,public.m25_signal_review_history,public.m25_readiness_assessments,public.m25_analysis_versions to authenticated;

create policy "M25 feature definitions admin reads" on public.m25_feature_definitions for select to authenticated using (public.is_admin());
create policy "M25 snapshots admin reads" on public.m25_feature_snapshots for select to authenticated using (public.is_admin());
create policy "M25 feature values admin reads" on public.m25_feature_values for select to authenticated using (public.is_admin());
create policy "M25 baselines admin reads" on public.m25_baseline_versions for select to authenticated using (public.is_admin());
create policy "M25 signal definitions admin reads" on public.m25_statistical_signal_definitions for select to authenticated using (public.is_admin());
create policy "M25 signals admin reads" on public.m25_statistical_signals for select to authenticated using (public.is_admin());
create policy "M25 reviews admin reads" on public.m25_signal_review_history for select to authenticated using (public.is_admin());
create policy "M25 readiness admin reads" on public.m25_readiness_assessments for select to authenticated using (public.is_admin());
create policy "M25 governance admin reads" on public.m25_analysis_versions for select to authenticated using (public.is_admin());

revoke all on function public.m25_enqueue_feature_scope_v1(text,text,timestamptz,timestamptz,uuid,uuid,text,text,boolean) from public,anon,authenticated;
revoke all on function public.m25_process_statistical_queue(integer,timestamptz) from public,anon,authenticated;
revoke all on function public.m25_compact_operational_rows(integer,timestamptz) from public,anon,authenticated;
grant execute on function public.m25_enqueue_feature_scope_v1(text,text,timestamptz,timestamptz,uuid,uuid,text,text,boolean) to service_role;
grant execute on function public.m25_process_statistical_queue(integer,timestamptz) to service_role;
grant execute on function public.m25_compact_operational_rows(integer,timestamptz) to service_role;
revoke all on function public.admin_get_m25_intelligence_readiness_v1(integer) from public,anon,authenticated;
revoke all on function public.admin_get_m25_signal_technical_values_v1(uuid) from public,anon,authenticated;
revoke all on function public.admin_transition_m25_signal_review_v1(uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.admin_promote_m25_signal_to_alert_v1(uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_get_m25_intelligence_readiness_v1(integer) to authenticated;
grant execute on function public.admin_get_m25_signal_technical_values_v1(uuid) to authenticated;
grant execute on function public.admin_transition_m25_signal_review_v1(uuid,text,text,text,text) to authenticated;
grant execute on function public.admin_promote_m25_signal_to_alert_v1(uuid,text,text) to authenticated;

comment on table public.m25_feature_values is 'Typed numeric M25 aggregates only. No coordinates, payloads, credentials, Work Codes, customer data, or arbitrary JSON.';
comment on table public.m25_statistical_signals is 'Explainable statistical review signals. Support level is coverage quality, not wrongdoing probability.';
comment on table public.m25_analysis_versions is 'Analysis governance registry. ML activation is explicitly blocked in M25.';
