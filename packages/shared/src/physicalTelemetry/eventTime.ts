import type {
  TelemetryProcessingResultV1,
  TelemetryRejectionReasonCodeV1,
} from "./contracts";
import { parseStrictUtcIsoTimestampV1 } from "./timestamp";

export type EvidenceStateV1 = "valid" | "invalid" | "ambiguous";

export interface CaptureWindowPolicyV1 {
  readonly liveFreshnessWindowMs: number;
  readonly delayedBackfillWindowMs: number;
  readonly maximumFutureClockSkewMs: number;
}

export interface EventTimeCaptureInputV1 {
  readonly capturedAt: string;
  readonly receivedAt: string;
  readonly actualWorkStartedAt: string;
  readonly actualWorkEndedAt?: string;
  readonly authentication: EvidenceStateV1;
  readonly eventIdentity: EvidenceStateV1;
  readonly deviceVehicleLinkAtCapture: EvidenceStateV1;
  readonly adWorkAssignmentAtCapture: EvidenceStateV1;
  readonly workReleaseAtCapture: EvidenceStateV1;
  readonly timestampEvidence: EvidenceStateV1;
  readonly clockOffsetEvidence: EvidenceStateV1;
  readonly sequenceReplayEvidence: EvidenceStateV1;
}

export type CaptureWindowDecisionV1 = TelemetryProcessingResultV1;

const INVALID_REASON_BY_EVIDENCE: ReadonlyArray<
  readonly [keyof EventTimeCaptureInputV1, TelemetryRejectionReasonCodeV1]
> = [
  ["authentication", "authentication_failed"],
  ["eventIdentity", "event_identity_invalid"],
  ["deviceVehicleLinkAtCapture", "device_vehicle_link_invalid"],
  ["adWorkAssignmentAtCapture", "ad_work_assignment_invalid"],
  ["workReleaseAtCapture", "work_not_released"],
  ["timestampEvidence", "captured_time_invalid"],
  ["clockOffsetEvidence", "captured_time_invalid"],
  ["sequenceReplayEvidence", "sequence_replay_invalid"],
];

function rejected(
  reasonCode: TelemetryRejectionReasonCodeV1,
): CaptureWindowDecisionV1 {
  return { contractVersion: "1", disposition: "rejected", reasonCode };
}

function hasValidPolicy(policy: CaptureWindowPolicyV1): boolean {
  return (
    Number.isSafeInteger(policy.liveFreshnessWindowMs) &&
    policy.liveFreshnessWindowMs >= 0 &&
    Number.isSafeInteger(policy.delayedBackfillWindowMs) &&
    policy.delayedBackfillWindowMs >= 0 &&
    Number.isSafeInteger(policy.maximumFutureClockSkewMs) &&
    policy.maximumFutureClockSkewMs >= 0
  );
}

function isEvidenceStateV1(value: unknown): value is EvidenceStateV1 {
  return value === "valid" || value === "invalid" || value === "ambiguous";
}

export function decideCaptureWindowV1(
  input: EventTimeCaptureInputV1,
  policy: CaptureWindowPolicyV1,
): CaptureWindowDecisionV1 {
  if (!hasValidPolicy(policy)) {
    return rejected("captured_time_invalid");
  }

  const capturedAt = parseStrictUtcIsoTimestampV1(input.capturedAt);
  const receivedAt = parseStrictUtcIsoTimestampV1(input.receivedAt);
  const workStartedAt = parseStrictUtcIsoTimestampV1(input.actualWorkStartedAt);
  const workEndedAt =
    input.actualWorkEndedAt === undefined
      ? undefined
      : parseStrictUtcIsoTimestampV1(input.actualWorkEndedAt);
  if (
    capturedAt === undefined ||
    receivedAt === undefined ||
    workStartedAt === undefined ||
    (input.actualWorkEndedAt !== undefined && workEndedAt === undefined) ||
    (workEndedAt !== undefined && workEndedAt < workStartedAt)
  ) {
    return rejected("captured_time_invalid");
  }

  for (const [key, reasonCode] of INVALID_REASON_BY_EVIDENCE) {
    const state: unknown = input[key];
    if (!isEvidenceStateV1(state) || state === "ambiguous") {
      return rejected("event_time_evidence_ambiguous");
    }
    if (state === "invalid") {
      return rejected(reasonCode);
    }
  }

  if (capturedAt < workStartedAt) {
    return rejected("captured_before_work_start");
  }
  if (workEndedAt !== undefined && capturedAt > workEndedAt) {
    return rejected("captured_after_work_end");
  }
  if (capturedAt > receivedAt + policy.maximumFutureClockSkewMs) {
    return rejected("captured_time_future_skew");
  }

  const freshnessAgeMs = Math.max(0, receivedAt - capturedAt);
  const receivedAfterEnd =
    workEndedAt !== undefined && receivedAt > workEndedAt;
  if (
    !receivedAfterEnd &&
    freshnessAgeMs <= policy.liveFreshnessWindowMs
  ) {
    return {
      contractVersion: "1",
      disposition: "accepted_live",
      reasonCode: "inside_live_freshness_window",
      freshness: "live",
      offlineBackfill: false,
    };
  }

  const backfillCutoff =
    workEndedAt === undefined
      ? capturedAt + policy.delayedBackfillWindowMs
      : workEndedAt + policy.delayedBackfillWindowMs;
  if (receivedAt <= backfillCutoff) {
    return {
      contractVersion: "1",
      disposition: "accepted_delayed",
      reasonCode: "inside_delayed_backfill_window",
      freshness: "degraded_freshness",
      delayed: true,
      offlineBackfill: true,
    };
  }

  return rejected("delayed_backfill_expired");
}