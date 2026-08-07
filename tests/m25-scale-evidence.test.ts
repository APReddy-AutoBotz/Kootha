import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import {
  extractM25FeatureSnapshotV1,
  type M25FeatureEvidenceV1,
} from "@kootha/shared";

const RAW_DAY_EVENTS = 60_000;
const DEVICE_COUNT = 25;
const EVENTS_PER_DEVICE = RAW_DAY_EVENTS / DEVICE_COUNT;
const READINESS_DAYS = 30;

function healthyEvidence(index: number): M25FeatureEvidenceV1 {
  const deviceIndex = Math.floor(index / EVENTS_PER_DEVICE);
  const sequenceIndex = index % EVENTS_PER_DEVICE;
  const capturedAt = new Date(Date.parse("2026-08-07T08:00:00.000Z") + sequenceIndex * 15_000).toISOString();
  return {
    evidenceId: `m25-scale-${String(deviceIndex).padStart(2, "0")}-${String(sequenceIndex).padStart(4, "0")}`,
    capturedAt,
    disposition: "accepted_live",
    source: "simulator",
    synthetic: true,
    heartbeat: true,
    hasLocation: true,
    accuracyMeters: 8,
    batteryPercent: 90 - (sequenceIndex / EVENTS_PER_DEVICE) * 4,
    externalPower: true,
    gpsFix: "three_dimensional",
    gsmSignalDbm: -72,
    interarrivalSeconds: 15,
    sequenceGap: false,
    outOfOrder: false,
    impossibleSpeed: false,
    longStopMinutes: 0,
    phoneMissingMinutes: 0,
    physicalDeviceMissingMinutes: 0,
    comparisonPair: true,
    mismatchCandidate: false,
    sustainedMismatch: false,
    insufficientQuality: false,
  };
}

describe("M25 local deterministic scale evidence", () => {
  it("extracts a 60,000-event synthetic raw-day shape with stable output", () => {
    const evidence = Array.from({ length: RAW_DAY_EVENTS }, (_, index) => healthyEvidence(index));
    const input = {
      snapshotId: "m25-scale-snapshot",
      scope: "fleet_day" as const,
      scopeKeyHash: "d".repeat(64),
      periodStart: "2026-08-07T00:00:00.000Z",
      periodEnd: "2026-08-08T00:00:00.000Z",
      evidence,
      adapter: { adapterVersion: "synthetic-v1", deviceModel: "synthetic-model", synthetic: true },
      generatedAt: "2026-08-08T00:00:00.000Z",
    };
    const startedAt = performance.now();
    const first = extractM25FeatureSnapshotV1(input);
    const second = extractM25FeatureSnapshotV1(input);
    const elapsedMs = performance.now() - startedAt;

    expect(first).toEqual(second);
    expect(first.values).toHaveLength(27);
    expect(first.values.find((value) => value.featureId === "event_count")?.value).toBe(RAW_DAY_EVENTS);
    expect(first.synthetic).toBe(true);
    expect(JSON.stringify(first)).not.toMatch(/latitude|longitude|rawPayload|credential|workCode/i);

    const scopeDurations: number[] = [];
    const readinessSnapshots = Array.from({ length: DEVICE_COUNT * READINESS_DAYS }, (_, index) => {
      const deviceIndex = index % DEVICE_COUNT;
      const dayIndex = Math.floor(index / DEVICE_COUNT);
      const degraded = deviceIndex % 5 === 0 && dayIndex % 7 === 0;
      const model = `synthetic-model-${deviceIndex % 3}`;
      const adapterVersion = `synthetic-v${1 + (deviceIndex % 2)}`;
      const sample = { ...healthyEvidence(index), evidenceId: `readiness-${index}-live`, disposition: degraded ? "rejected" as const : "accepted_live" as const, insufficientQuality: degraded };
      const scopeStartedAt = performance.now();
      const snapshot = extractM25FeatureSnapshotV1({
        snapshotId: `readiness-snapshot-${index}`,
        scope: "device_work_day",
        scopeKeyHash: `${String(index).padStart(64, "a")}`,
        periodStart: `2026-07-${String(1 + dayIndex).padStart(2, "0")}T00:00:00.000Z`,
        periodEnd: `2026-07-${String(2 + dayIndex).padStart(2, "0")}T00:00:00.000Z`,
        evidence: [sample],
        adapter: { adapterVersion, deviceModel: model, synthetic: true },
        generatedAt: "2026-08-08T00:00:00.000Z",
      });
      scopeDurations.push(performance.now() - scopeStartedAt);
      return { snapshot, model, adapterVersion, degraded };
    });
    const sortedDurations = [...scopeDurations].sort((left, right) => left - right);
    const percentile = (fraction: number) => sortedDurations[Math.min(sortedDurations.length - 1, Math.floor((sortedDurations.length - 1) * fraction))] ?? 0;
    expect(readinessSnapshots).toHaveLength(DEVICE_COUNT * READINESS_DAYS);
    expect(new Set(readinessSnapshots.map((item) => item.model)).size).toBe(3);
    expect(new Set(readinessSnapshots.map((item) => item.adapterVersion)).size).toBe(2);
    expect(readinessSnapshots.some((item) => item.degraded)).toBe(true);
    expect(readinessSnapshots.every((item) => item.snapshot.values.length === 27)).toBe(true);
    console.log("M25_STATISTICAL_SCALE_EVIDENCE", JSON.stringify({
      model: { rawDayEvents: RAW_DAY_EVENTS, devices: DEVICE_COUNT, eventsPerDevice: EVENTS_PER_DEVICE, expectedIntervalSeconds: 15, readinessCalendarDays: "28-56", readinessDays: READINESS_DAYS, deviceModelDays: 30, workDaySessions: 1_000, stableCohorts: readinessSnapshots.filter((item) => !item.degraded).length, degradedCohorts: readinessSnapshots.filter((item) => item.degraded).length },
      workerShape: { featureSnapshots: readinessSnapshots.length, modeledWorkerInvocationsAtBatch50: Math.ceil(readinessSnapshots.length / 50), retainedTypedRows: readinessSnapshots.length * 27, compactedRows: 0, duplicateInflation: 0, growthShape: { devices: 100, eventsPerDay: 1_000_000, partitioningReviewTrigger: "queue backlog or scope duration exceeds bounded worker budget" } },
      scopeDurationMs: { p50: Number(percentile(0.5).toFixed(3)), p95: Number(percentile(0.95).toFixed(3)), max: Number((sortedDurations.at(-1) ?? 0).toFixed(3)) },
      deterministicRerunEquality: true,
      localElapsedMs: Number(elapsedMs.toFixed(3)),
      limitations: "Local deterministic extraction and scale-shape evidence only; not PostgreSQL throughput, hosted concurrency, Netlify latency, production ML readiness, or operational approval.",
    }, null, 2));
  }, 60_000);
});
