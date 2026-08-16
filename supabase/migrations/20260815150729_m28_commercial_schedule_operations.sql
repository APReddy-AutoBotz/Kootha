-- M28: Commercial & Schedule Operations Control
-- Software-only admin authority for payment tracking, cancellation and rescheduling.
set search_path = public;

alter type public.ad_work_day_status add value if not exists 'cancelled';

alter table public.ad_works
  add column if not exists commercial_note text,
  add column if not exists commercial_version bigint not null default 0,
  add column if not exists commercial_updated_at timestamptz,
  add column if not exists commercial_updated_by uuid,
  add column if not exists schedule_version bigint not null default 0,
  add column if not exists schedule_updated_at timestamptz,
  add column if not exists schedule_updated_by uuid,
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_internal_note text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid;

-- Generic admin-managed work may legitimately have no vehicle. M21 effective
-- history must be able to record readiness downgrades for those assignments;
-- physical telemetry still requires a concrete vehicle/link before acceptance.
alter table public.m21_assignment_history alter column vehicle_id drop not null;

alter table public.ad_work_days drop constraint if exists ad_work_days_planning_status_check;
alter table public.ad_work_days add constraint ad_work_days_planning_status_check
  check (planning_status in ('planned', 'rescheduled', 'cancelled', 'missed'));

alter table public.ad_works drop constraint if exists ad_works_m28_versions_check;
alter table public.ad_works add constraint ad_works_m28_versions_check
  check (commercial_version >= 0 and schedule_version >= 0);
alter table public.ad_works drop constraint if exists ad_works_m28_paid_not_over_total_check;
alter table public.ad_works add constraint ad_works_m28_paid_not_over_total_check
  check (paid_amount <= total_amount) not valid;
alter table public.ad_works drop constraint if exists ad_works_m28_commercial_note_check;
alter table public.ad_works add constraint ad_works_m28_commercial_note_check
  check (commercial_note is null or (char_length(commercial_note) <= 500 and commercial_note !~ '[[:cntrl:]]'));
alter table public.ad_works drop constraint if exists ad_works_m28_cancellation_reason_check;
alter table public.ad_works add constraint ad_works_m28_cancellation_reason_check check (
  cancellation_reason is null or (
    char_length(trim(cancellation_reason)) between 1 and 500
    and cancellation_reason !~ '[[:cntrl:]]'
  )
);
alter table public.ad_works drop constraint if exists ad_works_m28_cancellation_internal_note_check;
alter table public.ad_works add constraint ad_works_m28_cancellation_internal_note_check check (
  cancellation_internal_note is null or (
    char_length(cancellation_internal_note) <= 500
    and cancellation_internal_note !~ '[[:cntrl:]]'
  )
);

create table public.ad_work_commercial_events (
  id uuid primary key default gen_random_uuid(),
  ad_work_id uuid not null references public.ad_works(id) on delete restrict,
  actor_id uuid not null,
  from_payment_status public.payment_status not null,
  payment_status public.payment_status not null,
  from_total_amount numeric(12,2) not null,
  total_amount numeric(12,2) not null,
  from_paid_amount numeric(12,2) not null,
  paid_amount numeric(12,2) not null,
  balance_amount numeric(12,2) not null,
  note text,
  commercial_version bigint not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint ad_work_commercial_events_version_unique unique(ad_work_id, commercial_version),
  constraint ad_work_commercial_events_amounts_check check (
    from_total_amount >= 0 and total_amount >= 0
    and from_paid_amount >= 0 and paid_amount >= 0
    and paid_amount <= total_amount
    and balance_amount = total_amount - paid_amount
  ),
  constraint ad_work_commercial_events_note_check check (
    note is null or (char_length(note) <= 500 and note !~ '[[:cntrl:]]')
  )
);

create table public.ad_work_schedule_events (
  id uuid primary key default gen_random_uuid(),
  ad_work_id uuid not null references public.ad_works(id) on delete restrict,
  ad_work_day_id uuid references public.ad_work_days(id) on delete restrict,
  actor_id uuid not null,
  event_type text not null,
  from_start_date date,
  from_end_date date,
  to_start_date date,
  to_end_date date,
  reason text not null,
  customer_message text not null,
  schedule_version bigint not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint ad_work_schedule_events_version_unique unique(ad_work_id, schedule_version),
  constraint ad_work_schedule_events_type_check check (
    event_type in ('ad_work_rescheduled', 'day_rescheduled', 'ad_work_cancelled')
  ),
  constraint ad_work_schedule_events_reason_check check (
    char_length(trim(reason)) between 1 and 500 and reason !~ '[[:cntrl:]]'
  ),
  constraint ad_work_schedule_events_customer_message_check check (
    char_length(customer_message) between 1 and 1000 and customer_message !~ '[[:cntrl:]]'
  )
);

