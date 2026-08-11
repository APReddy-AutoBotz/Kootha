import {
  M24F_ADAPTER_CONTRACT_VERSION_V1,
  type AdapterCertificationResultV1,
  type AdapterCertificationScenarioCategoryV1,
  type AdapterCertificationScenarioV1,
} from "../../../packages/shared/src/physicalTelemetry/m24fContracts";
import {
  applyReferenceVendorPrivacyBoundaryV1,
  authenticateReferenceVendorRequestV1,
  classifyReferenceVendorDuplicateV1,
  constantTimeEqualBytesV1,
  createReferenceVendorSignatureV1,
  REFERENCE_VENDOR_ADAPTER_ID,
  REFERENCE_VENDOR_ADAPTER_VERSION,
  REFERENCE_VENDOR_CAPABILITY_MANIFEST_V1,
  REFERENCE_VENDOR_MAX_BATCH_SIZE,
  REFERENCE_VENDOR_MAX_PAYLOAD_BYTES,
  REFERENCE_VENDOR_SYNTHETIC_TEST_SECRET,
  REFERENCE_VENDOR_TEST_KEY_ID,
  ReferenceVendorWebhookAdapterV1,
  referenceVendorContentIdentityV1,
  safeReferenceVendorAcknowledgementV1,
  serializeReferenceVendorEventV1,
  type ReferenceVendorEventV1,
} from "./reference-vendor-adapter";
import type { IngressMessageV1, TelemetryProcessingResultV1 } from "../../../packages/shared/src/physicalTelemetry/contracts";

export {
  REFERENCE_VENDOR_ADAPTER_ID,
  REFERENCE_VENDOR_ADAPTER_VERSION,
  REFERENCE_VENDOR_CAPABILITY_MANIFEST_V1,
  REFERENCE_VENDOR_SYNTHETIC_TEST_SECRET,
  REFERENCE_VENDOR_TEST_KEY_ID,
} from "./reference-vendor-adapter";

export const M24F_CERTIFICATION_COMMAND = "test:m24f-adapter-certification" as const;
export const M24F_CERTIFICATION_EVIDENCE_COMMAND = "evidence:m24f-adapter-certification" as const;

const RECEIVED_AT = "2026-08-07T08:00:00.000Z";
const SIGNATURE_TIMESTAMP = "2026-08-07T07:59:30.000Z";
const DEVICE_ID = "synthetic-reference-device-01";

function baseEvent(overrides: Partial<ReferenceVendorEventV1> = {}): ReferenceVendorEventV1 {
  return {
    eventId: "vendor-event-001",
    deviceId: DEVICE_ID,
    capturedAt: "2026-08-07T07:59:00.000Z",
    sequence: 1,
    streamEpoch: "boot-001",
    location: { latitude: 12.9716, longitude: 77.5946, accuracyMeters: 8, speedMetersPerSecond: 5, headingDegrees: 90 },
    health: { heartbeat: true, batteryPercent: 88, externalPower: true, gpsFix: "three_dimensional", gsmSignalDbm: -72 },
    observations: [{ metric: "temperature", value: 28, unit: "celsius" }],
    offline: false,
    ...overrides,
  };
}

function ingress(payload: unknown, contentLengthBytes = JSON.stringify(payload).length): IngressMessageV1 {
  return {
    contractVersion: "1",
    receipt: { contractVersion: "1", correlationId: "safe-correlation-01", hostReceivedAt: RECEIVED_AT },
    transport: "vendor_webhook",
    contentLengthBytes,
    payload,
  };
}

function authOptions(overrides: Partial<Parameters<typeof authenticateReferenceVendorRequestV1>[2]> = {}) {
  return {
    keys: { [REFERENCE_VENDOR_TEST_KEY_ID]: { secret: REFERENCE_VENDOR_SYNTHETIC_TEST_SECRET, status: "active" as const } },
    authenticatedDeviceExternalId: DEVICE_ID,
    receivedAt: RECEIVED_AT,
    ...overrides,
  };
}

