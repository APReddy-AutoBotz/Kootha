# Kootha / Prachar

Kootha / Prachar is a low-cost local mic advertisement proof platform. The repository currently includes M0 foundation, M1 public website and enquiries, M2 admin lead management, M3 campaign planning and scheduling, M4 driver and vehicle onboarding, and M5 driver and vehicle assignment to ad work.

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
- Shared product config, labels, statuses, planning helpers, onboarding validation helpers, and public form validation helpers.
- Supabase migrations with RLS enabled and privacy-safe defaults.

## What is intentionally not included in M5

- active work execution,
- start work/end work controls,
- GPS tracking,
- background location,
- map integration,
- GPS device location ingest,
- customer live tracking links,
- report generation,
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

## Run Driver

    pnpm dev:driver

The driver app is Expo React Native and Android-first. It does not request GPS or background location permissions in the current milestone.

## Verify

    pnpm lint
    pnpm typecheck
    pnpm test
    pnpm build

## Supabase Migration Note

Migrations are in supabase/migrations:

- 20260630000000_m0_foundation.sql creates baseline tables, RLS, privacy-safe defaults, and Ongole/Addanki seed areas.
- 20260630010000_m1_public_enquiries.sql adds public enquiry submission fields and anonymous insert-only access.
- 20260630020000_m2_admin_lead_management.sql adds admin lead fields, admin-only enquiry select/update policies, user profile role checks, and simple audit logging.
- 20260630030000_m3_campaign_planning_scheduling.sql adds admin-only ad work planning, day-wise planned schedules, customer linking from enquiries, and duplicate prevention.
- 20260630040000_m4_driver_vehicle_onboarding.sql adds public insert-only driver applications, admin-only driver and vehicle onboarding management, and approval linking.
- 20260630050000_m5_driver_vehicle_assignment.sql adds admin-only Ad Work assignment records, assignment statuses, and readiness checks.

M4 keeps customer_live_enabled and live_tracking_enabled false by default and does not add live tracking behavior.

M5 keeps customer_live_enabled and live_tracking_enabled false by default and does not add live tracking behavior.
