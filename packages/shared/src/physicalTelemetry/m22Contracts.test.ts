import { describe, expect, it } from "vitest";
import {
  M22_RULE_VERSION_V1,
  m22AlertSeveritiesV1,
  m22AlertSeveritySafeLabelsV1,
  m22AlertSourcesV1,
  m22AlertSourceSafeLabelsV1,
  m22AlertStatusesV1,
  m22AlertStatusSafeLabelsV1,
  m22RuleIdsV1,
  m22RuleSafeLabelsV1,
  type M22RuleEvaluationResultV1,
  type M22RuleSignalV1,
} from "./m22Contracts";

describe("M22 shared deterministic-rule contracts", () => {
  it("exports all 23 stable rule IDs exactly once in catalog order", () => {
    expect(m22RuleIdsV1).toEqual([
      "heartbeat_missing",
      "location_update_missing",
      "device_offline",
      "battery_low",
      "external_power_removed",
      "gps_fix_missing",
      "gsm_signal_weak",
      "long_stop",
      "impossible_speed",
      "identity_conflict",
      "sequence_conflict",
      "sequence_gap",
      "out_of_order",
      "invalid_coordinate",
      "unsupported_sensor_observation",
      "delayed_backfill_expired",
      "captured_after_end_work",
      "off_work_location_attempt",
      "vehicle_link_not_effective",
      "assignment_not_effective",
      "authority_ambiguous",
      "unknown_device_or_credential",
      "reconnect_or_live_recovery",
    ]);
    expect(new Set(m22RuleIdsV1).size).toBe(23);
    expect(Object.keys(m22RuleSafeLabelsV1)).toEqual(m22RuleIdsV1);
  });

  it("exports stable lifecycle, severity, source, and label catalogs", () => {
    expect(M22_RULE_VERSION_V1).toBe("m22-pilot-v1");
    expect(m22AlertSeveritiesV1).toEqual(["info", "warning", "critical"]);
    expect(m22AlertStatusesV1).toEqual([
      "new",
      "acknowledged",
      "investigating",
      "resolved",
      "false_alarm",
      "ignored",
    ]);
    expect(m22AlertSourcesV1).toEqual([
      "legacy",
      "physical_device_live",
      "physical_device_delayed",
      "health_sweep",
      "adapter_rejection",
      "authentication_failure",
      "recovery",
    ]);
    expect(Object.keys(m22AlertSeveritySafeLabelsV1)).toEqual([
      ...m22AlertSeveritiesV1,
    ]);
    expect(Object.keys(m22AlertStatusSafeLabelsV1)).toEqual([
      ...m22AlertStatusesV1,
    ]);
    expect(Object.keys(m22AlertSourceSafeLabelsV1)).toEqual([
      ...m22AlertSourcesV1,
    ]);
  });

  it("keeps a queue signal bounded to safe references and classifications", () => {
    const signal: M22RuleSignalV1 = {
      contractVersion: "1",
      signalId: "synthetic-signal-contract",
      ruleId: "unknown_device_or_credential",
      ruleVersion: M22_RULE_VERSION_V1,
      source: "authentication_failure",
      reasonCode: "authentication_failure_aggregated",
      occurredAt: "2030-01-01T08:00:00.000Z",
      freshness: "not_applicable",
      synthetic: true,
      context: {
        safeAuthenticationFingerprint: "synthetic-keyed-fingerprint",
      },
    };
    const serialized = JSON.stringify(signal);
    expect(serialized).not.toMatch(
      /latitude|longitude|coordinate|rawPayload|authorization|credentialKeyId|workCode|customer/i,
    );
    expect(Object.keys(signal.context)).toEqual([
      "safeAuthenticationFingerprint",
    ]);
  });

  it("represents delayed assessment without permitting a live recovery claim", () => {
    const result: M22RuleEvaluationResultV1 = {
      contractVersion: "1",
      signalId: "synthetic-signal-delayed",
      ruleId: "impossible_speed",
      ruleVersion: M22_RULE_VERSION_V1,
      source: "physical_device_delayed",
      disposition: "no_alert",
      reasonCode: "historical_assessment_only",
      freshness: "delayed_historical",
      conditionActive: false,
      synthetic: true,
      evaluatedAt: "2030-01-01T08:00:01.000Z",
    };
    expect(result).toMatchObject({
      freshness: "delayed_historical",
      reasonCode: "historical_assessment_only",
      conditionActive: false,
    });
  });

  it("labels recovery as a condition signal rather than a noisy new alert", () => {
    const result: M22RuleEvaluationResultV1 = {
      contractVersion: "1",
      signalId: "synthetic-signal-recovery",
      ruleId: "reconnect_or_live_recovery",
      ruleVersion: M22_RULE_VERSION_V1,
      source: "recovery",
      disposition: "condition_cleared",
      reasonCode: "recovery_alert_suppressed",
      freshness: "live",
      conditionActive: false,
      synthetic: true,
      evaluatedAt: "2030-01-01T08:00:01.000Z",
    };
    expect(result.disposition).toBe("condition_cleared");
    expect(result).not.toHaveProperty("alertId");
  });
});
