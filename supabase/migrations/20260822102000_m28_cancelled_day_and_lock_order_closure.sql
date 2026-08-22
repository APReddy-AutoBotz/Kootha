-- M28 cancellation authority closure: freeze cancelled-day execution state and
-- acquire the M21 authority lock before cancellation can touch authority rows.
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

  -- Physical telemetry takes this lock before session/authority row locks.
  -- Cancellation must use the same order so active telemetry and cancellation
  -- cannot form an advisory-lock/session-row inversion.
  if p_mutation_type = 'cancel' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('m21-authority-global', 2100)
    );
  end if;

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

create or replace function public.m28_guard_day_schedule_write_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_schedule_authorized boolean := coalesce(current_setting('app.m28_schedule_write', true), '') = 'yes';
  v_execution_changed boolean;
  v_parent_cancelled boolean := false;
begin
  v_execution_changed := row(
      new.execution_status,
      new.execution_started_at,
      new.break_started_at,
      new.last_resumed_at,
      new.execution_completed_at,
      new.completion_note,
      new.issue_note,
      new.execution_updated_at,
      new.driver_id,
      new.vehicle_id
    ) is distinct from row(
      old.execution_status,
      old.execution_started_at,
      old.break_started_at,
      old.last_resumed_at,
      old.execution_completed_at,
      old.completion_note,
      old.issue_note,
      old.execution_updated_at,
      old.driver_id,
      old.vehicle_id
    );

  if not v_schedule_authorized and v_execution_changed then
    select
      aw.planning_status = 'cancelled'
      or aw.status = 'cancelled'
      or aw.execution_overall_status = 'cancelled'
      or aw.closure_status = 'cancelled'
      or aw.cancelled_at is not null
      or aw.cancelled_by is not null
      or aw.cancellation_reason is not null
    into v_parent_cancelled
    from public.ad_works aw
    where aw.id = old.ad_work_id;

    if coalesce(v_parent_cancelled, false) then
      raise exception 'Cancelled Ad Work day execution state is immutable outside governed cancellation authority'
        using errcode = '42501';
    end if;
  end if;

  if not v_schedule_authorized
     and row(new.status, new.work_date, new.planned_start_time, new.planned_end_time,
             new.areas_to_cover, new.day_note, new.planning_status)
         is distinct from
         row(old.status, old.work_date, old.planned_start_time, old.planned_end_time,
             old.areas_to_cover, old.day_note, old.planning_status) then
    raise exception 'Work-day schedule fields must be changed through governed M28 authority' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.m28_guard_day_schedule_write_v1()
  from public, anon, authenticated, service_role;
