# M17 Blocker Remediation Evidence Template

Use this template only after AP runs remediation steps in the target environment. This file is a blank template and must not contain real evidence.

| Blocker | Remediation action performed | Environment/device | Expected result | Actual result | Pass/Fail | Evidence reference | Remaining issue | Owner | Retest needed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Physical Android device unavailable |  |  | Driver app runs on physical Android phone. |  |  |  |  |  |  |
| Real-device Expo build unavailable |  |  | Selected Expo/build path opens on phone. |  |  |  |  |  |  |
| Target Supabase environment unavailable |  |  | Target project is configured and migrations are applied. |  |  |  |  |  |  |
| Target admin user unavailable |  |  | Admin user can log in and has admin role. |  |  |  |  |  |  |
| Target `proof-photos` bucket not verified |  |  | Bucket is private and public users cannot read or list files. |  |  |  |  |  |  |
| Android permission test not performed |  |  | Foreground location permission appears only during assigned work flow. |  |  |  |  |  |  |
| Physical Android proof upload not tested |  |  | Fake proof photo uploads to private storage and admin can review it. |  |  |  |  |  |  |
| Physical Android offline sync not tested |  |  | Offline buffer and Sync Now work during active assigned work. |  |  |  |  |  |  |
| Web/admin preview unavailable |  |  | Public website and admin login work in preview or production-like environment. |  |  |  |  |  |  |

## Evidence Rules

- Use fake customer, driver, vehicle, and Ad Work data only.
- Store screenshots and raw logs outside Git.
- Do not write real Work Codes in this file.
- Do not write raw GPS coordinates in this file.
- Do not write proof photo storage paths in this file.
- Do not write phone numbers, account emails, device ids, Supabase URLs, anon keys, or privileged keys in this file.
- Do not mark a row pass unless the action was actually performed in the target environment.

## Completion Rule

M17 is complete when the remediation package is ready. It does not mean the blockers are fixed. M18 should retry or record the target setup evidence using this template after AP provides the required environment and device.
