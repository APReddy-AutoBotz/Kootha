# Physical GPS and IoT Implementation Roadmap

This roadmap follows M19 planning. Estimates assume one engineer plus review and exclude procurement lead time.

## M19 — Architecture and Requirements

- **Objective:** Produce a decision-ready, vendor-neutral plan grounded in Kootha.
- **Scope:** Audit, requirements, design, threat model, roadmap, costs, and decisions.
- **Non-goals:** Runtime code, migrations, endpoints, credentials, maps, deployment, or hardware.
- **Database/backend/UI:** Documentation only.
- **Tests:** Documentation existence, required topics, privacy wording, M18 status, and no-runtime guardrails.
- **Security checks:** No secret-like values, real coordinates, raw payloads, or customer live tracking claims.
- **Acceptance:** Eight deliverables, README/ledger references, clean checks, draft PR.
- **Dependencies:** Latest `origin/main`.
- **Effort/risk:** 3–5 days; low.
- **Physical hardware:** No.

## M20A — Device Registry and History

- **Objective:** Establish the physical-device administrative source of truth.
- **Scope:** Extend `gps_devices`; effective vehicle links; installation/replacement; lifecycle; credential metadata; admin registry/detail.
- **Non-goals:** Telemetry ingestion, simulator, tracking points, vendor APIs, or hardware.
- **Database:** Add registry fields, effective-dated history, uniqueness, lifecycle values, and credential hash/key metadata.
- **Backend:** Admin-only CRUD/RPCs with safe `SECURITY DEFINER` search paths and audit actions.
- **UI:** Device Registry and Device Detail without maps or secret values.
- **Tests:** Duplicate identifiers, one active primary device/vehicle, reassignment history, replacement, stolen/suspension, credential rotation metadata, RLS, and audit.
- **Security checks:** Default deny; no frontend credential fields; safe audit details.
- **Acceptance:** Historical links cannot be rewritten; inactive devices are ineligible for proof; no credential value is readable.
- **Dependencies:** M19.
- **Effort/risk:** 6–9 days; medium schema/history risk.
- **Physical hardware:** No.
- **Delivery:** Separate PR from M20B.

## M20B — Canonical Contracts and Simulator

- **Objective:** Make the full processing path testable without hardware.
- **Scope:** Portable ingress contracts, adapter interface, canonical event/result, resolver inputs, deterministic simulator, all synthetic scenarios.
- **Non-goals:** Production ingress, database point writes, vendor selection, real routes, or real credentials.
- **Database:** Only synthetic fixture contracts where needed; no production telemetry migration in this PR.
- **Backend:** Host-neutral TypeScript contracts and simulator/test utilities.
- **UI:** None.
- **Tests:** Determinism, optional fields, event identity, sequence/reordering, delay, fault cases, comparison cases, immutable synthetic marking.
- **Security checks:** No real coordinates/routes/people; no production secret names or values.
- **Acceptance:** Every required scenario produces reproducible expected events and classifications.
- **Dependencies:** M20A identifiers/history contract.
- **Effort/risk:** 6–9 days; medium contract-completeness risk.
- **Physical hardware:** No.
- **Delivery:** Separate PR from M20A.

## M21 — Generic Secure HTTP Ingestion

- **Objective:** Ingest simulated physical telemetry securely through a portable HTTP host.
- **Scope:** Authentication, limits, normalization, idempotency, replay/sequence, event-time resolution, live freshness, delayed backfill, persistence, safe acknowledgement, load/cost decision.
- **Non-goals:** Selected vendor, direct TCP/UDP/MQTT, maps, customer live tracking, or production hardware.
- **Database:** Receipts, physical session/source fields, accepted point metadata, event-time history lookup, and indexes.
- **Backend:** First generic HTTP host plus portable core; Netlify is a candidate, not a mandate.
- **UI:** Minimal admin diagnostics only if required; primary health UI is M22.
- **Tests:** Authentication, suspension, duplicates, replay, bounded reordering, malformed values, active interval, delayed post-End-Work arrival, expired backfill, race locking, RLS, and no phone regression.
- **Security checks:** Body/rate limits, safe logs, server-only credentials, no payload-trusted work identity.
- **Acceptance:** Process a deterministic 60,000-event profile; sustain about two events/second; exercise roughly 17 events/second retry/burst; flush bounded reconnect batches from 25 devices; repeat batches three times with no duplicates; record latency/errors/concurrency/request/compute cost.
- **Dependencies:** M20A and M20B.
- **Effort/risk:** 10–15 days; high security and event-time correctness risk.
- **Physical hardware:** No.
- **Hosting gate:** Compare single-event versus batched traffic and decide whether Netlify remains suitable. If not, move `IngressHostV1` to an always-on/container service without changing adapters, canonical semantics, persistence, or tests.

## M22 — Physical Tracking Health and Alerts

