import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRODUCT_NAME,
  businessLabels,
  flattenLabels,
  getAudienceLabels,
  hasBlockedCustomerDriverWord,
  resolveProductName,
  statusGroups
} from "./index";

describe("M0 shared foundation", () => {
  it("defaults the product name to Prachar", () => {
    expect(DEFAULT_PRODUCT_NAME).toBe("Prachar");
    expect(resolveProductName()).toBe("Prachar");
  });

  it("resolves Kootha from shared config", () => {
    expect(resolveProductName({ productName: "Kootha" })).toBe("Kootha");
    expect(resolveProductName({ productName: "kootha" })).toBe("Kootha");
  });

  it("keeps shared enum values unique inside each group", () => {
    for (const [groupName, values] of Object.entries(statusGroups)) {
      expect(new Set(values).size, groupName).toBe(values.length);
    }
  });

  it("defines simple labels for driver, customer, and admin", () => {
    expect(getAudienceLabels("driver")).toContain("Start Work");
    expect(getAudienceLabels("customer")).toContain("Proof Report");
    expect(getAudienceLabels("admin")).toContain("Dashboard");
    expect(flattenLabels()).toContain(businessLabels.driver.callAdmin);
  });

  it("does not use blocked technical words in customer or driver labels", () => {
    const customerDriverLabels = flattenLabels(["customer", "driver"]);

    for (const label of customerDriverLabels) {
      expect(hasBlockedCustomerDriverWord(label), label).toBe(false);
    }
  });
});
