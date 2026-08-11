import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  canonicalizeStableJsonV1,
  createCanonicalEventContentIdentityV1,
  createCanonicalEventIdentityV1,
  validateCanonicalTelemetryEventV1,
  type AdapterAuthenticationContextV1,
  type AdapterAuthenticationResultV1,
  type AdapterCapabilityManifestV1,
  type AdapterNormalizationResultV1,
  type AdapterParseResultV1,
  type AdapterTransportCapabilityV1,
  type CanonicalSensorObservationV1,
  type CanonicalTelemetryEventV1,
  type IngressAcknowledgementV1,
  type IngressMessageV1,
  type IngressReceiptContextV1,
  type TelemetryAdapterV1,
  type TelemetryProcessingResultV1,
} from "../../../packages/shared/src/physicalTelemetry/index";

export const REFERENCE_VENDOR_ADAPTER_ID = "reference-vendor-webhook-v1" as const;
export const REFERENCE_VENDOR_ADAPTER_VERSION = "1.0.0" as const;
export const REFERENCE_VENDOR_TEST_KEY_ID = "reference-synthetic-key-v1" as const;
export const REFERENCE_VENDOR_MAX_PAYLOAD_BYTES = 64 * 1024;
export const REFERENCE_VENDOR_MAX_BATCH_SIZE = 100;
export const REFERENCE_VENDOR_SIGNATURE_MAX_AGE_SECONDS = 300;

export const REFERENCE_VENDOR_CAPABILITY_MANIFEST_V1: AdapterCapabilityManifestV1 = {
  contractVersion: "m24f-adapter-v1",
  adapterId: REFERENCE_VENDOR_ADAPTER_ID,
  adapterVersion: REFERENCE_VENDOR_ADAPTER_VERSION,
  vendorDeviceFamilyLabel: "Synthetic reference vendor-cloud webhook",
  transport: {
    type: "vendor_webhook",
    webhookOrPollingDirection: "inbound",
    batchingSupported: true,
    documentedPayloadSizeBytes: REFERENCE_VENDOR_MAX_PAYLOAD_BYTES,
    documentedEventsPerMinute: 600,
  } satisfies AdapterTransportCapabilityV1,
  authentication: {
    type: "hmac_signature",
    keyIdAvailable: true,
    rotationSupported: true,
    revocationSupported: true,
    signatureTimestampSupported: true,
    serverOnlySecretRequired: true,
  },
  timestamp: {
    deviceTimestampAvailable: true,
    timestampAuthority: "device",
    timezone: "utc",
    futureSkewSeconds: 30,
    delayedBackfillSeconds: 86_400,
  },
  replay: {
    stableEventIdAvailable: true,
    sequenceAvailable: true,
    streamOrBootEpochAvailable: true,
    offlineBufferingSupported: true,
    acknowledgementSemantics: "per_batch",
    retrySemantics: "same_event_id",
  },
  health: {
    heartbeatSupported: true,
    batterySupported: true,
    externalPowerSupported: true,
    gpsFixSupported: true,
    gsmSignalSupported: true,
    firmwareVersionSupported: false,
  },
  sensor: {
    locationSupported: true,
    approvedMetrics: ["fuel_level", "temperature", "door_state", "vibration", "external_power", "ignition", "tamper"],
  },
  secretStorageRequirement: "server_secret_store",
  sandboxAvailability: "available",
  dataResidencyNote: "Synthetic fixture only; no vendor residency claim.",
  supportEscalationNote: "Synthetic fixture support is the repository test owner only.",
  certificationState: "passed",
  certificationLevel: "synthetic_conformance",
  evidenceLevel: "synthetic_conformance",
  syntheticState: "synthetic_only",
  createdAt: "2026-08-07T00:00:00.000Z",
};

export interface ReferenceVendorPositionV1 {
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracyMeters?: number;
  readonly speedMetersPerSecond?: number;
  readonly headingDegrees?: number;
}

export interface ReferenceVendorHealthV1 {
  readonly heartbeat?: boolean;
  readonly batteryPercent?: number;
  readonly externalPower?: boolean;
  readonly gpsFix?: "none" | "two_dimensional" | "three_dimensional";
  readonly gsmSignalDbm?: number;
}

