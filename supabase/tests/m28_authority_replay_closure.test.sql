begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

insert into public.user_profiles (auth_user_id, display_name, role)
values ('28800000-0000-4000-8000-0000000000a1', 'M28 Replay Admin', 'admin');

insert into public.ad_works (
  id, title, start_date, end_date, status, payment_status, total_amount, paid_amount,
  planning_status, number_of_days, assignment_status, execution_release_status,
  execution_overall_status, closure_status
) values
  ('28800000-0000-4000-8000-000000000101', 'Replay Payment', current_date + 1, current_date + 1, 'scheduled', 'not_paid', 1000, 0,
   'planned', 1, 'not_assigned', 'not_released', 'not_started', 'not_ready'),
  ('28800000-0000-4000-8000-000000000102', 'Issued Day Batch', current_date + 5, current_date + 5, 'scheduled', 'not_paid', 500, 0,
   'planned', 1, 'ready_for_execution', 'released_to_driver', 'not_started', 'not_ready'),
  ('28800000-0000-4000-8000-000000000103', 'Replay Whole Reschedule', current_date + 10, current_date + 11, 'scheduled', 'not_paid', 700, 0,
   'planned', 2, 'not_assigned', 'not_released', 'not_started', 'not_ready'),
  ('28800000-0000-4000-8000-000000000104', 'Null Day Version', current_date + 20, current_date + 21, 'scheduled', 'not_paid', 800, 0,
   'planned', 2, 'not_assigned', 'not_released', 'not_started', 'not_ready'),
  ('28800000-0000-4000-8000-000000000105', 'Replay Cancellation', current_date + 30, current_date + 30, 'scheduled', 'not_paid', 900, 0,
   'planned', 1, 'not_assigned', 'not_released', 'not_started', 'not_ready'),
  ('28800000-0000-4000-8000-000000000106', 'Bounded Commercial History', current_date + 40, current_date + 40, 'scheduled', 'not_paid', 1000, 0,
   'planned', 1, 'not_assigned', 'not_released', 'not_started', 'not_ready');

insert into public.ad_work_days (
  id, ad_work_id, work_date, status, planning_status, execution_status
) values
  ('28800000-0000-4000-8000-000000000202', '28800000-0000-4000-8000-000000000102', current_date + 5, 'scheduled', 'planned', 'ready'),
  ('28800000-0000-4000-8000-000000000203', '28800000-0000-4000-8000-000000000103', current_date + 10, 'scheduled', 'planned', 'planned'),
  ('28800000-0000-4000-8000-000000000204', '28800000-0000-4000-8000-000000000103', current_date + 11, 'scheduled', 'planned', 'planned'),
  ('28800000-0000-4000-8000-000000000205', '28800000-0000-4000-8000-000000000104', current_date + 20, 'scheduled', 'planned', 'planned'),
  ('28800000-0000-4000-8000-000000000206', '28800000-0000-4000-8000-000000000104', current_date + 21, 'scheduled', 'planned', 'planned'),
  ('28800000-0000-4000-8000-000000000207', '28800000-0000-4000-8000-000000000105', current_date + 30, 'scheduled', 'planned', 'planned');

select has_table('public', 'm28_mutation_operations', 'M28 private mutation replay ledger exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.m28_mutation_operations'::regclass),
  'M28 mutation replay ledger has RLS enabled'
);
select has_function(
  'public', 'admin_list_ad_work_commercial_events_v1',
  array['uuid','bigint','integer'],
  'bounded commercial history cursor RPC exists'
);
select ok(
  not has_table_privilege('authenticated', 'public.m28_mutation_operations', 'SELECT')
  and not has_table_privilege('service_role', 'public.m28_mutation_operations', 'SELECT'),
  'browser and service roles cannot directly read replay ledger'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.m28_claim_replay_v1(uuid,uuid,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.m28_record_result_v1(uuid,uuid,text,text,text,jsonb)',
    'EXECUTE'
  ),
  'replay helpers are not directly executable by authenticated clients'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '28800000-0000-4000-8000-0000000000a1', true);

select throws_ok(
  $$update public.ad_works
    set cancellation_reason = 'forged outside authority'
    where id = '28800000-0000-4000-8000-000000000101'$$,
  '42501',
  'Schedule fields must be changed through governed M28 authority',
  'direct cancellation metadata DML is denied'
);

