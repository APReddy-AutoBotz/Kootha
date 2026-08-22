-- M28 authority/replay closure: exact-retry recovery, lifecycle fencing and bounded history.
set search_path = public;

create table if not exists public.m28_mutation_operations (
  actor_id uuid not null,
  ad_work_id uuid not null references public.ad_works(id) on delete restrict,
  mutation_type text not null,
  request_key text not null,
  request_hash text not null,
  response jsonb,
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  primary key (actor_id, ad_work_id, mutation_type, request_key),
  constraint m28_mutation_operations_type_check check (
    mutation_type in (
      'payment_update',
      'initial_schedule',
      'day_schedule',
      'whole_reschedule',
      'day_reschedule',
      'cancel'
    )
  ),
  constraint m28_mutation_operations_hash_check check (request_hash ~ '^[0-9a-f]{32}$'),
  constraint m28_mutation_operations_response_check check (
    (response is null and completed_at is null)
    or (response is not null and completed_at is not null)
  )
);

create index if not exists m28_mutation_operations_work_created_idx
  on public.m28_mutation_operations(ad_work_id, created_at desc);

alter table public.m28_mutation_operations enable row level security;
revoke all on public.m28_mutation_operations from public, anon, authenticated, service_role;

create or replace function public.m28_claim_replay_v1(
  p_actor uuid,
  p_ad_work_id uuid,
  p_mutation_type text,
  p_request_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_hash text;
  v_response jsonb;
begin
  if p_actor is null or p_ad_work_id is null
     or nullif(p_mutation_type, '') is null
     or nullif(p_request_key, '') is null
     or p_request_hash is null
     or p_request_hash !~ '^[0-9a-f]{32}$' then
    raise exception 'Invalid M28 mutation replay identity' using errcode = '22023';
  end if;
  if not exists (select 1 from public.ad_works where id = p_ad_work_id) then
    raise exception 'Ad Work not found' using errcode = 'P0002';
  end if;

  insert into public.m28_mutation_operations(
    actor_id, ad_work_id, mutation_type, request_key, request_hash
  ) values (
    p_actor, p_ad_work_id, p_mutation_type, p_request_key, p_request_hash
  )
  on conflict (actor_id, ad_work_id, mutation_type, request_key) do nothing;

  select request_hash, response
  into v_hash, v_response
  from public.m28_mutation_operations
  where actor_id = p_actor
    and ad_work_id = p_ad_work_id
    and mutation_type = p_mutation_type
    and request_key = p_request_key
  for update;

  if not found then
    raise exception 'M28 mutation replay identity could not be claimed' using errcode = '55000';
  end if;
  if v_hash is distinct from p_request_hash then
    raise exception 'Operation identity conflicts with a different request' using errcode = '40001';
  end if;

  return v_response;
end;
$$;

create or replace function public.m28_record_result_v1(
  p_actor uuid,
  p_ad_work_id uuid,
  p_mutation_type text,
  p_request_key text,
  p_request_hash text,
  p_response jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_response is null then
    raise exception 'M28 mutation response cannot be null' using errcode = '22023';
  end if;

  update public.m28_mutation_operations
  set response = p_response,
      completed_at = clock_timestamp()
  where actor_id = p_actor
    and ad_work_id = p_ad_work_id
    and mutation_type = p_mutation_type
    and request_key = p_request_key
    and request_hash = p_request_hash
    and response is null;

  if not found then
    raise exception 'M28 mutation replay identity could not be completed' using errcode = '55000';
  end if;
end;
$$;

-- Cancellation metadata is schedule authority. Authenticated table PATCHes must not
-- forge, clear or rewrite it outside the governed cancellation transaction.
create or replace function public.m28_guard_schedule_write_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if coalesce(current_setting('app.m28_schedule_write', true), '') <> 'yes'
     and row(new.start_date, new.end_date, new.number_of_days, new.daily_start_time,
             new.daily_end_time, new.areas_to_cover, new.planning_status,
             new.schedule_version, new.schedule_updated_at, new.schedule_updated_by,
             new.cancellation_reason, new.cancellation_internal_note,
             new.cancelled_at, new.cancelled_by)
         is distinct from
         row(old.start_date, old.end_date, old.number_of_days, old.daily_start_time,
             old.daily_end_time, old.areas_to_cover, old.planning_status,
             old.schedule_version, old.schedule_updated_at, old.schedule_updated_by,
             old.cancellation_reason, old.cancellation_internal_note,
             old.cancelled_at, old.cancelled_by) then
    raise exception 'Schedule fields must be changed through governed M28 authority' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Snapshots carry only the 20 newest commercial events. The page metadata is
-- deterministic and older history remains available through a bounded cursor RPC.
create or replace function public.m28_build_snapshot_v1(p_ad_work_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with recent_commercial as (
    select
      e.id,
      e.payment_status,
      e.total_amount,
      e.paid_amount,
      e.balance_amount,
      e.commercial_version,
      e.created_at
    from public.ad_work_commercial_events e
    where e.ad_work_id = p_ad_work_id
    order by e.commercial_version desc
    limit 20
  ),
  commercial_page as (
    select
      count(*)::integer as returned,
      min(commercial_version) as min_version
    from recent_commercial
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
      from public.ad_work_days d
      where d.ad_work_id = aw.id
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
        select 1
        from public.ad_work_commercial_events older
        where older.ad_work_id = aw.id
          and cp.min_version is not null
          and older.commercial_version < cp.min_version
      ),
      'nextBeforeVersion', case
        when exists (
          select 1
          from public.ad_work_commercial_events older
          where older.ad_work_id = aw.id
            and cp.min_version is not null
            and older.commercial_version < cp.min_version
        ) then cp.min_version
        else null
      end
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
      from public.ad_work_schedule_events e
      where e.ad_work_id = aw.id
    ), '[]'::jsonb)
  )
  from public.ad_works aw
  cross join commercial_page cp
  where aw.id = p_ad_work_id;
