-- Serialize authoritative evaluation publication and admin promotion by signal cohort.
-- The transaction-scoped advisory lock is acquired before an evaluation becomes
-- visible and before promotion locks/re-reads the current signal projection.

create or replace function public.m25_signal_authority_lock_v1(
  p_signal_id text,
  p_scope_key_hash text,
  p_synthetic boolean
)
returns void
language sql
volatile
parallel unsafe
set search_path = pg_catalog, public
as $$
  select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws('|','m25-signal-authority-v1',p_signal_id,p_scope_key_hash,p_synthetic::text),
      250013
    )
  )
$$;

revoke all on function public.m25_signal_authority_lock_v1(text,text,boolean) from public,anon,authenticated;
grant execute on function public.m25_signal_authority_lock_v1(text,text,boolean) to service_role;

create or replace function public.m25_serialize_authoritative_evaluation_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.m25_signal_authority_lock_v1(new.signal_id,new.scope_key_hash,new.synthetic);
  return new;
end
$$;

revoke all on function public.m25_serialize_authoritative_evaluation_v1() from public,anon,authenticated;

create trigger m25_evaluation_authority_serialization
before insert or update on public.m25_signal_evaluations
for each row execute function public.m25_serialize_authoritative_evaluation_v1();

create or replace function public.admin_promote_m25_signal_to_alert_v1(p_signal_id uuid,p_reason text,p_note text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_actor uuid; s public.m25_statistical_signals%rowtype; v_alert uuid; v_key text;
begin
  v_actor:=public.m20a_require_admin();
  if p_reason is null or char_length(trim(p_reason)) not between 1 and 160 or p_note is null or char_length(trim(p_note)) not between 1 and 500 or not public.m24f_is_safe_metadata(p_reason) or not public.m24f_is_safe_metadata(p_note) then raise exception 'A bounded safe M25 promotion reason and note are required' using errcode='22023'; end if;

  -- Read only the immutable cohort key first. Locking the signal row before the
  -- episode lock would invert the worker's evaluation-lock/signal-upsert order.
  select * into s from public.m25_statistical_signals where id=p_signal_id;
  if s.id is null then raise exception 'M25 signal not found' using errcode='P0002'; end if;
  perform public.m25_signal_authority_lock_v1(s.signal_id,s.scope_key_hash,s.synthetic);

  -- The shared lock is held until commit. Re-read both the mutable projection and
  -- immutable evaluation authority after acquiring it, immediately before insert.
  select * into s from public.m25_statistical_signals where id=p_signal_id for update;
  if s.promoted_alert_id is not null then return jsonb_build_object('contractVersion','m25-admin-v1','signalId',p_signal_id,'alertId',s.promoted_alert_id,'created',false); end if;
  if s.state not in ('watch','investigate','reviewed')
    or not exists (
      select 1 from public.m25_signal_review_history h
      where h.signal_id=s.id and h.new_state=s.state and h.evaluation_id=s.evaluation_id
    )
    or not exists (
      select 1 from public.m25_signal_evaluations current_evaluation
      where current_evaluation.evaluation_id=s.evaluation_id
        and current_evaluation.signal_id=s.signal_id
        and current_evaluation.scope_key_hash=s.scope_key_hash
        and current_evaluation.synthetic=s.synthetic
        and current_evaluation.period_end=s.generated_at
        and current_evaluation.source_generation=s.source_generation
    )
    or exists (
      select 1 from public.m25_signal_evaluations newer
      where newer.signal_id=s.signal_id and newer.scope_key_hash=s.scope_key_hash and newer.synthetic=s.synthetic
        and (newer.period_end>s.generated_at or (newer.period_end=s.generated_at and newer.source_generation>s.source_generation))
    )
  then raise exception 'A matching review of the newest authoritative evaluation is required before promotion' using errcode='55000'; end if;

  v_key:=public.m22_safe_digest(concat('m25-statistical-signal|',s.signal_id,'|',s.scope_key_hash,'|',s.synthetic::text));
  insert into public.alerts(ad_work_day_id,type,severity,status,message,created_at,source,dedupe_key,episode_number,condition_active,first_detected_at,last_detected_at,occurrence_count,gps_device_id,synthetic,title,observed_value,threshold_value,value_unit,status_changed_at,updated_at,origin)
  values(null,'statistical_signal','warning','new','Statistical signal requires operational review.',clock_timestamp(),'statistical_signal',v_key,1,true,s.generated_at,s.generated_at,1,null,s.synthetic,'Statistical signal review',s.observed_value,null,'count',clock_timestamp(),clock_timestamp(),'m25_statistical_engine') returning id into v_alert;
  update public.m25_statistical_signals set promoted_alert_id=v_alert where id=p_signal_id;
  insert into public.alert_status_history(alert_id,previous_status,new_status,actor_type,actor_admin_id,reason,note,transition_at,safe_source) values(v_alert,null,'new','admin',v_actor,trim(p_reason),trim(p_note),clock_timestamp(),'admin_rpc');
  insert into public.audit_logs(actor_type,actor_id,action,entity_type,entity_id,safe_details) values('admin',v_actor,'m25_statistical_signal_promoted_to_alert','alert',v_alert,jsonb_build_object('signal_id',p_signal_id,'source','statistical_signal'));
  return jsonb_build_object('contractVersion','m25-admin-v1','signalId',p_signal_id,'alertId',v_alert,'created',true);
end;
$$;

revoke all on function public.admin_promote_m25_signal_to_alert_v1(uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_promote_m25_signal_to_alert_v1(uuid,text,text) to authenticated;
