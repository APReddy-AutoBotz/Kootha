import type { ValidationResultV1 } from "./validation";

export const M24F_ADAPTER_CONTRACT_VERSION_V1 = "m24f-adapter-v1" as const;
export type M24fAdapterContractVersionV1 =
  typeof M24F_ADAPTER_CONTRACT_VERSION_V1;

export const m24fAdapterTransportTypesV1 = [
  "vendor_webhook",
  "vendor_polling",
  "direct_http",
  "mqtt",
  "tcp",
  "udp",
] as const;
export type AdapterTransportTypeV1 =
  (typeof m24fAdapterTransportTypesV1)[number];

export const m24fAdapterAuthenticationTypesV1 = [
  "bearer",
  "hmac_signature",
  "api_key",
  "mutual_tls",
  "protocol_native",
] as const;
export type AdapterAuthenticationTypeV1 =
  (typeof m24fAdapterAuthenticationTypesV1)[number];

export const m24fCertificationStatesV1 = [
  "not_started",
  "in_progress",
  "passed",
  "failed",
  "expired",
] as const;
export type AdapterCertificationStateV1 =
  (typeof m24fCertificationStatesV1)[number];

export const m24fEvidenceLevelsV1 = [
  "none",
  "manifest_only",
  "synthetic_conformance",
  "sandbox_conformance",
  "physical_pilot",
] as const;
export type AdapterEvidenceLevelV1 = (typeof m24fEvidenceLevelsV1)[number];

export const m24fSyntheticStatesV1 = [
  "synthetic_only",
  "sandbox_only",
  "non_synthetic_evidence",
  "mixed_evidence",
] as const;
export type AdapterSyntheticStateV1 = (typeof m24fSyntheticStatesV1)[number];

export const m24fAdapterCertificationLevelsV1 = [
  "manifest_only",
  "synthetic_conformance",
  "sandbox_conformance",
  "physical_pilot",
  "production_authorized",
] as const;
export type AdapterCertificationLevelV1 =
  (typeof m24fAdapterCertificationLevelsV1)[number];

export interface AdapterAuthenticationCapabilityV1 {
  readonly type: AdapterAuthenticationTypeV1;
  readonly keyIdAvailable: boolean;
  readonly rotationSupported: boolean;
  readonly revocationSupported: boolean;
  readonly signatureTimestampSupported: boolean;
  readonly serverOnlySecretRequired: boolean;
}

export interface AdapterTransportCapabilityV1 {
  readonly type: AdapterTransportTypeV1;
  readonly webhookOrPollingDirection: "inbound" | "outbound" | "bidirectional";
  readonly batchingSupported: boolean;
  readonly documentedPayloadSizeBytes: number;
  readonly documentedEventsPerMinute: number;
}

export interface AdapterTimestampCapabilityV1 {
  readonly deviceTimestampAvailable: boolean;
  readonly timestampAuthority: "device" | "vendor_cloud" | "server_receipt";
  readonly timezone: "utc" | "offset" | "unknown";
  readonly futureSkewSeconds: number;
  readonly delayedBackfillSeconds: number;
}

export interface AdapterReplayCapabilityV1 {
  readonly stableEventIdAvailable: boolean;
  readonly sequenceAvailable: boolean;
  readonly streamOrBootEpochAvailable: boolean;
  readonly offlineBufferingSupported: boolean;
  readonly acknowledgementSemantics: "per_event" | "per_batch" | "none";
  readonly retrySemantics: "same_event_id" | "new_event_id" | "undocumented";
}

export interface AdapterHealthCapabilityV1 {
  readonly heartbeatSupported: boolean;
  readonly batterySupported: boolean;
  readonly externalPowerSupported: boolean;
  readonly gpsFixSupported: boolean;
  readonly gsmSignalSupported: boolean;
  readonly firmwareVersionSupported: boolean;
}

export interface AdapterSensorCapabilityV1 {
  readonly locationSupported: boolean;
  readonly approvedMetrics: readonly (
    | "fuel_level"
    | "temperature"
    | "door_state"
    | "vibration"
    | "external_power"
    | "ignition"
    | "tamper"
  )[];
}