$$;

create or replace function public.admin_list_ad_work_commercial_events_v1(
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
  v_limit integer;
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
    raise exception 'Commercial history page size must be between 1 and 100' using errcode = '22023';
  end if;
  if p_before_version is not null and p_before_version < 1 then
    raise exception 'Commercial history cursor must be positive' using errcode = '22023';
  end if;
  v_limit := p_limit;

  with selected as (
    select
      e.id,
      e.payment_status,
      e.total_amount,
      e.paid_amount,
      e.balance_amount,
      e.commercial_version,
      e.created_at
    from public.ad_work_commercial_events e
    where e.ad_work_id = p_ad_work_id
      and (p_before_version is null or e.commercial_version < p_before_version)
    order by e.commercial_version desc
    limit v_limit
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id,
      'paymentStatus', s.payment_status,
      'totalAmount', s.total_amount::double precision,
      'paidAmount', s.paid_amount::double precision,
      'balanceAmount', s.balance_amount::double precision,
      'version', s.commercial_version,
      'createdAt', s.created_at
    ) order by s.commercial_version desc), '[]'::jsonb),
    count(*)::integer,
    min(s.commercial_version)
  into v_events, v_returned, v_min_version
  from selected s;

  v_has_more := v_min_version is not null and exists (
    select 1
    from public.ad_work_commercial_events older
    where older.ad_work_id = p_ad_work_id
      and older.commercial_version < v_min_version
  );

  return jsonb_build_object(
    'events', v_events,
    'page', jsonb_build_object(
      'limit', v_limit,
      'returned', v_returned,
      'hasMore', v_has_more,
      'nextBeforeVersion', case when v_has_more then v_min_version else null end
    )
  );
end;
$$;

