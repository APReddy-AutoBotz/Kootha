-- M30: use the business calendar and readable times.
--
-- 1. The database runs in UTC, so current_date is a day behind between
--    midnight and 05:30 in India. Three driver checks compared a work day with
--    current_date and refused Start Location Proof, Upload Photo Proof and the
--    photo upload itself for that day's work during those hours. They now use
--    public.m30_business_date().
-- 2. The Final Proof Summary text printed dates and times by casting to text,
--    for example "2026-11-13 18:01:25.131992+00". It is copied to customers,
--    so it now prints "13 Nov 2026, 11:31 PM" in the business time zone.
--
-- The three driver functions and the summary function are otherwise copied
-- unchanged from the migration named above each one.
set search_path = public;

-- One place to change if the business ever runs outside India.
create or replace function public.m30_business_time_zone()
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select 'Asia/Kolkata'::text;
$$;

create or replace function public.m30_business_date()
returns date
language sql
stable
set search_path = pg_catalog, public
as $$
  select (pg_catalog.now() at time zone public.m30_business_time_zone())::date;
$$;

create or replace function public.m30_format_business_time(p_value timestamptz)
returns text
language sql
stable
set search_path = pg_catalog, public
as $$
  select pg_catalog.to_char(p_value at time zone public.m30_business_time_zone(), 'DD Mon YYYY, HH12:MI AM');
$$;

create or replace function public.m30_format_date(p_value date)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select pg_catalog.to_char(p_value::timestamp, 'DD Mon YYYY');
$$;

create or replace function public.m30_format_time(p_value time)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select pg_catalog.to_char(p_value::interval, 'HH12:MI AM');
$$;

-- is_valid_proof_upload_path: compare with the business date.
-- Body from 20260701070000_m7_proof_upload_customer_update_sharing.sql.
create or replace function public.is_valid_proof_upload_path(p_bucket text, p_path text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.proof_uploads proof
    join public.ad_work_days day_record on day_record.id = proof.ad_work_day_id
    where proof.file_bucket = p_bucket
      and proof.file_path = p_path
      and proof.upload_status = 'pending_upload'
      and proof.review_status = 'waiting_review'
      and day_record.work_date = public.m30_business_date()
      and day_record.execution_status in ('running', 'on_break')
  );
$$;

