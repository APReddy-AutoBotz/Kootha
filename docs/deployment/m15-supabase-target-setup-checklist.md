# M15 Supabase Target Setup Checklist

Use this checklist for the target Supabase project. Use placeholders in documentation and keep project-specific values outside Git.

## Project Setup

- [ ] Create or select target Supabase project.
- [ ] Confirm project owner access is available.
- [ ] Confirm local CLI or dashboard migration workflow is ready.
- [ ] Confirm no real credentials are written into repository files.

## Migration Setup

- [ ] Apply migrations in timestamp order from M0 through M12.
- [ ] Confirm M13, M14, and M15 add no database migrations.
- [ ] Confirm migrations complete without manual edits to committed SQL.
- [ ] Record only high-level result in evidence notes.

## RLS And Policy Checks

- [ ] Confirm RLS is enabled on public application tables.
- [ ] Confirm public enquiry policy is insert-only.
- [ ] Confirm planning tables are admin-only.
- [ ] Confirm onboarding records are admin-only except public driver application insert.
- [ ] Confirm assignment records are admin-only.
- [ ] Confirm execution, proof, customer update, closure, and final summary records are admin-only where required.
- [ ] Confirm tracking sessions are admin-only.
- [ ] Confirm location points are admin-only.
- [ ] Confirm Location Proof Review records are admin-only.
- [ ] Confirm no public location policy exists.

## Storage Checks

- [ ] Confirm `proof-photos` bucket exists.
- [ ] Confirm `proof-photos` bucket is private.
- [ ] Confirm public users cannot list proof objects.
- [ ] Confirm public users cannot read proof objects.
- [ ] Confirm admin preview uses safe access.
- [ ] Confirm upload size limits are acceptable for pilot photos.

## Admin User Setup

- [ ] Create admin user manually in Supabase Auth.
- [ ] Add or update matching `user_profiles` row with role `admin`.
- [ ] Confirm admin login works.
- [ ] Confirm authenticated non-admin user cannot manage admin-only records.
- [ ] Confirm anonymous user cannot read admin-only records.

## Environment Safety

- [ ] Web/admin uses only public anon key.
- [ ] Driver app uses only public anon key.
- [ ] No service-role or privileged key is used in frontend or driver app.
- [ ] `.env.example` remains placeholder-only.
- [ ] Real URLs and keys stay outside Git.

## Pilot Defaults

- [ ] `customer_live_enabled` default remains false.
- [ ] `live_tracking_enabled` default remains false.
- [ ] Customer live location access is not enabled by default.
- [ ] Phone Location Proof remains admin-reviewed supporting evidence only.