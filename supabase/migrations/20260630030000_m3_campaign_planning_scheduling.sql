alter table public.customers
  add column if not exists source_enquiry_id uuid references public.enquiries(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.ad_works
  add column if not exists enquiry_id uuid references public.enquiries(id) on delete set null,
  add column if not exists customer_name text not null default '',
  add column if not exists business_name text,
  add column if not exists customer_phone text,
  add column if not exists city text,
  add column if not exists areas_to_cover text,
  add column if not exists advertisement_details text,
  add column if not exists package_interest text not null default 'not_sure',
  add column if not exists live_tracking_requested text not null default 'not_sure',
  add column if not exists live_tracking_enabled boolean not null default false,
  add column if not exists planning_status text not null default 'draft',
  add column if not exists number_of_days integer not null default 1,
  add column if not exists daily_start_time time,
  add column if not exists daily_end_time time,
  add column if not exists special_instructions text,
  add column if not exists internal_planning_note text,
  add column if not exists photo_proof_needed boolean not null default true,
  add column if not exists audio_video_proof_needed boolean not null default false,
  add column if not exists area_update_needed boolean not null default true,
  add column if not exists final_report_needed boolean not null default true,
  add column if not exists customer_update_scheduled boolean not null default true,
  add column if not exists customer_update_started boolean not null default true,
  add column if not exists customer_update_in_progress boolean not null default true,
  add column if not exists customer_update_area_covered boolean not null default true,
  add column if not exists customer_update_completed boolean not null default true,
  add column if not exists customer_update_report_ready boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

alter table public.ad_work_days
  add column if not exists planning_status text not null default 'planned',
  add column if not exists areas_to_cover text,
  add column if not exists day_note text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.ad_work_areas
  alter column area_id drop not null,
  add column if not exists custom_area_text text,
  add column if not exists planned_area_text text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists ad_works_enquiry_id_unique
  on public.ad_works(enquiry_id)
  where enquiry_id is not null;

create unique index if not exists ad_work_days_ad_work_date_unique
  on public.ad_work_days(ad_work_id, work_date);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ad_works_planning_status_check'
  ) then
    alter table public.ad_works
      add constraint ad_works_planning_status_check
      check (planning_status in ('draft', 'planned', 'ready_for_driver_assignment', 'on_hold', 'cancelled'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'ad_works_package_interest_check'
  ) then
    alter table public.ad_works
      add constraint ad_works_package_interest_check
      check (package_interest in ('basic', 'standard', 'premium', 'not_sure'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'ad_works_live_tracking_requested_check'
  ) then
    alter table public.ad_works
      add constraint ad_works_live_tracking_requested_check
      check (live_tracking_requested in ('yes', 'no', 'not_sure'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'ad_works_number_of_days_check'
  ) then
    alter table public.ad_works
      add constraint ad_works_number_of_days_check
      check (number_of_days > 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'ad_work_days_planning_status_check'
  ) then
    alter table public.ad_work_days
      add constraint ad_work_days_planning_status_check
      check (planning_status = 'planned');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'ad_work_areas_area_or_custom_check'
  ) then
    alter table public.ad_work_areas
      add constraint ad_work_areas_area_or_custom_check
      check (
        area_id is not null
        or nullif(trim(coalesce(custom_area_text, '')), '') is not null
        or nullif(trim(coalesce(planned_area_text, '')), '') is not null
      );
  end if;
end $$;

alter table public.customers enable row level security;
alter table public.ad_works enable row level security;
alter table public.ad_work_days enable row level security;
alter table public.ad_work_areas enable row level security;
alter table public.cities enable row level security;
alter table public.areas enable row level security;

drop policy if exists "Admin users can view customers" on public.customers;
create policy "Admin users can view customers"
  on public.customers
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admin users can insert customers" on public.customers;
create policy "Admin users can insert customers"
  on public.customers
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Admin users can update customers" on public.customers;
create policy "Admin users can update customers"
  on public.customers
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admin users can view ad works" on public.ad_works;
create policy "Admin users can view ad works"
  on public.ad_works
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admin users can insert ad works" on public.ad_works;
create policy "Admin users can insert ad works"
  on public.ad_works
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Admin users can update ad works" on public.ad_works;
create policy "Admin users can update ad works"
  on public.ad_works
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admin users can view ad work days" on public.ad_work_days;
create policy "Admin users can view ad work days"
  on public.ad_work_days
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admin users can insert ad work days" on public.ad_work_days;
create policy "Admin users can insert ad work days"
  on public.ad_work_days
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Admin users can update ad work days" on public.ad_work_days;
create policy "Admin users can update ad work days"
  on public.ad_work_days
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admin users can view ad work areas" on public.ad_work_areas;
create policy "Admin users can view ad work areas"
  on public.ad_work_areas
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admin users can insert ad work areas" on public.ad_work_areas;
create policy "Admin users can insert ad work areas"
  on public.ad_work_areas
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Admin users can update ad work areas" on public.ad_work_areas;
create policy "Admin users can update ad work areas"
  on public.ad_work_areas
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admin users can view cities" on public.cities;
create policy "Admin users can view cities"
  on public.cities
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admin users can view areas" on public.areas;
create policy "Admin users can view areas"
  on public.areas
  for select
  to authenticated
  using (public.is_admin());

revoke all on public.customers from anon;
revoke all on public.ad_works from anon;
revoke all on public.ad_work_days from anon;
revoke all on public.ad_work_areas from anon;
revoke all on public.customers from authenticated;
revoke all on public.ad_works from authenticated;
revoke all on public.ad_work_days from authenticated;
revoke all on public.ad_work_areas from authenticated;
revoke all on public.cities from anon;
revoke all on public.areas from anon;

grant select, insert, update on public.customers to authenticated;
grant select, insert, update on public.ad_works to authenticated;
grant select, insert, update on public.ad_work_days to authenticated;
grant select, insert, update on public.ad_work_areas to authenticated;
grant select on public.cities to authenticated;
grant select on public.areas to authenticated;

create or replace function public.sync_ad_work_days(
  p_ad_work_id uuid,
  p_start_date date,
  p_number_of_days integer,
  p_daily_start_time time default null,
  p_daily_end_time time default null,
  p_areas_to_cover text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day_count integer := greatest(coalesce(p_number_of_days, 1), 1);
  v_day_offset integer;
  v_work_date date;
  v_end_date date := p_start_date + (greatest(coalesce(p_number_of_days, 1), 1) - 1);
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if p_start_date is null then
    raise exception 'Start date is required' using errcode = '22004';
  end if;

  perform 1 from public.ad_works where id = p_ad_work_id;
  if not found then
    raise exception 'Ad work not found' using errcode = 'P0002';
  end if;

  delete from public.ad_work_days
  where ad_work_id = p_ad_work_id
    and (work_date < p_start_date or work_date > v_end_date);

  for v_day_offset in 0..(v_day_count - 1) loop
    v_work_date := p_start_date + v_day_offset;

    insert into public.ad_work_days (
      ad_work_id,
      work_date,
      planned_start_time,
      planned_end_time,
      status,
      planning_status,
      areas_to_cover
    )
    values (
      p_ad_work_id,
      v_work_date,
      p_daily_start_time,
      p_daily_end_time,
      'scheduled',
      'planned',
      p_areas_to_cover
    )
    on conflict (ad_work_id, work_date) do update
    set planned_start_time = coalesce(public.ad_work_days.planned_start_time, excluded.planned_start_time),
        planned_end_time = coalesce(public.ad_work_days.planned_end_time, excluded.planned_end_time),
        areas_to_cover = coalesce(nullif(public.ad_work_days.areas_to_cover, ''), excluded.areas_to_cover),
        planning_status = 'planned',
        updated_at = now();
  end loop;
end;
$$;

create or replace function public.create_ad_work_from_enquiry(p_enquiry_id uuid)
returns table(ad_work_id uuid, was_created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enquiry public.enquiries%rowtype;
  v_existing_id uuid;
  v_customer_id uuid;
  v_city_id uuid;
  v_ad_work_id uuid;
  v_start_date date;
  v_end_date date;
  v_day_count integer;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  select id into v_existing_id
  from public.ad_works
  where enquiry_id = p_enquiry_id
  limit 1;

  if v_existing_id is not null then
    return query select v_existing_id, false;
    return;
  end if;

  select * into v_enquiry
  from public.enquiries
  where id = p_enquiry_id;

  if not found then
    raise exception 'Enquiry not found' using errcode = 'P0002';
  end if;

  select id into v_customer_id
  from public.customers
  where trim(phone) = trim(v_enquiry.phone)
  order by created_at asc
  limit 1;

  if v_customer_id is null then
    insert into public.customers (
      source_enquiry_id,
      name,
      business_name,
      phone,
      city,
      notes
    )
    values (
      v_enquiry.id,
      trim(v_enquiry.customer_name),
      trim(v_enquiry.business_name),
      trim(v_enquiry.phone),
      trim(v_enquiry.city),
      nullif(trim(coalesce(v_enquiry.notes, '')), '')
    )
    returning id into v_customer_id;
  end if;

  select id into v_city_id
  from public.cities
  where lower(name) = lower(trim(v_enquiry.city))
  limit 1;

  v_start_date := coalesce(v_enquiry.preferred_start_date, current_date);
  v_day_count := greatest(coalesce(v_enquiry.number_of_days, 1), 1);
  v_end_date := v_start_date + (v_day_count - 1);

  insert into public.ad_works (
    customer_id,
    enquiry_id,
    title,
    city_id,
    start_date,
    end_date,
    status,
    package_type,
    customer_live_enabled,
    payment_status,
    notes,
    customer_name,
    business_name,
    customer_phone,
    city,
    areas_to_cover,
    advertisement_details,
    package_interest,
    live_tracking_requested,
    live_tracking_enabled,
    planning_status,
    number_of_days,
    photo_proof_needed,
    audio_video_proof_needed,
    area_update_needed,
    final_report_needed,
    customer_update_scheduled,
    customer_update_started,
    customer_update_in_progress,
    customer_update_area_covered,
    customer_update_completed,
    customer_update_report_ready
  )
  values (
    v_customer_id,
    v_enquiry.id,
    trim(v_enquiry.business_name) || ' Ad Work',
    v_city_id,
    v_start_date,
    v_end_date,
    'scheduled',
    case
      when v_enquiry.package_interest in ('basic', 'standard', 'premium')
        then v_enquiry.package_interest::public.package_type
      else 'basic'::public.package_type
    end,
    false,
    'not_paid',
    nullif(trim(coalesce(v_enquiry.notes, '')), ''),
    trim(v_enquiry.customer_name),
    trim(v_enquiry.business_name),
    trim(v_enquiry.phone),
    trim(v_enquiry.city),
    nullif(trim(coalesce(v_enquiry.required_areas, '')), ''),
    nullif(trim(coalesce(v_enquiry.message, '')), ''),
    coalesce(v_enquiry.package_interest, 'not_sure'),
    coalesce(v_enquiry.live_tracking_needed, 'not_sure'),
    false,
    'planned',
    v_day_count,
    true,
    false,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    false
  )
  returning id into v_ad_work_id;

  perform public.sync_ad_work_days(
    v_ad_work_id,
    v_start_date,
    v_day_count,
    null,
    null,
    nullif(trim(coalesce(v_enquiry.required_areas, '')), '')
  );

  if nullif(trim(coalesce(v_enquiry.required_areas, '')), '') is not null then
    insert into public.ad_work_areas (
      ad_work_id,
      custom_area_text,
      planned_area_text,
      status,
      manual_note
    )
    values (
      v_ad_work_id,
      trim(v_enquiry.required_areas),
      trim(v_enquiry.required_areas),
      'pending',
      'Planned from enquiry'
    );
  end if;

  update public.enquiries
  set status = 'converted',
      updated_at = now()
  where id = v_enquiry.id;

  return query select v_ad_work_id, true;
end;
$$;

revoke all on function public.sync_ad_work_days(uuid, date, integer, time, time, text) from public;
revoke all on function public.create_ad_work_from_enquiry(uuid) from public;
grant execute on function public.sync_ad_work_days(uuid, date, integer, time, time, text) to authenticated;
grant execute on function public.create_ad_work_from_enquiry(uuid) to authenticated;
