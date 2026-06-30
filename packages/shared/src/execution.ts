import type { PackageInterest } from "./enquiry";
import type {
  AdWorkAssignmentStatus,
  AdWorkExecutionDayStatus,
  ExecutionProofNoteType,
  ExecutionReleaseStatus
} from "./statuses";

export type DriverExecutionAction = "start" | "take_break" | "resume" | "end" | "issue" | "add_proof_note";

export interface ExecutionReleaseReadinessInput {
  assignmentStatus: AdWorkAssignmentStatus;
  releaseStatus?: ExecutionReleaseStatus | null;
  startDate?: string | null;
  areasToCover?: string | null;
  packageInterest: PackageInterest;
  driverAssigned: boolean;
  vehicleAssigned: boolean;
}

export interface ExecutionReadinessCheck {
  label: string;
  passed: boolean;
}

export interface ExecutionReleaseReadiness {
  ready: boolean;
  checks: ExecutionReadinessCheck[];
}

function hasText(value: string | null | undefined): boolean {
  return Boolean((value ?? "").trim());
}

export function buildExecutionReleaseReadiness(input: ExecutionReleaseReadinessInput): ExecutionReleaseReadiness {
  const checks = [
    {
      label: "Ready for Execution",
      passed: input.assignmentStatus === "ready_for_execution"
    },
    {
      label: "Approved driver assigned",
      passed: input.driverAssigned
    },
    {
      label: "Approved vehicle assigned",
      passed: input.vehicleAssigned
    },
    {
      label: "Planned dates",
      passed: hasText(input.startDate)
    },
    {
      label: "Areas to cover",
      passed: hasText(input.areasToCover)
    },
    {
      label: "Package selected",
      passed: input.packageInterest !== "not_sure"
    }
  ];

  return {
    checks,
    ready: checks.every((check) => check.passed)
  };
}

export function canReleaseAdWork(input: ExecutionReleaseReadinessInput): boolean {
  return buildExecutionReleaseReadiness(input).ready && input.releaseStatus !== "access_revoked";
}

export function canStartWork(status: AdWorkExecutionDayStatus): boolean {
  return status === "planned" || status === "ready";
}

export function canTakeBreak(status: AdWorkExecutionDayStatus): boolean {
  return status === "running";
}

export function canResumeWork(status: AdWorkExecutionDayStatus): boolean {
  return status === "on_break";
}

export function canEndWork(status: AdWorkExecutionDayStatus): boolean {
  return status === "running" || status === "on_break";
}

export function canAddProofNote(status: AdWorkExecutionDayStatus): boolean {
  return status !== "cancelled";
}

export function validateDriverExecutionAction(
  status: AdWorkExecutionDayStatus,
  action: DriverExecutionAction,
  note: string
): string[] {
  const errors: string[] = [];
  const trimmedNote = note.trim();

  if (action === "start" && !canStartWork(status)) {
    errors.push("Work can start only when it is Planned or Ready.");
  }

  if (action === "take_break" && !canTakeBreak(status)) {
    errors.push("Break can be taken only when work is Running.");
  }

  if (action === "resume" && !canResumeWork(status)) {
    errors.push("Work can resume only when it is On Break.");
  }

  if (action === "end") {
    if (!canEndWork(status)) {
      errors.push("Work can end only when it is Running or On Break.");
    }

    if (!trimmedNote) {
      errors.push("Completion note is required.");
    }
  }

  if (action === "issue" && !trimmedNote) {
    errors.push("Issue note is required.");
  }

  if (action === "add_proof_note" && !trimmedNote) {
    errors.push("Proof note is required.");
  }

  return errors;
}

export function isExecutionProofNoteType(value: string): value is ExecutionProofNoteType {
  return ["area_covered", "announcement_done", "customer_request", "issue", "other"].includes(value);
}
