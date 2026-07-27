import type {
  CanonicalSensorObservationV1,
  CanonicalTelemetryEventV1,
} from "./contracts";
import { parseStrictUtcIsoTimestampV1 } from "./timestamp";

export interface ValidationIssueV1 {
  readonly path: string;
  readonly code:
    | "required"
    | "unsupported"
    | "invalid_type"
    | "invalid_value"
    | "out_of_range"
    | "too_long"
    | "too_many_items"
    | "unexpected_field";
}

export type ValidationResultV1<T> =
  | {
      readonly ok: true;
      readonly value: T;
    }
  | {
      readonly ok: false;
      readonly issues: readonly ValidationIssueV1[];
    };

const EVENT_FIELDS = new Set([
  "contractVersion",
  "canonicalEventId",
  "idempotencyIdentity",
  "vendorEventId",
  "clientEventId",
  "deviceExternalId",
  "authenticatedDeviceExternalId",
  "adapter",
  "stream",
  "capturedAt",
  "receivedAt",
  "normalizedAt",
  "observedClockOffsetMs",
  "position",
  "health",
  "observations",
  "quality",
  "provenance",
]);

const OBSERVATION_FIELDS = new Set([
  "contractVersion",
  "metric",
  "value",
  "unit",
  "capturedAt",
  "deviceExternalId",
  "source",
  "normalizationVersion",
  "quality",
  "synthetic",
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function issue(
  issues: ValidationIssueV1[],
  path: string,
  code: ValidationIssueV1["code"],
): void {
  issues.push({ path, code });
}

function rejectUnexpectedFields(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  issues: ValidationIssueV1[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      issue(issues, `${path}.${key}`, "unexpected_field");
    }
  }
}

function validateText(
  value: unknown,
  path: string,
  maximumLength: number,
  issues: ValidationIssueV1[],
): value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    issue(issues, path, "invalid_type");
    return false;
  }

  if (value.length > maximumLength) {
    issue(issues, path, "too_long");
    return false;
  }

  return true;
}

function validateIsoTimestamp(
  value: unknown,
  path: string,
  issues: ValidationIssueV1[],
): value is string {
  if (!validateText(value, path, 40, issues)) {
    return false;
  }

  if (parseStrictUtcIsoTimestampV1(value) === undefined) {
    issue(issues, path, "invalid_value");
    return false;
  }

  return true;
}

function validateFiniteRange(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
  issues: ValidationIssueV1[],
): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issue(issues, path, "invalid_type");
    return false;
  }

  if (value < minimum || value > maximum) {
    issue(issues, path, "out_of_range");
    return false;
  }

  return true;
}

function validateSourceAndSyntheticMarker(
  source: unknown,
  synthetic: unknown,
  sourcePath: string,
  syntheticPath: string,
  issues: ValidationIssueV1[],
): void {
  if (source !== "physical_device" && source !== "simulator") {
    issue(issues, sourcePath, "unsupported");
  }
  if (typeof synthetic !== "boolean") {
    issue(issues, syntheticPath, "invalid_type");
  } else if (source === "simulator" && synthetic !== true) {
    issue(issues, syntheticPath, "invalid_value");
  }
}

