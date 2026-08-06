-- M23 Phone Versus Physical Device Comparison
-- Synthetic/fake evidence only for this milestone. The policy is provisional
-- and requires AP calibration; this migration is not production-policy approval.

alter table public.alerts
  drop constraint if exists alerts_m22_source_check,
  add column if not exists m23_comparison_snapshot_id uuid;

alter table public.alerts
  add constraint alerts_m22_source_check check (source in (
    'legacy','physical_device_live','physical_device_delayed','health_sweep',
    'adapter_rejection','authentication_failure','recovery','comparison'
  ));

create table public.m23_comparison_policies (
  policy_id text not null,
  policy_version text not null,
  effective_from timestamptz not null,
  effective_until timestamptz,
  enabled boolean not null default true,
  pair_window_seconds integer not null,
  maximum_phone_accuracy_meters numeric not null,
  maximum_physical_accuracy_meters numeric not null,
  minimum_pair_count integer not null,
  sustained_mismatch_distance_meters numeric not null,
  sustained_mismatch_duration_seconds integer not null,
  maximum_sustained_episode_gap_seconds integer not null,
  missing_source_grace_seconds integer not null,
  backfill_window_seconds integer not null,
  finality_rule text not null default 'work_end_plus_backfill',
  missing_accuracy_behavior text not null default 'insufficient_quality',
  created_at timestamptz not null default clock_timestamp(),
  safe_provisional_policy_note text not null,
  primary key (policy_id, policy_version),
  constraint m23_policy_bounds_check check (
    char_length(policy_id) between 1 and 64
    and char_length(policy_version) between 1 and 32
    and (effective_until is null or effective_until > effective_from)
    and pair_window_seconds between 1 and 3600
    and maximum_phone_accuracy_meters between 1 and 10000
    and maximum_physical_accuracy_meters between 1 and 10000
    and minimum_pair_count between 1 and 100000
    and sustained_mismatch_distance_meters between 1 and 1000000
    and sustained_mismatch_duration_seconds between 1 and 2592000
    and maximum_sustained_episode_gap_seconds between 1 and 2592000
    and missing_source_grace_seconds between 1 and 2592000
    and backfill_window_seconds between 60 and 604800
    and finality_rule = 'work_end_plus_backfill'
    and missing_accuracy_behavior = 'insufficient_quality'
    and char_length(safe_provisional_policy_note) between 1 and 500
    and safe_provisional_policy_note not like '%://%'
  )
);

create extension if not exists btree_gist with schema extensions;
alter table public.m23_comparison_policies
  add constraint m23_policy_no_effective_overlap
  exclude using gist (
    tstzrange(effective_from, coalesce(effective_until, 'infinity'::timestamptz), '[)') with &&
  ) where (enabled);

insert into public.m23_comparison_policies (
  policy_id, policy_version, effective_from, pair_window_seconds,
  maximum_phone_accuracy_meters, maximum_physical_accuracy_meters,
  minimum_pair_count, sustained_mismatch_distance_meters,
  sustained_mismatch_duration_seconds, maximum_sustained_episode_gap_seconds,
  missing_source_grace_seconds, backfill_window_seconds,
  safe_provisional_policy_note
) values (
  'phone-device-comparison', 'm23-pilot-v1', '2026-07-28 00:00:00+00',
  60, 100, 100, 3, 250, 300, 120, 120, 86400,
  'Provisional pilot assumptions requiring AP calibration; not production approval.'
);

create or replace function public.m23_policy_at(p_at timestamptz)
returns public.m23_comparison_policies
language sql stable
set search_path = pg_catalog, public
as $$
  select p.* from public.m23_comparison_policies p
  where p.enabled and p.effective_from <= p_at
    and (p.effective_until is null or p_at < p.effective_until)
  order by p.effective_from desc limit 1
$$;

create table public.m23_comparison_jobs (
  id uuid primary key default gen_random_uuid(),
  ad_work_day_id uuid not null references public.ad_work_days(id) on delete restrict,
  ad_work_id uuid not null references public.ad_works(id) on delete restrict,
  policy_id text not null,
  policy_version text not null,
  state text not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default clock_timestamp(),
  locked_at timestamptz,
  completed_at timestamptz,
  safe_failure_reason_code text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (ad_work_day_id, policy_id, policy_version),
  foreign key (policy_id, policy_version)
    references public.m23_comparison_policies(policy_id, policy_version) on delete restrict,
  constraint m23_job_state_check check (state in ('pending','processing','completed','failed')),
  constraint m23_job_attempt_check check (attempt_count between 0 and 8),
  constraint m23_job_failure_check check (
    (state in ('pending','processing') and
      (safe_failure_reason_code is null or safe_failure_reason_code='evaluation_failed'))
    or (state='completed' and safe_failure_reason_code is null)
    or (state='failed' and safe_failure_reason_code='attempts_exhausted')
  )
);
create index m23_job_claim_idx on public.m23_comparison_jobs(next_attempt_at, created_at)
  where state in ('pending','processing');

