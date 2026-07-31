begin;
create extension if not exists pgtap with schema extensions;
select plan(59);

insert into public.user_profiles (auth_user_id, display_name, role)
values
  ('42000000-0000-0000-0000-000000000001', 'M22 Behavior Admin', 'admin'),
  ('42000000-0000-0000-0000-000000000002', 'M22 Behavior Staff', 'staff');

create function pg_temp.m22_signal(p_label text, p_at timestamptz)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.m22_rule_signals(
    signal_key,signal_kind,reason_code,occurred_at,adapter_id
  ) values(
    public.m22_safe_digest('behavior|'||p_label),'adapter_rejection',
    'invalid_coordinate',p_at,'m22.behavior'
  ) returning id into v_id;
  return v_id;
end;
$$;

create temp table m22_behavior_ids(label text primary key,id uuid not null);
insert into m22_behavior_ids values
  ('version-open',pg_temp.m22_signal('version-open','2029-12-31 23:59:00+00')),
  ('version-repeat',pg_temp.m22_signal('version-repeat','2030-01-01 00:01:00+00')),
  ('open',pg_temp.m22_signal('open','2026-07-29 01:00:00+00')),
  ('repeat',pg_temp.m22_signal('repeat','2026-07-29 01:01:00+00')),
  ('clear',pg_temp.m22_signal('clear','2026-07-29 01:02:00+00')),
  ('older',pg_temp.m22_signal('older','2026-07-29 01:01:30+00')),
  ('reactivate',pg_temp.m22_signal('reactivate','2026-07-29 01:03:00+00')),
  ('episode-two',pg_temp.m22_signal('episode-two','2026-07-29 01:04:00+00')),
  ('threshold-1',pg_temp.m22_signal('threshold-1','2026-07-29 02:00:00+00')),
  ('threshold-2',pg_temp.m22_signal('threshold-2','2026-07-29 02:00:15+00')),
  ('threshold-clear',pg_temp.m22_signal('threshold-clear','2026-07-29 02:00:20+00')),
  ('threshold-after-clear',pg_temp.m22_signal('threshold-after-clear','2026-07-29 02:00:30+00')),
  ('window-1',pg_temp.m22_signal('window-1','2026-07-29 03:00:00+00')),
  ('window-2',pg_temp.m22_signal('window-2','2026-07-29 03:05:01+00')),
  ('gps-1',pg_temp.m22_signal('gps-1','2026-07-29 04:00:00+00')),
  ('gps-before',pg_temp.m22_signal('gps-before','2026-07-29 04:01:59+00')),
  ('gps-exact',pg_temp.m22_signal('gps-exact','2026-07-29 04:02:00+00'));
grant select on m22_behavior_ids to authenticated,service_role;

select is(
  (public.m22_policy_at('heartbeat_missing','2026-07-28 00:00:00+00')).rule_version,
  'm22-pilot-v1','policy is effective at its inclusive lower boundary');
select is(
  (public.m22_policy_at('heartbeat_missing','2026-07-27 23:59:59.999999+00')).rule_version,
  null::text,'policy is absent immediately before its lower boundary');
select throws_ok(
  $$insert into public.m22_rule_policies(
      rule_id,rule_version,effective_from,default_severity,opening_threshold,
      clearing_threshold,window_seconds,required_count,cooldown_seconds,value_unit,
      evaluation_source,evidence_timing,safe_policy_note
    ) values('heartbeat_missing','m22-overlap-test','2029-01-01+00','warning',
      120,30,120,1,120,'seconds','health_sweep','live_only',
      'Provisional overlap test.')$$,
  '23P01',null,'overlapping enabled policy versions are rejected');
select throws_ok(
  $$insert into public.m22_rule_policies(
      rule_id,rule_version,effective_from,default_severity,opening_threshold,
      clearing_threshold,window_seconds,required_count,cooldown_seconds,value_unit,
      evaluation_source,evidence_timing,safe_policy_note
    ) values('sequence_gap','m22-negative-test','2031-01-01+00','warning',
      -1,0,300,1,0,'count','telemetry_receipt','live_or_historical',
      'Provisional invalid threshold test.')$$,
  '23514',null,'negative policy thresholds are rejected');
