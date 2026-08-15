-- M26 final commissioning/repository serialization guardrails.
\connect postgres supabase_admin
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select ok(
  pg_get_functiondef('public.admin_transition_physical_pilot_commissioning_v1(uuid,uuid,uuid,bigint,uuid,text,text,text,integer)'::regprocedure)
    ilike '%m26_lock_device_authority_v1(p_device_id)%',
  'commissioning mutations participate in the shared M26 device lock'
);

select ok(
  position('m26_lock_device_authority_v1(p_device_id)' in lower(pg_get_functiondef('public.admin_transition_physical_pilot_commissioning_v1(uuid,uuid,uuid,bigint,uuid,text,text,text,integer)'::regprocedure)))
    > position('if v_receipt.id is not null' in lower(pg_get_functiondef('public.admin_transition_physical_pilot_commissioning_v1(uuid,uuid,uuid,bigint,uuid,text,text,text,integer)'::regprocedure)))
  and position('m26_lock_device_authority_v1(p_device_id)' in lower(pg_get_functiondef('public.admin_transition_physical_pilot_commissioning_v1(uuid,uuid,uuid,bigint,uuid,text,text,text,integer)'::regprocedure)))
    < position('select * into v_candidate' in lower(pg_get_functiondef('public.admin_transition_physical_pilot_commissioning_v1(uuid,uuid,uuid,bigint,uuid,text,text,text,integer)'::regprocedure))),
  'exact transition replay is resolved before device serialization and mutation reads'
);

select ok(
  pg_get_functiondef('public.admin_get_physical_pilot_readiness_v1(uuid)'::regprocedure)
    ilike '%m26_repository_authority%',
  'readiness takes repository authority serialization'
);

select ok(
  position('m26_lock_device_authority_v1(p_device_id)' in lower(pg_get_functiondef('public.admin_get_physical_pilot_readiness_v1(uuid)'::regprocedure)))
    < position('m26_repository_authority' in lower(pg_get_functiondef('public.admin_get_physical_pilot_readiness_v1(uuid)'::regprocedure)))
  and position('m26_repository_authority' in lower(pg_get_functiondef('public.admin_get_physical_pilot_readiness_v1(uuid)'::regprocedure)))
    < position('select * into r' in lower(pg_get_functiondef('public.admin_get_physical_pilot_readiness_v1(uuid)'::regprocedure))),
  'readiness lock order is device then repository before the latest generation read'
);

select ok(
  pg_get_functiondef('public.service_rotate_physical_pilot_repository_authority_v1(text,text)'::regprocedure)
    ilike '%m26_repository_authority%',
  'repository rotation and readiness share the same repository serialization key'
);

select volatility_is(
  'public','admin_get_physical_pilot_readiness_v1',array['uuid'],'v',
  'readiness remains volatile so post-lock reads use current committed authority'
);

select ok(
  not exists(
    select 1 from unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) privilege_name
    where has_table_privilege('authenticated','public.physical_pilot_commissioning',privilege_name)
  ),
  'serialization closure does not widen browser commissioning table authority'
);

select * from finish();
rollback;
