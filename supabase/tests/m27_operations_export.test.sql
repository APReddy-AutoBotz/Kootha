begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

insert into public.user_profiles (auth_user_id, display_name, role)
values
  ('27000000-0000-4000-8000-0000000000a1', 'M27 Admin', 'admin'),
  ('27000000-0000-4000-8000-0000000000a2', 'M27 Staff', 'staff');

insert into public.enquiries (
  id, customer_name, business_name, phone, city, required_areas, preferred_start_date,
  number_of_days, source, status, message, package_interest, live_tracking_needed,
  notes, consent_to_contact, follow_up_date
)
values
  ('27000000-0000-4000-8000-000000000101', 'Formula =SUM(A1:A2)', 'Shop One', '9000000001', 'Ongole', 'Main Road', current_date + 1, 1, 'admin', 'new', 'Safe message', 'basic', 'no', null, true, current_date + 2),
  ('27000000-0000-4000-8000-000000000102', 'Customer Two', 'Shop Two', '9000000002', 'Addanki', 'Market', current_date + 2, 2, 'admin', 'contacted', 'Safe message', 'standard', 'not_sure', null, true, null);

insert into public.gps_devices (
  id, device_code, vendor, model, adapter_type, protocol_type, serial_number, imei,
  vendor_device_identifier, status, installation_state, gps_readiness, gsm_readiness
)
values (
  '27000000-0000-4000-8000-000000000201',
  'M27-DEVICE-01', 'Pilot Vendor', 'Model 27', 'generic_http', 'https',
  'RAW-SERIAL-123456', '123456789012345', 'RAW-VENDOR-ABC987',
  'pending_setup', 'pending', 'unknown', 'unknown'
);

insert into public.audit_logs (id, actor_type, actor_id, action, entity_type, entity_id, safe_details)
values (
  '27000000-0000-4000-8000-000000000301',
  'system', null, 'm27_safe_fixture', 'm27_fixture', null, '{"safe":true}'::jsonb
);

select has_table('public', 'operations_export_receipts', 'M27 export receipt table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.operations_export_receipts'::regclass),
  'M27 export receipts have RLS enabled'
);
select has_trigger('public', 'operations_export_receipts', 'operations_export_receipts_no_update', 'receipt update protection exists');
select has_trigger('public', 'operations_export_receipts', 'operations_export_receipts_no_delete', 'receipt delete protection exists');
select has_function('public', 'admin_export_operations_v1', array['text','text','text','text','text','timestamptz','timestamptz','integer'], 'export RPC exists');
select has_function('public', 'admin_list_operations_export_receipts_v1', array['integer','timestamptz','uuid'], 'receipt list RPC exists');
select has_function('public', 'admin_get_operations_audit_v1', array['text','text','text','text','timestamptz','timestamptz','integer','timestamptz','uuid'], 'audit RPC exists');
select ok(
  not has_table_privilege('anon', 'public.operations_export_receipts', 'SELECT')
  and not has_table_privilege('authenticated', 'public.operations_export_receipts', 'SELECT')
  and not has_table_privilege('service_role', 'public.operations_export_receipts', 'SELECT'),
  'API roles cannot directly read export receipts'
);
select ok(
  not has_table_privilege('anon', 'public.operations_export_receipts', 'INSERT')
  and not has_table_privilege('authenticated', 'public.operations_export_receipts', 'INSERT')
  and not has_table_privilege('service_role', 'public.operations_export_receipts', 'INSERT')
  and not has_table_privilege('service_role', 'public.operations_export_receipts', 'UPDATE')
  and not has_table_privilege('service_role', 'public.operations_export_receipts', 'DELETE'),
  'API roles cannot directly mutate export receipts'
);
select ok(
  has_function_privilege('authenticated', 'public.admin_export_operations_v1(text,text,text,text,text,timestamptz,timestamptz,integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.admin_export_operations_v1(text,text,text,text,text,timestamptz,timestamptz,integer)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.admin_export_operations_v1(text,text,text,text,text,timestamptz,timestamptz,integer)', 'EXECUTE'),
  'only authenticated role receives export RPC execution privilege'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '27000000-0000-4000-8000-0000000000a2', true);

select throws_ok(
  $$select public.admin_export_operations_v1('enquiries','csv',null,null,null,null,null,10)$$,
  '42501', 'Admin access required', 'staff cannot export'
);
select throws_ok(
  $$select public.admin_list_operations_export_receipts_v1(10,null,null)$$,
  '42501', 'Admin access required', 'staff cannot list export receipts'
);
select throws_ok(
  $$select public.admin_get_operations_audit_v1(null,null,null,null,null,null,10,null,null)$$,
  '42501', 'Admin access required', 'staff cannot query governed audit'
);