select throws_ok(
  $$insert into public.m22_rule_policies(
      rule_id,rule_version,effective_from,default_severity,opening_threshold,
      clearing_threshold,window_seconds,required_count,cooldown_seconds,value_unit,
      evaluation_source,evidence_timing,safe_policy_note
    ) values('sequence_gap','m22-missing-test','2031-01-01+00','warning',
      null,0,300,1,0,'count','telemetry_receipt','live_or_historical',
      'Provisional missing threshold test.')$$,
  '23514',null,'missing required policy thresholds are rejected');
select throws_ok(
  $$insert into public.m22_rule_policies(
      rule_id,rule_version,effective_from,default_severity,opening_threshold,
      clearing_threshold,window_seconds,required_count,cooldown_seconds,value_unit,
      evaluation_source,evidence_timing,safe_policy_note
    ) values('sequence_gap','m22-unit-test','2031-01-01+00','warning',
      1,0,300,1,0,'vendor_units','telemetry_receipt','live_or_historical',
      'Provisional unsupported unit test.')$$,
  '23514',null,'unsupported policy units are rejected');
select throws_ok(
  $$update public.m22_rule_policies set opening_threshold=121
    where rule_id='sequence_gap' and rule_version='m22-pilot-v1'$$,
  '55000','M22 rule policies are immutable except for one interval closure',
  'policy values cannot be silently rewritten');
select lives_ok(
  $$update public.m22_rule_policies set effective_until='2030-01-01 00:00:00+00'
    where rule_id='sequence_gap' and rule_version='m22-pilot-v1'$$,
  'an open policy interval may be closed once');
select lives_ok(
  $$insert into public.m22_rule_policies(
      rule_id,rule_version,effective_from,default_severity,opening_threshold,
      clearing_threshold,window_seconds,required_count,cooldown_seconds,value_unit,
      evaluation_source,evidence_timing,safe_policy_note
    ) values('sequence_gap','m22-pilot-v2','2030-01-01 00:00:00+00','critical',
      2,0,300,1,300,'count','telemetry_receipt','live_or_historical',
      'Provisional second-version boundary test; not production approval.')$$,
  'a new policy can start at the exact closed boundary');
select is(
  (public.m22_policy_at('sequence_gap','2029-12-31 23:59:59.999999+00')).rule_version,
  'm22-pilot-v1','old policy applies immediately before the boundary');
select is(
  (public.m22_policy_at('sequence_gap','2030-01-01 00:00:00+00')).rule_version,
  'm22-pilot-v2','new policy applies at the exact boundary');

insert into m22_behavior_ids
select 'version-alert',public.m22_apply_rule_observation(
  (select id from m22_behavior_ids where label='version-open'),
  'sequence_gap','2029-12-31 23:59:00+00','physical_device_live','version-context'
);
select is(
  (select rule_version from public.alerts
    where id=(select id from m22_behavior_ids where label='version-alert')),
  'm22-pilot-v1','new alert records the exact effective policy version');
select is(
  public.m22_apply_rule_observation(
    (select id from m22_behavior_ids where label='version-repeat'),
    'sequence_gap','2030-01-01 00:01:00+00','physical_device_live','version-context'
  ),
  (select id from m22_behavior_ids where label='version-alert'),
  'active episode remains one alert across a policy boundary');
select is(
  (select rule_version from public.alerts
    where id=(select id from m22_behavior_ids where label='version-alert')),
  'm22-pilot-v1','active alert is not reinterpreted under the later policy');

insert into m22_behavior_ids
select 'alert-one',public.m22_apply_rule_observation(
  (select id from m22_behavior_ids where label='open'),
  'invalid_coordinate','2026-07-29 01:00:00+00','adapter_rejection','adapter-context'
);
select is(
  (select count(*)::integer from public.alerts
    where rule_id='invalid_coordinate' and dedupe_key=public.m22_safe_digest(
      'invalid_coordinate|adapter_rejection|adapter-context')),
  1,'first observation creates one alert');
