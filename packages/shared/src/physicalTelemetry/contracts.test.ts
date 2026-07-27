import { describe, expect, it, vi } from "vitest";
import {
  classifyDuplicateIdentityV1,
  createCanonicalEventContentIdentityV1,
} from "./contentIdentity";
import type {
  CanonicalSensorObservationV1,
  CanonicalTelemetryEventV1,
  IngressAcknowledgementV1,
  IngressHostPolicyV1,
  IngressMessageV1,
  TelemetryProcessingResultV1,
} from "./contracts";
import {
  validateEventTimeWorkResolutionRequestV1,
  validateEventTimeWorkResolutionResultV1,
  validateIngressAcknowledgementV1,
  validateIngressHostPolicyV1,
  validateIngressMessageV1,
  validateTelemetryProcessingResultV1,
} from "./boundaryValidation";
import {
  canonicalizeIdentityMaterialV1,
  createCanonicalEventIdentityV1,
  type DigestProviderV1,
} from "./identity";
import { decideCaptureWindowV1, type EventTimeCaptureInputV1 } from "./eventTime";
import {
  validateCanonicalSensorObservationV1,
  validateCanonicalTelemetryEventV1,
} from "./validation";

const digestProvider: DigestProviderV1 = {
  algorithm: "test-digest",
  digestUtf8: (value) => `deterministic-${value.length}`,
};

const observation: CanonicalSensorObservationV1 = {
  contractVersion: "1",
  metric: "fuel_level",
  value: 64,
  unit: "percentage",
  capturedAt: "2030-01-01T08:00:00.000Z",
  deviceExternalId: "synthetic-device-contract",
  source: "simulator",
  normalizationVersion: "1",
  quality: "good",
  synthetic: true,
};

const validEvent: CanonicalTelemetryEventV1 = {
  contractVersion: "1",
  canonicalEventId: "synthetic-canonical-contract",
  idempotencyIdentity: "synthetic-identity-contract",
  vendorEventId: "synthetic-vendor-contract",
  clientEventId: "synthetic-client-contract",
  deviceExternalId: "synthetic-device-contract",
  authenticatedDeviceExternalId: "synthetic-device-contract",
  adapter: { id: "deterministic_simulator", version: "1.0.0" },
  stream: { epoch: "synthetic-epoch-contract", sequence: 1 },
  capturedAt: "2030-01-01T08:00:00.000Z",
  receivedAt: "2030-01-01T08:00:01.000Z",
  normalizedAt: "2030-01-01T08:00:01.000Z",
  observedClockOffsetMs: 0,
  position: {
    latitude: 1.2345,
    longitude: 2.3456,
    accuracyMeters: 8,
    speedMetersPerSecond: 6,
    headingDegrees: 45,
    satellites: 9,
  },
  health: {
    heartbeat: true,
    batteryPercent: 88,
    externalPower: true,
    gpsFix: "three_dimensional",
    gsmSignalDbm: -70,
  },
  observations: [observation],
  quality: "valid",
  provenance: {
    source: "simulator",
    normalizationVersion: "1",
    synthetic: true,
    rawPayloadHash: "synthetic-raw-payload-contract",
    canonicalPayloadHash: "synthetic-payload-contract",
  },
};

