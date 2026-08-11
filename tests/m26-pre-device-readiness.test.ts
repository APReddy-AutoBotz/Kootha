import { describe, expect, it } from "vitest";
import { M26_READINESS_CONTRACT_VERSION_V1, physicalPilotReadinessStagesV1, validatePhysicalEvidenceManifestV1 } from "@kootha/shared";

const physicalManifest = () => ({
  contractVersion: M26_READINESS_CONTRACT_VERSION_V1, classification: "physical" as const, physicalEvidence: true,
  repository: { headSha: "a".repeat(64), workflowRunId: "run-31" },
  adapter: { manifestId: "manifest-1", adapterId: "selected-adapter", adapterVersion: "1.0.0" },
  device: { identityHash: "b".repeat(64), installationReceiptId: "install-1", vehicleLinkReceiptId: "link-1" },
  network: { configurationClass: "approved-class", validationReceiptId: "network-1" },
  observation: { startedAt: "2026-08-11T10:00:00Z", endedAt: "2026-08-11T10:30:00Z", telemetryCount: 30 },
  outcomes: { authentication: "passed" as const, replay: "passed" as const, sequence: "passed" as const, reconnect: "not_supported" as const, freshness: "passed" as const, health: "passed" as const },
  disposition: "pass" as const, reasonCodes: [], operatorIdHash: "c".repeat(64), receiptId: "receipt-1", recordedAt: "2026-08-11T10:31:00Z",
});

describe("M26 pre-device readiness", () => {
  it("exposes every stable server readiness stage", () => expect(physicalPilotReadinessStagesV1).toHaveLength(9));
  it("accepts an exact-bound physical evidence receipt", () => expect(validatePhysicalEvidenceManifestV1(physicalManifest()).ok).toBe(true));
  it("structurally rejects synthetic evidence claiming to be physical", () => expect(validatePhysicalEvidenceManifestV1({ ...physicalManifest(), classification: "synthetic" }).ok).toBe(false));
  it("rejects changed or missing repository and adapter bindings", () => {
    expect(validatePhysicalEvidenceManifestV1({ ...physicalManifest(), repository: { headSha: "changed", workflowRunId: "run-31" } }).ok).toBe(false);
    expect(validatePhysicalEvidenceManifestV1({ ...physicalManifest(), adapter: { manifestId: "", adapterId: "selected-adapter", adapterVersion: "1" } }).ok).toBe(false);
  });
  it("rejects failed replay, empty telemetry, invalid windows and partial physical claims", () => {
    const base = physicalManifest();
    expect(validatePhysicalEvidenceManifestV1({ ...base, outcomes: { ...base.outcomes, replay: "failed" } }).ok).toBe(false);
    expect(validatePhysicalEvidenceManifestV1({ ...base, observation: { ...base.observation, telemetryCount: 0 } }).ok).toBe(false);
    expect(validatePhysicalEvidenceManifestV1({ ...base, disposition: "partial" }).ok).toBe(false);
  });
});

