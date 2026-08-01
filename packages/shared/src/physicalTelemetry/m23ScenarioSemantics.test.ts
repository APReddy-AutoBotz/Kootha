import { describe, expect, it } from "vitest";
import { createRequiredTelemetryScenariosV1 } from "./scenarios";
import { m23ScenarioSemanticsV1 } from "./m23ScenarioSemantics";

describe("M20B to M23 comparison scenarios", () => {
  it("keeps the match and sustained mismatch fixtures synthetic and source-separated", () => {
    const scenarios = createRequiredTelemetryScenariosV1();
    for (const id of ["phone-and-physical-device-together", "phone-device-mismatch"] as const) {
      const scenario = scenarios.find((item) => item.id === id);
      expect(scenario?.synthetic).toBe(true);
      expect(scenario?.phonePoints?.every((item) => item.synthetic)).toBe(true);
      expect(scenario?.expectations.phoneDeviceRelationship).toBe(
        id === "phone-and-physical-device-together" ? "paired_match_fixture" : "sustained_mismatch_fixture",
      );
      expect(m23ScenarioSemanticsV1[id].syntheticOnly).toBe(true);
    }
  });

  it("defines executable authoritative outcomes for every required comparison semantic", () => {
    const required = [
      "paired-match", "sustained-mismatch", "isolated-mismatch", "accuracy-overlap",
      "poor-phone-accuracy", "poor-physical-accuracy", "no-pair-in-time-window",
      "deterministic-tie", "one-to-one-reuse-prevention", "phone-missing", "physical-missing",
      "both-missing", "source-not-expected", "break", "after-end-work", "delayed-physical-backfill",
      "delayed-phone-sync", "assignment-change", "device-replacement", "synthetic-non-synthetic-separation",
    ] as const;
    for (const id of required) {
      const semantic = m23ScenarioSemanticsV1[id];
      expect(semantic.scenarioId).toBe(id);
      expect(semantic.syntheticOnly).toBe(true);
      expect(typeof semantic.comparisonExpectation).toBe("string");
    }
    expect(m23ScenarioSemanticsV1["sustained-mismatch"].alertExpected).toBe(true);
    expect(m23ScenarioSemanticsV1["source-not-expected"].comparisonExpectation).toBe("not_expected");
    expect(m23ScenarioSemanticsV1["synthetic-non-synthetic-separation"].comparisonExpectation).toBe("comparison_unavailable");
  });
});
