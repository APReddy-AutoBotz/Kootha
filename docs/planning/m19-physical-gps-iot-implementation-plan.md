# M19 Physical GPS and IoT Implementation Plan

## M19 Outcome

M19 is complete when architecture, Kiro requirements/tasks, threat model, roadmap, cost assumptions, and AP decisions are reviewable and no runtime physical-device feature exists.

## Delivery Sequence

1. Confirm the latest fetched `origin/main` baseline and merged PR #19.
2. Create the separate `planning/m19-physical-gps-iot-device-integration` branch.
3. Audit current schema, RPCs, mobile offline sync, admin review, final summary, RLS, definer functions, Kiro steering, and production/pilot documentation.
4. Create the five-file Kiro specification.
5. Create architecture, implementation, and threat-model documents.
6. Update README and the existing task ledger while leaving M18 in progress.
7. Add a documentation guardrail test.
8. Run install, lint, typecheck, tests, build, diff check, and final status.
9. Commit, push, and open a draft PR.

## Current Functionality Reused

- Existing `gps_devices`, drivers, vehicles, assignments, release, and execution day state.
- Tracking sessions, location points, source/device fields, captured/received timestamps, idempotency, and offline-sync concepts.
- Admin tracking health, Location Proof Review, hidden coordinates, and customer-safe Final Proof Summary.
- Admin RLS, `is_admin()`, safe `SECURITY DEFINER` patterns, audit logs, and service-role-only retention.
- Netlify server-function pattern as one possible HTTP ingress host.

## Recommended Fastest Path

1. M20A: registry/history/admin security in a focused PR.
2. M20B: canonical contracts and deterministic simulator in a separate PR.
3. M21: generic secure HTTP ingestion using simulator data and a portable ingress host.
4. M22: deterministic health and alert rules.
5. M23: phone/device comparison.
6. M24: one AP-selected vendor/device adapter.
7. M25: statistical and later AI/ML readiness only after reviewed evidence.
8. M26: real device/network pilot with fake business data.

## Architecture Decisions

- Hybrid adapter architecture is preferred over a vendor-specific core or direct-protocol-first build.
- Netlify/serverless is evaluated as the fastest low-volume HTTP option; M21 evidence decides whether it remains suitable.
- Work resolution is based on device identity and event-time history, never payload work IDs.
- Live freshness and delayed backfill are separate configurable policies.
- Post-End-Work receipt may be valid only for telemetry captured within the actual work interval.
- Phone and physical sources coexist and never overwrite.
- Maps and customer live tracking are not dependencies.

## M20 Reviewability

M20A and M20B are separate implementation PRs. M20A may not absorb the simulator or ingestion. M20B may not expand into production persistence or admin UI. Each PR has its own migration/code scope, tests, security review, and acceptance evidence.

## M21 Acceptance Plan

The pilot profile is 25 devices, 15-second events, 10 active hours, 60,000 events/day, and about 1.7 events/second average.

Evidence includes:

- a reproducible full-day event set;
- sustained two-event/second processing;
- ten-times average burst/retry;
- 25-device reconnect with bounded batches;
- three duplicate retries;
- single versus batch request comparison;
- latency, failures, throttling, concurrency, compute, request volume, and cost;
- a signed-off Netlify suitability decision;
- an always-on/container migration plan preserving core contracts.

## Hardware-Independent Work

- Registry schema and admin lifecycle
- Effective link and replacement history
- Credential metadata and rotation design
- Canonical types and adapter contract
- Simulator and fault scenarios
- Generic authenticated HTTP path
- Idempotency, replay, sequence, and event-time resolution
- Live/backfill capture policy
- Deterministic alerts and admin workflow
- Synthetic phone/device comparison
- Retention, scaling, and host-cost evidence

## Hardware-Required Work

- Confirm selected vendor/device protocol and authentication
- SIM/network and physical installation
- Compliance/AIS-140 applicability decision
- Real vendor adapter and credentials
- Device clock, buffering, sequence, signal, power, and reconnect evidence
- Real telemetry calibration
- M26 physical pilot evidence

## Verification

Run:

```text
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
git status --short
```

Do not run a deployment, migration application, device connection, vendor API, network listener, map integration, or physical-device test.

## Draft PR Content

The draft PR must include:

- baseline SHA and branch;
- files created/changed;
- repository audit and reused functionality;
- hybrid/portable recommendation and options considered;
- live versus delayed-backfill policy;
- M20A/M20B split;
- M21 Netlify suitability gate;
- M19–M26 milestones and hardware split;
- security/privacy and threat summary;
- cost assumptions;
- AP decisions;
- verification results;
- confirmation that M18 remains incomplete;
- confirmation that no runtime physical-device feature was implemented.
