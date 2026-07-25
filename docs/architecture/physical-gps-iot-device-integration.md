# Physical GPS and IoT Device Integration Architecture

Status: M19 planning only
Baseline: `origin/main` at `5f940c49304a9a87837be7ebba7d82be8a1d82ab` after fetch on 2026-07-25
Physical hardware selected: No

## Executive Recommendation

Use a hybrid adapter architecture. Build registry and history in M20A, then canonical contracts and a deterministic simulator in M20B. Evaluate a generic secure HTTP adapter on Netlify/serverless in M21 because Kootha already has a protected server-function pattern. Keep the ingress host behind an abstraction so the same adapter, work resolver, capture policy, persistence, alerts, and tests can move to an always-on HTTP service or MQTT/TCP/UDP gateway.

Do not select a vendor, purchase hardware, connect a device, add maps, or enable customer live tracking in M19.

## Current Kootha Architecture

Kootha already contains the correct operational center:

- approved drivers and vehicles;
- vehicle GPS-readiness fields;
- a minimal admin-only `gps_devices` table;
- a single driver/vehicle assignment per Ad Work;
- release and day execution state;
- source-aware tracking sessions and location points;
- phone point captured/received time, client idempotency, offline buffer, and sync;
- automatic session stops on work state changes;
- admin tracking health and warnings without maps;
- admin Location Proof Review;
- customer-safe Final Proof Summary fields;
- admin RLS, `is_admin()`, pinned `search_path` definer functions, and safe audits;
- service-role-only retention operations;
- Netlify server functions for protected server-side workflows.

The physical-device layer should extend these tables and patterns. It should not create another work, assignment, proof, alert, or customer platform.

## Target Architecture

```text
Physical device / vendor cloud / simulator
             |
             v
        IngressHostV1
  (Netlify HTTP, always-on HTTP,
   vendor integration, MQTT/TCP/UDP)
             |
             v
      TelemetryAdapterV1
 (authenticate, parse, normalize,
  version, safe acknowledgement)
             |
             v
 CanonicalTelemetryEventV1
             |
             v
 EventTimeWorkResolverV1
 (device -> effective vehicle link
  -> effective assignment/release
  -> actual work interval)
             |
             v
 CaptureWindowPolicyV1
 (live, delayed, health-only,
  duplicate, rejected)
             |
             v
 Transactional persistence
 (receipt, health, session, point)
             |
             v
 Deterministic rules and alerts
             |
             v
 Admin health/review/comparison
             |
             v
 Conservative proof summary
```

## Ingress Portability

### Serverless HTTP

Best for simulator and low-volume vendor webhooks. It reuses current hosting knowledge, TLS, secret management, and request scaling. It may become inefficient if every 15-second event is a separate function invocation or if long-lived connections are needed.

### Always-On HTTP

Use when predictable latency, connection pooling, high sustained volume, custom queues, or serverless request/compute pricing justifies it. The service implements `IngressHostV1` and calls the same adapter/core.

### Vendor Cloud

Webhook is preferred over polling when reliable signing and delivery exist. Polling uses a scheduled worker and vendor cursor/checkpoint. Neither path may trust vendor work IDs.

### MQTT/TCP/UDP Gateway

Requires an always-on, isolated gateway with connection management, protocol decoders, backpressure, abuse protection, observability, and operational ownership. The gateway produces authenticated canonical input; it does not duplicate Kootha persistence rules.

## Device Registry and History

The existing `gps_devices` table remains the master. Future M20A fields cover vendor/model, adapter, serial/IMEI, optional non-authoritative custodian/install/contact reference, SIM/network, installation, lifecycle, heartbeat, telemetry, firmware, power, battery, GPS/GSM, notes, and synthetic state. Device identity authoritatively resolves the effective vehicle link. Active driver identity normally comes from the valid Ad Work assignment at captured time; payload-provided driver identity and a permanent device custodian reference never override that assignment.

Pilot lifecycle:

- Pending Setup — `pending_setup`
- Active — `active`
- Offline — `offline`
- Not Working — `not_working`
- Suspended — `suspended`
- Removed — `removed`
- Retired — `retired`

Duplicate prevention uses normalized vendor identifiers and serial/IMEI uniqueness. One active primary device per vehicle is the pilot rule. Effective-dated link rows preserve reassignment and replacement history. Old points never change device or vehicle when a current link changes.

Credentials have a separate server-only metadata boundary. High-entropy generic bearer tokens are displayed once and only non-reversible verification material is stored. Verification uses constant-time comparison. M20A/M21 may select a token ID plus cryptographic digest or keyed digest with an approved server-held pepper after measuring sustained/burst request-time cost; an expensive password hash is not mandated per telemetry point without evidence. Vendor/HMAC secrets live in the approved server secret store. Rotation records key ID, issue/expiry/revocation time, reason, and actor without the secret.

## Canonical Event and Persistence

The canonical event includes:

