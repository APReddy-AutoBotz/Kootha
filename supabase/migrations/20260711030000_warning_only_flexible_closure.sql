-- Operational evidence warnings remain visible but do not force an exception reason.
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
  if not public.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if p_customer_accepted not in ('yes', 'no', 'not_confirmed') then raise exception 'Invalid customer accepted value' using errcode = '22000'; end if;
  select * into v_ad_work from public.ad_works where id = p_ad_work_id for update;
  if not found then raise exception 'Ad Work not found' using errcode = 'P0002'; end if;

  if v_ad_work.execution_mode = 'driver_app' then
    if v_ad_work.execution_release_status <> 'released_to_driver' then raise exception 'Send work to the driver before finishing it' using errcode = '22000'; end if;
    if not exists (select 1 from public.ad_work_assignments a where a.ad_work_id = p_ad_work_id and a.status = 'ready_for_execution') then raise exception 'Choose an approved driver before finishing work' using errcode = '22000'; end if;
  end if;

  select * into v_prepare from public.prepare_flexible_final_proof_summary(
    p_ad_work_id, true, p_proof_not_required, true, p_internal_admin_note,
    p_include_phone_location_proof, p_phone_location_proof_customer_note,
    p_phone_location_proof_customer_safe_confirmed
  ) limit 1;

  v_status := case when coalesce(array_length(v_prepare.warnings, 1), 0) > 0 then 'closed_with_issues' else 'closed' end;
  update public.ad_works set
    closure_status = v_status,
    closure_reason = nullif(trim(coalesce(p_closure_reason, '')), ''),
    closure_note = nullif(trim(coalesce(p_closure_note, '')), ''),
    closure_customer_accepted = p_customer_accepted,
    closure_internal_admin_note = nullif(trim(coalesce(p_internal_admin_note, '')), ''),
    closure_closed_at = now(), closure_closed_by = auth.uid(), updated_at = now()
  where id = p_ad_work_id;

  update public.final_proof_summaries set
    closure_status = v_status, warnings = v_prepare.warnings,
    closed_at = now(), closed_by = auth.uid(),
    closure_reason = nullif(trim(coalesce(p_closure_reason, '')), ''),
    closure_note = nullif(trim(coalesce(p_closure_note, '')), ''),
    customer_accepted = p_customer_accepted,
    internal_admin_note = nullif(trim(coalesce(p_internal_admin_note, '')), ''),
    updated_at = now()
  where final_proof_summaries.ad_work_id = p_ad_work_id
  returning id into v_summary_id;

  return query select p_ad_work_id, v_summary_id, v_status, v_prepare.warnings, 'Ad Work closed.'::text;
end;
$$;

revoke all on function public.close_flexible_ad_work_with_final_summary(uuid, text, text, text, text, boolean, boolean, boolean, text, boolean) from public;
grant execute on function public.close_flexible_ad_work_with_final_summary(uuid, text, text, text, text, boolean, boolean, boolean, text, boolean) to authenticated;