select ok(
  (select occurrence_count=1 and condition_active and status='new'
    and episode_number=1 and rule_version='m22-pilot-v1'
    from public.alerts where id=(select id from m22_behavior_ids where label='alert-one')),
  'new alert records episode, occurrence, condition, status, and version');
select is(
  public.m22_apply_rule_observation(
    (select id from m22_behavior_ids where label='repeat'),
    'invalid_coordinate','2026-07-29 01:01:00+00','adapter_rejection',
    'adapter-context',null,null,2,'critical'
  ),
  (select id from m22_behavior_ids where label='alert-one'),
  'repeat returns the same active episode');
select ok(
  (select occurrence_count=2 and severity='critical'
    and first_detected_at='2026-07-29 01:00:00+00'
    and last_detected_at='2026-07-29 01:01:00+00'
    from public.alerts where id=(select id from m22_behavior_ids where label='alert-one')),
  'repeat updates count, severity, and last time without rewriting first time');
select is(
  (select count(*)::integer from public.audit_logs
    where entity_id=(select id from m22_behavior_ids where label='alert-one')
      and action='alert_severity_escalated'),
  1,'severity escalation has a distinct audit event');
select is(
  public.m22_clear_rule_condition(
    (select id from m22_behavior_ids where label='clear'),
    'invalid_coordinate','adapter_rejection','adapter-context',
    '2026-07-29 01:02:00+00'
  ),
  (select id from m22_behavior_ids where label='alert-one'),
  'clear targets the active episode');
select ok(
  (select not condition_active and condition_cleared_at='2026-07-29 01:02:00+00'
    from public.alerts where id=(select id from m22_behavior_ids where label='alert-one')),
  'clear records inactive condition and clear time');
select is(
  (select occurrence_count from public.alerts
    where id=(select id from m22_behavior_ids where label='alert-one')),
  2,'clear preserves historical occurrences');
select lives_ok(
  format('select public.m22_apply_rule_observation(%L,%L,%L,%L,%L)',
    (select id from m22_behavior_ids where label='older'),
    'invalid_coordinate','2026-07-29 01:01:30+00','adapter_rejection','adapter-context'),
  'older late observation is retained');
select ok(
  (select not condition_active and condition_cleared_at='2026-07-29 01:02:00+00'
    from public.alerts where id=(select id from m22_behavior_ids where label='alert-one')),
  'observation older than the clear cannot reactivate current state');
select is(
  public.m22_apply_rule_observation(
    (select id from m22_behavior_ids where label='reactivate'),
    'invalid_coordinate','2026-07-29 01:03:00+00','adapter_rejection','adapter-context'
  ),
  (select id from m22_behavior_ids where label='alert-one'),
  'newer recurrence before terminal review reuses the episode');
select ok(
  (select condition_active and condition_cleared_at is null and occurrence_count=4
    from public.alerts where id=(select id from m22_behavior_ids where label='alert-one')),
  'newer recurrence reactivates while preserving occurrence history');

set local role authenticated;
select set_config('request.jwt.claim.sub','42000000-0000-0000-0000-000000000002',true);
select throws_ok(
  format('select public.admin_transition_alert(%L,%L,%L,%L)',
    (select id from m22_behavior_ids where label='alert-one'),
    'acknowledged','review','safe note'),
  '42501','Admin access required','non-admin cannot transition alerts');
select set_config('request.jwt.claim.sub','42000000-0000-0000-0000-000000000001',true);
select throws_ok(
  format('select public.admin_transition_alert(%L,%L,%L,%L)',
    (select id from m22_behavior_ids where label='alert-one'),
    'acknowledged','','safe note'),
  '22023','Bounded reason and note are required','transition requires bounded reason');
