-- Final M24F/M25 authoritative-generation and evidence closure.

create or replace function public.m24f_is_safe_metadata(p_value text)
returns boolean language sql immutable parallel safe
set search_path=pg_catalog,public as $$
  select p_value is null or (
    char_length(p_value)<=500
    and p_value !~ E'[\u0000-\u0008\u000B\u000C\u000E-\u001F]'
    and p_value !~* '(^|[^a-z0-9])(password|passwd|pwd|credential|secret|bearer|token|api[_ -]?key|auth(entication|orization)?[_ -]?header|private[_ -]?key|client[_ -]?secret)([^a-z0-9]|$)'
    and p_value !~* '(https?|wss?|mqtt|tcp|udp)://|(^|[[:space:]])([0-9]{1,3}\.){3}[0-9]{1,3}(:[0-9]{1,5})?(/[^[:space:]]*)?'
    and p_value !~* '(^|[^a-z0-9])([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(:[0-9]{1,5})?(/[^[:space:]]*)'
    and p_value !~* '(^|[^0-9])[+-]?[0-9]{1,2}\.[0-9]{4,}[,[:space:]]+[+-]?[0-9]{1,3}\.[0-9]{4,}([^0-9]|$)'
    and p_value !~* '<[!?/]?[a-z][^>]*>|[{}\[\]]|(^|[^a-z])(raw[_ -]?(payload|body)|payload[_ -]?(body|fragment|xml|json))([^a-z]|$)'
    and p_value !~* '(^|[^a-z0-9])(imei|imsi|iccid|serial[_ -]?number|physical[_ -]?device[_ -]?(evidence|photo|identifier))([^a-z0-9]|$)'
  )
$$;

create or replace function public.admin_record_m24f_certification_scenarios_v1(
  p_certification_run_id uuid,p_scenario_ids text[],p_categories text[],p_passed boolean[],p_reason_codes text[]
) returns integer language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_actor uuid; v_count integer:=coalesce(cardinality(p_scenario_ids),0); v_existing integer; v_declared integer; v_index integer;
begin
  v_actor:=public.m20a_require_admin();
  if p_certification_run_id is null or p_scenario_ids is null or p_categories is null or p_passed is null or p_reason_codes is null
    or cardinality(p_categories)<>v_count or cardinality(p_passed)<>v_count or cardinality(p_reason_codes)<>v_count or v_count<1 or v_count>200 then
    raise exception 'Invalid bounded M24F certification scenarios' using errcode='22023';
  end if;
  select scenario_count into v_declared from public.m24f_certification_runs where id=p_certification_run_id for update;
  if not found then raise exception 'M24F certification run not found' using errcode='P0002'; end if;
  select count(*)::integer into v_existing from public.m24f_certification_scenarios where certification_run_id=p_certification_run_id;
  if v_existing>=v_declared or v_existing+v_count>v_declared then raise exception 'M24F certification scenario evidence is closed' using errcode='55000'; end if;
  for v_index in 1..v_count loop
    if p_scenario_ids[v_index] is null or char_length(p_scenario_ids[v_index]) not between 1 and 100
      or p_reason_codes[v_index] is null or char_length(p_reason_codes[v_index]) not between 1 and 100
      or p_categories[v_index] not in ('authentication','parsing','normalization','replay_and_sequence','work_and_privacy','safe_output')
      or not public.m24f_is_safe_metadata(p_scenario_ids[v_index]) or not public.m24f_is_safe_metadata(p_reason_codes[v_index]) then
      raise exception 'Invalid M24F certification scenario value' using errcode='22023';
    end if;
    insert into public.m24f_certification_scenarios(certification_run_id,scenario_id,category,passed,reason_code,synthetic)
    values(p_certification_run_id,trim(p_scenario_ids[v_index]),p_categories[v_index],p_passed[v_index],trim(p_reason_codes[v_index]),true);
  end loop;
  insert into public.audit_logs(actor_type,actor_id,action,entity_type,entity_id,safe_details)
  values('admin',v_actor,'m24f_certification_scenarios_recorded','m24f_certification_run',p_certification_run_id,jsonb_build_object('scenario_count',v_count,'synthetic',true));
  return v_count;
end $$;

create or replace function public.m24f_guard_certification_scenario_immutability()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare v_declared integer; v_existing integer;
begin
  if tg_op<>'INSERT' then
    raise exception 'M24F certification scenarios are immutable' using errcode='55000';
  end if;
  select scenario_count into v_declared from public.m24f_certification_runs where id=new.certification_run_id for update;
  if not found then raise exception 'M24F certification run not found' using errcode='P0002'; end if;
  select count(*)::integer into v_existing from public.m24f_certification_scenarios where certification_run_id=new.certification_run_id;
  if v_existing>=v_declared then raise exception 'M24F certification scenario evidence is closed' using errcode='55000'; end if;
  return new;
end $$;

