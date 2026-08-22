begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select has_function(
  'public',
  'driver_update_work_day',
  array['text','text','uuid','text','text','text','text'],
  'active Driver execution RPC exists after M28 lock-order closure'
);

select ok(
  strpos(lower(pg_get_functiondef('public.driver_update_work_day(text,text,uuid,text,text,text,text)'::regprocedure)), 'pg_advisory_xact_lock') > 0
  and strpos(lower(pg_get_functiondef('public.driver_update_work_day(text,text,uuid,text,text,text,text)'::regprocedure)), 'for update') > 0
  and strpos(lower(pg_get_functiondef('public.driver_update_work_day(text,text,uuid,text,text,text,text)'::regprocedure)), 'pg_advisory_xact_lock')
      < strpos(lower(pg_get_functiondef('public.driver_update_work_day(text,text,uuid,text,text,text,text)'::regprocedure)), 'for update'),
  'Driver execution acquires m21 authority lock before its first row lock'
);

select ok(
  pg_get_functiondef('public.driver_update_work_day(text,text,uuid,text,text,text,text)'::regprocedure) like '%m21-authority-global%'
  and pg_get_functiondef('public.driver_update_work_day(text,text,uuid,text,text,text,text)'::regprocedure) like '%p_action = ''start''%'
  and pg_get_functiondef('public.driver_update_work_day(text,text,uuid,text,text,text,text)'::regprocedure) like '%p_action = ''take_break''%'
  and pg_get_functiondef('public.driver_update_work_day(text,text,uuid,text,text,text,text)'::regprocedure) like '%p_action = ''resume''%'
  and pg_get_functiondef('public.driver_update_work_day(text,text,uuid,text,text,text,text)'::regprocedure) like '%p_action = ''end''%'
  and pg_get_functiondef('public.driver_update_work_day(text,text,uuid,text,text,text,text)'::regprocedure) like '%p_action = ''issue''%'
  and pg_get_functiondef('public.driver_update_work_day(text,text,uuid,text,text,text,text)'::regprocedure) like '%p_action = ''add_proof_note''%',
  'lock-order closure retains all Driver execution actions'
);

select ok(
  has_function_privilege('anon', 'public.driver_update_work_day(text,text,uuid,text,text,text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.driver_update_work_day(text,text,uuid,text,text,text,text)', 'EXECUTE'),
  'Driver execution RPC remains anon-only at the API role boundary'
);

select * from finish();
rollback;
