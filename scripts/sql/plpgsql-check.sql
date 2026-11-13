-- Static check of every PL/pgSQL function in the public schema.
--
-- PL/pgSQL only parses a statement the first time it runs, so a function can
-- be created successfully and still fail on its first real call, for example
-- with 42702 "column reference is ambiguous" when a RETURNS TABLE column has
-- the same name as a table column. plpgsql_check finds those without running
-- the function.
create extension if not exists plpgsql_check with schema extensions;

with routine as (
  select p.oid, p.oid::regprocedure::text as signature, null::oid as relid
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  join pg_catalog.pg_language l on l.oid = p.prolang
  where n.nspname = 'public'
    and l.lanname = 'plpgsql'
    and p.prorettype <> 'pg_catalog.trigger'::regtype
  union all
  select distinct p.oid, p.oid::regprocedure::text || ' on ' || t.tgrelid::regclass::text, t.tgrelid
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  join pg_catalog.pg_language l on l.oid = p.prolang
  join pg_catalog.pg_trigger t on t.tgfoid = p.oid and not t.tgisinternal
  where n.nspname = 'public'
    and l.lanname = 'plpgsql'
    and p.prorettype = 'pg_catalog.trigger'::regtype
)
select routine.signature, finding.sqlstate, finding.lineno, finding.message
from routine
cross join lateral extensions.plpgsql_check_function_tb(
  routine.oid,
  coalesce(routine.relid, 0::oid),
  fatal_errors => false,
  other_warnings => false,
  performance_warnings => false,
  extra_warnings => false
) as finding
where finding.level = 'error'
  -- Two trigger functions serve several tables and read a NEW/OLD field only
  -- inside a branch guarded by tg_table_name, so the field is never read on a
  -- table that lacks it. A static check cannot see that guard.
  and not (
    finding.sqlstate = '42703'
    and (
      routine.signature like 'm23\_enqueue\_authority\_change() on %'
      or routine.signature = 'm25_protect_immutable() on m25_feature_values'
    )
  )
order by routine.signature, finding.lineno;
