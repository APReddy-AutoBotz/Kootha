-- M28 release regression closure: the retained release RPC RETURNS TABLE includes an
-- output variable named ad_work_id, so work-day predicates must qualify the table
-- column to avoid PL/pgSQL 42702 ambiguity.
set search_path = public;

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

  update public.ad_work_days as day_row
  set execution_status = 'ready',
      execution_updated_at = now(),
      driver_id = v_assignment.driver_id,
      vehicle_id = v_assignment.vehicle_id
  where day_row.ad_work_id = p_ad_work_id
    and day_row.execution_status = 'planned';

  return query
  select p_ad_work_id, v_code, v_hint, 'released_to_driver'::text, 'Work sent to driver.'::text;
end;
$$;

revoke all on function public.release_flexible_ad_work_to_driver(uuid, text, boolean) from public;
grant execute on function public.release_flexible_ad_work_to_driver(uuid, text, boolean) to authenticated;
