import type { ValidationResultV1 } from "./validation";

export const M26_READINESS_CONTRACT_VERSION_V1 = "m26-readiness-v1" as const;

export const physicalPilotReadinessStagesV1 = [
  "awaiting_hardware_selection", "awaiting_adapter_implementation", "awaiting_credentials",
  "awaiting_device_registration", "awaiting_installation", "awaiting_network_validation",
  "physical_evidence_required", "ready_for_controlled_physical_pilot", "blocked",
] as const;
export type PhysicalPilotReadinessStageV1 = typeof physicalPilotReadinessStagesV1[number];

export const physicalPilotBlockingReasonsV1 = [
  "hardware_not_selected", "selected_candidate_not_approved", "adapter_not_certified",
  "adapter_manifest_mismatch", "device_not_registered", "device_not_operational",
  "credential_not_active", "vehicle_link_missing", "installation_not_recorded",
  "network_not_validated", "physical_evidence_missing", "physical_evidence_pass",
  "physical_evidence_partial", "physical_evidence_blocked", "synthetic_evidence_non_ready",
  "physical_outcomes_not_passed",
] as const;
export type PhysicalPilotBlockingReasonV1 = typeof physicalPilotBlockingReasonsV1[number];

export interface PhysicalPilotReadinessV1 {
  readonly contractVersion: typeof M26_READINESS_CONTRACT_VERSION_V1;
  readonly deviceId: string | null;
  readonly stage: PhysicalPilotReadinessStageV1;
  readonly blockingReasons: readonly PhysicalPilotBlockingReasonV1[];
  readonly selectedAdapter: { readonly candidateId: string; readonly adapterId: string; readonly adapterVersion: string } | null;
  readonly credentialReady: boolean;
  readonly installationReady: boolean;
  readonly networkReady: boolean;
  readonly physicalEvidence: boolean;
  readonly derivedAt: string;
}

export interface PhysicalEvidenceManifestV1 {
  readonly contractVersion: typeof M26_READINESS_CONTRACT_VERSION_V1;
  readonly classification: "physical" | "synthetic";
  readonly physicalEvidence: boolean;
  readonly repository: { readonly headSha: string; readonly workflowRunId: string };
  readonly adapter: { readonly manifestId: string; readonly adapterId: string; readonly adapterVersion: string };
  readonly device: { readonly identityHash: string; readonly installationReceiptId: string; readonly vehicleLinkReceiptId: string };
  readonly network: { readonly configurationClass: string; readonly validationReceiptId: string };
  readonly observation: { readonly startedAt: string; readonly endedAt: string; readonly telemetryCount: number };
  readonly outcomes: {
    readonly authentication: "passed" | "failed";
    readonly replay: "passed" | "failed";
    readonly sequence: "passed" | "failed" | "not_supported";
    readonly reconnect: "passed" | "failed" | "not_supported";
    readonly freshness: "passed" | "failed";
    readonly health: "passed" | "failed";
  };
  readonly disposition: "pass" | "partial" | "blocked";
  readonly reasonCodes: readonly string[];
  readonly operatorIdHash: string;
  readonly receiptId: string;
  readonly recordedAt: string;
}

const gitObjectId = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const sha256 = /^[a-f0-9]{64}$/;
const bounded = (value: unknown, max = 160): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;
const timestamp = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

const secretAssignment = /(^|[\s\p{P}])(bearer\s+[a-z0-9._~+/=-]{8,}|(api[_ -]?key|access[_ -]?token|refresh[_ -]?token|authorization|credential|password|secret)\s*[:=]\s*[^\s]{4,})/iu;
const endpoint = /(https?|mqtts?|wss?):\/\/|([a-z0-9-]+\.)+[a-z]{2,}([/:][^\s]*)?/iu;
const standaloneCredentialToken = /(^|[^A-Za-z0-9_+/=-])[A-Za-z0-9_+/=-]{24,}([^A-Za-z0-9_+/=-]|$)/;
const coordinates = /(^|[^0-9])[-+]?[0-9]{1,3}\.[0-9]{4,}\s*[,/]\s*[-+]?[0-9]{1,3}\.[0-9]{4,}([^0-9]|$)/iu;
const rawPayload = /(^|\s)(raw[_ -]?payload|payload[_ -]?(fragment|body|contents?|data))(\s|:|=|$)/iu;

