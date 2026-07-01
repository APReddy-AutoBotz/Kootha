insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proof-photos', 'proof-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

alter table public.proof_uploads
  add column if not exists ad_work_id uuid references public.ad_works(id) on delete cascade,
  add column if not exists assignment_id uuid references public.ad_work_assignments(id) on delete restrict,
  add column if not exists driver_id uuid references public.drivers(id) on delete restrict,
  add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null,
  add column if not exists proof_type text not null default 'other',
  add column if not exists area_place_name text,
  add column if not exists note_text text,
  add column if not exists file_bucket text not null default 'proof-photos',
  add column if not exists file_mime_type text,
  add column if not exists file_size_bytes integer,
  add column if not exists upload_status text not null default 'pending_upload',
  add column if not exists review_status text not null default 'waiting_review',
  add column if not exists admin_review_note text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid,
  add column if not exists updated_at timestamptz not null default now();

alter table public.customer_updates
  add column if not exists sharing_status text not null default 'pending_sharing',
  add column if not exists sharing_method text,
  add column if not exists sharing_note text,
  add column if not exists shared_at timestamptz,
  add column if not exists shared_by uuid,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists proof_uploads_file_bucket_path_unique
  on public.proof_uploads(file_bucket, file_path);

create index if not exists proof_uploads_review_status_idx
  on public.proof_uploads(review_status, created_at desc);

