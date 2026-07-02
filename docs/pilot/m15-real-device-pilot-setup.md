# M15 Real Device Pilot Setup

M15 prepares Kootha / Prachar for a controlled real-device pilot setup. It does not start a real customer pilot and does not add product features.

## Pilot Setup Objective

Prepare one real Android phone, one target Supabase project, and one preview or production-like web/admin build so the team can verify the existing MVP flow before involving real customers.

No real customer pilot should start until all M15 checks pass and AP approves the go decision.

## Participants

- AP or pilot owner: approves setup, privacy wording, and go/no-go decision.
- Admin operator: uses `/admin`, monitors records, reviews proof, and closes test Ad Work.
- Driver tester: uses a real Android phone and fake driver details.
- Support observer: records setup issues and assigns owners.
- Customer reviewer: reviews only customer-safe summary wording with fake data.

## Required Devices

- One Android phone for the driver app real-device test.
- One laptop or desktop for web/admin setup and review.
- Stable internet connection plus a controlled poor-network test for offline buffer validation.
- A way to capture evidence references outside the repository, such as a private folder or issue tracker.

## Required Accounts

- Target Supabase project owner or admin access.
- Supabase Auth admin user for Kootha / Prachar admin login.
- GitHub access to this repository.
- Hosting provider access for preview and production-like web/admin builds.
- Expo or Android test setup access for installing the driver app on the real Android phone.

## Required Supabase Setup

- Apply migrations in order from M0 through M12.
- Confirm RLS remains enabled on public tables.
- Confirm public enquiry access is insert-only.
- Confirm admin-only planning, onboarding, assignment, execution, proof, tracking, review, and final summary records remain admin-only.
- Confirm `customer_live_enabled` defaults to false.
- Confirm `live_tracking_enabled` defaults to false.

## Required Proof Photo Storage Setup

- Confirm the `proof-photos` bucket exists in the target Supabase project.
- Confirm the bucket is private.
- Confirm public users cannot list or read proof objects.
- Confirm driver upload uses the released assignment path and admin preview uses safe access.
- Test upload with fake proof photos only.

## Required Admin User Setup

- Create an admin user manually in Supabase Auth.
- Add or update the matching `user_profiles` record with role `admin`.
- Do not commit admin email, password, auth user id, or project-specific identifiers.
- Confirm a non-admin authenticated user cannot manage admin-only records.

## Required Driver App Environment Setup

- Configure `EXPO_PUBLIC_PRODUCT_NAME` outside Git.
- Configure `EXPO_PUBLIC_SUPABASE_URL` outside Git.
- Configure `EXPO_PUBLIC_SUPABASE_ANON_KEY` outside Git.
- Use only the public anon key in Expo public values.
- Do not add service-role or privileged keys to the driver app environment.
- Install the driver app on a real Android phone before pilot day.

## Required Web/Admin Environment Setup

- Configure `VITE_PRODUCT_NAME` outside Git.
- Configure `VITE_SUPABASE_URL` outside Git.
- Configure `VITE_SUPABASE_ANON_KEY` outside Git.
- Use only the public anon key in browser environment values.
- Do not add service-role or privileged keys to the web/admin environment.
- Run local, preview, and production-like build checks before pilot day.

## Privacy And Consent Checks

- Driver sees Location Proof consent before phone location proof starts.
- Driver location starts only during active assigned work.
- Driver location stops after End Work, break, admin stop, revoked access, or closure.
- Driver photo proof is used only as work proof.
- Customers receive updates and final proof summary wording only.
- Customers do not receive live location access by default.
- Final Proof Summary must not include raw latitude, longitude, internal tracking ids, private storage paths, or unsupported proof claims.

## Must Test Before Real Customers

- Driver app opens on the real Android phone.
- Driver registration and assigned work access work with fake data.
- Work Code access validates fake mobile number and manually shared code.
- Start Work, Take Break, Resume Work, and End Work work on the phone.
- Photo proof upload works against the target Supabase project.
- Phone Location Proof permission appears only after assigned work consent.
- Phone Location Proof starts after Start Work and stops after End Work.
- Offline buffer and Sync Now are tested manually with network disabled and restored.
- Final Proof Summary is checked manually before sharing.
- All setup issues are recorded in the M15 evidence template.