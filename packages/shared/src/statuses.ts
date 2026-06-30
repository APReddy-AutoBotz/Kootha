export const enquiryStatuses = [
  "new",
  "contacted",
  "quoted",
  "follow_up_needed",
  "converted",
  "not_interested",
  "invalid_spam"
] as const;
export const enquirySources = ["website", "phone_call", "whatsapp", "admin"] as const;

export const driverApprovalStatuses = [
  "waiting_for_approval",
  "approved",
  "rejected",
  "need_more_details"
] as const;

export const driverAvailabilityStatuses = ["available", "not_available"] as const;
export const vehicleStatuses = ["active", "inactive"] as const;
export const gpsDeviceStatuses = ["active", "inactive", "not_connected", "integration_pending"] as const;
export const packageTypes = ["basic", "standard", "premium"] as const;

export const adWorkStatuses = [
  "enquiry",
  "scheduled",
  "running",
  "paused",
  "completed",
  "cancelled"
] as const;

export const adWorkDayStatuses = [
  "scheduled",
  "running",
  "paused",
  "completed",
  "missed",
  "rescheduled"
] as const;

export const trackingTypes = ["mobile", "device", "both"] as const;
export const areaCoverageStatuses = ["pending", "covered", "missed", "manual"] as const;
export const trackingSessionStatuses = ["not_started", "running", "paused", "stopped", "completed"] as const;
export const trackingSources = ["mobile", "device"] as const;
export const locationQualities = ["good", "weak", "unknown"] as const;
export const stoppedByValues = ["driver", "admin", "system"] as const;
export const proofUploadTypes = ["photo", "audio", "video"] as const;
export const alertTypes = [
  "long_stop",
  "gps_lost",
  "network_lost",
  "missed_area",
  "device_not_responding",
  "mismatch"
] as const;
export const alertSeverities = ["info", "warning", "critical"] as const;
export const alertStatuses = ["open", "resolved"] as const;
export const customerUpdateTypes = [
  "scheduled",
  "started",
  "in_progress",
  "area_covered",
  "completed",
  "report_ready",
  "manual"
] as const;
export const customerUpdateChannels = ["copy", "whatsapp", "sms", "api_later"] as const;
export const customerUpdateSentStatuses = ["draft", "copied", "sent", "failed"] as const;
export const reportStatuses = ["draft", "generated", "shared", "disabled"] as const;
export const paymentStatuses = [
  "not_paid",
  "advance_paid",
  "partially_paid",
  "fully_paid",
  "refund_adjustment"
] as const;
export const auditActorTypes = ["admin", "driver", "system"] as const;

export const statusGroups = {
  enquiryStatuses,
  enquirySources,
  driverApprovalStatuses,
  driverAvailabilityStatuses,
  vehicleStatuses,
  gpsDeviceStatuses,
  packageTypes,
  adWorkStatuses,
  adWorkDayStatuses,
  trackingTypes,
  areaCoverageStatuses,
  trackingSessionStatuses,
  trackingSources,
  locationQualities,
  stoppedByValues,
  proofUploadTypes,
  alertTypes,
  alertSeverities,
  alertStatuses,
  customerUpdateTypes,
  customerUpdateChannels,
  customerUpdateSentStatuses,
  reportStatuses,
  paymentStatuses,
  auditActorTypes
} as const;

export type StatusGroupName = keyof typeof statusGroups;
export type EnquiryStatus = (typeof enquiryStatuses)[number];
export type DriverApprovalStatus = (typeof driverApprovalStatuses)[number];
export type AdWorkStatus = (typeof adWorkStatuses)[number];
export type TrackingType = (typeof trackingTypes)[number];
export type TrackingSessionStatus = (typeof trackingSessionStatuses)[number];

export const enquiryStatusLabels: Record<EnquiryStatus, string> = {
  new: "New",
  contacted: "Contacted",
  quoted: "Quoted",
  follow_up_needed: "Follow-up Needed",
  converted: "Converted",
  not_interested: "Not Interested",
  invalid_spam: "Invalid / Spam"
};

export const enquiryStatusOptions = enquiryStatuses;

export function getEnquiryStatusLabel(status: string): string {
  return enquiryStatusLabels[status as EnquiryStatus] ?? status;
}

export function hasDuplicateValues(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}
