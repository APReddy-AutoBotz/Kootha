begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select ok(
  to_regprocedure('public.close_flexible_ad_work_with_final_summary(uuid,text,text,text,text,boolean,boolean,boolean,text,boolean)') is not null,
  'final-summary closure RPC remains installed'
);

with definition as (
  select lower(pg_get_functiondef(
    'public.close_flexible_ad_work_with_final_summary(uuid,text,text,text,text,boolean,boolean,boolean,text,boolean)'::regprocedure
  )) as source
)
select ok(
  strpos(source, 'pg_advisory_xact_lock') > 0
  and strpos(source, 'pg_advisory_xact_lock') < strpos(source, 'for update'),
  'final-summary closure acquires M21 advisory authority before its first row lock'
)
from definition;

with definition as (
  select lower(pg_get_functiondef(
    'public.close_flexible_ad_work_with_final_summary(uuid,text,text,text,text,boolean,boolean,boolean,text,boolean)'::regprocedure
  )) as source
)
select ok(
  strpos(source, 'prepare_flexible_final_proof_summary') > 0
  and strpos(source, 'update public.final_proof_summaries') > 0
  and strpos(source, 'ad work closed.') > 0,
  'retained final-summary preparation, summary update and success result stay in the closure RPC'
)
from definition;

select ok(
  has_function_privilege(
    'authenticated',
    'public.close_flexible_ad_work_with_final_summary(uuid,text,text,text,text,boolean,boolean,boolean,text,boolean)',
    'EXECUTE'
  ),
  'authenticated role retains governed final-closure RPC execute authority'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.close_flexible_ad_work_with_final_summary(uuid,text,text,text,text,boolean,boolean,boolean,text,boolean)',
    'EXECUTE'
  ),
  'anonymous role has no final-closure RPC execute authority'
);

select * from finish();
rollback;
