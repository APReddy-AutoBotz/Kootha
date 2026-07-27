import type {
  IngressAcknowledgementV1,
  IngressHostPolicyV1,
  IngressMessageV1,
  IngressReceiptContextV1,
  TelemetryProcessingResultV1,
} from "./contracts";
import { parseStrictUtcIsoTimestampV1 } from "./timestamp";
import type {
  EventTimeWorkResolutionRequestV1,
  EventTimeWorkResolutionResultV1,
} from "./workResolver";
import type { ValidationIssueV1, ValidationResultV1 } from "./validation";

type RecordValue = Record<string, unknown>;

const TRANSPORTS = new Set([
  "http",
  "vendor_webhook",
  "vendor_poll",
  "mqtt",
  "tcp",
  "udp",
  "simulator",
]);
const HOST_KINDS = new Set([
  "serverless_http",
  "always_on_http",
  "vendor_integration",
  "protocol_gateway",
  "simulator",
]);
const PROCESSING_REASON_CODES = new Set([
  "canonical_validation_passed",
  "inside_live_freshness_window",
  "inside_delayed_backfill_window",
  "outside_active_work_location_discarded",
  "duplicate_identical_content",
  "event_identity_conflict",
  "authentication_failed",
  "device_inactive",
  "canonical_event_invalid",
  "sensor_observation_unsupported",
  "event_identity_invalid",
  "sequence_replay_invalid",
  "captured_time_invalid",
  "captured_time_future_skew",
  "captured_before_work_start",
  "captured_after_work_end",
  "work_not_released",
  "device_vehicle_link_invalid",
  "ad_work_assignment_invalid",
  "event_time_evidence_ambiguous",
  "delayed_backfill_expired",
]);
const NO_MATCH_REASONS = new Set([
  "device_not_resolved",
  "device_vehicle_link_not_resolved",
  "ad_work_assignment_not_resolved",
  "work_not_released",
  "work_day_not_resolved",
  "work_not_started",
]);
const AMBIGUOUS_REASONS = new Set([
  "device_resolution_ambiguous",
  "device_vehicle_link_ambiguous",
  "ad_work_assignment_ambiguous",
  "work_release_ambiguous",
  "work_day_ambiguous",
]);

function isRecord(value: unknown): value is RecordValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function add(
  issues: ValidationIssueV1[],
  path: string,
  code: ValidationIssueV1["code"],
): void {
  issues.push({ path, code });
}

function exact(
  value: RecordValue,
  fields: readonly string[],
  path: string,
  issues: ValidationIssueV1[],
): void {
  const allowed = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      add(issues, `${path}.${key}`, "unexpected_field");
    }
  }
}

function text(
  value: unknown,
  path: string,
  maximum: number,
  issues: ValidationIssueV1[],
): value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    add(issues, path, "invalid_type");
    return false;
  }
  if (value.length > maximum) {
    add(issues, path, "too_long");
    return false;
  }
  return true;
}

function timestamp(
  value: unknown,
  path: string,
  issues: ValidationIssueV1[],
): value is string {
  if (!text(value, path, 40, issues)) {
    return false;
  }
  if (parseStrictUtcIsoTimestampV1(value) === undefined) {
    add(issues, path, "invalid_value");
    return false;
  }
  return true;
}

function positiveSafeInteger(
  value: unknown,
  path: string,
  issues: ValidationIssueV1[],
): value is number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    add(issues, path, "invalid_value");
    return false;
  }
  return true;
}

function nonnegativeSafeInteger(
  value: unknown,
  path: string,
  issues: ValidationIssueV1[],
): value is number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    add(issues, path, "invalid_value");
    return false;
  }
  return true;
}

function result<T>(
  value: unknown,
  issues: ValidationIssueV1[],
): ValidationResultV1<T> {
  return issues.length === 0
    ? { ok: true, value: value as T }
    : { ok: false, issues };
}

function validateReceiptRecord(
  value: unknown,
  path: string,
  issues: ValidationIssueV1[],
): value is IngressReceiptContextV1 {
  if (!isRecord(value)) {
    add(issues, path, "invalid_type");
    return false;
  }
  exact(
    value,
    ["contractVersion", "correlationId", "hostReceivedAt"],
    path,
    issues,
  );
  if (value.contractVersion !== "1") {
    add(issues, `${path}.contractVersion`, "unsupported");
  }
  text(value.correlationId, `${path}.correlationId`, 128, issues);
  timestamp(value.hostReceivedAt, `${path}.hostReceivedAt`, issues);
  return true;
}