describe("M20B canonical runtime validation", () => {
  it("accepts a bounded valid canonical event and approved observation", () => {
    expect(validateCanonicalTelemetryEventV1(validEvent)).toEqual({
      ok: true,
      value: validEvent,
    });
    expect(validateCanonicalSensorObservationV1(observation)).toEqual({
      ok: true,
      value: observation,
    });
  });

  it("rejects simulator provenance that contradicts the synthetic marker", () => {
    expect(
      validateCanonicalTelemetryEventV1({
        ...validEvent,
        provenance: { ...validEvent.provenance, synthetic: false },
        observations: [{ ...observation, synthetic: false }],
      }),
    ).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        { path: "$.provenance.synthetic", code: "invalid_value" },
        { path: "$.observations[0].synthetic", code: "invalid_value" },
      ]),
    });
    expect(
      validateCanonicalSensorObservationV1({
        ...observation,
        synthetic: false,
      }),
    ).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        { path: "$.synthetic", code: "invalid_value" },
      ]),
    });
  });

  it("keeps synthetic physical-device fixtures valid and distinct from simulator output", () => {
    const physicalObservation: CanonicalSensorObservationV1 = {
      ...observation,
      source: "physical_device",
    };
    const physicalEvent: CanonicalTelemetryEventV1 = {
      ...validEvent,
      observations: [physicalObservation],
      provenance: {
        ...validEvent.provenance,
        source: "physical_device",
      },
    };

    expect(validateCanonicalTelemetryEventV1(physicalEvent)).toEqual({
      ok: true,
      value: physicalEvent,
    });
    expect(validateCanonicalSensorObservationV1(physicalObservation)).toEqual({
      ok: true,
      value: physicalObservation,
    });
  });

  it.each([
    ["missing required field", { ...validEvent, canonicalEventId: undefined }],
    ["unsupported version", { ...validEvent, contractVersion: "2" }],
    ["malformed timestamp", { ...validEvent, capturedAt: "tomorrow" }],
    [
      "non-finite coordinate",
      { ...validEvent, position: { ...validEvent.position, latitude: Number.NaN } },
    ],
    [
      "latitude range",
      { ...validEvent, position: { ...validEvent.position, latitude: 91 } },
    ],
    [
      "longitude range",
      { ...validEvent, position: { ...validEvent.position, longitude: -181 } },
    ],
    ["unbounded string", { ...validEvent, canonicalEventId: "x".repeat(257) }],
    ["unexpected metadata", { ...validEvent, metadata: { arbitrary: true } }],
    [
      "sensor collection bound",
      { ...validEvent, observations: Array.from({ length: 33 }, () => observation) },
    ],
  ])("rejects %s", (_name, value) => {
    expect(validateCanonicalTelemetryEventV1(value).ok).toBe(false);
  });

  it("rejects impossible calendar dates rather than normalizing them", () => {
    expect(
      validateCanonicalTelemetryEventV1({
        ...validEvent,
        capturedAt: "2030-02-30T08:00:00.000Z",
      }).ok,
    ).toBe(false);
  });

  it.each([
    ["device", { ...observation, deviceExternalId: "synthetic-device-other" }],
    ["source", { ...observation, source: "physical_device" }],
    ["synthetic marker", { ...observation, synthetic: false }],
    ["captured time", { ...observation, capturedAt: "2030-01-01T08:00:01.000Z" }],
    ["normalization version", { ...observation, normalizationVersion: "2" }],
  ])("rejects an observation whose %s conflicts with its parent event", (_name, nested) => {
    expect(
      validateCanonicalTelemetryEventV1({ ...validEvent, observations: [nested] }).ok,
    ).toBe(false);
  });
  it.each([
    [{ ...observation, metric: "vendor_free_form" }, "unsupported metric"],
    [{ ...observation, unit: "litres" }, "invalid unit"],
    [{ ...observation, value: true }, "invalid value type"],
    [{ ...observation, vendorMetadata: { raw: true } }, "arbitrary metadata"],
  ])("rejects constrained sensor violation: $name", (value, _name) => {
    expect(validateCanonicalSensorObservationV1(value).ok).toBe(false);
  });
});

