begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

insert into public.user_profiles (auth_user_id, display_name, role)
values
  ('28000000-0000-4000-8000-0000000000a1', 'M28 Admin', 'admin'),
  ('28000000-0000-4000-8000-0000000000a2', 'M28 Staff', 'staff');

insert into public.ad_works (
  id, title, start_date, end_date, status, payment_status, total_amount, paid_amount,
  planning_status, number_of_days, assignment_status, execution_release_status,
  execution_overall_status, closure_status
) values
  ('28000000-0000-4000-8000-000000000101', 'M28 Day Reschedule', current_date + 1, current_date + 2, 'scheduled', 'not_paid', 1000, 0,
   'planned', 2, 'ready_for_execution', 'released_to_driver', 'not_started', 'not_ready'),
  ('28000000-0000-4000-8000-000000000102', 'M28 Whole Reschedule', current_date + 10, current_date + 11, 'scheduled', 'not_paid', 2000, 0,
   'planned', 2, 'not_assigned', 'not_released', 'not_started', 'not_ready'),
  ('28000000-0000-4000-8000-000000000103', 'M28 Closed', current_date - 2, current_date - 1, 'completed', 'fully_paid', 500, 500,
   'planned', 1, 'not_assigned', 'not_released', 'completed', 'closed'),
  ('28000000-0000-4000-8000-000000000104', 'M28 Initial Planning', current_date + 30, current_date + 31, 'scheduled', 'not_paid', 800, 0,
   'planned', 2, 'not_assigned', 'not_released', 'not_started', 'not_ready'),
  ('28000000-0000-4000-8000-000000000105', 'M28 Active Day', current_date + 40, current_date + 41, 'running', 'not_paid', 900, 0,
   'planned', 2, 'ready_for_execution', 'released_to_driver', 'running', 'not_ready');

insert into public.ad_work_days (id, ad_work_id, work_date, status, planning_status, execution_status)
values
  ('28000000-0000-4000-8000-000000000201', '28000000-0000-4000-8000-000000000101', current_date + 1, 'scheduled', 'planned', 'ready'),
  ('28000000-0000-4000-8000-000000000202', '28000000-0000-4000-8000-000000000101', current_date + 2, 'scheduled', 'planned', 'ready'),
  ('28000000-0000-4000-8000-000000000203', '28000000-0000-4000-8000-000000000102', current_date + 10, 'scheduled', 'planned', 'planned'),
  ('28000000-0000-4000-8000-000000000204', '28000000-0000-4000-8000-000000000102', current_date + 11, 'scheduled', 'planned', 'planned'),
  ('28000000-0000-4000-8000-000000000205', '28000000-0000-4000-8000-000000000103', current_date - 1, 'completed', 'planned', 'completed'),
  ('28000000-0000-4000-8000-000000000206', '28000000-0000-4000-8000-000000000104', current_date + 30, 'scheduled', 'planned', 'planned'),
  ('28000000-0000-4000-8000-000000000207', '28000000-0000-4000-8000-000000000104', current_date + 31, 'scheduled', 'planned', 'planned'),
  ('28000000-0000-4000-8000-000000000208', '28000000-0000-4000-8000-000000000105', current_date + 40, 'running', 'planned', 'running'),
  ('28000000-0000-4000-8000-000000000209', '28000000-0000-4000-8000-000000000105', current_date + 41, 'scheduled', 'planned', 'ready');

