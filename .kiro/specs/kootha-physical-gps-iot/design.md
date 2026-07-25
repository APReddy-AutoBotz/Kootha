# Kootha Physical GPS and IoT Design

Spec ID: `kootha-physical-gps-iot`

Status: Planning only

## Design Goals

- Extend Kootha's Phone Location Proof foundation with vendor-neutral physical-device telemetry.
- Allow M20–M23 development with deterministic synthetic devices before hardware selection.
- Retain coordinates only when event-time work, release, assignment, and device-link history permits it.
- Separate live freshness from authenticated delayed store-and-forward telemetry.
- Keep ingress hosting portable and customer live tracking disabled.

## Repository Audit

### Reusable foundation

| Existing capability | Current implementation | M19 direction |
|---|---|---|
| Device readiness | `gps_devices` exists with internal code, provider, vehicle, status, token hash, notes; vehicles also have readiness fields | Extend `gps_devices`; keep vehicle fields as onboarding summaries |
| Driver/vehicle records | Approved drivers and vehicles with admin-only management | Reuse without device-supplied identity |
| Work assignment | One `ad_work_assignments` row per Ad Work, with driver, vehicle, status, warnings | Resolve vehicle assignment at captured time using future history |
| Release/execution | Released Work Code flow and actual execution start/completion fields | Use actual execution interval as the location-retention boundary |
| Tracking | Source-aware `tracking_sessions` and `location_points`; device/source columns already anticipated | Add physical source without changing phone behavior |
| Mobile authentication | Driver RPCs validate mobile, Work Code, release, assignment, day state | Do not reuse Work Codes as device credentials; reuse server-side work validation principles |
| Offline reliability | `client_point_id`, unique session index, buffered sync, captured/received timestamps | Reuse idempotency concepts; add authenticated event-time delayed backfill |
| Admin review | Tracking health, warnings, hidden-by-default coordinates, Location Proof Review | Add source-specific health and comparison without maps |
| Final summary | Admin-confirmed customer-safe Phone Location Proof wording | Add conservative physical proof wording later; never expose raw data |
| Security | RLS, `is_admin()`, client grants, pinned `search_path` on definer functions | New tables default deny; service-only ingest paths; admin-only reads |
| Retention | Service-role-only retention function; proposed 90-day points and 12-month summaries/audits | Extend source-aware retention, keep deletion disabled pending approval |
| Server boundary | Netlify functions hold service-role access for protected server workflows | Use as the fastest HTTP pilot option, not a mandatory permanent host |

### Extension required

- Rich registry and effective-dated link, installation, replacement, status, and credential metadata.
- Portable ingress and adapter contracts.
- Canonical physical telemetry receipts and accepted physical location-point fields.
- Historical release/assignment/link evaluation for delayed backfill.
- Device health, operational alerts, dual-source comparison, and source-aware proof summary.
- Load, cost, retention, replay, backpressure, and dead-letter policies.

### Must not be duplicated

- No second vehicle, driver, assignment, work-day, tracking-session, location-point, alert, review, summary, role, or audit platform.
- No device-auth logic in browser or driver clients.
- No map layer as a prerequisite for collection or review.
- No modification of current foreground phone collection or offline sync behavior.

## Architecture Options

| Dimension | A — Vendor cloud API/webhook | B — Direct device connection | C — Hybrid adapter architecture |
|---|---|---|---|
| Pilot effort | Low after vendor selection | High | Medium initially; low for simulator |
| Monthly cost | Vendor/platform dependent | Hosting and operations dependent | Low for serverless HTTP; grows by chosen adapter |
| Dependency | High vendor dependency | Protocol/device dependency | Canonical core limits either dependency |
| Security | Vendor signature/API security plus Kootha validation | Kootha owns transport security and abuse controls | Adapter-specific auth with common policy |
| Scaling | Vendor absorbs device network | Kootha owns connections and backpressure | Scale host independently from canonical core |
| Support | Vendor and Kootha coordination | Highest 24/7 protocol burden | Incremental per adapter |
| Ongole/Addanki | Good if API access is confirmed | Poor first choice | Best simulator-first and HTTP-pilot fit |
| Enterprise path | Contract/API constraints | Maximum control | Best balance and migration path |
| Supabase fit | Webhook/polling can call server-only processing | Needs gateway before Supabase | Common processor persists to Supabase |
| Always-on service | Webhook: no; polling: scheduled | Usually yes | Only for protocols/volume that require it |
| No-hardware testing | Partial vendor sandbox dependent | Protocol simulator needed | Full deterministic simulator |

Recommendation: Option C. Implement a narrow simulator plus generic HTTP adapter first. Netlify/serverless HTTP is the fastest low-volume host because Kootha already uses a server-function boundary, but `IngressHostV1` prevents permanent Netlify coupling. Add a vendor-cloud adapter after AP selects hardware. Use direct MQTT/TCP/UDP only when protocol or commercial requirements justify an always-on gateway.

## Component Boundaries

