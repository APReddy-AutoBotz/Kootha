begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into public.user_profiles (auth_user_id, display_name, role)
values ('28a00000-0000-4000-8000-0000000000a1', 'M28 Lifecycle Admin', 'admin');

insert into public.ad_works (
  id, title, start_date, end_date, status, planning_status,
  assignment_status, execution_release_status, execution_overall_status,
  closure_status
) values
  (
    '28a00000-0000-4000-8000-000000000101',
    'Direct lifecycle guard',
    current_date + 1,
    current_date + 1,
    'scheduled',
    'planned',
    'not_assigned',
    'not_released',
    'not_started',
    'not_ready'
  ),
  (
    '28a00000-0000-4000-8000-000000000102',
    'Cancellation immutability',
    current_date + 2,
    current_date + 2,
    'scheduled',
    'planned',
    'not_assigned',
    'not_released',
    'not_started',
    'not_ready'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '28a00000-0000-4000-8000-0000000000a1', true);

select throws_ok(
  $$update public.ad_works
    set assignment_status = 'assigned'
    where id = '28a00000-0000-4000-8000-000000000101'$$,
  '42501',
  'Ad Work lifecycle fields must be changed through governed authority',
  'direct admin assignment lifecycle PATCH is denied'
);

select throws_ok(
  $$update public.ad_works
    set execution_release_status = 'access_revoked'
    where id = '28a00000-0000-4000-8000-000000000101'$$,
  '42501',
  'Ad Work lifecycle fields must be changed through governed authority',
  'direct admin release lifecycle PATCH is denied'
);

select throws_ok(
  $$update public.ad_works
    set execution_overall_status = 'running'
    where id = '28a00000-0000-4000-8000-000000000101'$$,
  '42501',
  'Ad Work lifecycle fields must be changed through governed authority',
  'direct admin execution lifecycle PATCH is denied'
);

select throws_ok(
  $$update public.ad_works
    set closure_status = 'ready_for_review'
    where id = '28a00000-0000-4000-8000-000000000101'$$,
  '42501',
  'Ad Work lifecycle fields must be changed through governed authority',
  'direct admin closure lifecycle PATCH is denied'
);

select throws_ok(
  $$update public.ad_works
    set status = 'cancelled'
    where id = '28a00000-0000-4000-8000-000000000101'$$,
  '42501',
  'Ad Work lifecycle fields must be changed through governed authority',
  'direct admin legacy status cancellation PATCH is denied'
);

select is(
  (
    public.admin_cancel_ad_work_v1(
      '28a00000-0000-4000-8000-000000000102',
      'Customer withdrew campaign',
      null,
      0
    )->'snapshot'->'adWork'->>'scheduleVersion'
  )::bigint,
  1::bigint,
  'governed M28 cancellation still atomically advances the canonical version'
);

reset role;
select throws_ok(
  $$update public.ad_works
    set assignment_status = 'assigned',
        execution_release_status = 'not_released',
        execution_overall_status = 'not_started',
        closure_status = 'not_ready'
    where id = '28a00000-0000-4000-8000-000000000102'$$,
  '42501',
  'Cancelled Ad Work lifecycle is immutable outside governed cancellation authority',
  'even a privileged legacy path cannot resurrect lifecycle state after governed cancellation'
);

select * from finish();
rollback;
