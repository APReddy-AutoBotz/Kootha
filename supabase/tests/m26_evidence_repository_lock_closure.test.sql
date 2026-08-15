begin;
select plan(7);

select has_function(
  'public','service_record_physical_pilot_evidence_v1',
  array['uuid','uuid','bigint','uuid','uuid','text','text','uuid','text','uuid','uuid','uuid','uuid','text','timestamp with time zone','timestamp with time zone','bigint','boolean','boolean','text','text','boolean','boolean','text','text[]','text'],
  'physical evidence ingest RPC remains available'
);

select ok(
  position('pg_advisory_xact_lock(hashtext(p_receipt_id::text))' in pg_get_functiondef('public.service_record_physical_pilot_evidence_v1(uuid,uuid,bigint,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,boolean,boolean,text,text,boolean,boolean,text,text[],text)'::regprocedure))
    < position('m26_lock_device_authority_v1(p_device_id)' in pg_get_functiondef('public.service_record_physical_pilot_evidence_v1(uuid,uuid,bigint,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,boolean,boolean,text,text,boolean,boolean,text,text[],text)'::regprocedure)),
  'receipt identity and exact replay precede mutable device authority'
);
select ok(
  position('m26_lock_device_authority_v1(p_device_id)' in pg_get_functiondef('public.service_record_physical_pilot_evidence_v1(uuid,uuid,bigint,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,boolean,boolean,text,text,boolean,boolean,text,text[],text)'::regprocedure))
    < position('pg_advisory_xact_lock(hashtext(''m26_repository_authority''))' in pg_get_functiondef('public.service_record_physical_pilot_evidence_v1(uuid,uuid,bigint,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,boolean,boolean,text,text,boolean,boolean,text,text[],text)'::regprocedure)),
  'new evidence locks device before repository/certification authority'
);
select ok(
  position('pg_advisory_xact_lock(hashtext(''m26_repository_authority''))' in pg_get_functiondef('public.service_record_physical_pilot_evidence_v1(uuid,uuid,bigint,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,boolean,boolean,text,text,boolean,boolean,text,text[],text)'::regprocedure))
    < position('from public.physical_pilot_repository_authority' in pg_get_functiondef('public.service_record_physical_pilot_evidence_v1(uuid,uuid,bigint,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,boolean,boolean,text,text,boolean,boolean,text,text[],text)'::regprocedure)),
  'repository lock precedes repository authority read'
);
select ok(
  position('pg_advisory_xact_lock(hashtext(''m26_repository_authority''))' in pg_get_functiondef('public.service_record_physical_pilot_evidence_v1(uuid,uuid,bigint,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,boolean,boolean,text,text,boolean,boolean,text,text[],text)'::regprocedure))
    < position('m26_current_certification_run_v1' in pg_get_functiondef('public.service_record_physical_pilot_evidence_v1(uuid,uuid,bigint,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,boolean,boolean,text,text,boolean,boolean,text,text[],text)'::regprocedure)),
  'repository lock precedes certification authority read'
);
select ok(
  has_function_privilege('service_role','public.service_record_physical_pilot_evidence_v1(uuid,uuid,bigint,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,boolean,boolean,text,text,boolean,boolean,text,text[],text)','EXECUTE'),
  'service role retains sanctioned evidence ingest execution'
);
select ok(
  not has_function_privilege('authenticated','public.service_record_physical_pilot_evidence_v1(uuid,uuid,bigint,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,boolean,boolean,text,text,boolean,boolean,text,text[],text)','EXECUTE'),
  'authenticated role remains excluded from evidence ingest RPC'
);

select * from finish();
rollback;
