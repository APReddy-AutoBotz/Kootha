import type { LiveTrackingNeed } from "./enquiry";
import type {
  AdWorkAssignmentStatus,
  AdWorkExecutionDayStatus,
  CampaignClosureReason,
  CampaignClosureStatus,
  CustomerAcceptanceStatus,
  CustomerUpdateSharingStatus,
  ExecutionReleaseStatus,
  FinalSummaryLocationProofActiveStatus,
  FinalSummaryLocationProofStatus,
  FinalSummaryLocationProofSyncStatus,
  ProofReviewStatus
} from "./statuses";
import {
  getFinalSummaryLocationProofActiveLabel,
  getFinalSummaryLocationProofStatusLabel,
  getFinalSummaryLocationProofSyncLabel
} from "./statuses";

export interface CampaignClosureReadinessInput {
  assignmentStatus: AdWorkAssignmentStatus;
  releaseStatus: ExecutionReleaseStatus;
  dayStatuses: readonly AdWorkExecutionDayStatus[];
  proofNeeded: boolean;
  proofReviewStatuses: readonly ProofReviewStatus[];
  customerUpdateSharingStatuses: readonly CustomerUpdateSharingStatus[];
  liveTrackingRequested: LiveTrackingNeed;
  liveTrackingEnabled: boolean;
  finalSummaryReviewed: boolean;
  customerUpdatesReviewed: boolean;
  proofNotRequiredConfirmed: boolean;
  closureReason?: CampaignClosureReason | "" | null;
  assignmentRequired?: boolean;
  releaseRequired?: boolean;
}

export interface CampaignClosureReadiness {
  status: CampaignClosureStatus;
  canClose: boolean;
  warnings: string[];
  blockingWarnings: string[];
  hardStops: string[];
}

export interface FinalProofSummaryProof {
  status: ProofReviewStatus;
  areaPlaceName?: string | null;
  noteText?: string | null;
}

export interface FinalProofSummaryDay {
  date: string;
  status: AdWorkExecutionDayStatus;
  completionNote?: string | null;
  issueNote?: string | null;
}

export interface FinalSummaryLocationProof {
  include: boolean;
  status: FinalSummaryLocationProofStatus;
  required: boolean;
  activeDuringWork: FinalSummaryLocationProofActiveStatus;
  firstLocationReceived?: string | null;
  lastLocationReceived?: string | null;
  offlineSync: FinalSummaryLocationProofSyncStatus;
  teamReviewNote?: string | null;
}

export interface FinalProofSummaryInput {
  customerName: string;
  businessName?: string | null;
  mobileNumber?: string | null;
  cityTown?: string | null;
  advertisementDetails?: string | null;
  adWorkReference: string;
  packageLabel: string;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  assignedDriver?: string | null;
  assignedVehicle?: string | null;
  micSystemStatus?: string | null;
  days: readonly FinalProofSummaryDay[];
  proofs: readonly FinalProofSummaryProof[];
  customerUpdatesShared: boolean;
  locationProof?: FinalSummaryLocationProof | null;
  closureStatusLabel: string;
  customerAccepted: CustomerAcceptanceStatus;
  closureNote?: string | null;
}

function hasClosureReason(value: CampaignClosureReadinessInput["closureReason"]): boolean {
  return Boolean(value);
}

export function buildCampaignClosureReadiness(input: CampaignClosureReadinessInput): CampaignClosureReadiness {
  const hardStops: string[] = [];
  const warnings: string[] = [];
  const blockingWarnings: string[] = [];

  if ((input.assignmentRequired ?? true) && input.assignmentStatus !== "ready_for_execution") {
    hardStops.push("Ad Work is not assigned.");
  }

  if ((input.releaseRequired ?? true) && input.releaseStatus !== "released_to_driver") {
    hardStops.push("Ad Work was not released to driver.");
  }

  if (!input.finalSummaryReviewed) {
    hardStops.push("Final Proof Summary is not reviewed.");
  }

  if (!input.customerUpdatesReviewed) {
    hardStops.push("Customer update messages are not reviewed.");
  }

  if (input.dayStatuses.length === 0 || input.dayStatuses.some((status) => status !== "completed")) {
    warnings.push("Some planned days are not completed.");
    blockingWarnings.push("Some planned days are not completed.");
  }

  if (input.dayStatuses.includes("issue_reported")) {
    warnings.push("Issue Reported and not resolved.");
    blockingWarnings.push("Issue Reported and not resolved.");
  }

  if (input.proofNeeded && !input.proofNotRequiredConfirmed) {
    if (input.proofReviewStatuses.length === 0) {
      warnings.push("Missing Proof.");
      blockingWarnings.push("Missing Proof.");
    }

    if (input.proofReviewStatuses.includes("waiting_review") || input.proofReviewStatuses.includes("needs_more_info")) {
      warnings.push("Proof is waiting for review.");
      blockingWarnings.push("Proof is waiting for review.");
    }

    if (input.proofReviewStatuses.includes("rejected")) {
      warnings.push("Some proof was rejected.");
      blockingWarnings.push("Some proof was rejected.");
    }
  }

  if (input.customerUpdateSharingStatuses.includes("pending_sharing")) {
    warnings.push("Customer updates are not marked shared.");
    blockingWarnings.push("Customer updates are not marked shared.");
  }

  if (input.liveTrackingRequested === "yes" && !input.liveTrackingEnabled) {
    warnings.push("Premium live tracking was requested but not enabled in this MVP.");
  }

  if (input.proofNeeded) {
    warnings.push("GPS proof is not available in this version.");
  }

  const canClose = hardStops.length === 0;
  let status: CampaignClosureStatus = "not_ready";

  if (canClose) {
    status = "ready_to_close";
  } else if (hardStops.length === 0) {
    status = "ready_for_review";
  }

  return {
    status,
    canClose,
    warnings,
    blockingWarnings,
    hardStops
  };
}

