# Kootha / Prachar

Kootha / Prachar is a low-cost local mic advertisement proof platform. The repository currently includes M0 foundation, M1 public website and enquiries, M2 admin lead management, M3 campaign planning and scheduling, M4 driver and vehicle onboarding, M5 driver and vehicle assignment to ad work, M6 ad work execution without GPS, M7 proof upload and customer update sharing, M8 final proof summary and campaign closure, M9 mobile GPS tracking foundation, M10 mobile GPS reliability and offline buffer, M11 admin tracking review without maps, M12 location proof in final summary, M13 pilot readiness and deployment preparation, M14 controlled pilot dry run preparation, M15 real device pilot setup and deployment preparation, and M16 real device pilot execution evidence.

## Current Scope

- React + Vite public website at /.
- Public enquiry form with safe validation and Supabase insert-only submission.
- Admin login at /admin with role checks.
- Admin Dashboard, Enquiries, Ad Works, Driver Applications, Drivers, and Vehicles navigation.
- Admin driver and vehicle assignment to planned Ad Works with readiness checks.
- Admin enquiry management and M3 planned ad work management.
- Driver Android app registration form for driver and vehicle interest.
- Admin driver application review, approval, rejection, duplicate handling, driver records, and vehicle records.
- Vehicle GPS Device readiness fields only.
- Ready for Execution assignment status as an admin readiness marker only.
- Admin release of Ready for Execution Ad Works to assigned drivers with a Work Code.
- Driver Start Work, Take Break, Resume Work, End Work, Issue Reported, and text-only Proof Note flow.
- Driver photo proof upload after mobile number and Work Code access, using a private proof-photos storage bucket.
- Admin proof review with secure preview links, review notes, and Approve, Reject, or Needs More Info decisions.
- Customer update records that admins can copy and mark as shared by phone call, manual WhatsApp, manual SMS, in person, or other manual method without provider integration.
- Admin Final Proof Summary review, Ready to Close status, Close Ad Work action, Closed with Issues status, and manual final summary share tracking.
- Admin copy and print-friendly Final Proof Summary flow for manual sharing or browser print/save as PDF.
- Admin Phone Location Proof controls, tracking health, offline sync warnings, and stop action for assigned Ad Works.
- Admin Location Proof Review without maps, including day-wise tracking review, warning counts, review status, and review notes.
- Final Proof Summary can include admin-confirmed, customer-safe Phone Location Proof fields: status, required flag, active during work, first/last received time, offline sync, and Team Review Note without coordinates, route maps, distance proof, public links, or live tracking claims.
- Driver foreground phone location proof with explicit consent, Start Location Proof, Stop Location Proof, and saved location updates only during assigned running work.
- Driver local offline buffer for Phone Location Proof points with client idempotency keys, retry sync, Sync Now, and unsynced point status.
- Shared product config, labels, statuses, planning helpers, onboarding validation helpers, execution and proof upload helpers, closure helpers, and public form validation helpers.
- Supabase migrations with RLS enabled and privacy-safe defaults.
- Pilot readiness docs, deployment preparation guide, smoke checklist, operations runbook, driver consent text, customer communication text, and pilot environment readiness helper.
- Controlled pilot dry-run scenario, end-to-end checklist, results template, blocker and limitation notes, fake data guide, and go/no-go checklist.
- Real-device pilot setup docs, deployment runbook, Android test checklist, Supabase target checklist, pilot operator checklist, evidence template, and safe pilot environment check.
- Real-device pilot execution evidence document with a blocked outcome because the required physical device and target environment were unavailable.

## What is intentionally not included in M16

- background location,
- map integration or route map display,
- GPS device location ingest,
- customer live tracking links,
- camera capture,
- microphone,
- video or audio proof upload,
- automated final report generation,
- payment gateway,
- WhatsApp/SMS provider integration,
- customer mobile app,
- iOS app,
- PWA.

## Requirements

