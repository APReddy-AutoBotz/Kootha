begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into public.user_profiles (auth_user_id, display_name, role)
values ('28900000-0000-4000-8000-0000000000a1', 'M28 Replay Current Admin', 'admin');

insert into public.ad_works (
  id, title, start_date, end_date, status, payment_status, total_amount, paid_amount,
  planning_status, number_of_days, assignment_status, execution_release_status,
  execution_overall_status, closure_status
) values (
  '28900000-0000-4000-8000-000000000101',
  'Replay Current Snapshot',
  current_date + 10,
  current_date + 11,
  'scheduled',
  'not_paid',
  1000,
  0,
  'planned',
  2,
  'not_assigned',
  'not_released',
  'not_started',
  'not_ready'
);

insert into public.ad_work_days (
  id, ad_work_id, work_date, status, planning_status, execution_status
) values
  ('28900000-0000-4000-8000-000000000201', '28900000-0000-4000-8000-000000000101', current_date + 10, 'scheduled', 'planned', 'planned'),
  ('28900000-0000-4000-8000-000000000202', '28900000-0000-4000-8000-000000000101', current_date + 11, 'scheduled', 'planned', 'planned');

set local role authenticated;
select set_config('request.jwt.claim.sub', '28900000-0000-4000-8000-0000000000a1', true);

-- Mutation A commits. Treat its response as lost by simply not retaining it.
select is(
  (
    public.admin_reschedule_ad_work_v1(
      '28900000-0000-4000-8000-000000000101',
      current_date + 12,
      'First move',
      0
    )->'snapshot'->'adWork'->>'scheduleVersion'
  )::bigint,
  1::bigint,
  'mutation A commits schedule version one'
);

-- Mutation B legitimately advances the same Ad Work before A is retried.
select is(
  (
    public.admin_reschedule_ad_work_v1(
      '28900000-0000-4000-8000-000000000101',
      current_date + 14,
      'Second move',
      1
    )->'snapshot'->'adWork'->>'scheduleVersion'
  )::bigint,
  2::bigint,
  'mutation B commits schedule version two'
);

-- Retrying A must not replay A's old snapshot as if it were current.
select is(
  (
    public.admin_reschedule_ad_work_v1(
      '28900000-0000-4000-8000-000000000101',
      current_date + 12,
      'First move',
      0
    )->'snapshot'->'adWork'->>'scheduleVersion'
  )::bigint,
  2::bigint,
  'retrying A returns the current schedule version after B'
);

select is(
  public.admin_reschedule_ad_work_v1(
    '28900000-0000-4000-8000-000000000101',
    current_date + 12,
    'First move',
    0
  )->'snapshot'->'adWork'->>'startDate',
  (current_date + 14)::text,
  'retrying A returns B-current schedule state'
);

select is(
  public.admin_reschedule_ad_work_v1(
    '28900000-0000-4000-8000-000000000101',
    current_date + 12,
    'First move',
    0
  )->>'customerMessage',
  format(
    'Kootha update: Replay Current Snapshot has been rescheduled from %s to %s. Reason: First move. Please contact us if you need any clarification.',
    current_date + 10,
    current_date + 12
  ),
  'retrying A preserves A original customer-safe message'
);

reset role;

select is(
  (
    select count(*)
    from public.ad_work_schedule_events
    where ad_work_id = '28900000-0000-4000-8000-000000000101'
      and event_type = 'ad_work_rescheduled'
  ),
  2::bigint,
  'A retry does not duplicate either schedule mutation effect'
);

select is(
  (
    select array_agg(schedule_version order by schedule_version)
    from public.ad_work_schedule_events
    where ad_work_id = '28900000-0000-4000-8000-000000000101'
      and event_type = 'ad_work_rescheduled'
  ),
  array[1::bigint, 2::bigint],
  'schedule history contains exactly A then B versions'
);

select is(
  (
    select count(*)
    from public.customer_updates
    where ad_work_id = '28900000-0000-4000-8000-000000000101'
  ),
  2::bigint,
  'A retry does not duplicate customer-safe drafts'
);

select is(
  (
    select count(*)
    from public.m28_mutation_operations
    where ad_work_id = '28900000-0000-4000-8000-000000000101'
      and mutation_type = 'whole_reschedule'
  ),
  2::bigint,
  'replay ledger retains one operation identity for A and one for B'
);

select is(
  (
    select response->'snapshot'->'adWork'->>'scheduleVersion'
    from public.m28_mutation_operations
    where ad_work_id = '28900000-0000-4000-8000-000000000101'
      and mutation_type = 'whole_reschedule'
      and request_key = '0'
  )::bigint,
  1::bigint,
  'A persisted historical receipt remains the original version-one snapshot'
);

select is(
  (
    select response->>'customerMessage'
    from public.m28_mutation_operations
    where ad_work_id = '28900000-0000-4000-8000-000000000101'
      and mutation_type = 'whole_reschedule'
      and request_key = '0'
  ),
  format(
    'Kootha update: Replay Current Snapshot has been rescheduled from %s to %s. Reason: First move. Please contact us if you need any clarification.',
    current_date + 10,
    current_date + 12
  ),
  'A persisted historical receipt keeps its original customer-safe message'
);

select * from finish();
rollback;
