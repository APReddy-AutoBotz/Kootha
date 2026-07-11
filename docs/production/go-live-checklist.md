# Kootha Open Launch Go-Live Checklist

## Source and Infrastructure

- [ ] Reviewed production commit is on clean `main` and tagged.
- [ ] Local, remote, and deployed migration histories match.
- [ ] Current Supabase public key works in web and APK environments.
- [ ] Netlify preview and production builds pass.
- [ ] Custom domain, DNS, HTTPS, canonical URL, sitemap, and robots URL are configured.
- [ ] Previous Netlify deploy rollback was tested.

## Security and Privacy

- [ ] Turnstile, payload limit, persistent rate limit, and intake kill switch pass.
- [ ] Anonymous direct enquiry insert/read/update/delete is blocked.
- [ ] Anonymous, non-admin, admin, and driver Work Code RLS tests pass.
- [ ] Two independent admins can log in; public Auth signup is disabled.
- [ ] Proof bucket is private and signed access is short-lived.
- [ ] Sentry test events contain no sensitive values.
- [ ] Retention periods and bilingual legal wording are approved.
- [ ] Daily backup and one isolated restore test pass.

## Product Validation

- [ ] Fake enquiry-to-closure flow passes on the Netlify preview.
- [ ] Public and admin pass keyboard, focus, contrast, text scaling, screen reader, and 320px-to-wide-desktop checks.
- [ ] Fluent Telugu reviewer approves public, legal, consent, and driver action copy.
- [ ] Private signed APK passes on at least two Android versions.
- [ ] Foreground permission, start/stop, denied permission, and Work Code revocation pass.
- [ ] Fake proof upload, network loss, restart recovery, offline buffer, and Sync Now pass.
- [ ] No background location permission exists.

## Launch

- [ ] AP is launch owner and named backup admin is available.
- [ ] Incident, support, rollback, and customer-contact procedures are understood.
- [ ] Driver APK remains private.
- [ ] `ENQUIRY_INTAKE_ENABLED=true` only after all prior gates pass.
- [ ] Daily launch review is scheduled for seven days.
