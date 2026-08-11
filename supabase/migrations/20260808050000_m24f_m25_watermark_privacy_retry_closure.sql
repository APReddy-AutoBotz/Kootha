-- Final M24F/M25 watermark, privacy, and per-generation retry closure.

create or replace function public.m24f_is_safe_metadata(p_value text)
returns boolean language sql immutable parallel safe
set search_path=pg_catalog,public as $$
  select p_value is null or (
    char_length(p_value)<=500
    -- PostgreSQL text cannot contain NUL. Reject the remaining C0 controls,
    -- DEL, and the C1 control range using managed-PostgreSQL-safe chr().
    and p_value !~ ('[' || chr(1) || '-' || chr(8) || chr(11) || chr(12) || chr(14) || '-' || chr(31) || ']')
    and p_value !~ ('[' || chr(127) || '-' || chr(159) || ']')
    and p_value !~* '(^|[^a-z0-9])(password|passwd|pwd|credential|secret|bearer|token|api[_ -]?key|auth(entication|orization)?[_ -]?header|private[_ -]?key|client[_ -]?secret)([^a-z0-9]|$)'
    and p_value !~* '(https?|wss?|mqtt|tcp|udp)://|(^|[[:space:]])([0-9]{1,3}\.){3}[0-9]{1,3}(:[0-9]{1,5})?(/[^[:space:]]*)?'
    -- A DNS hostname is endpoint material even without a scheme, port, or path.
    -- Identifier boundaries avoid matching dotted substrings inside normal words.
    and p_value !~* '(^|[^a-z0-9@_-])([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(:[0-9]{1,5})?(/[^[:space:]]*)?([^a-z0-9._~:/?#\[\]@!$&''()*+,;=%-]|$)'
    and p_value !~* '(^|[^0-9])[+-]?[0-9]{1,2}\.[0-9]{4,}[,[:space:]]+[+-]?[0-9]{1,3}\.[0-9]{4,}([^0-9]|$)'
    and p_value !~* '<[!?/]?[a-z][^>]*>|[{}\[\]]|(^|[^a-z])(raw[_ -]?(payload|body)|payload[_ -]?(body|fragment|xml|json))([^a-z]|$)'
    and p_value !~* '(^|[^a-z0-9])(imei|imsi|iccid|serial[_ -]?number|physical[_ -]?device[_ -]?(evidence|photo|identifier))([^a-z0-9]|$)'
  )
$$;