describe("M20B identity and duplicate semantics", () => {
  const baseIdentityInput = {
    adapterId: "adapter-a",
    adapterVersion: "1",
    deviceExternalId: "device-a",
    vendorEventId: "event-a",
    capturedAt: "2030-01-01T08:00:00.000Z",
    canonicalPayloadHash: "content-a",
  };

  it("canonicalizes object keys independently of insertion order", () => {
    expect(canonicalizeIdentityMaterialV1({ alpha: 1, beta: 2 })).toEqual(
      canonicalizeIdentityMaterialV1({ beta: 2, alpha: 1 }),
    );
  });

  it("bounds depth and rejects accessors without invoking them", () => {
    let nested: unknown = "leaf";
    for (let depth = 0; depth < 18; depth += 1) {
      nested = [nested];
    }
    expect(canonicalizeIdentityMaterialV1(nested).ok).toBe(false);

    const getter = vi.fn(() => "secret");
    const accessor = {};
    Object.defineProperty(accessor, "value", { enumerable: true, get: getter });
    expect(canonicalizeIdentityMaterialV1(accessor).ok).toBe(false);
    expect(getter).not.toHaveBeenCalled();

    const arrayGetter = vi.fn(() => "secret");
    const arrayWithAccessor: unknown[] = [1];
    Object.defineProperty(arrayWithAccessor, "secret", {
      enumerable: true,
      get: arrayGetter,
    });
    expect(canonicalizeIdentityMaterialV1(arrayWithAccessor).ok).toBe(false);
    expect(arrayGetter).not.toHaveBeenCalled();

    const arrayWithSymbol: unknown[] = [1];
    Object.defineProperty(arrayWithSymbol, Symbol("secret"), { value: true });
    expect(canonicalizeIdentityMaterialV1(arrayWithSymbol).ok).toBe(false);
  });
  it("produces retry-stable identity without wall-clock or random input", () => {
    expect(createCanonicalEventIdentityV1(baseIdentityInput, digestProvider)).toEqual(
      createCanonicalEventIdentityV1(baseIdentityInput, digestProvider),
    );
  });

  it("separates adapter and device namespaces", () => {
    const original = createCanonicalEventIdentityV1(baseIdentityInput, digestProvider);
    const adapter = createCanonicalEventIdentityV1(
      { ...baseIdentityInput, adapterId: "adapter-b" },
      digestProvider,
    );
    const device = createCanonicalEventIdentityV1(
      { ...baseIdentityInput, deviceExternalId: "device-b" },
      digestProvider,
    );
    expect(adapter).not.toEqual(original);
    expect(device).not.toEqual(original);
  });

  it("uses client event identity when a vendor event ID is absent", () => {
    const { vendorEventId: _omitted, ...withoutVendor } = baseIdentityInput;
    const result = createCanonicalEventIdentityV1(
      { ...withoutVendor, clientEventId: "client-event-a" },
      digestProvider,
    );
    expect(result.ok && result.value.kind).toBe("client_event_id");
    expect(result).toEqual(
      createCanonicalEventIdentityV1(
        { ...withoutVendor, clientEventId: "client-event-a" },
        digestProvider,
      ),
    );
  });

  it("uses deterministic fallback material without a vendor event ID", () => {
    const { vendorEventId: _omitted, ...fallbackInput } = baseIdentityInput;
    const result = createCanonicalEventIdentityV1(
      { ...fallbackInput, streamEpoch: "epoch-a", sequence: 7 },
      digestProvider,
    );
    expect(result.ok && result.value.kind).toBe("derived_payload");
    expect(result).toEqual(
      createCanonicalEventIdentityV1(
        { ...fallbackInput, streamEpoch: "epoch-a", sequence: 7 },
        digestProvider,
      ),
    );
  });

  it("distinguishes identical content from changed-content conflict", () => {
    const firstContent = createCanonicalEventContentIdentityV1(
      validEvent,
      digestProvider,
    );
    const retryContent = createCanonicalEventContentIdentityV1(
      { ...validEvent, receivedAt: "2030-01-01T08:00:02.000Z" },
      digestProvider,
    );
    const changedContent = createCanonicalEventContentIdentityV1(
      { ...validEvent, health: { ...validEvent.health!, batteryPercent: 4 } },
      digestProvider,
    );
    expect(firstContent.ok && retryContent.ok && firstContent.value).toEqual(
      retryContent.ok && retryContent.value,
    );
    if (!firstContent.ok || !retryContent.ok || !changedContent.ok) {
      throw new Error("expected deterministic content identities");
    }
    expect(
      classifyDuplicateIdentityV1(
        "identity-a",
        "identity-a",
        firstContent.value.identity,
        retryContent.value.identity,
      ),
    ).toMatchObject({ classification: "duplicate_identical_content" });
    expect(
      classifyDuplicateIdentityV1(
        "identity-a",
        "identity-a",
        firstContent.value.identity,
        changedContent.value.identity,
      ),
    ).toMatchObject({
      classification: "duplicate_changed_content",
      disposition: "duplicate_conflict",
    });
  });

  it("preserves provenance in deterministic content identity material", () => {
    const simulatorContent = createCanonicalEventContentIdentityV1(
      validEvent,
      digestProvider,
    );
    const physicalContent = createCanonicalEventContentIdentityV1(
      {
        ...validEvent,
        observations: [{ ...observation, source: "physical_device" }],
        provenance: { ...validEvent.provenance, source: "physical_device" },
      },
      digestProvider,
    );
    if (!simulatorContent.ok || !physicalContent.ok) {
      throw new Error("expected deterministic provenance content identities");
    }
    expect(simulatorContent.value.canonicalMaterial).not.toBe(
      physicalContent.value.canonicalMaterial,
    );
  });
});

