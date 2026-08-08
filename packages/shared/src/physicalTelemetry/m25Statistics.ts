import {
  M25_ANALYSIS_VERSION_V1,
  M25_FEATURE_VERSION_V1,
  m25SignalStatesV1,
  type M25BaselineFallbackV1,
  type M25BaselineObservationV1,
  type M25BaselineVersionV1,
  type M25CohortDimensionsV1,
  type M25FeatureIdV1,
  type M25FeatureScopeV1,
  type M25SignalDirectionV1,
  type M25SignalStateV1,
  type M25StatisticalSignalDefinitionV1,
  type M25StatisticalSignalV1,
  type M25SupportLevelV1,
} from "./m25Contracts";

const ROBUST_NORMAL_SCALE = 0.6745;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return lower === upper
    ? sorted[lower]
    : sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function medianAbsoluteDeviation(values: readonly number[], center: number): number {
  return median(values.map((value) => Math.abs(value - center)));
}

function sameCohort(left: M25CohortDimensionsV1, right: M25CohortDimensionsV1): boolean {
  return left.metric === right.metric
    && left.deviceModel === right.deviceModel
    && left.adapterVersion === right.adapterVersion
    && left.workCategory === right.workCategory
    && left.source === right.source
    && left.synthetic === right.synthetic;
}

function supportFor(sampleCount: number, synthetic: boolean): M25SupportLevelV1 {
  if (synthetic) return "synthetic_only";
  if (sampleCount <= 0) return "none";
  if (sampleCount < 3) return "low";
  if (sampleCount < 20) return "moderate";
  return "strong";
}

export interface M25BaselineComputationInputV1 {
  readonly baselineId: string;
  readonly baselineVersion: string;
  readonly featureVersion?: typeof M25_FEATURE_VERSION_V1;
  readonly metric: M25FeatureIdV1;
  readonly cohort: M25CohortDimensionsV1;
  readonly observations: readonly M25BaselineObservationV1[];
  readonly minimumSupport?: number;
  readonly periodStart?: string | null;
  readonly periodEnd?: string | null;
  readonly active?: boolean;
}

export function computeM25RobustBaselineV1(
  input: M25BaselineComputationInputV1,
): M25BaselineVersionV1 {
  const observations = input.observations
    .filter((item) => item.synthetic === input.cohort.synthetic && Number.isFinite(item.value))
    .sort((left, right) => left.capturedAt.localeCompare(right.capturedAt) || left.scopeKeyHash.localeCompare(right.scopeKeyHash));
  const values = observations.map((item) => item.value);
  const supported = values.length >= (input.minimumSupport ?? 3);
  const center = supported ? median(values) : null;
  const mad = supported && center !== null ? medianAbsoluteDeviation(values, center) : null;
  return {
    contractVersion: M25_ANALYSIS_VERSION_V1,
    baselineId: input.baselineId,
    baselineVersion: input.baselineVersion,
    featureVersion: input.featureVersion ?? M25_FEATURE_VERSION_V1,
    metric: input.metric,
    cohort: input.cohort,
    fallback: supported ? "exact_supported_cohort" : "insufficient_data",
    sampleCount: values.length,
    coverageCount: observations.filter((item) => item.value !== 0 || values.length > 0).length,
    median: center,
    medianAbsoluteDeviation: mad,
    p10: supported ? percentile(values, 0.1) : null,
    p25: supported ? percentile(values, 0.25) : null,
    p75: supported ? percentile(values, 0.75) : null,
    p90: supported ? percentile(values, 0.9) : null,
    minimum: supported ? Math.min(...values) : null,
    maximum: supported ? Math.max(...values) : null,
    baselinePeriodStart: input.periodStart ?? (observations[0]?.capturedAt ?? null),
    baselinePeriodEnd: input.periodEnd ?? (observations.at(-1)?.capturedAt ?? null),
    active: input.active ?? supported,
    provisional: true,
  };
}

