# M14 Controlled Pilot Dry Run

M14 documents a controlled dry run of the current Kootha / Prachar MVP using fake data only. It validates readiness for a real pilot without adding new product features or claiming that a real customer pilot has been completed.

## Dry Run Objective

Prove that the existing MVP flow can be exercised end to end with fake Ongole/Addanki data:

Public Website Enquiry -> Admin Lead Management -> Ad Work Planning -> Driver/Vehicle Onboarding -> Driver/Vehicle Assignment -> Work Release -> Driver Work Execution -> Proof Upload -> Phone Location Proof -> Admin Tracking Review -> Final Proof Summary -> Campaign Closure.

The dry run should identify setup gaps, device gaps, and support gaps before any real customer or driver data is used.

## Fake Scenario Details

- Pilot town: Ongole with Addanki as the secondary service area.
- Fake customer name: Demo Customer One.
- Fake business name: Demo Kirana Pilot Shop.
- Fake mobile number: 9000000101.
- Fake driver name: Demo Driver One.
- Fake vehicle number: AP00DR0001.
- Fake Ad Work title: Demo Market Announcement Dry Run.
- Fake areas: Ongole Main Road, Kurnool Road Junction, Addanki Bus Stand Area.
- Fake package: Standard.
- Fake proof notes: Announcement completed near demo market area; customer update copied manually.
- Fake location proof: use only simulator/manual test records or real-device test points that are clearly marked as test data. Do not record a real person's movement as evidence for this document.
- Work Code: do not write a Work Code in this document.

## Test Roles

- Admin tester: uses `/admin` to review enquiry, create Ad Work, plan, assign, release, review proof, review Phone Location Proof, prepare final summary, and close.
- Driver tester: uses the Android driver app with fake identity details and test-only Work Code access.
- Customer/business owner tester: reviews only customer-safe wording and final summary output.
- Support observer: records issues, owner, and whether a fix is needed before a real pilot.

## Dry Run Assumptions

- Supabase is configured with migrations through M12.
- Admin user setup is complete.
- Public anon keys are configured outside Git.
- The `proof-photos` bucket remains private.
- `customer_live_enabled` remains false.
- `live_tracking_enabled` remains false.
- Phone Location Proof testing on a real Android device is pending unless AP records that it was manually performed.
- No real customer data, driver data, Work Codes, or real GPS traces are stored in these dry-run docs.

## Expected End-To-End Flow

1. Open the public website and submit a fake enquiry.
2. Admin reviews the fake enquiry and creates Ad Work.
3. Admin plans dates, areas, package, proof requirement, and customer update plan.
4. Driver submits a fake driver application.
5. Admin approves fake driver and vehicle records.
6. Admin assigns the fake driver and fake vehicle to the fake Ad Work.
7. Admin releases work and shares the Work Code manually outside the documentation.
8. Driver opens assigned work with fake mobile and Work Code.
9. Driver uses Start Work, Take Break, Resume Work, and End Work.
10. Driver adds proof notes and uploads fake proof photos.
11. Driver starts foreground Phone Location Proof only after consent when required.
12. Admin reviews proof photos and customer update records.
13. Admin reviews Phone Location Proof without maps.
14. Admin prepares customer-safe Final Proof Summary.
15. Admin closes the fake Ad Work or records a dry-run blocker.

## Pass / Fail Criteria

Pass only when:

- all required steps are attempted with fake data,
- all required records can be found by admin,
- driver access requires matching fake mobile number and Work Code,
- proof upload behavior can be verified with private storage configured,
- Phone Location Proof consent is visible before location proof starts,
- Phone Location Proof starts and stops correctly in real-device testing or is explicitly marked pending,
- final summary wording is customer-safe,
- no customer live tracking link is exposed,
- all issues are recorded in the results template.

Fail when:

- real customer or driver data is used,
- a real Work Code is written into docs,
- proof photos are publicly readable,
- tracking data is visible outside admin,
- customer wording claims map, route, distance, or certified coverage proof,
- Android device testing is assumed without evidence.

## Known Limitations

- Codex/container verification cannot prove real Android permission behavior.
- Codex/container verification cannot prove real phone GPS stop/start behavior.
- Proof photo storage requires a configured Supabase project and storage bucket.
- Admin login requires a manually created Supabase Auth user.
- Provider messages are manual only; there is no WhatsApp/SMS provider integration.
- Customer live tracking remains unavailable.

## Next Actions Before Real Pilot

- Run the end-to-end dry-run checklist with AP or assigned tester.
- Complete the results template for every step.
- Verify proof photo privacy in the target Supabase project.
- Test foreground Phone Location Proof on a real Android device.
- Confirm customer communication text with AP.
- Assign a support person for the pilot window.
