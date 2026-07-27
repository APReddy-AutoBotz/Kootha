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
  "sequence-gap",
  "out-of-order-event",
  "delayed-offline-backfill",
  "expired-delayed-backfill",
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

export type TelemetryScenarioIdV1 =
  (typeof requiredTelemetryScenarioIdsV1)[number];

export interface SyntheticTelemetryScenarioFactoryConfigV1 {
  readonly seed: number;
  readonly startAt: string;
}

export interface SyntheticTelemetryScenarioContextV1 {
  readonly contractVersion: "1";
  readonly scenarioId: TelemetryScenarioIdV1;
  readonly seed: number;
  readonly synthetic: true;
  readonly registeredDevice: {
    readonly deviceExternalId: string;
    readonly lifecycleStatus: "active";
    readonly synthetic: true;
  };
  readonly vehicle: {
    readonly vehicleId: string;
    readonly synthetic: true;
  };
  readonly driver: {
    readonly driverId: string;
    readonly synthetic: true;
  };
  readonly adWork: {
    readonly adWorkId: string;
    readonly synthetic: true;
  };
  readonly assignment: {
    readonly assignmentId: string;
    readonly adWorkId: string;
    readonly vehicleId: string;
    readonly driverId: string;
    readonly effectiveFrom: string;
    readonly effectiveTo?: string;
    readonly synthetic: true;
  };
  readonly release: {
    readonly released: true;
    readonly releasedAt: string;
    readonly synthetic: true;
  };
  readonly deviceVehicleLink: {
    readonly linkId: string;
    readonly deviceExternalId: string;
    readonly vehicleId: string;
    readonly effectiveFrom: string;
    readonly effectiveTo?: string;
    readonly synthetic: true;
  };
  readonly workDay: {
    readonly workDayId: string;
    readonly serviceDate: string;
    readonly synthetic: true;
  };
  readonly execution: {
    readonly actualWorkStartedAt: string;
    readonly actualWorkEndedAt?: string;
    readonly synthetic: true;
  };
  readonly session?: {
    readonly sessionId: string;
    readonly source: "physical_device";
    readonly synthetic: true;
  };
}

export interface SyntheticPhonePointV1 {
  readonly contractVersion: "1";
  readonly source: "phone";
  readonly synthetic: true;
  readonly deviceExternalId: string;
  readonly sessionId?: string;
  readonly capturedAt: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracyMeters: number;
}

export type FutureRuleSignalIdV1 =
  | "long_stop"
  | "missing_heartbeat"
  | "sequence_gap"
  | "out_of_order"
  | "impossible_speed"
  | "low_battery"
  | "poor_gps"
  | "poor_gsm"
  | "offline"
  | "reconnect";

export type ExpectedCanonicalValidationV1 =
  | { readonly outcome: "valid" }
  | {
      readonly outcome: "rejected";
      readonly reasonCode: "canonical_event_invalid";
      readonly issue: {
        readonly path: "$.position.latitude";
        readonly code: "out_of_range";
      };
    };

export type ExpectedCaptureWindowV1 =
  | {
      readonly disposition: "not_applicable";
      readonly reasonCode: "not_applicable";
      readonly freshness: "not_applicable";
      readonly offlineBackfill: false;
    }
  | {
      readonly disposition: "accepted_live";
      readonly reasonCode: "inside_live_freshness_window";
      readonly freshness: "live";
      readonly offlineBackfill: false;
    }
  | {
      readonly disposition: "accepted_delayed";
      readonly reasonCode: "inside_delayed_backfill_window";
      readonly freshness: "degraded_freshness";
      readonly offlineBackfill: true;
    }
  | {
      readonly disposition: "rejected";
      readonly reasonCode:
        | "captured_before_work_start"
        | "captured_after_work_end"
        | "delayed_backfill_expired";
      readonly freshness: "not_applicable";
      readonly offlineBackfill: false;
    };

export type ExpectedDuplicateClassificationV1 =
  | "not_applicable"
  | "duplicate_identical_content"
  | "duplicate_conflict";

export type ExpectedPhoneDeviceRelationshipV1 =
  | "not_applicable"
  | "paired_match_fixture"
  | "sustained_mismatch_fixture";

export type ExpectedSensorValidationV1 =
  | "not_applicable"
  | "approved"
  | "unsupported";

