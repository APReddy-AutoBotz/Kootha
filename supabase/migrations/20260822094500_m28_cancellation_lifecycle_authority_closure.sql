-- M28 final cancellation-lifecycle authority closure.
-- Browser-admin table PATCHes must not bypass the governed lifecycle RPCs, and
-- a genuinely cancelled Ad Work cannot be resurrected by older authorities.
set search_path = public;

create or replace function public.m28_guard_schedule_write_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_schedule_authorized boolean := coalesce(current_setting('app.m28_schedule_write', true), '') = 'yes';
  v_lifecycle_changed boolean;
  v_old_cancelled boolean;
begin
  v_lifecycle_changed := row(
      new.status,
      new.assignment_status,
      new.execution_release_status,
      new.execution_overall_status,
      new.closure_status
    ) is distinct from row(
      old.status,
      old.assignment_status,
      old.execution_release_status,
      old.execution_overall_status,
      old.closure_status
    );

  v_old_cancelled := old.planning_status = 'cancelled'
    or old.status = 'cancelled'
    or old.execution_overall_status = 'cancelled'
    or old.closure_status = 'cancelled'
    or old.cancelled_at is not null
    or old.cancelled_by is not null
    or old.cancellation_reason is not null;

  if not v_schedule_authorized then
    if row(
        new.start_date,
        new.end_date,
        new.number_of_days,
        new.daily_start_time,
        new.daily_end_time,
        new.areas_to_cover,
        new.planning_status,
        new.schedule_version,
        new.schedule_updated_at,
        new.schedule_updated_by,
        new.cancellation_reason,
        new.cancellation_internal_note,
        new.cancelled_at,
        new.cancelled_by
      ) is distinct from row(
        old.start_date,
        old.end_date,
        old.number_of_days,
        old.daily_start_time,
        old.daily_end_time,
        old.areas_to_cover,
        old.planning_status,
        old.schedule_version,
        old.schedule_updated_at,
        old.schedule_updated_by,
        old.cancellation_reason,
        old.cancellation_internal_note,
        old.cancelled_at,
        old.cancelled_by
      ) then
      raise exception 'Schedule fields must be changed through governed M28 authority' using errcode = '42501';
    end if;

    -- Direct PostgREST/RLS admin writes must use the existing SECURITY DEFINER
    -- lifecycle authorities rather than PATCHing canonical lifecycle columns.
    if v_lifecycle_changed and current_user = 'authenticated' then
      raise exception 'Ad Work lifecycle fields must be changed through governed authority' using errcode = '42501';
    end if;

    -- Once M28 cancellation has happened, older SECURITY DEFINER assignment,
    -- release, execution or closure functions cannot revive or rewrite it.
    if v_lifecycle_changed and v_old_cancelled then
      raise exception 'Cancelled Ad Work lifecycle is immutable outside governed cancellation authority' using errcode = '42501';
    end if;

    -- No non-M28 privileged path may manufacture whole-work cancellation markers.
    -- Assignment-level `cancelled` remains an assignment semantic in M5, but the
    -- whole-work markers below are owned only by the M28 cancellation transaction.
    if (new.status is distinct from old.status and new.status = 'cancelled')
       or (new.execution_overall_status is distinct from old.execution_overall_status
           and new.execution_overall_status = 'cancelled')
       or (new.closure_status is distinct from old.closure_status
           and new.closure_status = 'cancelled') then
      raise exception 'Whole-work cancellation must use governed M28 authority' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.m28_guard_schedule_write_v1()
  from public, anon, authenticated, service_role;
