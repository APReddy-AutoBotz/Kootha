-- M28 final review closure: canonical legacy execution lock order and bounded schedule history.
set search_path = public;

create or replace function public.admin_update_ad_work_day(
  p_ad_work_day_id uuid,
  p_action text,
  p_note text default null
)
returns table(ad_work_day_id uuid, execution_status text, result_message text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_day public.ad_work_days%rowtype;
  v_ad_work public.ad_works%rowtype;
  v_status text;
begin
  if not public.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if p_action not in ('start', 'complete', 'report_issue') then raise exception 'Invalid work action' using errcode = '22000'; end if;

  -- M21 telemetry and M28 cancellation both serialize on this lock before row locks.
  -- Legacy admin execution must follow the same order to avoid advisory/row deadlocks.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('m21-authority-global', 2100)
  );

  select * into v_day from public.ad_work_days where id = p_ad_work_day_id for update;
  if not found then raise exception 'Work day not found' using errcode = 'P0002'; end if;
  select * into v_ad_work from public.ad_works where id = v_day.ad_work_id for update;
  if v_ad_work.execution_mode <> 'admin_managed' then raise exception 'This work is managed in the driver app' using errcode = '22000'; end if;

  if p_action = 'start' then
    v_status := 'running';
    update public.ad_work_days
    set execution_status = v_status,
        execution_started_at = coalesce(execution_started_at, clock_timestamp()),
        execution_updated_at = clock_timestamp()
    where id = v_day.id;
    update public.ad_works set execution_overall_status = 'running', updated_at = clock_timestamp() where id = v_ad_work.id;
  elsif p_action = 'complete' then
    v_status := 'completed';
    update public.ad_work_days
    set execution_status = v_status,
        execution_completed_at = clock_timestamp(),
        completion_note = nullif(trim(coalesce(p_note, '')), ''),
        execution_updated_at = clock_timestamp()
    where id = v_day.id;
    update public.ad_works
    set execution_overall_status = case
when not exists (
  select 1 from public.ad_work_days d
  where d.ad_work_id = v_ad_work.id and d.id <> v_day.id and d.execution_status <> 'completed'
) then 'completed' else 'running' end,
        execution_completed_at = case
when not exists (
  select 1 from public.ad_work_days d
  where d.ad_work_id = v_ad_work.id and d.id <> v_day.id and d.execution_status <> 'completed'
) then clock_timestamp() else execution_completed_at end,
        updated_at = clock_timestamp()
    where id = v_ad_work.id;
  else
    v_status := 'issue_reported';
    update public.ad_work_days
    set execution_status = v_status,
        issue_note = nullif(trim(coalesce(p_note, '')), ''),
        execution_updated_at = clock_timestamp()
    where id = v_day.id;
  end if;

  return query select v_day.id, v_status,
    case p_action when 'start' then 'Work started.' when 'complete' then 'Work completed.' else 'Issue recorded.' end;
end;
$$;

