-- M29 phone-pilot authority closure: Supabase local roles can carry default
-- EXECUTE grants on newly created functions. Make the two retained execution
-- boundaries explicit after every CREATE OR REPLACE migration.
set search_path = public;

revoke all on function public.driver_update_work_day(
  text, text, uuid, text, text, text, text
) from public, anon, authenticated, service_role;

grant execute on function public.driver_update_work_day(
  text, text, uuid, text, text, text, text
) to anon;

revoke all on function public.close_flexible_ad_work_with_final_summary(
  uuid, text, text, text, text, boolean, boolean, boolean, text, boolean
) from public, anon, authenticated, service_role;

grant execute on function public.close_flexible_ad_work_with_final_summary(
  uuid, text, text, text, text, boolean, boolean, boolean, text, boolean
) to authenticated;
