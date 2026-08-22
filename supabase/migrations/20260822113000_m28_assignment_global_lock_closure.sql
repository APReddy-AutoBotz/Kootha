-- M28 final authority/concurrency closure: one M21 lock order for every mutation
-- and a database fence that prevents cancelled work from regaining assignment authority.
set search_path = public;

create or replace function public.m28_claim_replay_v1(
  p_actor uuid,
  p_ad_work_id uuid,
  p_mutation_type text,
  p_request_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_hash text;
  v_response jsonb;
begin
  if p_actor is null or p_ad_work_id is null
     or nullif(p_mutation_type, '') is null
     or nullif(p_request_key, '') is null
     or p_request_hash is null
     or p_request_hash !~ '^[0-9a-f]{32}$' then
    raise exception 'Invalid M28 mutation replay identity' using errcode = '22023';
  end if;

  -- M21 telemetry and retained assignment/release/execution transitions all use
  -- this global transaction lock before authority rows. Every M28 mutation must
  -- follow the same order before replay/work-row locks so no mutation family can
  -- invert the M21 advisory-lock/row-lock order.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('m21-authority-global', 2100)
  );

  if not exists (select 1 from public.ad_works where id = p_ad_work_id) then
    raise exception 'Ad Work not found' using errcode = 'P0002';
  end if;

  insert into public.m28_mutation_operations(
    actor_id, ad_work_id, mutation_type, request_key, request_hash
  ) values (
    p_actor, p_ad_work_id, p_mutation_type, p_request_key, p_request_hash
  )
  on conflict (actor_id, ad_work_id, mutation_type, request_key) do nothing;

  select request_hash, response
  into v_hash, v_response
  from public.m28_mutation_operations
  where actor_id = p_actor
    and ad_work_id = p_ad_work_id
    and mutation_type = p_mutation_type
    and request_key = p_request_key
  for update;

  if not found then
    raise exception 'M28 mutation replay identity could not be claimed' using errcode = '55000';
  end if;
  if v_hash is distinct from p_request_hash then
    if p_mutation_type = 'payment_update' then
      raise exception 'Commercial record changed; refresh and retry' using errcode = '40001';
    end if;
    raise exception 'Schedule changed; refresh and retry' using errcode = '40001';
  end if;

  return v_response;
end;
$$;

revoke all on function public.m28_claim_replay_v1(uuid,uuid,text,text,text)
  from public, anon, authenticated, service_role;

create or replace function public.m28_guard_cancelled_assignment_write_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_parent_cancelled boolean := false;
begin
  select
    aw.planning_status = 'cancelled'
    or aw.status = 'cancelled'
    or aw.assignment_status = 'cancelled'
    or aw.execution_overall_status = 'cancelled'
    or aw.closure_status = 'cancelled'
    or aw.cancelled_at is not null
    or aw.cancelled_by is not null
    or aw.cancellation_reason is not null
  into v_parent_cancelled
  from public.ad_works aw
  where aw.id = new.ad_work_id;

  -- Governed M28 cancellation demotes the assignment before it marks the parent
  -- cancelled, so that transaction remains valid. Once the parent cancellation
  -- is authoritative, all later assignment INSERT/UPDATE attempts are frozen;
  -- this prevents direct admin DML or retained RPCs from reviving executable
  -- assignment history under a cancelled parent.
  if coalesce(v_parent_cancelled, false) then
    raise exception 'Cancelled Ad Work assignments are immutable outside governed cancellation authority'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.m28_guard_cancelled_assignment_write_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists m28_guard_cancelled_assignment_write
  on public.ad_work_assignments;
create trigger m28_guard_cancelled_assignment_write
before insert or update on public.ad_work_assignments
for each row execute function public.m28_guard_cancelled_assignment_write_v1();
