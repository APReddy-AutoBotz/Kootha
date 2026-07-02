# M14 Dry Run Results Template

Use this table during the manual dry run. Keep all entries fake or high-level. Do not paste real Work Codes, real customer details, real driver details, real proof file paths, or real GPS coordinates.

| Step number | Area | Action | Expected result | Actual result | Pass/Fail | Issue found | Owner | Fix needed before pilot |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Public website | Open public website | Website opens |  |  |  |  |  |
| 2 | Public website | Submit fake enquiry | Enquiry is safely validated and submitted when configured |  |  |  |  |  |
| 3 | Admin | Review fake enquiry | Admin can review fake enquiry |  |  |  |  |  |
| 4 | Admin | Create Ad Work | Fake enquiry becomes planned Ad Work |  |  |  |  |  |
| 5 | Admin | Plan dates and areas | Planning fields save correctly |  |  |  |  |  |
| 6 | Driver app | Submit fake driver application | Application is created with fake details |  |  |  |  |  |
| 7 | Admin | Approve fake driver and vehicle | Driver and vehicle records are available |  |  |  |  |  |
| 8 | Admin | Assign driver and vehicle | Assignment saves and readiness warnings are visible |  |  |  |  |  |
| 9 | Admin | Release work | Work is released and Work Code is handled manually |  |  |  |  |  |
| 10 | Driver app | Access assigned work | Matching fake mobile and Work Code open assigned work |  |  |  |  |  |
| 11 | Driver app | Start, break, resume, end work | Execution status changes correctly |  |  |  |  |  |
| 12 | Driver app | Upload fake proof | Private proof upload record is created |  |  |  |  |  |
| 13 | Driver app | Start Phone Location Proof | Consent is shown first and foreground-only proof starts |  |  |  |  |  |
| 14 | Driver app | Stop Phone Location Proof | Location proof stops after break/end/stop |  |  |  |  |  |
| 15 | Admin | Review proof | Admin can approve, reject, or request more information |  |  |  |  |  |
| 16 | Admin | Review Location Proof | Admin can review status, points, warnings, and notes without maps |  |  |  |  |  |
| 17 | Admin | Prepare Final Proof Summary | Customer-safe summary is generated |  |  |  |  |  |
| 18 | Admin | Close Ad Work | Closure completes or records accepted dry-run issue reason |  |  |  |  |  |

## Result Rules

- Use `Pass`, `Fail`, `Blocked`, or `Pending Manual Device Test`.
- Use `Pending Manual Device Test` for real Android permission and foreground location behavior until tested on a real Android device.
- Do not mark Phone Location Proof as fully passed from Codex/container checks alone.
- Do not record exact coordinate values in this template.
