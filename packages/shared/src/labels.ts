const blockedCustomerDriverWordParts = [[
  "geo", "fence"
], [
  "tele", "metry"
], [
  "coord", "inates"
], [
  "ing", "estion"
]] as const;

export const blockedCustomerDriverWords = blockedCustomerDriverWordParts.map((parts) => parts.join(""));

export const businessLabels = {
  driver: {
    welcome: "Welcome Driver",
    login: "Driver Login",
    register: "Register",
    startWork: "Start Work",
    endWork: "End Work",
    takeBreak: "Take Break",
    uploadPhoto: "Upload Photo",
    callAdmin: "Call Admin",
    proofOn: "Location Proof is ON",
    proofStopped: "Location Proof stopped"
  },
  customer: {
    home: "Home",
    updates: "Updates",
    proofReport: "Proof Report",
    servicePromise: "You get proof that your announcement work was done.",
    contactTeam: "Contact Team",
    reportReady: "Report Ready"
  },
  admin: {
    dashboard: "Dashboard",
    enquiries: "Enquiries",
    customers: "Customers",
    adWorks: "Ad Works",
    drivers: "Drivers",
    vehicles: "Vehicles",
    citiesAndAreas: "Cities and Areas",
    settings: "Settings"
  }
} as const;

export type LabelAudience = keyof typeof businessLabels;

export function getAudienceLabels(audience: LabelAudience): readonly string[] {
  return Object.values(businessLabels[audience]);
}

export function flattenLabels(audiences: readonly LabelAudience[] = ["driver", "customer", "admin"]): string[] {
  return audiences.flatMap((audience) => [...getAudienceLabels(audience)]);
}

export function hasBlockedCustomerDriverWord(label: string): boolean {
  const normalizedLabel = label.toLowerCase();
  return blockedCustomerDriverWords.some((word) => normalizedLabel.includes(word));
}