```text
Device or vendor
  -> IngressHostV1
  -> TelemetryAdapterV1
  -> AuthContext
  -> CanonicalTelemetryEventV1
  -> EventTimeWorkResolverV1
  -> CaptureWindowPolicyV1
  -> TelemetryPersistenceV1
  -> DeterministicRuleEngineV1
  -> Admin health/review
  -> Customer-safe proof summary
```

`IngressHostV1` owns transport acquisition, request/message limits, throttling, timeouts, correlation IDs, and response transport. It contains no work-linking policy.

`TelemetryAdapterV1` owns adapter authentication, parsing, vendor-field validation, canonical normalization, versioning, safe acknowledgement, and adapter error classification. It does not trust or persist vendor work IDs.

`EventTimeWorkResolverV1` resolves device, effective vehicle link, effective assignment and release, work day, and session using captured time.

`CaptureWindowPolicyV1` decides `accepted_live`, `accepted_delayed`, `health_only`, `duplicate`, or `rejected`.

`TelemetryPersistenceV1` performs the decision and writes atomically against locked event identity and work/link history.

## Canonical Contracts

```ts
interface IngressHostV1 {
  transport: "serverless_http" | "always_on_http" | "vendor_cloud" | "mqtt" | "tcp" | "udp";
  maxMessageBytes: number;
  maxEventsPerMessage: number;
  correlationId: string;
  receivedAt: string;
}

interface CanonicalTelemetryEventV1 {
  canonicalEventId: string;
  vendorEventId?: string;
  clientEventId: string;
  deviceExternalId: string;
  streamEpoch?: string;
  sequence?: number;
  deviceCapturedAt: string;
  serverReceivedAt: string;
  normalizedEventAt: string;
  deviceClockOffsetMs?: number;
  latitude?: number;
  longitude?: number;
  altitudeMeters?: number;
  accuracyMeters?: number;
  speedKph?: number;
  headingDegrees?: number;
  satelliteCount?: number;
  ignition?: boolean;
  motion?: boolean;
  externalPower?: boolean;
  batteryPercent?: number;
  networkSignal?: number;
  gpsFix?: boolean;
  odometerKm?: number;
  tamper?: boolean;
  sourceType: "physical_device";
  adapterType: string;
  adapterVersion: string;
  normalizationVersion: string;
  synthetic: boolean;
  rawPayloadHash: string;
}

interface TelemetryProcessingResultV1 {
  clientEventId: string;
  disposition:
    | "accepted_live"
    | "accepted_delayed"
    | "health_only"
    | "duplicate"
    | "rejected";
  freshness: "live" | "delayed" | "degraded_freshness" | "not_applicable";
  offlineBackfill: boolean;
  quality: "valid" | "degraded" | "suspect" | "rejected";
  reason?: string;
}
```

Optional device fields remain absent when the adapter cannot supply them. Resolved internal device, vehicle, driver, assignment, Ad Work, work-day, and session IDs are server outputs, not accepted inputs.

## Authentication and Replay Design

- Generic HTTP: high-entropy bearer token shown once; only its hash and key metadata are stored server-side.
- Vendor webhook: verify the vendor signature against a server secret before parsing device content.
- HMAC-capable device: validate key ID, timestamp, body digest, and signature using an approved secret store.
- Direct protocols: authenticate according to device capability, isolate connection gateways, and pass an `AuthContext` to the common processor.
- Require a generic client event ID. Uniqueness is scoped to device and adapter.
- If stream epoch and sequence exist, store uniqueness by device/epoch/sequence. Maintain a bounded replay/reordering window so unseen lower sequences may represent valid offline backfill.
- Sequence gaps and out-of-order events become quality signals. Reused sequence with changed content, impossible regression, invalid timestamp, or expired replay window is rejected.
- Unknown-device attempts store only received time, adapter, safe identifier fingerprint, payload hash, and reason; no coordinates or raw body.
- Initial HTTP constraints: 256 KiB request, 100 events, no compressed bodies, bounded execution timeout, per-device and global throttles.

## Live Freshness and Delayed Backfill

The two windows serve different purposes and must never be collapsed.

### Live freshness

Initial planning assumption: two minutes from device capture to server receipt, calibrated against the expected 15-second interval. It is configurable and versioned.

An event inside this window may update live device health, current last-location time, missing-update recovery, and live operational rules. "Live" is internal freshness terminology only; customer live tracking remains disabled.

### Delayed backfill

Initial planning assumption: receipt up to 24 hours after actual End Work or, while work remains running, up to 24 hours after capture. It is configurable and requires AP approval.

Delayed coordinates are accepted only if:

1. authentication succeeds and the device was eligible at capture;
2. event ID is unique and replay/sequence checks pass;
3. device-to-vehicle link was effective at capture;
4. assignment and release were effective at capture;
5. captured time is at or after actual Start Work and at or before actual End Work;
6. receipt is inside the delayed-backfill period;
7. coordinate, clock-offset, and movement validation pass.

