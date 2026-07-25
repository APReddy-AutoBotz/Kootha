# Kootha Physical GPS and IoT Requirements

Spec ID: `kootha-physical-gps-iot`

M19 defines requirements only. Every runtime requirement below is `Not Started`. It does not change Phone Location Proof, create ingestion endpoints, connect hardware, add credentials, add maps, or enable customer live tracking.

## Requirement Format

Each requirement records its business purpose, actor, statement, WHEN/THEN acceptance criteria, priority, dependencies, security/privacy notes, whether a physical device is required, and status.

## Device Registry

### DEV-REG-001 — Canonical Physical Device Registry

- **Business purpose:** Give operations one authoritative record for every physical tracker.
- **User/actor:** Kootha admin.
- **Requirement statement:** The existing `gps_devices` record shall be extended rather than duplicated and shall support internal ID, vendor, model, adapter type, serial/IMEI, optional vehicle and driver links, SIM/network state, installation date, status, heartbeat and telemetry times, firmware, power, battery, GPS/GSM health, notes, and timestamps.
- **Acceptance criteria:**
  - WHEN an admin registers a device, THEN stable lowercase values and simple UI labels are used.
  - WHEN a serial/IMEI or vendor device identifier already exists, THEN a duplicate active record is not created.
  - WHEN a frontend user reads a device, THEN no secret or credential value is returned.
- **Priority:** Must
- **Dependencies:** M20A
- **Security/privacy notes:** Admin-only RLS; identifiers are operational data and must not be public.
- **Device required:** No
- **Status:** Not Started

### DEV-REG-002 — Device Lifecycle

- **Business purpose:** Track whether equipment may provide evidence.
- **User/actor:** Kootha admin and ingestion service.
- **Requirement statement:** Device status shall use `pending_setup`, `active`, `offline`, `not_working`, `suspended`, `removed`, or `retired`.
- **Acceptance criteria:**
  - WHEN a device is not `active`, THEN its coordinates are not accepted as proof.
  - WHEN a device is suspended, removed, lost, stolen, or retired, THEN its active credentials can be revoked immediately.
  - WHEN status changes, THEN actor, time, reason, and previous/new state are audited.
- **Priority:** Must
- **Dependencies:** DEV-REG-001, ING-SEC-003
- **Security/privacy notes:** A status update must not rewrite historical proof.
- **Device required:** No
- **Status:** Not Started

### DEV-REG-003 — Effective-Dated Vehicle Link History

- **Business purpose:** Resolve which vehicle a device represented at event capture time.
- **User/actor:** Kootha admin and event-time resolver.
- **Requirement statement:** Device-to-vehicle links shall be effective-dated, audited, and limited to one active primary device per vehicle for the pilot.
- **Acceptance criteria:**
  - WHEN a device is reassigned, THEN the previous link is closed and historical points retain the original device and vehicle.
  - WHEN an event is evaluated, THEN the link effective at device captured time is used.
  - WHEN overlapping active links would create ambiguity, THEN the change is blocked or explicitly resolved by an admin.
- **Priority:** Must
- **Dependencies:** DEV-REG-001
- **Security/privacy notes:** Device-provided vehicle IDs are ignored.
- **Device required:** No
- **Status:** Not Started

### DEV-REG-004 — Installation and Replacement History

- **Business purpose:** Preserve evidence when equipment is installed, replaced, lost, or removed.
- **User/actor:** Kootha admin.
- **Requirement statement:** Installation, removal, replacement, lost/stolen handling, and active-work replacement shall require explicit admin actions and audit history.
- **Acceptance criteria:**
  - WHEN a replacement occurs during active work, THEN effective time, old device, new device, reason, and admin are recorded.
  - WHEN a device is lost or stolen, THEN it is suspended and its credential is revoked without relinking old telemetry.
- **Priority:** Must
- **Dependencies:** DEV-REG-002, DEV-REG-003
- **Security/privacy notes:** Audit details contain no credentials or coordinates.
- **Device required:** No
- **Status:** Not Started

## Secure Ingestion

### ING-SEC-001 — Portable Ingress Boundary

- **Business purpose:** Avoid coupling Kootha to one hosting provider or device protocol.
- **User/actor:** Integration engineer.
- **Requirement statement:** Transport hosting shall be separated from authentication, adapter normalization, canonical processing, and persistence.
- **Acceptance criteria:**
  - WHEN the HTTP pilot runs on Netlify, THEN the adapter and canonical core remain portable to an always-on HTTP service.
  - WHEN MQTT, TCP, UDP, vendor webhook, or polling is selected later, THEN tracking storage and business rules do not need rewriting.
