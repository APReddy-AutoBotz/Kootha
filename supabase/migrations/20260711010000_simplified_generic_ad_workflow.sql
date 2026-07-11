-- Flexible advertisement delivery requirements and action-led admin execution.
alter table public.ad_works
  add column if not exists delivery_method text not null default 'custom',
  add column if not exists execution_mode text not null default 'admin_managed',
  add column if not exists driver_required boolean not null default false,
  add column if not exists vehicle_required boolean not null default false,
  add column if not exists speaker_required boolean not null default false,
  add column if not exists areas_required boolean not null default false,
  add column if not exists customer_updates_required boolean not null default true;

update public.ad_works
set delivery_method = 'vehicle_announcement',
    execution_mode = 'driver_app',
    driver_required = true,
    vehicle_required = true,
    speaker_required = true,
    areas_required = true
where created_at < now()
  and delivery_method = 'custom'
  and execution_mode = 'admin_managed';

alter table public.ad_work_assignments alter column vehicle_id drop not null;

alter table public.ad_works drop constraint if exists ad_works_delivery_method_check;
alter table public.ad_works add constraint ad_works_delivery_method_check
  check (delivery_method in ('vehicle_announcement', 'field_promotion', 'print_placement', 'digital_media', 'event_campaign', 'custom'));
alter table public.ad_works drop constraint if exists ad_works_execution_mode_check;
alter table public.ad_works add constraint ad_works_execution_mode_check
  check (execution_mode in ('driver_app', 'admin_managed'));

create or replace function public.save_ad_work_assignment(
  p_ad_work_id uuid,
  p_driver_id uuid,
  p_vehicle_id uuid default null,
  p_assignment_note text default null,
  p_readiness_warnings text[] default '{}',
  p_change_confirmed boolean default false
)
returns table(assignment_id uuid, status text, result_message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad_work public.ad_works%rowtype;
  v_driver public.drivers%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_existing public.ad_work_assignments%rowtype;
  v_assignment_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  select * into v_ad_work from public.ad_works where id = p_ad_work_id for update;
  if not found then raise exception 'Ad Work not found' using errcode = 'P0002'; end if;
  if not v_ad_work.driver_required then raise exception 'A driver is not required for this work' using errcode = '22000'; end if;

  select * into v_driver from public.drivers where id = p_driver_id;
  if not found or v_driver.approval_status <> 'approved' or coalesce(v_driver.onboarding_status, 'pending_review') <> 'approved' then
    raise exception 'Choose an approved driver' using errcode = '22000';
  end if;

  if v_ad_work.vehicle_required and p_vehicle_id is null then
    raise exception 'Choose an approved vehicle' using errcode = '22000';
  end if;

  if p_vehicle_id is not null then
    select * into v_vehicle from public.vehicles where id = p_vehicle_id;
    if not found or coalesce(v_vehicle.onboarding_status, 'pending_review') <> 'approved' or coalesce(v_vehicle.active, false) is false then
      raise exception 'Choose an approved vehicle' using errcode = '22000';
    end if;
    if v_ad_work.speaker_required and coalesce(v_vehicle.mic_system_available, v_vehicle.mic_available, false) is false then
      raise exception 'Choose a vehicle with speaker equipment' using errcode = '22000';
    end if;
  end if;

  select * into v_existing from public.ad_work_assignments where ad_work_id = p_ad_work_id for update;
  if found and (v_existing.driver_id is distinct from p_driver_id or v_existing.vehicle_id is distinct from p_vehicle_id) and not p_change_confirmed then
    raise exception 'Confirm the assignment change' using errcode = '22000';
  end if;

  insert into public.ad_work_assignments (ad_work_id, driver_id, vehicle_id, status, assignment_note, readiness_warnings, warning_confirmation, updated_at)
  values (p_ad_work_id, p_driver_id, p_vehicle_id, 'ready_for_execution', nullif(trim(coalesce(p_assignment_note, '')), ''), coalesce(p_readiness_warnings, '{}'), p_change_confirmed, now())
  on conflict (ad_work_id) do update set
    driver_id = excluded.driver_id,
    vehicle_id = excluded.vehicle_id,
    status = 'ready_for_execution',
    assignment_note = excluded.assignment_note,
    readiness_warnings = excluded.readiness_warnings,
    warning_confirmation = excluded.warning_confirmation,
    updated_at = now()
  returning id into v_assignment_id;

  update public.ad_works set assignment_status = 'ready_for_execution', assignment_note = nullif(trim(coalesce(p_assignment_note, '')), ''), assignment_updated_at = now(), updated_at = now()
  where id = p_ad_work_id;
  return query select v_assignment_id, 'ready_for_execution'::text, 'People and equipment saved.'::text;
end;
$$;

revoke all on function public.save_ad_work_assignment(uuid, uuid, uuid, text, text[], boolean) from public;
grant execute on function public.save_ad_work_assignment(uuid, uuid, uuid, text, text[], boolean) to authenticated;

create or replace function public.admin_update_ad_work_day(
  p_ad_work_day_id uuid,
  p_action text,
  p_note text default null
)
returns table(ad_work_day_id uuid, execution_status text, result_message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day public.ad_work_days%rowtype;
  v_ad_work public.ad_works%rowtype;
  v_status text;
begin
  if not public.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if p_action not in ('start', 'complete', 'report_issue') then raise exception 'Invalid work action' using errcode = '22000'; end if;

  select * into v_day from public.ad_work_days where id = p_ad_work_day_id for update;
  if not found then raise exception 'Work day not found' using errcode = 'P0002'; end if;
  select * into v_ad_work from public.ad_works where id = v_day.ad_work_id for update;
  if v_ad_work.execution_mode <> 'admin_managed' then raise exception 'This work is managed in the driver app' using errcode = '22000'; end if;

  if p_action = 'start' then
    v_status := 'running';
    update public.ad_work_days set execution_status = v_status, execution_started_at = coalesce(execution_started_at, now()), execution_updated_at = now() where id = v_day.id;
    update public.ad_works set execution_overall_status = 'running', updated_at = now() where id = v_ad_work.id;
  elsif p_action = 'complete' then
    v_status := 'completed';
    update public.ad_work_days set execution_status = v_status, execution_completed_at = now(), completion_note = nullif(trim(coalesce(p_note, '')), ''), execution_updated_at = now() where id = v_day.id;
    update public.ad_works set execution_overall_status = case when not exists (select 1 from public.ad_work_days d where d.ad_work_id = v_ad_work.id and d.id <> v_day.id and d.execution_status <> 'completed') then 'completed' else 'running' end,
      execution_completed_at = case when not exists (select 1 from public.ad_work_days d where d.ad_work_id = v_ad_work.id and d.id <> v_day.id and d.execution_status <> 'completed') then now() else execution_completed_at end,
      updated_at = now() where id = v_ad_work.id;
  else
    v_status := 'issue_reported';
    update public.ad_work_days set execution_status = v_status, issue_note = nullif(trim(coalesce(p_note, '')), ''), execution_updated_at = now() where id = v_day.id;
  end if;
  return query select v_day.id, v_status, case p_action when 'start' then 'Work started.' when 'complete' then 'Work completed.' else 'Issue recorded.' end;
end;
$$;

revoke all on function public.admin_update_ad_work_day(uuid, text, text) from public;
grant execute on function public.admin_update_ad_work_day(uuid, text, text) to authenticated;
