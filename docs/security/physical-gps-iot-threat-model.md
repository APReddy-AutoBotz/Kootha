# Physical GPS and IoT Threat Model

Status: M19 planning only

## Overview

Kootha is a field-advertising planning and proof platform with public enquiry, authenticated admin, driver/mobile, server-function, and Supabase data surfaces. This M19 model is intentionally scoped to the proposed physical GPS/IoT extension and its interaction with existing work release, assignment, Phone Location Proof, admin review, retention, audit, and customer-safe summary controls. M19 itself adds no runtime surface.

## Threat Model, Trust Boundaries, and Assumptions

### Assets

- Device identity and lifecycle
- Device/vendor credentials and signature secrets
- Effective device/vehicle, assignment, release, and work history
- Active-work coordinates and tracking sessions
- Sanitized health metadata
- Operational alerts, reviews, proof summaries, and audit evidence
- Service-role access and server secret stores

### Trust Boundaries

1. Physical device or vendor cloud to ingress host
2. Ingress host to adapter
3. Adapter authentication to canonical processor
4. Canonical processor to event-time resolver and database transaction
5. Service-role persistence to admin RLS views
6. Admin review to customer-safe summary

Device/vendor payloads are untrusted even after transport authentication. Only server-side history may resolve vehicle, driver, assignment, Ad Work, work day, or tracking session.

### Input Control

- **Attacker-controlled:** Public or internet-reachable ingress bytes, headers, timestamps, event IDs, sequences, coordinates, device-health fields, retry timing, connection volume, and any identifier asserted by a device or vendor.
- **Operator-controlled:** Device registration and lifecycle, effective vehicle links, work release and assignment history, credential issue/revocation, rule windows, retention, admin review, and customer-safe summary approval.
- **Developer-controlled:** Adapter and normalization versions, schema/RLS/definer code, ingress deployment, secret-store integration, simulator fixtures, logging fields, and load-test profiles.

### Assumptions

- TLS and the approved host secret store are configured correctly; M21/M24 must verify rather than infer this.
- Supabase Auth, admin-only RLS, is_admin(), and server-only service-role boundaries remain authoritative.
- Device clocks and sequence capabilities vary and are not inherently trustworthy.
- A vendor-cloud signature authenticates the vendor message, not the truth of its coordinates or its claimed business relationship.
- Customer live tracking, maps, direct protocol listeners, real credentials, and real hardware are outside M19.

## Attack Surface, Mitigations, and Attacker Stories

The primary attacker stories are a remote sender forging or replaying telemetry, a compromised device credential submitting plausible false data, a malicious or malformed device exhausting ingress resources, an unauthorized user reading private tracking data, or an operator mistake linking evidence to the wrong vehicle/work interval. Protocol-specific parser and connection attacks become relevant only if a later milestone selects direct MQTT/TCP/UDP.

### Threats and Required Mitigations