- **Priority:** Must
- **Dependencies:** ADAPTER-001
- **Security/privacy notes:** Every ingress host applies equivalent authentication, limits, and safe logging.
- **Device required:** No
- **Status:** Not Started

### ING-SEC-002 — Device and Vendor Authentication

- **Business purpose:** Accept telemetry only from an authorized source.
- **User/actor:** Ingestion service.
- **Requirement statement:** The pilot HTTP adapter shall support a high-entropy per-device token stored only as a server-side hash; vendor signatures or HMAC shall be supported by adapter capability when available.
- **Acceptance criteria:**
  - WHEN authentication fails, THEN the endpoint returns a generic rejection and no coordinate is stored.
  - WHEN a vendor webhook is used, THEN its documented signature is validated before normalization.
  - WHEN server credentials are configured, THEN they exist only in the approved server secret store.
- **Priority:** Must
- **Dependencies:** DEV-REG-001
- **Security/privacy notes:** No service-role key or device secret in web, driver, Git, or frontend-readable tables.
- **Device required:** No
- **Status:** Not Started

### ING-SEC-003 — Credential Rotation and Revocation

- **Business purpose:** Recover safely from expiry or credential theft.
- **User/actor:** Kootha admin and ingestion service.
- **Requirement statement:** Device authentication shall support issue-once credentials, rotation metadata, bounded overlap, immediate revocation, and audited status.
- **Acceptance criteria:**
  - WHEN a credential rotates, THEN the old key expires after an approved overlap or is immediately revoked.
  - WHEN theft is suspected, THEN suspension prevents all later coordinate acceptance.
- **Priority:** Must
- **Dependencies:** ING-SEC-002, DEV-REG-002
- **Security/privacy notes:** Only hashes, key IDs, states, and dates may be stored in the database.
- **Device required:** No
- **Status:** Not Started

### ING-SEC-004 — Replay, Duplicate, and Sequence Protection

- **Business purpose:** Prevent repeated or reordered messages from corrupting proof.
- **User/actor:** Ingestion service.
- **Requirement statement:** Generic events require a unique event ID; adapters validate optional stream/boot epoch and sequence with a bounded replay/reordering window.
- **Acceptance criteria:**
  - WHEN an identical event is retried, THEN it is acknowledged as duplicate without another point or alert occurrence.
  - WHEN an unseen lower sequence is valid delayed backfill inside the bounded window, THEN it may be accepted and marked out of order.
  - WHEN a sequence is reused with different content or falls outside the replay window, THEN it is rejected and safely alerted.
- **Priority:** Must
- **Dependencies:** TEL-NORM-001, PRIVACY-002
- **Security/privacy notes:** Payload hashes support comparison but raw payload retention remains disabled.
- **Device required:** No
- **Status:** Not Started

### ING-SEC-005 — Payload and Rate Limits

- **Business purpose:** Protect availability and cost.
- **User/actor:** Ingress host.
- **Requirement statement:** The initial HTTP contract shall limit requests to 256 KiB and 100 events, reject malformed bodies, enforce per-device and global throttles, and apply bounded timeouts.
- **Acceptance criteria:**
  - WHEN a body exceeds the limit, THEN it receives `413` before parsing.
  - WHEN a device exceeds its allowed sustained/burst rate, THEN it receives `429` without processing coordinates.
  - WHEN parsing fails, THEN no raw body or secret is logged.
- **Priority:** Must
- **Dependencies:** ING-SEC-001
- **Security/privacy notes:** Compressed request bodies are disabled initially to avoid decompression abuse.
- **Device required:** No
- **Status:** Not Started

## Canonical Telemetry and Adapters

### TEL-NORM-001 — Canonical Telemetry Event

- **Business purpose:** Normalize multiple device vendors once.
- **User/actor:** Telemetry adapter and processor.
- **Requirement statement:** `CanonicalTelemetryEventV1` shall carry the requested identity, time, optional location, optional device-health, processing, idempotency, adapter/version, raw-hash, freshness, disposition, and synthetic fields.
- **Acceptance criteria:**
  - WHEN a source omits an optional metric, THEN normalization succeeds without inventing a value.
  - WHEN required identity or time is missing, THEN the event is rejected with a stable reason.
  - WHEN normalization changes, THEN the version is recorded.
