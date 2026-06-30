# Kootha / Prachar

Kootha / Prachar is a low-cost local mic advertisement proof platform. The repository currently includes M0 foundation, M1 public website and enquiries, and M2 admin lead management.

## Current Scope

- React + Vite public website at `/`.
- Public enquiry form with safe validation and Supabase insert-only submission.
- Admin lead management at `/admin` with Supabase Auth login.
- Admin enquiry list, filters, detail view, status updates, internal notes, follow-up date, package interest, and admin remark.
- Expo React Native Android-first driver placeholder.
- Shared product config, labels, statuses, and validation helpers.
- Supabase migrations with RLS enabled and privacy-safe defaults.

## What is intentionally not included in M2

- campaign creation or ad work creation,
- driver approval workflow,
- vehicle assignment,
- GPS tracking,
- background location,
- Google Maps,
- GPS device ingestion,
- customer live tracking links,
- reports,
- payments,
- notifications,
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

```bash
pnpm install
```

## Environment

Copy `.env.example` and fill local values outside Git. Keep committed files placeholder-only.

```bash
VITE_PRODUCT_NAME=Prachar
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=replace-with-public-anon-key

EXPO_PUBLIC_PRODUCT_NAME=Prachar
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=replace-with-public-anon-key
```

Only public anon keys belong in Vite or Expo environment values. Do not put privileged Supabase keys in browser or mobile environment variables.

## Run Web And Admin

```bash
pnpm dev:web
```

Routes:

- `/` public website and enquiry form
- `/admin` admin login and lead management

If `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is missing or still placeholder-only, the public enquiry form and admin login show safe not-configured messages instead of crashing.

## Admin Login Setup

M2 uses Supabase Auth for admin login. There is no public admin signup in the app.

1. Apply the Supabase migrations.
2. Create an admin user manually in Supabase Auth using your own email and password.
3. Mark that auth user as an admin in `user_profiles`.

Use placeholder values like this, replacing the email before running it in your own Supabase project:

```sql
insert into public.user_profiles (auth_user_id, display_name, role)
select id, 'Admin User', 'admin'
from auth.users
where email = 'admin@example.com'
on conflict (auth_user_id) do update
set display_name = excluded.display_name,
    role = 'admin';
```

Do not commit real admin email addresses or passwords.

## Run Driver

```bash
pnpm dev:driver
```

The driver app is Expo React Native and Android-first. It does not request GPS or background location permissions in the current milestone.

## Verify

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Supabase Migration Note

Migrations are in `supabase/migrations`:

- `20260630000000_m0_foundation.sql` creates baseline tables, RLS, privacy-safe defaults, and Ongole/Addanki seed areas.
- `20260630010000_m1_public_enquiries.sql` adds public enquiry submission fields and anonymous insert-only access.
- `20260630020000_m2_admin_lead_management.sql` adds admin lead fields, admin-only enquiry select/update policies, user profile role checks, and simple audit logging.

M2 keeps `customer_live_enabled = false` by default and does not add live tracking behavior.
