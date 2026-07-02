alter table public.final_proof_summaries
  add column if not exists include_phone_location_proof boolean not null default false,
  add column if not exists phone_location_proof_customer_note text,
  add column if not exists phone_location_proof_customer_safe_confirmed boolean not null default false,
  add column if not exists phone_location_proof_status text not null default 'not_available',
  add column if not exists phone_location_proof_required boolean not null default false,
  add column if not exists phone_location_proof_active_during_work text not null default 'not_confirmed',
  add column if not exists phone_location_first_received_at timestamptz,
  add column if not exists phone_location_last_received_at timestamptz,
  add column if not exists phone_location_offline_sync_status text not null default 'not_available';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'final_proof_summaries_m12_location_status_check'
  ) then
    alter table public.final_proof_summaries
      add constraint final_proof_summaries_m12_location_status_check
      check (phone_location_proof_status in ('reviewed_by_team', 'needs_follow_up', 'not_required', 'not_available', 'not_reviewed'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'final_proof_summaries_m12_location_active_check'
  ) then
    alter table public.final_proof_summaries
      add constraint final_proof_summaries_m12_location_active_check
      check (phone_location_proof_active_during_work in ('yes', 'no', 'not_confirmed'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'final_proof_summaries_m12_location_sync_check'
  ) then
    alter table public.final_proof_summaries
      add constraint final_proof_summaries_m12_location_sync_check
      check (phone_location_offline_sync_status in ('synced', 'pending', 'not_applicable', 'not_available'));
  end if;
end $$;

create index if not exists final_proof_summaries_location_proof_status_idx
  on public.final_proof_summaries(phone_location_proof_status, updated_at desc);

alter table public.final_proof_summaries enable row level security;
alter table public.tracking_sessions enable row level security;
alter table public.location_points enable row level security;

create or replace function public.m12_final_location_proof_status(
  p_required boolean,
  p_review_status text,
  p_point_count integer
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(p_required, false) is false then 'not_required'
    when p_review_status = 'not_required' then 'not_required'
    when p_review_status in ('needs_follow_up', 'rejected') then 'needs_follow_up'
    when p_review_status in ('reviewed', 'accepted') and coalesce(p_point_count, 0) > 0 then 'reviewed_by_team'
    when p_review_status in ('reviewed', 'accepted') then 'not_available'
    else 'not_reviewed'
  end;
$$;

create or replace function public.m12_assert_customer_safe_location_note(p_note text)
returns void
language plpgsql
immutable
set search_path = public
as $$
declare
  v_note text := lower(coalesce(p_note, ''));
begin
  if v_note ~ '(latitude|longitude|coordinate|coordinates|geofence|telemetry|ingestion|api|rls|backend|database|device stream|mqtt|http ingestion)' then
    raise exception 'Customer-safe location proof note contains technical wording' using errcode = '22023';
  end if;

  if v_note ~ '(route verified|gps-certified|gps certified|area fully verified by gps|customer live tracking completed|distance certified|map verified|all locations proved by gps|exact coverage guaranteed by gps)' then
    raise exception 'Customer-safe location proof note contains unsupported proof wording' using errcode = '22023';
  end if;
end;
$$;

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
    '- ' || day_row.work_date::text ||
    ' | planned ' || coalesce(day_row.planned_start_time::text, 'Not set') || ' to ' || coalesce(day_row.planned_end_time::text, 'Not set') ||
    ' | actual ' || coalesce(day_row.execution_started_at::text, 'Not set') || ' to ' || coalesce(day_row.execution_completed_at::text, 'Not set') ||
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
    ' | time ' || coalesce(update_row.shared_at::text, 'Not shared'),
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
      'First Location Received: ' || coalesce(v_summary.phone_location_first_received_at::text, 'Not Available'),
      'Last Location Received: ' || coalesce(v_summary.phone_location_last_received_at::text, 'Not Available'),
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
    'Planned dates: ' || coalesce(v_ad_work.start_date::text, 'Not set') || ' to ' || coalesce(v_ad_work.end_date::text, 'Not set'),
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
    'Closed time: ' || coalesce(v_ad_work.closure_closed_at::text, 'Not closed'),
    'GPS, route, map, and live tracking proof are not included in this version.'
  );
end;
$$;

drop function if exists public.prepare_final_proof_summary(uuid, boolean, boolean, boolean, text);
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

drop function if exists public.close_ad_work_with_final_summary(uuid, text, text, text, text, boolean, boolean);
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

revoke all on function public.m12_final_location_proof_status(boolean, text, integer) from public;
grant execute on function public.m12_final_location_proof_status(boolean, text, integer) to authenticated;

revoke all on function public.m12_assert_customer_safe_location_note(text) from public;

revoke all on function public.m8_build_final_summary_text(uuid) from public;

revoke all on function public.prepare_final_proof_summary(uuid, boolean, boolean, boolean, text, boolean, text, boolean) from public;
grant execute on function public.prepare_final_proof_summary(uuid, boolean, boolean, boolean, text, boolean, text, boolean) to authenticated;

revoke all on function public.close_ad_work_with_final_summary(uuid, text, text, text, text, boolean, boolean, boolean, text, boolean) from public;
grant execute on function public.close_ad_work_with_final_summary(uuid, text, text, text, text, boolean, boolean, boolean, text, boolean) to authenticated;