- **Priority:** Must
- **Dependencies:** ADAPTER-001
- **Security/privacy notes:** Work, assignment, driver, and vehicle are resolved server-side.
- **Device required:** No
- **Status:** Not Started

### TEL-NORM-002 — Coordinate and Movement Validation

- **Business purpose:** Keep corrupt telemetry out of proof.
- **User/actor:** Canonical processor.
- **Requirement statement:** Coordinates, optional accuracy/speed/heading, clock offset, derived movement, and ordering shall be validated with versioned rules.
- **Acceptance criteria:**
  - WHEN latitude or longitude is outside its legal range, THEN the point is rejected.
  - WHEN movement or speed is impossible, THEN the coordinate is rejected or marked suspect according to the recorded rule version and an admin alert is created.
  - WHEN accuracy is unavailable, THEN quality is `unknown`, not fabricated.
- **Priority:** Must
- **Dependencies:** TEL-NORM-001, HEALTH-001
- **Security/privacy notes:** Validation warnings are operational signals, not fraud findings.
- **Device required:** No
- **Status:** Not Started

### ADAPTER-001 — Versioned Adapter Contract

- **Business purpose:** Add vendors without rewriting Kootha operations.
- **User/actor:** Integration engineer.
- **Requirement statement:** `TelemetryAdapterV1` shall authenticate, parse, validate vendor-required fields, normalize, acknowledge safely, expose its version, and classify adapter errors.
- **Acceptance criteria:**
  - WHEN a new vendor is added, THEN phone tracking, sessions, location storage, alerts, admin health, comparison, and proof summary contracts remain stable.
  - WHEN an adapter fails, THEN a safe error category and correlation ID are produced without leaking payloads.
- **Priority:** Must
- **Dependencies:** ING-SEC-001
- **Security/privacy notes:** Adapter logs exclude coordinates, credentials, and raw payloads.
- **Device required:** No
- **Status:** Not Started

## Privacy and Work Linking

### PRIVACY-001 — Active Work Capture Boundary

- **Business purpose:** Prevent silent off-work tracking.
- **User/actor:** Event-time work resolver.
- **Requirement statement:** Coordinates may be retained only when device captured time falls within a historically valid released assignment and the actual Start Work/End Work interval.
- **Acceptance criteria:**
  - WHEN capture occurs before Start Work or after End Work, THEN coordinates and movement-derived fields are discarded.
  - WHEN work was never released or historical assignment/link validity fails, THEN no location point is stored.
  - WHEN work is on break, THEN new coordinates are not treated as active work proof.
- **Priority:** Must
- **Dependencies:** DEV-REG-003, WORK-LINK-001
- **Security/privacy notes:** `customer_live_enabled` and `live_tracking_enabled` remain false.
- **Device required:** No
- **Status:** Not Started

### PRIVACY-002 — Live Freshness and Delayed Backfill

- **Business purpose:** Support device store-and-forward without misrepresenting delayed data as live.
- **User/actor:** Canonical processor.
- **Requirement statement:** `live_freshness_window` and `delayed_backfill_window` shall be independent, configurable, and versioned.
- **Acceptance criteria:**
  - WHEN an authenticated event arrives inside the live window, THEN it may be `accepted_live`.
  - WHEN it arrives later but was captured within the valid work interval and passes backfill checks, THEN it is `accepted_delayed`, `offline_backfill`, and `degraded_freshness`.
  - WHEN a delayed event is accepted, THEN it does not clear live missing-update alerts or become customer live tracking.
- **Priority:** Must
- **Dependencies:** ING-SEC-004, PRIVACY-001
- **Security/privacy notes:** Initial assumptions are two minutes live and 24 hours delayed; AP must approve production values.
- **Device required:** No
- **Status:** Not Started

### PRIVACY-003 — End Work Race and Event-Time History

- **Business purpose:** Decide consistently when receipt races with End Work or later reassignment.
- **User/actor:** Persistence transaction.
- **Requirement statement:** The transaction shall evaluate actual execution start/end, captured/received time, release and assignment history, device link history, grace/backfill policy, identity, and sequence.
- **Acceptance criteria:**
  - WHEN an event arrives after End Work but was genuinely captured inside the valid interval, THEN it may be accepted as delayed.
  - WHEN capture is after End Work, THEN it is rejected even if the request claims the work is active.
  - WHEN a link was revoked after valid capture, THEN historical validity may still authorize delayed storage.