create or replace function public.admin_update_ad_work_payment_v1(
  p_ad_work_id uuid,
  p_payment_status text,
  p_total_amount numeric,
  p_paid_amount numeric,
  p_note text default null,
  p_expected_version bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid;
  v_work public.ad_works%rowtype;
  v_note text;
  v_version bigint;
  v_request_key text;
  v_request_hash text;
  v_replay jsonb;
  v_result jsonb;
begin
  v_actor := public.m20a_require_admin();
  perform public.m28_validate_payment_v1(p_payment_status, p_total_amount, p_paid_amount);
  v_note := public.m20a_validate_safe_text(p_note, 'Commercial note', 500, false);
  if p_expected_version is null then
    raise exception 'Commercial record changed; refresh and retry' using errcode = '40001';
  end if;

  v_request_key := p_expected_version::text;
  v_request_hash := pg_catalog.md5(jsonb_build_object(
    'adWorkId', p_ad_work_id,
    'expectedVersion', p_expected_version,
    'paymentStatus', p_payment_status,
    'totalAmount', p_total_amount,
    'paidAmount', p_paid_amount,
    'note', v_note
  )::text);
  v_replay := public.m28_claim_replay_v1(
    v_actor, p_ad_work_id, 'payment_update', v_request_key, v_request_hash
  );
  if v_replay is not null then
    return v_replay;
  end if;

  select * into v_work
  from public.ad_works
  where id = p_ad_work_id
  for update;
  if not found then raise exception 'Ad Work not found' using errcode = 'P0002'; end if;
  if p_expected_version <> v_work.commercial_version then
    raise exception 'Commercial record changed; refresh and retry' using errcode = '40001';
  end if;
  if v_work.closure_status in ('closed','closed_with_issues') then
    raise exception 'Closed Ad Work commercial state cannot be changed here' using errcode = '55000';
  end if;

  v_version := v_work.commercial_version + 1;
  perform set_config('app.m28_commercial_write', 'yes', true);
  update public.ad_works
  set payment_status = p_payment_status::public.payment_status,
      total_amount = p_total_amount,
      paid_amount = p_paid_amount,
      commercial_note = v_note,
      commercial_version = v_version,
      commercial_updated_at = clock_timestamp(),
      commercial_updated_by = v_actor,
      updated_at = clock_timestamp()
  where id = p_ad_work_id;
  perform set_config('app.m28_commercial_write', '', true);

  insert into public.ad_work_commercial_events(
    ad_work_id, actor_id, from_payment_status, payment_status,
    from_total_amount, total_amount, from_paid_amount, paid_amount,
    balance_amount, note, commercial_version
  ) values (
    p_ad_work_id, v_actor, v_work.payment_status, p_payment_status::public.payment_status,
    v_work.total_amount, p_total_amount, v_work.paid_amount, p_paid_amount,
    p_total_amount - p_paid_amount, v_note, v_version
  );

  insert into public.audit_logs(actor_type, actor_id, action, entity_type, entity_id, safe_details)
  values (
    'admin', v_actor, 'm28_commercial_updated', 'ad_work', p_ad_work_id,
    jsonb_build_object('commercialVersion', v_version)
  );

  v_result := jsonb_build_object('snapshot', public.m28_build_snapshot_v1(p_ad_work_id));
  perform public.m28_record_result_v1(
    v_actor, p_ad_work_id, 'payment_update', v_request_key, v_request_hash, v_result
  );
  return v_result;
end;
$$;

create or replace function public.admin_sync_ad_work_days_v2(
  p_ad_work_id uuid,
  p_start_date date,
  p_number_of_days integer,
  p_daily_start_time time default null,
  p_daily_end_time time default null,
  p_areas_to_cover text default null,
  p_expected_version bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid;
  v_work public.ad_works%rowtype;
  v_day_count integer;
  v_end_date date;
  v_version bigint;
  v_areas text;
  v_request_key text;
  v_request_hash text;
  v_replay jsonb;
  v_result jsonb;
begin
  v_actor := public.m20a_require_admin();
  if p_start_date is null then
    raise exception 'Start date is required' using errcode = '22004';
  end if;
  if p_number_of_days is null or p_number_of_days < 1 or p_number_of_days > 366 then
    raise exception 'Number of days must be between 1 and 366' using errcode = '22023';
  end if;
  if p_expected_version is null then
    raise exception 'Schedule changed; refresh and retry' using errcode = '40001';
  end if;
  v_day_count := p_number_of_days;
  v_end_date := p_start_date + (v_day_count - 1);
  v_areas := nullif(trim(coalesce(p_areas_to_cover, '')), '');

  v_request_key := p_expected_version::text;
  v_request_hash := pg_catalog.md5(jsonb_build_object(
    'adWorkId', p_ad_work_id,
    'expectedVersion', p_expected_version,
    'startDate', p_start_date,
    'numberOfDays', v_day_count,
    'dailyStartTime', p_daily_start_time,
    'dailyEndTime', p_daily_end_time,
    'areasToCover', v_areas
  )::text);
  v_replay := public.m28_claim_replay_v1(
    v_actor, p_ad_work_id, 'initial_schedule', v_request_key, v_request_hash
  );
  if v_replay is not null then
    return v_replay;
  end if;

  select * into v_work
  from public.ad_works
  where id = p_ad_work_id
  for update;
  if not found then raise exception 'Ad Work not found' using errcode = 'P0002'; end if;
  if p_expected_version <> v_work.schedule_version then
    raise exception 'Schedule changed; refresh and retry' using errcode = '40001';
  end if;
  if v_work.planning_status = 'cancelled' or v_work.status = 'cancelled'
     or v_work.closure_status in ('closed','closed_with_issues','cancelled') then
    raise exception 'Cancelled or closed Ad Work cannot be edited in planning' using errcode = '55000';
  end if;
  if v_work.assignment_status <> 'not_assigned'
     or v_work.execution_release_status <> 'not_released'
     or v_work.execution_overall_status <> 'not_started' then
    raise exception 'Schedule is no longer in initial planning; use Commercial and Schedule reschedule' using errcode = '55000';
  end if;
  if exists (
    select 1
    from public.ad_work_schedule_events
    where ad_work_id = p_ad_work_id
  ) then
    raise exception 'Schedule lifecycle history exists; use Commercial and Schedule operations' using errcode = '55000';
  end if;

  perform public.m28_assert_day_unobserved_v1(p_ad_work_id, null);
  v_version := v_work.schedule_version + 1;
  perform set_config('app.m28_schedule_write', 'yes', true);

  perform public.sync_ad_work_days(
    p_ad_work_id,
    p_start_date,
    v_day_count,
    p_daily_start_time,
    p_daily_end_time,
    v_areas
  );

  update public.ad_works
  set start_date = p_start_date,
      end_date = v_end_date,
      number_of_days = v_day_count,
      daily_start_time = p_daily_start_time,
      daily_end_time = p_daily_end_time,
      areas_to_cover = v_areas,
      planning_status = case
        when not areas_required or v_areas is not null then 'ready_for_driver_assignment'
        else 'draft'
      end,
      schedule_version = v_version,
      schedule_updated_at = clock_timestamp(),
      schedule_updated_by = v_actor,
      updated_at = clock_timestamp()
  where id = p_ad_work_id;

  perform set_config('app.m28_schedule_write', '', true);
  insert into public.audit_logs(actor_type, actor_id, action, entity_type, entity_id, safe_details)
  values (
    'admin', v_actor, 'm28_initial_schedule_updated', 'ad_work', p_ad_work_id,
    jsonb_build_object('scheduleVersion', v_version)
  );

  v_result := jsonb_build_object('snapshot', public.m28_build_snapshot_v1(p_ad_work_id));
  perform public.m28_record_result_v1(
    v_actor, p_ad_work_id, 'initial_schedule', v_request_key, v_request_hash, v_result
  );
  return v_result;
end;
$$;

create or replace function public.admin_update_ad_work_days_v2(
  p_ad_work_id uuid,
  p_days jsonb,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid;
  v_work public.ad_works%rowtype;
  v_day jsonb;
  v_day_id uuid;
  v_count integer;
  v_version bigint;
  v_request_key text;
  v_request_hash text;
  v_replay jsonb;
  v_result jsonb;
begin
  v_actor := public.m20a_require_admin();
  if jsonb_typeof(p_days) <> 'array'
     or jsonb_array_length(p_days) < 1
     or jsonb_array_length(p_days) > 366 then
    raise exception 'Day schedule batch must contain between 1 and 366 days' using errcode = '22023';
  end if;
  if p_expected_version is null then
    raise exception 'Schedule changed; refresh and retry' using errcode = '40001';
  end if;

  v_request_key := p_expected_version::text;
  v_request_hash := pg_catalog.md5(jsonb_build_object(
    'adWorkId', p_ad_work_id,
    'expectedVersion', p_expected_version,
    'days', p_days
  )::text);
  v_replay := public.m28_claim_replay_v1(
    v_actor, p_ad_work_id, 'day_schedule', v_request_key, v_request_hash
  );
  if v_replay is not null then
    return v_replay;
  end if;

  select * into v_work
  from public.ad_works
  where id = p_ad_work_id
  for update;
  if not found then raise exception 'Ad Work not found' using errcode = 'P0002'; end if;
  if p_expected_version <> v_work.schedule_version then
    raise exception 'Schedule changed; refresh and retry' using errcode = '40001';
  end if;
  if exists (
    select 1
    from public.ad_work_schedule_events
    where ad_work_id = p_ad_work_id
  ) then
    raise exception 'Schedule lifecycle history exists; use Commercial and Schedule operations' using errcode = '55000';
  end if;
  if v_work.planning_status = 'cancelled' or v_work.status = 'cancelled'
     or v_work.closure_status in ('closed','closed_with_issues','cancelled') then
    raise exception 'Cancelled or closed Ad Work cannot be edited in planning' using errcode = '55000';
  end if;
  if v_work.assignment_status <> 'not_assigned'
     or v_work.execution_release_status <> 'not_released'
     or v_work.execution_overall_status <> 'not_started' then
    raise exception 'Schedule is no longer in initial planning; use Commercial and Schedule reschedule' using errcode = '55000';
  end if;

  select count(*) into v_count
  from jsonb_array_elements(p_days) item;
  if (select count(distinct (item->>'id')) from jsonb_array_elements(p_days) item) <> v_count
     or (select count(distinct (item->>'workDate')) from jsonb_array_elements(p_days) item) <> v_count then
    raise exception 'Day schedule batch contains duplicate identities or dates' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_days) item
    where coalesce(item->>'id','') !~ '^[0-9a-fA-F-]{36}$'
       or nullif(item->>'workDate','') is null
       or length(coalesce(item->>'areasToCover','')) > 2000
       or length(coalesce(item->>'dayNote','')) > 1000
       or not exists (
         select 1
         from public.ad_work_days d
         where d.id = (item->>'id')::uuid
           and d.ad_work_id = p_ad_work_id
       )
  ) or (
    select count(*)
    from public.ad_work_days
    where ad_work_id = p_ad_work_id
  ) <> v_count then
    raise exception 'Day schedule batch does not match the authoritative work days' using errcode = '22023';
  end if;

  perform public.m28_assert_day_unobserved_v1(p_ad_work_id, null);
  perform set_config('app.m28_schedule_write', 'yes', true);
  for v_day in select value from jsonb_array_elements(p_days) loop
    v_day_id := (v_day->>'id')::uuid;
    update public.ad_work_days
    set work_date = date '0001-01-01' + v_count
    where id = v_day_id;
    v_count := v_count + 1;
  end loop;
  for v_day in select value from jsonb_array_elements(p_days) loop
    update public.ad_work_days
    set work_date = (v_day->>'workDate')::date,
        planned_start_time = nullif(v_day->>'plannedStartTime','')::time,
        planned_end_time = nullif(v_day->>'plannedEndTime','')::time,
        areas_to_cover = nullif(trim(coalesce(v_day->>'areasToCover','')), ''),
        day_note = nullif(trim(coalesce(v_day->>'dayNote','')), ''),
        planning_status = 'planned',
        updated_at = clock_timestamp()
    where id = (v_day->>'id')::uuid;
  end loop;

  v_version := v_work.schedule_version + 1;
  update public.ad_works
  set start_date = (
        select min(work_date)
        from public.ad_work_days
        where ad_work_id = p_ad_work_id
      ),
      end_date = (
        select max(work_date)
        from public.ad_work_days
        where ad_work_id = p_ad_work_id
      ),
      number_of_days = (
        select count(*)
        from public.ad_work_days
        where ad_work_id = p_ad_work_id
      ),
      schedule_version = v_version,
      schedule_updated_at = clock_timestamp(),
      schedule_updated_by = v_actor,
      updated_at = clock_timestamp()
  where id = p_ad_work_id;
  perform set_config('app.m28_schedule_write', '', true);

  insert into public.audit_logs(actor_type, actor_id, action, entity_type, entity_id, safe_details)
  values (
    'admin', v_actor, 'm28_day_schedule_updated', 'ad_work', p_ad_work_id,
    jsonb_build_object('scheduleVersion', v_version, 'dayCount', jsonb_array_length(p_days))
  );

  v_result := jsonb_build_object('snapshot', public.m28_build_snapshot_v1(p_ad_work_id));
  perform public.m28_record_result_v1(
    v_actor, p_ad_work_id, 'day_schedule', v_request_key, v_request_hash, v_result
  );
  return v_result;
end;
$$;

create or replace function public.admin_reschedule_ad_work_v1(
  p_ad_work_id uuid,
  p_new_start_date date,
  p_reason text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid;
  v_work public.ad_works%rowtype;
  v_reason text;
  v_old_start date;
  v_old_end date;
  v_delta integer;
  v_day record;
  v_new_start date;
  v_new_end date;
  v_version bigint;
  v_message text;
  v_request_key text;
  v_request_hash text;
  v_replay jsonb;
  v_result jsonb;
begin
  v_actor := public.m20a_require_admin();
  v_reason := public.m20a_require_reason(p_reason);
  if p_new_start_date is null then
    raise exception 'New start date is required' using errcode = '22004';
  end if;
  if p_expected_version is null then
    raise exception 'Schedule changed; refresh and retry' using errcode = '40001';
  end if;

  v_request_key := p_expected_version::text;
  v_request_hash := pg_catalog.md5(jsonb_build_object(
    'adWorkId', p_ad_work_id,
    'expectedVersion', p_expected_version,
    'newStartDate', p_new_start_date,
    'reason', v_reason
  )::text);
  v_replay := public.m28_claim_replay_v1(
    v_actor, p_ad_work_id, 'whole_reschedule', v_request_key, v_request_hash
  );
  if v_replay is not null then
    return v_replay;
  end if;

  select * into v_work
  from public.ad_works
  where id = p_ad_work_id
  for update;
  if not found then raise exception 'Ad Work not found' using errcode = 'P0002'; end if;
  if p_expected_version <> v_work.schedule_version then
    raise exception 'Schedule changed; refresh and retry' using errcode = '40001';
  end if;
  if v_work.planning_status = 'cancelled' or v_work.status = 'cancelled' then
    raise exception 'Cancelled Ad Work cannot be rescheduled' using errcode = '55000';
  end if;
  if v_work.closure_status in ('closed','closed_with_issues','cancelled')
     or v_work.execution_overall_status in ('running','on_break','completed','issue_reported','cancelled') then
    raise exception 'Ad Work has execution or closure history and cannot be rescheduled as a whole' using errcode = '55000';
  end if;

  select min(work_date), max(work_date)
  into v_old_start, v_old_end
  from public.ad_work_days
  where ad_work_id = p_ad_work_id;
  if v_old_start is null then
    raise exception 'Ad Work has no schedulable days' using errcode = '55000';
  end if;
  if p_new_start_date = v_old_start then
    raise exception 'Choose a different start date' using errcode = '22023';
  end if;

  perform public.m28_assert_day_unobserved_v1(p_ad_work_id, null);
  perform set_config('app.m28_schedule_write', 'yes', true);
  perform public.m28_invalidate_execution_authority_v1(p_ad_work_id);

  v_delta := p_new_start_date - v_old_start;
  if v_delta > 0 then
    for v_day in
      select id, work_date
      from public.ad_work_days
      where ad_work_id = p_ad_work_id
      order by work_date desc, id desc
    loop
      update public.ad_work_days
      set work_date = v_day.work_date + v_delta,
          status = 'rescheduled',
          planning_status = 'rescheduled',
          execution_status = 'planned',
          execution_updated_at = clock_timestamp(),
          updated_at = clock_timestamp()
      where id = v_day.id;
    end loop;
  else
    for v_day in
      select id, work_date
      from public.ad_work_days
      where ad_work_id = p_ad_work_id
      order by work_date asc, id asc
    loop
      update public.ad_work_days
      set work_date = v_day.work_date + v_delta,
          status = 'rescheduled',
          planning_status = 'rescheduled',
          execution_status = 'planned',
          execution_updated_at = clock_timestamp(),
          updated_at = clock_timestamp()
      where id = v_day.id;
    end loop;
  end if;

  select min(work_date), max(work_date)
  into v_new_start, v_new_end
  from public.ad_work_days
  where ad_work_id = p_ad_work_id;

  v_version := v_work.schedule_version + 1;
  v_message := format(
    'Kootha update: %s has been rescheduled from %s to %s. Reason: %s. Please contact us if you need any clarification.',
    v_work.title, v_old_start, v_new_start, v_reason
  );

  update public.ad_works
  set start_date = v_new_start,
      end_date = v_new_end,
      number_of_days = (
        select count(*)
        from public.ad_work_days
        where ad_work_id = p_ad_work_id
      ),
      planning_status = 'planned',
      schedule_version = v_version,
      schedule_updated_at = clock_timestamp(),
      schedule_updated_by = v_actor,
      updated_at = clock_timestamp()
  where id = p_ad_work_id;

  perform set_config('app.m28_schedule_write', '', true);

  insert into public.ad_work_schedule_events(
    ad_work_id, actor_id, event_type, from_start_date, from_end_date,
    to_start_date, to_end_date, reason, customer_message, schedule_version
  ) values (
    p_ad_work_id, v_actor, 'ad_work_rescheduled', v_old_start, v_old_end,
    v_new_start, v_new_end, v_reason, v_message, v_version
  );
  insert into public.customer_updates(
    ad_work_id, type, message, channel, sent_status, created_by
  ) values (
    p_ad_work_id, 'manual', v_message, 'copy', 'draft', v_actor
  );
  insert into public.audit_logs(actor_type, actor_id, action, entity_type, entity_id, safe_details)
  values (
    'admin', v_actor, 'm28_ad_work_rescheduled', 'ad_work', p_ad_work_id,
    jsonb_build_object(
      'scheduleVersion', v_version,
      'fromStartDate', v_old_start,
      'toStartDate', v_new_start
    )
  );

  v_result := jsonb_build_object(
    'snapshot', public.m28_build_snapshot_v1(p_ad_work_id),
    'customerMessage', v_message
  );
  perform public.m28_record_result_v1(
    v_actor, p_ad_work_id, 'whole_reschedule', v_request_key, v_request_hash, v_result
  );
  return v_result;
end;
$$;

create or replace function public.admin_reschedule_ad_work_day_v1(
  p_ad_work_id uuid,
  p_ad_work_day_id uuid,
  p_new_date date,
  p_reason text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid;
  v_work public.ad_works%rowtype;
  v_day public.ad_work_days%rowtype;
  v_reason text;
  v_old_date date;
  v_new_start date;
  v_new_end date;
  v_version bigint;
  v_message text;
  v_request_key text;
  v_request_hash text;
  v_replay jsonb;
  v_result jsonb;
begin
  v_actor := public.m20a_require_admin();
  v_reason := public.m20a_require_reason(p_reason);
  if p_new_date is null then
    raise exception 'New work date is required' using errcode = '22004';
  end if;
  if p_expected_version is null then
    raise exception 'Schedule changed; refresh and retry' using errcode = '40001';
  end if;

  v_request_key := p_expected_version::text;
  v_request_hash := pg_catalog.md5(jsonb_build_object(
    'adWorkId', p_ad_work_id,
    'adWorkDayId', p_ad_work_day_id,
    'expectedVersion', p_expected_version,
    'newDate', p_new_date,
    'reason', v_reason
  )::text);
  v_replay := public.m28_claim_replay_v1(
    v_actor, p_ad_work_id, 'day_reschedule', v_request_key, v_request_hash
  );
  if v_replay is not null then
    return v_replay;
  end if;

  select * into v_work
  from public.ad_works
  where id = p_ad_work_id
  for update;
  if not found then raise exception 'Ad Work not found' using errcode = 'P0002'; end if;
  if p_expected_version <> v_work.schedule_version then
    raise exception 'Schedule changed; refresh and retry' using errcode = '40001';
  end if;
  if v_work.planning_status = 'cancelled' or v_work.status = 'cancelled'
     or v_work.closure_status in ('closed','closed_with_issues','cancelled') then
    raise exception 'Cancelled or closed Ad Work cannot be rescheduled' using errcode = '55000';
  end if;

  select * into v_day
  from public.ad_work_days
  where id = p_ad_work_day_id
    and ad_work_id = p_ad_work_id
  for update;
  if not found then raise exception 'Ad Work day not found' using errcode = 'P0002'; end if;
  if v_day.execution_status not in ('planned','ready') then
    raise exception 'Only unstarted work days can be rescheduled' using errcode = '55000';
  end if;
  if p_new_date = v_day.work_date then
    raise exception 'Choose a different work date' using errcode = '22023';
  end if;
  if exists (
    select 1
    from public.ad_work_days
    where ad_work_id = p_ad_work_id
      and work_date = p_new_date
      and id <> p_ad_work_day_id
  ) then
    raise exception 'Another work day already uses the requested date' using errcode = '23505';
  end if;
  if exists (
    select 1
    from public.ad_work_days active_day
    where active_day.ad_work_id = p_ad_work_id
      and active_day.id <> p_ad_work_day_id
      and active_day.execution_status in ('running','on_break')
  ) or exists (
    select 1
    from public.tracking_sessions active_session
    where active_session.ad_work_id = p_ad_work_id
      and active_session.ad_work_day_id is distinct from p_ad_work_day_id
      and active_session.status in ('running','paused')
  ) then
    raise exception 'Another work day is actively executing; finish or stop it before rescheduling' using errcode = '55000';
  end if;

  perform public.m28_assert_day_unobserved_v1(p_ad_work_id, p_ad_work_day_id);
  perform set_config('app.m28_schedule_write', 'yes', true);
  perform public.m28_invalidate_execution_authority_v1(p_ad_work_id);

  v_old_date := v_day.work_date;
  update public.ad_work_days
  set work_date = p_new_date,
      status = 'rescheduled',
      planning_status = 'rescheduled',
      execution_status = 'planned',
      execution_updated_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = p_ad_work_day_id;

  select min(work_date), max(work_date)
  into v_new_start, v_new_end
  from public.ad_work_days
  where ad_work_id = p_ad_work_id;

  v_version := v_work.schedule_version + 1;
  v_message := format(
    'Kootha update: %s work day has been rescheduled from %s to %s. Reason: %s. Please contact us if you need any clarification.',
    v_work.title, v_old_date, p_new_date, v_reason
  );

  update public.ad_works
  set start_date = v_new_start,
      end_date = v_new_end,
      schedule_version = v_version,
      schedule_updated_at = clock_timestamp(),
      schedule_updated_by = v_actor,
      updated_at = clock_timestamp()
  where id = p_ad_work_id;

  perform set_config('app.m28_schedule_write', '', true);

  insert into public.ad_work_schedule_events(
    ad_work_id, ad_work_day_id, actor_id, event_type,
    from_start_date, from_end_date, to_start_date, to_end_date,
    reason, customer_message, schedule_version
  ) values (
    p_ad_work_id, p_ad_work_day_id, v_actor, 'day_rescheduled',
    v_old_date, v_old_date, p_new_date, p_new_date,
    v_reason, v_message, v_version
  );
  insert into public.customer_updates(
    ad_work_id, ad_work_day_id, type, message, channel, sent_status, created_by
  ) values (
    p_ad_work_id, p_ad_work_day_id, 'manual', v_message, 'copy', 'draft', v_actor
  );
  insert into public.audit_logs(actor_type, actor_id, action, entity_type, entity_id, safe_details)
  values (
    'admin', v_actor, 'm28_ad_work_day_rescheduled', 'ad_work_day', p_ad_work_day_id,
    jsonb_build_object(
      'scheduleVersion', v_version,
      'fromDate', v_old_date,
      'toDate', p_new_date
    )
  );

  v_result := jsonb_build_object(
    'snapshot', public.m28_build_snapshot_v1(p_ad_work_id),
    'customerMessage', v_message
  );
  perform public.m28_record_result_v1(
    v_actor, p_ad_work_id, 'day_reschedule', v_request_key, v_request_hash, v_result
  );
  return v_result;
end;
$$;

create or replace function public.admin_cancel_ad_work_v1(
  p_ad_work_id uuid,
  p_reason text,
  p_internal_note text default null,
  p_expected_version bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid;
  v_work public.ad_works%rowtype;
  v_reason text;
  v_internal_note text;
  v_version bigint;
  v_message text;
  v_request_key text;
  v_request_hash text;
  v_replay jsonb;
  v_result jsonb;
begin
  v_actor := public.m20a_require_admin();
  v_reason := public.m20a_require_reason(p_reason);
  v_internal_note := public.m20a_validate_safe_text(
    p_internal_note, 'Cancellation internal note', 500, false
  );
  if p_expected_version is null then
    raise exception 'Schedule changed; refresh and retry' using errcode = '40001';
  end if;

  v_request_key := p_expected_version::text;
  v_request_hash := pg_catalog.md5(jsonb_build_object(
    'adWorkId', p_ad_work_id,
    'expectedVersion', p_expected_version,
    'reason', v_reason,
    'internalNote', v_internal_note
  )::text);
  v_replay := public.m28_claim_replay_v1(
    v_actor, p_ad_work_id, 'cancel', v_request_key, v_request_hash
  );
  if v_replay is not null then
    return v_replay;
  end if;

  select * into v_work
  from public.ad_works
  where id = p_ad_work_id
  for update;
  if not found then raise exception 'Ad Work not found' using errcode = 'P0002'; end if;
  if p_expected_version <> v_work.schedule_version then
    raise exception 'Schedule changed; refresh and retry' using errcode = '40001';
  end if;
  if v_work.planning_status = 'cancelled' or v_work.status = 'cancelled' then
    raise exception 'Ad Work is already cancelled' using errcode = '55000';
  end if;
  if v_work.closure_status in ('closed','closed_with_issues')
     or v_work.execution_overall_status = 'completed' then
    raise exception 'Completed or closed Ad Work cannot be cancelled here' using errcode = '55000';
  end if;

  perform set_config('app.m28_schedule_write', 'yes', true);

  update public.tracking_sessions
  set status = 'stopped',
      ended_at = coalesce(ended_at, clock_timestamp()),
      stopped_by = 'admin',
      stop_reason = 'admin_stopped'
  where ad_work_id = p_ad_work_id
    and status in ('not_started','running','paused');

  update public.ad_work_assignments
  set status = 'cancelled',
      updated_at = clock_timestamp()
  where ad_work_id = p_ad_work_id
    and status <> 'cancelled';

  update public.ad_work_days
  set status = case
        when execution_status = 'completed' then status
        else 'cancelled'::public.ad_work_day_status
      end,
      planning_status = case
        when execution_status = 'completed' then planning_status
        else 'cancelled'
      end,
      execution_status = case
        when execution_status = 'completed' then execution_status
        else 'cancelled'
      end,
      execution_updated_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where ad_work_id = p_ad_work_id;

  v_version := v_work.schedule_version + 1;
  v_message := format(
    'Kootha update: %s has been cancelled. Reason: %s. Please contact us if you would like to plan a new date.',
    v_work.title, v_reason
  );

  update public.ad_works
  set planning_status = 'cancelled',
      status = 'cancelled',
      assignment_status = 'cancelled',
      execution_release_status = 'access_revoked',
      execution_overall_status = 'cancelled',
      work_access_code_hash = null,
      work_access_code_hint = null,
      work_access_revoked_at = clock_timestamp(),
      closure_status = 'cancelled',
      cancellation_reason = v_reason,
      cancellation_internal_note = v_internal_note,
      cancelled_at = clock_timestamp(),
      cancelled_by = v_actor,
      schedule_version = v_version,
      schedule_updated_at = clock_timestamp(),
      schedule_updated_by = v_actor,
      updated_at = clock_timestamp()
  where id = p_ad_work_id;

  update public.final_proof_summaries
  set closure_status = 'cancelled',
      updated_at = clock_timestamp()
  where ad_work_id = p_ad_work_id
    and closure_status not in ('closed','closed_with_issues');

  perform set_config('app.m28_schedule_write', '', true);

  insert into public.ad_work_schedule_events(
    ad_work_id, actor_id, event_type, from_start_date, from_end_date,
    to_start_date, to_end_date, reason, customer_message, schedule_version
  ) values (
    p_ad_work_id, v_actor, 'ad_work_cancelled', v_work.start_date, v_work.end_date,
    null, null, v_reason, v_message, v_version
  );
  insert into public.customer_updates(
    ad_work_id, type, message, channel, sent_status, created_by
  ) values (
    p_ad_work_id, 'manual', v_message, 'copy', 'draft', v_actor
  );
  insert into public.audit_logs(actor_type, actor_id, action, entity_type, entity_id, safe_details)
  values (
    'admin', v_actor, 'm28_ad_work_cancelled', 'ad_work', p_ad_work_id,
    jsonb_build_object('scheduleVersion', v_version)
  );

  v_result := jsonb_build_object(
    'snapshot', public.m28_build_snapshot_v1(p_ad_work_id),
    'customerMessage', v_message
  );
  perform public.m28_record_result_v1(
    v_actor, p_ad_work_id, 'cancel', v_request_key, v_request_hash, v_result
  );
  return v_result;
end;
$$;

revoke all on function public.m28_claim_replay_v1(uuid,uuid,text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.m28_record_result_v1(uuid,uuid,text,text,text,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.m28_build_snapshot_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_list_ad_work_commercial_events_v1(uuid,bigint,integer)
  from public, anon, authenticated, service_role;

revoke all on function public.admin_update_ad_work_payment_v1(uuid,text,numeric,numeric,text,bigint)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_sync_ad_work_days_v2(uuid,date,integer,time,time,text,bigint)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_update_ad_work_days_v2(uuid,jsonb,bigint)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_reschedule_ad_work_v1(uuid,date,text,bigint)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_reschedule_ad_work_day_v1(uuid,uuid,date,text,bigint)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_cancel_ad_work_v1(uuid,text,text,bigint)
  from public, anon, authenticated, service_role;

grant execute on function public.admin_list_ad_work_commercial_events_v1(uuid,bigint,integer)
  to authenticated;
grant execute on function public.admin_update_ad_work_payment_v1(uuid,text,numeric,numeric,text,bigint)
  to authenticated;
grant execute on function public.admin_sync_ad_work_days_v2(uuid,date,integer,time,time,text,bigint)
  to authenticated;
grant execute on function public.admin_update_ad_work_days_v2(uuid,jsonb,bigint)
  to authenticated;
grant execute on function public.admin_reschedule_ad_work_v1(uuid,date,text,bigint)
  to authenticated;
grant execute on function public.admin_reschedule_ad_work_day_v1(uuid,uuid,date,text,bigint)
  to authenticated;
grant execute on function public.admin_cancel_ad_work_v1(uuid,text,text,bigint)
  to authenticated;
