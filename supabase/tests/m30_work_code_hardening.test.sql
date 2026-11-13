begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

select matches(
  public.m6_hash_work_code('ABCD2345EF'),
  '^v2:[0-9a-f]{64}$',
  'Work Code digests use the versioned SHA-256 format'
);

select is(
  public.m6_hash_work_code(' abcd2-345ef '),
  public.m6_hash_work_code('ABCD2345EF'),
  'Work Code digests ignore spaces, dashes and letter case'
);

select ok(
  public.m6_hash_work_code('') is not null
    and public.m6_hash_work_code(null) is not null
    and public.m6_hash_work_code('AB') is not null,
  'Empty, missing and short codes still produce a digest, so driver RPC comparisons cannot become NULL'
);

select isnt(
  public.m6_hash_work_code('ABCD2345EF'),
  md5('ABCD2345EF'),
  'Work Code digests are no longer unsalted MD5'
);

select matches(
  public.m30_generate_work_code(),
  '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$',
  'Generated Work Codes are ten characters from the unambiguous alphabet'
);

select is(
  (select count(distinct public.m30_generate_work_code()) from generate_series(1, 200)),
  200::bigint,
  'A sample of generated Work Codes does not repeat'
);

select ok(
  not has_function_privilege('anon', 'public.m30_generate_work_code()', 'EXECUTE'),
  'Anonymous callers cannot run the Work Code generator directly'
);

select ok(
  not has_function_privilege('authenticated', 'public.m30_generate_work_code()', 'EXECUTE'),
  'Authenticated callers cannot run the Work Code generator directly'
);

insert into public.user_profiles (auth_user_id, display_name, role)
values ('30a00000-0000-4000-8000-000000000001', 'Fake M30 Work Code Admin', 'admin');

insert into public.drivers (
  id, name, phone, approval_status, onboarding_status
) values
  (
    '30a00000-0000-4000-8000-000000000002',
    'Fake M30 Work Code Driver', '9000000330', 'approved', 'approved'
  ),
  (
    '30a00000-0000-4000-8000-000000000003',
    'Fake M30 Legacy Code Driver', '9000000331', 'approved', 'approved'
  );

insert into public.vehicles (
  id, vehicle_number, vehicle_type, onboarding_status, active
) values (
  '30a00000-0000-4000-8000-000000000004',
  'M30-FAKE-LEGACY', 'van', 'approved', true
);

insert into public.ad_works (
  id, title, start_date, end_date, status, planning_status,
  assignment_status, execution_release_status, execution_overall_status,
  closure_status, execution_mode, driver_required, vehicle_required,
  speaker_required, areas_required, mobile_location_proof_required
) values (
  '30a00000-0000-4000-8000-000000000101',
  'Fake M30 hardened Work Code control',
  public.m30_business_date(), public.m30_business_date(),
  'scheduled', 'planned', 'not_assigned', 'not_released', 'not_started',
  'not_ready', 'driver_app', true, false, false, false, true
);

insert into public.ad_work_days (
  id, ad_work_id, work_date, status, planning_status, execution_status
) values (
  '30a00000-0000-4000-8000-000000000201',
  '30a00000-0000-4000-8000-000000000101',
  public.m30_business_date(), 'scheduled', 'planned', 'planned'
);

-- Work released before this migration: its stored digest is unsalted MD5.
insert into public.ad_works (
  id, title, start_date, end_date, number_of_days,
  status, planning_status, assignment_status,
  execution_release_status, execution_overall_status,
  closure_status, execution_mode, driver_required, vehicle_required,
  work_access_code_hash, work_access_code_hint, work_access_code_created_at
) values (
  '30a00000-0000-4000-8000-000000000102',
  'Fake M30 legacy MD5 Work Code control',
  public.m30_business_date(), public.m30_business_date(), 1,
  'scheduled', 'planned', 'ready_for_execution',
  'released_to_driver', 'not_started',
  'not_ready', 'driver_app', true, true,
  md5('LEGACY88'), 'CY88', clock_timestamp()
);

insert into public.ad_work_assignments (
  id, ad_work_id, driver_id, vehicle_id, status
) values (
  '30a00000-0000-4000-8000-000000000301',
  '30a00000-0000-4000-8000-000000000102',
  '30a00000-0000-4000-8000-000000000003',
  '30a00000-0000-4000-8000-000000000004',
  'ready_for_execution'
);

insert into public.ad_work_days (
  id, ad_work_id, work_date, status, planning_status, execution_status,
  driver_id, vehicle_id
) values (
  '30a00000-0000-4000-8000-000000000202',
  '30a00000-0000-4000-8000-000000000102',
  public.m30_business_date(), 'scheduled', 'planned', 'ready',
  '30a00000-0000-4000-8000-000000000003',
  '30a00000-0000-4000-8000-000000000004'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '30a00000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select * from public.save_ad_work_assignment(
      '30a00000-0000-4000-8000-000000000101',
      '30a00000-0000-4000-8000-000000000002',
      null,
      'Fake M30 assignment',
      '{}'::text[],
      false
    )$$,
  'Admin can assign the fake driver before release'
);

select matches(
  set_config(
    'm30.code',
    (
      select released.work_access_code
      from public.release_flexible_ad_work_to_driver(
        '30a00000-0000-4000-8000-000000000101', null, false
      ) as released
    ),
    true
  ),
  '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$',
  'Admin release issues a ten-character hardened Work Code'
);