const evidence: EventTimeCaptureInputV1 = {
  idempotencyIdentity: "synthetic-identity-contract",
  clientEventId: "synthetic-client-contract",
  capturedAt: "2030-01-01T08:00:00.000Z",
  receivedAt: "2030-01-01T08:00:30.000Z",
  actualWorkStartedAt: "2030-01-01T08:00:00.000Z",
  actualWorkEndedAt: "2030-01-01T09:00:00.000Z",
  authentication: "valid",
  eventIdentity: "valid",
  deviceVehicleLinkAtCapture: "valid",
  adWorkAssignmentAtCapture: "valid",
  workReleaseAtCapture: "valid",
  timestampEvidence: "valid",
  clockOffsetEvidence: "valid",
  sequenceReplayEvidence: "valid",
};

const policy = {
  liveFreshnessWindowMs: 120_000,
  delayedBackfillWindowMs: 86_400_000,
  maximumFutureClockSkewMs: 30_000,
};

describe("M20B pure event-time decisions", () => {
  it.each([
    ["just before Start Work", "2030-01-01T07:59:59.999Z", evidence.receivedAt, "captured_before_work_start"],
    ["just after End Work", "2030-01-01T09:00:00.001Z", "2030-01-01T09:00:01.001Z", "captured_after_work_end"],
  ])("rejects %s", (_name, capturedAt, receivedAt, reasonCode) => {
    expect(decideCaptureWindowV1({ ...evidence, capturedAt, receivedAt }, policy)).toMatchObject({
      disposition: "rejected",
      reasonCode,
    });
  });

  it.each([
    ["at Start Work", "2030-01-01T08:00:00.000Z"],
    ["just after Start Work", "2030-01-01T08:00:00.001Z"],
    ["at freshness threshold", "2030-01-01T08:00:00.000Z"],
  ])("accepts %s as live when receipt age is within threshold", (_name, capturedAt) => {
    expect(
      decideCaptureWindowV1(
        { ...evidence, capturedAt, receivedAt: "2030-01-01T08:02:00.000Z" },
        policy,
      ),
    ).toMatchObject({ disposition: "accepted_live" });
  });

  it("treats just beyond freshness as delayed, never live", () => {
    expect(
      decideCaptureWindowV1(
        { ...evidence, receivedAt: "2030-01-01T08:02:00.001Z" },
        policy,
      ),
    ).toMatchObject({ disposition: "accepted_delayed" });
  });

  it("accepts capture exactly at End Work when receipt is within backfill", () => {
    expect(
      decideCaptureWindowV1(
        {
          ...evidence,
          capturedAt: "2030-01-01T09:00:00.000Z",
          receivedAt: "2030-01-01T09:00:01.000Z",
        },
        policy,
      ),
    ).toMatchObject({ disposition: "accepted_delayed" });
  });

  it("uses an inclusive delayed-backfill cutoff and rejects one millisecond later", () => {
    expect(
      decideCaptureWindowV1(
        { ...evidence, receivedAt: "2030-01-02T09:00:00.000Z" },
        policy,
      ),
    ).toMatchObject({ disposition: "accepted_delayed" });
    expect(
      decideCaptureWindowV1(
        { ...evidence, receivedAt: "2030-01-02T09:00:00.001Z" },
        policy,
      ),
    ).toMatchObject({
      disposition: "rejected",
      reasonCode: "delayed_backfill_expired",
    });
  });

  it("rejects excessive future capture time but allows the exact skew boundary", () => {
    const receivedAt = "2030-01-01T08:00:00.000Z";
    expect(
      decideCaptureWindowV1(
        { ...evidence, receivedAt, capturedAt: "2030-01-01T08:00:30.000Z" },
        policy,
      ),
    ).toMatchObject({ disposition: "accepted_live" });
    expect(
      decideCaptureWindowV1(
        { ...evidence, receivedAt, capturedAt: "2030-01-01T08:00:30.001Z" },
        policy,
      ),
    ).toMatchObject({
      disposition: "rejected",
      reasonCode: "captured_time_future_skew",
    });
  });

  it("rejects impossible calendar timestamps in the decision layer", () => {
    expect(
      decideCaptureWindowV1(
        { ...evidence, capturedAt: "2030-02-30T08:00:00.000Z" },
        policy,
      ),
    ).toMatchObject({ disposition: "rejected", reasonCode: "captured_time_invalid" });
  });

  it("supports ongoing work without inventing an End Work time", () => {
    const { actualWorkEndedAt: _ended, ...ongoing } = evidence;
    expect(decideCaptureWindowV1(ongoing, policy)).toMatchObject({
      disposition: "accepted_live",
    });
    expect(
      decideCaptureWindowV1(
        { ...ongoing, receivedAt: "2030-01-01T08:02:00.001Z" },
        policy,
      ),
    ).toMatchObject({ disposition: "accepted_delayed" });
  });

  it("fails closed for an unexpected runtime evidence state", () => {
    const invalidRuntimeEvidence = { ...evidence };
    Object.defineProperty(invalidRuntimeEvidence, "authentication", {
      value: "unexpected",
    });
    expect(decideCaptureWindowV1(invalidRuntimeEvidence, policy)).toMatchObject({
      disposition: "rejected",
      reasonCode: "event_time_evidence_ambiguous",
    });
  });
  it("rejects ambiguous event-time evidence", () => {
    expect(
      decideCaptureWindowV1(
        { ...evidence, clockOffsetEvidence: "ambiguous" },
        policy,
      ),
    ).toMatchObject({
      disposition: "rejected",
      reasonCode: "event_time_evidence_ambiguous",
    });
  });
});


