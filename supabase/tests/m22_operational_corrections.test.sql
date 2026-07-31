begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into public.gps_devices(
  id,device_code,vendor,model,adapter_type,protocol_type,status,installation_state,
  created_at,last_heartbeat_at
)
select ('00000000-0000-0000-0000-00000000000'||n::text)::uuid,
  'M22-FAIR-'||n,'Test Vendor','Test Model','generic_http','https','active','installed',
  '2026-01-01+00',null
from generate_series(1,5) n;
update public.m22_health_sweep_cursor set last_device_id=null;

select is((public.m22_run_health_sweep(2,'2026-07-31 12:00:00+00')->>'devices_considered')::integer,
  2,'first fair sweep considers one bounded page');
select is((public.m22_run_health_sweep(2,'2026-07-31 12:00:00+00')->>'devices_considered')::integer,
  2,'second fair sweep advances to the next page');
select is((public.m22_run_health_sweep(2,'2026-07-31 12:00:00+00')->>'devices_considered')::integer,
  1,'third fair sweep completes the final partial page before wrapping');
select is((select count(distinct gps_device_id)::integer from public.m22_rule_signals
  where gps_device_id between '00000000-0000-0000-0000-000000000001'::uuid
    and '00000000-0000-0000-0000-000000000005'::uuid and signal_kind='health_sweep'),
  5,'all devices beyond one batch are considered before cursor wrap');

create temp table m22_correction_ids(label text primary key,id uuid not null);
with inserted as (
  insert into public.m22_rule_signals(
    signal_key,signal_kind,reason_code,occurred_at,adapter_id,created_at
  ) values(public.m22_safe_digest('m22-retention-transient'),'adapter_rejection',
    'invalid_coordinate','2026-01-01+00','m22.retention','2026-01-01+00') returning id
) insert into m22_correction_ids select 'transient',id from inserted;
update public.m22_rule_evaluation_queue set state='completed',completed_at='2026-01-02+00',
  updated_at='2026-01-02+00' where signal_id=(select id from m22_correction_ids where label='transient');

with inserted as (
  insert into public.m22_rule_signals(
    signal_key,signal_kind,reason_code,occurred_at,adapter_id,created_at
  ) values(public.m22_safe_digest('m22-retention-retained'),'adapter_rejection',
    'invalid_coordinate','2026-01-01+00','m22.retention','2026-01-01+00') returning id
) insert into m22_correction_ids select 'retained-signal',id from inserted;
insert into m22_correction_ids
select 'retained-alert',public.m22_apply_rule_observation(
  (select id from m22_correction_ids where label='retained-signal'),
  'invalid_coordinate','2026-07-29+00','adapter_rejection','retention-evidence',null,null,1,null);
update public.m22_rule_evaluation_queue set state='completed',completed_at='2026-01-02+00',
  updated_at='2026-01-02+00' where signal_id=(select id from m22_correction_ids where label='retained-signal');

select lives_ok($$select public.m22_compact_operational_rows(500,'2026-07-31+00')$$,
  'bounded operational compaction runs through the service-only function');
select is((select count(*)::integer from public.m22_rule_signals
  where id=(select id from m22_correction_ids where label='transient')),0,
  'old unreferenced transient signal is compacted after its queue row');
select is((select count(*)::integer from public.m22_rule_signals
  where id=(select id from m22_correction_ids where label='retained-signal')),1,
  'signal retained by alert assessment and rule state is preserved');
select is((select count(*)::integer from public.alerts
  where id=(select id from m22_correction_ids where label='retained-alert')),1,
  'operational compaction preserves alerts');
select throws_ok($$delete from public.m22_rule_signals where signal_key=public.m22_safe_digest('m22-retention-retained')$$,
  '55000','M22 evidence is immutable','direct signal deletion remains blocked');

insert into public.user_profiles(auth_user_id,display_name,role)
values('52000000-0000-0000-0000-000000000001','M22 Contract Admin','admin');
grant select on m22_correction_ids to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','52000000-0000-0000-0000-000000000001',true);
select ok((public.admin_get_m22_tracking_health_v1(null,'2026-07-01','2026-07-31',100,'2026-07-31+00')
  ->>'contractVersion')='m22-admin-v1','tracking-health projection returns the v1 envelope');
select ok((public.admin_list_m22_alerts_v1(null,null,null,null,null,null,null,null,null,100)
  ->>'contractVersion')='m22-admin-v1','alert list returns the v1 envelope');
select ok(not (public.admin_list_m22_alerts_v1(null,null,null,null,null,null,null,null,null,100)::text
  ~ 'dedupe_key|observed_value|threshold_value|telemetry_receipt|execution_history'),
  'alert list excludes internal references and technical values');
select ok((public.admin_get_m22_alert_detail_v1(
  (select id from m22_correction_ids where label='retained-alert'))->>'contractVersion')='m22-admin-v1',
  'alert detail returns the matching nested v1 contract');
select lives_ok(format('select public.admin_get_m22_alert_technical_values_v1(%L)',
  (select id from m22_correction_ids where label='retained-alert')),
  'explicit technical-value access succeeds for an admin');
select is((select count(*)::integer from public.audit_logs where entity_type='alert'
  and entity_id=(select id from m22_correction_ids where label='retained-alert')
  and action='alert_technical_values_viewed'),1,
  'technical-value access creates one safe audit event');
reset role;

select * from finish();
rollback;