create index ad_work_commercial_events_work_idx
  on public.ad_work_commercial_events(ad_work_id, commercial_version desc);
create index ad_work_schedule_events_work_idx
  on public.ad_work_schedule_events(ad_work_id, schedule_version desc);

alter table public.ad_work_commercial_events enable row level security;
alter table public.ad_work_schedule_events enable row level security;

create policy "Admin users can view M28 commercial history"
  on public.ad_work_commercial_events for select to authenticated
  using (public.is_admin());
create policy "Admin users can view M28 schedule history"
  on public.ad_work_schedule_events for select to authenticated
  using (public.is_admin());

revoke all on public.ad_work_commercial_events from public, anon, authenticated, service_role;
revoke all on public.ad_work_schedule_events from public, anon, authenticated, service_role;
grant select on public.ad_work_commercial_events to authenticated;
grant select on public.ad_work_schedule_events to authenticated;

create or replace function public.m28_protect_history_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'M28 commercial and schedule history is immutable' using errcode = '55000';
end;
$$;

create trigger ad_work_commercial_events_immutable
before update or delete on public.ad_work_commercial_events
for each row execute function public.m28_protect_history_v1();
create trigger ad_work_schedule_events_immutable
before update or delete on public.ad_work_schedule_events
for each row execute function public.m28_protect_history_v1();

create or replace function public.m28_guard_commercial_write_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if row(new.payment_status, new.total_amount, new.paid_amount, new.commercial_note,
         new.commercial_version, new.commercial_updated_at, new.commercial_updated_by)
     is distinct from
     row(old.payment_status, old.total_amount, old.paid_amount, old.commercial_note,
         old.commercial_version, old.commercial_updated_at, old.commercial_updated_by)
     and coalesce(current_setting('app.m28_commercial_write', true), '') <> 'yes'
  then
    raise exception 'Commercial fields must be changed through the governed M28 RPC'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger ad_works_m28_commercial_guard
before update on public.ad_works
for each row execute function public.m28_guard_commercial_write_v1();

create or replace function public.m28_validate_payment_v1(
  p_status text,
  p_total numeric,
  p_paid numeric
)
returns void
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
begin
  if p_status not in ('not_paid','advance_paid','partially_paid','fully_paid','refund_adjustment') then
    raise exception 'Unsupported payment status' using errcode = '22023';
  end if;
  if p_total is null or p_paid is null or p_total < 0 or p_paid < 0 then
    raise exception 'Payment amounts must be non-negative' using errcode = '22023';
  end if;
  if p_paid > p_total then
    raise exception 'Paid amount cannot exceed total amount' using errcode = '22023';
  end if;
  if p_status = 'not_paid' and p_paid <> 0 then
    raise exception 'Not Paid requires a paid amount of zero' using errcode = '22023';
  end if;
  if p_status in ('advance_paid','partially_paid')
     and not (p_total > 0 and p_paid > 0 and p_paid < p_total) then
    raise exception 'Partial payment status requires a positive partial payment below the total' using errcode = '22023';
  end if;
  if p_status = 'fully_paid' and not (p_total > 0 and p_paid = p_total) then
    raise exception 'Fully Paid requires paid amount to equal a positive total amount' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.m28_assert_day_unobserved_v1(
  p_ad_work_id uuid,
  p_ad_work_day_id uuid default null
)
returns void
language plpgsql
stable
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1
    from public.ad_work_days d
    where d.ad_work_id = p_ad_work_id
      and (p_ad_work_day_id is null or d.id = p_ad_work_day_id)
      and (d.execution_started_at is not null or d.execution_completed_at is not null
           or d.execution_status in ('running','on_break','completed','issue_reported'))
  ) then
    raise exception 'Executed or started work days cannot be rescheduled' using errcode = '55000';
  end if;
  if exists (
    select 1
    from public.location_points lp
    join public.tracking_sessions ts on ts.id = lp.tracking_session_id
    where ts.ad_work_id = p_ad_work_id
      and (p_ad_work_day_id is null or ts.ad_work_day_id = p_ad_work_day_id)
  ) then
    raise exception 'Observed phone/location evidence prevents rescheduling' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.telemetry_receipts tr
    where tr.ad_work_id = p_ad_work_id
      and (p_ad_work_day_id is null or tr.ad_work_day_id = p_ad_work_day_id)
      and tr.disposition in ('accepted_live','accepted_delayed')
  ) then
    raise exception 'Accepted physical telemetry prevents rescheduling' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.proof_uploads pu
    join public.ad_work_days d on d.id = pu.ad_work_day_id
    where d.ad_work_id = p_ad_work_id
      and (p_ad_work_day_id is null or d.id = p_ad_work_day_id)
  ) or exists (
    select 1 from public.execution_proof_notes epn
    where epn.ad_work_id = p_ad_work_id
      and (p_ad_work_day_id is null or epn.ad_work_day_id = p_ad_work_day_id)
  ) then
    raise exception 'Existing proof prevents rescheduling' using errcode = '55000';
  end if;