describe("M20B host and processing boundary validation", () => {
  const policy: IngressHostPolicyV1 = {
    contractVersion: "1",
    hostKind: "serverless_http",
    transport: "http",
    maximumMessageBytes: 262_144,
    maximumEventsPerMessage: 100,
    correlationIdSemantics: "host_generated_or_validated",
    hostReceivedAtSemantics: "assigned_at_ingress_acquisition",
    acknowledgementBoundary: "transport_only_no_persistence_claim",
  };
  const receipt = {
    contractVersion: "1" as const,
    correlationId: "synthetic-correlation-contract",
    hostReceivedAt: "2030-01-01T08:00:01.000Z",
  };
  const message: IngressMessageV1 = {
    contractVersion: "1",
    receipt,
    transport: "http",
    contentLengthBytes: 512,
    payload: { synthetic: true },
  };
  const acknowledgement: IngressAcknowledgementV1 = {
    contractVersion: "1",
    receipt,
    status: "accepted",
    acceptedCount: 1,
    rejectedCount: 0,
    retryable: false,
    reasonCode: "processed",
  };

  it("validates host-neutral limits and explicit receipt semantics", () => {
    expect(validateIngressHostPolicyV1(policy)).toEqual({
      ok: true,
      value: policy,
    });
    expect(validateIngressMessageV1(message, policy)).toEqual({
      ok: true,
      value: message,
    });
    expect(validateIngressAcknowledgementV1(acknowledgement)).toEqual({
      ok: true,
      value: acknowledgement,
    });
  });

  it("rejects a message over the host policy without inspecting its payload", () => {
    expect(
      validateIngressMessageV1(
        { ...message, contentLengthBytes: policy.maximumMessageBytes + 1 },
        policy,
      ),
    ).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        { path: "$.contentLengthBytes", code: "out_of_range" },
      ]),
    });
  });

  it("rejects acknowledgements that contradict their aggregate status", () => {
    expect(
      validateIngressAcknowledgementV1({
        ...acknowledgement,
        status: "accepted",
        rejectedCount: 1,
      }),
    ).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        { path: "$.status", code: "invalid_value" },
      ]),
    });
  });

  it.each<TelemetryProcessingResultV1>([
    {
      contractVersion: "1",
      idempotencyIdentity: "synthetic-result-live",
      disposition: "accepted_live",
      reasonCode: "inside_live_freshness_window",
      freshness: "live",
      offlineBackfill: false,
      quality: "valid",
      persistenceStatus: "not_attempted",
    },
    {
      contractVersion: "1",
      idempotencyIdentity: "synthetic-result-delayed",
      disposition: "accepted_delayed",
      reasonCode: "inside_delayed_backfill_window",
      freshness: "degraded_freshness",
      delayed: true,
      offlineBackfill: true,
      quality: "degraded",
      persistenceStatus: "not_attempted",
    },
    {
      contractVersion: "1",
      idempotencyIdentity: "synthetic-result-conflict",
      disposition: "duplicate_conflict",
      reasonCode: "event_identity_conflict",
      freshness: "not_applicable",
      offlineBackfill: false,
      quality: "rejected",
      persistenceStatus: "not_attempted",
    },
  ])("accepts a coherent $disposition eligibility result", (processing) => {
    expect(validateTelemetryProcessingResultV1(processing)).toEqual({
      ok: true,
      value: processing,
    });
    expect(processing.persistenceStatus).toBe("not_attempted");
  });

  it("rejects contradictory processing semantics", () => {
    expect(
      validateTelemetryProcessingResultV1({
        contractVersion: "1",
        idempotencyIdentity: "synthetic-result-contradiction",
        disposition: "accepted_live",
        reasonCode: "inside_live_freshness_window",
        freshness: "degraded_freshness",
        offlineBackfill: true,
        quality: "valid",
        persistenceStatus: "not_attempted",
      }),
    ).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        { path: "$.disposition", code: "invalid_value" },
      ]),
    });
  });
});

