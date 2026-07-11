# Security, Privacy, Backup, and Incident Operations

## Owners

- Launch owner: AP.
- Backup admin: must be named and verified before launch.
- Only the launch owner or named backup may enable enquiry intake, retention deletion, or production deployment.

## Retention

Proposed defaults require AP/legal approval before `RETENTION_DELETION_ENABLED=true`:

- Rejected or unconverted enquiries: 180 days.
- Raw location points: 90 days after Ad Work closure.
- Proof photos and final summaries: 12 months after closure.
- Audit logs: 12 months.
- Operational records: 24 months unless a longer legal need is documented.

The scheduled function removes private storage objects before their proof database records. It records counts only. Operational-record deletion remains held until legal review defines dependency and statutory requirements.

## Monitoring

Use separate Sentry preview and production environments. Session replay is disabled. Breadcrumbs and default PII are disabled. The client scrubbers remove phones, Work Codes, coordinates, proof paths, customer text, auth values, and Supabase-like values.

Review daily during launch week:

- Netlify function error and `429` rate.
- Enquiry availability and rejection rate.
- Supabase Auth failures and resource usage.
- Private storage growth and proof upload failures.
- Driver sync failures and pending offline points.
- Sentry events after confirming event payload scrubbing.

## Incident Levels

- Critical: private data exposure, privileged credential exposure, unauthorized admin access. Disable intake, revoke affected keys/sessions, preserve safe audit evidence, and roll back immediately.
- High: enquiry loss, proof privacy failure, persistent admin or driver outage. Disable the affected path and restore the previous known-good release.
- Medium: degraded workflow with a safe manual workaround. Record owner and remediation time.
- Low: cosmetic or copy issue without workflow or privacy impact.

Do not put private payloads into tickets, screenshots, chat, Sentry, or Git. Customer communication must describe impact and next action without exposing another person’s data.

## Backup Restore Gate

Create a fresh isolated Supabase target, restore the selected backup/export, verify schema version, row counts using safe aggregates, Auth/admin recovery, RLS, and private storage access, then destroy the isolated target. Record date, operator, backup reference, and pass/fail outside Git; do not record data values.
