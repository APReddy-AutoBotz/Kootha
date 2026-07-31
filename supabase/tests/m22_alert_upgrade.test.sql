begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select enum_has_labels('public','alert_status',
  array['new','acknowledged','investigating','resolved','false_alarm','ignored'],
  'alert status enum is upgraded without a replacement alert table');
select col_is_fk('public','alerts','ad_work_day_id','legacy alert work-day FK remains');
select has_column('public','alerts','created_at','legacy timestamp remains');
select has_column('public','alerts','resolved_at','legacy resolved time remains');
select has_column('public','alerts','origin','legacy/M22 origin is explicit');
select is((select count(*)::integer from public.alerts
  where origin='legacy_pre_m22' and rule_id is not null),0,
  'legacy rows are not assigned fabricated rule context');
select ok(not exists(select 1 from information_schema.tables
  where table_schema='public' and table_name='m22_alerts'),
  'no competing M22 alert master exists');
select ok(exists(select 1 from pg_indexes where schemaname='public'
  and tablename='alerts' and indexname='alerts_m22_active_episode_unique'),
  'active episode uniqueness is database enforced');

select * from finish();
rollback;
