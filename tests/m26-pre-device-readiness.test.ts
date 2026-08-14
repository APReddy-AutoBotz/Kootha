import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  M26_READINESS_CONTRACT_VERSION_V1,
  physicalPilotReadinessStagesV1,
  validatePhysicalEvidenceManifestV1,
} from "@kootha/shared";

const physicalManifest = () => ({
  contractVersion: M26_READINESS_CONTRACT_VERSION_V1,
  classification: "physical" as const,
  physicalEvidence: true,
  repository: { headSha: "a".repeat(40), workflowRunId: "run-31" },
  adapter: { manifestId: "manifest-1", adapterId: "selected-adapter", adapterVersion: "1.0.0" },
  device: { identityHash: "b".repeat(64), installationReceiptId: "install-1", vehicleLinkReceiptId: "link-1" },
  network: { configurationClass: "approved-class", validationReceiptId: "network-1" },
  observation: { startedAt: "2026-08-11T10:00:00Z", endedAt: "2026-08-11T10:30:00Z", telemetryCount: 30 },
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
  recordedAt: "2026-08-11T10:31:00Z",
});

const capabilities = { sequenceSupported: true, reconnectSupported: false } as const;

describe("M26 shared readiness contract", () => {
  it("exposes every stable server readiness stage", () => {
    expect(physicalPilotReadinessStagesV1).toHaveLength(9);
    expect(physicalPilotReadinessStagesV1).toContain("physical_evidence_required");
    expect(physicalPilotReadinessStagesV1).not.toContain("awaiting_real_telemetry" as never);
  });

  it("accepts an exact-bound physical pass and a normal Git SHA-1", () => {
    expect(validatePhysicalEvidenceManifestV1(physicalManifest(), capabilities).ok).toBe(true);
  });

  it("structurally rejects synthetic evidence claiming physical truth", () => {
    expect(validatePhysicalEvidenceManifestV1({ ...physicalManifest(), classification: "synthetic" }, capabilities).ok).toBe(false);
    expect(validatePhysicalEvidenceManifestV1({ ...physicalManifest(), physicalEvidence: false }, capabilities).ok).toBe(false);
  });

  it("preserves truthful zero-telemetry failed evidence but never a zero-telemetry pass", () => {
    const base = physicalManifest();
    const blocked = {
      ...base,
      observation: { ...base.observation, telemetryCount: 0 },
      outcomes: { ...base.outcomes, authentication: "failed" as const, sequence: "failed" as const },
      disposition: "blocked" as const,
      reasonCodes: ["authentication_failed"],
    };
    expect(validatePhysicalEvidenceManifestV1(blocked, capabilities).ok).toBe(true);
    expect(validatePhysicalEvidenceManifestV1({ ...base, observation: { ...base.observation, telemetryCount: 0 } }, capabilities).ok).toBe(false);
  });

  it("allows failed outcomes only when the receipt is non-pass truth", () => {
    const base = physicalManifest();
    expect(validatePhysicalEvidenceManifestV1({
      ...base,
      outcomes: { ...base.outcomes, replay: "failed" as const },
      disposition: "partial" as const,
    }, capabilities).ok).toBe(true);
    expect(validatePhysicalEvidenceManifestV1({
      ...base,
      outcomes: { ...base.outcomes, replay: "failed" as const },
    }, capabilities).ok).toBe(false);
  });

  it("enforces the final database safe-metadata predicate for evidence reasons", () => {
    const base = physicalManifest();
    const cases = [
      ["ordinary_reason", true],
      ["a".repeat(23), true],
      ["a".repeat(24), true],
      ["f".repeat(32), true],
      ["F".repeat(32), true],
      ["prefix-" + "a".repeat(24), true],
      ["a".repeat(12) + " " + "b".repeat(12), true],
      ["credential=fixture-secret", false],
      ["https://evidence.example/path", false],
      ["evidence.example/path", false],
      ["12.34567, 77.45678", false],
      ["12.34567 77.45678", false],
      ["raw_payload fragment", false],
      ["{\"payload\":true}", false],
      ["Abcdefghijklmnopqrstuvwx12345678", false],
      ["0123456789abcdef0123456789abcdef", true],
      ["aa:bb:cc:dd:ee:ff", false],
      ["490154203237518", false],
      ["adapter_generation_7", true],
      ["serial_number=fixture", false],
      ["safe\u0007control", false],
    ] as const;
    for (const [reason, expected] of cases) {
      expect(validatePhysicalEvidenceManifestV1({ ...base, reasonCodes: [reason] }, capabilities).ok).toBe(expected);
    }
  });

  it("bounds evidence reasons and protects network/repository metadata", () => {
    const base = physicalManifest();
    expect(validatePhysicalEvidenceManifestV1({
      ...base,
      reasonCodes: Array.from({ length: 20 }, (_, index) => `reason_${index}`),
    }, capabilities).ok).toBe(true);
    expect(validatePhysicalEvidenceManifestV1({
      ...base,
      reasonCodes: Array.from({ length: 21 }, (_, index) => `reason_${index}`),
    }, capabilities).ok).toBe(false);
    expect(validatePhysicalEvidenceManifestV1({
      ...base,
      network: { ...base.network, configurationClass: "https://secret.example" },
    }, capabilities).ok).toBe(false);
    expect(validatePhysicalEvidenceManifestV1({
      ...base,
      repository: { ...base.repository, workflowRunId: "token=" + "x".repeat(24) },
    }, capabilities).ok).toBe(false);
  });
});

