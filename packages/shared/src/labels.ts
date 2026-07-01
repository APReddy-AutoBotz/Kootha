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
    proofNote: "Proof Note",
    proofNoteAdded: "Proof Note Added",
    startWork: "Start Work",
    takeBreak: "Take Break",
    resumeWork: "Resume Work",
    endWork: "End Work",
    addProofNote: "Add Proof Note",
    workCompleted: "Work Completed",
    issueReported: "Issue Reported",
    workCode: "Work Code",
    assignedWork: "Assigned Work",
    uploadPhotoProof: "Upload Photo Proof",
    areaOrPlaceName: "Area or Place Name",
    whatHappened: "What happened?",
    submitProof: "Submit Proof",
    proofSent: "Proof Sent"
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
    assignDriver: "Assign Driver",
    assignVehicle: "Assign Vehicle",
    readyForExecution: "Ready for Execution",
    needsReview: "Needs Review",
    serviceArea: "Service Area",
    availability: "Availability",
    citiesAndAreas: "Cities and Areas",
    settings: "Settings",
    leadManagement: "Lead Management",
    status: "Status",
    followUpDate: "Follow-up Date",
    internalNote: "Internal Note",
    adminRemark: "Admin Remark",
    packageInterest: "Package Interest",
    liveTrackingInterest: "Live Tracking Interest",
    executionRelease: "Execution Release",
    workAccessCode: "Work Access Code",
    executionTimeline: "Execution Timeline",
    proofNotes: "Proof Notes",
    proofUploads: "Proof Uploads",
    proofReview: "Proof Review",
    finalProofSummary: "Final Proof Summary",
    readyToClose: "Ready to Close",
    closeAdWork: "Close Ad Work",
    closedWithIssues: "Closed with Issues",
    closureNote: "Closure Note",
    customerAccepted: "Customer Accepted",
    missingProof: "Missing Proof",
    issueReported: "Issue Reported",
    workCompleted: "Work Completed",
    proofChecked: "Proof Checked",
    customerUpdateShared: "Customer Update Shared",
    copyMessage: "Copy Message",
    copyFinalSummary: "Copy Final Summary",
    markAsShared: "Mark as Shared",
    customerUpdate: "Customer Update"
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
