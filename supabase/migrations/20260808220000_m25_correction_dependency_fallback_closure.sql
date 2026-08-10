-- Paginate correction propagation, bind progress to each rebuilt consumer, and
-- resolve authoritative device dimensions before prior-baseline fallback selection.

alter table public.m25_feature_extraction_jobs
  add column if not exists correction_root_snapshot_id uuid references public.m25_feature_snapshots(id);
create index if not exists m25_jobs_correction_root_idx
  on public.m25_feature_extraction_jobs(correction_root_snapshot_id,period_end,id)
  where authoritative_correction_pending;

create or replace function public.m25_mark_authoritative_correction_v1() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
  if old.input_watermark is distinct from new.input_watermark then
    new.authoritative_correction_pending:=true;
    -- A direct input correction starts a new dependency generation. Propagated
    -- retries do not change the watermark and retain their root snapshot identity.
    new.dependency_cause_snapshot_id:=null;
    new.correction_root_snapshot_id:=null;
  end if;
  return new;
end $$;

create or replace function public.m25_select_prior_baseline_v1(
  p_metric text, p_source_kind text, p_scope text, p_scope_key_hash text,
  p_device_model text, p_adapter_version text, p_synthetic boolean,
  p_period_end timestamptz, p_minimum_support integer
)
returns table(fallback_used text,sample_count integer,coverage_count integer,median numeric,
  median_absolute_deviation numeric,p25 numeric,p75 numeric,minimum numeric,maximum numeric)
language sql stable set search_path = pg_catalog, public
as $$
with authoritative as (
  select fs.*,fv.numeric_value,fv.coverage_score,fd.minimum_coverage_score
  from public.m25_feature_snapshots fs
  join public.m25_feature_values fv on fv.snapshot_id=fs.id and fv.feature_id=p_metric and fv.observation_status='observed'
  join public.m25_feature_definitions fd on fd.feature_id=fv.feature_id and fd.source_kind=p_source_kind
  where fs.synthetic=p_synthetic and fs.period_end<p_period_end
    and not exists (
      select 1 from public.m25_feature_snapshots newer
      where newer.scope=fs.scope and newer.scope_key_hash=fs.scope_key_hash
        and newer.period_start=fs.period_start and newer.period_end=fs.period_end
        and newer.feature_version=fs.feature_version and newer.synthetic=fs.synthetic
        and newer.generation>fs.generation
    )
), candidates as (
  select a.*,case
    when a.scope=p_scope and a.scope_key_hash=p_scope_key_hash then 0
    when p_device_model is not null and a.scope='device_model_day'
      and a.device_model=p_device_model and (a.adapter_version is null or a.adapter_version=p_adapter_version) then 1
    when p_adapter_version is not null and a.scope='adapter_version_day'
      and a.adapter_version=p_adapter_version and (a.device_model is null or a.device_model=p_device_model) then 2
    when a.scope='fleet_day' and a.device_model is null and a.adapter_version is null then 3
    else null end as tier
  from authoritative a
), supported as (
  select tier from candidates where tier is not null group by tier
  having count(*)>=p_minimum_support order by tier limit 1
), chosen as (
  select coalesce((select tier from supported),0) as tier
), selected as (
  select c.* from candidates c cross join chosen where c.tier=chosen.tier
), stats as (
  select count(*)::integer as sample_count,
    count(*) filter(where coverage_score>=minimum_coverage_score)::integer as coverage_count,
    percentile_cont(0.5) within group(order by numeric_value)::numeric as median,
    percentile_cont(0.25) within group(order by numeric_value)::numeric as p25,
    percentile_cont(0.75) within group(order by numeric_value)::numeric as p75,
    min(numeric_value) as minimum,max(numeric_value) as maximum
  from selected
)
select case (select tier from supported) when 0 then 'exact_supported_cohort'
  when 1 then 'broader_model_adapter_cohort' when 2 then 'broader_model_adapter_cohort'
  when 3 then 'fleet_cohort' else 'insufficient_data' end,
  s.sample_count,s.coverage_count,s.median,
  (select percentile_cont(0.5) within group(order by abs(numeric_value-s.median))::numeric from selected),
  s.p25,s.p75,s.minimum,s.maximum