export interface TelemetryScenarioExpectationsV1 {
  readonly canonicalValidation: ExpectedCanonicalValidationV1;
  readonly captureWindow: ExpectedCaptureWindowV1;
  readonly quality: "good" | "degraded" | "invalid";
  readonly duplicateClassification: ExpectedDuplicateClassificationV1;
  readonly expectedEligiblePointCount: number;
  readonly futureRuleSignalIds: readonly FutureRuleSignalIdV1[];
  readonly phoneDeviceRelationship: ExpectedPhoneDeviceRelationshipV1;
  readonly sensorValidation: ExpectedSensorValidationV1;
  readonly sequenceGap?: {
    readonly previous: number;
    readonly next: number;
    readonly missing: readonly number[];
  };
  readonly deliveryOrder?: "capture_order" | "out_of_order";
  readonly heartbeatGapMs?: number;
  readonly reconnectBatch?: {
    readonly offlineReceiptGapMs: number;
    readonly batchSize: number;
  };
  readonly minimumImpliedSpeedMetersPerSecond?: number;
}

export interface TelemetryScenarioV1 {
  readonly id: TelemetryScenarioIdV1;
  readonly description: string;
  readonly context: SyntheticTelemetryScenarioContextV1;
  readonly events: readonly CanonicalTelemetryEventV1[];
  readonly sensorObservations?: readonly CanonicalSensorObservationV1[];
  readonly rejectedSensorInputs?: readonly unknown[];
  readonly phonePoints?: readonly SyntheticPhonePointV1[];
  readonly expectations: TelemetryScenarioExpectationsV1;
  readonly synthetic: true;
}

const DEFAULT_CONFIG: SyntheticTelemetryScenarioFactoryConfigV1 = {
  seed: 20,
  startAt: "2030-01-01T08:00:00.000Z",
};
const BASE_LATITUDE = 1.2345;
const BASE_LONGITUDE = 2.3456;
const DELAYED_BACKFILL_WINDOW_MS = 86_400_000;

const BASE_EXPECTATIONS: TelemetryScenarioExpectationsV1 = {
  canonicalValidation: { outcome: "valid" },
  captureWindow: {
    disposition: "not_applicable",
    reasonCode: "not_applicable",
    freshness: "not_applicable",
    offlineBackfill: false,
  },
  quality: "good",
  duplicateClassification: "not_applicable",
  expectedEligiblePointCount: 1,
  futureRuleSignalIds: [],
  phoneDeviceRelationship: "not_applicable",
  sensorValidation: "not_applicable",
};

export const syntheticScenarioPolicyV1 = {
  liveFreshnessWindowMs: 120_000,
  delayedBackfillWindowMs: DELAYED_BACKFILL_WINDOW_MS,
  maximumFutureClockSkewMs: 30_000,
} as const;

/**
 * Creates in-memory test fixtures only. Context represents synthetic future
 * resolution results and is never authoritative ingress identity.
 */
export function createRequiredTelemetryScenariosV1(
  config: SyntheticTelemetryScenarioFactoryConfigV1 = DEFAULT_CONFIG,
): readonly TelemetryScenarioV1[] {
  assertFactoryConfig(config);
  const at = createTimeFactory(config.startAt);
  return requiredTelemetryScenarioIdsV1.map((id) => {
    const context = createContext(id, config, at);
    return createScenario(id, context, createEventFactory(context, at), at);
  });
}

type EventChangesV1 = Omit<
  Partial<CanonicalTelemetryEventV1>,
  "position" | "health"
> & {
  readonly position?: Partial<
    NonNullable<CanonicalTelemetryEventV1["position"]>
  >;
  readonly health?: Partial<
    NonNullable<CanonicalTelemetryEventV1["health"]>
  >;
};
type EventFactoryV1 = (
  sequence: number,
  changes?: EventChangesV1,
) => CanonicalTelemetryEventV1;