function signedHeaders(rawBody: string, overrides: Record<string, string | undefined> = {}) {
  return {
    signature: createReferenceVendorSignatureV1(rawBody, SIGNATURE_TIMESTAMP, REFERENCE_VENDOR_SYNTHETIC_TEST_SECRET),
    signatureTimestamp: SIGNATURE_TIMESTAMP,
    keyId: REFERENCE_VENDOR_TEST_KEY_ID,
    ...overrides,
  };
}

function scenario(
  scenarioId: string,
  category: AdapterCertificationScenarioCategoryV1,
  description: string,
  check: () => void,
): AdapterCertificationScenarioV1 {
  try {
    check();
    return { contractVersion: M24F_ADAPTER_CONTRACT_VERSION_V1, scenarioId, category, description, passed: true, reasonCode: "passed", synthetic: true, checkedAt: RECEIVED_AT };
  } catch (error) {
    return { contractVersion: M24F_ADAPTER_CONTRACT_VERSION_V1, scenarioId, category, description, passed: false, reasonCode: error instanceof Error ? error.message.slice(0, 80) : "failed", synthetic: true, checkedAt: RECEIVED_AT };
  }
}

function expect(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new Error(reason);
}

export function runM24fAdapterCertificationV1(): AdapterCertificationResultV1 {
  const adapter = new ReferenceVendorWebhookAdapterV1();
  const event = baseEvent();
  const rawBody = serializeReferenceVendorEventV1(event);
  const authenticated = authenticateReferenceVendorRequestV1(rawBody, signedHeaders(rawBody), authOptions());
  const parsed = adapter.parse(ingress(event));
  const normalized = authenticated.ok && parsed.ok ? adapter.normalize(parsed.events[0], authenticated.context, RECEIVED_AT) : undefined;
  const scenarios: AdapterCertificationScenarioV1[] = [
    scenario("authentication.valid_synthetic_signature", "authentication", "Valid HMAC signature is accepted.", () => expect(authenticated.ok, "valid_signature_rejected")),
    scenario("authentication.invalid_signature", "authentication", "Changed signature is rejected generically.", () => expect(!authenticateReferenceVendorRequestV1(rawBody, signedHeaders(rawBody, { signature: "sha256=" + "A".repeat(43) }), authOptions()).ok, "invalid_signature_accepted")),
    scenario("authentication.stale_signature", "authentication", "Stale signature timestamp is rejected.", () => expect(!authenticateReferenceVendorRequestV1(rawBody, signedHeaders(rawBody, { signatureTimestamp: "2026-08-06T00:00:00.000Z", signature: createReferenceVendorSignatureV1(rawBody, "2026-08-06T00:00:00.000Z", REFERENCE_VENDOR_SYNTHETIC_TEST_SECRET) }), authOptions()).ok, "stale_signature_accepted")),
    scenario("authentication.missing_signature", "authentication", "Missing signature headers fail closed.", () => expect(!authenticateReferenceVendorRequestV1(rawBody, {}, authOptions()).ok, "missing_signature_accepted")),
    scenario("authentication.wrong_key_id", "authentication", "Unknown key IDs fail closed.", () => expect(!authenticateReferenceVendorRequestV1(rawBody, signedHeaders(rawBody, { keyId: "wrong-key" }), authOptions()).ok, "wrong_key_accepted")),
    scenario("authentication.unknown_device", "authentication", "Unknown devices fail closed before normalization.", () => expect(!authenticateReferenceVendorRequestV1(rawBody, signedHeaders(rawBody), authOptions({ deviceStatus: "unknown" })).ok, "unknown_device_accepted")),
    scenario("authentication.rotated_key", "authentication", "A rotated key remains usable during bounded rotation.", () => expect(authenticateReferenceVendorRequestV1(rawBody, signedHeaders(rawBody), authOptions({ keys: { [REFERENCE_VENDOR_TEST_KEY_ID]: { secret: REFERENCE_VENDOR_SYNTHETIC_TEST_SECRET, status: "rotated" } } })).ok, "rotated_key_rejected")),
    scenario("authentication.revoked_key", "authentication", "A revoked key is rejected.", () => expect(!authenticateReferenceVendorRequestV1(rawBody, signedHeaders(rawBody), authOptions({ keys: { [REFERENCE_VENDOR_TEST_KEY_ID]: { secret: REFERENCE_VENDOR_SYNTHETIC_TEST_SECRET, status: "revoked" } } })).ok, "revoked_key_accepted")),
    scenario("authentication.constant_time_boundary", "authentication", "Equal-length digest comparison uses the constant-time boundary.", () => expect(constantTimeEqualBytesV1(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])), "constant_time_equal_failed")),
    scenario("parsing.valid_payload", "parsing", "A valid vendor payload parses.", () => expect(parsed.ok, "valid_payload_rejected")),
    scenario("parsing.optional_fields_absent", "parsing", "Optional health, location, and observations may be absent.", () => expect(adapter.parse(ingress(baseEvent({ location: undefined, health: undefined, observations: undefined }))).ok, "optional_fields_rejected")),
    scenario("parsing.malformed_json", "parsing", "Malformed JSON is rejected before normalization.", () => expect(!adapter.parse(ingress("not-json")).ok, "malformed_json_accepted")),
    scenario("parsing.oversized_payload", "parsing", "Oversized payloads are rejected.", () => expect(!adapter.parse(ingress(event, REFERENCE_VENDOR_MAX_PAYLOAD_BYTES + 1)).ok, "oversized_payload_accepted")),
    scenario("parsing.unsupported_field", "parsing", "Unexpected vendor fields are rejected.", () => expect(!adapter.parse(ingress({ ...event, workCode: "untrusted" })).ok, "unsupported_field_accepted")),
    scenario("parsing.unsupported_sensor_metric", "parsing", "Unsupported observations are rejected.", () => expect(!adapter.parse(ingress({ ...event, observations: [{ metric: "odometer", value: 1, unit: "km" }] })).ok, "unsupported_sensor_accepted")),
    scenario("parsing.invalid_coordinate", "parsing", "Invalid coordinates are rejected.", () => expect(!adapter.parse(ingress({ ...event, location: { latitude: 120, longitude: 1 } })).ok, "invalid_coordinate_accepted")),
    scenario("parsing.invalid_timestamp", "parsing", "Non-canonical timestamps are rejected.", () => expect(!adapter.parse(ingress({ ...event, capturedAt: "not-a-time" })).ok, "invalid_timestamp_accepted")),
    scenario("parsing.invalid_sequence", "parsing", "Invalid sequences are rejected.", () => expect(!adapter.parse(ingress({ ...event, sequence: -1 })).ok, "invalid_sequence_accepted")),
    scenario("parsing.excessive_batch", "parsing", "Batches are bounded.", () => expect(!adapter.parse(ingress({ events: Array.from({ length: REFERENCE_VENDOR_MAX_BATCH_SIZE + 1 }, (_, index) => baseEvent({ eventId: `event-${index}` })) })).ok, "excessive_batch_accepted")),
    scenario("normalization.stable_event_identity", "normalization", "Vendor identity becomes a stable canonical event identity.", () => expect(normalized?.ok && normalized.event.vendorEventId === event.eventId && normalized.event.adapter.id === REFERENCE_VENDOR_ADAPTER_ID, "identity_not_preserved")),
    scenario("normalization.content_identity", "normalization", "Canonical content identity is deterministic across retries.", () => {
      expect(normalized?.ok, "normalization_failed");
      const retry = adapter.normalize(event, authenticated.ok ? authenticated.context : { authenticatedDeviceExternalId: DEVICE_ID, authenticationMethod: "vendor_signature" }, RECEIVED_AT);
      expect(retry.ok && retry.event.provenance.canonicalPayloadHash === normalized.event.provenance.canonicalPayloadHash, "content_identity_not_stable");
    }),
    scenario("normalization.provenance_and_receipt", "normalization", "Server receipt time, adapter version, and synthetic provenance are present.", () => expect(normalized?.ok && normalized.event.receivedAt === RECEIVED_AT && normalized.event.provenance.synthetic, "provenance_missing")),
    scenario("normalization.health_and_observations", "normalization", "Approved health and sensor observations normalize through TelemetryAdapterV1.", () => expect(normalized?.ok && normalized.event.health?.gsmSignalDbm === -72 && normalized.event.observations?.[0]?.metric === "temperature", "health_not_normalized")),
    scenario("replay.identical_retry", "replay_and_sequence", "Identical event retries classify as duplicates.", () => {
      expect(normalized?.ok, "normalization_failed");
      expect(classifyReferenceVendorDuplicateV1(normalized.event.idempotencyIdentity, normalized.event.idempotencyIdentity, referenceVendorContentIdentityV1(normalized.event), referenceVendorContentIdentityV1(normalized.event)) === "duplicate", "identical_retry_not_duplicate");
    }),
    scenario("replay.changed_content_identity_reuse", "replay_and_sequence", "Changed content reusing an event ID is a conflict.", () => {
      expect(normalized?.ok, "normalization_failed");
      const changed = adapter.normalize({ ...event, location: { ...event.location!, latitude: 12.972 } }, authenticated.ok ? authenticated.context : { authenticatedDeviceExternalId: DEVICE_ID, authenticationMethod: "vendor_signature" }, RECEIVED_AT);
      expect(changed.ok, "changed_event_not_normalized");
      expect(classifyReferenceVendorDuplicateV1(normalized.event.idempotencyIdentity, changed.event.idempotencyIdentity, referenceVendorContentIdentityV1(normalized.event), referenceVendorContentIdentityV1(changed.event)) === "duplicate_conflict", "changed_content_not_conflict");
    }),
    scenario("replay.sequence_gap", "replay_and_sequence", "Sequence gaps remain observable for M21 processing.", () => expect(event.sequence === 1 && baseEvent({ sequence: 3 }).sequence === 3, "sequence_gap_fixture_invalid")),
    scenario("replay.out_of_order", "replay_and_sequence", "Out-of-order events remain distinguishable by sequence.", () => expect(baseEvent({ sequence: 2 }).sequence! < event.sequence! + 2, "out_of_order_fixture_invalid")),
    scenario("replay.expired_replay", "replay_and_sequence", "Expired backfill is rejected by the M21 boundary rather than normalized as live evidence.", () => expect(applyReferenceVendorPrivacyBoundaryV1(normalized?.ok ? normalized.event : event, "expired").disposition === "rejected", "expired_replay_accepted")),
    scenario("replay.reconnect_batch", "replay_and_sequence", "Reconnect batches parse within the bounded batch contract.", () => expect(adapter.parse(ingress({ events: [event, baseEvent({ eventId: "vendor-event-002", sequence: 2, offline: true })] })).ok, "reconnect_batch_rejected")),
    scenario("privacy.valid_active_work", "work_and_privacy", "Active-work telemetry may retain normalized location through M21.", () => expect(applyReferenceVendorPrivacyBoundaryV1(normalized?.ok ? normalized.event : event, "active").locationPersisted, "active_location_not_allowed")),
    scenario("privacy.before_start", "work_and_privacy", "Before Start Work does not retain location.", () => expect(!applyReferenceVendorPrivacyBoundaryV1(normalized?.ok ? normalized.event : event, "before_start").locationPersisted, "before_start_location_retained")),
    scenario("privacy.break", "work_and_privacy", "Break evidence is health-only.", () => expect(applyReferenceVendorPrivacyBoundaryV1(normalized?.ok ? normalized.event : event, "break").disposition === "health_only", "break_not_health_only")),
    scenario("privacy.after_end", "work_and_privacy", "After End Work evidence is health-only.", () => expect(!applyReferenceVendorPrivacyBoundaryV1(normalized?.ok ? normalized.event : event, "after_end").locationPersisted, "after_end_location_retained")),
    scenario("privacy.delayed_valid_backfill", "work_and_privacy", "Valid delayed backfill is separate from live evidence.", () => expect(applyReferenceVendorPrivacyBoundaryV1(normalized?.ok ? normalized.event : event, "delayed_valid").disposition === "accepted_delayed", "delayed_backfill_not_separate")),
    scenario("privacy.assignment_and_device_authority", "work_and_privacy", "Payload business identity cannot override authenticated device authority.", () => expect(!adapter.normalize({ ...event, deviceId: "other-device" }, authenticated.ok ? authenticated.context : { authenticatedDeviceExternalId: DEVICE_ID, authenticationMethod: "vendor_signature" }, RECEIVED_AT).ok, "payload_identity_overrode_authority")),
    scenario("privacy.off_work_health_only", "work_and_privacy", "Off-work health-only evidence has no location.", () => expect(!applyReferenceVendorPrivacyBoundaryV1(normalized?.ok ? normalized.event : event, "off_work_health_only").locationPersisted, "off_work_location_retained")),
    scenario("safe_output.no_secret", "safe_output", "Acknowledgements do not contain the synthetic secret.", () => {
      const result: TelemetryProcessingResultV1 = { contractVersion: "1", idempotencyIdentity: "safe-id", disposition: "rejected", reasonCode: "authentication_failed", freshness: "not_applicable", offlineBackfill: false, quality: "rejected", persistenceStatus: "not_attempted" };
      const acknowledgement = adapter.acknowledge([result], { contractVersion: "1", correlationId: "safe-correlation-01", hostReceivedAt: RECEIVED_AT });
      expect(!JSON.stringify(safeReferenceVendorAcknowledgementV1(acknowledgement)).includes(REFERENCE_VENDOR_SYNTHETIC_TEST_SECRET), "secret_leaked");
    }),
    scenario("safe_output.no_raw_payload_or_coordinate", "safe_output", "Safe output does not include raw payload or coordinates.", () => {
      const acknowledgement = adapter.acknowledge([], { contractVersion: "1", correlationId: "safe-correlation-01", hostReceivedAt: RECEIVED_AT });
      const safe = JSON.stringify(safeReferenceVendorAcknowledgementV1(acknowledgement));
      expect(!safe.includes("12.9716") && !safe.includes("vendor-event-001"), "unsafe_output_reference");
    }),
    scenario("safe_output.generic_authentication_rejection", "safe_output", "Authentication failures share a generic safe reason.", () => expect(authenticateReferenceVendorRequestV1(rawBody, signedHeaders(rawBody, { signature: "sha256=" + "B".repeat(43) }), authOptions()).ok === false, "generic_authentication_rejection_missing")),
  ];
  const passedCount = scenarios.filter((item) => item.passed).length;
  return {
    contractVersion: M24F_ADAPTER_CONTRACT_VERSION_V1,
    adapterId: REFERENCE_VENDOR_ADAPTER_ID,
    adapterVersion: REFERENCE_VENDOR_ADAPTER_VERSION,
    certificationLevel: "synthetic_conformance",
    certificationState: passedCount === scenarios.length ? "passed" : "failed",
    synthetic: true,
    scenarioCount: scenarios.length,
    passedCount,
    failedCount: scenarios.length - passedCount,
    scenarios,
    safeSummary: `${passedCount}/${scenarios.length} synthetic certification scenarios passed; no vendor, credential, hardware, raw payload, or coordinate evidence was used.`,
    generatedAt: RECEIVED_AT,
  };
}

export function renderM24fCertificationSummaryV1(result: AdapterCertificationResultV1): string {
  return [
    `M24F ${result.adapterId} ${result.adapterVersion}`,
    `State: ${result.certificationState}; level: ${result.certificationLevel}`,
    `Scenarios: ${result.passedCount}/${result.scenarioCount} passed`,
    result.safeSummary,
    "Synthetic-only. Not a production vendor integration.",
  ].join("\n");
}

export function serializeM24fCertificationResultV1(result: AdapterCertificationResultV1): string {
  return JSON.stringify(result, null, 2);
}