- **Objective:** Give admins deterministic, actionable device health.
- **Scope:** Required operational rules, deduplication, alert lifecycle, registry/health/alert UI, audit.
- **Non-goals:** AI, customer notification, maps, or fraud decisions.
- **Database:** Versioned rule configuration and extended alerts.
- **Backend:** Rule evaluation and episode deduplication.
- **UI:** Device health, dual-source tracking health, active alerts, acknowledge/investigate/resolve actions.
- **Tests:** Every rule and state, repeated episodes, severity, false alarm, ignored, resolution, RLS, and no customer send.
- **Security checks:** Alert text contains no credentials/raw coordinates; admin-only access.
- **Acceptance:** Simulator cases yield the expected single alert episode and counts.
- **Dependencies:** M21.
- **Effort/risk:** 10–15 days; medium noise/calibration risk.
- **Physical hardware:** No.

## M23 — Phone Versus Device Comparison

- **Objective:** Compare phone and vehicle evidence conservatively during valid work.
- **Scope:** Time pairing, Haversine/accuracy handling, sustained mismatch, missing-source states, admin review.
- **Non-goals:** Driver fraud accusation, customer notification, route certification, or maps.
- **Database:** Comparison results/configuration and alert links as justified.
- **Backend:** Configurable pairing and sustained-rule engine.
- **UI:** Source comparison status and alert evidence summary.
- **Tests:** Together, sustained mismatch, isolated mismatch, low accuracy, phone missing, device missing, both missing, no overlap, delayed points excluded from live comparison.
- **Security checks:** Admin-only; no automatic adverse decision.
- **Acceptance:** Provisional ±60-second, 250 m, five-minute, three-pair assumptions are configurable and documented.
- **Dependencies:** M22 and phone/physical synthetic data.
- **Effort/risk:** 7–10 days; medium false-positive risk.
- **Physical hardware:** No.

## M24 — Selected Vendor or Device Adapter

- **Objective:** Connect one AP-approved device/vendor without changing the canonical core.
- **Scope:** Selected authentication, payload mapping, vendor errors, secret configuration, protocol evidence.
- **Non-goals:** Multiple vendors, customer live tracking, maps, or AI.
- **Database:** Adapter metadata only if the stable contract requires it.
- **Backend:** One adapter and any approved gateway host.
- **UI:** Existing registry/health surfaces only.
- **Tests:** Vendor fixtures, signature/auth failure, device identity, store-and-forward, reconnect, rate/volume, contract parity.
- **Security checks:** Credentials outside Git; rotation/revocation; compliance/AIS-140 review for actual vehicle use.
- **Acceptance:** Real device/network produces authenticated evidence with fake business data and no phone regression.
- **Dependencies:** AP device/vendor/protocol/SIM/installation/cost decisions; M21–M23.
- **Effort/risk:** 10–30 days; high vendor/protocol risk.
- **Physical hardware:** Yes.

## M25 — Statistical and AI/ML Readiness

- **Objective:** Add explainable anomaly signals only when reviewed data supports them.
- **Scope:** Data-quality assessment, statistical baselines, later model governance, human review.
- **Non-goals:** Automatic fraud accusation, final decisions, or coordinate-by-coordinate LLM processing.
- **Database/backend/UI:** Version, features, confidence, explanations, review outcome, and rule fallback only after approval.
- **Tests:** Temporal holdout, drift, missingness, confidence calibration, fallback, and human-review workflow.
- **Security checks:** Minimized training extracts, access controls, retention, no customer exposure.
- **Acceptance:** Evidence justifies the target anomaly class; deterministic rules remain available.
- **Dependencies:** Reviewed M22/M23 evidence and AP AI scope.
- **Effort/risk:** 15–30 days after data; high evidence/model risk.
- **Physical hardware:** Real reviewed data required for production claims.
- **Data note:** 4–8 weeks, 30 reviewed days/device/model, and 1,000 reviewed work-day sessions are provisional planning assumptions, not contractual or universal minimums.

## M26 — Real Physical Device Pilot Evidence

- **Objective:** Validate the selected device, network, installation, and Kootha workflow in pilot conditions.
- **Scope:** Real hardware/network; fake customer, driver, vehicle, and Ad Work data; pass/partial/blocked evidence.
- **Non-goals:** Real customer tracking, public links, maps, payments, or unsupported certification claims.
- **Database/backend/UI:** No new scope; validate prior milestones.
- **Tests:** Installation, auth, live points, delayed backfill, End Work, reconnect, alerts, comparison, review, retention, credential revocation, rollback.
- **Security checks:** Evidence excludes secrets, raw coordinates, identifiers, and payloads.
- **Acceptance:** Honest evidence matrix with unresolved risks and owners.
- **Dependencies:** M24, approved environment, physical device, SIM/network, operator.
- **Effort/risk:** 5–10 days plus procurement; high external dependency risk.
- **Physical hardware:** Yes.