function createScenario(
  id: TelemetryScenarioIdV1,
  context: SyntheticTelemetryScenarioContextV1,
  event: EventFactoryV1,
  at: (offsetMs: number) => string,
): TelemetryScenarioV1 {
  switch (id) {
    case "healthy-movement":
      return fixture(
        id,
        "Valid live events represent regular synthetic movement.",
        context,
        [
          event(1),
          event(2, {
            position: {
              latitude: BASE_LATITUDE + 0.0002,
              longitude: BASE_LONGITUDE + 0.0002,
            },
          }),
          event(3, {
            position: {
              latitude: BASE_LATITUDE + 0.0004,
              longitude: BASE_LONGITUDE + 0.0004,
            },
          }),
        ],
        {
          ...BASE_EXPECTATIONS,
          captureWindow: {
            disposition: "accepted_live",
            reasonCode: "inside_live_freshness_window",
            freshness: "live",
            offlineBackfill: false,
          },
          expectedEligiblePointCount: 3,
        },
      );
    case "long-stop":
      return fixture(
        id,
        "Valid repeated coordinates over five minutes represent a sustained stop.",
        context,
        [
          event(1, { position: { speedMetersPerSecond: 0 } }),
          event(2, {
            capturedAt: at(315_000),
            receivedAt: at(315_000),
            normalizedAt: at(315_000),
            position: { speedMetersPerSecond: 0 },
          }),
        ],
        {
          ...BASE_EXPECTATIONS,
          expectedEligiblePointCount: 2,
          futureRuleSignalIds: ["long_stop"],
        },
      );
    case "missing-heartbeat":
      return fixture(
        id,
        "Two valid emissions have an exact deterministic heartbeat gap.",
        context,
        [event(1), event(30)],
        {
          ...BASE_EXPECTATIONS,
          expectedEligiblePointCount: 2,
          futureRuleSignalIds: ["missing_heartbeat"],
          heartbeatGapMs: 435_000,
        },
      );
    case "duplicate-retry": {
      const original = event(1);
      return fixture(
        id,
        "An identical retry reuses event identity and canonical content.",
        context,
        [original, { ...original }],
        {
          ...BASE_EXPECTATIONS,
          duplicateClassification: "duplicate_identical_content",
          expectedEligiblePointCount: 1,
        },
      );
    }
    case "changed-content-duplicate": {
      const original = event(1);
      return fixture(
        id,
        "A reused identity carries changed canonical content.",
        context,
        [
          original,
          {
            ...original,
            health: {
              heartbeat: true,
              ...original.health,
              batteryPercent: 4,
            },
          },
        ],
        {
          ...BASE_EXPECTATIONS,
          duplicateClassification: "duplicate_conflict",
          expectedEligiblePointCount: 1,
        },
      );
    }
    case "sequence-gap":
      return fixture(
        id,
        "Valid sequence values expose one deterministic missing value.",
        context,
        [event(1), event(3)],
        {
          ...BASE_EXPECTATIONS,
          expectedEligiblePointCount: 2,
          futureRuleSignalIds: ["sequence_gap"],
          sequenceGap: { previous: 1, next: 3, missing: [2] },
        },
      );
    case "out-of-order-event":
      return fixture(
        id,
        "Delivery order differs from valid captured and sequence order.",
        context,
        [
          event(3),
          event(2, {
            receivedAt: at(60_000),
            normalizedAt: at(60_000),
          }),
        ],
        {
          ...BASE_EXPECTATIONS,
          expectedEligiblePointCount: 2,
          futureRuleSignalIds: ["out_of_order"],
          deliveryOrder: "out_of_order",
        },
      );
    case "delayed-offline-backfill":
      return fixture(
        id,
        "An in-work capture arrives after End Work but inside backfill.",
        context,
        [
          event(1, {
            receivedAt: at(721_000),
            normalizedAt: at(721_000),
          }),
        ],
        {
          ...BASE_EXPECTATIONS,
          captureWindow: {
            disposition: "accepted_delayed",
            reasonCode: "inside_delayed_backfill_window",
            freshness: "degraded_freshness",
            offlineBackfill: true,
          },
          quality: "degraded",
        },
      );
    case "expired-delayed-backfill":
      return fixture(
        id,
        "An in-work capture arrives one millisecond after the backfill cutoff.",
        context,
        [
          event(1, {
            receivedAt: at(600_000 + DELAYED_BACKFILL_WINDOW_MS + 1),
            normalizedAt: at(600_000 + DELAYED_BACKFILL_WINDOW_MS + 1),
          }),
        ],
        {
          ...BASE_EXPECTATIONS,
          captureWindow: {
            disposition: "rejected",
            reasonCode: "delayed_backfill_expired",
            freshness: "not_applicable",
            offlineBackfill: false,
          },
          quality: "degraded",
          expectedEligiblePointCount: 0,
        },
      );
    case "invalid-coordinate":
      return fixture(
        id,
        "Latitude outside the canonical range exercises typed rejection.",
        context,
        [event(1, { position: { latitude: 91 } })],
        {
          ...BASE_EXPECTATIONS,
          canonicalValidation: {
            outcome: "rejected",
            reasonCode: "canonical_event_invalid",
            issue: { path: "$.position.latitude", code: "out_of_range" },
          },
          quality: "invalid",
          expectedEligiblePointCount: 0,
        },
      );
    case "impossible-speed":
      return fixture(
        id,
        "Two structurally valid events imply impossible movement.",
        context,
        [
          event(1),
          event(2, {
            position: {
              latitude: BASE_LATITUDE + 1,
              longitude: BASE_LONGITUDE,
            },
          }),
        ],
        {
          ...BASE_EXPECTATIONS,
          expectedEligiblePointCount: 2,
          futureRuleSignalIds: ["impossible_speed"],
          minimumImpliedSpeedMetersPerSecond: 1_000,
        },
      );
    case "low-battery":
      return fixture(
        id,
        "A valid five-percent battery reading is degraded rule evidence.",
        context,
        [event(1, { health: { batteryPercent: 5 } })],
        {
          ...BASE_EXPECTATIONS,
          quality: "degraded",
          futureRuleSignalIds: ["low_battery"],
        },
      );
    case "poor-gps":
      return fixture(
        id,
        "Valid weak accuracy, fix, and satellite values are GPS rule evidence.",
        context,
        [
          event(1, {
            position: { accuracyMeters: 750, satellites: 1 },
            health: { gpsFix: "none" },
          }),
        ],
        {
          ...BASE_EXPECTATIONS,
          quality: "degraded",
          futureRuleSignalIds: ["poor_gps"],
        },
      );
    case "poor-gsm":
      return fixture(
        id,
        "A valid -120 dBm reading is degraded GSM rule evidence.",
        context,
        [event(1, { health: { gsmSignalDbm: -120 } })],
        {
          ...BASE_EXPECTATIONS,
          quality: "degraded",
          futureRuleSignalIds: ["poor_gsm"],
        },
      );
    case "offline-reconnect":
      return fixture(
        id,
        "A deterministic receipt gap ends with a bounded reconnect batch.",
        context,
        [
          event(1),
          event(2, {
            receivedAt: at(242_000),
            normalizedAt: at(242_000),
          }),
          event(3, {
            receivedAt: at(242_000),
            normalizedAt: at(242_000),
          }),
        ],
        {
          ...BASE_EXPECTATIONS,
          expectedEligiblePointCount: 3,
          quality: "degraded",
          futureRuleSignalIds: ["offline", "reconnect"],
          reconnectBatch: { offlineReceiptGapMs: 227_000, batchSize: 2 },
        },
      );
    case "telemetry-before-start-work":
      return fixture(
        id,
        "Capture time precedes the synthetic actual Start Work boundary.",
        context,
        [event(1, { capturedAt: at(-1) })],
        {
          ...BASE_EXPECTATIONS,
          captureWindow: {
            disposition: "rejected",
            reasonCode: "captured_before_work_start",
            freshness: "not_applicable",
            offlineBackfill: false,
          },
          quality: "invalid",
          expectedEligiblePointCount: 0,
        },
      );
    case "telemetry-after-end-work":
      return fixture(
        id,
        "Capture time follows the synthetic actual End Work boundary.",
        context,
        [
          event(1, {
            capturedAt: at(600_001),
            receivedAt: at(600_001),
            normalizedAt: at(600_001),
          }),
        ],
        {
          ...BASE_EXPECTATIONS,
          captureWindow: {
            disposition: "rejected",
            reasonCode: "captured_after_work_end",
            freshness: "not_applicable",
            offlineBackfill: false,
          },
          quality: "invalid",
          expectedEligiblePointCount: 0,
        },
      );
    case "phone-and-physical-device-together":
      return phoneFixture(
        id,
        "Separate deterministic phone and simulator fixtures are paired test data.",
        context,
        [event(1), event(2)],
        [
          phonePoint(
            context,
            at(15_000),
            BASE_LATITUDE + 0.00002,
            BASE_LONGITUDE + 0.00002,
          ),
          phonePoint(
            context,
            at(30_000),
            BASE_LATITUDE + 0.00012,
            BASE_LONGITUDE + 0.00012,
          ),
        ],
        {
          ...BASE_EXPECTATIONS,
          expectedEligiblePointCount: 2,
          phoneDeviceRelationship: "paired_match_fixture",
        },
      );
    case "phone-device-mismatch":
      return phoneFixture(
        id,
        "Three deterministic pairs over five minutes form sustained mismatch test data.",
        context,
        [
          event(1),
          event(2, {
            capturedAt: at(165_000),
            receivedAt: at(165_000),
            normalizedAt: at(165_000),
          }),
          event(3, {
            capturedAt: at(315_000),
            receivedAt: at(315_000),
            normalizedAt: at(315_000),
          }),
        ],
        [
          phonePoint(
            context,
            at(15_000),
            BASE_LATITUDE + 0.02,
            BASE_LONGITUDE + 0.02,
          ),
          phonePoint(
            context,
            at(165_000),
            BASE_LATITUDE + 0.021,
            BASE_LONGITUDE + 0.021,
          ),
          phonePoint(
            context,
            at(315_000),
            BASE_LATITUDE + 0.022,
            BASE_LONGITUDE + 0.022,
          ),
        ],
        {
          ...BASE_EXPECTATIONS,
          expectedEligiblePointCount: 3,
          phoneDeviceRelationship: "sustained_mismatch_fixture",
        },
      );
    case "approved-sensor-observations": {
      const observations = [
        approvedNumberObservation(context, at(15_000)),
        approvedBooleanObservation(context, at(15_000)),
      ] as const;
      return {
        ...fixture(
          id,
          "Approved typed observations remain constrained and executable.",
          context,
          [event(1, { observations })],
          {
            ...BASE_EXPECTATIONS,
            sensorValidation: "approved",
          },
        ),
        sensorObservations: observations,
      };
    }
    case "unsupported-sensor-metric":
      return {
        ...fixture(
          id,
          "An unsupported vendor metric remains visible as rejected test input.",
          context,
          [],
          {
            ...BASE_EXPECTATIONS,
            expectedEligiblePointCount: 0,
            sensorValidation: "unsupported",
          },
        ),
        sensorObservations: [],
        rejectedSensorInputs: [
          {
            contractVersion: "1",
            metric: "vendor_free_form",
            value: "arbitrary",
            unit: "vendor_unit",
            capturedAt: at(15_000),
            deviceExternalId: context.registeredDevice.deviceExternalId,
            source: "simulator",
            quality: "good",
            normalizationVersion: "1",
            synthetic: true,
          },
        ],
      };
  }
}

