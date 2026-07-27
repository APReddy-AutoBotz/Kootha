# M21 Generic Secure HTTP Telemetry Ingestion

M21 remains In Progress pending merge and post-merge verification. M18 remains incomplete/in progress, M20A and M20B are Completed, and M22–M26 remain Not Started.

## Boundary and contract

`POST /api/telemetry/v1` is the first server-only host for the portable generic HTTP adapter. It accepts only `application/json`, identity content encoding, at most 256 KiB actual and declared body size, 1–100 events, and the bounded M20B observation set. Each event may supply only contract version, a bounded client/source reference, captured time, optional stream epoch/sequence, location, approved health, and approved observations. Unexpected business-authority or server-owned fields fail closed.

The exact presentation is `Authorization: Bearer kt1.<base64url(device external ID)>.<base64url(credential key ID)>.<base64url bearer secret>`, with canonical bounded identifiers and a 43–128 character secret. Those lookup hints are untrusted until the server resolves an eligible M20A credential and device, derives the stored verification material with domain-separated HMAC-SHA-256 and the server-only pepper, and compares equal-length 32-byte digests in constant time. Failures share one safe external rejection. Verification material, pepper, service-role values, raw headers, and credentials never enter browser/mobile configuration, responses, or logs.

The server owns receipt/normalization time, correlation identity, authenticated device identity, adapter/provenance identity, synthetic classification, content identities, and persistence disposition. Acknowledgements expose safe counts, bounded client references, stable reason/disposition, retryability, and no internal IDs, coordinates, payloads, hashes, SQL text, credential state, or authority identity.

## Persistence and policy

The database transaction authoritatively resolves device → effective vehicle link → effective assignment/driver → release → work day → Start/Break/Resume/End window. It rejects absent or ambiguous authority and never trusts payload business IDs. Legacy rows before an explicit history baseline are not fabricated.

Identity and sequence state are scoped to authenticated device and adapter/version. Identical identity/content retries are acknowledged without a second receipt effect, point, session increment, or observation. Changed content is a conflict. Higher sequences advance the locked high-water mark; bounded unseen lower sequences may pass delayed-backfill rules; stale or conflicting reuse fails closed. Live freshness is provisionally two minutes, delayed backfill is 24 hours, and future skew/reorder limits are configurable.

Eligible physical positions reuse the existing tracking-session and location-point platform with an explicit physical source; phone rows, IDs, source labels, counts, and customer-live defaults are unchanged. Outside active work, coordinates, speed, heading, movement, ignition, odometer, and raw payload are discarded; only approved bounded health may be retained. Sensor observations use the approved typed metric/unit registry and the same authority/retention boundary.

Database-backed fixed 60-second windows cover a keyed unauthenticated fingerprint (60 preauthentication request reservations), authenticated device (120 requests/6,000 events), and global scope (300 requests/12,000 events). Successful authentication atomically refunds its exact one-shot unauthenticated reservation; failed authentication retains it. Device/global request charges occur before body reads, and event charges occur only after a bounded body parses successfully. Buckets retain for 86,400 seconds. These `m21-pilot-v1` thresholds are configurable provisional pilot assumptions, not AP-approved production policy. Throttled work is acknowledged explicitly with bounded `Retry-After`; no raw IP, token, or failed device hint is retained.

## Local-only verification evidence

Run:

```text
corepack pnpm evidence:m21-load
corepack pnpm benchmark:m21-auth
corepack pnpm test:m21-scope
```

The deterministic load command uses M20B’s virtual-time simulator, seed 21000, synthetic context, 25 devices, 15-second cadence, and 10 active hours. On 27 July 2026 it generated 60,000 events on Node v22.18.0, Windows x64. Local generation took 2,239.829 ms and the in-memory evidence model processed the required profiles in 2,604.548 ms (207,339.2 modeled attempts/second). This is correctness and scale-shape evidence only, not Netlify or Supabase latency.

