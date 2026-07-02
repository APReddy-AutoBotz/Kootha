# M14 End-To-End Dry Run Checklist

Use this checklist with fake data only. Record results in `docs/pilot/m14-dry-run-results-template.md`.

## Public Website

- [ ] Website opens.
- [ ] Product name and public sections render.
- [ ] Enquiry form renders.
- [ ] Required-field validation works.
- [ ] Invalid mobile number validation works.
- [ ] Consent validation works.
- [ ] Enquiry submission behavior is safe when Supabase is not configured.
- [ ] Fake enquiry submission works when local or pilot Supabase is configured.

## Admin

- [ ] Admin login path `/admin` is documented.
- [ ] Admin can log in with a test admin user.
- [ ] Fake enquiry can be reviewed.
- [ ] Fake enquiry can become Ad Work.
- [ ] Ad Work can be planned with fake areas and dates.
- [ ] Fake driver application can be reviewed.
- [ ] Fake driver can be approved or rejected.
- [ ] Fake vehicle can be approved or updated.
- [ ] Fake driver and vehicle can be assigned to Ad Work.
- [ ] Assignment readiness warnings are visible.
- [ ] Work can be released to driver.
- [ ] Work Code is shared manually and is not written into documentation.
- [ ] Execution status can be monitored.
- [ ] Proof upload can be reviewed.
- [ ] Phone Location Proof can be reviewed without maps.
- [ ] Final Proof Summary can be created.
- [ ] Ad Work can be closed or closed with an accepted dry-run issue reason.

## Driver App

- [ ] Driver app opens.
- [ ] Driver application flow exists.
- [ ] Driver Work Code access flow exists.
- [ ] Driver can see assigned fake work only with matching fake mobile number and Work Code.
- [ ] Start Work exists.
- [ ] Take Break exists.
- [ ] Resume Work exists.
- [ ] End Work exists.
- [ ] Proof note flow exists.
- [ ] Photo proof flow exists.
- [ ] Phone Location Proof consent exists.
- [ ] Start Location Proof exists after consent.
- [ ] Stop Location Proof exists.
- [ ] Offline sync status exists.
- [ ] Sync Now exists for pending offline points.

## Security And Privacy

- [ ] No real customer data is used.
- [ ] No real driver data is used.
- [ ] No real Work Code is written into documentation.
- [ ] No real person GPS trace is written into documentation.
- [ ] No customer live tracking link is exposed.
- [ ] No public location link is exposed.
- [ ] Proof photos remain private.
- [ ] Tracking data remains admin-only.
- [ ] Location Proof Review remains admin-only.
- [ ] `.env.example` remains placeholder-only.
- [ ] No real secrets are committed.
- [ ] No service role key is exposed in web or driver app.
- [ ] `customer_live_enabled` remains false.
- [ ] `live_tracking_enabled` remains false.

## Dry Run Completion

- [ ] Every checklist item has an actual result.
- [ ] Every failed or blocked item has an owner.
- [ ] Every issue has a decision: fix before pilot, accept for pilot, or defer.
- [ ] AP has reviewed customer-safe final summary wording.
- [ ] AP has reviewed support and escalation readiness.
