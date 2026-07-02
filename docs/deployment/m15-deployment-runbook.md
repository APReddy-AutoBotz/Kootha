# M15 Deployment Runbook

M15 deployment preparation is a manual runbook. Do not deploy automatically unless AP explicitly asks.

## Web/Admin Deployment Preparation

1. Confirm main is tagged through M14 and the M15 branch is reviewed.
2. Configure hosting project settings outside Git.
3. Add only browser-safe environment variables.
4. Run local verification before preview build.
5. Create a preview build only after local verification passes.
6. Review `/` and `/admin` in the preview build with fake data.
7. Create production-like build only after AP approves readiness.

## Driver App Setup For Real Android Testing

1. Configure Expo public environment values outside Git.
2. Install the driver app on a real Android phone.
3. Confirm the app opens with no placeholder configuration.
4. Run the real Android testing checklist with fake driver and fake work details.
5. Record evidence references outside this repository.

## Supabase Migration Application Order

Apply migrations in timestamp order:

1. M0 foundation.
2. M1 public enquiries.
3. M2 admin lead management.
4. M3 campaign planning and scheduling.
5. M4 driver and vehicle onboarding.
6. M5 driver and vehicle assignment.
7. M6 execution without GPS.
8. M7 proof upload and customer update sharing.
9. M8 final proof summary and campaign closure.
10. M9 mobile GPS tracking foundation.
11. M10 mobile GPS reliability and offline buffer.
12. M11 admin tracking review without maps.
13. M12 location proof in final summary.

M13, M14, and M15 do not add Supabase migrations.

## Storage Verification

- Confirm `proof-photos` exists.
- Confirm `proof-photos` is private.
- Confirm public users cannot list or read proof files.
- Confirm admin preview uses secure access.
- Confirm fake proof upload succeeds before pilot day.

## Admin User Setup

Use Supabase Auth and `user_profiles` with placeholders only. Do not commit real auth user ids, emails, or passwords.

Checklist:

- [ ] Admin Auth user exists.
- [ ] Matching `user_profiles` row has role `admin`.
- [ ] Admin can log in at `/admin`.
- [ ] Non-admin user cannot manage admin-only records.

## Required Environment Variables

Web/admin:

- `VITE_PRODUCT_NAME`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Driver app:

- `EXPO_PUBLIC_PRODUCT_NAME`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Only public anon keys belong in browser or Expo public values. Do not use service-role or privileged keys in these environments.

## Environment Readiness Check

Run locally:

    pnpm check:pilot-env

For preview or production-like checks, set `PILOT_ENV_MODE` outside Git to `preview` or `production`. The check prints safe statuses only. It does not print environment values and does not connect to remote services.

## Local Build Verification

Run:

    pnpm install --frozen-lockfile
    pnpm lint
    pnpm typecheck
    pnpm test
    pnpm build
    git diff --check
    git status --short

## Preview Build Verification

- [ ] Preview website opens.
- [ ] Public enquiry safe configured or not-configured state works.
- [ ] Admin login safe configured or not-configured state works.
- [ ] No real customer or driver data is entered.
- [ ] No screenshots with private values are committed.

## Production Readiness Checklist

- [ ] AP approves pilot setup.
- [ ] Target Supabase project is configured.
- [ ] Admin user is configured.
- [ ] Proof photo bucket privacy is verified.
- [ ] Real Android phone testing passes or has approved no-go notes.
- [ ] Final Proof Summary wording is manually checked.
- [ ] Support owner is assigned for pilot window.
- [ ] No real secrets, Work Codes, customer data, driver data, proof paths, or location traces are committed.