select throws_ok(
  $$select public.admin_reschedule_ad_work_v1(
    '28800000-0000-4000-8000-000000000103',
    current_date + 12,
    'Null version must fail',
    null
  )$$,
  '40001',
  'Schedule changed; refresh and retry',
  'whole-work reschedule rejects null expected version'
);
select throws_ok(
  $$select public.admin_reschedule_ad_work_day_v1(
    '28800000-0000-4000-8000-000000000104',
    '28800000-0000-4000-8000-000000000205',
    current_date + 22,
    'Null version must fail',
    null
  )$$,
  '40001',
  'Schedule changed; refresh and retry',
  'single-day reschedule rejects null expected version'
);

select throws_ok(
  $$select public.admin_update_ad_work_days_v2(
    '28800000-0000-4000-8000-000000000102',
    jsonb_build_array(
      jsonb_build_object(
        'id', '28800000-0000-4000-8000-000000000202',
        'workDate', (current_date + 6)::text,
        'plannedStartTime', '09:00'
      )
    ),
    0
  )$$,
  '55000',
  'Schedule is no longer in initial planning; use Commercial and Schedule reschedule',
  'day-batch schedule edit is fenced after execution authority is issued'
);
select is(
  (
    select schedule_version::text || ':' || start_date::text
    from public.ad_works
    where id = '28800000-0000-4000-8000-000000000102'
  ),
  '0:' || (current_date + 5)::text,
  'failed issued-authority day batch leaves version and schedule unchanged'
);

select is(
  (
    public.admin_update_ad_work_payment_v1(
      '28800000-0000-4000-8000-000000000101',
      'partially_paid', 1000, 250, 'Advance received', 0
    )->'snapshot'->'adWork'->>'commercialVersion'
  )::bigint,
  1::bigint,
  'first payment mutation commits version one'
);
select is(
  (
    public.admin_update_ad_work_payment_v1(
      '28800000-0000-4000-8000-000000000101',
      'partially_paid', 1000, 250, 'Advance received', 0
    )->'snapshot'->'adWork'->>'commercialVersion'
  )::bigint,
  1::bigint,
  'identical payment retry returns canonical committed response'
);
select is(
  (
    select count(*)
    from public.ad_work_commercial_events
    where ad_work_id = '28800000-0000-4000-8000-000000000101'
  ),
  1::bigint,
  'payment replay does not duplicate commercial history'
);
select throws_ok(
  $$select public.admin_update_ad_work_payment_v1(
    '28800000-0000-4000-8000-000000000101',
    'partially_paid', 1000, 300, 'Changed retry', 0
  )$$,
  '40001',
  'Commercial record changed; refresh and retry',
  'same payment operation identity cannot be reused with changed input'
);

select is(
  (
    public.admin_reschedule_ad_work_v1(
      '28800000-0000-4000-8000-000000000103',
      current_date + 12,
      'Customer requested later start',
      0
    )->'snapshot'->'adWork'->>'scheduleVersion'
  )::bigint,
  1::bigint,
  'first whole-work reschedule commits version one'
);
select is(
  (
    public.admin_reschedule_ad_work_v1(
      '28800000-0000-4000-8000-000000000103',
      current_date + 12,
      'Customer requested later start',
      0
    )->'snapshot'->'adWork'->>'scheduleVersion'
  )::bigint,
  1::bigint,
  'identical whole-work retry returns canonical committed response'
);
select is(
  (
    select count(*)
    from public.ad_work_schedule_events
    where ad_work_id = '28800000-0000-4000-8000-000000000103'
  ),
  1::bigint,
  'whole-work replay emits exactly one schedule history event'
);
select is(
  (
    select count(*)
    from public.customer_updates
    where ad_work_id = '28800000-0000-4000-8000-000000000103'
  ),
  1::bigint,
  'whole-work replay emits exactly one customer-safe draft'
);
select throws_ok(
  $$select public.admin_reschedule_ad_work_v1(
    '28800000-0000-4000-8000-000000000103',
    current_date + 13,
    'Different retry payload',
    0
  )$$,
  '40001',
  'Schedule changed; refresh and retry',
  'same reschedule operation identity cannot be reused with changed input'
);

