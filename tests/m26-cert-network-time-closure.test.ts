import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
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
    adapter: {
      manifestId: "11111111-1111-4111-8111-111111111111",
      adapterId: "selected-adapter",
      adapterVersion: "1.0.0",
    },
    device: {
      identityHash: "b".repeat(64),
      installationReceiptId: "22222222-2222-4222-8222-222222222222",
      vehicleLinkReceiptId: "33333333-3333-4333-8333-333333333333",
    },
    network: {
      configurationClass: "approved-class",
      validationReceiptId: "44444444-4444-4444-8444-444444444444",
    },
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
    receiptId: "55555555-5555-4555-8555-555555555555",
    recordedAt: new Date().toISOString(),
  };
}

describe("M26 strict timestamp parity", () => {
  it("rejects a normalized nonexistent calendar date", () => {
    const manifest = physicalManifest(
      "2026-02-30T10:00:00Z",
      "2026-03-02T10:01:00Z",
    );
    expect(validatePhysicalEvidenceManifestV1(manifest, capabilities).ok).toBe(false);
  });

  it("accepts an otherwise valid completed RFC3339 window", () => {
    const now = Date.now();
    const manifest = physicalManifest(
      new Date(now - 120_000).toISOString(),
      new Date(now - 60_000).toISOString(),
    );
    expect(validatePhysicalEvidenceManifestV1(manifest, capabilities).ok).toBe(true);
  });

  it("matches PostgreSQL numeric timezone offset bounds", () => {
    const accepted = physicalManifest(
      "2026-08-14T00:00:00+15:59",
      "2026-08-14T00:01:00+15:59",
    );
    const rejected = physicalManifest(
      "2026-08-14T00:00:00+16:00",
      "2026-08-14T00:01:00+16:00",
    );
    expect(validatePhysicalEvidenceManifestV1(accepted, capabilities).ok).toBe(true);
    expect(validatePhysicalEvidenceManifestV1(rejected, capabilities).ok).toBe(false);
  });
});

describe("M26 certification and network lock convergence", () => {
  const migration = readFileSync(
    "supabase/migrations/20260814060000_m26_certification_network_authority_closure.sql",
    "utf8",
  );

  it("serializes all certification selectors under the readiness repository lock", () => {
    for (const token of [
      "m24f_manifest_m26_repository_serialize",
      "m24f_candidate_m26_repository_serialize",
      "m24f_run_m26_repository_serialize",
      "m24f_scenario_m26_repository_serialize",
      "m24f_decision_m26_repository_serialize",
      "pg_try_advisory_xact_lock(hashtext('m26_repository_authority'))",
    ]) expect(migration).toContain(token);
  });

  it("revalidates new network receipts under device then repository authority", () => {
    const device = migration.indexOf("m26_lock_device_authority_v1(new.gps_device_id)");
    const repository = migration.indexOf("pg_advisory_xact_lock(hashtext('m26_repository_authority'))", device);
    expect(device).toBeGreaterThan(-1);
    expect(repository).toBeGreaterThan(device);
    expect(migration).toContain("m26_current_certification_run_v1(");
    expect(migration).toContain("Network validation authority changed; retry transaction");
  });
});
