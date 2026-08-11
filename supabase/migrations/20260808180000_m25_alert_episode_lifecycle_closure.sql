-- Close a promoted statistical episode only through the authoritative alert lifecycle.
-- Evaluations and reviews remain immutable; m25_statistical_signals is the current
-- projection and may advance to a new episode after its prior alert is terminal.

create or replace function public.m25_serialize_authoritative_evaluation_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_terminal_alert uuid;
begin
  perform public.m25_signal_authority_lock_v1(new.signal_id,new.scope_key_hash,new.synthetic);

  select s.promoted_alert_id into v_terminal_alert
  from public.m25_statistical_signals s
  join public.alerts a on a.id=s.promoted_alert_id
  where s.signal_id=new.signal_id
    and s.scope_key_hash=new.scope_key_hash
    and s.synthetic=new.synthetic
    and a.source='statistical_signal'
    and a.status::text in ('resolved','false_alarm','ignored')
    and (
      new.period_end>s.generated_at
      or (new.period_end=s.generated_at and new.source_generation>s.source_generation)
    )
  for update of s;

  if v_terminal_alert is not null then
    update public.m25_statistical_signals
    set promoted_alert_id=null,
        state='insufficient_data',
        signal_episode_id=concat(new.signal_id,':',new.scope_key_hash,':',new.evaluation_id)
    where signal_id=new.signal_id
      and scope_key_hash=new.scope_key_hash
      and synthetic=new.synthetic
      and promoted_alert_id=v_terminal_alert;
  end if;

  return new;
end
$$;

revoke all on function public.m25_serialize_authoritative_evaluation_v1() from public,anon,authenticated;

create or replace function public.admin_transition_alert(
  p_alert_id uuid,p_new_status text,p_reason text,p_note text
) returns table(alert_id uuid,status text,result_message text)
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_actor uuid:=public.m20a_require_admin(); v_alert public.alerts%rowtype;
  v_new public.alert_status; v_signal public.m25_statistical_signals%rowtype;
  v_transition_at timestamptz;
begin
  if p_reason is null or char_length(trim(p_reason)) not between 1 and 160
    or p_note is null or char_length(trim(p_note)) not between 1 and 500
  then raise exception 'Bounded reason and note are required' using errcode='22023'; end if;
  if p_new_status not in ('acknowledged','investigating','resolved','false_alarm','ignored')
  then raise exception 'Invalid alert status' using errcode='22023'; end if;
  v_new:=p_new_status::public.alert_status;

  -- Share the evaluation/promotion episode lock before taking mutable row locks.
  select s.* into v_signal from public.m25_statistical_signals s
  where s.promoted_alert_id=p_alert_id;
  if v_signal.id is not null then
    perform public.m25_signal_authority_lock_v1(
      v_signal.signal_id,v_signal.scope_key_hash,v_signal.synthetic
    );
  end if;

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

  v_transition_at:=clock_timestamp();
  perform set_config('app.m22_admin_lifecycle','on',true);
  update public.alerts set status=v_new,status_changed_at=v_transition_at,
    status_changed_by=v_actor,updated_at=v_transition_at,
    resolved_at=case when p_new_status='resolved' then v_transition_at else resolved_at end,
    resolved_by=case when p_new_status='resolved' then v_actor else resolved_by end,
    resolution_note=case when p_new_status='resolved' then trim(p_note) else resolution_note end,
    condition_active=case
      when source='statistical_signal' and p_new_status in ('resolved','false_alarm','ignored')
      then false else condition_active end,
    condition_cleared_at=case
      when source='statistical_signal' and p_new_status in ('resolved','false_alarm','ignored')
      then coalesce(condition_cleared_at,v_transition_at) else condition_cleared_at end
  where id=p_alert_id;
  insert into public.alert_status_history(
    alert_id,previous_status,new_status,actor_type,actor_admin_id,reason,note,
    transition_at,safe_source
  ) values(p_alert_id,v_alert.status,v_new,'admin',v_actor,trim(p_reason),trim(p_note),
    v_transition_at,'admin_rpc');
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

revoke all on function public.admin_transition_alert(uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.admin_transition_alert(uuid,text,text,text) to authenticated;
