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

export const driverApplicationStatuses = [
  "new",
  "under_review",
  "approved",
  "needs_more_info",
  "rejected",
  "duplicate"
] as const;

export const driverApprovalStatuses = [
  "waiting_for_approval",
  "approved",
  "rejected",
  "need_more_details"
] as const;

export const driverStatuses = ["pending_review", "approved", "inactive", "blocked"] as const;
export const driverAvailabilityStatuses = ["available", "not_available", "busy", "unknown"] as const;
export const vehicleStatuses = ["pending_review", "approved", "inactive", "blocked"] as const;
export const vehicleOwnershipOptions = ["own_vehicle", "hired_vehicle", "driver_only"] as const;
export const vehicleTypes = ["auto", "car", "van", "small_truck", "other"] as const;
export const yesNoNotSureOptions = ["yes", "no", "not_sure"] as const;
export const vehicleGpsDeviceStatuses = ["none", "planned", "installed", "not_working"] as const;
export const gpsDeviceStatuses = ["active", "inactive", "not_connected", "integration_pending"] as const;
export const packageTypes = ["basic", "standard", "premium", "not_sure"] as const;

export const adWorkStatuses = [
  "draft",
  "planned",
  "ready_for_driver_assignment",
  "on_hold",
  "cancelled"
] as const;

export const adWorkDayStatuses = ["planned"] as const;
export const adWorkAssignmentStatuses = [
  "not_assigned",
  "assigned",
  "needs_review",
  "ready_for_execution",
  "cancelled"
] as const;
export const executionReleaseStatuses = ["not_released", "released_to_driver", "access_revoked"] as const;
export const adWorkExecutionDayStatuses = ["planned", "ready", "running", "on_break", "completed", "issue_reported", "cancelled"] as const;
export const executionProofNoteTypes = ["area_covered", "announcement_done", "customer_request", "issue", "other"] as const;
export const proofUploadStatuses = ["pending_upload", "uploaded", "failed", "cancelled"] as const;
export const proofReviewStatuses = ["waiting_review", "approved", "rejected", "needs_more_info"] as const;
export const customerUpdateSharingStatuses = ["pending_sharing", "shared_manually"] as const;
export const customerUpdateSharingMethods = ["phone_call", "manual_whatsapp", "manual_sms", "in_person", "other"] as const;
export const campaignClosureStatuses = [
  "not_ready",
  "ready_for_review",
  "ready_to_close",
  "closed",
  "closed_with_issues",
  "cancelled"
] as const;
export const campaignClosureReasons = [
  "rain_local_issue",
  "customer_accepted_partial_work",
  "driver_issue_resolved_manually",
  "proof_not_required_by_customer",
  "other"
] as const;
export const finalSummaryShareMethods = ["manual_whatsapp", "manual_sms", "phone_call", "printed_copy", "in_person", "other"] as const;
export const customerAcceptanceStatuses = ["yes", "no", "not_confirmed"] as const;

