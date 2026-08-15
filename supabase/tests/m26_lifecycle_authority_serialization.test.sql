-- M26 lifecycle writer serialization guardrails.
\connect postgres supabase_admin
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select ok(pg_get_functiondef('public.m26_try_device_authority_lock_v1(uuid)'::regprocedure) ilike '%pg_try_advisory_xact_lock(hashtextextended(p_device_id::text, 0))%','lifecycle writers use the exact M26 per-device advisory key');
select ok(pg_get_functiondef('public.m26_try_device_authority_lock_v1(uuid)'::regprocedure) ilike '%40001%','contended lifecycle mutations fail with retryable serialization error');
select ok(pg_get_functiondef('public.m26_serialize_gps_device_authority_write_v1()'::regprocedure) ilike '%m26_try_device_authority_lock_v1%','device table writes enter M26 authority');
select ok(pg_get_functiondef('public.m26_serialize_gps_device_child_authority_write_v1()'::regprocedure) ilike '%m26_try_device_authority_lock_v1%','child authority table writes enter M26 authority');

select has_trigger('public','gps_devices','gps_devices_m26_authority_serialize','device status/readiness writes serialize with M26 readiness');
select has_trigger('public','gps_device_vehicle_links','gps_device_vehicle_links_m26_authority_serialize','vehicle-link writes serialize with M26 readiness');
select has_trigger('public','gps_device_lifecycle_events','gps_device_lifecycle_events_m26_authority_serialize','lifecycle writes serialize with M26 readiness');
select has_trigger('public','gps_device_credential_metadata','gps_device_credential_metadata_m26_authority_serialize','credential writes serialize with M26 readiness');

select ok(pg_get_triggerdef((select oid from pg_trigger where tgname='gps_devices_m26_authority_serialize' and not tgisinternal)) ilike '%BEFORE INSERT OR DELETE OR UPDATE%','device trigger covers all mutation verbs');
select ok(pg_get_triggerdef((select oid from pg_trigger where tgname='gps_device_vehicle_links_m26_authority_serialize' and not tgisinternal)) ilike '%BEFORE INSERT OR DELETE OR UPDATE%','link trigger covers all mutation verbs');
select ok(pg_get_triggerdef((select oid from pg_trigger where tgname='gps_device_lifecycle_events_m26_authority_serialize' and not tgisinternal)) ilike '%BEFORE INSERT OR DELETE OR UPDATE%','lifecycle trigger covers all mutation verbs');
select ok(pg_get_triggerdef((select oid from pg_trigger where tgname='gps_device_credential_metadata_m26_authority_serialize' and not tgisinternal)) ilike '%BEFORE INSERT OR DELETE OR UPDATE%','credential trigger covers all mutation verbs');

select * from finish();
rollback;
