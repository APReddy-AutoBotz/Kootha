import { describe, expect, it } from "vitest";
import {
  assessM25ReadinessV1,
  canActivateM25AnalysisVersionV1,
  extractM25FeatureSnapshotV1,
  evaluateM25StatisticalSignalV1,
  m25FeatureIdsV1,
  m25StatisticalSignalDefinitionsV1,
  computeM25RobustBaselineV1,
  m25SignalIsOperationallyActionableV1,
  scoreM25RobustObservationV1,
  selectM25BaselineV1,
  type M25BaselineObservationV1,
  type M25FeatureEvidenceV1,
} from "@kootha/shared";

function evidence(overrides: Partial<M25FeatureEvidenceV1> = {}): M25FeatureEvidenceV1 {
  return {
    evidenceId: "e-1", capturedAt: "2026-08-07T08:00:00.000Z", disposition: "accepted_live", source: "simulator", synthetic: true,
    heartbeat: true, hasLocation: true, accuracyMeters: 8, batteryPercent: 90, externalPower: true,
    gpsFix: "three_dimensional", gsmSignalDbm: -70, interarrivalSeconds: 15, sequenceGap: false, outOfOrder: false,
    impossibleSpeed: false, longStopMinutes: 0, phoneMissingMinutes: 0, physicalDeviceMissingMinutes: 0,
    comparisonPair: true, mismatchCandidate: false, sustainedMismatch: false, insufficientQuality: false, ...overrides,
  };
}