function validateObservationRecord(
  value: Record<string, unknown>,
  issues: ValidationIssueV1[],
): void {
  rejectUnexpectedFields(value, OBSERVATION_FIELDS, "$", issues);
  if (value.contractVersion !== "1") {
    issue(issues, "$.contractVersion", "unsupported");
  }
  validateIsoTimestamp(value.capturedAt, "$.capturedAt", issues);
  validateText(value.deviceExternalId, "$.deviceExternalId", 128, issues);
  validateSourceAndSyntheticMarker(
    value.source,
    value.synthetic,
    "$.source",
    "$.synthetic",
    issues,
  );
  validateText(value.normalizationVersion, "$.normalizationVersion", 64, issues);
  if (
    value.quality !== "good" &&
    value.quality !== "degraded" &&
    value.quality !== "unknown" &&
    value.quality !== "invalid"
  ) {
    issue(issues, "$.quality", "unsupported");
  }

  switch (value.metric) {
    case "fuel_level":
      if (value.unit !== "percentage") {
        issue(issues, "$.unit", "unsupported");
      }
      validateFiniteRange(value.value, "$.value", 0, 100, issues);
      break;
    case "temperature":
      if (value.unit !== "celsius") {
        issue(issues, "$.unit", "unsupported");
      }
      validateFiniteRange(value.value, "$.value", -100, 200, issues);
      break;
    case "door_state":
      if (value.unit !== "state") {
        issue(issues, "$.unit", "unsupported");
      }
      if (
        value.value !== "open" &&
        value.value !== "closed" &&
        value.value !== "unknown"
      ) {
        issue(issues, "$.value", "unsupported");
      }
      break;
    case "vibration":
      if (value.unit !== "meters_per_second_squared") {
        issue(issues, "$.unit", "unsupported");
      }
      validateFiniteRange(value.value, "$.value", 0, 1_000, issues);
      break;
    case "external_power":
    case "ignition":
    case "tamper":
      if (value.unit !== "boolean") {
        issue(issues, "$.unit", "unsupported");
      }
      if (typeof value.value !== "boolean") {
        issue(issues, "$.value", "invalid_type");
      }
      break;
    default:
      issue(issues, "$.metric", "unsupported");
  }
}

export function isCanonicalSensorObservationV1(
  value: unknown,
): value is CanonicalSensorObservationV1 {
  if (!isPlainRecord(value)) {
    return false;
  }
  const issues: ValidationIssueV1[] = [];
  validateObservationRecord(value, issues);
  return issues.length === 0;
}

export function validateCanonicalSensorObservationV1(
  value: unknown,
): ValidationResultV1<CanonicalSensorObservationV1> {
  if (isCanonicalSensorObservationV1(value)) {
    return { ok: true, value };
  }
  if (!isPlainRecord(value)) {
    return { ok: false, issues: [{ path: "$", code: "invalid_type" }] };
  }
  const issues: ValidationIssueV1[] = [];
  validateObservationRecord(value, issues);
  return { ok: false, issues };
}

function validatePosition(
  value: unknown,
  issues: ValidationIssueV1[],
): void {
  if (!isPlainRecord(value)) {
    issue(issues, "$.position", "invalid_type");
    return;
  }
  rejectUnexpectedFields(
    value,
    new Set([
      "latitude",
      "longitude",
      "altitudeMeters",
      "accuracyMeters",
      "speedMetersPerSecond",
      "headingDegrees",
      "satellites",
    ]),
    "$.position",
    issues,
  );
  validateFiniteRange(value.latitude, "$.position.latitude", -90, 90, issues);
  validateFiniteRange(value.longitude, "$.position.longitude", -180, 180, issues);
  if (value.altitudeMeters !== undefined) {
    validateFiniteRange(
      value.altitudeMeters,
      "$.position.altitudeMeters",
      -1_000,
      20_000,
      issues,
    );
  }
  if (value.accuracyMeters !== undefined) {
    validateFiniteRange(
      value.accuracyMeters,
      "$.position.accuracyMeters",
      0,
      100_000,
      issues,
    );
  }
  if (value.speedMetersPerSecond !== undefined) {
    validateFiniteRange(
      value.speedMetersPerSecond,
      "$.position.speedMetersPerSecond",
      0,
      200,
      issues,
    );
  }
  if (value.headingDegrees !== undefined) {
    validateFiniteRange(
      value.headingDegrees,
      "$.position.headingDegrees",
      0,
      360,
      issues,
    );
  }
  if (value.satellites !== undefined) {
    if (
      !validateFiniteRange(
        value.satellites,
        "$.position.satellites",
        0,
        256,
        issues,
      ) ||
      !Number.isInteger(value.satellites)
    ) {
      issue(issues, "$.position.satellites", "invalid_value");
    }
  }
}

