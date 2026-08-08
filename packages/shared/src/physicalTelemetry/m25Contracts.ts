export const M25_FEATURE_VERSION_V1 = "m25-features-v1" as const;
export const M25_ANALYSIS_VERSION_V1 = "m25-statistical-v1" as const;
export const M25_READINESS_VERSION_V1 = "m25-readiness-v1" as const;

export const m25FeatureScopesV1 = [
  "device_work_day",
  "device_day",
  "device_model_day",
  "adapter_version_day",
  "fleet_day",
] as const;
export type M25FeatureScopeV1 = (typeof m25FeatureScopesV1)[number];

export const m25FeatureIdsV1 = [
  "event_count",
  "accepted_live_rate",
  "accepted_delayed_rate",
  "health_only_rate",
  "rejection_rate",
  "duplicate_rate",
  "identity_conflict_rate",
  "sequence_gap_rate",
  "out_of_order_rate",
  "median_interarrival_seconds",
  "p95_interarrival_seconds",
  "heartbeat_coverage_rate",
  "location_coverage_rate",
  "median_accuracy_meters",
  "p95_accuracy_meters",
  "battery_drop_per_hour",
  "external_power_loss_minutes",
  "gps_fix_rate",
  "gsm_healthy_rate",
  "long_stop_minutes",
  "impossible_speed_count",
  "comparison_pair_rate",
  "mismatch_candidate_rate",
  "sustained_mismatch_count",
  "phone_missing_minutes",
  "physical_device_missing_minutes",
  "insufficient_quality_rate",
] as const;
export type M25FeatureIdV1 = (typeof m25FeatureIdsV1)[number];

export type M25FeatureSourceV1 =
  | "telemetry_receipt"
  | "tracking_session"
  | "location_point"
  | "device_health"
  | "m22_rule_evidence"
  | "m23_comparison_snapshot"
  | "adapter_metadata";

export interface M25FeatureDefinitionV1 {
  readonly contractVersion: typeof M25_FEATURE_VERSION_V1;
  readonly featureId: M25FeatureIdV1;
  readonly unit: "count" | "rate" | "seconds" | "minutes" | "meters" | "count_per_hour";
  readonly sources: readonly M25FeatureSourceV1[];
  readonly orderedObservations: boolean;
  readonly minimumCoverageScore: number;
  readonly description: string;
}

export interface M25FeatureValueV1 {
  readonly featureId: M25FeatureIdV1;
  readonly value: number;
  readonly sampleCount: number;
  readonly coverageScore: number;
  readonly source: M25FeatureSourceV1;
}

export interface M25FeatureSnapshotV1 {
  readonly contractVersion: typeof M25_FEATURE_VERSION_V1;
  readonly snapshotId: string;
  readonly featureVersion: typeof M25_FEATURE_VERSION_V1;
  readonly scope: M25FeatureScopeV1;
  readonly scopeKeyHash: string;
  readonly deviceModel: string | null;
  readonly adapterVersion: string | null;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly values: readonly M25FeatureValueV1[];
  readonly synthetic: boolean;
  readonly sourceCompleteness: number;
  readonly supersedesSnapshotId: string | null;
  readonly generatedAt: string;
}

export type M25TelemetryDispositionV1 =
  | "accepted_live"
  | "accepted_delayed"
  | "health_only"
  | "rejected"
  | "duplicate"
  | "duplicate_conflict";

export interface M25FeatureEvidenceV1 {
  readonly evidenceId: string;
  readonly capturedAt: string;
  readonly disposition: M25TelemetryDispositionV1;
  readonly source: "physical_device" | "simulator";
  readonly synthetic: boolean;
  readonly heartbeat: boolean;
  readonly hasLocation: boolean;
  readonly accuracyMeters: number | null;
  readonly batteryPercent: number | null;
  readonly externalPower: boolean | null;
  readonly gpsFix: "none" | "two_dimensional" | "three_dimensional" | null;
  readonly gsmSignalDbm: number | null;
  readonly interarrivalSeconds: number | null;
  readonly sequenceGap: boolean;
  readonly outOfOrder: boolean;
  readonly impossibleSpeed: boolean;
  readonly longStopMinutes: number;
  readonly phoneMissingMinutes: number;
  readonly physicalDeviceMissingMinutes: number;
  readonly comparisonPair: boolean;
  readonly mismatchCandidate: boolean;
  readonly sustainedMismatch: boolean;
  readonly insufficientQuality: boolean;
}

export interface M25AdapterMetadataEvidenceV1 {
  readonly adapterVersion: string;
  readonly deviceModel: string | null;
  readonly synthetic: boolean;
}