create or replace function public.m25_enqueue_feature_scope_v1(
  p_scope text,p_scope_key_hash text,p_period_start timestamptz,p_period_end timestamptz,
  p_gps_device_id uuid default null,p_ad_work_day_id uuid default null,
  p_adapter_version text default null,p_device_model text default null,p_synthetic boolean default false
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_id uuid; v_watermark text; v_receipt_evidence text; v_conflict_evidence text;
begin
 if p_scope_key_hash !~ '^[0-9a-f]{64}$' or p_period_end<=p_period_start
   or not public.m24f_is_safe_metadata(p_adapter_version) or not public.m24f_is_safe_metadata(p_device_model)
   or (p_scope='device_work_day' and (p_gps_device_id is null or p_ad_work_day_id is null or p_adapter_version is not null or p_device_model is not null))
   or (p_scope='device_day' and (p_gps_device_id is null or p_ad_work_day_id is not null or p_adapter_version is not null or p_device_model is not null))
   or (p_scope='device_model_day' and (p_device_model is null or p_gps_device_id is not null or p_ad_work_day_id is not null or p_adapter_version is not null))
   or (p_scope='adapter_version_day' and (p_adapter_version is null or p_gps_device_id is not null or p_ad_work_day_id is not null or p_device_model is not null))
   or (p_scope='fleet_day' and (p_gps_device_id is not null or p_ad_work_day_id is not null or p_adapter_version is not null or p_device_model is not null)) then
   raise exception 'Invalid bounded M25 feature scope dimensions' using errcode='22023';
 end if;

 select concat_ws('|',count(*)::text,coalesce(max(r.id::text),''),coalesce(max(r.captured_at)::text,''),
   coalesce(max(r.created_at)::text,''),coalesce(public.m22_safe_digest(string_agg(concat_ws(':',r.id::text,r.content_hash,r.disposition),',' order by r.id)),repeat('0',64)))
 into v_receipt_evidence
 from public.telemetry_receipts r join public.gps_devices d on d.id=r.gps_device_id
 where r.captured_at>=p_period_start and r.captured_at<p_period_end and r.synthetic=p_synthetic
   and (p_gps_device_id is null or r.gps_device_id=p_gps_device_id)
   and (p_ad_work_day_id is null or r.ad_work_day_id=p_ad_work_day_id)
   and (p_adapter_version is null or r.adapter_version=p_adapter_version)
   and (p_device_model is null or d.model=p_device_model);

 select concat_ws('|',count(*)::text,coalesce(max(c.last_seen_at)::text,''),coalesce(max(c.created_at)::text,''),
   coalesce(public.m22_safe_digest(string_agg(concat_ws(':',c.id::text,c.incoming_content_hash,c.reason_code,c.attempt_count::text,c.last_seen_at::text),',' order by c.id)),repeat('0',64)))
 into v_conflict_evidence
 from public.telemetry_identity_conflicts c
 join public.telemetry_receipts r on r.id=c.original_receipt_id
 join public.gps_devices d on d.id=r.gps_device_id
 where c.first_seen_at>=p_period_start and c.first_seen_at<p_period_end and r.synthetic=p_synthetic
   and (p_gps_device_id is null or r.gps_device_id=p_gps_device_id)
   and (p_ad_work_day_id is null or r.ad_work_day_id=p_ad_work_day_id)
   and (p_adapter_version is null or r.adapter_version=p_adapter_version)
   and (p_device_model is null or d.model=p_device_model);

 v_watermark:=public.m22_safe_digest(concat_ws('|','m25-input-v2',v_receipt_evidence,v_conflict_evidence));
 insert into public.m25_feature_extraction_jobs(scope,scope_key_hash,gps_device_id,ad_work_day_id,period_start,period_end,adapter_version,device_model,synthetic,input_watermark)
 values(p_scope,p_scope_key_hash,p_gps_device_id,p_ad_work_day_id,p_period_start,p_period_end,p_adapter_version,p_device_model,p_synthetic,v_watermark)
 on conflict(scope,scope_key_hash,period_start,period_end,synthetic) do update set
   generation=case when public.m25_feature_extraction_jobs.input_watermark=excluded.input_watermark then public.m25_feature_extraction_jobs.generation else public.m25_feature_extraction_jobs.generation+1 end,
   input_watermark=excluded.input_watermark,
   state=case when public.m25_feature_extraction_jobs.input_watermark=excluded.input_watermark then public.m25_feature_extraction_jobs.state when public.m25_feature_extraction_jobs.state='processing' then 'processing' else 'pending' end,
   dirty_after_claim=case when public.m25_feature_extraction_jobs.input_watermark<>excluded.input_watermark and public.m25_feature_extraction_jobs.state='processing' then true else public.m25_feature_extraction_jobs.dirty_after_claim end,
   attempt_count=case when public.m25_feature_extraction_jobs.input_watermark<>excluded.input_watermark and public.m25_feature_extraction_jobs.state<>'processing' then 0 else public.m25_feature_extraction_jobs.attempt_count end,
   safe_failure_reason_code=case when public.m25_feature_extraction_jobs.input_watermark<>excluded.input_watermark and public.m25_feature_extraction_jobs.state<>'processing' then null else public.m25_feature_extraction_jobs.safe_failure_reason_code end,
   completed_at=case when public.m25_feature_extraction_jobs.input_watermark<>excluded.input_watermark and public.m25_feature_extraction_jobs.state<>'processing' then null else public.m25_feature_extraction_jobs.completed_at end,
   locked_at=case when public.m25_feature_extraction_jobs.input_watermark<>excluded.input_watermark and public.m25_feature_extraction_jobs.state<>'processing' then null else public.m25_feature_extraction_jobs.locked_at end,
   claimed_generation=case when public.m25_feature_extraction_jobs.input_watermark<>excluded.input_watermark and public.m25_feature_extraction_jobs.state<>'processing' then null else public.m25_feature_extraction_jobs.claimed_generation end,
   next_attempt_at=case when public.m25_feature_extraction_jobs.input_watermark=excluded.input_watermark then public.m25_feature_extraction_jobs.next_attempt_at else clock_timestamp() end,
   updated_at=case when public.m25_feature_extraction_jobs.input_watermark=excluded.input_watermark then public.m25_feature_extraction_jobs.updated_at else clock_timestamp() end
 returning id into v_id;
 return v_id;
end $$;

revoke all on function public.m25_enqueue_feature_scope_v1(text,text,timestamptz,timestamptz,uuid,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.m25_enqueue_feature_scope_v1(text,text,timestamptz,timestamptz,uuid,uuid,text,text,boolean) to service_role;
