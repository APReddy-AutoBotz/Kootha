create table if not exists public.data_retention_runs (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null default now(),
  result_status text not null check (result_status in ('completed', 'failed')),
  safe_counts jsonb not null default '{}'::jsonb
);

alter table public.data_retention_runs enable row level security;
revoke all on public.data_retention_runs from public, anon, authenticated;

drop policy if exists "Admin users can view retention runs" on public.data_retention_runs;
create policy "Admin users can view retention runs"
  on public.data_retention_runs for select to authenticated
  using (public.is_admin());
grant select on public.data_retention_runs to authenticated;

create or replace function public.get_expired_private_proof_candidates()
returns table (proof_upload_id uuid, file_bucket text, file_path text)
language sql
security definer
set search_path = public, pg_temp
as $$
  select pu.id, pu.file_bucket, pu.file_path
  from public.proof_uploads pu
  join public.ad_work_days awd on awd.id = pu.ad_work_day_id
  join public.ad_works aw on aw.id = awd.ad_work_id
  where aw.closure_closed_at < clock_timestamp() - interval '12 months'
  limit 500;
$$;

revoke all on function public.get_expired_private_proof_candidates() from public, anon, authenticated;
grant execute on function public.get_expired_private_proof_candidates() to service_role;

create or replace function public.run_data_retention(p_deleted_proof_ids uuid[] default '{}')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_enquiries integer := 0;
  v_location_points integer := 0;
  v_proofs integer := 0;
  v_summaries integer := 0;
  v_audit integer := 0;
  v_result jsonb;
begin
  delete from public.enquiries
  where status in ('rejected', 'not_interested', 'invalid_spam')
    and created_at < clock_timestamp() - interval '180 days';
  get diagnostics v_enquiries = row_count;

  delete from public.location_points lp
  using public.tracking_sessions ts, public.ad_work_days awd, public.ad_works aw
  where lp.tracking_session_id = ts.id
    and ts.ad_work_day_id = awd.id
    and awd.ad_work_id = aw.id
    and aw.closure_closed_at < clock_timestamp() - interval '90 days';
  get diagnostics v_location_points = row_count;

  delete from public.proof_uploads where id = any(coalesce(p_deleted_proof_ids, '{}'));
  get diagnostics v_proofs = row_count;

  delete from public.final_proof_summaries fps
  using public.ad_works aw
  where fps.ad_work_id = aw.id
    and aw.closure_closed_at < clock_timestamp() - interval '12 months';
  get diagnostics v_summaries = row_count;

  delete from public.audit_logs where created_at < clock_timestamp() - interval '12 months';
  get diagnostics v_audit = row_count;

  v_result := jsonb_build_object(
    'enquiries', v_enquiries,
    'location_points', v_location_points,
    'proof_uploads', v_proofs,
    'final_summaries', v_summaries,
    'audit_logs', v_audit
  );
  insert into public.data_retention_runs (result_status, safe_counts) values ('completed', v_result);
  return v_result;
end;
$$;

revoke all on function public.run_data_retention(uuid[]) from public, anon, authenticated;
grant execute on function public.run_data_retention(uuid[]) to service_role;
