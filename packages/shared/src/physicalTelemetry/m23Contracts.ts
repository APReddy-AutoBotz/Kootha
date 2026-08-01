/**
 * M23 transport contracts. These types intentionally do not implement the
 * comparison formulas; PostgreSQL is the single production authority for
 * eligibility, pairing, distance and sustained-evidence evaluation.
 */

export const M23_COMPARISON_POLICY_VERSION_V1 = "m23-pilot-v1" as const;
export type M23ComparisonPolicyVersionV1 =
  typeof M23_COMPARISON_POLICY_VERSION_V1;

export const M23_PAIRING_ALGORITHM_VERSION_V1 = "m23-pairing-v1" as const;
export type M23PairingAlgorithmVersionV1 =
  typeof M23_PAIRING_ALGORITHM_VERSION_V1;

export const m23ComparisonOutcomesV1 = [
  "not_expected",
  "awaiting_sources",
  "paired_match",
  "isolated_mismatch",
  "sustained_mismatch",
  "phone_missing",
  "physical_device_missing",
  "both_missing",
  "insufficient_pairs",
  "insufficient_quality",
  "comparison_unavailable",
] as const;
export type M23ComparisonOutcomeV1 =
  (typeof m23ComparisonOutcomesV1)[number];

export const m23ComparisonPairOutcomesV1 = [
  "match",
  "mismatch_candidate",
  "insufficient_quality",
] as const;
export type M23ComparisonPairOutcomeV1 =
  (typeof m23ComparisonPairOutcomesV1)[number];

export const m23ComparisonQualitiesV1 = [
  "acceptable",
  "insufficient_quality",
] as const;
export type M23ComparisonQualityV1 =
  (typeof m23ComparisonQualitiesV1)[number];

export const m23ComparisonSourceExpectationsV1 = [
  "neither_expected",
  "phone_only",
  "physical_only",
  "both_expected",
  "ambiguous",
] as const;
export type M23ComparisonSourceExpectationV1 =
  (typeof m23ComparisonSourceExpectationsV1)[number];

export const m23ComparisonSnapshotFinalitiesV1 = [
  "provisional_active_work",
  "provisional_backfill_open",
  "final_backfill_closed",
] as const;
export type M23ComparisonSnapshotFinalityV1 =
  (typeof m23ComparisonSnapshotFinalitiesV1)[number];

export const m23ComparisonReviewStatusesV1 = [
  "not_reviewed",
  "reviewing",
  "reviewed_consistent",
  "reviewed_needs_follow_up",
  "dismissed_insufficient_evidence",
] as const;
export type M23ComparisonReviewStatusV1 =
  (typeof m23ComparisonReviewStatusesV1)[number];

export interface M23ComparisonPolicyV1 {
  readonly policyId: string;
  readonly policyVersion: M23ComparisonPolicyVersionV1 | string;
  readonly effectiveFrom: string;
  readonly effectiveUntil: string | null;
  readonly enabled: boolean;
  readonly pairWindowSeconds: number;
  readonly maximumPhoneAccuracyMeters: number;
  readonly maximumPhysicalDeviceAccuracyMeters: number;
  readonly minimumPairCount: number;
  readonly sustainedMismatchDistanceMeters: number;
  readonly sustainedMismatchDurationSeconds: number;
  readonly maximumSustainedEpisodeGapSeconds: number;
  readonly missingSourceGraceSeconds: number;
  readonly backfillWindowSeconds: number;
  readonly finalityRule: "work_end_plus_backfill";
  readonly missingAccuracyBehavior: "insufficient_quality";
  readonly safeProvisionalPolicyNote: string;
}