- Node.js 20 or newer
- pnpm 9 or newer
- Supabase CLI only when applying migrations locally
- Expo tooling through the workspace dependencies

## Install

    pnpm install

## Pilot Environment Check

Run the safe local environment readiness check without printing environment values:

    pnpm check:pilot-env

Use `PILOT_ENV_MODE=preview` or `PILOT_ENV_MODE=production` outside Git for stricter preview or production-like checks. The check reports only statuses such as configured, missing, placeholder, unsafe key name detected, or unsafe default.

## Environment

Copy .env.example and fill local values outside Git. Keep committed files placeholder-only.

    VITE_PRODUCT_NAME=Prachar
    VITE_SUPABASE_URL=https://your-project.supabase.co
    VITE_SUPABASE_ANON_KEY=replace-with-public-anon-key

    EXPO_PUBLIC_PRODUCT_NAME=Prachar
    EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
    EXPO_PUBLIC_SUPABASE_ANON_KEY=replace-with-public-anon-key

Only public anon keys belong in Vite or Expo environment values. Do not put privileged Supabase keys in browser or mobile environment variables.

## Run Web And Admin

    pnpm dev:web

Routes:

- / public website and enquiry form
- /admin admin login, dashboard, enquiries, planned ad works, driver applications, drivers, vehicles, and Ad Work assignment

If VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing or still placeholder-only, the public enquiry form and admin login show safe not-configured messages instead of crashing.

## Admin Login Setup

M2, M3, and M4 use Supabase Auth for admin login. There is no public admin signup in the app.

1. Apply the Supabase migrations.
2. Create an admin user manually in Supabase Auth using your own email and password.
3. Mark that auth user as an admin in user_profiles.

Use placeholder values like this, replacing the email before running it in your own Supabase project:

    insert into public.user_profiles (auth_user_id, display_name, role)
    select id, 'Admin User', 'admin'
    from auth.users
    where email = 'admin@example.com'
    on conflict (auth_user_id) do update
    set display_name = excluded.display_name,
        role = 'admin';

Do not commit real admin email addresses or passwords.

## M3 Campaign Planning Setup

Apply the M3 migration after M0, M1, and M2. It adds admin-only planning fields and policies for customers, ad_works, ad_work_days, and ad_work_areas.

To create planned work from an enquiry:

1. Log in at /admin with an admin account.
2. Open Enquiries.
3. Select an enquiry and choose Create Ad Work.
4. The app links the enquiry, creates or links a customer record, copies customer and advertisement details, creates day-wise planned rows, and opens the Ad Works view.
5. Edit schedule, areas, proof needed, customer update plan, and internal planning notes before later milestones handle execution.

If an enquiry already has planned work, the Create Ad Work action opens the existing record instead of creating a duplicate.

M3 does not assign drivers or vehicles and does not start tracking. Live tracking can be requested as a premium preference, but live tracking enabled and customer live enabled both stay false by default.

## M4 Driver And Vehicle Onboarding

Apply the M4 migration after M0 through M3. It adds driver_applications and admin-only onboarding policies for driver applications, drivers, vehicles, and GPS device readiness records.

Driver registration works from the Android driver app:

1. Run the driver app with EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY configured.
2. The driver enters name, mobile number, city/town, service areas, vehicle details, Mic System availability, Vehicle GPS Device readiness, notes, and consent.
3. The public driver app can only insert a new driver application.
4. If the Expo public values are missing or placeholder-only, the app still opens and shows Driver registration is not configured in this environment.

Admin review works from /admin:

1. Open Driver Applications.
2. Review submitted details and set status, admin note, follow-up date, rejection reason, or approval note.
3. Approving an application creates or links a driver record.
4. If vehicle details are present, approving creates or links a vehicle record.
5. Duplicate mobile numbers or vehicle numbers link to existing records instead of creating duplicate approved records.
6. Open Drivers or Vehicles to manually update onboarding status, availability, Mic System, Vehicle GPS Device readiness, and admin notes.

