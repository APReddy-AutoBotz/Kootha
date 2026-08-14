begin;
select plan(7);

select has_function(
  'public','service_record_physical_pilot_network_validation_v1',
  array['uuid','uuid','bigint','uuid','uuid','uuid','uuid','text','text','timestamp with time zone','text','text'],
  'network validation RPC remains available'
);

select ok(
  position('select * into n' in pg_get_functiondef('public.service_record_physical_pilot_network_validation_v1(uuid,uuid,bigint,uuid,uuid,uuid,uuid,text,text,timestamptz,text,text)'::regprocedure))
    < position('m26_lock_device_authority_v1(p_device_id)' in pg_get_functiondef('public.service_record_physical_pilot_network_validation_v1(uuid,uuid,bigint,uuid,uuid,uuid,uuid,text,text,timestamptz,text,text)'::regprocedure)),
  'receipt replay lookup precedes mutable device authority lock'
);
select ok(
  position('m26_lock_device_authority_v1(p_device_id)' in pg_get_functiondef('public.service_record_physical_pilot_network_validation_v1(uuid,uuid,bigint,uuid,uuid,uuid,uuid,text,text,timestamptz,text,text)'::regprocedure))
    < position('pg_advisory_xact_lock(hashtext(''m26_repository_authority''))' in pg_get_functiondef('public.service_record_physical_pilot_network_validation_v1(uuid,uuid,bigint,uuid,uuid,uuid,uuid,text,text,timestamptz,text,text)'::regprocedure)),
  'new network validation locks device before repository authority'
);
select ok(
  position('pg_advisory_xact_lock(hashtext(''m26_repository_authority''))' in pg_get_functiondef('public.service_record_physical_pilot_network_validation_v1(uuid,uuid,bigint,uuid,uuid,uuid,uuid,text,text,timestamptz,text,text)'::regprocedure))
    < position('where id=p_commissioning_id' in pg_get_functiondef('public.service_record_physical_pilot_network_validation_v1(uuid,uuid,bigint,uuid,uuid,uuid,uuid,text,text,timestamptz,text,text)'::regprocedure)),
  'repository authority lock precedes commissioning row lock'
);
select ok(
  position('Network validation receipt replay conflict' in pg_get_functiondef('public.service_record_physical_pilot_network_validation_v1(uuid,uuid,bigint,uuid,uuid,uuid,uuid,text,text,timestamptz,text,text)'::regprocedure)) > 0,
  'exact conflicting receipt replay remains rejected'
);
select ok(
  has_function_privilege('service_role','public.service_record_physical_pilot_network_validation_v1(uuid,uuid,bigint,uuid,uuid,uuid,uuid,text,text,timestamptz,text,text)','EXECUTE'),
  'service role retains sanctioned RPC execution'
);
select ok(
  not has_function_privilege('authenticated','public.service_record_physical_pilot_network_validation_v1(uuid,uuid,bigint,uuid,uuid,uuid,uuid,text,text,timestamptz,text,text)','EXECUTE'),
  'authenticated role remains excluded from service RPC'
);

select * from finish();
rollback;
