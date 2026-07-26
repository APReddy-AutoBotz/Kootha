import type {
  CanonicalSensorObservationV1,
  CanonicalTelemetryEventV1,
} from "./contracts";

export const requiredTelemetryScenarioIdsV1 = [
  "healthy-movement",
  "long-stop",
  "missing-heartbeat",
  "duplicate-retry",
  "changed-content-duplicate",
  "out-of-order-event",
  "delayed-offline-backfill",
  "invalid-coordinate",
  "impossible-speed",
  "low-battery",
  "poor-gps",
  "poor-gsm",
  "offline-reconnect",
  "telemetry-before-start-work",
  "telemetry-after-end-work",
  "phone-and-physical-device-together",
  "phone-device-mismatch",
  "approved-sensor-observations",
  "unsupported-sensor-metric",
] as const;

export type TelemetryScenarioIdV1 = (typeof requiredTelemetryScenarioIdsV1)[number];

export interface SyntheticPhonePointV1 {
  capturedAt: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  synthetic: true;
}

export interface TelemetryScenarioV1 {
  id: TelemetryScenarioIdV1;
  description: string;
  events: readonly CanonicalTelemetryEventV1[];
  sensorObservations?: readonly CanonicalSensorObservationV1[];
  rejectedSensorInputs?: readonly unknown[];
  phonePoints?: readonly SyntheticPhonePointV1[];
  expectedSignals: readonly string[];
  synthetic: true;
}

const BASE_TIME_MS = Date.parse("2030-01-01T08:00:00.000Z");
const BASE_LATITUDE = 1.2345;
const BASE_LONGITUDE = 2.3456;

export function createRequiredTelemetryScenariosV1(): readonly TelemetryScenarioV1[] {
  const scenarios: readonly TelemetryScenarioV1[] = [
    scenario("healthy-movement", "Regular synthetic movement with healthy telemetry.", [
      event(1),
      event(2, { position: { latitude: BASE_LATITUDE + 0.0002, longitude: BASE_LONGITUDE + 0.0002 } }),
      event(3, { position: { latitude: BASE_LATITUDE + 0.0004, longitude: BASE_LONGITUDE + 0.0004 } }),
    ], ["healthy", "moving"]),
    scenario("long-stop", "Repeated positions represent a sustained synthetic stop.", [
      event(1, { position: { speedMetersPerSecond: 0 } }),
      event(22, { position: { speedMetersPerSecond: 0 } }),
    ], ["long_stop"]),
    scenario("missing-heartbeat", "A long sequence-time gap represents a missing heartbeat.", [
      event(1),
      event(30),
    ], ["missing_heartbeat"]),
    scenario("duplicate-retry", "An identical retry reuses event identity and canonical content.", duplicateRetryEvents(), ["duplicate"]),
    scenario("changed-content-duplicate", "A reused identity carries changed canonical content.", changedContentDuplicateEvents(), ["identity_content_conflict"]),
    scenario("out-of-order-event", "Unseen sequence values arrive out of order.", [
      event(3),
      event(2, { receivedAt: isoAt(60), normalizedAt: isoAt(60) }),
    ], ["out_of_order"]),
    scenario("delayed-offline-backfill", "Captured events arrive later as synthetic store-and-forward telemetry.", [
      event(1, {
        receivedAt: isoAt(241),
        normalizedAt: isoAt(241),
      }),
    ], ["accepted_delayed", "offline_backfill", "degraded_freshness"]),
    scenario("invalid-coordinate", "Latitude outside the canonical range exercises validation.", [
      event(1, { position: { latitude: 91 } }),
    ], ["invalid_coordinate", "rejected"]),
    scenario("impossible-speed", "An impossible reported speed exercises deterministic rules.", [
      event(1, { position: { speedMetersPerSecond: 1_200 } }),
    ], ["impossible_speed"]),
    scenario("low-battery", "A low battery reading exercises device-health classification.", [
      event(1, { health: { batteryPercent: 5 } }),
    ], ["low_battery"]),
    scenario("poor-gps", "Weak accuracy and fix state represent poor GPS quality.", [
      event(1, { position: { accuracyMeters: 750, satellites: 1 }, health: { gpsFix: "none" } }),
    ], ["poor_gps"]),
    scenario("poor-gsm", "Low normalized network signal represents poor GSM quality.", [
      event(1, { health: { gsmSignalDbm: -120 } }),
    ], ["poor_gsm"]),
    scenario("offline-reconnect", "A receipt gap followed by delayed events represents reconnect flushing.", [
      event(1),
      event(2, { receivedAt: isoAt(122), normalizedAt: isoAt(122) }),
      event(3, { receivedAt: isoAt(122), normalizedAt: isoAt(122) }),
    ], ["offline", "reconnect", "bounded_flush"]),
    scenario("telemetry-before-start-work", "Capture time precedes the synthetic work boundary.", [
      event(1, { capturedAt: isoAt(-1) }),
    ], ["before_work_start", "rejected"]),
    scenario("telemetry-after-end-work", "Capture time follows the synthetic work boundary.", [
      event(1, { capturedAt: isoAt(121) }),
    ], ["after_work_end", "rejected"]),
    scenarioWithPhone("phone-and-physical-device-together", "Paired synthetic sources agree within accuracy bounds.", [
      event(1),
    ], [{
      capturedAt: isoAt(15),
      latitude: BASE_LATITUDE + 0.00002,
      longitude: BASE_LONGITUDE + 0.00002,
      accuracyMeters: 12,
      synthetic: true,
    }], ["paired_sources", "match"]),
    scenarioWithPhone("phone-device-mismatch", "Paired synthetic sources disagree beyond the provisional distance.", [
      event(1),
    ], [{
      capturedAt: isoAt(15),
      latitude: BASE_LATITUDE + 0.02,
      longitude: BASE_LONGITUDE + 0.02,
      accuracyMeters: 12,
      synthetic: true,
    }], ["paired_sources", "mismatch"]),
    scenarioWithSensors("approved-sensor-observations", "Approved typed observations remain constrained.", [
      approvedNumberObservation(),
      approvedBooleanObservation(),
    ], [], ["approved_sensor_observation"]),
    scenarioWithSensors("unsupported-sensor-metric", "Arbitrary vendor metrics remain outside the canonical registry.", [], [{
      metricKey: "vendor.free_form.metric",
      valueType: "controlled_text",
      controlledTextValue: "arbitrary",
      unit: "vendor_unit",
      capturedAt: isoAt(15),
      deviceExternalId: "synthetic-device-scenario",
      sourceType: "physical_device",
      quality: "valid",
      normalizationVersion: "1",
      synthetic: true,
    }], ["unsupported_sensor_metric", "rejected"]),
  ];

  return scenarios;
}

