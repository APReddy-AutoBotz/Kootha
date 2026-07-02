# M13 Pilot Smoke Test Checklist

Use this checklist before a controlled pilot run. Run it with test data first, then repeat with the approved pilot customer only after AP approval.

## Setup

- Dependencies install with `pnpm install --frozen-lockfile`.
- `pnpm lint` passes.
- `pnpm typecheck` passes.
- `pnpm test` passes.
- `pnpm build` passes.
- `.env.example` remains placeholder-only.
- Real local environment files are not committed.

## Admin Smoke Test

- Admin can log in at `/admin`.
- Admin can see dashboard cards.
- Admin can create Ad Work from an enquiry.
- Duplicate Ad Work creation is blocked by opening the existing Ad Work.
- Admin can create one-day and multi-day plans.
- Admin can set areas, package, proof requirement, and customer update plan.
- Admin can review driver applications.
- Admin can approve or reject driver applications.
- Driver records and vehicle records are available to admin users.
- Admin can assign an approved driver and approved vehicle to Ad Work.
- Admin can mark the assignment Ready for Execution only after readiness checks.
- Admin can release Ad Work to the driver and generate a Work Code.

## Driver Smoke Test

- Driver registration form opens in the Android driver app.
- Driver can access assigned work only with matching mobile number and Work Code.
- Driver can Start Work, Take Break, Resume Work, and End Work.
- Driver can add a text proof note.
- Driver can upload a photo proof to the private proof bucket.
- Driver can read the Phone Location Proof consent text.
- Driver can start foreground Phone Location Proof only for active assigned work.
- Driver can use Sync Now when offline points are pending.
- Driver location proof stops after End Work.

## Proof And Closure Smoke Test

- Admin can review proof photos with secure preview links.
- Admin can mark proof Approved, Rejected, or Needs More Info.
- Admin can copy customer update text and mark it shared manually.
- Admin can review day-wise Location Proof without maps.
- Admin can keep technical coordinate values hidden by default.
- Admin can include customer-safe Phone Location Proof wording in the Final Proof Summary when allowed.
- Admin can prepare the Final Proof Summary.
- Admin can close Ad Work after closure warnings are resolved or accepted with a reason.
- Admin can copy or print the Final Proof Summary manually.

## Privacy Smoke Test

- Public users cannot list or read proof photos.
- Anonymous users cannot select, update, or delete tracking sessions.
- Anonymous users cannot select, update, or delete location points.
- Anonymous users cannot select, update, or delete Location Proof Review records.
- Customer summary text contains no raw coordinates.
- Customer communication contains no live driver tracking promise.

## Stop Conditions

Stop the pilot and escalate when:

- admin login fails,
- proof photos become public,
- driver access works with the wrong mobile number or Work Code,
- Phone Location Proof runs after work ends,
- Location Proof Review is visible to a non-admin user,
- customer-facing wording creates unsupported expectations.