export interface M25BaselineSelectionV1 {
  readonly baseline: M25BaselineVersionV1 | null;
  readonly fallback: M25BaselineFallbackV1;
}

export function selectM25BaselineV1(
  baselines: readonly M25BaselineVersionV1[],
  requested: M25CohortDimensionsV1,
): M25BaselineSelectionV1 {
  const active = baselines.filter((baseline) => baseline.active && baseline.metric === requested.metric && baseline.cohort.synthetic === requested.synthetic);
  const exact = active.find((baseline) => sameCohort(baseline.cohort, requested) && baseline.sampleCount > 0);
  if (exact) return { baseline: { ...exact, fallback: "exact_supported_cohort" }, fallback: "exact_supported_cohort" };
  const broader = active.find((baseline) =>
    baseline.cohort.deviceModel === requested.deviceModel
      || baseline.cohort.adapterVersion === requested.adapterVersion,
  );
  if (broader && broader.sampleCount > 0) return { baseline: { ...broader, fallback: "broader_model_adapter_cohort" }, fallback: "broader_model_adapter_cohort" };
  const fleet = active.find((baseline) =>
    baseline.cohort.deviceModel === null
      && baseline.cohort.adapterVersion === null
      && baseline.cohort.workCategory === null,
  );
  if (fleet && fleet.sampleCount > 0) return { baseline: { ...fleet, fallback: "fleet_cohort" }, fallback: "fleet_cohort" };
  return { baseline: null, fallback: "insufficient_data" };
}

export interface M25RobustScoreResultV1 {
  readonly status: "scored" | "insufficient_data" | "insufficient_variation";
  readonly robustScore: number | null;
  readonly fallbackStatistic: "mad" | "iqr" | "none";
  readonly scale: number | null;
  readonly deviation: number | null;
  readonly supportLevel: M25SupportLevelV1;
}

export function scoreM25RobustObservationV1(input: {
  readonly observedValue: number;
  readonly baseline: M25BaselineVersionV1 | null;
  readonly direction: M25SignalDirectionV1;
  readonly currentSampleCount: number;
  readonly currentSynthetic?: boolean;
}): M25RobustScoreResultV1 {
  const baseline = input.baseline;
  if (baseline === null || baseline.median === null || input.currentSampleCount <= 0 || baseline.sampleCount <= 0) {
    return { status: "insufficient_data", robustScore: null, fallbackStatistic: "none", scale: null, deviation: null, supportLevel: supportFor(input.currentSampleCount, input.currentSynthetic ?? false) };
  }
  const deviation = input.observedValue - baseline.median;
  let scale = baseline.medianAbsoluteDeviation;
  let fallbackStatistic: "mad" | "iqr" | "none" = "mad";
  if (scale === null || scale === 0) {
    const iqr = (baseline.p75 ?? 0) - (baseline.p25 ?? 0);
    if (iqr > 0) {
      scale = iqr / 1.349;
      fallbackStatistic = "iqr";
    } else {
      return { status: "insufficient_variation", robustScore: null, fallbackStatistic: "none", scale: 0, deviation, supportLevel: supportFor(input.currentSampleCount, input.currentSynthetic ?? false) };
    }
  }
  const signed = ROBUST_NORMAL_SCALE * deviation / scale;
  const robustScore = input.direction === "high_bad"
    ? Math.max(0, signed)
    : input.direction === "low_bad"
      ? Math.max(0, -signed)
      : Math.abs(signed);
  return { status: "scored", robustScore, fallbackStatistic, scale, deviation, supportLevel: supportFor(input.currentSampleCount, input.currentSynthetic ?? false) };
}

export function calculateM25EwmaV1(
  orderedValues: readonly number[],
  alpha = 0.3,
): number | null {
  if (orderedValues.length === 0 || !Number.isFinite(alpha) || alpha <= 0 || alpha > 1) return null;
  let result = orderedValues[0];
  for (const value of orderedValues.slice(1)) result = alpha * value + (1 - alpha) * result;
  return result;
}

