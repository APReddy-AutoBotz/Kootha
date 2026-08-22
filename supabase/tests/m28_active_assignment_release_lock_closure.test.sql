begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

select ok(
  position(
    'm21-authority-global'
    in lower(pg_get_functiondef('public.save_ad_work_assignment(uuid,uuid,uuid,text,text[],boolean)'::regprocedure))
  ) > 0
  and position(
    'm21-authority-global'
    in lower(pg_get_functiondef('public.save_ad_work_assignment(uuid,uuid,uuid,text,text[],boolean)'::regprocedure))
  ) < position(
    'select * into v_ad_work'
    in lower(pg_get_functiondef('public.save_ad_work_assignment(uuid,uuid,uuid,text,text[],boolean)'::regprocedure))
  ),
  'active Admin assignment RPC acquires M21 global authority before the parent row lock'
);

select ok(
  position(
    'm21-authority-global'
    in lower(pg_get_functiondef('public.release_flexible_ad_work_to_driver(uuid,text,boolean)'::regprocedure))
  ) > 0
  and position(
    'm21-authority-global'
    in lower(pg_get_functiondef('public.release_flexible_ad_work_to_driver(uuid,text,boolean)'::regprocedure))
  ) < position(
    'select * into v_ad_work'
    in lower(pg_get_functiondef('public.release_flexible_ad_work_to_driver(uuid,text,boolean)'::regprocedure))
  ),
  'active Admin release RPC acquires M21 global authority before the parent row lock'
);

select ok(
  position(
    'aw.assignment_status = ''cancelled'''
    in lower(pg_get_functiondef('public.m28_guard_cancelled_assignment_write_v1()'::regprocedure))
  ) = 0,
  'assignment-only cancellation is not treated as whole-work cancellation by the child fence'
);

select ok(
  position(
    'aw.planning_status = ''cancelled'''
    in lower(pg_get_functiondef('public.m28_guard_cancelled_assignment_write_v1()'::regprocedure))
  ) > 0
  and position(
    'aw.execution_overall_status = ''cancelled'''
    in lower(pg_get_functiondef('public.m28_guard_cancelled_assignment_write_v1()'::regprocedure))
  ) > 0
  and position(
    'aw.closure_status = ''cancelled'''
    in lower(pg_get_functiondef('public.m28_guard_cancelled_assignment_write_v1()'::regprocedure))
  ) > 0
  and position(
    'aw.cancellation_reason is not null'
    in lower(pg_get_functiondef('public.m28_guard_cancelled_assignment_write_v1()'::regprocedure))
  ) > 0,
  'child fence still derives authoritative whole-work cancellation from parent lifecycle state'
);

insert into public.user_profiles (auth_user_id, display_name, role)
values ('28e00000-0000-4000-8000-000000000001', 'M28 Active Authority Admin', 'admin');

insert into public.drivers (
  id, name, phone, approval_status, onboarding_status
) values (
  '28e00000-0000-4000-8000-000000000002',
  'M28 Active Authority Driver', '9000000029', 'approved', 'approved'
);

insert into public.vehicles (
  id, vehicle_number, vehicle_type, onboarding_status, active,
  mic_available, mic_system_available
) values (
  '28e00000-0000-4000-8000-000000000003',
  'M28-ACTIVE-VEHICLE', 'van', 'approved', true, true, true
);

insert into public.ad_works (
  id, title, start_date, end_date, status, planning_status,
  assignment_status, execution_release_status, execution_overall_status,
  closure_status, execution_mode, driver_required, vehicle_required,
  speaker_required, areas_required
) values
  (
    '28e00000-0000-4000-8000-000000000101',
    'Active UI assignment and release control',
    current_date + 1, current_date + 1,
    'scheduled', 'planned', 'not_assigned', 'not_released', 'not_started',
    'not_ready', 'driver_app', true, false, false, false
  ),
  (
    '28e00000-0000-4000-8000-000000000102',
    'Assignment-only cancellation control',
    current_date + 2, current_date + 2,
    'scheduled', 'planned', 'not_assigned', 'not_released', 'not_started',
    'not_ready', 'admin_managed', false, false, false, false
  );

insert into public.ad_work_days (
  id, ad_work_id, work_date, status, planning_status, execution_status
) values (
  '28e00000-0000-4000-8000-000000000201',
  '28e00000-0000-4000-8000-000000000101',
  current_date + 1, 'scheduled', 'planned', 'planned'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '28e00000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select * from public.save_ad_work_assignment(
      '28e00000-0000-4000-8000-000000000101',
      '28e00000-0000-4000-8000-000000000002',
      null,
      'Active assignment lock-order control',
      '{}'::text[],
      false
    )$$,
  'current UI assignment RPC remains usable on active work'
);

select is(
  (
    select status
    from public.ad_work_assignments
    where ad_work_id = '28e00000-0000-4000-8000-000000000101'
  ),
  'ready_for_execution'::text,
  'current UI assignment RPC leaves executable assignment authority ready'
);

select lives_ok(
  $$select * from public.release_flexible_ad_work_to_driver(
      '28e00000-0000-4000-8000-000000000101',
      'LOCK29',
      false
    )$$,
  'current UI release RPC remains usable after governed assignment'
);

select is(
  (
    select execution_release_status
    from public.ad_works
    where id = '28e00000-0000-4000-8000-000000000101'
  ),
  'released_to_driver'::text,
  'current UI release RPC preserves released-to-driver authority'
);

select is(
  (
    select execution_status
    from public.ad_work_days
    where id = '28e00000-0000-4000-8000-000000000201'
  ),
  'ready'::text,
  'release still transitions planned work day to ready'
);

select lives_ok(
  $$select * from public.assign_driver_vehicle_to_ad_work(
      '28e00000-0000-4000-8000-000000000102',
      '28e00000-0000-4000-8000-000000000002',
      '28e00000-0000-4000-8000-000000000003',
      'cancelled',
      'Assignment-only cancellation',
      '{}'::text[],
      false
    )$$,
  'assignment-only cancellation remains a valid governed assignment state'
);

select is(
  (
    select assignment_status::text || ':' || planning_status::text || ':' || status::text
    from public.ad_works
    where id = '28e00000-0000-4000-8000-000000000102'
  ),
  'cancelled:planned:scheduled'::text,
  'assignment-only cancellation does not fabricate whole-work cancellation'
);

select lives_ok(
  $$select * from public.assign_driver_vehicle_to_ad_work(
      '28e00000-0000-4000-8000-000000000102',
      '28e00000-0000-4000-8000-000000000002',
      '28e00000-0000-4000-8000-000000000003',
      'assigned',
      'Assignment restored',
      '{}'::text[],
      false
    )$$,
  'active work can be reassigned after assignment-only cancellation'
);

select is(
  (
    select status
    from public.ad_work_assignments
    where ad_work_id = '28e00000-0000-4000-8000-000000000102'
  ),
  'assigned'::text,
  'reassignment restores child assignment state'
);

select is(
  (
    select assignment_status
    from public.ad_works
    where id = '28e00000-0000-4000-8000-000000000102'
  ),
  'assigned'::text,
  'reassignment restores parent assignment summary state'
);

select is(
  (
    select assignment_status
    from public.m21_assignment_history
    where ad_work_id = '28e00000-0000-4000-8000-000000000102'
      and effective_until is null
    order by effective_from desc
    limit 1
  ),
  'assigned'::text,
  'M21 assignment history truthfully records the restored active assignment'
);

reset role;
select * from finish();
rollback;
