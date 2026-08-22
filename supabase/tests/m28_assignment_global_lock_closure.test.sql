begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

select ok(
  position(
    'm21-authority-global'
    in lower(pg_get_functiondef('public.m28_claim_replay_v1(uuid,uuid,text,text,text)'::regprocedure))
  ) > 0,
  'every M28 replay claim uses the canonical M21 global authority lock'
);

select ok(
  position(
    'm21-authority-global'
    in lower(pg_get_functiondef('public.m28_claim_replay_v1(uuid,uuid,text,text,text)'::regprocedure))
  ) < position(
    'if not exists'
    in lower(pg_get_functiondef('public.m28_claim_replay_v1(uuid,uuid,text,text,text)'::regprocedure))
  ),
  'M21 global authority lock is acquired before replay helper touches Ad Work authority'
);

select ok(
  position(
    'if p_mutation_type = ''cancel'''
    in lower(pg_get_functiondef('public.m28_claim_replay_v1(uuid,uuid,text,text,text)'::regprocedure))
  ) = 0,
  'M21 global authority locking is no longer cancellation-only'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.ad_work_assignments'::regclass
      and tgname = 'm28_guard_cancelled_assignment_write'
      and not tgisinternal
  ),
  'cancelled-parent assignment write guard is installed on ad_work_assignments'
);

select ok(
  position(
    'Cancelled Ad Work assignments are immutable outside governed cancellation authority'
    in pg_get_functiondef('public.m28_guard_cancelled_assignment_write_v1()'::regprocedure)
  ) > 0
  and position(
    'aw.cancelled_at is not null'
    in lower(pg_get_functiondef('public.m28_guard_cancelled_assignment_write_v1()'::regprocedure))
  ) > 0,
  'assignment guard derives cancellation from authoritative parent state and fails closed'
);

insert into public.user_profiles (auth_user_id, display_name, role)
values ('28c00000-0000-4000-8000-000000000001', 'M28 Assignment Guard Admin', 'admin');

insert into public.drivers (
  id, name, phone, approval_status, onboarding_status
) values (
  '28c00000-0000-4000-8000-000000000002',
  'M28 Assignment Guard Driver', '9000000028', 'approved', 'approved'
);

insert into public.vehicles (
  id, vehicle_number, vehicle_type, onboarding_status, active
) values (
  '28c00000-0000-4000-8000-000000000003',
  'M28-GUARD-VEHICLE', 'van', 'approved', true
);

insert into public.ad_works (
  id, title, start_date, end_date, status, planning_status,
  assignment_status, execution_release_status, execution_overall_status,
  closure_status, execution_mode
) values
  (
    '28c00000-0000-4000-8000-000000000101',
    'Cancelled assignment guard existing row',
    current_date + 1,
    current_date + 1,
    'scheduled', 'planned', 'assigned', 'not_released', 'not_started', 'not_ready', 'admin_managed'
  ),
  (
    '28c00000-0000-4000-8000-000000000102',
    'Cancelled assignment guard no row',
    current_date + 2,
    current_date + 2,
    'scheduled', 'planned', 'not_assigned', 'not_released', 'not_started', 'not_ready', 'admin_managed'
  ),
  (
    '28c00000-0000-4000-8000-000000000103',
    'Non-cancelled assignment control',
    current_date + 3,
    current_date + 3,
    'scheduled', 'planned', 'assigned', 'not_released', 'not_started', 'not_ready', 'admin_managed'
  );

insert into public.ad_work_assignments (
  id, ad_work_id, driver_id, vehicle_id, status
) values
  (
    '28c00000-0000-4000-8000-000000000201',
    '28c00000-0000-4000-8000-000000000101',
    '28c00000-0000-4000-8000-000000000002',
    '28c00000-0000-4000-8000-000000000003',
    'assigned'
  ),
  (
    '28c00000-0000-4000-8000-000000000203',
    '28c00000-0000-4000-8000-000000000103',
    '28c00000-0000-4000-8000-000000000002',
    '28c00000-0000-4000-8000-000000000003',
    'assigned'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '28c00000-0000-4000-8000-000000000001', true);

select is(
  (
    public.admin_cancel_ad_work_v1(
      '28c00000-0000-4000-8000-000000000101',
      'Customer cancelled campaign',
      null,
      0
    )->'snapshot'->'adWork'->>'scheduleVersion'
  )::bigint,
  1::bigint,
  'governed cancellation can still demote an existing assignment before parent cancellation becomes authoritative'
);

select is(
  (
    select status
    from public.ad_work_assignments
    where id = '28c00000-0000-4000-8000-000000000201'
  ),
  'cancelled'::text,
  'governed cancellation leaves the existing child assignment cancelled'
);

select throws_ok(
  $$update public.ad_work_assignments
    set status = 'assigned', updated_at = clock_timestamp()
    where id = '28c00000-0000-4000-8000-000000000201'$$,
  '42501',
  'Cancelled Ad Work assignments are immutable outside governed cancellation authority',
  'direct admin UPDATE cannot reactivate a child assignment after parent cancellation'
);

select is(
  (
    select status
    from public.ad_work_assignments
    where id = '28c00000-0000-4000-8000-000000000201'
  ),
  'cancelled'::text,
  'failed reactivation leaves canonical assignment state cancelled'
);

select is(
  (
    select assignment_status
    from public.m21_assignment_history
    where assignment_id = '28c00000-0000-4000-8000-000000000201'
    order by effective_from desc
    limit 1
  ),
  'cancelled'::text,
  'failed reactivation cannot create a new active M21 assignment-history interval'
);

select is(
  (
    public.admin_cancel_ad_work_v1(
      '28c00000-0000-4000-8000-000000000102',
      'Customer cancelled before assignment',
      null,
      0
    )->'snapshot'->'adWork'->>'scheduleVersion'
  )::bigint,
  1::bigint,
  'governed cancellation also succeeds when no assignment row exists'
);

select throws_ok(
  $$insert into public.ad_work_assignments (
      id, ad_work_id, driver_id, vehicle_id, status
    ) values (
      '28c00000-0000-4000-8000-000000000202',
      '28c00000-0000-4000-8000-000000000102',
      '28c00000-0000-4000-8000-000000000002',
      '28c00000-0000-4000-8000-000000000003',
      'ready_for_execution'
    )$$,
  '42501',
  'Cancelled Ad Work assignments are immutable outside governed cancellation authority',
  'direct admin INSERT cannot create executable assignment authority under a cancelled parent'
);

select is(
  (
    select count(*)::integer
    from public.ad_work_assignments
    where ad_work_id = '28c00000-0000-4000-8000-000000000102'
  ),
  0,
  'failed post-cancellation INSERT leaves no child assignment row'
);

select lives_ok(
  $$select * from public.assign_driver_vehicle_to_ad_work(
      '28c00000-0000-4000-8000-000000000103',
      '28c00000-0000-4000-8000-000000000002',
      '28c00000-0000-4000-8000-000000000003',
      'needs_review',
      'Normal non-cancelled assignment control',
      '{}'::text[],
      false
    )$$,
  'governed assignment mutation remains available for non-cancelled work'
);

select is(
  (
    select status
    from public.ad_work_assignments
    where id = '28c00000-0000-4000-8000-000000000203'
  ),
  'needs_review'::text,
  'non-cancelled assignment state still updates normally through governed authority'
);

reset role;
select * from finish();
rollback;
