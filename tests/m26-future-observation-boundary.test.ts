import { describe, expect, it } from "vitest";
import {
  M26_READINESS_CONTRACT_VERSION_V1,
  validatePhysicalEvidenceManifestV1,
} from "@kootha/shared";

const capabilities = { sequenceSupported: true, reconnectSupported: false } as const;

function physicalManifest(startedAt: string, endedAt: string) {
  return {
    contractVersion: M26_READINESS_CONTRACT_VERSION_V1,
    classification: "physical" as const,
    physicalEvidence: true,
    repository: { headSha: "a".repeat(40), workflowRunId: "run-31" },
    adapter: { manifestId: "manifest-1", adapterId: "selected-adapter", adapterVersion: "1.0.0" },
    device: { identityHash: "b".repeat(64), installationReceiptId: "install-1", vehicleLinkReceiptId: "link-1" },
    network: { configurationClass: "approved-class", validationReceiptId: "network-1" },
    observation: { startedAt, endedAt, telemetryCount: 1 },
    outcomes: {
      authentication: "passed" as const,
      replay: "passed" as const,
      sequence: "passed" as const,
      reconnect: "not_supported" as const,
      freshness: "passed" as const,
      health: "passed" as const,
    },
    disposition: "pass" as const,
    reasonCodes: [],
    operatorIdHash: "c".repeat(64),
    receiptId: "receipt-1",
    recordedAt: new Date().toISOString(),
  };
}

describe("M26 future observation boundary", () => {
  it("rejects a short future-dated observation window to match database authority", () => {
    const now = Date.now();
    const manifest = physicalManifest(
      new Date(now - 60_000).toISOString(),
      new Date(now + 60_000).toISOString(),
    );

    expect(validatePhysicalEvidenceManifestV1(manifest, capabilities).ok).toBe(false);
  });

  it("continues to accept an otherwise identical completed observation window", () => {
    const now = Date.now();
    const manifest = physicalManifest(
      new Date(now - 120_000).toISOString(),
      new Date(now - 60_000).toISOString(),
    );

    expect(validatePhysicalEvidenceManifestV1(manifest, capabilities).ok).toBe(true);
  });
});
