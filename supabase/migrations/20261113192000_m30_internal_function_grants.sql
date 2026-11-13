-- M30: close execute grants that "revoke ... from public" did not close.
--
-- Supabase grants EXECUTE on every new function in the public schema to the
-- anon and authenticated roles by name. Earlier migrations revoked from PUBLIC
-- only, which leaves those named grants in place.
--
-- 1. m8_build_final_summary_text(uuid) is SECURITY DEFINER, has no caller
--    check, and returns the customer's name and mobile number, the driver and
--    vehicle, and the Customer Update history for an Ad Work. It was meant to
--    be internal, but anyone holding an Ad Work id, including a driver using
--    the app's own anonymous key, could call it through /rest/v1/rpc. Only the
--    admin summary functions call it, and they run as its owner.
-- 2. Sixteen admin functions refuse non-admins with is_admin(), so the anon
--    grant gave nothing away, but anonymous callers have no reason to reach
--    them at all.
set search_path = public;

revoke all on function public.m8_build_final_summary_text(uuid) from anon;
revoke all on function public.m8_build_final_summary_text(uuid) from authenticated;

revoke all on function public.admin_stop_mobile_tracking(uuid) from anon;
revoke all on function public.assign_driver_vehicle_to_ad_work(uuid, uuid, uuid, text, text, text[], boolean) from anon;
revoke all on function public.close_ad_work_with_final_summary(uuid, text, text, text, text, boolean, boolean, boolean, text, boolean) from anon;
revoke all on function public.complete_admin_proof_upload(uuid) from anon;
revoke all on function public.create_ad_work_from_enquiry(uuid) from anon;
revoke all on function public.mark_customer_update_shared(uuid, text, text) from anon;
revoke all on function public.mark_final_summary_shared(uuid, text, text) from anon;
revoke all on function public.prepare_final_proof_summary(uuid, boolean, boolean, boolean, text, boolean, text, boolean) from anon;
revoke all on function public.prepare_flexible_final_proof_summary(uuid, boolean, boolean, boolean, text, boolean, text, boolean) from anon;
revoke all on function public.release_ad_work_to_driver(uuid, text, boolean) from anon;
revoke all on function public.release_flexible_ad_work_to_driver(uuid, text, boolean) from anon;
revoke all on function public.request_admin_proof_upload(uuid, text, text, text, text, integer) from anon;
revoke all on function public.review_driver_application(uuid, text, text, date, text, text) from anon;
revoke all on function public.review_proof_upload(uuid, text, text) from anon;
revoke all on function public.save_ad_work_assignment(uuid, uuid, uuid, text, text[], boolean) from anon;
revoke all on function public.set_mobile_location_proof(uuid, boolean, text) from anon;
