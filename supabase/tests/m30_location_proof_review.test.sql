begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- reviewed_by references auth.users, so the fake admin needs an auth row.
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values (
  '30b00000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'fake-m30-review-admin@example.test',
  now(), now()
);

insert into public.user_profiles (auth_user_id, display_name, role)
values ('30b00000-0000-4000-8000-000000000001', 'Fake M30 Review Admin', 'admin');

insert into public.ad_works (
  id, title, start_date, end_date, status, planning_status,
  assignment_status, execution_release_status, execution_overall_status,
  closure_status, execution_mode, driver_required, vehicle_required,
  speaker_required, areas_required
) values (
  '30b00000-0000-4000-8000-000000000101',
  'Fake M30 Location Proof Review control',
  current_date, current_date,
  'scheduled', 'planned', 'not_assigned', 'not_released', 'not_started',
  'not_ready', 'driver_app', true, false, false, false
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '30b00000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select * from public.update_location_proof_review(
      '30b00000-0000-4000-8000-000000000101', 'needs_follow_up', 'Fake first note'
    )$$,
  'Admin can save a first Location Proof Review'
);

select is(
  (
    select saved.review_status
    from public.update_location_proof_review(
      '30b00000-0000-4000-8000-000000000101', 'reviewed', 'Fake second note'
    ) as saved
  ),
  'reviewed'::text,
  'Saving again updates the same review and returns it'
);

select throws_ok(
  $$select * from public.update_location_proof_review(
      '30b00000-0000-4000-8000-000000000101', 'not_a_status', null
    )$$,
  '22023',
  'Invalid location proof review status',
  'An unknown review status is refused'
);

reset role;

select is(
  (
    select count(*)
    from public.location_proof_reviews
    where ad_work_id = '30b00000-0000-4000-8000-000000000101'
  ),
  1::bigint,
  'Two saves leave exactly one review row for the Ad Work'
);

select is(
  (
    select review_note || ':' || reviewed_by::text
    from public.location_proof_reviews
    where ad_work_id = '30b00000-0000-4000-8000-000000000101'
  ),
  'Fake second note:30b00000-0000-4000-8000-000000000001',
  'The stored review holds the latest note and the reviewing admin'
);

select ok(
  not has_function_privilege('anon', 'public.update_location_proof_review(uuid,text,text)', 'EXECUTE'),
  'Anonymous callers cannot save a Location Proof Review'
);

select * from finish();

rollback;