-- driver_start_mobile_tracking: compare with the business date.
-- Body from 20260823154500_m29_phone_permission_missing_rpc_ambiguity_closure.sql.
create or replace function public.driver_start_mobile_tracking(
  p_mobile text,
  p_work_code text,
  p_ad_work_day_id uuid,
  p_driver_consent boolean
)
returns table(tracking_session_id uuid, status text, point_count integer, result_message text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ad_work public.ad_works%rowtype;
  v_assignment public.ad_work_assignments%rowtype;
  v_day public.ad_work_days%rowtype;
  v_driver public.drivers%rowtype;
  v_session public.tracking_sessions%rowtype;
  v_session_id uuid;
begin
  if coalesce(p_driver_consent, false) is false then
    raise exception 'Location proof consent is required' using errcode = '42501';
  end if;

  select aw.* into v_ad_work
  from public.ad_works as aw
  join public.ad_work_assignments as assignment
    on assignment.ad_work_id = aw.id
  join public.drivers as driver_record
    on driver_record.id = assignment.driver_id
  where aw.execution_release_status = 'released_to_driver'
    and aw.work_access_code_hash = public.m6_hash_work_code(p_work_code)
    and public.m6_normalize_mobile(driver_record.phone) = public.m6_normalize_mobile(p_mobile)
    and assignment.status = 'ready_for_execution'
  limit 1;

  if not found then
    raise exception 'Invalid work code or mobile number' using errcode = '42501';
  end if;

  select assignment.* into v_assignment
  from public.ad_work_assignments as assignment
  where assignment.ad_work_id = v_ad_work.id
    and assignment.status = 'ready_for_execution';

  select driver_record.* into v_driver
  from public.drivers as driver_record
  where driver_record.id = v_assignment.driver_id;

  select day_row.* into v_day
  from public.ad_work_days as day_row
  where day_row.id = p_ad_work_day_id
    and day_row.ad_work_id = v_ad_work.id
  for update;

  if not found then
    raise exception 'Work day not found' using errcode = 'P0002';
  end if;

  if coalesce(v_ad_work.mobile_location_proof_required, false) is false then
    raise exception 'Phone Location Proof is not required for this work' using errcode = '22000';
  end if;

  if v_day.execution_status <> 'running' then
    raise exception 'Location Proof starts only during work' using errcode = '22000';
  end if;

  if v_day.work_date <> public.m30_business_date() then
    raise exception 'Location Proof is available only for today''s work' using errcode = '22000';
  end if;

  if coalesce(v_ad_work.closure_status, 'not_ready') in ('closed', 'closed_with_issues', 'cancelled')
    or coalesce(v_ad_work.execution_overall_status, 'not_started') in ('completed', 'cancelled') then
    raise exception 'Location Proof is not available after work is closed' using errcode = '22000';
  end if;

  select session_row.* into v_session
  from public.tracking_sessions as session_row
  where session_row.ad_work_id = v_ad_work.id
    and session_row.ad_work_day_id = v_day.id
    and session_row.driver_id = v_assignment.driver_id
    and session_row.tracking_mode = 'phone_location'
    and session_row.status in ('not_started', 'running', 'paused', 'failed', 'permission_missing')
  order by session_row.updated_at desc, session_row.created_at desc
  limit 1
  for update;

  if found then
    update public.tracking_sessions as session_row
    set status = 'running',
        started_at = coalesce(session_row.started_at, now()),
        ended_at = null,
        stopped_by = null,
        stop_reason = null,
        tracking_health_status = public.m10_tracking_health_status(
          'running'::public.tracking_session_status,
          session_row.client_pending_point_count,
          session_row.last_update_at,
          session_row.sync_failure_count
        ),
        quality_status = case
          when session_row.point_count > 0 then session_row.quality_status
          else 'unknown'::public.location_quality
        end,
        updated_at = now()
    where session_row.id = v_session.id
    returning session_row.id into v_session_id;
  else
    insert into public.tracking_sessions (
      ad_work_id,
      ad_work_day_id,
      assignment_id,
      driver_id,
      vehicle_id,
      source_type,
      tracking_mode,
      status,
      tracking_health_status,
      started_at,
      point_count,
      quality_status,
      updated_at
    ) values (
      v_ad_work.id,
      v_day.id,
      v_assignment.id,
      v_assignment.driver_id,
      v_assignment.vehicle_id,
      'mobile',
      'phone_location',
      'running',
      'no_recent_update',
      now(),
      0,
      'unknown',
      now()
    ) returning id into v_session_id;
  end if;

  return query
  select session_row.id,
         session_row.status::text,
         session_row.point_count,
         'Location Proof Running.'::text
  from public.tracking_sessions as session_row
  where session_row.id = v_session_id;
end;
$$;

-- request_driver_proof_upload: compare with the business date.
-- Body from 20260829160000_m29_driver_submission_proof_idempotency.sql.
create or replace function public.request_driver_proof_upload(
  p_mobile text,
  p_work_code text,
  p_ad_work_day_id uuid,
  p_proof_type text,
  p_area_place_name text,
  p_note_text text,
  p_file_mime_type text,
  p_file_size_bytes integer,
  -- Preserve eight-argument calls during database-first rollout. Updated
  -- clients supply a persisted ID; legacy calls receive a fresh server ID.
  p_client_request_id text default pg_catalog.gen_random_uuid()::text
)
returns table(proof_upload_id uuid, file_bucket text, file_path text, upload_status text, result_message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad_work public.ad_works%rowtype;
  v_assignment public.ad_work_assignments%rowtype;
  v_day public.ad_work_days%rowtype;
  v_driver public.drivers%rowtype;
  v_proof public.proof_uploads%rowtype;
  v_extension text;
  v_proof_id uuid := gen_random_uuid();
  v_path text;
  v_area text := nullif(trim(coalesce(p_area_place_name, '')), '');
  v_note text := nullif(trim(coalesce(p_note_text, '')), '');
  v_proof_type text := coalesce(nullif(trim(p_proof_type), ''), 'other');
  v_client_request_id text := lower(nullif(trim(coalesce(p_client_request_id, '')), ''));
begin
  if v_proof_type not in ('area_covered', 'announcement_done', 'customer_request', 'issue', 'other') then
    raise exception 'Invalid proof type' using errcode = '22000';
  end if;

  if v_area is null then
    raise exception 'Area or Place Name is required' using errcode = '22000';
  end if;

  if v_note is null then
    raise exception 'What happened? is required' using errcode = '22000';
  end if;

  if v_client_request_id is null
    or length(v_client_request_id) not between 16 and 96
    or v_client_request_id !~ '^[a-z0-9-]+$' then
    raise exception 'Valid proof request id is required' using errcode = '22000';
  end if;

  v_extension := public.m7_file_extension_for_mime(p_file_mime_type);
  if v_extension is null then
    raise exception 'Choose a JPG, PNG, or WebP photo' using errcode = '22000';
  end if;

  if p_file_size_bytes is null or p_file_size_bytes <= 0 or p_file_size_bytes > 5242880 then
    raise exception 'Photo must be 5 MB or smaller' using errcode = '22000';
  end if;

  select aw.* into v_ad_work
  from public.ad_works aw
  join public.ad_work_assignments assignment on assignment.ad_work_id = aw.id
  join public.drivers driver_record on driver_record.id = assignment.driver_id
  where aw.execution_release_status = 'released_to_driver'
    and aw.work_access_code_hash = public.m6_hash_work_code(p_work_code)
    and public.m6_normalize_mobile(driver_record.phone) = public.m6_normalize_mobile(p_mobile)
  limit 1;

  if not found then
    raise exception 'Invalid work code or mobile number' using errcode = '42501';
  end if;

  select * into v_assignment
  from public.ad_work_assignments
  where ad_work_id = v_ad_work.id;

  if not found or v_assignment.status <> 'ready_for_execution' then
    raise exception 'Released assignment is required' using errcode = '42501';
  end if;

  select * into v_driver
  from public.drivers
  where id = v_assignment.driver_id;

  select * into v_day
  from public.ad_work_days
  where id = p_ad_work_day_id
    and ad_work_id = v_ad_work.id
  for update;

  if not found then
    raise exception 'Work day not found' using errcode = 'P0002';
  end if;

  select proof.* into v_proof
  from public.proof_uploads proof
  where proof.client_request_id = v_client_request_id
  for update;

  if found then
    if v_proof.ad_work_id is distinct from v_ad_work.id
      or v_proof.ad_work_day_id is distinct from v_day.id
      or v_proof.assignment_id is distinct from v_assignment.id
      or v_proof.driver_id is distinct from v_assignment.driver_id
      or v_proof.vehicle_id is distinct from v_assignment.vehicle_id
      or v_proof.proof_type is distinct from v_proof_type
      or v_proof.area_place_name is distinct from v_area
      or v_proof.note_text is distinct from v_note
      or v_proof.file_mime_type is distinct from lower(trim(p_file_mime_type))
      or v_proof.file_size_bytes is distinct from p_file_size_bytes then
      raise exception 'Proof request id was already used for different details' using errcode = '22000';
    end if;

    if v_proof.upload_status not in ('pending_upload', 'uploaded') then
      raise exception 'Proof upload cannot be resumed' using errcode = '22000';
    end if;

    return query select
      v_proof.id,
      v_proof.file_bucket,
      v_proof.file_path,
      v_proof.upload_status::text,
      case
        when v_proof.upload_status = 'uploaded' then 'Proof upload already completed.'::text
        else 'Upload slot ready.'::text
      end;
    return;
  end if;

  if v_day.work_date <> public.m30_business_date() then
    raise exception 'Upload Photo Proof is available only for today''s Ad Work' using errcode = '22000';
  end if;

  if v_day.execution_status not in ('running', 'on_break') then
    raise exception 'Upload Photo Proof is allowed only when work is Running or On Break' using errcode = '22000';
  end if;

  v_path := 'ad-works/' || v_ad_work.id || '/days/' || v_day.id || '/' || v_proof_id || '-' || substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 16) || '.' || v_extension;

  insert into public.proof_uploads (
    id,
    ad_work_id,
    ad_work_day_id,
    assignment_id,
    driver_id,
    vehicle_id,
    type,
    proof_type,
    area_place_name,
    note,
    note_text,
    file_bucket,
    file_path,
    file_mime_type,
    file_size_bytes,
    uploaded_by,
    upload_status,
    review_status,
    client_request_id,
    updated_at
  )
  values (
    v_proof_id,
    v_ad_work.id,
    v_day.id,
    v_assignment.id,
    v_assignment.driver_id,
    v_assignment.vehicle_id,
    'photo',
    v_proof_type,
    v_area,
    v_note,
    v_note,
    'proof-photos',
    v_path,
    lower(trim(p_file_mime_type)),
    p_file_size_bytes,
    v_driver.id,
    'pending_upload',
    'waiting_review',
    v_client_request_id,
    now()
  )
  on conflict (client_request_id) where client_request_id is not null do nothing;

  select proof.* into v_proof
  from public.proof_uploads proof
  where proof.client_request_id = v_client_request_id
  for update;

  if v_proof.ad_work_id is distinct from v_ad_work.id
    or v_proof.ad_work_day_id is distinct from v_day.id
    or v_proof.assignment_id is distinct from v_assignment.id
    or v_proof.driver_id is distinct from v_assignment.driver_id
    or v_proof.vehicle_id is distinct from v_assignment.vehicle_id
    or v_proof.proof_type is distinct from v_proof_type
    or v_proof.area_place_name is distinct from v_area
    or v_proof.note_text is distinct from v_note
    or v_proof.file_mime_type is distinct from lower(trim(p_file_mime_type))
    or v_proof.file_size_bytes is distinct from p_file_size_bytes then
    raise exception 'Proof request id was already used for different details' using errcode = '22000';
  end if;

  return query select
    v_proof.id,
    v_proof.file_bucket,
    v_proof.file_path,
    v_proof.upload_status::text,
    'Upload slot ready.'::text;
end;
$$;

-- m8_build_final_summary_text: readable dates and times.
-- Body from 20260701120000_m12_location_proof_in_final_summary.sql.
create or replace function public.m8_build_final_summary_text(p_ad_work_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad_work public.ad_works%rowtype;
  v_assignment public.ad_work_assignments%rowtype;
  v_driver public.drivers%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_summary public.final_proof_summaries%rowtype;
  v_days text;
  v_proofs text;
  v_updates text;
  v_location_section text;
  v_location_status_label text;
  v_location_active_label text;
  v_location_sync_label text;
begin
  select * into v_ad_work
  from public.ad_works
  where id = p_ad_work_id;

  if not found then
    raise exception 'Ad Work not found' using errcode = 'P0002';
  end if;

  select * into v_summary
  from public.final_proof_summaries
  where ad_work_id = p_ad_work_id
  limit 1;

  select * into v_assignment
  from public.ad_work_assignments
  where ad_work_id = p_ad_work_id
  limit 1;

  if found then
    select * into v_driver from public.drivers where id = v_assignment.driver_id;
    select * into v_vehicle from public.vehicles where id = v_assignment.vehicle_id;
  end if;

  select string_agg(
    '- ' || public.m30_format_date(day_row.work_date) ||
    ' | planned ' || coalesce(public.m30_format_time(day_row.planned_start_time), 'Not set') || ' to ' || coalesce(public.m30_format_time(day_row.planned_end_time), 'Not set') ||
    ' | actual ' || coalesce(public.m30_format_business_time(day_row.execution_started_at), 'Not set') || ' to ' || coalesce(public.m30_format_business_time(day_row.execution_completed_at), 'Not set') ||
    ' | status ' || replace(day_row.execution_status, '_', ' ') ||
    case when nullif(trim(coalesce(day_row.completion_note, '')), '') is not null then ' | completion ' || day_row.completion_note else '' end ||
    case when nullif(trim(coalesce(day_row.issue_note, '')), '') is not null then ' | issue ' || day_row.issue_note else '' end,
    E'\n'
    order by day_row.work_date asc
  ) into v_days
  from public.ad_work_days day_row
  where day_row.ad_work_id = p_ad_work_id;

  select string_agg(
    '- ' || coalesce(nullif(trim(proof.area_place_name), ''), 'Work area') || ': ' || coalesce(nullif(trim(proof.note_text), ''), 'Proof Checked'),
    E'\n'
    order by proof.created_at asc
  ) into v_proofs
  from public.proof_uploads proof
  where proof.ad_work_id = p_ad_work_id
    and proof.upload_status = 'uploaded'
    and proof.review_status = 'approved';

  select string_agg(
    '- ' || replace(update_row.type::text, '_', ' ') || ': ' || update_row.message ||
    ' | shared status ' || replace(coalesce(update_row.sharing_status, 'pending_sharing'), '_', ' ') ||
    ' | method ' || replace(coalesce(update_row.sharing_method, 'not_set'), '_', ' ') ||
    ' | time ' || coalesce(public.m30_format_business_time(update_row.shared_at), 'Not shared'),
    E'\n'
    order by update_row.created_at asc
  ) into v_updates
  from public.customer_updates update_row
  where update_row.ad_work_id = p_ad_work_id;

  if coalesce(v_summary.include_phone_location_proof, false) and coalesce(v_summary.phone_location_proof_customer_safe_confirmed, false) then
    v_location_status_label := case v_summary.phone_location_proof_status
      when 'reviewed_by_team' then 'Reviewed by Team'
      when 'needs_follow_up' then 'Needs Follow-up'
      when 'not_required' then 'Not Required'
      when 'not_reviewed' then 'Not Reviewed'
      else 'Not Available'
    end;
    v_location_active_label := case v_summary.phone_location_proof_active_during_work
      when 'yes' then 'Yes'
      when 'no' then 'No'
      else 'Not Confirmed'
    end;
    v_location_sync_label := case v_summary.phone_location_offline_sync_status
      when 'synced' then 'Synced'
      when 'pending' then 'Pending'
      when 'not_applicable' then 'Not Applicable'
      else 'Not Available'
    end;

    v_location_section := concat_ws(E'\n',
      'Phone Location Proof',
      'Phone Location Proof Status: ' || v_location_status_label,
      'Location Proof Required: ' || case when coalesce(v_summary.phone_location_proof_required, false) then 'Yes' else 'No' end,
      'Location Proof Active During Work: ' || v_location_active_label,
      'First Location Received: ' || coalesce(public.m30_format_business_time(v_summary.phone_location_first_received_at), 'Not Available'),
      'Last Location Received: ' || coalesce(public.m30_format_business_time(v_summary.phone_location_last_received_at), 'Not Available'),
      'Offline Location Sync: ' || v_location_sync_label,
      'Team Review Note: ' || coalesce(nullif(trim(v_summary.phone_location_proof_customer_note), ''), 'Not Available'),
      'Phone Location Proof is supporting evidence only. It does not certify route, map, distance, or full area coverage.'
    );
  end if;

  return concat_ws(E'\n',
    'Final Proof Summary',
    'Customer: ' || coalesce(nullif(trim(v_ad_work.customer_name), ''), 'Not set'),
    'Business/shop: ' || coalesce(nullif(trim(v_ad_work.business_name), ''), 'Not set'),
    'Mobile: ' || coalesce(nullif(trim(v_ad_work.customer_phone), ''), 'Not set'),
    'City/town: ' || coalesce(nullif(trim(v_ad_work.city), ''), 'Not set'),
    'Advertisement: ' || coalesce(nullif(trim(v_ad_work.advertisement_details), ''), 'Not set'),
    'Ad Work: ' || v_ad_work.title,
    'Package: ' || initcap(replace(v_ad_work.package_interest::text, '_', ' ')),
    'Planned dates: ' || coalesce(public.m30_format_date(v_ad_work.start_date), 'Not set') || ' to ' || coalesce(public.m30_format_date(v_ad_work.end_date), 'Not set'),
    'Actual status: ' || replace(coalesce(v_ad_work.execution_overall_status, 'not_started'), '_', ' '),
    'Assigned driver: ' || coalesce(v_driver.name, 'Not assigned'),
    'Assigned vehicle: ' || coalesce(v_vehicle.vehicle_number, 'Not assigned'),
    'Mic System: ' || case when coalesce(v_vehicle.mic_system_available, v_vehicle.mic_available, false) then 'Available' else 'Not confirmed' end,
    'Day-wise summary:',
    coalesce(v_days, 'No day-wise execution rows yet.'),
    'Area/proof summary:',
    'Areas to cover: ' || coalesce(nullif(trim(v_ad_work.areas_to_cover), ''), 'Not set'),
    coalesce(v_proofs, 'No customer-approved photo proof selected.'),
    'Customer update summary:',
    coalesce(v_updates, 'No customer update records yet.'),
    v_location_section,
    'Closure section:',
    'Closure status: ' || replace(coalesce(v_ad_work.closure_status, 'not_ready'), '_', ' '),
    'Closure Note: ' || coalesce(nullif(trim(v_ad_work.closure_note), ''), 'Not set'),
    'Customer Accepted: ' || replace(coalesce(v_ad_work.closure_customer_accepted, 'not_confirmed'), '_', ' '),
    'Closed time: ' || coalesce(public.m30_format_business_time(v_ad_work.closure_closed_at), 'Not closed'),
    'GPS, route, map, and live tracking proof are not included in this version.'
  );
end;
$$;

-- The summary text function stays internal (see 20261113192000).
revoke all on function public.m8_build_final_summary_text(uuid) from public;
revoke all on function public.m8_build_final_summary_text(uuid) from anon;
revoke all on function public.m8_build_final_summary_text(uuid) from authenticated;
