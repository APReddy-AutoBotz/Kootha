import { describe, expect, it } from "vitest";
import {
  classifyDuplicateIdentityV1,
  createCanonicalEventContentIdentityV1,
} from "./contentIdentity";
import { decideCaptureWindowV1, type EventTimeCaptureInputV1 } from "./eventTime";
import {
  createCanonicalEventIdentityV1,
  type DigestProviderV1,
} from "./identity";
import {
  createRequiredTelemetryScenariosV1,
  requiredTelemetryScenarioIdsV1,
  syntheticScenarioPolicyV1,
  type TelemetryScenarioIdV1,
  type TelemetryScenarioV1,
} from "./scenarios";
import {
  validateCanonicalSensorObservationV1,
  validateCanonicalTelemetryEventV1,
} from "./validation";

const factoryConfig = {
  seed: 20,
  startAt: "2030-01-01T08:00:00.000Z",
} as const;
const scenarios = createRequiredTelemetryScenariosV1(factoryConfig);
const digestProvider: DigestProviderV1 = {
  algorithm: "test-fnv1a",
  digestUtf8(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  },
};

describe("required M20B scenario catalog", () => {
  it("contains every required scenario exactly once", () => {
    expect(scenarios).toHaveLength(21);
    expect(scenarios.map(({ id }) => id)).toEqual(
      requiredTelemetryScenarioIdsV1,
    );
    expect(new Set(scenarios.map(({ id }) => id)).size).toBe(21);
  });

  it("is deterministic for the same seed, scenario IDs, and virtual start", () => {
    const repeated = createRequiredTelemetryScenariosV1(factoryConfig);
    expect(repeated).toEqual(scenarios);
    expect(repeated).not.toBe(scenarios);
  });

  it.each(requiredTelemetryScenarioIdsV1)(
    "keeps %s context and canonical provenance unambiguously synthetic",
    (id) => {
      const fixture = getScenario(id);
      const { context } = fixture;
      expect(fixture.synthetic).toBe(true);
      expect(context).toMatchObject({
        contractVersion: "1",
        scenarioId: id,
        seed: factoryConfig.seed,
        synthetic: true,
      });
      expect(context.registeredDevice.deviceExternalId).toMatch(
        /^synthetic-device-/,
      );
      expect(context.vehicle.vehicleId).toMatch(/^synthetic-vehicle-/);
      expect(context.driver.driverId).toMatch(/^synthetic-driver-/);
      expect(context.adWork.adWorkId).toMatch(/^synthetic-work-/);
      expect(context.assignment.assignmentId).toMatch(
        /^synthetic-assignment-/,
      );
      expect(context.deviceVehicleLink.linkId).toMatch(/^synthetic-link-/);
      expect(context.session?.sessionId).toMatch(/^synthetic-session-/);
      expect(context.assignment).toMatchObject({
        adWorkId: context.adWork.adWorkId,
        vehicleId: context.vehicle.vehicleId,
        driverId: context.driver.driverId,
      });
      expect(context.deviceVehicleLink).toMatchObject({
        deviceExternalId: context.registeredDevice.deviceExternalId,
        vehicleId: context.vehicle.vehicleId,
      });
      for (const event of fixture.events) {
        expect(event.deviceExternalId).toBe(
          context.registeredDevice.deviceExternalId,
        );
        expect(event.adapter).toEqual({
          id: "deterministic_simulator",
          version: "1.0.0",
        });
        expect(event.provenance).toMatchObject({
          source: "simulator",
          synthetic: true,
        });
        for (const forbidden of [
          "driverId",
          "vehicleId",
          "workId",
          "assignmentId",
          "sessionId",
        ]) {
          expect(event).not.toHaveProperty(forbidden);
        }
      }
    },
  );

  it.each(requiredTelemetryScenarioIdsV1)(
    "executes the declared canonical semantics for %s",
    (id) => {
      const fixture = getScenario(id);
      const expected = fixture.expectations.canonicalValidation;
      const results = fixture.events.map(validateCanonicalTelemetryEventV1);
      if (expected.outcome === "valid") {
        expect(results.every(({ ok }) => ok)).toBe(true);
      } else {
        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({
          ok: false,
          issues: expect.arrayContaining([expected.issue]),
        });
      }
      expect(
        fixture.expectations.expectedEligiblePointCount,
      ).toBeGreaterThanOrEqual(0);
      expect(fixture.expectations.futureRuleSignalIds).not.toContain("alert");
    },
  );

  it("healthy movement is live and has three eligible moving points", () => {
    const fixture = getScenario("healthy-movement");
    expect(captureDecision(fixture)).toMatchObject(
      fixture.expectations.captureWindow,
    );
    expect(fixture.events).toHaveLength(3);
    expect(fixture.expectations.expectedEligiblePointCount).toBe(3);
    expect(
      new Set(fixture.events.map((event) => event.position?.latitude)).size,
    ).toBe(3);
  });

  it("long stop spans five minutes at one valid coordinate", () => {
    const fixture = getScenario("long-stop");
    expect(capturedGapMs(fixture)).toBe(300_000);
    expect(fixture.events[0]?.position).toMatchObject(
      fixture.events[1]?.position ?? {},
    );
    expect(
      fixture.events.every(
        (event) => event.position?.speedMetersPerSecond === 0,
      ),
    ).toBe(true);
    expect(fixture.expectations.futureRuleSignalIds).toEqual(["long_stop"]);
  });

  it("missing heartbeat exhibits its exact deterministic gap", () => {
    const fixture = getScenario("missing-heartbeat");
    expect(capturedGapMs(fixture)).toBe(fixture.expectations.heartbeatGapMs);
    expect(fixture.expectations.heartbeatGapMs).toBe(435_000);
    expect(fixture.expectations.futureRuleSignalIds).toEqual([
      "missing_heartbeat",
    ]);
  });

  it("duplicate retry has stable event/content identity and one eligible point", () => {
    const fixture = getScenario("duplicate-retry");
    const [first, retry] = requireTwoEvents(fixture);
    expect(eventIdentity(first)).toEqual(eventIdentity(retry));
    const firstContent = contentIdentity(first);
    const retryContent = contentIdentity(retry);
    expect(firstContent).toBe(retryContent);
    expect(
      classifyDuplicateIdentityV1(
        first.idempotencyIdentity,
        retry.idempotencyIdentity,
        firstContent,
        retryContent,
      ),
    ).toMatchObject({
      classification: "duplicate_identical_content",
      disposition: "duplicate",
    });
    expect(fixture.expectations).toMatchObject({
      duplicateClassification: "duplicate_identical_content",
      expectedEligiblePointCount: 1,
    });
  });

  it("changed-content duplicate preserves event identity and conflicts", () => {
    const fixture = getScenario("changed-content-duplicate");
    const [first, changed] = requireTwoEvents(fixture);
    expect(eventIdentity(first)).toEqual(eventIdentity(changed));
    const firstContent = contentIdentity(first);
    const changedContent = contentIdentity(changed);
    expect(changedContent).not.toBe(firstContent);
    expect(
      classifyDuplicateIdentityV1(
        first.idempotencyIdentity,
        changed.idempotencyIdentity,
        firstContent,
        changedContent,
      ),
    ).toMatchObject({
      classification: "duplicate_changed_content",
      disposition: "duplicate_conflict",
    });
    expect(fixture.expectations).toMatchObject({
      duplicateClassification: "duplicate_conflict",
      expectedEligiblePointCount: 1,
    });
  });

  it("sequence gap exposes the missing intermediate value", () => {
    const fixture = getScenario("sequence-gap");
    expect(fixture.events.map((event) => event.stream?.sequence)).toEqual([
      1, 3,
    ]);
    expect(fixture.expectations.sequenceGap).toEqual({
      previous: 1,
      next: 3,
      missing: [2],
    });
    expect(fixture.expectations.futureRuleSignalIds).toEqual(["sequence_gap"]);
  });

  it("out-of-order delivery differs from capture and sequence order", () => {
    const fixture = getScenario("out-of-order-event");
    expect(fixture.events.map((event) => event.stream?.sequence)).toEqual([
      3, 2,
    ]);
    expect(Date.parse(fixture.events[0]!.capturedAt)).toBeGreaterThan(
      Date.parse(fixture.events[1]!.capturedAt),
    );
    expect(fixture.expectations.deliveryOrder).toBe("out_of_order");
  });

  it("delayed offline backfill is degraded accepted backfill", () => {
    const fixture = getScenario("delayed-offline-backfill");
    expect(captureDecision(fixture)).toMatchObject({
      disposition: "accepted_delayed",
      reasonCode: "inside_delayed_backfill_window",
      freshness: "degraded_freshness",
      delayed: true,
      offlineBackfill: true,
    });
    expect(fixture.expectations.quality).toBe("degraded");
  });

  it("expired backfill captures in-work and rejects after cutoff", () => {
    const fixture = getScenario("expired-delayed-backfill");
    expect(Date.parse(fixture.events[0]!.capturedAt)).toBeGreaterThanOrEqual(
      Date.parse(fixture.context.execution.actualWorkStartedAt),
    );
    expect(captureDecision(fixture)).toMatchObject({
      disposition: "rejected",
      reasonCode: "delayed_backfill_expired",
    });
    expect(fixture.expectations.expectedEligiblePointCount).toBe(0);
  });

  it("invalid coordinate returns its typed issue and zero eligibility", () => {
    const fixture = getScenario("invalid-coordinate");
    expect(validateCanonicalTelemetryEventV1(fixture.events[0])).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        { path: "$.position.latitude", code: "out_of_range" },
      ]),
    });
    expect(fixture.expectations.expectedEligiblePointCount).toBe(0);
  });

  it("impossible speed uses structurally valid events and implied movement", () => {
    const fixture = getScenario("impossible-speed");
    const [first, second] = requireTwoEvents(fixture);
    expect(validateCanonicalTelemetryEventV1(first).ok).toBe(true);
    expect(validateCanonicalTelemetryEventV1(second).ok).toBe(true);
    const threshold =
      fixture.expectations.minimumImpliedSpeedMetersPerSecond;
    expect(threshold).toBeDefined();
    expect(impliedSpeedMetersPerSecond(first, second)).toBeGreaterThan(
      threshold ?? Number.POSITIVE_INFINITY,
    );
    expect(first.position?.speedMetersPerSecond).toBeLessThanOrEqual(200);
    expect(second.position?.speedMetersPerSecond).toBeLessThanOrEqual(200);
    expect(fixture.expectations.futureRuleSignalIds).toEqual([
      "impossible_speed",
    ]);
  });

  it("low battery declares the exact degraded value", () => {
    const fixture = getScenario("low-battery");
    expect(fixture.events[0]?.health?.batteryPercent).toBe(5);
    expect(fixture.expectations).toMatchObject({
      quality: "degraded",
      futureRuleSignalIds: ["low_battery"],
    });
  });

  it("poor GPS declares exact fix, satellite, and accuracy evidence", () => {
    const fixture = getScenario("poor-gps");
    expect(fixture.events[0]).toMatchObject({
      position: { accuracyMeters: 750, satellites: 1 },
      health: { gpsFix: "none" },
    });
    expect(fixture.expectations.futureRuleSignalIds).toEqual(["poor_gps"]);
  });

  it("poor GSM declares the exact degraded value", () => {
    const fixture = getScenario("poor-gsm");
    expect(fixture.events[0]?.health?.gsmSignalDbm).toBe(-120);
    expect(fixture.expectations.futureRuleSignalIds).toEqual(["poor_gsm"]);
  });

  it("offline reconnect has an exact gap and bounded ordered batch", () => {
    const fixture = getScenario("offline-reconnect");
    const receiptTimes = fixture.events.map((event) =>
      Date.parse(event.receivedAt),
    );
    expect(receiptTimes[1]! - receiptTimes[0]!).toBe(
      fixture.expectations.reconnectBatch?.offlineReceiptGapMs,
    );
    expect(fixture.events.slice(1)).toHaveLength(
      fixture.expectations.reconnectBatch?.batchSize ?? 0,
    );
    expect(
      new Set(fixture.events.slice(1).map((event) => event.receivedAt)).size,
    ).toBe(1);
    expect(fixture.events.map((event) => event.stream?.sequence)).toEqual([
      1, 2, 3,
    ]);
    expect(fixture.expectations.futureRuleSignalIds).toEqual([
      "offline",
      "reconnect",
    ]);
  });

  it.each([
    ["telemetry-before-start-work", "captured_before_work_start"],
    ["telemetry-after-end-work", "captured_after_work_end"],
  ] as const)("%s executes the exact event-time rejection", (id, reasonCode) => {
    const fixture = getScenario(id);
    expect(captureDecision(fixture)).toMatchObject({
      disposition: "rejected",
      reasonCode,
    });
    expect(fixture.expectations.expectedEligiblePointCount).toBe(0);
  });

  it.each([
    ["phone-and-physical-device-together", "paired_match_fixture", 2],
    ["phone-device-mismatch", "sustained_mismatch_fixture", 3],
  ] as const)(
    "%s keeps phone and physical fixtures separate",
    (id, relationship, count) => {
      const fixture = getScenario(id);
      expect(fixture.events).toHaveLength(count);
      expect(fixture.phonePoints).toHaveLength(count);
      expect(
        fixture.phonePoints?.every((point) => point.source === "phone"),
      ).toBe(true);
      expect(fixture.phonePoints?.every((point) => point.synthetic)).toBe(true);
      expect(
        fixture.events.every(
          (event) => event.provenance.source === "simulator",
        ),
      ).toBe(true);
      expect(
        fixture.phonePoints?.some(
          (point) =>
            point.deviceExternalId ===
            fixture.context.registeredDevice.deviceExternalId,
        ),
      ).toBe(false);
      expect(fixture.phonePoints).not.toBe(fixture.events);
      expect(fixture.expectations.phoneDeviceRelationship).toBe(relationship);
      expect(fixture).not.toHaveProperty("comparisonResult");
    },
  );

  it("sustained mismatch has three pairs over five minutes", () => {
    const fixture = getScenario("phone-device-mismatch");
    expect(capturedGapMs(fixture, 0, 2)).toBe(300_000);
    expect(fixture.phonePoints?.map((point) => point.capturedAt)).toEqual(
      fixture.events.map((event) => event.capturedAt),
    );
  });

  it("approved observations execute constrained validators", () => {
    const fixture = getScenario("approved-sensor-observations");
    expect(fixture.sensorObservations).toHaveLength(2);
    expect(
      fixture.sensorObservations?.every(
        (observation) =>
          validateCanonicalSensorObservationV1(observation).ok,
      ),
    ).toBe(true);
    expect(fixture.expectations.sensorValidation).toBe("approved");
  });

  it("unsupported observation remains visible with a typed issue", () => {
    const fixture = getScenario("unsupported-sensor-metric");
    expect(fixture.sensorObservations).toEqual([]);
    expect(fixture.rejectedSensorInputs).toHaveLength(1);
    expect(
      validateCanonicalSensorObservationV1(
        fixture.rejectedSensorInputs?.[0],
      ),
    ).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        { path: "$.metric", code: "unsupported" },
      ]),
    });
    expect(fixture.expectations.sensorValidation).toBe("unsupported");
  });
});