end;
$$;

create or replace function public.m28_invalidate_execution_authority_v1(p_ad_work_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.tracking_sessions
  set status = 'stopped',
      ended_at = coalesce(ended_at, clock_timestamp()),
      stopped_by = 'admin',
      stop_reason = 'admin_stopped'
  where ad_work_id = p_ad_work_id
    and status in ('not_started','running','paused');

  update public.ad_work_assignments
  set status = case when status = 'ready_for_execution' then 'needs_review' else status end,
      updated_at = clock_timestamp()
  where ad_work_id = p_ad_work_id
    and status <> 'cancelled';

  update public.ad_work_days
  set execution_status = case when execution_status = 'ready' then 'planned' else execution_status end,
      execution_updated_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where ad_work_id = p_ad_work_id
    and execution_status in ('planned','ready');

  update public.ad_works
  set assignment_status = case when assignment_status = 'ready_for_execution' then 'needs_review' else assignment_status end,
      execution_release_status = case when execution_release_status = 'released_to_driver' then 'access_revoked' else execution_release_status end,
      work_access_code_hash = null,
      work_access_code_hint = null,
      work_access_revoked_at = case
        when execution_release_status = 'released_to_driver' or work_access_code_hash is not null
          then clock_timestamp()
        else work_access_revoked_at
      end,
      updated_at = clock_timestamp()
  where id = p_ad_work_id;
end;
$$;

create or replace function public.m28_build_snapshot_v1(p_ad_work_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
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
        'note', e.note,
        'version', e.commercial_version,
        'createdAt', e.created_at
      ) order by e.commercial_version desc)
      from public.ad_work_commercial_events e where e.ad_work_id = aw.id
    ), '[]'::jsonb),
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
      from public.ad_work_schedule_events e where e.ad_work_id = aw.id
    ), '[]'::jsonb)
  )
  from public.ad_works aw
  where aw.id = p_ad_work_id;
$$;

