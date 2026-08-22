begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select ok(
  position(
    'm21-authority-global'
    in lower(pg_get_functiondef('public.m28_claim_replay_v1(uuid,uuid,text,text,text)'::regprocedure))
  ) > 0,
  'cancellation replay authority uses the canonical M21 global authority lock'
);

select ok(
  position(
    'm21-authority-global'
    in lower(pg_get_functiondef('public.m28_claim_replay_v1(uuid,uuid,text,text,text)'::regprocedure))
  ) < position(
    'if not exists'
    in lower(pg_get_functiondef('public.m28_claim_replay_v1(uuid,uuid,text,text,text)'::regprocedure))
  ),
  'M21 global authority lock is acquired before replay helper can touch Ad Work authority rows'
);

select ok(
  position(
    'm28_claim_replay_v1'
    in lower(pg_get_functiondef('public.admin_cancel_ad_work_v1(uuid,text,text,bigint)'::regprocedure))
  ) < position(
    'select * into v_work'
    in lower(pg_get_functiondef('public.admin_cancel_ad_work_v1(uuid,text,text,bigint)'::regprocedure))
  ),
  'cancellation claims replay/global authority before locking the canonical Ad Work row'
);

insert into public.user_profiles (auth_user_id, display_name, role)
values ('28b00000-0000-4000-8000-0000000000a1', 'M28 Day Freeze Admin', 'admin');

insert into public.ad_works (
  id, title, start_date, end_date, status, planning_status,
  assignment_status, execution_release_status, execution_overall_status,
  closure_status, execution_mode
) values
  (
    '28b00000-0000-4000-8000-000000000101',
    'Non-cancelled legacy day authority',
    current_date + 1,
    current_date + 1,
    'scheduled',
    'planned',
    'not_assigned',
    'not_released',
    'not_started',
    'not_ready',
    'admin_managed'
  ),
  (
    '28b00000-0000-4000-8000-000000000102',
    'Cancelled day freeze',
    current_date + 2,
    current_date + 2,
    'scheduled',
    'planned',
    'not_assigned',
    'not_released',
    'not_started',
    'not_ready',
    'admin_managed'
  );

insert into public.ad_work_days (
  id, ad_work_id, work_date, status, planning_status, execution_status
) values
  (
    '28b00000-0000-4000-8000-000000000201',
    '28b00000-0000-4000-8000-000000000101',
    current_date + 1,
    'scheduled',
    'planned',
    'planned'
  ),
  (
    '28b00000-0000-4000-8000-000000000202',
    '28b00000-0000-4000-8000-000000000102',
    current_date + 2,
    'scheduled',
    'planned',
    'planned'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '28b00000-0000-4000-8000-0000000000a1', true);

select is(
  (
    select execution_status
    from public.admin_update_ad_work_day(
      '28b00000-0000-4000-8000-000000000201',
      'report_issue',
      'Pre-cancellation issue remains supported'
    )
  ),
  'issue_reported'::text,
  'existing governed admin day authority remains usable on non-cancelled work'
);

select is(
  (
    public.admin_cancel_ad_work_v1(
      '28b00000-0000-4000-8000-000000000102',
      'Customer withdrew campaign',
      null,
      0
    )->'snapshot'->'adWork'->>'scheduleVersion'
  )::bigint,
  1::bigint,
  'governed cancellation still succeeds with the global lock-first order'
);

select throws_ok(
  $$update public.ad_work_days
    set execution_status = 'running',
        execution_started_at = clock_timestamp(),
        execution_updated_at = clock_timestamp()
    where id = '28b00000-0000-4000-8000-000000000202'$$,
  '42501',
  'Cancelled Ad Work day execution state is immutable outside governed cancellation authority',
  'direct admin PATCH cannot revive execution state on a cancelled work day'
);

select throws_ok(
  $$update public.ad_work_days
    set completion_note = 'forged completion evidence',
        execution_updated_at = clock_timestamp()
    where id = '28b00000-0000-4000-8000-000000000202'$$,
  '42501',
  'Cancelled Ad Work day execution state is immutable outside governed cancellation authority',
  'direct admin PATCH cannot rewrite cancelled-day execution evidence metadata'
);

select throws_ok(
  $$select * from public.admin_update_ad_work_day(
    '28b00000-0000-4000-8000-000000000202',
    'report_issue',
    'legacy authority must not rewrite a cancelled day'
  )$$,
  '42501',
  'Cancelled Ad Work day execution state is immutable outside governed cancellation authority',
  'legacy SECURITY DEFINER day authority cannot rewrite execution after M28 cancellation'
);

reset role;
select is(
  (
    select execution_status
    from public.ad_work_days
    where id = '28b00000-0000-4000-8000-000000000202'
  ),
  'cancelled'::text,
  'failed post-cancellation mutations leave canonical execution status cancelled'
);

select is(
  (
    select issue_note
    from public.ad_work_days
    where id = '28b00000-0000-4000-8000-000000000202'
  ),
  null::text,
  'failed post-cancellation legacy mutation leaves issue evidence untouched'
);

select is(
  (
    select completion_note
    from public.ad_work_days
    where id = '28b00000-0000-4000-8000-000000000202'
  ),
  null::text,
  'failed post-cancellation direct mutation leaves completion evidence untouched'
);

select * from finish();
rollback;