- canonical, vendor, and client event identity;
- physical device external identity plus optional stream epoch and sequence;
- captured, received, normalized time and clock offset;
- optional latitude, longitude, altitude, accuracy, speed, heading, and satellites;
- optional ignition, motion, external power, battery, network, GPS fix, odometer, and tamper;
- source, adapter, adapter version, normalization version, synthetic marker;
- quality, freshness, disposition, rejection reason, duplicate status, and raw payload hash.
When a vendor supplies a stable unique event ID, its adapter uses it. Otherwise the adapter derives a deterministic idempotency identity from an approved combination of registered device identity, adapter/version, device-captured time, optional stream/boot epoch, optional sequence, and canonical payload hash. The identity remains stable across retries; adapters never generate a random identity per attempt. Reused identity with changed canonical content is rejected and alerted.

`CanonicalSensorObservationV1` is a constrained future extension with approved metric key, typed number/boolean/controlled-text value, approved unit, captured time, source/device, quality, normalization version, and synthetic marker. Possible later metrics include fuel level, temperature, door state, vibration, external power, ignition, and tamper. Metric keys/types/units come from an approved versioned registry; arbitrary JSON and unsupported values are rejected or reduced to safe metadata. Applicable active-work, privacy, retention, and customer-summary rules remain authoritative. M19 implements no sensor runtime.

Resolved internal device, vehicle, driver, assignment, Ad Work, work-day, and tracking-session IDs are server outputs.

Future persistence separates:

- telemetry receipt/security metadata and safe device health;
- accepted active-work coordinates in existing `location_points`;
- physical source sessions in existing `tracking_sessions`;
- current health summaries on the registry;
- operational alerts in existing `alerts`;
- safe admin change history in `audit_logs`.

Off-work receipts never retain coordinates, speed, heading, motion, ignition, or odometer. Raw payload retention is disabled.

## Live Freshness Versus Delayed Backfill

### Live freshness window

Initial assumption: two minutes. It controls current-health status, missing-update recovery, and operational freshness. It is versioned and configurable.

`accepted_live` does not mean customer live tracking. Customer and general live-tracking flags remain false.

### Delayed backfill window

Initial assumption: 24 hours. It supports authenticated device store-and-forward and is separately configurable.

A delayed point is accepted when:

- authentication and device eligibility pass;
- event ID is new;
- optional epoch/sequence passes bounded replay/reordering validation;
- effective device/vehicle link, assignment, and release were valid at capture;
- captured time is inside actual Start Work and End Work;
- receipt is inside the delayed-backfill window;
- coordinate, timestamp, clock-offset, and movement checks pass.

The point is marked `accepted_delayed`, `delayed`, `offline_backfill`, and `degraded_freshness`. It supports historical review only. It cannot clear live health alerts or be presented as live.

### Rejection boundary

Reject location captured:

- before actual Start Work;
- after actual End Work;
- for work never released;
- while no historically valid device/vehicle/assignment relationship exists;
- with failed authentication, event identity, replay, timestamp, clock-offset, or sequence checks;
- outside the delayed-backfill window.

## Sequence and Replay

Generic events require a stable idempotency identity: use the vendor/client event ID when available, otherwise use the adapter's deterministic derived identity. With device stream epoch/boot ID and sequence, uniqueness is enforced within the stream. A bounded replay window records seen sequence values and allows unseen lower values when they are legitimate delayed backfill.

Sequence gaps and out-of-order delivery are quality warnings, not automatic fraud findings. A reused sequence containing different content, an impossible regression, or an expired replay event is rejected. If a vendor provides no sequence, its adapter uses stable or derived event identity, captured time, and payload hash with reduced ordering confidence.

Device-captured time is untrusted. It is compared with server receipt, configurable future/past tolerance, observed clock offset, sequence/epoch evidence, effective link/assignment/release/execution history, replay state, and backfill expiry. Device time alone never authorizes proof. Materially inconsistent or ambiguous clock evidence is rejected or quarantined as suspect/Needs Review.

## End Work Race

The persistence transaction locks event identity and reads event-time history. It evaluates actual start/end, captured/received time, release history, assignment history, link history, credential/device state, rule version, and sequence state.

Receipt after End Work is allowed only as valid delayed backfill. Capture after End Work is always rejected. Later closure, revocation, reassignment, or replacement does not erase a relationship that was valid when capture occurred.

## Phone and Physical Device Coexistence

- Phone sessions and RPCs remain unchanged.
- Physical sessions use their own source and device ID.
- Both sources attach to the same resolved work, day, assignment, and vehicle.
- Admin health groups counts and time ranges by source.
- Comparison uses captured time, accuracy, and only valid active-work points.
- Delayed points can support historical comparison but are never a live source.
- No source overwrites or silently substitutes for the other.

## Health, Alerts, and Comparison

Deterministic Phase 1 rules cover all required device, signal, power, heartbeat, movement, invalid-data, off-work, mismatch, wrong-link, and unknown-device cases. Alert episodes deduplicate by type, device, vehicle, work day, and active episode.