create table public.m23_comparison_snapshots (
  id uuid primary key default gen_random_uuid(),
  ad_work_day_id uuid not null references public.ad_work_days(id) on delete restrict,
  ad_work_id uuid not null references public.ad_works(id) on delete restrict,
  driver_id uuid references public.drivers(id) on delete restrict,
  vehicle_id uuid references public.vehicles(id) on delete restrict,
  assignment_history_id uuid references public.m21_assignment_history(id) on delete restrict,
  release_history_id uuid references public.m21_release_history(id) on delete restrict,
  execution_history_id uuid references public.m21_execution_history(id) on delete restrict,
  gps_device_id uuid references public.gps_devices(id) on delete restrict,
  gps_device_vehicle_link_id uuid references public.gps_device_vehicle_links(id) on delete restrict,
  policy_id text not null,
  policy_version text not null,
  pairing_algorithm_version text not null default 'm23-pairing-v1',
  authority_scope_key text not null,
  input_watermark timestamptz,
  input_hash text not null,
  generated_at timestamptz not null default clock_timestamp(),
  source_expectation text not null,
  phone_eligible_count integer not null default 0,
  physical_eligible_count integer not null default 0,
  pair_count integer not null default 0,
  match_count integer not null default 0,
  mismatch_candidate_count integer not null default 0,
  insufficient_quality_count integer not null default 0,
  unpaired_phone_count integer not null default 0,
  unpaired_physical_count integer not null default 0,
  sustained_pair_count integer not null default 0,
  sustained_first_pair_at timestamptz,
  sustained_last_pair_at timestamptz,
  minimum_conservative_separation_meters numeric,
  maximum_conservative_separation_meters numeric,
  overall_outcome text not null,
  finality text not null,
  synthetic boolean not null default false,
  review_status text not null default 'not_reviewed',
  is_latest boolean not null default true,
  superseded_by_snapshot_id uuid references public.m23_comparison_snapshots(id) on delete restrict,
  build_complete boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (policy_id, policy_version)
    references public.m23_comparison_policies(policy_id, policy_version) on delete restrict,
  constraint m23_snapshot_hash_check check (
    authority_scope_key ~ '^[0-9a-f]{64}$' and input_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint m23_snapshot_algorithm_check check (pairing_algorithm_version = 'm23-pairing-v1'),
  constraint m23_snapshot_expectation_check check (
    source_expectation in ('neither_expected','phone_only','physical_only','both_expected','ambiguous')
  ),
  constraint m23_snapshot_outcome_check check (overall_outcome in (
    'not_expected','awaiting_sources','paired_match','isolated_mismatch',
    'sustained_mismatch','phone_missing','physical_device_missing','both_missing',
    'insufficient_pairs','insufficient_quality','comparison_unavailable'
  )),
  constraint m23_snapshot_finality_check check (
    finality in ('provisional_active_work','provisional_backfill_open','final_backfill_closed')
  ),
  constraint m23_snapshot_review_check check (
    review_status in ('not_reviewed','reviewing','reviewed_consistent','reviewed_needs_follow_up','dismissed_insufficient_evidence')
  ),
  constraint m23_snapshot_counts_check check (
    phone_eligible_count >= 0 and physical_eligible_count >= 0 and pair_count >= 0
    and match_count >= 0 and mismatch_candidate_count >= 0
    and insufficient_quality_count >= 0 and unpaired_phone_count >= 0
    and unpaired_physical_count >= 0 and sustained_pair_count >= 0
    and pair_count = match_count + mismatch_candidate_count + insufficient_quality_count
  )
);
create unique index m23_snapshot_input_unique
  on public.m23_comparison_snapshots(authority_scope_key, policy_id, policy_version, input_hash);
create index m23_snapshot_admin_list_idx
  on public.m23_comparison_snapshots(ad_work_day_id, created_at desc, overall_outcome);

create table public.m23_comparison_pairs (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.m23_comparison_snapshots(id) on delete restrict,
  pair_identity text not null,
  phone_point_id uuid not null references public.location_points(id) on delete restrict,
  physical_point_id uuid not null references public.location_points(id) on delete restrict,
  phone_captured_at timestamptz not null,
  physical_captured_at timestamptz not null,
  time_difference_milliseconds bigint not null,
  raw_haversine_distance_meters numeric,
  phone_accuracy_meters numeric,
  physical_device_accuracy_meters numeric,
  conservative_separation_meters numeric,
  quality text not null,
  outcome text not null,
  synthetic boolean not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (snapshot_id, pair_identity),
  unique (snapshot_id, phone_point_id),
  unique (snapshot_id, physical_point_id),
  constraint m23_pair_identity_check check (pair_identity ~ '^[0-9a-f]{64}$'),
  constraint m23_pair_quality_check check (quality in ('acceptable','insufficient_quality')),
  constraint m23_pair_outcome_check check (outcome in ('match','mismatch_candidate','insufficient_quality')),
  constraint m23_pair_quality_outcome_check check (
    (quality = 'acceptable' and outcome in ('match','mismatch_candidate'))
    or (quality = 'insufficient_quality' and outcome = 'insufficient_quality')
  ),
  constraint m23_pair_time_check check (time_difference_milliseconds between 0 and 86400000),
  constraint m23_pair_distance_check check (
    (quality = 'acceptable' and raw_haversine_distance_meters is not null
      and conservative_separation_meters is not null)
    or quality = 'insufficient_quality'
  )
);
create index m23_pair_snapshot_time_idx
  on public.m23_comparison_pairs(snapshot_id, phone_captured_at, physical_captured_at, id);
create index location_points_m23_phone_recorded_idx
  on public.location_points(ad_work_day_id, recorded_at, id)
  where source='phone'::public.tracking_source;
create index location_points_m23_physical_authority_idx
  on public.location_points(ad_work_day_id, execution_history_id, assignment_history_id,
    gps_device_vehicle_link_id, device_id, recorded_at, id)
  where source='physical_device'::public.tracking_source;

create table public.m23_comparison_review_history (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.m23_comparison_snapshots(id) on delete restrict,
  previous_status text,
  new_status text not null,
  actor_admin_id uuid not null,
  reason text not null,
  note text not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint m23_review_history_status_check check (
    new_status in ('not_reviewed','reviewing','reviewed_consistent','reviewed_needs_follow_up','dismissed_insufficient_evidence')
    and (previous_status is null or previous_status in (
      'not_reviewed','reviewing','reviewed_consistent','reviewed_needs_follow_up','dismissed_insufficient_evidence'))
  ),
  constraint m23_review_history_text_check check (
    char_length(reason) between 1 and 160 and char_length(note) between 1 and 500
  )
);
create index m23_review_history_snapshot_idx
  on public.m23_comparison_review_history(snapshot_id, created_at desc);

alter table public.alerts
  add constraint alerts_m23_snapshot_fk foreign key (m23_comparison_snapshot_id)
    references public.m23_comparison_snapshots(id) on delete restrict;

create table public.m23_comparison_heads (
  authority_scope_key text not null,
  policy_id text not null,
  policy_version text not null,
  snapshot_id uuid not null references public.m23_comparison_snapshots(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (authority_scope_key, policy_id, policy_version),
  foreign key (policy_id, policy_version)
    references public.m23_comparison_policies(policy_id, policy_version) on delete restrict
);

create table public.m23_comparison_reviews (
  snapshot_id uuid primary key references public.m23_comparison_snapshots(id) on delete restrict,
  status text not null default 'not_reviewed',
  updated_by uuid,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint m23_review_status_check check (
    status in ('not_reviewed','reviewing','reviewed_consistent','reviewed_needs_follow_up','dismissed_insufficient_evidence')
  )
);

insert into public.m23_comparison_reviews(snapshot_id,status)
select id,'not_reviewed' from public.m23_comparison_snapshots;

create table public.m23_comparison_alert_context (
  alert_id uuid primary key references public.alerts(id) on delete restrict,
  comparison_rule_id text not null default 'm23_sustained_comparison_mismatch',
  policy_id text not null,
  policy_version text not null,
  first_snapshot_id uuid not null references public.m23_comparison_snapshots(id) on delete restrict,
  last_snapshot_id uuid not null references public.m23_comparison_snapshots(id) on delete restrict,
  cleared_by_snapshot_id uuid references public.m23_comparison_snapshots(id) on delete restrict,
  authority_scope_key text not null,
  synthetic boolean not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (policy_id, policy_version)
    references public.m23_comparison_policies(policy_id, policy_version) on delete restrict
);

create or replace function public.m23_protect_snapshot()
returns trigger language plpgsql set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'M23 comparison snapshots are immutable' using errcode='55000';
  end if;
  if current_setting('app.m23_snapshot_build', true) = 'on' and old.build_complete is false then
    return new;
  end if;
  if current_setting('app.m23_snapshot_supersede', true) = 'on'
    and new.id = old.id
    and new.is_latest is false
    and new.superseded_by_snapshot_id is distinct from old.superseded_by_snapshot_id
  then
    return new;
  end if;
  raise exception 'M23 comparison snapshots are immutable' using errcode='55000';
end;
$$;

create trigger m23_snapshot_immutable before update or delete
  on public.m23_comparison_snapshots for each row execute function public.m23_protect_snapshot();

create or replace function public.m23_protect_pair()
returns trigger language plpgsql set search_path = pg_catalog, public
as $$
begin
  -- The only deletion exception is the bounded, service-only compactor.  Its
  -- predicate below excludes final, reviewed, alert-referenced, and source
  -- evidence rows; ordinary callers still get immutable evidence semantics.
  if tg_op='DELETE' and current_setting('app.m23_compaction',true)='on' then
    return old;
  end if;
  raise exception 'M23 comparison pair evidence is immutable' using errcode='55000';
end;
$$;
create trigger m23_pair_immutable before update or delete
  on public.m23_comparison_pairs for each row execute function public.m23_protect_pair();

create or replace function public.m23_pair_identity(
  p_work_day_id uuid, p_execution_history_id uuid, p_policy_version text,
  p_phone_point_id uuid, p_physical_point_id uuid
) returns text language sql immutable strict set search_path = pg_catalog, public
as $$
  select public.m22_safe_digest(concat_ws('|', p_work_day_id::text,
    p_execution_history_id::text, p_policy_version, p_phone_point_id::text,
    p_physical_point_id::text))
$$;

create or replace function public.m23_enqueue_comparison_job(p_ad_work_day_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public
as $$
declare p public.m23_comparison_policies%rowtype; w public.ad_work_days%rowtype;
begin
  if p_ad_work_day_id is null then return; end if;
  select * into w from public.ad_work_days where id=p_ad_work_day_id;
  if w.id is null then return; end if;
  p := public.m23_policy_at(clock_timestamp());
  if p.policy_id is null then return; end if;
  insert into public.m23_comparison_jobs(ad_work_day_id,ad_work_id,policy_id,policy_version)
  values(w.id,w.ad_work_id,p.policy_id,p.policy_version)
  on conflict(ad_work_day_id,policy_id,policy_version) do update set
    state = case when public.m23_comparison_jobs.state='completed' then 'pending'
      else public.m23_comparison_jobs.state end,
    next_attempt_at = case when public.m23_comparison_jobs.state='completed'
      then clock_timestamp() else public.m23_comparison_jobs.next_attempt_at end,
    completed_at = case when public.m23_comparison_jobs.state='completed' then null
      else public.m23_comparison_jobs.completed_at end,
    safe_failure_reason_code = null, updated_at=clock_timestamp();
end;
$$;

create or replace function public.m23_enqueue_location_point()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if new.source::text in ('phone','physical_device') then
    perform public.m23_enqueue_comparison_job(new.ad_work_day_id);
  end if;
  return new;
end;
$$;
create trigger location_points_m23_enqueue after insert on public.location_points
for each row execute function public.m23_enqueue_location_point();

create or replace function public.m23_evaluate_scope(
  p_ad_work_day_id uuid,
  p_execution_history_id uuid,
  p_assignment_history_id uuid,
  p_gps_device_vehicle_link_id uuid,
  p_gps_device_id uuid,
  p_policy_id text,
  p_policy_version text,
  p_now timestamptz
) returns uuid language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  w public.ad_work_days%rowtype; a public.ad_works%rowtype;
  e public.m21_execution_history%rowtype; ah public.m21_assignment_history%rowtype;
  p public.m23_comparison_policies%rowtype; s public.m23_comparison_snapshots%rowtype;
  phone record; physical record; v_id uuid; v_existing uuid;
  v_phone_count integer:=0; v_physical_count integer:=0; v_pair_count integer:=0;
  v_match_count integer:=0; v_mismatch_count integer:=0; v_quality_count integer:=0;
  v_unpaired_phone integer:=0; v_unpaired_physical integer:=0; v_sustained_count integer:=0;
  v_first timestamptz; v_last timestamptz; v_min numeric; v_max numeric; v_gap numeric;
  v_phone_max timestamptz; v_physical_max timestamptz; v_phone_max_id text; v_physical_max_id text;
  v_watermark timestamptz; v_input_hash text; v_scope_key text; v_expectation text;
  v_phone_expected boolean:=false; v_physical_expected boolean:=false; v_ambiguous boolean:=false;
  v_grace_elapsed boolean:=false; v_synthetic boolean:=false; v_finality text; v_outcome text;
  v_work_end timestamptz; v_eligible boolean;
  v_raw numeric; v_conservative numeric; v_quality text; v_pair_outcome text;
begin
  select * into strict w from public.ad_work_days where id=p_ad_work_day_id;
  select * into strict a from public.ad_works where id=w.ad_work_id;
  select * into strict e from public.m21_execution_history where id=p_execution_history_id;
  if p_assignment_history_id is not null then
    select * into ah from public.m21_assignment_history where id=p_assignment_history_id;
  end if;
  select * into p from public.m23_comparison_policies
    where policy_id=p_policy_id and policy_version=p_policy_version;
  if p.policy_id is null then raise exception 'M23 comparison policy not found' using errcode='P0002'; end if;

  v_phone_expected := coalesce(a.mobile_location_proof_required,false)
    and a.tracking_type::text in ('mobile','both');
  v_phone_expected := v_phone_expected and exists(
    select 1 from public.m21_release_history rh
    where rh.ad_work_id=a.id and rh.release_status='released_to_driver'
      and rh.effective_from<=e.effective_from
      and (rh.effective_until is null or e.effective_from<rh.effective_until)
  );
  v_physical_expected := a.tracking_type::text in ('device','both')
    and p_gps_device_id is not null and p_gps_device_vehicle_link_id is not null;
  v_ambiguous := (a.tracking_type::text in ('device','both')
      and (p_gps_device_id is null or p_gps_device_vehicle_link_id is null))
    or (p_assignment_history_id is null and (v_phone_expected or v_physical_expected));
  v_expectation := case when v_ambiguous then 'ambiguous'
    when v_phone_expected and v_physical_expected then 'both_expected'
    when v_phone_expected then 'phone_only'
    when v_physical_expected then 'physical_only'
    else 'neither_expected' end;

  v_scope_key := public.m22_safe_digest(concat_ws('|',w.id::text,e.id::text,
    coalesce(ah.id::text,''),coalesce(p_gps_device_vehicle_link_id::text,''),
    coalesce(p_gps_device_id::text,'')));

  if v_phone_expected then
    select count(*)::integer,max(lp.recorded_at),max(lp.id::text) into v_phone_count,v_phone_max,v_phone_max_id
    from public.location_points lp
    join public.tracking_sessions ts on ts.id=lp.tracking_session_id
    join public.m21_release_history rh on rh.ad_work_id=a.id
      and rh.release_status='released_to_driver'
      and rh.effective_from<=lp.recorded_at
      and (rh.effective_until is null or lp.recorded_at<rh.effective_until)
    where lp.ad_work_day_id=w.id and lp.source::text='phone'
      and ts.tracking_mode='phone_location' and lp.driver_id=ah.driver_id
      and lp.vehicle_id=ah.vehicle_id and lp.recorded_at>=e.effective_from
      and (e.effective_until is null or lp.recorded_at<e.effective_until);
  end if;
  if v_physical_expected then
    select count(*)::integer,max(lp.recorded_at),max(lp.id::text) into v_physical_count,v_physical_max,v_physical_max_id
    from public.location_points lp
    join public.telemetry_receipts tr on tr.id=lp.telemetry_receipt_id
    where lp.ad_work_day_id=w.id and lp.source::text='physical_device'
      and lp.execution_history_id=e.id and lp.assignment_history_id=ah.id
      and lp.gps_device_vehicle_link_id=p_gps_device_vehicle_link_id
      and lp.device_id=p_gps_device_id and tr.disposition in ('accepted_live','accepted_delayed')
      and tr.quality in ('valid','degraded');
  end if;
  v_watermark := greatest(coalesce(v_phone_max,'-infinity'::timestamptz),
    coalesce(v_physical_max,'-infinity'::timestamptz));
  if v_watermark='-infinity'::timestamptz then v_watermark:=null; end if;
  v_input_hash := public.m22_safe_digest(concat_ws('|',v_scope_key,p.policy_id,p.policy_version,
    v_expectation,v_phone_count,v_physical_count,coalesce(v_phone_max::text,''),
    coalesce(v_physical_max::text,''),coalesce(v_phone_max_id,''),coalesce(v_physical_max_id,'')));

  perform pg_advisory_xact_lock(hashtextextended(v_scope_key,23));
  select id into v_existing from public.m23_comparison_snapshots
  where authority_scope_key=v_scope_key and policy_id=p.policy_id
    and policy_version=p.policy_version and input_hash=v_input_hash;
  if v_existing is not null then return v_existing; end if;

  v_work_end:=coalesce(w.actual_end_time,e.effective_until);
  v_finality:=case
    when e.execution_status='running' and (e.effective_until is null or p_now<e.effective_until)
      then 'provisional_active_work'
    when v_work_end is null or p_now<v_work_end+make_interval(secs=>p.backfill_window_seconds)
      then 'provisional_backfill_open'
    else 'final_backfill_closed' end;
  v_grace_elapsed := v_work_end is not null
    or p_now>=e.effective_from+make_interval(secs=>p.missing_source_grace_seconds);

  insert into public.m23_comparison_snapshots(
    ad_work_day_id,ad_work_id,driver_id,vehicle_id,assignment_history_id,
    execution_history_id,gps_device_id,gps_device_vehicle_link_id,policy_id,
    policy_version,authority_scope_key,input_watermark,input_hash,source_expectation,
    overall_outcome,finality,synthetic
  ) values (
    w.id,w.ad_work_id,coalesce(ah.driver_id,w.driver_id),coalesce(ah.vehicle_id,w.vehicle_id),
    ah.id,e.id,p_gps_device_id,p_gps_device_vehicle_link_id,p.policy_id,p.policy_version,
    v_scope_key,v_watermark,v_input_hash,v_expectation,'comparison_unavailable',v_finality,false
  ) returning * into s;
  insert into public.m23_comparison_reviews(snapshot_id,status)
    values(s.id,'not_reviewed') on conflict(snapshot_id) do nothing;

  if v_phone_expected and v_physical_expected then
    for phone in
      select lp.id,lp.recorded_at,lp.accuracy_meters,lp.lat,lp.lng,lp.synthetic
      from public.location_points lp
      join public.tracking_sessions ts on ts.id=lp.tracking_session_id
      join public.m21_release_history rh on rh.ad_work_id=a.id
        and rh.release_status='released_to_driver'
        and rh.effective_from<=lp.recorded_at
        and (rh.effective_until is null or lp.recorded_at<rh.effective_until)
      where lp.ad_work_day_id=w.id and lp.source::text='phone'
        and ts.tracking_mode='phone_location' and lp.driver_id=ah.driver_id
        and lp.vehicle_id=ah.vehicle_id and lp.recorded_at>=e.effective_from
        and (e.effective_until is null or lp.recorded_at<e.effective_until)
      order by lp.recorded_at,lp.id
    loop
      select q.id,q.recorded_at,q.accuracy_meters,q.lat,q.lng,q.synthetic into physical
      from public.location_points q
      join public.telemetry_receipts tr on tr.id=q.telemetry_receipt_id
      where q.ad_work_day_id=w.id and q.source::text='physical_device'
        and q.execution_history_id=e.id and q.assignment_history_id=ah.id
        and q.gps_device_vehicle_link_id=p_gps_device_vehicle_link_id
        and q.device_id=p_gps_device_id and tr.disposition in ('accepted_live','accepted_delayed')
        and tr.quality in ('valid','degraded') and q.synthetic=phone.synthetic
        and q.recorded_at between phone.recorded_at-make_interval(secs=>p.pair_window_seconds)
          and phone.recorded_at+make_interval(secs=>p.pair_window_seconds)
        and not exists(select 1 from public.m23_comparison_pairs x
          where x.snapshot_id=s.id and x.physical_point_id=q.id)
      order by abs(extract(epoch from(q.recorded_at-phone.recorded_at))),q.recorded_at,q.id
      limit 1;
      if physical.id is null then continue; end if;
      v_raw:=public.m22_distance_m(phone.lat,phone.lng,physical.lat,physical.lng);
      v_eligible := phone.accuracy_meters is not null and physical.accuracy_meters is not null
        and phone.accuracy_meters::text<>'NaN' and physical.accuracy_meters::text<>'NaN'
        and phone.accuracy_meters between 0 and p.maximum_phone_accuracy_meters
        and physical.accuracy_meters between 0 and p.maximum_physical_accuracy_meters;
      v_quality:=case when v_eligible then 'acceptable' else 'insufficient_quality' end;
      v_conservative:=case when v_eligible then greatest(0,v_raw-phone.accuracy_meters-physical.accuracy_meters) end;
      v_pair_outcome:=case when not v_eligible then 'insufficient_quality'
        when v_conservative>p.sustained_mismatch_distance_meters then 'mismatch_candidate'
        else 'match' end;
      insert into public.m23_comparison_pairs(
        snapshot_id,pair_identity,phone_point_id,physical_point_id,phone_captured_at,
        physical_captured_at,time_difference_milliseconds,raw_haversine_distance_meters,
        phone_accuracy_meters,physical_device_accuracy_meters,conservative_separation_meters,
        quality,outcome,synthetic
      ) values (
        s.id,public.m23_pair_identity(w.id,e.id,p.policy_version,phone.id,physical.id),
        phone.id,physical.id,phone.recorded_at,physical.recorded_at,
        abs(extract(epoch from(physical.recorded_at-phone.recorded_at))*1000)::bigint,
        case when v_eligible then v_raw end,phone.accuracy_meters,physical.accuracy_meters,
        v_conservative,v_quality,v_pair_outcome,phone.synthetic and physical.synthetic
      );
    end loop;
  end if;

  select count(*)::integer,
    count(*) filter(where outcome='match')::integer,
    count(*) filter(where outcome='mismatch_candidate')::integer,
    count(*) filter(where outcome='insufficient_quality')::integer,
    min(conservative_separation_meters) filter(where outcome='mismatch_candidate'),
    max(conservative_separation_meters) filter(where outcome='mismatch_candidate')
  into v_pair_count,v_match_count,v_mismatch_count,v_quality_count,v_min,v_max
  from public.m23_comparison_pairs where snapshot_id=s.id;
  v_unpaired_phone:=greatest(0,v_phone_count-v_pair_count);
  v_unpaired_physical:=greatest(0,v_physical_count-v_pair_count);
  select min(phone_captured_at),max(phone_captured_at) into v_first,v_last
    from public.m23_comparison_pairs where snapshot_id=s.id and outcome='mismatch_candidate';
  select coalesce(max(gap_seconds),0) into v_gap from (
    select extract(epoch from(phone_captured_at-lag(phone_captured_at) over(order by phone_captured_at,id))) as gap_seconds
    from public.m23_comparison_pairs where snapshot_id=s.id and outcome='mismatch_candidate'
  ) gaps;
  v_sustained_count:=v_mismatch_count;
  if v_mismatch_count>=p.minimum_pair_count and v_first is not null
    and extract(epoch from(v_last-v_first))>=p.sustained_mismatch_duration_seconds
    and v_gap<=p.maximum_sustained_episode_gap_seconds
    and not exists(select 1 from public.m23_comparison_pairs x where x.snapshot_id=s.id
      and x.outcome='match' and x.phone_captured_at between v_first and v_last)
  then
    v_outcome:='sustained_mismatch';
  elsif v_ambiguous then v_outcome:='comparison_unavailable';
  elsif not v_phone_expected and not v_physical_expected then v_outcome:='not_expected';
  elsif not v_grace_elapsed and (v_phone_count=0 or v_physical_count=0) then v_outcome:='awaiting_sources';
  elsif v_phone_count=0 and v_physical_count=0 then v_outcome:='both_missing';
  elsif v_phone_count=0 then v_outcome:='phone_missing';
  elsif v_physical_count=0 then v_outcome:='physical_device_missing';
  elsif v_pair_count=0 and v_quality_count>0 then v_outcome:='insufficient_quality';
  elsif v_pair_count<p.minimum_pair_count then v_outcome:='insufficient_pairs';
  elsif v_mismatch_count>0 then v_outcome:='isolated_mismatch';
  else v_outcome:='paired_match'; end if;

  perform set_config('app.m23_snapshot_build','on',true);
  update public.m23_comparison_snapshots set
    phone_eligible_count=v_phone_count,physical_eligible_count=v_physical_count,
    pair_count=v_pair_count,match_count=v_match_count,mismatch_candidate_count=v_mismatch_count,
    insufficient_quality_count=v_quality_count,unpaired_phone_count=v_unpaired_phone,
    unpaired_physical_count=v_unpaired_physical,sustained_pair_count=case when v_outcome='sustained_mismatch' then v_sustained_count else 0 end,
    sustained_first_pair_at=case when v_outcome='sustained_mismatch' then v_first end,
    sustained_last_pair_at=case when v_outcome='sustained_mismatch' then v_last end,
    minimum_conservative_separation_meters=case when v_mismatch_count>0 then v_min end,
    maximum_conservative_separation_meters=case when v_mismatch_count>0 then v_max end,
    overall_outcome=v_outcome,synthetic=case when v_pair_count>0 and not exists(
      select 1 from public.m23_comparison_pairs x where x.snapshot_id=s.id and not x.synthetic
    ) then true else false end,build_complete=true
  where id=s.id;
  perform set_config('app.m23_snapshot_build','off',true);

  perform set_config('app.m23_snapshot_supersede','on',true);
  update public.m23_comparison_snapshots old set is_latest=false,superseded_by_snapshot_id=s.id
    where old.authority_scope_key=s.authority_scope_key and old.id<>s.id and old.is_latest;
  perform set_config('app.m23_snapshot_supersede','off',true);
  insert into public.m23_comparison_heads(authority_scope_key,policy_id,policy_version,snapshot_id,updated_at)
    values(s.authority_scope_key,s.policy_id,s.policy_version,s.id,clock_timestamp())
    on conflict(authority_scope_key,policy_id,policy_version) do update set snapshot_id=excluded.snapshot_id,updated_at=excluded.updated_at;

  perform public.m23_sync_mismatch_alert(s.id,v_outcome,v_max,p);
  return s.id;
end;
$$;

create or replace function public.m23_sync_mismatch_alert(
  p_snapshot_id uuid, p_outcome text, p_max_separation numeric,
  p_policy public.m23_comparison_policies
) returns void language plpgsql security definer set search_path = pg_catalog, public
as $$
declare s public.m23_comparison_snapshots%rowtype; w public.ad_work_days%rowtype;
  a public.alerts%rowtype; c public.m23_comparison_alert_context%rowtype;
  v_key text; v_episode integer; v_alert_id uuid;
begin
  select * into strict s from public.m23_comparison_snapshots where id=p_snapshot_id;
  select * into strict w from public.ad_work_days where id=s.ad_work_day_id;
  v_key:=public.m22_safe_digest(concat_ws('|','m23_comparison_mismatch',s.authority_scope_key,
    s.policy_id,s.policy_version));
  perform pg_advisory_xact_lock(hashtextextended(v_key,0));
  select * into a from public.alerts where dedupe_key=v_key
    and status::text not in ('resolved','false_alarm','ignored')
    order by episode_number desc,created_at desc,id desc limit 1 for update;
  if p_outcome='sustained_mismatch' then
    if a.id is null then
      select coalesce(max(episode_number),0)+1 into v_episode from public.alerts where dedupe_key=v_key;
      insert into public.alerts(
        ad_work_day_id,type,severity,status,message,created_at,source,dedupe_key,episode_number,
        condition_active,first_detected_at,last_detected_at,occurrence_count,vehicle_id,ad_work_id,
        assignment_id,assignment_history_id,execution_history_id,gps_device_id,
        gps_device_vehicle_link_id,synthetic,title,observed_value,threshold_value,value_unit,
        status_changed_at,updated_at,origin,m23_comparison_snapshot_id
      ) values (
        s.ad_work_day_id,'mismatch'::public.alert_type,'warning','new',
        'Sustained source separation detected. Review operational evidence.',clock_timestamp(),
        'comparison',v_key,v_episode,true,s.sustained_first_pair_at,s.sustained_last_pair_at,1,
        s.vehicle_id,s.ad_work_id,null,s.assignment_history_id,s.execution_history_id,s.gps_device_id,
        s.gps_device_vehicle_link_id,s.synthetic,'Sustained comparison mismatch',p_max_separation,
        p_policy.sustained_mismatch_distance_meters,'meters',clock_timestamp(),clock_timestamp(),
        'm22_rule_engine',s.id
      ) returning id into v_alert_id;
      insert into public.alert_status_history(alert_id,previous_status,new_status,actor_type,reason,note,transition_at,safe_source)
      values(v_alert_id,null,'new','service','condition_opened','Sustained comparison evidence requires admin operational follow-up.',clock_timestamp(),'rule_engine');
      insert into public.audit_logs(actor_type,action,entity_type,entity_id,safe_details)
      values('system','m23_comparison_alert_opened','alert',v_alert_id,jsonb_build_object('snapshot_id',s.id,'policy_version',s.policy_version));
      insert into public.m23_comparison_alert_context(
        alert_id,policy_id,policy_version,first_snapshot_id,last_snapshot_id,authority_scope_key,synthetic
      ) values(v_alert_id,s.policy_id,s.policy_version,s.id,s.id,s.authority_scope_key,s.synthetic);
    else
      select * into c from public.m23_comparison_alert_context
        where alert_id=a.id and authority_scope_key=s.authority_scope_key
          and policy_id=s.policy_id and policy_version=s.policy_version for update;
      if c.alert_id is null then raise exception 'M23 comparison alert context missing' using errcode='P0002'; end if;
      update public.alerts set condition_active=true,condition_cleared_at=null,
        last_detected_at=greatest(last_detected_at,s.sustained_last_pair_at),occurrence_count=least(occurrence_count+1,1000000000),
        observed_value=p_max_separation,threshold_value=p_policy.sustained_mismatch_distance_meters,
        m23_comparison_snapshot_id=s.id,synthetic=synthetic and s.synthetic,updated_at=clock_timestamp()
      where id=a.id;
      insert into public.audit_logs(actor_type,action,entity_type,entity_id,safe_details)
      values('system','m23_comparison_alert_updated','alert',a.id,jsonb_build_object('snapshot_id',s.id));
      update public.m23_comparison_alert_context set last_snapshot_id=s.id,updated_at=clock_timestamp()
        where alert_id=a.id;
    end if;
  elsif p_outcome='paired_match' and s.acceptable_pair_count>=p_policy.minimum_pair_count
    and s.mismatch_candidate_count=0 then
    select ctx.* into c from public.m23_comparison_alert_context ctx
      join public.alerts ax on ax.id=ctx.alert_id
      where ctx.authority_scope_key=s.authority_scope_key and ctx.policy_id=s.policy_id
        and ctx.policy_version=s.policy_version and ax.condition_active
        and ax.status::text not in ('resolved','false_alarm','ignored')
      order by ax.episode_number desc,ax.created_at desc,ax.id desc limit 1 for update of ctx;
    if c.alert_id is not null then
      select * into a from public.alerts where id=c.alert_id for update;
      if s.generated_at>coalesce(a.last_detected_at,'-infinity'::timestamptz) then
        update public.alerts set condition_active=false,condition_cleared_at=clock_timestamp(),
          m23_comparison_snapshot_id=s.id,updated_at=clock_timestamp() where id=a.id;
        update public.m23_comparison_alert_context set cleared_by_snapshot_id=s.id,updated_at=clock_timestamp()
          where alert_id=a.id;
      end if;
    end if;
  else
    insert into public.audit_logs(actor_type,action,entity_type,entity_id,safe_details)
      values('system','m23_comparison_inconclusive_observed', 'm23_comparison', s.id,
        jsonb_build_object('outcome',p_outcome,'scope',s.authority_scope_key));
  end if;
end;
$$;

drop trigger if exists m23_review_history_immutable on public.m23_comparison_review_history;
create or replace function public.m23_protect_review_history()
returns trigger language plpgsql set search_path = pg_catalog, public
as $$
begin
  raise exception 'M23 comparison review history is immutable' using errcode='55000';
end;
$$;
create trigger m23_review_history_immutable before update or delete
  on public.m23_comparison_review_history for each row
  execute function public.m23_protect_review_history();

create or replace function public.admin_list_m23_comparisons_v1(
  p_ad_work_id uuid default null,p_from_date date default current_date-31,
  p_to_date date default current_date,p_outcome text default null,
  p_review_status text default null,p_limit integer default 100
) returns jsonb language plpgsql security definer stable set search_path = pg_catalog, public
as $$
declare v_rows jsonb;
begin
  perform public.m20a_require_admin();
  if p_limit not between 1 and 100 or p_from_date is null or p_to_date is null
    or p_to_date<p_from_date or p_to_date-p_from_date>93 then
    raise exception 'Invalid bounded M23 comparison request' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(row_value order by created_at desc,id),'[]'::jsonb) into v_rows from (
    select s.id,s.created_at,jsonb_build_object(
      'snapshotId',s.id,'adWorkDayId',s.ad_work_day_id,'adWorkId',s.ad_work_id,
      'workLabel',aw.title||' · '||wd.work_date::text,'policyVersion',s.policy_version,
      'pairingAlgorithmVersion',s.pairing_algorithm_version,'sourceExpectation',s.source_expectation,
      'overallOutcome',s.overall_outcome,'reviewStatus',coalesce(rv.status,'not_reviewed'),
      'finality',s.finality,'phoneEligibleCount',s.phone_eligible_count,
      'physicalEligibleCount',s.physical_eligible_count,'pairCount',s.pair_count,
      'acceptablePairCount',s.acceptable_pair_count,'matchCount',s.match_count,
      'mismatchCandidateCount',s.mismatch_candidate_count,'insufficientQualityCount',s.insufficient_quality_count,
      'unpairedPhoneCount',s.unpaired_phone_count,'unpairedPhysicalCount',s.unpaired_physical_count,
      'sustainedPairCount',s.sustained_pair_count,'sustainedFirstPairAt',s.sustained_first_pair_at,
      'sustainedLastPairAt',s.sustained_last_pair_at,'synthetic',s.synthetic,'generatedAt',s.generated_at,
      'safeReasonCode',s.safe_reason_code,
      'alertId',(select a.id from public.alerts a where a.m23_comparison_snapshot_id=s.id order by a.updated_at desc limit 1),
      'technicalValuesAvailable',exists(select 1 from public.m23_comparison_pairs x
        where x.snapshot_id=s.id)
    ) row_value
    from public.m23_comparison_snapshots s join public.ad_work_days wd on wd.id=s.ad_work_day_id
      join public.ad_works aw on aw.id=s.ad_work_id left join public.m23_comparison_reviews rv on rv.snapshot_id=s.id
    where wd.work_date between p_from_date and p_to_date and s.build_complete
      and (p_ad_work_id is null or s.ad_work_id=p_ad_work_id)
      and (p_outcome is null or s.overall_outcome=p_outcome)
      and (p_review_status is null or coalesce(rv.status,'not_reviewed')=p_review_status)
    order by s.created_at desc,s.id limit p_limit
  ) bounded;
  return jsonb_build_object('contractVersion','m23-admin-v1','rows',v_rows);
end;
$$;

create or replace function public.admin_get_m23_comparison_detail_v1(p_snapshot_id uuid)
returns jsonb language plpgsql security definer stable set search_path = pg_catalog, public
as $$
declare v_result jsonb;
begin
  perform public.m20a_require_admin();
  select jsonb_build_object(
    'contractVersion','m23-admin-v1','comparison',jsonb_build_object(
      'snapshotId',s.id,'adWorkDayId',s.ad_work_day_id,'adWorkId',s.ad_work_id,
      'workLabel',aw.title||' · '||wd.work_date::text,'policyVersion',s.policy_version,
      'pairingAlgorithmVersion',s.pairing_algorithm_version,'sourceExpectation',s.source_expectation,
      'overallOutcome',s.overall_outcome,'reviewStatus',coalesce(rv.status,'not_reviewed'),
      'finality',s.finality,'phoneEligibleCount',s.phone_eligible_count,
      'physicalEligibleCount',s.physical_eligible_count,'pairCount',s.pair_count,
      'acceptablePairCount',s.acceptable_pair_count,'matchCount',s.match_count,
      'mismatchCandidateCount',s.mismatch_candidate_count,'insufficientQualityCount',s.insufficient_quality_count,
      'unpairedPhoneCount',s.unpaired_phone_count,'unpairedPhysicalCount',s.unpaired_physical_count,
      'sustainedPairCount',s.sustained_pair_count,'sustainedFirstPairAt',s.sustained_first_pair_at,
      'sustainedLastPairAt',s.sustained_last_pair_at,'synthetic',s.synthetic,'generatedAt',s.generated_at,
      'inputWatermark',s.input_watermark,'technicalValuesAvailable',exists(select 1
        from public.m23_comparison_pairs x where x.snapshot_id=s.id)
    ),
    'reviewHistory',coalesce((select jsonb_agg(jsonb_build_object(
      'id',h.id,'previousStatus',h.previous_status,'newStatus',h.new_status,'reason',h.reason,
      'note',h.note,'createdAt',h.created_at) order by h.created_at desc)
      from public.m23_comparison_review_history h where h.snapshot_id=s.id),'[]'::jsonb),
    'alert',(select jsonb_build_object('id',al.id,'status',al.status,'conditionActive',al.condition_active,
      'firstDetectedAt',al.first_detected_at,'lastDetectedAt',al.last_detected_at,'occurrenceCount',al.occurrence_count)
      from public.alerts al where al.m23_comparison_snapshot_id=s.id order by al.updated_at desc limit 1)
  ) into v_result
  from public.m23_comparison_snapshots s join public.ad_work_days wd on wd.id=s.ad_work_day_id
    join public.ad_works aw on aw.id=s.ad_work_id left join public.m23_comparison_reviews rv on rv.snapshot_id=s.id
  where s.id=p_snapshot_id and s.build_complete;
  if v_result is null then raise exception 'M23 comparison not found' using errcode='P0002'; end if;
  return v_result;
end;
$$;

drop function if exists public.admin_get_m23_comparison_technical_values_v1(uuid,text,integer);
create function public.admin_get_m23_comparison_technical_values_v1(
  p_snapshot_id uuid,p_after_cursor text,p_limit integer
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_actor uuid:=public.m20a_require_admin(); s public.m23_comparison_snapshots%rowtype;
  p public.m23_comparison_policies%rowtype; v_pairs jsonb; v_has_more boolean:=false;
  v_next text:=null; v_cursor_at timestamptz; v_cursor_physical timestamptz; v_cursor_id text;
  v_last jsonb; v_count integer;
begin
  if p_limit not between 1 and 100 then raise exception 'Invalid bounded M23 technical-value limit' using errcode='22023'; end if;
  select * into strict s from public.m23_comparison_snapshots where id=p_snapshot_id and build_complete;
  select * into strict p from public.m23_comparison_policies where policy_id=s.policy_id and policy_version=s.policy_version;
  if p_after_cursor is not null then
    begin
      v_cursor_at:=split_part(convert_from(decode(p_after_cursor,'base64'),'utf8'),'|',1)::timestamptz;
      v_cursor_physical:=split_part(convert_from(decode(p_after_cursor,'base64'),'utf8'),'|',2)::timestamptz;
      v_cursor_id:=split_part(convert_from(decode(p_after_cursor,'base64'),'utf8'),'|',3);
      if v_cursor_at is null or v_cursor_physical is null or char_length(v_cursor_id)<>64 then raise exception 'bad cursor'; end if;
    exception when others then raise exception 'Invalid M23 technical-value cursor' using errcode='22023'; end;
  end if;
  insert into public.audit_logs(actor_type,actor_id,action,entity_type,entity_id,safe_details)
    values('admin',v_actor,'m23_comparison_technical_values_viewed','m23_comparison',p_snapshot_id,
      jsonb_build_object('contract_version','m23-admin-v1','limit',p_limit,'has_cursor',p_after_cursor is not null));
  select coalesce(jsonb_agg(jsonb_build_object(
      'pairId',x.pair_identity,'phoneCapturedAt',x.phone_captured_at,
      'physicalCapturedAt',x.physical_captured_at,'timeDifferenceMilliseconds',x.time_difference_milliseconds,
      'rawHaversineDistanceMeters',x.raw_haversine_distance_meters,'conservativeSeparationMeters',x.conservative_separation_meters,
      'phoneAccuracyMeters',x.phone_accuracy_meters,'physicalDeviceAccuracyMeters',x.physical_device_accuracy_meters,
      'threshold',p.sustained_mismatch_distance_meters,'quality',x.quality,'outcome',x.outcome,
      'policyVersion',s.policy_version,'synthetic',x.synthetic) order by x.phone_captured_at,x.physical_captured_at,x.pair_identity),'[]'::jsonb)
    into v_pairs
  from (select x.* from public.m23_comparison_pairs x
    where x.snapshot_id=s.id
      and (p_after_cursor is null or (x.phone_captured_at>v_cursor_at
        or (x.phone_captured_at=v_cursor_at and x.physical_captured_at>v_cursor_physical)
        or (x.phone_captured_at=v_cursor_at and x.physical_captured_at=v_cursor_physical and x.pair_identity>v_cursor_id)))
    order by x.phone_captured_at,x.physical_captured_at,x.pair_identity
    limit least(p_limit+1,s.pair_count+1)) x;
  v_count:=jsonb_array_length(v_pairs); v_has_more:=v_count>p_limit;
  if v_has_more then
    v_last:=v_pairs->(p_limit-1);
    v_next:=encode(convert_to((v_last->>'phoneCapturedAt')||'|'||(v_last->>'physicalCapturedAt')||'|'||(v_last->>'pairId'),'utf8'),'base64');
    select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) into v_pairs
      from jsonb_array_elements(v_pairs) with ordinality where ordinality<=p_limit;
  end if;
  return jsonb_build_object('contractVersion','m23-admin-v1','snapshotId',s.id,'policyVersion',s.policy_version,
    'threshold',p.sustained_mismatch_distance_meters,'accessedAt',clock_timestamp(),'pairs',v_pairs,
    'hasMore',v_has_more,'nextCursor',v_next);
end;
$$;

create or replace function public.admin_get_m23_comparison_technical_values_v1(p_snapshot_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  return public.admin_get_m23_comparison_technical_values_v1(p_snapshot_id,null,100);
end;
$$;

create or replace function public.admin_transition_m23_comparison_review(
  p_snapshot_id uuid,p_new_status text,p_reason text,p_note text
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_actor uuid:=public.m20a_require_admin(); v_previous text; v_result jsonb;
begin
  if p_new_status not in ('reviewing','reviewed_consistent','reviewed_needs_follow_up','dismissed_insufficient_evidence')
    or p_reason is null or char_length(trim(p_reason)) not between 1 and 160
    or p_note is null or char_length(trim(p_note)) not between 1 and 500 then
    raise exception 'Invalid M23 review transition' using errcode='22023';
  end if;
  perform 1 from public.m23_comparison_snapshots where id=p_snapshot_id and build_complete;
  if not found then raise exception 'M23 comparison not found' using errcode='P0002'; end if;
  insert into public.m23_comparison_reviews(snapshot_id,status) values(p_snapshot_id,'not_reviewed') on conflict do nothing;
  select status into v_previous from public.m23_comparison_reviews where snapshot_id=p_snapshot_id for update;
  if v_previous='dismissed_insufficient_evidence' then raise exception 'M23 review is terminal' using errcode='55000'; end if;
  if p_new_status=v_previous then raise exception 'M23 review transition is a no-op' using errcode='55000'; end if;
  if not ((v_previous='not_reviewed' and p_new_status in ('reviewing','reviewed_consistent','reviewed_needs_follow_up','dismissed_insufficient_evidence'))
    or (v_previous='reviewing' and p_new_status in ('reviewed_consistent','reviewed_needs_follow_up','dismissed_insufficient_evidence'))
    or (v_previous='reviewed_consistent' and p_new_status in ('reviewing','reviewed_needs_follow_up','dismissed_insufficient_evidence'))
    or (v_previous='reviewed_needs_follow_up' and p_new_status in ('reviewing','reviewed_consistent','dismissed_insufficient_evidence'))) then
    raise exception 'Blocked M23 review transition' using errcode='55000';
  end if;
  insert into public.m23_comparison_review_history(snapshot_id,previous_status,new_status,actor_admin_id,reason,note)
    values(p_snapshot_id,v_previous,p_new_status,v_actor,trim(p_reason),trim(p_note));
  update public.m23_comparison_reviews set status=p_new_status,updated_by=v_actor,updated_at=clock_timestamp() where snapshot_id=p_snapshot_id;
  insert into public.audit_logs(actor_type,actor_id,action,entity_type,entity_id,safe_details)
    values('admin',v_actor,'m23_comparison_review_transitioned','m23_comparison',p_snapshot_id,
      jsonb_build_object('previous_status',v_previous,'new_status',p_new_status));
  v_result:=jsonb_build_object('contractVersion','m23-admin-v1','snapshotId',p_snapshot_id,'reviewStatus',p_new_status);
  return v_result;
end;
$$;

create or replace function public.m23_compact_comparison_detail(p_batch_size integer default 100)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_deleted_pairs integer:=0; v_deleted_evidence integer:=0;
begin
  if p_batch_size not between 1 and 100 then raise exception 'Invalid bounded M23 compaction batch' using errcode='22023'; end if;
  perform set_config('app.m23_compaction','on',true);
  delete from public.m23_comparison_pairs x where x.id in (
    select x2.id from public.m23_comparison_pairs x2
      join public.m23_comparison_snapshots s on s.id=x2.snapshot_id
    where s.is_latest=false and s.finality<>'final_backfill_closed'
      and not exists(select 1 from public.m23_comparison_alert_context c where c.first_snapshot_id=s.id or c.last_snapshot_id=s.id or c.cleared_by_snapshot_id=s.id)
      and not exists(select 1 from public.m23_comparison_review_history h where h.snapshot_id=s.id)
    order by x2.id limit p_batch_size
  );
  get diagnostics v_deleted_pairs=row_count;
  delete from public.m23_comparison_pair_evidence ce where ce.id in (
    select ce2.id
    from public.m23_comparison_pair_evidence ce2
    join public.m23_comparison_snapshots first_s on first_s.id=ce2.first_snapshot_id
    where not exists(
      select 1
      from public.m23_comparison_pairs cp
      join public.m23_comparison_snapshots selected_s on selected_s.id=cp.snapshot_id
      where selected_s.authority_scope_key=ce2.authority_scope_key
        and selected_s.policy_id=ce2.policy_id
        and selected_s.policy_version=ce2.policy_version
        and cp.pair_identity=ce2.pair_identity
    )
      and not first_s.is_latest
      and first_s.finality<>'final_backfill_closed'
      and not exists(select 1 from public.m23_comparison_reviews rv
        where rv.snapshot_id=first_s.id and rv.status<>'not_reviewed')
      and not exists(select 1 from public.m23_comparison_review_history rh
        where rh.snapshot_id=first_s.id)
      and not exists(select 1 from public.m23_comparison_alert_context ac
        where ac.first_snapshot_id=first_s.id or ac.last_snapshot_id=first_s.id or ac.cleared_by_snapshot_id=first_s.id)
    order by ce2.id limit p_batch_size
  );
  get diagnostics v_deleted_evidence=row_count;
  perform set_config('app.m23_compaction','off',true);
  return jsonb_build_object('deletedDetailRows',v_deleted_pairs,
    'deletedEvidenceRows',v_deleted_evidence,'batchSize',p_batch_size);
end;
$$;

revoke all on function public.m23_compact_comparison_detail(integer) from public,anon,authenticated;
revoke all on function public.admin_get_m23_comparison_technical_values_v1(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.m23_compact_comparison_detail(integer) to service_role;
grant execute on function public.admin_get_m23_comparison_technical_values_v1(uuid,text,integer) to authenticated;
grant execute on function public.admin_get_m23_comparison_technical_values_v1(uuid) to authenticated;

-- Retention must preserve every source point referenced by either the immutable
-- pair cache or its deduplicated evidence ledger.  No M23 cleanup uses CASCADE.
create or replace function public.run_data_retention(p_deleted_proof_ids uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_enquiries integer:=0; v_location_points integer:=0; v_proofs integer:=0;
  v_summaries integer:=0; v_audit integer:=0; v_result jsonb;
begin
  delete from public.enquiries where status in ('rejected','not_interested','invalid_spam')
    and created_at<clock_timestamp()-interval '180 days'; get diagnostics v_enquiries=row_count;
  delete from public.location_points lp using public.tracking_sessions ts,public.ad_work_days awd,public.ad_works aw
    where lp.tracking_session_id=ts.id and ts.ad_work_day_id=awd.id and awd.ad_work_id=aw.id
      and aw.closure_closed_at<clock_timestamp()-interval '90 days'
      and not exists(select 1 from public.m23_comparison_pairs cp
        where cp.phone_point_id=lp.id or cp.physical_point_id=lp.id)
      and not exists(select 1 from public.m23_comparison_pair_evidence ce
        where ce.phone_point_id=lp.id or ce.physical_point_id=lp.id);
  get diagnostics v_location_points=row_count;
  delete from public.proof_uploads where id=any(coalesce(p_deleted_proof_ids,'{}')); get diagnostics v_proofs=row_count;
  delete from public.final_proof_summaries fps using public.ad_works aw where fps.ad_work_id=aw.id
    and aw.closure_closed_at<clock_timestamp()-interval '12 months'; get diagnostics v_summaries=row_count;
  delete from public.audit_logs where created_at<clock_timestamp()-interval '12 months'
    and entity_type not in ('m23_comparison','alert'); get diagnostics v_audit=row_count;
  v_result:=jsonb_build_object('enquiries',v_enquiries,'location_points',v_location_points,
    'proof_uploads',v_proofs,'final_summaries',v_summaries,'audit_logs',v_audit);
  insert into public.data_retention_runs(result_status,safe_counts) values('completed',v_result);
  return v_result;
end;
$$;
revoke all on function public.run_data_retention(uuid[]) from public,anon,authenticated;
grant execute on function public.run_data_retention(uuid[]) to service_role;

create or replace function public.admin_list_m22_alerts_v1(
  p_status text default null,p_severity text default null,p_rule_id text default null,
  p_source text default null,p_gps_device_id uuid default null,p_vehicle_id uuid default null,
  p_ad_work_id uuid default null,p_synthetic boolean default null,p_condition_active boolean default null,
  p_limit integer default 100
) returns jsonb language plpgsql security definer stable set search_path = pg_catalog, public
as $$
declare v_rows jsonb;
begin
  perform public.m20a_require_admin();
  if p_limit not between 1 and 200 then raise exception 'Invalid bounded limit' using errcode='22023'; end if;
  select coalesce(jsonb_agg(row_value order by last_detected_at desc,id),'[]'::jsonb) into v_rows from (
    select a.id,a.last_detected_at,jsonb_build_object(
      'id',a.id,'ruleId',case when a.source='comparison' then 'phone_physical_sustained_mismatch' else a.rule_id end,
      'ruleVersion',case when a.source='comparison' then null else a.rule_version end,'title',a.title,'message',a.message,
      'severity',a.severity,'status',a.status,'source',a.source,'deviceLabel',gd.device_code,'vehicleLabel',v.vehicle_number,
      'workLabel',case when aw.id is null then null else aw.title||coalesce(' · '||wd.work_date::text,'') end,
      'firstDetectedAt',a.first_detected_at,'lastDetectedAt',a.last_detected_at,'conditionActive',a.condition_active,
      'conditionClearedAt',a.condition_cleared_at,'occurrenceCount',a.occurrence_count,'synthetic',a.synthetic
    ) row_value
    from public.alerts a left join public.gps_devices gd on gd.id=a.gps_device_id left join public.vehicles v on v.id=a.vehicle_id
      left join public.ad_work_days wd on wd.id=a.ad_work_day_id left join public.ad_works aw on aw.id=coalesce(a.ad_work_id,wd.ad_work_id)
    where (a.rule_id is not null or a.source='comparison')
      and (p_status is null or a.status::text=p_status) and (p_severity is null or a.severity::text=p_severity)
      and (p_rule_id is null or (case when a.source='comparison' then 'phone_physical_sustained_mismatch' else a.rule_id end)=p_rule_id)
      and (p_source is null or a.source=p_source) and (p_gps_device_id is null or a.gps_device_id=p_gps_device_id)
      and (p_vehicle_id is null or a.vehicle_id=p_vehicle_id) and (p_ad_work_id is null or coalesce(a.ad_work_id,wd.ad_work_id)=p_ad_work_id)
      and (p_synthetic is null or a.synthetic=p_synthetic) and (p_condition_active is null or a.condition_active=p_condition_active)
    order by a.last_detected_at desc,a.id limit p_limit
  ) bounded;
  return jsonb_build_object('contractVersion','m22-admin-v1','rows',v_rows);
end;
$$;

create or replace function public.admin_get_m22_alert_detail_v1(p_alert_id uuid)
returns jsonb language plpgsql security definer stable set search_path = pg_catalog, public
as $$
declare v_result jsonb;
begin
  perform public.m20a_require_admin();
  select jsonb_build_object('contractVersion','m22-admin-v1',
    'alert',jsonb_build_object('id',a.id,'ruleId',case when a.source='comparison' then 'phone_physical_sustained_mismatch' else a.rule_id end,
      'ruleVersion',case when a.source='comparison' then null else a.rule_version end,'title',a.title,'message',a.message,
      'severity',a.severity,'status',a.status,'source',a.source,'deviceLabel',gd.device_code,'vehicleLabel',v.vehicle_number,
      'workLabel',case when aw.id is null then null else aw.title||coalesce(' · '||wd.work_date::text,'') end,
      'firstDetectedAt',a.first_detected_at,'lastDetectedAt',a.last_detected_at,'conditionActive',a.condition_active,
      'conditionClearedAt',a.condition_cleared_at,'occurrenceCount',a.occurrence_count,'synthetic',a.synthetic),
    'statusHistory',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'previousStatus',h.previous_status,'newStatus',h.new_status,
      'reason',h.reason,'note',h.note,'transitionAt',h.transition_at) order by h.transition_at)
      from (select * from public.alert_status_history where alert_id=a.id order by transition_at desc limit 100) h),'[]'::jsonb),
    'notes',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'reason',n.reason,'note',n.note,'createdAt',n.created_at) order by n.created_at)
      from (select * from public.alert_notes where alert_id=a.id order by created_at desc limit 100) n),'[]'::jsonb),
    'assessments',case when a.source='comparison' then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',x.id,
      'ruleId',x.rule_id,'ruleVersion',x.rule_version,'outcome',x.outcome,'reasonCode',x.reason_code,'evidenceTiming',x.evidence_timing,'assessedAt',x.assessed_at)
      order by x.assessed_at desc) from (select * from public.m22_rule_assessments where alert_id=a.id order by assessed_at desc limit 100) x),'[]'::jsonb) end,
    'comparisonContext',case when a.source='comparison' then (select jsonb_build_object('comparisonRuleId',c.comparison_rule_id,
      'policyVersion',c.policy_version,'snapshotId',c.last_snapshot_id) from public.m23_comparison_alert_context c where c.alert_id=a.id) else null end,
    'auditHistory',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'action',l.action,'createdAt',l.created_at) order by l.created_at desc)
      from (select id,action,created_at from public.audit_logs where entity_type='alert' and entity_id=a.id order by created_at desc limit 100) l),'[]'::jsonb),
    'allowedTransitions',case a.status::text when 'new' then '["acknowledged","investigating","resolved","false_alarm","ignored"]'::jsonb
      when 'acknowledged' then '["investigating","resolved","false_alarm","ignored"]'::jsonb
      when 'investigating' then '["resolved","false_alarm","ignored"]'::jsonb else '[]'::jsonb end,
    'technicalValuesAvailable',case when a.source='comparison' then false else exists(select 1 from public.m22_rule_assessments x where x.alert_id=a.id and (x.observed_value is not null or x.threshold_value is not null)) end
  ) into v_result from public.alerts a left join public.gps_devices gd on gd.id=a.gps_device_id left join public.vehicles v on v.id=a.vehicle_id
    left join public.ad_work_days wd on wd.id=a.ad_work_day_id left join public.ad_works aw on aw.id=coalesce(a.ad_work_id,wd.ad_work_id)
  where a.id=p_alert_id and (a.rule_id is not null or a.source='comparison');
  if v_result is null then raise exception 'M22 alert not found' using errcode='P0002'; end if;
  return v_result;
