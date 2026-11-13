begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into public.drivers (
  id, name, phone, approval_status, onboarding_status
) values (
  '30c00000-0000-4000-8000-000000000001',
  'Fake M30 Closure Driver', '9000000340', 'approved', 'approved'
);

insert into public.vehicles (
  id, vehicle_number, vehicle_type, onboarding_status, active
) values (
  '30c00000-0000-4000-8000-000000000002',
  'M30-FAKE-CLOSURE', 'van', 'approved', true
);

insert into public.ad_works (
  id, title, start_date, end_date, number_of_days,
  status, planning_status, assignment_status,
  execution_release_status, execution_overall_status,
  closure_status, execution_mode, driver_required, vehicle_required,
  work_access_code_hash, work_access_code_hint, work_access_code_created_at
) values
  (
    '30c00000-0000-4000-8000-000000000101',
    'Fake M30 closure ends Work Code access',
    public.m30_business_date(), public.m30_business_date(), 1,
    'scheduled', 'planned', 'ready_for_execution',
    'released_to_driver', 'completed',
    'ready_to_close', 'driver_app', true, true,
    public.m6_hash_work_code('CLOSE3400'), '3400', clock_timestamp()
  ),
  (
    '30c00000-0000-4000-8000-000000000102',
    'Fake M30 closure without a Work Code',
    public.m30_business_date(), public.m30_business_date(), 1,
    'scheduled', 'planned', 'not_assigned',
    'not_released', 'completed',
    'ready_to_close', 'admin_managed', false, false,
    null, null, null
  );

insert into public.ad_work_assignments (
  id, ad_work_id, driver_id, vehicle_id, status
) values (
  '30c00000-0000-4000-8000-000000000201',
  '30c00000-0000-4000-8000-000000000101',
  '30c00000-0000-4000-8000-000000000001',
  '30c00000-0000-4000-8000-000000000002',
  'ready_for_execution'
);

insert into public.ad_work_days (
  id, ad_work_id, work_date, status, planning_status, execution_status,
  driver_id, vehicle_id
) values (
  '30c00000-0000-4000-8000-000000000301',
  '30c00000-0000-4000-8000-000000000101',
  public.m30_business_date(), 'scheduled', 'planned', 'completed',
  '30c00000-0000-4000-8000-000000000001',
  '30c00000-0000-4000-8000-000000000002'
);

set local role anon;

select is(
  (select count(*) from public.driver_get_assigned_work('9000000340', 'CLOSE3400')),
  1::bigint,
  'Before closure the Work Code opens the job'
);

reset role;

update public.ad_works
set closure_status = 'closed'
where id in ('30c00000-0000-4000-8000-000000000101', '30c00000-0000-4000-8000-000000000102');

select is(
  (select work_access_code_hash from public.ad_works where id = '30c00000-0000-4000-8000-000000000101'),
  'closed:' || public.m6_hash_work_code('CLOSE3400'),
  'Closing replaces the digest with a value that cannot match'
);

select ok(
  (select work_access_code_hash is null from public.ad_works where id = '30c00000-0000-4000-8000-000000000102'),
  'Closing work that never had a Work Code leaves the digest empty'
);

set local role anon;

select throws_ok(
  $$select * from public.driver_get_assigned_work('9000000340', 'CLOSE3400')$$,
  '42501',
  'Invalid work code or mobile number',
  'After closure the Work Code no longer opens the job'
);

select throws_ok(
  $$select * from public.driver_update_work_day(
      '9000000340', 'CLOSE3400', '30c00000-0000-4000-8000-000000000301',
      'add_proof_note', 'Fake late note', 'Fake Market', 'other'
    )$$,
  '42501',
  'Invalid work code or mobile number',
  'After closure the driver cannot add a Proof Note'
);

select throws_ok(
  $$select * from public.driver_update_work_day(
      '9000000340', '', '30c00000-0000-4000-8000-000000000301',
      'issue', 'Fake late issue', null, null
    )$$,
  '42501',
  'Invalid work code or mobile number',
  'After closure an empty Work Code is still refused'
);

reset role;

update public.ad_works
set closure_status = 'closed_with_issues'
where id = '30c00000-0000-4000-8000-000000000101';

select is(
  (select work_access_code_hash from public.ad_works where id = '30c00000-0000-4000-8000-000000000101'),
  'closed:' || public.m6_hash_work_code('CLOSE3400'),
  'Changing the closure status again does not rewrite the ended digest'
);

select ok(
  position(
    'gps proof is not available in this version.'
    in lower(pg_get_functiondef('public.close_flexible_ad_work_with_final_summary(uuid,text,text,text,text,boolean,boolean,boolean,text,boolean)'::regprocedure))
  ) > 0,
  'Closure leaves the informational notes out when choosing the status'
);

select ok(
  not has_function_privilege('anon', 'public.close_flexible_ad_work_with_final_summary(uuid,text,text,text,text,boolean,boolean,boolean,text,boolean)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.close_flexible_ad_work_with_final_summary(uuid,text,text,text,text,boolean,boolean,boolean,text,boolean)', 'EXECUTE'),
  'Closure stays an admin-only call'
);

select * from finish();

rollback;
