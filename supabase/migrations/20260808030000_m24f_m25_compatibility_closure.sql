-- Final M24F/M25 integrity and retained-alert compatibility closure.

create or replace function public.m24f_is_safe_metadata(p_value text)
returns boolean language sql immutable parallel safe
set search_path = pg_catalog, public
as $$
  select p_value is null or (
    char_length(p_value) <= 500
    and p_value !~ E'[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]'
    and p_value !~* '(^|[^a-z0-9])(password|passwd|pwd|credential|secret|bearer|token|api[_ -]?key|auth(entication|orization)?[_ -]?header|private[_ -]?key|client[_ -]?secret)([^a-z0-9]|$)'
    and p_value !~* '(https?|wss?|mqtt|tcp|udp)://|(^|[[:space:]])([0-9]{1,3}\.){3}[0-9]{1,3}(:[0-9]{1,5})?(/[^[:space:]]*)?'
    and p_value !~* '(^|[^0-9])[+-]?[0-9]{1,2}\.[0-9]{4,}[,[:space:]]+[+-]?[0-9]{1,3}\.[0-9]{4,}([^0-9]|$)'
    and p_value !~* '<[!?/]?[a-z][^>]*>|[{}\[\]]|(^|[^a-z])(raw[_ -]?(payload|body)|payload[_ -]?(body|fragment|xml|json))([^a-z]|$)'
    and p_value !~* '(^|[^a-z0-9])(imei|imsi|iccid|serial[_ -]?number|physical[_ -]?device[_ -]?(evidence|photo|identifier))([^a-z0-9]|$)'
  )
$$;

-- Identity values are bounded declarative metadata too, not an alternate channel.
alter table public.m24f_certification_runs
  add constraint m24f_run_identity_safe_check check (
    public.m24f_is_safe_metadata(adapter_id) and public.m24f_is_safe_metadata(adapter_version)
  ) not valid;
alter table public.m25_feature_extraction_jobs
  add constraint m25_job_identity_safe_check check (
    public.m24f_is_safe_metadata(adapter_version) and public.m24f_is_safe_metadata(device_model)
  ) not valid;
alter table public.m25_feature_snapshots
  add constraint m25_snapshot_identity_safe_check check (
    public.m24f_is_safe_metadata(adapter_version) and public.m24f_is_safe_metadata(device_model)
  ) not valid;
alter table public.m25_baseline_versions
  add constraint m25_baseline_identity_safe_check check (
    public.m24f_is_safe_metadata(cohort_key) and public.m24f_is_safe_metadata(device_model)
    and public.m24f_is_safe_metadata(adapter_version) and public.m24f_is_safe_metadata(work_category)
  ) not valid;

create unique index m24f_scenario_run_identity_unique
  on public.m24f_certification_scenarios(certification_run_id,scenario_id);

