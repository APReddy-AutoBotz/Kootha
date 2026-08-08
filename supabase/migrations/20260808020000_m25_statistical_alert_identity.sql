-- Native alert identity for reviewed M25 statistical signals. Kept separate because
-- PostgreSQL enum additions must commit before the new value is used.
alter type public.alert_type add value if not exists 'statistical_signal';