function getScenario(id: TelemetryScenarioIdV1): TelemetryScenarioV1 {
  const result = scenarios.find((scenario) => scenario.id === id);
  if (!result) {
    throw new Error(`Missing scenario: ${id}`);
  }
  return result;
}

function requireTwoEvents(
  fixture: TelemetryScenarioV1,
): readonly [
  TelemetryScenarioV1["events"][number],
  TelemetryScenarioV1["events"][number],
] {
  const [first, second] = fixture.events;
  if (!first || !second) {
    throw new Error(`Expected two events for ${fixture.id}`);
  }
  return [first, second];
}

function contentIdentity(
  event: TelemetryScenarioV1["events"][number],
): string {
  const result = createCanonicalEventContentIdentityV1(event, digestProvider);
  if (!result.ok) {
    throw new Error("Expected valid content identity");
  }
  return result.value.identity;
}

function eventIdentity(event: TelemetryScenarioV1["events"][number]) {
  return createCanonicalEventIdentityV1(
    {
      adapterId: event.adapter.id,
      adapterVersion: event.adapter.version,
      deviceExternalId: event.deviceExternalId,
      vendorEventId: event.vendorEventId,
      capturedAt: event.capturedAt,
      streamEpoch: event.stream?.epoch,
      sequence: event.stream?.sequence,
      canonicalPayloadHash: event.provenance.canonicalPayloadHash,
    },
    digestProvider,
  );
}