- **Priority:** Must
- **Dependencies:** PRIVACY-001, PRIVACY-002
- **Security/privacy notes:** The transaction must not rely only on current state at receipt time.
- **Device required:** No
- **Status:** Not Started

### PRIVACY-004 — Health-Only Off-Work Processing

- **Business purpose:** Monitor equipment without retaining off-work movement.
- **User/actor:** Canonical processor.
- **Requirement statement:** Off-work messages may retain sanitized heartbeat, battery, external power, firmware, GPS-fix, and GSM-health metadata only.
- **Acceptance criteria:**
  - WHEN an off-work payload contains coordinates, THEN coordinates, speed, heading, motion, ignition, and odometer are discarded.
  - WHEN sanitized health is retained, THEN the disposition is `health_only` and cannot appear in proof.
- **Priority:** Must
- **Dependencies:** PRIVACY-001
- **Security/privacy notes:** Raw payload retention is disabled.
- **Device required:** No
- **Status:** Not Started

### WORK-LINK-001 — Server-Side Work Resolution

- **Business purpose:** Link physical telemetry to Kootha operations safely.
- **User/actor:** Event-time work resolver.
- **Requirement statement:** Device identity resolves the effective vehicle link, assignment, released Ad Work, active work day, and physical tracking session; payload work IDs are ignored.
- **Acceptance criteria:**
  - WHEN exactly one historical match exists, THEN resolved IDs are attached by the server.
  - WHEN no match or multiple matches exist, THEN coordinates are rejected and an admin alert is created.
- **Priority:** Must
- **Dependencies:** DEV-REG-003, PRIVACY-001
- **Security/privacy notes:** Unknown-device alerts retain only a safe identifier fingerprint.
- **Device required:** No
- **Status:** Not Started

### WORK-LINK-002 — Phone and Physical Source Coexistence

- **Business purpose:** Preserve both evidence sources independently.
- **User/actor:** Admin reviewer.
- **Requirement statement:** Phone and physical-device sessions and points shall coexist without overwriting, using explicit `phone` and `physical_device` source values.
- **Acceptance criteria:**
  - WHEN both sources are present, THEN admin health and proof review show counts and timing by source.
  - WHEN physical tracking fails, THEN phone evidence remains unchanged.
- **Priority:** Must
- **Dependencies:** WORK-LINK-001
- **Security/privacy notes:** Coordinates remain admin-only.
- **Device required:** No
- **Status:** Not Started

## Simulator, Health, and Comparison

### SIM-001 — Deterministic Synthetic Device Simulator

- **Business purpose:** Build and test before purchasing hardware.
- **User/actor:** Developer and QA.
- **Requirement statement:** A deterministic simulator shall create synthetic registered devices, vehicle/work links, configurable intervals, start/stop control, seeds, IDs, clock offset, network delay, and synthetic route points.
- **Acceptance criteria:**
  - WHEN the same seed and scenario are run, THEN the same canonical events are produced.
  - WHEN simulator records are stored, THEN device, event, session, point, and summary are immutably marked synthetic.
  - WHEN fixtures are committed, THEN they contain no real routes or real-person coordinates.
- **Priority:** Must
- **Dependencies:** M20A, TEL-NORM-001
- **Security/privacy notes:** Simulator credentials are environment-scoped placeholders, not production secrets.
- **Device required:** No
- **Status:** Not Started

### SIM-002 — Required Fault and Comparison Scenarios

- **Business purpose:** Exercise operational and security behavior reproducibly.
- **User/actor:** QA.
- **Requirement statement:** The simulator shall cover normal movement, long stop, missing heartbeat, duplicate, sequence gap, out-of-order, invalid coordinate, impossible speed, low battery, weak GPS/GSM, offline/reconnect, delayed backfill, off-work rejection, and phone/device match and mismatch.
- **Acceptance criteria:**
  - WHEN each scenario runs, THEN expected disposition, quality, alert, and point count are asserted.
- **Priority:** Must
- **Dependencies:** SIM-001
- **Security/privacy notes:** Scenarios use fake business records only.
- **Device required:** No
- **Status:** Not Started

### HEALTH-001 — Deterministic Operational Rules