| Threat | Impact | Required controls | Safe evidence |
|---|---|---|---|
| Fake device message | False location proof | Per-device token hash or adapter signature/HMAC, TLS, active-device check | Adapter, safe fingerprint, reason, time |
| Replayed message | Duplicate/false proof | Stable/derived identity uniqueness, epoch/sequence replay window, timestamp, payload hash | Duplicate/replay count |
| Missing vendor event ID | Retry duplication or random-ID bypass | Stable vendor ID when present; otherwise deterministic device/adapter/time/epoch/sequence/canonical-hash identity | Identity type and duplicate count |
| Reused identity with changed content | Proof substitution | Persist canonical hash with identity; reject and alert conflicts | Conflict reason/count |
| Duplicate retry | Inflated points/alerts | Idempotent receipt and point transaction, duplicate acknowledgement | Existing event reference |
| Device impersonation | Vehicle tracking corruption | High-entropy credentials, signature when supported, rotation/revocation, anomaly alert | Key ID and status only |
| Stolen credential | Ongoing forged events | Immediate suspension/revoke, bounded credential lifetime, rate/behavior monitoring | Revocation action and safe counts |
| Oversized payload | Denial of service/cost | 256 KiB pre-parse limit, 100-event batch, no compression initially | Size class, not body |
| Malformed payload | Parser abuse/data corruption | Strict schema, numeric bounds, adapter-specific required fields, bounded parsing | Error category/correlation ID |
| Invalid coordinates | Corrupt proof | Latitude/longitude constraints, finite numbers, quality rejection | Reason without coordinate |
| Impossible speed/movement | False route evidence | Reported/derived versioned thresholds, suspect/reject policy, admin alert | Rule/version/count |
| Past/future timestamp | Replay or clock error | Captured/received comparison, clock-offset bounds, backfill expiry | Offset class/reason |
| Ambiguous device clock | False in-work capture claim | Configurable tolerances, offset history, sequence/epoch and work-history corroboration; reject or quarantine | Suspect/Needs Review reason |
| Sequence manipulation | Replay/order corruption | Stream epoch, bounded seen-sequence window, content-hash conflict detection | Gap/reuse/regression class |
| Out-of-order store-and-forward | False rejection or bad freshness | Accept unseen valid lower sequence in bounded delayed window, degrade freshness | Ordering/freshness flags |
| Denial-of-service storm | Availability/cost loss | Per-device/global rate limits, concurrency/backpressure, circuit breaker, retry-after | Safe aggregate metrics |
| Unknown device | Unauthenticated probes | Generic rejection, no coordinate/raw storage, deduplicated internal alert | Hashed identifier fingerprint |
| Wrong vehicle link | Misattributed proof | Effective-dated admin link, one primary device/vehicle, no payload vehicle trust | Link IDs and times |
| Telemetry before Start Work | Off-work tracking | Event-time resolver discards location/movement fields | Health-only/rejection count |
| Telemetry after End Work | Off-work tracking | Compare captured time with actual end; reject post-end capture | Rejection reason/count |
| Delayed receipt after End Work | Loss of legitimate evidence | Accept only authenticated, unique, in-window capture inside delayed period; mark delayed | Backfill flags and rule version |
| End Work race | Incorrect acceptance/rejection | Lock event/work/history rows and evaluate captured/received time atomically | Transaction disposition |
| Revocation after valid capture | Historical evidence loss | Evaluate release/link validity at capture time and current credential validity at receipt | Historical link/release references |
| Raw payload leakage | Location/secret exposure | Raw retention disabled; scrub logs/errors; hash only | Hash and normalization version |
| Arbitrary sensor payload | Injection, privacy, or storage abuse | Approved metric/type/unit registry, bounded controlled text, no arbitrary JSON, work/privacy/retention checks | Metric registry version/reason |
| Frontend service key exposure | Full database compromise | Service role only in server host; CI guardrails; no client env name | Presence/status checks only |
| Admin account compromise | Private telemetry exposure | Supabase Auth, admin role RLS, session controls, audit, least privilege | Safe audit actions |
| Customer data exposure | Privacy/legal harm | No customer policies for raw tables, conservative summary projection | Summary status only |
| AI overreach | Unfair accusation | Deterministic fallback, explanation/confidence, human review, no fraud automation | Model/rule version and review |

## Authentication Profiles

### Generic HTTP pilot

- TLS required.
- High-entropy per-device bearer token generated server-side and displayed once.
- Database stores only non-reversible verification material, key ID, status, issued/expiry/revoked time, and rotation relation.
- Verification uses constant-time comparison. A token ID plus cryptographic digest or keyed digest with an approved server-held pepper is permitted.
- M20A/M21 must measure verification cost at sustained and burst telemetry frequency; do not mandate an expensive password hash per point without evidence.
- A valid token identifies the device; the request cannot choose its linked vehicle or work.
- Token failure returns a generic response and stores no coordinate.

### HMAC-capable device

- Sign timestamp, event ID, content digest, and canonical request path.
- Retrieve the secret by key ID from the approved server secret store.
- Constant-time signature comparison.
- Reject expired timestamps and reused event IDs.

### Vendor webhook

- Validate the vendor's documented signature and request timestamp before parsing.
- Map external device identifier through the registry.
- Store vendor API credentials only in the server secret store.
- Treat webhook retry semantics as duplicates, not new proof.

### Direct protocol gateway

- Isolate gateway network and parser from the web/admin application.
- Authenticate by the strongest device-supported method and document limitations.
- Apply connection, message, rate, and buffer limits.
- Emit authenticated canonical messages to the shared processor.

## Privacy Capture Policy

### Active coordinates

Coordinates are retained only when captured during a historically valid actual work interval, with valid effective device link, vehicle assignment, release, authentication, identity, replay, and time checks.

### Delayed coordinates

