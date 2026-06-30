create table if not exists public.driver_applications (
  id uuid primary key default gen_random_uuid(),
  driver_name text not null,
  phone text not null,
  city text not null,
  service_areas text,
  vehicle_ownership text not null default 'own_vehicle',
  vehicle_type text not null,
  vehicle_number text,
  mic_system_available boolean not null default false,
  gps_device_available text not null default 'not_sure',
  preferred_working_cities text,
  notes text,
  contact_consent boolean not null default false,
  company_website text,
  status text not null default 'new',
  admin_note text,
  follow_up_date date,
  rejection_reason text,
  approval_note text,
  linked_driver_id uuid references public.drivers(id) on delete set null,
  linked_vehicle_id uuid references public.vehicles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.drivers
  add column if not exists source_application_id uuid references public.driver_applications(id) on delete set null,
  add column if not exists onboarding_status text not null default 'pending_review',
  add column if not exists availability_status_text text not null default 'unknown',
  add column if not exists admin_note text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.vehicles
  add column if not exists source_application_id uuid references public.driver_applications(id) on delete set null,
  add column if not exists onboarding_status text not null default 'pending_review',
  add column if not exists mic_system_available boolean not null default false,
  add column if not exists gps_device_available text not null default 'not_sure',
  add column if not exists gps_device_status text not null default 'none',
  add column if not exists gps_provider_name text,
  add column if not exists gps_device_identifier text,
  add column if not exists admin_note text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists vehicles_vehicle_number_unique
  on public.vehicles (lower(trim(vehicle_number)))
  where nullif(trim(vehicle_number), '') is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'driver_applications_status_check'
  ) then
    alter table public.driver_applications
      add constraint driver_applications_status_check
      check (status in ('new', 'under_review', 'approved', 'needs_more_info', 'rejected', 'duplicate'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'driver_applications_vehicle_ownership_check'
  ) then
    alter table public.driver_applications
      add constraint driver_applications_vehicle_ownership_check
      check (vehicle_ownership in ('own_vehicle', 'hired_vehicle', 'driver_only'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'driver_applications_vehicle_type_check'
  ) then
    alter table public.driver_applications
      add constraint driver_applications_vehicle_type_check
      check (vehicle_type in ('auto', 'car', 'van', 'small_truck', 'other'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'driver_applications_gps_device_available_check'
  ) then
    alter table public.driver_applications
      add constraint driver_applications_gps_device_available_check
      check (gps_device_available in ('yes', 'no', 'not_sure'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'driver_applications_required_vehicle_number_check'
  ) then
    alter table public.driver_applications
      add constraint driver_applications_required_vehicle_number_check
      check (
        vehicle_ownership = 'driver_only'
        or nullif(trim(coalesce(vehicle_number, '')), '') is not null
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'drivers_onboarding_status_check'
  ) then
    alter table public.drivers
      add constraint drivers_onboarding_status_check
      check (onboarding_status in ('pending_review', 'approved', 'inactive', 'blocked'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'drivers_availability_status_text_check'
  ) then
    alter table public.drivers
      add constraint drivers_availability_status_text_check
      check (availability_status_text in ('available', 'not_available', 'busy', 'unknown'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'vehicles_onboarding_status_check'
  ) then
    alter table public.vehicles
      add constraint vehicles_onboarding_status_check
      check (onboarding_status in ('pending_review', 'approved', 'inactive', 'blocked'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'vehicles_vehicle_type_check'
  ) then
    alter table public.vehicles
      add constraint vehicles_vehicle_type_check
      check (vehicle_type in ('auto', 'car', 'van', 'small_truck', 'other'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'vehicles_gps_device_available_check'
  ) then
    alter table public.vehicles
      add constraint vehicles_gps_device_available_check
      check (gps_device_available in ('yes', 'no', 'not_sure'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'vehicles_gps_device_status_check'
  ) then
    alter table public.vehicles
      add constraint vehicles_gps_device_status_check
      check (gps_device_status in ('none', 'planned', 'installed', 'not_working'));
  end if;
end $$;

alter table public.driver_applications enable row level security;
alter table public.drivers enable row level security;
alter table public.vehicles enable row level security;
alter table public.gps_devices enable row level security;

drop policy if exists "Public driver app can insert applications" on public.driver_applications;
create policy "Public driver app can insert applications"
  on public.driver_applications
  for insert
  to anon
  with check (
    status = 'new'
    and contact_consent is true
    and nullif(trim(driver_name), '') is not null
    and length(trim(phone)) >= 7
    and nullif(trim(city), '') is not null
    and vehicle_type in ('auto', 'car', 'van', 'small_truck', 'other')
    and vehicle_ownership in ('own_vehicle', 'hired_vehicle', 'driver_only')
    and (
      vehicle_ownership = 'driver_only'
      or nullif(trim(coalesce(vehicle_number, '')), '') is not null
    )
    and gps_device_available in ('yes', 'no', 'not_sure')
    and nullif(trim(coalesce(company_website, '')), '') is null
  );

drop policy if exists "Admin users can view driver applications" on public.driver_applications;
create policy "Admin users can view driver applications"
  on public.driver_applications
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admin users can insert driver applications" on public.driver_applications;
create policy "Admin users can insert driver applications"
  on public.driver_applications
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Admin users can update driver applications" on public.driver_applications;
create policy "Admin users can update driver applications"
  on public.driver_applications
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admin users can view drivers" on public.drivers;
create policy "Admin users can view drivers"
  on public.drivers
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admin users can insert drivers" on public.drivers;
create policy "Admin users can insert drivers"
  on public.drivers
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Admin users can update drivers" on public.drivers;
create policy "Admin users can update drivers"
  on public.drivers
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admin users can view vehicles" on public.vehicles;
create policy "Admin users can view vehicles"
  on public.vehicles
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admin users can insert vehicles" on public.vehicles;
create policy "Admin users can insert vehicles"
  on public.vehicles
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Admin users can update vehicles" on public.vehicles;
create policy "Admin users can update vehicles"
  on public.vehicles
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admin users can view gps devices" on public.gps_devices;
create policy "Admin users can view gps devices"
  on public.gps_devices
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admin users can insert gps devices" on public.gps_devices;
create policy "Admin users can insert gps devices"
  on public.gps_devices
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Admin users can update gps devices" on public.gps_devices;
create policy "Admin users can update gps devices"
  on public.gps_devices
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.driver_applications from anon;
revoke all on public.driver_applications from authenticated;
revoke all on public.drivers from anon;
revoke all on public.drivers from authenticated;
revoke all on public.vehicles from anon;
revoke all on public.vehicles from authenticated;
revoke all on public.gps_devices from anon;
revoke all on public.gps_devices from authenticated;

grant insert (
  driver_name,
  phone,
  city,
  service_areas,
  vehicle_ownership,
  vehicle_type,
  vehicle_number,
  mic_system_available,
  gps_device_available,
  preferred_working_cities,
  notes,
  contact_consent,
  status,
  company_website
) on public.driver_applications to anon;

grant select, insert, update on public.driver_applications to authenticated;
grant select, insert, update on public.drivers to authenticated;
grant select, insert, update on public.vehicles to authenticated;
grant select, insert, update on public.gps_devices to authenticated;

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

revoke all on function public.review_driver_application(uuid, text, text, date, text, text) from public;
grant execute on function public.review_driver_application(uuid, text, text, date, text, text) to authenticated;
