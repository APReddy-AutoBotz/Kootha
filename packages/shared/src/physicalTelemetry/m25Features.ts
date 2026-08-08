import {
  M25_FEATURE_VERSION_V1,
  m25FeatureDefinitionsV1,
  m25FeatureIdsV1,
  type M25FeatureEvidenceV1,
  type M25FeatureExtractionInputV1,
  type M25FeatureIdV1,
  type M25FeatureSnapshotV1,
  type M25FeatureSourceV1,
  type M25FeatureValueV1,
} from "./m25Contracts";

function finite(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function percentile(values: readonly number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * percentileValue;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function boundedRate(count: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.min(1, Math.max(0, count / denominator));
}

function cleanEvidence(input: M25FeatureExtractionInputV1): M25FeatureEvidenceV1[] {
  return [...input.evidence]
    .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId))
    .map((item) => ({
      ...item,
      longStopMinutes: Math.max(0, item.longStopMinutes),
      phoneMissingMinutes: Math.max(0, item.phoneMissingMinutes),
      physicalDeviceMissingMinutes: Math.max(0, item.physicalDeviceMissingMinutes),
    }));
}

function featureSource(featureId: M25FeatureIdV1): M25FeatureSourceV1 {
  if (["comparison_pair_rate", "mismatch_candidate_rate", "sustained_mismatch_count", "phone_missing_minutes", "physical_device_missing_minutes"].includes(featureId)) {
    return "m23_comparison_snapshot";
  }
  if (["sequence_gap_rate", "out_of_order_rate", "long_stop_minutes", "impossible_speed_count", "insufficient_quality_rate"].includes(featureId)) {
    return "m22_rule_evidence";
  }
  if (["heartbeat_coverage_rate", "battery_drop_per_hour", "external_power_loss_minutes", "gps_fix_rate", "gsm_healthy_rate"].includes(featureId)) {
    return "device_health";
  }
  if (["location_coverage_rate", "median_accuracy_meters", "p95_accuracy_meters"].includes(featureId)) {
    return "location_point";
  }
  if (["event_count", "accepted_live_rate", "accepted_delayed_rate", "health_only_rate", "rejection_rate", "duplicate_rate", "identity_conflict_rate", "median_interarrival_seconds", "p95_interarrival_seconds"].includes(featureId)) {
    return "telemetry_receipt";
  }
  return "adapter_metadata";
}

function valueMap(evidence: readonly M25FeatureEvidenceV1[]): ReadonlyMap<M25FeatureIdV1, number> {
  const total = evidence.length;
  const accepted = evidence.filter((item) => item.disposition === "accepted_live" || item.disposition === "accepted_delayed").length;
  const acceptedLive = evidence.filter((item) => item.disposition === "accepted_live").length;
  const acceptedDelayed = evidence.filter((item) => item.disposition === "accepted_delayed").length;
  const healthOnly = evidence.filter((item) => item.disposition === "health_only").length;
  const rejected = evidence.filter((item) => item.disposition === "rejected").length;
  const duplicates = evidence.filter((item) => item.disposition === "duplicate").length;
  const identityConflicts = evidence.filter((item) => item.disposition === "duplicate_conflict").length;
  const interarrival = evidence.flatMap((item) => finite(item.interarrivalSeconds) && item.interarrivalSeconds >= 0 ? [item.interarrivalSeconds] : []);
  const accuracies = evidence.flatMap((item) => finite(item.accuracyMeters) && item.accuracyMeters >= 0 ? [item.accuracyMeters] : []);
  const batterySamples = evidence
    .filter((item) => finite(item.batteryPercent) && item.batteryPercent >= 0 && item.batteryPercent <= 100)
    .sort((left, right) => left.capturedAt.localeCompare(right.capturedAt));
  let batteryDropPerHour = 0;
  if (batterySamples.length >= 2) {
    const elapsedHours = Math.max(0, (Date.parse(batterySamples.at(-1)!.capturedAt) - Date.parse(batterySamples[0].capturedAt)) / 3_600_000);
    batteryDropPerHour = elapsedHours > 0 ? Math.max(0, batterySamples[0].batteryPercent! - batterySamples.at(-1)!.batteryPercent!) / elapsedHours : 0;
  }
  const externalPowerLossMinutes = evidence.reduce((sum, item) => sum + (item.externalPower === false ? Math.max(1, (item.interarrivalSeconds ?? 60) / 60) : 0), 0);
  const gpsSamples = evidence.filter((item) => item.gpsFix !== null);
  const gsmSamples = evidence.filter((item) => item.gsmSignalDbm !== null);
  const values = new Map<M25FeatureIdV1, number>([
    ["event_count", total],
    ["accepted_live_rate", boundedRate(acceptedLive, total)],
    ["accepted_delayed_rate", boundedRate(acceptedDelayed, total)],
    ["health_only_rate", boundedRate(healthOnly, total)],
    ["rejection_rate", boundedRate(rejected, total)],
    ["duplicate_rate", boundedRate(duplicates, total)],
    ["identity_conflict_rate", boundedRate(identityConflicts, total)],
    ["sequence_gap_rate", boundedRate(evidence.filter((item) => item.sequenceGap).length, total)],
    ["out_of_order_rate", boundedRate(evidence.filter((item) => item.outOfOrder).length, total)],
    ["median_interarrival_seconds", median(interarrival)],
    ["p95_interarrival_seconds", percentile(interarrival, 0.95)],
    ["heartbeat_coverage_rate", boundedRate(evidence.filter((item) => item.heartbeat).length, total)],
    ["location_coverage_rate", boundedRate(evidence.filter((item) => item.hasLocation).length, total)],
    ["median_accuracy_meters", median(accuracies)],
    ["p95_accuracy_meters", percentile(accuracies, 0.95)],
    ["battery_drop_per_hour", batteryDropPerHour],
    ["external_power_loss_minutes", externalPowerLossMinutes],
    ["gps_fix_rate", boundedRate(gpsSamples.filter((item) => item.gpsFix !== "none").length, gpsSamples.length)],
    ["gsm_healthy_rate", boundedRate(gsmSamples.filter((item) => item.gsmSignalDbm! >= -90).length, gsmSamples.length)],
    ["long_stop_minutes", evidence.reduce((sum, item) => sum + item.longStopMinutes, 0)],
    ["impossible_speed_count", evidence.filter((item) => item.impossibleSpeed).length],
    ["comparison_pair_rate", boundedRate(evidence.filter((item) => item.comparisonPair).length, total)],
    ["mismatch_candidate_rate", boundedRate(evidence.filter((item) => item.mismatchCandidate).length, total)],
    ["sustained_mismatch_count", evidence.filter((item) => item.sustainedMismatch).length],
    ["phone_missing_minutes", evidence.reduce((sum, item) => sum + item.phoneMissingMinutes, 0)],
    ["physical_device_missing_minutes", evidence.reduce((sum, item) => sum + item.physicalDeviceMissingMinutes, 0)],
    ["insufficient_quality_rate", boundedRate(evidence.filter((item) => item.insufficientQuality).length, total)],
  ]);
  return values;
}