create or replace function public.admin_get_commercial_schedule_v1(p_ad_work_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_snapshot jsonb;
begin
  perform public.m20a_require_admin();
  select public.m28_build_snapshot_v1(p_ad_work_id) into v_snapshot;
  if v_snapshot is null then
    raise exception 'Ad Work not found' using errcode = 'P0002';
  end if;
  return v_snapshot;
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
begin
  v_actor := public.m20a_require_admin();
  perform public.m28_validate_payment_v1(p_payment_status, p_total_amount, p_paid_amount);
  v_note := public.m20a_validate_safe_text(p_note, 'Commercial note', 500, false);

  select * into v_work from public.ad_works where id = p_ad_work_id for update;
  if not found then raise exception 'Ad Work not found' using errcode = 'P0002'; end if;
  if p_expected_version is null or p_expected_version <> v_work.commercial_version then
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
  values ('admin', v_actor, 'm28_commercial_updated', 'ad_work', p_ad_work_id,
          jsonb_build_object('commercialVersion', v_version));

  return jsonb_build_object('snapshot', public.m28_build_snapshot_v1(p_ad_work_id));
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
begin
  v_actor := public.m20a_require_admin();
  if p_start_date is null then raise exception 'Start date is required' using errcode = '22004'; end if;
  if p_number_of_days is null or p_number_of_days < 1 or p_number_of_days > 366 then
    raise exception 'Number of days must be between 1 and 366' using errcode = '22023';
  end if;
  v_day_count := p_number_of_days;
  v_end_date := p_start_date + (v_day_count - 1);
  v_areas := nullif(trim(coalesce(p_areas_to_cover, '')), '');

  select * into v_work from public.ad_works where id = p_ad_work_id for update;
  if not found then raise exception 'Ad Work not found' using errcode = 'P0002'; end if;
  if p_expected_version is null or p_expected_version <> v_work.schedule_version then
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
      schedule_updated_at = clock_timestamp(), schedule_updated_by = v_actor,
      updated_at = clock_timestamp()
  where id = p_ad_work_id;

  perform set_config('app.m28_schedule_write', '', true);
  insert into public.audit_logs(actor_type, actor_id, action, entity_type, entity_id, safe_details)
  values ('admin', v_actor, 'm28_initial_schedule_updated', 'ad_work', p_ad_work_id,
          jsonb_build_object('scheduleVersion', v_version));

  return jsonb_build_object('snapshot', public.m28_build_snapshot_v1(p_ad_work_id));
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
begin
  v_actor := public.m20a_require_admin();
  v_reason := public.m20a_require_reason(p_reason);
  if p_new_start_date is null then raise exception 'New start date is required' using errcode = '22004'; end if;

  select * into v_work from public.ad_works where id = p_ad_work_id for update;
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

  select min(work_date), max(work_date) into v_old_start, v_old_end
  from public.ad_work_days where ad_work_id = p_ad_work_id;
  if v_old_start is null then raise exception 'Ad Work has no schedulable days' using errcode = '55000'; end if;
  if p_new_start_date = v_old_start then raise exception 'Choose a different start date' using errcode = '22023'; end if;

  perform public.m28_assert_day_unobserved_v1(p_ad_work_id, null);
  perform set_config('app.m28_schedule_write', 'yes', true);
  perform public.m28_invalidate_execution_authority_v1(p_ad_work_id);

  v_delta := p_new_start_date - v_old_start;
  if v_delta > 0 then
    for v_day in select id, work_date from public.ad_work_days where ad_work_id = p_ad_work_id order by work_date desc, id desc loop
      update public.ad_work_days
      set work_date = v_day.work_date + v_delta,
          status = 'rescheduled', planning_status = 'rescheduled', execution_status = 'planned',
          execution_updated_at = clock_timestamp(), updated_at = clock_timestamp()
      where id = v_day.id;
    end loop;
  else
    for v_day in select id, work_date from public.ad_work_days where ad_work_id = p_ad_work_id order by work_date asc, id asc loop
      update public.ad_work_days
      set work_date = v_day.work_date + v_delta,
          status = 'rescheduled', planning_status = 'rescheduled', execution_status = 'planned',
          execution_updated_at = clock_timestamp(), updated_at = clock_timestamp()
      where id = v_day.id;
    end loop;
  end if;

  select min(work_date), max(work_date) into v_new_start, v_new_end
  from public.ad_work_days where ad_work_id = p_ad_work_id;
  v_version := v_work.schedule_version + 1;
  v_message := format('Kootha update: %s has been rescheduled from %s to %s. Reason: %s. Please contact us if you need any clarification.',
                      v_work.title, v_old_start, v_new_start, v_reason);

  update public.ad_works
  set start_date = v_new_start,
      end_date = v_new_end,
      number_of_days = (select count(*) from public.ad_work_days where ad_work_id = p_ad_work_id),
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
  insert into public.customer_updates(ad_work_id, type, message, channel, sent_status, created_by)
  values (p_ad_work_id, 'manual', v_message, 'copy', 'draft', v_actor);
  insert into public.audit_logs(actor_type, actor_id, action, entity_type, entity_id, safe_details)
  values ('admin', v_actor, 'm28_ad_work_rescheduled', 'ad_work', p_ad_work_id,
          jsonb_build_object('scheduleVersion', v_version, 'fromStartDate', v_old_start, 'toStartDate', v_new_start));

  return jsonb_build_object('snapshot', public.m28_build_snapshot_v1(p_ad_work_id), 'customerMessage', v_message);
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
begin
  v_actor := public.m20a_require_admin();
  v_reason := public.m20a_require_reason(p_reason);
  if p_new_date is null then raise exception 'New work date is required' using errcode = '22004'; end if;

  select * into v_work from public.ad_works where id = p_ad_work_id for update;
  if not found then raise exception 'Ad Work not found' using errcode = 'P0002'; end if;
  if p_expected_version <> v_work.schedule_version then
    raise exception 'Schedule changed; refresh and retry' using errcode = '40001';
  end if;
  if v_work.planning_status = 'cancelled' or v_work.status = 'cancelled'
     or v_work.closure_status in ('closed','closed_with_issues','cancelled') then
    raise exception 'Cancelled or closed Ad Work cannot be rescheduled' using errcode = '55000';
  end if;

  select * into v_day from public.ad_work_days
  where id = p_ad_work_day_id and ad_work_id = p_ad_work_id for update;
  if not found then raise exception 'Ad Work day not found' using errcode = 'P0002'; end if;
  if v_day.execution_status not in ('planned','ready') then
    raise exception 'Only unstarted work days can be rescheduled' using errcode = '55000';
  end if;
  if p_new_date = v_day.work_date then raise exception 'Choose a different work date' using errcode = '22023'; end if;
  if exists (select 1 from public.ad_work_days where ad_work_id = p_ad_work_id and work_date = p_new_date and id <> p_ad_work_day_id) then
    raise exception 'Another work day already uses the requested date' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.ad_work_days active_day
    where active_day.ad_work_id = p_ad_work_id
      and active_day.id <> p_ad_work_day_id
      and active_day.execution_status in ('running','on_break')
  ) or exists (
    select 1 from public.tracking_sessions active_session
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
      status = 'rescheduled', planning_status = 'rescheduled', execution_status = 'planned',
      execution_updated_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = p_ad_work_day_id;

  select min(work_date), max(work_date) into v_new_start, v_new_end
  from public.ad_work_days where ad_work_id = p_ad_work_id;
  v_version := v_work.schedule_version + 1;
  v_message := format('Kootha update: %s work day has been rescheduled from %s to %s. Reason: %s. Please contact us if you need any clarification.',
                      v_work.title, v_old_date, p_new_date, v_reason);

  update public.ad_works
  set start_date = v_new_start,
      end_date = v_new_end,
      schedule_version = v_version,
      schedule_updated_at = clock_timestamp(), schedule_updated_by = v_actor,
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
  insert into public.customer_updates(ad_work_id, ad_work_day_id, type, message, channel, sent_status, created_by)
  values (p_ad_work_id, p_ad_work_day_id, 'manual', v_message, 'copy', 'draft', v_actor);
  insert into public.audit_logs(actor_type, actor_id, action, entity_type, entity_id, safe_details)
  values ('admin', v_actor, 'm28_ad_work_day_rescheduled', 'ad_work_day', p_ad_work_day_id,
          jsonb_build_object('scheduleVersion', v_version, 'fromDate', v_old_date, 'toDate', p_new_date));

  return jsonb_build_object('snapshot', public.m28_build_snapshot_v1(p_ad_work_id), 'customerMessage', v_message);
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
begin
  v_actor := public.m20a_require_admin();
  v_reason := public.m20a_require_reason(p_reason);
  v_internal_note := public.m20a_validate_safe_text(p_internal_note, 'Cancellation internal note', 500, false);

  select * into v_work from public.ad_works where id = p_ad_work_id for update;
  if not found then raise exception 'Ad Work not found' using errcode = 'P0002'; end if;
  if p_expected_version is null or p_expected_version <> v_work.schedule_version then
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
  set status = 'stopped', ended_at = coalesce(ended_at, clock_timestamp()),
      stopped_by = 'admin', stop_reason = 'admin_stopped'
  where ad_work_id = p_ad_work_id and status in ('not_started','running','paused');

  update public.ad_work_assignments
  set status = 'cancelled', updated_at = clock_timestamp()
  where ad_work_id = p_ad_work_id and status <> 'cancelled';

  update public.ad_work_days
  set status = case when execution_status = 'completed' then status else 'cancelled'::public.ad_work_day_status end,
      planning_status = case when execution_status = 'completed' then planning_status else 'cancelled' end,
      execution_status = case when execution_status = 'completed' then execution_status else 'cancelled' end,
      execution_updated_at = clock_timestamp(), updated_at = clock_timestamp()
  where ad_work_id = p_ad_work_id;

  v_version := v_work.schedule_version + 1;
  v_message := format('Kootha update: %s has been cancelled. Reason: %s. Please contact us if you would like to plan a new date.',
                      v_work.title, v_reason);

  update public.ad_works
  set planning_status = 'cancelled', status = 'cancelled', assignment_status = 'cancelled',
      execution_release_status = 'access_revoked', execution_overall_status = 'cancelled',
      work_access_code_hash = null, work_access_code_hint = null,
      work_access_revoked_at = clock_timestamp(),
      closure_status = 'cancelled',
      cancellation_reason = v_reason, cancellation_internal_note = v_internal_note,
      cancelled_at = clock_timestamp(), cancelled_by = v_actor,
      schedule_version = v_version, schedule_updated_at = clock_timestamp(), schedule_updated_by = v_actor,
      updated_at = clock_timestamp()
  where id = p_ad_work_id;

  update public.final_proof_summaries
  set closure_status = 'cancelled', updated_at = clock_timestamp()
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
  insert into public.customer_updates(ad_work_id, type, message, channel, sent_status, created_by)
  values (p_ad_work_id, 'manual', v_message, 'copy', 'draft', v_actor);
  insert into public.audit_logs(actor_type, actor_id, action, entity_type, entity_id, safe_details)
  values ('admin', v_actor, 'm28_ad_work_cancelled', 'ad_work', p_ad_work_id,
          jsonb_build_object('scheduleVersion', v_version));

  return jsonb_build_object('snapshot', public.m28_build_snapshot_v1(p_ad_work_id), 'customerMessage', v_message);
end;
$$;

create or replace function public.m28_guard_schedule_write_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if coalesce(current_setting('app.m28_schedule_write', true), '') <> 'yes'
     and row(new.start_date, new.end_date, new.number_of_days, new.planning_status,
             new.schedule_version, new.schedule_updated_at, new.schedule_updated_by)
         is distinct from
         row(old.start_date, old.end_date, old.number_of_days, old.planning_status,
             old.schedule_version, old.schedule_updated_at, old.schedule_updated_by) then
    raise exception 'Schedule fields must be changed through governed M28 authority' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.m28_guard_day_schedule_write_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if coalesce(current_setting('app.m28_schedule_write', true), '') <> 'yes'
     and row(new.work_date, new.planning_status)
         is distinct from row(old.work_date, old.planning_status) then
    raise exception 'Work-day schedule fields must be changed through governed M28 authority' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists ad_works_m28_schedule_write_guard on public.ad_works;
create trigger ad_works_m28_schedule_write_guard
before update on public.ad_works
for each row execute function public.m28_guard_schedule_write_v1();

drop trigger if exists ad_work_days_m28_schedule_write_guard on public.ad_work_days;
create trigger ad_work_days_m28_schedule_write_guard
before update on public.ad_work_days
for each row execute function public.m28_guard_day_schedule_write_v1();

revoke insert on public.ad_work_days from authenticated;
revoke all on function public.sync_ad_work_days(uuid,date,integer,time,time,text) from public, anon, authenticated, service_role;

revoke all on function public.m28_protect_history_v1() from public, anon, authenticated, service_role;
revoke all on function public.m28_guard_commercial_write_v1() from public, anon, authenticated, service_role;
revoke all on function public.m28_guard_schedule_write_v1() from public, anon, authenticated, service_role;
revoke all on function public.m28_guard_day_schedule_write_v1() from public, anon, authenticated, service_role;
revoke all on function public.m28_validate_payment_v1(text,numeric,numeric) from public, anon, authenticated, service_role;
revoke all on function public.m28_assert_day_unobserved_v1(uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.m28_invalidate_execution_authority_v1(uuid) from public, anon, authenticated, service_role;
revoke all on function public.m28_build_snapshot_v1(uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_get_commercial_schedule_v1(uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_sync_ad_work_days_v2(uuid,date,integer,time,time,text,bigint) from public, anon, authenticated, service_role;
revoke all on function public.admin_update_ad_work_payment_v1(uuid,text,numeric,numeric,text,bigint) from public, anon, authenticated, service_role;
revoke all on function public.admin_reschedule_ad_work_v1(uuid,date,text,bigint) from public, anon, authenticated, service_role;
revoke all on function public.admin_reschedule_ad_work_day_v1(uuid,uuid,date,text,bigint) from public, anon, authenticated, service_role;
revoke all on function public.admin_cancel_ad_work_v1(uuid,text,text,bigint) from public, anon, authenticated, service_role;

grant execute on function public.admin_get_commercial_schedule_v1(uuid) to authenticated;
grant execute on function public.admin_sync_ad_work_days_v2(uuid,date,integer,time,time,text,bigint) to authenticated;
grant execute on function public.admin_update_ad_work_payment_v1(uuid,text,numeric,numeric,text,bigint) to authenticated;
grant execute on function public.admin_reschedule_ad_work_v1(uuid,date,text,bigint) to authenticated;
grant execute on function public.admin_reschedule_ad_work_day_v1(uuid,uuid,date,text,bigint) to authenticated;
grant execute on function public.admin_cancel_ad_work_v1(uuid,text,text,bigint) to authenticated;
