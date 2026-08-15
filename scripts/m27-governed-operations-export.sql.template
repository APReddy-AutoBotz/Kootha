-- M27: governed operations export and audit workbench.
-- Software-only authority. No coordinates, proof payloads, device secrets, real hardware selection, or public deployment.

set search_path = public;

create table if not exists public.operations_export_receipts (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.user_profiles(auth_user_id) on delete restrict,
  scope text not null,
  format text not null,
  filter_summary jsonb not null default '{}'::jsonb,
  row_limit integer not null,
  row_count integer not null,
  contains_pii boolean not null,
  truncated boolean not null default false,
  status text not null default 'completed',
  created_at timestamptz not null default clock_timestamp(),
  contract_version text not null default 'm27.operations-export.v1',
  constraint operations_export_receipts_scope_check
    check (scope in ('enquiries','ad_works','drivers','vehicles','devices','audit')),
  constraint operations_export_receipts_format_check
    check (format in ('csv','json')),
  constraint operations_export_receipts_row_limit_check
    check (row_limit between 1 and 500),
  constraint operations_export_receipts_row_count_check
    check (row_count between 0 and row_limit),
  constraint operations_export_receipts_status_check
    check (status = 'completed'),
  constraint operations_export_receipts_contract_check
    check (contract_version = 'm27.operations-export.v1')
);

create index if not exists operations_export_receipts_actor_created_idx
  on public.operations_export_receipts (actor_id, created_at desc, id desc);
create index if not exists operations_export_receipts_scope_created_idx
  on public.operations_export_receipts (scope, created_at desc, id desc);

alter table public.operations_export_receipts enable row level security;

create or replace function public.m27_protect_export_receipts()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Operations export receipts are immutable' using errcode = '55000';
end;
$$;

drop trigger if exists operations_export_receipts_no_update on public.operations_export_receipts;
create trigger operations_export_receipts_no_update
before update on public.operations_export_receipts
for each row execute function public.m27_protect_export_receipts();

drop trigger if exists operations_export_receipts_no_delete on public.operations_export_receipts;
create trigger operations_export_receipts_no_delete
before delete on public.operations_export_receipts
for each row execute function public.m27_protect_export_receipts();

revoke all on public.operations_export_receipts from public, anon, authenticated, service_role;

create or replace function public.admin_export_operations_v1(
  p_scope text,
  p_format text default 'csv',
  p_search text default null,
  p_status text default null,
  p_city text default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_limit integer default 200
)
returns jsonb
language plpgsql
security definer
volatile
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := public.m20a_require_admin();
  v_scope text := lower(trim(coalesce(p_scope, '')));
  v_format text := lower(trim(coalesce(p_format, '')));
  v_search text := public.m20a_validate_safe_text(p_search, 'Export search', 120, false);
  v_status text := public.m20a_validate_safe_text(p_status, 'Export status', 80, false);
  v_city text := public.m20a_validate_safe_text(p_city, 'Export city', 120, false);
  v_limit integer := p_limit;
  v_rows jsonb := '[]'::jsonb;
  v_columns jsonb := '[]'::jsonb;
  v_receipt_id uuid := gen_random_uuid();
  v_count integer := 0;
  v_truncated boolean := false;
  v_contains_pii boolean := false;
  v_filter_summary jsonb;
