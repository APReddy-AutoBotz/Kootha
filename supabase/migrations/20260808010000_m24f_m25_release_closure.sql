-- M24F/M25 release-closure corrections. These definitions are additive so an
-- installation that has already applied the foundations receives the same authority
-- and evidence checks without rewriting historical migration state.

alter table public.m24f_certification_runs
  add constraint m24f_passed_requires_nonvacuous_synthetic_check
  check (certification_state <> 'passed' or (certification_level = 'synthetic_conformance' and synthetic and scenario_count > 0 and passed_count = scenario_count and failed_count = 0)) not valid;

create or replace function public.admin_record_m24f_certification_v1(
  p_candidate_id uuid,
  p_adapter_id text,
  p_adapter_version text,
  p_certification_level text,
  p_certification_state text,
  p_scenario_count integer,
  p_passed_count integer,
  p_result_digest text,
  p_safe_summary text
) returns uuid language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_actor uuid; v_id uuid; v_failed integer;
begin
  v_actor := public.m20a_require_admin();
  if p_certification_level not in ('manifest_only','synthetic_conformance') then
    raise exception 'M24F physical and production certification are deferred beyond this software-only milestone' using errcode = '55000';
  end if;
  if p_candidate_id is null or p_scenario_count not between 0 and 200 or p_passed_count not between 0 and p_scenario_count
    or p_result_digest is null or p_result_digest !~ '^[0-9a-f]{64}$'
    or p_safe_summary is null or char_length(p_safe_summary) not between 1 and 500 then
    raise exception 'Invalid M24F certification result' using errcode = '22023';
  end if;
  if p_certification_state = 'passed' and (p_certification_level <> 'synthetic_conformance' or p_scenario_count <= 0 or p_passed_count <> p_scenario_count) then
    raise exception 'Passed certification requires nonzero successful synthetic conformance evidence' using errcode = '22023';
  end if;
  v_failed := p_scenario_count - p_passed_count;
  insert into public.m24f_certification_runs(
    candidate_id, adapter_id, adapter_version, certification_level,
    certification_state, synthetic, scenario_count, passed_count, failed_count,
    result_digest, safe_summary, completed_at, created_by_admin
  ) values (
    p_candidate_id, p_adapter_id, p_adapter_version, p_certification_level,
    p_certification_state, true, p_scenario_count, p_passed_count, v_failed,
    p_result_digest, p_safe_summary, clock_timestamp(), v_actor
  ) returning id into v_id;
  update public.m24f_adapter_candidates set certification_status = p_certification_state, updated_by_admin = v_actor, updated_at = clock_timestamp() where id = p_candidate_id;
  insert into public.audit_logs(actor_type, actor_id, action, entity_type, entity_id, safe_details)
  values ('admin', v_actor, 'm24f_certification_recorded', 'm24f_certification_run', v_id, jsonb_build_object('candidate_id',p_candidate_id,'passed_count',p_passed_count,'scenario_count',p_scenario_count,'synthetic',true));
  return v_id;
end;
$$;

create or replace function public.admin_decide_m24f_candidate_v1(
  p_candidate_id uuid,
  p_new_status text,
  p_reason text,
  p_safe_note text
) returns uuid language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_actor uuid; v_previous text; v_id uuid; v_latest public.m24f_certification_runs%rowtype;
begin
  v_actor := public.m20a_require_admin();
  if p_reason is null or char_length(trim(p_reason)) not between 1 and 160 or p_safe_note is null or char_length(trim(p_safe_note)) not between 1 and 500 then
    raise exception 'A bounded M24F reason and note are required' using errcode = '22023';
  end if;
  select decision_status into v_previous from public.m24f_adapter_candidates where id = p_candidate_id for update;
  if v_previous is null then raise exception 'M24F candidate not found' using errcode = 'P0002'; end if;
  if p_new_status in ('technically_compatible','approved_by_ap') then
    select * into v_latest from public.m24f_certification_runs where candidate_id = p_candidate_id order by completed_at desc nulls last, id desc limit 1;
    if v_latest.id is null or v_latest.certification_level <> 'synthetic_conformance'
      or not v_latest.synthetic or v_latest.certification_state <> 'passed'
      or v_latest.scenario_count <= 0 or v_latest.passed_count <> v_latest.scenario_count or v_latest.failed_count <> 0 then
      raise exception 'Current nonzero successful synthetic certification is required' using errcode = '55000';
    end if;
  end if;
  if p_new_status = 'approved_by_ap' and v_previous <> 'technically_compatible' then raise exception 'AP approval requires technical compatibility' using errcode = '55000'; end if;
  update public.m24f_adapter_candidates set decision_status = p_new_status, updated_by_admin = v_actor, updated_at = clock_timestamp() where id = p_candidate_id returning id into v_id;
  insert into public.m24f_candidate_decision_history(candidate_id, previous_status, new_status, actor_admin_id, reason, safe_note)
  values (p_candidate_id, v_previous, p_new_status, v_actor, trim(p_reason), trim(p_safe_note));
  insert into public.audit_logs(actor_type, actor_id, action, entity_type, entity_id, safe_details)
  values ('admin', v_actor, 'm24f_candidate_decision_recorded', 'm24f_adapter_candidate', v_id, jsonb_build_object('previous_status',v_previous,'new_status',p_new_status));
  return v_id;
