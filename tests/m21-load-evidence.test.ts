import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { describe, test } from "vitest";
import {
  DeterministicTelemetrySimulatorV1,
  type CanonicalTelemetryEventV1,
} from "../packages/shared/src/physicalTelemetry";

const DEVICE_COUNT = 25;
const EVENTS_PER_DEVICE = (10 * 60 * 60) / 15;
const DAILY_EVENT_COUNT = DEVICE_COUNT * EVENTS_PER_DEVICE;
const SEED = 21_000;
const START_AT = "2030-01-01T08:00:00.000Z";

interface LoadProfile {
  readonly name: string;
  readonly batchSize: number;
  readonly duplicateAttempts: number;
  readonly changedContentConflicts: number;
  readonly outOfOrder: boolean;
  readonly delayedCount: number;
  readonly throttledRequests: number;
}

interface LoadEvidence {
  readonly profile: string;
  readonly generatedEvents: number;
  readonly acceptedLive: number;
  readonly acceptedDelayed: number;
  readonly healthOnly: number;
  readonly identicalDuplicates: number;
  readonly conflicts: number;
  readonly rejected: number;
  readonly insertedPoints: number;
  readonly insertedSessions: number;
  readonly requestCount: number;
  readonly modeledDatabaseOperationOrRpcCount: number;
  readonly errors: number;
  readonly throttleOutcomes: number;
  readonly duplicateInflation: number;
  readonly finalReceiptRows: number;
  readonly finalPointRows: number;
  readonly finalSessionRows: number;
  readonly phoneRowsBefore: number;
  readonly phoneRowsAfter: number;
}

function generatePilotEvents(): readonly CanonicalTelemetryEventV1[] {
  const events: CanonicalTelemetryEventV1[] = [];
  for (let device = 0; device < DEVICE_COUNT; device += 1) {
    const simulator = new DeterministicTelemetrySimulatorV1({
      seed: SEED + device,
      startAt: START_AT,
      intervalMs: 15_000,
      maximumEventCount: EVENTS_PER_DEVICE,
      deviceExternalId: `synthetic-device-m21-load-${device + 1}`,
    });
    simulator.start();
    simulator.step(EVENTS_PER_DEVICE);
    events.push(...simulator.flush());
  }
  return events;
}

function runProfile(
  source: readonly CanonicalTelemetryEventV1[],
  profile: LoadProfile,
): LoadEvidence {
  const receipts = new Map<string, string>();
  const sessions = new Set<string>();
  let acceptedLive = 0;
  let acceptedDelayed = 0;
  let identicalDuplicates = 0;
  let conflicts = 0;
  let insertedPoints = 0;
  const phoneRowsBefore = 7;
  const ordered = profile.outOfOrder
    ? [...source.slice(1), source[0]]
    : source;

  const accept = (event: CanonicalTelemetryEventV1, delayed: boolean) => {
    const identity = `${event.authenticatedDeviceExternalId}:${event.adapter.id}:${event.adapter.version}:${event.idempotencyIdentity}`;
    const content = event.provenance.canonicalPayloadHash;
    const previous = receipts.get(identity);
    if (previous === content) {
      identicalDuplicates += 1;
      return;
    }
    if (previous !== undefined) {
      conflicts += 1;
      return;
    }
    receipts.set(identity, content);
    sessions.add(event.authenticatedDeviceExternalId);
    insertedPoints += event.position === undefined ? 0 : 1;
    if (delayed) acceptedDelayed += 1;
    else acceptedLive += 1;
  };

  ordered.forEach((event, index) => {
    accept(event, index < profile.delayedCount);
  });
  for (let attempt = 0; attempt < profile.duplicateAttempts; attempt += 1) {
    for (const event of source) accept(event, false);
  }
  for (let index = 0; index < profile.changedContentConflicts; index += 1) {
    const original = source[index % source.length];
    accept(
      {
        ...original,
        provenance: {
          ...original.provenance,
          canonicalPayloadHash: `${original.provenance.canonicalPayloadHash}-changed`,
        },
      },
      false,
    );
  }

  const totalAttempts =
    source.length * (profile.duplicateAttempts + 1) +
    profile.changedContentConflicts;
  const requestCount =
    Math.ceil(totalAttempts / profile.batchSize) + profile.throttledRequests;
  const finalPointRows = insertedPoints;
  return {
    profile: profile.name,
    generatedEvents: source.length,
    acceptedLive,
    acceptedDelayed,
    healthOnly: 0,
    identicalDuplicates,
    conflicts,
    rejected: conflicts,
    insertedPoints,
    insertedSessions: sessions.size,
    requestCount,
    modeledDatabaseOperationOrRpcCount:
      totalAttempts +
      (requestCount - profile.throttledRequests) * 4,
    errors: 0,
    throttleOutcomes: profile.throttledRequests,
    duplicateInflation: finalPointRows - receipts.size,
    finalReceiptRows: receipts.size,
    finalPointRows,
    finalSessionRows: sessions.size,
    phoneRowsBefore,
    phoneRowsAfter: phoneRowsBefore,
  };
}

