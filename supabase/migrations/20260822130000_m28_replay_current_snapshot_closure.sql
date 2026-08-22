-- M28 replay-current-state closure: preserve the original idempotent mutation
-- receipt while returning the current authoritative Ad Work snapshot on replay.
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
  v_current_snapshot jsonb;
begin
  if p_actor is null or p_ad_work_id is null
     or nullif(p_mutation_type, '') is null
     or nullif(p_request_key, '') is null
     or p_request_hash is null
     or p_request_hash !~ '^[0-9a-f]{32}$' then
    raise exception 'Invalid M28 mutation replay identity' using errcode = '22023';
  end if;

  -- Preserve the canonical M21/M28 authority order. A completed replay reads
  -- current state only after the same global transaction lock used by live
  -- commercial, schedule, assignment, release and Driver execution authority.
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

  if v_response is null then
    return null;
  end if;

  -- The persisted response is the immutable receipt for the original mutation.
  -- Do not rewrite it and do not rerun its effect. Only the response returned to
  -- the retrying client receives a freshly built snapshot, so an intervening
  -- mutation cannot be hidden by replaying an older successful operation.
  v_current_snapshot := public.m28_build_snapshot_v1(p_ad_work_id);
  if v_current_snapshot is null then
    raise exception 'Ad Work not found' using errcode = 'P0002';
  end if;

  return pg_catalog.jsonb_set(
    v_response,
    '{snapshot}'::text[],
    v_current_snapshot,
    true
  );
end;
$$;

revoke all on function public.m28_claim_replay_v1(uuid,uuid,text,text,text)
  from public, anon, authenticated, service_role;
