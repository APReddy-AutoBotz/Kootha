-- M25 readiness advances only from authoritative snapshots with qualifying
-- observed evidence. Empty scheduled scopes remain useful audit artifacts but
-- are not evidence of calendar-day or device-model-day review progress.

create or replace function public.m25_process_statistical_queue(p_batch_size integer default 50, p_now timestamptz default clock_timestamp())
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  j public.m25_feature_extraction_jobs%rowtype; s_id uuid; v_feature record; v_definition record; v_baseline public.m25_baseline_versions%rowtype;
  v_count integer; v_live integer; v_delayed integer; v_health integer; v_rejected integer; v_conflicts integer;
  v_value numeric; v_median numeric; v_mad numeric; v_p25 numeric; v_p75 numeric; v_min numeric; v_max numeric; v_score numeric;
  v_baseline_count integer; v_coverage_count integer; v_state text; v_fallback text; v_support text; v_baseline_version text;
  v_evaluation_id text; v_anomalous boolean; v_consecutive integer; v_superseded_snapshot_id uuid; v_previous_state text;
  v_claimed integer:=0; v_built integer:=0; v_baselines integer:=0; v_signals integer:=0; v_readiness integer:=0; v_retries integer:=0; v_rows integer;
begin
  if p_batch_size not between 1 and 200 then raise exception 'Invalid bounded M25 queue request' using errcode = '22023'; end if;
  for j in select * from public.m25_feature_extraction_jobs where state in ('pending','processing') and next_attempt_at <= p_now and attempt_count < 8 and (state='pending' or locked_at < p_now - interval '5 minutes') order by authoritative_correction_pending desc,period_end,period_start,next_attempt_at,created_at,id for update skip locked limit p_batch_size loop
    -- The cursor materializes row values for the batch. An earlier correction can
    -- advance a later locked job before its iteration, so reload its live generation
    -- and correction marker before claiming or deriving any artifact.
    select * into strict j from public.m25_feature_extraction_jobs where id=j.id for update;
    v_claimed:=v_claimed+1;
    update public.m25_feature_extraction_jobs set state='processing', attempt_count=attempt_count+1, claimed_generation=generation, locked_at=p_now, updated_at=clock_timestamp() where id=j.id;
    select * into strict j from public.m25_feature_extraction_jobs where id=j.id;
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

      select count(distinct r.id)::integer into v_conflicts
      from public.telemetry_identity_conflicts c
      join public.telemetry_receipts r on r.id=c.original_receipt_id
      join public.gps_devices d on d.id=r.gps_device_id
      where r.captured_at >= j.period_start and r.captured_at < j.period_end and r.synthetic=j.synthetic
        and (j.gps_device_id is null or r.gps_device_id=j.gps_device_id)
        and (j.ad_work_day_id is null or r.ad_work_day_id=j.ad_work_day_id)
        and (j.adapter_version is null or r.adapter_version=j.adapter_version)
        and (j.device_model is null or d.model=j.device_model);

      perform set_config('app.m25_snapshot_build','on',true);
      select fs.id into v_superseded_snapshot_id from public.m25_feature_snapshots fs
      where fs.scope=j.scope and fs.scope_key_hash=j.scope_key_hash and fs.period_start=j.period_start
        and fs.period_end=j.period_end and fs.feature_version='m25-features-v1' and fs.synthetic=j.synthetic
        and fs.generation<j.generation order by fs.generation desc limit 1;
      insert into public.m25_feature_snapshots(feature_version,scope,scope_key_hash,period_start,period_end,device_model,adapter_version,source_completeness,synthetic,generation,supersedes_snapshot_id,build_complete,input_watermark)
      values('m25-features-v1',j.scope,j.scope_key_hash,j.period_start,j.period_end,j.device_model,j.adapter_version,case when v_count=0 then 0 else 1 end,j.synthetic,j.generation,v_superseded_snapshot_id,true,j.input_watermark)
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
        where fv.feature_id=v_feature.feature_id and fv.observation_status='observed' and fs.scope=j.scope and fs.scope_key_hash=j.scope_key_hash and fs.synthetic=j.synthetic and fs.period_end <= j.period_end
          and not exists (select 1 from public.m25_feature_snapshots newer where newer.scope=fs.scope and newer.scope_key_hash=fs.scope_key_hash and newer.period_start=fs.period_start and newer.period_end=fs.period_end and newer.feature_version=fs.feature_version and newer.synthetic=fs.synthetic and newer.generation>fs.generation);
        select percentile_cont(0.5) within group(order by abs(fv.numeric_value-v_median)) into v_mad
        from public.m25_feature_values fv join public.m25_feature_snapshots fs on fs.id=fv.snapshot_id
        where fv.feature_id=v_feature.feature_id and fv.observation_status='observed' and fs.scope=j.scope and fs.scope_key_hash=j.scope_key_hash and fs.synthetic=j.synthetic and fs.period_end <= j.period_end
          and not exists (select 1 from public.m25_feature_snapshots newer where newer.scope=fs.scope and newer.scope_key_hash=fs.scope_key_hash and newer.period_start=fs.period_start and newer.period_end=fs.period_end and newer.feature_version=fs.feature_version and newer.synthetic=fs.synthetic and newer.generation>fs.generation);
        v_baseline_version:=public.m22_safe_digest(concat('m25-baseline-v1|',s_id,'|',v_feature.feature_id));
        insert into public.m25_baseline_versions(baseline_version,metric,cohort_key,device_model,adapter_version,source_kind,synthetic,fallback_used,sample_count,coverage_count,median,median_absolute_deviation,p25,p75,minimum,maximum,baseline_period_start,baseline_period_end,effective_from,active,provisional,source_generation,source_snapshot_id)
        values(v_baseline_version,v_feature.feature_id,concat(j.scope,':',j.scope_key_hash),j.device_model,j.adapter_version,v_feature.source_kind,j.synthetic,case when v_baseline_count>=8 then 'exact_supported_cohort' else 'insufficient_data' end,v_baseline_count,v_coverage_count,v_median,v_mad,v_p25,v_p75,v_min,v_max,j.period_start,j.period_end,j.period_end,false,true,j.generation,s_id)
        on conflict(baseline_version) do nothing;
        get diagnostics v_rows=row_count; v_baselines:=v_baselines+v_rows;

        for v_definition in select * from public.m25_statistical_signal_definitions where metric=v_feature.feature_id order by signal_id loop
          select * into v_baseline from public.m25_baseline_versions b where b.baseline_version=v_baseline_version;
          v_fallback:=case when coalesce(v_baseline.median_absolute_deviation,0)>0 then 'mad' when coalesce(v_baseline.p75-v_baseline.p25,0)>0 then 'iqr' else 'none' end;
          v_score:=public.m25_robust_score_v1(v_feature.numeric_value,v_baseline.median,v_baseline.median_absolute_deviation,v_baseline.p25,v_baseline.p75,v_definition.direction);
          v_support:=public.m25_support_level_v1(v_feature.sample_count,j.synthetic);
          -- Current signal rows may have been invalidated by a historical correction.
          -- Hysteresis is based on the newest immutable authoritative evaluation from
          -- a strictly earlier period, selecting its latest corrected generation.
          select prior.state into v_previous_state
          from public.m25_signal_evaluations prior
          where prior.signal_id=v_definition.signal_id
            and prior.scope_key_hash=j.scope_key_hash and prior.synthetic=j.synthetic
            and prior.period_end<j.period_end
          order by prior.period_end desc,prior.source_generation desc,prior.created_at desc,prior.evaluation_id desc
          limit 1;
          v_anomalous:=v_baseline.sample_count>=v_definition.minimum_baseline_support
            and v_feature.sample_count>=v_definition.minimum_current_support and v_fallback<>'none'
            and v_score>=v_definition.opening_threshold;
          v_consecutive:=v_definition.consecutive_windows;
          if v_anomalous and v_definition.consecutive_windows>1 then
            select count(*)::integer into v_consecutive from (
              select anomalous from (select distinct on (period_end) period_end,anomalous from public.m25_signal_evaluations
                where signal_id=v_definition.signal_id and scope_key_hash=j.scope_key_hash and synthetic=j.synthetic and period_end<j.period_end
                order by period_end desc,source_generation desc,created_at desc,evaluation_id desc) authoritative_evaluations
              order by period_end desc limit v_definition.consecutive_windows-1
            ) recent where anomalous;
            v_consecutive:=v_consecutive+1;
          end if;
          v_state:=public.m25_signal_state_v1(v_score,v_definition.opening_threshold,v_definition.clearing_threshold,
            v_previous_state,v_consecutive,v_definition.consecutive_windows,
            v_baseline.sample_count>=v_definition.minimum_baseline_support
              and v_feature.sample_count>=v_definition.minimum_current_support and v_fallback<>'none');
          v_evaluation_id:=public.m22_safe_digest(concat_ws('|','m25-evaluation-v1',v_definition.signal_id,j.scope_key_hash,j.synthetic::text,j.period_end::text,j.generation::text,v_baseline_version,v_feature.numeric_value::text,v_score::text));
          insert into public.m25_signal_evaluations(evaluation_id,signal_id,scope_key_hash,synthetic,period_end,state,anomalous,baseline_version,source_generation)
          values(v_evaluation_id,v_definition.signal_id,j.scope_key_hash,j.synthetic,j.period_end,v_state,v_anomalous,v_baseline_version,j.generation)
          on conflict(evaluation_id) do nothing;
          insert into public.m25_statistical_signals(signal_id,signal_episode_id,metric,scope,scope_key_hash,direction,state,observed_value,baseline_median,baseline_mad,fallback_statistic,robust_score,sample_count,support_level,coverage_score,baseline_version,explanation_code,rule_fallback,synthetic,generated_at,evaluation_id,source_generation)
          values(v_definition.signal_id,concat(v_definition.signal_id,':',j.scope_key_hash),v_feature.feature_id,j.scope,j.scope_key_hash,v_definition.direction,v_state,v_feature.numeric_value,v_baseline.median,v_baseline.median_absolute_deviation,v_fallback,v_score,v_feature.sample_count,v_support,v_feature.coverage_score,v_baseline_version,v_definition.explanation_code,v_definition.rule_fallback,j.synthetic,j.period_end,v_evaluation_id,j.generation)
          on conflict(signal_id,scope_key_hash,synthetic) do update set state=excluded.state,observed_value=excluded.observed_value,baseline_median=excluded.baseline_median,baseline_mad=excluded.baseline_mad,fallback_statistic=excluded.fallback_statistic,robust_score=excluded.robust_score,sample_count=excluded.sample_count,support_level=excluded.support_level,coverage_score=excluded.coverage_score,baseline_version=excluded.baseline_version,generated_at=excluded.generated_at,evaluation_id=excluded.evaluation_id,source_generation=excluded.source_generation
          where public.m25_statistical_signals.promoted_alert_id is null and (
            public.m25_statistical_signals.generated_at < excluded.generated_at
            or (public.m25_statistical_signals.generated_at = excluded.generated_at
              and public.m25_statistical_signals.source_generation < excluded.source_generation)
          );
          get diagnostics v_rows=row_count; v_signals:=v_signals+v_rows;
        end loop;
      end loop;

      insert into public.m25_readiness_assessments(source_snapshot_id,assessed_at,source_generation,reviewed_calendar_days,reviewed_device_model_days,reviewed_work_day_sessions,device_count,device_model_diversity,adapter_version_diversity,feature_completeness,missingness,reviewed_label_count,positive_label_count,negative_label_count,drift_evidence,cohort_support,train_holdout_feasibility,synthetic_evidence,real_reviewed_evidence,decision)
      with authoritative_snapshots as (
        select fs.* from public.m25_feature_snapshots fs where fs.synthetic=j.synthetic
          and not exists (select 1 from public.m25_feature_snapshots newer where newer.scope=fs.scope and newer.scope_key_hash=fs.scope_key_hash and newer.period_start=fs.period_start and newer.period_end=fs.period_end and newer.feature_version=fs.feature_version and newer.synthetic=fs.synthetic and newer.generation>fs.generation)
      ), readiness_evidence as (
        select count(distinct fs.period_start::date) filter(
            where exists (
              select 1 from public.m25_feature_values observed
              where observed.snapshot_id=fs.id and observed.observation_status='observed'
                and observed.sample_count>0 and observed.coverage_score>0
            )
          )::integer reviewed_calendar_days,
          count(distinct (fs.device_model,fs.period_start::date)) filter(
            where fs.scope='device_model_day' and fs.device_model is not null
              and exists (
                select 1 from public.m25_feature_values observed
                where observed.snapshot_id=fs.id and observed.observation_status='observed'
                  and observed.sample_count>0 and observed.coverage_score>0
              )
          )::integer reviewed_device_model_days,
          count(distinct (fs.scope_key_hash,fs.period_start,fs.period_end)) filter(
            where fs.scope='device_work_day' and exists (
              select 1 from public.m25_feature_values observed
              where observed.snapshot_id=fs.id and observed.observation_status='observed'
                and observed.sample_count>0 and observed.coverage_score>0
            )
          )::integer reviewed_work_day_sessions,
          count(distinct fs.device_model) filter(where fs.device_model is not null)::integer device_model_diversity,
          count(distinct fs.adapter_version) filter(where fs.adapter_version is not null)::integer adapter_version_diversity,
          coalesce(avg((fv.observation_status='observed')::integer),0) feature_completeness
        from authoritative_snapshots fs join public.m25_feature_values fv on fv.snapshot_id=fs.id
      )
      select s_id,j.period_end,j.generation,e.reviewed_calendar_days,e.reviewed_device_model_days,e.reviewed_work_day_sessions,
        (select count(distinct r.gps_device_id)::integer from public.telemetry_receipts r where r.synthetic=j.synthetic),
        e.device_model_diversity,e.adapter_version_diversity,e.feature_completeness,1-e.feature_completeness,
        0,0,0,'insufficient_data',case when j.synthetic then 'synthetic_only' else 'low' end,'not_ready',j.synthetic,false,'production_ml_not_authorized'
      from readiness_evidence e
      on conflict(source_snapshot_id) do nothing;
      get diagnostics v_rows=row_count; v_readiness:=v_readiness+v_rows;

      -- A corrected historical generation invalidates reviewability immediately and
      -- requeues dependent windows as a bounded chronological chain.
      if j.authoritative_correction_pending then
        if (select count(*) from public.m25_feature_extraction_jobs later
            where later.scope=j.scope and later.scope_key_hash=j.scope_key_hash and later.synthetic=j.synthetic
              and later.period_end>j.period_end) > 1000 then
          raise exception 'M25 historical correction exceeds bounded dependency window' using errcode='54000';
        end if;
        update public.m25_statistical_signals sig set
          state='insufficient_data',
          evaluation_id=public.m22_safe_digest(concat_ws('|','m25-invalidated-v1',sig.id::text,s_id::text))
        where sig.scope_key_hash=j.scope_key_hash and sig.synthetic=j.synthetic and sig.generated_at>j.period_end;
        -- Advance exactly the next chronological evidence period. That job carries
        -- the correction marker forward after rebuilding, so every affected later
        -- window is reevaluated in order without unbounded fan-out.
        update public.m25_feature_extraction_jobs later set
          generation=later.generation+1,state=case when later.state='processing' then 'processing' else 'pending' end,
          dirty_after_claim=case when later.state='processing' then true else later.dirty_after_claim end,
          attempt_count=case when later.state='processing' then later.attempt_count else 0 end,
          safe_failure_reason_code=case when later.state='processing' then later.safe_failure_reason_code else null end,
          completed_at=case when later.state='processing' then later.completed_at else null end,
          locked_at=case when later.state='processing' then later.locked_at else null end,
          claimed_generation=case when later.state='processing' then later.claimed_generation else null end,
          authoritative_correction_pending=true,dependency_cause_snapshot_id=s_id,
          next_attempt_at=clock_timestamp(),updated_at=clock_timestamp()
        where later.scope=j.scope and later.scope_key_hash=j.scope_key_hash and later.synthetic=j.synthetic
          and later.period_end=(select min(next_period.period_end) from public.m25_feature_extraction_jobs next_period
            where next_period.scope=j.scope and next_period.scope_key_hash=j.scope_key_hash
              and next_period.synthetic=j.synthetic and next_period.period_end>j.period_end)
          and later.dependency_cause_snapshot_id is distinct from s_id;
      end if;
      update public.m25_feature_extraction_jobs set
        state=case when generation=claimed_generation and not dirty_after_claim then 'completed' else 'pending' end,
        completed_at=case when generation=claimed_generation and not dirty_after_claim then clock_timestamp() else null end,
        authoritative_correction_pending=case
          when generation=claimed_generation and not dirty_after_claim then false
          else authoritative_correction_pending end,
        dirty_after_claim=false,locked_at=null,safe_failure_reason_code=null,updated_at=clock_timestamp()
      where id=j.id;
      v_built:=v_built+1;
    exception when others then
      update public.m25_feature_extraction_jobs set state=case when attempt_count>=8 then 'failed' else 'pending' end, next_attempt_at=p_now+make_interval(secs=>least(300,5*(2^least(attempt_count,6)))::integer), locked_at=null, safe_failure_reason_code=case when attempt_count>=8 then 'attempts_exhausted' else 'evaluation_failed' end, updated_at=clock_timestamp() where id=j.id;
      v_retries:=v_retries+1;
    end;
  end loop;
  return jsonb_build_object('claimed',v_claimed,'feature_snapshots_built',v_built,'baselines_evaluated',v_baselines,'signals_evaluated',v_signals,'readiness_assessments',v_readiness,'retry_or_failed',v_retries);
end;
$$;

revoke all on function public.m25_process_statistical_queue(integer,timestamptz) from public,anon,authenticated;
grant execute on function public.m25_process_statistical_queue(integer,timestamptz) to service_role;
