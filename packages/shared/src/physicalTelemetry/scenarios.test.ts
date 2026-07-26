import { describe, expect, it } from "vitest";
import {
  createRequiredTelemetryScenariosV1,
  requiredTelemetryScenarioIdsV1,
  type TelemetryScenarioIdV1,
} from "./scenarios";

const scenarios = createRequiredTelemetryScenariosV1();

describe("required M20B scenario catalog", () => {
  it("contains each required scenario exactly once", () => {
    expect(scenarios).toHaveLength(19);
    expect(scenarios.map(({ id }) => id)).toEqual(requiredTelemetryScenarioIdsV1);
    expect(new Set(scenarios.map(({ id }) => id)).size).toBe(19);
  });

  it.each(requiredTelemetryScenarioIdsV1)("individually guards scenario %s", (id) => {
    assertSyntheticScenario(id);
  });

  it.each([
    "healthy-movement",
    "duplicate-retry",
    "changed-content-duplicate",
    "out-of-order-event",
    "delayed-offline-backfill",
    "offline-reconnect",
    "phone-and-physical-device-together",
    "phone-device-mismatch",
  ] as const)("keeps required provenance internally consistent for %s", (id) => {
    const scenario = getScenario(id);
    expect(
      scenario.events.every(
        ({ adapter, deviceExternalId, provenance }) =>
          adapter.id === "deterministic_simulator" &&
          adapter.version === "1.0.0" &&
          deviceExternalId.startsWith("synthetic-") &&
          provenance.source === "simulator" &&
          provenance.synthetic,
      ),
    ).toBe(true);
  });

  it("models identical retries with stable identity and unchanged content", () => {
    const duplicate = getScenario("duplicate-retry");
    expect(duplicate.events[0]).toEqual(duplicate.events[1]);
  });

  it("models changed-content identity conflicts without changing retry identity", () => {
    const conflict = getScenario("changed-content-duplicate");
    expect(conflict.events[0]?.idempotencyIdentity).toBe(conflict.events[1]?.idempotencyIdentity);
    expect(conflict.events[0]).not.toEqual(conflict.events[1]);
  });

  it("keeps paired phone context synthetic and outside the authoritative device payload", () => {
    const paired = getScenario("phone-and-physical-device-together");
    expect(paired.phonePoints?.every(({ synthetic }) => synthetic)).toBe(true);
    expect(paired.events[0]).not.toHaveProperty("driverId");
    expect(paired.events[0]).not.toHaveProperty("workId");
  });

  it("separates approved canonical observations from unsupported raw inputs", () => {
    const approved = getScenario("approved-sensor-observations");
    const unsupported = getScenario("unsupported-sensor-metric");
    expect(approved.sensorObservations).toHaveLength(2);
    expect(unsupported.sensorObservations).toEqual([]);
    expect(unsupported.rejectedSensorInputs).toHaveLength(1);
  });

  it("returns a fresh deterministic catalog so callers cannot mutate later runs", () => {
    const first = createRequiredTelemetryScenariosV1();
    const second = createRequiredTelemetryScenariosV1();
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });
});

function assertSyntheticScenario(id: TelemetryScenarioIdV1): void {
  const matching = scenarios.filter((scenario) => scenario.id === id);
  expect(matching).toHaveLength(1);
  expect(matching[0]?.synthetic).toBe(true);
  expect(matching[0]?.description.length).toBeGreaterThan(0);
  expect(matching[0]?.expectedSignals.length).toBeGreaterThan(0);
  expect(matching[0]?.events.every(({ provenance }) => provenance.synthetic)).toBe(true);
  expect(
    matching[0]?.events.every(
      ({ provenance }) => provenance.source === "simulator",
    ),
  ).toBe(true);
}

function getScenario(id: TelemetryScenarioIdV1) {
  const result = scenarios.find((scenario) => scenario.id === id);
  if (!result) {
    throw new Error(`Missing scenario: ${id}`);
  }
  return result;
}
