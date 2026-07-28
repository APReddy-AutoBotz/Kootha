import type { TelemetryScenarioIdV1 } from "./scenarios";
import type {
  M22AlertSeverityV1,
  M22EvidenceFreshnessV1,
  M22RuleIdV1,
} from "./m22Contracts";

export interface M22ScenarioRuleExpectationV1 {
  readonly ruleId: M22RuleIdV1;
  readonly effect: "open_or_update" | "clear_condition";
  readonly severity?: M22AlertSeverityV1;
}

export interface M22ScenarioSemanticExpectationV1 {
  readonly freshness: M22EvidenceFreshnessV1;
  readonly requiredResults: readonly M22ScenarioRuleExpectationV1[];
  readonly optionalResults?: readonly M22ScenarioRuleExpectationV1[];
  readonly alertOccurrenceDelta: number;
  readonly mayClearLiveMissingConditions: boolean;
  readonly retainsRejectedCoordinate: boolean;
  readonly comparesPhoneAndPhysicalDevice: false;
  readonly reservedForM23Comparison: boolean;
}

const liveNoAlert: M22ScenarioSemanticExpectationV1 = {
  freshness: "live",
  requiredResults: [],
  alertOccurrenceDelta: 0,
  mayClearLiveMissingConditions: false,
  retainsRejectedCoordinate: false,
  comparesPhoneAndPhysicalDevice: false,
  reservedForM23Comparison: false,
};

/**
 * Executable M20B-to-M22 semantic oracle. This is deliberately declarative:
 * authoritative thresholds and evaluations remain in the M22 SQL functions.
 */
export const m22ScenarioSemanticsV1: Readonly<
  Record<TelemetryScenarioIdV1, M22ScenarioSemanticExpectationV1>
> = {
  "healthy-movement": liveNoAlert,
  "long-stop": {
    ...liveNoAlert,
    requiredResults: [{ ruleId: "long_stop", effect: "open_or_update" }],
    alertOccurrenceDelta: 1,
  },
  "missing-heartbeat": {
    ...liveNoAlert,
    freshness: "not_applicable",
    requiredResults: [
      { ruleId: "heartbeat_missing", effect: "open_or_update" },
    ],
    optionalResults: [
      { ruleId: "device_offline", effect: "open_or_update" },
    ],
    alertOccurrenceDelta: 1,
  },
  "duplicate-retry": liveNoAlert,
  "changed-content-duplicate": {
    ...liveNoAlert,
    freshness: "not_applicable",
    requiredResults: [
      { ruleId: "identity_conflict", effect: "open_or_update" },
    ],
    alertOccurrenceDelta: 1,
  },
  "sequence-gap": {
    ...liveNoAlert,
    requiredResults: [{ ruleId: "sequence_gap", effect: "open_or_update" }],
    alertOccurrenceDelta: 1,
  },
  "out-of-order-event": {
    ...liveNoAlert,
    requiredResults: [{ ruleId: "out_of_order", effect: "open_or_update" }],
    alertOccurrenceDelta: 1,
  },
  "delayed-offline-backfill": {
    ...liveNoAlert,
    freshness: "delayed_historical",
    mayClearLiveMissingConditions: false,
  },
  "expired-delayed-backfill": {
    ...liveNoAlert,
    freshness: "delayed_historical",
    requiredResults: [
      { ruleId: "delayed_backfill_expired", effect: "open_or_update" },
    ],
    alertOccurrenceDelta: 1,
  },
  "invalid-coordinate": {
    ...liveNoAlert,
    freshness: "not_applicable",
    requiredResults: [
      { ruleId: "invalid_coordinate", effect: "open_or_update" },
    ],
    alertOccurrenceDelta: 1,
    retainsRejectedCoordinate: false,
  },
  "impossible-speed": {
    ...liveNoAlert,
    requiredResults: [
      { ruleId: "impossible_speed", effect: "open_or_update" },
    ],
    alertOccurrenceDelta: 1,
  },
  "low-battery": {
    ...liveNoAlert,
    requiredResults: [
      {
        ruleId: "battery_low",
        effect: "open_or_update",
        severity: "warning",
      },
    ],
    alertOccurrenceDelta: 1,
  },
  "poor-gps": {
    ...liveNoAlert,
    requiredResults: [
      { ruleId: "gps_fix_missing", effect: "open_or_update" },
    ],
    alertOccurrenceDelta: 1,
  },
  "poor-gsm": {
    ...liveNoAlert,
    requiredResults: [
      { ruleId: "gsm_signal_weak", effect: "open_or_update" },
    ],
    alertOccurrenceDelta: 1,
  },
  "offline-reconnect": {
    ...liveNoAlert,
    requiredResults: [
      {
        ruleId: "reconnect_or_live_recovery",
        effect: "clear_condition",
      },
    ],
    optionalResults: [
      { ruleId: "heartbeat_missing", effect: "open_or_update" },
      { ruleId: "device_offline", effect: "open_or_update" },
    ],
    mayClearLiveMissingConditions: true,
  },
  "telemetry-before-start-work": {
    ...liveNoAlert,
    freshness: "not_applicable",
    requiredResults: [
      { ruleId: "off_work_location_attempt", effect: "open_or_update" },
    ],
    alertOccurrenceDelta: 1,
  },
  "telemetry-after-end-work": {
    ...liveNoAlert,
    freshness: "not_applicable",
    requiredResults: [
      { ruleId: "captured_after_end_work", effect: "open_or_update" },
    ],
    alertOccurrenceDelta: 1,
  },
  "phone-and-physical-device-together": liveNoAlert,
  "phone-device-mismatch": {
    ...liveNoAlert,
    reservedForM23Comparison: true,
  },
  "approved-sensor-observations": liveNoAlert,
  "unsupported-sensor-metric": {
    ...liveNoAlert,
    freshness: "not_applicable",
    requiredResults: [
      {
        ruleId: "unsupported_sensor_observation",
        effect: "open_or_update",
      },
    ],
    alertOccurrenceDelta: 1,
  },
};