end;
$$;

create or replace function public.m23_evaluate_work_day(
  p_ad_work_day_id uuid, p_policy_id text, p_policy_version text,
  p_now timestamptz default clock_timestamp()
) returns integer language plpgsql security definer set search_path = pg_catalog, public
as $$
declare e record; ah record; v_count integer:=0; v_link_count integer; v_link record;
  v_had_assignment boolean;
begin
  for e in select * from public.m21_execution_history
    where ad_work_day_id=p_ad_work_day_id order by effective_from,id
  loop
    v_had_assignment:=false;
    for ah in select * from public.m21_assignment_history x
      where x.ad_work_id=(select ad_work_id from public.ad_work_days where id=p_ad_work_day_id)
        and x.effective_from<=coalesce(e.effective_until,p_now)
        and (x.effective_until is null or e.effective_from<x.effective_until)
      order by x.effective_from,x.id
    loop
      v_had_assignment:=true;
      select count(*) into v_link_count from public.gps_device_vehicle_links l
      where l.vehicle_id=ah.vehicle_id and l.is_primary
        and l.effective_from<=coalesce(e.effective_until,p_now)
        and (l.effective_until is null or e.effective_from<l.effective_until);
      if v_link_count=1 then
        select l.id,l.gps_device_id into v_link from public.gps_device_vehicle_links l
        where l.vehicle_id=ah.vehicle_id and l.is_primary
          and l.effective_from<=coalesce(e.effective_until,p_now)
          and (l.effective_until is null or e.effective_from<l.effective_until)
        order by l.effective_from desc,l.id limit 1;
        perform public.m23_evaluate_scope(p_ad_work_day_id,e.id,ah.id,v_link.id,v_link.gps_device_id,p_policy_id,p_policy_version,p_now);
      else
        perform public.m23_evaluate_scope(p_ad_work_day_id,e.id,ah.id,null,null,p_policy_id,p_policy_version,p_now);
      end if;
      v_count:=v_count+1;
    end loop;
    if not v_had_assignment then
      perform public.m23_evaluate_scope(p_ad_work_day_id,e.id,null,null,null,p_policy_id,p_policy_version,p_now);
      v_count:=v_count+1;
    end if;
  end loop;
  return v_count;
end;
$$;

