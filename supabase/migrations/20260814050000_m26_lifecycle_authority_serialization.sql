-- M26 lifecycle authority serialization closure.
-- M20A/M21/M22 writers may reach these tables through several sanctioned
-- paths.  Row-level fail-fast advisory locking makes every write participate
-- in the same per-device authority law as M26 readiness/evidence without a
-- blocking row-trigger cycle: if readiness/evidence already owns the lock,
-- the lifecycle mutation aborts with a retryable serialization failure.

create or replace function public.m26_try_device_authority_lock_v1(p_device_id uuid)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if p_device_id is null then
    raise exception 'M26 device authority requires device id' using errcode='22023';
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended(p_device_id::text, 0)) then
    raise exception 'M26 device authority busy; retry transaction' using errcode='40001';
  end if;
end
$$;
revoke all on function public.m26_try_device_authority_lock_v1(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.m26_serialize_gps_device_authority_write_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare v_old uuid; v_new uuid;
begin
  if tg_op <> 'INSERT' then v_old := old.id; end if;
  if tg_op <> 'DELETE' then v_new := new.id; end if;
  if v_old is not null then perform public.m26_try_device_authority_lock_v1(v_old); end if;
  if v_new is not null and v_new is distinct from v_old then perform public.m26_try_device_authority_lock_v1(v_new); end if;
  if tg_op='DELETE' then return old; else return new; end if;
end
$$;
revoke all on function public.m26_serialize_gps_device_authority_write_v1()
  from public, anon, authenticated, service_role;

create or replace function public.m26_serialize_gps_device_child_authority_write_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare v_old uuid; v_new uuid;
begin
  if tg_op <> 'INSERT' then v_old := old.gps_device_id; end if;
  if tg_op <> 'DELETE' then v_new := new.gps_device_id; end if;
  if v_old is not null then perform public.m26_try_device_authority_lock_v1(v_old); end if;
  if v_new is not null and v_new is distinct from v_old then perform public.m26_try_device_authority_lock_v1(v_new); end if;
  if tg_op='DELETE' then return old; else return new; end if;
end
$$;
revoke all on function public.m26_serialize_gps_device_child_authority_write_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists gps_devices_m26_authority_serialize on public.gps_devices;
create trigger gps_devices_m26_authority_serialize
before insert or update or delete on public.gps_devices
for each row execute function public.m26_serialize_gps_device_authority_write_v1();

drop trigger if exists gps_device_vehicle_links_m26_authority_serialize on public.gps_device_vehicle_links;
create trigger gps_device_vehicle_links_m26_authority_serialize
before insert or update or delete on public.gps_device_vehicle_links
for each row execute function public.m26_serialize_gps_device_child_authority_write_v1();

drop trigger if exists gps_device_lifecycle_events_m26_authority_serialize on public.gps_device_lifecycle_events;
create trigger gps_device_lifecycle_events_m26_authority_serialize
before insert or update or delete on public.gps_device_lifecycle_events
for each row execute function public.m26_serialize_gps_device_child_authority_write_v1();

drop trigger if exists gps_device_credential_metadata_m26_authority_serialize on public.gps_device_credential_metadata;
create trigger gps_device_credential_metadata_m26_authority_serialize
before insert or update or delete on public.gps_device_credential_metadata
for each row execute function public.m26_serialize_gps_device_child_authority_write_v1();