function captureDecision(fixture: TelemetryScenarioV1) {
  const event = fixture.events[0];
  if (!event) {
    throw new Error(`Expected event for ${fixture.id}`);
  }
  const input: EventTimeCaptureInputV1 = {
    idempotencyIdentity: event.idempotencyIdentity,
    clientEventId: event.clientEventId,
    capturedAt: event.capturedAt,
    receivedAt: event.receivedAt,
    actualWorkStartedAt: fixture.context.execution.actualWorkStartedAt,
    actualWorkEndedAt: fixture.context.execution.actualWorkEndedAt,
    authentication: "valid",
    eventIdentity: "valid",
    deviceVehicleLinkAtCapture: "valid",
    adWorkAssignmentAtCapture: "valid",
    workReleaseAtCapture: "valid",
    timestampEvidence: "valid",
    clockOffsetEvidence: "valid",
    sequenceReplayEvidence: "valid",
  };
  return decideCaptureWindowV1(input, syntheticScenarioPolicyV1);
}

function capturedGapMs(
  fixture: TelemetryScenarioV1,
  firstIndex = 0,
  secondIndex = 1,
): number {
  const first = fixture.events[firstIndex];
  const second = fixture.events[secondIndex];
  if (!first || !second) {
    throw new Error(`Expected captured gap events for ${fixture.id}`);
  }
  return Date.parse(second.capturedAt) - Date.parse(first.capturedAt);
}

function impliedSpeedMetersPerSecond(
  first: TelemetryScenarioV1["events"][number],
  second: TelemetryScenarioV1["events"][number],
): number {
  if (!first.position || !second.position) {
    throw new Error("Expected position");
  }
  const meanLatitudeRadians =
    ((first.position.latitude + second.position.latitude) / 2) *
    (Math.PI / 180);
  const northMeters =
    (second.position.latitude - first.position.latitude) * 111_320;
  const eastMeters =
    (second.position.longitude - first.position.longitude) *
    111_320 *
    Math.cos(meanLatitudeRadians);
  const elapsedSeconds =
    (Date.parse(second.capturedAt) - Date.parse(first.capturedAt)) / 1_000;
  return Math.hypot(northMeters, eastMeters) / elapsedSeconds;
}
