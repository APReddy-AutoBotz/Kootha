-- M28 final active-authority closure: keep the actual Admin UI assignment/release
-- RPCs on the canonical M21 lock-before-row order and distinguish assignment-only
-- cancellation from authoritative whole-work cancellation.
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

  -- assignment_status='cancelled' is also a valid assignment-only lifecycle state
  -- and must not freeze an otherwise active Ad Work. Whole-work cancellation is
  -- derived only from parent planning/execution/closure or M28 cancellation metadata.
  if coalesce(v_parent_cancelled, false) then
    raise exception 'Cancelled Ad Work assignments are immutable outside governed cancellation authority'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.m28_guard_cancelled_assignment_write_v1()
  from public, anon, authenticated, service_role;

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
set search_path = pg_catalog, public
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

  -- M21 assignment-history and M28 commercial/schedule mutations serialize on
  -- this same transaction lock. Acquire it before the parent or assignment row.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('m21-authority-global', 2100)
  );

  select * into v_ad_work
  from public.ad_works
  where id = p_ad_work_id
  for update;
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

  select * into v_existing
  from public.ad_work_assignments
  where ad_work_assignments.ad_work_id = p_ad_work_id
  for update;
  if found and (v_existing.driver_id is distinct from p_driver_id or v_existing.vehicle_id is distinct from p_vehicle_id) and not p_change_confirmed then
    raise exception 'Confirm the assignment change' using errcode = '22000';
  end if;

  insert into public.ad_work_assignments (
    ad_work_id, driver_id, vehicle_id, status, assignment_note,
    readiness_warnings, warning_confirmation, updated_at
  )
  values (
    p_ad_work_id, p_driver_id, p_vehicle_id, 'ready_for_execution',
    nullif(trim(coalesce(p_assignment_note, '')), ''),
    coalesce(p_readiness_warnings, '{}'), p_change_confirmed, now()
  )
  on conflict on constraint ad_work_assignments_ad_work_id_key do update set
    driver_id = excluded.driver_id,
    vehicle_id = excluded.vehicle_id,
    status = 'ready_for_execution',
    assignment_note = excluded.assignment_note,
    readiness_warnings = excluded.readiness_warnings,
    warning_confirmation = excluded.warning_confirmation,
    updated_at = now()
  returning id into v_assignment_id;

  update public.ad_works
  set assignment_status = 'ready_for_execution',
      assignment_note = nullif(trim(coalesce(p_assignment_note, '')), ''),
      assignment_updated_at = now(),
      updated_at = now()
  where id = p_ad_work_id;

  return query
  select v_assignment_id, 'ready_for_execution'::text, 'People and equipment saved.'::text;
end;
$$;

revoke all on function public.save_ad_work_assignment(uuid, uuid, uuid, text, text[], boolean) from public;
grant execute on function public.save_ad_work_assignment(uuid, uuid, uuid, text, text[], boolean) to authenticated;

create or replace function public.release_flexible_ad_work_to_driver(
  p_ad_work_id uuid,
  p_plain_work_code text default null,
  p_revoke boolean default false
)
returns table(ad_work_id uuid, work_access_code text, work_access_code_hint text, release_status text, result_message text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ad_work public.ad_works%rowtype;
  v_assignment public.ad_work_assignments%rowtype;
  v_driver public.drivers%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_code text;
  v_hint text;
begin
  if not public.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;

  -- Release history, execution-day readiness and M28 mutations all share the M21
  -- authority lock. Take it before the parent row to avoid an inverse lock cycle.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('m21-authority-global', 2100)
  );

  select * into v_ad_work
  from public.ad_works
  where id = p_ad_work_id
  for update;
  if not found then raise exception 'Ad Work not found' using errcode = 'P0002'; end if;
  if v_ad_work.execution_mode <> 'driver_app' or not v_ad_work.driver_required then raise exception 'This work does not use the driver app' using errcode = '22000'; end if;

  if p_revoke then
    update public.ad_works
    set execution_release_status = 'access_revoked',
        work_access_code_hash = null,
        work_access_code_hint = null,
        work_access_revoked_at = now(),
        updated_at = now()
    where id = p_ad_work_id;
    return query select p_ad_work_id, null::text, null::text, 'access_revoked'::text, 'Work access revoked.'::text;
    return;
  end if;

  select * into v_assignment
  from public.ad_work_assignments
  where ad_work_assignments.ad_work_id = p_ad_work_id;
  if not found or v_assignment.status <> 'ready_for_execution' then raise exception 'Choose an approved driver before sending work' using errcode = '22000'; end if;

  select * into v_driver from public.drivers where id = v_assignment.driver_id;
  if not found or v_driver.approval_status <> 'approved' or coalesce(v_driver.onboarding_status, 'pending_review') <> 'approved' then raise exception 'Choose an approved driver' using errcode = '22000'; end if;

  if v_ad_work.vehicle_required then
    if v_assignment.vehicle_id is null then raise exception 'Choose an approved vehicle' using errcode = '22000'; end if;
    select * into v_vehicle from public.vehicles where id = v_assignment.vehicle_id;
    if not found or coalesce(v_vehicle.onboarding_status, 'pending_review') <> 'approved' or not coalesce(v_vehicle.active, false) then raise exception 'Choose an approved vehicle' using errcode = '22000'; end if;
    if v_ad_work.speaker_required and not coalesce(v_vehicle.mic_system_available, v_vehicle.mic_available, false) then raise exception 'Choose a vehicle with speaker equipment' using errcode = '22000'; end if;
  end if;

  if v_ad_work.start_date is null then raise exception 'Add a start date before sending work' using errcode = '22000'; end if;
  if v_ad_work.areas_required and nullif(trim(coalesce(v_ad_work.areas_to_cover, '')), '') is null then raise exception 'Add the work areas before sending work' using errcode = '22000'; end if;

  v_code := upper(regexp_replace(
    coalesce(nullif(trim(p_plain_work_code), ''), substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 8)),
    '[^A-Za-z0-9]', '', 'g'
  ));
  if length(v_code) < 4 then raise exception 'Work access code must have at least 4 letters or numbers' using errcode = '22000'; end if;
  v_hint := right(v_code, 4);

  update public.ad_works
  set execution_release_status = 'released_to_driver',
      execution_overall_status = 'not_started',
      work_access_code_hash = public.m6_hash_work_code(v_code),
      work_access_code_hint = v_hint,
      work_access_code_created_at = now(),
      work_access_revoked_at = null,
      updated_at = now()
  where id = p_ad_work_id;

  update public.ad_work_days
  set execution_status = 'ready',
      execution_updated_at = now(),
      driver_id = v_assignment.driver_id,
      vehicle_id = v_assignment.vehicle_id
  where ad_work_id = p_ad_work_id
    and execution_status = 'planned';

  return query
  select p_ad_work_id, v_code, v_hint, 'released_to_driver'::text, 'Work sent to driver.'::text;
end;
$$;

revoke all on function public.release_flexible_ad_work_to_driver(uuid, text, boolean) from public;
grant execute on function public.release_flexible_ad_work_to_driver(uuid, text, boolean) to authenticated;