export type ReferenceVendorObservationV1 =
  | { readonly metric: "fuel_level"; readonly value: number; readonly unit: "percentage" }
  | { readonly metric: "temperature"; readonly value: number; readonly unit: "celsius" }
  | { readonly metric: "door_state"; readonly value: "open" | "closed" | "unknown"; readonly unit: "state" }
  | { readonly metric: "vibration"; readonly value: number; readonly unit: "meters_per_second_squared" }
  | { readonly metric: "external_power" | "ignition" | "tamper"; readonly value: boolean; readonly unit: "boolean" };

export interface ReferenceVendorEventV1 {
  readonly eventId: string;
  readonly deviceId: string;
  readonly capturedAt: string;
  readonly sequence?: number;
  readonly streamEpoch?: string;
  readonly location?: ReferenceVendorPositionV1;
  readonly health?: ReferenceVendorHealthV1;
  readonly observations?: readonly ReferenceVendorObservationV1[];
  readonly offline: boolean;
}

export interface ReferenceVendorHeadersV1 {
  readonly signature?: string;
  readonly signatureTimestamp?: string;
  readonly keyId?: string;
}

export interface ReferenceVendorKeyV1 {
  readonly secret: string;
  readonly status: "active" | "rotated" | "revoked";
}

export interface ReferenceVendorAuthenticationOptionsV1 {
  readonly keys: Readonly<Record<string, ReferenceVendorKeyV1>>;
  readonly authenticatedDeviceExternalId: string;
  readonly deviceStatus?: "active" | "unknown" | "inactive";
  readonly receivedAt: string;
  readonly maximumAgeSeconds?: number;
}

export type ReferenceVendorSafeAuthFailureV1 =
  | "authentication_missing"
  | "authentication_invalid"
  | "device_unknown"
  | "device_inactive";

export type ReferenceVendorAuthenticationResultV1 =
  | { readonly ok: true; readonly context: AdapterAuthenticationContextV1 }
  | { readonly ok: false; readonly reasonCode: ReferenceVendorSafeAuthFailureV1 };

export const REFERENCE_VENDOR_SYNTHETIC_TEST_SECRET = "m24f-synthetic-certification-only" as const;

function safeText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function validIsoTimestamp(value: unknown): value is string {
  if (!safeText(value, 40)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function validPosition(value: unknown): value is ReferenceVendorPositionV1 {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, ["latitude", "longitude", "accuracyMeters", "speedMetersPerSecond", "headingDegrees"])) return false;
  const latitude = value.latitude;
  const longitude = value.longitude;
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) return false;
  if (typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return false;
  for (const field of ["accuracyMeters", "speedMetersPerSecond", "headingDegrees"] as const) {
    if (value[field] !== undefined && (typeof value[field] !== "number" || !Number.isFinite(value[field]) || value[field] < 0)) return false;
  }
  if (typeof value.headingDegrees === "number" && value.headingDegrees > 360) return false;
  return true;
}

function validHealth(value: unknown): value is ReferenceVendorHealthV1 {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, ["heartbeat", "batteryPercent", "externalPower", "gpsFix", "gsmSignalDbm"])) return false;
  if (value.heartbeat !== undefined && typeof value.heartbeat !== "boolean") return false;
  if (value.externalPower !== undefined && typeof value.externalPower !== "boolean") return false;
  if (value.batteryPercent !== undefined && (typeof value.batteryPercent !== "number" || value.batteryPercent < 0 || value.batteryPercent > 100)) return false;
  if (value.gsmSignalDbm !== undefined && (typeof value.gsmSignalDbm !== "number" || !Number.isFinite(value.gsmSignalDbm) || value.gsmSignalDbm > 0)) return false;
  return value.gpsFix === undefined || value.gpsFix === "none" || value.gpsFix === "two_dimensional" || value.gpsFix === "three_dimensional";
}

function validObservation(value: unknown): value is ReferenceVendorObservationV1 {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, ["metric", "value", "unit"])) return false;
  switch (value.metric) {
    case "fuel_level": return value.unit === "percentage" && typeof value.value === "number" && value.value >= 0 && value.value <= 100;
    case "temperature": return value.unit === "celsius" && typeof value.value === "number" && Number.isFinite(value.value);
    case "door_state": return value.unit === "state" && (value.value === "open" || value.value === "closed" || value.value === "unknown");
    case "vibration": return value.unit === "meters_per_second_squared" && typeof value.value === "number" && value.value >= 0 && Number.isFinite(value.value);
    case "external_power":
    case "ignition":
    case "tamper": return value.unit === "boolean" && typeof value.value === "boolean";
    default: return false;
  }
}