export interface AdapterCapabilityManifestV1 {
  readonly contractVersion: M24fAdapterContractVersionV1;
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly vendorDeviceFamilyLabel: string;
  readonly transport: AdapterTransportCapabilityV1;
  readonly authentication: AdapterAuthenticationCapabilityV1;
  readonly timestamp: AdapterTimestampCapabilityV1;
  readonly replay: AdapterReplayCapabilityV1;
  readonly health: AdapterHealthCapabilityV1;
  readonly sensor: AdapterSensorCapabilityV1;
  readonly secretStorageRequirement:
    | "server_secret_store"
    | "mutual_tls_store"
    | "none"
    | "not_documented";
  readonly sandboxAvailability: "available" | "unavailable" | "unknown";
  readonly dataResidencyNote: string;
  readonly supportEscalationNote: string;
  readonly certificationState: AdapterCertificationStateV1;
  readonly certificationLevel: AdapterCertificationLevelV1;
  readonly evidenceLevel: AdapterEvidenceLevelV1;
  readonly syntheticState: AdapterSyntheticStateV1;
  readonly createdAt: string;
}

export const m24fAdapterCandidateStatusesV1 = [
  "not_assessed",
  "candidate",
  "technically_compatible",
  "technically_blocked",
  "awaiting_commercial_review",
  "awaiting_compliance_review",
  "approved_by_ap",
  "rejected",
  "retired",
] as const;
export type AdapterCandidateStatusV1 =
  (typeof m24fAdapterCandidateStatusesV1)[number];

export const m24fCostEvidenceStatusesV1 = [
  "unverified_assumption",
  "indicative_range",
  "confirmed_quote",
  "approved_commitment",
] as const;
export type AdapterCostEvidenceStatusV1 =
  (typeof m24fCostEvidenceStatusesV1)[number];

export const m24fAssessmentStatusesV1 = [
  "not_assessed",
  "documented",
  "missing",
  "verified_sandbox",
  "verified_non_synthetic",
] as const;
export type AdapterAssessmentStatusV1 = (typeof m24fAssessmentStatusesV1)[number];

export interface AdapterCandidateV1 {
  readonly contractVersion: M24fAdapterContractVersionV1;
  readonly candidateId: string;
  readonly safeDisplayName: string;
  readonly deviceFamily: string;
  readonly transportType: AdapterTransportTypeV1;
  readonly authenticationType: AdapterAuthenticationTypeV1;
  readonly hostingExpectation: "vendor_cloud" | "kootha_gateway" | "hybrid" | "unknown";
  readonly simNetworkRequirement: "required" | "not_required" | "unknown";
  readonly installationRequirement: "wired" | "obd" | "portable" | "certified_fitment" | "unknown";
  readonly offlineBuffering: "supported" | "unsupported" | "unknown";
  readonly eventIdentityCapability: "stable_event_id" | "sequence_only" | "neither" | "unknown";
  readonly vendorSandboxStatus: AdapterAssessmentStatusV1;
  readonly documentationStatus: AdapterAssessmentStatusV1;
  readonly dataResidencyStatus: AdapterAssessmentStatusV1;
  readonly commercialStatus: AdapterAssessmentStatusV1;
  readonly costEvidenceStatus: AdapterCostEvidenceStatusV1;
  readonly complianceEvidenceStatus: AdapterAssessmentStatusV1;
  readonly certificationStatus: AdapterCertificationStateV1;
  readonly decisionStatus: AdapterCandidateStatusV1;
  readonly blockingReason: string | null;
  readonly safeNotes: string | null;
  readonly manifestId: string | null;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedBy: string | null;
  readonly updatedAt: string;
}

export const m24fCertificationScenarioCategoriesV1 = [
  "authentication",
  "parsing",
  "normalization",
  "replay_and_sequence",
  "work_and_privacy",
  "safe_output",
] as const;
export type AdapterCertificationScenarioCategoryV1 =
  (typeof m24fCertificationScenarioCategoriesV1)[number];

export interface AdapterCertificationScenarioV1 {
  readonly contractVersion: M24fAdapterContractVersionV1;
  readonly scenarioId: string;
  readonly category: AdapterCertificationScenarioCategoryV1;
  readonly description: string;
  readonly passed: boolean;
  readonly reasonCode: string;
  readonly synthetic: true;
  readonly checkedAt: string;
}

