-- M28 final review closure: canonical day-status authority.
set search_path = public;

create or replace function public.m28_guard_day_schedule_write_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if coalesce(current_setting('app.m28_schedule_write', true), '') <> 'yes'
     and row(new.status, new.work_date, new.planned_start_time, new.planned_end_time,
             new.areas_to_cover, new.day_note, new.planning_status)
         is distinct from
         row(old.status, old.work_date, old.planned_start_time, old.planned_end_time,
             old.areas_to_cover, old.day_note, old.planning_status) then
    raise exception 'Work-day schedule fields must be changed through governed M28 authority' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.m28_guard_day_schedule_write_v1()
  from public, anon, authenticated, service_role;
