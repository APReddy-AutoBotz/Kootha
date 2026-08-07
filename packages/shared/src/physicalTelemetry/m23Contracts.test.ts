import { describe, expect, it } from "vitest";
import {
  M23_COMPARISON_POLICY_VERSION_V1,
  M23_PAIRING_ALGORITHM_VERSION_V1,
  isM23ComparisonOutcomeV1,
  m23ComparisonOutcomeSafeLabelsV1,
  m23ComparisonOutcomesV1,
  m23ComparisonReviewStatusSafeLabelsV1,
  m23ComparisonReviewStatusesV1,
  m23ComparisonSourceExpectationSafeLabelsV1,
  m23ComparisonSourceExpectationsV1,
} from "./m23Contracts";

describe("M23 stable comparison contracts", () => {
  it("exports the provisional policy and exact pairing versions", () => {
    expect(M23_COMPARISON_POLICY_VERSION_V1).toBe("m23-pilot-v1");
    expect(M23_PAIRING_ALGORITHM_VERSION_V1).toBe("m23-pairing-v1");
  });

  it("keeps every result, expectation, and review status label bounded", () => {
    expect(Object.keys(m23ComparisonOutcomeSafeLabelsV1)).toEqual([
      ...m23ComparisonOutcomesV1,
    ]);
    expect(Object.keys(m23ComparisonSourceExpectationSafeLabelsV1)).toEqual([
      ...m23ComparisonSourceExpectationsV1,
    ]);
    expect(Object.keys(m23ComparisonReviewStatusSafeLabelsV1)).toEqual([
      ...m23ComparisonReviewStatusesV1,
    ]);
    expect(isM23ComparisonOutcomeV1("sustained_mismatch")).toBe(true);
    expect(isM23ComparisonOutcomeV1("fraud_detected")).toBe(false);
  });

  it("uses neutral wording for customer and operational safety", () => {
    const text = [
      ...Object.values(m23ComparisonOutcomeSafeLabelsV1),
      ...Object.values(m23ComparisonReviewStatusSafeLabelsV1),
    ].join(" ");
    expect(text).not.toMatch(/fraud|cheating|fake location|tampering|certified/i);
    expect(text).toContain("follow-up");
  });
});
