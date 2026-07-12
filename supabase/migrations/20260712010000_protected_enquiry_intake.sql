alter table public.enquiries
  add column if not exists locale text not null default 'en',
  add column if not exists consent_notice_version text not null default '2026-07-12';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'enquiries_locale_check'
  ) then
    alter table public.enquiries
      add constraint enquiries_locale_check check (locale in ('en', 'te'));
  end if;
end $$;

drop policy if exists "Public website can insert enquiries" on public.enquiries;
revoke insert on public.enquiries from anon;

create table if not exists public.public_enquiry_rate_limits (
  request_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  primary key (request_hash, window_started_at)
);

alter table public.public_enquiry_rate_limits enable row level security;
revoke all on public.public_enquiry_rate_limits from public, anon, authenticated;

create or replace function public.consume_public_enquiry_rate_limit(
  p_request_hash text,
  p_max_requests integer default 5,
  p_window_seconds integer default 900
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  if length(p_request_hash) < 32 or p_max_requests < 1 or p_window_seconds < 60 then
    raise exception 'invalid rate limit input';
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into public.public_enquiry_rate_limits (request_hash, window_started_at, request_count)
  values (p_request_hash, v_window, 1)
  on conflict (request_hash, window_started_at)
  do update set request_count = public.public_enquiry_rate_limits.request_count + 1
  returning request_count into v_count;

  delete from public.public_enquiry_rate_limits
  where window_started_at < clock_timestamp() - interval '2 days';

  return query select
    v_count <= p_max_requests,
    greatest(1, ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds) - clock_timestamp())))::integer);
end;
$$;

revoke all on function public.consume_public_enquiry_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_public_enquiry_rate_limit(text, integer, integer) to service_role;

drop policy if exists "Admin users can view audit logs" on public.audit_logs;
create policy "Admin users can view audit logs"
  on public.audit_logs for select to authenticated
  using (public.is_admin());

grant select (id, actor_type, action, entity_type, entity_id, created_at, safe_details)
  on public.audit_logs to authenticated;