export function validateIngressReceiptContextV1(
  value: unknown,
): ValidationResultV1<IngressReceiptContextV1> {
  const issues: ValidationIssueV1[] = [];
  validateReceiptRecord(value, "$", issues);
  return result(value, issues);
}

export function validateIngressHostPolicyV1(
  value: unknown,
): ValidationResultV1<IngressHostPolicyV1> {
  const issues: ValidationIssueV1[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: "$", code: "invalid_type" }] };
  }
  exact(
    value,
    [
      "contractVersion",
      "hostKind",
      "transport",
      "maximumMessageBytes",
      "maximumEventsPerMessage",
      "correlationIdSemantics",
      "hostReceivedAtSemantics",
      "acknowledgementBoundary",
    ],
    "$",
    issues,
  );
  if (value.contractVersion !== "1") {
    add(issues, "$.contractVersion", "unsupported");
  }
  if (!HOST_KINDS.has(value.hostKind as string)) {
    add(issues, "$.hostKind", "unsupported");
  }
  if (!TRANSPORTS.has(value.transport as string)) {
    add(issues, "$.transport", "unsupported");
  }
  positiveSafeInteger(
    value.maximumMessageBytes,
    "$.maximumMessageBytes",
    issues,
  );
  positiveSafeInteger(
    value.maximumEventsPerMessage,
    "$.maximumEventsPerMessage",
    issues,
  );
  if (value.correlationIdSemantics !== "host_generated_or_validated") {
    add(issues, "$.correlationIdSemantics", "invalid_value");
  }
  if (
    value.hostReceivedAtSemantics !== "assigned_at_ingress_acquisition"
  ) {
    add(issues, "$.hostReceivedAtSemantics", "invalid_value");
  }
  if (
    value.acknowledgementBoundary !==
    "transport_only_no_persistence_claim"
  ) {
    add(issues, "$.acknowledgementBoundary", "invalid_value");
  }
  return result(value, issues);
}

export function validateIngressMessageV1(
  value: unknown,
  policy?: IngressHostPolicyV1,
): ValidationResultV1<IngressMessageV1> {
  const issues: ValidationIssueV1[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: "$", code: "invalid_type" }] };
  }
  exact(
    value,
    ["contractVersion", "receipt", "transport", "contentLengthBytes", "payload"],
    "$",
    issues,
  );
  if (value.contractVersion !== "1") {
    add(issues, "$.contractVersion", "unsupported");
  }
  validateReceiptRecord(value.receipt, "$.receipt", issues);
  if (!TRANSPORTS.has(value.transport as string)) {
    add(issues, "$.transport", "unsupported");
  }
  if (nonnegativeSafeInteger(value.contentLengthBytes, "$.contentLengthBytes", issues)) {
    if (
      policy !== undefined &&
      value.contentLengthBytes > policy.maximumMessageBytes
    ) {
      add(issues, "$.contentLengthBytes", "out_of_range");
    }
  }
  if (policy !== undefined && value.transport !== policy.transport) {
    add(issues, "$.transport", "invalid_value");
  }
  return result(value, issues);
}

