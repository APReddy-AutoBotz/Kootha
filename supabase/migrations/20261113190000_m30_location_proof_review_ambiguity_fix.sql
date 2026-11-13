-- M30 fix: update_location_proof_review could never run.
--
-- The function RETURNS TABLE (..., ad_work_id uuid, ...), so inside the body
-- "ad_work_id" is both an output variable and a column. PL/pgSQL rejected the
-- "on conflict (ad_work_id)" target with 42702 "column reference is ambiguous"
-- on every call, which meant an admin could not save a Location Proof Review
-- and therefore could not include Phone Location Proof in a final summary.
-- Found by the end-to-end flow check; the body is otherwise unchanged.
set search_path = public;

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
#variable_conflict use_column
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

revoke all on function public.update_location_proof_review(uuid, text, text) from public;
grant execute on function public.update_location_proof_review(uuid, text, text) to authenticated;
