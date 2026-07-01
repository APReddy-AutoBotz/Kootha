alter table public.ad_works
  add column if not exists closure_status text not null default 'not_ready',
  add column if not exists closure_note text,
  add column if not exists closure_reason text,
  add column if not exists closure_customer_accepted text not null default 'not_confirmed',
  add column if not exists closure_internal_admin_note text,
  add column if not exists closure_ready_at timestamptz,
  add column if not exists closure_closed_at timestamptz,
  add column if not exists closure_closed_by uuid,
  add column if not exists final_summary_reviewed boolean not null default false,
  add column if not exists final_summary_shared_status text not null default 'pending_sharing',
  add column if not exists final_summary_shared_method text,
  add column if not exists final_summary_shared_at timestamptz,
  add column if not exists final_summary_shared_by uuid,
  add column if not exists final_summary_shared_note text;

create table if not exists public.final_proof_summaries (
  id uuid primary key default gen_random_uuid(),
  ad_work_id uuid not null unique references public.ad_works(id) on delete cascade,
  closure_status text not null default 'not_ready',
  summary_text text not null default '',
  warnings text[] not null default '{}'::text[],
  reviewed_at timestamptz,
  reviewed_by uuid,
  ready_at timestamptz,
  closed_at timestamptz,
  closed_by uuid,
  closure_reason text,
  closure_note text,
  customer_accepted text not null default 'not_confirmed',
  internal_admin_note text,
  shared_status text not null default 'pending_sharing',
  shared_method text,
  shared_at timestamptz,
  shared_by uuid,
  shared_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists final_proof_summaries_closure_status_idx
  on public.final_proof_summaries(closure_status, updated_at desc);

create index if not exists ad_works_closure_status_idx
  on public.ad_works(closure_status, updated_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ad_works_m8_closure_status_check'
  ) then
    alter table public.ad_works
      add constraint ad_works_m8_closure_status_check
      check (closure_status in ('not_ready', 'ready_for_review', 'ready_to_close', 'closed', 'closed_with_issues', 'cancelled'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'ad_works_m8_closure_reason_check'
  ) then
    alter table public.ad_works
      add constraint ad_works_m8_closure_reason_check
      check (closure_reason is null or closure_reason in ('rain_local_issue', 'customer_accepted_partial_work', 'driver_issue_resolved_manually', 'proof_not_required_by_customer', 'other'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'ad_works_m8_customer_accepted_check'
  ) then
    alter table public.ad_works
      add constraint ad_works_m8_customer_accepted_check
      check (closure_customer_accepted in ('yes', 'no', 'not_confirmed'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'ad_works_m8_final_summary_share_status_check'
  ) then
    alter table public.ad_works
      add constraint ad_works_m8_final_summary_share_status_check
      check (final_summary_shared_status in ('pending_sharing', 'shared_manually'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'ad_works_m8_final_summary_share_method_check'
  ) then
    alter table public.ad_works
      add constraint ad_works_m8_final_summary_share_method_check
      check (final_summary_shared_method is null or final_summary_shared_method in ('manual_whatsapp', 'manual_sms', 'phone_call', 'printed_copy', 'in_person', 'other'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'final_proof_summaries_closure_status_check'
  ) then
    alter table public.final_proof_summaries
      add constraint final_proof_summaries_closure_status_check
      check (closure_status in ('not_ready', 'ready_for_review', 'ready_to_close', 'closed', 'closed_with_issues', 'cancelled'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'final_proof_summaries_closure_reason_check'
  ) then
    alter table public.final_proof_summaries
      add constraint final_proof_summaries_closure_reason_check
      check (closure_reason is null or closure_reason in ('rain_local_issue', 'customer_accepted_partial_work', 'driver_issue_resolved_manually', 'proof_not_required_by_customer', 'other'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'final_proof_summaries_customer_accepted_check'
  ) then
    alter table public.final_proof_summaries
      add constraint final_proof_summaries_customer_accepted_check
      check (customer_accepted in ('yes', 'no', 'not_confirmed'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'final_proof_summaries_shared_status_check'
  ) then
    alter table public.final_proof_summaries
      add constraint final_proof_summaries_shared_status_check
      check (shared_status in ('pending_sharing', 'shared_manually'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'final_proof_summaries_shared_method_check'
  ) then
    alter table public.final_proof_summaries
      add constraint final_proof_summaries_shared_method_check
      check (shared_method is null or shared_method in ('manual_whatsapp', 'manual_sms', 'phone_call', 'printed_copy', 'in_person', 'other'));
  end if;
end $$;

alter table public.ad_works enable row level security;
alter table public.final_proof_summaries enable row level security;

drop policy if exists "Admin users can view final proof summaries" on public.final_proof_summaries;
create policy "Admin users can view final proof summaries"
  on public.final_proof_summaries
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admin users can insert final proof summaries" on public.final_proof_summaries;
create policy "Admin users can insert final proof summaries"
  on public.final_proof_summaries
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Admin users can update final proof summaries" on public.final_proof_summaries;
create policy "Admin users can update final proof summaries"
  on public.final_proof_summaries
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admin users can delete final proof summaries" on public.final_proof_summaries;
create policy "Admin users can delete final proof summaries"
  on public.final_proof_summaries
  for delete
  to authenticated
  using (public.is_admin());

revoke all on public.final_proof_summaries from anon;
revoke all on public.final_proof_summaries from authenticated;
grant select, insert, update, delete on public.final_proof_summaries to authenticated;

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
  v_days text;
  v_proofs text;
  v_updates text;
begin
  select * into v_ad_work
  from public.ad_works
  where id = p_ad_work_id;

  if not found then
    raise exception 'Ad Work not found' using errcode = 'P0002';
  end if;

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
    'Closure section:',
    'Closure status: ' || replace(coalesce(v_ad_work.closure_status, 'not_ready'), '_', ' '),
    'Closure Note: ' || coalesce(nullif(trim(v_ad_work.closure_note), ''), 'Not set'),
    'Customer Accepted: ' || replace(coalesce(v_ad_work.closure_customer_accepted, 'not_confirmed'), '_', ' '),
    'Closed time: ' || coalesce(v_ad_work.closure_closed_at::text, 'Not closed'),
    'GPS, route, map, and live tracking proof are not included in this version.'
  );
end;
$$;

create or replace function public.prepare_final_proof_summary(
  p_ad_work_id uuid,
  p_final_summary_reviewed boolean default false,
  p_proof_not_required boolean default false,
  p_customer_updates_reviewed boolean default false,
  p_internal_admin_note text default null
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
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

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

  select count(*) into v_incomplete_day_count
  from public.ad_work_days day_row
  where day_row.ad_work_id = p_ad_work_id
    and day_row.execution_status <> 'completed';

  select count(*) into v_issue_count
  from public.ad_work_days day_row
  where day_row.ad_work_id = p_ad_work_id
    and day_row.execution_status = 'issue_reported';

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

  if v_incomplete_day_count > 0 then
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

  v_summary_text := public.m8_build_final_summary_text(p_ad_work_id);

  insert into public.final_proof_summaries (
    ad_work_id,
    closure_status,
    summary_text,
    warnings,
    reviewed_at,
    reviewed_by,
    ready_at,
    internal_admin_note,
    updated_at
  )
  values (
    p_ad_work_id,
    v_status,
    v_summary_text,
    v_warnings,
    case when p_final_summary_reviewed then now() else null end,
    case when p_final_summary_reviewed then auth.uid() else null end,
    case when v_status = 'ready_to_close' then now() else null end,
    nullif(trim(coalesce(p_internal_admin_note, '')), ''),
    now()
  )
  on conflict (ad_work_id) do update
  set closure_status = excluded.closure_status,
      summary_text = excluded.summary_text,
      warnings = excluded.warnings,
      reviewed_at = coalesce(excluded.reviewed_at, public.final_proof_summaries.reviewed_at),
      reviewed_by = coalesce(excluded.reviewed_by, public.final_proof_summaries.reviewed_by),
      ready_at = coalesce(excluded.ready_at, public.final_proof_summaries.ready_at),
      internal_admin_note = excluded.internal_admin_note,
      updated_at = now()
  returning id into v_summary_id;

  return query select p_ad_work_id, v_summary_id, v_status, v_warnings, v_summary_text, 'Final Proof Summary saved.'::text;
end;
$$;

create or replace function public.close_ad_work_with_final_summary(
  p_ad_work_id uuid,
  p_closure_reason text default null,
  p_closure_note text default null,
  p_customer_accepted text default 'not_confirmed',
  p_internal_admin_note text default null,
  p_proof_not_required boolean default false,
  p_customer_updates_reviewed boolean default false
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
  v_blocking_warning_count integer := 0;
  v_warning text;
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
  from public.prepare_final_proof_summary(p_ad_work_id, true, p_proof_not_required, true, p_internal_admin_note)
  limit 1;

  if v_prepare.closure_status = 'not_ready' then
    raise exception 'Ad Work is not ready for closure' using errcode = '22000';
  end if;

  foreach v_warning in array v_prepare.warnings loop
    if v_warning in ('Some planned days are not completed.', 'Issue Reported and not resolved.', 'Missing Proof.', 'Proof is waiting for review.', 'Some proof was rejected.', 'Customer updates are not marked shared.') then
      v_blocking_warning_count := v_blocking_warning_count + 1;
    end if;
  end loop;

  if v_blocking_warning_count > 0 and nullif(trim(coalesce(p_closure_reason, '')), '') is null then
    raise exception 'Closure Reason is required when warnings remain' using errcode = '22000';
  end if;

  if v_blocking_warning_count > 0 then
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

revoke all on function public.m8_build_final_summary_text(uuid) from public;

revoke all on function public.prepare_final_proof_summary(uuid, boolean, boolean, boolean, text) from public;
grant execute on function public.prepare_final_proof_summary(uuid, boolean, boolean, boolean, text) to authenticated;

revoke all on function public.close_ad_work_with_final_summary(uuid, text, text, text, text, boolean, boolean) from public;
grant execute on function public.close_ad_work_with_final_summary(uuid, text, text, text, text, boolean, boolean) to authenticated;

revoke all on function public.mark_final_summary_shared(uuid, text, text) from public;
grant execute on function public.mark_final_summary_shared(uuid, text, text) to authenticated;