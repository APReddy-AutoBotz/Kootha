# M18 Supabase Env Preflight Check

This document records a safe local preflight for the real-device pilot setup. It does not add product features and does not include secrets, Supabase URLs, anon keys, service role keys, real customer data, real driver data, real phone numbers, real Work Codes, raw GPS coordinates, screenshots, or proof file paths.

## Date And Time

- Preflight recorded: 2026-07-04 12:48:39 +05:30.

## Repository

- Repo HEAD: `90b366dbe5ea881eee46afc161232c90b464cb4f`.
- Branch for evidence: `milestone/m18-supabase-env-preflight-check`.

## Local Env Status

| Check | Result |
| --- | --- |
| `apps/web/.env.local` exists | passed |
| `apps/driver/.env.local` exists | passed |
| `VITE_SUPABASE_URL` | configured |
| `VITE_SUPABASE_ANON_KEY` | configured |
| `EXPO_PUBLIC_SUPABASE_URL` | configured |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | configured |
| Full env values printed | no |
| Env files committed | no |

Note: the repo lint guard intentionally blocks `.env.*` files anywhere in the working tree. For lint verification only, the ignored local env files were temporarily moved outside the repo and restored afterward.

## Local Verification

| Command | Result | Notes |
| --- | --- | --- |
| `git checkout main` | passed | Main was already available. |
| `git pull origin main` | passed | Main was up to date. |
| `git status --short` | passed with unrelated untracked folders | Existing `.playwright-cli/` and `output/` were present before this evidence branch. |
| `pnpm install --frozen-lockfile` | passed | Known non-interactive modules prompt and pnpm update notice were non-blocking. |
| `pnpm check:pilot-env` | passed with warnings | Repo-root command does not auto-load app-local `.env.local` files; direct env-file status check confirmed configured. |
| `pnpm check:pilot-readiness` | passed | Safe status output only. |
| `pnpm lint` | passed | Run after temporarily moving ignored local env files outside the repo. |
| `pnpm typecheck` | passed | No type errors. |
| `pnpm test` | passed | 19 test files, 189 tests. |
| `pnpm build` | passed | Web and driver build checks passed. |

## Supabase CLI And Migration Result

| Check | Result |
| --- | --- |
| Supabase CLI installed | passed |
| Supabase CLI version | configured |
| Project linked in local CLI metadata | missing |
| `supabase db push` run | blocked |

The project is not linked locally, so migrations were not pushed from Codex. AP must run these commands locally after confirming the intended project:

```bash
supabase login
supabase link --project-ref <PROJECT_REF>
supabase db push
```

Do not use or paste a service role key for frontend or driver app setup.

## Public Enquiry Policy Test

The anon-key REST test used fake data only and printed safe statuses only.

| Operation | Result | Notes |
| --- | --- | --- |
| Anonymous enquiry insert | failed | REST returned `404` with `PGRST205`. This indicates the `enquiries` table was not available through the target PostgREST schema at test time. |
| Anonymous select/read | blocked | Read access did not expose records during the blocked preflight. This does not fully validate policy until migrations are applied. |
| Anonymous update | blocked | Update was blocked during the preflight. This does not fully validate policy until migrations are applied. |
| Anonymous delete | blocked | Delete was blocked during the preflight. This does not fully validate policy until migrations are applied. |

Result: blocked until migrations are applied and the schema is visible in the target Supabase project.

## Proof Photos Bucket Result

| Check | Result | Notes |
| --- | --- | --- |
| Anonymous list of `proof-photos` objects | blocked | Public listing was not available through anon access. |
| Bucket exists | manual AP action |
| Bucket private flag | manual AP action |
| No public read/list policy | manual AP action |

Codex could not safely verify bucket existence or the private flag without linked Supabase/privileged dashboard access. AP must verify `proof-photos` bucket privacy in the Supabase dashboard after migrations are applied.

## Admin User Result

Admin Auth user verification was not performed from Codex. No service role key was requested or used.

Manual AP action:

- Create or verify the admin Auth user.
- Set or verify `public.user_profiles.role = 'admin'` for that user.
- Confirm admin login works from the web/admin app.

## Remaining Manual Steps

1. Run `supabase login`.
2. Run `supabase link --project-ref <PROJECT_REF>`.
3. Run `supabase db push`.
4. Confirm the `enquiries` table is visible through the target REST API.
5. Re-run the public enquiry insert/read/update/delete policy test.
6. Verify `proof-photos` bucket exists and is private in the Supabase dashboard.
7. Verify no public proof file read/list policy exists.
8. Create or verify the admin Auth user and `user_profiles.role = 'admin'`.
9. Run the web/admin app against the target project.
10. Run the driver app on the Android phone.
11. Use fake data only for real-device pilot evidence.

## Privacy And Security Confirmation

- No full env values were printed.
- No Supabase URL was written to this document.
- No anon key was written to this document.
- No service role key was requested, used, or written.
- No real customer or driver data was used.
- No real phone numbers were used.
- No real Work Codes were used.
- No raw GPS coordinates were used.
- No screenshots or proof file paths were committed.
- Local `.env.local` files remain ignored and uncommitted.