- **Business purpose:** Detect common device and data failures before AI.
- **User/actor:** Operations service and admin.
- **Requirement statement:** Versioned rules shall cover every required heartbeat, location, power, signal, movement, duplication, ordering, coordinate, off-work, mismatch, wrong-link, and unknown-device condition.
- **Acceptance criteria:**
  - WHEN a rule is triggered repeatedly for the same context, THEN one alert is updated using a deduplication key and occurrence count.
  - WHEN thresholds change, THEN the effective rule version is retained.
- **Priority:** Must
- **Dependencies:** TEL-NORM-002
- **Security/privacy notes:** Rules do not notify customers automatically.
- **Device required:** No
- **Status:** Not Started

### HEALTH-002 — Alert Review Lifecycle

- **Business purpose:** Give admins a traceable operational queue.
- **User/actor:** Kootha admin.
- **Requirement statement:** Alerts shall support `new`, `acknowledged`, `investigating`, `resolved`, `false_alarm`, and `ignored`, with type, severity, source, device, vehicle, work context, first/last time, count, note, and resolution.
- **Acceptance criteria:**
  - WHEN an admin changes alert state, THEN actor, time, note, and reason are audited.
  - WHEN no customer workflow is approved, THEN no alert is sent to a customer.
- **Priority:** Must
- **Dependencies:** HEALTH-001, ADMIN-002
- **Security/privacy notes:** Alert text excludes raw coordinates and credentials.
- **Device required:** No
- **Status:** Not Started

### COMPARE-001 — Sustained Phone/Device Comparison

- **Business purpose:** Detect operational separation between phone and vehicle without false accusations.
- **User/actor:** Comparison service and admin.
- **Requirement statement:** Comparison shall pair active-work points within a configurable time window, use Haversine distance and available accuracy, and require sustained evidence.
- **Acceptance criteria:**
  - WHEN one isolated mismatch occurs, THEN no mismatch alert is opened.
  - WHEN provisional distance, duration, and minimum-pair thresholds are sustained, THEN an admin-only mismatch alert is created.
  - WHEN either source is absent or quality is insufficient, THEN the correct missing/not-available status is produced.
- **Priority:** Should
- **Dependencies:** WORK-LINK-002, HEALTH-001
- **Security/privacy notes:** Initial assumptions of ±60 seconds, 250 m, five minutes, and three pairs are configurable and require calibration.
- **Device required:** No
- **Status:** Not Started

## Admin, Customer, Retention, Scale, Cost, and AI

### ADMIN-001 — Device Registry and Detail Experience

- **Business purpose:** Let admins manage equipment without technical tools.
- **User/actor:** Kootha admin.
- **Requirement statement:** Admin screens shall show registry, links, installation, safe latest health, adapter/protocol, credential rotation state, alerts, and audit history.
- **Acceptance criteria:**
  - WHEN an admin opens a device, THEN no credential value or raw payload is rendered.
  - WHEN no map provider exists, THEN registry and health workflows remain complete.
- **Priority:** Must
- **Dependencies:** M20A
- **Security/privacy notes:** Admin-only RLS and authenticated REST/RPC patterns.
- **Device required:** No
- **Status:** Not Started

### ADMIN-002 — Dual-Source Tracking Health

- **Business purpose:** Review phone and physical evidence without maps.
- **User/actor:** Kootha admin.
- **Requirement statement:** Tracking Health shall show source-specific sessions, counts, first/last updates, live freshness, delayed backfill, offline periods, warnings, and comparison status.
- **Acceptance criteria:**
  - WHEN delayed points exist, THEN they are clearly distinguished from live updates.
  - WHEN technical coordinates are not explicitly opened by an admin, THEN they remain hidden.
- **Priority:** Must
- **Dependencies:** WORK-LINK-002, HEALTH-002
- **Security/privacy notes:** No public or customer route surface.
- **Device required:** No
- **Status:** Not Started

### CUSTOMER-001 — Unchanged Customer Boundary

- **Business purpose:** Add internal evidence without exposing tracking data.
- **User/actor:** Customer.
- **Requirement statement:** Customers continue receiving only normal work updates and conservative Final Proof Summary wording.
- **Acceptance criteria:**
  - WHEN physical proof is reviewed, THEN optional wording is limited to reviewed, available during work, or needs follow-up.
  - WHEN a customer view is produced, THEN it contains no coordinates, device ID, live location, route, health detail, or internal alert.
