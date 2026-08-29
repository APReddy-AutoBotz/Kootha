begin;

select plan(20);

select has_column(
  'public',
  'driver_applications',
  'client_submission_id',
  'Driver applications retain a client idempotency key'
);

select has_column(
  'public',
  'proof_uploads',
  'client_request_id',
  'Proof uploads retain a client idempotency key'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'driver_applications_client_submission_id_unique'
      and indexdef ilike '%unique%'
  ),
  'Driver application idempotency keys are unique'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'proof_uploads_client_request_id_unique'
      and indexdef ilike '%unique%'
  ),
  'Proof request idempotency keys are unique'
);

select ok(
  to_regprocedure(
    'public.request_driver_proof_upload(text,text,uuid,text,text,text,text,integer)'
  ) is null,
  'The non-idempotent proof-slot RPC signature is removed'
);

select ok(
  has_function_privilege(
    'anon',
    'public.request_driver_proof_upload(text,text,uuid,text,text,text,text,integer,text)',
    'EXECUTE'
  ),
  'Anonymous work-code flow can call only the idempotent proof-slot RPC'
);

select ok(
  not has_table_privilege('anon', 'public.driver_applications', 'INSERT'),
  'Anonymous clients cannot bypass the idempotent application RPC with direct inserts'
);

select ok(
  has_function_privilege(
    'anon',
    'public.submit_driver_application(text,text,text,text,text,text,text,text,boolean,text,text,text,boolean,text)',
    'EXECUTE'
  ),
  'Anonymous clients can call the bounded idempotent application RPC'
);

set local role anon;

select lives_ok(
  $$select * from public.submit_driver_application(
      'application-m29-idempotent-0001',
      'Fake M29 Retry Driver',
      '9000000236',
      'Fake Pilot City',
      null,
      'driver_only',
      'auto',
      null,
      false,
      'not_sure',
      null,
      null,
      true,
      null
    )$$,
  'The first driver application request succeeds'
);

select lives_ok(
  $$select * from public.submit_driver_application(
      'application-m29-idempotent-0001',
      'Fake M29 Retry Driver',
      '9000000236',
      'Fake Pilot City',
      null,
      'driver_only',
      'auto',
      null,
      false,
      'not_sure',
      null,
      null,
      true,
      null
    )$$,
  'Retrying the same driver application request succeeds'
);

reset role;

select is(
  (
    select count(*)
    from public.driver_applications
    where client_submission_id = 'application-m29-idempotent-0001'
  ),
  1::bigint,
  'Retrying one driver application creates exactly one row'
);

insert into public.drivers (
  id, name, phone, approval_status, onboarding_status
) values (
  '36200000-0000-4000-8000-000000000001',
  'Fake M29 Proof Retry Driver', '9000000237', 'approved', 'approved'
);

insert into public.vehicles (
  id, vehicle_number, vehicle_type, onboarding_status, active
) values (
  '36200000-0000-4000-8000-000000000002',
  'M29-FAKE-PROOF-RETRY', 'van', 'approved', true
);

insert into public.ad_works (
  id, title, start_date, end_date, number_of_days,
  status, planning_status, assignment_status,
  execution_release_status, execution_overall_status,
  closure_status, execution_mode, driver_required, vehicle_required,
  work_access_code_hash, work_access_code_hint, work_access_code_created_at
) values (
  '36200000-0000-4000-8000-000000000101',
  'Fake proof retry work',
  current_date, current_date, 1,
  'scheduled', 'planned', 'ready_for_execution',
  'released_to_driver', 'running',
  'not_ready', 'driver_app', true, true,
  public.m6_hash_work_code('PROOF37'), 'OF37', clock_timestamp()
);

insert into public.ad_work_assignments (
  id, ad_work_id, driver_id, vehicle_id, status
) values (
  '36200000-0000-4000-8000-000000000201',
  '36200000-0000-4000-8000-000000000101',
  '36200000-0000-4000-8000-000000000001',
  '36200000-0000-4000-8000-000000000002',
  'ready_for_execution'
);

