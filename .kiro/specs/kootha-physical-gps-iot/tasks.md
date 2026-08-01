# Kootha Physical GPS and IoT Tasks

Spec ID: `kootha-physical-gps-iot`

Status values:

- `[ ]` Not started
- `[~]` In progress
- `[x]` Completed
- `[!]` Blocked
- `[?]` AP decision

M19 is a planning-only stream. M18 real-device Phone Location Proof evidence remains incomplete in the existing ledger.

## M19 — Architecture and Requirements

- [x] M19-T001 Audit the current device, vehicle, assignment, tracking, review, security, retention, and customer-summary foundation.
  - Requirements: all
- [x] M19-T002 Compare vendor cloud, direct device, and hybrid adapter architectures.
  - Requirements: ING-SEC-001, ADAPTER-001, COST-001
- [x] M19-T003 Define canonical contracts, event-time privacy, delayed backfill, End Work races, replay, and sequence handling.
  - Requirements: TEL-NORM-001, ING-SEC-004, PRIVACY-001 through PRIVACY-004
- [x] M19-T004 Define registry, simulator, health, comparison, admin, retention, scaling, cost, and AI roadmaps.
  - Requirements: DEV-REG-001 through AI-READY-002
- [x] M19-T005 Record AP decisions, implementation milestones, threat model, and planning guardrails.
  - Requirements: ING-SEC-002, RETENTION-001, COST-001, AI-READY-001

## M20A — Device Registry and History

- [x] M20A-T001 Design and migrate the existing `gps_devices` registry without creating a duplicate master.
  - Requirements: DEV-REG-001, DEV-REG-002
- [x] M20A-T002 Add effective vehicle-link and installation/replacement history.
  - Requirements: DEV-REG-003, DEV-REG-004
- [x] M20A-T003 Add credential hash/rotation metadata with no client-readable secrets.
  - Requirements: ING-SEC-002, ING-SEC-003
- [x] M20A-T004 Add admin-only RLS, safe audit actions, registry, and device detail UI.
  - Requirements: ADMIN-001
- [x] M20A-T005 Add schema, RLS, duplicate, history, lifecycle, and audit tests.
  - Requirements: DEV-REG-001 through DEV-REG-004

## M20B — Contracts and Simulator

[x] M20B is completed following merge and post-merge baseline verification.

- [x] M20B-T001 Add host-independent ingress, adapter, canonical event, sensor-observation extension, processing-result, and resolver contracts.
  - Requirements: ING-SEC-001, TEL-NORM-001, TEL-NORM-003, ADAPTER-001
- [x] M20B-T002 Build deterministic synthetic device, route, clock, sequence, and delay generators.
  - Requirements: SIM-001
- [x] M20B-T003 Implement every healthy, fault, backfill, privacy, and comparison scenario.
  - Requirements: SIM-002
- [x] M20B-T004 Prove synthetic marking and absence of real routes, people, and production credentials.
  - Requirements: SIM-001, PRIVACY-004

M18 remains incomplete and in progress. M20A, M20B, M21, and M22 are complete. M23 is In Progress. M24 through M26 remain Not Started.

## M21 — Generic Secure HTTP Ingestion

- [x] M21-T001 Implement portable generic HTTP authentication, parsing, normalization, safe acknowledgement, limits, and throttling.
  - Requirements: ING-SEC-001, ING-SEC-002, ING-SEC-005, ADAPTER-001
- [x] M21-T002 Implement event identity, replay, sequence, and duplicate controls.
  - Requirements: ING-SEC-004
- [x] M21-T002A Measure constant-time token/digest verification cost at sustained and burst telemetry frequency.
  - Requirements: ING-SEC-002, SCALE-001
- [x] M21-T003 Implement event-time work resolution, live freshness, delayed backfill, and End Work race handling.
  - Requirements: PRIVACY-001 through PRIVACY-004, WORK-LINK-001
- [x] M21-T004 Reuse physical tracking sessions and location points without changing phone behavior.
  - Requirements: WORK-LINK-002
- [x] M21-T005 Run 60,000-event, sustained, ten-times burst, reconnect, and three-retry duplicate evidence.
  - Requirements: SCALE-001
- [x] M21-T006 Record request/compute cost, batching comparison, Netlify suitability decision, and portable migration path.
  - Requirements: ING-SEC-001, COST-001, SCALE-001

## M22 — Tracking Health and Alerts

- [x] M22-T001 Add versioned deterministic device/data-quality rules.
  - Requirements: HEALTH-001
- [x] M22-T002 Extend alert deduplication, lifecycle, context, notes, and audit behavior.
  - Requirements: HEALTH-002
- [x] M22-T003 Add admin dual-source health, device status, and alert screens without maps.
  - Requirements: ADMIN-002
- [x] M22-T004 Test every rule, repeat episode, resolution, RLS, and customer-notification guardrail.
  - Requirements: HEALTH-001, HEALTH-002

## M23 — Phone Versus Device Comparison

- [~] M23-T001 Implement active-work, accuracy-aware time pairing and Haversine distance.
  - Requirements: COMPARE-001
- [~] M23-T002 Add sustained mismatch, missing-source, and comparison-unavailable rules.
  - Requirements: COMPARE-001
- [~] M23-T003 Add admin review status and synthetic comparison tests.
  - Requirements: ADMIN-002, COMPARE-001

## M24 — Selected Vendor or Device Adapter

- [?] M24-T001 AP selects device/vendor, protocol, SIM, installation, compliance position, and cost.
- [ ] M24-T002 Implement one adapter against the stable contract with credentials outside Git.
  - Requirements: ADAPTER-001, ING-SEC-002
- [ ] M24-T003 Record physical hardware/network evidence honestly.
  - Requirements: DEV-REG-004, SCALE-001

## M25 — Statistical and AI/ML Readiness

- [ ] M25-T001 Assess observed event quality, label availability, anomaly targets, and provisional data assumptions.
  - Requirements: AI-READY-001, AI-READY-002
- [ ] M25-T002 Add explainable statistical signals before any production ML claim.
  - Requirements: AI-READY-001
- [ ] M25-T003 Add model/version/confidence/explanation, rule fallback, and human-review evidence only when justified.
  - Requirements: AI-READY-001

## M26 — Real Physical Device Pilot Evidence

- [?] M26-T001 AP provides selected hardware, network/SIM, installation, and approved test environment.
- [ ] M26-T002 Run the end-to-end pilot with fake business data and real device/network telemetry.
- [ ] M26-T003 Record pass, partial, or blocked evidence without real coordinates, secrets, or unsupported claims.