export interface M25FeatureExtractionInputV1 {
  readonly snapshotId: string;
  readonly scope: M25FeatureScopeV1;
  readonly scopeKeyHash: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly evidence: readonly M25FeatureEvidenceV1[];
  readonly adapter: M25AdapterMetadataEvidenceV1;
  readonly supersedesSnapshotId?: string | null;
  readonly generatedAt: string;
}

export interface M25CohortDimensionsV1 {
  readonly metric: M25FeatureIdV1;
  readonly deviceModel: string | null;
  readonly adapterVersion: string | null;
  readonly workCategory: string | null;
  readonly source: "physical_device" | "simulator" | "mixed";
  readonly synthetic: boolean;
}

export type M25BaselineFallbackV1 =
  | "exact_supported_cohort"
  | "broader_model_adapter_cohort"
  | "fleet_cohort"
  | "insufficient_data";

export interface M25BaselineVersionV1 {
  readonly contractVersion: typeof M25_ANALYSIS_VERSION_V1;
  readonly baselineId: string;
  readonly baselineVersion: string;
  readonly featureVersion: typeof M25_FEATURE_VERSION_V1;
  readonly metric: M25FeatureIdV1;
  readonly cohort: M25CohortDimensionsV1;
  readonly fallback: M25BaselineFallbackV1;
  readonly sampleCount: number;
  readonly coverageCount: number;
  readonly median: number | null;
  readonly medianAbsoluteDeviation: number | null;
  readonly p10: number | null;
  readonly p25: number | null;
  readonly p75: number | null;
  readonly p90: number | null;
  readonly minimum: number | null;
  readonly maximum: number | null;
  readonly baselinePeriodStart: string | null;
  readonly baselinePeriodEnd: string | null;
  readonly active: boolean;
  readonly provisional: true;
}

export interface M25BaselineObservationV1 {
  readonly value: number;
  readonly capturedAt: string;
  readonly scopeKeyHash: string;
  readonly deviceModel: string | null;
  readonly adapterVersion: string | null;
  readonly workCategory: string | null;
  readonly source: "physical_device" | "simulator";
  readonly synthetic: boolean;
}

export const m25SignalDirectionsV1 = ["high_bad", "low_bad", "two_sided"] as const;
export type M25SignalDirectionV1 = (typeof m25SignalDirectionsV1)[number];

export const m25SignalStatesV1 = [
  "insufficient_data",
  "normal",
  "watch",
  "investigate",
  "suppressed",
  "reviewed",
] as const;
export type M25SignalStateV1 = (typeof m25SignalStatesV1)[number];

export const m25SignalReviewLabelsV1 = [
  "confirmed_operational_issue",
  "expected_behavior",
  "false_positive",
  "data_quality_problem",
  "insufficient_evidence",
  "requires_more_observation",
] as const;
export type M25SignalReviewLabelV1 = (typeof m25SignalReviewLabelsV1)[number];

export const m25SignalIdsV1 = [
  "telemetry_gap_shift",
  "delayed_backfill_rate_shift",
  "rejection_rate_shift",
  "duplicate_rate_shift",
  "sequence_disorder_shift",
  "accuracy_degradation_shift",
  "battery_drain_shift",
  "gps_quality_shift",
  "gsm_quality_shift",
  "heartbeat_coverage_shift",
  "location_coverage_shift",
  "long_stop_duration_shift",
  "impossible_speed_frequency_shift",
  "comparison_quality_shift",
  "mismatch_candidate_rate_shift",
  "missing_source_duration_shift",
  "adapter_version_behavior_shift",
  "device_model_cohort_outlier",
] as const;
export type M25SignalIdV1 = (typeof m25SignalIdsV1)[number];

export interface M25StatisticalSignalDefinitionV1 {
  readonly contractVersion: typeof M25_ANALYSIS_VERSION_V1;
  readonly signalId: M25SignalIdV1;
  readonly metric: M25FeatureIdV1;
  readonly direction: M25SignalDirectionV1;
  readonly minimumBaselineSupport: number;
  readonly minimumCurrentSupport: number;
  readonly openingThreshold: number;
  readonly clearingThreshold: number;
  readonly consecutiveWindows: number;
  readonly explanationCode: string;
  readonly ruleFallback: string;
  readonly provisional: true;
}

export type M25SupportLevelV1 =
  | "none"
  | "low"
  | "moderate"
  | "strong"
  | "synthetic_only";

