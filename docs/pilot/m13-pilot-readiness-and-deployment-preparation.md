# M13 Pilot Readiness and Deployment Preparation

M13 prepares Kootha / Prachar for a controlled pilot in Ongole and Addanki. It does not add new product capabilities. The milestone turns the M0 through M12 workflow into a practical pilot checklist for admin users, drivers, and support.

## Pilot Goal

Run a small, controlled pilot where an admin can receive an enquiry, plan Ad Work, onboard a driver and vehicle, release work, collect proof, review Phone Location Proof, and close the Final Proof Summary.

Pilot capability chain:

Enquiry -> Admin lead -> Planned Ad Work -> Driver/Vehicle onboarding -> Assignment -> Work execution -> Photo proof -> Phone Location Proof -> Final Proof Summary.

## Pilot Locations

- Ongole
- Addanki

Use only known local areas for the first pilot. Add new areas after AP reviews operational readiness and driver availability.

## Pilot Roles

- Admin: handles enquiries, planning, assignment, release, proof review, Location Proof Review, closure, and customer communication.
- Driver: registers interest, receives Work Code manually, performs assigned work, uploads photo proof, and uses foreground Phone Location Proof when required.
- Customer: receives manual updates and a customer-safe Final Proof Summary.
- Support owner: handles driver access issues, proof upload issues, customer questions, and incident notes.

## Ready Before Pilot

- Supabase migrations through M12 are applied in order.
- Admin user is created manually and marked as admin in `user_profiles`.
- Web/admin environment values are configured outside Git.
- Driver app public environment values are configured outside Git.
- `proof-photos` storage bucket is private.
- `customer_live_enabled` defaults to false.
- `live_tracking_enabled` defaults to false.
- Admin has one test enquiry, one approved driver, and one approved vehicle available.
- AP has approved the pilot town, driver, vehicle, and customer communication wording.

## Pilot Workflow

1. Admin records or receives a public enquiry.
2. Admin creates Ad Work from the enquiry.
3. Admin confirms planned dates, areas, package, proof requirement, and customer update plan.
4. Driver submits registration interest from the Android driver app.
5. Admin approves the driver and vehicle records.
6. Admin assigns approved driver and approved vehicle to the Ad Work.
7. Admin releases the Ad Work and manually shares the Work Code with the driver.
8. Driver starts work, takes breaks as needed, resumes, ends work, and adds notes.
9. Driver uploads photo proof from the Android app.
10. Driver starts foreground Phone Location Proof only after consent and only during active assigned work when required.
11. Admin reviews proof photos, customer update records, and Location Proof Review.
12. Admin prepares and closes the Final Proof Summary.
13. Admin manually shares the final summary by copy, print, phone call, manual WhatsApp, manual SMS, in person, or other manual method.

## Privacy Boundary

- Phone Location Proof is admin-reviewed supporting evidence.
- Customers do not receive raw latitude, longitude, tracking sessions, location points, internal review notes, or storage paths.
- Technical coordinates are not part of the customer summary.
- Customer communication must not promise live driver watching, map playback, exact distance measurement, or automatic provider messages.
- Driver location collection remains foreground-only and tied to active assigned work.

## Not Implemented In M13

- background location
- Google Maps
- route drawing
- public tracking page
- customer live tracking link
- GPS device ingestion
- distance billing
- payments
- WhatsApp/SMS provider integration
- customer mobile app
- iOS app
- PWA

## Go / No-Go

Go only when:

- verification commands pass,
- environment values are configured outside Git,
- no privileged Supabase key is present in web or driver app environments,
- proof photo storage remains private,
- tracking and location review data remain admin-only,
- driver consent text is available to the pilot team,
- customer communication text is approved by AP,
- support escalation owner is assigned.

No-go when:

- public placeholder values are still used in a production-like environment,
- admin login or RLS checks are not verified,
- proof photo upload cannot be tested,
- Phone Location Proof cannot be stopped after work ends,
- customer-facing wording creates unsupported expectations.
