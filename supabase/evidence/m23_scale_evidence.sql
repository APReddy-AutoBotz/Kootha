begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

-- Synthetic-only scale shape: 25 independent authority scopes, 10 hours,
-- 15-second capture cadence, 60,000 phone and 60,000 physical points.
insert into public.drivers(id,name,phone,approval_status,onboarding_status)
select format('26000000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('M23 Scale Driver %s',n),format('900000%04s',n),'approved','approved'
from generate_series(1,25) n;
insert into public.vehicles(id,vehicle_number,vehicle_type,onboarding_status,active)
select format('26100000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('M23-SCALE-%s',n),'van','approved',true
from generate_series(1,25) n;
insert into public.user_profiles(auth_user_id,display_name,role)
values('26000000-0000-0000-0000-000000000001','M23 Scale Service Admin','admin');
insert into public.gps_devices(id,device_code,vendor,model,adapter_type,protocol_type,status,installation_state,gps_readiness,gsm_readiness)
select format('26200000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('M23-SCALE-DEVICE-%s',n),'Synthetic','M23','generic_http','https','active','installed','ready','ready'
from generate_series(1,25) n;
insert into public.gps_device_credential_metadata(id,gps_device_id,credential_key_id,status,verification_material_hash,issued_at,expires_at,created_by_admin)
select format('26300000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26200000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('m23-scale-key-%s',n),'active',repeat('b',64),'2026-07-31 07:00+00','2026-08-02 07:00+00','26000000-0000-0000-0000-000000000001'
from generate_series(1,25) n;
insert into public.ad_works(id,title,tracking_type,mobile_location_proof_required)
select format('26400000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('M23 Scale Work %s',n),'both',true
from generate_series(1,25) n;
insert into public.ad_work_assignments(id,ad_work_id,driver_id,vehicle_id,status)
select format('26500000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26400000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26000000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26100000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,'ready_for_execution'
from generate_series(1,25) n;
insert into public.ad_work_days(id,ad_work_id,work_date,driver_id,vehicle_id,execution_status,execution_started_at)
select format('26600000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26400000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,'2026-07-31',format('26000000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26100000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,'running','2026-07-31 08:00+00'
from generate_series(1,25) n;
insert into public.m21_assignment_history(id,assignment_id,ad_work_id,driver_id,vehicle_id,assignment_status,effective_from,effective_until,history_origin)
select format('26700000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26500000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26400000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26000000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26100000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,'assigned','2026-07-31 08:00+00','2026-07-31 18:00+00','observed'
from generate_series(1,25) n;
insert into public.m21_release_history(id,ad_work_id,release_status,effective_from,effective_until,history_origin)
select format('26800000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26400000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,'released_to_driver','2026-07-31 08:00+00','2026-07-31 18:00+00','observed'
from generate_series(1,25) n;
insert into public.m21_execution_history(id,ad_work_day_id,execution_status,effective_from,effective_until,history_origin)
select format('26900000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26600000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,'running','2026-07-31 08:00+00','2026-07-31 18:00+00','observed'
from generate_series(1,25) n;
insert into public.gps_device_vehicle_links(id,gps_device_id,vehicle_id,is_primary,effective_from,effective_until,change_reason,created_by_admin,closed_by_admin,closed_at)
select format('27000000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26200000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26100000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,true,'2026-07-31 08:00+00','2026-07-31 18:00+00','M23 synthetic scale','26000000-0000-0000-0000-000000000001','26000000-0000-0000-0000-000000000001','2026-07-31 18:00+00'
from generate_series(1,25) n;
insert into public.tracking_sessions(id,ad_work_day_id,ad_work_id,source_type,status,started_at,tracking_mode,driver_id,vehicle_id,synthetic)
select format('27400000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26600000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26400000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,'mobile','running','2026-07-31 08:00+00','phone_location',format('26000000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26100000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,true
from generate_series(1,25) n;
insert into public.tracking_sessions(id,ad_work_day_id,ad_work_id,assignment_id,source_type,status,started_at,tracking_mode,driver_id,vehicle_id,gps_device_id,gps_device_vehicle_link_id,assignment_history_id,execution_history_id,synthetic)
select format('27500000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26600000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26400000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26500000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,'device','running','2026-07-31 08:00+00','physical_device',format('26000000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26100000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26200000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('27000000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26700000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26900000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,true
from generate_series(1,25) n;

-- Bulk fixture loading is intentionally trigger-free so the 120,000-row
-- insert does not perform one job upsert per point.  The rows satisfy the
-- same authority constraints; the authoritative enqueue is issued once per
-- scope immediately after loading.
set local session_replication_role = replica;

with points as (select n, t from generate_series(1,25) n cross join generate_series('2026-07-31 08:00+00'::timestamptz,'2026-07-31 17:59:45+00','15 seconds') t)
insert into public.location_points(id,tracking_session_id,source,driver_id,vehicle_id,recorded_at,received_at,lat,lng,accuracy_meters,quality,ad_work_id,ad_work_day_id,assignment_id,assignment_history_id,execution_history_id,synthetic)
select format('27100000-0000-0000-0000-%s',lpad(((n-1)*2400+row_number() over(partition by n order by t))::text,12,'0'))::uuid,format('27400000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,'phone',format('26000000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26100000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,t,t,17,78,10,'good',format('26400000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26600000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26500000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26700000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26900000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,true from points;

with points as (select n, t, row_number() over(partition by n order by t)::integer seq from generate_series(1,25) n cross join generate_series('2026-07-31 08:00+00'::timestamptz,'2026-07-31 17:59:45+00','15 seconds') t)
insert into public.telemetry_receipts(id,gps_device_id,credential_id,adapter_id,adapter_version,idempotency_identity,content_hash,raw_payload_hash,captured_at,received_at,normalized_at,disposition,reason_code,freshness,offline_backfill,quality,synthetic,processing_version,ad_work_id,ad_work_day_id,assignment_id,driver_id,vehicle_id,gps_device_vehicle_link_id,assignment_history_id,execution_history_id,tracking_session_id)
select format('27200000-0000-0000-0000-%s',lpad(((n-1)*2400+seq)::text,12,'0'))::uuid,format('26200000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26300000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,'m23','1',format('m23-scale-%s-%s',n,seq),repeat('a',64),repeat('c',64),t,t,t,'accepted_live','accepted','live',false,'valid',true,'m23',format('26400000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26600000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26500000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26000000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26100000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('27000000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26700000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('26900000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid,format('27500000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid
from points;
insert into public.location_points(id,tracking_session_id,source,device_id,driver_id,vehicle_id,recorded_at,received_at,lat,lng,accuracy_meters,quality,ad_work_id,ad_work_day_id,assignment_id,telemetry_receipt_id,altitude_meters,satellite_count,freshness,offline_backfill,synthetic,gps_device_vehicle_link_id,assignment_history_id,execution_history_id)
select format('27300000-0000-0000-0000-%s',lpad(((row_number() over(order by tr.captured_at,tr.id))::integer)::text,12,'0'))::uuid, tr.tracking_session_id,'physical_device',tr.gps_device_id,tr.driver_id,tr.vehicle_id,tr.captured_at,tr.received_at,17,78,10,'good',tr.ad_work_id,tr.ad_work_day_id,tr.assignment_id,tr.id,0,10,tr.freshness,false,true,tr.gps_device_vehicle_link_id,tr.assignment_history_id,tr.execution_history_id
from public.telemetry_receipts tr where tr.adapter_id='m23' and tr.idempotency_identity like 'm23-scale-%';

set local session_replication_role = origin;
commit;
\connect postgres supabase_admin
select plan(11);
select dblink_connect_u('m23_scale_1','dbname=postgres');
select dblink_connect_u('m23_scale_2','dbname=postgres');
select dblink_connect_u('m23_scale_3','dbname=postgres');
select dblink_connect_u('m23_scale_4','dbname=postgres');
select dblink_connect_u('m23_scale_5','dbname=postgres');
select public.m23_enqueue_comparison_job(format('26600000-0000-0000-0000-%s',lpad(n::text,12,'0'))::uuid) from generate_series(1,25) n;
update public.m23_comparison_jobs set next_attempt_at='2026-07-31 17:59:59+00' where ad_work_day_id::text like '26600000-0000-0000-0000-%';
select dblink_send_query('m23_scale_1',$sql$do $$ declare n integer; begin for n in 1..5 loop perform public.m23_process_comparison_queue(1,'2026-07-31 17:59:59+00'); end loop; end $$;$sql$);
select dblink_send_query('m23_scale_2',$sql$do $$ declare n integer; begin for n in 6..10 loop perform public.m23_process_comparison_queue(1,'2026-07-31 17:59:59+00'); end loop; end $$;$sql$);
select dblink_send_query('m23_scale_3',$sql$do $$ declare n integer; begin for n in 11..15 loop perform public.m23_process_comparison_queue(1,'2026-07-31 17:59:59+00'); end loop; end $$;$sql$);
select dblink_send_query('m23_scale_4',$sql$do $$ declare n integer; begin for n in 16..20 loop perform public.m23_process_comparison_queue(1,'2026-07-31 17:59:59+00'); end loop; end $$;$sql$);
select dblink_send_query('m23_scale_5',$sql$do $$ declare n integer; begin for n in 21..25 loop perform public.m23_process_comparison_queue(1,'2026-07-31 17:59:59+00'); end loop; end $$;$sql$);
select * from dblink_get_result('m23_scale_1') as r(result text);
select * from dblink_get_result('m23_scale_2') as r(result text);
select * from dblink_get_result('m23_scale_3') as r(result text);
select * from dblink_get_result('m23_scale_4') as r(result text);
select * from dblink_get_result('m23_scale_5') as r(result text);
select is((select count(*)::integer from public.ad_work_days where id::text like '26600000-0000-0000-0000-%'),25,'25 synthetic authority scopes are loaded');
select is((select count(*)::integer from public.location_points where id::text like '27100000-0000-0000-0000-%'),60000,'60,000 phone points are loaded');
select is((select count(*)::integer from public.location_points where id::text like '27300000-0000-0000-0000-%'),60000,'60,000 physical points are loaded');
select is((select count(*)::integer from public.m23_comparison_snapshots where ad_work_day_id::text like '26600000-0000-0000-0000-%'),25,'one active snapshot per scope is produced');
select is((select count(*)::integer from public.m23_comparison_pair_evidence where authority_scope_key in (select authority_scope_key from public.m23_comparison_snapshots)),60000,'deduplicated pair evidence equals the reusable 60,000 pairs');
select is((select count(*)::integer from public.m23_comparison_pairs where snapshot_id in (select id from public.m23_comparison_snapshots)),60000,'initial detailed pair rows equal one bounded batch per scope');
select ok((select bool_and(overall_outcome='paired_match' and pair_count=2400 and acceptable_pair_count=2400) from public.m23_comparison_snapshots where ad_work_day_id::text like '26600000-0000-0000-0000-%'),'all scale scopes pair without mismatch or quality inflation');

update public.m23_comparison_jobs set next_attempt_at='2026-07-31 17:59:59+00' where ad_work_day_id::text like '26600000-0000-0000-0000-%';
select diag(public.m23_process_comparison_queue(100,'2026-07-31 17:59:59+00')::text);
select diag(public.m23_process_comparison_queue(100,'2026-07-31 17:59:59+00')::text);
select is((select count(*)::integer from public.m23_comparison_snapshots where ad_work_day_id::text like '26600000-0000-0000-0000-%'),25,'repeated worker invocations do not amplify active snapshots');

select public.m23_evaluate_work_day('26600000-0000-0000-0000-000000000001','phone-device-comparison','m23-pilot-v1','2026-08-02 18:00:00+00');
select public.m23_evaluate_work_day('26600000-0000-0000-0000-000000000001','phone-device-comparison','m23-pilot-v1','2026-08-02 18:00:00+00');
select is((select count(*)::integer from public.m23_comparison_snapshots where ad_work_day_id::text like '26600000-0000-0000-0000-%'),26,'one delayed final recomputation creates one successor and rerun is idempotent');
select diag(public.m23_compact_comparison_detail(100)::text);
select is((select count(*)::integer from public.m23_comparison_pair_evidence where authority_scope_key in (select authority_scope_key from public.m23_comparison_snapshots)),60000,'compaction retains immutable reusable evidence');
select is((select count(*)::integer from public.m23_comparison_pairs where snapshot_id in (select id from public.m23_comparison_snapshots)),62300,'fixed-batch compaction removes exactly one bounded batch while retaining final detail');
select * from finish();
select dblink_disconnect('m23_scale_1');
select dblink_disconnect('m23_scale_2');
select dblink_disconnect('m23_scale_3');
select dblink_disconnect('m23_scale_4');
select dblink_disconnect('m23_scale_5');
set session_replication_role=replica;
delete from public.m23_comparison_pairs where snapshot_id in (select id from public.m23_comparison_snapshots where ad_work_day_id::text like '26600000-0000-0000-0000-%');
delete from public.m23_comparison_pair_evidence where authority_scope_key in (select authority_scope_key from public.m23_comparison_snapshots where ad_work_day_id::text like '26600000-0000-0000-0000-%');
delete from public.m23_comparison_reviews where snapshot_id in (select id from public.m23_comparison_snapshots where ad_work_day_id::text like '26600000-0000-0000-0000-%');
delete from public.m23_comparison_review_history where snapshot_id in (select id from public.m23_comparison_snapshots where ad_work_day_id::text like '26600000-0000-0000-0000-%');
delete from public.m23_comparison_alert_context where first_snapshot_id in (select id from public.m23_comparison_snapshots where ad_work_day_id::text like '26600000-0000-0000-0000-%');
delete from public.m23_comparison_heads where authority_scope_key in (select authority_scope_key from public.m23_comparison_snapshots where ad_work_day_id::text like '26600000-0000-0000-0000-%');
delete from public.m23_comparison_snapshots where ad_work_day_id::text like '26600000-0000-0000-0000-%';
delete from public.m23_comparison_jobs where ad_work_day_id::text like '26600000-0000-0000-0000-%';
delete from public.location_points where ad_work_day_id::text like '26600000-0000-0000-0000-%';
delete from public.telemetry_receipts where ad_work_day_id::text like '26600000-0000-0000-0000-%';
delete from public.tracking_sessions where ad_work_day_id::text like '26600000-0000-0000-0000-%';
delete from public.gps_device_vehicle_links where id::text like '27000000-0000-0000-0000-%';
delete from public.m21_execution_history where ad_work_day_id::text like '26600000-0000-0000-0000-%';
delete from public.m21_assignment_history where ad_work_id::text like '26400000-0000-0000-0000-%';
delete from public.m21_release_history where ad_work_id::text like '26400000-0000-0000-0000-%';
delete from public.ad_work_days where id::text like '26600000-0000-0000-0000-%';
delete from public.ad_work_assignments where ad_work_id::text like '26400000-0000-0000-0000-%';
delete from public.ad_works where id::text like '26400000-0000-0000-0000-%';
delete from public.gps_device_credential_metadata where id::text like '26300000-0000-0000-0000-%';
delete from public.gps_devices where id::text like '26200000-0000-0000-0000-%';
delete from public.vehicles where id::text like '26100000-0000-0000-0000-%';
delete from public.drivers where id::text like '26000000-0000-0000-0000-%';
set session_replication_role=origin;
