import type { AdWorkAssignmentStatus, AdWorkExecutionDayStatus, CampaignClosureStatus, ExecutionReleaseStatus, TrackingStopReason } from "./statuses";

export const mobileLocationProofConsentText = "Prachar will use your phone location only during this assigned advertisement work. Location proof starts when you start work and stops when you end work.";

export interface MobileLocationProofStartInput {
  mobileLocationProofRequired: boolean;
  assignmentStatus: AdWorkAssignmentStatus;
  releaseStatus: ExecutionReleaseStatus;
  dayStatus: AdWorkExecutionDayStatus;
  closureStatus?: CampaignClosureStatus | null;
}

export function canStartMobileLocationProof(input: MobileLocationProofStartInput): boolean {
  return input.mobileLocationProofRequired
    && input.assignmentStatus === "ready_for_execution"
    && input.releaseStatus === "released_to_driver"
    && input.dayStatus === "running"
    && input.closureStatus !== "closed"
    && input.closureStatus !== "closed_with_issues"
    && input.closureStatus !== "cancelled";
}

export function getTrackingStopReasonForWorkAction(action: "take_break" | "end" | "revoke" | "admin_stop" | "permission_removed" | "app_error" | "other"): TrackingStopReason {
  if (action === "take_break") {
    return "break_started";
  }

  if (action === "end") {
    return "work_ended";
  }

  if (action === "revoke" || action === "admin_stop") {
    return "admin_stopped";
  }

  if (action === "permission_removed") {
    return "permission_removed";
  }

  if (action === "app_error") {
    return "app_error";
  }

  return "other";
}

export function getLocationQualityFromAccuracy(accuracyMeters: number | null | undefined): "good" | "weak" | "unknown" {
  if (typeof accuracyMeters !== "number" || !Number.isFinite(accuracyMeters)) {
    return "unknown";
  }

  return accuracyMeters <= 50 ? "good" : "weak";
}