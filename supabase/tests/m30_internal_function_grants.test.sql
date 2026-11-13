begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select ok(
  not has_function_privilege('anon', 'public.m8_build_final_summary_text(uuid)', 'EXECUTE'),
  'Anonymous callers cannot build Final Proof Summary text directly'
);

select ok(
  not has_function_privilege('authenticated', 'public.m8_build_final_summary_text(uuid)', 'EXECUTE'),
  'Signed-in callers cannot build Final Proof Summary text directly'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.prosrc ilike '%is_admin()%'
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  0::bigint,
  'No admin-checked SECURITY DEFINER function is executable by anonymous callers'
);

select is(
  (
    select coalesce(string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text), '')
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.prorettype <> 'pg_catalog.trigger'::regtype
      and has_function_privilege('anon', p.oid, 'EXECUTE')
      and p.prosrc not ilike '%m6_hash_work_code%'
      and p.proname not in ('is_admin', 'is_valid_proof_upload_path', 'submit_driver_application')
      -- Helper functions that the parallel concurrency tests create in this
      -- database outside a transaction; they are not part of the schema.
      and p.proname not like '%\_parallel\_%'
      and p.proname not like '%\_test\_%'
      and p.proname not like '%\_for\_test'
  ),
  '',
  'Every other anonymous SECURITY DEFINER function checks the Work Code'
);

select ok(
  has_function_privilege('anon', 'public.driver_get_assigned_work(text,text)', 'EXECUTE')
    and has_function_privilege('anon', 'public.submit_driver_application(text,text,text,text,text,text,text,text,boolean,text,text,text,boolean,text)', 'EXECUTE'),
  'The driver app keeps its anonymous work and registration calls'
);

select ok(
  has_function_privilege('authenticated', 'public.prepare_flexible_final_proof_summary(uuid,boolean,boolean,boolean,text,boolean,text,boolean)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.release_flexible_ad_work_to_driver(uuid,text,boolean)', 'EXECUTE'),
  'Signed-in admins keep the summary and release calls'
);

select ok(
  not has_function_privilege('anon', 'public.release_flexible_ad_work_to_driver(uuid,text,boolean)', 'EXECUTE'),
  'Anonymous callers cannot reach the release function'
);

select * from finish();

rollback;
