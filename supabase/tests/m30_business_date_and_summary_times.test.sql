begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select is(
  public.m30_format_business_time('2026-11-13 18:01:25.131992+00'::timestamptz),
  '13 Nov 2026, 11:31 PM',
  'A UTC evening timestamp prints as India time without seconds'
);

select is(
  public.m30_format_business_time('2026-11-13 19:00:00+00'::timestamptz),
  '14 Nov 2026, 12:30 AM',
  'A late UTC timestamp prints on the next India calendar day'
);

select is(public.m30_format_date('2026-11-03'::date), '03 Nov 2026', 'Dates print as day, month, year');
select is(public.m30_format_time('09:00:00'::time), '09:00 AM', 'Planned times print without seconds');
select is(public.m30_format_time('18:30:00'::time), '06:30 PM', 'Afternoon times print on the 12-hour clock');

select ok(
  public.m30_format_business_time(null) is null
    and public.m30_format_date(null) is null
    and public.m30_format_time(null) is null,
  'Missing values stay missing so the summary can print Not set'
);

select is(
  public.m30_business_date(),
  (now() at time zone 'Asia/Kolkata')::date,
  'The business date is the India calendar date'
);

select is(
  (
    select coalesce(string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text), '')
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('driver_start_mobile_tracking', 'request_driver_proof_upload', 'is_valid_proof_upload_path')
      and (p.prosrc ilike '%current_date%' or p.prosrc not ilike '%m30_business_date()%')
  ),
  '',
  'Driver day checks use the business date, not the UTC date'
);

select ok(
  pg_get_functiondef('public.m8_build_final_summary_text(uuid)'::regprocedure) not ilike '%\_at::text%'
    and pg_get_functiondef('public.m8_build_final_summary_text(uuid)'::regprocedure) ilike '%m30_format_business_time%',
  'The Final Proof Summary text formats its timestamps'
);

select ok(
  not has_function_privilege('anon', 'public.m8_build_final_summary_text(uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.m8_build_final_summary_text(uuid)', 'EXECUTE'),
  'The Final Proof Summary text function is still internal'
);

select * from finish();

rollback;
