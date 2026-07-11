# M16 Real Device Pilot Execution Evidence

> Current production-readiness update (12 July 2026): target Supabase migrations, admin access, and private proof storage are now configured and verified with safe status labels. The historical blocked result below remains accurate for the original M16 run. Physical Android permission, proof upload, offline buffer, Sync Now, and complete fake-data workflow evidence are still pending.


M16 records real-device pilot execution evidence or the blocker that prevented execution. This document is evidence-only and does not add product features.

## Objective

Record whether Kootha could complete the real-device pilot execution checks from M15 using a physical Android phone and a target Supabase project. Do not fake evidence and do not include private data.

## Date And Time Of Evidence Run

- Evidence run recorded: 2026-07-02 11:57:02 +05:30.
- Evidence authoring context: Codex workspace on the Kootha repository.

## Repository HEAD

- Repo HEAD reviewed for M16 evidence: `e71c1031b5a1e8f7dcdf05f4ceca0a5cd265f7b2`.
- M15 tag baseline: `kootha-prachar-m15-real-device-pilot-setup-deployment`.

## Execution Result

Real-device pilot execution was not completed because required environment/device was unavailable.

Result: Blocked.

This is not a failed product result. It means the M16 real-device evidence run could not be honestly completed from this workspace because the physical Android phone, deployed target environment, and target Supabase project access were not available to Codex.

## Device And Environment Used

- Device used: no physical Android device connected to this workspace.
- Driver app environment: not installed on a physical Android phone during this run.
- Web/admin environment: local repository context only; no deployed preview or production-like URL was used.
- Supabase environment: no target Supabase project URL, anon key, admin user, or storage configuration was provided to this workspace.
- Evidence storage: no screenshots or private evidence files were committed.

## Supabase Target Status

Status: Blocked.

- Target Supabase project was not configured in this workspace.
- Migrations were not applied to a target project during this evidence run.
- Admin user setup was not verified against a target project.
- `proof-photos` bucket privacy was not verified against a target project.
- Proof upload was not tested against target storage.

## Android Device Status

Status: Blocked.

- Physical Android phone was not connected or available.
- Expo real-device build was not installed during this run.
- Foreground location permission behavior was not tested on a physical Android phone.
- Offline buffer behavior was not tested on a physical Android phone.
- Sync Now behavior was not tested after a real network interruption.

## Web/Admin Status

Status: Not executed against deployed environment.

- Public website was not tested on a deployed preview or production-like URL.
- Admin login was not tested against a target Supabase project.
- Enquiry review, Ad Work creation, assignment, release, proof review, final summary, and closure were not tested against target data.

## Driver App Status

Status: Not executed on physical device.

- Driver app launch on Android was not verified.
- Assigned work access using mobile plus Work Code was not verified.
- Start Work, Take Break, Resume Work, and End Work were not verified on a phone.
- Photo proof upload was not verified against target storage.
- Phone Location Proof consent and foreground permission were not verified on a phone.

## Tests Actually Performed

The following M16 evidence checks were performed safely in the repository context:

| Area | Check | Result | Notes |
| --- | --- | --- | --- |
| Evidence integrity | Confirm no real-device result is invented | Pass | This document records a blocked outcome. |
| Privacy | Confirm no private screenshots are committed | Pass | No screenshots were added. |
| Privacy | Confirm no raw location values are committed | Pass | No coordinates are included. |
| Environment | Confirm no Supabase URL or key is committed | Pass | No target environment values are included. |
| Product scope | Confirm no future features are implemented | Pass | M16 is evidence-only. |

The M15 real-device checklist was not executed because the required physical device and target environment were unavailable.

## Checklist Status

| M15 real-device validation area | Status | Evidence result |
| --- | --- | --- |
| Public website opens | Not performed | Blocked by missing deployed environment. |
| Enquiry form works | Not performed | Blocked by missing target Supabase setup. |
| Admin login works | Not performed | Blocked by missing target admin user. |
| Admin can create and release Ad Work | Not performed | Blocked by missing target data and admin user. |
| Driver app opens on Android | Not performed | Blocked by missing physical Android device. |
| Driver can access work | Not performed | Blocked by missing target assignment and device. |
| Work execution actions | Not performed | Blocked by missing device and target work. |
| Photo proof upload | Not performed | Blocked by missing target storage setup. |
| Phone Location Proof consent | Not performed | Blocked by missing physical Android device. |
| Foreground location start/stop | Not performed | Blocked by missing physical Android device. |
| Offline buffer and Sync Now | Not performed | Blocked by missing physical Android device and network test. |
| Admin proof and location review | Not performed | Blocked by missing target data. |
| Final summary and closure | Not performed | Blocked by missing target data. |
| Security/privacy checks on target | Not performed | Blocked by missing target Supabase project. |

## Blockers

- Android device not connected.
- Expo real-device build not available in this workspace.
- Target Supabase environment not configured in this workspace.
- Admin user not created or provided for target verification.
- `proof-photos` bucket not verified in target Supabase.
- Location permission not tested on physical Android.
- Offline sync not tested on physical Android.
- Proof upload not tested against target Supabase storage.
- Deployed web/admin preview or production-like environment not provided.

## Risks

- Real Android permission prompts may behave differently than simulator or code review expectations.
- Network loss and Sync Now behavior remain unproven on a physical phone.
- Target Supabase RLS and Storage policies remain unproven until tested in the target project.
- Final Proof Summary wording still needs manual review against a real pilot flow before customer sharing.
- Customer pilot should not start while this evidence remains blocked.

## Fixes Needed Before Real Customer Pilot

- Provide a physical Android phone with the driver app installed.
- Configure target Supabase project with migrations through M12.
- Create and verify an admin user with role `admin`.
- Verify the private `proof-photos` bucket in the target project.
- Configure web/admin and driver public environment values outside Git.
- Run the M15 real Android testing checklist with fake data.
- Record private evidence references outside this repository.
- Re-run M16 evidence after blockers are removed.

## Security And Privacy Notes

- No real customer data is included.
- No real driver data is included.
- No real phone numbers are included.
- No real Work Codes are included.
- No raw GPS coordinates are included.
- No screenshots are included.
- No Supabase project URL, anon key, service role key, `.env` value, proof photo file path, or raw log is included.
- No customer live tracking is promised.
- No certified route, map, or distance proof is claimed.

## Final Recommendation

Do not start a real customer pilot yet.

Recommended next milestone: M17 Real Device Pilot Blocker Remediation.

M16 should be repeated after AP provides the physical Android device, target Supabase project, admin user, storage setup, and deployed web/admin environment needed for real-device evidence.