They are marked `accepted_delayed`, `delayed`, `offline_backfill`, and `degraded_freshness`. They contribute to historical admin review and source-specific proof counts. They never clear a live missing-update alert, update a live-fresh indicator, or appear as customer live tracking.

## End Work Race

The persistence transaction locks and evaluates:

- event identity and prior content hash;
- device status and credential validity at receipt;
- effective device/vehicle link at capture;
- release and assignment history at capture;
- actual execution start and end;
- captured and received time;
- delayed-backfill rule version;
- stream epoch, sequence, and replay state.

Receipt after End Work is not an automatic rejection. Valid capture before or at End Work may be delayed backfill. Capture after End Work is always rejected. A later device replacement, assignment change, release revocation, or closure does not rewrite history when capture-time evidence was valid.

## Persistence Plan for Later Milestones

| Area | Future change | Reuse rule |
|---|---|---|
| `gps_devices` | Vendor/model/protocol/serial, lifecycle, health summaries, install state, synthetic marker | Existing table remains master |
| Device links | Effective vehicle/optional custodian history | Current `vehicle_id` may remain a convenience pointer |
| Credentials | Hash/key/status/rotation metadata only | Secrets stay in server secret store |
| Telemetry receipts | Identity, time, adapter, disposition, quality, safe health, hashes | No off-work coordinates or raw payload |
| `tracking_sessions` | Physical source/mode and device reference | Phone sessions unchanged |
| `location_points` | Receipt, altitude/satellites, freshness/backfill/synthetic fields | Accepted coordinates remain in existing table |
| `alerts` | Rich source/device/work context and lifecycle | Extend existing alert platform |
| `audit_logs` | Registry/link/credential/rule/alert actions | Safe details only |
| Rule configuration | Versioned thresholds and effective time | No undocumented hard-coded production values |

## Simulator Design

M20B provides a CLI/test-library simulator, not a production listener.

- Fake registry, effective vehicle/work links, and synthetic work intervals.
- Deterministic seed, event IDs, stream epoch, sequence, clock offset, delay, interval, and start/stop.
- Synthetic points around a documented non-operational test origin and never copied from real routes.
- Immutable `synthetic=true` from device through summary.
- Scenarios: normal movement, long stop, missing heartbeat, duplicate, sequence gap, out-of-order, invalid coordinate, impossible speed, low battery, poor GPS/GSM, offline, reconnect, live event, delayed backfill, expired backfill, off-work rejection, phone/device match, and sustained mismatch.

## Health and Comparison

Phase 1 rules cover heartbeat missing, no location update, offline, low battery, external power removal, GPS fix missing, weak GSM, long stop, impossible speed, duplicates, out-of-order, invalid coordinates, points captured after End Work, off-work telemetry, mismatch, wrong vehicle link, and unregistered device.

Alerts deduplicate by rule, device, vehicle, work day, and active episode. Repetition updates first/last time and count.

Phone/device comparison:

- only during historically valid active work;
- nearest-time pairing within a configurable window;
- Haversine distance with accuracy allowance;
- no alert for one observation;
- provisional assumptions of ±60 seconds, 250 m, five minutes, and three pairs;
- outputs mismatch, phone missing, vehicle device missing, both missing, or comparison unavailable;
- admin-only and never an automatic fraud finding.

## Admin and Customer Boundaries

Admin Device Registry, Device Detail, Tracking Health, and Alerts require authenticated admin RLS. Coordinates remain hidden unless explicitly opened. No map is required.

Customer behavior remains unchanged. A later reviewed summary may say:

- "Vehicle Location Proof was reviewed by our team."
- "Vehicle Location Proof was available during the work period."
- "Location proof needs follow-up."

It must not claim GPS certification, a guaranteed route, complete area verification, certified distance, or customer live tracking.

## Retention and Scale

Planning defaults, pending AP/legal approval:

- normalized location points: existing proposed 90 days after closure;
- tracking sessions, alerts, summaries, audit: 12 months;
- detailed heartbeat/receipt health: 30 days, then safe summaries;
- rejected-event metadata: 14 days;
- raw vendor payload: disabled.

At 25 devices the expected load is 60,000 events/day and about 1.7 events/second average. Do not partition for the pilot solely by forecast. Review batching, asynchronous workers, and monthly partitioning when hot rows approach ten million or volume approaches one million events/day.

Dead-letter evidence contains canonical-safe metadata and hashes only. Backpressure returns retryable transport responses; duplicate retries remain idempotent.

## AI Readiness

Phase 1 deterministic rules are not AI. Phase 2 uses statistical baselines after reviewed data exists. Phase 3 may add versioned AI/ML scores, confidence, explanations, and human review.

The figures 4–8 weeks, 30 reviewed days per device/model, and 1,000 reviewed work-day sessions are initial planning assumptions only. Readiness depends on event quality, target anomaly class, device diversity, label prevalence, drift, and validation design. Meeting a count does not prove a model is safe or implemented.

No LLM processes individual coordinates. No model automatically accuses a driver of fraud or makes a final operational decision.
