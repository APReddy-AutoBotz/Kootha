# M17 Web/Admin Preview Deployment Guide

This guide prepares the public website and admin app for a preview or production-like verification. M17 does not deploy automatically.

## Preview Deployment Preparation

1. Choose the deployment target outside this repository workflow.
2. Configure public web/admin environment variables in the deployment platform.
3. Build from the repository without adding real `.env` files to Git.
4. Record only safe evidence references in the M17 evidence template.

## Required Environment Variable Names

Web/admin:

- `VITE_PRODUCT_NAME`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Driver app, if tested against the same target:

- `EXPO_PUBLIC_PRODUCT_NAME`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

No privileged Supabase key belongs in browser or driver app environment variables.

## Build Command

```bash
pnpm install --frozen-lockfile
pnpm build
```

Use deployment-specific commands only after AP selects the platform. Do not commit generated build output unless the repository already tracks it.

## Preview Verification Checklist

- Public website opens.
- Enquiry form renders.
- Placeholder/missing env values show safe not-configured messaging.
- With real public env values configured outside Git, fake enquiry insert works.
- Admin login page opens.
- Admin login works for the manually created admin user.
- Admin dashboard loads without exposing private values.
- Ad Work, assignment, proof, tracking review, and final summary screens remain admin-only.

## Production-Like Readiness Checklist

- Target Supabase migrations applied through M12.
- `proof-photos` bucket verified private in the target project.
- Admin user created and role set.
- Public anon key only is used by web/admin.
- No service role or privileged key is present in frontend config.
- Customer live tracking remains unavailable.
- Phone Location Proof remains admin-reviewed supporting evidence only.
- Final summary makes no certified route, certified map, certified GPS coverage, or certified distance claim.

## Verify Public Website

Pass criteria:

- Home page loads.
- Enquiry form validates required fields.
- Submit with fake data creates an enquiry in the target project.
- Anonymous user cannot read submitted enquiries.

## Verify Admin Login

Pass criteria:

- Admin user can log in.
- Non-admin authenticated users cannot manage admin records.
- Admin user can open Enquiries, Ad Works, Drivers, Vehicles, proof review, tracking review, and final summary screens.

## Avoid Exposing Privileged Keys

- Do not configure privileged Supabase keys in Vite env variables.
- Do not add real `.env` files to Git.
- Do not paste deployment environment values into screenshots committed to Git.
- Do not print env values in readiness scripts.

## Safe Evidence To Collect

- Preview URL reference stored outside Git.
- Build pass/fail result.
- Public website pass/fail result.
- Fake enquiry insert result.
- Admin login result.
- Admin-only access result.
- Remaining blocker notes.

Do not commit real deployment URLs, real account emails, customer data, driver data, Work Codes, proof paths, raw logs, screenshots, or raw GPS coordinates.