/** Mirrors the canonical m24f_is_safe_metadata privacy boundary for shared clients. */
export function isSafeMetadataV1(value: unknown): value is string {
  return typeof value === "string" && !/[{}\[\]]/.test(value) && !secretAssignment.test(value)
    && !endpoint.test(value) && !standaloneCredentialToken.test(value)
    && !coordinates.test(value) && !rawPayload.test(value);
}

/** Fail-closed validation. Synthetic fixtures can never assert physical evidence. */
export interface PhysicalEvidenceCapabilitiesV1 {
  readonly sequenceSupported: boolean;
  readonly reconnectSupported: boolean;
}

export function validatePhysicalEvidenceManifestV1(
  value: unknown,
  capabilities?: PhysicalEvidenceCapabilitiesV1,
): ValidationResultV1<PhysicalEvidenceManifestV1> {
  const issues: Array<{ path: string; code: "invalid_type" | "invalid_value" | "unsupported" }> = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, issues: [{ path: "$", code: "invalid_type" }] };
  const v = value as Partial<PhysicalEvidenceManifestV1>;
  if (v.contractVersion !== M26_READINESS_CONTRACT_VERSION_V1) issues.push({ path: "contractVersion", code: "unsupported" });
  if (!(["physical", "synthetic"] as const).includes(v.classification as never)) issues.push({ path: "classification", code: "invalid_value" });
  if (typeof v.physicalEvidence !== "boolean" || v.physicalEvidence !== (v.classification === "physical")) issues.push({ path: "physicalEvidence", code: "invalid_value" });
  if (!v.repository || !gitObjectId.test(v.repository.headSha) || !bounded(v.repository.workflowRunId)) issues.push({ path: "repository", code: "invalid_value" });
  if (!v.adapter || !bounded(v.adapter.manifestId) || !bounded(v.adapter.adapterId) || !bounded(v.adapter.adapterVersion)) issues.push({ path: "adapter", code: "invalid_value" });
  if (!v.device || !sha256.test(v.device.identityHash) || !bounded(v.device.installationReceiptId) || !bounded(v.device.vehicleLinkReceiptId)) issues.push({ path: "device", code: "invalid_value" });
  if (!v.network || !bounded(v.network.configurationClass) || !bounded(v.network.validationReceiptId)) issues.push({ path: "network", code: "invalid_value" });
  if (!v.observation || !timestamp(v.observation.startedAt) || !timestamp(v.observation.endedAt) || Date.parse(v.observation.endedAt) <= Date.parse(v.observation.startedAt) || Date.parse(v.observation.endedAt) - Date.parse(v.observation.startedAt) > 86_400_000 || !Number.isSafeInteger(v.observation.telemetryCount) || v.observation.telemetryCount < 1 || v.observation.telemetryCount > 10_000_000) issues.push({ path: "observation", code: "invalid_value" });
  const binaryOutcome = (outcome: unknown) => outcome === "passed" || outcome === "failed";
  const capabilityOutcome = (outcome: unknown, supported: boolean | undefined) =>
    outcome === "passed" || outcome === "failed" || (outcome === "not_supported" && supported === false);
  if (!v.outcomes || !binaryOutcome(v.outcomes.authentication) || !binaryOutcome(v.outcomes.replay)
    || !capabilityOutcome(v.outcomes.sequence, capabilities?.sequenceSupported)
    || !capabilityOutcome(v.outcomes.reconnect, capabilities?.reconnectSupported)
    || !binaryOutcome(v.outcomes.freshness) || !binaryOutcome(v.outcomes.health)) issues.push({ path: "outcomes", code: "invalid_value" });
  if (!(["pass", "partial", "blocked"] as const).includes(v.disposition as never)) issues.push({ path: "disposition", code: "invalid_value" });
  if (!Array.isArray(v.reasonCodes) || v.reasonCodes.length > 20
    || v.reasonCodes.some((reason) => !bounded(reason, 80) || !isSafeMetadataV1(reason))
    || !sha256.test(v.operatorIdHash ?? "") || !bounded(v.receiptId) || !timestamp(v.recordedAt)) issues.push({ path: "receipt", code: "invalid_value" });
  return issues.length ? { ok: false, issues } : { ok: true, value: v as PhysicalEvidenceManifestV1 };
}
