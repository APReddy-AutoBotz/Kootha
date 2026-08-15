-- M26 telemetry snapshot serialization guardrails.
\connect postgres supabase_admin
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);
select has_function('public','m26_serialize_telemetry_receipt_authority_v1',array[]::text[],'all telemetry receipts share one M26 serialization trigger function');
select has_trigger('public','telemetry_receipts','telemetry_receipts_m26_serialize','all telemetry receipt writes are serialized with M26 device authority');
select ok(pg_get_functiondef('public.m26_serialize_telemetry_receipt_authority_v1()'::regprocedure) ilike '%m26_lock_device_authority_v1(new.gps_device_id)%','telemetry serialization uses the exact shared device authority lock');
select ok(pg_get_triggerdef((select oid from pg_trigger where tgname='telemetry_receipts_m26_serialize' and not tgisinternal)) not ilike '%when %','telemetry serialization has no rejected-only WHEN predicate');
select ok(not exists(select 1 from pg_trigger where tgname='telemetry_receipts_m26_rejected_serialize' and not tgisinternal),'legacy rejected-only telemetry trigger is removed');
select ok(to_regprocedure('public.m26_serialize_rejected_receipt_authority_v1()') is null,'legacy rejected-only telemetry trigger function is removed');
select has_trigger('public','telemetry_identity_conflicts','telemetry_identity_conflicts_m26_serialize','identity-conflict authority remains serialized');
select * from finish();
rollback;
