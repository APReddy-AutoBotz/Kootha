-- M30 Work Code hardening.
--
-- The driver app authenticates with mobile number + Work Code through anonymous
-- RPCs. Before this migration the generated code was 8 hexadecimal characters
-- (32 bits) stored as an unsalted MD5 digest. This migration:
--   1. generates 10-character codes from a 31-symbol alphabet without the
--      look-alike characters I, L, O, 0 and 1 (about 49 bits);
--   2. stores a versioned SHA-256 digest instead of MD5;
--   3. ignores spaces, dashes and letter case when a driver types the code;
--   4. requires at least 8 letters or numbers for an admin-supplied code;
--   5. routes the retained M6 release RPC through the governed release RPC so
--      there is one code-issuing path.
--
-- Every driver RPC compares work_access_code_hash with m6_hash_work_code(code),
-- so replacing that one function moves all of them to the new digest. Codes
-- issued before this migration hold MD5 digests, which can no longer match:
-- an admin must choose "Regenerate Work Code" for any work released earlier.
set search_path = public;

create or replace function public.m6_hash_work_code(p_work_code text)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case
    when pg_catalog.length(normalized.code) < 4 then null
    else 'v2:' || pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(normalized.code, 'UTF8')),
      'hex'
    )
  end
  from (
    select pg_catalog.upper(
      pg_catalog.regexp_replace(coalesce(p_work_code, ''), '[^A-Za-z0-9]', '', 'g')
    ) as code
  ) as normalized;
$$;

create or replace function public.m30_generate_work_code()
returns text
language plpgsql
volatile
set search_path = pg_catalog, public
as $$
declare
  c_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  c_length constant integer := 10;
  v_code text := '';
  v_bytes bytea;
  v_byte integer;
begin
  while pg_catalog.length(v_code) < c_length loop
    v_bytes := pg_catalog.uuid_send(pg_catalog.gen_random_uuid());
    for v_index in 0..15 loop
      -- Bytes 6 and 8 carry the fixed UUID version and variant bits.
      continue when v_index in (6, 8);
      v_byte := pg_catalog.get_byte(v_bytes, v_index);
      -- 248 = 31 * 8. Rejecting 248..255 keeps every symbol equally likely.
      if v_byte < 248 then
        v_code := v_code || pg_catalog.substr(c_alphabet, (v_byte % 31) + 1, 1);
        exit when pg_catalog.length(v_code) >= c_length;
      end if;
    end loop;
  end loop;
  return v_code;
end;
$$;

revoke all on function public.m30_generate_work_code() from public;
revoke all on function public.m30_generate_work_code() from anon;
revoke all on function public.m30_generate_work_code() from authenticated;