function validateHealth(value: unknown, issues: ValidationIssueV1[]): void {
  if (!isPlainRecord(value)) {
    issue(issues, "$.health", "invalid_type");
    return;
  }
  rejectUnexpectedFields(
    value,
    new Set([
      "heartbeat",
      "batteryPercent",
      "externalPower",
      "firmwareVersion",
      "gpsFix",
      "gsmSignalDbm",
    ]),
    "$.health",
    issues,
  );
  if (typeof value.heartbeat !== "boolean") {
    issue(issues, "$.health.heartbeat", "invalid_type");
  }
  if (value.batteryPercent !== undefined) {
    validateFiniteRange(
      value.batteryPercent,
      "$.health.batteryPercent",
      0,
      100,
      issues,
    );
  }
  if (
    value.externalPower !== undefined &&
    typeof value.externalPower !== "boolean"
  ) {
    issue(issues, "$.health.externalPower", "invalid_type");
  }
  if (value.firmwareVersion !== undefined) {
    validateText(value.firmwareVersion, "$.health.firmwareVersion", 64, issues);
  }
  if (
    value.gpsFix !== undefined &&
    value.gpsFix !== "none" &&
    value.gpsFix !== "two_dimensional" &&
    value.gpsFix !== "three_dimensional"
  ) {
    issue(issues, "$.health.gpsFix", "unsupported");
  }
  if (value.gsmSignalDbm !== undefined) {
    validateFiniteRange(
      value.gsmSignalDbm,
      "$.health.gsmSignalDbm",
      -200,
      0,
      issues,
    );
  }
}

