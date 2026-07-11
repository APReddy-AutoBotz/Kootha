export const deliveryMethods = ["vehicle_announcement", "field_promotion", "print_placement", "digital_media", "event_campaign", "custom"] as const;

export type DeliveryMethod = (typeof deliveryMethods)[number];
export type ExecutionMode = "driver_app" | "admin_managed";

export interface AdWorkRequirements {
  executionMode: ExecutionMode;
  driverRequired: boolean;
  vehicleRequired: boolean;
  speakerRequired: boolean;
  areasRequired: boolean;
  photoProofRequired: boolean;
  customerUpdatesRequired: boolean;
}

export interface DeliveryMethodTemplate {
  label: string;
  helper: string;
  requirements: AdWorkRequirements;
}

const adminManagedDefaults: AdWorkRequirements = {
  executionMode: "admin_managed",
  driverRequired: false,
  vehicleRequired: false,
  speakerRequired: false,
  areasRequired: false,
  photoProofRequired: true,
  customerUpdatesRequired: true
};

export const deliveryMethodTemplates: Record<DeliveryMethod, DeliveryMethodTemplate> = {
  vehicle_announcement: {
    label: "Vehicle announcement",
    helper: "A driver uses a vehicle and speaker equipment.",
    requirements: { executionMode: "driver_app", driverRequired: true, vehicleRequired: true, speakerRequired: true, areasRequired: true, photoProofRequired: true, customerUpdatesRequired: true }
  },
  field_promotion: {
    label: "Field promotion",
    helper: "A field worker carries out the work; a vehicle is optional.",
    requirements: { executionMode: "driver_app", driverRequired: true, vehicleRequired: false, speakerRequired: false, areasRequired: true, photoProofRequired: true, customerUpdatesRequired: true }
  },
  print_placement: { label: "Print or placement", helper: "Printed material or advertisement placement managed by the team.", requirements: { ...adminManagedDefaults, areasRequired: true } },
  digital_media: { label: "Digital or media work", helper: "Advertisement work managed without field tracking.", requirements: { ...adminManagedDefaults } },
  event_campaign: { label: "Event or campaign support", helper: "Flexible campaign work; adjust requirements if needed.", requirements: { ...adminManagedDefaults, areasRequired: true } },
  custom: { label: "Custom work", helper: "Use for any other advertisement work and set only what is needed.", requirements: { ...adminManagedDefaults } }
};

export function getDeliveryMethodRequirements(method: DeliveryMethod): AdWorkRequirements {
  return { ...deliveryMethodTemplates[method].requirements };
}

export type AdWorkNextAction = "complete_setup" | "choose_resources" | "send_to_driver" | "start_work" | "monitor_work" | "review_proof" | "finish_work" | "finished";
export type AdWorkProgressPhase = "prepare" | "do_work" | "finish";

export interface AdWorkWorkflowState {
  title?: string | null;
  startDate?: string | null;
  areasToCover?: string | null;
  deliveryMethod?: DeliveryMethod | null;
  requirements: AdWorkRequirements;
  assignmentReady: boolean;
  releaseStatus?: string | null;
  dayStatuses: readonly string[];
  pendingProofCount: number;
  closureStatus?: string | null;
}

export interface DerivedAdWorkAction { action: AdWorkNextAction; phase: AdWorkProgressPhase; label: string; helper: string }

const actionCopy: Record<AdWorkNextAction, Omit<DerivedAdWorkAction, "action">> = {
  complete_setup: { phase: "prepare", label: "Complete work setup", helper: "Confirm how, when, and where this work will be done." },
  choose_resources: { phase: "prepare", label: "Choose people and equipment", helper: "Select only the resources required for this work." },
  send_to_driver: { phase: "prepare", label: "Send to driver", helper: "Create the Work Code and make the job available in the driver app." },
  start_work: { phase: "do_work", label: "Start work", helper: "Start this team-managed advertisement work." },
  monitor_work: { phase: "do_work", label: "View work progress", helper: "Check today's activity, issues, and evidence." },
  review_proof: { phase: "finish", label: "Review proof", helper: "Review the submitted evidence before finishing the work." },
  finish_work: { phase: "finish", label: "Finish work", helper: "Check the customer summary and close the work." },
  finished: { phase: "finish", label: "Work finished", helper: "This advertisement work is closed." }
};

export function deriveAdWorkNextAction(input: AdWorkWorkflowState): DerivedAdWorkAction {
  if (["closed", "closed_with_issues", "cancelled"].includes(input.closureStatus ?? "")) return { action: "finished", ...actionCopy.finished };
  const setupComplete = Boolean(input.deliveryMethod && input.title?.trim() && input.startDate && (!input.requirements.areasRequired || input.areasToCover?.trim()));
  if (!setupComplete) return { action: "complete_setup", ...actionCopy.complete_setup };
  if (input.requirements.driverRequired && !input.assignmentReady) return { action: "choose_resources", ...actionCopy.choose_resources };
  if (input.requirements.executionMode === "driver_app" && input.releaseStatus !== "released_to_driver") return { action: "send_to_driver", ...actionCopy.send_to_driver };
  const hasStarted = input.dayStatuses.some((status) => ["running", "on_break", "completed", "issue_reported"].includes(status));
  const allCompleted = input.dayStatuses.length > 0 && input.dayStatuses.every((status) => status === "completed");
  if (!hasStarted && input.requirements.executionMode === "admin_managed") return { action: "start_work", ...actionCopy.start_work };
  if (!allCompleted) return { action: "monitor_work", ...actionCopy.monitor_work };
  if (input.requirements.photoProofRequired && input.pendingProofCount > 0) return { action: "review_proof", ...actionCopy.review_proof };
  return { action: "finish_work", ...actionCopy.finish_work };
}