select has_table('public', 'ad_work_commercial_events', 'M28 commercial history table exists');
select has_table('public', 'ad_work_schedule_events', 'M28 schedule history table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.ad_work_commercial_events'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.ad_work_schedule_events'::regclass),
  'M28 histories have RLS enabled'
);
select has_function('public', 'admin_get_commercial_schedule_v1', array['uuid'], 'M28 snapshot RPC exists');
select has_function('public', 'admin_sync_ad_work_days_v2', array['uuid','date','integer','time without time zone','time without time zone','text','bigint'], 'M28 versioned initial planning RPC exists');
select has_function('public', 'admin_update_ad_work_payment_v1', array['uuid','text','numeric','numeric','text','bigint'], 'M28 payment RPC exists');
select has_function('public', 'admin_reschedule_ad_work_v1', array['uuid','date','text','bigint'], 'M28 whole-work reschedule RPC exists');
select has_function('public', 'admin_reschedule_ad_work_day_v1', array['uuid','uuid','date','text','bigint'], 'M28 day reschedule RPC exists');
select has_function('public', 'admin_cancel_ad_work_v1', array['uuid','text','text','bigint'], 'M28 cancellation RPC exists');
select ok(
  not has_table_privilege('anon', 'public.ad_work_commercial_events', 'SELECT')
  and not has_table_privilege('service_role', 'public.ad_work_commercial_events', 'SELECT')
  and not has_table_privilege('service_role', 'public.ad_work_schedule_events', 'SELECT'),
  'anon/service roles cannot directly read M28 histories'
);
select ok(
  has_function_privilege('authenticated', 'public.admin_update_ad_work_payment_v1(uuid,text,numeric,numeric,text,bigint)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.admin_update_ad_work_payment_v1(uuid,text,numeric,numeric,text,bigint)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.admin_update_ad_work_payment_v1(uuid,text,numeric,numeric,text,bigint)', 'EXECUTE'),
  'only authenticated API role receives M28 payment RPC execution privilege'
);
select is(
  (select is_nullable from information_schema.columns where table_schema='public' and table_name='m21_assignment_history' and column_name='vehicle_id'),
  'YES',
  'M21 history can record generic no-vehicle assignment transitions'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '28000000-0000-4000-8000-0000000000a2', true);
select throws_ok(
  $$select public.admin_get_commercial_schedule_v1('28000000-0000-4000-8000-000000000101')$$,
  '42501', 'Admin access required', 'staff cannot read M28 commercial/schedule snapshot'
);
select throws_ok(
  $$select public.admin_update_ad_work_payment_v1('28000000-0000-4000-8000-000000000101','partially_paid',1000,250,null,0)$$,
  '42501', 'Admin access required', 'staff cannot mutate commercial state'
);

select set_config('request.jwt.claim.sub', '28000000-0000-4000-8000-0000000000a1', true);
select throws_ok(
  $$update public.ad_works set paid_amount = 10 where id='28000000-0000-4000-8000-000000000101'$$,
  '42501', 'Commercial fields must be changed through the governed M28 RPC', 'direct admin REST-style commercial DML fails closed'
);
select throws_ok(
  $$update public.ad_works set start_date = current_date + 32 where id='28000000-0000-4000-8000-000000000104'$$,
  '42501', 'Schedule fields must be changed through governed M28 authority', 'direct admin schedule DML fails closed'
);
select throws_ok(
  $$update public.ad_work_days set work_date = current_date + 35 where id='28000000-0000-4000-8000-000000000206'$$,
  '42501', 'Work-day schedule fields must be changed through governed M28 authority', 'direct admin day-date DML fails closed'
);
select is(
  (public.admin_sync_ad_work_days_v2('28000000-0000-4000-8000-000000000104', current_date + 32, 2, null, null, null, 0)->'snapshot'->'adWork'->>'scheduleVersion')::bigint,
  1::bigint,
  'legacy planning chronology now advances the authoritative schedule version'
);
select is(
  (select string_agg(id::text, ',' order by work_date) from public.ad_work_days where ad_work_id='28000000-0000-4000-8000-000000000104'),
  '28000000-0000-4000-8000-000000000206,28000000-0000-4000-8000-000000000207',
  'valid future schedule reconciliation preserves work-day identities'
);
select throws_ok(
  $$select public.admin_sync_ad_work_days_v2('28000000-0000-4000-8000-000000000104', current_date + 34, 1, null, null, null, 1)$$,
  '55000', 'Retained work-day history prevents schedule shrink', 'historical-day conflict refuses destructive schedule shrink'
);
select is(
  (select schedule_version::text || ':' || start_date::text || ':' || end_date::text || ':' || number_of_days::text || ':' ||
          (select count(*)::text from public.ad_work_days d where d.ad_work_id=w.id)
   from public.ad_works w where id='28000000-0000-4000-8000-000000000104'),
  '1:' || (current_date + 32)::text || ':' || (current_date + 33)::text || ':2:2',
  'historical-day conflict leaves version, dates and day count unchanged atomically'
);
select throws_ok(
  $$select public.admin_sync_ad_work_days_v2('28000000-0000-4000-8000-000000000104', current_date + 33, 2, null, null, null, 0)$$,
  '40001', 'Schedule changed; refresh and retry', 'stale legacy planning save is rejected'
);
select throws_ok(
  $$select public.admin_reschedule_ad_work_day_v1('28000000-0000-4000-8000-000000000105','28000000-0000-4000-8000-000000000209',current_date + 43,'Move future day',0)$$,
  '55000', 'Another work day is actively executing; finish or stop it before rescheduling', 'future-day reschedule cannot interrupt an active day'
);

