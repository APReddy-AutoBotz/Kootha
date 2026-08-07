import type { TelemetryScenarioIdV1 } from "./scenarios";

export type M23ScenarioSemanticIdV1 =
  | TelemetryScenarioIdV1
  | "paired-match"
  | "sustained-mismatch"
  | "isolated-mismatch"
  | "accuracy-overlap"
  | "poor-phone-accuracy"
  | "poor-physical-accuracy"
  | "no-pair-in-time-window"
  | "deterministic-tie"
  | "one-to-one-reuse-prevention"
  | "phone-missing"
  | "physical-missing"
  | "both-missing"
  | "source-not-expected"
  | "break"
  | "after-end-work"
  | "delayed-physical-backfill"
  | "delayed-phone-sync"
  | "assignment-change"
  | "device-replacement"
  | "synthetic-non-synthetic-separation";

export type M23ScenarioAuthoritativeOutcomeV1 =
  | "paired_match"
  | "sustained_mismatch"
  | "isolated_mismatch"
  | "insufficient_quality"
  | "insufficient_pairs"
  | "phone_missing"
  | "physical_device_missing"
  | "both_missing"
  | "not_expected"
  | "comparison_unavailable";

export interface M23ScenarioSemanticExpectationV1 {
  readonly scenarioId: M23ScenarioSemanticIdV1;
  readonly comparisonExpectation: M23ScenarioAuthoritativeOutcomeV1;
  readonly syntheticOnly: true;
  readonly alertExpected: boolean;
}

const expectation = (
  scenarioId: M23ScenarioSemanticIdV1,
  comparisonExpectation: M23ScenarioAuthoritativeOutcomeV1,
  alertExpected = false,
): M23ScenarioSemanticExpectationV1 => ({
  scenarioId,
  comparisonExpectation,
  syntheticOnly: true,
  alertExpected,
});

export const m23ScenarioSemanticsV1: Readonly<
  Record<M23ScenarioSemanticIdV1, M23ScenarioSemanticExpectationV1>
> = {
  "healthy-movement": expectation("healthy-movement", "paired_match"),
  "long-stop": expectation("long-stop", "paired_match"),
  "missing-heartbeat": expectation("missing-heartbeat", "comparison_unavailable"),
  "duplicate-retry": expectation("duplicate-retry", "paired_match"),
  "changed-content-duplicate": expectation("changed-content-duplicate", "comparison_unavailable"),
  "sequence-gap": expectation("sequence-gap", "comparison_unavailable"),
  "out-of-order-event": expectation("out-of-order-event", "comparison_unavailable"),
  "delayed-offline-backfill": expectation("delayed-offline-backfill", "paired_match"),
  "expired-delayed-backfill": expectation("expired-delayed-backfill", "comparison_unavailable"),
  "invalid-coordinate": expectation("invalid-coordinate", "comparison_unavailable"),
  "impossible-speed": expectation("impossible-speed", "comparison_unavailable"),
  "low-battery": expectation("low-battery", "comparison_unavailable"),
  "poor-gps": expectation("poor-gps", "comparison_unavailable"),
  "poor-gsm": expectation("poor-gsm", "comparison_unavailable"),
  "offline-reconnect": expectation("offline-reconnect", "paired_match"),
  "telemetry-before-start-work": expectation("telemetry-before-start-work", "comparison_unavailable"),
  "telemetry-after-end-work": expectation("telemetry-after-end-work", "comparison_unavailable"),
  "phone-and-physical-device-together": expectation("phone-and-physical-device-together", "paired_match"),
  "phone-device-mismatch": expectation("phone-device-mismatch", "sustained_mismatch", true),
  "approved-sensor-observations": expectation("approved-sensor-observations", "paired_match"),
  "unsupported-sensor-metric": expectation("unsupported-sensor-metric", "comparison_unavailable"),
  "paired-match": expectation("paired-match", "paired_match"),
  "sustained-mismatch": expectation("sustained-mismatch", "sustained_mismatch", true),
  "isolated-mismatch": expectation("isolated-mismatch", "isolated_mismatch"),
  "accuracy-overlap": expectation("accuracy-overlap", "paired_match"),
  "poor-phone-accuracy": expectation("poor-phone-accuracy", "insufficient_quality"),
  "poor-physical-accuracy": expectation("poor-physical-accuracy", "insufficient_quality"),
  "no-pair-in-time-window": expectation("no-pair-in-time-window", "insufficient_pairs"),
  "deterministic-tie": expectation("deterministic-tie", "paired_match"),
  "one-to-one-reuse-prevention": expectation("one-to-one-reuse-prevention", "insufficient_pairs"),
  "phone-missing": expectation("phone-missing", "phone_missing"),
  "physical-missing": expectation("physical-missing", "physical_device_missing"),
  "both-missing": expectation("both-missing", "both_missing"),
  "source-not-expected": expectation("source-not-expected", "not_expected"),
  "break": expectation("break", "comparison_unavailable"),
  "after-end-work": expectation("after-end-work", "comparison_unavailable"),
  "delayed-physical-backfill": expectation("delayed-physical-backfill", "paired_match"),
  "delayed-phone-sync": expectation("delayed-phone-sync", "paired_match"),
  "assignment-change": expectation("assignment-change", "comparison_unavailable"),
  "device-replacement": expectation("device-replacement", "comparison_unavailable"),
  "synthetic-non-synthetic-separation": expectation("synthetic-non-synthetic-separation", "comparison_unavailable"),
};