begin
  if v_scope not in ('enquiries','ad_works','drivers','vehicles','devices','audit') then
    raise exception 'Unsupported operations export scope' using errcode = '22023';
  end if;
  if v_format not in ('csv','json') then
    raise exception 'Unsupported operations export format' using errcode = '22023';
  end if;
  if v_limit is null or v_limit < 1 or v_limit > 500 then
    raise exception 'Export row limit must be between 1 and 500' using errcode = '22023';
  end if;
  if p_date_from is not null and p_date_to is not null and p_date_from > p_date_to then
    raise exception 'Export date range is invalid' using errcode = '22023';
  end if;
  if v_scope in ('devices','audit') and v_city is not null then
    raise exception 'City filter is not supported for this export scope' using errcode = '22023';
  end if;
  if v_scope = 'audit' and v_status is not null then
    raise exception 'Status filter is not supported for activity export' using errcode = '22023';
  end if;

  if v_scope = 'enquiries' and v_status is not null and v_status not in
    ('new','contacted','converted','rejected','quoted','follow_up_needed','not_interested','invalid_spam') then
    raise exception 'Unsupported enquiry status filter' using errcode = '22023';
  elsif v_scope = 'ad_works' and v_status is not null and v_status not in
    ('draft','planned','ready_for_driver_assignment','on_hold','cancelled') then
    raise exception 'Unsupported ad work status filter' using errcode = '22023';
  elsif v_scope in ('drivers','vehicles') and v_status is not null and v_status not in
    ('pending_review','approved','inactive','blocked') then
    raise exception 'Unsupported onboarding status filter' using errcode = '22023';
  elsif v_scope = 'devices' and v_status is not null and v_status not in
    ('pending_setup','active','offline','not_working','suspended','removed','retired') then
    raise exception 'Unsupported device status filter' using errcode = '22023';
  end if;

  v_filter_summary := jsonb_strip_nulls(jsonb_build_object(
    'searchApplied', v_search is not null,
    'status', v_status,
    'cityApplied', v_city is not null,
    'dateFrom', p_date_from,
    'dateTo', p_date_to,
    'rowLimit', v_limit
  ));

  if v_scope = 'enquiries' then
    v_contains_pii := true;
    v_columns := '["id","customer_name","business_name","phone","city","required_areas","preferred_start_date","number_of_days","source","status","package_interest","live_tracking_needed","follow_up_date","created_at","updated_at"]'::jsonb;
    select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc, q.id desc), '[]'::jsonb)
    into v_rows
    from (
      select
        e.id, e.customer_name, e.business_name, e.phone, e.city, e.required_areas,
        e.preferred_start_date, e.number_of_days, e.source::text as source, e.status::text as status,
        e.package_interest, e.live_tracking_needed, e.follow_up_date, e.created_at, e.updated_at
      from public.enquiries e
      where (v_search is null or e.customer_name ilike '%' || v_search || '%' or coalesce(e.business_name,'') ilike '%' || v_search || '%' or e.phone ilike '%' || v_search || '%')
        and (v_status is null or e.status::text = v_status)
        and (v_city is null or lower(trim(coalesce(e.city,''))) = lower(trim(v_city)))
        and (p_date_from is null or e.created_at >= p_date_from)
        and (p_date_to is null or e.created_at <= p_date_to)
      order by e.created_at desc, e.id desc
      limit v_limit + 1
    ) q;

  elsif v_scope = 'ad_works' then
    v_contains_pii := true;
    v_columns := '["id","title","customer_name","business_name","customer_phone","city","start_date","end_date","planning_status","assignment_status","execution_overall_status","closure_status","package_interest","number_of_days","created_at","updated_at"]'::jsonb;
    select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc, q.id desc), '[]'::jsonb)
    into v_rows
    from (
      select
        w.id, w.title, w.customer_name, w.business_name, w.customer_phone, w.city,
        w.start_date, w.end_date, w.planning_status, w.assignment_status, w.execution_overall_status,
        w.closure_status, w.package_interest, w.number_of_days, w.created_at, w.updated_at
      from public.ad_works w
      where (v_search is null or w.customer_name ilike '%' || v_search || '%' or coalesce(w.business_name,'') ilike '%' || v_search || '%' or coalesce(w.customer_phone,'') ilike '%' || v_search || '%' or w.title ilike '%' || v_search || '%')
        and (v_status is null or w.planning_status = v_status)
        and (v_city is null or lower(trim(coalesce(w.city,''))) = lower(trim(v_city)))
        and (p_date_from is null or w.created_at >= p_date_from)
        and (p_date_to is null or w.created_at <= p_date_to)
      order by w.created_at desc, w.id desc
      limit v_limit + 1
    ) q;

  elsif v_scope = 'drivers' then
    v_contains_pii := true;
    v_columns := '["id","name","phone","city","service_areas","onboarding_status","availability_status_text","created_at","updated_at"]'::jsonb;
    select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc, q.id desc), '[]'::jsonb)
    into v_rows
    from (
      select
        d.id, d.name, d.phone, d.city, d.service_areas, d.onboarding_status,
        d.availability_status_text, d.created_at, d.updated_at
      from public.drivers d
      where (v_search is null or d.name ilike '%' || v_search || '%' or d.phone ilike '%' || v_search || '%' or coalesce(d.city,'') ilike '%' || v_search || '%')
        and (v_status is null or d.onboarding_status = v_status)
        and (v_city is null or lower(trim(coalesce(d.city,''))) = lower(trim(v_city)))
        and (p_date_from is null or d.created_at >= p_date_from)
        and (p_date_to is null or d.created_at <= p_date_to)
      order by d.created_at desc, d.id desc
      limit v_limit + 1
    ) q;

  elsif v_scope = 'vehicles' then
    v_columns := '["id","vehicle_number","vehicle_type","city","onboarding_status","mic_system_available","gps_device_available","gps_device_status","active","created_at","updated_at"]'::jsonb;
    select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc, q.id desc), '[]'::jsonb)
    into v_rows
    from (
      select
        v.id, v.vehicle_number, v.vehicle_type, v.city, v.onboarding_status,
        v.mic_system_available, v.gps_device_available, v.gps_device_status, v.active,
        v.created_at, v.updated_at
      from public.vehicles v
      where (v_search is null or v.vehicle_number ilike '%' || v_search || '%' or coalesce(v.city,'') ilike '%' || v_search || '%')
        and (v_status is null or v.onboarding_status = v_status)
        and (v_city is null or lower(trim(coalesce(v.city,''))) = lower(trim(v_city)))
        and (p_date_from is null or v.created_at >= p_date_from)
        and (p_date_to is null or v.created_at <= p_date_to)
      order by v.created_at desc, v.id desc
      limit v_limit + 1
    ) q;

  elsif v_scope = 'devices' then
    v_columns := '["id","device_code","status","vendor","model","adapter_type","protocol_type","serial_number","imei","vendor_device_identifier","installation_state","gps_readiness","gsm_readiness","external_power_status","battery_status","last_heartbeat_at","last_telemetry_at","created_at","updated_at"]'::jsonb;
    select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc, q.id desc), '[]'::jsonb)
    into v_rows
    from (
      select
        d.id,
        d.device_code,
        d.status::text as status,
        d.vendor,
        d.model,
        d.adapter_type,
        d.protocol_type,
        case when d.serial_number is null then null when char_length(d.serial_number) <= 4 then '****' else '****' || right(d.serial_number, 4) end as serial_number,
        case when d.imei is null then null when char_length(d.imei) <= 4 then '****' else '****' || right(d.imei, 4) end as imei,
        case when d.vendor_device_identifier is null then null when char_length(d.vendor_device_identifier) <= 4 then '****' else '****' || right(d.vendor_device_identifier, 4) end as vendor_device_identifier,
        d.installation_state,
        d.gps_readiness,
        d.gsm_readiness,
        d.external_power_status,
        d.battery_status,
        d.last_heartbeat_at,
        d.last_telemetry_at,
        d.created_at,
        d.updated_at
      from public.gps_devices d
      where (v_search is null
        or d.device_code ilike '%' || v_search || '%'
        or coalesce(d.vendor,'') ilike '%' || v_search || '%'
        or coalesce(d.model,'') ilike '%' || v_search || '%'
        or coalesce(d.serial_number,'') ilike '%' || v_search || '%'
        or coalesce(d.imei,'') ilike '%' || v_search || '%'
        or coalesce(d.vendor_device_identifier,'') ilike '%' || v_search || '%')
        and (v_status is null or d.status::text = v_status)
        and (p_date_from is null or d.created_at >= p_date_from)
        and (p_date_to is null or d.created_at <= p_date_to)
      order by d.created_at desc, d.id desc
      limit v_limit + 1
    ) q;

  else
    v_columns := '["id","actor_type","action","entity_type","entity_id","created_at","safe_details"]'::jsonb;
    select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc, q.id desc), '[]'::jsonb)
    into v_rows
    from (
      select
        a.id, a.actor_type::text as actor_type, a.action, a.entity_type, a.entity_id, a.created_at, a.safe_details
      from public.audit_logs a
      where (v_search is null or a.action ilike '%' || v_search || '%' or a.entity_type ilike '%' || v_search || '%' or coalesce(a.entity_id::text,'') ilike '%' || v_search || '%')
        and (p_date_from is null or a.created_at >= p_date_from)
        and (p_date_to is null or a.created_at <= p_date_to)
      order by a.created_at desc, a.id desc
      limit v_limit + 1
    ) q;
  end if;

  v_count := jsonb_array_length(v_rows);
  if v_count > v_limit then
    v_rows := v_rows - v_limit;
    v_count := v_limit;
    v_truncated := true;
  end if;

  insert into public.operations_export_receipts (
    id, actor_id, scope, format, filter_summary, row_limit, row_count,
    contains_pii, truncated, status, contract_version
  )
  values (
    v_receipt_id, v_actor_id, v_scope, v_format, v_filter_summary, v_limit, v_count,
    v_contains_pii, v_truncated, 'completed', 'm27.operations-export.v1'
  );

  insert into public.audit_logs (actor_type, actor_id, action, entity_type, entity_id, safe_details)
  values (
    'admin', v_actor_id, 'operations_export_generated', 'operations_export', v_receipt_id,
    jsonb_build_object(
      'scope', v_scope,
      'format', v_format,
      'row_count', v_count,
      'contains_pii', v_contains_pii,
      'truncated', v_truncated
    )
  );

  return jsonb_build_object(
    'contractVersion', 'm27.operations-export.v1',
    'receiptId', v_receipt_id,
    'scope', v_scope,
    'format', v_format,
    'rowCount', v_count,
    'truncated', v_truncated,
    'containsPii', v_contains_pii,
    'generatedAt', clock_timestamp(),
    'columns', v_columns,
    'filters', v_filter_summary,
    'rows', v_rows
  );
