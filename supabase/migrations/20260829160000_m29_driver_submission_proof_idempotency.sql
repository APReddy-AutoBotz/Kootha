alter table public.driver_applications
  add column if not exists client_submission_id text;

alter table public.proof_uploads
  add column if not exists client_request_id text;

create unique index if not exists driver_applications_client_submission_id_unique
  on public.driver_applications (client_submission_id)
  where client_submission_id is not null;

create unique index if not exists proof_uploads_client_request_id_unique
  on public.proof_uploads (client_request_id)
  where client_request_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'driver_applications_m29_client_submission_id_check'
  ) then
    alter table public.driver_applications
      add constraint driver_applications_m29_client_submission_id_check
      check (
        client_submission_id is null
        or (
          length(client_submission_id) between 16 and 96
          and client_submission_id = lower(client_submission_id)
          and client_submission_id ~ '^[a-z0-9-]+$'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'proof_uploads_m29_client_request_id_check'
  ) then
    alter table public.proof_uploads
      add constraint proof_uploads_m29_client_request_id_check
      check (
        client_request_id is null
        or (
          length(client_request_id) between 16 and 96
          and client_request_id = lower(client_request_id)
          and client_request_id ~ '^[a-z0-9-]+$'
        )
      );
  end if;
end $$;

drop policy if exists "Public driver app can insert applications" on public.driver_applications;
revoke all on public.driver_applications from anon;

create or replace function public.submit_driver_application(
  p_client_submission_id text,
  p_driver_name text,
  p_phone text,
  p_city text,
  p_service_areas text,
  p_vehicle_ownership text,
  p_vehicle_type text,
  p_vehicle_number text,
  p_mic_system_available boolean,
  p_gps_device_available text,
  p_preferred_working_cities text,
  p_notes text,
  p_contact_consent boolean,
  p_company_website text
)
returns table(application_id uuid, result_message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_application public.driver_applications%rowtype;
  v_client_submission_id text := lower(nullif(trim(coalesce(p_client_submission_id, '')), ''));
  v_driver_name text := nullif(trim(coalesce(p_driver_name, '')), '');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_city text := nullif(trim(coalesce(p_city, '')), '');
  v_service_areas text := nullif(trim(coalesce(p_service_areas, '')), '');
  v_vehicle_number text := nullif(trim(coalesce(p_vehicle_number, '')), '');
  v_preferred_working_cities text := nullif(trim(coalesce(p_preferred_working_cities, '')), '');
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
begin
  if v_client_submission_id is null
    or length(v_client_submission_id) not between 16 and 96
    or v_client_submission_id !~ '^[a-z0-9-]+$' then
    raise exception 'Valid application request id is required' using errcode = '22000';
  end if;

  if v_driver_name is null or length(v_driver_name) > 100 then
    raise exception 'Driver name is required' using errcode = '22000';
  end if;

  if v_phone is null or length(v_phone) not between 7 and 20 then
    raise exception 'Valid mobile number is required' using errcode = '22000';
  end if;

  if v_city is null or length(v_city) > 80 then
    raise exception 'City or town is required' using errcode = '22000';
  end if;

  if length(coalesce(v_service_areas, '')) > 600
    or length(coalesce(v_vehicle_number, '')) > 40
    or length(coalesce(v_preferred_working_cities, '')) > 400
    or length(coalesce(v_notes, '')) > 800 then
    raise exception 'Application details are too long' using errcode = '22000';
  end if;

  if p_vehicle_ownership not in ('own_vehicle', 'hired_vehicle', 'driver_only')
    or p_vehicle_type not in ('auto', 'car', 'van', 'small_truck', 'other')
    or p_gps_device_available not in ('yes', 'no', 'not_sure') then
    raise exception 'Invalid vehicle details' using errcode = '22000';
  end if;

  if p_vehicle_ownership <> 'driver_only' and v_vehicle_number is null then
    raise exception 'Vehicle number is required' using errcode = '22000';
  end if;

  if coalesce(p_contact_consent, false) is false then
    raise exception 'Contact consent is required' using errcode = '22000';
  end if;

  if nullif(trim(coalesce(p_company_website, '')), '') is not null then
    raise exception 'Application could not be submitted' using errcode = '22000';
  end if;

  insert into public.driver_applications (
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
    company_website,
    client_submission_id
  ) values (
    v_driver_name,
    v_phone,
    v_city,
    v_service_areas,
    p_vehicle_ownership,
    p_vehicle_type,
    v_vehicle_number,
    coalesce(p_mic_system_available, false),
    p_gps_device_available,
    v_preferred_working_cities,
    v_notes,
    true,
    'new',
    null,
    v_client_submission_id
  )
  on conflict (client_submission_id) where client_submission_id is not null do nothing;

  select application.* into v_application
  from public.driver_applications application
  where application.client_submission_id = v_client_submission_id;

  if v_application.driver_name is distinct from v_driver_name
    or v_application.phone is distinct from v_phone
    or v_application.city is distinct from v_city
    or v_application.service_areas is distinct from v_service_areas
    or v_application.vehicle_ownership is distinct from p_vehicle_ownership
    or v_application.vehicle_type is distinct from p_vehicle_type
    or v_application.vehicle_number is distinct from v_vehicle_number
    or v_application.mic_system_available is distinct from coalesce(p_mic_system_available, false)
    or v_application.gps_device_available is distinct from p_gps_device_available
    or v_application.preferred_working_cities is distinct from v_preferred_working_cities
    or v_application.notes is distinct from v_notes
    or v_application.contact_consent is distinct from true then
    raise exception 'Application request id was already used for different details' using errcode = '22000';
  end if;

  return query select v_application.id, 'Application submitted.'::text;
end;
$$;

revoke all on function public.submit_driver_application(text, text, text, text, text, text, text, text, boolean, text, text, text, boolean, text) from public;
grant execute on function public.submit_driver_application(text, text, text, text, text, text, text, text, boolean, text, text, text, boolean, text) to anon;

drop function if exists public.request_driver_proof_upload(text, text, uuid, text, text, text, text, integer);

create or replace function public.request_driver_proof_upload(
  p_mobile text,
  p_work_code text,
  p_ad_work_day_id uuid,
  p_proof_type text,
  p_area_place_name text,
  p_note_text text,
  p_file_mime_type text,
  p_file_size_bytes integer,
  p_client_request_id text
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

  if v_day.work_date <> current_date then
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

create or replace function public.complete_driver_proof_upload(
  p_mobile text,
  p_work_code text,
  p_proof_upload_id uuid
)
returns table(proof_upload_id uuid, upload_status text, result_message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proof public.proof_uploads%rowtype;
  v_message text;
begin
  select proof.* into v_proof
  from public.proof_uploads proof
  join public.ad_works aw on aw.id = proof.ad_work_id
  join public.ad_work_assignments assignment on assignment.id = proof.assignment_id
  join public.drivers driver_record on driver_record.id = proof.driver_id
  where proof.id = p_proof_upload_id
    and aw.execution_release_status = 'released_to_driver'
    and aw.work_access_code_hash = public.m6_hash_work_code(p_work_code)
    and assignment.driver_id = proof.driver_id
    and public.m6_normalize_mobile(driver_record.phone) = public.m6_normalize_mobile(p_mobile)
  for update of proof;

  if not found then
    raise exception 'Invalid work code or mobile number' using errcode = '42501';
  end if;

  if v_proof.upload_status = 'uploaded' then
    return query select v_proof.id, 'uploaded'::text, 'Proof upload already completed.'::text;
    return;
  end if;

  if v_proof.upload_status <> 'pending_upload' then
    raise exception 'Proof upload is not waiting for a photo' using errcode = '22000';
  end if;

  if not exists (
    select 1
    from storage.objects object_row
    where object_row.bucket_id = v_proof.file_bucket
      and object_row.name = v_proof.file_path
  ) then
    raise exception 'Proof photo was not uploaded' using errcode = 'P0002';
  end if;

  update public.proof_uploads
  set upload_status = 'uploaded',
      updated_at = now()
  where id = v_proof.id;

  v_message := 'Photo proof was added for ' || v_proof.area_place_name || '.';
  insert into public.customer_updates (ad_work_id, ad_work_day_id, type, message, channel, sent_status, sharing_status, updated_at)
  values (
    v_proof.ad_work_id,
    v_proof.ad_work_day_id,
    case when v_proof.proof_type = 'area_covered' then 'area_covered'::public.customer_update_type else 'manual'::public.customer_update_type end,
    v_message,
    'copy',
    'draft',
    'pending_sharing',
    now()
  );

  return query select v_proof.id, 'uploaded'::text, 'Proof Sent.'::text;
end;
$$;

revoke all on function public.request_driver_proof_upload(text, text, uuid, text, text, text, text, integer, text) from public;
grant execute on function public.request_driver_proof_upload(text, text, uuid, text, text, text, text, integer, text) to anon;

revoke all on function public.complete_driver_proof_upload(text, text, uuid) from public;
grant execute on function public.complete_driver_proof_upload(text, text, uuid) to anon;
