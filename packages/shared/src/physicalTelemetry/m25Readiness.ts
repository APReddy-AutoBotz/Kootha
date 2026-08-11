import {
  M25_READINESS_VERSION_V1,
  type M25AnalysisKindV1,
  type M25AnalysisVersionV1,
  type M25ReadinessAssessmentV1,
  type M25ReadinessDecisionV1,
  type M25SupportLevelV1,
} from "./m25Contracts";

export const M25_PROVISIONAL_READINESS_THRESHOLDS_V1 = {
  calendarDays: 28,
  calendarDaysMin: 28,
  calendarDaysMax: 56,
  deviceModelDays: 30,
  workDaySessions: 1_000,
} as const;

export interface M25ReadinessInputV1 {
  readonly assessmentId: string;
  readonly assessedAt: string;
  readonly reviewedCalendarDays: number;
  readonly reviewedDeviceModelDays: number;
  readonly reviewedWorkDaySessions: number;
  readonly deviceCount: number;
  readonly deviceModelDiversity: number;
  readonly adapterVersionDiversity: number;
  readonly featureCompleteness: number;
  readonly missingness: number;
  readonly reviewedLabelCount: number;
  readonly positiveLabelCount: number;
  readonly negativeLabelCount: number;
  readonly falsePositiveRate: number | null;
  readonly driftEvidence: "none" | "observed" | "insufficient_data";
  readonly cohortSupport: M25SupportLevelV1;
  readonly trainHoldoutFeasibility: "not_ready" | "feasible" | "infeasible";
  readonly syntheticEvidence: boolean;
  readonly realReviewedEvidence: boolean;
  readonly securityStatus?: "not_reviewed" | "reviewed";
  readonly pilotStatus?: "not_started" | "approved" | "completed";
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function readinessDecision(input: M25ReadinessInputV1): M25ReadinessDecisionV1 {
  if (input.syntheticEvidence && !input.realReviewedEvidence) return "production_ml_not_authorized";
  if (input.reviewedWorkDaySessions <= 0 || input.reviewedCalendarDays <= 0) return "insufficient_data";
  const thresholdsMet = input.reviewedCalendarDays >= M25_PROVISIONAL_READINESS_THRESHOLDS_V1.calendarDays
    && input.reviewedDeviceModelDays >= M25_PROVISIONAL_READINESS_THRESHOLDS_V1.deviceModelDays
    && input.reviewedWorkDaySessions >= M25_PROVISIONAL_READINESS_THRESHOLDS_V1.workDaySessions;
  if (!input.realReviewedEvidence) return "collection_in_progress";
  if (!thresholdsMet) return "collection_in_progress";
  if (input.featureCompleteness < 0.8 || input.missingness > 0.2 || input.trainHoldoutFeasibility === "infeasible") {
    return "ready_for_offline_statistical_evaluation";
  }
  if (input.reviewedLabelCount < 30) return "ready_for_offline_ml_experiment";
  if (input.securityStatus !== "reviewed" || input.pilotStatus === "not_started") return "ready_for_model_review";
  return "production_ml_not_authorized";
}

export function assessM25ReadinessV1(input: M25ReadinessInputV1): M25ReadinessAssessmentV1 {
  const reviewed = Math.max(0, input.reviewedLabelCount);
  const positive = Math.max(0, Math.min(reviewed, input.positiveLabelCount));
  const negative = Math.max(0, Math.min(reviewed - positive, input.negativeLabelCount));
  return {
    contractVersion: M25_READINESS_VERSION_V1,
    assessmentId: input.assessmentId,
    assessedAt: input.assessedAt,
    reviewedCalendarDays: Math.max(0, input.reviewedCalendarDays),
    reviewedDeviceModelDays: Math.max(0, input.reviewedDeviceModelDays),
    reviewedWorkDaySessions: Math.max(0, input.reviewedWorkDaySessions),
    deviceCount: Math.max(0, input.deviceCount),
    deviceModelDiversity: Math.max(0, input.deviceModelDiversity),
    adapterVersionDiversity: Math.max(0, input.adapterVersionDiversity),
    featureCompleteness: clamp01(input.featureCompleteness),
    missingness: clamp01(input.missingness),
    labelCounts: { reviewed, positive, negative },
    labelPrevalence: reviewed > 0 ? positive / reviewed : null,
    falsePositiveRate: input.falsePositiveRate === null ? null : clamp01(input.falsePositiveRate),
    driftEvidence: input.driftEvidence,
    cohortSupport: input.cohortSupport,
    trainHoldoutFeasibility: input.trainHoldoutFeasibility,
    syntheticEvidence: input.syntheticEvidence,
    realReviewedEvidence: input.realReviewedEvidence,
    securityStatus: input.securityStatus ?? "not_reviewed",
    pilotStatus: input.pilotStatus ?? "not_started",
    decision: readinessDecision(input),
    provisionalThresholds: M25_PROVISIONAL_READINESS_THRESHOLDS_V1,
  };
}

export function m25ReadinessAllowsOfflineEvaluationV1(
  decision: M25ReadinessDecisionV1,
): boolean {
  return [
    "ready_for_offline_statistical_evaluation",
    "ready_for_offline_ml_experiment",
    "ready_for_model_review",
  ].includes(decision);
}

export function canActivateM25AnalysisVersionV1(
  version: Pick<M25AnalysisVersionV1, "kind" | "status" | "apApproved" | "securityApproved" | "pilotApproved">,
): { readonly allowed: boolean; readonly reasonCode: string } {
  const mlKind: M25AnalysisKindV1[] = ["offline_ml_candidate", "reviewed_ml_model"];
  if (mlKind.includes(version.kind)) return { allowed: false, reasonCode: "production_ml_not_authorized_in_m25" };
  if (version.status !== "active") return { allowed: false, reasonCode: "analysis_version_not_active" };
  if (version.kind === "robust_statistical_baseline") return { allowed: true, reasonCode: "deterministic_statistical_review_only" };
  if (!version.apApproved || !version.securityApproved || !version.pilotApproved) return { allowed: false, reasonCode: "approval_gates_incomplete" };
  return { allowed: false, reasonCode: "analysis_activation_guard" };
}
