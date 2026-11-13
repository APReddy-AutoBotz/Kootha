# M30 Readiness Evidence

This maps each line of [the go-live checklist](go-live-checklist.md) to what has been verified by software and what still needs the owner, a phone or a hosted deploy. It does not tick the checklist; the launch owner does that.

"CI" means the checks that run on every pull request and on `main`: Quality and security, Hosted release readiness, End-to-end flow, and Browser check. They use a local database and fake data. They are not hosted or physical evidence.

## Source and infrastructure

| Checklist line | State | Evidence or what is missing |
| --- | --- | --- |
| Reviewed production commit is on clean `main` and tagged | Open | `main` is green. No release tag has been created. |
| Local, remote, and deployed migration histories match | Partly | The hosted database ledger matches `supabase/migrations` on `main` version for version. Nothing is deployed to Netlify yet. |
| Current Supabase public key works in web and APK environments | Open | The local settings hold the new project's public key. Not yet exercised from a built app. |
| Netlify preview and production builds pass | Open | The web build passes in CI. No Netlify deploy has run. |
| Custom domain, DNS, HTTPS, canonical URL, sitemap, and robots URL | Open | Owner. |
| Previous Netlify deploy rollback was tested | Open | Needs a Netlify deploy first. |

## Security and privacy

| Checklist line | State | Evidence or what is missing |
| --- | --- | --- |
| Turnstile, payload limit, persistent rate limit, and intake kill switch pass | Partly | The flow check proves the rate limiter blocks the third request in a window and refuses anonymous callers. Turnstile, the payload limit and the kill switch live in the Netlify function and need a deploy. |
| Anonymous direct enquiry insert/read/update/delete is blocked | Verified in CI | Flow check: anonymous insert and read are refused. |
| Anonymous, non-admin, admin, and driver Work Code RLS tests pass | Verified in CI | Flow check and database tests: anonymous and signed-in non-admin callers are refused on tables, admin functions and proof photos; wrong, empty and short Work Codes are refused. |
| Two independent admins can log in; public Auth signup is disabled | Open | Owner creates the logins and turns signup off in the hosted project. |
| Proof bucket is private and signed access is short-lived | Verified in CI and on the hosted database | The bucket is private on the hosted project. The flow check proves anonymous download is refused and the admin's signed link (300 seconds) returns the uploaded bytes. |
| Sentry test events contain no sensitive values | Open | Needs a Sentry project. |
| Retention periods and bilingual legal wording are approved | Open | Owner and Telugu reviewer. |
| Daily backup and one isolated restore test pass | Open | Needs the hosted project on a plan with backups, or a manual dump and restore. |

## Product validation

| Checklist line | State | Evidence or what is missing |
| --- | --- | --- |
| Fake enquiry-to-closure flow passes on the Netlify preview | Partly | The same flow passes in CI against a local database, for a driver job and a team-managed job. Not yet on a Netlify preview. |
| Public and admin pass keyboard, focus, contrast, text scaling, screen reader, and 320px-to-wide-desktop checks | Partly | The browser check covers 360px and 1366x768 for crashes, refused requests, sideways scrolling and cut-off controls. Keyboard, contrast, text scaling and screen reader checks are not automated. |
| Fluent Telugu reviewer approves public, legal, consent, and driver action copy | Open | Most of the home page body is still English in Telugu mode. |
| Private signed APK passes on at least two Android versions | Open | Needs phones. |
| Foreground permission, start/stop, denied permission, and Work Code revocation pass | Partly | Server behaviour is verified in CI. The phone behaviour is on the phone test sheet. |
| Fake proof upload, network loss, restart recovery, offline buffer, and Sync Now pass | Partly | Upload, retry and repeated sync are verified in CI at the API. Network loss and restart need a phone. |
| No background location permission exists | Verified in CI | The security scan fails the build if the driver app declares it. |

## Launch

All five launch lines are the owner's: launch owner and backup admin, incident and support procedures, private APK distribution, turning intake on last, and the seven-day daily review.

## Known limits carried into the pilot

- Location is captured only while the driver app is open on screen.
- The driver app does not remember the mobile number and Work Code after it is closed.
- There is no limit on wrong Work Code attempts. The code space is about 49 bits.
- Stopping Phone Location Proof after an admin has revoked a code is not checked against the Work Code.
- `create_ad_work_from_enquiry` falls back to the UTC date when an enquiry has no preferred start date.
