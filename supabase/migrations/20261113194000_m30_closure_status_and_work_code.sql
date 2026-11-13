-- M30: closure status and Work Code access after closure.
--
-- 1. Every job that needed photo proof closed as "Closed with Issues".
--    prepare_final_proof_summary always adds the note "GPS proof is not
--    available in this version." for such work, and the closure function
--    treated any warning at all as an issue. A job finished with every day
--    completed, proof approved and updates shared could never be "Closed".
--    Closure now ignores the two informational notes when choosing the status.
--    Body otherwise unchanged from 20260822133000_m28_final_closure_lock_order_closure.sql.
-- 2. After closure the driver's Work Code still opened the job, and the driver
--    could still add notes or report an issue on it. Closing a job now ends
--    Work Code access.
set search_path = public;

create or replace function public.close_flexible_ad_work_with_final_summary(
  p_ad_work_id uuid, p_closure_reason text default null, p_closure_note text default null,
  p_customer_accepted text default 'not_confirmed', p_internal_admin_note text default null,
  p_proof_not_required boolean default false, p_customer_updates_reviewed boolean default false,
  p_include_phone_location_proof boolean default false, p_phone_location_proof_customer_note text default null,
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
  v_status text;
  v_summary_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_customer_accepted not in ('yes', 'no', 'not_confirmed') then
    raise exception 'Invalid customer accepted value' using errcode = '22000';
  end if;

  -- Canonical M21/M28 ordering: take transaction authority before the first
  -- parent/day/session/assignment row lock. This prevents final closure from
  -- forming an inverse lock cycle with an M28 mutation.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('m21-authority-global', 2100)
  );

  select * into v_ad_work
  from public.ad_works
  where id = p_ad_work_id
  for update;
  if not found then
    raise exception 'Ad Work not found' using errcode = 'P0002';
  end if;

  if v_ad_work.execution_mode = 'driver_app' then
    if v_ad_work.execution_release_status <> 'released_to_driver' then
      raise exception 'Send work to the driver before finishing it' using errcode = '22000';
    end if;
    if not exists (
      select 1
      from public.ad_work_assignments assignment_row
      where assignment_row.ad_work_id = p_ad_work_id
        and assignment_row.status = 'ready_for_execution'
    ) then
      raise exception 'Choose an approved driver before finishing work' using errcode = '22000';
    end if;
  end if;

  select * into v_prepare
  from public.prepare_flexible_final_proof_summary(
    p_ad_work_id,
    true,
    p_proof_not_required,
    true,
    p_internal_admin_note,
    p_include_phone_location_proof,
    p_phone_location_proof_customer_note,
    p_phone_location_proof_customer_safe_confirmed
  )
  limit 1;

  -- Two warnings are notes about what this version does not include. They stay
  -- on the summary for the admin to read, but they are not problems with the
  -- job, so on their own they do not make it "Closed with Issues".
  v_status := case
    when exists (
      select 1
      from unnest(coalesce(v_prepare.warnings, '{}'::text[])) as warning_row(warning_text)
      where warning_row.warning_text not in (
        'GPS proof is not available in this version.',
        'Premium live tracking was requested but not enabled in this MVP.'
      )
    ) then 'closed_with_issues'
    else 'closed'
  end;

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
      warnings = v_prepare.warnings,
      closed_at = now(),
      closed_by = auth.uid(),
      closure_reason = nullif(trim(coalesce(p_closure_reason, '')), ''),
      closure_note = nullif(trim(coalesce(p_closure_note, '')), ''),
      customer_accepted = p_customer_accepted,
      internal_admin_note = nullif(trim(coalesce(p_internal_admin_note, '')), ''),
      updated_at = now()
  where final_proof_summaries.ad_work_id = p_ad_work_id
  returning id into v_summary_id;

  return query
  select p_ad_work_id,
         v_summary_id,
         v_status,
         v_prepare.warnings,
         'Ad Work closed.'::text;
end;
$$;

-- Ending access on closure.
--
-- The stored digest is replaced with a value that cannot match, not with NULL.
-- Some driver functions refuse a caller with "digest <> m6_hash_work_code(code)"
-- inside an IF; a NULL digest would make that comparison NULL and let any code
-- through while the work still reads as released.
create or replace function public.m30_end_work_code_on_closure()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.closure_status in ('closed', 'closed_with_issues')
    and new.closure_status is distinct from old.closure_status
    and new.work_access_code_hash is not null
    and new.work_access_code_hash not like 'closed:%' then
    new.work_access_code_hash := 'closed:' || new.work_access_code_hash;
  end if;
  return new;
end;
$$;

revoke all on function public.m30_end_work_code_on_closure() from public;
revoke all on function public.m30_end_work_code_on_closure() from anon;
revoke all on function public.m30_end_work_code_on_closure() from authenticated;

drop trigger if exists m30_end_work_code_on_closure on public.ad_works;
create trigger m30_end_work_code_on_closure
  before update of closure_status on public.ad_works
  for each row
  execute function public.m30_end_work_code_on_closure();
