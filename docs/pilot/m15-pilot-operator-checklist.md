# M15 Pilot Operator Checklist

Use this checklist with the pilot owner before real customer pilot execution. M15 does not start the pilot.

## Before Pilot Day

- [ ] AP confirms real-device setup is ready.
- [ ] Admin operator is assigned.
- [ ] Driver support contact is assigned.
- [ ] Customer communication owner is assigned.
- [ ] Target Supabase project is verified.
- [ ] Web/admin preview or production-like build is verified.
- [ ] Driver app is installed on the real Android phone.
- [ ] Fake dry-run and real-device checks are complete.
- [ ] Evidence template is prepared outside the repository for real screenshots or private notes.

## During Pilot Day

- [ ] Admin operator monitors dashboard and Ad Work detail.
- [ ] Driver support contact stays reachable by phone.
- [ ] Customer communication owner handles manual updates.
- [ ] Admin verifies proof uploads before sharing customer updates.
- [ ] Admin reviews Location Proof health without exposing raw values to customer.
- [ ] Admin records issues with owner and next action.

## After Pilot Day

- [ ] Admin reviews proof uploads.
- [ ] Admin reviews Phone Location Proof status.
- [ ] Admin prepares Final Proof Summary.
- [ ] AP reviews final summary before customer sharing.
- [ ] Operator records blockers, fixes, and retest needs.
- [ ] No real private data is committed to the repository.

## If Location Permission Is Denied

- Stop relying on Phone Location Proof for that work day.
- Ask driver to confirm permission choice.
- Record issue and device details in private evidence tracker.
- Continue only with AP-approved manual proof fallback.

## If Internet Is Lost

- Driver continues only if safe and operationally approved.
- Keep Phone Location Proof foreground flow active when possible.
- Use Sync Now after network returns.
- Admin checks offline sync status and records issue if sync fails.

## If Proof Upload Fails

- Driver records proof note.
- Admin records upload failure as an issue.
- Retry on stable network.
- Do not use personal messaging apps as a replacement evidence store unless AP explicitly accepts that operational workaround outside the product.

## If Driver Calls With Issue

- Support contact records issue time, driver-reported state, and next action.
- Admin checks assigned work status.
- AP decides whether to continue, pause, or stop pilot activity.

## Stop Pilot Conditions

- Driver cannot access assigned work.
- Location permission behavior is unsafe or unclear.
- Proof upload cannot be verified.
- Admin cannot review proof or final summary.
- Customer wording would require unsupported proof claims.
- Any real secret, private link, or private data is exposed.

## Issue Documentation

For every issue, record:

- issue summary,
- area affected,
- owner,
- severity,
- fix needed before pilot or accepted limitation,
- retest result.