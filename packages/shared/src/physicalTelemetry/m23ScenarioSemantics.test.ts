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
});
