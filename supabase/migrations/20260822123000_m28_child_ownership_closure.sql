-- M28 child-ownership closure: assignment and work-day rows keep their parent
-- identity for their entire lifecycle. Governed APIs may change state, but moving
-- an existing child to another Ad Work would corrupt M21/M28 history and parent
-- schedule/assignment authority.
set search_path = public;

create or replace function public.m28_guard_cancelled_assignment_write_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_parent_cancelled boolean := false;
begin
  if tg_op = 'UPDATE' then
    if new.ad_work_id is distinct from old.ad_work_id then
      raise exception 'Ad Work assignment ownership is immutable'
        using errcode = '42501';
    end if;
  end if;

  select
    aw.planning_status = 'cancelled'
    or aw.status = 'cancelled'
    or aw.execution_overall_status = 'cancelled'
    or aw.closure_status = 'cancelled'
    or aw.cancelled_at is not null
    or aw.cancelled_by is not null
    or aw.cancellation_reason is not null
  into v_parent_cancelled
  from public.ad_works aw
  where aw.id = new.ad_work_id;

  if coalesce(v_parent_cancelled, false) then
    raise exception 'Cancelled Ad Work assignments are immutable outside governed cancellation authority'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.m28_guard_cancelled_assignment_write_v1()
  from public, anon, authenticated, service_role;

create or replace function public.m28_guard_day_schedule_write_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_schedule_authorized boolean := coalesce(current_setting('app.m28_schedule_write', true), '') = 'yes';
  v_execution_changed boolean;
  v_parent_cancelled boolean := false;
begin
  -- A work-day identity belongs permanently to one Ad Work. No M28 or retained
  -- authority requires re-parenting an existing day; rescheduling changes dates,
  -- not ownership. Keep this invariant even inside governed schedule writes.
  if new.ad_work_id is distinct from old.ad_work_id then
    raise exception 'Ad Work day ownership is immutable'
      using errcode = '42501';
  end if;

  v_execution_changed := row(
      new.execution_status,
      new.execution_started_at,
      new.break_started_at,
      new.last_resumed_at,
      new.execution_completed_at,
      new.completion_note,
      new.issue_note,
      new.execution_updated_at,
      new.driver_id,
      new.vehicle_id
    ) is distinct from row(
      old.execution_status,
      old.execution_started_at,
      old.break_started_at,
      old.last_resumed_at,
      old.execution_completed_at,
      old.completion_note,
      old.issue_note,
      old.execution_updated_at,
      old.driver_id,
      old.vehicle_id
    );

  if not v_schedule_authorized and v_execution_changed then
    select
      aw.planning_status = 'cancelled'
      or aw.status = 'cancelled'
      or aw.execution_overall_status = 'cancelled'
      or aw.closure_status = 'cancelled'
      or aw.cancelled_at is not null
      or aw.cancelled_by is not null
      or aw.cancellation_reason is not null
    into v_parent_cancelled
    from public.ad_works aw
    where aw.id = old.ad_work_id;

    if coalesce(v_parent_cancelled, false) then
      raise exception 'Cancelled Ad Work day execution state is immutable outside governed cancellation authority'
        using errcode = '42501';
    end if;
  end if;

  if not v_schedule_authorized
     and row(new.status, new.work_date, new.planned_start_time, new.planned_end_time,
             new.areas_to_cover, new.day_note, new.planning_status)
         is distinct from
         row(old.status, old.work_date, old.planned_start_time, old.planned_end_time,
             old.areas_to_cover, old.day_note, old.planning_status) then
    raise exception 'Work-day schedule fields must be changed through governed M28 authority'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.m28_guard_day_schedule_write_v1()
  from public, anon, authenticated, service_role;