end;
$$;

revoke all on function public.admin_export_operations_v1(text,text,text,text,text,timestamptz,timestamptz,integer)
  from public, anon, service_role;
grant execute on function public.admin_export_operations_v1(text,text,text,text,text,timestamptz,timestamptz,integer)
  to authenticated;

create or replace function public.admin_list_operations_export_receipts_v1(
  p_limit integer default 50,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null
)
returns table (
  id uuid,
  actor_id uuid,
  scope text,
  format text,
  filter_summary jsonb,
  row_limit integer,
  row_count integer,
  contains_pii boolean,
  truncated boolean,
  status text,
  created_at timestamptz,
  contract_version text
)
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := public.m20a_require_admin();
  v_limit integer := p_limit;
begin
  if v_limit is null or v_limit < 1 or v_limit > 100 then
    raise exception 'Export receipt page limit must be between 1 and 100' using errcode = '22023';
  end if;
  if (p_cursor_created_at is null) is distinct from (p_cursor_id is null) then
    raise exception 'Export receipt cursor is incomplete' using errcode = '22023';
  end if;

  return query
  select
    r.id, r.actor_id, r.scope, r.format, r.filter_summary, r.row_limit, r.row_count,
    r.contains_pii, r.truncated, r.status, r.created_at, r.contract_version
  from public.operations_export_receipts r
  where (p_cursor_created_at is null or (r.created_at, r.id) < (p_cursor_created_at, p_cursor_id))
  order by r.created_at desc, r.id desc
  limit v_limit;