| Profile | Requests | Modeled DB operations/RPCs | Live | Delayed | Identical duplicates | Conflicts | Points | Sessions |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Single event / sustained equivalent | 60,000 | 360,000 | 60,000 | 0 | 0 | 0 | 60,000 | 25 |
| 10× burst, batch 10 | 6,000 | 90,000 | 60,000 | 0 | 0 | 0 | 60,000 | 25 |
| Reconnect, batch 100 | 600 | 63,000 | 57,500 | 2,500 | 0 | 0 | 60,000 | 25 |
| Three-attempt duplicate storm | 1,800 | 189,000 | 60,000 | 0 | 120,000 | 0 | 60,000 | 25 |
| Changed-content attempts | 601 | 63,030 | 60,000 | 0 | 0 | 25 | 60,000 | 25 |
| Out-of-order/backfill, batch 25 | 2,400 | 72,000 | 57,500 | 2,500 | 0 | 0 | 60,000 | 25 |

Every profile reported zero errors, zero point inflation, 60,000 final receipt/point rows, 25 physical sessions, and unchanged synthetic phone-row count (7 before and after). A same-seed/configuration rerun is asserted equal. Database counts are explicitly modeled as one per-event persistence RPC plus five successful-request operations: one unauthenticated reservation, one credential lookup, one combined verification/reservation-refund, one atomic authenticated device/global request charge, and one atomic authenticated device/global event charge. Batching reduces only request overhead, not per-event persistence. Unauthenticated-failure throttling, hosted latency, and concurrency remain covered outside this in-memory harness.

A recorded dedicated controller auth-cost benchmark ran on Node 22.18.0/Windows x64. Domain-separated HMAC-SHA-256 derivation plus constant-time comparison averaged 46.181 µs across 60,000 sustained samples (p50 26.1, p95 53.6, p99 200.7 µs) and 46.780 µs across 12,000 10×-burst samples. Constant-time valid/invalid comparisons averaged 16.616/15.919 µs across 20,000 samples each. The in-memory DB-eligible active and rotating lookup fixtures averaged 120.461/138.843 µs across 5,000 samples each. One cold single sample was 2,074.1 µs. This supports the selected mechanism’s provisional pilot CPU cost; it intentionally omits secret, pepper, hash, token, and real-device values and makes no hosted-latency claim.

## Hosting suitability — 27 July 2026

Decision: **suitable with conditions** for a bounded synthetic/pilot HTTP evaluation. This is not deployment approval.

The 25-device model produces 60,000 events/day: 60,000 daily requests at one event/request, 6,000 at batch 10, or 600 at batch 100. At 30 days the corresponding formulas are 1,800,000, 180,000, and 18,000 requests/month. The database model is one persistence RPC per event plus five successful-request operations, so batching reduces request overhead while preserving per-event persistence; reconnect traffic favors bounded batches but never exceeds 100 events or 256 KiB.

Current official pricing was not verified for this implementation, so no quote, plan purchase, or hosted cost claim is made. Evaluate cost by multiplying these request counts by the then-current Netlify invocation/compute terms and Supabase request/database terms, plus logs and egress. Batching reduces cold starts, authentication/database round trips, and compute overhead, but larger retries amplify duplicate work and approach function timeouts. Devices must use stable identities, bounded exponential backoff/jitter, server `Retry-After`, and split reconnect queues into bounded batches.

Keep Netlify only while measured deployed p95/p99 duration, timeout rate, concurrency, throttle rate, reconnect recovery, and monthly cost stay inside an AP-approved pilot envelope. Migrate before pilot if long-lived protocols are required, sustained traffic approaches concurrency/time limits, reconnect batches time out, per-request cost dominates, or operational diagnosis needs process-level control. The generic adapter, M20B canonical contracts, authentication boundary, database transaction semantics, and tests have no Netlify dependency and remain portable to an always-on/containerized HTTP host.

## Environment and non-goals

Required server-only names are `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEMETRY_INGEST_ENABLED`, `TELEMETRY_CREDENTIAL_PEPPER`, and `TELEMETRY_RATE_LIMIT_KEY`; placeholder-only examples are in `netlify/server-env.example`, while values belong only in the approved server secret store. No hosted Supabase migration, no Netlify deployment, and no real credential provisioning were performed.

M21 does not add vendor-specific adapters, MQTT/TCP/UDP listeners, an always-on deployment, M22 alerts, M23 phone/device comparison, fraud or AI/ML, hardware integration, maps/routes, customer tracking links or live tracking, customer/iOS apps, a PWA, or production-data changes.