export interface AdapterCertificationResultV1 {
  readonly contractVersion: M24fAdapterContractVersionV1;
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly certificationLevel: AdapterCertificationLevelV1;
  readonly certificationState: AdapterCertificationStateV1;
  readonly synthetic: true;
  readonly scenarioCount: number;
  readonly passedCount: number;
  readonly failedCount: number;
  readonly scenarios: readonly AdapterCertificationScenarioV1[];
  readonly safeSummary: string;
  readonly generatedAt: string;
}

const boundedEnum = <T extends readonly string[]>(
  value: unknown,
  values: T,
): value is T[number] => typeof value === "string" && values.includes(value);

/**
 * Runtime validation for manifests coming from admin persistence. It is
 * intentionally strict so a future adapter cannot smuggle an unbounded JSON
 * capability bag through the stable contract.
 */
export function validateAdapterCapabilityManifestV1(
  value: unknown,
): ValidationResultV1<AdapterCapabilityManifestV1> {
  const issues: Array<{ path: string; code: "invalid_type" | "invalid_value" | "unsupported" }> = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, issues: [{ path: "$", code: "invalid_type" }] };
  }
  const record = value as Record<string, unknown>;
  const textFields = [
    ["adapterId", 64],
    ["adapterVersion", 32],
    ["vendorDeviceFamilyLabel", 160],
    ["dataResidencyNote", 500],
    ["supportEscalationNote", 500],
    ["createdAt", 40],
  ] as const;
  for (const [field, maximum] of textFields) {
    if (typeof record[field] !== "string" || (record[field] as string).trim().length === 0 || (record[field] as string).length > maximum) {
      issues.push({ path: `$.${field}`, code: "invalid_value" });
    }
  }
  if (record.contractVersion !== M24F_ADAPTER_CONTRACT_VERSION_V1) {
    issues.push({ path: "$.contractVersion", code: "unsupported" });
  }
  if (!boundedEnum(record.certificationState, m24fCertificationStatesV1)) {
    issues.push({ path: "$.certificationState", code: "unsupported" });
  }
  if (!boundedEnum(record.certificationLevel, m24fAdapterCertificationLevelsV1)) {
    issues.push({ path: "$.certificationLevel", code: "unsupported" });
  }
  if (!boundedEnum(record.evidenceLevel, m24fEvidenceLevelsV1)) {
    issues.push({ path: "$.evidenceLevel", code: "unsupported" });
  }
  if (!boundedEnum(record.syntheticState, m24fSyntheticStatesV1)) {
    issues.push({ path: "$.syntheticState", code: "unsupported" });
  }
  const transport = record.transport as Record<string, unknown> | undefined;
  const authentication = record.authentication as Record<string, unknown> | undefined;
  const timestamp = record.timestamp as Record<string, unknown> | undefined;
  const replay = record.replay as Record<string, unknown> | undefined;
  const health = record.health as Record<string, unknown> | undefined;
  const sensor = record.sensor as Record<string, unknown> | undefined;
  for (const [name, nested] of [["transport", transport], ["authentication", authentication], ["timestamp", timestamp], ["replay", replay], ["health", health], ["sensor", sensor]] as const) {
    if (nested === undefined || nested === null || Array.isArray(nested)) {
      issues.push({ path: `$.${name}`, code: "invalid_type" });
    }
  }
  if (transport && !boundedEnum(transport.type, m24fAdapterTransportTypesV1)) issues.push({ path: "$.transport.type", code: "unsupported" });
  if (authentication && !boundedEnum(authentication.type, m24fAdapterAuthenticationTypesV1)) issues.push({ path: "$.authentication.type", code: "unsupported" });
  if (sensor && (!Array.isArray(sensor.approvedMetrics) || sensor.approvedMetrics.length > 16)) issues.push({ path: "$.sensor.approvedMetrics", code: "invalid_value" });
  if (typeof record.secretStorageRequirement !== "string" || record.secretStorageRequirement.length > 32) issues.push({ path: "$.secretStorageRequirement", code: "invalid_value" });
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: value as AdapterCapabilityManifestV1 };
}

export function isApApprovedAdapterCandidateV1(
  candidate: Pick<AdapterCandidateV1, "decisionStatus">,
): boolean {
  return candidate.decisionStatus === "approved_by_ap";
}