export function validateReferenceVendorEventV1(value: unknown): value is ReferenceVendorEventV1 {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, ["eventId", "deviceId", "capturedAt", "sequence", "streamEpoch", "location", "health", "observations", "offline"])) return false;
  if (!safeText(value.eventId, 128) || !safeText(value.deviceId, 128) || !validIsoTimestamp(value.capturedAt) || typeof value.offline !== "boolean") return false;
  if (value.sequence !== undefined && (typeof value.sequence !== "number" || !Number.isSafeInteger(value.sequence) || value.sequence < 0)) return false;
  if (value.streamEpoch !== undefined && !safeText(value.streamEpoch, 128)) return false;
  if (value.streamEpoch !== undefined && value.sequence === undefined) return false;
  if (value.location !== undefined && !validPosition(value.location)) return false;
  if (value.health !== undefined && !validHealth(value.health)) return false;
  if (value.observations !== undefined && (!Array.isArray(value.observations) || value.observations.length > 16 || !value.observations.every(validObservation))) return false;
  return true;
}

export function serializeReferenceVendorEventV1(value: ReferenceVendorEventV1): string {
  return JSON.stringify(value);
}

function base64Url(value: Buffer): string {
  return value.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    return Buffer.from(value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4), "base64");
  } catch {
    return null;
  }
}

