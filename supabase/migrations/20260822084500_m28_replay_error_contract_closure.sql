-- M28 replay error-contract closure.
-- Exact retries replay the recorded response. A changed request that reuses a
-- consumed version keeps the established optimistic-concurrency error contract.
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