create or replace function public.m24f_assert_persisted_scenario_truth(p_run_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public
as $$
  select exists (
    select 1 from public.m24f_certification_runs r
    join lateral (select count(*)::integer n, count(*) filter(where s.passed)::integer passed,
                         count(*) filter(where not s.passed)::integer failed
                  from public.m24f_certification_scenarios s where s.certification_run_id=r.id) x on true
    where r.id=p_run_id and r.certification_state='passed' and x.n>0
      and x.n=r.scenario_count and x.passed=r.passed_count and x.failed=r.failed_count
  )
$$;
revoke all on function public.m24f_assert_persisted_scenario_truth(uuid) from public,anon,authenticated;

alter table public.m25_feature_extraction_jobs add column input_watermark text not null default repeat('0',64) check(input_watermark ~ '^[0-9a-f]{64}$');
alter table public.m25_feature_snapshots add column input_watermark text not null default repeat('0',64) check(input_watermark ~ '^[0-9a-f]{64}$');

create or replace function public.m25_enqueue_feature_scope_v1(
  p_scope text,p_scope_key_hash text,p_period_start timestamptz,p_period_end timestamptz,
  p_gps_device_id uuid default null,p_ad_work_day_id uuid default null,
  p_adapter_version text default null,p_device_model text default null,p_synthetic boolean default false
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_id uuid; v_watermark text;
begin
 if p_scope_key_hash !~ '^[0-9a-f]{64}$' or p_period_end<=p_period_start
   or not public.m24f_is_safe_metadata(p_adapter_version) or not public.m24f_is_safe_metadata(p_device_model)
   or (p_scope='device_work_day' and (p_gps_device_id is null or p_ad_work_day_id is null or p_adapter_version is not null or p_device_model is not null))
   or (p_scope='device_day' and (p_gps_device_id is null or p_ad_work_day_id is not null or p_adapter_version is not null or p_device_model is not null))
   or (p_scope='device_model_day' and (p_device_model is null or p_gps_device_id is not null or p_ad_work_day_id is not null or p_adapter_version is not null))
   or (p_scope='adapter_version_day' and (p_adapter_version is null or p_gps_device_id is not null or p_ad_work_day_id is not null or p_device_model is not null))
   or (p_scope='fleet_day' and (p_gps_device_id is not null or p_ad_work_day_id is not null or p_adapter_version is not null or p_device_model is not null)) then
   raise exception 'Invalid bounded M25 feature scope dimensions' using errcode='22023';
 end if;
 select public.m22_safe_digest(concat_ws('|','m25-input-v1',count(*)::text,
   coalesce(max(r.id::text),''),coalesce(max(r.captured_at)::text,''),coalesce(max(r.created_at)::text,''))) into v_watermark
 from public.telemetry_receipts r join public.gps_devices d on d.id=r.gps_device_id
 where r.captured_at>=p_period_start and r.captured_at<p_period_end and r.synthetic=p_synthetic
   and (p_gps_device_id is null or r.gps_device_id=p_gps_device_id)
   and (p_ad_work_day_id is null or r.ad_work_day_id=p_ad_work_day_id)
   and (p_adapter_version is null or r.adapter_version=p_adapter_version)
   and (p_device_model is null or d.model=p_device_model);
 insert into public.m25_feature_extraction_jobs(scope,scope_key_hash,gps_device_id,ad_work_day_id,period_start,period_end,adapter_version,device_model,synthetic,input_watermark)
 values(p_scope,p_scope_key_hash,p_gps_device_id,p_ad_work_day_id,p_period_start,p_period_end,p_adapter_version,p_device_model,p_synthetic,v_watermark)
 on conflict(scope,scope_key_hash,period_start,period_end,synthetic) do update set
   generation=case when public.m25_feature_extraction_jobs.input_watermark=excluded.input_watermark then public.m25_feature_extraction_jobs.generation else public.m25_feature_extraction_jobs.generation+1 end,
   input_watermark=excluded.input_watermark,
   state=case when public.m25_feature_extraction_jobs.input_watermark=excluded.input_watermark then public.m25_feature_extraction_jobs.state when public.m25_feature_extraction_jobs.state='processing' then 'processing' else 'pending' end,
   dirty_after_claim=case when public.m25_feature_extraction_jobs.input_watermark<>excluded.input_watermark and public.m25_feature_extraction_jobs.state='processing' then true else public.m25_feature_extraction_jobs.dirty_after_claim end,
   next_attempt_at=case when public.m25_feature_extraction_jobs.input_watermark=excluded.input_watermark then public.m25_feature_extraction_jobs.next_attempt_at else clock_timestamp() end,
   updated_at=case when public.m25_feature_extraction_jobs.input_watermark=excluded.input_watermark then public.m25_feature_extraction_jobs.updated_at else clock_timestamp() end
 returning id into v_id;
 return v_id;
end $$;

-- Each worker evaluation and each review is bound to immutable evidence identity.
alter table public.m25_statistical_signals add column evaluation_id text;
update public.m25_statistical_signals set evaluation_id=public.m22_safe_digest(
  concat_ws('|','legacy-m25-evaluation',id::text,baseline_version,generated_at::text));
alter table public.m25_statistical_signals alter column evaluation_id set not null;
alter table public.m25_statistical_signals add constraint m25_signal_evaluation_id_check
  check (evaluation_id ~ '^[0-9a-f]{64}$');
-- Existing reviews intentionally receive a sentinel and cannot authorize a newly versioned evaluation.
alter table public.m25_signal_review_history add column evaluation_id text not null default repeat('0',64);
alter table public.m25_signal_review_history add constraint m25_review_evaluation_id_check
  check (evaluation_id ~ '^[0-9a-f]{64}$');

create table public.m25_signal_evaluations (
  evaluation_id text primary key check(evaluation_id ~ '^[0-9a-f]{64}$'),
  signal_id text not null references public.m25_statistical_signal_definitions(signal_id),
  scope_key_hash text not null check(scope_key_hash ~ '^[0-9a-f]{64}$'),
  synthetic boolean not null, period_end timestamptz not null, state text not null,
  anomalous boolean not null, baseline_version text not null, created_at timestamptz not null default clock_timestamp(),
  unique(signal_id,scope_key_hash,synthetic,period_end,baseline_version)
);
alter table public.m25_signal_evaluations enable row level security;
revoke all on public.m25_signal_evaluations from public,anon,authenticated;
grant select on public.m25_signal_evaluations to authenticated;
create policy "M25 evaluations admin reads" on public.m25_signal_evaluations for select to authenticated using(public.is_admin());

create or replace function public.admin_decide_m24f_candidate_v1(p_candidate_id uuid,p_new_status text,p_reason text,p_safe_note text)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_actor uuid; v_previous text; v_id uuid; v_latest public.m24f_certification_runs%rowtype;
begin
 v_actor:=public.m20a_require_admin();
 if p_reason is null or char_length(trim(p_reason)) not between 1 and 160 or p_safe_note is null or char_length(trim(p_safe_note)) not between 1 and 500 or not public.m24f_is_safe_metadata(p_reason) or not public.m24f_is_safe_metadata(p_safe_note) then raise exception 'A bounded safe M24F reason and note are required' using errcode='22023'; end if;
 select decision_status into v_previous from public.m24f_adapter_candidates where id=p_candidate_id for update;
 if v_previous is null then raise exception 'M24F candidate not found' using errcode='P0002'; end if;
 if p_new_status in ('technically_compatible','approved_by_ap') then
   select * into v_latest from public.m24f_certification_runs where candidate_id=p_candidate_id order by completed_at desc nulls last,id desc limit 1;
   if v_latest.id is null or v_latest.certification_level<>'synthetic_conformance' or not v_latest.synthetic
      or not public.m24f_assert_persisted_scenario_truth(v_latest.id) then
     raise exception 'Current persisted nonzero successful scenarios are required' using errcode='55000';
   end if;
 end if;
 if p_new_status='approved_by_ap' and v_previous<>'technically_compatible' then raise exception 'AP approval requires technical compatibility' using errcode='55000'; end if;
 update public.m24f_adapter_candidates set decision_status=p_new_status,updated_by_admin=v_actor,updated_at=clock_timestamp() where id=p_candidate_id returning id into v_id;
 insert into public.m24f_candidate_decision_history(candidate_id,previous_status,new_status,actor_admin_id,reason,safe_note) values(p_candidate_id,v_previous,p_new_status,v_actor,trim(p_reason),trim(p_safe_note));
 return v_id;
end $$;

create or replace function public.admin_transition_m25_signal_review_v1(p_signal_id uuid,p_new_state text,p_review_label text,p_reason text,p_note text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_actor uuid; v_previous text; s public.m25_statistical_signals%rowtype;
begin
 v_actor:=public.m20a_require_admin();
 if p_new_state not in ('suppressed','reviewed','watch','investigate','normal') or p_review_label not in ('confirmed_operational_issue','expected_behavior','false_positive','data_quality_problem','insufficient_evidence','requires_more_observation') or p_reason is null or char_length(trim(p_reason)) not between 1 and 160 or p_note is null or char_length(trim(p_note)) not between 1 and 500 or not public.m24f_is_safe_metadata(p_reason) or not public.m24f_is_safe_metadata(p_note) then raise exception 'Invalid bounded M25 review' using errcode='22023'; end if;
 select * into s from public.m25_statistical_signals where id=p_signal_id for update;
 if s.id is null then raise exception 'M25 signal not found' using errcode='P0002'; end if;
 v_previous:=s.state;
 insert into public.m25_signal_review_history(signal_id,previous_state,new_state,review_label,reviewer_admin_id,reason,note,evaluation_id) values(s.id,v_previous,p_new_state,p_review_label,v_actor,trim(p_reason),trim(p_note),s.evaluation_id);
 update public.m25_statistical_signals set state=p_new_state where id=s.id;
 return jsonb_build_object('contractVersion','m25-admin-v1','signalId',s.id,'evaluationId',s.evaluation_id,'previousState',v_previous,'newState',p_new_state);
end $$;

-- Retain native M22 and M23 identities and add a truthful statistical origin.
alter table public.alerts drop constraint alerts_m22_bounds_check;
alter table public.alerts add constraint alerts_m22_bounds_check check (
 (dedupe_key is null or dedupe_key ~ '^[0-9a-f]{64}$') and (title is null or char_length(title) between 1 and 160)
 and char_length(message) between 1 and 500 and (value_unit is null or value_unit in ('seconds','minutes','percentage','dbm','meters','kilometers_per_hour','count','boolean','state'))
 and origin in ('legacy_pre_m22','m22_rule_engine','m25_statistical_engine'));

revoke all on function public.admin_decide_m24f_candidate_v1(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.admin_decide_m24f_candidate_v1(uuid,text,text,text) to authenticated;
revoke all on function public.admin_transition_m25_signal_review_v1(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.admin_transition_m25_signal_review_v1(uuid,text,text,text,text) to authenticated;


-- Authoritative worker: immutable evaluations, configured persistence, monotonic current episodes.
create or replace function public.m25_process_statistical_queue(p_batch_size integer default 50, p_now timestamptz default clock_timestamp())
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  j public.m25_feature_extraction_jobs%rowtype; s_id uuid; v_feature record; v_definition record; v_baseline public.m25_baseline_versions%rowtype;
  v_count integer; v_live integer; v_delayed integer; v_health integer; v_rejected integer; v_conflicts integer;
  v_value numeric; v_median numeric; v_mad numeric; v_p25 numeric; v_p75 numeric; v_min numeric; v_max numeric; v_score numeric;
  v_baseline_count integer; v_coverage_count integer; v_state text; v_fallback text; v_support text; v_baseline_version text;
  v_evaluation_id text; v_anomalous boolean; v_consecutive integer;
  v_claimed integer:=0; v_built integer:=0; v_baselines integer:=0; v_signals integer:=0; v_readiness integer:=0; v_retries integer:=0; v_rows integer;
begin
  if p_batch_size not between 1 and 200 then raise exception 'Invalid bounded M25 queue request' using errcode = '22023'; end if;
  for j in select * from public.m25_feature_extraction_jobs where state in ('pending','processing') and next_attempt_at <= p_now and attempt_count < 8 and (state='pending' or locked_at < p_now - interval '5 minutes') order by next_attempt_at,created_at for update skip locked limit p_batch_size loop
    v_claimed:=v_claimed+1;
    update public.m25_feature_extraction_jobs set state='processing', attempt_count=attempt_count+1, claimed_generation=generation, locked_at=p_now, updated_at=clock_timestamp() where id=j.id;
    begin
      -- Every declared dimension is part of the authoritative population. Device
      -- model is resolved from the registry; work-day and adapter cohorts are never
      -- inferred from a caller-provided hash.
      select count(*)::integer,
        count(*) filter (where r.disposition='accepted_live')::integer,
        count(*) filter (where r.disposition='accepted_delayed')::integer,
        count(*) filter (where r.disposition='health_only')::integer,
        count(*) filter (where r.disposition='rejected')::integer
      into v_count,v_live,v_delayed,v_health,v_rejected
      from public.telemetry_receipts r join public.gps_devices d on d.id=r.gps_device_id
      where r.captured_at >= j.period_start and r.captured_at < j.period_end and r.synthetic=j.synthetic
        and (j.gps_device_id is null or r.gps_device_id=j.gps_device_id)
        and (j.ad_work_day_id is null or r.ad_work_day_id=j.ad_work_day_id)
        and (j.adapter_version is null or r.adapter_version=j.adapter_version)
        and (j.device_model is null or d.model=j.device_model);

      select count(*)::integer into v_conflicts
      from public.telemetry_identity_conflicts c
      join public.telemetry_receipts r on r.id=c.original_receipt_id
      join public.gps_devices d on d.id=r.gps_device_id
      where c.first_seen_at >= j.period_start and c.first_seen_at < j.period_end and r.synthetic=j.synthetic
        and (j.gps_device_id is null or r.gps_device_id=j.gps_device_id)
        and (j.ad_work_day_id is null or r.ad_work_day_id=j.ad_work_day_id)
        and (j.adapter_version is null or r.adapter_version=j.adapter_version)
        and (j.device_model is null or d.model=j.device_model);

      perform set_config('app.m25_snapshot_build','on',true);
      insert into public.m25_feature_snapshots(feature_version,scope,scope_key_hash,period_start,period_end,device_model,adapter_version,source_completeness,synthetic,generation,build_complete,input_watermark)
      values('m25-features-v1',j.scope,j.scope_key_hash,j.period_start,j.period_end,j.device_model,j.adapter_version,case when v_count=0 then 0 else 1 end,j.synthetic,j.generation,true,j.input_watermark)
      on conflict (scope,scope_key_hash,period_start,period_end,feature_version,generation,synthetic) do nothing returning id into s_id;
      if s_id is null then select id into s_id from public.m25_feature_snapshots where scope=j.scope and scope_key_hash=j.scope_key_hash and period_start=j.period_start and period_end=j.period_end and generation=j.generation and synthetic=j.synthetic; end if;

      for v_feature in select feature_id,source_kind from public.m25_feature_definitions where active order by feature_id loop
        v_value := case v_feature.feature_id
          when 'event_count' then v_count
          when 'accepted_live_rate' then case when v_count=0 then 0 else v_live::numeric/v_count end
          when 'accepted_delayed_rate' then case when v_count=0 then 0 else v_delayed::numeric/v_count end
          when 'health_only_rate' then case when v_count=0 then 0 else v_health::numeric/v_count end
          when 'rejection_rate' then case when v_count=0 then 0 else v_rejected::numeric/v_count end
          when 'identity_conflict_rate' then case when v_count=0 then 0 else v_conflicts::numeric/v_count end
          else 0 end;
        insert into public.m25_feature_values(snapshot_id,feature_id,numeric_value,sample_count,coverage_score,source_kind,observation_status)
        values(s_id,v_feature.feature_id,v_value,
          case when v_count>0 and v_feature.feature_id in ('event_count','accepted_live_rate','accepted_delayed_rate','health_only_rate','rejection_rate','identity_conflict_rate') then v_count else 0 end,
          case when v_count>0 and v_feature.feature_id in ('event_count','accepted_live_rate','accepted_delayed_rate','health_only_rate','rejection_rate','identity_conflict_rate') then 1 else 0 end,
          v_feature.source_kind,
          case when v_feature.feature_id not in ('event_count','accepted_live_rate','accepted_delayed_rate','health_only_rate','rejection_rate','identity_conflict_rate') then 'unavailable' when v_count=0 then 'not_observed' else 'observed' end)
        on conflict(snapshot_id,feature_id) do nothing;
      end loop;

      -- Persist a deterministic baseline for each actually observed feature. The
      -- snapshot id and feature id form a stable version, making retries no-ops.
      for v_feature in select * from public.m25_feature_values where snapshot_id=s_id and observation_status='observed' order by feature_id loop
        select count(*)::integer, count(*) filter(where fv.coverage_score >= fd.minimum_coverage_score)::integer,
          percentile_cont(0.5) within group(order by fv.numeric_value), percentile_cont(0.25) within group(order by fv.numeric_value),
          percentile_cont(0.75) within group(order by fv.numeric_value), min(fv.numeric_value), max(fv.numeric_value)
        into v_baseline_count,v_coverage_count,v_median,v_p25,v_p75,v_min,v_max
        from public.m25_feature_values fv join public.m25_feature_snapshots fs on fs.id=fv.snapshot_id join public.m25_feature_definitions fd on fd.feature_id=fv.feature_id
        where fv.feature_id=v_feature.feature_id and fv.observation_status='observed' and fs.scope=j.scope and fs.scope_key_hash=j.scope_key_hash and fs.synthetic=j.synthetic and fs.period_end <= j.period_end;
        select percentile_cont(0.5) within group(order by abs(fv.numeric_value-v_median)) into v_mad
        from public.m25_feature_values fv join public.m25_feature_snapshots fs on fs.id=fv.snapshot_id
        where fv.feature_id=v_feature.feature_id and fv.observation_status='observed' and fs.scope=j.scope and fs.scope_key_hash=j.scope_key_hash and fs.synthetic=j.synthetic and fs.period_end <= j.period_end;
        v_baseline_version:=public.m22_safe_digest(concat('m25-baseline-v1|',s_id,'|',v_feature.feature_id));
        insert into public.m25_baseline_versions(baseline_version,metric,cohort_key,device_model,adapter_version,source_kind,synthetic,fallback_used,sample_count,coverage_count,median,median_absolute_deviation,p25,p75,minimum,maximum,baseline_period_start,baseline_period_end,effective_from,active,provisional)
        values(v_baseline_version,v_feature.feature_id,concat(j.scope,':',j.scope_key_hash),j.device_model,j.adapter_version,v_feature.source_kind,j.synthetic,case when v_baseline_count>=8 then 'exact_supported_cohort' else 'insufficient_data' end,v_baseline_count,v_coverage_count,v_median,v_mad,v_p25,v_p75,v_min,v_max,j.period_start,j.period_end,j.period_end,false,true)
        on conflict(baseline_version) do nothing;
        get diagnostics v_rows=row_count; v_baselines:=v_baselines+v_rows;

        for v_definition in select * from public.m25_statistical_signal_definitions where metric=v_feature.feature_id order by signal_id loop
          select * into v_baseline from public.m25_baseline_versions b where b.baseline_version=v_baseline_version;
          v_fallback:=case when coalesce(v_baseline.median_absolute_deviation,0)>0 then 'mad' when coalesce(v_baseline.p75-v_baseline.p25,0)>0 then 'iqr' else 'none' end;
          v_score:=case when v_fallback='mad' then 0.6745*(v_feature.numeric_value-v_baseline.median)/v_baseline.median_absolute_deviation when v_fallback='iqr' then (v_feature.numeric_value-v_baseline.median)/(v_baseline.p75-v_baseline.p25) else null end;
          v_support:=case when j.synthetic then 'synthetic_only' when v_feature.sample_count>=8 then 'strong' when v_feature.sample_count>=3 then 'moderate' else 'low' end;
          v_state:=case when v_baseline.sample_count<v_definition.minimum_baseline_support or v_feature.sample_count<v_definition.minimum_current_support or v_fallback='none' then 'insufficient_data' when (v_definition.direction='high_bad' and v_score>=v_definition.opening_threshold) or (v_definition.direction='low_bad' and v_score<=-v_definition.opening_threshold) or (v_definition.direction='two_sided' and abs(v_score)>=v_definition.opening_threshold) then 'investigate' else 'normal' end;
          v_anomalous:=v_state='investigate';
          v_evaluation_id:=public.m22_safe_digest(concat_ws('|','m25-evaluation-v1',v_definition.signal_id,j.scope_key_hash,j.synthetic::text,j.period_end::text,v_baseline_version,v_feature.numeric_value::text,v_score::text));
          insert into public.m25_signal_evaluations(evaluation_id,signal_id,scope_key_hash,synthetic,period_end,state,anomalous,baseline_version)
          values(v_evaluation_id,v_definition.signal_id,j.scope_key_hash,j.synthetic,j.period_end,v_state,v_anomalous,v_baseline_version)
          on conflict(evaluation_id) do nothing;
          if v_anomalous and v_definition.consecutive_windows > 1 then
            select count(*)::integer into v_consecutive from (
              select anomalous from public.m25_signal_evaluations
              where signal_id=v_definition.signal_id and scope_key_hash=j.scope_key_hash and synthetic=j.synthetic and period_end<=j.period_end
              order by period_end desc limit v_definition.consecutive_windows
            ) recent where anomalous;
            if v_consecutive < v_definition.consecutive_windows then v_state:='watch'; end if;
          end if;
          insert into public.m25_statistical_signals(signal_id,signal_episode_id,metric,scope,scope_key_hash,direction,state,observed_value,baseline_median,baseline_mad,fallback_statistic,robust_score,sample_count,support_level,coverage_score,baseline_version,explanation_code,rule_fallback,synthetic,generated_at,evaluation_id)
          values(v_definition.signal_id,concat(v_definition.signal_id,':',j.scope_key_hash),v_feature.feature_id,j.scope,j.scope_key_hash,v_definition.direction,v_state,v_feature.numeric_value,v_baseline.median,v_baseline.median_absolute_deviation,v_fallback,v_score,v_feature.sample_count,v_support,v_feature.coverage_score,v_baseline_version,v_definition.explanation_code,v_definition.rule_fallback,j.synthetic,j.period_end,v_evaluation_id)
          on conflict(signal_id,scope_key_hash,synthetic) do update set state=excluded.state,observed_value=excluded.observed_value,baseline_median=excluded.baseline_median,baseline_mad=excluded.baseline_mad,fallback_statistic=excluded.fallback_statistic,robust_score=excluded.robust_score,sample_count=excluded.sample_count,support_level=excluded.support_level,coverage_score=excluded.coverage_score,baseline_version=excluded.baseline_version,generated_at=excluded.generated_at,evaluation_id=excluded.evaluation_id
          where public.m25_statistical_signals.promoted_alert_id is null and public.m25_statistical_signals.state not in ('reviewed','suppressed') and public.m25_statistical_signals.generated_at < excluded.generated_at;
          get diagnostics v_rows=row_count; v_signals:=v_signals+v_rows;
        end loop;
      end loop;

      insert into public.m25_readiness_assessments(source_snapshot_id,assessed_at,reviewed_calendar_days,reviewed_device_model_days,reviewed_work_day_sessions,device_count,device_model_diversity,adapter_version_diversity,feature_completeness,missingness,reviewed_label_count,positive_label_count,negative_label_count,drift_evidence,cohort_support,train_holdout_feasibility,synthetic_evidence,real_reviewed_evidence,decision)
      select s_id,j.period_end,
        count(distinct fs.period_start::date)::integer,count(distinct (fs.device_model,fs.period_start::date))::integer,
        count(distinct fs.id) filter(where fs.scope='device_work_day')::integer,count(distinct r.gps_device_id)::integer,
        count(distinct fs.device_model) filter(where fs.device_model is not null)::integer,count(distinct fs.adapter_version) filter(where fs.adapter_version is not null)::integer,
        coalesce(avg((fv.observation_status='observed')::integer),0),1-coalesce(avg((fv.observation_status='observed')::integer),0),
        0,0,0,'insufficient_data',case when j.synthetic then 'synthetic_only' else 'low' end,'not_ready',j.synthetic,false,'production_ml_not_authorized'
      from public.m25_feature_snapshots fs join public.m25_feature_values fv on fv.snapshot_id=fs.id
      left join public.telemetry_receipts r on r.captured_at>=fs.period_start and r.captured_at<fs.period_end and r.synthetic=fs.synthetic
      where fs.synthetic=j.synthetic
      on conflict(source_snapshot_id) do nothing;
      get diagnostics v_rows=row_count; v_readiness:=v_readiness+v_rows;

      update public.m25_feature_extraction_jobs set state=case when generation=claimed_generation and not dirty_after_claim then 'completed' else 'pending' end, completed_at=case when generation=claimed_generation and not dirty_after_claim then clock_timestamp() else null end, dirty_after_claim=false, locked_at=null, safe_failure_reason_code=null, updated_at=clock_timestamp() where id=j.id;
      v_built:=v_built+1;
    exception when others then
      update public.m25_feature_extraction_jobs set state=case when attempt_count>=8 then 'failed' else 'pending' end, next_attempt_at=p_now+make_interval(secs=>least(300,5*(2^least(attempt_count,6)))::integer), locked_at=null, safe_failure_reason_code=case when attempt_count>=8 then 'attempts_exhausted' else 'evaluation_failed' end, updated_at=clock_timestamp() where id=j.id;
      v_retries:=v_retries+1;
    end;
  end loop;
  return jsonb_build_object('claimed',v_claimed,'feature_snapshots_built',v_built,'baselines_evaluated',v_baselines,'signals_evaluated',v_signals,'readiness_assessments',v_readiness,'retry_or_failed',v_retries);
end;
$$;


-- Reviewed M25 alerts use native identity; M22 and retained M23 projections stay compatible.
create or replace function public.admin_promote_m25_signal_to_alert_v1(p_signal_id uuid,p_reason text,p_note text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_actor uuid; s public.m25_statistical_signals%rowtype; v_alert uuid; v_key text;
begin
  v_actor:=public.m20a_require_admin();
  if p_reason is null or char_length(trim(p_reason)) not between 1 and 160 or p_note is null or char_length(trim(p_note)) not between 1 and 500 or not public.m24f_is_safe_metadata(p_reason) or not public.m24f_is_safe_metadata(p_note) then raise exception 'A bounded safe M25 promotion reason and note are required' using errcode='22023'; end if;
  select * into s from public.m25_statistical_signals where id=p_signal_id for update;
  if s.id is null then raise exception 'M25 signal not found' using errcode='P0002'; end if;
  if s.promoted_alert_id is not null then return jsonb_build_object('contractVersion','m25-admin-v1','signalId',p_signal_id,'alertId',s.promoted_alert_id,'created',false); end if;
  if s.state not in ('watch','investigate','reviewed') or not exists (
    select 1 from public.m25_signal_review_history h
    where h.signal_id=s.id and h.new_state=s.state and h.evaluation_id=s.evaluation_id
  ) then raise exception 'A matching immutable admin review is required before promotion' using errcode='55000'; end if;
  v_key:=public.m22_safe_digest(concat('m25-statistical-signal|',s.signal_id,'|',s.scope_key_hash,'|',s.synthetic::text));
  insert into public.alerts(ad_work_day_id,type,severity,status,message,created_at,source,dedupe_key,episode_number,condition_active,first_detected_at,last_detected_at,occurrence_count,gps_device_id,synthetic,title,observed_value,threshold_value,value_unit,status_changed_at,updated_at,origin)
  values(null,'statistical_signal','warning','new','Statistical signal requires operational review.',clock_timestamp(),'statistical_signal',v_key,1,true,s.generated_at,s.generated_at,1,null,s.synthetic,'Statistical signal review',s.observed_value,null,'count',clock_timestamp(),clock_timestamp(),'m25_statistical_engine') returning id into v_alert;
  update public.m25_statistical_signals set promoted_alert_id=v_alert where id=p_signal_id;
  insert into public.alert_status_history(alert_id,previous_status,new_status,actor_type,actor_admin_id,reason,note,transition_at,safe_source) values(v_alert,null,'new','admin',v_actor,trim(p_reason),trim(p_note),clock_timestamp(),'admin_rpc');
  insert into public.audit_logs(actor_type,actor_id,action,entity_type,entity_id,safe_details) values('admin',v_actor,'m25_statistical_signal_promoted_to_alert','alert',v_alert,jsonb_build_object('signal_id',p_signal_id,'source','statistical_signal'));
  return jsonb_build_object('contractVersion','m25-admin-v1','signalId',p_signal_id,'alertId',v_alert,'created',true);
end;
$$;

create or replace function public.admin_list_m22_alerts_v1(
  p_status text default null,p_severity text default null,p_rule_id text default null,
  p_source text default null,p_gps_device_id uuid default null,p_vehicle_id uuid default null,
  p_ad_work_id uuid default null,p_synthetic boolean default null,
  p_condition_active boolean default null,p_limit integer default 100
) returns jsonb language plpgsql security definer stable set search_path = pg_catalog, public
as $$
declare v_rows jsonb;
begin
  perform public.m20a_require_admin();
  if p_limit not between 1 and 200 then raise exception 'Invalid bounded limit' using errcode='22023'; end if;
  if p_status is not null and p_status not in ('new','acknowledged','investigating','resolved','false_alarm','ignored')
    then raise exception 'Invalid status filter' using errcode='22023'; end if;
  if p_severity is not null and p_severity not in ('info','warning','critical')
    then raise exception 'Invalid severity filter' using errcode='22023'; end if;
  select coalesce(jsonb_agg(row_value order by last_detected_at desc,id),'[]'::jsonb) into v_rows from (
    select a.id,a.last_detected_at,jsonb_build_object(
      'id',a.id,'ruleId',coalesce(a.rule_id,case when a.source='comparison' then 'phone_physical_sustained_mismatch' when a.source='statistical_signal' then 'statistical_signal' end),'ruleVersion',a.rule_version,'title',a.title,
      'message',a.message,'severity',a.severity,'status',a.status,'source',a.source,
      'deviceLabel',gd.device_code,'vehicleLabel',v.vehicle_number,
      'workLabel',case when aw.id is null then null else aw.title||coalesce(' · '||wd.work_date::text,'') end,
      'firstDetectedAt',a.first_detected_at,'lastDetectedAt',a.last_detected_at,
      'conditionActive',a.condition_active,'conditionClearedAt',a.condition_cleared_at,
      'occurrenceCount',a.occurrence_count,'synthetic',a.synthetic
    ) row_value from public.alerts a
    left join public.gps_devices gd on gd.id=a.gps_device_id
    left join public.vehicles v on v.id=a.vehicle_id
    left join public.ad_work_days wd on wd.id=a.ad_work_day_id
    left join public.ad_works aw on aw.id=coalesce(a.ad_work_id,wd.ad_work_id)
    where (a.rule_id is not null or a.source in ('comparison','statistical_signal')) and (p_status is null or a.status::text=p_status)
      and (p_severity is null or a.severity::text=p_severity)
      and (p_rule_id is null or coalesce(a.rule_id,case when a.source='comparison' then 'phone_physical_sustained_mismatch' when a.source='statistical_signal' then 'statistical_signal' end)=p_rule_id) and (p_source is null or a.source=p_source)
      and (p_gps_device_id is null or a.gps_device_id=p_gps_device_id)
      and (p_vehicle_id is null or a.vehicle_id=p_vehicle_id)
      and (p_ad_work_id is null or coalesce(a.ad_work_id,wd.ad_work_id)=p_ad_work_id)
      and (p_synthetic is null or a.synthetic=p_synthetic)
      and (p_condition_active is null or a.condition_active=p_condition_active)
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
  select jsonb_build_object(
    'contractVersion','m22-admin-v1',
    'alert',jsonb_build_object('id',a.id,'ruleId',coalesce(a.rule_id,case when a.source='comparison' then 'phone_physical_sustained_mismatch' when a.source='statistical_signal' then 'statistical_signal' end),'ruleVersion',a.rule_version,
      'title',a.title,'message',a.message,'severity',a.severity,'status',a.status,
      'source',a.source,'deviceLabel',gd.device_code,'vehicleLabel',v.vehicle_number,
      'workLabel',case when aw.id is null then null else aw.title||coalesce(' · '||wd.work_date::text,'') end,
      'firstDetectedAt',a.first_detected_at,'lastDetectedAt',a.last_detected_at,
      'conditionActive',a.condition_active,'conditionClearedAt',a.condition_cleared_at,
      'occurrenceCount',a.occurrence_count,'synthetic',a.synthetic),
    'statusHistory',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,
      'previousStatus',h.previous_status,'newStatus',h.new_status,'reason',h.reason,
      'note',h.note,'transitionAt',h.transition_at) order by h.transition_at)
      from (select * from public.alert_status_history where alert_id=a.id
        order by transition_at desc limit 100) h),'[]'::jsonb),
    'notes',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'reason',n.reason,
      'note',n.note,'createdAt',n.created_at) order by n.created_at)
      from (select * from public.alert_notes where alert_id=a.id order by created_at desc limit 100) n),'[]'::jsonb),
    'assessments',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'ruleId',x.rule_id,
      'ruleVersion',x.rule_version,'outcome',x.outcome,'reasonCode',x.reason_code,
      'evidenceTiming',x.evidence_timing,'assessedAt',x.assessed_at) order by x.assessed_at desc)
      from (select * from public.m22_rule_assessments where alert_id=a.id
        order by assessed_at desc limit 100) x),'[]'::jsonb),
    'auditHistory',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'action',l.action,
      'createdAt',l.created_at) order by l.created_at desc) from (select id,action,created_at
      from public.audit_logs where entity_type='alert' and entity_id=a.id
      order by created_at desc limit 100) l),'[]'::jsonb),
    'allowedTransitions',case a.status::text
      when 'new' then '["acknowledged","investigating","resolved","false_alarm","ignored"]'::jsonb
      when 'acknowledged' then '["investigating","resolved","false_alarm","ignored"]'::jsonb
      when 'investigating' then '["resolved","false_alarm","ignored"]'::jsonb
      else '[]'::jsonb end,
    'technicalValuesAvailable',exists(select 1 from public.m22_rule_assessments x
      where x.alert_id=a.id and (x.observed_value is not null or x.threshold_value is not null))
  ) into v_result from public.alerts a
  left join public.gps_devices gd on gd.id=a.gps_device_id
  left join public.vehicles v on v.id=a.vehicle_id
  left join public.ad_work_days wd on wd.id=a.ad_work_day_id
  left join public.ad_works aw on aw.id=coalesce(a.ad_work_id,wd.ad_work_id)
  where a.id=p_alert_id and (a.rule_id is not null or a.source in ('comparison','statistical_signal'));
  if v_result is null then raise exception 'M22 alert not found' using errcode='P0002'; end if;
  return v_result;
end;
$$;


revoke all on function public.m25_enqueue_feature_scope_v1(text,text,timestamptz,timestamptz,uuid,uuid,text,text,boolean) from public,anon,authenticated; grant execute on function public.m25_enqueue_feature_scope_v1(text,text,timestamptz,timestamptz,uuid,uuid,text,text,boolean) to service_role;
revoke all on function public.m25_process_statistical_queue(integer,timestamptz) from public,anon,authenticated; grant execute on function public.m25_process_statistical_queue(integer,timestamptz) to service_role;
revoke all on function public.admin_promote_m25_signal_to_alert_v1(uuid,text,text) from public,anon,authenticated; grant execute on function public.admin_promote_m25_signal_to_alert_v1(uuid,text,text) to authenticated;
revoke all on function public.admin_list_m22_alerts_v1(text,text,text,text,uuid,uuid,uuid,boolean,boolean,integer) from public,anon,authenticated; grant execute on function public.admin_list_m22_alerts_v1(text,text,text,text,uuid,uuid,uuid,boolean,boolean,integer) to authenticated;
revoke all on function public.admin_get_m22_alert_detail_v1(uuid) from public,anon,authenticated; grant execute on function public.admin_get_m22_alert_detail_v1(uuid) to authenticated;