create or replace function public.m23_process_comparison_queue(
  p_batch_size integer default 50, p_now timestamptz default clock_timestamp()
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare q public.m23_comparison_jobs%rowtype; v_claimed integer:=0; v_completed integer:=0; v_failed integer:=0;
begin
  if p_batch_size not between 1 and 100 or p_now is null then
    raise exception 'Invalid bounded M23 comparison queue request' using errcode='22023';
  end if;
  for q in select * from public.m23_comparison_jobs
    where state in ('pending','processing') and next_attempt_at<=p_now and attempt_count<8
      and (state='pending' or locked_at<p_now-interval '5 minutes')
    order by next_attempt_at,created_at,id for update skip locked limit p_batch_size
  loop
    v_claimed:=v_claimed+1;
    update public.m23_comparison_jobs set state='processing',attempt_count=attempt_count+1,
      locked_at=p_now,updated_at=clock_timestamp() where id=q.id;
    begin
      perform public.m23_evaluate_work_day(q.ad_work_day_id,q.policy_id,q.policy_version,p_now);
      update public.m23_comparison_jobs set state='completed',completed_at=clock_timestamp(),
        locked_at=null,safe_failure_reason_code=null,updated_at=clock_timestamp() where id=q.id;
      v_completed:=v_completed+1;
    exception when others then
      update public.m23_comparison_jobs set state=case when attempt_count>=8 then 'failed' else 'pending' end,
        next_attempt_at=p_now+make_interval(secs=>least(300,5*(2^least(attempt_count,6)))::integer),
        locked_at=null,safe_failure_reason_code=case when attempt_count>=8 then 'attempts_exhausted' else 'evaluation_failed' end,
        updated_at=clock_timestamp() where id=q.id;
      v_failed:=v_failed+1;
    end;
  end loop;
  return jsonb_build_object('claimed',v_claimed,'completed',v_completed,'retry_or_failed',v_failed);
end;
$$;

create or replace function public.m23_admin_snapshot_status(p_snapshot_id uuid)
returns text language sql stable security definer set search_path = pg_catalog, public
as $$
  select coalesce(r.status,'not_reviewed') from public.m23_comparison_snapshots s
    left join public.m23_comparison_reviews r on r.snapshot_id=s.id where s.id=p_snapshot_id
$$;

create or replace function public.admin_list_m23_comparisons_v1(
  p_ad_work_id uuid default null, p_from_date date default current_date-31,
  p_to_date date default current_date, p_outcome text default null,
  p_review_status text default null, p_limit integer default 100
) returns jsonb language plpgsql security definer stable set search_path = pg_catalog, public
as $$
declare v_rows jsonb;
begin
  perform public.m20a_require_admin();
  if p_limit not between 1 and 100 or p_from_date is null or p_to_date is null
    or p_to_date<p_from_date or p_to_date-p_from_date>93 then
    raise exception 'Invalid bounded M23 comparison request' using errcode='22023';
  end if;
  if p_outcome is not null and p_outcome not in (
    'not_expected','awaiting_sources','paired_match','isolated_mismatch','sustained_mismatch',
    'phone_missing','physical_device_missing','both_missing','insufficient_pairs','insufficient_quality','comparison_unavailable'
  ) then raise exception 'Invalid M23 comparison outcome' using errcode='22023'; end if;
  if p_review_status is not null and p_review_status not in ('not_reviewed','reviewing','reviewed_consistent','reviewed_needs_follow_up','dismissed_insufficient_evidence')
    then raise exception 'Invalid M23 review status' using errcode='22023'; end if;
  select coalesce(jsonb_agg(row_value order by created_at desc,id),'[]'::jsonb) into v_rows from (
    select s.id,s.created_at,jsonb_build_object(
      'snapshotId',s.id,'adWorkDayId',s.ad_work_day_id,'adWorkId',s.ad_work_id,
      'workLabel',aw.title||' · '||wd.work_date::text,'policyVersion',s.policy_version,
      'pairingAlgorithmVersion',s.pairing_algorithm_version,'sourceExpectation',s.source_expectation,
      'overallOutcome',s.overall_outcome,'reviewStatus',coalesce(rv.status,'not_reviewed'),'finality',s.finality,
      'phoneEligibleCount',s.phone_eligible_count,'physicalEligibleCount',s.physical_eligible_count,
      'pairCount',s.pair_count,'matchCount',s.match_count,'mismatchCandidateCount',s.mismatch_candidate_count,
      'insufficientQualityCount',s.insufficient_quality_count,'unpairedPhoneCount',s.unpaired_phone_count,
      'unpairedPhysicalCount',s.unpaired_physical_count,'sustainedPairCount',s.sustained_pair_count,
      'sustainedFirstPairAt',s.sustained_first_pair_at,'sustainedLastPairAt',s.sustained_last_pair_at,
      'synthetic',s.synthetic,'generatedAt',s.generated_at,'safeReasonCode',s.safe_reason_code,
      'alertId',(select a.id from public.alerts a where a.m23_comparison_snapshot_id=s.id order by a.updated_at desc limit 1)
    ) row_value from public.m23_comparison_snapshots s
    join public.ad_work_days wd on wd.id=s.ad_work_day_id join public.ad_works aw on aw.id=s.ad_work_id
    left join public.m23_comparison_reviews rv on rv.snapshot_id=s.id
    where wd.work_date between p_from_date and p_to_date and s.build_complete
      and (p_ad_work_id is null or s.ad_work_id=p_ad_work_id)
      and (p_outcome is null or s.overall_outcome=p_outcome)
      and (p_review_status is null or coalesce(rv.status,'not_reviewed')=p_review_status)
    order by s.created_at desc,s.id limit p_limit
  ) bounded;
  return jsonb_build_object('contractVersion','m23-admin-v1','rows',v_rows);
end;
$$;

create or replace function public.admin_get_m23_comparison_detail_v1(p_snapshot_id uuid)
returns jsonb language plpgsql security definer stable set search_path = pg_catalog, public
as $$
declare v_result jsonb;
begin
  perform public.m20a_require_admin();
  select jsonb_build_object(
    'contractVersion','m23-admin-v1','comparison',jsonb_build_object(
      'snapshotId',s.id,'adWorkDayId',s.ad_work_day_id,'adWorkId',s.ad_work_id,
      'workLabel',aw.title||' · '||wd.work_date::text,'policyVersion',s.policy_version,
      'pairingAlgorithmVersion',s.pairing_algorithm_version,'sourceExpectation',s.source_expectation,
      'overallOutcome',s.overall_outcome,'reviewStatus',coalesce(rv.status,'not_reviewed'),'finality',s.finality,
      'phoneEligibleCount',s.phone_eligible_count,'physicalEligibleCount',s.physical_eligible_count,
      'pairCount',s.pair_count,'matchCount',s.match_count,'mismatchCandidateCount',s.mismatch_candidate_count,
      'insufficientQualityCount',s.insufficient_quality_count,'unpairedPhoneCount',s.unpaired_phone_count,
      'unpairedPhysicalCount',s.unpaired_physical_count,'sustainedPairCount',s.sustained_pair_count,
      'sustainedFirstPairAt',s.sustained_first_pair_at,'sustainedLastPairAt',s.sustained_last_pair_at,
      'synthetic',s.synthetic,'generatedAt',s.generated_at,'inputWatermark',s.input_watermark,
      'technicalValuesAvailable',exists(select 1 from public.m23_comparison_pairs p where p.snapshot_id=s.id)
    ),
    'reviewHistory',coalesce((select jsonb_agg(jsonb_build_object(
      'id',h.id,'previousStatus',h.previous_status,'newStatus',h.new_status,'reason',h.reason,
      'note',h.note,'createdAt',h.created_at) order by h.created_at desc)
      from public.m23_comparison_review_history h where h.snapshot_id=s.id),'[]'::jsonb),
    'alert', (select jsonb_build_object('id',al.id,'status',al.status,'conditionActive',al.condition_active,
      'firstDetectedAt',al.first_detected_at,'lastDetectedAt',al.last_detected_at,
      'occurrenceCount',al.occurrence_count) from public.alerts al
      where al.m23_comparison_snapshot_id=s.id order by al.updated_at desc limit 1)
  ) into v_result
  from public.m23_comparison_snapshots s join public.ad_work_days wd on wd.id=s.ad_work_day_id
  join public.ad_works aw on aw.id=s.ad_work_id left join public.m23_comparison_reviews rv on rv.snapshot_id=s.id
  where s.id=p_snapshot_id and s.build_complete;
  if v_result is null then raise exception 'M23 comparison not found' using errcode='P0002'; end if;
  return v_result;
end;
$$;

create or replace function public.admin_get_m23_comparison_technical_values_v1(p_snapshot_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_result jsonb;
begin
  return public.admin_get_m23_comparison_technical_values_v1(p_snapshot_id,null,100);
end;
$$;

create or replace function public.admin_transition_m23_comparison_review(
  p_snapshot_id uuid,p_new_status text,p_reason text,p_note text
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_actor uuid:=public.m20a_require_admin(); s public.m23_comparison_snapshots%rowtype;
  v_previous text; v_result jsonb;
begin
  if p_new_status not in ('reviewing','reviewed_consistent','reviewed_needs_follow_up','dismissed_insufficient_evidence')
    or char_length(trim(p_reason)) not between 1 and 160
    or char_length(trim(p_note)) not between 1 and 500
    then raise exception 'Invalid M23 review transition' using errcode='22023'; end if;
  select * into s from public.m23_comparison_snapshots where id=p_snapshot_id and build_complete;
  if s.id is null then raise exception 'M23 comparison not found' using errcode='P0002'; end if;
  select coalesce(status,'not_reviewed') into v_previous from public.m23_comparison_reviews where snapshot_id=p_snapshot_id;
  if v_previous='dismissed_insufficient_evidence' then raise exception 'M23 review is terminal' using errcode='55000'; end if;
  insert into public.m23_comparison_review_history(snapshot_id,previous_status,new_status,actor_admin_id,reason,note)
  values(p_snapshot_id,v_previous,p_new_status,v_actor,trim(p_reason),trim(p_note));
  insert into public.m23_comparison_reviews(snapshot_id,status,updated_by,updated_at)
    values(p_snapshot_id,p_new_status,v_actor,clock_timestamp())
    on conflict(snapshot_id) do update set status=excluded.status,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  insert into public.audit_logs(actor_type,actor_id,action,entity_type,entity_id,safe_details)
  values('admin',v_actor,'m23_comparison_review_transitioned','m23_comparison',p_snapshot_id,
    jsonb_build_object('previous_status',v_previous,'new_status',p_new_status));
  v_result:=jsonb_build_object('contractVersion','m23-admin-v1','snapshotId',p_snapshot_id,'reviewStatus',p_new_status);
  return v_result;
end;
$$;

-- M23 status replaces the M22 placeholder while retaining the M22 bounded
-- Tracking Health contract and source-specific health fields.
create or replace function public.admin_get_m22_tracking_health_v1(
  p_ad_work_id uuid default null,p_from_date date default current_date-6,
  p_to_date date default current_date,p_limit integer default 100,
  p_now timestamptz default clock_timestamp()
) returns jsonb language plpgsql security definer stable set search_path = pg_catalog, public
as $$
declare v_rows jsonb;
begin
  perform public.m20a_require_admin();
  if p_limit not between 1 and 100 or p_from_date is null or p_to_date is null
    or p_to_date<p_from_date or p_to_date-p_from_date>31 or p_now is null
    then raise exception 'Invalid bounded tracking-health request' using errcode='22023'; end if;
  select coalesce(jsonb_agg(row_value order by work_date desc,ad_work_day_id),'[]'::jsonb) into v_rows from (
    select wd.work_date,wd.id ad_work_day_id,jsonb_build_object(
      'adWorkDayId',wd.id,'adWorkId',aw.id,'workLabel',aw.title||' · '||wd.work_date::text,
      'phoneSessionCount',(select count(*) from public.tracking_sessions t where t.ad_work_day_id=wd.id and t.tracking_mode='phone_location'),
      'physicalSessionCount',(select count(*) from public.tracking_sessions t where t.ad_work_day_id=wd.id and t.tracking_mode='physical_device'),
      'phonePointCount',(select count(*) from public.location_points lp join public.tracking_sessions t on t.id=lp.tracking_session_id where t.ad_work_day_id=wd.id and t.tracking_mode='phone_location'),
      'physicalPointCount',(select count(*) from public.location_points lp join public.telemetry_receipts tr on tr.id=lp.telemetry_receipt_id where tr.ad_work_day_id=wd.id),
      'phoneFirstUpdateAt',(select min(lp.recorded_at) from public.location_points lp join public.tracking_sessions t on t.id=lp.tracking_session_id where t.ad_work_day_id=wd.id and t.tracking_mode='phone_location'),
      'phoneLastUpdateAt',(select max(lp.recorded_at) from public.location_points lp join public.tracking_sessions t on t.id=lp.tracking_session_id where t.ad_work_day_id=wd.id and t.tracking_mode='phone_location'),
      'physicalFirstUpdateAt',(select min(lp.recorded_at) from public.location_points lp join public.telemetry_receipts tr on tr.id=lp.telemetry_receipt_id where tr.ad_work_day_id=wd.id),
      'physicalLastUpdateAt',(select max(lp.recorded_at) from public.location_points lp join public.telemetry_receipts tr on tr.id=lp.telemetry_receipt_id where tr.ad_work_day_id=wd.id),
      'latestAcceptedLivePhysicalUpdateAt',(select max(lp.recorded_at) from public.location_points lp join public.telemetry_receipts tr on tr.id=lp.telemetry_receipt_id where tr.ad_work_day_id=wd.id and tr.disposition='accepted_live'),
      'delayedPhysicalCount',(select count(*) from public.telemetry_receipts tr where tr.ad_work_day_id=wd.id and tr.disposition='accepted_delayed'),
      'offlineBackfillCount',(select count(*) from public.telemetry_receipts tr where tr.ad_work_day_id=wd.id and tr.offline_backfill),
      'phoneHealth',coalesce((select t.tracking_health_status from public.tracking_sessions t where t.ad_work_day_id=wd.id and t.tracking_mode='phone_location' order by t.updated_at desc limit 1),'not_available'),
      'physicalHealth',case when wd.gps_device_id is null then 'not_available' when gd.last_heartbeat_at is null then 'no_recent_heartbeat' when gd.last_heartbeat_at>=p_now-interval '2 minutes' then 'healthy' else 'delayed' end,
      'heartbeatAgeSeconds',case when gd.last_heartbeat_at is null then null else greatest(0,extract(epoch from(p_now-gd.last_heartbeat_at))::integer) end,
      'physicalLocationUpdateAgeSeconds',null,
      'activeAlertCount',(select count(*) from public.alerts al where al.ad_work_day_id=wd.id and al.condition_active),
      'highestActiveSeverity',case when exists(select 1 from public.alerts al where al.ad_work_day_id=wd.id and al.condition_active and al.severity='critical') then 'critical' when exists(select 1 from public.alerts al where al.ad_work_day_id=wd.id and al.condition_active and al.severity='warning') then 'warning' when exists(select 1 from public.alerts al where al.ad_work_day_id=wd.id and al.condition_active) then 'info' else null end,
      'latestHealthEpisode',(select jsonb_build_object('alertId',al.id,'ruleId',al.rule_id,'status',al.status,'severity',al.severity,'lastDetectedAt',al.last_detected_at) from public.alerts al where al.ad_work_day_id=wd.id and al.rule_id in ('heartbeat_missing','location_update_missing','device_offline') order by al.last_detected_at desc limit 1),
      'comparisonSnapshotId',(select s.id from public.m23_comparison_snapshots s join public.m23_comparison_heads h on h.snapshot_id=s.id where s.ad_work_day_id=wd.id and s.build_complete order by s.created_at desc limit 1),
      'comparisonStatus',coalesce((select s.overall_outcome from public.m23_comparison_snapshots s join public.m23_comparison_heads h on h.snapshot_id=s.id where s.ad_work_day_id=wd.id and s.build_complete order by s.created_at desc limit 1),case when not coalesce(aw.mobile_location_proof_required,false) and aw.tracking_type::text not in ('device','both') then 'not_expected' else 'not_evaluated' end)
    ) row_value
    from public.ad_work_days wd join public.ad_works aw on aw.id=wd.ad_work_id left join public.gps_devices gd on gd.id=wd.gps_device_id
    where wd.work_date between p_from_date and p_to_date and (p_ad_work_id is null or wd.ad_work_id=p_ad_work_id)
    order by wd.work_date desc,wd.id limit p_limit
  ) bounded;
  return jsonb_build_object('contractVersion','m22-admin-v1','rows',v_rows);
end;
$$;

alter table public.m23_comparison_policies enable row level security;
alter table public.m23_comparison_jobs enable row level security;
alter table public.m23_comparison_heads enable row level security;
alter table public.m23_comparison_snapshots enable row level security;
alter table public.m23_comparison_pairs enable row level security;
alter table public.m23_comparison_reviews enable row level security;
alter table public.m23_comparison_review_history enable row level security;
alter table public.m23_comparison_alert_context enable row level security;
create policy "Admins can read M23 comparison policies" on public.m23_comparison_policies
  for select to authenticated using(public.is_admin());
create policy "Admins can read M23 comparison snapshots" on public.m23_comparison_snapshots
  for select to authenticated using(public.is_admin());
create policy "Admins can read M23 comparison heads" on public.m23_comparison_heads
  for select to authenticated using(public.is_admin());
create policy "Admins can read M23 comparison reviews" on public.m23_comparison_reviews
  for select to authenticated using(public.is_admin());
create policy "Admins can read M23 review history" on public.m23_comparison_review_history
  for select to authenticated using(public.is_admin());

revoke all on public.m23_comparison_policies,public.m23_comparison_jobs,
  public.m23_comparison_heads,public.m23_comparison_snapshots,public.m23_comparison_pairs,
  public.m23_comparison_reviews,public.m23_comparison_review_history,
  public.m23_comparison_alert_context from public,anon,authenticated;
grant select on public.m23_comparison_policies,public.m23_comparison_snapshots,
  public.m23_comparison_heads,public.m23_comparison_reviews,
  public.m23_comparison_review_history to authenticated;

revoke all on function public.m23_policy_at(timestamptz) from public,anon,authenticated;
revoke all on function public.m23_enqueue_comparison_job(uuid) from public,anon,authenticated;
revoke all on function public.m23_evaluate_scope(uuid,uuid,uuid,uuid,uuid,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.m23_evaluate_work_day(uuid,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.m23_process_comparison_queue(integer,timestamptz) from public,anon,authenticated;
revoke all on function public.m23_sync_mismatch_alert(uuid,text,numeric,public.m23_comparison_policies) from public,anon,authenticated;
revoke all on function public.m23_pair_identity(uuid,uuid,text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.m23_admin_snapshot_status(uuid) from public,anon,authenticated;
revoke all on function public.m23_enqueue_location_point() from public,anon,authenticated;
revoke all on function public.m23_protect_snapshot() from public,anon,authenticated;
revoke all on function public.m23_protect_pair() from public,anon,authenticated;
revoke all on function public.m23_enqueue_comparison_job(uuid) from public,anon,authenticated;
grant execute on function public.m23_process_comparison_queue(integer,timestamptz) to service_role;

revoke all on function public.admin_list_m23_comparisons_v1(uuid,date,date,text,text,integer) from public,anon,authenticated;
revoke all on function public.admin_get_m23_comparison_detail_v1(uuid) from public,anon,authenticated;
revoke all on function public.admin_get_m23_comparison_technical_values_v1(uuid) from public,anon,authenticated;
revoke all on function public.admin_transition_m23_comparison_review(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.admin_list_m23_comparisons_v1(uuid,date,date,text,text,integer) to authenticated;
grant execute on function public.admin_get_m23_comparison_detail_v1(uuid) to authenticated;
grant execute on function public.admin_get_m23_comparison_technical_values_v1(uuid) to authenticated;
grant execute on function public.admin_transition_m23_comparison_review(uuid,text,text,text) to authenticated;

comment on table public.m23_comparison_policies is
  'Effective-dated typed M23 provisional comparison policies; not AP production-policy approval.';
comment on table public.m23_comparison_snapshots is
  'Immutable, versioned admin-only phone/device comparison evidence. Coordinates remain in source point tables.';
comment on table public.m23_comparison_pairs is
  'Immutable one-to-one pair evidence with accuracy-aware derived values and no copied coordinates.';

create or replace function public.run_data_retention(p_deleted_proof_ids uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_enquiries integer:=0; v_location_points integer:=0; v_proofs integer:=0;
  v_summaries integer:=0; v_audit integer:=0; v_result jsonb;
begin
  delete from public.enquiries where status in ('rejected','not_interested','invalid_spam')
    and created_at<clock_timestamp()-interval '180 days'; get diagnostics v_enquiries=row_count;
  delete from public.location_points lp using public.tracking_sessions ts,public.ad_work_days awd,public.ad_works aw
    where lp.tracking_session_id=ts.id and ts.ad_work_day_id=awd.id and awd.ad_work_id=aw.id
      and aw.closure_closed_at<clock_timestamp()-interval '90 days'
      and not exists(select 1 from public.m23_comparison_pairs cp
        where cp.phone_point_id=lp.id or cp.physical_point_id=lp.id);
  get diagnostics v_location_points=row_count;
  delete from public.proof_uploads where id=any(coalesce(p_deleted_proof_ids,'{}')); get diagnostics v_proofs=row_count;
  delete from public.final_proof_summaries fps using public.ad_works aw where fps.ad_work_id=aw.id
    and aw.closure_closed_at<clock_timestamp()-interval '12 months'; get diagnostics v_summaries=row_count;
  delete from public.audit_logs where created_at<clock_timestamp()-interval '12 months'
    and entity_type not in ('m23_comparison','alert'); get diagnostics v_audit=row_count;
  v_result:=jsonb_build_object('enquiries',v_enquiries,'location_points',v_location_points,
    'proof_uploads',v_proofs,'final_summaries',v_summaries,'audit_logs',v_audit);
  insert into public.data_retention_runs(result_status,safe_counts) values('completed',v_result);
  return v_result;
end;
$$;
revoke all on function public.run_data_retention(uuid[]) from public,anon,authenticated;
grant execute on function public.run_data_retention(uuid[]) to service_role;

-- M23 correction block.  The migration is still unmerged, so these definitions
-- intentionally replace the draft implementation in-place rather than adding
-- a second corrective migration.

alter table public.m23_comparison_jobs
  add column if not exists requested_generation bigint not null default 1,
  add column if not exists processing_generation bigint not null default 0,
  add column if not exists completed_generation bigint not null default 0,
  add column if not exists dirty_after_claim boolean not null default false;

-- A singleton cursor makes repeated bounded due sweeps fair.  It is only a
-- scheduling cursor: it carries no source data and is never exposed through
-- the Data API.
create table if not exists public.m23_due_sweep_state (
  id boolean primary key default true check (id),
  cursor_ad_work_day_id uuid,
  cursor_policy_id text,
  cursor_policy_version text,
  cursor_job_id uuid,
  updated_at timestamptz not null default clock_timestamp()
);
insert into public.m23_due_sweep_state(id)
values(true) on conflict(id) do nothing;
alter table public.m23_due_sweep_state enable row level security;
revoke all on public.m23_due_sweep_state from public, anon, authenticated;
create index if not exists m23_job_due_fair_idx
  on public.m23_comparison_jobs(ad_work_day_id,policy_id,policy_version,id)
  where state='completed';

alter table public.m23_comparison_snapshots
  add column if not exists acceptable_pair_count integer not null default 0,
  add column if not exists evaluation_phase text not null default 'active_work',
  add column if not exists scope_effective_from timestamptz,
  add column if not exists scope_effective_until timestamptz,
  add column if not exists safe_reason_code text;

alter table public.m23_comparison_snapshots
  add constraint m23_snapshot_safe_reason_check check (
    safe_reason_code is null or safe_reason_code ~ '^[a-z0-9_]{1,64}$'
  );

alter table public.m23_comparison_snapshots
  drop constraint if exists m23_snapshot_counts_check,
  add constraint m23_snapshot_counts_check check (
    phone_eligible_count >= 0 and physical_eligible_count >= 0 and pair_count >= 0
    and acceptable_pair_count >= 0 and match_count >= 0 and mismatch_candidate_count >= 0
    and insufficient_quality_count >= 0 and unpaired_phone_count >= 0
    and unpaired_physical_count >= 0 and sustained_pair_count >= 0
    and pair_count = acceptable_pair_count + insufficient_quality_count
    and acceptable_pair_count = match_count + mismatch_candidate_count
  ),
  add constraint m23_snapshot_phase_check check (
    evaluation_phase in ('active_work','backfill_open','backfill_closed')
  );

create table public.m23_comparison_pair_evidence (
  id uuid primary key default gen_random_uuid(),
  first_snapshot_id uuid not null references public.m23_comparison_snapshots(id) on delete restrict,
  authority_scope_key text not null,
  policy_id text not null,
  policy_version text not null,
  pair_identity text not null,
  phone_point_id uuid not null references public.location_points(id) on delete restrict,
  physical_point_id uuid not null references public.location_points(id) on delete restrict,
  phone_captured_at timestamptz not null,
  physical_captured_at timestamptz not null,
  time_difference_milliseconds bigint not null,
  raw_haversine_distance_meters numeric,
  phone_accuracy_meters numeric,
  physical_device_accuracy_meters numeric,
  conservative_separation_meters numeric,
  quality text not null,
  outcome text not null,
  synthetic boolean not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (authority_scope_key, policy_id, policy_version, pair_identity),
  constraint m23_pair_evidence_hash_check check (
    authority_scope_key ~ '^[0-9a-f]{64}$' and pair_identity ~ '^[0-9a-f]{64}$'
  ),
  constraint m23_pair_evidence_quality_check check (quality in ('acceptable','insufficient_quality')),
  constraint m23_pair_evidence_outcome_check check (outcome in ('match','mismatch_candidate','insufficient_quality')),
  constraint m23_pair_evidence_quality_outcome_check check (
    (quality = 'acceptable' and outcome in ('match','mismatch_candidate'))
    or (quality = 'insufficient_quality' and outcome = 'insufficient_quality')
  )
);
create index m23_pair_evidence_scope_time_idx
  on public.m23_comparison_pair_evidence(authority_scope_key, policy_id, policy_version,
    phone_captured_at, physical_captured_at, id);
create index m23_pair_evidence_points_idx
  on public.m23_comparison_pair_evidence(phone_point_id, physical_point_id);
create index m23_pair_evidence_phone_scope_idx
  on public.m23_comparison_pair_evidence(authority_scope_key,policy_id,policy_version,phone_point_id);
create index m23_pair_evidence_physical_scope_idx
  on public.m23_comparison_pair_evidence(authority_scope_key,policy_id,policy_version,physical_point_id);
create index m23_phone_scope_time_idx
  on public.location_points(ad_work_day_id,source,assignment_history_id,recorded_at,synthetic,id)
  where source='phone';
create index m23_physical_scope_time_idx
  on public.location_points(ad_work_day_id,source,execution_history_id,assignment_history_id,
    gps_device_vehicle_link_id,device_id,recorded_at,synthetic,id)
  where source='physical_device';

alter table public.m23_comparison_pair_evidence enable row level security;
revoke all on public.m23_comparison_pair_evidence from public, anon, authenticated;

create or replace function public.m23_pair_evidence_immutable()
returns trigger language plpgsql set search_path = pg_catalog, public
as $$
begin
  if tg_op='DELETE' and current_setting('app.m23_compaction',true)='on' then
    return old;
  end if;
  raise exception 'M23 comparison pair evidence is immutable' using errcode='55000';
end;
$$;
create trigger m23_pair_evidence_immutable before update or delete
  on public.m23_comparison_pair_evidence for each row
  execute function public.m23_pair_evidence_immutable();

create or replace function public.m23_enqueue_comparison_job(p_ad_work_day_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public
as $$
declare p public.m23_comparison_policies%rowtype; w public.ad_work_days%rowtype;
begin
  if p_ad_work_day_id is null then return; end if;
  select * into w from public.ad_work_days where id=p_ad_work_day_id;
  if w.id is null then return; end if;
  p := public.m23_policy_at(clock_timestamp());
  if p.policy_id is null then return; end if;
  insert into public.m23_comparison_jobs(
    ad_work_day_id,ad_work_id,policy_id,policy_version,requested_generation
  ) values(w.id,w.ad_work_id,p.policy_id,p.policy_version,1)
  on conflict(ad_work_day_id,policy_id,policy_version) do update set
    requested_generation=public.m23_comparison_jobs.requested_generation+1,
    dirty_after_claim=case when public.m23_comparison_jobs.state='processing' then true else public.m23_comparison_jobs.dirty_after_claim end,
    state=case
      when public.m23_comparison_jobs.state='processing' then 'processing'
      else 'pending' end,
    attempt_count=case when public.m23_comparison_jobs.state='failed' then 0 else public.m23_comparison_jobs.attempt_count end,
    next_attempt_at=clock_timestamp(),
    completed_at=case when public.m23_comparison_jobs.state in ('completed','failed') then null else public.m23_comparison_jobs.completed_at end,
    safe_failure_reason_code=case when public.m23_comparison_jobs.state='failed' then null else public.m23_comparison_jobs.safe_failure_reason_code end,
    updated_at=clock_timestamp();
end;
$$;

create or replace function public.m23_enqueue_authority_change()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_day uuid;
begin
  if tg_table_name='m21_execution_history' then
    perform public.m23_enqueue_comparison_job(new.ad_work_day_id);
  elsif tg_table_name='m21_assignment_history' then
    for v_day in select id from public.ad_work_days where ad_work_id=new.ad_work_id
    loop perform public.m23_enqueue_comparison_job(v_day); end loop;
  elsif tg_table_name='m21_release_history' then
    for v_day in select id from public.ad_work_days where ad_work_id=new.ad_work_id
    loop perform public.m23_enqueue_comparison_job(v_day); end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists m23_assignment_authority_enqueue on public.m21_assignment_history;
create trigger m23_assignment_authority_enqueue after insert or update on public.m21_assignment_history
for each row execute function public.m23_enqueue_authority_change();
drop trigger if exists m23_release_authority_enqueue on public.m21_release_history;
create trigger m23_release_authority_enqueue after insert or update on public.m21_release_history
for each row execute function public.m23_enqueue_authority_change();
drop trigger if exists m23_execution_authority_enqueue on public.m21_execution_history;
create trigger m23_execution_authority_enqueue after insert or update on public.m21_execution_history
for each row execute function public.m23_enqueue_authority_change();

create or replace function public.m23_enqueue_link_authority_change()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_day uuid;
  v_vehicle_id uuid;
  v_link_from timestamptz;
  v_link_until timestamptz;
begin
  -- M20A closes old links and inserts replacement links in one transaction.
  -- Enqueue only work days whose assignment and execution histories could
  -- intersect the changed vehicle-link interval; no source values are copied.
  for v_vehicle_id, v_link_from, v_link_until in
    select x.vehicle_id, x.effective_from, x.effective_until
    from (select new.vehicle_id, new.effective_from, new.effective_until
          where tg_op <> 'DELETE'
          union all
          select old.vehicle_id, old.effective_from, old.effective_until
          where tg_op <> 'INSERT') x
  loop
    for v_day in
      select distinct wd.id
      from public.ad_work_days wd
      join public.m21_assignment_history ah on ah.ad_work_id=wd.ad_work_id
        and ah.vehicle_id=v_vehicle_id
        and ah.effective_from<coalesce(v_link_until,'infinity'::timestamptz)
        and coalesce(ah.effective_until,'infinity'::timestamptz)>v_link_from
      join public.m21_execution_history eh on eh.ad_work_day_id=wd.id
        and eh.effective_from<coalesce(v_link_until,'infinity'::timestamptz)
        and coalesce(eh.effective_until,'infinity'::timestamptz)>v_link_from
    loop
      perform public.m23_enqueue_comparison_job(v_day);
    end loop;
  end loop;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
drop trigger if exists m23_link_authority_enqueue on public.gps_device_vehicle_links;
create trigger m23_link_authority_enqueue after insert or update of gps_device_id,vehicle_id,is_primary,effective_from,effective_until
on public.gps_device_vehicle_links for each row execute function public.m23_enqueue_link_authority_change();

create or replace function public.m23_point_in_session_scope(
  p_recorded_at timestamptz,p_started_at timestamptz,p_ended_at timestamptz,
  p_scope_until timestamptz,p_allow_end_boundary boolean
) returns boolean language sql immutable set search_path = pg_catalog
as $$
  select (p_started_at is null or p_recorded_at>=p_started_at)
    and (p_ended_at is null or p_recorded_at<p_ended_at
      or (coalesce(p_allow_end_boundary,false)
        and p_scope_until is not null
        and p_recorded_at=p_ended_at
        and p_recorded_at=p_scope_until));
$$;
revoke all on function public.m23_point_in_session_scope(timestamptz,timestamptz,timestamptz,timestamptz,boolean)
  from public,anon,authenticated;

create or replace function public.m23_pair_scope_exact(
  p_work_day_id uuid,p_execution_history_id uuid,p_assignment_history_id uuid,
  p_link_id uuid,p_device_id uuid,p_policy_id text,p_policy_version text,
  p_scope_key text,p_scope_from timestamptz,p_scope_until timestamptz,p_snapshot_id uuid,
  p_allow_end_boundary boolean,p_now timestamptz
) returns void language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  w public.ad_work_days%rowtype; e public.m21_execution_history%rowtype;
  ah public.m21_assignment_history%rowtype; p public.m23_comparison_policies%rowtype;
  v_phone_count integer:=0; v_physical_count integer:=0;
  v_fast_pair_count integer:=0; v_fast_path_used boolean:=false;
  v_allow_end_boundary boolean:=p_allow_end_boundary;
begin
  select * into strict w from public.ad_work_days where id=p_work_day_id;
  select * into strict e from public.m21_execution_history where id=p_execution_history_id;
  select * into strict ah from public.m21_assignment_history where id=p_assignment_history_id;
  select * into strict p from public.m23_comparison_policies
    where policy_id=p_policy_id and policy_version=p_policy_version;
  select count(*)::integer into v_phone_count
  from public.location_points lp join public.tracking_sessions ts on ts.id=lp.tracking_session_id
  where lp.ad_work_day_id=w.id and lp.source::text='phone'
    and ts.tracking_mode='phone_location' and lp.assignment_history_id=ah.id
    and lp.driver_id=ah.driver_id and lp.vehicle_id=ah.vehicle_id
    and lp.recorded_at>=p_scope_from and lp.recorded_at<=p_now
    and (p_scope_until is null or lp.recorded_at<p_scope_until
      or (v_allow_end_boundary and lp.recorded_at=p_scope_until))
    and public.m23_point_in_session_scope(lp.recorded_at,ts.started_at,ts.ended_at,
      p_scope_until,v_allow_end_boundary);
  select count(*)::integer into v_physical_count
  from public.location_points q join public.tracking_sessions ts on ts.id=q.tracking_session_id
    join public.telemetry_receipts tr on tr.id=q.telemetry_receipt_id
  where q.ad_work_day_id=w.id and q.source::text='physical_device'
    and ts.tracking_mode='physical_device' and q.execution_history_id=e.id
    and q.assignment_history_id=ah.id and q.gps_device_vehicle_link_id=p_link_id
    and q.device_id=p_device_id
    and tr.disposition in ('accepted_live','accepted_delayed') and tr.quality in ('valid','degraded')
    and q.recorded_at>=p_scope_from and q.recorded_at<=p_now
    and (p_scope_until is null or q.recorded_at<p_scope_until
      or (v_allow_end_boundary and q.recorded_at=p_scope_until))
    and public.m23_point_in_session_scope(q.recorded_at,ts.started_at,ts.ended_at,
      p_scope_until,v_allow_end_boundary);

  -- An ordinal path is used only when its nearest-candidate proof agrees with
  -- the complete m23-pairing-v1 greedy order.  Otherwise the exact recursive
  -- path below performs the same ordered one-to-one selection.
  select count(*) filter(where candidate_rank=1 and phone_seq=physical_seq)::integer
    into v_fast_pair_count
  from (
    with phone_points as (
      select lp.id,lp.recorded_at,lp.synthetic,
        row_number() over(order by lp.recorded_at,lp.id) seq
      from public.location_points lp join public.tracking_sessions ts on ts.id=lp.tracking_session_id
      where lp.ad_work_day_id=w.id and lp.source::text='phone'
        and ts.tracking_mode='phone_location' and lp.assignment_history_id=ah.id
        and lp.driver_id=ah.driver_id and lp.vehicle_id=ah.vehicle_id
        and lp.recorded_at>=p_scope_from and lp.recorded_at<=p_now
        and (p_scope_until is null or lp.recorded_at<p_scope_until
          or (v_allow_end_boundary and lp.recorded_at=p_scope_until))
        and public.m23_point_in_session_scope(lp.recorded_at,ts.started_at,ts.ended_at,
          p_scope_until,v_allow_end_boundary)
    ), physical_points as (
      select q.id,q.recorded_at,q.synthetic,
        row_number() over(order by q.recorded_at,q.id) seq
      from public.location_points q join public.tracking_sessions ts on ts.id=q.tracking_session_id
        join public.telemetry_receipts tr on tr.id=q.telemetry_receipt_id
      where q.ad_work_day_id=w.id and q.source::text='physical_device'
        and ts.tracking_mode='physical_device' and q.execution_history_id=e.id
        and q.assignment_history_id=ah.id and q.gps_device_vehicle_link_id=p_link_id
        and q.device_id=p_device_id
        and tr.disposition in ('accepted_live','accepted_delayed') and tr.quality in ('valid','degraded')
        and q.recorded_at>=p_scope_from and q.recorded_at<=p_now
        and (p_scope_until is null or q.recorded_at<p_scope_until
          or (v_allow_end_boundary and q.recorded_at=p_scope_until))
        and public.m23_point_in_session_scope(q.recorded_at,ts.started_at,ts.ended_at,
          p_scope_until,v_allow_end_boundary)
    )
    select ph.seq phone_seq,q.seq physical_seq,
      row_number() over(partition by ph.id order by
        abs(extract(epoch from(q.recorded_at-ph.recorded_at))),q.recorded_at,q.id) candidate_rank
    from phone_points ph join physical_points q on q.synthetic=ph.synthetic
      and q.recorded_at between ph.recorded_at-make_interval(secs=>p.pair_window_seconds)
        and ph.recorded_at+make_interval(secs=>p.pair_window_seconds)
  ) proof;
  v_fast_path_used:=v_phone_count=v_physical_count and v_phone_count>0
    and v_fast_pair_count=v_phone_count;

  if v_fast_path_used then
    insert into public.m23_comparison_pairs(
      snapshot_id,pair_identity,phone_point_id,physical_point_id,phone_captured_at,
      physical_captured_at,time_difference_milliseconds,raw_haversine_distance_meters,
      phone_accuracy_meters,physical_device_accuracy_meters,conservative_separation_meters,
      quality,outcome,synthetic
    )
    with phone_points as (
      select lp.id,lp.recorded_at,lp.accuracy_meters,lp.lat,lp.lng,lp.synthetic,
        row_number() over(order by lp.recorded_at,lp.id) seq
      from public.location_points lp join public.tracking_sessions ts on ts.id=lp.tracking_session_id
      where lp.ad_work_day_id=w.id and lp.source::text='phone'
        and ts.tracking_mode='phone_location' and lp.assignment_history_id=ah.id
        and lp.driver_id=ah.driver_id and lp.vehicle_id=ah.vehicle_id
        and lp.recorded_at>=p_scope_from and lp.recorded_at<=p_now
        and (p_scope_until is null or lp.recorded_at<p_scope_until
          or (v_allow_end_boundary and lp.recorded_at=p_scope_until))
        and public.m23_point_in_session_scope(lp.recorded_at,ts.started_at,ts.ended_at,
          p_scope_until,v_allow_end_boundary)
    ), physical_points as (
      select q.id,q.recorded_at,q.accuracy_meters,q.lat,q.lng,q.synthetic,
        row_number() over(order by q.recorded_at,q.id) seq
      from public.location_points q join public.tracking_sessions ts on ts.id=q.tracking_session_id
        join public.telemetry_receipts tr on tr.id=q.telemetry_receipt_id
      where q.ad_work_day_id=w.id and q.source::text='physical_device'
        and ts.tracking_mode='physical_device' and q.execution_history_id=e.id
        and q.assignment_history_id=ah.id and q.gps_device_vehicle_link_id=p_link_id
        and q.device_id=p_device_id
        and tr.disposition in ('accepted_live','accepted_delayed') and tr.quality in ('valid','degraded')
        and q.recorded_at>=p_scope_from and q.recorded_at<=p_now
        and (p_scope_until is null or q.recorded_at<p_scope_until
          or (v_allow_end_boundary and q.recorded_at=p_scope_until))
        and public.m23_point_in_session_scope(q.recorded_at,ts.started_at,ts.ended_at,
          p_scope_until,v_allow_end_boundary)
    ), measured as (
      select ph.*,q.id physical_point_id,q.recorded_at physical_captured_at,
        q.accuracy_meters physical_accuracy,
        case when ph.lat=q.lat and ph.lng=q.lng then 0
          else public.m22_distance_m(ph.lat,ph.lng,q.lat,q.lng) end raw_distance
      from phone_points ph join physical_points q on q.seq=ph.seq and q.synthetic=ph.synthetic
    ), classified as (
      select m.*,case when m.accuracy_meters is not null and m.physical_accuracy is not null
        and m.accuracy_meters::text<>'NaN' and m.physical_accuracy::text<>'NaN'
        and m.accuracy_meters between 0 and p.maximum_phone_accuracy_meters
        and m.physical_accuracy between 0 and p.maximum_physical_accuracy_meters
        then 'acceptable' else 'insufficient_quality' end quality
      from measured m
    )
    select p_snapshot_id,public.m23_pair_identity(w.id,e.id,p.policy_version,z.id,z.physical_point_id),
      z.id,z.physical_point_id,z.recorded_at,z.physical_captured_at,
      abs(extract(epoch from(z.physical_captured_at-z.recorded_at))*1000)::bigint,
      case when z.quality='acceptable' then z.raw_distance end,z.accuracy_meters,z.physical_accuracy,
      case when z.quality='acceptable' then greatest(0,z.raw_distance-z.accuracy_meters-z.physical_accuracy) end,
      z.quality,
      case when z.quality='insufficient_quality' then 'insufficient_quality'
        when greatest(0,z.raw_distance-z.accuracy_meters-z.physical_accuracy)>
          p.sustained_mismatch_distance_meters then 'mismatch_candidate' else 'match' end,
      z.synthetic
    from classified z;
  else
    insert into public.m23_comparison_pairs(
      snapshot_id,pair_identity,phone_point_id,physical_point_id,phone_captured_at,
      physical_captured_at,time_difference_milliseconds,raw_haversine_distance_meters,
      phone_accuracy_meters,physical_device_accuracy_meters,conservative_separation_meters,
      quality,outcome,synthetic
    )
    with recursive phone_points as (
      select lp.id,lp.recorded_at,lp.accuracy_meters,lp.lat,lp.lng,lp.synthetic,
        row_number() over(order by lp.recorded_at,lp.id) seq
      from public.location_points lp join public.tracking_sessions ts on ts.id=lp.tracking_session_id
      where lp.ad_work_day_id=w.id and lp.source::text='phone'
        and ts.tracking_mode='phone_location' and lp.assignment_history_id=ah.id
        and lp.driver_id=ah.driver_id and lp.vehicle_id=ah.vehicle_id
        and lp.recorded_at>=p_scope_from and lp.recorded_at<=p_now
        and (p_scope_until is null or lp.recorded_at<p_scope_until
          or (v_allow_end_boundary and lp.recorded_at=p_scope_until))
        and public.m23_point_in_session_scope(lp.recorded_at,ts.started_at,ts.ended_at,
          p_scope_until,v_allow_end_boundary)
    ), physical_points as (
      select q.id,q.recorded_at,q.accuracy_meters,q.lat,q.lng,q.synthetic
      from public.location_points q join public.tracking_sessions ts on ts.id=q.tracking_session_id
        join public.telemetry_receipts tr on tr.id=q.telemetry_receipt_id
      where q.ad_work_day_id=w.id and q.source::text='physical_device'
        and ts.tracking_mode='physical_device' and q.execution_history_id=e.id
        and q.assignment_history_id=ah.id and q.gps_device_vehicle_link_id=p_link_id
        and q.device_id=p_device_id
        and tr.disposition in ('accepted_live','accepted_delayed') and tr.quality in ('valid','degraded')
        and q.recorded_at>=p_scope_from and q.recorded_at<=p_now
        and (p_scope_until is null or q.recorded_at<p_scope_until
          or (v_allow_end_boundary and q.recorded_at=p_scope_until))
        and public.m23_point_in_session_scope(q.recorded_at,ts.started_at,ts.ended_at,
          p_scope_until,v_allow_end_boundary)
    ), greedy(seq,phone_point_id,physical_point_id,used_physical_ids) as (
      select ph.seq,ph.id,choice.id,
        case when choice.id is null then array[]::uuid[] else array[choice.id] end
      from phone_points ph
      left join lateral (
        select q.id from physical_points q
        where q.synthetic=ph.synthetic
          and q.recorded_at between ph.recorded_at-make_interval(secs=>p.pair_window_seconds)
            and ph.recorded_at+make_interval(secs=>p.pair_window_seconds)
        order by abs(extract(epoch from(q.recorded_at-ph.recorded_at))),q.recorded_at,q.id limit 1
      ) choice on true
      where ph.seq=1
      union all
      select ph.seq,ph.id,choice.id,
        case when choice.id is null then g.used_physical_ids else g.used_physical_ids || choice.id end
      from greedy g join phone_points ph on ph.seq=g.seq+1
      left join lateral (
        select q.id from physical_points q
        where q.synthetic=ph.synthetic and not (q.id=any(g.used_physical_ids))
          and q.recorded_at between ph.recorded_at-make_interval(secs=>p.pair_window_seconds)
            and ph.recorded_at+make_interval(secs=>p.pair_window_seconds)
        order by abs(extract(epoch from(q.recorded_at-ph.recorded_at))),q.recorded_at,q.id limit 1
      ) choice on true
    ), measured as (
      select ph.*,q.id physical_point_id,q.recorded_at physical_captured_at,
        q.accuracy_meters physical_accuracy,
        case when ph.lat=q.lat and ph.lng=q.lng then 0
          else public.m22_distance_m(ph.lat,ph.lng,q.lat,q.lng) end raw_distance
      from greedy g join phone_points ph on ph.id=g.phone_point_id
        join physical_points q on q.id=g.physical_point_id
      where g.physical_point_id is not null
    ), classified as (
      select m.*,case when m.accuracy_meters is not null and m.physical_accuracy is not null
        and m.accuracy_meters::text<>'NaN' and m.physical_accuracy::text<>'NaN'
        and m.accuracy_meters between 0 and p.maximum_phone_accuracy_meters
        and m.physical_accuracy between 0 and p.maximum_physical_accuracy_meters
        then 'acceptable' else 'insufficient_quality' end quality
      from measured m
    )
    select p_snapshot_id,public.m23_pair_identity(w.id,e.id,p.policy_version,z.id,z.physical_point_id),
      z.id,z.physical_point_id,z.recorded_at,z.physical_captured_at,
      abs(extract(epoch from(z.physical_captured_at-z.recorded_at))*1000)::bigint,
      case when z.quality='acceptable' then z.raw_distance end,z.accuracy_meters,z.physical_accuracy,
      case when z.quality='acceptable' then greatest(0,z.raw_distance-z.accuracy_meters-z.physical_accuracy) end,
      z.quality,
      case when z.quality='insufficient_quality' then 'insufficient_quality'
        when greatest(0,z.raw_distance-z.accuracy_meters-z.physical_accuracy)>
          p.sustained_mismatch_distance_meters then 'mismatch_candidate' else 'match' end,
      z.synthetic
    from classified z;
  end if;

  -- The evidence cache is reusable measurement data for selected pairs only;
  -- it never controls a later snapshot's selection.
  insert into public.m23_comparison_pair_evidence(
    first_snapshot_id,authority_scope_key,policy_id,policy_version,pair_identity,
    phone_point_id,physical_point_id,phone_captured_at,physical_captured_at,
    time_difference_milliseconds,raw_haversine_distance_meters,phone_accuracy_meters,
    physical_device_accuracy_meters,conservative_separation_meters,quality,outcome,synthetic
  )
  select p_snapshot_id,p_scope_key,p.policy_id,p.policy_version,cp.pair_identity,
    cp.phone_point_id,cp.physical_point_id,cp.phone_captured_at,cp.physical_captured_at,
    cp.time_difference_milliseconds,cp.raw_haversine_distance_meters,cp.phone_accuracy_meters,
    cp.physical_device_accuracy_meters,cp.conservative_separation_meters,cp.quality,cp.outcome,cp.synthetic
  from public.m23_comparison_pairs cp
  where cp.snapshot_id=p_snapshot_id
  on conflict(authority_scope_key,policy_id,policy_version,pair_identity) do nothing;
end;
$$;
revoke all on function public.m23_pair_scope_exact(uuid,uuid,uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,uuid,boolean,timestamptz) from public,anon,authenticated;

create or replace function public.m23_evaluate_scope_authority(
  p_ad_work_day_id uuid,
  p_execution_history_id uuid,
  p_assignment_history_id uuid,
  p_gps_device_vehicle_link_id uuid,
  p_gps_device_id uuid,
  p_release_history_id uuid,
  p_policy_id text,
  p_policy_version text,
  p_now timestamptz,
  p_gap_category text,
  p_gap_effective_from timestamptz,
  p_gap_effective_until timestamptz
) returns uuid language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  w public.ad_work_days%rowtype; a public.ad_works%rowtype;
  e public.m21_execution_history%rowtype; ah public.m21_assignment_history%rowtype;
  l public.gps_device_vehicle_links%rowtype; rh public.m21_release_history%rowtype;
  p public.m23_comparison_policies%rowtype; s public.m23_comparison_snapshots%rowtype;
  phone record; physical record; cached record; v_existing uuid;
  v_phone_count integer:=0; v_physical_count integer:=0; v_pair_count integer:=0;
  v_acceptable_count integer:=0; v_match_count integer:=0; v_mismatch_count integer:=0;
  v_quality_count integer:=0; v_unpaired_phone integer:=0; v_unpaired_physical integer:=0;
  v_sustained_count integer:=0; v_first timestamptz; v_last timestamptz;
  v_min numeric; v_max numeric; v_watermark timestamptz; v_input_hash text;
  v_scope_key text; v_expectation text; v_phase text; v_finality text;
  v_phone_expected boolean:=false; v_physical_expected boolean:=false; v_ambiguous boolean:=false;
  v_grace_elapsed boolean:=false; v_synthetic boolean:=false; v_outcome text;
  v_safe_reason text; v_mixed boolean:=false; v_allow_end_boundary boolean:=false;
  v_gap_category text; v_gap_start timestamptz; v_gap_end timestamptz;
  v_current_execution_active boolean:=false; v_current_authority_count integer:=0;
  v_phone_synthetic_count integer:=0; v_phone_non_synthetic_count integer:=0;
  v_physical_synthetic_count integer:=0; v_physical_non_synthetic_count integer:=0;
  v_scope_from timestamptz; v_scope_until timestamptz; v_work_end timestamptz;
  v_raw numeric; v_conservative numeric; v_quality text; v_pair_outcome text;
  v_link_count integer:=0; v_current_release_count integer:=0; v_current_link_count integer:=0;
  v_fast_pair_count integer:=0;
  v_fast_path_used boolean:=false;
  v_current boolean:=false; v_current_first timestamptz; v_current_last timestamptz;
  v_current_count integer:=0; v_current_min numeric; v_current_max numeric; v_current_first_id text;
  v_best boolean:=false; v_best_first timestamptz; v_best_last timestamptz; v_best_count integer:=0;
  v_best_min numeric; v_best_max numeric; v_best_first_id text; v_pair_time timestamptz;
begin
  select * into strict w from public.ad_work_days where id=p_ad_work_day_id;
  select * into strict a from public.ad_works where id=w.ad_work_id;
  select * into strict e from public.m21_execution_history where id=p_execution_history_id;
  select * into p from public.m23_comparison_policies
    where policy_id=p_policy_id and policy_version=p_policy_version;
  if p.policy_id is null then raise exception 'M23 comparison policy not found' using errcode='P0002'; end if;
  -- A non-running history row is never an active comparison scope.  The ended
  -- running row is reevaluated to close its grace/backfill phases.
  if e.execution_status <> 'running' then return null; end if;
  if p_gap_category is not null then
    if p_gap_effective_from is null
      or (p_gap_effective_until is not null and p_gap_effective_until<=p_gap_effective_from)
    then raise exception 'Invalid M23 authority gap interval' using errcode='22023'; end if;
    v_gap_category:=p_gap_category;
    v_gap_start:=p_gap_effective_from;
    v_gap_end:=p_gap_effective_until;
    v_ambiguous:=true;
    v_safe_reason:=p_gap_category;
  end if;
  v_current_execution_active:=e.effective_until is null or p_now<e.effective_until;
  if p_assignment_history_id is not null then
    select * into ah from public.m21_assignment_history x
    where x.id=p_assignment_history_id and x.ad_work_id=a.id
      and x.assignment_status in ('assigned','ready_for_execution')
      and x.effective_from<=p_now
      and x.effective_from<coalesce(e.effective_until,'infinity'::timestamptz)
      and (x.effective_until is null or e.effective_from<x.effective_until);
    if not found then
      v_ambiguous:=true; v_safe_reason:='inactive_assignment';
    end if;
  end if;
  if p_gps_device_vehicle_link_id is not null then
    select * into l from public.gps_device_vehicle_links x
    where x.id=p_gps_device_vehicle_link_id and x.effective_from<=p_now
      and x.effective_from<coalesce(e.effective_until,'infinity'::timestamptz)
      and (x.effective_until is null or e.effective_from<x.effective_until)
      and (ah.id is null or (x.effective_from<coalesce(ah.effective_until,'infinity'::timestamptz)
        and coalesce(x.effective_until,'infinity'::timestamptz)>ah.effective_from))
      and (ah.id is null or x.vehicle_id=ah.vehicle_id);
    if not found then
      v_ambiguous:=true; v_safe_reason:=coalesce(v_safe_reason,'inactive_device_link');
    end if;
  end if;
  if p_release_history_id is not null then
    select * into rh from public.m21_release_history x
    where x.id=p_release_history_id and x.ad_work_id=a.id
      and x.release_status='released_to_driver' and x.effective_from<=p_now
      and x.effective_from<coalesce(e.effective_until,'infinity'::timestamptz)
      and (x.effective_until is null or e.effective_from<x.effective_until)
      and (ah.id is null or (x.effective_from<coalesce(ah.effective_until,'infinity'::timestamptz)
        and coalesce(x.effective_until,'infinity'::timestamptz)>ah.effective_from));
    if not found then
      v_ambiguous:=true; v_safe_reason:=coalesce(v_safe_reason,'inactive_release_authority');
    end if;
  end if;

  v_phone_expected := coalesce(a.mobile_location_proof_required,false)
    and a.tracking_type::text in ('mobile','both');
  v_physical_expected := a.tracking_type::text in ('device','both');
  -- Current authority is assessed independently from the historical scopes.
  -- A null authority input is a current gap only when the still-running
  -- execution has no single authority row covering p_now.
  if p_gap_category is null and v_current_execution_active and p_assignment_history_id is null then
    select count(*)::integer into v_current_authority_count
    from public.m21_assignment_history x
    where x.ad_work_id=a.id
      and x.assignment_status in ('assigned','ready_for_execution')
      and x.effective_from<=p_now
      and (x.effective_until is null or p_now<x.effective_until)
      and x.effective_from<coalesce(e.effective_until,'infinity'::timestamptz)
      and coalesce(x.effective_until,'infinity'::timestamptz)>e.effective_from;
    if v_current_authority_count=0 then
      v_gap_category:='no_current_assignment';
    elsif v_current_authority_count>1 then
      v_gap_category:='ambiguous_current_assignment';
    end if;
  elsif p_gap_category is null and v_current_execution_active and p_assignment_history_id is not null
    and ah.id is not null and p_release_history_id is null then
    select count(*)::integer into v_current_release_count
    from public.m21_release_history x
    where x.ad_work_id=a.id and x.release_status='released_to_driver'
      and x.effective_from<=p_now
      and (x.effective_until is null or p_now<x.effective_until)
      and x.effective_from<coalesce(e.effective_until,'infinity'::timestamptz)
      and coalesce(x.effective_until,'infinity'::timestamptz)>e.effective_from
      and x.effective_from<coalesce(ah.effective_until,'infinity'::timestamptz)
      and coalesce(x.effective_until,'infinity'::timestamptz)>ah.effective_from;
    if v_current_release_count=0 then
      v_gap_category:='no_current_release';
    elsif v_current_release_count>1 then
      v_gap_category:='ambiguous_current_release';
    end if;
  elsif p_gap_category is null and v_current_execution_active and p_assignment_history_id is not null
    and ah.id is not null and p_release_history_id is not null and rh.id is not null
    and v_physical_expected and p_gps_device_vehicle_link_id is null then
    select count(*)::integer into v_current_link_count
    from public.gps_device_vehicle_links x
    where x.vehicle_id=ah.vehicle_id and x.is_primary
      and x.effective_from<=p_now
      and (x.effective_until is null or p_now<x.effective_until)
      and x.effective_from<coalesce(e.effective_until,'infinity'::timestamptz)
      and coalesce(x.effective_until,'infinity'::timestamptz)>e.effective_from
      and x.effective_from<coalesce(ah.effective_until,'infinity'::timestamptz)
      and coalesce(x.effective_until,'infinity'::timestamptz)>ah.effective_from
      and x.effective_from<coalesce(rh.effective_until,'infinity'::timestamptz)
      and coalesce(x.effective_until,'infinity'::timestamptz)>rh.effective_from;
    if v_current_link_count=0 then
      v_gap_category:='no_current_device_link';
    elsif v_current_link_count>1 then
      v_gap_category:='ambiguous_current_device_link';
    end if;
  end if;
  if p_gap_category is null and v_gap_category is not null then
    v_ambiguous:=true;
    v_safe_reason:=v_gap_category;
    if v_gap_category in ('no_current_assignment','ambiguous_current_assignment') then
      select x.effective_from into v_gap_start
      from public.m21_assignment_history x
      where x.ad_work_id=a.id
        and x.assignment_status not in ('assigned','ready_for_execution')
        and x.effective_from<=p_now
        and (x.effective_until is null or p_now<x.effective_until)
        and x.effective_from<coalesce(e.effective_until,'infinity'::timestamptz)
        and coalesce(x.effective_until,'infinity'::timestamptz)>e.effective_from
      order by x.effective_from,x.id limit 1;
      if v_gap_start is null then
        select greatest(e.effective_from,coalesce(max(x.effective_until),e.effective_from))
          into v_gap_start
        from public.m21_assignment_history x
        where x.ad_work_id=a.id and x.assignment_status in ('assigned','ready_for_execution')
          and x.effective_until is not null and x.effective_until<=p_now
          and x.effective_until>e.effective_from
          and x.effective_until<=coalesce(e.effective_until,'infinity'::timestamptz);
      end if;
    elsif v_gap_category in ('no_current_release','ambiguous_current_release') then
      select x.effective_from into v_gap_start
      from public.m21_release_history x
      where x.ad_work_id=a.id and x.release_status in ('not_released','access_revoked')
        and x.effective_from<=p_now
        and (x.effective_until is null or p_now<x.effective_until)
        and x.effective_from<coalesce(e.effective_until,'infinity'::timestamptz)
        and coalesce(x.effective_until,'infinity'::timestamptz)>e.effective_from
      order by x.effective_from,x.id limit 1;
      if v_gap_start is null then
        select greatest(e.effective_from,coalesce(ah.effective_from,e.effective_from),
          coalesce(max(x.effective_until),greatest(e.effective_from,coalesce(ah.effective_from,e.effective_from))))
          into v_gap_start
        from public.m21_release_history x
        where x.ad_work_id=a.id and x.release_status='released_to_driver'
          and x.effective_until is not null and x.effective_until<=p_now
          and x.effective_until>e.effective_from
          and x.effective_until<=coalesce(e.effective_until,'infinity'::timestamptz);
      end if;
    else
      select greatest(e.effective_from,coalesce(ah.effective_from,e.effective_from),
        coalesce(rh.effective_from,e.effective_from),
        coalesce(max(x.effective_until),greatest(e.effective_from,
          coalesce(ah.effective_from,e.effective_from),coalesce(rh.effective_from,e.effective_from))))
        into v_gap_start
      from public.gps_device_vehicle_links x
      where x.vehicle_id=ah.vehicle_id and x.is_primary
        and x.effective_until is not null
        and x.effective_until<=p_now and x.effective_until>e.effective_from
        and x.effective_until<=coalesce(e.effective_until,'infinity'::timestamptz);
    end if;
    if v_gap_category in ('no_current_assignment','ambiguous_current_assignment') then
      select min(x.effective_from) into v_gap_end
      from public.m21_assignment_history x
      where x.ad_work_id=a.id and x.assignment_status in ('assigned','ready_for_execution')
        and x.effective_from>v_gap_start
        and x.effective_from<coalesce(e.effective_until,'infinity'::timestamptz);
    elsif v_gap_category in ('no_current_release','ambiguous_current_release') then
      select min(x.effective_from) into v_gap_end
      from public.m21_release_history x
      where x.ad_work_id=a.id and x.release_status='released_to_driver'
        and x.effective_from>v_gap_start
        and x.effective_from<coalesce(e.effective_until,'infinity'::timestamptz);
    else
      select min(x.effective_from) into v_gap_end
      from public.gps_device_vehicle_links x
      where x.vehicle_id=coalesce(ah.vehicle_id,l.vehicle_id) and x.is_primary
        and x.effective_from>v_gap_start
        and x.effective_from<coalesce(e.effective_until,'infinity'::timestamptz);
    end if;
    v_gap_end:=least(coalesce(v_gap_end,'infinity'::timestamptz),coalesce(e.effective_until,'infinity'::timestamptz));
    if v_gap_end='infinity'::timestamptz then v_gap_end:=null; end if;
  end if;
  if a.tracking_type::text in ('device','both')
    and (p_gps_device_id is null or p_gps_device_vehicle_link_id is null) then
    if v_gap_category is null then
      v_ambiguous:=true;
      v_safe_reason:=coalesce(v_safe_reason,'no_active_device_link');
    end if;
  end if;
  if p_assignment_history_id is null and (v_phone_expected or v_physical_expected) then
    if v_gap_category is null then
      v_ambiguous:=true;
      v_safe_reason:='no_active_assignment';
    end if;
  end if;
  if p_release_history_id is null and (v_phone_expected or v_physical_expected)
    and rh.id is null then
    if v_gap_category is null then
      v_ambiguous:=true;
      v_safe_reason:=coalesce(v_safe_reason,'no_release_authority');
    end if;
  end if;
  v_expectation:=case when v_ambiguous then 'ambiguous'
    when v_phone_expected and v_physical_expected then 'both_expected'
    when v_phone_expected then 'phone_only'
    when v_physical_expected then 'physical_only'
    else 'neither_expected' end;

  if v_gap_category is not null then
    v_scope_from:=v_gap_start;
    v_scope_until:=v_gap_end;
  else
    v_scope_from:=e.effective_from;
    v_scope_until:=e.effective_until;
    if ah.id is not null then
      v_scope_from:=greatest(v_scope_from,ah.effective_from);
      v_scope_until:=case when v_scope_until is null then ah.effective_until
        when ah.effective_until is null then v_scope_until else least(v_scope_until,ah.effective_until) end;
    end if;
    if l.id is not null then
      v_scope_from:=greatest(v_scope_from,l.effective_from);
      v_scope_until:=case when v_scope_until is null then l.effective_until
        when l.effective_until is null then v_scope_until else least(v_scope_until,l.effective_until) end;
    end if;
    if rh.id is not null then
      v_scope_from:=greatest(v_scope_from,rh.effective_from);
      v_scope_until:=case when v_scope_until is null then rh.effective_until
        when rh.effective_until is null then v_scope_until else least(v_scope_until,rh.effective_until) end;
    end if;
  end if;
  if v_scope_until is not null and v_scope_until<=v_scope_from then return null; end if;
  if l.id is not null then
    -- Scope-local ambiguity: a sequential historical replacement outside the
    -- exact execution/assignment/release/link intersection cannot poison this
    -- scope, while a genuine overlap still fails closed.
    select count(*)::integer into v_link_count from public.gps_device_vehicle_links x
    where x.vehicle_id=l.vehicle_id and x.is_primary and x.effective_from<=p_now
      and x.effective_from < coalesce(v_scope_until,'infinity'::timestamptz)
      and coalesce(x.effective_until,'infinity'::timestamptz)>v_scope_from;
    if v_link_count>1 then
      v_ambiguous:=true; v_safe_reason:=coalesce(v_safe_reason,'ambiguous_device_link');
    end if;
  end if;
  v_scope_key:=public.m22_safe_digest(concat_ws('|',w.id::text,e.id::text,
    coalesce(ah.id::text,''),coalesce(l.id::text,''),coalesce(p_gps_device_id::text,''),
    coalesce(rh.id::text,''),coalesce(v_gap_category,''),coalesce(v_gap_start::text,'')));

  v_work_end:=coalesce(v_scope_until,w.actual_end_time,e.effective_until);
  v_finality:=case
    when e.execution_status='running' and p_now>=v_scope_from and (v_scope_until is null or p_now<v_scope_until)
      then 'provisional_active_work'
    when v_work_end is null or p_now<v_work_end+make_interval(secs=>p.backfill_window_seconds)
      then 'provisional_backfill_open'
    else 'final_backfill_closed' end;
  v_phase:=case v_finality when 'provisional_active_work' then 'active_work'
    when 'provisional_backfill_open' then 'backfill_open' else 'backfill_closed' end;
  if v_scope_from>p_now then return null; end if;
  v_allow_end_boundary:=e.effective_until is not null
    and v_scope_until=e.effective_until
    and exists(
      select 1 from public.m21_execution_history next_execution
      where next_execution.ad_work_day_id=e.ad_work_day_id
        and next_execution.execution_status='completed'
        and next_execution.effective_from=e.effective_until
    )
    and ah.id is not null
    and (ah.effective_until is null or ah.effective_until>e.effective_until)
    and rh.id is not null
    and (rh.effective_until is null or rh.effective_until>e.effective_until)
    and (a.tracking_type::text not in ('device','both')
      or (l.id is not null and (l.effective_until is null or l.effective_until>e.effective_until)));
  v_grace_elapsed:=v_finality<>'provisional_active_work'
    or p_now>=v_scope_from+make_interval(secs=>p.missing_source_grace_seconds);

  if v_phone_expected and ah.id is not null and rh.id is not null then
    select count(*)::integer,max(lp.recorded_at),max(lp.id::text)
      into v_phone_count,v_watermark,v_input_hash
    from public.location_points lp join public.tracking_sessions ts on ts.id=lp.tracking_session_id
    where lp.ad_work_day_id=w.id and lp.source::text='phone'
      and ts.tracking_mode='phone_location' and lp.assignment_history_id=ah.id
      and lp.driver_id=ah.driver_id and lp.vehicle_id=ah.vehicle_id
      and lp.recorded_at>=v_scope_from and lp.recorded_at<=p_now
      and (v_scope_until is null or lp.recorded_at<v_scope_until
        or (v_allow_end_boundary and lp.recorded_at=v_scope_until))
      and public.m23_point_in_session_scope(lp.recorded_at,ts.started_at,ts.ended_at,
        v_scope_until,v_allow_end_boundary);
  else v_phone_count:=0; end if;
  if v_physical_expected and ah.id is not null and rh.id is not null and l.id is not null then
    select count(*)::integer,greatest(v_watermark,max(lp.recorded_at))
      into v_physical_count,v_watermark
    from public.location_points lp join public.tracking_sessions ts on ts.id=lp.tracking_session_id
      join public.telemetry_receipts tr on tr.id=lp.telemetry_receipt_id
    where lp.ad_work_day_id=w.id and lp.source::text='physical_device'
      and lp.execution_history_id=e.id and lp.assignment_history_id=ah.id
      and lp.gps_device_vehicle_link_id=l.id and lp.device_id=p_gps_device_id
      and tr.disposition in ('accepted_live','accepted_delayed') and tr.quality in ('valid','degraded')
      and lp.recorded_at>=v_scope_from and lp.recorded_at<=p_now
      and (v_scope_until is null or lp.recorded_at<v_scope_until
        or (v_allow_end_boundary and lp.recorded_at=v_scope_until))
      and public.m23_point_in_session_scope(lp.recorded_at,ts.started_at,ts.ended_at,
        v_scope_until,v_allow_end_boundary);
  else v_physical_count:=0; end if;
  if v_phone_expected and ah.id is not null and rh.id is not null then
    select count(*) filter(where coalesce(lp.synthetic,false))::integer,
      count(*) filter(where not coalesce(lp.synthetic,false))::integer
      into v_phone_synthetic_count,v_phone_non_synthetic_count
    from public.location_points lp join public.tracking_sessions ts on ts.id=lp.tracking_session_id
    where lp.ad_work_day_id=w.id and lp.source::text='phone'
      and ts.tracking_mode='phone_location' and lp.assignment_history_id=ah.id
      and lp.driver_id=ah.driver_id and lp.vehicle_id=ah.vehicle_id
      and lp.recorded_at>=v_scope_from and lp.recorded_at<=p_now
      and (v_scope_until is null or lp.recorded_at<v_scope_until
        or (v_allow_end_boundary and lp.recorded_at=v_scope_until))
      and public.m23_point_in_session_scope(lp.recorded_at,ts.started_at,ts.ended_at,
        v_scope_until,v_allow_end_boundary);
  end if;
  if v_physical_expected and ah.id is not null and rh.id is not null and l.id is not null then
    select count(*) filter(where coalesce(lp.synthetic,false))::integer,
      count(*) filter(where not coalesce(lp.synthetic,false))::integer
      into v_physical_synthetic_count,v_physical_non_synthetic_count
    from public.location_points lp join public.tracking_sessions ts on ts.id=lp.tracking_session_id
      join public.telemetry_receipts tr on tr.id=lp.telemetry_receipt_id
    where lp.ad_work_day_id=w.id and lp.source::text='physical_device'
      and ts.tracking_mode='physical_device' and lp.execution_history_id=e.id
      and lp.assignment_history_id=ah.id and lp.gps_device_vehicle_link_id=l.id
      and lp.device_id=p_gps_device_id
      and tr.disposition in ('accepted_live','accepted_delayed') and tr.quality in ('valid','degraded')
      and lp.recorded_at>=v_scope_from and lp.recorded_at<=p_now
      and (v_scope_until is null or lp.recorded_at<v_scope_until
        or (v_allow_end_boundary and lp.recorded_at=v_scope_until))
      and public.m23_point_in_session_scope(lp.recorded_at,ts.started_at,ts.ended_at,
        v_scope_until,v_allow_end_boundary);
  end if;
  v_mixed:=(v_phone_synthetic_count+v_physical_synthetic_count)>0
    and (v_phone_non_synthetic_count+v_physical_non_synthetic_count)>0;
  if v_mixed then
    v_safe_reason:='mixed_evidence_classification';
  end if;
  v_synthetic:=(v_phone_synthetic_count+v_physical_synthetic_count)>0
    and (v_phone_non_synthetic_count+v_physical_non_synthetic_count)=0;
  if v_watermark='-infinity'::timestamptz then v_watermark:=null; end if;
  v_input_hash:=public.m22_safe_digest(concat_ws('|',v_scope_key,p.policy_id,p.policy_version,
    v_expectation,v_finality,v_phase,v_scope_from::text,coalesce(v_scope_until::text,''),
    v_grace_elapsed,coalesce(v_safe_reason,''),v_phone_count,v_physical_count,
    coalesce(v_watermark::text,''),coalesce((select string_agg(
      concat_ws(':',z.id::text,z.recorded_at::text,coalesce(z.accuracy_meters::text,'null'),
        coalesce(z.quality::text,'null'),coalesce(z.synthetic::text,'false')),
      ',' order by z.source,z.recorded_at,z.id)
      from (
        select lp.id,lp.recorded_at,lp.accuracy_meters,lp.quality,lp.synthetic,lp.source::text source
        from public.location_points lp join public.tracking_sessions ts on ts.id=lp.tracking_session_id
        where v_phone_expected and ah.id is not null and rh.id is not null
          and lp.ad_work_day_id=w.id and lp.source::text='phone'
          and ts.tracking_mode='phone_location' and lp.assignment_history_id=ah.id
          and lp.driver_id=ah.driver_id and lp.vehicle_id=ah.vehicle_id
          and lp.recorded_at>=v_scope_from and lp.recorded_at<=p_now
          and (v_scope_until is null or lp.recorded_at<v_scope_until
            or (v_allow_end_boundary and lp.recorded_at=v_scope_until))
          and public.m23_point_in_session_scope(lp.recorded_at,ts.started_at,ts.ended_at,
            v_scope_until,v_allow_end_boundary)
        union all
        select q.id,q.recorded_at,q.accuracy_meters,q.quality,q.synthetic,q.source::text source
        from public.location_points q join public.tracking_sessions ts on ts.id=q.tracking_session_id
          join public.telemetry_receipts tr on tr.id=q.telemetry_receipt_id
        where v_physical_expected and ah.id is not null and rh.id is not null and l.id is not null
          and q.ad_work_day_id=w.id and q.source::text='physical_device'
          and ts.tracking_mode='physical_device' and q.execution_history_id=e.id
          and q.assignment_history_id=ah.id and q.gps_device_vehicle_link_id=l.id
          and q.device_id=p_gps_device_id
          and tr.disposition in ('accepted_live','accepted_delayed') and tr.quality in ('valid','degraded')
          and q.recorded_at>=v_scope_from and q.recorded_at<=p_now
          and (v_scope_until is null or q.recorded_at<v_scope_until
            or (v_allow_end_boundary and q.recorded_at=v_scope_until))
          and public.m23_point_in_session_scope(q.recorded_at,ts.started_at,ts.ended_at,
            v_scope_until,v_allow_end_boundary)
      ) z),'')));
  perform pg_advisory_xact_lock(hashtextextended(v_scope_key,23));
  select id into v_existing from public.m23_comparison_snapshots
    where authority_scope_key=v_scope_key and policy_id=p.policy_id and policy_version=p.policy_version
      and input_hash=v_input_hash;
  if v_existing is not null then return v_existing; end if;

  insert into public.m23_comparison_snapshots(
    ad_work_day_id,ad_work_id,driver_id,vehicle_id,assignment_history_id,
    release_history_id,execution_history_id,gps_device_id,gps_device_vehicle_link_id,policy_id,
    policy_version,authority_scope_key,input_watermark,input_hash,source_expectation,
    scope_effective_from,scope_effective_until,safe_reason_code,
    overall_outcome,finality,evaluation_phase,synthetic
  ) values (
    w.id,w.ad_work_id,coalesce(ah.driver_id,w.driver_id),coalesce(ah.vehicle_id,w.vehicle_id),
    ah.id,rh.id,e.id,p_gps_device_id,p_gps_device_vehicle_link_id,p.policy_id,p.policy_version,
    v_scope_key,v_watermark,v_input_hash,v_expectation,v_scope_from,v_scope_until,v_safe_reason,
    'comparison_unavailable',v_finality,v_phase,v_synthetic
  ) returning * into s;
  insert into public.m23_comparison_reviews(snapshot_id,status) values(s.id,'not_reviewed')
    on conflict(snapshot_id) do nothing;

  if v_phone_expected and v_physical_expected and not v_ambiguous and not v_mixed
    and ah.id is not null and rh.id is not null then
    perform public.m23_pair_scope_exact(w.id,e.id,ah.id,l.id,p_gps_device_id,
      p.policy_id,p.policy_version,v_scope_key,v_scope_from,v_scope_until,s.id,
      v_allow_end_boundary,p_now);
  end if;

  select count(*)::integer,count(*) filter(where x.quality='acceptable')::integer,
    count(*) filter(where x.outcome='match')::integer,
    count(*) filter(where x.outcome='mismatch_candidate')::integer,
    count(*) filter(where x.outcome='insufficient_quality')::integer
    into v_pair_count,v_acceptable_count,v_match_count,v_mismatch_count,v_quality_count
  from public.m23_comparison_pairs x
  where x.snapshot_id=s.id
    and (v_watermark is null or (x.phone_captured_at<=v_watermark and x.physical_captured_at<=v_watermark));
  v_unpaired_phone:=greatest(0,v_phone_count-v_pair_count);
  v_unpaired_physical:=greatest(0,v_physical_count-v_pair_count);

  for cached in
    select x.*,greatest(x.phone_captured_at,x.physical_captured_at) pair_time
    from public.m23_comparison_pairs x
    where x.snapshot_id=s.id
      and (v_watermark is null or (x.phone_captured_at<=v_watermark and x.physical_captured_at<=v_watermark))
    order by greatest(x.phone_captured_at,x.physical_captured_at),x.phone_captured_at,x.physical_captured_at,x.pair_identity
  loop
    if cached.outcome='insufficient_quality' then continue; end if;
    v_pair_time:=cached.pair_time;
    if cached.outcome='match' then
      if v_current then
        if v_current_count>=p.minimum_pair_count
          and extract(epoch from(v_current_last-v_current_first))>=p.sustained_mismatch_duration_seconds
          and v_current_min>=p.sustained_mismatch_distance_meters then
          if not v_best or v_current_last>v_best_last
            or (v_current_last=v_best_last and extract(epoch from(v_current_last-v_current_first))>extract(epoch from(v_best_last-v_best_first)))
            or (v_current_last=v_best_last and extract(epoch from(v_current_last-v_current_first))=extract(epoch from(v_best_last-v_best_first)) and v_current_count>v_best_count)
            or (v_current_last=v_best_last and extract(epoch from(v_current_last-v_current_first))=extract(epoch from(v_best_last-v_best_first)) and v_current_count=v_best_count and v_current_first_id<v_best_first_id)
          then v_best:=true; v_best_first:=v_current_first; v_best_last:=v_current_last; v_best_count:=v_current_count; v_best_min:=v_current_min; v_best_max:=v_current_max; v_best_first_id:=v_current_first_id; end if;
        end if;
      end if;
      v_current:=false; v_current_count:=0; continue;
    end if;
    if v_current and extract(epoch from(v_pair_time-v_current_last))>p.maximum_sustained_episode_gap_seconds then
      if v_current_count>=p.minimum_pair_count
        and extract(epoch from(v_current_last-v_current_first))>=p.sustained_mismatch_duration_seconds
        and v_current_min>=p.sustained_mismatch_distance_meters then
        if not v_best or v_current_last>v_best_last or (v_current_last=v_best_last and v_current_count>v_best_count)
          or (v_current_last=v_best_last and v_current_count=v_best_count and v_current_first_id<v_best_first_id)
        then v_best:=true; v_best_first:=v_current_first; v_best_last:=v_current_last; v_best_count:=v_current_count; v_best_min:=v_current_min; v_best_max:=v_current_max; v_best_first_id:=v_current_first_id; end if;
      end if;
      v_current:=false; v_current_count:=0;
    end if;
    if not v_current then v_current:=true; v_current_first:=v_pair_time; v_current_last:=v_pair_time; v_current_count:=0; v_current_min:=null; v_current_max:=null; v_current_first_id:=cached.pair_identity; end if;
    v_current_last:=v_pair_time; v_current_count:=v_current_count+1;
    v_current_min:=least(coalesce(v_current_min,cached.conservative_separation_meters),cached.conservative_separation_meters);
    v_current_max:=greatest(coalesce(v_current_max,cached.conservative_separation_meters),cached.conservative_separation_meters);
  end loop;
  if v_current and v_current_count>=p.minimum_pair_count
    and extract(epoch from(v_current_last-v_current_first))>=p.sustained_mismatch_duration_seconds
    and v_current_min>=p.sustained_mismatch_distance_meters then
    if not v_best or v_current_last>v_best_last or (v_current_last=v_best_last and v_current_count>v_best_count)
      or (v_current_last=v_best_last and v_current_count=v_best_count and v_current_first_id<v_best_first_id)
    then v_best:=true; v_best_first:=v_current_first; v_best_last:=v_current_last; v_best_count:=v_current_count; v_best_min:=v_current_min; v_best_max:=v_current_max; v_best_first_id:=v_current_first_id; end if;
  end if;
  v_outcome:=case
    when v_mixed then 'comparison_unavailable'
    when v_ambiguous then 'comparison_unavailable'
    when v_expectation in ('neither_expected','phone_only','physical_only') then 'not_expected'
    when not v_grace_elapsed and (v_phone_count=0 or v_physical_count=0) then 'awaiting_sources'
    when v_phone_count=0 and v_physical_count=0 then 'both_missing'
    when v_phone_count=0 then 'phone_missing'
    when v_physical_count=0 then 'physical_device_missing'
    when v_pair_count>0 and v_acceptable_count=0 and v_quality_count>0 then 'insufficient_quality'
    when v_acceptable_count<p.minimum_pair_count then 'insufficient_pairs'
    when v_best then 'sustained_mismatch'
    when v_mismatch_count>0 then 'isolated_mismatch'
    else 'paired_match' end;
  if v_best then v_sustained_count:=v_best_count; v_first:=v_best_first; v_last:=v_best_last; v_min:=v_best_min; v_max:=v_best_max; end if;
  perform set_config('app.m23_snapshot_build','on',true);
  update public.m23_comparison_snapshots set
    phone_eligible_count=v_phone_count,physical_eligible_count=v_physical_count,
    pair_count=v_pair_count,acceptable_pair_count=v_acceptable_count,match_count=v_match_count,
    mismatch_candidate_count=v_mismatch_count,insufficient_quality_count=v_quality_count,
    unpaired_phone_count=v_unpaired_phone,unpaired_physical_count=v_unpaired_physical,
    sustained_pair_count=case when v_best then v_sustained_count else 0 end,
    sustained_first_pair_at=case when v_best then v_first end,
    sustained_last_pair_at=case when v_best then v_last end,
    minimum_conservative_separation_meters=case when v_best then v_min end,
    maximum_conservative_separation_meters=case when v_best then v_max end,
    overall_outcome=v_outcome,
    synthetic=v_synthetic,
    build_complete=true
  where id=s.id;
  perform set_config('app.m23_snapshot_build','off',true);
  perform set_config('app.m23_snapshot_supersede','on',true);
  update public.m23_comparison_snapshots old set is_latest=false,superseded_by_snapshot_id=s.id
    where old.authority_scope_key=s.authority_scope_key and old.id<>s.id and old.is_latest;
  perform set_config('app.m23_snapshot_supersede','off',true);
  insert into public.m23_comparison_heads(authority_scope_key,policy_id,policy_version,snapshot_id,updated_at)
    values(s.authority_scope_key,s.policy_id,s.policy_version,s.id,clock_timestamp())
    on conflict(authority_scope_key,policy_id,policy_version) do update set snapshot_id=excluded.snapshot_id,updated_at=excluded.updated_at;
  perform public.m23_sync_mismatch_alert(s.id,v_outcome,v_max,p);
  return s.id;
end;
$$;

revoke all on function public.m23_evaluate_scope_authority(
  uuid,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,text,timestamptz,timestamptz
) from public,anon,authenticated;

create or replace function public.m23_evaluate_scope(
  p_ad_work_day_id uuid,p_execution_history_id uuid,p_assignment_history_id uuid,
  p_gps_device_vehicle_link_id uuid,p_gps_device_id uuid,p_policy_id text,
  p_policy_version text,p_now timestamptz
) returns uuid language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_ad_work_id uuid; v_release_count integer:=0; v_release_id uuid;
begin
  select ad_work_id into v_ad_work_id from public.ad_work_days where id=p_ad_work_day_id;
  -- The compatibility wrapper may fill the current release only when exactly
  -- one release episode covers p_now.  It never performs the old broad
  -- historical count, so sequential releases remain distinct scopes.
  select count(*)::integer into v_release_count
  from public.m21_release_history rh
  join public.m21_execution_history e on e.id=p_execution_history_id
  left join public.m21_assignment_history ah on ah.id=p_assignment_history_id
  where rh.ad_work_id=v_ad_work_id and rh.release_status='released_to_driver'
    and rh.effective_from<=p_now
    and (rh.effective_until is null or p_now<rh.effective_until)
    and rh.effective_from<coalesce(e.effective_until,'infinity'::timestamptz)
    and coalesce(rh.effective_until,'infinity'::timestamptz)>e.effective_from
    and (ah.id is null or (rh.effective_from<coalesce(ah.effective_until,'infinity'::timestamptz)
      and coalesce(rh.effective_until,'infinity'::timestamptz)>ah.effective_from));
  if v_release_count=1 then
    select rh.id into v_release_id
    from public.m21_release_history rh
    join public.m21_execution_history e on e.id=p_execution_history_id
    left join public.m21_assignment_history ah on ah.id=p_assignment_history_id
    where rh.ad_work_id=v_ad_work_id and rh.release_status='released_to_driver'
      and rh.effective_from<=p_now
      and (rh.effective_until is null or p_now<rh.effective_until)
      and rh.effective_from<coalesce(e.effective_until,'infinity'::timestamptz)
      and coalesce(rh.effective_until,'infinity'::timestamptz)>e.effective_from
      and (ah.id is null or (rh.effective_from<coalesce(ah.effective_until,'infinity'::timestamptz)
        and coalesce(rh.effective_until,'infinity'::timestamptz)>ah.effective_from))
    order by rh.effective_from,rh.id limit 1;
  end if;
  return public.m23_evaluate_scope_authority(p_ad_work_day_id,p_execution_history_id,
    p_assignment_history_id,p_gps_device_vehicle_link_id,p_gps_device_id,v_release_id,
    p_policy_id,p_policy_version,p_now,null,null,null);
end;
$$;

create or replace function public.m23_evaluate_work_day(
  p_ad_work_day_id uuid,p_policy_id text,p_policy_version text,
  p_now timestamptz default clock_timestamp()
) returns integer language plpgsql security definer set search_path = pg_catalog, public
as $$
declare e record; ah record; rh record; l record; current_ah record;
  v_count integer:=0; v_link_count integer; v_release_count integer;
  v_active_assignment_count integer:=0; v_current_link_count integer:=0;
  v_from timestamptz; v_until timestamptz;
  v_tracking_type text; v_ad_work_id uuid;
begin
  select d.ad_work_id,w.tracking_type::text into v_ad_work_id,v_tracking_type
  from public.ad_work_days d join public.ad_works w on w.id=d.ad_work_id
  where d.id=p_ad_work_day_id;
  for e in select * from public.m21_execution_history where ad_work_day_id=p_ad_work_day_id
    and execution_status='running' and effective_from<=p_now order by effective_from,id
  loop
    -- Historical segmentation: every valid authority episode that began by
    -- p_now is evaluated independently.  Current p_now coverage is not used
    -- to discard a scope that may still receive delayed/backfill evidence.
    for ah in select * from public.m21_assignment_history x
      where x.ad_work_id=v_ad_work_id
        and x.assignment_status in ('assigned','ready_for_execution')
        and x.effective_from<=p_now
        and x.effective_from<coalesce(e.effective_until,'infinity'::timestamptz)
        and coalesce(x.effective_until,'infinity'::timestamptz)>e.effective_from
      order by x.effective_from,x.id
    loop
      for rh in select * from public.m21_release_history x
        where x.ad_work_id=v_ad_work_id
          and x.release_status='released_to_driver'
          and x.effective_from<=p_now
          and x.effective_from<coalesce(e.effective_until,'infinity'::timestamptz)
          and coalesce(x.effective_until,'infinity'::timestamptz)>e.effective_from
          and x.effective_from<coalesce(ah.effective_until,'infinity'::timestamptz)
          and coalesce(x.effective_until,'infinity'::timestamptz)>ah.effective_from
        order by x.effective_from,x.id
      loop
        v_from:=greatest(e.effective_from,ah.effective_from,rh.effective_from);
        v_until:=case when e.effective_until is null then coalesce(ah.effective_until,rh.effective_until)
          when ah.effective_until is null then least(e.effective_until,coalesce(rh.effective_until,e.effective_until))
          when rh.effective_until is null then least(e.effective_until,ah.effective_until)
          else least(e.effective_until,ah.effective_until,rh.effective_until) end;
        if v_tracking_type in ('device','both') then
          select count(*)::integer into v_link_count
          from public.gps_device_vehicle_links x
          where x.vehicle_id=ah.vehicle_id and x.is_primary and x.effective_from<=p_now
            and x.effective_from<coalesce(v_until,'infinity'::timestamptz)
            and (x.effective_until is null or v_from<x.effective_until);
          if exists(
            select 1
            from public.gps_device_vehicle_links x
            join public.gps_device_vehicle_links y
              on y.vehicle_id=x.vehicle_id and y.is_primary and y.id<>x.id
            where x.vehicle_id=ah.vehicle_id and x.is_primary and x.effective_from<=p_now
              and x.effective_from<coalesce(v_until,'infinity'::timestamptz)
              and coalesce(x.effective_until,'infinity'::timestamptz)>v_from
              and y.effective_from<=p_now
              and y.effective_from<coalesce(v_until,'infinity'::timestamptz)
              and coalesce(y.effective_until,'infinity'::timestamptz)>v_from
              and x.effective_from<coalesce(y.effective_until,'infinity'::timestamptz)
              and coalesce(x.effective_until,'infinity'::timestamptz)>y.effective_from
          ) then
            -- M20A normally excludes this shape.  If it occurs, fail closed
            -- once without selecting either conflicting link or creating two
            -- competing conclusions.
            perform public.m23_evaluate_scope_authority(p_ad_work_day_id,e.id,ah.id,null,null,rh.id,p_policy_id,p_policy_version,p_now,null,null,null); v_count:=v_count+1;
          elsif v_link_count=1 then
            select x.id,x.gps_device_id,x.vehicle_id,x.effective_from,x.effective_until
              into l
            from public.gps_device_vehicle_links x
            where x.vehicle_id=ah.vehicle_id and x.is_primary and x.effective_from<=p_now
              and x.effective_from<coalesce(v_until,'infinity'::timestamptz)
              and (x.effective_until is null or v_from<x.effective_until)
            order by x.effective_from,x.id limit 1;
            perform public.m23_evaluate_scope_authority(p_ad_work_day_id,e.id,ah.id,l.id,l.gps_device_id,rh.id,p_policy_id,p_policy_version,p_now,null,null,null); v_count:=v_count+1;
          elsif v_link_count=0 then
            perform public.m23_evaluate_scope_authority(p_ad_work_day_id,e.id,ah.id,null,null,rh.id,p_policy_id,p_policy_version,p_now,null,null,null); v_count:=v_count+1;
          else
            for l in select x.id,x.gps_device_id,x.vehicle_id,x.effective_from,x.effective_until
              from public.gps_device_vehicle_links x
              where x.vehicle_id=ah.vehicle_id and x.is_primary and x.effective_from<=p_now
                and x.effective_from<coalesce(v_until,'infinity'::timestamptz)
                and (x.effective_until is null or v_from<x.effective_until)
              order by x.effective_from,x.id
            loop
              perform public.m23_evaluate_scope_authority(p_ad_work_day_id,e.id,ah.id,l.id,l.gps_device_id,rh.id,p_policy_id,p_policy_version,p_now,null,null,null); v_count:=v_count+1;
            end loop;
          end if;
        else
          perform public.m23_evaluate_scope_authority(p_ad_work_day_id,e.id,ah.id,null,null,rh.id,p_policy_id,p_policy_version,p_now,null,null,null); v_count:=v_count+1;
        end if;
      end loop;
    end loop;

    -- Current authority: a running execution gets one deterministic gap scope
    -- only when assignment, release, or physical link coverage at p_now is
    -- absent/ambiguous.  A valid current scope was already emitted by the
    -- historical segmentation above, so it is not evaluated twice.
    if e.effective_until is null or p_now<e.effective_until then
      select count(*)::integer into v_active_assignment_count
      from public.m21_assignment_history x
      where x.ad_work_id=v_ad_work_id
        and x.assignment_status in ('assigned','ready_for_execution')
        and x.effective_from<=p_now
        and (x.effective_until is null or p_now<x.effective_until)
        and x.effective_from<coalesce(e.effective_until,'infinity'::timestamptz)
        and coalesce(x.effective_until,'infinity'::timestamptz)>e.effective_from;
      if v_active_assignment_count<>1 then
        perform public.m23_evaluate_scope_authority(p_ad_work_day_id,e.id,null,null,null,null,
          p_policy_id,p_policy_version,p_now,null,null,null);
        v_count:=v_count+1;
      else
        select * into current_ah
        from public.m21_assignment_history x
        where x.ad_work_id=v_ad_work_id
          and x.assignment_status in ('assigned','ready_for_execution')
          and x.effective_from<=p_now
          and (x.effective_until is null or p_now<x.effective_until)
          and x.effective_from<coalesce(e.effective_until,'infinity'::timestamptz)
          and coalesce(x.effective_until,'infinity'::timestamptz)>e.effective_from
        order by x.effective_from,x.id limit 1;
        select count(*)::integer into v_release_count
        from public.m21_release_history x
        where x.ad_work_id=v_ad_work_id and x.release_status='released_to_driver'
          and x.effective_from<=p_now
          and (x.effective_until is null or p_now<x.effective_until)
          and x.effective_from<coalesce(e.effective_until,'infinity'::timestamptz)
          and coalesce(x.effective_until,'infinity'::timestamptz)>e.effective_from
          and x.effective_from<coalesce(current_ah.effective_until,'infinity'::timestamptz)
          and coalesce(x.effective_until,'infinity'::timestamptz)>current_ah.effective_from;
        if v_release_count<>1 then
          perform public.m23_evaluate_scope_authority(p_ad_work_day_id,e.id,current_ah.id,null,null,null,
            p_policy_id,p_policy_version,p_now,null,null,null);
          v_count:=v_count+1;
        elsif v_tracking_type in ('device','both') then
          select count(*)::integer into v_current_link_count
          from public.gps_device_vehicle_links x
          where x.vehicle_id=current_ah.vehicle_id and x.is_primary
            and x.effective_from<=p_now
            and (x.effective_until is null or p_now<x.effective_until)
            and x.effective_from<coalesce(e.effective_until,'infinity'::timestamptz)
            and coalesce(x.effective_until,'infinity'::timestamptz)>e.effective_from
            and x.effective_from<coalesce(current_ah.effective_until,'infinity'::timestamptz)
            and coalesce(x.effective_until,'infinity'::timestamptz)>current_ah.effective_from;
          if v_current_link_count<>1 then
            perform public.m23_evaluate_scope_authority(p_ad_work_day_id,e.id,current_ah.id,null,null,
              (select x.id from public.m21_release_history x
               where x.ad_work_id=v_ad_work_id and x.release_status='released_to_driver'
                 and x.effective_from<=p_now
                 and (x.effective_until is null or p_now<x.effective_until)
                 and x.effective_from<coalesce(e.effective_until,'infinity'::timestamptz)
                 and coalesce(x.effective_until,'infinity'::timestamptz)>e.effective_from
                 and x.effective_from<coalesce(current_ah.effective_until,'infinity'::timestamptz)
                 and coalesce(x.effective_until,'infinity'::timestamptz)>current_ah.effective_from
               order by x.effective_from,x.id limit 1),p_policy_id,p_policy_version,p_now,null,null,null);
            v_count:=v_count+1;
          end if;
        end if;
      end if;
    end if;
  end loop;
  return v_count;
end;
$$;

-- Final authority segmentation pass.  The preceding compatibility body is
-- retained for migration ordering, but this definition is authoritative for
-- runtime evaluation and explicitly emits historical gap intervals.
create or replace function public.m23_evaluate_work_day(
  p_ad_work_day_id uuid,p_policy_id text,p_policy_version text,
  p_now timestamptz default clock_timestamp()
) returns integer language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  e record; seg record;
  v_ad_work_id uuid; v_tracking_type text; v_count integer:=0;
  v_assignment_count integer:=0; v_release_count integer:=0; v_link_count integer:=0;
  v_assignment_id uuid; v_assignment_vehicle uuid; v_release_id uuid;
  v_link_id uuid; v_device_id uuid;
  v_category text; v_seg_from timestamptz; v_seg_until timestamptz;
  v_group_category text; v_group_from timestamptz; v_group_until timestamptz;
  v_group_assignment_id uuid; v_group_release_id uuid;
begin
  select d.ad_work_id,w.tracking_type::text
    into v_ad_work_id,v_tracking_type
  from public.ad_work_days d join public.ad_works w on w.id=d.ad_work_id
  where d.id=p_ad_work_day_id;

  for e in
    select * from public.m21_execution_history
    where ad_work_day_id=p_ad_work_day_id
      and execution_status='running' and effective_from<=p_now
    order by effective_from,id
  loop
    v_group_category:=null; v_group_from:=null; v_group_until:=null;
    v_group_assignment_id:=null; v_group_release_id:=null;

    for seg in
      with bounds(bound) as (
        select e.effective_from
        union
        select e.effective_until where e.effective_until is not null
        union
        select x.effective_from
        from public.m21_assignment_history x
        where x.ad_work_id=v_ad_work_id and x.effective_from>e.effective_from
          and x.effective_from<coalesce(e.effective_until,'infinity'::timestamptz)
        union
        select x.effective_until
        from public.m21_assignment_history x
        where x.ad_work_id=v_ad_work_id and x.effective_until is not null
          and x.effective_until>e.effective_from
          and x.effective_until<coalesce(e.effective_until,'infinity'::timestamptz)
        union
        select x.effective_from
        from public.m21_release_history x
        where x.ad_work_id=v_ad_work_id and x.effective_from>e.effective_from
          and x.effective_from<coalesce(e.effective_until,'infinity'::timestamptz)
        union
        select x.effective_until
        from public.m21_release_history x
        where x.ad_work_id=v_ad_work_id and x.effective_until is not null
          and x.effective_until>e.effective_from
          and x.effective_until<coalesce(e.effective_until,'infinity'::timestamptz)
        union
        select x.effective_from
        from public.gps_device_vehicle_links x
        where x.vehicle_id in (
          select ah.vehicle_id from public.m21_assignment_history ah
          where ah.ad_work_id=v_ad_work_id
          union
          select d.vehicle_id from public.ad_work_days d where d.id=p_ad_work_day_id
        )
          and x.effective_from>e.effective_from
          and x.effective_from<coalesce(e.effective_until,'infinity'::timestamptz)
        union
        select x.effective_until
        from public.gps_device_vehicle_links x
        where x.vehicle_id in (
          select ah.vehicle_id from public.m21_assignment_history ah
          where ah.ad_work_id=v_ad_work_id
          union
          select d.vehicle_id from public.ad_work_days d where d.id=p_ad_work_day_id
        )
          and x.effective_until is not null
          and x.effective_until>e.effective_from
          and x.effective_until<coalesce(e.effective_until,'infinity'::timestamptz)
      ), ordered as (
        select bound,lead(bound) over(order by bound) next_bound
        from bounds
      )
      select bound seg_from,next_bound seg_until
      from ordered
      where bound<coalesce(e.effective_until,'infinity'::timestamptz)
      order by bound
    loop
      v_seg_from:=seg.seg_from; v_seg_until:=seg.seg_until;
      v_assignment_count:=0; v_release_count:=0; v_link_count:=0;
      v_assignment_id:=null; v_assignment_vehicle:=null; v_release_id:=null;
      v_link_id:=null; v_device_id:=null; v_category:=null;

      select count(*)::integer into v_assignment_count
      from public.m21_assignment_history x
      where x.ad_work_id=v_ad_work_id
        and x.assignment_status in ('assigned','ready_for_execution')
        and x.effective_from<=v_seg_from
        and (x.effective_until is null or v_seg_from<x.effective_until)
        and x.effective_from<coalesce(e.effective_until,'infinity'::timestamptz)
        and coalesce(x.effective_until,'infinity'::timestamptz)>e.effective_from;
      if v_assignment_count=1 then
        select x.id,x.vehicle_id into v_assignment_id,v_assignment_vehicle
        from public.m21_assignment_history x
        where x.ad_work_id=v_ad_work_id
          and x.assignment_status in ('assigned','ready_for_execution')
          and x.effective_from<=v_seg_from
          and (x.effective_until is null or v_seg_from<x.effective_until)
          and x.effective_from<coalesce(e.effective_until,'infinity'::timestamptz)
          and coalesce(x.effective_until,'infinity'::timestamptz)>e.effective_from
        order by x.effective_from,x.id limit 1;
      elsif v_assignment_count=0 then
        v_category:='no_current_assignment';
      else
        v_category:='ambiguous_current_assignment';
      end if;

      if v_category is null then
        select count(*)::integer into v_release_count
        from public.m21_release_history x
        where x.ad_work_id=v_ad_work_id and x.release_status='released_to_driver'
          and x.effective_from<=v_seg_from
          and (x.effective_until is null or v_seg_from<x.effective_until)
          and x.effective_from<coalesce(e.effective_until,'infinity'::timestamptz)
          and coalesce(x.effective_until,'infinity'::timestamptz)>e.effective_from
          and x.effective_from<coalesce((select effective_until from public.m21_assignment_history where id=v_assignment_id),'infinity'::timestamptz)
          and coalesce(x.effective_until,'infinity'::timestamptz)>(select effective_from from public.m21_assignment_history where id=v_assignment_id);
        if v_release_count=1 then
          select x.id into v_release_id
          from public.m21_release_history x
          where x.ad_work_id=v_ad_work_id and x.release_status='released_to_driver'
            and x.effective_from<=v_seg_from
            and (x.effective_until is null or v_seg_from<x.effective_until)
            and x.effective_from<coalesce(e.effective_until,'infinity'::timestamptz)
            and coalesce(x.effective_until,'infinity'::timestamptz)>e.effective_from
            and x.effective_from<coalesce((select effective_until from public.m21_assignment_history where id=v_assignment_id),'infinity'::timestamptz)
            and coalesce(x.effective_until,'infinity'::timestamptz)>(select effective_from from public.m21_assignment_history where id=v_assignment_id)
          order by x.effective_from,x.id limit 1;
        elsif v_release_count=0 then
          v_category:='no_current_release';
        else
          v_category:='ambiguous_current_release';
        end if;
      end if;

      if v_category is null and v_tracking_type in ('device','both') then
        select count(*)::integer into v_link_count
        from public.gps_device_vehicle_links x
        where x.vehicle_id=v_assignment_vehicle and x.is_primary
          and x.effective_from<=v_seg_from
          and (x.effective_until is null or v_seg_from<x.effective_until)
          and x.effective_from<coalesce(e.effective_until,'infinity'::timestamptz)
          and coalesce(x.effective_until,'infinity'::timestamptz)>e.effective_from
          and x.effective_from<coalesce((select effective_until from public.m21_assignment_history where id=v_assignment_id),'infinity'::timestamptz)
          and coalesce(x.effective_until,'infinity'::timestamptz)>(select effective_from from public.m21_assignment_history where id=v_assignment_id)
          and x.effective_from<coalesce((select effective_until from public.m21_release_history where id=v_release_id),'infinity'::timestamptz)
          and coalesce(x.effective_until,'infinity'::timestamptz)>(select effective_from from public.m21_release_history where id=v_release_id);
        if v_link_count=1 then
          select x.id,x.gps_device_id into v_link_id,v_device_id
          from public.gps_device_vehicle_links x
          where x.vehicle_id=v_assignment_vehicle and x.is_primary
            and x.effective_from<=v_seg_from
            and (x.effective_until is null or v_seg_from<x.effective_until)
          order by x.effective_from,x.id limit 1;
        elsif v_link_count=0 then
          v_category:='no_current_device_link';
        else
          v_category:='ambiguous_current_device_link';
        end if;
      end if;

      if v_category is not null then
        -- A gap may coalesce across unrelated event boundaries, but release
        -- and link gaps remain scoped to the exact enclosing authority rows.
        if v_group_category is distinct from v_category
          or (v_category in ('no_current_release','ambiguous_current_release',
              'no_current_device_link','ambiguous_current_device_link')
            and v_group_assignment_id is distinct from v_assignment_id)
          or (v_category in ('no_current_device_link','ambiguous_current_device_link')
            and v_group_release_id is distinct from v_release_id) then
          if v_group_category is not null and v_group_from<=p_now then
            perform public.m23_evaluate_scope_authority(p_ad_work_day_id,e.id,
              v_group_assignment_id,null,null,v_group_release_id,p_policy_id,p_policy_version,
              p_now,v_group_category,v_group_from,v_group_until);
            v_count:=v_count+1;
          end if;
          v_group_category:=v_category; v_group_from:=v_seg_from; v_group_until:=v_seg_until;
          v_group_assignment_id:=case when v_category in ('no_current_release','ambiguous_current_release','no_current_device_link','ambiguous_current_device_link') then v_assignment_id end;
          v_group_release_id:=case when v_category in ('no_current_device_link','ambiguous_current_device_link') then v_release_id end;
        else
          v_group_until:=v_seg_until;
        end if;
      else
        if v_group_category is not null and v_group_from<=p_now then
          perform public.m23_evaluate_scope_authority(p_ad_work_day_id,e.id,
            v_group_assignment_id,null,null,v_group_release_id,p_policy_id,p_policy_version,
            p_now,v_group_category,v_group_from,v_group_until);
          v_count:=v_count+1;
        end if;
        v_group_category:=null; v_group_from:=null; v_group_until:=null;
        v_group_assignment_id:=null; v_group_release_id:=null;
        if v_seg_from<=p_now then
          perform public.m23_evaluate_scope_authority(p_ad_work_day_id,e.id,
            v_assignment_id,v_link_id,v_device_id,v_release_id,p_policy_id,p_policy_version,
            p_now,null,null,null);
          v_count:=v_count+1;
        end if;
      end if;
    end loop;

    if v_group_category is not null and v_group_from<=p_now then
      perform public.m23_evaluate_scope_authority(p_ad_work_day_id,e.id,
        v_group_assignment_id,null,null,v_group_release_id,p_policy_id,p_policy_version,
        p_now,v_group_category,v_group_from,v_group_until);
      v_count:=v_count+1;
    end if;
  end loop;
  return v_count;
end;
$$;

create or replace function public.m23_enqueue_due_comparison_jobs(
  p_now timestamptz default clock_timestamp(), p_limit integer default 100
) returns integer language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  r record; v_count integer:=0; v_pass integer; v_found boolean:=false;
  v_cursor_work_day uuid; v_cursor_policy text; v_cursor_version text; v_cursor_job uuid;
  v_last_work_day uuid; v_last_policy text; v_last_version text; v_last_job uuid;
begin
  if p_limit not between 1 and 100 or p_now is null then raise exception 'Invalid bounded M23 due sweep' using errcode='22023'; end if;
  select cursor_ad_work_day_id,cursor_policy_id,cursor_policy_version,cursor_job_id
    into v_cursor_work_day,v_cursor_policy,v_cursor_version,v_cursor_job
    from public.m23_due_sweep_state where id=true for update skip locked;
  if not found then
    -- Another queue RPC owns the singleton cursor.  Do not wait for its
    -- transaction-scoped lock; this invocation can still claim pending work.
    return 0;
  end if;
  for v_pass in 1..2 loop
    for r in
      select j.* from public.m23_comparison_jobs j
      where j.state='completed'
        and (v_pass=2 or v_cursor_work_day is null
          or (j.ad_work_day_id,j.policy_id,j.policy_version,j.id)>
             (v_cursor_work_day,v_cursor_policy,v_cursor_version,v_cursor_job))
        and exists(
          select 1
          from public.m23_comparison_heads h
          join public.m23_comparison_snapshots s on s.id=h.snapshot_id
          join public.m23_comparison_policies p on p.policy_id=s.policy_id and p.policy_version=s.policy_version
          where h.policy_id=j.policy_id and h.policy_version=j.policy_version
            and s.ad_work_day_id=j.ad_work_day_id
            and (
              (s.overall_outcome='awaiting_sources' and s.scope_effective_from is not null
                and p_now>=s.scope_effective_from+make_interval(secs=>p.missing_source_grace_seconds))
              or (s.finality='provisional_active_work' and s.scope_effective_until is not null
                and p_now>=s.scope_effective_until)
              or (s.finality='provisional_backfill_open' and s.scope_effective_until is not null
                and p_now>=s.scope_effective_until+make_interval(secs=>p.backfill_window_seconds))
            )
        )
      order by j.ad_work_day_id,j.policy_id,j.policy_version,j.id
      for update skip locked limit p_limit
    loop
      v_found:=true; v_count:=v_count+1;
      update public.m23_comparison_jobs set
        requested_generation=requested_generation+1,
        dirty_after_claim=case when state='processing' then true else dirty_after_claim end,
        state='pending',next_attempt_at=p_now,completed_at=null,safe_failure_reason_code=null,
        updated_at=clock_timestamp()
      where id=r.id;
      v_last_work_day:=r.ad_work_day_id; v_last_policy:=r.policy_id;
      v_last_version:=r.policy_version; v_last_job:=r.id;
    end loop;
    exit when v_found or v_cursor_work_day is null;
    -- The cursor reached the end of the current ordering; wrap once so a
    -- later due job cannot be starved by an old cursor.
    v_cursor_work_day:=null; v_cursor_policy:=null; v_cursor_version:=null; v_cursor_job:=null;
  end loop;
  update public.m23_due_sweep_state set
    cursor_ad_work_day_id=case when v_found then v_last_work_day else null end,
    cursor_policy_id=case when v_found then v_last_policy else null end,
    cursor_policy_version=case when v_found then v_last_version else null end,
    cursor_job_id=case when v_found then v_last_job else null end,
    updated_at=clock_timestamp() where id=true;
  return v_count;
end;
$$;

create or replace function public.m23_process_comparison_queue(
  p_batch_size integer default 50,p_now timestamptz default clock_timestamp()
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare q public.m23_comparison_jobs%rowtype; v_claimed integer:=0; v_completed integer:=0;
  v_failed integer:=0; v_due integer:=0; v_generation bigint;
begin
  if p_batch_size not between 1 and 100 or p_now is null then raise exception 'Invalid bounded M23 comparison queue request' using errcode='22023'; end if;
  v_due:=public.m23_enqueue_due_comparison_jobs(p_now,100);
  for q in select * from public.m23_comparison_jobs
    where state in ('pending','processing') and next_attempt_at<=p_now and attempt_count<8
      and (state='pending' or locked_at<p_now-interval '5 minutes')
    order by next_attempt_at,created_at,id for update skip locked limit p_batch_size
  loop
    v_claimed:=v_claimed+1; v_generation:=q.requested_generation;
    update public.m23_comparison_jobs set state='processing',attempt_count=attempt_count+1,
      processing_generation=v_generation,dirty_after_claim=false,locked_at=p_now,updated_at=clock_timestamp()
      where id=q.id;
    begin
      perform public.m23_evaluate_work_day(q.ad_work_day_id,q.policy_id,q.policy_version,p_now);
      update public.m23_comparison_jobs set
        state=case when requested_generation>processing_generation then 'pending' else 'completed' end,
        completed_generation=processing_generation,dirty_after_claim=(requested_generation>processing_generation),
        completed_at=case when requested_generation>processing_generation then null else clock_timestamp() end,
        locked_at=null,safe_failure_reason_code=null,updated_at=clock_timestamp() where id=q.id;
      v_completed:=v_completed+1;
    exception when others then
      update public.m23_comparison_jobs set state=case when attempt_count>=8 then 'failed' else 'pending' end,
        next_attempt_at=p_now+make_interval(secs=>least(300,5*(2^least(attempt_count,6)))::integer),locked_at=null,
        safe_failure_reason_code=case when attempt_count>=8 then 'attempts_exhausted' else 'evaluation_failed' end,
        updated_at=clock_timestamp() where id=q.id;
      v_failed:=v_failed+1;
    end;
  end loop;
  return jsonb_build_object('claimed',v_claimed,'completed',v_completed,'retry_or_failed',v_failed,'due_enqueued',v_due);
end;
$$;

create or replace function public.m23_sync_mismatch_alert(
  p_snapshot_id uuid,p_outcome text,p_max_separation numeric,p_policy public.m23_comparison_policies
) returns void language plpgsql security definer set search_path = pg_catalog, public
as $$
declare s public.m23_comparison_snapshots%rowtype; a public.alerts%rowtype; c public.m23_comparison_alert_context%rowtype;
  v_key text; v_episode integer; v_alert_id uuid;
begin
  select * into strict s from public.m23_comparison_snapshots where id=p_snapshot_id;
  v_key:=public.m22_safe_digest(concat_ws('|','m23_comparison_mismatch',s.authority_scope_key,s.policy_id,s.policy_version));
  perform pg_advisory_xact_lock(hashtextextended(v_key,0));
  select * into a from public.alerts
    where dedupe_key=v_key and status::text not in ('resolved','false_alarm','ignored')
    order by episode_number desc,created_at desc,id desc limit 1 for update;
  if p_outcome='sustained_mismatch' then
    if a.id is null then
      select coalesce(max(episode_number),0)+1 into v_episode from public.alerts where dedupe_key=v_key;
      insert into public.alerts(ad_work_day_id,type,severity,status,message,created_at,source,dedupe_key,episode_number,
        condition_active,first_detected_at,last_detected_at,occurrence_count,vehicle_id,ad_work_id,assignment_id,
        assignment_history_id,execution_history_id,gps_device_id,gps_device_vehicle_link_id,synthetic,title,
        observed_value,threshold_value,value_unit,status_changed_at,updated_at,origin,m23_comparison_snapshot_id)
      values(s.ad_work_day_id,'mismatch'::public.alert_type,'warning','new','Sustained source separation detected. Review operational evidence.',clock_timestamp(),
        'comparison',v_key,v_episode,true,s.sustained_first_pair_at,s.sustained_last_pair_at,1,s.vehicle_id,s.ad_work_id,null,
        s.assignment_history_id,s.execution_history_id,s.gps_device_id,s.gps_device_vehicle_link_id,s.synthetic,
        'Sustained comparison mismatch',p_max_separation,p_policy.sustained_mismatch_distance_meters,'meters',clock_timestamp(),clock_timestamp(),
        'm22_rule_engine',s.id) returning id into v_alert_id;
      insert into public.alert_status_history(alert_id,previous_status,new_status,actor_type,reason,note,transition_at,safe_source)
        values(v_alert_id,null,'new','service','condition_opened','Sustained comparison evidence requires admin operational follow-up.',clock_timestamp(),'rule_engine');
      insert into public.m23_comparison_alert_context(alert_id,policy_id,policy_version,first_snapshot_id,last_snapshot_id,authority_scope_key,synthetic)
        values(v_alert_id,s.policy_id,s.policy_version,s.id,s.id,s.authority_scope_key,s.synthetic);
      insert into public.audit_logs(actor_type,action,entity_type,entity_id,safe_details)
        values('system','m23_comparison_alert_opened','alert',v_alert_id,jsonb_build_object('snapshot_id',s.id,'policy_version',s.policy_version));
    else
      select * into c from public.m23_comparison_alert_context
        where alert_id=a.id and authority_scope_key=s.authority_scope_key
          and policy_id=s.policy_id and policy_version=s.policy_version for update;
      if c.alert_id is null then raise exception 'M23 comparison alert context missing' using errcode='P0002'; end if;
      update public.alerts set condition_active=true,condition_cleared_at=null,last_detected_at=greatest(last_detected_at,s.sustained_last_pair_at),
        occurrence_count=least(occurrence_count+1,1000000000),m23_comparison_snapshot_id=s.id,synthetic=a.synthetic and s.synthetic,updated_at=clock_timestamp()
        where id=a.id;
      update public.m23_comparison_alert_context set last_snapshot_id=s.id,updated_at=clock_timestamp() where alert_id=a.id;
      insert into public.audit_logs(actor_type,action,entity_type,entity_id,safe_details)
        values('system','m23_comparison_alert_occurrence_updated','alert',a.id,jsonb_build_object('snapshot_id',s.id));
    end if;
  elsif p_outcome='paired_match' and s.acceptable_pair_count>=p_policy.minimum_pair_count
    and s.mismatch_candidate_count=0 then
    select ctx.* into c from public.m23_comparison_alert_context ctx
      join public.alerts ax on ax.id=ctx.alert_id
      where ctx.authority_scope_key=s.authority_scope_key and ctx.policy_id=s.policy_id
        and ctx.policy_version=s.policy_version and ax.condition_active
        and ax.status::text not in ('resolved','false_alarm','ignored')
      order by ax.episode_number desc,ax.created_at desc,ax.id desc limit 1 for update of ctx;
    if c.alert_id is not null then
      select * into a from public.alerts where id=c.alert_id for update;
      if a.condition_active and a.status::text not in ('resolved','false_alarm','ignored')
        and s.generated_at>coalesce(a.last_detected_at,'-infinity'::timestamptz) then
        update public.alerts set condition_active=false,condition_cleared_at=clock_timestamp(),m23_comparison_snapshot_id=s.id,updated_at=clock_timestamp() where id=a.id;
        update public.m23_comparison_alert_context set cleared_by_snapshot_id=s.id,updated_at=clock_timestamp() where alert_id=a.id;
        insert into public.audit_logs(actor_type,action,entity_type,entity_id,safe_details)
          values('system','m23_comparison_alert_condition_cleared','alert',a.id,jsonb_build_object('snapshot_id',s.id,'outcome','paired_match'));
      end if;
    end if;
  else
    insert into public.audit_logs(actor_type,action,entity_type,entity_id,safe_details)
      values('system','m23_comparison_inconclusive_observed','m23_comparison',s.id,jsonb_build_object('outcome',p_outcome,'scope',s.authority_scope_key));
  end if;
end;
$$;

-- Final RPC definitions are deliberately last in this still-unmerged
-- migration so the M22 queue and M23 admin surfaces share the corrected
-- privacy/lifecycle contracts.
create or replace function public.admin_get_m23_comparison_detail_v1(p_snapshot_id uuid)
returns jsonb language plpgsql security definer stable set search_path = pg_catalog, public
as $$
declare v_result jsonb;
begin
  perform public.m20a_require_admin();
  select jsonb_build_object('contractVersion','m23-admin-v1','comparison',jsonb_build_object(
    'snapshotId',s.id,'adWorkDayId',s.ad_work_day_id,'adWorkId',s.ad_work_id,
    'workLabel',aw.title||' · '||wd.work_date::text,'policyVersion',s.policy_version,
    'pairingAlgorithmVersion',s.pairing_algorithm_version,'sourceExpectation',s.source_expectation,
    'overallOutcome',s.overall_outcome,'reviewStatus',coalesce(rv.status,'not_reviewed'),'finality',s.finality,
    'phoneEligibleCount',s.phone_eligible_count,'physicalEligibleCount',s.physical_eligible_count,
    'pairCount',s.pair_count,'acceptablePairCount',s.acceptable_pair_count,'matchCount',s.match_count,
    'mismatchCandidateCount',s.mismatch_candidate_count,'insufficientQualityCount',s.insufficient_quality_count,
    'unpairedPhoneCount',s.unpaired_phone_count,'unpairedPhysicalCount',s.unpaired_physical_count,
    'sustainedPairCount',s.sustained_pair_count,'sustainedFirstPairAt',s.sustained_first_pair_at,
    'sustainedLastPairAt',s.sustained_last_pair_at,'synthetic',s.synthetic,'generatedAt',s.generated_at,
    'safeReasonCode',s.safe_reason_code,'inputWatermark',s.input_watermark,'technicalValuesAvailable',exists(select 1 from public.m23_comparison_pairs x
      where x.snapshot_id=s.id)),
    'reviewHistory',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'previousStatus',h.previous_status,
      'newStatus',h.new_status,'reason',h.reason,'note',h.note,'createdAt',h.created_at) order by h.created_at desc)
      from public.m23_comparison_review_history h where h.snapshot_id=s.id),'[]'::jsonb),
    'alert',(select jsonb_build_object('id',a.id,'status',a.status,'conditionActive',a.condition_active,
      'occurrenceCount',a.occurrence_count) from public.alerts a where a.m23_comparison_snapshot_id=s.id order by a.updated_at desc limit 1)
  ) into v_result from public.m23_comparison_snapshots s join public.ad_work_days wd on wd.id=s.ad_work_day_id
    join public.ad_works aw on aw.id=s.ad_work_id left join public.m23_comparison_reviews rv on rv.snapshot_id=s.id
  where s.id=p_snapshot_id and s.build_complete;
  if v_result is null then raise exception 'M23 comparison not found' using errcode='P0002'; end if;
  return v_result;
end;
$$;

create or replace function public.admin_get_m23_comparison_technical_values_v1(
  p_snapshot_id uuid,p_after_cursor text,p_limit integer
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_actor uuid:=public.m20a_require_admin(); s public.m23_comparison_snapshots%rowtype;
  p public.m23_comparison_policies%rowtype; v_pairs jsonb; v_more boolean:=false; v_next text:=null;
  v_cursor_at timestamptz; v_cursor_physical timestamptz; v_cursor_id text; v_last jsonb;
begin
  if p_limit not between 1 and 100 then raise exception 'Invalid bounded M23 technical-value limit' using errcode='22023'; end if;
  select * into strict s from public.m23_comparison_snapshots where id=p_snapshot_id and build_complete;
  select * into strict p from public.m23_comparison_policies where policy_id=s.policy_id and policy_version=s.policy_version;
  if p_after_cursor is not null then
    begin
      v_cursor_at:=split_part(convert_from(decode(p_after_cursor,'base64'),'utf8'),'|',1)::timestamptz;
      v_cursor_physical:=split_part(convert_from(decode(p_after_cursor,'base64'),'utf8'),'|',2)::timestamptz;
      v_cursor_id:=split_part(convert_from(decode(p_after_cursor,'base64'),'utf8'),'|',3);
      if v_cursor_at is null or v_cursor_physical is null or char_length(v_cursor_id)<>64 then raise exception 'bad cursor'; end if;
    exception when others then raise exception 'Invalid M23 technical-value cursor' using errcode='22023'; end;
  end if;
  insert into public.audit_logs(actor_type,actor_id,action,entity_type,entity_id,safe_details)
    values('admin',v_actor,'m23_comparison_technical_values_viewed','m23_comparison',p_snapshot_id,
      jsonb_build_object('contract_version','m23-admin-v1','limit',p_limit,'has_cursor',p_after_cursor is not null));
  select coalesce(jsonb_agg(jsonb_build_object('pairId',x.pair_identity,'phoneCapturedAt',x.phone_captured_at,
      'physicalCapturedAt',x.physical_captured_at,'timeDifferenceMilliseconds',x.time_difference_milliseconds,
      'rawHaversineDistanceMeters',x.raw_haversine_distance_meters,'conservativeSeparationMeters',x.conservative_separation_meters,
      'phoneAccuracyMeters',x.phone_accuracy_meters,'physicalDeviceAccuracyMeters',x.physical_device_accuracy_meters,
      'threshold',p.sustained_mismatch_distance_meters,'quality',x.quality,'outcome',x.outcome,
      'policyVersion',s.policy_version,'synthetic',x.synthetic) order by x.phone_captured_at,x.physical_captured_at,x.pair_identity),'[]'::jsonb)
    into v_pairs from (select x.* from public.m23_comparison_pairs x
      where x.snapshot_id=s.id
        and (p_after_cursor is null or x.phone_captured_at>v_cursor_at
          or (x.phone_captured_at=v_cursor_at and x.physical_captured_at>v_cursor_physical)
          or (x.phone_captured_at=v_cursor_at and x.physical_captured_at=v_cursor_physical and x.pair_identity>v_cursor_id))
      order by x.phone_captured_at,x.physical_captured_at,x.pair_identity
      limit least(p_limit+1,s.pair_count+1)) x;
  if jsonb_array_length(v_pairs)>p_limit then
    v_more:=true; v_last:=v_pairs->(p_limit-1);
    v_next:=encode(convert_to((v_last->>'phoneCapturedAt')||'|'||(v_last->>'physicalCapturedAt')||'|'||(v_last->>'pairId'),'utf8'),'base64');
    select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) into v_pairs from jsonb_array_elements(v_pairs) with ordinality where ordinality<=p_limit;
  end if;
  return jsonb_build_object('contractVersion','m23-admin-v1','snapshotId',s.id,'policyVersion',s.policy_version,
    'threshold',p.sustained_mismatch_distance_meters,'accessedAt',clock_timestamp(),'pairs',v_pairs,'hasMore',v_more,'nextCursor',v_next);
end;
$$;
create or replace function public.admin_get_m23_comparison_technical_values_v1(p_snapshot_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$ begin return public.admin_get_m23_comparison_technical_values_v1(p_snapshot_id,null,100); end; $$;

create or replace function public.admin_transition_m23_comparison_review(
  p_snapshot_id uuid,p_new_status text,p_reason text,p_note text
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_actor uuid:=public.m20a_require_admin(); v_previous text;
begin
  if p_new_status not in ('reviewing','reviewed_consistent','reviewed_needs_follow_up','dismissed_insufficient_evidence')
    or p_reason is null or char_length(trim(p_reason)) not between 1 and 160
    or p_note is null or char_length(trim(p_note)) not between 1 and 500 then raise exception 'Invalid M23 review transition' using errcode='22023'; end if;
  perform 1 from public.m23_comparison_snapshots where id=p_snapshot_id and build_complete;
  if not found then raise exception 'M23 comparison not found' using errcode='P0002'; end if;
  insert into public.m23_comparison_reviews(snapshot_id,status) values(p_snapshot_id,'not_reviewed') on conflict do nothing;
  select status into v_previous from public.m23_comparison_reviews where snapshot_id=p_snapshot_id for update;
  if v_previous='dismissed_insufficient_evidence' then raise exception 'M23 review is terminal' using errcode='55000'; end if;
  if p_new_status=v_previous then raise exception 'M23 review transition is a no-op' using errcode='55000'; end if;
  if not ((v_previous='not_reviewed' and p_new_status in ('reviewing','reviewed_consistent','reviewed_needs_follow_up','dismissed_insufficient_evidence'))
    or (v_previous='reviewing' and p_new_status in ('reviewed_consistent','reviewed_needs_follow_up','dismissed_insufficient_evidence'))
    or (v_previous='reviewed_consistent' and p_new_status in ('reviewing','reviewed_needs_follow_up','dismissed_insufficient_evidence'))
    or (v_previous='reviewed_needs_follow_up' and p_new_status in ('reviewing','reviewed_consistent','dismissed_insufficient_evidence'))) then raise exception 'Blocked M23 review transition' using errcode='55000'; end if;
  insert into public.m23_comparison_review_history(snapshot_id,previous_status,new_status,actor_admin_id,reason,note)
    values(p_snapshot_id,v_previous,p_new_status,v_actor,trim(p_reason),trim(p_note));
  update public.m23_comparison_reviews set status=p_new_status,updated_by=v_actor,updated_at=clock_timestamp() where snapshot_id=p_snapshot_id;
  insert into public.audit_logs(actor_type,actor_id,action,entity_type,entity_id,safe_details)
    values('admin',v_actor,'m23_comparison_review_transitioned','m23_comparison',p_snapshot_id,jsonb_build_object('previous_status',v_previous,'new_status',p_new_status));
  return jsonb_build_object('contractVersion','m23-admin-v1','snapshotId',p_snapshot_id,'reviewStatus',p_new_status);
end;
$$;

create or replace function public.admin_list_m22_alerts_v1(
  p_status text default null,p_severity text default null,p_rule_id text default null,p_source text default null,
  p_gps_device_id uuid default null,p_vehicle_id uuid default null,p_ad_work_id uuid default null,
  p_synthetic boolean default null,p_condition_active boolean default null,p_limit integer default 100
) returns jsonb language plpgsql security definer stable set search_path = pg_catalog, public
as $$
declare v_rows jsonb;
begin
  perform public.m20a_require_admin();
  if p_limit not between 1 and 200 then raise exception 'Invalid bounded limit' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'ruleId',case when a.source='comparison' then 'phone_physical_sustained_mismatch' else a.rule_id end,
    'ruleVersion',case when a.source='comparison' then null else a.rule_version end,'title',a.title,'message',a.message,'severity',a.severity,
    'status',a.status,'source',a.source,'deviceLabel',gd.device_code,'vehicleLabel',v.vehicle_number,'firstDetectedAt',a.first_detected_at,
    'lastDetectedAt',a.last_detected_at,'conditionActive',a.condition_active,'conditionClearedAt',a.condition_cleared_at,
    'occurrenceCount',a.occurrence_count,'synthetic',a.synthetic) order by a.last_detected_at desc,a.id),'[]'::jsonb) into v_rows
  from public.alerts a left join public.gps_devices gd on gd.id=a.gps_device_id left join public.vehicles v on v.id=a.vehicle_id
    left join public.ad_work_days wd on wd.id=a.ad_work_day_id
  where (a.rule_id is not null or a.source='comparison') and (p_status is null or a.status::text=p_status)
    and (p_severity is null or a.severity::text=p_severity) and (p_rule_id is null or (case when a.source='comparison' then 'phone_physical_sustained_mismatch' else a.rule_id end)=p_rule_id)
    and (p_source is null or a.source=p_source) and (p_gps_device_id is null or a.gps_device_id=p_gps_device_id)
    and (p_vehicle_id is null or a.vehicle_id=p_vehicle_id) and (p_ad_work_id is null or coalesce(a.ad_work_id,wd.ad_work_id)=p_ad_work_id)
    and (p_synthetic is null or a.synthetic=p_synthetic) and (p_condition_active is null or a.condition_active=p_condition_active);
  return jsonb_build_object('contractVersion','m22-admin-v1','rows',v_rows);
end;
$$;

create or replace function public.admin_get_m22_alert_detail_v1(p_alert_id uuid)
returns jsonb language plpgsql security definer stable set search_path = pg_catalog, public
as $$
declare v_result jsonb;
begin
  perform public.m20a_require_admin();
  select jsonb_build_object('contractVersion','m22-admin-v1','alert',jsonb_build_object('id',a.id,
    'ruleId',case when a.source='comparison' then 'phone_physical_sustained_mismatch' else a.rule_id end,
    'ruleVersion',case when a.source='comparison' then null else a.rule_version end,'title',a.title,'message',a.message,
    'severity',a.severity,'status',a.status,'source',a.source,'firstDetectedAt',a.first_detected_at,'lastDetectedAt',a.last_detected_at,
    'conditionActive',a.condition_active,'conditionClearedAt',a.condition_cleared_at,'occurrenceCount',a.occurrence_count,'synthetic',a.synthetic),
    'statusHistory',coalesce((select jsonb_agg(to_jsonb(h) order by h.transition_at) from public.alert_status_history h where h.alert_id=a.id),'[]'::jsonb),
    'notes',coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at) from public.alert_notes n where n.alert_id=a.id),'[]'::jsonb),
    'assessments',case when a.source='comparison' then '[]'::jsonb else '[]'::jsonb end,
    'allowedTransitions',case a.status::text when 'new' then '["acknowledged","investigating","resolved","false_alarm","ignored"]'::jsonb when 'acknowledged' then '["investigating","resolved","false_alarm","ignored"]'::jsonb when 'investigating' then '["resolved","false_alarm","ignored"]'::jsonb else '[]'::jsonb end,
    'technicalValuesAvailable',false) into v_result from public.alerts a where a.id=p_alert_id and (a.rule_id is not null or a.source='comparison');
  if v_result is null then raise exception 'M22 alert not found' using errcode='P0002'; end if;
  return v_result;
end;
$$;

revoke all on function public.admin_get_m23_comparison_technical_values_v1(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.admin_get_m23_comparison_technical_values_v1(uuid,text,integer) to authenticated;
grant execute on function public.admin_get_m23_comparison_technical_values_v1(uuid) to authenticated;

revoke all on function public.m23_enqueue_due_comparison_jobs(timestamptz,integer) from public,anon,authenticated;
grant execute on function public.m23_enqueue_due_comparison_jobs(timestamptz,integer) to service_role;

-- Preserve the complete M22 admin detail contract while projecting the M23
-- queue row through the same lifecycle.  M23 technical values remain behind
-- the explicit M23 RPC and never enter this response.
create or replace function public.admin_get_m22_alert_detail_v1(p_alert_id uuid)
returns jsonb language plpgsql security definer stable set search_path = pg_catalog, public
as $$
declare v_result jsonb;
begin
  perform public.m20a_require_admin();
  select jsonb_build_object(
    'contractVersion','m22-admin-v1',
    'alert',jsonb_build_object('id',a.id,'ruleId',case when a.source='comparison' then 'phone_physical_sustained_mismatch' else a.rule_id end,
      'ruleVersion',case when a.source='comparison' then null else a.rule_version end,'title',a.title,'message',a.message,
      'severity',a.severity,'status',a.status,'source',a.source,'deviceLabel',gd.device_code,'vehicleLabel',v.vehicle_number,
      'workLabel',case when aw.id is null then null else aw.title||coalesce(' Â· '||wd.work_date::text,'') end,
      'firstDetectedAt',a.first_detected_at,'lastDetectedAt',a.last_detected_at,'conditionActive',a.condition_active,
      'conditionClearedAt',a.condition_cleared_at,'occurrenceCount',a.occurrence_count,'synthetic',a.synthetic),
    'statusHistory',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'previousStatus',h.previous_status,'newStatus',h.new_status,
      'reason',h.reason,'note',h.note,'transitionAt',h.transition_at) order by h.transition_at)
      from (select * from public.alert_status_history where alert_id=a.id order by transition_at desc limit 100) h),'[]'::jsonb),
    'notes',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'reason',n.reason,'note',n.note,'createdAt',n.created_at) order by n.created_at)
      from (select * from public.alert_notes where alert_id=a.id order by created_at desc limit 100) n),'[]'::jsonb),
    'assessments',case when a.source='comparison' then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'ruleId',x.rule_id,
      'ruleVersion',x.rule_version,'outcome',x.outcome,'reasonCode',x.reason_code,'evidenceTiming',x.evidence_timing,'assessedAt',x.assessed_at) order by x.assessed_at desc)
      from (select * from public.m22_rule_assessments where alert_id=a.id order by assessed_at desc limit 100) x),'[]'::jsonb) end,
    'auditHistory',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'action',l.action,'createdAt',l.created_at) order by l.created_at desc)
      from (select id,action,created_at from public.audit_logs where entity_type='alert' and entity_id=a.id order by created_at desc limit 100) l),'[]'::jsonb),
    'allowedTransitions',case a.status::text when 'new' then '["acknowledged","investigating","resolved","false_alarm","ignored"]'::jsonb
      when 'acknowledged' then '["investigating","resolved","false_alarm","ignored"]'::jsonb
      when 'investigating' then '["resolved","false_alarm","ignored"]'::jsonb else '[]'::jsonb end,
    'technicalValuesAvailable',case when a.source='comparison' then false else exists(select 1 from public.m22_rule_assessments x
      where x.alert_id=a.id and (x.observed_value is not null or x.threshold_value is not null)) end
  ) into v_result from public.alerts a left join public.gps_devices gd on gd.id=a.gps_device_id
    left join public.vehicles v on v.id=a.vehicle_id left join public.ad_work_days wd on wd.id=a.ad_work_day_id
    left join public.ad_works aw on aw.id=coalesce(a.ad_work_id,wd.ad_work_id)
  where a.id=p_alert_id and (a.rule_id is not null or a.source='comparison');
  if v_result is null then raise exception 'M22 alert not found' using errcode='P0002'; end if;
  return v_result;
end;
$$;