export function validateIngressAcknowledgementV1(
  value: unknown,
): ValidationResultV1<IngressAcknowledgementV1> {
  const issues: ValidationIssueV1[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: "$", code: "invalid_type" }] };
  }
  exact(
    value,
    [
      "contractVersion",
      "receipt",
      "status",
      "acceptedCount",
      "rejectedCount",
      "retryable",
      "reasonCode",
    ],
    "$",
    issues,
  );
  if (value.contractVersion !== "1") {
    add(issues, "$.contractVersion", "unsupported");
  }
  validateReceiptRecord(value.receipt, "$.receipt", issues);
  if (
    value.status !== "accepted" &&
    value.status !== "partially_accepted" &&
    value.status !== "rejected"
  ) {
    add(issues, "$.status", "unsupported");
  }
  nonnegativeSafeInteger(value.acceptedCount, "$.acceptedCount", issues);
  nonnegativeSafeInteger(value.rejectedCount, "$.rejectedCount", issues);
  if (typeof value.retryable !== "boolean") {
    add(issues, "$.retryable", "invalid_type");
  }
  if (
    value.reasonCode !== undefined &&
    value.reasonCode !== "processed" &&
    value.reasonCode !== "partial_rejection" &&
    value.reasonCode !== "request_rejected" &&
    value.reasonCode !== "temporarily_unavailable"
  ) {
    add(issues, "$.reasonCode", "unsupported");
  }
  if (
    value.status === "accepted" &&
    (value.rejectedCount !== 0 || value.acceptedCount === 0)
  ) {
    add(issues, "$.status", "invalid_value");
  }
  if (
    value.status === "partially_accepted" &&
    (value.acceptedCount === 0 || value.rejectedCount === 0)
  ) {
    add(issues, "$.status", "invalid_value");
  }
  if (value.status === "rejected" && value.acceptedCount !== 0) {
    add(issues, "$.status", "invalid_value");
  }
  return result(value, issues);
}

export function validateTelemetryProcessingResultV1(
  value: unknown,
): ValidationResultV1<TelemetryProcessingResultV1> {
  const issues: ValidationIssueV1[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: "$", code: "invalid_type" }] };
  }
  const fields = [
    "contractVersion",
    "idempotencyIdentity",
    "clientEventId",
    "disposition",
    "reasonCode",
    "freshness",
    "offlineBackfill",
    "quality",
    "persistenceStatus",
    ...(value.disposition === "accepted_delayed" ? ["delayed"] : []),
  ];
  exact(value, fields, "$", issues);
  if (value.contractVersion !== "1") {
    add(issues, "$.contractVersion", "unsupported");
  }
  text(value.idempotencyIdentity, "$.idempotencyIdentity", 256, issues);
  if (value.clientEventId !== undefined) {
    text(value.clientEventId, "$.clientEventId", 128, issues);
  }
  if (value.persistenceStatus !== "not_attempted") {
    add(issues, "$.persistenceStatus", "invalid_value");
  }
  if (!PROCESSING_REASON_CODES.has(value.reasonCode as string)) {
    add(issues, "$.reasonCode", "unsupported");
  }

  const expected = {
    canonicalized: {
      reason: "canonical_validation_passed",
      freshness: "not_applicable",
      backfill: false,
      qualities: ["valid", "degraded", "suspect"],
    },
    accepted_live: {
      reason: "inside_live_freshness_window",
      freshness: "live",
      backfill: false,
      qualities: ["valid", "degraded"],
    },
    accepted_delayed: {
      reason: "inside_delayed_backfill_window",
      freshness: "degraded_freshness",
      backfill: true,
      qualities: ["degraded"],
    },
    health_only: {
      reason: "outside_active_work_location_discarded",
      freshness: "not_applicable",
      backfill: false,
      qualities: ["degraded", "suspect"],
    },
    duplicate: {
      reason: "duplicate_identical_content",
      freshness: "not_applicable",
      backfill: false,
      qualities: ["valid", "degraded", "suspect"],
    },
    duplicate_conflict: {
      reason: "event_identity_conflict",
      freshness: "not_applicable",
      backfill: false,
      qualities: ["rejected"],
    },
  } as const;

  if (value.disposition === "rejected") {
    if (
      value.freshness !== "not_applicable" ||
      value.offlineBackfill !== false ||
      value.quality !== "rejected"
    ) {
      add(issues, "$.disposition", "invalid_value");
    }
  } else if (
    typeof value.disposition === "string" &&
    value.disposition in expected
  ) {
    const rule = expected[value.disposition as keyof typeof expected];
    if (
      value.reasonCode !== rule.reason ||
      value.freshness !== rule.freshness ||
      value.offlineBackfill !== rule.backfill ||
      !rule.qualities.includes(value.quality as never) ||
      (value.disposition === "accepted_delayed" && value.delayed !== true)
    ) {
      add(issues, "$.disposition", "invalid_value");
    }
  } else {
    add(issues, "$.disposition", "unsupported");
  }
  return result(value, issues);
}

