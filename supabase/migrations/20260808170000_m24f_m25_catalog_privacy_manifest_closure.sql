-- Final catalog/privacy/admin closure. Keep the catalog truthful about the
-- evidence the authoritative SQL worker can currently observe.

create or replace function public.m24f_is_luhn15_identifier_v1(p_value text)
returns boolean language plpgsql immutable parallel safe
set search_path=pg_catalog as $$
declare v text:=trim(coalesce(p_value,'')); v_sum integer:=0; v_digit integer; v_i integer;
begin
  if v !~ '^[0-9]{15}$' then return false; end if;
  for v_i in 1..15 loop
    v_digit:=substring(v from v_i for 1)::integer;
    if mod(v_i,2)=0 then v_digit:=v_digit*2; if v_digit>9 then v_digit:=v_digit-9; end if; end if;
    v_sum:=v_sum+v_digit;
  end loop;
  return mod(v_sum,10)=0;
end $$;

create or replace function public.m24f_is_credential_shaped_v1(p_value text)
returns boolean language sql immutable parallel safe
set search_path=pg_catalog as $$
  select case when p_value is null then false else
    -- A single opaque token is suspicious only when it is long, contains no
    -- prose separators, and has credential-like character diversity. Pure
    -- hexadecimal digests, UUIDs, and bounded declarative identifiers remain safe.
    trim(p_value) ~ '^[A-Za-z0-9_+/=-]{32,160}$'
    and trim(p_value) !~* '^[0-9a-f]{32,160}$'
    and trim(p_value) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and (
      (trim(p_value) ~ '[A-Z]' and trim(p_value) ~ '[a-z]' and trim(p_value) ~ '[0-9]')
      or (trim(p_value) ~ '[A-Za-z]' and trim(p_value) ~ '[0-9]' and trim(p_value) ~ '[_+/=]')
    )
  end
$$;

create or replace function public.m24f_is_safe_metadata(p_value text)
returns boolean language sql immutable parallel safe
set search_path=pg_catalog,public as $$
  select p_value is null or (
    char_length(p_value)<=500
    and p_value !~ ('[' || chr(1) || '-' || chr(8) || chr(11) || chr(12) || chr(14) || '-' || chr(31) || ']')
    and p_value !~ ('[' || chr(127) || '-' || chr(159) || ']')
    and not public.m24f_is_credential_shaped_v1(p_value)
    and p_value !~* '(^|[^a-z0-9])(password|passwd|pwd|credential|secret|bearer|token|api[_ -]?key|auth(entication|orization)?[_ -]?header|private[_ -]?key|client[_ -]?secret)([^a-z0-9]|$)'
    and p_value !~* '(https?|wss?|mqtt|tcp|udp)://|(^|[[:space:]])([0-9]{1,3}\.){3}[0-9]{1,3}(:[0-9]{1,5})?(/[^[:space:]]*)?'
    and p_value !~* '(^|[^a-z0-9@_-])([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(:[0-9]{1,5})?(/[^[:space:]]*)?([^a-z0-9._~:/?#\[\]@!$&''()*+,;=%-]|$)'
    and p_value !~* '(^|[^0-9])[+-]?[0-9]{1,2}\.[0-9]{4,}[,[:space:]]+[+-]?[0-9]{1,3}\.[0-9]{4,}([^0-9]|$)'
    and p_value !~* '<[!?/]?[a-z][^>]*>|[{}\[\]]|(^|[^a-z])(raw[_ -]?(payload|body)|payload[_ -]?(body|fragment|xml|json))([^a-z]|$)'
    and p_value !~* '(^|[^a-z0-9])(imei|imsi|iccid|serial[_ -]?number|physical[_ -]?device[_ -]?(evidence|photo|identifier))([^a-z0-9]|$)'
    and p_value !~* '(^|[^0-9a-f])([0-9a-f]{2}:){5}[0-9a-f]{2}([^0-9a-f]|$)'
    and not public.m24f_is_luhn15_identifier_v1(trim(p_value))
  )
$$;

alter table public.m25_feature_definitions
  add column if not exists availability_status text not null default 'unavailable',
  add column if not exists availability_reason text not null default 'Authoritative scoped extraction is not implemented.';
alter table public.m25_feature_definitions drop constraint if exists m25_feature_availability_check;
alter table public.m25_feature_definitions add constraint m25_feature_availability_check check (
  availability_status in ('implemented','unavailable')
  and ((active and availability_status='implemented') or (not active and availability_status='unavailable'))
  and char_length(availability_reason) between 1 and 240
) not valid;

update public.m25_feature_definitions set
  active=feature_id in ('event_count','accepted_live_rate','accepted_delayed_rate','health_only_rate','rejection_rate','identity_conflict_rate'),
  availability_status=case when feature_id in ('event_count','accepted_live_rate','accepted_delayed_rate','health_only_rate','rejection_rate','identity_conflict_rate') then 'implemented' else 'unavailable' end,
  availability_reason=case when feature_id in ('event_count','accepted_live_rate','accepted_delayed_rate','health_only_rate','rejection_rate','identity_conflict_rate')
    then 'Observed from exact-scoped authoritative telemetry receipt/conflict evidence.'
    else 'Inactive until deterministic exact-scoped source extraction is implemented; no covered zero is emitted.' end;
alter table public.m25_feature_definitions validate constraint m25_feature_availability_check;

alter table public.m25_statistical_signal_definitions add column if not exists active boolean not null default false;
update public.m25_statistical_signal_definitions s set active=f.active
from public.m25_feature_definitions f where f.feature_id=s.metric;

create or replace function public.admin_get_or_create_m24f_reference_manifest_v1()
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_id uuid;
begin
  perform public.m20a_require_admin();
  perform pg_advisory_xact_lock(hashtextextended('m24f-reference-manifest-v1',0));
  select id into v_id from public.m24f_adapter_capability_manifests
    where adapter_id='reference-vendor-webhook-v1' and adapter_version='1.0.0';
  if v_id is not null then return v_id; end if;
  return public.admin_create_m24f_capability_manifest_v1(
    'reference-vendor-webhook-v1','1.0.0','Synthetic reference vendor-cloud webhook',
    'vendor_webhook','hmac_signature',true,true,true,true,true,true,true,true,
    array['temperature']::text[],'Synthetic fixture only; no vendor residency claim.','Repository test owner only.'
  );
end $$;

revoke all on function public.m24f_is_luhn15_identifier_v1(text) from public,anon,authenticated;
revoke all on function public.m24f_is_credential_shaped_v1(text) from public,anon,authenticated;
grant execute on function public.m24f_is_luhn15_identifier_v1(text) to service_role;
grant execute on function public.m24f_is_credential_shaped_v1(text) to service_role;
revoke all on function public.admin_get_or_create_m24f_reference_manifest_v1() from public,anon,authenticated;
grant execute on function public.admin_get_or_create_m24f_reference_manifest_v1() to authenticated;
