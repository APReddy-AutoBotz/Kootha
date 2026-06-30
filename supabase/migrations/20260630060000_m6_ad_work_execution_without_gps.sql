alter table public.ad_works
  add column if not exists execution_release_status text not null default 'not_released',
  add column if not exists execution_overall_status text not null default 'not_started',
  add column if not exists work_access_code_hash text,
  add column if not exists work_access_code_hint text,
  add column if not exists work_access_code_created_at timestamptz,
  add column if not exists work_access_revoked_at timestamptz,
  add column if not exists execution_completed_at timestamptz;

alter table public.ad_work_days
  add column if not exists execution_status text not null default 'planned',
  add column if not exists execution_started_at timestamptz,
  add column if not exists break_started_at timestamptz,
  add column if not exists last_resumed_at timestamptz,
  add column if not exists execution_completed_at timestamptz,
  add column if not exists completion_note text,
  add column if not exists issue_note text,
  add column if not exists execution_updated_at timestamptz;

create table if not exists public.execution_proof_notes (
  id uuid primary key default gen_random_uuid(),
  ad_work_id uuid not null references public.ad_works(id) on delete cascade,
  ad_work_day_id uuid not null references public.ad_work_days(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete restrict,
  proof_type text not null,
  area_place_name text,
  note_text text not null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ad_works_execution_release_status_check'
  ) then
    alter table public.ad_works
      add constraint ad_works_execution_release_status_check
      check (execution_release_status in ('not_released', 'released_to_driver', 'access_revoked'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'ad_works_execution_overall_status_check'
  ) then
    alter table public.ad_works
      add constraint ad_works_execution_overall_status_check
      check (execution_overall_status in ('not_started', 'running', 'on_break', 'completed', 'issue_reported', 'cancelled'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'ad_work_days_execution_status_check'
  ) then
    alter table public.ad_work_days
      add constraint ad_work_days_execution_status_check
      check (execution_status in ('planned', 'ready', 'running', 'on_break', 'completed', 'issue_reported', 'cancelled'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'execution_proof_notes_type_check'
  ) then
    alter table public.execution_proof_notes
      add constraint execution_proof_notes_type_check
      check (proof_type in ('area_covered', 'announcement_done', 'customer_request', 'issue', 'other'));
  end if;
end $$;

alter table public.ad_works enable row level security;
alter table public.ad_work_days enable row level security;
alter table public.ad_work_assignments enable row level security;
alter table public.drivers enable row level security;
alter table public.vehicles enable row level security;
alter table public.execution_proof_notes enable row level security;
alter table public.customer_updates enable row level security;

drop policy if exists "Admin users can view execution proof notes" on public.execution_proof_notes;
create policy "Admin users can view execution proof notes"
  on public.execution_proof_notes
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admin users can insert execution proof notes" on public.execution_proof_notes;
create policy "Admin users can insert execution proof notes"
  on public.execution_proof_notes
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Admin users can update execution proof notes" on public.execution_proof_notes;
create policy "Admin users can update execution proof notes"
  on public.execution_proof_notes
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admin users can view customer updates" on public.customer_updates;
create policy "Admin users can view customer updates"
  on public.customer_updates
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admin users can insert customer updates" on public.customer_updates;
create policy "Admin users can insert customer updates"
  on public.customer_updates
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Admin users can update customer updates" on public.customer_updates;
create policy "Admin users can update customer updates"
  on public.customer_updates
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.execution_proof_notes from anon;
revoke all on public.execution_proof_notes from authenticated;
grant select, insert, update on public.execution_proof_notes to authenticated;

revoke all on public.customer_updates from anon;
revoke all on public.customer_updates from authenticated;
grant select, insert, update on public.customer_updates to authenticated;

create or replace function public.m6_normalize_mobile(p_mobile text)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g');
$$;

create or replace function public.m6_hash_work_code(p_work_code text)
returns text
language sql
immutable
set search_path = public
as $$
  select md5(upper(trim(coalesce(p_work_code, ''))));
$$;

create or replace function public.release_ad_work_to_driver(
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

  if p_revoke then
    update public.ad_works
    set execution_release_status = 'access_revoked',
        work_access_code_hash = null,
        work_access_code_hint = null,
        work_access_revoked_at = now(),
        updated_at = now()
    where id = p_ad_work_id;

    insert into public.customer_updates (ad_work_id, type, message, channel, sent_status)
    values (p_ad_work_id, 'manual', 'Driver work access was stopped by the team.', 'copy', 'draft');

    return query select p_ad_work_id, null::text, null::text, 'access_revoked'::text, 'Work access revoked.'::text;
    return;
  end if;

  select * into v_assignment
  from public.ad_work_assignments
  where ad_work_id = p_ad_work_id;

  if not found or v_assignment.status <> 'ready_for_execution' then
    raise exception 'Ad Work must be Ready for Execution before release' using errcode = '22000';
  end if;

  select * into v_driver
  from public.drivers
  where id = v_assignment.driver_id;

  if not found or v_driver.approval_status <> 'approved' or coalesce(v_driver.onboarding_status, 'pending_review') <> 'approved' then
    raise exception 'Approved driver assignment is required before release' using errcode = '22000';
  end if;

  select * into v_vehicle
  from public.vehicles
  where id = v_assignment.vehicle_id;

  if not found or coalesce(v_vehicle.onboarding_status, 'pending_review') <> 'approved' or coalesce(v_vehicle.active, false) is false then
    raise exception 'Approved vehicle assignment is required before release' using errcode = '22000';
  end if;

  if v_ad_work.start_date is null then
    raise exception 'Planned dates are required before release' using errcode = '22000';
  end if;

  if nullif(trim(coalesce(v_ad_work.areas_to_cover, '')), '') is null then
    raise exception 'Areas to cover are required before release' using errcode = '22000';
  end if;

  if coalesce(v_ad_work.package_interest, 'not_sure') = 'not_sure' then
    raise exception 'Package selection is required before release' using errcode = '22000';
  end if;

  v_code := upper(regexp_replace(
    coalesce(nullif(trim(p_plain_work_code), ''), substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 8)),
    '[^A-Za-z0-9]',
    '',
    'g'
  ));

  if length(v_code) < 4 then
    raise exception 'Work access code must have at least 4 letters or numbers' using errcode = '22000';
  end if;

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

  insert into public.customer_updates (ad_work_id, type, message, channel, sent_status)
  values (p_ad_work_id, 'manual', 'Your advertisement work is ready for driver action.', 'copy', 'draft');

  return query select p_ad_work_id, v_code, v_hint, 'released_to_driver'::text, 'Ad Work released to driver.'::text;
end;
$$;

create or replace function public.driver_get_assigned_work(
  p_mobile text,
  p_work_code text
)
returns table(
  ad_work_id uuid,
  ad_work_day_id uuid,
  business_name text,
  city text,
  areas_to_cover text,
  advertisement_details text,
  planned_date date,
  planned_start_time time,
  planned_end_time time,
  execution_status text,
  vehicle_number text,
  special_instructions text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad_work public.ad_works%rowtype;
begin
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

  return query
  select
    aw.id,
    day_row.id,
    aw.business_name,
    aw.city,
    coalesce(day_row.areas_to_cover, aw.areas_to_cover),
    aw.advertisement_details,
    day_row.work_date,
    day_row.planned_start_time,
    day_row.planned_end_time,
    day_row.execution_status,
    vehicle_record.vehicle_number,
    aw.special_instructions
  from public.ad_works aw
  join public.ad_work_assignments assignment on assignment.ad_work_id = aw.id
  join public.vehicles vehicle_record on vehicle_record.id = assignment.vehicle_id
  join public.ad_work_days day_row on day_row.ad_work_id = aw.id
  where aw.id = v_ad_work.id
  order by day_row.work_date asc;
end;
$$;

create or replace function public.driver_update_work_day(
  p_mobile text,
  p_work_code text,
  p_ad_work_day_id uuid,
  p_action text,
  p_note text default null,
  p_area_place_name text default null,
  p_proof_type text default null
)
returns table(ad_work_day_id uuid, execution_status text, result_message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad_work public.ad_works%rowtype;
  v_day public.ad_work_days%rowtype;
  v_assignment public.ad_work_assignments%rowtype;
  v_driver public.drivers%rowtype;
  v_note text;
  v_type text;
  v_message text;
begin
  v_note := nullif(trim(coalesce(p_note, '')), '');
  v_type := coalesce(nullif(trim(p_proof_type), ''), 'other');

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

  select * into v_day
  from public.ad_work_days
  where id = p_ad_work_day_id
    and ad_work_id = v_ad_work.id
  for update;

  if not found then
    raise exception 'Work day not found' using errcode = 'P0002';
  end if;

  select * into v_assignment
  from public.ad_work_assignments
  where ad_work_id = v_ad_work.id;

  select * into v_driver
  from public.drivers
  where id = v_assignment.driver_id;

  if p_action = 'start' then
    if v_day.execution_status not in ('planned', 'ready') then
      raise exception 'Start Work is allowed only for Planned or Ready work' using errcode = '22000';
    end if;

    update public.ad_work_days
    set execution_status = 'running',
        execution_started_at = coalesce(execution_started_at, now()),
        execution_updated_at = now()
    where id = v_day.id;

    update public.ad_works
    set execution_overall_status = 'running',
        updated_at = now()
    where id = v_ad_work.id;

    v_message := 'Your advertisement work has started.';
    insert into public.customer_updates (ad_work_id, ad_work_day_id, type, message, channel, sent_status)
    values (v_ad_work.id, v_day.id, 'started', v_message, 'copy', 'draft');

    return query select v_day.id, 'running'::text, 'Start Work saved.'::text;
    return;
  end if;

  if p_action = 'take_break' then
    if v_day.execution_status <> 'running' then
      raise exception 'Take Break is allowed only when work is Running' using errcode = '22000';
    end if;

    update public.ad_work_days
    set execution_status = 'on_break',
        break_started_at = now(),
        execution_updated_at = now()
    where id = v_day.id;

    update public.ad_works
    set execution_overall_status = 'on_break',
        updated_at = now()
    where id = v_ad_work.id;

    v_message := 'Your advertisement work is currently paused for a driver break.';
    insert into public.customer_updates (ad_work_id, ad_work_day_id, type, message, channel, sent_status)
    values (v_ad_work.id, v_day.id, 'manual', v_message, 'copy', 'draft');

    return query select v_day.id, 'on_break'::text, 'Take Break saved.'::text;
    return;
  end if;

  if p_action = 'resume' then
    if v_day.execution_status <> 'on_break' then
      raise exception 'Resume Work is allowed only when work is On Break' using errcode = '22000';
    end if;

    update public.ad_work_days
    set execution_status = 'running',
        last_resumed_at = now(),
        execution_updated_at = now()
    where id = v_day.id;

    update public.ad_works
    set execution_overall_status = 'running',
        updated_at = now()
    where id = v_ad_work.id;

    v_message := 'Your advertisement work is currently running.';
    insert into public.customer_updates (ad_work_id, ad_work_day_id, type, message, channel, sent_status)
    values (v_ad_work.id, v_day.id, 'in_progress', v_message, 'copy', 'draft');

    return query select v_day.id, 'running'::text, 'Resume Work saved.'::text;
    return;
  end if;

  if p_action = 'end' then
    if v_day.execution_status not in ('running', 'on_break') then
      raise exception 'End Work is allowed only when work is Running or On Break' using errcode = '22000';
    end if;

    if v_note is null then
      raise exception 'Completion note is required' using errcode = '22000';
    end if;

    update public.ad_work_days
    set execution_status = 'completed',
        execution_completed_at = now(),
        completion_note = v_note,
        execution_updated_at = now()
    where id = v_day.id;

    if not exists (
      select 1 from public.ad_work_days
      where ad_work_id = v_ad_work.id
        and id <> v_day.id
        and execution_status <> 'completed'
    ) then
      update public.ad_works
      set execution_overall_status = 'completed',
          execution_completed_at = now(),
          updated_at = now()
      where id = v_ad_work.id;
    end if;

    v_message := 'Today''s advertisement work is completed.';
    insert into public.customer_updates (ad_work_id, ad_work_day_id, type, message, channel, sent_status)
    values (v_ad_work.id, v_day.id, 'completed', v_message, 'copy', 'draft');

    return query select v_day.id, 'completed'::text, 'Work Completed.'::text;
    return;
  end if;

  if p_action = 'issue' then
    if v_note is null then
      raise exception 'Issue note is required' using errcode = '22000';
    end if;

    update public.ad_work_days
    set execution_status = 'issue_reported',
        issue_note = v_note,
        execution_updated_at = now()
    where id = v_day.id;

    update public.ad_works
    set execution_overall_status = 'issue_reported',
        updated_at = now()
    where id = v_ad_work.id;

    insert into public.execution_proof_notes (ad_work_id, ad_work_day_id, driver_id, proof_type, area_place_name, note_text)
    values (v_ad_work.id, v_day.id, v_driver.id, 'issue', nullif(trim(coalesce(p_area_place_name, '')), ''), v_note);

    v_message := 'Your work had an issue and our team is checking it.';
    insert into public.customer_updates (ad_work_id, ad_work_day_id, type, message, channel, sent_status)
    values (v_ad_work.id, v_day.id, 'manual', v_message, 'copy', 'draft');

    return query select v_day.id, 'issue_reported'::text, 'Issue Reported.'::text;
    return;
  end if;

  if p_action = 'add_proof_note' then
    if v_note is null then
      raise exception 'Proof note is required' using errcode = '22000';
    end if;

    if v_type not in ('area_covered', 'announcement_done', 'customer_request', 'issue', 'other') then
      raise exception 'Invalid proof note type' using errcode = '22000';
    end if;

    insert into public.execution_proof_notes (ad_work_id, ad_work_day_id, driver_id, proof_type, area_place_name, note_text)
    values (v_ad_work.id, v_day.id, v_driver.id, v_type, nullif(trim(coalesce(p_area_place_name, '')), ''), v_note);

    v_message := 'A proof note was added for your advertisement work.';
    insert into public.customer_updates (ad_work_id, ad_work_day_id, type, message, channel, sent_status)
    values (
      v_ad_work.id,
      v_day.id,
      case when v_type = 'area_covered' then 'area_covered'::public.customer_update_type else 'manual'::public.customer_update_type end,
      v_message,
      'copy',
      'draft'
    );

    return query select v_day.id, v_day.execution_status, 'Proof Note added.'::text;
    return;
  end if;

  raise exception 'Unsupported work action' using errcode = '22000';
end;
$$;

revoke all on function public.release_ad_work_to_driver(uuid, text, boolean) from public;
grant execute on function public.release_ad_work_to_driver(uuid, text, boolean) to authenticated;

revoke all on function public.driver_get_assigned_work(text, text) from public;
grant execute on function public.driver_get_assigned_work(text, text) to anon;

revoke all on function public.driver_update_work_day(text, text, uuid, text, text, text, text) from public;
grant execute on function public.driver_update_work_day(text, text, uuid, text, text, text, text) to anon;