export function validateEventTimeWorkResolutionRequestV1(
  value: unknown,
): ValidationResultV1<EventTimeWorkResolutionRequestV1> {
  const issues: ValidationIssueV1[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: "$", code: "invalid_type" }] };
  }
  exact(
    value,
    ["contractVersion", "authenticatedDeviceExternalId", "capturedAt"],
    "$",
    issues,
  );
  if (value.contractVersion !== "1") {
    add(issues, "$.contractVersion", "unsupported");
  }
  text(
    value.authenticatedDeviceExternalId,
    "$.authenticatedDeviceExternalId",
    128,
    issues,
  );
  timestamp(value.capturedAt, "$.capturedAt", issues);
  return result(value, issues);
}

export function validateEventTimeWorkResolutionResultV1(
  value: unknown,
): ValidationResultV1<EventTimeWorkResolutionResultV1> {
  const issues: ValidationIssueV1[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: "$", code: "invalid_type" }] };
  }
  exact(
    value,
    [
      "contractVersion",
      "outcome",
      "reasonCode",
      ...(value.outcome === "resolved" ? ["context"] : []),
    ],
    "$",
    issues,
  );
  if (value.contractVersion !== "1") {
    add(issues, "$.contractVersion", "unsupported");
  }
  if (value.outcome === "no_match") {
    if (!NO_MATCH_REASONS.has(value.reasonCode as string)) {
      add(issues, "$.reasonCode", "unsupported");
    }
  } else if (value.outcome === "ambiguous") {
    if (!AMBIGUOUS_REASONS.has(value.reasonCode as string)) {
      add(issues, "$.reasonCode", "unsupported");
    }
  } else if (value.outcome === "resolved") {
    if (value.reasonCode !== "unique_event_time_match") {
      add(issues, "$.reasonCode", "unsupported");
    }
    if (!isRecord(value.context)) {
      add(issues, "$.context", "invalid_type");
    } else {
      const context = value.context;
      exact(
        context,
        [
          "deviceId",
          "authenticatedDeviceExternalId",
          "deviceVehicleLinkId",
          "vehicleId",
          "adWorkAssignmentId",
          "adWorkId",
          "driverId",
          "driverAuthority",
          "workReleaseId",
          "releasedAt",
          "workDayId",
          "actualWorkStartedAt",
          "actualWorkEndedAt",
          "physicalTrackingSessionId",
        ],
        "$.context",
        issues,
      );
      for (const key of [
        "deviceId",
        "authenticatedDeviceExternalId",
        "deviceVehicleLinkId",
        "vehicleId",
        "adWorkAssignmentId",
        "adWorkId",
        "driverId",
        "workReleaseId",
        "workDayId",
      ]) {
        text(context[key], `$.context.${key}`, 128, issues);
      }
      if (context.physicalTrackingSessionId !== undefined) {
        text(
          context.physicalTrackingSessionId,
          "$.context.physicalTrackingSessionId",
          128,
          issues,
        );
      }
      if (context.driverAuthority !== "ad_work_assignment") {
        add(issues, "$.context.driverAuthority", "invalid_value");
      }
      const releasedAtValid = timestamp(
        context.releasedAt,
        "$.context.releasedAt",
        issues,
      );
      const startedAtValid = timestamp(
        context.actualWorkStartedAt,
        "$.context.actualWorkStartedAt",
        issues,
      );
      const endedAtValid =
        context.actualWorkEndedAt === undefined ||
        timestamp(
          context.actualWorkEndedAt,
          "$.context.actualWorkEndedAt",
          issues,
        );
      if (releasedAtValid && startedAtValid) {
        const released = parseStrictUtcIsoTimestampV1(context.releasedAt as string);
        const started = parseStrictUtcIsoTimestampV1(
          context.actualWorkStartedAt as string,
        );
        if (released !== undefined && started !== undefined && released > started) {
          add(issues, "$.context.releasedAt", "invalid_value");
        }
      }
      if (startedAtValid && endedAtValid && context.actualWorkEndedAt !== undefined) {
        const started = parseStrictUtcIsoTimestampV1(
          context.actualWorkStartedAt as string,
        );
        const ended = parseStrictUtcIsoTimestampV1(
          context.actualWorkEndedAt as string,
        );
        if (started !== undefined && ended !== undefined && ended < started) {
          add(issues, "$.context.actualWorkEndedAt", "invalid_value");
        }
      }
    }
  } else {
    add(issues, "$.outcome", "unsupported");
  }
  return result(value, issues);
}