function fixture(
  id: TelemetryScenarioIdV1,
  description: string,
  context: SyntheticTelemetryScenarioContextV1,
  events: readonly CanonicalTelemetryEventV1[],
  expectations: TelemetryScenarioExpectationsV1,
): TelemetryScenarioV1 {
  return {
    id,
    description,
    context,
    events,
    expectations,
    synthetic: true,
  };
}

function phoneFixture(
  id: TelemetryScenarioIdV1,
  description: string,
  context: SyntheticTelemetryScenarioContextV1,
  events: readonly CanonicalTelemetryEventV1[],
  phonePoints: readonly SyntheticPhonePointV1[],
  expectations: TelemetryScenarioExpectationsV1,
): TelemetryScenarioV1 {
  return {
    ...fixture(id, description, context, events, expectations),
    phonePoints,
  };
}

function createContext(
  scenarioId: TelemetryScenarioIdV1,
  config: SyntheticTelemetryScenarioFactoryConfigV1,
  at: (offsetMs: number) => string,
): SyntheticTelemetryScenarioContextV1 {
  const suffix = `${config.seed}-${scenarioId}`;
  const deviceExternalId = `synthetic-device-${suffix}`;
  const vehicleId = `synthetic-vehicle-${suffix}`;
  const driverId = `synthetic-driver-${suffix}`;
  const adWorkId = `synthetic-work-${suffix}`;
  return {
    contractVersion: "1",
    scenarioId,
    seed: config.seed,
    synthetic: true,
    registeredDevice: {
      deviceExternalId,
      lifecycleStatus: "active",
      synthetic: true,
    },
    vehicle: { vehicleId, synthetic: true },
    driver: { driverId, synthetic: true },
    adWork: { adWorkId, synthetic: true },
    assignment: {
      assignmentId: `synthetic-assignment-${suffix}`,
      adWorkId,
      vehicleId,
      driverId,
      effectiveFrom: at(-3_600_000),
      synthetic: true,
    },
    release: {
      released: true,
      releasedAt: at(-60_000),
      synthetic: true,
    },
    deviceVehicleLink: {
      linkId: `synthetic-link-${suffix}`,
      deviceExternalId,
      vehicleId,
      effectiveFrom: at(-3_600_000),
      synthetic: true,
    },
    workDay: {
      workDayId: `synthetic-work-day-${suffix}`,
      serviceDate: config.startAt.slice(0, 10),
      synthetic: true,
    },
    execution: {
      actualWorkStartedAt: at(0),
      actualWorkEndedAt: at(600_000),
      synthetic: true,
    },
    session: {
      sessionId: `synthetic-session-physical-${suffix}`,
      source: "physical_device",
      synthetic: true,
    },
  };
}

