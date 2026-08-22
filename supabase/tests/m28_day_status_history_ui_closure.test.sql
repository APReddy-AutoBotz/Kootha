begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

insert into public.user_profiles (auth_user_id, display_name, role)
values ('28900000-0000-4000-8000-0000000000a1', 'M28 Status Guard Admin', 'admin');

insert into public.ad_works (
  id, title, start_date, end_date, status, payment_status, total_amount, paid_amount,
  planning_status, number_of_days, assignment_status, execution_release_status,
  execution_overall_status, closure_status
) values (
  '28900000-0000-4000-8000-000000000101',
  'Canonical Day Status Guard',
  current_date + 1,
  current_date + 1,
  'scheduled',
  'not_paid',
  1000,
  0,
  'planned',
  1,
  'not_assigned',
  'not_released',
  'not_started',
  'not_ready'
);

insert into public.ad_work_days (
  id, ad_work_id, work_date, status, planning_status, execution_status
) values (
  '28900000-0000-4000-8000-000000000201',
  '28900000-0000-4000-8000-000000000101',
  current_date + 1,
  'scheduled',
  'planned',
  'planned'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '28900000-0000-4000-8000-0000000000a1', true);

select throws_ok(
  $$update public.ad_work_days
    set status = 'rescheduled'
    where id = '28900000-0000-4000-8000-000000000201'$$,
  '42501',
  'Work-day schedule fields must be changed through governed M28 authority',
  'authenticated admin cannot rewrite canonical day status outside governed authority'
);

reset role;
select is(
  (
    select status::text
    from public.ad_work_days
    where id = '28900000-0000-4000-8000-000000000201'
  ),
  'scheduled',
  'failed direct status rewrite leaves canonical day status unchanged'
);

select * from finish();
rollback;
