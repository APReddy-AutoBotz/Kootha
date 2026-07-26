begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select ok(not has_table_privilege('anon', 'public.enquiries', 'INSERT'), 'anonymous direct enquiry inserts are revoked');
select ok(not has_table_privilege('anon', 'public.enquiries', 'SELECT'), 'anonymous enquiry reads are blocked');
select ok(not has_table_privilege('anon', 'public.enquiries', 'UPDATE'), 'anonymous enquiry updates are blocked');
select ok(not has_table_privilege('anon', 'public.enquiries', 'DELETE'), 'anonymous enquiry deletes are blocked');

select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('audit_logs', 'ad_works', 'ad_work_assignments', 'drivers', 'vehicles', 'gps_devices', 'gps_device_vehicle_links', 'gps_device_lifecycle_events', 'gps_device_credential_metadata', 'tracking_sessions', 'location_points', 'location_proof_reviews', 'final_proof_summaries')
      and roles::text like '%anon%'
  ),
  'admin and tracking tables have no anonymous policies'
);

select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('audit_logs', 'gps_devices', 'gps_device_vehicle_links', 'gps_device_lifecycle_events', 'gps_device_credential_metadata', 'tracking_sessions', 'location_points', 'location_proof_reviews', 'final_proof_summaries')
      and roles::text like '%authenticated%'
      and coalesce(qual, with_check, '') not like '%is_admin%'
  ),
  'authenticated tracking and review policies require admin'
);

select ok(
  not has_function_privilege('anon', 'public.consume_public_enquiry_rate_limit(text,integer,integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.consume_public_enquiry_rate_limit(text,integer,integer)', 'EXECUTE'),
  'rate-limit RPC is not callable by clients'
);

select ok(
  exists (select 1 from storage.buckets where id = 'proof-photos' and public is false),
  'proof photos bucket is private'
);

select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and roles::text like '%anon%'
      and coalesce(qual, '') like '%proof-photos%'
  ),
  'proof photos have no anonymous object policy'
);

select ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proconfig is distinct from array['search_path=public']
      and p.proconfig is distinct from array['search_path=public, pg_temp']
      and p.proconfig is distinct from array['search_path=pg_catalog, public']
  ),
  'security definer functions pin a safe search path'
);

select * from finish();
rollback;