select lives_ok(
  format('select public.admin_transition_alert(%L,%L,%L,%L)',
    (select id from m22_behavior_ids where label='alert-one'),
    'acknowledged','triage','safe acknowledgement'),
  'admin can acknowledge');
select lives_ok(
  format('select public.admin_transition_alert(%L,%L,%L,%L)',
    (select id from m22_behavior_ids where label='alert-one'),
    'investigating','investigation','safe investigation'),
  'admin can investigate');
select lives_ok(
  format('select public.admin_transition_alert(%L,%L,%L,%L)',
    (select id from m22_behavior_ids where label='alert-one'),
    'resolved','resolved','safe resolution'),
  'admin can resolve');
select is(
  (select string_agg(new_status::text,',' order by transition_at)
    from public.alert_status_history
    where alert_id=(select id from m22_behavior_ids where label='alert-one')),
  'new,acknowledged,investigating,resolved',
  'history records the ordered transition chain');
select throws_ok(
  format('select public.admin_transition_alert(%L,%L,%L,%L)',
    (select id from m22_behavior_ids where label='alert-one'),
    'acknowledged','reopen','not allowed'),
  '55000','Terminal alerts cannot be reopened in place',
  'terminal lifecycle state cannot reopen');
reset role;

insert into m22_behavior_ids
select 'alert-two',public.m22_apply_rule_observation(
  (select id from m22_behavior_ids where label='episode-two'),
  'invalid_coordinate','2026-07-29 01:04:00+00','adapter_rejection','adapter-context'
);
select isnt(
  (select id from m22_behavior_ids where label='alert-two'),
  (select id from m22_behavior_ids where label='alert-one'),
  'terminal recurrence creates a new episode');
select ok(
  (select count(*)=2 and max(episode_number)=2
    and count(*) filter(where status in ('new','acknowledged','investigating'))=1
    from public.alerts where rule_id='invalid_coordinate'
      and dedupe_key=public.m22_safe_digest(
        'invalid_coordinate|adapter_rejection|adapter-context')),
  'terminal recurrence leaves at most one active episode');

create function pg_temp.m22_direct_lifecycle_denied(p_alert_id uuid)
returns boolean language plpgsql as $$
begin
  execute format('update public.alerts set status=%L where id=%L',
    'resolved',p_alert_id);
  return false;
exception when insufficient_privilege then
  return sqlerrm in (
    'Alert lifecycle requires the admin RPC',
    'permission denied for table alerts'
  );
end;
$$;
set local role service_role;
select set_config('app.m22_admin_lifecycle','on',true);
select ok(
  pg_temp.m22_direct_lifecycle_denied(
    (select id from m22_behavior_ids where label='alert-two')),
  'service role cannot impersonate an admin decision with a custom GUC');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','42000000-0000-0000-0000-000000000001',true);
select lives_ok(
  format('select public.admin_add_alert_note(%L,%L,%L)',
    (select id from m22_behavior_ids where label='alert-two'),
    'evidence','bounded safe technical note'),
  'admin can add a bounded note');
reset role;
select throws_ok(
  $$update public.alert_notes set note='mutated'$$,
  '55000','M22 evidence is immutable','notes are immutable');
select throws_ok(
  $$update public.alert_status_history set note='mutated'$$,
  '55000','M22 evidence is immutable','status history is immutable');

select is(public.m22_condition_threshold_met(
  (select id from m22_behavior_ids where label='threshold-1'),
  'battery_low','physical_device_live','threshold-context',
  '2026-07-29 02:00:00+00'),false,'first sample stays below required count');
select is(public.m22_condition_threshold_met(
  (select id from m22_behavior_ids where label='threshold-2'),
  'battery_low','physical_device_live','threshold-context',
  '2026-07-29 02:00:15+00'),true,'second sample reaches required count');
select lives_ok(
  format('select public.m22_clear_rule_condition(%L,%L,%L,%L,%L)',
    (select id from m22_behavior_ids where label='threshold-clear'),
    'battery_low','physical_device_live','threshold-context','2026-07-29 02:00:20+00'),
  'recovery clears pre-threshold state');
