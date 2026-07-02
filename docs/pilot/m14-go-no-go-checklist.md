# M14 Pilot Go / No-Go Checklist

Use this checklist after completing the M14 dry run and before scheduling a real pilot.

## Go Criteria

- [ ] Admin can complete the full flow from fake enquiry to campaign closure.
- [ ] Driver can complete assigned work flow with fake mobile number and manually shared Work Code.
- [ ] Proof upload works in the configured Supabase project.
- [ ] Proof photos remain private.
- [ ] Phone Location Proof starts correctly on a real Android device after consent.
- [ ] Phone Location Proof stops correctly on a real Android device after work ends, break, admin stop, access revoke, or closure.
- [ ] Tracking data remains admin-only.
- [ ] Final Proof Summary is customer-safe.
- [ ] No live tracking is exposed to the customer.
- [ ] Customer communication text is ready.
- [ ] Support person is available during the pilot window.
- [ ] Known dry-run issues have owners and decisions.

## No-Go Criteria

- [ ] Admin cannot complete the full flow.
- [ ] Driver cannot access or complete assigned work.
- [ ] Proof upload is not configured or proof photos are public.
- [ ] Phone Location Proof behavior has not been tested on a real Android device.
- [ ] Phone Location Proof continues after work should stop.
- [ ] Final summary includes raw coordinates or unsupported proof claims.
- [ ] Customer receives or can access live location data.
- [ ] Service role or real secrets are exposed in frontend or driver app configuration.
- [ ] Support owner is unavailable.

## AP Decision

- Decision: Go / No-Go / Retest Required.
- Decision date:
- Decision owner:
- Notes:
