const blockedCustomerDriverWordParts = [[
  "geo", "fence"
], [
  "tele", "metry"
], [
  "coord", "inates"
], [
  "ing", "estion"
], [
  "m", "qtt"
], [
  "http ", "ingestion"
]] as const;

const blockedCustomerAdminWordParts = [
  ...blockedCustomerDriverWordParts,
  ["a", "pi"],
  ["r", "ls"],
  ["back", "end"],
  ["data", "base"],
  ["device", " ", "stream"]
] as const;

export const blockedCustomerDriverWords = blockedCustomerDriverWordParts.map((parts) => parts.join(""));
export const blockedCustomerAdminWords = blockedCustomerAdminWordParts.map((parts) => parts.join(""));

export const businessLabels = {
  driver: {
    welcome: "Welcome Driver",
    login: "Driver Login",
    register: "Register",
    registerAsDriver: "Register as Driver",
    submitDetails: "Submit Details",
    callAdmin: "Call Admin",
    applicationSent: "Application Sent",
    waitingForApproval: "Waiting for Approval",
    micSystem: "Mic System",
    serviceArea: "Service Area",
    vehicle: "Vehicle",
    vehicleGpsDevice: "Vehicle GPS Device",
    proofOn: "Location Proof is ON",
    proofStopped: "Location Proof stopped",
    startWork: "Start Work",
    endWork: "End Work",
    takeBreak: "Take Break",
    uploadPhoto: "Upload Photo"
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
    driverApplications: "Driver Applications",
    drivers: "Drivers",
    vehicles: "Vehicles",
    advertisementWork: "Advertisement Work",
    plannedWork: "Planned Work",
    areasToCover: "Areas to Cover",
    customerUpdates: "Customer Updates",
    proofNeeded: "Proof Needed",
    vehicleGpsDevice: "Vehicle GPS Device",
    citiesAndAreas: "Cities and Areas",
    settings: "Settings",
    leadManagement: "Lead Management",
    status: "Status",
    followUpDate: "Follow-up Date",
    internalNote: "Internal Note",
    adminRemark: "Admin Remark",
    packageInterest: "Package Interest",
    liveTrackingInterest: "Live Tracking Interest"
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

export function hasBlockedCustomerAdminWord(label: string): boolean {
  const normalizedLabel = label.toLowerCase();
  return blockedCustomerAdminWords.some((word) => normalizedLabel.includes(word));
}