describe("M20B EventTimeWorkResolverV1 boundary", () => {
  const request = {
    contractVersion: "1" as const,
    authenticatedDeviceExternalId: "synthetic-device-resolver",
    capturedAt: "2030-01-01T08:00:00.000Z",
  };
  const resolved = {
    contractVersion: "1" as const,
    outcome: "resolved" as const,
    reasonCode: "unique_event_time_match" as const,
    context: {
      deviceId: "synthetic-device-row-resolver",
      authenticatedDeviceExternalId: "synthetic-device-resolver",
      deviceVehicleLinkId: "synthetic-link-resolver",
      vehicleId: "synthetic-vehicle-resolver",
      adWorkAssignmentId: "synthetic-assignment-resolver",
      adWorkId: "synthetic-work-resolver",
      driverId: "synthetic-driver-resolver",
      driverAuthority: "ad_work_assignment" as const,
      workReleaseId: "synthetic-release-resolver",
      releasedAt: "2030-01-01T07:55:00.000Z",
      workDayId: "synthetic-work-day-resolver",
      actualWorkStartedAt: "2030-01-01T08:00:00.000Z",
      actualWorkEndedAt: "2030-01-01T09:00:00.000Z",
      physicalTrackingSessionId: "synthetic-session-resolver",
    },
  };

  it("accepts an authenticated-device-only request and unique server context", () => {
    expect(validateEventTimeWorkResolutionRequestV1(request)).toEqual({
      ok: true,
      value: request,
    });
    expect(validateEventTimeWorkResolutionResultV1(resolved)).toEqual({
      ok: true,
      value: resolved,
    });
    expect(resolved.context.driverAuthority).toBe("ad_work_assignment");
  });

  it.each([
    ["vehicleId", "synthetic-vehicle-payload"],
    ["driverId", "synthetic-driver-payload"],
    ["adWorkId", "synthetic-work-payload"],
    ["adWorkAssignmentId", "synthetic-assignment-payload"],
    ["physicalTrackingSessionId", "synthetic-session-payload"],
  ])("rejects payload-provided non-authoritative %s", (key, value) => {
    expect(
      validateEventTimeWorkResolutionRequestV1({ ...request, [key]: value }),
    ).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        { path: `$.${key}`, code: "unexpected_field" },
      ]),
    });
  });

  it("accepts stable no-match and ambiguous outcomes", () => {
    expect(
      validateEventTimeWorkResolutionResultV1({
        contractVersion: "1",
        outcome: "no_match",
        reasonCode: "device_vehicle_link_not_resolved",
      }).ok,
    ).toBe(true);
    expect(
      validateEventTimeWorkResolutionResultV1({
        contractVersion: "1",
        outcome: "ambiguous",
        reasonCode: "ad_work_assignment_ambiguous",
      }).ok,
    ).toBe(true);
  });

  it("rejects a resolved context that does not use assignment driver authority", () => {
    expect(
      validateEventTimeWorkResolutionResultV1({
        ...resolved,
        context: { ...resolved.context, driverAuthority: "device_registry" },
      }),
    ).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        { path: "$.context.driverAuthority", code: "invalid_value" },
      ]),
    });
  });
});