drop trigger if exists m24f_certification_scenario_immutability on public.m24f_certification_scenarios;
create trigger m24f_certification_scenario_immutability before insert or update or delete on public.m24f_certification_scenarios
for each row execute function public.m24f_guard_certification_scenario_immutability();

alter table public.m25_statistical_signals add column source_generation integer not null default 1 check(source_generation between 1 and 1000000000);
alter table public.m25_signal_evaluations add column source_generation integer not null default 1 check(source_generation between 1 and 1000000000);
alter table public.m25_baseline_versions add column source_generation integer not null default 1 check(source_generation between 1 and 1000000000);
alter table public.m25_baseline_versions add column source_snapshot_id uuid references public.m25_feature_snapshots(id) on delete restrict;
alter table public.m25_readiness_assessments add column source_generation integer not null default 1 check(source_generation between 1 and 1000000000);

create or replace function public.m25_process_statistical_queue(p_batch_size integer default 50, p_now timestamptz default clock_timestamp())
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  j public.m25_feature_extraction_jobs%rowtype; s_id uuid; v_feature record; v_definition record; v_baseline public.m25_baseline_versions%rowtype;
  v_count integer; v_live integer; v_delayed integer; v_health integer; v_rejected integer; v_conflicts integer;
  v_value numeric; v_median numeric; v_mad numeric; v_p25 numeric; v_p75 numeric; v_min numeric; v_max numeric; v_score numeric;
  v_baseline_count integer; v_coverage_count integer; v_state text; v_fallback text; v_support text; v_baseline_version text;
  v_evaluation_id text; v_anomalous boolean; v_consecutive integer; v_superseded_snapshot_id uuid;
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
          v_score:=case when v_fallback='mad' then 0.6745*(v_feature.numeric_value-v_baseline.median)/v_baseline.median_absolute_deviation when v_fallback='iqr' then (v_feature.numeric_value-v_baseline.median)/(v_baseline.p75-v_baseline.p25) else null end;
          v_support:=case when j.synthetic then 'synthetic_only' when v_feature.sample_count>=8 then 'strong' when v_feature.sample_count>=3 then 'moderate' else 'low' end;
          v_state:=case when v_baseline.sample_count<v_definition.minimum_baseline_support or v_feature.sample_count<v_definition.minimum_current_support or v_fallback='none' then 'insufficient_data' when (v_definition.direction='high_bad' and v_score>=v_definition.opening_threshold) or (v_definition.direction='low_bad' and v_score<=-v_definition.opening_threshold) or (v_definition.direction='two_sided' and abs(v_score)>=v_definition.opening_threshold) then 'investigate' else 'normal' end;
          v_anomalous:=v_state='investigate';
          v_evaluation_id:=public.m22_safe_digest(concat_ws('|','m25-evaluation-v1',v_definition.signal_id,j.scope_key_hash,j.synthetic::text,j.period_end::text,v_baseline_version,v_feature.numeric_value::text,v_score::text));
          insert into public.m25_signal_evaluations(evaluation_id,signal_id,scope_key_hash,synthetic,period_end,state,anomalous,baseline_version,source_generation)
          values(v_evaluation_id,v_definition.signal_id,j.scope_key_hash,j.synthetic,j.period_end,v_state,v_anomalous,v_baseline_version,j.generation)
          on conflict(evaluation_id) do nothing;
          if v_anomalous and v_definition.consecutive_windows > 1 then
            select count(*)::integer into v_consecutive from (
              select anomalous from (select distinct on (period_end) period_end,anomalous from public.m25_signal_evaluations
                where signal_id=v_definition.signal_id and scope_key_hash=j.scope_key_hash and synthetic=j.synthetic and period_end<=j.period_end
                order by period_end desc,source_generation desc,created_at desc,evaluation_id desc) authoritative_evaluations
              order by period_end desc limit v_definition.consecutive_windows
            ) recent where anomalous;
            if v_consecutive < v_definition.consecutive_windows then v_state:='watch'; end if;
          end if;
          insert into public.m25_statistical_signals(signal_id,signal_episode_id,metric,scope,scope_key_hash,direction,state,observed_value,baseline_median,baseline_mad,fallback_statistic,robust_score,sample_count,support_level,coverage_score,baseline_version,explanation_code,rule_fallback,synthetic,generated_at,evaluation_id,source_generation)
          values(v_definition.signal_id,concat(v_definition.signal_id,':',j.scope_key_hash),v_feature.feature_id,j.scope,j.scope_key_hash,v_definition.direction,v_state,v_feature.numeric_value,v_baseline.median,v_baseline.median_absolute_deviation,v_fallback,v_score,v_feature.sample_count,v_support,v_feature.coverage_score,v_baseline_version,v_definition.explanation_code,v_definition.rule_fallback,j.synthetic,j.period_end,v_evaluation_id,j.generation)
          on conflict(signal_id,scope_key_hash,synthetic) do update set state=excluded.state,observed_value=excluded.observed_value,baseline_median=excluded.baseline_median,baseline_mad=excluded.baseline_mad,fallback_statistic=excluded.fallback_statistic,robust_score=excluded.robust_score,sample_count=excluded.sample_count,support_level=excluded.support_level,coverage_score=excluded.coverage_score,baseline_version=excluded.baseline_version,generated_at=excluded.generated_at,evaluation_id=excluded.evaluation_id,source_generation=excluded.source_generation
          where public.m25_statistical_signals.promoted_alert_id is null and public.m25_statistical_signals.state not in ('reviewed','suppressed') and (public.m25_statistical_signals.generated_at < excluded.generated_at or (public.m25_statistical_signals.generated_at = excluded.generated_at and public.m25_statistical_signals.source_generation < excluded.source_generation));
          get diagnostics v_rows=row_count; v_signals:=v_signals+v_rows;
        end loop;
      end loop;

      insert into public.m25_readiness_assessments(source_snapshot_id,assessed_at,source_generation,reviewed_calendar_days,reviewed_device_model_days,reviewed_work_day_sessions,device_count,device_model_diversity,adapter_version_diversity,feature_completeness,missingness,reviewed_label_count,positive_label_count,negative_label_count,drift_evidence,cohort_support,train_holdout_feasibility,synthetic_evidence,real_reviewed_evidence,decision)
      with authoritative_snapshots as (
        select fs.* from public.m25_feature_snapshots fs where fs.synthetic=j.synthetic
          and not exists (select 1 from public.m25_feature_snapshots newer where newer.scope=fs.scope and newer.scope_key_hash=fs.scope_key_hash and newer.period_start=fs.period_start and newer.period_end=fs.period_end and newer.feature_version=fs.feature_version and newer.synthetic=fs.synthetic and newer.generation>fs.generation)
      ), readiness_evidence as (
        select count(distinct fs.period_start::date)::integer reviewed_calendar_days,
          count(distinct (fs.device_model,fs.period_start::date))::integer reviewed_device_model_days,
          count(distinct (fs.scope_key_hash,fs.period_start,fs.period_end)) filter(where fs.scope='device_work_day')::integer reviewed_work_day_sessions,
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


create or replace function public.admin_get_m25_intelligence_readiness_v1(p_limit integer default 100)
returns jsonb language plpgsql security definer stable set search_path=pg_catalog,public as $$
declare v_actor uuid; v_readiness jsonb; v_baselines jsonb; v_signals jsonb; v_governance jsonb;
begin
  v_actor:=public.m20a_require_admin();
  if p_limit not between 1 and 200 then raise exception 'Invalid bounded M25 limit' using errcode='22023'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.effective_from desc,x.baseline_version desc),'[]'::jsonb) into v_baselines from (
    select * from (
      select distinct on (metric,cohort_key,effective_from) metric,cohort_key,baseline_version,sample_count,coverage_count,median,median_absolute_deviation,effective_from,active,synthetic,fallback_used
      from public.m25_baseline_versions order by metric,cohort_key,effective_from,source_generation desc,baseline_version desc
    ) authoritative_baselines order by effective_from desc,baseline_version desc limit p_limit
  ) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.generated_at desc,x.source_generation desc),'[]'::jsonb) into v_signals from (
    select id,signal_id,metric,scope,state,observed_value,baseline_median,robust_score,support_level,coverage_score,baseline_version,explanation_code,rule_fallback,synthetic,generated_at,source_generation,promoted_alert_id
    from public.m25_statistical_signals order by generated_at desc,source_generation desc limit p_limit
  ) x;
  select coalesce(to_jsonb(x),'{}'::jsonb) into v_readiness from (
    select * from public.m25_readiness_assessments order by assessed_at desc,source_generation desc,created_at desc,id desc limit 1
  ) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by analysis_version),'[]'::jsonb) into v_governance from (
    select analysis_version,kind,status,feature_version,explanation_method,rule_fallback,human_review_policy,ap_approved,security_approved,pilot_approved from public.m25_analysis_versions
  ) x;
  return jsonb_build_object('contractVersion','m25-admin-v1','readiness',v_readiness,'baselines',v_baselines,'signals',v_signals,'governance',v_governance,'mlStatus','Not activated','technicalValuesAvailable',true);
end $$;

revoke all on function public.admin_record_m24f_certification_scenarios_v1(uuid,text[],text[],boolean[],text[]) from public,anon,authenticated;
grant execute on function public.admin_record_m24f_certification_scenarios_v1(uuid,text[],text[],boolean[],text[]) to authenticated;
revoke all on function public.m25_process_statistical_queue(integer,timestamptz) from public,anon,authenticated;
grant execute on function public.m25_process_statistical_queue(integer,timestamptz) to service_role;
revoke all on function public.admin_get_m25_intelligence_readiness_v1(integer) from public,anon,authenticated;
grant execute on function public.admin_get_m25_intelligence_readiness_v1(integer) to authenticated;