function validateObservationBindings(
  value: Record<string, unknown>,
  issues: ValidationIssueV1[],
): void {
  if (!Array.isArray(value.observations) || !isPlainRecord(value.provenance)) {
    return;
  }
  for (let index = 0; index < value.observations.length; index += 1) {
    const observation = value.observations[index];
    if (!isPlainRecord(observation)) {
      continue;
    }
    const path = `$.observations[${index}]`;
    if (observation.deviceExternalId !== value.deviceExternalId) {
      issue(issues, `${path}.deviceExternalId`, "invalid_value");
    }
    if (observation.source !== value.provenance.source) {
      issue(issues, `${path}.source`, "invalid_value");
    }
    if (observation.synthetic !== value.provenance.synthetic) {
      issue(issues, `${path}.synthetic`, "invalid_value");
    }
    if (observation.capturedAt !== value.capturedAt) {
      issue(issues, `${path}.capturedAt`, "invalid_value");
    }
    if (
      observation.normalizationVersion !== value.provenance.normalizationVersion
    ) {
      issue(issues, `${path}.normalizationVersion`, "invalid_value");
    }
  }
}
function validateEventRecord(
  value: Record<string, unknown>,
  issues: ValidationIssueV1[],
): void {
  rejectUnexpectedFields(value, EVENT_FIELDS, "$", issues);
  if (value.contractVersion !== "1") {
    issue(issues, "$.contractVersion", "unsupported");
  }
  validateText(value.canonicalEventId, "$.canonicalEventId", 256, issues);
  validateText(value.idempotencyIdentity, "$.idempotencyIdentity", 256, issues);
  if (value.vendorEventId !== undefined) {
    validateText(value.vendorEventId, "$.vendorEventId", 128, issues);
  }
  if (value.clientEventId !== undefined) {
    validateText(value.clientEventId, "$.clientEventId", 128, issues);
  }
  validateText(value.deviceExternalId, "$.deviceExternalId", 128, issues);
  validateText(
    value.authenticatedDeviceExternalId,
    "$.authenticatedDeviceExternalId",
    128,
    issues,
  );
  if (value.authenticatedDeviceExternalId !== value.deviceExternalId) {
    issue(issues, "$.authenticatedDeviceExternalId", "invalid_value");
  }

  if (!isPlainRecord(value.adapter)) {
    issue(issues, "$.adapter", "invalid_type");
  } else {
    rejectUnexpectedFields(
      value.adapter,
      new Set(["id", "version"]),
      "$.adapter",
      issues,
    );
    validateText(value.adapter.id, "$.adapter.id", 64, issues);
    validateText(value.adapter.version, "$.adapter.version", 64, issues);
  }

  if (value.stream !== undefined) {
    if (!isPlainRecord(value.stream)) {
      issue(issues, "$.stream", "invalid_type");
    } else {
      rejectUnexpectedFields(
        value.stream,
        new Set(["epoch", "sequence"]),
        "$.stream",
        issues,
      );
      validateText(value.stream.epoch, "$.stream.epoch", 128, issues);
      if (
        typeof value.stream.sequence !== "number" ||
        !Number.isSafeInteger(value.stream.sequence) ||
        value.stream.sequence < 0
      ) {
        issue(issues, "$.stream.sequence", "invalid_value");
      }
    }
  }

  validateIsoTimestamp(value.capturedAt, "$.capturedAt", issues);
  validateIsoTimestamp(value.receivedAt, "$.receivedAt", issues);
  validateIsoTimestamp(value.normalizedAt, "$.normalizedAt", issues);
  if (
    value.observedClockOffsetMs !== undefined &&
    (typeof value.observedClockOffsetMs !== "number" ||
      !Number.isFinite(value.observedClockOffsetMs))
  ) {
    issue(issues, "$.observedClockOffsetMs", "invalid_type");
  }
  if (value.position !== undefined) {
    validatePosition(value.position, issues);
  }
  if (value.health !== undefined) {
    validateHealth(value.health, issues);
  }
  if (value.observations !== undefined) {
    if (!Array.isArray(value.observations)) {
      issue(issues, "$.observations", "invalid_type");
    } else if (value.observations.length > 32) {
      issue(issues, "$.observations", "too_many_items");
    } else {
      for (let index = 0; index < value.observations.length; index += 1) {
        const result = validateCanonicalSensorObservationV1(
          value.observations[index],
        );
        if (!result.ok) {
          for (const observationIssue of result.issues) {
            issues.push({
              ...observationIssue,
              path: `$.observations[${index}]${observationIssue.path.slice(1)}`,
            });
          }
        }
      }
    }
  }

  if (
    value.quality !== "valid" &&
    value.quality !== "degraded" &&
    value.quality !== "suspect"
  ) {
    issue(issues, "$.quality", "unsupported");
  }

  if (!isPlainRecord(value.provenance)) {
    issue(issues, "$.provenance", "invalid_type");
  } else {
    rejectUnexpectedFields(
      value.provenance,
      new Set([
        "source",
        "normalizationVersion",
        "synthetic",
        "rawPayloadHash",
        "canonicalPayloadHash",
      ]),
      "$.provenance",
      issues,
    );
    validateSourceAndSyntheticMarker(
      value.provenance.source,
      value.provenance.synthetic,
      "$.provenance.source",
      "$.provenance.synthetic",
      issues,
    );
    validateText(
      value.provenance.normalizationVersion,
      "$.provenance.normalizationVersion",
      64,
      issues,
    );

    validateText(
      value.provenance.rawPayloadHash,
      "$.provenance.rawPayloadHash",
      256,
      issues,
    );
    validateText(
      value.provenance.canonicalPayloadHash,
      "$.provenance.canonicalPayloadHash",
      256,
      issues,
    );
  }

  validateObservationBindings(value, issues);
}

export function isCanonicalTelemetryEventV1(
  value: unknown,
): value is CanonicalTelemetryEventV1 {
  if (!isPlainRecord(value)) {
    return false;
  }
  const issues: ValidationIssueV1[] = [];
  validateEventRecord(value, issues);
  return issues.length === 0;
}

export function validateCanonicalTelemetryEventV1(
  value: unknown,
): ValidationResultV1<CanonicalTelemetryEventV1> {
  if (isCanonicalTelemetryEventV1(value)) {
    return { ok: true, value };
  }
  if (!isPlainRecord(value)) {
    return { ok: false, issues: [{ path: "$", code: "invalid_type" }] };
  }
  const issues: ValidationIssueV1[] = [];
  validateEventRecord(value, issues);
  return { ok: false, issues };
}