select is(public.m22_condition_threshold_met(
  (select id from m22_behavior_ids where label='threshold-after-clear'),
  'battery_low','physical_device_live','threshold-context',
  '2026-07-29 02:00:30+00'),false,'first sample after recovery starts fresh');
select is(public.m22_condition_threshold_met(
  (select id from m22_behavior_ids where label='window-1'),
  'battery_low','physical_device_live','window-context',
  '2026-07-29 03:00:00+00'),false,'first window sample does not trigger');
select is(public.m22_condition_threshold_met(
  (select id from m22_behavior_ids where label='window-2'),
  'battery_low','physical_device_live','window-context',
  '2026-07-29 03:05:01+00'),false,'sample beyond window resets');
select is(public.m22_condition_threshold_met(
  (select id from m22_behavior_ids where label='gps-1'),
  'gps_fix_missing','physical_device_live','gps-duration-context',
  '2026-07-29 04:00:00+00'),false,'GPS duration starts below threshold');
select is(public.m22_condition_threshold_met(
  (select id from m22_behavior_ids where label='gps-before'),
  'gps_fix_missing','physical_device_live','gps-duration-context',
  '2026-07-29 04:01:59+00'),false,'GPS remains clear immediately before boundary');
select is(public.m22_condition_threshold_met(
  (select id from m22_behavior_ids where label='gps-exact'),
  'gps_fix_missing','physical_device_live','gps-duration-context',
  '2026-07-29 04:02:00+00'),true,'GPS triggers at exact duration boundary');

select is(round(public.m22_distance_m(15,80,15,80),3),0.000::numeric,
  'distance is zero for the same finite point');
select ok(public.m22_distance_m(0,0,1,0) between 111190 and 111200,
  'distance matches known one-degree range');
select throws_ok(
  $$select public.m22_distance_m(91,0,0,0)$$,
  '22023','Invalid finite coordinate','movement helper rejects invalid coordinate');

create function pg_temp.m22_auth_signal(p_number integer)
returns void language plpgsql as $$
declare v_signal uuid;
begin
  v_signal:=public.m22_record_sanitized_signal(
    'authentication_failure','secret_invalid','m22.behavior',
    '2026-07-29 05:00:00+00'::timestamptz+make_interval(secs=>p_number),
    null,null,repeat('f',64));
  if v_signal is not null then
    perform public.m22_evaluate_signal(v_signal,clock_timestamp());
  end if;
end;
$$;
select lives_ok(
  $$select pg_temp.m22_auth_signal(n) from generate_series(1,4) n$$,
  'safe authentication failures aggregate below threshold');
select is(
  (select count(*)::integer from public.alerts
    where rule_id='unknown_device_or_credential'),0,
  'authentication alert stays closed below count');
select lives_ok($$select pg_temp.m22_auth_signal(5)$$,
  'fifth safe authentication failure evaluates');
select is(
  (select count(*)::integer from public.alerts
    where rule_id='unknown_device_or_credential'),1,
  'authentication alert opens at exact count');
select lives_ok($$select pg_temp.m22_auth_signal(6)$$,
  'sixth safe authentication failure aggregates without another signal');
select ok(
  (select count(*)=1 and min(occurrence_count)=1
    from public.alerts where rule_id='unknown_device_or_credential'),
  'subsequent failures do not create one alert occurrence per request');
select ok(
  (select safe_fingerprint=repeat('f',64) and occurrence_count=6
      and bucket_started_at='2026-07-29 05:00:00+00'
    from public.m22_auth_failure_aggregates)
  and not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='m22_auth_failure_aggregates'
      and column_name in ('raw_token','authorization_header','device_hint',
        'credential_key_id','latitude','longitude','request_body','ip_address')
  ),
  'authentication aggregate retains bounded fingerprint evidence only');
select is((select count(*)::integer from public.customer_updates),0,
  'rule and lifecycle behavior creates no customer update');

select * from finish();
rollback;
