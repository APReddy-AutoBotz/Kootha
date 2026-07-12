-- Compatibility wrappers for flexible driver, vehicle, execution, and warning-only closure flows.
create or replace function public.release_flexible_ad_work_to_driver(
  p_ad_work_id uuid,
  p_plain_work_code text default null,
  p_revoke boolean default false
)
returns table(ad_work_id uuid, work_access_code text, work_access_code_hint text, release_status text, result_message text)
language plpgsql
security definer
set search_path = public
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
  select * into v_ad_work from public.ad_works where id = p_ad_work_id for update;
  if not found then raise exception 'Ad Work not found' using errcode = 'P0002'; end if;
  if v_ad_work.execution_mode <> 'driver_app' or not v_ad_work.driver_required then raise exception 'This work does not use the driver app' using errcode = '22000'; end if;

  if p_revoke then
    update public.ad_works set execution_release_status = 'access_revoked', work_access_code_hash = null, work_access_code_hint = null, work_access_revoked_at = now(), updated_at = now() where id = p_ad_work_id;
    return query select p_ad_work_id, null::text, null::text, 'access_revoked'::text, 'Work access revoked.'::text;
    return;
  end if;

  select * into v_assignment from public.ad_work_assignments where ad_work_assignments.ad_work_id = p_ad_work_id;
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

  v_code := upper(regexp_replace(coalesce(nullif(trim(p_plain_work_code), ''), substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 8)), '[^A-Za-z0-9]', '', 'g'));
  if length(v_code) < 4 then raise exception 'Work access code must have at least 4 letters or numbers' using errcode = '22000'; end if;
  v_hint := right(v_code, 4);
  update public.ad_works set execution_release_status = 'released_to_driver', execution_overall_status = 'not_started', work_access_code_hash = public.m6_hash_work_code(v_code), work_access_code_hint = v_hint, work_access_code_created_at = now(), work_access_revoked_at = null, updated_at = now() where id = p_ad_work_id;
  update public.ad_work_days set execution_status = 'ready', execution_updated_at = now(), driver_id = v_assignment.driver_id, vehicle_id = v_assignment.vehicle_id where ad_work_id = p_ad_work_id and execution_status = 'planned';
  return query select p_ad_work_id, v_code, v_hint, 'released_to_driver'::text, 'Work sent to driver.'::text;
end;
$$;

revoke all on function public.release_flexible_ad_work_to_driver(uuid, text, boolean) from public;
grant execute on function public.release_flexible_ad_work_to_driver(uuid, text, boolean) to authenticated;

