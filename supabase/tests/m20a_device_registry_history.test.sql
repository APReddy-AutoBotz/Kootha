begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

insert into public.user_profiles (auth_user_id, display_name, role)
values
  ('00000000-0000-0000-0000-0000000000a1', 'M20A Admin', 'admin'),
  ('00000000-0000-0000-0000-0000000000a2', 'M20A Staff', 'staff');

insert into public.vehicles (id, vehicle_number, vehicle_type, city)
values
  ('00000000-0000-0000-0000-0000000000b1', 'M20A-VEH-001', 'auto', 'Ongole'),
  ('00000000-0000-0000-0000-0000000000b2', 'M20A-VEH-002', 'van', 'Ongole');

select has_table('public', 'gps_device_vehicle_links', 'vehicle-link history table exists');
select has_table('public', 'gps_device_lifecycle_events', 'lifecycle history table exists');
select has_table('public', 'gps_device_credential_metadata', 'credential metadata table exists');
select ok(
  (select array_agg(enumlabel order by enumsortorder)::text
   from pg_enum where enumtypid = 'public.gps_device_status'::regtype)
  = '{pending_setup,active,offline,not_working,suspended,removed,retired}',
  'canonical device statuses are installed'
);
select ok(
  not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('gps_devices', 'gps_device_vehicle_links', 'gps_device_lifecycle_events', 'gps_device_credential_metadata')
      and not c.relrowsecurity
  ),
  'RLS is enabled on all M20A operational tables'
);
select ok(
  not has_table_privilege('anon', 'public.gps_devices', 'SELECT')
  and not has_table_privilege('anon', 'public.gps_device_vehicle_links', 'SELECT')
  and not has_table_privilege('anon', 'public.gps_device_lifecycle_events', 'SELECT')
  and not has_table_privilege('anon', 'public.gps_device_credential_metadata', 'SELECT'),
  'anonymous users cannot read M20A tables'
);
select ok(
  not has_column_privilege('authenticated', 'public.gps_device_credential_metadata', 'verification_material_hash', 'SELECT'),
  'verification material is server-only'
);
select ok(
  not has_column_privilege('authenticated', 'public.gps_devices', 'ingest_token_hash', 'SELECT'),
  'legacy ingest token hash remains server-only'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
select is((select count(*)::integer from public.gps_devices), 0, 'non-admin reads return no devices');
select throws_ok(
  $$select public.admin_register_gps_device('M20A-DENIED', 'Vendor', 'Model', 'generic_http', 'https', 'DENIED-SERIAL', null, null, null, null, null, null)$$,
  '42501', 'Admin access required', 'non-admin cannot call registry RPCs'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select lives_ok(
  $$select public.admin_register_gps_device('M20A-DEV-001', 'Pilot Vendor', 'Model A', 'generic_http', 'https', 'SER-001', '123456789012345', 'VENDOR-001', null, 'Pilot SIM', '1.0', 'Safe test note')$$,
  'admin can register a physical device'
);
select is(
  (select status::text from public.gps_devices where device_code = 'M20A-DEV-001'),
  'pending_setup', 'new devices start pending setup'
);
select throws_ok(
  $$select public.admin_register_gps_device('M20A-DEV-002', 'Pilot Vendor', 'Model B', 'generic_http', 'https', 'SER-001', null, null, null, null, null, null)$$,
  '23505', null, 'active duplicate identifiers are rejected'
);
select throws_ok(
  $$select public.admin_link_gps_device_vehicle((select id from public.gps_devices where device_code='M20A-DEV-001'), '00000000-0000-0000-0000-0000000000b1', clock_timestamp() + interval '1 hour', null, 'future test')$$,
  '22023', 'Vehicle links cannot start in the future', 'future vehicle links are rejected'
);
select lives_ok(
  $$select public.admin_link_gps_device_vehicle((select id from public.gps_devices where device_code='M20A-DEV-001'), '00000000-0000-0000-0000-0000000000b1', clock_timestamp(), 'installation planned', 'initial link')$$,
  'admin can create an authoritative vehicle link'
);
select ok(
  (select installation_state = 'planned' and status = 'pending_setup' from public.gps_devices where device_code='M20A-DEV-001')
  and exists (
    select 1 from public.gps_device_vehicle_links l join public.gps_devices d on d.id=l.gps_device_id
    where d.device_code='M20A-DEV-001' and l.vehicle_id='00000000-0000-0000-0000-0000000000b1' and l.effective_until is null
  ),
  'linking plans installation without making the device active'
);
select lives_ok(
  $$select public.admin_record_gps_device_event((select id from public.gps_devices where device_code='M20A-DEV-001'), 'installed', clock_timestamp(), '00000000-0000-0000-0000-0000000000b1', null, null, 'installed locally')$$,
  'installation can be recorded against the matching current link'
);
select lives_ok(
  $$select public.admin_change_gps_device_status((select id from public.gps_devices where device_code='M20A-DEV-001'), 'active', null)$$,
  'installed device can become active'
);
select throws_ok(
  $$select public.admin_register_gps_device('BAD-PAIR', 'Vendor', 'Model', 'generic_http', 'vendor_managed', null, null, null, null, null, null, null)$$,
  '22023', 'Unsupported adapter and protocol combination',
  'database rejects unsupported adapter and protocol pairs'
);
select throws_ok(
  $$select public.admin_register_gps_device('LONG-MODEL', 'Vendor', repeat('x', 121), 'generic_http', 'https', null, null, null, null, null, null, null)$$,
  '22023', 'Model must be safe plain text of at most 120 characters',
  'database bounds durable identity text'
);
select throws_ok(
  $$select public.admin_record_gps_device_event((select id from public.gps_devices where device_code='M20A-DEV-001'), 'installation_planned', clock_timestamp() + interval '1 hour', '00000000-0000-0000-0000-0000000000b1', null, null, null)$$,
  '22023', 'Lifecycle events cannot be future dated',
  'installation planning cannot mutate current state from the future'
);
select throws_ok(
  $$select public.admin_record_gps_device_event((select id from public.gps_devices where device_code='M20A-DEV-001'), 'marked_offline', clock_timestamp(), '00000000-0000-0000-0000-0000000000b2', null, 'wrong vehicle', null)$$,
  '22023', 'Lifecycle vehicle must match authoritative link history',
  'lifecycle events cannot bind to a different vehicle'
);
select throws_ok(
  $$select public.admin_record_gps_device_event((select id from public.gps_devices where device_code='M20A-DEV-001'), 'marked_offline', (select min(effective_at) - interval '1 second' from public.gps_device_lifecycle_events where gps_device_id=(select id from public.gps_devices where device_code='M20A-DEV-001')), null, null, 'backdated', null)$$,
  '22023', 'Lifecycle event cannot predate device history',
  'immutable lifecycle chronology is monotonic'
);
select lives_ok(
  $$select public.admin_upsert_gps_device_credential_metadata((select id from public.gps_devices where device_code='M20A-DEV-001'), 'pilot-key-001', 'active', clock_timestamp() - interval '1 day', clock_timestamp() + interval '30 days', null, 'metadata only')$$,
  'admin can record safe credential metadata'
);
select is(
  public.m20a_gps_device_is_proof_ready((select id from public.gps_devices where device_code='M20A-DEV-001')),
  false, 'metadata without server-only verification material is never proof ready'
);
select throws_ok(
  $$select public.admin_upsert_gps_device_credential_metadata((select id from public.gps_devices where device_code='M20A-DEV-001'), 'expired-no-date', 'expired', clock_timestamp() - interval '2 days', null, null, null)$$,
  '22023', 'Expired credential metadata requires an elapsed expiry',
  'expired credential metadata requires an elapsed expiry'
);
select throws_ok(
  $$select public.admin_upsert_gps_device_credential_metadata((select id from public.gps_devices where device_code='M20A-DEV-001'), 'rotating-no-source', 'rotating', clock_timestamp(), clock_timestamp() + interval '1 day', null, null)$$,
  '22023', 'Rotating status is managed on the active rotation source',
  'rotating is a server-managed source state'
);
select lives_ok(
  $$select public.admin_upsert_gps_device_credential_metadata((select id from public.gps_devices where device_code='M20A-DEV-001'), 'expired-terminal', 'expired', clock_timestamp() - interval '2 days', clock_timestamp() - interval '1 day', null, null)$$,
  'admin can record valid expired metadata'
);
select throws_ok(
  $$select public.admin_upsert_gps_device_credential_metadata((select id from public.gps_devices where device_code='M20A-DEV-001'), 'expired-terminal', 'active', clock_timestamp(), clock_timestamp() + interval '1 day', null, null)$$,
  '55000', 'Revoked or expired credential metadata is terminal',
  'expired credential metadata cannot be reactivated'
);
select throws_ok(
  $$select public.admin_upsert_gps_device_credential_metadata((select id from public.gps_devices where device_code='M20A-DEV-001'), 'second-active', 'active', clock_timestamp(), clock_timestamp() + interval '1 day', null, null)$$,
  '23505', null,
  'a device cannot have two active credential metadata rows'
);
select lives_ok(
  $$select public.admin_link_gps_device_vehicle((select id from public.gps_devices where device_code='M20A-DEV-001'), '00000000-0000-0000-0000-0000000000b2', clock_timestamp(), 'move', 'vehicle reassignment')$$,
  'admin can reassign a device transactionally'
);
select ok(
  (select status = 'pending_setup' and installation_state = 'planned' and vehicle_id='00000000-0000-0000-0000-0000000000b2' from public.gps_devices where device_code='M20A-DEV-001')
  and (select count(*) = 2 from public.gps_device_vehicle_links l join public.gps_devices d on d.id=l.gps_device_id where d.device_code='M20A-DEV-001')
  and (select count(*) = 1 from public.gps_device_vehicle_links l join public.gps_devices d on d.id=l.gps_device_id where d.device_code='M20A-DEV-001' and l.effective_until is null),
  'reassignment preserves history and requires installation confirmation'
);
select throws_ok(
  $$select public.admin_remove_gps_device_vehicle((select id from public.gps_devices where device_code='M20A-DEV-001'), clock_timestamp() + interval '1 hour', 'future removal', null)$$,
  '22023', 'Invalid effective-until time', 'future vehicle removals are rejected'
);
select lives_ok(
  $$select public.admin_record_gps_device_event((select id from public.gps_devices where device_code='M20A-DEV-001'), 'installed', clock_timestamp(), '00000000-0000-0000-0000-0000000000b2', null, null, 'reinstalled')$$,
  'reassigned device installation can be confirmed'
);
select lives_ok(
  $$select public.admin_change_gps_device_status((select id from public.gps_devices where device_code='M20A-DEV-001'), 'active', null); select public.admin_record_gps_device_event((select id from public.gps_devices where device_code='M20A-DEV-001'), 'marked_not_working', clock_timestamp(), null, null, 'repair required', null); select public.admin_record_gps_device_event((select id from public.gps_devices where device_code='M20A-DEV-001'), 'installed', clock_timestamp(), '00000000-0000-0000-0000-0000000000b2', null, null, 'repair confirmed'); select public.admin_change_gps_device_status((select id from public.gps_devices where device_code='M20A-DEV-001'), 'active', 'repair confirmed')$$,
  'not-working devices have an explicit repair and reactivation path'
);
select throws_ok(
  $$select public.admin_update_gps_device((select id from public.gps_devices where device_code='M20A-DEV-001'), 'M20A-DEV-001', 'Pilot Vendor', 'Model A', 'generic_http', 'https', 'REPLACED-SERIAL', '999999999999999', 'REPLACED-VENDOR-ID', null, 'Pilot SIM', '1.1', 'attempted in-place replacement')$$,
  '55000', 'Hardware identity cannot be edited after installation or vehicle linking; use device replacement',
  'active device hardware identity requires the replacement workflow'
);
select throws_ok(
  $$select public.admin_upsert_gps_device_credential_metadata((select id from public.gps_devices where device_code='M20A-DEV-001'), 'pilot-key-001', 'active', clock_timestamp(), null, (select id from public.gps_device_credential_metadata where credential_key_id='pilot-key-001'), 'self rotation')$$,
  '22023', 'Credential metadata cannot rotate from itself', 'credential metadata cannot self-rotate'
);
select lives_ok(
  $$select public.admin_register_gps_device('M20A-DEV-REPLACEMENT', 'Pilot Vendor', 'Model B', 'vendor_cloud', 'vendor_managed', 'SER-REPLACEMENT', null, 'VENDOR-REPLACEMENT', null, null, '2.0', null)$$,
  'admin can register a replacement candidate'
);
select throws_ok(
  $$select public.admin_replace_gps_device((select id from public.gps_devices where device_code='M20A-DEV-001'), (select id from public.gps_devices where device_code='M20A-DEV-REPLACEMENT'), '00000000-0000-0000-0000-0000000000b2', clock_timestamp() + interval '1 hour', 'future replacement', null)$$,
  '22023', 'Replacement cannot be future dated', 'future replacements are rejected'
);
select lives_ok(
  $$select public.admin_replace_gps_device((select id from public.gps_devices where device_code='M20A-DEV-001'), (select id from public.gps_devices where device_code='M20A-DEV-REPLACEMENT'), '00000000-0000-0000-0000-0000000000b2', clock_timestamp(), 'hardware replacement', 'safe replacement note')$$,
  'replacement updates registry and history in one transaction'
);
select ok(
  (select status = 'removed' and vehicle_id is null from public.gps_devices where device_code='M20A-DEV-001')
  and (select status = 'active' and installation_state='installed' and vehicle_id='00000000-0000-0000-0000-0000000000b2' from public.gps_devices where device_code='M20A-DEV-REPLACEMENT')
  and exists (select 1 from public.gps_device_lifecycle_events e join public.gps_devices d on d.id=e.gps_device_id where d.device_code='M20A-DEV-001' and e.event_type='replaced'),
  'replacement retires the old link and preserves replacement history'
);
select ok(
  not exists (
    select 1 from public.audit_logs
    where action like 'gps_device_%'
      and actor_id <> '00000000-0000-0000-0000-0000000000a1'
  ),
  'M20A audit actors use the established auth user identity'
);
select ok(
  not has_table_privilege('authenticated', 'public.gps_devices', 'DELETE')
  and not has_table_privilege('authenticated', 'public.gps_device_vehicle_links', 'DELETE')
  and not has_table_privilege('authenticated', 'public.gps_device_lifecycle_events', 'DELETE')
  and not has_table_privilege('authenticated', 'public.gps_device_credential_metadata', 'DELETE'),
  'authenticated users cannot delete device records or history'
);
select ok(
  not exists (
    select 1 from public.gps_device_lifecycle_events
    where safe_note ~* '(token|secret|password|coordinate)'
  ),
  'test lifecycle history contains no secret or coordinate material'
);

select * from finish();
rollback;