export const trackingTypes = ["mobile", "device", "both"] as const;
export const areaCoverageStatuses = ["pending", "covered", "missed", "manual"] as const;
export const trackingSessionStatuses = ["not_started", "running", "paused", "stopped", "completed", "failed", "permission_missing"] as const;
export const trackingSources = ["phone"] as const;
export const locationQualities = ["good", "weak", "unknown"] as const;
export const trackingStopReasons = ["work_ended", "break_started", "admin_stopped", "permission_removed", "app_error", "other"] as const;
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
  driverApplicationStatuses,
  driverApprovalStatuses,
  driverStatuses,
  driverAvailabilityStatuses,
  vehicleStatuses,
  vehicleOwnershipOptions,
  vehicleTypes,
  yesNoNotSureOptions,
  vehicleGpsDeviceStatuses,
  gpsDeviceStatuses,
  packageTypes,
  adWorkStatuses,
  adWorkDayStatuses,
  adWorkAssignmentStatuses,
  executionReleaseStatuses,
  adWorkExecutionDayStatuses,
  executionProofNoteTypes,
  proofUploadStatuses,
  proofReviewStatuses,
  customerUpdateSharingStatuses,
  customerUpdateSharingMethods,
  campaignClosureStatuses,
  campaignClosureReasons,
  finalSummaryShareMethods,
  customerAcceptanceStatuses,
  trackingTypes,
  areaCoverageStatuses,
  trackingSessionStatuses,
  trackingSources,
  locationQualities,
  trackingStopReasons,
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
export type DriverApplicationStatus = (typeof driverApplicationStatuses)[number];
export type DriverApprovalStatus = (typeof driverApprovalStatuses)[number];
export type DriverStatus = (typeof driverStatuses)[number];
export type DriverAvailabilityStatus = (typeof driverAvailabilityStatuses)[number];
export type VehicleStatus = (typeof vehicleStatuses)[number];
export type VehicleOwnership = (typeof vehicleOwnershipOptions)[number];
export type VehicleType = (typeof vehicleTypes)[number];
export type YesNoNotSure = (typeof yesNoNotSureOptions)[number];
export type VehicleGpsDeviceStatus = (typeof vehicleGpsDeviceStatuses)[number];
export type AdWorkStatus = (typeof adWorkStatuses)[number];
export type AdWorkDayStatus = (typeof adWorkDayStatuses)[number];
export type AdWorkAssignmentStatus = (typeof adWorkAssignmentStatuses)[number];
export type ExecutionReleaseStatus = (typeof executionReleaseStatuses)[number];
export type AdWorkExecutionDayStatus = (typeof adWorkExecutionDayStatuses)[number];
export type ExecutionProofNoteType = (typeof executionProofNoteTypes)[number];
export type ProofUploadStatus = (typeof proofUploadStatuses)[number];
export type ProofReviewStatus = (typeof proofReviewStatuses)[number];
export type CustomerUpdateSharingStatus = (typeof customerUpdateSharingStatuses)[number];
export type CustomerUpdateSharingMethod = (typeof customerUpdateSharingMethods)[number];
export type CampaignClosureStatus = (typeof campaignClosureStatuses)[number];
export type CampaignClosureReason = (typeof campaignClosureReasons)[number];
export type FinalSummaryShareMethod = (typeof finalSummaryShareMethods)[number];
export type CustomerAcceptanceStatus = (typeof customerAcceptanceStatuses)[number];
export type TrackingType = (typeof trackingTypes)[number];
export type TrackingSessionStatus = (typeof trackingSessionStatuses)[number];
export type TrackingSource = (typeof trackingSources)[number];
export type LocationQuality = (typeof locationQualities)[number];
export type TrackingStopReason = (typeof trackingStopReasons)[number];

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

export const driverApplicationStatusLabels: Record<DriverApplicationStatus, string> = {
  new: "New",
  under_review: "Under Review",
  approved: "Approved",
  needs_more_info: "Needs More Info",
  rejected: "Rejected",
  duplicate: "Duplicate"
};

export const driverApplicationStatusOptions = driverApplicationStatuses;

export function getDriverApplicationStatusLabel(status: string): string {
  return driverApplicationStatusLabels[status as DriverApplicationStatus] ?? status;
}

export const driverStatusLabels: Record<DriverStatus, string> = {
  pending_review: "Pending Review",
  approved: "Approved",
  inactive: "Inactive",
  blocked: "Blocked"
};

export const driverStatusOptions = driverStatuses;

export function getDriverStatusLabel(status: string): string {
  return driverStatusLabels[status as DriverStatus] ?? status;
}

export const driverAvailabilityStatusLabels: Record<DriverAvailabilityStatus, string> = {
  available: "Available",
  not_available: "Not Available",
  busy: "Busy",
  unknown: "Unknown"
};

export const driverAvailabilityStatusOptions = driverAvailabilityStatuses;

export function getDriverAvailabilityStatusLabel(status: string): string {
  return driverAvailabilityStatusLabels[status as DriverAvailabilityStatus] ?? status;
}

export const vehicleStatusLabels: Record<VehicleStatus, string> = {
  pending_review: "Pending Review",
  approved: "Approved",
  inactive: "Inactive",
  blocked: "Blocked"
};

export const vehicleStatusOptions = vehicleStatuses;

export function getVehicleStatusLabel(status: string): string {
  return vehicleStatusLabels[status as VehicleStatus] ?? status;
}

export const vehicleOwnershipLabels: Record<VehicleOwnership, string> = {
  own_vehicle: "Own vehicle",
  hired_vehicle: "Hired vehicle",
  driver_only: "Driver only"
};

export const vehicleTypeLabels: Record<VehicleType, string> = {
  auto: "Auto",
  car: "Car",
  van: "Van",
  small_truck: "Small truck",
  other: "Other"
};

export const vehicleTypeOptions = vehicleTypes;

export const yesNoNotSureLabels: Record<YesNoNotSure, string> = {
  yes: "Yes",
  no: "No",
  not_sure: "Not sure"
};