describe("M26 database authority closure", () => {
  const foundation = readFileSync("supabase/migrations/20260811010000_m26_pre_device_commissioning_readiness.sql", "utf8");
  const telemetryTruth = readFileSync("supabase/migrations/20260812020000_m26_physical_telemetry_truth_convergence.sql", "utf8");
  const closure = readFileSync("supabase/migrations/20260814010000_m26_authority_review_closure.sql", "utf8");
  const acceptance = readFileSync("supabase/tests/m26_commissioning_authority.test.sql", "utf8");

  it("keeps immutable M21 receipt binding and rejected-receipt serialization", () => {
    for (const proof of [
      "create table public.physical_pilot_evidence_telemetry_receipts",
      "not t.synthetic",
      "t.credential_id=p_credential_id",
      "t.gps_device_vehicle_link_id=p_vehicle_link_id",
      "telemetry_receipts_m26_rejected_serialize",
      "m26_serialize_rejected_receipt_authority_v1",
      "m26_has_authoritative_failure_v1",
    ]) expect(telemetryTruth).toContain(proof);
    expect(telemetryTruth).toContain("m26_lock_device_authority_v1(p_device_id)");
  });

  it("records zero telemetry only for non-pass evidence", () => {
    expect(closure).toContain("telemetry_count between 0 and 10000000");
    expect(closure).toContain("disposition <> 'pass' or telemetry_count > 0");
    expect(closure).toContain("p_disposition='pass' and p_telemetry_count=0");
  });

  it("requires every physical pass to be derived from current non-synthetic M21 truth", () => {
    for (const proof of [
      "v_failure_free:=not public.m26_has_authoritative_failure_v1",
      "v_authoritative_telemetry_count is distinct from p_telemetry_count",
      "v_authoritative_telemetry_count=0",
      "p_replay_passed is distinct from true",
      "Physical pass requires authoritative non-synthetic telemetry",
      "physical_pilot_evidence_telemetry_receipts",
    ]) expect(closure).toContain(proof);
  });

  it("makes the latest applicable physical receipt the readiness authority", () => {
    const readiness = closure.slice(closure.indexOf("admin_get_physical_pilot_readiness_v1"));
    expect(readiness).toContain("and e.classification='physical'");
    expect(readiness).toContain("order by e.recorded_at desc,e.id desc");
    expect(readiness).toContain("and e_latest.disposition='pass'");
    expect(readiness).toContain("not public.m26_has_authoritative_failure_v1");
    expect(readiness).not.toMatch(/select exists\([\s\S]*e\.disposition='pass'/);
  });

  it("preserves commissioning configuration across state-only transitions", () => {
    const transition = closure.slice(
      closure.indexOf("admin_transition_physical_pilot_commissioning_v1"),
      closure.indexOf("service_record_physical_pilot_evidence_v1"),
    );
    expect(transition).toContain("v_row.state='draft' and p_new_state='draft'");
    expect(transition).toContain("v_effective_heartbeat:=v_row.expected_heartbeat_seconds");
    expect(transition).toContain("requested_expected_heartbeat_seconds");
    expect(transition).toContain("Transition key request mismatch");
  });

  it("keeps canonical admin/service authority and frozen repository truth", () => {
    expect(foundation).toContain("public.m20a_require_admin()");
    expect(foundation).toContain("create table public.physical_pilot_repository_authority");
    expect(foundation).toContain("repository_authority_generation");
    expect(closure).toContain("coalesce(auth.role(),'')<>'service_role'");
    expect(closure).toContain("e.repository_head_sha is distinct from p_repository_head_sha");
  });

  it("requires the pgTAP suite to execute the real state machine rather than inspect source only", () => {
    for (const call of [
      "admin_transition_physical_pilot_commissioning_v1",
      "service_rotate_physical_pilot_repository_authority_v1",
      "service_record_physical_pilot_network_validation_v1",
      "service_record_physical_pilot_evidence_v1",
      "admin_get_physical_pilot_readiness_v1",
    ]) expect(acceptance).toContain(call);
    expect(acceptance).toContain("zero-telemetry blocked physical evidence is persisted");
    expect(acceptance).toContain("state-only start preserves the draft heartbeat");
  });
});

describe("M26 admin readiness request fencing", () => {
  const admin = readFileSync("apps/web/src/admin.tsx", "utf8");

  it("binds readiness responses to both the latest sequence and selected device", () => {
    expect(admin).toContain("const readinessRequestSequence = useRef(0)");
    expect(admin).toContain("const requestSequence = ++readinessRequestSequence.current");
    expect(admin).toContain("requestSequence === readinessRequestSequence.current && selectedIdRef.current === deviceId");
  });

  it("refreshes readiness after successful registry and commissioning mutations", () => {
    const mutation = admin.slice(admin.indexOf("async function callDeviceRpc"), admin.indexOf("function identityBody"));
    expect(mutation).toContain("await loadRegistry()");
    expect(mutation).toContain("await loadPhysicalReadiness(selectedIdRef.current)");
    expect(mutation).toContain("async function transitionCommissioning");
    expect(mutation).toContain("admin_transition_physical_pilot_commissioning_v1");
  });
});
