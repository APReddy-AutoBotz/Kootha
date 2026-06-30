# Technology Steering - Kootha / Prachar

## M0 Stack

- Website/Admin: React + Vite.
- Driver app: Expo React Native, Android-first.
- Shared logic: TypeScript package.
- Backend baseline: Supabase/Postgres migrations and seed data.
- Package manager: pnpm workspaces.

## Hard Rules

- Do not build a PWA.
- Do not build a customer mobile app in v1.
- Do not hardcode secrets in frontend.
- Do not expose GPS device ingest tokens.
- Do not collect driver location outside active work.
- Do not implement hidden audio recording.
- Keep customer live tracking disabled by default.

## Architecture Rules

- Keep product name configurable.
- Keep tracking logic separate from UI.
- Keep phone and device location sources behind a common interface in later milestones.
- Keep report generation deterministic and repeatable in later milestones.
- Keep statuses as enums.
- Add tests for core business rules.
- Use clear database constraints where possible.
- Use audit logs for important state changes.
