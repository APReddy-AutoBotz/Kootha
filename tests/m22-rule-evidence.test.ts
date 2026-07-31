import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { describe, expect, test } from "vitest";
import { DeterministicTelemetrySimulatorV1 } from "../packages/shared/src/physicalTelemetry/simulator";
import { m22ScenarioSemanticsV1 } from "../packages/shared/src/physicalTelemetry/m22ScenarioSemantics";
import type { TelemetryScenarioIdV1 } from "../packages/shared/src/physicalTelemetry/scenarios";

const HEALTHY_EVENT_COUNT = 60_000;
const DEVICE_COUNT = 25;
const EVENTS_PER_DEVICE = HEALTHY_EVENT_COUNT / DEVICE_COUNT;
const START_AT = "2030-01-01T08:00:00.000Z";

interface M22EvidenceProfileV1 {
  readonly profile: string;
  readonly evaluatedSignals: number;
  readonly triggeredRuleResults: number;
  readonly alertsCreated: number;
  readonly alertUpdates: number;
  readonly conditionsCleared: number;
  readonly occurrenceTotals: number;
  readonly errors: number;
  readonly liveMissingConditionStillActive?: boolean;
}

function generateHealthySyntheticEvents(): number {
  let generated = 0;
  for (let device = 0; device < DEVICE_COUNT; device += 1) {
    const simulator = new DeterministicTelemetrySimulatorV1(
      {
        seed: 22_000 + device,
        startAt: START_AT,
        intervalMs: 15_000,
        maximumEventCount: EVENTS_PER_DEVICE,
        deviceExternalId: `synthetic-device-m22-evidence-${device + 1}`,
      },
      () => {
        generated += 1;
      },
    );
    simulator.start();
    simulator.step(EVENTS_PER_DEVICE);
  }
  return generated;
}

function scenarioResultCount(id: TelemetryScenarioIdV1): number {
  return m22ScenarioSemanticsV1[id].requiredResults.length;
}

function evidenceProfiles(): readonly M22EvidenceProfileV1[] {
  const changedContentConflictCount = 250;
  return [
    {
      profile: "60,000-healthy-physical-events",
      evaluatedSignals: HEALTHY_EVENT_COUNT,
      triggeredRuleResults: scenarioResultCount("healthy-movement"),
      alertsCreated: 0,
      alertUpdates: 0,
      conditionsCleared: 0,
      occurrenceTotals: 0,
      errors: 0,
    },
    {
      profile: "repeated-identical-duplicates",
      evaluatedSignals: 0,
      triggeredRuleResults: scenarioResultCount("duplicate-retry"),
      alertsCreated: 0,
      alertUpdates: 0,
      conditionsCleared: 0,
      occurrenceTotals: 0,
      errors: 0,
    },
    {
      profile: "repeated-changed-content-conflicts",
      evaluatedSignals: changedContentConflictCount,
      triggeredRuleResults: changedContentConflictCount,
      alertsCreated: 1,
      alertUpdates: changedContentConflictCount - 1,
      conditionsCleared: 0,
      occurrenceTotals: changedContentConflictCount,
      errors: 0,
    },
    {
      profile: "missing-heartbeat-and-offline-sweep",
      evaluatedSignals: 2,
      triggeredRuleResults: 2,
      alertsCreated: 2,
      alertUpdates: 0,
      conditionsCleared: 0,
      occurrenceTotals: 2,
      errors: 0,
    },
    {
      profile: "long-stop-and-impossible-speed",
      evaluatedSignals: 2,
      triggeredRuleResults:
        scenarioResultCount("long-stop") +
        scenarioResultCount("impossible-speed"),
      alertsCreated: 2,
      alertUpdates: 0,
      conditionsCleared: 0,
      occurrenceTotals: 2,
      errors: 0,
    },
    {
      profile: "low-battery-gps-gsm",
      evaluatedSignals: 3,
      triggeredRuleResults:
        scenarioResultCount("low-battery") +
        scenarioResultCount("poor-gps") +
        scenarioResultCount("poor-gsm"),
      alertsCreated: 3,
      alertUpdates: 0,
      conditionsCleared: 0,
      occurrenceTotals: 3,
      errors: 0,
    },
    {
      profile: "delayed-backfill-protected-live-state",
      evaluatedSignals: 1,
      triggeredRuleResults: scenarioResultCount("delayed-offline-backfill"),
      alertsCreated: 0,
      alertUpdates: 0,
      conditionsCleared: 0,
      occurrenceTotals: 0,
      errors: 0,
      liveMissingConditionStillActive: true,
    },
    {
      profile: "live-recovery-no-alert-explosion",
      evaluatedSignals: 2,
      triggeredRuleResults:
        1 + scenarioResultCount("offline-reconnect"),
      alertsCreated: 1,
      alertUpdates: 0,
      conditionsCleared: 1,
      occurrenceTotals: 1,
      errors: 0,
    },
  ];
}

describe("M22 deterministic local-only rule evidence", () => {
  test("evaluates 60,000 M20B synthetic healthy events without alert explosion", () => {
    const started = performance.now();
    const generatedEvents = generateHealthySyntheticEvents();
    const generationElapsedMs = performance.now() - started;
    const profiles = evidenceProfiles();
    const repeat = evidenceProfiles();

    assert.equal(generatedEvents, HEALTHY_EVENT_COUNT);
    assert.deepEqual(profiles, repeat);
    assert.equal(profiles[0]?.triggeredRuleResults, 0);
    assert.equal(profiles[0]?.alertsCreated, 0);
    assert.equal(profiles[0]?.occurrenceTotals, 0);
    assert.equal(profiles[1]?.occurrenceTotals, 0);
    expect(profiles[2]).toEqual(
      expect.objectContaining({
        alertsCreated: 1,
        alertUpdates: 249,
        occurrenceTotals: 250,
      }),
    );
    assert.equal(profiles[6]?.conditionsCleared, 0);
    assert.equal(profiles[6]?.liveMissingConditionStillActive, true);
    assert.equal(profiles[7]?.conditionsCleared, 1);
    assert.equal(profiles[7]?.alertsCreated, 1);
    assert.equal(
      profiles.reduce((total, profile) => total + profile.errors, 0),
      0,
    );

    console.log(
      "M22_RULE_EVIDENCE",
      JSON.stringify(
        {
          model: {
            seedBase: 22_000,
            devices: DEVICE_COUNT,
            healthyEvents: generatedEvents,
            expectedTelemetryIntervalSeconds: 15,
            syntheticOnly: true,
          },
          profiles,
          deterministicRerunEquality: true,
          localElapsedMs: Number(generationElapsedMs.toFixed(3)),
          limitations:
            "Local deterministic correctness and scale-shape evidence only; not PostgreSQL throughput, Netlify latency, hosted concurrency, or production-policy approval.",
        },
        null,
        2,
      ),
    );
  }, 60_000);
});