function createEventFactory(
  context: SyntheticTelemetryScenarioContextV1,
  at: (offsetMs: number) => string,
): EventFactoryV1 {
  return (sequence, changes = {}) => {
    const suffix = `${context.seed}-${context.scenarioId}-${sequence}`;
    const capturedAt = at(sequence * 15_000);
    const base: CanonicalTelemetryEventV1 = {
      contractVersion: "1",
      canonicalEventId: `synthetic-canonical-${suffix}`,
      vendorEventId: `synthetic-vendor-${suffix}`,
      idempotencyIdentity: `synthetic-idempotency-${suffix}`,
      deviceExternalId: context.registeredDevice.deviceExternalId,
      authenticatedDeviceExternalId:
        context.registeredDevice.deviceExternalId,
      adapter: { id: "deterministic_simulator", version: "1.0.0" },
      stream: {
        epoch: `synthetic-epoch-${context.seed}-${context.scenarioId}`,
        sequence,
      },
      capturedAt,
      receivedAt: capturedAt,
      normalizedAt: capturedAt,
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
      quality: "valid",
      provenance: {
        source: "simulator",
        normalizationVersion: "1",
        synthetic: true,
        rawPayloadHash: `synthetic-raw-payload-${suffix}`,
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
  };
}

function phonePoint(
  context: SyntheticTelemetryScenarioContextV1,
  capturedAt: string,
  latitude: number,
  longitude: number,
): SyntheticPhonePointV1 {
  return {
    contractVersion: "1",
    source: "phone",
    synthetic: true,
    deviceExternalId: `synthetic-phone-device-${context.seed}-${context.scenarioId}`,
    sessionId: `synthetic-session-phone-${context.seed}-${context.scenarioId}`,
    capturedAt,
    latitude,
    longitude,
    accuracyMeters: 12,
  };
}

function approvedNumberObservation(
  context: SyntheticTelemetryScenarioContextV1,
  capturedAt: string,
): CanonicalSensorObservationV1 {
  return {
    contractVersion: "1",
    metric: "fuel_level",
    value: 64,
    unit: "percentage",
    capturedAt,
    deviceExternalId: context.registeredDevice.deviceExternalId,
    source: "simulator",
    quality: "good",
    normalizationVersion: "1",
    synthetic: true,
  };
}

function approvedBooleanObservation(
  context: SyntheticTelemetryScenarioContextV1,
  capturedAt: string,
): CanonicalSensorObservationV1 {
  return {
    contractVersion: "1",
    metric: "ignition",
    value: true,
    unit: "boolean",
    capturedAt,
    deviceExternalId: context.registeredDevice.deviceExternalId,
    source: "simulator",
    quality: "good",
    normalizationVersion: "1",
    synthetic: true,
  };
}

function createTimeFactory(startAt: string): (offsetMs: number) => string {
  const baseTimeMs = Date.parse(startAt);
  return (offsetMs) => new Date(baseTimeMs + offsetMs).toISOString();
}

function assertFactoryConfig(
  config: SyntheticTelemetryScenarioFactoryConfigV1,
): void {
  if (
    !Number.isSafeInteger(config.seed) ||
    !Number.isFinite(Date.parse(config.startAt))
  ) {
    throw new Error("SIM_SCENARIO_CONFIG_INVALID");
  }
}