end;
$$;

revoke all on function public.admin_list_operations_export_receipts_v1(integer,timestamptz,uuid)
  from public, anon, service_role;
grant execute on function public.admin_list_operations_export_receipts_v1(integer,timestamptz,uuid)
  to authenticated;

create or replace function public.admin_get_operations_audit_v1(
  p_actor_type text default null,
  p_action text default null,
  p_entity_type text default null,
  p_search text default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_limit integer default 50,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null
)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := public.m20a_require_admin();
  v_actor_type text := public.m20a_validate_safe_text(p_actor_type, 'Audit actor type', 32, false);
  v_action text := public.m20a_validate_safe_text(p_action, 'Audit action', 120, false);
  v_entity_type text := public.m20a_validate_safe_text(p_entity_type, 'Audit entity type', 120, false);
  v_search text := public.m20a_validate_safe_text(p_search, 'Audit search', 120, false);
  v_limit integer := p_limit;
  v_rows jsonb := '[]'::jsonb;
  v_next jsonb := null;
  v_count integer := 0;
begin
  if v_actor_type is not null and v_actor_type not in ('admin','driver','system') then
    raise exception 'Unsupported audit actor type' using errcode = '22023';
  end if;
  if v_limit is null or v_limit < 1 or v_limit > 100 then
    raise exception 'Audit page limit must be between 1 and 100' using errcode = '22023';
  end if;
  if p_date_from is not null and p_date_to is not null and p_date_from > p_date_to then
    raise exception 'Audit date range is invalid' using errcode = '22023';
  end if;
  if (p_cursor_created_at is null) is distinct from (p_cursor_id is null) then
    raise exception 'Audit cursor is incomplete' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc, q.id desc), '[]'::jsonb)
  into v_rows
  from (
    select a.id, a.actor_type::text as actor_type, a.action, a.entity_type, a.entity_id, a.created_at, a.safe_details
    from public.audit_logs a
    where (v_actor_type is null or a.actor_type::text = v_actor_type)
      and (v_action is null or a.action = v_action)
      and (v_entity_type is null or a.entity_type = v_entity_type)
      and (v_search is null or a.action ilike '%' || v_search || '%' or a.entity_type ilike '%' || v_search || '%' or coalesce(a.entity_id::text,'') ilike '%' || v_search || '%')
      and (p_date_from is null or a.created_at >= p_date_from)
      and (p_date_to is null or a.created_at <= p_date_to)
      and (p_cursor_created_at is null or (a.created_at, a.id) < (p_cursor_created_at, p_cursor_id))
    order by a.created_at desc, a.id desc
    limit v_limit + 1
  ) q;

  v_count := jsonb_array_length(v_rows);
  if v_count > v_limit then
    v_rows := v_rows - v_limit;
    select jsonb_build_object('createdAt', item->>'created_at', 'id', item->>'id')
    into v_next
    from jsonb_array_elements(v_rows) with ordinality as page(item, ord)
    order by ord desc
    limit 1;
  end if;

  return jsonb_build_object('records', v_rows, 'nextCursor', v_next);
end;
$$;

revoke all on function public.admin_get_operations_audit_v1(text,text,text,text,timestamptz,timestamptz,integer,timestamptz,uuid)
  from public, anon, service_role;
grant execute on function public.admin_get_operations_audit_v1(text,text,text,text,timestamptz,timestamptz,integer,timestamptz,uuid)
  to authenticated;

comment on table public.operations_export_receipts is
  'M27 immutable metadata receipts for admin-governed exports. Exported row payloads are never persisted here.';
