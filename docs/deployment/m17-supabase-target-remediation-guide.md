# M17 Supabase Target Remediation Guide

This guide lists the manual target Supabase setup checks needed before retrying real-device pilot evidence. Use placeholders only in this repository.

## Create Or Select Target Project

1. AP creates or selects the target Supabase project outside Git.
2. Store project URL and public anon key in deployment and driver app environment settings outside Git.
3. Never place privileged keys in frontend, driver app, README, docs, or `.env.example`.

## Apply Migrations In Order

Apply migrations in timestamp order from `supabase/migrations`:

1. M0 foundation.
2. M1 public enquiries.
3. M2 admin lead management.
4. M3 campaign planning and scheduling.
5. M4 driver and vehicle onboarding.
6. M5 driver and vehicle assignment.
7. M6 ad work execution without GPS.
8. M7 proof upload and customer update sharing.
9. M8 final proof summary and campaign closure.
10. M9 mobile GPS tracking foundation.
11. M10 mobile GPS reliability and offline buffer.
12. M11 admin tracking review without maps.
13. M12 location proof in final summary.

M13 through M17 do not add migrations.

## Create Admin User

1. Create the admin account manually in Supabase Auth.
2. Insert or update the matching `public.user_profiles` row with role `admin`.
3. Use placeholder email values in docs only.
4. Do not commit admin email addresses, passwords, auth ids, or SQL output containing private values.

Example shape using placeholders:

```sql
insert into public.user_profiles (auth_user_id, display_name, role)
select id, 'Admin User', 'admin'
from auth.users
where email = 'admin@example.com'
on conflict (auth_user_id) do update
set display_name = excluded.display_name,
    role = 'admin';
```

Replace placeholder values only in the private target environment.

## Verify Public Enquiry Insert-Only

Pass criteria:

- Anonymous users can insert valid enquiries.
- Anonymous users cannot select, update, or delete enquiries.
- Admin users can review enquiries after login.

## Verify Admin-Only Tables

Confirm these remain admin-only through RLS and role checks:

- Customers.
- Ad Works and Ad Work days.
- Ad Work areas.
- Driver applications after insert.
- Drivers.
- Vehicles.
- Assignments.
- Execution proof notes.
- Customer updates.
- Proof uploads.
- Final proof summaries.
- Tracking sessions.
- Location points.
- Location proof reviews.

## Verify `proof-photos` Private Bucket

Pass criteria:

- Bucket exists.
- Bucket is private.
- Public users cannot list proof files.
- Public users cannot read proof files.
- Admin preview uses signed access only.
- Driver upload is limited by validated upload paths and Work Code access.

Fail criteria:

- Any public read/list policy exists for proof photos.
- Proof paths are exposed in public/customer-facing docs.
- A privileged key is used in browser or driver app code.

## Verify Tracking And Location Tables

Pass criteria:

- Tracking sessions are admin-only.
- Location points are admin-only.
- Location proof reviews are admin-only.
- Driver location RPCs validate mobile number, Work Code, released assignment, assigned driver, assigned vehicle, and active work window.
- `customer_live_enabled` defaults to false.
- `live_tracking_enabled` defaults to false.

## Verify Environment Variables

Web/admin public env names:

- `VITE_PRODUCT_NAME`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Driver app public env names:

- `EXPO_PUBLIC_PRODUCT_NAME`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Do not use privileged Supabase keys in Vite or Expo public environments.

## Evidence To Collect Safely

- Migration pass/fail result.
- Admin login pass/fail result.
- Public enquiry insert-only pass/fail result.
- Admin-only table access pass/fail result.
- Private proof bucket pass/fail result.
- Tracking/location RLS pass/fail result.
- Env readiness check result.

Keep raw logs, real URLs, anon keys, auth ids, account emails, proof paths, and screenshots outside Git.