M4 does not assign drivers or vehicles to ad works. M4 does not implement tracking, GPS permissions, background location, maps, device location collection, or live customer links.

## M5 Driver And Vehicle Assignment

Apply the M5 migration after M0 through M4. It adds admin-only Ad Work assignment records and assignment status fields.

Admin assignment works from /admin:

1. Open Ad Works.
2. Select a planned Ad Work.
3. Use Assign Driver to choose an approved, non-blocked driver.
4. Use Assign Vehicle to choose an approved, non-blocked vehicle.
5. Review the driver city/town, Service Area, Availability, vehicle approval, Mic System, and Vehicle GPS Device readiness.
6. Set assignment status to Assigned, Needs Review, Ready for Execution, Cancelled, or Not Assigned.
7. Save the assignment note and status.

Ready for Execution means the assignment has passed the simple admin readiness checklist: planned dates, Areas to Cover, approved driver, approved vehicle, Mic System, package selection, and proof plan. It does not start the Ad Work.

For multi-day Ad Work, M5 uses one driver and one vehicle for all planned days. M5 does not implement different drivers per day.

Vehicle GPS Device fields are readiness-only. M5 does not collect location, start tracking, ingest device data, show maps, create customer live links, generate reports, collect payments, or send WhatsApp/SMS provider messages.

## M6 Ad Work Execution Without GPS

Apply the M6 migration after M0 through M5. It adds admin release controls, Work Code access, day-wise execution status, text-only Proof Notes, and customer update records for manual sharing later.

Admin release works from /admin:

1. Open Ad Works.
2. Select an Ad Work that is Ready for Execution.
3. Review the assigned driver, assigned vehicle, planned dates, and release readiness.
4. Choose Release to Driver to generate a Work Code.
5. Manually share the Work Code with the assigned driver.
6. Regenerate the Work Code if needed, or revoke access.

Driver execution works from the Android driver app:

1. Enter mobile number and Work Code.
2. Open Assigned Work.
3. Review the shop name, city/town, areas, message, planned day, vehicle number, and instructions.
4. Use Start Work, Take Break, Resume Work, End Work, Add Proof Note, or Issue Reported.
5. End Work requires a short completion note.
6. Issue Reported requires a short issue note.

M6 does not request GPS permissions, background location, camera, or microphone permissions. M6 does not upload photo, video, or audio files. Proof Notes are text-only records.

Customer update records are created for release, start, break, resume, proof note, completion, and issue events. They are records for manual copy/share only. M6 does not send SMS, WhatsApp, or provider messages automatically.

## M7 Proof Upload And Customer Update Sharing

Apply the M7 migration after M0 through M6. It adds the private proof-photos storage bucket, photo proof upload records, driver upload slot RPCs, admin review RPCs, and manual Customer Update sharing fields.

Driver photo proof works from the Android driver app:

1. Enter mobile number and Work Code.
2. Open Assigned Work for a released assignment.
3. Start Work or Take Break for today's planned work day.
4. Choose Upload Photo Proof, enter Area or Place Name, choose a proof type, write What happened?, choose one JPG, PNG, or WebP photo up to 5 MB, and Submit Proof.
5. The driver app shows Proof Sent after the private storage upload is completed.

Admin proof review works from /admin:

1. Open Ad Works and select an Ad Work.
2. Review Proof Uploads and secure photo previews.
3. Save an admin review note and mark proof as Approved, Rejected, or Needs More Info.
4. Copy Customer Update messages and mark them shared by phone call, manual WhatsApp, manual SMS, in person, or other manual method.

M7 uses Android photo library access for selecting proof photos. It does not request GPS permissions, background location, camera, microphone, maps, tracking sessions, customer live links, reports, payments, provider auto-send, customer app, iOS app, or PWA.

## M8 Final Proof Summary And Campaign Closure