export function constantTimeEqualBytesV1(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

export function createReferenceVendorSignatureV1(rawBody: string, timestamp: string, secret: string): string {
  return `sha256=${base64Url(createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest())}`;
}

export function authenticateReferenceVendorRequestV1(
  rawBody: string,
  headers: ReferenceVendorHeadersV1,
  options: ReferenceVendorAuthenticationOptionsV1,
): ReferenceVendorAuthenticationResultV1 {
  if (!headers.signature || !headers.signatureTimestamp || !headers.keyId) return { ok: false, reasonCode: "authentication_missing" };
  if (options.deviceStatus === "unknown") return { ok: false, reasonCode: "device_unknown" };
  if (options.deviceStatus === "inactive") return { ok: false, reasonCode: "device_inactive" };
  const key = options.keys[headers.keyId];
  if (!key || key.status === "revoked") return { ok: false, reasonCode: "authentication_invalid" };
  const receivedMs = Date.parse(options.receivedAt);
  const signatureMs = Date.parse(headers.signatureTimestamp);
  const maximumAge = options.maximumAgeSeconds ?? REFERENCE_VENDOR_SIGNATURE_MAX_AGE_SECONDS;
  if (!Number.isFinite(receivedMs) || !Number.isFinite(signatureMs) || Math.abs(receivedMs - signatureMs) > maximumAge * 1_000) return { ok: false, reasonCode: "authentication_invalid" };
  if (!/^sha256=[A-Za-z0-9_-]{43}$/.test(headers.signature)) return { ok: false, reasonCode: "authentication_invalid" };
  const expected = createReferenceVendorSignatureV1(rawBody, headers.signatureTimestamp, key.secret).slice(7);
  const actualBytes = decodeBase64Url(headers.signature.slice(7));
  const expectedBytes = decodeBase64Url(expected);
  if (actualBytes === null || expectedBytes === null || !constantTimeEqualBytesV1(actualBytes, expectedBytes)) return { ok: false, reasonCode: "authentication_invalid" };
  return {
    ok: true,
    context: {
      authenticatedDeviceExternalId: options.authenticatedDeviceExternalId,
      authenticationMethod: "vendor_signature",
      credentialKeyId: headers.keyId,
    },
  };
}

class Sha256DigestProviderV1 {
  public readonly algorithm = "sha256";
  public digestUtf8(value: string): string {
    return createHash("sha256").update(value, "utf8").digest("hex");
  }
}

function normalizeObservation(
  observation: ReferenceVendorObservationV1,
  capturedAt: string,
  deviceExternalId: string,
): CanonicalSensorObservationV1 {
  const base = {
    contractVersion: "1" as const,
    capturedAt,
    deviceExternalId,
    source: "simulator" as const,
    normalizationVersion: REFERENCE_VENDOR_ADAPTER_VERSION,
    quality: "good" as const,
    synthetic: true,
  };
  return { ...base, metric: observation.metric, value: observation.value, unit: observation.unit } as CanonicalSensorObservationV1;
}

export class ReferenceVendorWebhookAdapterV1 implements TelemetryAdapterV1 {
  public readonly contractVersion = "1" as const;
  public readonly adapterId = REFERENCE_VENDOR_ADAPTER_ID;
  public readonly adapterVersion = REFERENCE_VENDOR_ADAPTER_VERSION;
  private readonly digest = new Sha256DigestProviderV1();

  public async authenticate(_message: IngressMessageV1): Promise<AdapterAuthenticationResultV1> {
    return { ok: false, reasonCode: "authentication_missing" };
  }

  public parse(message: IngressMessageV1): AdapterParseResultV1 {
    if (message.contentLengthBytes > REFERENCE_VENDOR_MAX_PAYLOAD_BYTES) return { ok: false, reasonCode: "payload_too_large" };
    if (isPlainRecord(message.payload) && Array.isArray(message.payload.events)) {
      if (message.payload.events.length === 0 || message.payload.events.length > REFERENCE_VENDOR_MAX_BATCH_SIZE || !message.payload.events.every(validateReferenceVendorEventV1)) return { ok: false, reasonCode: "vendor_schema_invalid" };
      return { ok: true, events: message.payload.events };
    }
    return validateReferenceVendorEventV1(message.payload)
      ? { ok: true, events: [message.payload] }
      : { ok: false, reasonCode: "vendor_schema_invalid" };
  }

  public normalize(
    vendorEvent: unknown,
    authentication: AdapterAuthenticationContextV1,
    receivedAt: string,
  ): AdapterNormalizationResultV1 {
    if (!validateReferenceVendorEventV1(vendorEvent)) return { ok: false, reasonCode: "canonical_event_invalid" };
    if (vendorEvent.deviceId !== authentication.authenticatedDeviceExternalId) return { ok: false, reasonCode: "device_vehicle_link_invalid" };
    const rawCanonical = canonicalizeStableJsonV1(vendorEvent);
    if (!rawCanonical.ok) return { ok: false, reasonCode: "canonical_event_invalid" };
    const observations = vendorEvent.observations?.map((observation) => normalizeObservation(observation, vendorEvent.capturedAt, authentication.authenticatedDeviceExternalId));
    const canonicalMaterial = canonicalizeStableJsonV1({
      adapter: { id: this.adapterId, version: this.adapterVersion },
      eventId: vendorEvent.eventId,
      deviceId: authentication.authenticatedDeviceExternalId,
      capturedAt: vendorEvent.capturedAt,
      sequence: vendorEvent.sequence ?? null,
      streamEpoch: vendorEvent.streamEpoch ?? null,
      location: vendorEvent.location ?? null,
      health: vendorEvent.health ?? null,
      observations: observations ?? [],
      offline: vendorEvent.offline,
    });
    if (!canonicalMaterial.ok) return { ok: false, reasonCode: "canonical_event_invalid" };
    const rawPayloadHash = this.digest.digestUtf8(rawCanonical.value);
    const canonicalPayloadHash = this.digest.digestUtf8(canonicalMaterial.value);
    const identity = createCanonicalEventIdentityV1({
      adapterId: this.adapterId,
      adapterVersion: this.adapterVersion,
      deviceExternalId: authentication.authenticatedDeviceExternalId,
      vendorEventId: vendorEvent.eventId,
      capturedAt: vendorEvent.capturedAt,
      streamEpoch: vendorEvent.streamEpoch,
      sequence: vendorEvent.sequence,
      canonicalPayloadHash,
    }, this.digest);
    if (!identity.ok) return { ok: false, reasonCode: "event_identity_invalid" };
    const event: CanonicalTelemetryEventV1 = {
      contractVersion: "1",
      canonicalEventId: `canonical:v1:${this.digest.digestUtf8(identity.value.identity)}`,
      idempotencyIdentity: identity.value.identity,
      vendorEventId: vendorEvent.eventId,
      deviceExternalId: authentication.authenticatedDeviceExternalId,
      authenticatedDeviceExternalId: authentication.authenticatedDeviceExternalId,
      adapter: { id: this.adapterId, version: this.adapterVersion },
      ...(vendorEvent.streamEpoch === undefined ? {} : { stream: { epoch: vendorEvent.streamEpoch, sequence: vendorEvent.sequence! } }),
      capturedAt: vendorEvent.capturedAt,
      receivedAt,
      normalizedAt: receivedAt,
      observedClockOffsetMs: Date.parse(receivedAt) - Date.parse(vendorEvent.capturedAt),
      ...(vendorEvent.location === undefined ? {} : { position: {
        latitude: vendorEvent.location.latitude,
        longitude: vendorEvent.location.longitude,
        accuracyMeters: vendorEvent.location.accuracyMeters,
        speedMetersPerSecond: vendorEvent.location.speedMetersPerSecond,
        headingDegrees: vendorEvent.location.headingDegrees,
      } }),
      ...(vendorEvent.health === undefined ? {} : { health: {
        heartbeat: vendorEvent.health.heartbeat ?? true,
        batteryPercent: vendorEvent.health.batteryPercent,
        externalPower: vendorEvent.health.externalPower,
        gpsFix: vendorEvent.health.gpsFix,
        gsmSignalDbm: vendorEvent.health.gsmSignalDbm,
      } }),
      ...(observations === undefined ? {} : { observations }),
      quality: vendorEvent.location === undefined ? "degraded" : "valid",
      provenance: {
        source: "simulator",
        normalizationVersion: REFERENCE_VENDOR_ADAPTER_VERSION,
        synthetic: true,
        rawPayloadHash,
        canonicalPayloadHash,
      },
    };
    const validated = validateCanonicalTelemetryEventV1(event);
    return validated.ok ? { ok: true, event: validated.value } : { ok: false, reasonCode: "canonical_event_invalid" };
  }

  public acknowledge(results: readonly TelemetryProcessingResultV1[], receipt: IngressReceiptContextV1): IngressAcknowledgementV1 {
    const rejectedCount = results.filter((result) => result.disposition === "rejected" || result.disposition === "duplicate_conflict").length;
    const acceptedCount = results.length - rejectedCount;
    return {
      contractVersion: "1",
      receipt,
      status: rejectedCount === 0 ? "accepted" : acceptedCount === 0 ? "rejected" : "partially_accepted",
      acceptedCount,
      rejectedCount,
      retryable: false,
      reasonCode: rejectedCount === 0 ? "processed" : acceptedCount === 0 ? "request_rejected" : "partial_rejection",
    };
  }
}

export type ReferenceVendorWorkStateV1 = "active" | "before_start" | "break" | "after_end" | "delayed_valid" | "expired" | "off_work_health_only";

export function applyReferenceVendorPrivacyBoundaryV1(
  event: CanonicalTelemetryEventV1,
  state: ReferenceVendorWorkStateV1,
): { readonly disposition: "accepted_live" | "accepted_delayed" | "health_only" | "rejected"; readonly locationPersisted: boolean; readonly synthetic: true } {
  if (state === "active") return { disposition: "accepted_live", locationPersisted: event.position !== undefined, synthetic: true };
  if (state === "delayed_valid") return { disposition: "accepted_delayed", locationPersisted: event.position !== undefined, synthetic: true };
  if (state === "expired") return { disposition: "rejected", locationPersisted: false, synthetic: true };
  return { disposition: "health_only", locationPersisted: false, synthetic: true };
}

export function classifyReferenceVendorDuplicateV1(
  knownEventIdentity: string,
  incomingEventIdentity: string,
  knownContentIdentity: string,
  incomingContentIdentity: string,
): "not_duplicate" | "duplicate" | "duplicate_conflict" {
  if (knownEventIdentity !== incomingEventIdentity) return "not_duplicate";
  return knownContentIdentity === incomingContentIdentity ? "duplicate" : "duplicate_conflict";
}

export function referenceVendorContentIdentityV1(event: CanonicalTelemetryEventV1): string {
  const result = createCanonicalEventContentIdentityV1(event, new Sha256DigestProviderV1());
  if (!result.ok) throw new Error("REFERENCE_VENDOR_CONTENT_IDENTITY_INVALID");
  return result.value.identity;
}

export function safeReferenceVendorAcknowledgementV1(
  acknowledgement: IngressAcknowledgementV1,
): Record<string, unknown> {
  return {
    contractVersion: acknowledgement.contractVersion,
    correlationId: acknowledgement.receipt.correlationId,
    hostReceivedAt: acknowledgement.receipt.hostReceivedAt,
    status: acknowledgement.status,
    acceptedCount: acknowledgement.acceptedCount,
    rejectedCount: acknowledgement.rejectedCount,
    retryable: acknowledgement.retryable,
    reasonCode: acknowledgement.reasonCode,
  };
}