function signalStateFromScore(
  score: number,
  definition: M25StatisticalSignalDefinitionV1,
  previousState: M25SignalStateV1 | undefined,
  consecutiveWindows: number,
): M25SignalStateV1 {
  if (consecutiveWindows < definition.consecutiveWindows) return score >= definition.clearingThreshold ? "watch" : "normal";
  if (score >= definition.openingThreshold) return "investigate";
  if (previousState === "investigate" && score >= definition.clearingThreshold) return "watch";
  return "normal";
}

export interface M25SignalEvaluationInputV1 {
  readonly signalEpisodeId: string;
  readonly signalDefinition: M25StatisticalSignalDefinitionV1;
  readonly scope: M25FeatureScopeV1;
  readonly scopeKeyHash: string;
  readonly observedValue: number | null;
  readonly baseline: M25BaselineVersionV1 | null;
  readonly fallback: M25BaselineFallbackV1;
  readonly currentSampleCount: number;
  readonly coverageScore: number;
  readonly synthetic: boolean;
  readonly ewmaValue?: number | null;
  readonly previousState?: M25SignalStateV1;
  readonly consecutiveWindows?: number;
  readonly generatedAt: string;
}

export function evaluateM25StatisticalSignalV1(
  input: M25SignalEvaluationInputV1,
): M25StatisticalSignalV1 {
  const definition = input.signalDefinition;
  const meetsConfiguredSupport = input.currentSampleCount >= definition.minimumCurrentSupport
    && (input.baseline?.sampleCount ?? 0) >= definition.minimumBaselineSupport;
  const score = input.observedValue === null || !meetsConfiguredSupport
    ? { status: "insufficient_data" as const, robustScore: null, fallbackStatistic: "none" as const, scale: null, deviation: null, supportLevel: supportFor(input.currentSampleCount, input.synthetic) }
    : scoreM25RobustObservationV1({
      observedValue: input.observedValue,
      baseline: input.baseline,
      direction: definition.direction,
      currentSampleCount: input.currentSampleCount,
      currentSynthetic: input.synthetic,
    });
  const state: M25SignalStateV1 = score.status !== "scored"
    ? "insufficient_data"
    : signalStateFromScore(score.robustScore ?? 0, definition, input.previousState, input.consecutiveWindows ?? definition.consecutiveWindows);
  const signalState = m25SignalStatesV1.includes(state) ? state : "insufficient_data";
  return {
    contractVersion: M25_ANALYSIS_VERSION_V1,
    signalId: definition.signalId,
    signalEpisodeId: input.signalEpisodeId,
    metric: definition.metric,
    scope: input.scope,
    scopeKeyHash: input.scopeKeyHash,
    direction: definition.direction,
    state: signalState,
    observedValue: input.observedValue,
    baselineMedian: input.baseline?.median ?? null,
    baselineMad: input.baseline?.medianAbsoluteDeviation ?? null,
    fallbackStatistic: score.fallbackStatistic,
    robustScore: score.robustScore,
    ewmaValue: input.ewmaValue ?? null,
    sampleCount: input.currentSampleCount,
    supportLevel: score.supportLevel,
    coverageScore: Math.min(1, Math.max(0, input.coverageScore)),
    baselineVersion: input.baseline?.baselineVersion ?? null,
    featureVersion: M25_FEATURE_VERSION_V1,
    analysisVersion: M25_ANALYSIS_VERSION_V1,
    explanationCode: definition.explanationCode,
    ruleFallback: definition.ruleFallback,
    synthetic: input.synthetic,
    promotedAlertId: null,
    generatedAt: input.generatedAt,
  };
}

export function m25SignalIsOperationallyActionableV1(
  signal: Pick<M25StatisticalSignalV1, "state">,
): boolean {
  return signal.state === "investigate" || signal.state === "watch";
}
