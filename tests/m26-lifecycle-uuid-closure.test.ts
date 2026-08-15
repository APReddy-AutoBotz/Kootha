import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { M26_READINESS_CONTRACT_VERSION_V1, validatePhysicalEvidenceManifestV1 } from "@kootha/shared";

const capabilities = { sequenceSupported: true, reconnectSupported: false } as const;
const valid = {
  contractVersion: M26_READINESS_CONTRACT_VERSION_V1,
  classification: "physical" as const,
  physicalEvidence: true,
  repository: { headSha: "a".repeat(40), workflowRunId: "run-31" },
  adapter: { manifestId: "11111111-1111-4111-8111-111111111111", adapterId: "selected-adapter", adapterVersion: "1.0.0" },
  device: { identityHash: "b".repeat(64), installationReceiptId: "22222222-2222-4222-8222-222222222222", vehicleLinkReceiptId: "33333333-3333-4333-8333-333333333333" },
  network: { configurationClass: "approved-class", validationReceiptId: "44444444-4444-4444-8444-444444444444" },
  observation: { startedAt: "2026-08-11T10:00:00Z", endedAt: "2026-08-11T10:30:00Z", telemetryCount: 1 },
  outcomes: { authentication: "passed" as const, replay: "passed" as const, sequence: "passed" as const, reconnect: "not_supported" as const, freshness: "passed" as const, health: "passed" as const },
  disposition: "pass" as const,
  reasonCodes: [],
  operatorIdHash: "c".repeat(64),
  receiptId: "55555555-5555-4555-8555-555555555555",
  recordedAt: "2026-08-11T10:31:00Z",
};

describe("M26 UUID selector parity", () => {
  it("accepts canonical UUID selectors and rejects non-UUID evidence selectors before RPC invocation", () => {
    expect(validatePhysicalEvidenceManifestV1(valid, capabilities).ok).toBe(true);
    expect(validatePhysicalEvidenceManifestV1({ ...valid, adapter: { ...valid.adapter, manifestId: "x" } }, capabilities).ok).toBe(false);
    expect(validatePhysicalEvidenceManifestV1({ ...valid, device: { ...valid.device, installationReceiptId: "x" } }, capabilities).ok).toBe(false);
    expect(validatePhysicalEvidenceManifestV1({ ...valid, device: { ...valid.device, vehicleLinkReceiptId: "x" } }, capabilities).ok).toBe(false);
    expect(validatePhysicalEvidenceManifestV1({ ...valid, network: { ...valid.network, validationReceiptId: "x" } }, capabilities).ok).toBe(false);
    expect(validatePhysicalEvidenceManifestV1({ ...valid, receiptId: "x" }, capabilities).ok).toBe(false);
  });
});

describe("M26 lifecycle authority serialization", () => {
  const migration = readFileSync('supabase/migrations/20260814050000_m26_lifecycle_authority_serialization.sql', 'utf8');
  it("serializes all four current lifecycle authority tables with a fail-fast shared device lock", () => {
    expect(migration).toContain('pg_try_advisory_xact_lock(hashtextextended(p_device_id::text, 0))');
    expect(migration).toContain("errcode='40001'");
    for (const trigger of [
      'gps_devices_m26_authority_serialize',
      'gps_device_vehicle_links_m26_authority_serialize',
      'gps_device_lifecycle_events_m26_authority_serialize',
      'gps_device_credential_metadata_m26_authority_serialize',
    ]) expect(migration).toContain(trigger);
  });
});