select set_config('request.jwt.claim.sub', '27000000-0000-4000-8000-0000000000a1', true);

select throws_ok(
  $$select public.admin_export_operations_v1('location_points','csv',null,null,null,null,null,10)$$,
  '22023', 'Unsupported operations export scope', 'arbitrary tables cannot be exported'
);
select throws_ok(
  $$select public.admin_export_operations_v1('enquiries','csv',null,null,null,null,null,501)$$,
  '22023', 'Export row limit must be between 1 and 500', 'row cap is enforced by the database'
);
select throws_ok(
  $$select public.admin_export_operations_v1('devices','csv',null,null,'Ongole',null,null,10)$$,
  '22023', 'City filter is not supported for this export scope', 'unsupported scope filters fail closed'
);
select throws_ok(
  $$select public.admin_export_operations_v1('enquiries','csv',null,'active',null,null,null,10)$$,
  '22023', 'Unsupported enquiry status filter', 'status values are scope allowlisted'
);

select is(
  (public.admin_export_operations_v1('enquiries','json',null,null,null,null,null,1)->>'rowCount')::integer,
  1,
  'enquiry export respects the requested cap'
);
select is(
  public.admin_export_operations_v1('enquiries','json',null,null,null,null,null,1)->>'truncated',
  'true',
  'enquiry export reports truncation when more rows exist'
);
select is(
  public.admin_export_operations_v1('enquiries','json','9000000001',null,null,null,null,10)->>'containsPii',
  'true',
  'contact-data scopes are explicitly marked as PII'
);

select ok(
  (public.admin_export_operations_v1('devices','json','RAW-SERIAL-123456',null,null,null,null,10)->'rows'->0->>'serial_number') = '****3456'
  and (public.admin_export_operations_v1('devices','json','123456789012345',null,null,null,null,10)->'rows'->0->>'imei') = '****2345'
  and (public.admin_export_operations_v1('devices','json','RAW-VENDOR-ABC987',null,null,null,null,10)->'rows'->0->>'vendor_device_identifier') = '****C987',
  'device export searches server-side but returns only masked identifiers'
);
select ok(
  (public.admin_export_operations_v1('devices','json','RAW-SERIAL-123456',null,null,null,null,10)->'rows'->0)::text
    not like '%RAW-SERIAL-123456%',
  'raw device identifiers never appear in export payloads'
);

select ok(
  jsonb_array_length((public.admin_export_operations_v1('audit','json','m27_safe_fixture',null,null,null,null,10)->'rows')) >= 1,
  'activity history can be exported through the governed scope'
);
select ok(
  jsonb_array_length(public.admin_get_operations_audit_v1('system','m27_safe_fixture','m27_fixture',null,null,null,10,null,null)->'records') = 1,
  'audit workbench filters actor, action and entity under the sanctioned RPC'
);

select ok(
  exists (
    select 1
    from public.admin_list_operations_export_receipts_v1(100,null,null)
    where actor_id = '27000000-0000-4000-8000-0000000000a1'
  ),
  'admin can list immutable export receipt metadata through the sanctioned RPC'
);

reset role;

select ok(
  not exists (
    select 1 from public.operations_export_receipts
    where filter_summary::text like '%9000000001%'
       or filter_summary::text like '%RAW-SERIAL-123456%'
  ),
  'receipt metadata never stores raw search values'
);
select throws_ok(
  $$update public.operations_export_receipts set row_count = 0 where actor_id = '27000000-0000-4000-8000-0000000000a1'$$,
  '55000', 'Operations export receipts are immutable', 'owner cannot rewrite immutable export receipts'
);
select throws_ok(
  $$delete from public.operations_export_receipts where actor_id = '27000000-0000-4000-8000-0000000000a1'$$,
  '55000', 'Operations export receipts are immutable', 'owner cannot delete immutable export receipts'
);
select ok(
  pg_get_functiondef('public.admin_export_operations_v1(text,text,text,text,text,timestamptz,timestamptz,integer)'::regprocedure)
    !~* '(location_points|proof_uploads|file_path|ingest_token_hash|verification_material_hash)',
  'export authority never references coordinates, proof paths or credential verification material'
);
select ok(
  pg_get_functiondef('public.admin_export_operations_v1(text,text,text,text,text,timestamptz,timestamptz,integer)'::regprocedure)
    !~* 'execute[[:space:]]+format',
  'export authority uses static allowlisted SQL rather than dynamic table or column selection'
);
select ok(
  exists (
    select 1 from public.audit_logs
    where action = 'operations_export_generated'
      and actor_id = '27000000-0000-4000-8000-0000000000a1'
      and safe_details ? 'scope'
      and not (safe_details ? 'rows')
  ),
  'every governed export emits a safe audit event without payload rows'
);

select * from finish();
rollback;
