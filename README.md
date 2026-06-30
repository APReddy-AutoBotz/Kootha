# Kootha / Prachar

Kootha / Prachar is a low-cost local mic advertisement proof platform. The repository currently includes M0 foundation, M1 public website and enquiries, M2 admin lead management, and M3 campaign planning and scheduling.

## Current Scope

- React + Vite public website at /.
- Public enquiry form with safe validation and Supabase insert-only submission.
- Admin login at /admin with role checks.
- Admin Dashboard, Enquiries, and Ad Works navigation.
- Admin enquiry list, filters, detail updates, follow-up dates, package interest, and internal notes.
- M3 Ad Work planning from enquiries, including customer details, advertisement details, city/town, areas, package, schedule, proof plan, and customer update plan.
- One-day and multi-day day-wise planning rows.
- Expo React Native Android-first driver placeholder.
- Shared product config, labels, statuses, planning helpers, and validation helpers.
- Supabase migrations with RLS enabled and privacy-safe defaults.

## What is intentionally not included in M3

- driver assignment,
- vehicle assignment,
- active work execution,
- GPS tracking,
- background location,
- map integration,
- GPS device ingest,
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
- /admin admin login, dashboard, enquiries, and planned ad works

If VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing or still placeholder-only, the public enquiry form and admin login show safe not-configured messages instead of crashing.

## Admin Login Setup

M2 and M3 use Supabase Auth for admin login. There is no public admin signup in the app.

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

M3 keeps customer_live_enabled and live_tracking_enabled false by default and does not add live tracking behavior.