export interface M23ComparisonJobV1 {
  readonly jobId: string;
  readonly adWorkDayId: string;
  readonly adWorkId: string;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly state: "pending" | "processing" | "completed" | "failed";
  readonly nextAttemptAt: string;
  readonly attemptCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface M23ComparisonPairV1 {
  readonly pairId: string;
  readonly snapshotId: string;
  readonly phonePointId: string;
  readonly physicalPointId: string;
  readonly phoneCapturedAt: string;
  readonly physicalCapturedAt: string;
  readonly timeDifferenceMilliseconds: number;
  readonly rawHaversineDistanceMeters: number | null;
  readonly phoneAccuracyMeters: number | null;
  readonly physicalDeviceAccuracyMeters: number | null;
  readonly conservativeSeparationMeters: number | null;
  readonly quality: M23ComparisonQualityV1;
  readonly outcome: M23ComparisonPairOutcomeV1;
  readonly synthetic: boolean;
}

export interface M23ComparisonSnapshotV1 {
  readonly snapshotId: string;
  readonly adWorkDayId: string;
  readonly adWorkId: string;
  readonly driverId: string | null;
  readonly vehicleId: string | null;
  readonly assignmentHistoryId: string | null;
  readonly executionHistoryId: string | null;
  readonly gpsDeviceId: string | null;
  readonly gpsDeviceVehicleLinkId: string | null;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly pairingAlgorithmVersion: M23PairingAlgorithmVersionV1 | string;
  readonly inputWatermark: string | null;
  readonly generatedAt: string;
  readonly sourceExpectation: M23ComparisonSourceExpectationV1;
  readonly phoneEligibleCount: number;
  readonly physicalEligibleCount: number;
  readonly pairCount: number;
  readonly matchCount: number;
  readonly mismatchCandidateCount: number;
  readonly insufficientQualityCount: number;
  readonly unpairedPhoneCount: number;
  readonly unpairedPhysicalCount: number;
  readonly sustainedPairCount: number;
  readonly sustainedFirstPairAt: string | null;
  readonly sustainedLastPairAt: string | null;
  readonly minimumConservativeSeparationMeters: number | null;
  readonly maximumConservativeSeparationMeters: number | null;
  readonly overallOutcome: M23ComparisonOutcomeV1;
  readonly finality: M23ComparisonSnapshotFinalityV1;
  readonly synthetic: boolean;
  readonly supersededBySnapshotId: string | null;
  readonly reviewStatus: M23ComparisonReviewStatusV1;
}

export interface M23ComparisonTechnicalValuesV1 {
  readonly contractVersion: "m23-admin-v1";
  readonly snapshotId: string;
  readonly policyVersion: string;
  readonly mismatchDistanceMeters: number | null;
  readonly pairs: readonly M23ComparisonPairV1[];
  readonly accessedAt: string;
}

export const m23ComparisonOutcomeSafeLabelsV1: Readonly<
  Record<M23ComparisonOutcomeV1, string>
> = {
  not_expected: "Not expected",
  awaiting_sources: "Awaiting source evidence",
  paired_match: "Paired evidence is consistent",
  isolated_mismatch: "Isolated comparison mismatch",
  sustained_mismatch: "Sustained comparison mismatch",
  phone_missing: "Phone source missing",
  physical_device_missing: "Physical device source missing",
  both_missing: "Both sources missing",
  insufficient_pairs: "Insufficient paired evidence",
  insufficient_quality: "Insufficient quality",
  comparison_unavailable: "Comparison unavailable",
};

export const m23ComparisonSourceExpectationSafeLabelsV1: Readonly<
  Record<M23ComparisonSourceExpectationV1, string>
> = {
  neither_expected: "Neither source expected",
  phone_only: "Phone source expected",
  physical_only: "Physical device source expected",
  both_expected: "Both sources expected",
  ambiguous: "Source expectation unavailable",
};

export const m23ComparisonReviewStatusSafeLabelsV1: Readonly<
  Record<M23ComparisonReviewStatusV1, string>
> = {
  not_reviewed: "Not reviewed",
  reviewing: "Reviewing",
  reviewed_consistent: "Reviewed as consistent",
  reviewed_needs_follow_up: "Reviewed; needs operational follow-up",
  dismissed_insufficient_evidence: "Dismissed; insufficient evidence",
};

export function isM23ComparisonOutcomeV1(
  value: string,
): value is M23ComparisonOutcomeV1 {
  return (m23ComparisonOutcomesV1 as readonly string[]).includes(value);
}

export function isM23ComparisonReviewStatusV1(
  value: string,
): value is M23ComparisonReviewStatusV1 {
  return (m23ComparisonReviewStatusesV1 as readonly string[]).includes(value);
}