Apply the M8 migration after M0 through M7. It adds admin-only closure fields, admin-only Final Proof Summary records, closure RPCs, manual final summary share tracking, and Ready to Close dashboard cards.

Admin closure works from /admin:

1. Open Ad Works and select a completed Ad Work.
2. Review day-wise execution status, completion notes, issue notes, approved proof uploads, and Customer Update records.
3. Confirm Final Proof Summary reviewed and Customer Update messages reviewed.
4. If proof is not required by the customer, mark Proof not required by customer.
5. Choose Mark Ready for Closure to create or refresh the admin-only Final Proof Summary.
6. Choose Close Ad Work when checks pass, or choose a Closure Reason when partial work, rejected proof, unresolved issue, or unshared updates must be accepted manually.
7. Copy Final Summary, open the print-friendly summary view, or use browser print/save as PDF manually.
8. Mark Final Summary as Shared using Manual WhatsApp, Manual SMS, Phone Call, Printed Copy, In Person, or Other.

The Final Proof Summary shows customer details, Ad Work details, assigned driver and vehicle, Mic System status, day-wise execution, approved proof notes/photos, Customer Update sharing status, closure status, Closure Note, closed time, and Customer Accepted status. Rejected or waiting proof is not shown as customer-approved proof; it remains an internal warning.

M8 does not use GPS, maps, route tracking, background location, customer live tracking links, paid PDF generation, automatic email, WhatsApp/SMS provider sending, payments, customer app, iOS app, or PWA. Proof photos remain private in the proof-photos bucket. Admin previews use short-lived signed URLs only.

## M9 Mobile GPS Tracking Foundation

Apply the M9 migration after M0 through M8. It adds admin-controlled Phone Location Proof settings, admin-only tracking session and location point access, and driver RPCs for foreground phone location proof.

Admin Phone Location Proof works from /admin:

1. Open Ad Works and select a Ready for Execution or released Ad Work.
2. Use Phone Location Proof to mark Location Proof Required and add a short note for the driver.
3. Review Location Health, point count, quality, last update time, and permission warnings.
4. Stop Phone Location Proof manually if access must be stopped.

Driver Phone Location Proof works from the Android driver app:

1. Enter mobile number and Work Code.
2. Open Assigned Work and Start Work for today's planned work day.
3. Read the location notice and allow Location Proof for the assigned work.
4. Choose Start Location Proof. The app requests foreground location permission only at that point.
5. Location updates are saved while the assigned work day is Running.
6. Take Break, End Work, admin stop, revoked access, or closure stops Phone Location Proof.

M9 does not add background location, maps, route display, GPS device ingestion, customer live tracking links, reports, payments, provider auto-send, customer app, iOS app, or PWA. Phone location proof records are admin-only. customer_live_enabled and live_tracking_enabled remain false.

## M10 Mobile GPS Reliability And Offline Buffer

Apply the M10 migration after M0 through M9. It adds Phone Location Proof reliability fields, a client idempotency key on location points, and a driver sync RPC for buffered foreground location points.

Driver reliability works from the Android driver app:

1. Start assigned work and choose Start Location Proof with foreground permission.
2. Each foreground location capture receives a local client point id before upload.
3. If the phone cannot reach Supabase after capture, the point is saved in AsyncStorage with its assigned work, day, assignment, driver, vehicle, and tracking session ids.
4. The app retries sync while Location Proof is running and also provides Sync Now.
5. Accepted client point ids are removed from the local buffer, and repeated failed attempts are shown as Sync Failed.

Admin tracking health works from /admin:

1. Open an Ad Work and review Phone Location Proof.
2. Admins can see Health, unsynced point count, last phone capture, last received location, last sync, and sync attempt time.
3. Admin warnings show permission missing, no recent update, sync pending, or sync failed states.
4. Tracking sessions and location points remain admin-only through RLS. Driver sync access still validates mobile number, Work Code, released assignment, assigned driver, assigned vehicle, and the active or just-completed work window.