select throws_ok(
  $$select public.admin_update_ad_work_payment_v1('28000000-0000-4000-8000-000000000101','partially_paid',1000,1200,null,0)$$,
  '22023', 'Paid amount cannot exceed total amount', 'contradictory payment values are rejected'
);
select is(
  (public.admin_update_ad_work_payment_v1('28000000-0000-4000-8000-000000000101','partially_paid',1000,250,'Advance received',0)->'snapshot'->'adWork'->>'commercialVersion')::bigint,
  1::bigint,
  'governed payment update increments commercial version'
);
select is(
  (select payment_status::text || ':' || paid_amount::text from public.ad_works where id='28000000-0000-4000-8000-000000000101'),
  'partially_paid:250.00',
  'governed payment update persists coherent commercial truth'
);
select is(
  (select count(*) from public.ad_work_commercial_events where ad_work_id='28000000-0000-4000-8000-000000000101'),
  1::bigint,
  'payment mutation emits immutable commercial history'
);
select throws_ok(
  $$select public.admin_update_ad_work_payment_v1('28000000-0000-4000-8000-000000000101','fully_paid',1000,1000,null,0)$$,
  '40001', 'Commercial record changed; refresh and retry', 'stale commercial version is rejected'
);

select is(
  (public.admin_reschedule_ad_work_day_v1(
    '28000000-0000-4000-8000-000000000101',
    '28000000-0000-4000-8000-000000000201',
    current_date + 4,
    'Customer requested day change',
    0
  )->'snapshot'->'adWork'->>'scheduleVersion')::bigint,
  1::bigint,
  'day reschedule increments schedule version'
);
select is(
  (select execution_release_status || ':' || assignment_status from public.ad_works where id='28000000-0000-4000-8000-000000000101'),
  'access_revoked:needs_review',
  'reschedule invalidates stale release and readiness authority'
);
select is(
  (select work_date from public.ad_work_days where id='28000000-0000-4000-8000-000000000201'),
  current_date + 4,
  'day reschedule preserves day identity while changing its date'
);
select throws_ok(
  $$select public.admin_reschedule_ad_work_day_v1(
      '28000000-0000-4000-8000-000000000101',
      '28000000-0000-4000-8000-000000000202',
      current_date + 4,
      'Collision test',
      1)$$,
  '23505', 'Another work day already uses the requested date', 'date collisions fail closed'
);