insert into public.ad_work_days (
  id, ad_work_id, work_date, status, planning_status, execution_status,
  driver_id, vehicle_id
) values (
  '36200000-0000-4000-8000-000000000301',
  '36200000-0000-4000-8000-000000000101',
  current_date, 'scheduled', 'planned', 'running',
  '36200000-0000-4000-8000-000000000001',
  '36200000-0000-4000-8000-000000000002'
);

set local role anon;

select lives_ok(
  $$select * from public.request_driver_proof_upload(
      '9000000237',
      'PROOF37',
      '36200000-0000-4000-8000-000000000301',
      'area_covered',
      'Fake Pilot Area',
      'Fake proof retry note',
      'image/jpeg',
      1024,
      'proof-m29-idempotent-0001'
    )$$,
  'The first proof request creates an upload slot'
);

select lives_ok(
  $$select * from public.request_driver_proof_upload(
      '9000000237',
      'PROOF37',
      '36200000-0000-4000-8000-000000000301',
      'area_covered',
      'Fake Pilot Area',
      'Fake proof retry note',
      'image/jpeg',
      1024,
      'proof-m29-idempotent-0001'
    )$$,
  'Retrying the proof request returns the existing upload slot'
);

reset role;

select is(
  (
    select count(*)
    from public.proof_uploads
    where client_request_id = 'proof-m29-idempotent-0001'
  ),
  1::bigint,
  'Proof request retry creates exactly one proof row'
);

insert into storage.objects (bucket_id, name, metadata)
select
  proof.file_bucket,
  proof.file_path,
  jsonb_build_object('mimetype', proof.file_mime_type, 'size', proof.file_size_bytes)
from public.proof_uploads proof
where proof.client_request_id = 'proof-m29-idempotent-0001';

set local role anon;

select lives_ok(
  $$select * from public.complete_driver_proof_upload(
      '9000000237',
      'PROOF37',
      (
        select proof_upload_id
        from public.request_driver_proof_upload(
          '9000000237',
          'PROOF37',
          '36200000-0000-4000-8000-000000000301',
          'area_covered',
          'Fake Pilot Area',
          'Fake proof retry note',
          'image/jpeg',
          1024,
          'proof-m29-idempotent-0001'
        )
      )
    )$$,
  'The first proof completion succeeds'
);

select lives_ok(
  $$select * from public.complete_driver_proof_upload(
      '9000000237',
      'PROOF37',
      (
        select proof_upload_id
        from public.request_driver_proof_upload(
          '9000000237',
          'PROOF37',
          '36200000-0000-4000-8000-000000000301',
          'area_covered',
          'Fake Pilot Area',
          'Fake proof retry note',
          'image/jpeg',
          1024,
          'proof-m29-idempotent-0001'
        )
      )
    )$$,
  'Retrying proof completion succeeds idempotently'
);

reset role;

select is(
  (
    select count(*)
    from public.customer_updates
    where ad_work_id = '36200000-0000-4000-8000-000000000101'
  ),
  1::bigint,
  'Proof completion retry creates exactly one Customer Update'
);

select is(
  (
    select upload_status
    from public.proof_uploads
    where client_request_id = 'proof-m29-idempotent-0001'
  ),
  'uploaded',
  'Proof remains uploaded after completion retry'
);

set local role anon;

select is(
  (
    select upload_status
    from public.request_driver_proof_upload(
      '9000000237',
      'PROOF37',
      '36200000-0000-4000-8000-000000000301',
      'area_covered',
      'Fake Pilot Area',
      'Fake proof retry note',
      'image/jpeg',
      1024,
      'proof-m29-idempotent-0001'
    )
  ),
  'uploaded',
  'A full submission retry observes the already-uploaded slot'
);

select throws_ok(
  $$select * from public.request_driver_proof_upload(
      '9000000237',
      'PROOF37',
      '36200000-0000-4000-8000-000000000301',
      'area_covered',
      'Fake Pilot Area',
      'Different fake proof details',
      'image/jpeg',
      1024,
      'proof-m29-idempotent-0001'
    )$$,
  '22000',
  'Proof request id was already used for different details',
  'An idempotency key cannot be reused for different proof details'
);

reset role;

select * from finish();

rollback;
