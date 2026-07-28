import { describe, expect, it } from "vitest";
import {
  createRequiredTelemetryScenariosV1,
  requiredTelemetryScenarioIdsV1,
  type TelemetryScenarioIdV1,
} from "./scenarios";
import { m22ScenarioSemanticsV1 } from "./m22ScenarioSemantics";

const exactRequiredRules: Readonly<
  Record<TelemetryScenarioIdV1, readonly string[]>
> = {
  "healthy-movement": [],
  "long-stop": ["long_stop"],
  "missing-heartbeat": ["heartbeat_missing"],
  "duplicate-retry": [],
  "changed-content-duplicate": ["identity_conflict"],
  "sequence-gap": ["sequence_gap"],
  "out-of-order-event": ["out_of_order"],
  "delayed-offline-backfill": [],
  "expired-delayed-backfill": ["delayed_backfill_expired"],
  "invalid-coordinate": ["invalid_coordinate"],
  "impossible-speed": ["impossible_speed"],
  "low-battery": ["battery_low"],
  "poor-gps": ["gps_fix_missing"],
  "poor-gsm": ["gsm_signal_weak"],
  "offline-reconnect": ["reconnect_or_live_recovery"],
  "telemetry-before-start-work": ["off_work_location_attempt"],
  "telemetry-after-end-work": ["captured_after_end_work"],
  "phone-and-physical-device-together": [],
  "phone-device-mismatch": [],
  "approved-sensor-observations": [],
  "unsupported-sensor-metric": ["unsupported_sensor_observation"],
};

describe("M20B scenario-to-M22 semantic integration", () => {
  const scenarios = createRequiredTelemetryScenariosV1({
    seed: 22,
    startAt: "2030-01-01T08:00:00.000Z",
  });

  it.each(requiredTelemetryScenarioIdsV1)(
    "%s has an exact executable M22 outcome, not an ID-only assertion",
    (id) => {
      const scenario = scenarios.find((candidate) => candidate.id === id);
      expect(scenario).toBeDefined();
      const semantic = m22ScenarioSemanticsV1[id];
      expect(semantic.requiredResults.map(({ ruleId }) => ruleId)).toEqual(
        exactRequiredRules[id],
      );
      expect(semantic.comparesPhoneAndPhysicalDevice).toBe(false);
      expect(semantic.alertOccurrenceDelta).toBe(
        semantic.requiredResults.filter(
          ({ effect }) => effect === "open_or_update",
        ).length,
      );
    },
  );

  it("keeps healthy movement, identical retries, and approved sensors quiet", () => {
    for (const id of [
      "healthy-movement",
      "duplicate-retry",
      "approved-sensor-observations",
    ] as const) {
      expect(m22ScenarioSemanticsV1[id]).toMatchObject({
        requiredResults: [],
        alertOccurrenceDelta: 0,
      });
    }
  });

  it("keeps delayed backfill historical and unable to clear live conditions", () => {
    expect(m22ScenarioSemanticsV1["delayed-offline-backfill"]).toMatchObject({
      freshness: "delayed_historical",
      requiredResults: [],
      mayClearLiveMissingConditions: false,
    });
    expect(m22ScenarioSemanticsV1["expired-delayed-backfill"]).toMatchObject({
      freshness: "delayed_historical",
      requiredResults: [
        {
          ruleId: "delayed_backfill_expired",
          effect: "open_or_update",
        },
      ],
      mayClearLiveMissingConditions: false,
    });
  });

  it("retains no rejected coordinate in the invalid-coordinate expectation", () => {
    expect(m22ScenarioSemanticsV1["invalid-coordinate"]).toMatchObject({
      requiredResults: [
        { ruleId: "invalid_coordinate", effect: "open_or_update" },
      ],
      retainsRejectedCoordinate: false,
    });
  });

  it("uses warning severity for the provisional low-battery scenario", () => {
    expect(m22ScenarioSemanticsV1["low-battery"].requiredResults).toEqual([
      {
        ruleId: "battery_low",
        effect: "open_or_update",
        severity: "warning",
      },
    ]);
  });

  it("clears offline conditions once without opening recovery-alert noise", () => {
    expect(m22ScenarioSemanticsV1["offline-reconnect"]).toMatchObject({
      requiredResults: [
        {
          ruleId: "reconnect_or_live_recovery",
          effect: "clear_condition",
        },
      ],
      alertOccurrenceDelta: 0,
      mayClearLiveMissingConditions: true,
    });
  });

  it("reserves phone mismatch and every cross-source comparison for M23", () => {
    expect(
      m22ScenarioSemanticsV1["phone-and-physical-device-together"],
    ).toMatchObject({
      requiredResults: [],
      comparesPhoneAndPhysicalDevice: false,
      reservedForM23Comparison: false,
    });
    expect(m22ScenarioSemanticsV1["phone-device-mismatch"]).toMatchObject({
      requiredResults: [],
      comparesPhoneAndPhysicalDevice: false,
      reservedForM23Comparison: true,
    });
  });
});
