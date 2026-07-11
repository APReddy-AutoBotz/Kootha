create or replace function public.request_admin_proof_upload(
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
  v_day public.ad_work_days%rowtype;
  v_extension text;
  v_proof_id uuid := gen_random_uuid();
  v_path text;
  v_area text := nullif(trim(coalesce(p_area_place_name, '')), '');
  v_note text := nullif(trim(coalesce(p_note_text, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  select * into v_day
  from public.ad_work_days
  where id = p_ad_work_day_id;

  if not found then
    raise exception 'Work day not found' using errcode = 'P0002';
  end if;

  select * into v_ad_work
  from public.ad_works
  where id = v_day.ad_work_id;

  if v_ad_work.execution_mode <> 'admin_managed' then
    raise exception 'Admin proof upload is only available for team-managed work' using errcode = '22000';
  end if;

  if v_day.execution_status not in ('running', 'on_break') then
    raise exception 'Add photo proof while work is running' using errcode = '22000';
  end if;

  if p_proof_type not in ('area_covered', 'announcement_done', 'customer_request', 'issue', 'other') then
    raise exception 'Invalid proof type' using errcode = '22000';
  end if;

  if v_note is null then
    raise exception 'Proof note is required' using errcode = '22000';
  end if;

  if v_ad_work.areas_required and v_area is null then
    raise exception 'Area or place is required' using errcode = '22000';
  end if;

  v_extension := public.m7_file_extension_for_mime(p_file_mime_type);
  if v_extension is null then
    raise exception 'Photo must be JPEG, PNG, or WebP' using errcode = '22000';
  end if;

  if p_file_size_bytes is null or p_file_size_bytes <= 0 or p_file_size_bytes > 5242880 then
    raise exception 'Photo must be 5 MB or smaller' using errcode = '22000';
  end if;

  v_path := 'ad-works/' || v_ad_work.id || '/days/' || v_day.id || '/' || v_proof_id || '-' || substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 16) || '.' || v_extension;

  insert into public.proof_uploads (
    id, ad_work_id, ad_work_day_id, assignment_id, driver_id, vehicle_id,
    type, proof_type, area_place_name, note, note_text, file_bucket, file_path,
    file_mime_type, file_size_bytes, uploaded_by, upload_status, review_status, updated_at
  ) values (
    v_proof_id, v_ad_work.id, v_day.id, null, null, null,
    'photo', p_proof_type, v_area, v_note, v_note, 'proof-photos', v_path,
    lower(trim(p_file_mime_type)), p_file_size_bytes, auth.uid(), 'pending_upload', 'waiting_review', now()
  );

  return query select v_proof_id, 'proof-photos'::text, v_path, 'pending_upload'::text, 'Ready for photo upload.'::text;
end;
$$;

create or replace function public.complete_admin_proof_upload(p_proof_upload_id uuid)
returns table(proof_upload_id uuid, upload_status text, result_message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proof public.proof_uploads%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  select proof.* into v_proof
  from public.proof_uploads proof
  join public.ad_works aw on aw.id = proof.ad_work_id
  where proof.id = p_proof_upload_id
    and proof.uploaded_by = auth.uid()
    and aw.execution_mode = 'admin_managed'
  for update of proof;

  if not found then
    raise exception 'Proof upload not found' using errcode = 'P0002';
  end if;

  if v_proof.upload_status <> 'pending_upload' then
    raise exception 'Proof upload is not waiting for a photo' using errcode = '22000';
  end if;

  if not exists (
    select 1 from storage.objects object_row
    where object_row.bucket_id = v_proof.file_bucket and object_row.name = v_proof.file_path
  ) then
    raise exception 'Proof photo was not uploaded' using errcode = 'P0002';
  end if;

  update public.proof_uploads
  set upload_status = 'uploaded', updated_at = now()
  where id = v_proof.id;

  insert into public.customer_updates (ad_work_id, ad_work_day_id, type, message, channel, sent_status, sharing_status, updated_at)
  values (
    v_proof.ad_work_id,
    v_proof.ad_work_day_id,
    case when v_proof.proof_type = 'area_covered' then 'area_covered'::public.customer_update_type else 'manual'::public.customer_update_type end,
    'Photo proof was added' || case when v_proof.area_place_name is null then '.' else ' for ' || v_proof.area_place_name || '.' end,
    'copy', 'draft', 'pending_sharing', now()
  );

  return query select v_proof.id, 'uploaded'::text, 'Photo proof added.'::text;
end;
$$;

drop policy if exists "Admin users can upload proof photo objects" on storage.objects;
create policy "Admin users can upload proof photo objects"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'proof-photos'
    and public.is_admin()
    and exists (
      select 1 from public.proof_uploads proof
      where proof.file_bucket = bucket_id
        and proof.file_path = name
        and proof.uploaded_by = auth.uid()
        and proof.upload_status = 'pending_upload'
    )
  );

revoke all on function public.request_admin_proof_upload(uuid, text, text, text, text, integer) from public;
grant execute on function public.request_admin_proof_upload(uuid, text, text, text, text, integer) to authenticated;

revoke all on function public.complete_admin_proof_upload(uuid) from public;
grant execute on function public.complete_admin_proof_upload(uuid) to authenticated;
