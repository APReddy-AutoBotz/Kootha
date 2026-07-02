# M15 Real Android Testing Checklist

Use fake data only. Record results in `docs/pilot/m15-real-device-evidence-template.md` or a private evidence tracker.

## App Launch And Access

- [ ] Driver app opens on Android phone.
- [ ] Driver registration screen opens.
- [ ] Driver can submit or view fake registration flow when target Supabase is configured.
- [ ] Driver can access assigned work with fake mobile number and manually shared Work Code.
- [ ] Driver cannot access work with the wrong mobile number or wrong Work Code.

## Work Execution

- [ ] Driver can Start Work.
- [ ] Driver can Take Break.
- [ ] Driver can Resume Work.
- [ ] Driver can End Work.
- [ ] Driver can add proof note.
- [ ] Driver can upload fake photo proof.
- [ ] Proof upload reaches the target Supabase project.

## Phone Location Proof

- [ ] Driver sees consent text before Phone Location Proof starts.
- [ ] Foreground location permission appears only during assigned work flow.
- [ ] Location proof starts only after Start Work and driver consent.
- [ ] Location proof stops after End Work.
- [ ] Location proof stops after break, admin stop, access revoke, or closure when those cases are tested.
- [ ] App does not request background location.
- [ ] App does not request unnecessary permissions.
- [ ] App does not show live location access for customers.

## Offline Buffer And Sync

- [ ] Disable network while foreground Location Proof is active.
- [ ] Confirm pending point count or sync pending state appears.
- [ ] Restore network.
- [ ] Use Sync Now.
- [ ] Confirm synced points are removed from local pending state.
- [ ] Confirm admin tracking health reflects sync status.

## Evidence Rules

- [ ] Evidence references do not include real customer data.
- [ ] Evidence references do not include real driver data.
- [ ] Evidence references do not include Work Codes.
- [ ] Evidence references do not include raw coordinates.
- [ ] No real screenshots are committed to this repository.