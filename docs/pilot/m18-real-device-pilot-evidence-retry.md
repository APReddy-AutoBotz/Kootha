# M18 Real Device Pilot Evidence Retry

M18 continues the blocked M16 real-device evidence run after AP provided the target Supabase setup and admin access. This document records only safe status labels and fake-data-only readiness results. It does not add product features and does not claim that a real customer pilot has passed.

## Date And Time

- Evidence retry recorded: 2026-07-04 15:08:29 +05:30.

## Result

Result: In progress.

Target environment readiness has passed. Physical Android execution evidence is still pending until AP runs the driver app on the phone with fake data only.

## Target Environment Checks

| Check | Result | Evidence source |
| --- | --- | --- |
| Target Supabase project linked | passed | Safe local CLI status. |
| Migrations applied | passed | Linked status-only SQL query. |
| `enquiries` table visible | passed | Linked status-only SQL query. |
| Anonymous public enquiry insert | passed | Anon-key REST test with fake data only. |
| Anonymous enquiry select/read | passed | Public read blocked or returned no private records. |
| Anonymous enquiry update | passed | Public update blocked or returned no updated records. |
| Anonymous enquiry delete | passed | Public delete blocked or returned no deleted records. |
| `proof-photos` bucket exists | passed | Linked status-only SQL query. |
| `proof-photos` bucket private | passed | Linked status-only SQL query and AP verification. |
| No public proof object list/read policy | passed | Linked status-only SQL query and anon list check. |
| Admin Auth user exists | passed | AP verification. |
| `public.user_profiles.role = 'admin'` | passed | Linked status-only SQL query and AP verification. |
| Admin login | passed | AP verification. |

## Real-Device Retry Matrix

| Test step | Result | Notes |
| --- | --- | --- |
| Physical Android phone available | ready | AP has the phone available for testing. |
| Driver app opened on physical Android | pending | Must be run by AP with local Expo or selected build path. |
| Fake driver registration or fake assigned work access | pending | Use fake data only. Do not commit mobile numbers or Work Codes. |
| Fake Ad Work released to driver | pending | Admin action required in the target web/admin app. |
| Start Work on phone | pending | Record pass/fail only, no screenshots in Git. |
| Photo proof upload from phone | pending | Use a fake proof photo. Do not record proof file paths. |
| Phone Location Proof consent | pending | Confirm foreground-only consent before start. |
| Foreground location start/stop | pending | Do not record raw coordinates. |
| Offline buffer and Sync Now | pending | Record pass/fail only. |
| Admin proof and Location Proof Review | pending | Use admin-only review screens. |
| Customer-safe Final Proof Summary | pending | Confirm the summary avoids route, map, GPS certification, or distance proof claims. |

## Remaining Manual Steps

1. Run the web/admin app against the target project.
2. Run the driver app on the Android phone using the selected Expo or build path.
3. Create fake customer, driver, vehicle, and Ad Work data only.
4. Release a fake assigned Ad Work to the fake driver and manually share the Work Code outside Git.
5. Run the M15 real Android checklist with fake data.
6. Record only pass/fail labels and private evidence references.
7. Keep screenshots, phone numbers, Work Codes, proof paths, raw logs, and raw coordinates outside the repository.

## Privacy And Security Confirmation

- No Supabase URL is included.
- No anon key is included.
- No service role key is requested, used, or included.
- No admin email or password is included.
- No real customer or driver data is included.
- No real phone numbers are included.
- No real Work Codes are included.
- No raw GPS coordinates are included.
- No proof file paths or screenshots are included.
- No customer live tracking is promised.
- No route proof, map proof, GPS certification, or distance certification claim is made.

## Scope Guardrail

M18 does not add Google Maps, route drawing, customer live tracking links, public GPS reports, GPS device ingestion, payments, WhatsApp/SMS provider integration, customer app, iOS app, or PWA.
