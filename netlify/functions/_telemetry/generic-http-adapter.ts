import type {
  AdapterAuthenticationContextV1,
  AdapterNormalizationResultV1,
  AdapterParseResultV1,
  CanonicalSensorObservationV1,
  CanonicalTelemetryEventV1,
  IngressAcknowledgementV1,
  IngressMessageV1,
  IngressReceiptContextV1,
  TelemetryAdapterV1,
  TelemetryProcessingResultV1,
} from "../../../packages/shared/src/physicalTelemetry/contracts";
import {
  canonicalizeStableJsonV1,
  createCanonicalEventIdentityV1,
} from "../../../packages/shared/src/physicalTelemetry/identity";
import { validateCanonicalTelemetryEventV1 } from "../../../packages/shared/src/physicalTelemetry/validation";
import { NodeSha256DigestProviderV1 } from "./server-crypto";

export const GENERIC_HTTP_ADAPTER_ID = "kootha.generic_http";
export const GENERIC_HTTP_ADAPTER_VERSION = "1";
export const GENERIC_HTTP_NORMALIZATION_VERSION = "generic-http-v1";
export const MAX_HTTP_EVENTS = 100;
export const MAX_OBSERVATIONS_PER_EVENT = 32;

const REQUEST_FIELDS = new Set(["contractVersion", "events"]);
const EVENT_FIELDS = new Set([
  "sourceEventId",
  "clientEventId",
  "capturedAt",
  "streamEpoch",
  "sequence",
  "position",
  "health",
  "observations",
]);
const POSITION_FIELDS = new Set([
  "latitude",
  "longitude",
  "altitudeMeters",
  "accuracyMeters",
  "speedMetersPerSecond",
  "headingDegrees",
  "satellites",
]);
const HEALTH_FIELDS = new Set([
  "heartbeat",
  "batteryPercent",
  "externalPower",
  "firmwareVersion",
  "gpsFix",
  "gsmSignalDbm",
]);
const OBSERVATION_FIELDS = new Set(["metric", "value", "unit"]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function hasExactFields(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): boolean {
  return (
    Object.keys(value).every((key) => allowed.has(key)) &&
    Object.getOwnPropertySymbols(value).length === 0
  );
}

function boundedText(
  value: unknown,
  maximumLength: number,
): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximumLength &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function validInputEvent(value: unknown): value is Record<string, unknown> {
  if (!isPlainRecord(value) || !hasExactFields(value, EVENT_FIELDS)) return false;
  if (
    !boundedText(value.capturedAt, 40) ||
    (value.clientEventId !== undefined &&
      !boundedText(value.clientEventId, 128)) ||
    (value.sourceEventId !== undefined &&
      !boundedText(value.sourceEventId, 128)) ||
    (value.streamEpoch !== undefined &&
      !boundedText(value.streamEpoch, 128)) ||
    (value.sequence !== undefined &&
      (!Number.isSafeInteger(value.sequence) ||
        (value.sequence as number) < 0)) ||
    ((value.streamEpoch === undefined) !== (value.sequence === undefined))
  ) {
    return false;
  }
  if (
    value.position !== undefined &&
    (!isPlainRecord(value.position) ||
      !hasExactFields(value.position, POSITION_FIELDS))
  ) {
    return false;
  }
  if (
    value.health !== undefined &&
    (!isPlainRecord(value.health) ||
      !hasExactFields(value.health, HEALTH_FIELDS))
  ) {
    return false;
  }
  if (value.observations !== undefined) {
    if (
      !Array.isArray(value.observations) ||
      value.observations.length > MAX_OBSERVATIONS_PER_EVENT
    ) {
      return false;
    }
    for (const observation of value.observations) {
      if (
        !isPlainRecord(observation) ||
        !hasExactFields(observation, OBSERVATION_FIELDS)
      ) {
        return false;
      }
    }
  }
  return true;
}

function normalizeObservation(
  value: Record<string, unknown>,
  capturedAt: string,
  deviceExternalId: string,
): CanonicalSensorObservationV1 | undefined {
  const base = {
    contractVersion: "1" as const,
    capturedAt,
    deviceExternalId,
    source: "physical_device" as const,
    normalizationVersion: GENERIC_HTTP_NORMALIZATION_VERSION,
    quality: "good" as const,
    synthetic: false,
  };
  switch (value.metric) {
    case "fuel_level":
      return value.unit === "percentage" && typeof value.value === "number"
        ? { ...base, metric: "fuel_level", value: value.value, unit: "percentage" }
        : undefined;
    case "temperature":
      return value.unit === "celsius" && typeof value.value === "number"
        ? { ...base, metric: "temperature", value: value.value, unit: "celsius" }
        : undefined;
    case "door_state":
      return value.unit === "state" &&
        ["open", "closed", "unknown"].includes(value.value as string)
        ? {
            ...base,
            metric: "door_state",
            value: value.value as "open" | "closed" | "unknown",
            unit: "state",
          }
        : undefined;
    case "vibration":
      return value.unit === "meters_per_second_squared" &&
        typeof value.value === "number"
        ? {
            ...base,
            metric: "vibration",
            value: value.value,
            unit: "meters_per_second_squared",
          }
        : undefined;
    case "external_power":
    case "ignition":
    case "tamper":
      return value.unit === "boolean" && typeof value.value === "boolean"
        ? {
            ...base,
            metric: value.metric,
            value: value.value,
            unit: "boolean",
          }
        : undefined;
    default:
      return undefined;
  }
}

export class GenericHttpTelemetryAdapterV1 implements TelemetryAdapterV1 {
  readonly contractVersion = "1";
  readonly adapterId = GENERIC_HTTP_ADAPTER_ID;
  readonly adapterVersion = GENERIC_HTTP_ADAPTER_VERSION;
  readonly #digest = new NodeSha256DigestProviderV1();

  async authenticate(): Promise<never> {
    throw new Error("Authentication is performed by the server host boundary.");
  }

  parse(message: IngressMessageV1): AdapterParseResultV1 {
    if (
      !isPlainRecord(message.payload) ||
      !hasExactFields(message.payload, REQUEST_FIELDS) ||
      message.payload.contractVersion !== "1" ||
      !Array.isArray(message.payload.events)
    ) {
      return { ok: false, reasonCode: "vendor_schema_invalid" };
    }
    if (message.payload.events.length > MAX_HTTP_EVENTS) {
      return { ok: false, reasonCode: "batch_too_large" };
    }
    if (
      message.payload.events.length === 0 ||
      !message.payload.events.every(validInputEvent)
    ) {
      return { ok: false, reasonCode: "vendor_schema_invalid" };
    }
    return { ok: true, events: message.payload.events };
  }

  normalize(
    vendorEvent: unknown,
    authentication: AdapterAuthenticationContextV1,
    receivedAt: string,
  ): AdapterNormalizationResultV1 {
    if (!validInputEvent(vendorEvent)) {
      return { ok: false, reasonCode: "canonical_event_invalid" };
    }
    const capturedAt = vendorEvent.capturedAt as string;
    const capturedMs = Date.parse(capturedAt);
    const receivedMs = Date.parse(receivedAt);
    if (
      !Number.isFinite(capturedMs) ||
      !Number.isFinite(receivedMs) ||
      new Date(capturedMs).toISOString() !== capturedAt
    ) {
      return { ok: false, reasonCode: "captured_time_invalid" };
    }
    const observations: CanonicalSensorObservationV1[] = [];
    for (const raw of (vendorEvent.observations ?? []) as Record<
      string,
      unknown
    >[]) {
      const normalized = normalizeObservation(
        raw,
        capturedAt,
        authentication.authenticatedDeviceExternalId,
      );
      if (normalized === undefined) {
        return { ok: false, reasonCode: "sensor_observation_unsupported" };
      }
      observations.push(normalized);
    }
    const rawCanonical = canonicalizeStableJsonV1(vendorEvent);
    if (!rawCanonical.ok) {
      return { ok: false, reasonCode: "canonical_event_invalid" };
    }
    const canonicalMaterial = canonicalizeStableJsonV1({
      sourceEventId: vendorEvent.sourceEventId ?? null,
      clientEventId: vendorEvent.clientEventId ?? null,
      deviceExternalId: authentication.authenticatedDeviceExternalId,
      capturedAt,
      streamEpoch: vendorEvent.streamEpoch ?? null,
      sequence: vendorEvent.sequence ?? null,
      position: vendorEvent.position ?? null,
      health: vendorEvent.health ?? null,
      observations,
    });
    if (!canonicalMaterial.ok) {
      return { ok: false, reasonCode: "canonical_event_invalid" };
    }
    const rawPayloadHash = this.#digest.digestUtf8(rawCanonical.value);
    const canonicalPayloadHash = this.#digest.digestUtf8(canonicalMaterial.value);
    const identity = createCanonicalEventIdentityV1(
      {
        adapterId: this.adapterId,
        adapterVersion: this.adapterVersion,
        deviceExternalId: authentication.authenticatedDeviceExternalId,
        vendorEventId: vendorEvent.sourceEventId as string | undefined,
        clientEventId: vendorEvent.clientEventId as string | undefined,
        capturedAt,
        streamEpoch: vendorEvent.streamEpoch as string | undefined,
        sequence: vendorEvent.sequence as number | undefined,
        canonicalPayloadHash,
      },
      this.#digest,
    );
    if (!identity.ok) {
      return { ok: false, reasonCode: "event_identity_invalid" };
    }
    const event: CanonicalTelemetryEventV1 = {
      contractVersion: "1",
      canonicalEventId: `canonical:v1:${this.#digest.digestUtf8(identity.value.identity)}`,
      idempotencyIdentity: identity.value.identity,
      ...(vendorEvent.sourceEventId === undefined
        ? {}
        : { vendorEventId: vendorEvent.sourceEventId as string }),
      ...(vendorEvent.clientEventId === undefined
        ? {}
        : { clientEventId: vendorEvent.clientEventId as string }),
      deviceExternalId: authentication.authenticatedDeviceExternalId,
      authenticatedDeviceExternalId:
        authentication.authenticatedDeviceExternalId,
      adapter: { id: this.adapterId, version: this.adapterVersion },
      ...(vendorEvent.streamEpoch === undefined
        ? {}
        : {
            stream: {
              epoch: vendorEvent.streamEpoch as string,
              sequence: vendorEvent.sequence as number,
            },
          }),
      capturedAt,
      receivedAt,
      normalizedAt: receivedAt,
      observedClockOffsetMs: receivedMs - capturedMs,
      ...(vendorEvent.position === undefined
        ? {}
        : { position: vendorEvent.position as CanonicalTelemetryEventV1["position"] }),
      ...(vendorEvent.health === undefined
        ? {}
        : { health: vendorEvent.health as CanonicalTelemetryEventV1["health"] }),
      ...(observations.length === 0 ? {} : { observations }),
      quality: "valid",
      provenance: {
        source: "physical_device",
        normalizationVersion: GENERIC_HTTP_NORMALIZATION_VERSION,
        synthetic: false,
        rawPayloadHash,
        canonicalPayloadHash,
      },
    };
    const validated = validateCanonicalTelemetryEventV1(event);
    return validated.ok
      ? { ok: true, event: validated.value }
      : { ok: false, reasonCode: "canonical_event_invalid" };
  }

  acknowledge(
    results: readonly TelemetryProcessingResultV1[],
    receipt: IngressReceiptContextV1,
  ): IngressAcknowledgementV1 {
    const rejectedCount = results.filter(
      (result) =>
        result.disposition === "rejected" ||
        result.disposition === "duplicate_conflict",
    ).length;
    const acceptedCount = results.length - rejectedCount;
    return {
      contractVersion: "1",
      receipt,
      status:
        rejectedCount === 0
          ? "accepted"
          : acceptedCount === 0
            ? "rejected"
            : "partially_accepted",
      acceptedCount,
      rejectedCount,
      retryable: false,
      reasonCode:
        rejectedCount === 0
          ? "processed"
          : acceptedCount === 0
            ? "request_rejected"
            : "partial_rejection",
    };
  }
}