drop function if exists public.driver_get_assigned_work(text, text);
create function public.driver_get_assigned_work(p_mobile text, p_work_code text)
returns table(
  ad_work_id uuid, ad_work_day_id uuid, assignment_id uuid, driver_id uuid, vehicle_id uuid,
  business_name text, city text, areas_to_cover text, advertisement_details text,
  planned_date date, planned_start_time time, planned_end_time time, execution_status text,
  vehicle_number text, special_instructions text, mobile_location_proof_required boolean,
  mobile_location_proof_note text, mobile_location_tracking_mode text, mobile_tracking_session_id uuid,
  mobile_tracking_status text, mobile_location_point_count integer, mobile_last_location_update_at timestamptz,
  mobile_tracking_health_status text, mobile_pending_point_count integer,
  mobile_last_successful_sync_at timestamptz, mobile_last_capture_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare v_ad_work public.ad_works%rowtype;
begin
  select aw.* into v_ad_work
  from public.ad_works aw
  join public.ad_work_assignments assignment on assignment.ad_work_id = aw.id
  join public.drivers driver_record on driver_record.id = assignment.driver_id
  where aw.execution_mode = 'driver_app'
    and aw.execution_release_status = 'released_to_driver'
    and aw.work_access_code_hash = public.m6_hash_work_code(p_work_code)
    and public.m6_normalize_mobile(driver_record.phone) = public.m6_normalize_mobile(p_mobile)
    and assignment.status = 'ready_for_execution'
  limit 1;
  if not found then raise exception 'Invalid work code or mobile number' using errcode = '42501'; end if;

  return query
  select aw.id, day_row.id, assignment.id, assignment.driver_id, assignment.vehicle_id,
    aw.business_name, aw.city, coalesce(day_row.areas_to_cover, aw.areas_to_cover), aw.advertisement_details,
    day_row.work_date, day_row.planned_start_time, day_row.planned_end_time, day_row.execution_status,
    vehicle_record.vehicle_number, aw.special_instructions, coalesce(aw.mobile_location_proof_required, false),
    aw.mobile_location_proof_note, aw.mobile_location_tracking_mode, session_row.id,
    coalesce(session_row.status::text, 'not_started'), coalesce(session_row.point_count, 0), session_row.last_update_at,
    coalesce(session_row.tracking_health_status, public.m10_tracking_health_status(session_row.status, session_row.client_pending_point_count, session_row.last_update_at, session_row.sync_failure_count), 'stopped'),
    coalesce(session_row.client_pending_point_count, 0), session_row.last_successful_sync_at, session_row.client_last_capture_at
  from public.ad_works aw
  join public.ad_work_assignments assignment on assignment.ad_work_id = aw.id
  left join public.vehicles vehicle_record on vehicle_record.id = assignment.vehicle_id
  join public.ad_work_days day_row on day_row.ad_work_id = aw.id
  left join lateral (
    select tracking.* from public.tracking_sessions tracking
    where tracking.ad_work_day_id = day_row.id and tracking.driver_id = assignment.driver_id and tracking.tracking_mode = 'phone_location'
    order by tracking.updated_at desc, tracking.created_at desc limit 1
  ) session_row on true
  where aw.id = v_ad_work.id order by day_row.work_date asc;
end;
$$;

revoke all on function public.driver_get_assigned_work(text, text) from public;
grant execute on function public.driver_get_assigned_work(text, text) to anon, authenticated;

create or replace function public.prepare_flexible_final_proof_summary(
  p_ad_work_id uuid,
  p_final_summary_reviewed boolean default false,
  p_proof_not_required boolean default false,
  p_customer_updates_reviewed boolean default false,
  p_internal_admin_note text default null,
  p_include_phone_location_proof boolean default false,
  p_phone_location_proof_customer_note text default null,
  p_phone_location_proof_customer_safe_confirmed boolean default false
)
returns table(ad_work_id uuid, final_summary_id uuid, closure_status text, warnings text[], summary_text text, result_message text)
language plpgsql
security definer
set search_path = public
as $$
declare v_ad_work public.ad_works%rowtype; v_result record; v_status text;
begin
  if not public.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  select * into v_ad_work from public.ad_works where id = p_ad_work_id;
  select * into v_result from public.prepare_final_proof_summary(p_ad_work_id, p_final_summary_reviewed, p_proof_not_required, p_customer_updates_reviewed, p_internal_admin_note, p_include_phone_location_proof, p_phone_location_proof_customer_note, p_phone_location_proof_customer_safe_confirmed) limit 1;
  if v_ad_work.execution_mode = 'admin_managed' then
    v_status := case when p_final_summary_reviewed and p_customer_updates_reviewed then 'ready_to_close' else 'ready_for_review' end;
    update public.ad_works set closure_status = v_status, final_summary_reviewed = p_final_summary_reviewed, closure_ready_at = case when v_status = 'ready_to_close' then now() else closure_ready_at end, updated_at = now() where id = p_ad_work_id;
    update public.final_proof_summaries set closure_status = v_status, ready_at = case when v_status = 'ready_to_close' then now() else ready_at end, updated_at = now() where ad_work_id = p_ad_work_id;
    v_result.closure_status := v_status;
  end if;
  return query select v_result.ad_work_id, v_result.final_summary_id, v_result.closure_status, v_result.warnings, v_result.summary_text, v_result.result_message;
end;
$$;

create or replace function public.close_flexible_ad_work_with_final_summary(
  p_ad_work_id uuid, p_closure_reason text default null, p_closure_note text default null,
  p_customer_accepted text default 'not_confirmed', p_internal_admin_note text default null,
  p_proof_not_required boolean default false, p_customer_updates_reviewed boolean default false,
  p_include_phone_location_proof boolean default false, p_phone_location_proof_customer_note text default null,
  p_phone_location_proof_customer_safe_confirmed boolean default false
)
returns table(ad_work_id uuid, final_summary_id uuid, closure_status text, warnings text[], result_message text)
language plpgsql
security definer
set search_path = public
as $$
declare v_ad_work public.ad_works%rowtype; v_result record; v_prepare record; v_status text;
begin
  if not public.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  select * into v_ad_work from public.ad_works where id = p_ad_work_id for update;
  if v_ad_work.execution_mode = 'driver_app' then
    return query select * from public.close_ad_work_with_final_summary(p_ad_work_id, p_closure_reason, p_closure_note, p_customer_accepted, p_internal_admin_note, p_proof_not_required, p_customer_updates_reviewed, p_include_phone_location_proof, p_phone_location_proof_customer_note, p_phone_location_proof_customer_safe_confirmed);
    return;
  end if;
  select * into v_prepare from public.prepare_flexible_final_proof_summary(p_ad_work_id, true, p_proof_not_required, true, p_internal_admin_note, p_include_phone_location_proof, p_phone_location_proof_customer_note, p_phone_location_proof_customer_safe_confirmed) limit 1;
  v_status := case when coalesce(array_length(v_prepare.warnings, 1), 0) > 0 then 'closed_with_issues' else 'closed' end;
  update public.ad_works set closure_status = v_status, closure_reason = nullif(trim(coalesce(p_closure_reason, '')), ''), closure_note = nullif(trim(coalesce(p_closure_note, '')), ''), closure_customer_accepted = p_customer_accepted, closure_internal_admin_note = nullif(trim(coalesce(p_internal_admin_note, '')), ''), closure_closed_at = now(), closure_closed_by = auth.uid(), updated_at = now() where id = p_ad_work_id;
  update public.final_proof_summaries set closure_status = v_status, warnings = v_prepare.warnings, closed_at = now(), closed_by = auth.uid(), closure_reason = nullif(trim(coalesce(p_closure_reason, '')), ''), closure_note = nullif(trim(coalesce(p_closure_note, '')), ''), customer_accepted = p_customer_accepted, internal_admin_note = nullif(trim(coalesce(p_internal_admin_note, '')), ''), updated_at = now() where ad_work_id = p_ad_work_id returning id into v_result;
  return query select p_ad_work_id, (select id from public.final_proof_summaries where final_proof_summaries.ad_work_id = p_ad_work_id), v_status, v_prepare.warnings, 'Ad Work closed.'::text;
end;
$$;

revoke all on function public.prepare_flexible_final_proof_summary(uuid, boolean, boolean, boolean, text, boolean, text, boolean) from public;
grant execute on function public.prepare_flexible_final_proof_summary(uuid, boolean, boolean, boolean, text, boolean, text, boolean) to authenticated;
revoke all on function public.close_flexible_ad_work_with_final_summary(uuid, text, text, text, text, boolean, boolean, boolean, text, boolean) from public;
grant execute on function public.close_flexible_ad_work_with_final_summary(uuid, text, text, text, text, boolean, boolean, boolean, text, boolean) to authenticated;
