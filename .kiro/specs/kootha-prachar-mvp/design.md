# Kootha / Prachar MVP Design

## M0 Structure

```text
apps/web
  Public website placeholder
  Admin dashboard placeholder

apps/driver
  Expo React Native Android-first placeholder

packages/shared
  Product config
  Labels
  Status enums
  Validation helpers

supabase
  Baseline migration
  Seed data
```

## Technology

- React + Vite for web/admin placeholders.
- Expo React Native for driver Android placeholder.
- Supabase/Postgres schema baseline.
- TypeScript shared package for business vocabulary.

## Privacy Defaults

- `customer_live_enabled` defaults to false.
- Proof uploads are not customer-visible unless explicitly enabled.
- RLS is enabled on business tables.
- M0 has no location collection behavior.
- M0 has no GPS permissions or background location.

## Later Milestones

Future milestones implement public enquiry flow, admin management, driver onboarding, work scheduling, active phone location proof, reports, and optional premium live tracking. M0 only creates the foundation.
