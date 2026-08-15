-- M26 accepted/rejected telemetry snapshot serialization closure.
-- Every authoritative M21 telemetry receipt write participates in the same
-- device-scoped transaction lock used by M26 evidence ingestion/readiness.
-- This prevents an accepted receipt from becoming visible immediately after
-- an evidence snapshot froze the authoritative telemetry subset.

drop trigger if exists telemetry_receipts_m26_rejected_serialize on public.telemetry_receipts;
drop function if exists public.m26_serialize_rejected_receipt_authority_v1();

create or replace function public.m26_serialize_telemetry_receipt_authority_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  perform public.m26_lock_device_authority_v1(new.gps_device_id);
  return new;
end
$$;

revoke all on function public.m26_serialize_telemetry_receipt_authority_v1()
  from public, anon, authenticated, service_role;

create trigger telemetry_receipts_m26_serialize
before insert or update on public.telemetry_receipts
for each row
execute function public.m26_serialize_telemetry_receipt_authority_v1();
