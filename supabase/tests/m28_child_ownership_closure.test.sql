begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select ok(
  position(
    'Ad Work assignment ownership is immutable'
    in pg_get_functiondef('public.m28_guard_cancelled_assignment_write_v1()'::regprocedure)
  ) > 0
  and position(
    'new.ad_work_id is distinct from old.ad_work_id'
    in lower(pg_get_functiondef('public.m28_guard_cancelled_assignment_write_v1()'::regprocedure))
  ) > 0,
  'assignment guard makes parent ownership immutable on UPDATE'
);

select ok(
  position(
    'Ad Work day ownership is immutable'
    in pg_get_functiondef('public.m28_guard_day_schedule_write_v1()'::regprocedure)
  ) > 0
  and position(
    'new.ad_work_id is distinct from old.ad_work_id'
    in lower(pg_get_functiondef('public.m28_guard_day_schedule_write_v1()'::regprocedure))
  ) > 0,
  'work-day guard makes parent ownership immutable on UPDATE'
);

select ok(
  position(
    'new.ad_work_id is distinct from old.ad_work_id'
    in lower(pg_get_functiondef('public.m28_guard_cancelled_assignment_write_v1()'::regprocedure))
  ) < position(
    'select'
    in lower(pg_get_functiondef('public.m28_guard_cancelled_assignment_write_v1()'::regprocedure))
  ),
  'assignment ownership is rejected before destination-parent cancellation lookup'
);

select ok(
  position(
    'new.ad_work_id is distinct from old.ad_work_id'
    in lower(pg_get_functiondef('public.m28_guard_day_schedule_write_v1()'::regprocedure))
  ) < position(
    'v_execution_changed :='
    in lower(pg_get_functiondef('public.m28_guard_day_schedule_write_v1()'::regprocedure))
  ),
  'work-day ownership is rejected before schedule/execution state evaluation'
);

insert into public.user_profiles (auth_user_id, display_name, role)
values ('28f00000-0000-4000-8000-000000000001', 'M28 Ownership Admin', 'admin');

insert into public.drivers (
  id, name, phone, approval_status, onboarding_status
) values (
  '28f00000-0000-4000-8000-000000000002',
  'M28 Ownership Driver', '9000000030', 'approved', 'approved'
);

insert into public.vehicles (
  id, vehicle_number, vehicle_type, onboarding_status, active
) values (
  '28f00000-0000-4000-8000-000000000003',
  'M28-OWNERSHIP-VEHICLE', 'van', 'approved', true
);

insert into public.ad_works (
  id, title, start_date, end_date, number_of_days,
  status, planning_status, assignment_status,
  execution_release_status, execution_overall_status,
  closure_status, execution_mode
) values
  (
    '28f00000-0000-4000-8000-000000000101',
    'Cancelled child ownership source',
    current_date + 1, current_date + 1, 1,
    'scheduled', 'planned', 'assigned',
    'not_released', 'not_started', 'not_ready', 'admin_managed'
  ),
  (
    '28f00000-0000-4000-8000-000000000102',
    'Active child ownership destination',
    current_date + 2, current_date + 2, 1,
    'scheduled', 'planned', 'not_assigned',
    'not_released', 'not_started', 'not_ready', 'admin_managed'
  );

insert into public.ad_work_assignments (
  id, ad_work_id, driver_id, vehicle_id, status
) values (
  '28f00000-0000-4000-8000-000000000201',
  '28f00000-0000-4000-8000-000000000101',
  '28f00000-0000-4000-8000-000000000002',
  '28f00000-0000-4000-8000-000000000003',
  'assigned'
);

insert into public.ad_work_days (
  id, ad_work_id, work_date, status, planning_status, execution_status
) values (
  '28f00000-0000-4000-8000-000000000301',
  '28f00000-0000-4000-8000-000000000101',
  current_date + 1,
  'scheduled', 'planned', 'planned'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '28f00000-0000-4000-8000-000000000001', true);

select is(
  (
    public.admin_cancel_ad_work_v1(
      '28f00000-0000-4000-8000-000000000101',
      'Customer cancelled ownership fixture',
      null,
      0
    )->'snapshot'->'adWork'->>'scheduleVersion'
  )::bigint,
  1::bigint,
  'governed cancellation establishes the source parent cancellation boundary'
);

select is(
  (
    select status
    from public.ad_work_assignments
    where id = '28f00000-0000-4000-8000-000000000201'
  ),
  'cancelled'::text,
  'governed cancellation demotes the source assignment before ownership tests'
);

select throws_ok(
  $$update public.ad_work_assignments
    set ad_work_id = '28f00000-0000-4000-8000-000000000102',
        status = 'ready_for_execution',
        updated_at = clock_timestamp()
    where id = '28f00000-0000-4000-8000-000000000201'$$,
  '42501',
  'Ad Work assignment ownership is immutable',
  'cancelled assignment cannot be moved to an active work and reactivated'
);

select is(
  (
    select ad_work_id::text || ':' || status
    from public.ad_work_assignments
    where id = '28f00000-0000-4000-8000-000000000201'
  ),
  '28f00000-0000-4000-8000-000000000101:cancelled'::text,
  'failed move leaves assignment attached to the cancelled source'
);

select is(
  (
    select count(*)::integer
    from public.ad_work_assignments
    where ad_work_id = '28f00000-0000-4000-8000-000000000102'
  ),
  0,
  'failed assignment move creates no destination authority'
);

select is(
  (
    select ad_work_id::text || ':' || assignment_status
    from public.m21_assignment_history
    where assignment_id = '28f00000-0000-4000-8000-000000000201'
      and effective_until is null
    order by effective_from desc
    limit 1
  ),
  '28f00000-0000-4000-8000-000000000101:cancelled'::text,
  'M21 assignment history remains attributed to the original cancelled work'
);

select throws_ok(
  $$update public.ad_work_days
    set ad_work_id = '28f00000-0000-4000-8000-000000000102',
        updated_at = clock_timestamp()
    where id = '28f00000-0000-4000-8000-000000000301'$$,
  '42501',
  'Ad Work day ownership is immutable',
  'cancelled work day cannot be re-parented to an active work'
);

select is(
  (
    select ad_work_id
    from public.ad_work_days
    where id = '28f00000-0000-4000-8000-000000000301'
  ),
  '28f00000-0000-4000-8000-000000000101'::uuid,
  'failed day move leaves ownership on the cancelled source'
);

select is(
  (
    select count(*)::integer
    from public.ad_work_days
    where ad_work_id = '28f00000-0000-4000-8000-000000000101'
  ),
  1,
  'source retains its canonical work-day row after rejected move'
);

select is(
  (
    select count(*)::integer
    from public.ad_work_days
    where ad_work_id = '28f00000-0000-4000-8000-000000000102'
  ),
  0,
  'destination gains no work-day row after rejected move'
);

reset role;
select * from finish();
rollback;
