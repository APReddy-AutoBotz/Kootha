-- M30 fix: six functions that were created successfully but failed when called.
--
-- Each one RETURNS TABLE with a column such as ad_work_id, status or driver_id,
-- and its body also uses that name as a plain table column in a WHERE, SET or
-- ON CONFLICT clause. PL/pgSQL parses a statement only when it first runs, so
-- the functions installed cleanly and then raised 42702 "column reference is
-- ambiguous" on the first real call. In practice an admin could not prepare a
-- Final Proof Summary, close an Ad Work, mark a summary shared or stop Phone
-- Location Proof.
--
-- "#variable_conflict use_column" resolves each of those names to the table
-- column, which is what every flagged statement means. The bodies are
-- otherwise copied unchanged from the migration named above each function.
-- Found by the end-to-end flow check and scripts/sql/plpgsql-check.sql.
set search_path = public;

-- review_driver_application: broke approving an application whose vehicle number already exists.
-- Body from 20260630040000_m4_driver_vehicle_onboarding.sql.
create or replace function public.review_driver_application(
  p_application_id uuid,
  p_status text,
  p_admin_note text default null,
  p_follow_up_date date default null,
  p_rejection_reason text default null,
  p_approval_note text default null
)
returns table(application_id uuid, driver_id uuid, vehicle_id uuid, duplicate_found boolean, result_message text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_application public.driver_applications%rowtype;
  v_driver_id uuid;
  v_vehicle_id uuid;
  v_duplicate boolean := false;
  v_service_areas text[];
  v_has_vehicle boolean;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if p_status not in ('new', 'under_review', 'approved', 'needs_more_info', 'rejected', 'duplicate') then
    raise exception 'Invalid application status' using errcode = '22000';
  end if;

  select * into v_application
  from public.driver_applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'Driver application not found' using errcode = 'P0002';
  end if;

  update public.driver_applications
  set status = p_status,
      admin_note = nullif(trim(coalesce(p_admin_note, '')), ''),
      follow_up_date = p_follow_up_date,
      rejection_reason = case when p_status = 'rejected' then nullif(trim(coalesce(p_rejection_reason, '')), '') else rejection_reason end,
      approval_note = case when p_status = 'approved' then nullif(trim(coalesce(p_approval_note, '')), '') else approval_note end,
      updated_at = now()
  where id = p_application_id
  returning * into v_application;

  if p_status = 'approved' then
    select id into v_driver_id
    from public.drivers
    where trim(phone) = trim(v_application.phone)
    limit 1;

    if nullif(trim(coalesce(v_application.service_areas, '')), '') is null then
      v_service_areas := '{}';
    else
      select array_agg(trim(value)) into v_service_areas
      from unnest(string_to_array(v_application.service_areas, ',')) as value
      where nullif(trim(value), '') is not null;
    end if;

    if v_driver_id is null then
      insert into public.drivers (
        source_application_id,
        name,
        phone,
        city,
        service_areas,
        approval_status,
        availability_status,
        onboarding_status,
        availability_status_text,
        admin_note
      )
      values (
        v_application.id,
        trim(v_application.driver_name),
        trim(v_application.phone),
        trim(v_application.city),
        coalesce(v_service_areas, '{}'),
        'approved',
        'not_available',
        'approved',
        'unknown',
        nullif(trim(coalesce(p_approval_note, p_admin_note, '')), '')
      )
      returning id into v_driver_id;
    else
      v_duplicate := true;
      update public.drivers
      set source_application_id = coalesce(source_application_id, v_application.id),
          onboarding_status = 'approved',
          approval_status = 'approved',
          city = coalesce(nullif(trim(city), ''), trim(v_application.city)),
          updated_at = now()
      where id = v_driver_id;
    end if;

    v_has_vehicle := v_application.vehicle_ownership in ('own_vehicle', 'hired_vehicle')
      and nullif(trim(coalesce(v_application.vehicle_number, '')), '') is not null;

    if v_has_vehicle then
      select id into v_vehicle_id
      from public.vehicles
      where lower(trim(vehicle_number)) = lower(trim(v_application.vehicle_number))
      limit 1;

      if v_vehicle_id is null then
        insert into public.vehicles (
          source_application_id,
          driver_id,
          vehicle_number,
          vehicle_type,
          mic_available,
          mic_system_available,
          active,
          city,
          onboarding_status,
          gps_device_available,
          gps_device_status,
          admin_note
        )
        values (
          v_application.id,
          v_driver_id,
          trim(v_application.vehicle_number),
          v_application.vehicle_type,
          v_application.mic_system_available,
          v_application.mic_system_available,
          true,
          trim(v_application.city),
          'approved',
          v_application.gps_device_available,
          case when v_application.gps_device_available = 'yes' then 'installed' else 'none' end,
          nullif(trim(coalesce(p_approval_note, p_admin_note, '')), '')
        )
        returning id into v_vehicle_id;
      else
        v_duplicate := true;
        update public.vehicles
        set source_application_id = coalesce(source_application_id, v_application.id),
            driver_id = coalesce(driver_id, v_driver_id),
            onboarding_status = 'approved',
            active = true,
            updated_at = now()
        where id = v_vehicle_id;
      end if;
    end if;

    update public.driver_applications
    set linked_driver_id = v_driver_id,
        linked_vehicle_id = v_vehicle_id,
        updated_at = now()
    where id = v_application.id;
  end if;

  return query
  select
    v_application.id,
    v_driver_id,
    v_vehicle_id,
    v_duplicate,
    case
      when p_status = 'approved' and v_duplicate then 'Existing driver or vehicle linked.'
      when p_status = 'approved' then 'Driver application approved.'
      else 'Driver application updated.'
    end;
end;
$$;

-- admin_stop_mobile_tracking: broke an admin stopping Phone Location Proof.
-- Body from 20260701090000_m9_mobile_gps_tracking_foundation.sql.
create or replace function public.admin_stop_mobile_tracking(p_tracking_session_id uuid)
returns table(tracking_session_id uuid, status text, stop_reason text, result_message text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  update public.tracking_sessions
  set status = 'stopped',
      ended_at = now(),
      stopped_by = 'admin',
      stop_reason = 'admin_stopped',
      updated_at = now()
  where id = p_tracking_session_id
    and status in ('not_started', 'running', 'paused', 'failed', 'permission_missing');

  if not found then
    raise exception 'Location Proof session not found' using errcode = 'P0002';
  end if;

  return query select p_tracking_session_id, 'stopped'::text, 'admin_stopped'::text, 'Location Proof stopped.'::text;
end;
$$;

-- mark_final_summary_shared: broke marking the Final Proof Summary as shared.
-- Body from 20260701080000_m8_final_proof_summary_campaign_closure.sql.
create or replace function public.mark_final_summary_shared(
  p_ad_work_id uuid,
  p_share_method text,
  p_share_note text default null
)
returns table(ad_work_id uuid, final_summary_id uuid, shared_status text, result_message text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_summary_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if p_share_method not in ('manual_whatsapp', 'manual_sms', 'phone_call', 'printed_copy', 'in_person', 'other') then
    raise exception 'Invalid share method' using errcode = '22000';
  end if;

  update public.ad_works
  set final_summary_shared_status = 'shared_manually',
      final_summary_shared_method = p_share_method,
      final_summary_shared_at = now(),
      final_summary_shared_by = auth.uid(),
      final_summary_shared_note = nullif(trim(coalesce(p_share_note, '')), ''),
      updated_at = now()
  where id = p_ad_work_id;

  if not found then
    raise exception 'Ad Work not found' using errcode = 'P0002';
  end if;

  update public.final_proof_summaries
  set shared_status = 'shared_manually',
      shared_method = p_share_method,
      shared_at = now(),
      shared_by = auth.uid(),
      shared_note = nullif(trim(coalesce(p_share_note, '')), ''),
      updated_at = now()
  where ad_work_id = p_ad_work_id
  returning id into v_summary_id;

  if v_summary_id is null then
    insert into public.final_proof_summaries (ad_work_id, summary_text, shared_status, shared_method, shared_at, shared_by, shared_note, updated_at)
    values (p_ad_work_id, public.m8_build_final_summary_text(p_ad_work_id), 'shared_manually', p_share_method, now(), auth.uid(), nullif(trim(coalesce(p_share_note, '')), ''), now())
    returning id into v_summary_id;
  end if;

  return query select p_ad_work_id, v_summary_id, 'shared_manually'::text, 'Final Proof Summary marked as shared.'::text;
end;
$$;

-- prepare_final_proof_summary: broke preparing the Final Proof Summary.
-- Body from 20260701120000_m12_location_proof_in_final_summary.sql.
create or replace function public.prepare_final_proof_summary(
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
#variable_conflict use_column
declare
  v_ad_work public.ad_works%rowtype;
  v_summary_id uuid;
  v_summary_text text;
  v_warnings text[] := '{}'::text[];
  v_blocking_warning_count integer := 0;
  v_status text := 'not_ready';
  v_has_assignment boolean := false;
  v_pending_update_count integer := 0;
  v_waiting_proof_count integer := 0;
  v_rejected_proof_count integer := 0;
  v_approved_proof_count integer := 0;
  v_issue_count integer := 0;
  v_incomplete_day_count integer := 0;
  v_day_count integer := 0;
  v_review_status text;
  v_point_count integer := 0;
  v_session_count integer := 0;
  v_started_session_count integer := 0;
  v_first_received_at timestamptz;
  v_last_received_at timestamptz;
  v_pending_sync_count integer := 0;
  v_sync_failure_count integer := 0;
  v_successful_sync_count integer := 0;
  v_location_status text;
  v_active_during_work text := 'not_confirmed';
  v_offline_sync_status text := 'not_available';
  v_include_location boolean := coalesce(p_include_phone_location_proof, false);
  v_customer_note text := nullif(trim(coalesce(p_phone_location_proof_customer_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  perform public.m12_assert_customer_safe_location_note(v_customer_note);

  select * into v_ad_work
  from public.ad_works
  where id = p_ad_work_id
  for update;

  if not found then
    raise exception 'Ad Work not found' using errcode = 'P0002';
  end if;

  select exists (
    select 1 from public.ad_work_assignments assignment
    where assignment.ad_work_id = p_ad_work_id
      and assignment.status = 'ready_for_execution'
  ) into v_has_assignment;

  select review_status into v_review_status
  from public.location_proof_reviews
  where ad_work_id = p_ad_work_id
  limit 1;

  select count(*), min(received_at), max(received_at)
  into v_point_count, v_first_received_at, v_last_received_at
  from public.location_points
  where ad_work_id = p_ad_work_id;

  select
    count(*),
    count(*) filter (where started_at is not null),
    coalesce(sum(client_pending_point_count), 0),
    coalesce(sum(sync_failure_count), 0),
    count(*) filter (where last_successful_sync_at is not null)
  into v_session_count, v_started_session_count, v_pending_sync_count, v_sync_failure_count, v_successful_sync_count
  from public.tracking_sessions
  where ad_work_id = p_ad_work_id
    and tracking_mode = 'phone_location';

  v_location_status := public.m12_final_location_proof_status(v_ad_work.mobile_location_proof_required, v_review_status, v_point_count);

  if v_point_count > 0 or v_started_session_count > 0 then
    v_active_during_work := 'yes';
  elsif coalesce(v_ad_work.mobile_location_proof_required, false) and v_session_count = 0 then
    v_active_during_work := 'no';
  else
    v_active_during_work := 'not_confirmed';
  end if;

  if coalesce(v_ad_work.mobile_location_proof_required, false) is false then
    v_offline_sync_status := 'not_applicable';
  elsif v_pending_sync_count > 0 or v_sync_failure_count > 0 then
    v_offline_sync_status := 'pending';
  elsif v_successful_sync_count > 0 or exists (
    select 1 from public.location_points
    where ad_work_id = p_ad_work_id
      and client_point_id is not null
  ) then
    v_offline_sync_status := 'synced';
  else
    v_offline_sync_status := 'not_available';
  end if;

  if coalesce(v_ad_work.mobile_location_proof_required, false) and v_location_status = 'not_reviewed' then
    v_warnings := array_append(v_warnings, 'Phone Location Proof is not reviewed.');
    v_blocking_warning_count := v_blocking_warning_count + 1;
  end if;

  if coalesce(v_ad_work.mobile_location_proof_required, false) and v_point_count = 0 then
    v_warnings := array_append(v_warnings, 'No phone location updates were received.');
    v_blocking_warning_count := v_blocking_warning_count + 1;
  end if;

  if coalesce(v_ad_work.mobile_location_proof_required, false) and (v_pending_sync_count > 0 or v_sync_failure_count > 0) then
    v_warnings := array_append(v_warnings, 'Some location updates need follow-up.');
    v_blocking_warning_count := v_blocking_warning_count + 1;
  end if;

  if v_include_location and v_location_status = 'not_reviewed' then
    raise exception 'Phone Location Proof must be reviewed before it can be included in the customer summary' using errcode = '22000';
  end if;

  if v_include_location and coalesce(p_phone_location_proof_customer_safe_confirmed, false) is false then
    raise exception 'Confirm customer-safe Phone Location Proof wording before including it' using errcode = '22000';
  end if;

  select
    count(*),
    count(*) filter (where day_row.execution_status <> 'completed'),
    count(*) filter (where day_row.execution_status = 'issue_reported')
  into v_day_count, v_incomplete_day_count, v_issue_count
  from public.ad_work_days day_row
  where day_row.ad_work_id = p_ad_work_id;

  select count(*) into v_waiting_proof_count
  from public.proof_uploads proof
  where proof.ad_work_id = p_ad_work_id
    and proof.upload_status = 'uploaded'
    and proof.review_status in ('waiting_review', 'needs_more_info');

  select count(*) into v_rejected_proof_count
  from public.proof_uploads proof
  where proof.ad_work_id = p_ad_work_id
    and proof.upload_status = 'uploaded'
    and proof.review_status = 'rejected';

  select count(*) into v_approved_proof_count
  from public.proof_uploads proof
  where proof.ad_work_id = p_ad_work_id
    and proof.upload_status = 'uploaded'
    and proof.review_status = 'approved';

  select count(*) into v_pending_update_count
  from public.customer_updates update_row
  where update_row.ad_work_id = p_ad_work_id
    and coalesce(update_row.sharing_status, 'pending_sharing') <> 'shared_manually';

  if not v_has_assignment then
    v_warnings := array_append(v_warnings, 'Ad Work is not assigned.');
  end if;

  if v_ad_work.execution_release_status <> 'released_to_driver' then
    v_warnings := array_append(v_warnings, 'Ad Work was not released to driver.');
  end if;

  if v_day_count = 0 or v_incomplete_day_count > 0 then
    v_warnings := array_append(v_warnings, 'Some planned days are not completed.');
    v_blocking_warning_count := v_blocking_warning_count + 1;
  end if;

  if v_issue_count > 0 then
    v_warnings := array_append(v_warnings, 'Issue Reported and not resolved.');
    v_blocking_warning_count := v_blocking_warning_count + 1;
  end if;

  if v_ad_work.photo_proof_needed and not p_proof_not_required then
    if v_approved_proof_count = 0 then
      v_warnings := array_append(v_warnings, 'Missing Proof.');
      v_blocking_warning_count := v_blocking_warning_count + 1;
    end if;

    if v_waiting_proof_count > 0 then
      v_warnings := array_append(v_warnings, 'Proof is waiting for review.');
      v_blocking_warning_count := v_blocking_warning_count + 1;
    end if;

    if v_rejected_proof_count > 0 then
      v_warnings := array_append(v_warnings, 'Some proof was rejected.');
      v_blocking_warning_count := v_blocking_warning_count + 1;
    end if;
  end if;

  if v_pending_update_count > 0 then
    v_warnings := array_append(v_warnings, 'Customer updates are not marked shared.');
    v_blocking_warning_count := v_blocking_warning_count + 1;
  end if;

  if not p_customer_updates_reviewed then
    v_warnings := array_append(v_warnings, 'Customer update messages are not reviewed.');
  end if;

  if v_ad_work.live_tracking_requested = 'yes' and coalesce(v_ad_work.live_tracking_enabled, false) is false then
    v_warnings := array_append(v_warnings, 'Premium live tracking was requested but not enabled in this MVP.');
  end if;

  if v_ad_work.photo_proof_needed then
    v_warnings := array_append(v_warnings, 'GPS proof is not available in this version.');
  end if;

  if not v_has_assignment or v_ad_work.execution_release_status <> 'released_to_driver' then
    v_status := 'not_ready';
  elsif not p_final_summary_reviewed or not p_customer_updates_reviewed or v_blocking_warning_count > 0 then
    v_status := 'ready_for_review';
  else
    v_status := 'ready_to_close';
  end if;

  update public.ad_works
  set closure_status = v_status,
      final_summary_reviewed = p_final_summary_reviewed,
      closure_internal_admin_note = nullif(trim(coalesce(p_internal_admin_note, '')), ''),
      closure_ready_at = case when v_status = 'ready_to_close' then now() else closure_ready_at end,
      updated_at = now()
  where id = p_ad_work_id;

  insert into public.final_proof_summaries (
    ad_work_id,
    closure_status,
    summary_text,
    warnings,
    reviewed_at,
    reviewed_by,
    ready_at,
    internal_admin_note,
    include_phone_location_proof,
    phone_location_proof_customer_note,
    phone_location_proof_customer_safe_confirmed,
    phone_location_proof_status,
    phone_location_proof_required,
    phone_location_proof_active_during_work,
    phone_location_first_received_at,
    phone_location_last_received_at,
    phone_location_offline_sync_status,
    updated_at
  ) values (
    p_ad_work_id,
    v_status,
    '',
    v_warnings,
    case when p_final_summary_reviewed then now() else null end,
    case when p_final_summary_reviewed then auth.uid() else null end,
    case when v_status = 'ready_to_close' then now() else null end,
    nullif(trim(coalesce(p_internal_admin_note, '')), ''),
    v_include_location,
    v_customer_note,
    coalesce(p_phone_location_proof_customer_safe_confirmed, false),
    v_location_status,
    coalesce(v_ad_work.mobile_location_proof_required, false),
    v_active_during_work,
    v_first_received_at,
    v_last_received_at,
    v_offline_sync_status,
    now()
  ) on conflict (ad_work_id) do update
  set closure_status = excluded.closure_status,
      warnings = excluded.warnings,
      reviewed_at = coalesce(excluded.reviewed_at, public.final_proof_summaries.reviewed_at),
      reviewed_by = coalesce(excluded.reviewed_by, public.final_proof_summaries.reviewed_by),
      ready_at = coalesce(excluded.ready_at, public.final_proof_summaries.ready_at),
      internal_admin_note = excluded.internal_admin_note,
      include_phone_location_proof = excluded.include_phone_location_proof,
      phone_location_proof_customer_note = excluded.phone_location_proof_customer_note,
      phone_location_proof_customer_safe_confirmed = excluded.phone_location_proof_customer_safe_confirmed,
      phone_location_proof_status = excluded.phone_location_proof_status,
      phone_location_proof_required = excluded.phone_location_proof_required,
      phone_location_proof_active_during_work = excluded.phone_location_proof_active_during_work,
      phone_location_first_received_at = excluded.phone_location_first_received_at,
      phone_location_last_received_at = excluded.phone_location_last_received_at,
      phone_location_offline_sync_status = excluded.phone_location_offline_sync_status,
      updated_at = now()
  returning id into v_summary_id;

  v_summary_text := public.m8_build_final_summary_text(p_ad_work_id);

  update public.final_proof_summaries
  set summary_text = v_summary_text,
      updated_at = now()
  where id = v_summary_id;

  return query select p_ad_work_id, v_summary_id, v_status, v_warnings, v_summary_text, 'Final Proof Summary saved.'::text;
end;
$$;

-- close_ad_work_with_final_summary: broke closing an Ad Work.
-- Body from 20260701120000_m12_location_proof_in_final_summary.sql.
create or replace function public.close_ad_work_with_final_summary(
  p_ad_work_id uuid,
  p_closure_reason text default null,
  p_closure_note text default null,
  p_customer_accepted text default 'not_confirmed',
  p_internal_admin_note text default null,
  p_proof_not_required boolean default false,
  p_customer_updates_reviewed boolean default false,
  p_include_phone_location_proof boolean default false,
  p_phone_location_proof_customer_note text default null,
  p_phone_location_proof_customer_safe_confirmed boolean default false
)
returns table(ad_work_id uuid, final_summary_id uuid, closure_status text, warnings text[], result_message text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_ad_work public.ad_works%rowtype;
  v_prepare record;
  v_summary_id uuid;
  v_status text := 'closed';
  v_standard_blocking_warning_count integer := 0;
  v_location_blocking_warning_count integer := 0;
  v_warning text;
  v_customer_note text := nullif(trim(coalesce(p_phone_location_proof_customer_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if p_closure_reason is not null and p_closure_reason not in ('rain_local_issue', 'customer_accepted_partial_work', 'driver_issue_resolved_manually', 'proof_not_required_by_customer', 'other') then
    raise exception 'Invalid closure reason' using errcode = '22000';
  end if;

  if p_customer_accepted not in ('yes', 'no', 'not_confirmed') then
    raise exception 'Invalid customer accepted value' using errcode = '22000';
  end if;

  perform public.m12_assert_customer_safe_location_note(v_customer_note);

  select * into v_ad_work
  from public.ad_works
  where id = p_ad_work_id
  for update;

  if not found then
    raise exception 'Ad Work not found' using errcode = 'P0002';
  end if;

  if not v_ad_work.final_summary_reviewed then
    raise exception 'Final Proof Summary must be reviewed before closure' using errcode = '22000';
  end if;

  if not p_customer_updates_reviewed then
    raise exception 'Customer update messages must be reviewed before closure' using errcode = '22000';
  end if;

  select * into v_prepare
  from public.prepare_final_proof_summary(
    p_ad_work_id,
    true,
    p_proof_not_required,
    true,
    p_internal_admin_note,
    p_include_phone_location_proof,
    v_customer_note,
    p_phone_location_proof_customer_safe_confirmed
  )
  limit 1;

  if v_prepare.closure_status = 'not_ready' then
    raise exception 'Ad Work is not ready for closure' using errcode = '22000';
  end if;

  foreach v_warning in array v_prepare.warnings loop
    if v_warning in ('Some planned days are not completed.', 'Issue Reported and not resolved.', 'Missing Proof.', 'Proof is waiting for review.', 'Some proof was rejected.', 'Customer updates are not marked shared.') then
      v_standard_blocking_warning_count := v_standard_blocking_warning_count + 1;
    elsif v_warning in ('Phone Location Proof is not reviewed.', 'No phone location updates were received.', 'Some location updates need follow-up.') then
      v_location_blocking_warning_count := v_location_blocking_warning_count + 1;
    end if;
  end loop;

  if v_standard_blocking_warning_count > 0 and nullif(trim(coalesce(p_closure_reason, '')), '') is null then
    raise exception 'Closure Reason is required when warnings remain' using errcode = '22000';
  end if;

  if v_location_blocking_warning_count > 0 and nullif(trim(coalesce(p_closure_reason, '')), '') is null then
    raise exception 'Closure Reason is required when location proof warnings remain' using errcode = '22000';
  end if;

  if v_standard_blocking_warning_count + v_location_blocking_warning_count > 0 then
    v_status := 'closed_with_issues';
  end if;

  update public.ad_works
  set closure_status = v_status,
      closure_reason = nullif(trim(coalesce(p_closure_reason, '')), ''),
      closure_note = nullif(trim(coalesce(p_closure_note, '')), ''),
      closure_customer_accepted = p_customer_accepted,
      closure_internal_admin_note = nullif(trim(coalesce(p_internal_admin_note, '')), ''),
      closure_closed_at = now(),
      closure_closed_by = auth.uid(),
      updated_at = now()
  where id = p_ad_work_id;

  update public.final_proof_summaries
  set closure_status = v_status,
      summary_text = public.m8_build_final_summary_text(p_ad_work_id),
      warnings = v_prepare.warnings,
      closed_at = now(),
      closed_by = auth.uid(),
      closure_reason = nullif(trim(coalesce(p_closure_reason, '')), ''),
      closure_note = nullif(trim(coalesce(p_closure_note, '')), ''),
      customer_accepted = p_customer_accepted,
      internal_admin_note = nullif(trim(coalesce(p_internal_admin_note, '')), ''),
      updated_at = now()
  where ad_work_id = p_ad_work_id
  returning id into v_summary_id;

  return query select p_ad_work_id, v_summary_id, v_status, v_prepare.warnings, 'Ad Work closed.'::text;
end;
$$;

-- prepare_flexible_final_proof_summary: broke preparing the Final Proof Summary for team-managed work.
-- Body from 20260711020000_flexible_execution_and_closure.sql.
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
#variable_conflict use_column
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