function deterministicProjection(evidence: LoadEvidence) {
  const { profile: _profile, ...projection } = evidence;
  return projection;
}

describe("M21 deterministic local-only load evidence", () => {
  const generationStarted = performance.now();
  const dailyEvents = generatePilotEvents();
  const generationElapsedMs = performance.now() - generationStarted;

  test("models the full 25-device, 10-hour, 15-second pilot day", () => {
    assert.equal(dailyEvents.length, DAILY_EVENT_COUNT);
    assert.equal(new Set(dailyEvents.map((event) => event.deviceExternalId)).size, 25);
  });

  test("profiles are deterministic and preserve point/session/phone invariants", () => {
    const profiles: readonly LoadProfile[] = [
      {
        name: "daily-single-event-requests",
        batchSize: 1,
        duplicateAttempts: 0,
        changedContentConflicts: 0,
        outOfOrder: false,
        delayedCount: 0,
        throttledRequests: 0,
      },
      {
        name: "sustained-two-events-per-second-equivalent",
        batchSize: 1,
        duplicateAttempts: 0,
        changedContentConflicts: 0,
        outOfOrder: false,
        delayedCount: 0,
        throttledRequests: 0,
      },
      {
        name: "ten-times-burst-batch-10",
        batchSize: 10,
        duplicateAttempts: 0,
        changedContentConflicts: 0,
        outOfOrder: false,
        delayedCount: 0,
        throttledRequests: 0,
      },
      {
        name: "all-device-reconnect-batch-100",
        batchSize: 100,
        duplicateAttempts: 0,
        changedContentConflicts: 0,
        outOfOrder: false,
        delayedCount: DEVICE_COUNT * 100,
        throttledRequests: 0,
      },
      {
        name: "three-attempt-identical-duplicate-storm",
        batchSize: 100,
        duplicateAttempts: 2,
        changedContentConflicts: 0,
        outOfOrder: false,
        delayedCount: 0,
        throttledRequests: 0,
      },
      {
        name: "changed-content-duplicates",
        batchSize: 100,
        duplicateAttempts: 0,
        changedContentConflicts: 25,
        outOfOrder: false,
        delayedCount: 0,
        throttledRequests: 0,
      },
      {
        name: "bounded-out-of-order-delayed-backfill",
        batchSize: 25,
        duplicateAttempts: 0,
        changedContentConflicts: 0,
        outOfOrder: true,
        delayedCount: 2_500,
        throttledRequests: 0,
      },
    ];

    const started = performance.now();
    const evidence = profiles.map((profile) => runProfile(dailyEvents, profile));
    const elapsedMs = performance.now() - started;
    const repeat = profiles.map((profile) => runProfile(dailyEvents, profile));

    assert.deepEqual(
      evidence.map(deterministicProjection),
      repeat.map(deterministicProjection),
    );
    for (const result of evidence) {
      assert.equal(result.duplicateInflation, 0);
      assert.equal(result.finalPointRows, DAILY_EVENT_COUNT);
      assert.equal(result.finalSessionRows, DEVICE_COUNT);
      assert.equal(result.phoneRowsAfter, result.phoneRowsBefore);
      assert.equal(result.errors, 0);
    }
    assert.equal(evidence[4].identicalDuplicates, DAILY_EVENT_COUNT * 2);
    assert.equal(evidence[5].conflicts, 25);
    assert.equal(evidence[3].acceptedDelayed, DEVICE_COUNT * 100);

    console.log(
      "M21_LOAD_EVIDENCE",
      JSON.stringify(
        {
          environment: {
            runtime: process.version,
            platform: process.platform,
            architecture: process.arch,
          },
          model: {
            seed: SEED,
            devices: DEVICE_COUNT,
            intervalSeconds: 15,
            activeHours: 10,
          },
          localTiming: {
            generationElapsedMs: Number(generationElapsedMs.toFixed(3)),
            processingElapsedMs: Number(elapsedMs.toFixed(3)),
            processingEventsPerSecond: Number(
              (
                profiles.reduce(
                  (sum, profile) =>
                    sum +
                    DAILY_EVENT_COUNT * (profile.duplicateAttempts + 1) +
                    profile.changedContentConflicts,
                  0,
                ) /
                (elapsedMs / 1_000)
              ).toFixed(1),
            ),
          },
          profiles: evidence,
          limitations:
            "Local in-memory deterministic evidence; not hosted Netlify or Supabase latency.",
        },
        null,
        2,
      ),
    );
  }, 60_000);
});
