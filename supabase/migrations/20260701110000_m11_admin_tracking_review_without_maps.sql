create table if not exists public.location_proof_reviews (
  id uuid primary key default gen_random_uuid(),
  ad_work_id uuid not null references public.ad_works(id) on delete cascade,
  review_status text not null default 'not_reviewed',
  review_note text,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(ad_work_id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'location_proof_reviews_m11_status_check'
  ) then
    alter table public.location_proof_reviews
      add constraint location_proof_reviews_m11_status_check
      check (review_status in ('not_reviewed', 'reviewed', 'needs_follow_up', 'accepted', 'rejected', 'not_required'));
  end if;
end $$;

create index if not exists location_proof_reviews_status_updated_idx
  on public.location_proof_reviews(review_status, updated_at desc);

create index if not exists location_proof_reviews_reviewed_at_idx
  on public.location_proof_reviews(reviewed_at desc);

alter table public.location_proof_reviews enable row level security;

drop policy if exists "Admin users can view location proof reviews" on public.location_proof_reviews;
create policy "Admin users can view location proof reviews"
  on public.location_proof_reviews
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admin users can insert location proof reviews" on public.location_proof_reviews;
create policy "Admin users can insert location proof reviews"
  on public.location_proof_reviews
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Admin users can update location proof reviews" on public.location_proof_reviews;
create policy "Admin users can update location proof reviews"
  on public.location_proof_reviews
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admin users can delete location proof reviews" on public.location_proof_reviews;
create policy "Admin users can delete location proof reviews"
  on public.location_proof_reviews
  for delete
  to authenticated
  using (public.is_admin());

revoke all on public.location_proof_reviews from anon;
revoke all on public.location_proof_reviews from authenticated;
grant select, insert, update, delete on public.location_proof_reviews to authenticated;

create or replace function public.update_location_proof_review(
  p_ad_work_id uuid,
  p_review_status text,
  p_review_note text default null
)
returns table(
  review_id uuid,
  ad_work_id uuid,
  review_status text,
  review_note text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  result_message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := coalesce(nullif(trim(p_review_status), ''), 'not_reviewed');
  v_reviewed_at timestamptz;
  v_reviewed_by uuid;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if v_status not in ('not_reviewed', 'reviewed', 'needs_follow_up', 'accepted', 'rejected', 'not_required') then
    raise exception 'Invalid location proof review status' using errcode = '22023';
  end if;

  if not exists (select 1 from public.ad_works where id = p_ad_work_id) then
    raise exception 'Ad Work not found' using errcode = 'P0002';
  end if;

  if v_status = 'not_reviewed' then
    v_reviewed_at := null;
    v_reviewed_by := null;
  else
    v_reviewed_at := now();
    v_reviewed_by := auth.uid();
  end if;

  insert into public.location_proof_reviews (
    ad_work_id,
    review_status,
    review_note,
    reviewed_at,
    reviewed_by,
    updated_at
  )
  values (
    p_ad_work_id,
    v_status,
    nullif(trim(coalesce(p_review_note, '')), ''),
    v_reviewed_at,
    v_reviewed_by,
    now()
  )
  on conflict (ad_work_id) do update
  set review_status = excluded.review_status,
      review_note = excluded.review_note,
      reviewed_at = excluded.reviewed_at,
      reviewed_by = excluded.reviewed_by,
      updated_at = now();

  return query
  select
    review_row.id,
    review_row.ad_work_id,
    review_row.review_status,
    review_row.review_note,
    review_row.reviewed_at,
    review_row.reviewed_by,
    'Location Proof Review saved.'::text
  from public.location_proof_reviews review_row
  where review_row.ad_work_id = p_ad_work_id;
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
  v_days text;
  v_proofs text;
  v_updates text;
  v_location_proof_status text;
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

  select case
    when coalesce(v_ad_work.mobile_location_proof_required, false) is false then 'Phone Location Proof: Not required'
    when review_row.review_status in ('reviewed', 'accepted') then 'Phone Location Proof: Reviewed by admin'
    when review_row.review_status in ('needs_follow_up', 'rejected') then 'Phone Location Proof: Needs follow-up'
    when review_row.review_status = 'not_required' then 'Phone Location Proof: Not required'
    else 'Phone Location Proof: Not available'
  end into v_location_proof_status
  from (select 1) base_row
  left join lateral (
    select review_status
    from public.location_proof_reviews
    where ad_work_id = p_ad_work_id
    limit 1
  ) review_row on true;

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
    'Location proof summary:',
    coalesce(v_location_proof_status, 'Phone Location Proof: Not available'),
    'Closure section:',
    'Closure status: ' || replace(coalesce(v_ad_work.closure_status, 'not_ready'), '_', ' '),
    'Closure Note: ' || coalesce(nullif(trim(v_ad_work.closure_note), ''), 'Not set'),
    'Customer Accepted: ' || replace(coalesce(v_ad_work.closure_customer_accepted, 'not_confirmed'), '_', ' '),
    'Closed time: ' || coalesce(v_ad_work.closure_closed_at::text, 'Not closed'),
    'GPS, route, map, and live tracking proof are not included in this version.'
  );
end;
$$;

revoke all on function public.update_location_proof_review(uuid, text, text) from public;
grant execute on function public.update_location_proof_review(uuid, text, text) to authenticated;
revoke all on function public.m8_build_final_summary_text(uuid) from public;