M10 remains foreground-only. It does not add background location, route maps, GPS device ingestion, customer live tracking links, reports, payments, provider auto-send, customer app, iOS app, or PWA.

## M11 Admin Tracking Review Without Maps

Apply the M11 migration after M0 through M10. It adds admin-only Location Proof Review records, an explicit admin-check review RPC, and safe final summary text for Phone Location Proof review state.

Admin tracking review works from /admin:

1. Open Ad Works and select an Ad Work with Phone Location Proof.
2. Review Mobile Location Proof Required, session status, first and last location received, point counts, sync/offline evidence, quality, and warnings.
3. Review day-wise tracking rows for date, day status, planned start/end, session status, first point, last point, point count, offline sync status, warning count, and review status.
4. Review warning labels for No Location Points, Late First Location, Long Gap, Stopped Early, Permission Missing, Sync Failed, and Points After Work End.
5. Save Location Proof Review status and note, or use Mark as Reviewed and Needs Follow-up shortcuts.
6. Open technical location values only when needed. Latitude and longitude are hidden by default.

Dashboard cards show Location Proof Waiting Review, Needs Follow-up, Ad Works with No Location Points, Ad Works with Offline Sync, and Location Proof Reviewed Today.

Final Proof Summary uses safe text only: Phone Location Proof reviewed by admin, needs follow-up, not required, or not available. M11 does not claim route verification, map verification, GPS area verification, distance certification, or customer live tracking.

M11 remains admin-only and no-map. It does not add background location, Google Maps, route maps, GPS device ingestion, public location access, customer live tracking links, reports, payments, provider auto-send, customer app, iOS app, or PWA.

## M12 Location Proof In Final Summary

Apply the M12 migration after M0 through M11. It extends the admin-only Final Proof Summary with a customer-safe Phone Location Proof section based on M11 review data.

Admin final summary location proof works from /admin:

1. Complete Location Proof Review first when phone location proof is required.
2. Open Final Proof Summary for the Ad Work.
3. Review Phone Location Proof Status, Location Proof Required, Location Proof Active During Work, first and last received time, Offline Location Sync, Points Received, and Review.
4. Choose Include Phone Location Proof in customer summary only when the review state is ready for customer wording.
5. Add a Customer-safe location proof note and confirm the wording before saving.
6. Use Mark Ready for Closure or Close Ad Work to refresh the summary.
7. Copy or print the final summary manually. M12 does not create public links or provider sends.

Customer summary wording is limited to Phone Location Proof Status, Location Proof Required, Location Proof Active During Work, First Location Received, Last Location Received, Offline Location Sync, and Team Review Note. It does not expose latitude, longitude, accuracy, raw location points, tracking session ids, internal review notes, storage paths, route drawings, maps, distance billing, or public live tracking.

Closure warnings include Phone Location Proof is not reviewed, No phone location updates were received, and Some location updates need follow-up. Closing with location warnings requires a Closure Reason. A customer-safe Phone Location Proof note can explain the customer wording, but it does not replace the Closure Reason.

M12 remains admin-only and no-map. It does not add background location, Google Maps, route maps, GPS device ingestion, public location access, customer live tracking links, reports, payments, provider auto-send, customer app, iOS app, or PWA.

## M13 Pilot Readiness And Deployment Preparation

M13 prepares the M0 through M12 workflow for a controlled pilot in Ongole and Addanki. It adds pilot documentation, deployment preparation guidance, driver consent wording, customer communication wording, and a shared environment readiness helper. M13 does not add a Supabase migration or new app behavior.

Pilot readiness docs:

- docs/pilot/m13-pilot-readiness-and-deployment-preparation.md
- docs/deployment/deployment-preparation.md
- docs/pilot/m13-pilot-smoke-test-checklist.md
- docs/pilot/m13-pilot-operations-runbook.md
- docs/pilot/m13-driver-consent-text.md
- docs/pilot/m13-customer-communication-text.md