reset role;

select is(
  (
    select work_access_code_hash
    from public.ad_works
    where id = '30a00000-0000-4000-8000-000000000101'
  ),
  public.m6_hash_work_code(current_setting('m30.code')),
  'Release stores the SHA-256 digest of the issued code'
);

select is(
  (
    select work_access_code_hint
    from public.ad_works
    where id = '30a00000-0000-4000-8000-000000000101'
  ),
  right(current_setting('m30.code'), 4),
  'Release keeps the four-character admin hint'
);

set local role anon;

select is(
  (
    select count(*)
    from public.driver_get_assigned_work('9000000330', current_setting('m30.code'))
  ),
  1::bigint,
  'Driver opens assigned work with the issued code'
);

select is(
  (
    select count(*)
    from public.driver_get_assigned_work(
      '90000 00330',
      lower(substr(current_setting('m30.code'), 1, 5)) || '-' || lower(substr(current_setting('m30.code'), 6)) || ' '
    )
  ),
  1::bigint,
  'Driver can type the code in lower case with a dash and spaces'
);

-- A driver RPC that compares digests with "<>" must refuse an empty, missing
-- or short Work Code even when the session id and mobile number are right.
select lives_ok(
  format(
    $$select * from public.driver_update_work_day('9000000330', %L, '30a00000-0000-4000-8000-000000000201', 'start', null, null, null)$$,
    current_setting('m30.code')
  ),
  'Driver starts work with the issued code'
);

select ok(
  set_config(
    'm30.session',
    (
      select started.tracking_session_id::text
      from public.driver_start_mobile_tracking(
        '9000000330', current_setting('m30.code'),
        '30a00000-0000-4000-8000-000000000201', true
      ) as started
    ),
    true
  ) is not null,
  'Driver starts Location Proof with the issued code'
);

select lives_ok(
  format(
    $$select * from public.driver_record_mobile_location_point('9000000330', %L, %L::uuid, 0, 0, 5, null, null, clock_timestamp(), 'm30-synthetic-point-1')$$,
    current_setting('m30.code'), current_setting('m30.session')
  ),
  'A location point is saved with the issued code'
);

select throws_ok(
  format(
    $$select * from public.driver_record_mobile_location_point('9000000330', '', %L::uuid, 0, 0, 5, null, null, clock_timestamp(), 'm30-synthetic-point-2')$$,
    current_setting('m30.session')
  ),
  '42501',
  'Invalid work code or mobile number',
  'A location point with an empty Work Code is refused'
);

select throws_ok(
  format(
    $$select * from public.driver_record_mobile_location_point('9000000330', null, %L::uuid, 0, 0, 5, null, null, clock_timestamp(), 'm30-synthetic-point-3')$$,
    current_setting('m30.session')
  ),
  '42501',
  'Invalid work code or mobile number',
  'A location point with a missing Work Code is refused'
);

select throws_ok(
  format(
    $$select * from public.driver_sync_mobile_location_points_v2('9000000330', '', %L::uuid, '[]'::jsonb, 0)$$,
    current_setting('m30.session')
  ),
  '42501',
  'Invalid work code or mobile number',
  'A location sync with an empty Work Code is refused'
);

select throws_ok(
  format(
    $$select * from public.driver_stop_mobile_tracking(%L, 'AB', %L::uuid, 'other')$$,
    '9000000330', current_setting('m30.session')
  ),
  '42501',
  'Invalid work code or mobile number',
  'Stopping Location Proof with a short Work Code is refused'
);

select throws_ok(
  $$select * from public.driver_get_assigned_work('9000000330', 'WRONGCODE9')$$,
  '42501',
  'Invalid work code or mobile number',
  'A wrong Work Code is refused'
);

select throws_ok(
  $$select * from public.driver_get_assigned_work('9000000331', 'LEGACY88')$$,
  '42501',
  'Invalid work code or mobile number',
  'A code issued as MD5 before this migration no longer opens work'
);

reset role;
set local role authenticated;

select throws_ok(
  $$select * from public.release_flexible_ad_work_to_driver(
      '30a00000-0000-4000-8000-000000000101', 'SHORT-7', false
    )$$,
  '22000',
  'Work access code must have at least 8 letters or numbers',
  'Admin-supplied codes shorter than eight letters or numbers are refused'
);

select lives_ok(
  $$select * from public.release_flexible_ad_work_to_driver(
      '30a00000-0000-4000-8000-000000000101', 'custom-2468', false
    )$$,
  'Admin can regenerate with a custom code of eight or more letters or numbers'
);

reset role;
set local role anon;

select throws_ok(
  format(
    $$select * from public.driver_get_assigned_work('9000000330', %L)$$,
    current_setting('m30.code')
  ),
  '42501',
  'Invalid work code or mobile number',
  'Regenerating the Work Code invalidates the previous code'
);

select is(
  (
    select count(*)
    from public.driver_get_assigned_work('9000000330', 'CUSTOM2468')
  ),
  1::bigint,
  'Driver opens assigned work with the regenerated custom code'
);

reset role;
set local role authenticated;

select matches(
  (
    select released.work_access_code
    from public.release_ad_work_to_driver(
      '30a00000-0000-4000-8000-000000000101', null, false
    ) as released
  ),
  '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$',
  'The retained M6 release RPC issues hardened codes through the governed path'
);

reset role;

select * from finish();

rollback;