select is(
  (
    public.admin_cancel_ad_work_v1(
      '28800000-0000-4000-8000-000000000105',
      'Campaign withdrawn',
      'Internal planning note',
      0
    )->'snapshot'->'adWork'->>'scheduleVersion'
  )::bigint,
  1::bigint,
  'first cancellation commits version one'
);
select is(
  (
    public.admin_cancel_ad_work_v1(
      '28800000-0000-4000-8000-000000000105',
      'Campaign withdrawn',
      'Internal planning note',
      0
    )->'snapshot'->'adWork'->>'scheduleVersion'
  )::bigint,
  1::bigint,
  'identical cancellation retry returns canonical committed response'
);
select is(
  (
    select count(*)
    from public.ad_work_schedule_events
    where ad_work_id = '28800000-0000-4000-8000-000000000105'
      and event_type = 'ad_work_cancelled'
  ),
  1::bigint,
  'cancellation replay emits exactly one lifecycle event'
);

reset role;
insert into public.ad_work_commercial_events(
  ad_work_id, actor_id, from_payment_status, payment_status,
  from_total_amount, total_amount, from_paid_amount, paid_amount,
  balance_amount, note, commercial_version
)
select
  '28800000-0000-4000-8000-000000000106'::uuid,
  '28800000-0000-4000-8000-0000000000a1'::uuid,
  'not_paid'::public.payment_status,
  'not_paid'::public.payment_status,
  1000, 1000, 0, 0, 1000,
  'internal event note ' || g,
  g
from generate_series(1, 25) as g;

set local role authenticated;
select set_config('request.jwt.claim.sub', '28800000-0000-4000-8000-0000000000a1', true);

select is(
  jsonb_array_length(
    public.admin_get_commercial_schedule_v1(
      '28800000-0000-4000-8000-000000000106'
    )->'commercialEvents'
  ),
  20,
  'snapshot embeds only the latest twenty commercial events'
);
select is(
  (
    public.admin_get_commercial_schedule_v1(
      '28800000-0000-4000-8000-000000000106'
    )->'commercialEventsPage'->>'returned'
  )::integer,
  20,
  'snapshot reports the bounded commercial event count'
);
select ok(
  (
    public.admin_get_commercial_schedule_v1(
      '28800000-0000-4000-8000-000000000106'
    )->'commercialEventsPage'->>'hasMore'
  )::boolean,
  'snapshot reports when older commercial history exists'
);
select is(
  (
    public.admin_get_commercial_schedule_v1(
      '28800000-0000-4000-8000-000000000106'
    )->'commercialEventsPage'->>'nextBeforeVersion'
  )::bigint,
  6::bigint,
  'snapshot exposes deterministic cursor for older commercial history'
);
select ok(
  not exists (
    select 1
    from jsonb_array_elements(
      public.admin_get_commercial_schedule_v1(
        '28800000-0000-4000-8000-000000000106'
      )->'commercialEvents'
    ) event
    where event ? 'note'
  ),
  'embedded commercial history omits internal event notes'
);

select is(
  jsonb_array_length(
    public.admin_list_ad_work_commercial_events_v1(
      '28800000-0000-4000-8000-000000000106',
      6,
      20
    )->'events'
  ),
  5,
  'bounded history RPC returns the older cursor page'
);
select ok(
  not (
    public.admin_list_ad_work_commercial_events_v1(
      '28800000-0000-4000-8000-000000000106',
      6,
      20
    )->'page'->>'hasMore'
  )::boolean,
  'last history page reports no further records'
);
select is(
  public.admin_list_ad_work_commercial_events_v1(
    '28800000-0000-4000-8000-000000000106',
    6,
    20
  )->'page'->>'nextBeforeVersion',
  null::text,
  'last history page has no next cursor'
);
select throws_ok(
  $$select public.admin_list_ad_work_commercial_events_v1(
    '28800000-0000-4000-8000-000000000106',
    null,
    101
  )$$,
  '22023',
  'Commercial history page size must be between 1 and 100',
  'commercial history RPC rejects an unbounded page size'
);

reset role;
select is(
  (
    select count(*)
    from public.m28_mutation_operations
    where actor_id = '28800000-0000-4000-8000-0000000000a1'
  ),
  3::bigint,
  'only successfully committed logical mutations remain in replay ledger'
);

select * from finish();
rollback;