revoke all on function public.admin_update_ad_work_day(uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function public.admin_update_ad_work_day(uuid,text,text) to authenticated;

create or replace function public.m28_build_snapshot_v1(p_ad_work_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with recent_commercial as (
    select e.id, e.payment_status, e.total_amount, e.paid_amount, e.balance_amount,
 e.commercial_version, e.created_at
    from public.ad_work_commercial_events e
    where e.ad_work_id = p_ad_work_id
    order by e.commercial_version desc
    limit 20
  ),
  commercial_page as (
    select count(*)::integer as returned, min(commercial_version) as min_version
    from recent_commercial
  ),
  recent_schedule as (
    select e.id, e.event_type, e.ad_work_day_id, e.from_start_date, e.from_end_date,
 e.to_start_date, e.to_end_date, e.reason, e.customer_message,
 e.schedule_version, e.created_at
    from public.ad_work_schedule_events e
    where e.ad_work_id = p_ad_work_id
    order by e.schedule_version desc
    limit 20
  ),
  schedule_page as (
    select count(*)::integer as returned, min(schedule_version) as min_version
    from recent_schedule
  )
  select jsonb_build_object(
    'adWork', jsonb_build_object(
      'id', aw.id,
      'title', aw.title,
      'businessName', aw.business_name,
      'customerName', aw.customer_name,
      'startDate', aw.start_date,
      'endDate', aw.end_date,
      'planningStatus', aw.planning_status,
      'executionReleaseStatus', aw.execution_release_status,
      'executionOverallStatus', aw.execution_overall_status,
      'closureStatus', aw.closure_status,
      'paymentStatus', aw.payment_status,
      'totalAmount', aw.total_amount::double precision,
      'paidAmount', aw.paid_amount::double precision,
      'balanceAmount', (aw.total_amount - aw.paid_amount)::double precision,
      'commercialNote', aw.commercial_note,
      'commercialVersion', aw.commercial_version,
      'scheduleVersion', aw.schedule_version,
      'cancellationReason', aw.cancellation_reason,
      'cancelledAt', aw.cancelled_at
    ),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'workDate', d.work_date,
        'status', d.status,
        'planningStatus', d.planning_status,
        'executionStatus', d.execution_status
      ) order by d.work_date, d.id)
      from public.ad_work_days d where d.ad_work_id = aw.id
    ), '[]'::jsonb),
    'commercialEvents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'paymentStatus', e.payment_status,
        'totalAmount', e.total_amount::double precision,
        'paidAmount', e.paid_amount::double precision,
        'balanceAmount', e.balance_amount::double precision,
        'version', e.commercial_version,
        'createdAt', e.created_at
      ) order by e.commercial_version desc)
      from recent_commercial e
    ), '[]'::jsonb),
    'commercialEventsPage', jsonb_build_object(
      'limit', 20,
      'returned', cp.returned,
      'hasMore', exists (
        select 1 from public.ad_work_commercial_events older
        where older.ad_work_id = aw.id and cp.min_version is not null
and older.commercial_version < cp.min_version
      ),
      'nextBeforeVersion', case when exists (
        select 1 from public.ad_work_commercial_events older
        where older.ad_work_id = aw.id and cp.min_version is not null
and older.commercial_version < cp.min_version
      ) then cp.min_version else null end
    ),
    'scheduleEvents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'eventType', e.event_type,
        'adWorkDayId', e.ad_work_day_id,
        'fromStartDate', e.from_start_date,
        'fromEndDate', e.from_end_date,
        'toStartDate', e.to_start_date,
        'toEndDate', e.to_end_date,
        'reason', e.reason,
        'customerMessage', e.customer_message,
        'version', e.schedule_version,
        'createdAt', e.created_at
      ) order by e.schedule_version desc)
      from recent_schedule e
    ), '[]'::jsonb),
    'scheduleEventsPage', jsonb_build_object(
      'limit', 20,
      'returned', sp.returned,
      'hasMore', exists (
        select 1 from public.ad_work_schedule_events older
        where older.ad_work_id = aw.id and sp.min_version is not null
and older.schedule_version < sp.min_version
      ),
      'nextBeforeVersion', case when exists (
        select 1 from public.ad_work_schedule_events older
        where older.ad_work_id = aw.id and sp.min_version is not null
and older.schedule_version < sp.min_version
      ) then sp.min_version else null end
    )
  )
  from public.ad_works aw
  cross join commercial_page cp
  cross join schedule_page sp
  where aw.id = p_ad_work_id;
$$;

create or replace function public.admin_list_ad_work_schedule_events_v1(
  p_ad_work_id uuid,
  p_before_version bigint default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_events jsonb;
  v_returned integer;
  v_min_version bigint;
  v_has_more boolean;
begin
  perform public.m20a_require_admin();
  if not exists (select 1 from public.ad_works where id = p_ad_work_id) then
    raise exception 'Ad Work not found' using errcode = 'P0002';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Schedule history page size must be between 1 and 100' using errcode = '22023';
  end if;
  if p_before_version is not null and p_before_version < 1 then
    raise exception 'Schedule history cursor must be positive' using errcode = '22023';
  end if;

  with selected as (
    select e.id, e.event_type, e.ad_work_day_id, e.from_start_date, e.from_end_date,
 e.to_start_date, e.to_end_date, e.reason, e.customer_message,
 e.schedule_version, e.created_at
    from public.ad_work_schedule_events e
    where e.ad_work_id = p_ad_work_id
      and (p_before_version is null or e.schedule_version < p_before_version)
    order by e.schedule_version desc
    limit p_limit
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id,
      'eventType', s.event_type,
      'adWorkDayId', s.ad_work_day_id,
      'fromStartDate', s.from_start_date,
      'fromEndDate', s.from_end_date,
      'toStartDate', s.to_start_date,
      'toEndDate', s.to_end_date,
      'reason', s.reason,
      'customerMessage', s.customer_message,
      'version', s.schedule_version,
      'createdAt', s.created_at
    ) order by s.schedule_version desc), '[]'::jsonb),
    count(*)::integer,
    min(s.schedule_version)
  into v_events, v_returned, v_min_version
  from selected s;

  v_has_more := v_min_version is not null and exists (
    select 1 from public.ad_work_schedule_events older
    where older.ad_work_id = p_ad_work_id and older.schedule_version < v_min_version
  );

  return jsonb_build_object(
    'events', v_events,
    'page', jsonb_build_object(
      'limit', p_limit,
      'returned', v_returned,
      'hasMore', v_has_more,
      'nextBeforeVersion', case when v_has_more then v_min_version else null end
    )
  );
end;
$$;

revoke all on function public.admin_list_ad_work_schedule_events_v1(uuid,bigint,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_list_ad_work_schedule_events_v1(uuid,bigint,integer) to authenticated;