reset role;
insert into public.proof_uploads(ad_work_day_id, type, file_path, note)
values ('28000000-0000-4000-8000-000000000202','photo','m28/proof.jpg','Existing proof');
set local role authenticated;
select set_config('request.jwt.claim.sub', '28000000-0000-4000-8000-0000000000a1', true);
select throws_ok(
  $$select public.admin_reschedule_ad_work_day_v1(
      '28000000-0000-4000-8000-000000000101',
      '28000000-0000-4000-8000-000000000202',
      current_date + 5,
      'Should be blocked by proof',
      1)$$,
  '55000', 'Existing proof prevents rescheduling', 'existing proof prevents day history rewrite'
);

select is(
  (public.admin_reschedule_ad_work_v1(
    '28000000-0000-4000-8000-000000000102', current_date + 20,
    'Campaign moved to next week', 0
  )->'snapshot'->'adWork'->>'scheduleVersion')::bigint,
  1::bigint,
  'whole-work reschedule increments schedule version'
);
select ok(
  (select start_date=current_date+20 and end_date=current_date+21 from public.ad_works where id='28000000-0000-4000-8000-000000000102'),
  'whole-work reschedule shifts all unobserved days and recomputes bounds'
);
select is(
  (public.admin_cancel_ad_work_v1(
    '28000000-0000-4000-8000-000000000102',
    'Customer cancelled campaign', 'Internal finance follow-up only', 1
  )->'snapshot'->'adWork'->>'scheduleVersion')::bigint,
  2::bigint,
  'cancellation increments schedule version'
);
select is(
  (select planning_status || ':' || execution_release_status || ':' || execution_overall_status || ':' || closure_status
   from public.ad_works where id='28000000-0000-4000-8000-000000000102'),
  'cancelled:access_revoked:cancelled:cancelled',
  'cancellation closes executable authority consistently'
);
select is(
  (select count(*) from public.ad_work_days where ad_work_id='28000000-0000-4000-8000-000000000102' and status::text='cancelled'),
  2::bigint,
  'cancelled days expose canonical cancelled status to snapshots and operational consumers'
);
select ok(
  not exists (
    select 1 from public.customer_updates
    where ad_work_id='28000000-0000-4000-8000-000000000102'
      and (lower(message) like '%payment%' or lower(message) like '%finance%' or lower(message) like '%paid%')
  ),
  'customer-safe schedule messages never disclose payment or internal cancellation notes'
);
select throws_ok(
  $$select public.admin_cancel_ad_work_v1(
      '28000000-0000-4000-8000-000000000103','Cannot cancel closed work',null,0)$$,
  '55000', 'Completed or closed Ad Work cannot be cancelled here', 'closed/completed historical work cannot be cancelled'
);

reset role;
select throws_ok(
  $$update public.ad_work_commercial_events set note='rewrite' where ad_work_id='28000000-0000-4000-8000-000000000101'$$,
  '55000', 'M28 commercial and schedule history is immutable', 'commercial history cannot be rewritten'
);
select throws_ok(
  $$delete from public.ad_work_schedule_events where ad_work_id='28000000-0000-4000-8000-000000000102'$$,
  '55000', 'M28 commercial and schedule history is immutable', 'schedule history cannot be deleted'
);
select ok(
  pg_get_functiondef('public.m28_assert_day_unobserved_v1(uuid,uuid)'::regprocedure) ~ 'telemetry_receipts'
  and pg_get_functiondef('public.m28_assert_day_unobserved_v1(uuid,uuid)'::regprocedure) ~ 'location_points'
  and pg_get_functiondef('public.m28_assert_day_unobserved_v1(uuid,uuid)'::regprocedure) ~ 'proof_uploads',
  'reschedule authority explicitly binds against physical, phone and proof evidence'
);
select ok(
  exists (
    select 1 from public.audit_logs
    where action='m28_commercial_updated'
      and actor_id='28000000-0000-4000-8000-0000000000a1'
      and safe_details ? 'commercialVersion'
      and not (safe_details ? 'paidAmount')
      and not (safe_details ? 'paymentStatus')
  ),
  'general audit log records authority version without exporting commercial values'
);

select * from finish();
rollback;