Alert lifecycle:

- New — `new`
- Acknowledged — `acknowledged`
- Investigating — `investigating`
- Resolved — `resolved`
- False Alarm — `false_alarm`
- Ignored — `ignored`

Phone/device comparison uses configurable time pairing and Haversine distance with accuracy. Initial assumptions are ±60 seconds, 250 m, five minutes, and three paired observations. These values require pilot calibration. One mismatch never opens an alert.

## Simulator-First Path

M20B supplies deterministic canonical events and no production listener. All data is fake and marked synthetic. Required scenarios include normal movement, stops, heartbeat loss, duplicate and sequence behavior, invalid coordinates/speed, battery/signal faults, offline/reconnect, delayed backfill, expired/off-work rejection, and phone/device agreement and mismatch.

M21 sends simulator events through the generic HTTP contract. M22 and M23 consume the same fixtures for rules and comparison. Real hardware is not required until M24.

## Scale and Netlify Suitability Gate

Pilot profile:

- 25 devices;
- event every 15 seconds;
- 10 active hours/day;
- about 60,000 events/day;
- about 1.7 events/second average;
- about 1.8 million events/month.

M21 must record:

- full deterministic daily-volume evidence;
- sustained approximately two events/second;
- approximately 17 events/second retry/burst;
- all-device reconnect with bounded batches;
- three duplicate retry attempts;
- latency, errors, throttling, concurrency, requests, compute, and monthly cost;
- single-event versus batch economics.

Netlify remains only if evidence and cost are acceptable. Otherwise move `IngressHostV1` to an always-on/containerized service. Adapter, normalization, work resolution, persistence, and tests remain unchanged.

At 60,000/day, use indexes, idempotency, bounded batches, and retention before partitioning. Review queues/workers and monthly partitioning near ten million hot rows or one million events/day.

## Retention

| Data | Pilot/production planning default | Enterprise direction |
|---|---|---|
| Normalized location points | Existing proposed 90 days after closure | Contractual archive or deletion; no indefinite default |
| Tracking sessions | 12 months | Contractual operational history |
| Detailed heartbeat/receipt health | 30 days, then summaries | Configurable summaries |
| Rejected-event metadata | 14 days | Minimal security need |
| Alerts | 12 months | Contractual/audit need |
| Proof summaries | 12 months | Contractual customer record |
| Audit logs | 12 months | Longer only with documented legal need |
| Raw payload | Disabled | Disabled or short approved debug exception |

Deletion remains disabled until AP/legal approval and uses safe count-only audit evidence.

## Cost Model

Costs are planning ranges, not vendor quotations.

| Category | Simulator | 25-device pilot | 100 devices |
|---|---:|---:|---:|
| Development infrastructure | Incremental $0 | Existing hosting or paid baseline | Paid baseline likely |
| Supabase | Free development; production Pro currently starts near $25/month | Often within Pro quotas; measure row/index growth | Pro plus compute/storage upgrades as measured |
| HTTP ingress | $0 local | Netlify $0–$20 planning range depending batching/credits, or always-on $5–$100 | $20+ serverless or $25–$250 always-on planning range |
| Device hardware | None | ₹1,500–₹15,000 each planning range | Quote required |
| SIM/data | None | ₹25–₹200/device/month planning range | Quote required |
| Vendor platform/API | None | $0–$20/device/month unconfirmed range | Quote required |
| Monitoring | Local logs | $0–$30/month | $20–$200/month as retention/support grows |
| Maps later | Not included | $0 until separately approved | Provider quote required |
| Statistical/AI later | Rules included | $0 incremental for rules; later batch compute | $20–$500+ only after approved scope |

Supabase and Netlify prices must be rechecked at implementation time. Batching and retention are the largest controllable pilot cost levers. No paid vendor is selected without AP approval.

## AI Roadmap

1. Deterministic rules with recorded versions and human review.
2. Statistical device/model/work baselines after reviewed data exists.
3. Explainable AI/ML only for a defined operational target with confidence, contributing signals, holdout validation, drift monitoring, and rule fallback.

Four to eight weeks, 30 reviewed days/device/model, and 1,000 reviewed sessions are provisional planning assumptions only. Data quality and anomaly class determine actual sufficiency. These figures do not mean AI is implemented.

## Hardware Boundary

Can begin without hardware: M20A, M20B, M21, M22, and M23 using synthetic data.

Requires hardware or real reviewed telemetry: M24 vendor adapter/evidence, production calibration in M25, and M26 physical pilot.

## Explicit Exclusions

- Runtime implementation in M19
- Real credentials or vendor calls
- Physical device connections
- TCP/UDP/MQTT listeners
- Maps or map provider
- Customer live tracking
- Payments or WhatsApp/SMS integration
- Customer app, iOS app, or PWA
- Changes to mobile Phone Location Proof