- **Priority:** Must
- **Dependencies:** ADMIN-002
- **Security/privacy notes:** No GPS-certified, guaranteed-route, certified-distance, or complete-area claim.
- **Device required:** No
- **Status:** Not Started

### RETENTION-001 — Source-Aware Retention

- **Business purpose:** Control privacy and storage cost.
- **User/actor:** Operations owner.
- **Requirement statement:** Retention shall distinguish normalized points, sessions, health receipts, rejected metadata, alerts, summaries, audits, and disabled raw payloads for pilot, production, and enterprise.
- **Acceptance criteria:**
  - WHEN data expires, THEN deletion/summarization is source-aware, audited with safe counts, and does not delete active-work evidence early.
  - WHEN raw debugging is exceptionally enabled, THEN it is approved, redacted, encrypted, access-audited, and short-lived.
- **Priority:** Must
- **Dependencies:** AP retention decision
- **Security/privacy notes:** Existing proposed 90-day raw-location policy is the starting point; AP/legal approval is required.
- **Device required:** No
- **Status:** Not Started

### SCALE-001 — Pilot and Growth Profile

- **Business purpose:** Handle the pilot economically with a credible growth path.
- **User/actor:** Platform engineer.
- **Requirement statement:** The pilot shall support 25 devices, 15-second events, 10 hours/day, about 60,000 events/day and 1.7 events/second average, with a path to 100 devices and one million events/day.
- **Acceptance criteria:**
  - WHEN M21 is reviewed, THEN sustained, burst, reconnect, duplicate-retry, latency, error, concurrency, and cost evidence is recorded.
  - WHEN hot data approaches ten million rows or one million events/day, THEN partitioning and asynchronous queue/worker design are reviewed.
- **Priority:** Must
- **Dependencies:** M21
- **Security/privacy notes:** Dead-letter records contain safe metadata/hash only.
- **Device required:** No
- **Status:** Not Started

### COST-001 — Dated Vendor-Neutral Cost Model

- **Business purpose:** Let AP approve spend before purchase or hosting expansion.
- **User/actor:** AP and engineering.
- **Requirement statement:** Costs shall separate development, monthly infrastructure, database, SIM, hardware, monitoring, later maps, and later AI for simulator, 25-device, 100-device, and direct-ingress cases.
- **Acceptance criteria:**
  - WHEN a price is not a confirmed quote, THEN it is labelled as an assumption/range and dated.
  - WHEN a paid vendor or service is proposed, THEN AP approval is recorded before commitment.
- **Priority:** Must
- **Dependencies:** SCALE-001, AP decisions
- **Security/privacy notes:** Cost optimization cannot weaken authentication or retention controls.
- **Device required:** No
- **Status:** Not Started

### AI-READY-001 — Phased Anomaly Readiness

- **Business purpose:** Prepare trustworthy future analysis without claiming AI exists.
- **User/actor:** Operations analyst and admin.
- **Requirement statement:** Phase 1 uses deterministic rules, Phase 2 statistical baselines, and Phase 3 reviewed AI/ML signals with version, confidence, explanations, and fallback.
- **Acceptance criteria:**
  - WHEN insufficient reviewed data exists, THEN deterministic rules remain authoritative and no production AI claim is made.
  - WHEN AI flags a concern, THEN an admin reviews it and no automatic fraud accusation or final decision occurs.
  - WHEN high-frequency coordinates are processed, THEN no LLM is invoked point by point.
- **Priority:** Later
- **Dependencies:** M22, M23, reviewed telemetry
- **Security/privacy notes:** Training extracts are minimized, access-controlled, and retention-bound.
- **Device required:** No for design; Yes for production claims
- **Status:** Not Started

### AI-READY-002 — Provisional Data Thresholds

- **Business purpose:** Define an initial evidence target while allowing empirical calibration.
- **User/actor:** Data/operations reviewer.
- **Requirement statement:** Initial assumptions of 4–8 weeks, 30 reviewed days per device/model, and 1,000 reviewed work-day sessions shall be explicitly provisional.
- **Acceptance criteria:**
  - WHEN readiness is assessed, THEN event quality, device diversity, target anomaly class, label prevalence, drift, and holdout design are evaluated.
  - WHEN the provisional counts are met, THEN that fact alone does not authorize a model or claim implementation.
- **Priority:** Later
- **Dependencies:** AI-READY-001
- **Security/privacy notes:** These are not universal or contractual minimums.
- **Device required:** Yes for real production calibration
- **Status:** Not Started