export function getApprovedFinalProofs(proofs: readonly FinalProofSummaryProof[]): FinalProofSummaryProof[] {
  return proofs.filter((proof) => proof.status === "approved");
}

function valueOrNotSet(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed || "Not set";
}

function valueOrNotAvailable(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed || "Not Available";
}

export function buildFinalSummaryLocationProofLines(locationProof: FinalSummaryLocationProof | null | undefined): string[] {
  if (!locationProof?.include) {
    return [];
  }

  return [
    "Phone Location Proof",
    "Phone Location Proof Status: " + getFinalSummaryLocationProofStatusLabel(locationProof.status),
    "Location Proof Required: " + (locationProof.required ? "Yes" : "No"),
    "Location Proof Active During Work: " + getFinalSummaryLocationProofActiveLabel(locationProof.activeDuringWork),
    "First Location Received: " + valueOrNotAvailable(locationProof.firstLocationReceived),
    "Last Location Received: " + valueOrNotAvailable(locationProof.lastLocationReceived),
    "Offline Location Sync: " + getFinalSummaryLocationProofSyncLabel(locationProof.offlineSync),
    "Team Review Note: " + valueOrNotAvailable(locationProof.teamReviewNote),
    "Phone Location Proof is supporting evidence only. It does not certify route, map, distance, or full area coverage."
  ];
}

export function buildFinalProofSummaryText(input: FinalProofSummaryInput): string {
  const approvedProofs = getApprovedFinalProofs(input.proofs);
  const dayLines = input.days.map((day) => {
    const note = day.completionNote ? " - " + day.completionNote : "";
    const issue = day.issueNote ? " Issue: " + day.issueNote : "";
    return day.date + ": " + day.status.replace(/_/g, " ") + note + issue;
  });
  const proofLines = approvedProofs.map((proof) => {
    const area = valueOrNotSet(proof.areaPlaceName);
    const note = valueOrNotSet(proof.noteText);
    return area + " - " + note;
  });

  return [
    "Final Proof Summary",
    "Customer: " + valueOrNotSet(input.customerName),
    "Business/shop: " + valueOrNotSet(input.businessName),
    "Mobile: " + valueOrNotSet(input.mobileNumber),
    "City/town: " + valueOrNotSet(input.cityTown),
    "Advertisement: " + valueOrNotSet(input.advertisementDetails),
    "Ad Work: " + input.adWorkReference,
    "Package: " + input.packageLabel,
    "Planned dates: " + valueOrNotSet(input.plannedStartDate) + " to " + valueOrNotSet(input.plannedEndDate),
    "Assigned driver: " + valueOrNotSet(input.assignedDriver),
    "Assigned vehicle: " + valueOrNotSet(input.assignedVehicle),
    "Mic System: " + valueOrNotSet(input.micSystemStatus),
    "Day-wise summary:",
    ...(dayLines.length > 0 ? dayLines : ["No completed day rows yet."]),
    "Approved proof:",
    ...(proofLines.length > 0 ? proofLines : ["No customer-approved photo proof selected."]),
    "Customer Update Shared: " + (input.customerUpdatesShared ? "Yes" : "No"),
    ...buildFinalSummaryLocationProofLines(input.locationProof),
    "Closure status: " + input.closureStatusLabel,
    "Customer Accepted: " + input.customerAccepted.replace(/_/g, " "),
    "Closure Note: " + valueOrNotSet(input.closureNote),
    "GPS, route, map, and live tracking proof are not included in this version."
  ].join("\n");
}