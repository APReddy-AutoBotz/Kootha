# M20B Canonical Contracts and Deterministic Simulator

M20B is completed following merge and post-merge baseline verification.

M20B implements a host-neutral TypeScript contract and deterministic test-simulator layer for future physical-device telemetry work. Eligible or accepted means only pure-layer eligibility, never persistence.

## Public contract surface

The shared package exports `IngressHostV1`, `TelemetryAdapterV1` (which accepts `unknown` and requires runtime validation), `CanonicalTelemetryEventV1`, constrained `CanonicalSensorObservationV1`, discriminated `TelemetryProcessingResultV1`, identity/content helpers, pure capture-decision contracts, and stable reason codes. Payload vehicle, driver, work, assignment, and tracking-session identifiers are never authoritative.

## Identity and event time

Stable canonical serialization is independent of key order, random values, and wall-clock reads. A safe source event ID namespaced by adapter and authenticated device is preferred; a deterministic fallback covers sources without one. The same identity and content is an identical duplicate. The same identity with changed content is a conflict and is never silently overwritten.

Device-captured time is untrusted. Capture before Start Work or after End Work is rejected; the Start and End boundaries are inclusive. Recent receipt never makes an old capture live. A late in-work capture is eligible only through the inclusive delayed-backfill cutoff, while excessive future skew is rejected. M21 owns authentication, history resolution, replay persistence, storage, and ingress hosting.

## Deterministic simulator

The simulator uses an explicit seed, synthetic identities and coordinates, virtual start time, emission interval, device clock offset, and network delay. Tests use `start`, `stop`, `step`, `advance`, and `flush`; there is no sleep, real timer, network, database, credential, or hardware dependency.

Simulator provenance is a one-way invariant: `source: "simulator"` requires `synthetic: true` at both canonical-event and sensor-observation validation boundaries. Synthetic physical-device-shaped fixtures remain explicitly synthetic and retain `source: "physical_device"`; they are not phone telemetry, authenticated device context, persisted proof, or production evidence. Future M21 hosting must authenticate and resolve real devices, but it cannot weaken this M20B marker.

The typed catalog contains healthy movement, long stop, missing heartbeat, duplicate retry, changed-content duplicate, sequence gap, out-of-order event, delayed offline backfill, expired delayed backfill, invalid coordinate, impossible speed, low battery, poor GPS, poor GSM, offline/reconnect, telemetry before Start Work, telemetry after End Work, phone and physical device together, phone/device mismatch, approved sensor observations, and unsupported sensor metric. Every ID has executable semantic assertions for its applicable validation, event-time, duplicate, ordering, health, point-eligibility, sensor, or source-separation behavior. Rule and comparison expectations are bounded test data only; M22 owns alert evaluation and M23 owns production phone/device comparison.

`SyntheticTelemetryScenarioContextV1` supplies deterministic, obviously synthetic registry, device-to-vehicle link, assignment, release, work-day, execution-window, and optional session fixtures. It is scenario/test context only, is never authoritative ingress identity, and is never copied into a canonical event. The same seed, scenario ID, configuration, and virtual starting time reproduce the same context and events.

`SyntheticPhonePointV1` explicitly uses `source: "phone"`, a separate `synthetic-phone-device-*` identity, and an optional `synthetic-session-*` identity. Phone fixtures stay outside `CanonicalTelemetryEventV1` and in a collection separate from physical-device-shaped simulator events. Match and sustained-mismatch relationships remain typed fixture expectations only; M20B performs no production comparison.

The impossible-speed fixture uses two independently valid canonical events whose legal coordinates and deterministic captured times imply impossible movement. Only the test calculates that implied speed; no M22 movement-rule runtime is implemented.

## Security, privacy, and non-goals

Validation returns safe typed failures without raw payloads. Provenance and sensor observations are bounded, and fixtures contain no real identity, route, or secret. M20B adds no Supabase migration or telemetry endpoint, no `location_points` write or tracking-session creation, no credential runtime, vendor adapter, hardware connection, maps, customer live tracking, operational alert runtime, production phone/device comparison, or AI runtime. Existing Phone Location Proof and M20A security controls are unchanged.

M18 remains incomplete and in progress. M20A, M20B, M21, and M22 are complete. M23 is In Progress. M24 through M26 remain Not Started.