export function extractM25FeatureSnapshotV1(
  input: M25FeatureExtractionInputV1,
): M25FeatureSnapshotV1 {
  if (!input.snapshotId || !input.scopeKeyHash || !input.periodStart || !input.periodEnd) {
    throw new Error("M25_FEATURE_SCOPE_INVALID");
  }
  if (Date.parse(input.periodEnd) < Date.parse(input.periodStart)) {
    throw new Error("M25_FEATURE_PERIOD_INVALID");
  }
  const evidence = cleanEvidence(input);
  const valuesById = valueMap(evidence);
  const values: M25FeatureValueV1[] = m25FeatureIdsV1.map((featureId) => {
    const definition = m25FeatureDefinitionsV1.find((item) => item.featureId === featureId)!;
    const sampleCount = featureId === "event_count" ? evidence.length : evidence.filter((item) => {
      if (featureId.includes("accuracy")) return finite(item.accuracyMeters);
      if (featureId.includes("interarrival")) return finite(item.interarrivalSeconds);
      if (featureId.includes("gps")) return item.gpsFix !== null;
      if (featureId.includes("gsm")) return item.gsmSignalDbm !== null;
      if (featureId.includes("battery")) return item.batteryPercent !== null;
      return true;
    }).length;
    return {
      featureId,
      value: valuesById.get(featureId) ?? 0,
      sampleCount,
      coverageScore: boundedRate(sampleCount, Math.max(1, evidence.length)),
      source: featureSource(featureId) ?? definition.sources[0],
    };
  });
  const sourceCompleteness = evidence.length === 0
    ? 0
    : values.reduce((sum, item) => sum + item.coverageScore, 0) / values.length;
  return {
    contractVersion: M25_FEATURE_VERSION_V1,
    snapshotId: input.snapshotId,
    featureVersion: M25_FEATURE_VERSION_V1,
    scope: input.scope,
    scopeKeyHash: input.scopeKeyHash,
    deviceModel: input.adapter.deviceModel,
    adapterVersion: input.adapter.adapterVersion,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    values,
    synthetic: evidence.length === 0 ? input.adapter.synthetic : evidence.every((item) => item.synthetic),
    sourceCompleteness,
    supersedesSnapshotId: input.supersedesSnapshotId ?? null,
    generatedAt: input.generatedAt,
  };
}

export function getM25FeatureValueV1(
  snapshot: M25FeatureSnapshotV1,
  featureId: M25FeatureIdV1,
): M25FeatureValueV1 | undefined {
  return snapshot.values.find((value) => value.featureId === featureId);
}