end;
$$;

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
    where h.signal_id=s.id and h.new_state=s.state and h.created_at>=s.generated_at
  ) then raise exception 'A matching immutable admin review is required before promotion' using errcode='55000'; end if;
  v_key:=public.m22_safe_digest(concat('m25-statistical-signal|',s.signal_id,'|',s.scope_key_hash,'|',s.synthetic::text));
  insert into public.alerts(ad_work_day_id,type,severity,status,message,created_at,source,dedupe_key,episode_number,condition_active,first_detected_at,last_detected_at,occurrence_count,gps_device_id,synthetic,title,observed_value,threshold_value,value_unit,status_changed_at,updated_at,origin)
  values(null,'device_not_responding','warning','new','Statistical signal requires operational review.',clock_timestamp(),'statistical_signal',v_key,1,true,s.generated_at,s.generated_at,1,null,s.synthetic,'Statistical signal review',s.observed_value,null,'count',clock_timestamp(),clock_timestamp(),'m22_rule_engine') returning id into v_alert;
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
      'id',a.id,'ruleId',a.rule_id,'ruleVersion',a.rule_version,'title',a.title,
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
    where (a.rule_id is not null or a.source='statistical_signal') and (p_status is null or a.status::text=p_status)
      and (p_severity is null or a.severity::text=p_severity)
      and (p_rule_id is null or a.rule_id=p_rule_id) and (p_source is null or a.source=p_source)
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
    'alert',jsonb_build_object('id',a.id,'ruleId',a.rule_id,'ruleVersion',a.rule_version,
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
  where a.id=p_alert_id and (a.rule_id is not null or a.source='statistical_signal');
  if v_result is null then raise exception 'M22 alert not found' using errcode='P0002'; end if;
  return v_result;
end;
$$;

-- The alert lifecycle RPC already accepts every alert id and retains M22's status
-- transition authority. Only the authoritative admin projections need to recognize
-- the explicit statistical source in addition to rule-backed M22 alerts.

revoke all on function public.admin_record_m24f_certification_v1(uuid,text,text,text,text,integer,integer,text,text) from public,anon,authenticated;
grant execute on function public.admin_record_m24f_certification_v1(uuid,text,text,text,text,integer,integer,text,text) to authenticated;
revoke all on function public.admin_decide_m24f_candidate_v1(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.admin_decide_m24f_candidate_v1(uuid,text,text,text) to authenticated;
revoke all on function public.admin_promote_m25_signal_to_alert_v1(uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_promote_m25_signal_to_alert_v1(uuid,text,text) to authenticated;
revoke all on function public.admin_list_m22_alerts_v1(text,text,text,text,uuid,uuid,uuid,boolean,boolean,integer) from public,anon,authenticated;
grant execute on function public.admin_list_m22_alerts_v1(text,text,text,text,uuid,uuid,uuid,boolean,boolean,integer) to authenticated;
revoke all on function public.admin_get_m22_alert_detail_v1(uuid) from public,anon,authenticated;
grant execute on function public.admin_get_m22_alert_detail_v1(uuid) to authenticated;