describe("M25 feature extraction and deterministic statistical intelligence", () => {
  it("extracts every typed feature deterministically without raw location fields", () => {
    const input = { snapshotId: "snapshot-1", scope: "device_day" as const, scopeKeyHash: "a".repeat(64), periodStart: "2026-08-07T00:00:00.000Z", periodEnd: "2026-08-08T00:00:00.000Z", evidence: [evidence(), evidence({ evidenceId: "e-2", disposition: "accepted_delayed", capturedAt: "2026-08-07T08:00:15.000Z", batteryPercent: 80, mismatchCandidate: true })], adapter: { adapterVersion: "1.0.0", deviceModel: "synthetic-model", synthetic: true }, generatedAt: "2026-08-08T00:00:00.000Z" };
    const first = extractM25FeatureSnapshotV1(input);
    const second = extractM25FeatureSnapshotV1(input);
    expect(first).toEqual(second);
    expect(first.values).toHaveLength(m25FeatureIdsV1.length);
    expect(first.values.find((value) => value.featureId === "event_count")?.value).toBe(2);
    expect(first.values.find((value) => value.featureId === "accepted_delayed_rate")?.value).toBe(0.5);
    expect(JSON.stringify(first)).not.toMatch(/latitude|longitude|rawPayload|credential|workCode/i);
  });

  it("computes robust baselines, exact cohort fallback, and zero-MAD safety", () => {
    const cohort = { metric: "rejection_rate" as const, deviceModel: "model-a", adapterVersion: "1.0.0", workCategory: null, source: "simulator" as const, synthetic: true };
    const observations: M25BaselineObservationV1[] = [1, 1, 1, 1, 1, 1, 1, 1].map((value, index) => ({ value, capturedAt: `2026-08-0${index + 1}T00:00:00.000Z`, scopeKeyHash: `scope-${index}`, deviceModel: "model-a", adapterVersion: "1.0.0", workCategory: null, source: "simulator", synthetic: true }));
    const baseline = computeM25RobustBaselineV1({ baselineId: "baseline-1", baselineVersion: "m25-baseline-v1", metric: "rejection_rate", cohort, observations });
    expect(baseline.median).toBe(1);
    expect(baseline.medianAbsoluteDeviation).toBe(0);
    const scored = scoreM25RobustObservationV1({ observedValue: 2, baseline, direction: "high_bad", currentSampleCount: 3, currentSynthetic: true });
    expect(scored.status).toBe("insufficient_variation");
    expect(selectM25BaselineV1([baseline], cohort).fallback).toBe("exact_supported_cohort");
    expect(selectM25BaselineV1([{ ...baseline, cohort: { ...cohort, synthetic: false }, synthetic: false }], cohort).fallback).toBe("insufficient_data");
  });

  it("scores a signal with direction, support, and deterministic explanation", () => {
    const definition = m25StatisticalSignalDefinitionsV1.find((item) => item.signalId === "rejection_rate_shift")!;
    const cohort = { metric: "rejection_rate" as const, deviceModel: null, adapterVersion: null, workCategory: null, source: "mixed" as const, synthetic: false };
    const baseline = computeM25RobustBaselineV1({ baselineId: "baseline-2", baselineVersion: "m25-baseline-v1", metric: "rejection_rate", cohort, observations: [0.01, 0.02, 0.02, 0.03, 0.03, 0.04, 0.04, 0.05].map((value, index) => ({ value, capturedAt: `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`, scopeKeyHash: `scope-${index}`, deviceModel: null, adapterVersion: null, workCategory: null, source: "physical_device", synthetic: false })) });
    const signal = evaluateM25StatisticalSignalV1({ signalEpisodeId: "episode-1", signalDefinition: definition, scope: "fleet_day", scopeKeyHash: "b".repeat(64), observedValue: 0.2, baseline, fallback: "exact_supported_cohort", currentSampleCount: 10, coverageScore: 0.9, synthetic: false, generatedAt: "2026-08-08T00:00:00.000Z" });
    expect(signal.state).toBe("investigate");
    expect(signal.robustScore).toBeGreaterThan(3);
    expect(signal.supportLevel).toBe("moderate");
    expect(signal.explanationCode).toBe("rejection_rate_shift");
    expect(signal.promotedAlertId).toBeNull();
  });

  it("semantically evaluates every catalog signal with the declared direction", () => {
    expect(m25StatisticalSignalDefinitionsV1).toHaveLength(18);
    for (const definition of m25StatisticalSignalDefinitionsV1) {
      const cohort = { metric: definition.metric, deviceModel: "model-a", adapterVersion: "adapter-a", workCategory: null, source: "physical_device" as const, synthetic: false };
      const baseline = computeM25RobustBaselineV1({
        baselineId: `baseline-${definition.signalId}`,
        baselineVersion: "m25-baseline-v1",
        metric: definition.metric,
        cohort,
        observations: [1, 2, 3, 4, 5, 6, 7, 8].map((value, index) => ({ value, capturedAt: `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`, scopeKeyHash: `scope-${index}`, deviceModel: "model-a", adapterVersion: "adapter-a", workCategory: null, source: "physical_device" as const, synthetic: false })),
      });
      const observedValue = definition.direction === "low_bad" ? -10 : 20;
      const signal = evaluateM25StatisticalSignalV1({ signalEpisodeId: `episode-${definition.signalId}`, signalDefinition: definition, scope: "device_model_day", scopeKeyHash: "f".repeat(64), observedValue, baseline, fallback: "exact_supported_cohort", currentSampleCount: 10, coverageScore: 1, synthetic: false, generatedAt: "2026-08-08T00:00:00.000Z" });
      expect(signal.signalId).toBe(definition.signalId);
      expect(signal.state).toBe("investigate");
      expect(m25SignalIsOperationallyActionableV1(signal)).toBe(true);
      expect(signal.ruleFallback).toContain(definition.signalId);
    }
  });

  it("returns the truthful readiness and blocks ML activation", () => {
    const readiness = assessM25ReadinessV1({ assessmentId: "readiness-1", assessedAt: "2026-08-08T00:00:00.000Z", reviewedCalendarDays: 30, reviewedDeviceModelDays: 30, reviewedWorkDaySessions: 1_000, deviceCount: 25, deviceModelDiversity: 3, adapterVersionDiversity: 2, featureCompleteness: 1, missingness: 0, reviewedLabelCount: 100, positiveLabelCount: 10, negativeLabelCount: 90, falsePositiveRate: null, driftEvidence: "none", cohortSupport: "synthetic_only", trainHoldoutFeasibility: "feasible", syntheticEvidence: true, realReviewedEvidence: false });
    expect(readiness.decision).toBe("production_ml_not_authorized");
    expect(canActivateM25AnalysisVersionV1({ kind: "reviewed_ml_model", status: "active", apApproved: true, securityApproved: true, pilotApproved: true })).toEqual({ allowed: false, reasonCode: "production_ml_not_authorized_in_m25" });
    expect(canActivateM25AnalysisVersionV1({ kind: "robust_statistical_baseline", status: "active", apApproved: false, securityApproved: false, pilotApproved: false }).allowed).toBe(true);
    expect(readiness.provisionalThresholds.calendarDaysMin).toBe(28);
    expect(readiness.provisionalThresholds.calendarDaysMax).toBe(56);
  });
});