export interface M25StatisticalSignalV1 {
  readonly contractVersion: typeof M25_ANALYSIS_VERSION_V1;
  readonly signalId: M25SignalIdV1;
  readonly signalEpisodeId: string;
  readonly metric: M25FeatureIdV1;
  readonly scope: M25FeatureScopeV1;
  readonly scopeKeyHash: string;
  readonly direction: M25SignalDirectionV1;
  readonly state: M25SignalStateV1;
  readonly observedValue: number | null;
  readonly baselineMedian: number | null;
  readonly baselineMad: number | null;
  readonly fallbackStatistic: "mad" | "iqr" | "none";
  readonly robustScore: number | null;
  readonly ewmaValue: number | null;
  readonly sampleCount: number;
  readonly supportLevel: M25SupportLevelV1;
  readonly coverageScore: number;
  readonly baselineVersion: string | null;
  readonly featureVersion: typeof M25_FEATURE_VERSION_V1;
  readonly analysisVersion: typeof M25_ANALYSIS_VERSION_V1;
  readonly explanationCode: string;
  readonly ruleFallback: string;
  readonly synthetic: boolean;
  readonly promotedAlertId: string | null;
  readonly generatedAt: string;
}

export interface M25SignalReviewV1 {
  readonly reviewId: string;
  readonly signalEpisodeId: string;
  readonly previousState: M25SignalStateV1;
  readonly newState: M25SignalStateV1;
  readonly label: M25SignalReviewLabelV1;
  readonly reviewer: string;
  readonly reason: string;
  readonly note: string;
  readonly reviewedAt: string;
  readonly auditAction: "statistical_signal_reviewed";
}

export const m25ReadinessDecisionsV1 = [
  "insufficient_data",
  "collection_in_progress",
  "ready_for_offline_statistical_evaluation",
  "ready_for_offline_ml_experiment",
  "ready_for_model_review",
  "production_ml_not_authorized",
] as const;
export type M25ReadinessDecisionV1 = (typeof m25ReadinessDecisionsV1)[number];

export interface M25ReadinessAssessmentV1 {
  readonly contractVersion: typeof M25_READINESS_VERSION_V1;
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
  readonly labelCounts: Readonly<{ reviewed: number; positive: number; negative: number }>;
  readonly labelPrevalence: number | null;
  readonly falsePositiveRate: number | null;
  readonly driftEvidence: "none" | "observed" | "insufficient_data";
  readonly cohortSupport: M25SupportLevelV1;
  readonly trainHoldoutFeasibility: "not_ready" | "feasible" | "infeasible";
  readonly syntheticEvidence: boolean;
  readonly realReviewedEvidence: boolean;
  readonly securityStatus: "not_reviewed" | "reviewed";
  readonly pilotStatus: "not_started" | "approved" | "completed";
  readonly decision: M25ReadinessDecisionV1;
  readonly provisionalThresholds: Readonly<{
    readonly calendarDays: number;
    readonly calendarDaysMin: number;
    readonly calendarDaysMax: number;
    readonly deviceModelDays: number;
    readonly workDaySessions: number;
  }>;
}

export const m25AnalysisKindsV1 = [
  "deterministic_rule",
  "robust_statistical_baseline",
  "offline_ml_candidate",
  "reviewed_ml_model",
] as const;
export type M25AnalysisKindV1 = (typeof m25AnalysisKindsV1)[number];

export const m25AnalysisStatusesV1 = [
  "draft",
  "offline_evaluation",
  "validated_offline",
  "awaiting_approval",
  "approved_disabled",
  "active",
  "retired",
  "rejected",
] as const;
export type M25AnalysisStatusV1 = (typeof m25AnalysisStatusesV1)[number];

export interface M25AnalysisVersionV1 {
  readonly analysisVersion: string;
  readonly kind: M25AnalysisKindV1;
  readonly status: M25AnalysisStatusV1;
  readonly featureVersion: typeof M25_FEATURE_VERSION_V1;
  readonly trainingWindowMetadata: string | null;
  readonly holdoutDesign: string | null;
  readonly labelDefinition: string | null;
  readonly modelVersion: string | null;
  readonly performanceMetrics: string | null;
  readonly driftPolicy: string | null;
  readonly explanationMethod: string;
  readonly ruleFallback: string;
  readonly humanReviewPolicy: string;
  readonly apApproved: boolean;
  readonly securityApproved: boolean;
  readonly pilotApproved: boolean;
  readonly createdAt: string;
}