create or replace function public.release_flexible_ad_work_to_driver(
  p_ad_work_id uuid,
  p_plain_work_code text default null,
  p_revoke boolean default false
)
returns table(ad_work_id uuid, work_access_code text, work_access_code_hint text, release_status text, result_message text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ad_work public.ad_works%rowtype;
  v_assignment public.ad_work_assignments%rowtype;
  v_driver public.drivers%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_code text;
  v_hint text;
begin
  if not public.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('m21-authority-global', 2100)
  );

  select * into v_ad_work
  from public.ad_works
  where id = p_ad_work_id
  for update;
  if not found then raise exception 'Ad Work not found' using errcode = 'P0002'; end if;
  if v_ad_work.execution_mode <> 'driver_app' or not v_ad_work.driver_required then raise exception 'This work does not use the driver app' using errcode = '22000'; end if;

  if p_revoke then
    update public.ad_works
    set execution_release_status = 'access_revoked',
        work_access_code_hash = null,
        work_access_code_hint = null,
        work_access_revoked_at = now(),
        updated_at = now()
    where id = p_ad_work_id;
    return query select p_ad_work_id, null::text, null::text, 'access_revoked'::text, 'Work access revoked.'::text;
    return;
  end if;

  select * into v_assignment
  from public.ad_work_assignments
  where ad_work_assignments.ad_work_id = p_ad_work_id;
  if not found or v_assignment.status <> 'ready_for_execution' then raise exception 'Choose an approved driver before sending work' using errcode = '22000'; end if;

  select * into v_driver from public.drivers where id = v_assignment.driver_id;
  if not found or v_driver.approval_status <> 'approved' or coalesce(v_driver.onboarding_status, 'pending_review') <> 'approved' then raise exception 'Choose an approved driver' using errcode = '22000'; end if;

  if v_ad_work.vehicle_required then
    if v_assignment.vehicle_id is null then raise exception 'Choose an approved vehicle' using errcode = '22000'; end if;
    select * into v_vehicle from public.vehicles where id = v_assignment.vehicle_id;
    if not found or coalesce(v_vehicle.onboarding_status, 'pending_review') <> 'approved' or not coalesce(v_vehicle.active, false) then raise exception 'Choose an approved vehicle' using errcode = '22000'; end if;
    if v_ad_work.speaker_required and not coalesce(v_vehicle.mic_system_available, v_vehicle.mic_available, false) then raise exception 'Choose a vehicle with speaker equipment' using errcode = '22000'; end if;
  end if;

  if v_ad_work.start_date is null then raise exception 'Add a start date before sending work' using errcode = '22000'; end if;
  if v_ad_work.areas_required and nullif(trim(coalesce(v_ad_work.areas_to_cover, '')), '') is null then raise exception 'Add the work areas before sending work' using errcode = '22000'; end if;

  if nullif(trim(coalesce(p_plain_work_code, '')), '') is null then
    v_code := public.m30_generate_work_code();
  else
    v_code := upper(regexp_replace(p_plain_work_code, '[^A-Za-z0-9]', '', 'g'));
    if length(v_code) < 8 then raise exception 'Work access code must have at least 8 letters or numbers' using errcode = '22000'; end if;
    if length(v_code) > 20 then raise exception 'Work access code must have at most 20 letters or numbers' using errcode = '22000'; end if;
  end if;
  v_hint := right(v_code, 4);

  update public.ad_works
  set execution_release_status = 'released_to_driver',
      execution_overall_status = 'not_started',
      work_access_code_hash = public.m6_hash_work_code(v_code),
      work_access_code_hint = v_hint,
      work_access_code_created_at = now(),
      work_access_revoked_at = null,
      updated_at = now()
  where id = p_ad_work_id;

  update public.ad_work_days as day_row
  set execution_status = 'ready',
      execution_updated_at = now(),
      driver_id = v_assignment.driver_id,
      vehicle_id = v_assignment.vehicle_id
  where day_row.ad_work_id = p_ad_work_id
    and day_row.execution_status = 'planned';

  return query
  select p_ad_work_id, v_code, v_hint, 'released_to_driver'::text, 'Work sent to driver.'::text;
end;
$$;

revoke all on function public.release_flexible_ad_work_to_driver(uuid, text, boolean) from public;
grant execute on function public.release_flexible_ad_work_to_driver(uuid, text, boolean) to authenticated;

-- The M6 release RPC issued 8-hex codes and skipped the M21/M28 authority lock.
-- Keep its signature for older callers, but issue codes only through the
-- governed release RPC above.
create or replace function public.release_ad_work_to_driver(
  p_ad_work_id uuid,
  p_plain_work_code text default null,
  p_revoke boolean default false
)
returns table(ad_work_id uuid, work_access_code text, work_access_code_hint text, release_status text, result_message text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;

  return query
  select released.ad_work_id, released.work_access_code, released.work_access_code_hint,
         released.release_status, released.result_message
  from public.release_flexible_ad_work_to_driver(p_ad_work_id, p_plain_work_code, p_revoke) as released;
end;
$$;

revoke all on function public.release_ad_work_to_driver(uuid, text, boolean) from public;
grant execute on function public.release_ad_work_to_driver(uuid, text, boolean) to authenticated;