Delayed receipt is allowed only inside a separately configured backfill window. It is labelled delayed/offline/degraded and cannot affect live status or customer live tracking.

Device-captured time is untrusted and never authorizes proof alone. Future/past tolerance, receipt time, clock-offset history, sequence/epoch, effective link/assignment/release/execution history, replay state, and expiry must corroborate it. Ambiguous or materially inconsistent evidence is rejected or quarantined as suspect/Needs Review.

### Off-work health

Outside the work interval, only heartbeat, battery, external power, firmware, GPS fix, and GSM health may be retained. Coordinates, speed, heading, motion, ignition, odometer, and raw payload are discarded.

## Rate, Payload, and Backpressure Defaults

Initial planning values:

- 256 KiB maximum HTTP request
- 100 events maximum batch
- no compressed bodies
- per-device sustained allowance comfortably above four events/minute, with bounded burst
- global pilot allowance above the expected 1.7 events/second plus reconnect headroom
- bounded request timeout and database transaction
- retryable `429`/`503` with no body echo

M21 must calibrate exact limits from sustained, ten-times burst, reconnect, and duplicate retry evidence.

## Logging and Dead Letters

Logs may contain correlation ID, adapter/version, safe device/internal ID, disposition, reason, duration, and safe counts. They must not contain token, signature, raw payload, phone, Work Code, customer text, coordinate, proof path, or service key.

Dead-letter records contain canonical-safe metadata and hashes only. If a short raw debug exception is ever approved, it must be limited to authenticated in-work events, encrypted, redacted, access-audited, and deleted automatically.

## RLS and Database Controls

- New operational tables enable RLS immediately.
- Anonymous and normal authenticated roles have no ingest-table writes or raw reads.
- Admin reads use `is_admin()`.
- Device ingestion uses server-only operations/RPCs.
- All `SECURITY DEFINER` functions pin `search_path` to `public` or `public, pg_temp`.
- Functions validate every resolved relationship and do not expose broad service methods to clients.
- Audit details exclude credentials and coordinates.

## Incident Response

For credential/device compromise:

1. Suspend the device and revoke its credentials.
2. Stop accepting coordinates immediately.
3. Preserve safe event IDs, hashes, counts, and audit evidence.
4. Review affected active-work receipts and alerts without copying raw data to tickets.
5. Rotate credentials and revalidate installation before reactivation.

For suspected private-data exposure:

1. Disable affected ingress/admin surface.
2. Revoke server credentials or sessions as appropriate.
3. Preserve safe audit evidence.
4. Determine affected records using IDs/counts, not exported coordinates.
5. Follow Kootha's production incident and communication process.

## Security Acceptance Gates

- M20A: RLS, duplicate prevention, history, rotation metadata, and safe audit tests.
- M20B: synthetic-only fixtures and contract fuzz/validation tests.
- M21: authentication, replay, sequence, limits, event-time race, backfill, off-work discard, load/backpressure, and no-phone-regression tests.
- M22: alert deduplication/lifecycle and no-customer-notification tests.
- M23: sustained comparison and no-automatic-accusation tests.
- M24: selected vendor protocol review, real credential rotation, and real-device evidence.
- M25: data minimization, model governance, human review, and deterministic fallback.
## Severity Calibration (Critical, High, Medium, Low)

- **Critical:** A path that exposes the Supabase service role, vendor/device secret store, or unrestricted cross-customer location history; or unauthenticated code execution in an always-on gateway. These cross the server/data trust boundary with broad confidentiality or control impact.
- **High:** Authentication or event-time authorization bypass that stores forged/off-work coordinates as proof; replay/idempotency failure that materially corrupts many work records; admin RLS bypass exposing private telemetry; or credential revocation that does not stop later coordinate acceptance.
- **Medium:** A bounded denial-of-service or cost-amplification path, alert poisoning, incorrect freshness/backfill classification, or wrong historical link resolution affecting a limited device/work set while admin review and raw-data access controls remain intact.
- **Low:** Safe-reason wording, aggregate health inaccuracies, or synthetic-only simulator defects that cannot reach production persistence, expose private data, select a vendor, or change proof conclusions.

M19 documentation defects alone do not establish a runtime vulnerability because no ingress or device connection exists. Severity for M20–M26 findings must be calibrated against the implemented trust boundary, reachable actor, affected records, existing human review, and whether customer-facing proof or private location data can be changed or disclosed.
