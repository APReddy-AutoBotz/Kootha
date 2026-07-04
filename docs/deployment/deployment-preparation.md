# Deployment Preparation

This document prepares the M0 through M13 Kootha MVP for a controlled pilot deployment. It is a readiness guide only and does not add hosting automation.

## Deployment Targets

- Web/admin: React + Vite app in `apps/web`.
- Driver app: Expo React Native Android app in `apps/driver`.
- Database and storage: Supabase project with migrations through M12.

## Required Environment Values

Keep all real values outside Git.

Web/admin:

- `VITE_PRODUCT_NAME`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Driver Android app:

- `EXPO_PUBLIC_PRODUCT_NAME`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Only public anon keys belong in these environments. Privileged Supabase keys must stay out of browser and driver app builds.

## Placeholder Rules

Committed examples may use:

- `https://your-project.supabase.co`
- `replace-with-public-anon-key`

Production-like deployments must not use placeholder values. Do not commit local `.env` files, admin passwords, personal mobile numbers, real Work Codes, or private Supabase credentials.

## Supabase Preparation

1. Create or choose the Supabase pilot project.
2. Apply migrations in timestamp order through `20260701120000_m12_location_proof_in_final_summary.sql`.
3. Confirm RLS is enabled on public tables touched by the MVP.
4. Confirm `proof-photos` is private.
5. Create an admin auth user manually.
6. Add or update the matching `user_profiles` row with role `admin`.
7. Confirm `customer_live_enabled` defaults to false.
8. Confirm `live_tracking_enabled` defaults to false.

M13 does not add a Supabase migration.

## Web/Admin Preparation

1. Install dependencies with `pnpm install --frozen-lockfile`.
2. Configure web/admin environment values outside Git.
3. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.
4. Open `/admin` and confirm admin login.
5. Confirm Enquiries, Ad Works, Driver Applications, Drivers, Vehicles, proof review, Location Proof Review, and Final Proof Summary views load for an admin user.

## Driver App Preparation

1. Configure Expo public environment values outside Git.
2. Run the Android-first driver app from the workspace command.
3. Confirm driver registration works with placeholder-free public values.
4. Confirm assigned work access validates mobile number and Work Code.
5. Confirm foreground Phone Location Proof asks for permission only after the driver chooses Start Location Proof.
6. Confirm location proof stops after break, end work, access revoke, or closure.

## Preview And Production Build Notes

- Use `pnpm build` as the preview and production web build check.
- Use placeholder-free web and driver public environment values before creating preview or production-like builds.
- Preview deployments should use pilot Supabase values outside Git and should not reuse local placeholder values.
- Production-like deployments require AP approval, a known pilot Supabase project, and a clean verification run.
- M13 does not add hosting automation; the pilot owner must record where the preview or production build is deployed.

## Deployment Checks

- No real secrets or API keys are committed.
- `.env.example` contains placeholders only.
- Browser and driver environments contain public anon keys only.
- Private proof photo files are not publicly listable or readable.
- Tracking sessions, location points, and Location Proof Review records are admin-only.
- Customer summaries do not include raw coordinates, route drawings, distance billing, public location links, or map playback.

## Rollback Preparation

- Keep the last known good Git tag for the deployed milestone.
- Keep Supabase migration history intact.
- If a pilot deployment fails, stop driver access by revoking Ad Work release and document the incident in admin notes.
- Do not expose internal proof photos or tracking data while investigating issues.

## Not Part Of This Deployment

- background location
- Google Maps
- route drawing
- public tracking page
- customer live tracking link
- GPS device ingestion
- distance billing
- payment gateway
- WhatsApp/SMS provider integration
- customer mobile app
- iOS app
- PWA
