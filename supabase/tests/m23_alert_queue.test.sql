begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into public.user_profiles(auth_user_id,display_name,role)
values('26000000-0000-0000-0000-000000000003','M23 Queue Admin','admin');
insert into public.alerts(type,severity,status,message,created_at,rule_id,rule_version,source,dedupe_key,episode_number,condition_active,first_detected_at,last_detected_at,occurrence_count,synthetic,title,status_changed_at,updated_at,origin)
values('mismatch','warning','new','Sustained source separation detected. Review operational evidence.','2026-07-31 08:07+00',null,null,'comparison',public.m22_safe_digest('m23-queue-alert'),1,true,'2026-07-31 08:02+00','2026-07-31 08:07+00',1,true,'Sustained comparison mismatch','2026-07-31 08:07+00','2026-07-31 08:07+00','m22_rule_engine');

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub','26000000-0000-0000-0000-000000000003')::text,true);
select ok((public.admin_list_m22_alerts_v1(null,null,null,null,null,null,null,null,null,100))::text like '%phone_physical_sustained_mismatch%','M23 comparison alert appears in the normal Alerts queue');
select ok((public.admin_list_m22_alerts_v1(null,null,'phone_physical_sustained_mismatch',null,null,null,null,null,null,100))::text like '%phone_physical_sustained_mismatch%','safe comparison rule label is filterable without an M22 policy');
select ok((public.admin_get_m22_alert_detail_v1((select id from public.alerts where source='comparison' limit 1)))::text like '%phone_physical_sustained_mismatch%' and (public.admin_get_m22_alert_detail_v1((select id from public.alerts where source='comparison' limit 1)))::text like '%false_alarm%','comparison detail exposes safe label and existing lifecycle transitions');
select ok((public.admin_get_m22_alert_detail_v1((select id from public.alerts where source='comparison' limit 1)))::text !~ 'latitude|longitude|observedValue|thresholdValue','comparison alert detail has no technical values or coordinates');
select diag(public.admin_transition_alert((select id from public.alerts where source='comparison' limit 1),'acknowledged','queue review','M23 comparison alert acknowledged.')::text);
select is((select status::text from public.alerts where source='comparison' limit 1),'acknowledged','M23 alert uses the existing acknowledgement lifecycle');
select * from finish();
rollback;