from stats s
$$;

revoke all on function public.m25_select_prior_baseline_v1(text,text,text,text,text,text,boolean,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.m25_select_prior_baseline_v1(text,text,text,text,text,text,boolean,timestamptz,integer) to service_role;


create or replace function public.m25_job_consumes_correction_v1(
  p_job_id uuid,p_dependency_scope text,p_dependency_scope_key_hash text,
  p_dependency_device_model text,p_dependency_adapter_version text
) returns boolean
language sql stable set search_path=pg_catalog,public as $$
with authority as (
  select j.*,
    coalesce(j.device_model,(select fs.device_model from public.m25_feature_snapshots fs
      where fs.scope=j.scope and fs.scope_key_hash=j.scope_key_hash
        and fs.period_start=j.period_start and fs.period_end=j.period_end and fs.synthetic=j.synthetic
      order by fs.generation desc limit 1)) authoritative_model,
    coalesce(j.adapter_version,(select fs.adapter_version from public.m25_feature_snapshots fs
      where fs.scope=j.scope and fs.scope_key_hash=j.scope_key_hash
        and fs.period_start=j.period_start and fs.period_end=j.period_end and fs.synthetic=j.synthetic
      order by fs.generation desc limit 1)) authoritative_adapter
  from public.m25_feature_extraction_jobs j where j.id=p_job_id
)
select coalesce((select
  (scope=p_dependency_scope and scope_key_hash=p_dependency_scope_key_hash)
  or (p_dependency_scope='device_model_day' and p_dependency_device_model is not null
    and authoritative_model=p_dependency_device_model
    and (p_dependency_adapter_version is null or authoritative_adapter=p_dependency_adapter_version))
  or (p_dependency_scope='adapter_version_day' and p_dependency_adapter_version is not null
    and authoritative_adapter=p_dependency_adapter_version
    and (p_dependency_device_model is null or authoritative_model=p_dependency_device_model))
  or (p_dependency_scope='fleet_day' and p_dependency_device_model is null and p_dependency_adapter_version is null)
from authority),false)
$$;
revoke all on function public.m25_job_consumes_correction_v1(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.m25_job_consumes_correction_v1(uuid,text,text,text,text) to service_role;

create or replace function public.m25_process_statistical_queue(p_batch_size integer default 50, p_now timestamptz default clock_timestamp())
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  j public.m25_feature_extraction_jobs%rowtype; s_id uuid; v_feature record; v_definition record; v_baseline public.m25_baseline_versions%rowtype;
  v_count integer; v_live integer; v_delayed integer; v_health integer; v_rejected integer; v_conflicts integer;
  v_value numeric; v_median numeric; v_mad numeric; v_p25 numeric; v_p75 numeric; v_min numeric; v_max numeric; v_score numeric;
  v_baseline_count integer; v_coverage_count integer; v_state text; v_fallback text; v_support text; v_baseline_version text;
  v_evaluation_id text; v_anomalous boolean; v_consecutive integer; v_superseded_snapshot_id uuid; v_previous_state text;
  v_dependency_snapshot_id uuid; v_root_snapshot_id uuid; v_dependency_scope text; v_dependency_scope_key_hash text;
  v_dependency_device_model text; v_dependency_adapter_version text;
  v_authoritative_device_model text; v_authoritative_adapter_version text;
  v_target_ids uuid[]; v_next_period timestamptz; v_propagation_remaining boolean:=false;
  v_claimed integer:=0; v_built integer:=0; v_baselines integer:=0; v_signals integer:=0; v_readiness integer:=0; v_retries integer:=0; v_rows integer;
begin
  if p_batch_size not between 1 and 200 then raise exception 'Invalid bounded M25 queue request' using errcode = '22023'; end if;
  for j in select * from public.m25_feature_extraction_jobs where state in ('pending','processing') and next_attempt_at <= p_now and attempt_count < 8 and (state='pending' or locked_at < p_now - interval '5 minutes')
      and not exists (
        select 1 from public.m25_feature_extraction_jobs blocker
        where blocker.correction_root_snapshot_id=m25_feature_extraction_jobs.correction_root_snapshot_id
          and blocker.correction_root_snapshot_id is not null
          and blocker.synthetic=m25_feature_extraction_jobs.synthetic
          and blocker.period_end<m25_feature_extraction_jobs.period_end
          and blocker.authoritative_correction_pending
          and blocker.state in ('pending','processing')
      ) order by authoritative_correction_pending desc,period_end,period_start,next_attempt_at,created_at,id limit p_batch_size loop
    -- Serialize before taking a queue-row lock. A concurrent worker that saw a later
    -- row for this cohort must wait here, then claim the chronologically earliest live
    -- row after the preceding snapshot/evaluation transaction commits.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(concat_ws('|','m25-cohort-evaluation-v1',j.scope,j.scope_key_hash,j.synthetic::text),0)
    );
    select live.* into j
    from public.m25_feature_extraction_jobs live
    where live.scope=j.scope and live.scope_key_hash=j.scope_key_hash and live.synthetic=j.synthetic
      and live.state in ('pending','processing') and live.next_attempt_at<=p_now and live.attempt_count<8
      and (live.state='pending' or live.locked_at<p_now-interval '5 minutes')
      and not exists (
        select 1 from public.m25_feature_extraction_jobs blocker
        where blocker.correction_root_snapshot_id=live.correction_root_snapshot_id
          and blocker.correction_root_snapshot_id is not null and blocker.synthetic=live.synthetic
          and blocker.period_end<live.period_end and blocker.authoritative_correction_pending
          and blocker.state in ('pending','processing')
      )
    order by live.authoritative_correction_pending desc,live.period_end,live.period_start,live.next_attempt_at,live.created_at,live.id
    for update skip locked limit 1;
    if not found then continue; end if;
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

      -- Device-owned jobs intentionally keep optional cohort dimensions out of the
      -- queue payload. Resolve them from the joined registry/receipt authority.
      select case when count(distinct d.model)=1 then min(d.model) end,
        case when count(distinct r.adapter_version)=1 then min(r.adapter_version) end
      into v_authoritative_device_model,v_authoritative_adapter_version
      from public.telemetry_receipts r join public.gps_devices d on d.id=r.gps_device_id
      where r.captured_at>=j.period_start and r.captured_at<j.period_end and r.synthetic=j.synthetic
        and (j.gps_device_id is null or r.gps_device_id=j.gps_device_id)
        and (j.ad_work_day_id is null or r.ad_work_day_id=j.ad_work_day_id)
        and (j.adapter_version is null or r.adapter_version=j.adapter_version)
        and (j.device_model is null or d.model=j.device_model);
      v_authoritative_device_model:=coalesce(j.device_model,v_authoritative_device_model);
      v_authoritative_adapter_version:=coalesce(j.adapter_version,v_authoritative_adapter_version);

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
      values('m25-features-v1',j.scope,j.scope_key_hash,j.period_start,j.period_end,v_authoritative_device_model,v_authoritative_adapter_version,case when v_count=0 then 0 else 1 end,j.synthetic,j.generation,v_superseded_snapshot_id,true,j.input_watermark)
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
        select selected.fallback_used,selected.sample_count,selected.coverage_count,selected.median,
          selected.median_absolute_deviation,selected.p25,selected.p75,selected.minimum,selected.maximum
        into v_fallback,v_baseline_count,v_coverage_count,v_median,v_mad,v_p25,v_p75,v_min,v_max
        from public.m25_select_prior_baseline_v1(v_feature.feature_id,v_feature.source_kind,j.scope,j.scope_key_hash,
          v_authoritative_device_model,v_authoritative_adapter_version,j.synthetic,j.period_end,8) selected;
        v_baseline_version:=public.m22_safe_digest(concat('m25-baseline-v1|',s_id,'|',v_feature.feature_id));
        insert into public.m25_baseline_versions(baseline_version,metric,cohort_key,device_model,adapter_version,source_kind,synthetic,fallback_used,sample_count,coverage_count,median,median_absolute_deviation,p25,p75,minimum,maximum,baseline_period_start,baseline_period_end,effective_from,active,provisional,source_generation,source_snapshot_id)
        values(v_baseline_version,v_feature.feature_id,concat(j.scope,':',j.scope_key_hash),v_authoritative_device_model,v_authoritative_adapter_version,v_feature.source_kind,j.synthetic,v_fallback,v_baseline_count,v_coverage_count,v_median,v_mad,v_p25,v_p75,v_min,v_max,j.period_start,j.period_end,j.period_end,false,true,j.generation,s_id)
        on conflict(baseline_version) do nothing;
        get diagnostics v_rows=row_count; v_baselines:=v_baselines+v_rows;

        for v_definition in select * from public.m25_statistical_signal_definitions where metric=v_feature.feature_id order by signal_id loop
          select * into v_baseline from public.m25_baseline_versions b where b.baseline_version=v_baseline_version;
          v_fallback:=v_baseline.fallback_used;
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

      -- A corrected broader baseline cohort can invalidate exact and fallback
      -- consumers. Requeue only the next compatible authoritative period and
      -- let that rebuilt period carry the correction forward. This bounds each
      -- processing cycle while retaining the root dependency identity.
      -- invalidate its mutable signal projection immediately, including reviewed or
      -- suppressed rows, so stale evidence cannot remain promotable.
      if j.authoritative_correction_pending then
        -- Root identity is stable across the correction graph; the dependency
        -- identity is the snapshot published by this particular consumer. This
        -- prevents one successful sibling from satisfying another sibling's edge.
        v_root_snapshot_id:=coalesce(j.correction_root_snapshot_id,j.dependency_cause_snapshot_id,s_id);
        v_dependency_snapshot_id:=s_id;
        update public.m25_feature_extraction_jobs
          set correction_root_snapshot_id=v_root_snapshot_id where id=j.id;
        select root_job.scope,root_job.scope_key_hash,root_snapshot.device_model,root_snapshot.adapter_version
          into v_dependency_scope,v_dependency_scope_key_hash,v_dependency_device_model,v_dependency_adapter_version
        from public.m25_feature_snapshots root_snapshot
        join public.m25_feature_extraction_jobs root_job
          on root_job.scope=root_snapshot.scope and root_job.scope_key_hash=root_snapshot.scope_key_hash
          and root_job.period_start=root_snapshot.period_start and root_job.period_end=root_snapshot.period_end
          and root_job.synthetic=root_snapshot.synthetic
        where root_snapshot.id=v_root_snapshot_id;
        if not found then
          v_dependency_scope:=j.scope; v_dependency_scope_key_hash:=j.scope_key_hash;
          v_dependency_device_model:=v_authoritative_device_model;
          v_dependency_adapter_version:=v_authoritative_adapter_version;
        end if;

        select min(later.period_end) into v_next_period
        from public.m25_feature_extraction_jobs later
        where later.synthetic=j.synthetic and later.period_end>j.period_end
          and (later.state in ('processing','completed','failed') or exists (
            select 1 from public.m25_feature_snapshots prior_snapshot
            where prior_snapshot.scope=later.scope and prior_snapshot.scope_key_hash=later.scope_key_hash
              and prior_snapshot.period_start=later.period_start and prior_snapshot.period_end=later.period_end
              and prior_snapshot.synthetic=later.synthetic))
          and public.m25_job_consumes_correction_v1(later.id,v_dependency_scope,v_dependency_scope_key_hash,
            v_dependency_device_model,v_dependency_adapter_version)
          and later.dependency_cause_snapshot_id is distinct from v_dependency_snapshot_id;

        select coalesce(array_agg(page.id order by page.id),'{}'::uuid[]) into v_target_ids
        from (select later.id from public.m25_feature_extraction_jobs later
          where later.synthetic=j.synthetic and later.period_end=v_next_period
            and (later.state in ('processing','completed','failed') or exists (
              select 1 from public.m25_feature_snapshots prior_snapshot
              where prior_snapshot.scope=later.scope and prior_snapshot.scope_key_hash=later.scope_key_hash
                and prior_snapshot.period_start=later.period_start and prior_snapshot.period_end=later.period_end
                and prior_snapshot.synthetic=later.synthetic))
            and public.m25_job_consumes_correction_v1(later.id,v_dependency_scope,v_dependency_scope_key_hash,
            v_dependency_device_model,v_dependency_adapter_version)
            and later.dependency_cause_snapshot_id is distinct from v_dependency_snapshot_id
          order by later.id limit 200) page;

        -- Fail every compatible later projection closed immediately. Requeueing is
        -- paginated below, but no not-yet-paged reviewed/suppressed signal remains
        -- promotable while the correction graph converges.
        update public.m25_statistical_signals sig set state='insufficient_data',
          evaluation_id=public.m22_safe_digest(concat_ws('|','m25-fallback-invalidated-v2',sig.id::text,v_dependency_snapshot_id::text))
        where sig.synthetic=j.synthetic and sig.generated_at>j.period_end
          and exists (select 1 from public.m25_feature_extraction_jobs consumer
            where consumer.scope_key_hash=sig.scope_key_hash and consumer.synthetic=sig.synthetic
              and consumer.period_end=sig.generated_at
              and public.m25_job_consumes_correction_v1(consumer.id,v_dependency_scope,
                v_dependency_scope_key_hash,v_dependency_device_model,v_dependency_adapter_version));

        update public.m25_feature_extraction_jobs later set
          generation=later.generation+1,state=case when later.state='processing' then 'processing' else 'pending' end,
          dirty_after_claim=case when later.state='processing' then true else later.dirty_after_claim end,
          attempt_count=case when later.state='processing' then later.attempt_count else 0 end,
          safe_failure_reason_code=case when later.state='processing' then later.safe_failure_reason_code else null end,
          completed_at=case when later.state='processing' then later.completed_at else null end,
          locked_at=case when later.state='processing' then later.locked_at else null end,
          claimed_generation=case when later.state='processing' then later.claimed_generation else null end,
          authoritative_correction_pending=true,dependency_cause_snapshot_id=v_dependency_snapshot_id,
          correction_root_snapshot_id=v_root_snapshot_id,next_attempt_at=clock_timestamp(),updated_at=clock_timestamp()
        where later.id=any(v_target_ids);

        select exists(select 1 from public.m25_feature_extraction_jobs later
          where later.synthetic=j.synthetic and later.period_end>=coalesce(v_next_period,'infinity'::timestamptz)
            and later.period_end>j.period_end
            and public.m25_job_consumes_correction_v1(later.id,v_dependency_scope,v_dependency_scope_key_hash,
            v_dependency_device_model,v_dependency_adapter_version)
            and later.dependency_cause_snapshot_id is distinct from v_dependency_snapshot_id)
        into v_propagation_remaining;
      else
        v_propagation_remaining:=false;
      end if;
      update public.m25_feature_extraction_jobs set
        state=case when generation=claimed_generation and not dirty_after_claim and not v_propagation_remaining then 'completed' else 'pending' end,
        completed_at=case when generation=claimed_generation and not dirty_after_claim and not v_propagation_remaining then clock_timestamp() else null end,
        -- Successful pages are progress, not failed attempts. Each subsequent
        -- propagation page and each rebuilt generation receives a fresh retry budget.
        attempt_count=case when v_propagation_remaining and not dirty_after_claim then 0 else attempt_count end,
        authoritative_correction_pending=case
          when generation=claimed_generation and not dirty_after_claim and not v_propagation_remaining then false
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
