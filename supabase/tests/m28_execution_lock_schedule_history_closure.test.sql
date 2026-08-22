begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

select has_function(
  'public', 'admin_list_ad_work_schedule_events_v1', array['uuid','bigint','integer'],
  'M28 bounded schedule-history RPC exists'
);

select ok(
  position('m21-authority-global' in lower(pg_get_functiondef('public.admin_update_ad_work_day(uuid,text,text)'::regprocedure))) > 0
  and position('m21-authority-global' in lower(pg_get_functiondef('public.admin_update_ad_work_day(uuid,text,text)'::regprocedure)))
      < position('for update' in lower(pg_get_functiondef('public.admin_update_ad_work_day(uuid,text,text)'::regprocedure))),
  'legacy admin day execution takes M21 global authority before any row lock'
);

insert into public.user_profiles(auth_user_id, display_name, role)
values
  ('28c00000-0000-4000-8000-0000000000a1', 'M28 History Admin', 'admin'),
  ('28c00000-0000-4000-8000-0000000000a2', 'M28 History Staff', 'staff');

insert into public.ad_works(
  id, title, start_date, end_date, status, planning_status,
  assignment_status, execution_release_status, execution_overall_status,
  closure_status, execution_mode
) values (
  '28c00000-0000-4000-8000-000000000101', 'M28 schedule history paging',
  current_date + 1, current_date + 1, 'scheduled', 'planned',
  'not_assigned', 'not_released', 'not_started', 'not_ready', 'admin_managed'
);

insert into public.ad_work_days(id, ad_work_id, work_date, status, planning_status, execution_status)
values (
  '28c00000-0000-4000-8000-000000000201',
  '28c00000-0000-4000-8000-000000000101', current_date + 1,
  'scheduled', 'planned', 'planned'
);

insert into public.ad_work_schedule_events(
  id, ad_work_id, actor_id, event_type, from_start_date, from_end_date,
  to_start_date, to_end_date, reason, customer_message, schedule_version, created_at
)
select
  ('28c00000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
  '28c00000-0000-4000-8000-000000000101'::uuid,
  '28c00000-0000-4000-8000-0000000000a1'::uuid,
  'ad_work_rescheduled', current_date + g, current_date + g,
  current_date + g + 1, current_date + g + 1,
  'Schedule reason ' || g, 'Customer schedule update ' || g, g,
  clock_timestamp() + make_interval(secs => g)
from generate_series(1,25) g;

set local role authenticated;
select set_config('request.jwt.claim.sub', '28c00000-0000-4000-8000-0000000000a2', true);
select throws_ok(
  $$select public.admin_list_ad_work_schedule_events_v1('28c00000-0000-4000-8000-000000000101', null, 20)$$,
  '42501', 'Admin access required', 'non-admin cannot page schedule history'
);

select set_config('request.jwt.claim.sub', '28c00000-0000-4000-8000-0000000000a1', true);
select is(
  jsonb_array_length(public.admin_get_commercial_schedule_v1('28c00000-0000-4000-8000-000000000101')->'scheduleEvents'),
  20, 'snapshot embeds only the newest 20 schedule events'
);
select is(
  public.admin_get_commercial_schedule_v1('28c00000-0000-4000-8000-000000000101')->'scheduleEventsPage'->>'hasMore',
  'true', 'snapshot advertises older schedule history'
);
select is(
  public.admin_get_commercial_schedule_v1('28c00000-0000-4000-8000-000000000101')->'scheduleEventsPage'->>'nextBeforeVersion',
  '6', 'snapshot schedule cursor is deterministic'
);
select is(
  (select string_agg(value->>'version', ',' order by ordinality)
   from jsonb_array_elements(public.admin_list_ad_work_schedule_events_v1(
     '28c00000-0000-4000-8000-000000000101', 6, 3
   )->'events') with ordinality),
  '5,4,3', 'schedule history cursor returns newest older page in order'
);
select is(
  (public.admin_list_ad_work_schedule_events_v1(
    '28c00000-0000-4000-8000-000000000101', 6, 3
  )->'page'->>'hasMore') || ':' || coalesce(
    public.admin_list_ad_work_schedule_events_v1(
      '28c00000-0000-4000-8000-000000000101', 6, 3
    )->'page'->>'nextBeforeVersion', 'null'),
  'true:3', 'schedule history page exposes the next deterministic cursor'
);
select is(
  (select string_agg(value->>'version', ',' order by ordinality)
   from jsonb_array_elements(public.admin_list_ad_work_schedule_events_v1(
     '28c00000-0000-4000-8000-000000000101', 3, 20
   )->'events') with ordinality),
  '2,1', 'final schedule history page returns remaining events'
);
select is(
  (public.admin_list_ad_work_schedule_events_v1(
    '28c00000-0000-4000-8000-000000000101', 3, 20
  )->'page'->>'hasMore') || ':' || coalesce(
    public.admin_list_ad_work_schedule_events_v1(
      '28c00000-0000-4000-8000-000000000101', 3, 20
    )->'page'->>'nextBeforeVersion', 'null'),
  'false:null', 'schedule history cursor exhausts cleanly'
);
select throws_ok(
  $$select public.admin_list_ad_work_schedule_events_v1('28c00000-0000-4000-8000-000000000101', null, 101)$$,
  '22023', 'Schedule history page size must be between 1 and 100', 'schedule history page size is bounded'
);
select is(
  (select execution_status from public.admin_update_ad_work_day(
    '28c00000-0000-4000-8000-000000000201', 'report_issue', 'Lock-order regression check'
  )),
  'issue_reported'::text, 'legacy admin execution behavior remains available on non-cancelled work'
);
select ok(
  (select issue_note = 'Lock-order regression check' from public.ad_work_days
   where id = '28c00000-0000-4000-8000-000000000201'),
  'legacy execution mutation still persists its expected evidence note'
);

select * from finish();
rollback;
