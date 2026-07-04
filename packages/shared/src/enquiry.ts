import { isNonEmptyText, isPhoneLike, isPositiveInteger } from "./validation";

export const packageInterestOptions = ["basic", "standard", "premium", "not_sure"] as const;
export const liveTrackingNeedOptions = ["yes", "no", "not_sure"] as const;

export type PackageInterest = (typeof packageInterestOptions)[number];
export type LiveTrackingNeed = (typeof liveTrackingNeedOptions)[number];

export interface PublicEnquiryInput {
  customerName: string;
  businessName: string;
  mobileNumber: string;
  cityTown: string;
  areasToCover: string;
  preferredDate: string;
  numberOfDays: number;
  advertisementDetails: string;
  packageInterest: PackageInterest;
  liveTrackingNeeded: LiveTrackingNeed;
  notes: string;
  consentToContact: boolean;
  companyWebsite?: string;
}

export const packageInterestLabels: Record<PackageInterest, string> = {
  basic: "Basic",
  standard: "Standard",
  premium: "Premium",
  not_sure: "Not sure"
};

export const liveTrackingNeedLabels: Record<LiveTrackingNeed, string> = {
  yes: "Yes",
  no: "No",
  not_sure: "Not sure"
};

export const publicWebsiteText = {
  heroHeadline: "Local mic advertisement with proof",
  heroCopy: "You pay for local mic advertisement. We give you proof that it was really done.",
  enquiryButton: "Send Enquiry",
  onlineNotConfigured: "Online enquiry is not configured in this environment.",
  successMessage: "Enquiry received. The Kootha team will contact you soon."
} as const;

const maxLengths = {
  customerName: 80,
  businessName: 120,
  mobileNumber: 20,
  cityTown: 80,
  areasToCover: 500,
  preferredDate: 20,
  advertisementDetails: 1000,
  notes: 600
} as const;

export function validatePublicEnquiry(input: PublicEnquiryInput): string[] {
  const errors: string[] = [];

  if (isNonEmptyText(input.companyWebsite)) {
    errors.push("Please leave the hidden field empty.");
  }

  if (!isNonEmptyText(input.customerName)) {
    errors.push("Customer name is required.");
  }

  if (!isNonEmptyText(input.businessName)) {
    errors.push("Business or shop name is required.");
  }

  if (!isPhoneLike(input.mobileNumber)) {
    errors.push("Enter a valid mobile number.");
  }

  if (!isNonEmptyText(input.cityTown)) {
    errors.push("City or town is required.");
  }

  if (!isNonEmptyText(input.areasToCover)) {
    errors.push("Areas to cover are required.");
  }

  if (!isNonEmptyText(input.preferredDate)) {
    errors.push("Preferred date is required.");
  }

  if (!isPositiveInteger(input.numberOfDays)) {
    errors.push("Number of days must be at least 1.");
  }

  if (!isNonEmptyText(input.advertisementDetails)) {
    errors.push("Advertisement message or details are required.");
  }

  if (!packageInterestOptions.includes(input.packageInterest)) {
    errors.push("Choose a package interest.");
  }

  if (!liveTrackingNeedOptions.includes(input.liveTrackingNeeded)) {
    errors.push("Choose whether live tracking is needed.");
  }

  if (!input.consentToContact) {
    errors.push("Consent is required before sending an enquiry.");
  }

  for (const [fieldName, maxLength] of Object.entries(maxLengths)) {
    const value = input[fieldName as keyof typeof maxLengths];
    if (typeof value === "string" && value.length > maxLength) {
      errors.push(`${fieldName} is too long.`);
    }
  }

  return errors;
}