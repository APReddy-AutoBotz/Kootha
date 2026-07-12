# Kootha Production Deployment Runbook

## Release Contract

- Deploy only a reviewed commit from `main` with matching local and remote migration history.
- Use a Netlify deploy preview first. A generated Netlify URL is not the public launch URL.
- Use a private signed Android APK. Never commit APKs, keystores, credentials, or evidence containing private values.
- Public enquiry intake stays disabled until Turnstile, rate limiting, and the protected function pass verification.

## Netlify Environment

Configure values in the Netlify UI. Do not paste values into Git, build logs, PRs, or docs.

Public build values: `VITE_PRODUCT_NAME`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CONTACT_PHONE`, `VITE_CONTACT_PHONE_DISPLAY`, `VITE_TURNSTILE_SITE_KEY`, `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT`, and `VITE_APP_RELEASE`.

Server-only values: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TURNSTILE_SECRET_KEY`, `ENQUIRY_RATE_LIMIT_SALT`, `ENQUIRY_INTAKE_ENABLED`, and `RETENTION_DELETION_ENABLED`.

The two kill switches must remain `false` until their verification and approval gates pass. Server-only names must never use a `VITE_` or `EXPO_PUBLIC_` prefix.

## Supabase

1. Apply migrations in timestamp order and compare local/remote migration ledgers.
2. Confirm public Auth signup is disabled.
3. Confirm two separate admin Auth accounts map to `user_profiles.role = 'admin'`.
4. Confirm `proof-photos` is private and has no public read/list policy.
5. Confirm anonymous direct insert into `enquiries` is blocked after the protected gateway migration.
6. Run anonymous, non-admin, admin, and driver Work Code RLS tests.
7. Enable managed daily backups, or configure an encrypted export outside this repository.
8. Restore a backup into an isolated project and record only a safe pass/fail reference.

## Preview Then Production

1. Run the repository verification suite.
2. Run `npx netlify status`; authenticate and link the site if required.
3. Run `npx netlify deploy` for a preview.
4. Complete the fake enquiry-to-closure workflow and accessibility checks.
5. Configure the custom domain, DNS, HTTPS, canonical URL, sitemap URLs, and production environment.
6. Test rollback by redeploying the previous known-good deploy.
7. Run `npx netlify deploy --prod` only after every go-live gate passes.

## Android

Configure the public Supabase and scrubbed Sentry values through EAS secrets. Run `eas build --platform android --profile internal`, complete the physical-device matrix, then build the private production APK. Uninstall older Prachar/Kootha test packages when package identity conflicts occur.
