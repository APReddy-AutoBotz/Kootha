# M18 Supabase Env Preflight Check

This document records a safe local preflight for the real-device pilot setup. It does not add product features and does not include secrets, Supabase URLs, anon keys, service role keys, real customer data, real driver data, real phone numbers, real Work Codes, raw GPS coordinates, screenshots, or proof file paths.

## Date And Time

- Preflight recorded: 2026-07-04 14:19:14 +05:30.

## Repository

- Repo HEAD: `971b4ca3186914c612012877fabd872791e50210`.
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
| `git status --short` | passed with unrelated untracked folders | Existing `.playwright-cli/` and `output/` remain uncommitted. |
| `pnpm install --frozen-lockfile` | passed | Known non-interactive modules prompt was non-blocking. |
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
| Project linked in local CLI metadata | passed |
| Linked migration status query | passed |
| Remote migration count check | passed |
| `enquiries` table visible | passed |

AP reported that the project was linked and migrations were pushed before this rerun. Codex verified the linked project with a status-only SQL query and anon-key REST checks. The verification returned safe labels only. The Supabase CLI update notice was non-blocking.

Do not use or paste a service role key for frontend or driver app setup.

## Public Enquiry Policy Test

The anon-key REST test used fake data only and printed safe statuses only.

| Operation | Result | Notes |
| --- | --- | --- |
| Remote `enquiries` table visible | passed | Linked SQL status query confirmed the table exists. |
| Anonymous enquiry insert | passed | One fake enquiry insert succeeded with anon access. |
| Anonymous select/read | passed | Public read was blocked or returned no private records. |
| Anonymous update | passed | Public update was blocked or returned no updated records. |
| Anonymous delete | passed | Public delete was blocked or returned no deleted records. |

Result: passed for public insert-only enquiry behavior with fake data only.

## Proof Photos Bucket Result

| Check | Result | Notes |
| --- | --- | --- |
| Anonymous list of `proof-photos` objects | blocked | Public listing was not available through anon access. |
| Bucket exists | passed | Linked SQL status query confirmed the bucket exists. |
| Bucket private flag | passed | Linked SQL status query confirmed the private flag is set. |
| No public read/list policy | passed | Linked SQL status query did not find an unsafe public read/list policy. |

Result: passed for target storage bucket existence, private flag, and no public proof listing.

## Admin User Result

Admin Auth user verification was performed through a linked status-only SQL query and AP confirmation. No admin email, password, or identity value was printed. No service role key was requested or used.

Current result: passed because an admin profile with `role = 'admin'` was found by the status-only query. Admin login was verified by AP.

Manual AP action:

- Keep admin email, password, and account details outside Git.
- Use the admin account only through the target web/admin app.
- Continue real-device evidence with fake customer, driver, vehicle, and Ad Work data only.

## Remaining Manual Steps

1. Run the web/admin app against the target project.
2. Run the driver app on the Android phone.
3. Use fake data only for real-device pilot evidence.
4. Keep Work Codes, phone numbers, screenshots, proof paths, and raw coordinates outside Git.

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