create index if not exists customer_updates_sharing_status_idx
  on public.customer_updates(sharing_status, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'proof_uploads_m7_photo_only_check'
  ) then
    alter table public.proof_uploads
      add constraint proof_uploads_m7_photo_only_check
      check (type = 'photo');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'proof_uploads_m7_proof_type_check'
  ) then
    alter table public.proof_uploads
      add constraint proof_uploads_m7_proof_type_check
      check (proof_type in ('area_covered', 'announcement_done', 'customer_request', 'issue', 'other'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'proof_uploads_m7_upload_status_check'
  ) then
    alter table public.proof_uploads
      add constraint proof_uploads_m7_upload_status_check
      check (upload_status in ('pending_upload', 'uploaded', 'failed', 'cancelled'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'proof_uploads_m7_review_status_check'
  ) then
    alter table public.proof_uploads
      add constraint proof_uploads_m7_review_status_check
      check (review_status in ('waiting_review', 'approved', 'rejected', 'needs_more_info'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'proof_uploads_m7_file_bucket_check'
  ) then
    alter table public.proof_uploads
      add constraint proof_uploads_m7_file_bucket_check
      check (file_bucket = 'proof-photos');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'proof_uploads_m7_file_mime_type_check'
  ) then
    alter table public.proof_uploads
      add constraint proof_uploads_m7_file_mime_type_check
      check (file_mime_type is null or file_mime_type in ('image/jpeg', 'image/png', 'image/webp'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'proof_uploads_m7_file_size_check'
  ) then
    alter table public.proof_uploads
      add constraint proof_uploads_m7_file_size_check
      check (file_size_bytes is null or (file_size_bytes > 0 and file_size_bytes <= 5242880));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'customer_updates_m7_sharing_status_check'
  ) then
    alter table public.customer_updates
      add constraint customer_updates_m7_sharing_status_check
      check (sharing_status in ('pending_sharing', 'shared_manually'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'customer_updates_m7_sharing_method_check'
  ) then
    alter table public.customer_updates
      add constraint customer_updates_m7_sharing_method_check
      check (sharing_method is null or sharing_method in ('phone_call', 'manual_whatsapp', 'manual_sms', 'in_person', 'other'));
  end if;
end $$;

alter table public.proof_uploads enable row level security;
alter table public.customer_updates enable row level security;

drop policy if exists "Admin users can view proof uploads" on public.proof_uploads;
create policy "Admin users can view proof uploads"
  on public.proof_uploads
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admin users can insert proof uploads" on public.proof_uploads;
create policy "Admin users can insert proof uploads"
  on public.proof_uploads
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Admin users can update proof uploads" on public.proof_uploads;
create policy "Admin users can update proof uploads"
  on public.proof_uploads
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.proof_uploads from anon;
revoke all on public.proof_uploads from authenticated;
grant select, insert, update on public.proof_uploads to authenticated;

create or replace function public.m7_file_extension_for_mime(p_file_mime_type text)
returns text
language sql
immutable
set search_path = public
as $$
  select case lower(trim(coalesce(p_file_mime_type, '')))
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    else null
  end;
$$;

create or replace function public.is_valid_proof_upload_path(p_bucket text, p_path text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.proof_uploads proof
    where proof.file_bucket = p_bucket
      and proof.file_path = p_path
      and proof.upload_status = 'pending_upload'
      and proof.review_status = 'waiting_review'
  );
$$;

create or replace function public.request_driver_proof_upload(
  p_mobile text,
  p_work_code text,
  p_ad_work_day_id uuid,
  p_proof_type text,
  p_area_place_name text,
  p_note_text text,
  p_file_mime_type text,
  p_file_size_bytes integer
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
  v_extension text;
  v_proof_id uuid := gen_random_uuid();
  v_path text;
  v_area text := nullif(trim(coalesce(p_area_place_name, '')), '');
  v_note text := nullif(trim(coalesce(p_note_text, '')), '');
  v_proof_type text := coalesce(nullif(trim(p_proof_type), ''), 'other');
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
    now()
  );

  return query select v_proof_id, 'proof-photos'::text, v_path, 'pending_upload'::text, 'Upload slot ready.'::text;
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

  if v_proof.upload_status <> 'pending_upload' then
    raise exception 'Proof upload is not waiting for a photo' using errcode = '22000';
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

create or replace function public.review_proof_upload(
  p_proof_upload_id uuid,
  p_review_status text,
  p_admin_review_note text default null
)
returns table(proof_upload_id uuid, review_status text, result_message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proof public.proof_uploads%rowtype;
  v_note text := nullif(trim(coalesce(p_admin_review_note, '')), '');
  v_message text;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if p_review_status not in ('waiting_review', 'approved', 'rejected', 'needs_more_info') then
    raise exception 'Invalid proof review status' using errcode = '22000';
  end if;

  select * into v_proof
  from public.proof_uploads
  where id = p_proof_upload_id
  for update;

  if not found then
    raise exception 'Proof upload not found' using errcode = 'P0002';
  end if;

  update public.proof_uploads
  set review_status = p_review_status,
      admin_review_note = v_note,
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      updated_at = now()
  where id = v_proof.id;

  if p_review_status = 'approved' and v_proof.upload_status = 'uploaded' then
    v_message := 'Proof from ' || coalesce(v_proof.area_place_name, 'the work area') || ' was checked by our team.';
    insert into public.customer_updates (ad_work_id, ad_work_day_id, type, message, channel, sent_status, sharing_status, updated_at)
    values (v_proof.ad_work_id, v_proof.ad_work_day_id, 'manual', v_message, 'copy', 'draft', 'pending_sharing', now());
  end if;

  return query select v_proof.id, p_review_status, 'Proof review saved.'::text;
end;
$$;

create or replace function public.mark_customer_update_shared(
  p_customer_update_id uuid,
  p_sharing_method text,
  p_sharing_note text default null
)
returns table(customer_update_id uuid, sharing_status text, result_message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel public.customer_update_channel := 'copy';
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if p_sharing_method not in ('phone_call', 'manual_whatsapp', 'manual_sms', 'in_person', 'other') then
    raise exception 'Invalid sharing method' using errcode = '22000';
  end if;

  if p_sharing_method = 'manual_whatsapp' then
    v_channel := 'whatsapp';
  elsif p_sharing_method = 'manual_sms' then
    v_channel := 'sms';
  end if;

  update public.customer_updates
  set sharing_status = 'shared_manually',
      sharing_method = p_sharing_method,
      sharing_note = nullif(trim(coalesce(p_sharing_note, '')), ''),
      shared_at = now(),
      shared_by = auth.uid(),
      channel = v_channel,
      sent_status = 'copied',
      sent_at = now(),
      updated_at = now()
  where id = p_customer_update_id;

  if not found then
    raise exception 'Customer update not found' using errcode = 'P0002';
  end if;

  return query select p_customer_update_id, 'shared_manually'::text, 'Customer Update marked as shared.'::text;
end;
$$;

drop policy if exists "Admin users can read proof photo objects" on storage.objects;
create policy "Admin users can read proof photo objects"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'proof-photos' and public.is_admin());

drop policy if exists "Validated driver app can upload proof photos" on storage.objects;
create policy "Validated driver app can upload proof photos"
  on storage.objects
  for insert
  to anon
  with check (bucket_id = 'proof-photos' and public.is_valid_proof_upload_path(bucket_id, name));

revoke all on function public.m7_file_extension_for_mime(text) from public;
grant execute on function public.m7_file_extension_for_mime(text) to anon, authenticated;

revoke all on function public.is_valid_proof_upload_path(text, text) from public;
grant execute on function public.is_valid_proof_upload_path(text, text) to anon;

revoke all on function public.request_driver_proof_upload(text, text, uuid, text, text, text, text, integer) from public;
grant execute on function public.request_driver_proof_upload(text, text, uuid, text, text, text, text, integer) to anon;

revoke all on function public.complete_driver_proof_upload(text, text, uuid) from public;
grant execute on function public.complete_driver_proof_upload(text, text, uuid) to anon;

revoke all on function public.review_proof_upload(uuid, text, text) from public;
grant execute on function public.review_proof_upload(uuid, text, text) to authenticated;

revoke all on function public.mark_customer_update_shared(uuid, text, text) from public;
grant execute on function public.mark_customer_update_shared(uuid, text, text) to authenticated;