function scenario(
  id: TelemetryScenarioIdV1,
  description: string,
  events: readonly CanonicalTelemetryEventV1[],
  expectedSignals: readonly string[],
): TelemetryScenarioV1 {
  return { id, description, events, expectedSignals, synthetic: true };
}

function scenarioWithPhone(
  id: TelemetryScenarioIdV1,
  description: string,
  events: readonly CanonicalTelemetryEventV1[],
  phonePoints: readonly SyntheticPhonePointV1[],
  expectedSignals: readonly string[],
): TelemetryScenarioV1 {
  return { id, description, events, phonePoints, expectedSignals, synthetic: true };
}

function scenarioWithSensors(
  id: TelemetryScenarioIdV1,
  description: string,
  sensorObservations: readonly CanonicalSensorObservationV1[],
  rejectedSensorInputs: readonly unknown[],
  expectedSignals: readonly string[],
): TelemetryScenarioV1 {
  return {
    id,
    description,
    events: [event(1)],
    sensorObservations,
    rejectedSensorInputs,
    expectedSignals,
    synthetic: true,
  };
}

function duplicateRetryEvents(): readonly CanonicalTelemetryEventV1[] {
  const original = event(1);
  return [original, { ...original }];
}

function changedContentDuplicateEvents(): readonly CanonicalTelemetryEventV1[] {
  const original = event(1);
  return [original, { ...original, health: { ...original.health, heartbeat: true, batteryPercent: 4 } }];
}

type ScenarioEventChangesV1 = Omit<
  Partial<CanonicalTelemetryEventV1>,
  "position" | "health"
> & {
  position?: Partial<NonNullable<CanonicalTelemetryEventV1["position"]>>;
  health?: Partial<NonNullable<CanonicalTelemetryEventV1["health"]>>;
};

function event(
  sequence: number,
  changes: ScenarioEventChangesV1 = {},
): CanonicalTelemetryEventV1 {
  const suffix = `scenario-${sequence}`;
  const receivedAt = isoAt(sequence * 15);
  const base: CanonicalTelemetryEventV1 = {
    contractVersion: "1",
    canonicalEventId: `synthetic-canonical-${suffix}`,
    vendorEventId: `synthetic-vendor-${suffix}`,
    idempotencyIdentity: `synthetic-idempotency-${suffix}`,
    deviceExternalId: "synthetic-device-scenario",
    adapter: { id: "deterministic_simulator", version: "1.0.0" },
    stream: { epoch: "synthetic-epoch-scenario", sequence },
    capturedAt: receivedAt,
    receivedAt,
    normalizedAt: receivedAt,
    observedClockOffsetMs: 0,
    position: {
      latitude: BASE_LATITUDE,
      longitude: BASE_LONGITUDE,
      accuracyMeters: 8,
      speedMetersPerSecond: 24 / 3.6,
      headingDegrees: 45,
      satellites: 9,
    },
    health: {
      heartbeat: true,
      externalPower: true,
      batteryPercent: 88,
      gsmSignalDbm: -72,
      gpsFix: "three_dimensional",
    },
    provenance: {
      source: "simulator",
      normalizationVersion: "1",
      synthetic: true,
      canonicalPayloadHash: `synthetic-payload-${suffix}`,
    },
  };
  const { position, health, ...eventChanges } = changes;
  return {
    ...base,
    ...eventChanges,
    position: { ...base.position!, ...position },
    health: { ...base.health!, ...health },
  };
}
function approvedNumberObservation(): CanonicalSensorObservationV1 {
  return {
    contractVersion: "1",
    metric: "fuel_level",
    value: 64,
    unit: "percentage",
    capturedAt: isoAt(15),
    deviceExternalId: "synthetic-device-scenario",
    source: "simulator",
    quality: "good",
    normalizationVersion: "1",
    synthetic: true,
  };
}

function approvedBooleanObservation(): CanonicalSensorObservationV1 {
  return {
    contractVersion: "1",
    metric: "ignition",
    value: true,
    unit: "boolean",
    capturedAt: isoAt(15),
    deviceExternalId: "synthetic-device-scenario",
    source: "simulator",
    quality: "good",
    normalizationVersion: "1",
    synthetic: true,
  };
}
function isoAt(offsetSeconds: number): string {
  return new Date(BASE_TIME_MS + offsetSeconds * 1_000).toISOString();
}