export const vehicleGpsDeviceStatusLabels: Record<VehicleGpsDeviceStatus, string> = {
  none: "None",
  planned: "Device Planned",
  installed: "Device Installed",
  not_working: "Device Not Working"
};

export const vehicleGpsDeviceStatusOptions = vehicleGpsDeviceStatuses;

export function getVehicleGpsDeviceStatusLabel(status: string): string {
  return vehicleGpsDeviceStatusLabels[status as VehicleGpsDeviceStatus] ?? status;
}

export const adWorkStatusLabels: Record<AdWorkStatus, string> = {
  draft: "Draft",
  planned: "Planned",
  ready_for_driver_assignment: "Ready for Driver Assignment",
  on_hold: "On Hold",
  cancelled: "Cancelled"
};

export const adWorkStatusOptions = adWorkStatuses;

export const adWorkAssignmentStatusLabels: Record<AdWorkAssignmentStatus, string> = {
  not_assigned: "Not Assigned",
  assigned: "Assigned",
  needs_review: "Needs Review",
  ready_for_execution: "Ready for Execution",
  cancelled: "Cancelled"
};

export const adWorkAssignmentStatusOptions = adWorkAssignmentStatuses;

export function getAdWorkAssignmentStatusLabel(status: string): string {
  return adWorkAssignmentStatusLabels[status as AdWorkAssignmentStatus] ?? status;
}

export const executionReleaseStatusLabels: Record<ExecutionReleaseStatus, string> = {
  not_released: "Not Released",
  released_to_driver: "Released to Driver",
  access_revoked: "Access Revoked"
};

export const executionReleaseStatusOptions = executionReleaseStatuses;

export function getExecutionReleaseStatusLabel(status: string): string {
  return executionReleaseStatusLabels[status as ExecutionReleaseStatus] ?? status;
}

export const adWorkExecutionDayStatusLabels: Record<AdWorkExecutionDayStatus, string> = {
  planned: "Planned",
  ready: "Ready",
  running: "Running",
  on_break: "On Break",
  completed: "Completed",
  issue_reported: "Issue Reported",
  cancelled: "Cancelled"
};

export const adWorkExecutionDayStatusOptions = adWorkExecutionDayStatuses;

export function getAdWorkExecutionDayStatusLabel(status: string): string {
  return adWorkExecutionDayStatusLabels[status as AdWorkExecutionDayStatus] ?? status;
}

export const executionProofNoteTypeLabels: Record<ExecutionProofNoteType, string> = {
  area_covered: "Area Covered",
  announcement_done: "Announcement Done",
  customer_request: "Customer Request",
  issue: "Issue",
  other: "Other"
};

export const executionProofNoteTypeOptions = executionProofNoteTypes;

export function getExecutionProofNoteTypeLabel(status: string): string {
  return executionProofNoteTypeLabels[status as ExecutionProofNoteType] ?? status;
}
export const proofUploadStatusLabels: Record<ProofUploadStatus, string> = {
  pending_upload: "Pending Upload",
  uploaded: "Uploaded",
  failed: "Failed",
  cancelled: "Cancelled"
};

export const proofUploadStatusOptions = proofUploadStatuses;

export function getProofUploadStatusLabel(status: string): string {
  return proofUploadStatusLabels[status as ProofUploadStatus] ?? status;
}

export const proofReviewStatusLabels: Record<ProofReviewStatus, string> = {
  waiting_review: "Waiting Review",
  approved: "Approved",
  rejected: "Rejected",
  needs_more_info: "Needs More Info"
};

export const proofReviewStatusOptions = proofReviewStatuses;

export function getProofReviewStatusLabel(status: string): string {
  return proofReviewStatusLabels[status as ProofReviewStatus] ?? status;
}

export const customerUpdateSharingStatusLabels: Record<CustomerUpdateSharingStatus, string> = {
  pending_sharing: "Pending Sharing",
  shared_manually: "Shared Manually"
};

export const customerUpdateSharingStatusOptions = customerUpdateSharingStatuses;

export function getCustomerUpdateSharingStatusLabel(status: string): string {
  return customerUpdateSharingStatusLabels[status as CustomerUpdateSharingStatus] ?? status;
}

export const customerUpdateSharingMethodLabels: Record<CustomerUpdateSharingMethod, string> = {
  phone_call: "Phone Call",
  manual_whatsapp: "Manual WhatsApp",
  manual_sms: "Manual SMS",
  in_person: "In Person",
  other: "Other"
};

export const customerUpdateSharingMethodOptions = customerUpdateSharingMethods;

export function getCustomerUpdateSharingMethodLabel(status: string | null | undefined): string {
  if (!status) {
    return "Not set";
  }

  return customerUpdateSharingMethodLabels[status as CustomerUpdateSharingMethod] ?? status;
}

export const campaignClosureStatusLabels: Record<CampaignClosureStatus, string> = {
  not_ready: "Not Ready",
  ready_for_review: "Ready for Review",
  ready_to_close: "Ready to Close",
  closed: "Closed",
  closed_with_issues: "Closed with Issues",
  cancelled: "Cancelled"
};

export const campaignClosureStatusOptions = campaignClosureStatuses;

export function getCampaignClosureStatusLabel(status: string): string {
  return campaignClosureStatusLabels[status as CampaignClosureStatus] ?? status;
}

export const campaignClosureReasonLabels: Record<CampaignClosureReason, string> = {
  rain_local_issue: "Rain / Local Issue",
  customer_accepted_partial_work: "Customer Accepted Partial Work",
  driver_issue_resolved_manually: "Driver Issue Resolved Manually",
  proof_not_required_by_customer: "Proof Not Required by Customer",
  other: "Other"
};

export const campaignClosureReasonOptions = campaignClosureReasons;

export function getCampaignClosureReasonLabel(reason: string | null | undefined): string {
  if (!reason) {
    return "Not set";
  }

  return campaignClosureReasonLabels[reason as CampaignClosureReason] ?? reason;
}

export const finalSummaryShareMethodLabels: Record<FinalSummaryShareMethod, string> = {
  manual_whatsapp: "Manual WhatsApp",
  manual_sms: "Manual SMS",
  phone_call: "Phone Call",
  printed_copy: "Printed Copy",
  in_person: "In Person",
  other: "Other"
};

export const finalSummaryShareMethodOptions = finalSummaryShareMethods;

export function getFinalSummaryShareMethodLabel(method: string | null | undefined): string {
  if (!method) {
    return "Not set";
  }

  return finalSummaryShareMethodLabels[method as FinalSummaryShareMethod] ?? method;
}

export const customerAcceptanceStatusLabels: Record<CustomerAcceptanceStatus, string> = {
  yes: "Yes",
  no: "No",
  not_confirmed: "Not Confirmed"
};

export const customerAcceptanceStatusOptions = customerAcceptanceStatuses;

export function getCustomerAcceptanceStatusLabel(status: string | null | undefined): string {
  if (!status) {
    return "Not Confirmed";
  }

  return customerAcceptanceStatusLabels[status as CustomerAcceptanceStatus] ?? status;
}


export const trackingSessionStatusLabels: Record<TrackingSessionStatus, string> = {
  not_started: "Not Started",
  running: "Running",
  paused: "Paused",
  stopped: "Stopped",
  completed: "Completed",
  failed: "Failed",
  permission_missing: "Permission Missing"
};

export const trackingSessionStatusOptions = trackingSessionStatuses;

export function getTrackingSessionStatusLabel(status: string | null | undefined): string {
  if (!status) {
    return "Not Started";
  }

  return trackingSessionStatusLabels[status as TrackingSessionStatus] ?? status;
}

export const trackingStopReasonLabels: Record<TrackingStopReason, string> = {
  work_ended: "Work Ended",
  break_started: "Break Started",
  admin_stopped: "Admin Stopped",
  permission_removed: "Permission Removed",
  app_error: "App Error",
  other: "Other"
};

export const trackingStopReasonOptions = trackingStopReasons;

export function getTrackingStopReasonLabel(reason: string | null | undefined): string {
  if (!reason) {
    return "Not set";
  }

  return trackingStopReasonLabels[reason as TrackingStopReason] ?? reason;
}

export const locationQualityLabels: Record<LocationQuality, string> = {
  good: "Good",
  weak: "Weak",
  unknown: "Unknown"
};

export const locationQualityOptions = locationQualities;

export function getLocationQualityLabel(quality: string | null | undefined): string {
  if (!quality) {
    return "Unknown";
  }

  return locationQualityLabels[quality as LocationQuality] ?? quality;
}
export function getAdWorkStatusLabel(status: string): string {
  return adWorkStatusLabels[status as AdWorkStatus] ?? status;
}

export const adWorkDayStatusLabels: Record<AdWorkDayStatus, string> = {
  planned: "Planned"
};

export function hasDuplicateValues(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}
