# M17 Real Device Pilot Blocker Remediation

M17 converts the M16 blocked result into a concrete remediation package. It does not claim that the real-device pilot is ready, and it does not add product behavior.

## M16 Blocked Result Summary

M16 recorded `Result: Blocked` because Codex did not have a physical Android device, a real-device driver app build, a target Supabase project, an admin user, storage verification, or a deployed web/admin environment.

The M16 evidence run did not validate Android location permission behavior, physical-device proof upload, offline location sync, Sync Now, target storage privacy, or production-like admin/web access.

## Blocker Remediation Table

| Blocker | Required action | Can Codex do it? | Requires AP/manual action? | Evidence needed | Status |
| --- | --- | --- | --- | --- | --- |
| No physical Android device connected | Provide an Android phone for driver app testing and confirm it can run the app. | No | Yes | Safe evidence reference showing device test was performed without device id or personal details. | Open |
| No real-device Expo build available | Choose Expo Go, development build, or APK path and run the driver app on the phone. | Partially, docs only | Yes | Build/run evidence reference, build type, date, and result. | Open |
| No target Supabase environment configured | Create or select a target Supabase project and apply migrations in order. | No | Yes | Target setup checklist with migration result references kept outside Git. | Open |
| No target admin user available | Create an admin auth user and set `user_profiles.role` to `admin`. | No | Yes | Admin login test result with private account values omitted. | Open |
| `proof-photos` bucket not verified in target Supabase | Verify the target bucket is private and public users cannot read or list proof files. | No | Yes | Storage policy verification result and safe reference. | Open |
| Android permission testing not performed | Verify foreground location permission appears only after assigned work and Location Proof consent. | No | Yes | Physical Android test result and safe notes. | Open |
| Proof upload not tested on physical Android | Upload a fake proof photo from the real phone to target storage using fake data. | No | Yes | Pass/fail result and private evidence reference. | Open |
| Offline sync and Sync Now not tested on physical Android | Simulate network loss during active work and verify buffered points sync after reconnect. | No | Yes | Offline/Sync Now test result without raw coordinates. | Open |
| No deployed web/admin preview or production-like environment | Deploy or provide a preview/production-like web/admin URL with public env values only. | No | Yes | Preview URL reference kept outside Git and checklist result. | Open |

## Exact Remediation Steps

1. AP provides the target Supabase project, Android phone, deployment target, and admin setup path.
2. Apply all migrations from M0 through M12 to the target Supabase project in timestamp order.
3. Verify `customer_live_enabled` and `live_tracking_enabled` default to false in the target project.
4. Create the target admin user manually in Supabase Auth and set the matching `user_profiles.role` to `admin`.
5. Verify public enquiry insert-only behavior and admin-only access for planning, assignment, proof, tracking, review, and final summary records.
6. Verify the `proof-photos` bucket is private and has no public read/list policy.
7. Configure web/admin public environment values outside Git.
8. Configure driver app public environment values outside Git.
9. Run the driver app on a physical Android phone using the selected Expo/build path.
10. Run the M15 real Android checklist and record results in the M17 evidence template.
11. Keep screenshots, device identifiers, phone numbers, account emails, Work Codes, proof paths, logs, and raw coordinates outside this repository.

## Expected Evidence After Remediation

- Supabase target setup checklist with pass/fail results.
- Admin login result with no private account values.
- Storage privacy result proving no public proof photo read/list access.
- Driver app real-device open result.
- Android foreground permission result.
- Proof upload result using fake customer, driver, vehicle, and ad work data.
- Offline buffer and Sync Now result using fake data and no raw coordinate values.
- Web/admin preview verification result.
- Remaining issues list with owner and retest plan.

## Pass/Fail Criteria

Pass only when every M16 blocker has a performed remediation action and a safe evidence reference. A blocker remains failed or open if the action is only documented, if evidence is missing, or if the test was not run on a physical Android phone and target Supabase project.

Do not mark the real-device pilot as passed unless AP provides the real environment and the evidence template is completed with pass results.

## What Codex Can Do Inside The Repo

- Maintain remediation guides.
- Maintain safe evidence templates.
- Maintain guardrail tests.
- Maintain local no-network readiness checks.
- Confirm placeholder-only committed examples.
- Confirm no forbidden future features are added.

## What Requires AP Or Manual Environment Action

- Providing a physical Android phone.
- Installing or running a real-device driver app build.
- Providing a target Supabase project.
- Creating the target admin user.
- Validating the target `proof-photos` bucket.
- Running Android permission, proof upload, offline sync, and Sync Now checks.
- Providing a deployed preview or production-like web/admin environment.

## Next Milestone Recommendation

Recommended next milestone: M18 Real Device Pilot Evidence Retry.

If AP cannot yet provide the target Supabase project or deployment environment, use M18 Target Environment Setup Evidence instead and keep physical-device execution blocked until the environment exists.
