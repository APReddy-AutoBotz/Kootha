# Kootha / Prachar

M0 foundation for a low-cost local mic advertisement proof platform.

This milestone creates only the project foundation:

- public website placeholder,
- admin dashboard placeholder,
- Android-first driver app placeholder,
- shared product config, labels, statuses, and validation helpers,
- Supabase baseline schema and seed data.

## What is intentionally not included in M0

- live tracking,
- GPS permissions,
- background location,
- maps,
- GPS device ingestion,
- customer live tracking links,
- enquiry form submission,
- admin CRUD,
- driver approval workflow,
- reports,
- payments,
- notifications,
- WhatsApp/SMS integration.

## Requirements

- Node.js 20 or newer
- pnpm 9 or newer
- Supabase CLI only when applying migrations locally
- Expo tooling through the workspace dependencies

## Install

```bash
pnpm install
```

## Run Web

```bash
pnpm dev:web
```

The web app has:

- `/` public website placeholder
- `/admin` admin dashboard placeholder

## Run Driver

```bash
pnpm dev:driver
```

The driver app is Expo React Native and Android-first. M0 does not request GPS or background location permissions.

## Verify

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```


## Public Enquiry Form

M1 includes a public enquiry form. It submits to Supabase only when these values are configured:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

If they are left as placeholders, the website still builds and shows a safe not-configured message on submit.

## Supabase Migration Note

M0 includes a baseline migration and seed data:

- `supabase/migrations/20260630000000_m0_foundation.sql`
- `supabase/seed.sql`

Apply them with the Supabase CLI when a local or hosted project is configured. No real keys or secrets are committed.