The pilot readiness guide keeps Phone Location Proof as admin-reviewed supporting evidence only. It does not expose raw coordinates, public location links, route drawings, distance billing, automatic provider messages, or customer live tracking.

## M14 Controlled Pilot Dry Run

M14 documents how to perform a controlled dry run with fake Ongole/Addanki data only. It validates the existing M0 through M13 product flow without adding new product behavior, migrations, customer-facing links, maps, payments, provider messaging, customer app, iOS app, or PWA.

Dry-run docs:

- docs/pilot/m14-controlled-pilot-dry-run.md
- docs/pilot/m14-end-to-end-dry-run-checklist.md
- docs/pilot/m14-dry-run-results-template.md
- docs/pilot/m14-dry-run-blockers-and-limitations.md
- docs/pilot/m14-local-fake-data-guide.md
- docs/pilot/m14-go-no-go-checklist.md

Use the dry-run checklist with fake data, then record actual results in the results template. Real Android permission behavior, foreground Phone Location Proof start/stop behavior, proof photo storage privacy in the target Supabase project, and offline sync behavior must be tested manually before a real pilot. Do not record real customer data, driver data, Work Codes, proof file paths, or real GPS traces in dry-run docs.

## M15 Real Device Pilot Setup And Deployment

M15 prepares the existing M0 through M14 workflow for real-device pilot setup. It adds setup docs, target Supabase checklist, deployment runbook, real Android checklist, pilot operator checklist, evidence template, safer environment readiness statuses, and a local `pnpm check:pilot-env` command. M15 does not deploy automatically and does not add new product behavior.

M15 docs:

- docs/pilot/m15-real-device-pilot-setup.md
- docs/deployment/m15-deployment-runbook.md
- docs/pilot/m15-real-android-testing-checklist.md
- docs/deployment/m15-supabase-target-setup-checklist.md
- docs/pilot/m15-pilot-operator-checklist.md
- docs/pilot/m15-real-device-evidence-template.md

Before a real customer pilot, AP should verify target Supabase setup, proof photo bucket privacy, admin user setup, driver app environment values, web/admin environment values, real Android foreground location behavior, photo proof upload, offline buffer and Sync Now, and customer-safe Final Proof Summary wording. Real evidence references must stay outside this repository.

## M16 Real Device Pilot Execution Evidence

M16 records the real-device pilot execution evidence outcome. The evidence document is at `docs/pilot/m16-real-device-pilot-execution-evidence.md`.

M16 result: blocked. Real-device pilot execution was not completed because required environment/device was unavailable. No real customer pilot should start until the physical Android device, target Supabase project, admin user, private proof storage, deployed web/admin environment, and driver app installation are available and the M16 evidence run is repeated.

M16 does not add product behavior, Google Maps, customer live tracking links, GPS device ingestion, payments, provider integrations, customer app, iOS app, or PWA.

## Run Driver

    pnpm dev:driver

The driver app is Expo React Native and Android-first. M9 requests foreground phone location permission only after the driver opens assigned work, starts work, reads the Location Proof notice, and chooses Start Location Proof. M10 buffers captured location points locally when sync fails and retries them while foreground Location Proof is active. M11 adds admin review without maps and keeps technical coordinates hidden by default. M12 adds customer-safe final summary wording without exposing raw location values. M13 adds pilot readiness docs and deployment guidance without changing driver app behavior. M14 adds dry-run documentation and requires real Android device testing before a real pilot. M15 adds real-device setup and deployment preparation docs plus a safe environment check. M16 records a blocked real-device pilot execution evidence outcome because required device/environment access was unavailable. It does not request background location. M7 requests Android photo library access only for selecting photo proof uploads.

## Verify

    pnpm lint
    pnpm typecheck
    pnpm test
    pnpm build
    pnpm check:pilot-env

## Supabase Migration Note

Migrations are in supabase/migrations:

- 20260630000000_m0_foundation.sql creates baseline tables, RLS, privacy-safe defaults, and Ongole/Addanki seed areas.
- 20260630010000_m1_public_enquiries.sql adds public enquiry submission fields and anonymous insert-only access.
- 20260630020000_m2_admin_lead_management.sql adds admin lead fields, admin-only enquiry select/update policies, user profile role checks, and simple audit logging.
- 20260630030000_m3_campaign_planning_scheduling.sql adds admin-only ad work planning, day-wise planned schedules, customer linking from enquiries, and duplicate prevention.
- 20260630040000_m4_driver_vehicle_onboarding.sql adds public insert-only driver applications, admin-only driver and vehicle onboarding management, and approval linking.
- 20260630050000_m5_driver_vehicle_assignment.sql adds admin-only Ad Work assignment records, assignment statuses, and readiness checks.
- 20260630060000_m6_ad_work_execution_without_gps.sql adds admin release, Work Code access, day-wise execution status, text-only Proof Notes, and customer update records.
- 20260701070000_m7_proof_upload_customer_update_sharing.sql adds private proof photo storage, driver upload slot RPCs, admin proof review, and manual Customer Update sharing fields.
- 20260701080000_m8_final_proof_summary_campaign_closure.sql adds admin-only Final Proof Summary records, closure statuses, closure RPCs, and manual final summary share tracking.
- 20260701090000_m9_mobile_gps_tracking_foundation.sql adds admin-controlled Phone Location Proof, foreground driver tracking RPCs, admin-only tracking session and location point access, and automatic stop rules.
- 20260701100000_m10_mobile_gps_reliability_offline_buffer.sql adds offline buffer sync metadata, location point client idempotency, driver sync RPCs, and admin tracking health warnings.
- 20260701110000_m11_admin_tracking_review_without_maps.sql adds admin-only Location Proof Review records, review RPCs, dashboard queues, and safe final summary Phone Location Proof wording.
- 20260701120000_m12_location_proof_in_final_summary.sql adds admin-confirmed, customer-safe Phone Location Proof fields to Final Proof Summary records, closure warnings, and safe summary RPC checks.
- M13 does not add a Supabase migration; it adds pilot readiness docs, deployment preparation docs, and a shared environment readiness helper.
- M14 does not add a Supabase migration; it adds controlled dry-run docs, fake data guidance, go/no-go checks, and guardrail tests.
- M15 does not add a Supabase migration; it adds real-device pilot setup docs, deployment runbook, Supabase target checklist, safe environment check, and guardrail tests.
- M16 does not add a Supabase migration; it adds an evidence document for the blocked real-device pilot execution run and guardrail tests.

M4 keeps customer_live_enabled and live_tracking_enabled false by default and does not add live tracking behavior.

M5 keeps customer_live_enabled and live_tracking_enabled false by default and does not add live tracking behavior.

M6 keeps customer_live_enabled and live_tracking_enabled false by default and does not add live tracking behavior.

M7 keeps customer_live_enabled and live_tracking_enabled false by default and does not add live tracking behavior.

M8 keeps customer_live_enabled and live_tracking_enabled false by default and does not add live tracking behavior.

M9 keeps customer_live_enabled and live_tracking_enabled false by default and does not add customer live tracking behavior.

M10 keeps customer_live_enabled and live_tracking_enabled false by default and does not add customer live tracking behavior.


M11 keeps customer_live_enabled and live_tracking_enabled false by default and does not add customer live tracking behavior.

M12 keeps customer_live_enabled and live_tracking_enabled false by default and does not add customer live tracking behavior.

M13 keeps customer_live_enabled and live_tracking_enabled false by default and does not add customer live tracking behavior.

M14 keeps customer_live_enabled and live_tracking_enabled false by default and does not add customer live tracking behavior.

M15 keeps customer_live_enabled and live_tracking_enabled false by default and does not add customer live tracking behavior.

M16 keeps customer_live_enabled and live_tracking_enabled false by default and does not add customer live tracking behavior.
