import type { TelemetryScenarioIdV1 } from "./scenarios";

export type M23ScenarioComparisonExpectationV1 =
  | "paired_match"
  | "sustained_mismatch"
  | "not_expected"
  | "comparison_unavailable";

export interface M23ScenarioSemanticExpectationV1 {
  readonly scenarioId: TelemetryScenarioIdV1;
  readonly comparisonExpectation: M23ScenarioComparisonExpectationV1;
  readonly syntheticOnly: true;
  readonly alertExpected: boolean;
}

export const m23ScenarioSemanticsV1: Readonly<
  Record<"phone-and-physical-device-together" | "phone-device-mismatch", M23ScenarioSemanticExpectationV1>
> = {
  "phone-and-physical-device-together": {
    scenarioId: "phone-and-physical-device-together",
    comparisonExpectation: "paired_match",
    syntheticOnly: true,
    alertExpected: false,
  },
  "phone-device-mismatch": {
    scenarioId: "phone-device-mismatch",
    comparisonExpectation: "sustained_mismatch",
    syntheticOnly: true,
    alertExpected: true,
  },
};
