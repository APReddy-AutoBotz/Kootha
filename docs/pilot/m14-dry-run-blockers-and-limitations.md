# M14 Dry Run Blockers And Limitations

M14 is a controlled dry run guide. It does not prove a real customer pilot has succeeded.

## What Can Be Tested Locally

- Public website rendering.
- Public enquiry validation behavior.
- Admin route rendering and safe not-configured states.
- Shared helper tests.
- Documentation guardrails.
- Unit and integration-style Vitest checks.
- Build output for web and TypeScript checks for driver app.

## What Needs Supabase Configuration

- Real enquiry insert behavior.
- Admin login with Supabase Auth.
- Admin role checks through `user_profiles`.
- Applying migrations through M12.
- Creating and reviewing database-backed Ad Work records.
- Proof upload RPC behavior.
- Tracking session and location point records.
- Final Proof Summary and closure RPC behavior.

## What Needs Android Device Testing

- Driver app launch on a real Android device.
- Photo library permission behavior.
- Foreground location permission prompt.
- Start Location Proof after consent.
- Stop Location Proof after break, end work, admin stop, access revoke, or closure.
- Offline location buffer behavior during poor network.
- Sync Now behavior after network returns.

## What Needs Real Phone GPS Permission Testing

- That permission is requested only after the driver chooses Start Location Proof.
- That background location is not requested.
- That no location points are sent outside active assigned work.
- That location proof stops when work ends.
- That no real person GPS trace is copied into dry-run documentation.

## What Needs Proof Photo Storage Configuration

- `proof-photos` bucket exists.
- `proof-photos` bucket is private.
- Admin preview uses secure access.
- Public users cannot list or read proof files.
- Driver upload path validation works for a released assignment.

## What Needs Admin User Setup

- Supabase Auth admin user exists.
- Matching `user_profiles` record has role `admin`.
- Non-admin authenticated users cannot manage admin-only records.
- Anonymous users cannot read admin-only records.

## What Cannot Be Validated In Codex Or Container

- Real Android device GPS permission behavior.
- Real photo picker permission behavior.
- Real Supabase storage privacy in a deployed project.
- Real network drop and offline sync behavior.
- Real customer communication delivery.
- Real pilot support response time.
- Real driver field usability.

## Blocker Handling

Record each blocker in the dry-run results template with an owner and a decision:

- fix before pilot,
- accept for pilot with AP approval,
- defer to a later milestone,
- retest on real device.
