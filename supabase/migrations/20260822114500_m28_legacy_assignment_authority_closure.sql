-- M28 final regression closure for the retained M5 assignment authority path.
-- Keep the canonical M21 advisory lock ahead of parent/assignment row locks and
-- remove the RETURNS TABLE output-column ambiguity from the assignment upsert.
set search_path = public;

create or replace function public.assign_driver_vehicle_to_ad_work(
  p_ad_work_id uuid,
  p_driver_id uuid,
  p_vehicle_id uuid,
  p_status text default 'assigned',
  p_assignment_note text default null,
  p_readiness_warnings text[] default '{}',
  p_warning_confirmation boolean default false
)
returns table(assignment_id uuid, ad_work_id uuid, driver_id uuid, vehicle_id uuid, status text, result_message text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ad_work public.ad_works%rowtype;
  v_driver public.drivers%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_existing public.ad_work_assignments%rowtype;
  v_assignment_id uuid;
  v_proof_selected boolean;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if p_status not in ('not_assigned', 'assigned', 'needs_review', 'ready_for_execution', 'cancelled') then
    raise exception 'Invalid assignment status' using errcode = '22000';
  end if;

  -- M21 assignment-history and M28 commercial/schedule authority share this
  -- transaction lock. Acquire it before the parent row so assignment changes,
  -- cancellation and execution-day changes cannot invert advisory/row ordering.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('m21-authority-global', 2100)
  );

  select * into v_ad_work
  from public.ad_works
  where id = p_ad_work_id
  for update;

  if not found then
    raise exception 'Ad Work not found' using errcode = 'P0002';
  end if;

  select * into v_driver
  from public.drivers
  where id = p_driver_id;

  if not found then
    raise exception 'Driver not found' using errcode = 'P0002';
  end if;

  if v_driver.approval_status <> 'approved' or coalesce(v_driver.onboarding_status, 'pending_review') <> 'approved' then
    raise exception 'Only approved drivers can be assigned' using errcode = '42501';
  end if;

  select * into v_vehicle
  from public.vehicles
  where id = p_vehicle_id;

  if not found then
    raise exception 'Vehicle not found' using errcode = 'P0002';
  end if;

  if coalesce(v_vehicle.onboarding_status, 'pending_review') <> 'approved' or coalesce(v_vehicle.active, false) is false then
    raise exception 'Only approved vehicles can be assigned' using errcode = '42501';
  end if;

  select * into v_existing
  from public.ad_work_assignments
  where ad_work_assignments.ad_work_id = p_ad_work_id
  for update;

  if found and (v_existing.driver_id is distinct from p_driver_id or v_existing.vehicle_id is distinct from p_vehicle_id) and p_warning_confirmation is not true then
    raise exception 'Existing assignment requires confirmation' using errcode = '22000';
  end if;

  v_proof_selected := coalesce(v_ad_work.photo_proof_needed, false)
    or coalesce(v_ad_work.audio_video_proof_needed, false)
    or coalesce(v_ad_work.area_update_needed, false)
    or coalesce(v_ad_work.final_report_needed, false);

  if p_status = 'ready_for_execution' then
    if v_ad_work.start_date is null then
      raise exception 'Planned dates are required before Ready for Execution' using errcode = '22000';
    end if;

    if nullif(trim(coalesce(v_ad_work.areas_to_cover, '')), '') is null then
      raise exception 'Areas to cover are required before Ready for Execution' using errcode = '22000';
    end if;

    if coalesce(v_vehicle.mic_system_available, v_vehicle.mic_available, false) is false then
      raise exception 'Mic System is required before Ready for Execution' using errcode = '22000';
    end if;

    if coalesce(v_ad_work.package_interest, 'not_sure') = 'not_sure' then
      raise exception 'Package is required before Ready for Execution' using errcode = '22000';
    end if;

    if v_proof_selected is false then
      raise exception 'Proof plan is required before Ready for Execution' using errcode = '22000';
    end if;
  end if;

  insert into public.ad_work_assignments (
    ad_work_id,
    driver_id,
    vehicle_id,
    status,
    assignment_note,
    readiness_warnings,
    warning_confirmation,
    updated_at
  )
  values (
    p_ad_work_id,
    p_driver_id,
    p_vehicle_id,
    p_status,
    nullif(trim(coalesce(p_assignment_note, '')), ''),
    coalesce(p_readiness_warnings, '{}'),
    p_warning_confirmation,
    now()
  )
  on conflict on constraint ad_work_assignments_ad_work_id_key do update
  set driver_id = excluded.driver_id,
      vehicle_id = excluded.vehicle_id,
      status = excluded.status,
      assignment_note = excluded.assignment_note,
      readiness_warnings = excluded.readiness_warnings,
      warning_confirmation = excluded.warning_confirmation,
      updated_at = now()
  returning id into v_assignment_id;

  update public.ad_works
  set assignment_status = p_status,
      assignment_note = nullif(trim(coalesce(p_assignment_note, '')), ''),
      assignment_updated_at = now(),
      updated_at = now()
  where id = p_ad_work_id;

  return query
  select
    v_assignment_id,
    p_ad_work_id,
    p_driver_id,
    p_vehicle_id,
    p_status,
    case
      when p_status = 'ready_for_execution' then 'Ad Work is Ready for Execution.'
      else 'Assignment saved.'
    end;
end;
$$;

revoke all on function public.assign_driver_vehicle_to_ad_work(uuid, uuid, uuid, text, text, text[], boolean) from public;
grant execute on function public.assign_driver_vehicle_to_ad_work(uuid, uuid, uuid, text, text, text[], boolean) to authenticated;
