-- Structural pgTAP closure for M26 tied physical observation authority.
\connect postgres supabase_admin
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select has_index(
  'public',
  'physical_pilot_evidence_receipts',
  'physical_pilot_evidence_physical_window_authority_unique',
  'physical evidence has an exact observation-window authority index'
);

select ok(
  coalesce((
    select i.indisunique
    from pg_index i
    join pg_class idx on idx.oid=i.indexrelid
    join pg_namespace n on n.oid=idx.relnamespace
    where n.nspname='public'
      and idx.relname='physical_pilot_evidence_physical_window_authority_unique'
  ),false),
  'tied physical observation identity is unique'
);

select ok(
  coalesce((
    select pg_get_indexdef(i.indexrelid) ilike '%commissioning_id%commissioning_version%selected_candidate_id%certification_run_id%repository_authority_generation%manifest_id%gps_device_id%installation_receipt_id%vehicle_link_id%credential_id%network_validation_receipt_id%observation_started_at%observation_ended_at%where%classification%physical%'
    from pg_index i
    join pg_class idx on idx.oid=i.indexrelid
    join pg_namespace n on n.oid=idx.relnamespace
    where n.nspname='public'
      and idx.relname='physical_pilot_evidence_physical_window_authority_unique'
  ),false),
  'unique identity binds the full current authority and applies only to physical evidence'
);

select * from finish();
rollback;
