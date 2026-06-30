import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRODUCT_NAME,
  businessLabels,
  flattenLabels,
  getAudienceLabels,
  hasBlockedCustomerDriverWord,
  packageInterestLabels,
  resolveProductName,
  statusGroups,
  validatePublicEnquiry
} from "./index";

const validEnquiry = {
  customerName: "Asha",
  businessName: "Asha Stores",
  mobileNumber: "9876543210",
  cityTown: "Ongole",
  areasToCover: "Main Road and Market Area",
  preferredDate: "2026-07-10",
  numberOfDays: 1,
  advertisementDetails: "Opening announcement",
  packageInterest: "basic" as const,
  liveTrackingNeeded: "no" as const,
  notes: "Morning preferred",
  consentToContact: true
};

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

describe("M1 public enquiry validation", () => {
  it("rejects missing required enquiry fields", () => {
    expect(validatePublicEnquiry({
      customerName: "",
      businessName: "",
      mobileNumber: "",
      cityTown: "",
      areasToCover: "",
      preferredDate: "",
      numberOfDays: 0,
      advertisementDetails: "",
      packageInterest: "not_sure",
      liveTrackingNeeded: "not_sure",
      notes: "",
      consentToContact: false
    }).length).toBeGreaterThan(0);
  });

  it("rejects invalid enquiry mobile numbers", () => {
    const errors = validatePublicEnquiry({ ...validEnquiry, mobileNumber: "abc" });
    expect(errors).toContain("Enter a valid mobile number.");
  });

  it("requires enquiry contact consent", () => {
    const errors = validatePublicEnquiry({ ...validEnquiry, consentToContact: false });
    expect(errors).toContain("Consent is required before sending an enquiry.");
  });

  it("accepts a valid public enquiry", () => {
    expect(validatePublicEnquiry(validEnquiry)).toEqual([]);
  });

  it("keeps package labels simple", () => {
    expect(Object.values(packageInterestLabels)).toEqual(["Basic", "Standard", "Premium", "Not sure"]);
  });
});