function m25SourcesForFeatureV1(featureId: M25FeatureIdV1): readonly M25FeatureSourceV1[] {
  if (["comparison_pair_rate", "mismatch_candidate_rate", "sustained_mismatch_count", "phone_missing_minutes", "physical_device_missing_minutes"].includes(featureId)) return ["m23_comparison_snapshot"];
  if (["sequence_gap_rate", "out_of_order_rate", "long_stop_minutes", "impossible_speed_count", "insufficient_quality_rate"].includes(featureId)) return ["m22_rule_evidence"];
  if (["heartbeat_coverage_rate", "battery_drop_per_hour", "external_power_loss_minutes", "gps_fix_rate", "gsm_healthy_rate"].includes(featureId)) return ["device_health"];
  if (["location_coverage_rate", "median_accuracy_meters", "p95_accuracy_meters"].includes(featureId)) return ["location_point"];
  if (["event_count", "accepted_live_rate", "accepted_delayed_rate", "health_only_rate", "rejection_rate", "duplicate_rate", "identity_conflict_rate", "median_interarrival_seconds", "p95_interarrival_seconds"].includes(featureId)) return ["telemetry_receipt"];
  return ["adapter_metadata"];
}

export const m25FeatureDefinitionsV1: readonly M25FeatureDefinitionV1[] = m25FeatureIdsV1.map((featureId) => ({
  contractVersion: M25_FEATURE_VERSION_V1,
  featureId,
  unit: featureId.endsWith("_rate") || featureId.includes("coverage") ? "rate" : featureId.endsWith("_minutes") ? "minutes" : featureId.endsWith("_seconds") ? "seconds" : featureId.includes("accuracy") ? "meters" : featureId === "battery_drop_per_hour" ? "count_per_hour" : "count",
  sources: m25SourcesForFeatureV1(featureId),
  orderedObservations: featureId.includes("interarrival") || featureId.includes("battery") || featureId.includes("duration") || featureId.includes("missing_source"),
  minimumCoverageScore: featureId === "event_count" ? 0 : 0.5,
  description: `Safe derived aggregate for ${featureId.replaceAll("_", " ")}.`,
}));

export const m25StatisticalSignalDefinitionsV1: readonly M25StatisticalSignalDefinitionV1[] = [
  ["telemetry_gap_shift", "median_interarrival_seconds", "high_bad", "telemetry_gap_shift"],
  ["delayed_backfill_rate_shift", "accepted_delayed_rate", "high_bad", "delayed_backfill_rate_shift"],
  ["rejection_rate_shift", "rejection_rate", "high_bad", "rejection_rate_shift"],
  ["duplicate_rate_shift", "duplicate_rate", "high_bad", "duplicate_rate_shift"],
  ["sequence_disorder_shift", "out_of_order_rate", "high_bad", "sequence_disorder_shift"],
  ["accuracy_degradation_shift", "median_accuracy_meters", "high_bad", "accuracy_degradation_shift"],
  ["battery_drain_shift", "battery_drop_per_hour", "high_bad", "battery_drain_shift"],
  ["gps_quality_shift", "gps_fix_rate", "low_bad", "gps_quality_shift"],
  ["gsm_quality_shift", "gsm_healthy_rate", "low_bad", "gsm_quality_shift"],
  ["heartbeat_coverage_shift", "heartbeat_coverage_rate", "low_bad", "heartbeat_coverage_shift"],
  ["location_coverage_shift", "location_coverage_rate", "low_bad", "location_coverage_shift"],
  ["long_stop_duration_shift", "long_stop_minutes", "high_bad", "long_stop_duration_shift"],
  ["impossible_speed_frequency_shift", "impossible_speed_count", "high_bad", "impossible_speed_frequency_shift"],
  ["comparison_quality_shift", "comparison_pair_rate", "low_bad", "comparison_quality_shift"],
  ["mismatch_candidate_rate_shift", "mismatch_candidate_rate", "high_bad", "mismatch_candidate_rate_shift"],
  ["missing_source_duration_shift", "physical_device_missing_minutes", "high_bad", "missing_source_duration_shift"],
  ["adapter_version_behavior_shift", "rejection_rate", "high_bad", "adapter_version_behavior_shift"],
  ["device_model_cohort_outlier", "insufficient_quality_rate", "high_bad", "device_model_cohort_outlier"],
].map(([signalId, metric, direction, explanationCode]) => ({
  contractVersion: M25_ANALYSIS_VERSION_V1,
  signalId: signalId as M25SignalIdV1,
  metric: metric as M25FeatureIdV1,
  direction: direction as M25SignalDirectionV1,
  minimumBaselineSupport: 8,
  minimumCurrentSupport: 3,
  openingThreshold: 3,
  clearingThreshold: 2,
  consecutiveWindows: 2,
  explanationCode,
  ruleFallback: `Use existing deterministic health/comparison rules for ${signalId}.`,
  provisional: true as const,
}));
