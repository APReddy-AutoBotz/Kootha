create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

insert into public.user_profiles(auth_user_id,display_name,role)
values('43000000-0000-0000-0000-000000000001','M22 Parallel Admin','admin');

insert into public.m22_rule_signals(
  id,signal_key,signal_kind,reason_code,occurred_at,adapter_id
)
select
  ('43000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  public.m22_safe_digest('m22-parallel-'||n::text),
  'adapter_rejection','invalid_coordinate',
  '2026-07-29 06:00:00+00'::timestamptz+make_interval(secs=>n),
  'm22.parallel'
from generate_series(1,9) n;

create or replace function public.m22_parallel_observe(
  p_signal_id uuid,p_detected_at timestamptz
) returns uuid language sql security definer set search_path=pg_catalog,public as $$
  select public.m22_apply_rule_observation(
    p_signal_id,'invalid_coordinate',p_detected_at,
    'adapter_rejection','parallel-context'
  )
$$;
create or replace function public.m22_parallel_clear(
  p_signal_id uuid,p_cleared_at timestamptz
) returns uuid language sql security definer set search_path=pg_catalog,public as $$
  select public.m22_clear_rule_condition(
    p_signal_id,'invalid_coordinate','adapter_rejection',
    'parallel-context',p_cleared_at
  )
$$;
create or replace function public.m22_parallel_transition(p_status text)
returns text language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  perform set_config(
    'request.jwt.claim.sub','43000000-0000-0000-0000-000000000001',true
  );
  perform public.admin_transition_alert(
    (select id from public.alerts
      where rule_id='invalid_coordinate'
        and dedupe_key=public.m22_safe_digest(
          'invalid_coordinate|adapter_rejection|parallel-context')
        and status not in ('resolved','false_alarm','ignored')
      order by episode_number desc limit 1),
    p_status,'parallel test','bounded parallel lifecycle note'
  );
  return p_status;
end;
$$;

\connect postgres supabase_admin
select plan(18);
select dblink_connect_u('m22_c1','dbname=postgres');
select dblink_connect_u('m22_c2','dbname=postgres');

select dblink_send_query('m22_c1',$$
  select public.m22_parallel_observe(
    '43000000-0000-0000-0000-000000000001','2026-07-29 06:00:01+00')
$$);
select dblink_send_query('m22_c2',$$
  select public.m22_parallel_observe(
    '43000000-0000-0000-0000-000000000002','2026-07-29 06:00:02+00')
$$);
create temp table m22_parallel_results(label text,id uuid);
insert into m22_parallel_results
select 'open-1',id from dblink_get_result('m22_c1') as r(id uuid);
insert into m22_parallel_results
select 'open-2',id from dblink_get_result('m22_c2') as r(id uuid);
select ok((select bool_and(id is not null) from m22_parallel_results),
  'both simultaneous identical observations complete');
select is(
  (select count(distinct id)::integer from m22_parallel_results),1,
  'simultaneous identical observations return one alert ID');
select ok(
  (select count(*)=1 and min(occurrence_count)=2
    from public.alerts where rule_id='invalid_coordinate'
      and dedupe_key=public.m22_safe_digest(
        'invalid_coordinate|adapter_rejection|parallel-context')),
  'simultaneous observations create one episode with no lost occurrence');
select is(
  (select count(*)::integer from public.alert_status_history
    where alert_id=(select id from m22_parallel_results limit 1)),
  1,'parallel opening creates one service status-history row');

select dblink_disconnect('m22_c1');
select dblink_disconnect('m22_c2');
select dblink_connect_u('m22_c1','dbname=postgres');
select dblink_connect_u('m22_c2','dbname=postgres');
truncate m22_parallel_results;
select dblink_send_query('m22_c1',$$
  select public.m22_parallel_observe(
    '43000000-0000-0000-0000-000000000003','2026-07-29 06:00:03+00')
$$);
select dblink_send_query('m22_c2',$$
  select public.m22_parallel_transition('acknowledged')
$$);
insert into m22_parallel_results
select 'observe-ack',id from dblink_get_result('m22_c1') as r(id uuid);
create temp table m22_parallel_text(label text,result text);
insert into m22_parallel_text
select 'ack',result from dblink_get_result('m22_c2') as r(result text);
select is((select result from m22_parallel_text where label='ack'),
  'acknowledged','admin acknowledgement completes during occurrence race');
select ok(
  (select status='acknowledged' and occurrence_count=3 and condition_active
    from public.alerts where id=(select id from m22_parallel_results limit 1)),
  'occurrence/acknowledgement race preserves status, count, and condition');
select ok(
  (select count(*)=2
      and count(*) filter(where new_status='new')=1
      and count(*) filter(where new_status='acknowledged')=1
    from public.alert_status_history
    where alert_id=(select id from m22_parallel_results limit 1)),
  'occurrence race preserves immutable lifecycle history');

select dblink_disconnect('m22_c1');
select dblink_disconnect('m22_c2');
select dblink_connect_u('m22_c1','dbname=postgres');
select dblink_connect_u('m22_c2','dbname=postgres');
truncate m22_parallel_results;
select dblink_send_query('m22_c1',$$
  select public.m22_parallel_clear(
    '43000000-0000-0000-0000-000000000004','2026-07-29 06:00:04+00')
$$);
select dblink_send_query('m22_c2',$$
  select public.m22_parallel_observe(
    '43000000-0000-0000-0000-000000000005','2026-07-29 06:00:05+00')
$$);
insert into m22_parallel_results
select 'clear-old',id from dblink_get_result('m22_c1') as r(id uuid);
insert into m22_parallel_results
select 'observe-new',id from dblink_get_result('m22_c2') as r(id uuid);
select is(
  (select count(distinct id)::integer from m22_parallel_results),1,
  'clear/new-observation race targets one alert');
select ok(
  (select condition_active and condition_cleared_at is null
      and occurrence_count=4
    from public.alerts where id=(select id from m22_parallel_results limit 1)),
  'newer observation deterministically wins over older clear');

select dblink_disconnect('m22_c1');
select dblink_disconnect('m22_c2');
select dblink_connect_u('m22_c1','dbname=postgres');
select dblink_connect_u('m22_c2','dbname=postgres');
truncate m22_parallel_results;
select dblink_send_query('m22_c1',$$
  select public.m22_parallel_observe(
    '43000000-0000-0000-0000-000000000006','2026-07-29 06:00:06+00')
$$);
select dblink_send_query('m22_c2',$$
  select public.m22_parallel_clear(
    '43000000-0000-0000-0000-000000000007','2026-07-29 06:00:07+00')
$$);
insert into m22_parallel_results
select 'observe-old',id from dblink_get_result('m22_c1') as r(id uuid);
insert into m22_parallel_results
select 'clear-new',id from dblink_get_result('m22_c2') as r(id uuid);
select ok(
  (select not condition_active
      and condition_cleared_at='2026-07-29 06:00:07+00'
      and occurrence_count=5
    from public.alerts where id=(select id from m22_parallel_results limit 1)),
  'newer clear deterministically wins over older observation');
select is(
  (select count(*)::integer from public.audit_logs
    where entity_id=(select id from m22_parallel_results limit 1)
      and action='alert_condition_cleared'),
  2,'each effective clear is audited once');

select is(public.m22_parallel_transition('resolved'),'resolved',
  'active episode can be terminally resolved before recurrence race');
select dblink_disconnect('m22_c1');
select dblink_disconnect('m22_c2');
select dblink_connect_u('m22_c1','dbname=postgres');
select dblink_connect_u('m22_c2','dbname=postgres');
truncate m22_parallel_results;
select dblink_send_query('m22_c1',$$
  select public.m22_parallel_observe(
    '43000000-0000-0000-0000-000000000008','2026-07-29 06:00:08+00')
$$);
select dblink_send_query('m22_c2',$$
  select public.m22_parallel_observe(
    '43000000-0000-0000-0000-000000000009','2026-07-29 06:00:09+00')
$$);
insert into m22_parallel_results
select 'episode-2a',id from dblink_get_result('m22_c1') as r(id uuid);
insert into m22_parallel_results
select 'episode-2b',id from dblink_get_result('m22_c2') as r(id uuid);
select is(
  (select count(distinct id)::integer from m22_parallel_results),1,
  'concurrent terminal recurrence creates one new episode ID');
select ok(
  (select count(*)=2 and max(episode_number)=2
    and count(*) filter(where status in ('new','acknowledged','investigating'))=1
    from public.alerts where rule_id='invalid_coordinate'
      and dedupe_key=public.m22_safe_digest(
        'invalid_coordinate|adapter_rejection|parallel-context')),
  'closed episode race leaves at most one new active episode');
select is(
  (select occurrence_count from public.alerts
    where id=(select id from m22_parallel_results limit 1)),
  2,'concurrent new-episode observations preserve both occurrences');

update public.m22_rule_evaluation_queue
set state='completed',completed_at=clock_timestamp(),locked_at=null
where state<>'completed';
insert into public.m22_rule_signals(
  id,signal_key,signal_kind,reason_code,occurred_at,adapter_id
) values(
  '43000000-0000-0000-0000-000000000010',
  public.m22_safe_digest('m22-parallel-queue'),
  'adapter_rejection','unsupported_sensor_observation',
  '2026-07-29 06:01:00+00','m22.parallel'
);
select dblink_disconnect('m22_c1');
select dblink_disconnect('m22_c2');
select dblink_connect_u('m22_c1','dbname=postgres');
select dblink_connect_u('m22_c2','dbname=postgres');
truncate m22_parallel_text;
select dblink_send_query('m22_c1',$$
  select public.m22_process_rule_queue(1,clock_timestamp())::text
$$);
select dblink_send_query('m22_c2',$$
  select public.m22_process_rule_queue(1,clock_timestamp())::text
$$);
insert into m22_parallel_text
select 'queue-1',result from dblink_get_result('m22_c1') as r(result text);
insert into m22_parallel_text
select 'queue-2',result from dblink_get_result('m22_c2') as r(result text);
select is(
  (select sum((result::jsonb->>'claimed')::integer)
    from m22_parallel_text where label like 'queue-%'),
  1::bigint,'parallel workers claim the queued signal exactly once');
select ok(
  (select state='completed' and attempt_count=1
    from public.m22_rule_evaluation_queue
    where signal_id='43000000-0000-0000-0000-000000000010')
  and (select count(*)=1 from public.m22_rule_assessments
    where signal_id='43000000-0000-0000-0000-000000000010'),
  'one queue claim produces one completed evaluation');
select is(
  (select count(*)::integer from public.customer_updates),0,
  'parallel rules and lifecycle create no customer side effects');

select * from finish();
select dblink_disconnect('m22_c1');
select dblink_disconnect('m22_c2');

set session_replication_role=replica;
delete from public.audit_logs where entity_id in(
  select id from public.alerts
  where rule_id in('invalid_coordinate','unsupported_sensor_observation'));
delete from public.m22_rule_assessments
where signal_id::text like '43000000-0000-0000-0000-%';
delete from public.m22_rule_state
where alert_id in(
  select id from public.alerts
  where rule_id in('invalid_coordinate','unsupported_sensor_observation'));
delete from public.alert_notes where alert_id in(
  select id from public.alerts
  where rule_id in('invalid_coordinate','unsupported_sensor_observation'));
delete from public.alert_status_history where alert_id in(
  select id from public.alerts
  where rule_id in('invalid_coordinate','unsupported_sensor_observation'));
delete from public.alerts
where rule_id in('invalid_coordinate','unsupported_sensor_observation');
delete from public.m22_rule_evaluation_queue
where signal_id::text like '43000000-0000-0000-0000-%';
delete from public.m22_rule_signals
where id::text like '43000000-0000-0000-0000-%';
delete from public.user_profiles
where auth_user_id='43000000-0000-0000-0000-000000000001';
drop function public.m22_parallel_observe(uuid,timestamptz);
drop function public.m22_parallel_clear(uuid,timestamptz);
drop function public.m22_parallel_transition(text);
set session_replication_role=origin;
