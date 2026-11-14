# M30 Real Device Results, 14 Nov 2026

First run of [the M30 real device test sheet](m30-real-device-test-sheet.md). Fake data only. No Work Codes, coordinates, keys or real phone numbers are recorded here.

## Setup

| Item | Value |
| --- | --- |
| Phone | OnePlus CPH2447, Android 16, over USB |
| Build | Local release APK (arm64), signed with the debug key, built as in [the driver build guide](../deployment/m17-driver-app-real-device-build-guide.md) |
| Database | Hosted Kootha project (ap-south-1), 87 migrations, matching `supabase/migrations` |
| Admin | Local web admin (`pnpm dev:web`) against the hosted project. The Netlify preview could not be used: it is built against the old Supabase project. |
| Driven by | Claude over adb, with AP present |

## Before the phone

| # | Step | Done |
| --- | --- | --- |
| 1 | Hosted project active, migrations match | Yes |
| 2 | Admin login marked `admin` | Yes, after a fix: the only admin profile pointed at a deleted login. It was re-linked to AP's login. |
| 3 | `proof-photos` bucket private | Yes |
| 4 | Fake driver and vehicle approved | Yes |
| 5 | Fake Ad Work for today, Ready for Execution, Location Proof Required | Yes, but its package was "Not sure", which blocks release (finding 1). Set to Basic in the database. |
| 6 | Driver app has hosted URL and public anon key only | Yes. No service-role text in the bundle. `EXPO_PUBLIC_ADMIN_PHONE` was missing. |
| 7 | USB debugging on, app installed | Yes |

## On the phone

| # | Action | Result | Note |
| --- | --- | --- | --- |
| 1 | Open with no network | Pass | No crash. Opening work offline shows the raw text "Network request failed". |
| 2 | Driver registration | Pass | One application in admin, even after a failed offline attempt first. After submit the form clears but stays scrolled mid-page, so "Application Sent" is easy to miss. |
| 3 | Release to Driver | Pass | 10-character code shown. |
| 4 | Wrong Work Code | Pass | Refused. |
| 5 | Correct code, lower case, dash in the middle | Pass | Date and time show raw, e.g. `2026-11-14 09:00:00 21:00:00`. |
| 6 | Start Work | Pass | Day Running on the server. |
| 7 | Start Location Proof prompt | Pass | Prompt appears only now; offers While using the app, Only this time, Don't allow. |
| 8 | Deny the prompt | Blocked | The tester's tap granted instead of denying, and this phone refuses permission changes over adb. Retest on the next run with a person tapping Don't allow. |
| 9 | Allow, start again, points reach admin | Pass | About one point a minute; admin shows Running. |
| 10 | Airplane mode three minutes | Pass on retry | First attempt: no points at all for four minutes and no message (finding 2). Second attempt: "4 waiting to sync". |
| 11 | Airplane off, Sync Now | Pass | 5 pending sent; server count rose by exactly 5, no duplicates. |
| 12 | Take Break | Pass | Day On Break, session Paused. |
| 13 | Resume, start Location Proof again | Pass | Capture continues. |
| 14 | Upload Photo Proof | Pass | Stored at original size. A note is required but the error names it "What happened?". The app ends on "Assigned Work opened." instead of "Proof Sent". |
| 15 | Admin proof preview | Pass | Actual image shown through a signed link. |
| 16 | Force-stop and reopen | Pass | After entering the code again, state unchanged and capture resumes by itself. Buffered points were not tested because none were pending. |
| 17 | Screen locked five minutes | As expected | No points while locked. |
| 18 | Revoke Work Code | Pass | App lost access on its next action; Location Proof stopped on the server. |
| 19 | New code, End Work with note | Pass | Old code refused, new code works, day Completed, Location Proof stopped. |
| 20 | Android permissions | Pass | Foreground only, no background location permission. |

## Findings

Fix before launch:

1. An Ad Work whose package is "Not sure" cannot be released, and no Ad Work screen lets the admin change the package. Only the enquiry form has it.
2. When the phone cannot get a location fix during automatic capture, the error is dropped silently: nothing is saved, nothing is buffered, and the driver is not told. With network location gone (airplane mode, indoors) this lost four minutes of points. The capture uses Balanced accuracy, which leans on network location.
3. The Netlify preview is built against the old Supabase project, so admin login there fails.
4. Points synced from the offline buffer are stored with `offline_synced = false`, while admin showed "Offline Points Synced: 4" when nothing had been offline.
5. The dashboard's "Proof to review" count showed 0 while a photo was waiting review.
6. The driver build had no `EXPO_PUBLIC_ADMIN_PHONE`, so "Call Kootha admin" says the number is not configured.

Smaller fixes:

- Show a plain no-internet message instead of "Network request failed".
- Scroll to the confirmation after registration.
- Format the work date and time for people.
- Use the field's own label in the proof-note error, and show "Proof Sent" after an upload.
- The admin execution timeline did not reflect Start Work until the page was reloaded.

## Fixed after the run

- Finding 1: the Ad Work form has a Package field.
- Finding 2: capture uses GPS (High accuracy) with a 30-second limit, and a missing fix always shows "Could not get this phone's location" until the next point is saved.
- Finding 4: migration `20261114120000_m30_offline_synced_location_points.sql` sets `offline_synced` on points synced from the buffer, and admin counts that flag. The flow check asserts it.
- Finding 5: the dashboard counts work with any photo waiting review.
- Smaller fixes: plain no-internet message, scroll to the registration confirmation, readable date and time, "Proof note is required" wording, and "Proof Sent" stays after an upload.

Also done after the run: finding 3 (Netlify rebuilt from `main` with the current project's URL and publishable key; admin login works there), finding 6 (`EXPO_PUBLIC_ADMIN_PHONE` set for the driver build), and the new migration applied to the hosted project with the ledger matching the repo.

## Outcome

| Field | Value |
| --- | --- |
| Date | 14 Nov 2026 |
| Android version | 16 |
| Build type | Release APK (local, debug-signed) |
| Rows passed | 17 (1–7, 9–16, 18–20); row 10 on the second attempt |
| Rows failed | None on final attempt; row 10 failed once |
| Blocked rows and reason | 8: the deny tap granted instead, and adb cannot reset the permission on this phone |
| Decision | Fix and retest |

## Retest, same evening

A fresh fake job ("Fake phone retest job"), released from the Netlify admin page, on a new APK built from `main` after PR #50 with the admin phone set.

| # | Result | Note |
| --- | --- | --- |
| 1 | Pass | Offline shows "No internet connection. Check mobile data or Wi-Fi and try again." "Call Kootha admin" opens a phone app with the number. |
| 2 | Pass | "Application Sent" is in view right after submit; saved once. |
| 5 | Pass | Date shows "14 Nov 2026, 9:00 AM to 9:00 PM". |
| 6 | Pass | |
| 8 | Pass | AP set location to Ask every time and tapped Don't allow: app shows "Location Permission Needed"; server records `permission_missing`. |
| 9 | Pass | Allowed while using the app; GPS fixes arrive and points reach admin. |
| 10 | Fail, then pass after a further fix | First attempt: a request in flight when the network dropped never settled, holding the capture lock; no GPS request and nothing buffered for six minutes, until the network returned. Fixed (below) and rebuilt: offline, GPS fixes came every minute in about 25 s and the pending count rose 1, 2, 3, 4. |
| 11 | Pass | Sync Now sent all 4; exactly those 4 are `offline_synced` on the server; admin shows Offline Points Synced 4 and labels only those rows "Synced from offline buffer". |
| 14 | Pass | "Proof note is required. Write what was done." without a note; "Proof Sent." stays after upload. |
| Dashboard | Pass | Proof to review counted the photo while the job was still running. |
| 19 | Pass | End Work with note; Location Proof stopped. |

Further fix from the retest (branch `claude/m30-retest-capture-fixes`):

- `fetchDriverApi` now reads the response body inside the request time limit. Before, `fetch` was bounded but `response.json()` was not.
- A capture attempt that holds the lock for more than 2 minutes is treated as stuck, and the next tick starts a fresh attempt, so capture and buffering resume even if some other call never settles.

## Retest outcome

| Field | Value |
| --- | --- |
| Rows passed | All retested rows, including row 8; row 10 after the capture fix |
| Decision | Pass, once the capture fix is merged |
