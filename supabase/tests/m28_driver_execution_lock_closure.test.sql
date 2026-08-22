begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select ok(
  position(
    'm21-authority-global'
    in lower(pg_get_functiondef('public.driver_update_work_day(text,text,uuid,text,text,text,text)'::regprocedure))
  ) > 0
  and position(
    'm21-authority-global'
    in lower(pg_get_functiondef('public.driver_update_work_day(text,text,uuid,text,text,text,text)'::regprocedure))
  ) < position(
    'select day_row.* into v_day'
    in lower(pg_get_functiondef('public.driver_update_work_day(text,text,uuid,text,text,text,text)'::regprocedure))
  ),
  'Driver execution acquires canonical M21 global authority before the work-day row lock'
);

select ok(
  position(
    'pg_advisory_xact_lock'
    in lower(pg_get_functiondef('public.driver_update_work_day(text,text,uuid,text,text,text,text)'::regprocedure))
  ) < position(
    'for update'
    in lower(pg_get_functiondef('public.driver_update_work_day(text,text,uuid,text,text,text,text)'::regprocedure))
  ),
  'Driver execution advisory lock precedes the first FOR UPDATE row lock'
);

select ok(
  has_function_privilege(
    'anon',
    'public.driver_update_work_day(text,text,uuid,text,text,text,text)',
    'EXECUTE'
  ),
  'Driver execution RPC remains available to the anonymous work-code flow'
);

insert into public.drivers (
  id, name, phone, approval_status, onboarding_status
) values (
  '29000000-0000-4000-8000-000000000001',
  'M28 Driver Lock Driver', '9000000031', 'approved', 'approved'
);

insert into public.vehicles (
  id, vehicle_number, vehicle_type, onboarding_status, active
) values (
  '29000000-0000-4000-8000-000000000002',
  'M28-DRIVER-LOCK', 'van', 'approved', true
);

insert into public.ad_works (
  id, title, start_date, end_date, number_of_days,
  status, planning_status, assignment_status,
  execution_release_status, execution_overall_status,
  closure_status, execution_mode, driver_required, vehicle_required,
  work_access_code_hash, work_access_code_hint, work_access_code_created_at
) values (
  '29000000-0000-4000-8000-000000000101',
  'Driver execution lock-order control',
  current_date, current_date, 1,
  'scheduled', 'planned', 'ready_for_execution',
  'released_to_driver', 'not_started',
  'not_ready', 'driver_app', true, true,
  public.m6_hash_work_code('LOCK31'), 'CK31', clock_timestamp()
);

insert into public.ad_work_assignments (
  id, ad_work_id, driver_id, vehicle_id, status
) values (
  '29000000-0000-4000-8000-000000000201',
  '29000000-0000-4000-8000-000000000101',
  '29000000-0000-4000-8000-000000000001',
  '29000000-0000-4000-8000-000000000002',
  'ready_for_execution'
);

insert into public.ad_work_days (
  id, ad_work_id, work_date, status, planning_status, execution_status,
  driver_id, vehicle_id
) values (
  '29000000-0000-4000-8000-000000000301',
  '29000000-0000-4000-8000-000000000101',
  current_date,
  'scheduled', 'planned', 'ready',
  '29000000-0000-4000-8000-000000000001',
  '29000000-0000-4000-8000-000000000002'
);

set local role anon;

select throws_ok(
  $$select * from public.driver_update_work_day(
      '9000000031', 'WRONG31',
      '29000000-0000-4000-8000-000000000301',
      'start', null, null, null
    )$$,
  '42501',
  'Invalid work code or mobile number',
  'invalid anonymous driver credentials remain denied before execution authority'
);

select lives_ok(
  $$select * from public.driver_update_work_day(
      '9000000031', 'LOCK31',
      '29000000-0000-4000-8000-000000000301',
      'start', null, null, null
    )$$,
  'Driver app can start released work through the serialized authority path'
);

select lives_ok(
  $$select * from public.driver_update_work_day(
      '9000000031', 'LOCK31',
      '29000000-0000-4000-8000-000000000301',
      'take_break', null, null, null
    )$$,
  'Driver app can take a break through the serialized authority path'
);

select lives_ok(
  $$select * from public.driver_update_work_day(
      '9000000031', 'LOCK31',
      '29000000-0000-4000-8000-000000000301',
      'resume', null, null, null
    )$$,
  'Driver app can resume through the serialized authority path'
);

select lives_ok(
  $$select * from public.driver_update_work_day(
      '9000000031', 'LOCK31',
      '29000000-0000-4000-8000-000000000301',
      'end', 'Driver completed the scheduled work', null, null
    )$$,
  'Driver app can complete the final work day through the serialized authority path'
);

reset role;

select is(
  (
    select execution_status
    from public.ad_work_days
    where id = '29000000-0000-4000-8000-000000000301'
  ),
  'completed'::text,
  'Driver execution leaves the canonical day completed'
);

select is(
  (
    select execution_overall_status
    from public.ad_works
    where id = '29000000-0000-4000-8000-000000000101'
  ),
  'completed'::text,
  'Single-day driver completion closes the parent execution state'
);

select is(
  (
    select execution_status
    from public.m21_execution_history
    where ad_work_day_id = '29000000-0000-4000-8000-000000000301'
      and effective_until is null
    order by effective_from desc
    limit 1
  ),
  'completed'::text,
  'M21 execution history truthfully retains the final driver transition'
);

select is(
  (
    select count(*)::integer
    from public.customer_updates
    where ad_work_id = '29000000-0000-4000-8000-000000000101'
      and ad_work_day_id = '29000000-0000-4000-8000-000000000301'
      and type = 'completed'
  ),
  1,
  'Driver completion still produces the retained customer-safe completion draft'
);

select * from finish();
rollback;
