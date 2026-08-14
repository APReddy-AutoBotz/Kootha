import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { M26_READINESS_CONTRACT_VERSION_V1, physicalPilotReadinessStagesV1, validatePhysicalEvidenceManifestV1 } from "@kootha/shared";

const physicalManifest = () => ({
  contractVersion: M26_READINESS_CONTRACT_VERSION_V1, classification: "physical" as const, physicalEvidence: true,
  repository: { headSha: "a".repeat(40), workflowRunId: "run-31" },
  adapter: { manifestId: "manifest-1", adapterId: "selected-adapter", adapterVersion: "1.0.0" },
  device: { identityHash: "b".repeat(64), installationReceiptId: "install-1", vehicleLinkReceiptId: "link-1" },
  network: { configurationClass: "approved-class", validationReceiptId: "network-1" },
  observation: { startedAt: "2026-08-11T10:00:00Z", endedAt: "2026-08-11T10:30:00Z", telemetryCount: 30 },
  outcomes: { authentication: "passed" as const, replay: "passed" as const, sequence: "passed" as const, reconnect: "not_supported" as const, freshness: "passed" as const, health: "passed" as const },
  disposition: "pass" as const, reasonCodes: [], operatorIdHash: "c".repeat(64), receiptId: "receipt-1", recordedAt: "2026-08-11T10:31:00Z",
});

describe("M26 pre-device readiness", () => {
  it("exposes every stable server readiness stage", () => {
    expect(physicalPilotReadinessStagesV1).toHaveLength(9);
    expect(physicalPilotReadinessStagesV1).toContain("physical_evidence_required");
    expect(physicalPilotReadinessStagesV1).not.toContain("awaiting_real_telemetry" as never);
  });
  it("accepts an exact-bound physical evidence receipt and a normal Git SHA-1", () => expect(validatePhysicalEvidenceManifestV1(physicalManifest(), { sequenceSupported: true, reconnectSupported: false }).ok).toBe(true));
  it("structurally rejects synthetic evidence claiming to be physical", () => expect(validatePhysicalEvidenceManifestV1({ ...physicalManifest(), classification: "synthetic" }).ok).toBe(false));
  it("rejects physical classification without physical evidence", () => expect(validatePhysicalEvidenceManifestV1({ ...physicalManifest(), physicalEvidence: false }).ok).toBe(false));
  it("rejects changed or missing repository and adapter bindings", () => {
    expect(validatePhysicalEvidenceManifestV1({ ...physicalManifest(), repository: { headSha: "changed", workflowRunId: "run-31" } }).ok).toBe(false);
    expect(validatePhysicalEvidenceManifestV1({ ...physicalManifest(), adapter: { manifestId: "", adapterId: "selected-adapter", adapterVersion: "1" } }).ok).toBe(false);
  });
  it("accepts failed outcomes as truthful non-ready evidence and validates capability claims", () => {
    const base = physicalManifest();
    expect(validatePhysicalEvidenceManifestV1({ ...base, outcomes: { ...base.outcomes, sequence: "failed" }, disposition: "blocked" }, { sequenceSupported: true, reconnectSupported: false }).ok).toBe(true);
    expect(validatePhysicalEvidenceManifestV1(base, { sequenceSupported: true, reconnectSupported: true }).ok).toBe(false);
    expect(validatePhysicalEvidenceManifestV1(base, { sequenceSupported: true, reconnectSupported: false }).ok).toBe(true);
  });
  it("preserves partial, blocked, failed, and synthetic evidence while rejecting malformed observations", () => {
    const base = physicalManifest();
    expect(validatePhysicalEvidenceManifestV1({ ...base, outcomes: { ...base.outcomes, replay: "failed" }, disposition: "blocked" }, { sequenceSupported: true, reconnectSupported: false }).ok).toBe(true);
    expect(validatePhysicalEvidenceManifestV1({ ...base, observation: { ...base.observation, telemetryCount: 0 } }).ok).toBe(false);
    expect(validatePhysicalEvidenceManifestV1({ ...base, disposition: "partial" }, { sequenceSupported: true, reconnectSupported: false }).ok).toBe(true);
    expect(validatePhysicalEvidenceManifestV1({ ...base, classification: "synthetic", physicalEvidence: false, disposition: "pass" }, { sequenceSupported: true, reconnectSupported: false }).ok).toBe(true);
  });
  it("matches database count and safe-metadata bounds for evidence reasons", () => {
    const base = physicalManifest();
    expect(validatePhysicalEvidenceManifestV1({ ...base, reasonCodes: Array.from({ length: 20 }, (_, index) => `reason_${index}`) }, { sequenceSupported: true, reconnectSupported: false }).ok).toBe(true);
    expect(validatePhysicalEvidenceManifestV1({ ...base, reasonCodes: Array.from({ length: 21 }, (_, index) => `reason_${index}`) }, { sequenceSupported: true, reconnectSupported: false }).ok).toBe(false);
    const cases = [
      ["ordinary_reason", true], ["a".repeat(23), true], ["a".repeat(24), true], ["f".repeat(32), true], ["F".repeat(32), true],
      ["prefix-" + "a".repeat(24), true], ["a".repeat(12) + " " + "b".repeat(12), true], ["credential=fixture-secret", false],
      ["https://evidence.example/path", false], ["evidence.example/path", false], ["12.34567, 77.45678", false],
      ["12.34567 77.45678", false], ["raw_payload fragment", false], ["{\"payload\":true}", false],
      ["Abcdefghijklmnopqrstuvwx12345678", false], ["0123456789abcdef0123456789abcdef", true],
      ["aa:bb:cc:dd:ee:ff", false], ["490154203237518", false], ["adapter_generation_7", true],
    ] as const;
    for (const [reason, expected] of cases) expect(validatePhysicalEvidenceManifestV1({ ...base, reasonCodes: [reason] }, { sequenceSupported: true, reconnectSupported: false }).ok).toBe(expected);
  });
});

describe("M26 database authority closure", () => {
  const migration = readFileSync("supabase/migrations/20260811010000_m26_pre_device_commissioning_readiness.sql", "utf8");
  const telemetryTruth = readFileSync("supabase/migrations/20260812020000_m26_physical_telemetry_truth_convergence.sql", "utf8");

  it("derives physical acceptance from immutable current non-synthetic M21 receipts", () => {
    for (const proof of ["create table public.physical_pilot_evidence_telemetry_receipts", "not t.synthetic", "t.credential_id=p_credential_id",
      "t.gps_device_vehicle_link_id=p_vehicle_link_id", "v_authoritative_telemetry_count is distinct from p_telemetry_count",
      "m26_is_authoritative_observation_v1(t.received_at,t.captured_at,n.validated_at,p_observation_started_at,p_observation_ended_at)",
      "m26_is_authoritative_observation_v1(t.received_at,t.captured_at,n.validated_at,e.observation_started_at,e.observation_ended_at)",
      "m26_has_authoritative_conflict_v1(p_device_id,p_credential_id,p_vehicle_link_id,m.adapter_id,m.adapter_version,p_observation_started_at,p_observation_ended_at)",
      "p_replay_passed is distinct from v_replay_proven",
      "not public.m26_has_authoritative_conflict_v1(e.gps_device_id,e.credential_id,e.vehicle_link_id,m.adapter_id,m.adapter_version,e.observation_started_at,e.observation_ended_at)",
      "Physical pass requires authoritative non-synthetic telemetry", "e.telemetry_count=(select count(*)"]) expect(telemetryTruth).toContain(proof);
    expect(telemetryTruth).not.toContain("k.last_verified_at>p_observation_ended_at");
    expect(telemetryTruth).toContain("telemetry_identity_conflicts_m26_scope_idx");
    expect(telemetryTruth).toContain("c.last_seen_at>=p_observation_started_at");
    expect(telemetryTruth).toContain("c.first_seen_at<=p_observation_ended_at");
    expect(telemetryTruth).not.toContain("and c.reason_code in ('event_identity_conflict','sequence_replay_invalid')\n    and t.received_at>=p_observation_started_at");
    expect(telemetryTruth).toContain("telemetry_identity_conflicts_m26_serialize");
    expect(telemetryTruth).toContain("m26_lock_device_authority_v1(p_device_id)");
    expect(telemetryTruth).toContain("t.reason_code='sequence_replay_invalid'");
    expect(telemetryTruth).toContain("telemetry_receipts_m26_replay_rejection_serialize");
    expect(telemetryTruth).toContain("m26_serialize_replay_rejection_v1");
    expect(telemetryTruth).toContain("where t.gps_device_id=p_device_id\n    and t.credential_id=p_credential_id\n    and t.adapter_id=p_adapter_id");
    expect(telemetryTruth).toContain("returns jsonb language plpgsql security definer set search_path=pg_catalog,public volatile");
    expect(telemetryTruth).not.toContain("t.credential_id=p_credential_id and t.gps_device_vehicle_link_id=p_vehicle_link_id\n    and t.adapter_id=p_adapter_id and t.adapter_version=p_adapter_version\n    and c.reason_code");
    expect(telemetryTruth).toContain("from service_role");
    for (const table of ["physical_pilot_commissioning", "physical_pilot_commissioning_receipts",
      "physical_pilot_network_validation_receipts", "physical_pilot_evidence_receipts",
      "physical_pilot_evidence_telemetry_receipts", "physical_pilot_repository_authority", "telemetry_receipts", "telemetry_identity_conflicts"])
      expect(telemetryTruth).toContain(table);
  });

  it("uses canonical admin authority and gives evidence ingestion only to service role", () => {
    expect(migration).toContain("public.m20a_require_admin()");
    expect(migration).not.toMatch(/public\.require_admin\(\)/);
    expect(migration).toContain("coalesce(auth.role(),'')<>'service_role'");
    expect(migration).toMatch(/revoke all on function public\.service_record_physical_pilot_network_validation_v1[\s\S]+from public,anon,authenticated/);
  });

  it("does not accept a browser network timestamp and preserves transition lineage and exact replay", () => {
    const transition = migration.slice(migration.indexOf("admin_transition_physical_pilot_commissioning_v1"), migration.indexOf("service_record_physical_pilot_network_validation_v1"));
    expect(transition).not.toContain("p_network_validated_at");
    expect(transition).toContain("v_from:=v_row.state");
    expect(transition).toContain("Transition key request mismatch");
    expect(transition).toContain("expected_heartbeat_seconds");
    expect(transition).toContain("p_expected_version is null");
    expect(transition).toContain("v_receipt.expected_version is distinct from p_expected_version");
    expect(transition).toContain("'expected_version',p_expected_version");
    expect(transition.indexOf("pg_advisory_xact_lock(hashtext(p_transition_key::text))")).toBeLessThan(transition.indexOf("where transition_key=p_transition_key"));
  });

  it("revalidates current version, candidate, device, link, install, credential, network, head and outcomes", () => {
    for (const binding of [
      "commissioning_version=c.version", "selected_candidate_id=c.selected_candidate_id", "e.gps_device_id=p_device_id",
      "e.vehicle_link_id=l.id", "e.installation_receipt_id=i.id", "e.credential_id=k.id",
      "e.network_validation_receipt_id=n.id", "e.repository_authority_generation=r.generation", "e.repository_head_sha=r.repository_head_sha",
      "e.sequence_outcome<>'failed'", "e.reconnect_outcome<>'failed'",
    ]) expect(migration).toContain(binding);
    expect(migration).toContain("c.state<>'commissioning'");
    expect(migration).toContain("k.last_verified_at is null");
    expect(migration).toContain("e.certification_run_id=c.selected_certification_run_id");
    expect(migration).toContain("d.gps_readiness is distinct from 'ready'");
    expect(migration).toContain("d.gsm_readiness not in ('ready','degraded')");
  });

  it("uses the current successful run and AP approval rather than default manifest certification state", () => {
    expect(migration).toContain("m26_current_certification_run_v1");
    expect(migration).toContain("h.certification_run_id=r.id");
    expect(migration).toContain("r.certification_state='passed'");
    expect(migration).not.toContain("m.certification_state<>'passed'");
  });

  it("rejects unsafe immutable reason codes at ingest and table-trigger boundaries", () => {
    expect(migration).toContain("physical_pilot_evidence_reason_codes_safe");
    expect(migration).toContain("char_length(v_reason) not between 1 and 80");
    expect(migration).toContain("not public.m24f_is_safe_metadata(v_reason)");
    expect(migration).toContain("not public.m24f_is_safe_metadata(reason)");
  });

  it("uses a service-owned immutable repository authority instead of unset session settings", () => {
    expect(migration).toContain("create table public.physical_pilot_repository_authority");
    expect(migration).toContain("service_rotate_physical_pilot_repository_authority_v1");
    expect(migration).toContain("coalesce(auth.role(),'')<>'service_role'");
    expect(migration).toContain("physical_pilot_repository_authority_immutable");
    expect(migration).not.toContain("current_setting('app.repository_head_sha'");
  });

  it("supports exact evidence replay while fencing changed requests", () => {
    expect(migration).toContain("pg_advisory_xact_lock(hashtext(p_receipt_id::text))");
    expect(migration).toContain("Physical evidence receipt replay conflict");
    expect(migration).toContain("e.reason_codes is distinct from p_reason_codes");
    expect(migration).toContain("e.repository_head_sha is distinct from p_repository_head_sha");
    expect(migration).not.toContain("e.repository_authority_generation is distinct from r.generation");
  });

  it("preserves same-credential verification and safely bounds network metadata", () => {
    expect(migration).toContain("e.credential_verified_at<=k.last_verified_at");
    expect(migration).toContain("k.last_verified_at>p_observation_ended_at");
    expect(migration).toContain("Unsafe network configuration class");
    expect(migration).toContain("not public.m24f_is_safe_metadata(p_network_configuration_class)");
  });

  it("does not let routine reactivation supersede the current installation", () => {
    expect(migration).toContain("x.event_type in ('installed','removed','replaced','lost','stolen','retired','setup_reopened')");
    expect(migration).not.toMatch(/x\.gps_device_id=p_device_id and \(x\.effective_at,x\.created_at\)>\(i\.effective_at,i\.created_at\)/);
  });
});

describe("M26 admin readiness request fencing", () => {
  const admin = readFileSync("apps/web/src/admin.tsx", "utf8");

  it("binds readiness responses to both the latest sequence and selected device", () => {
    expect(admin).toContain("const readinessRequestSequence = useRef(0)");
    expect(admin).toContain("const requestSequence = ++readinessRequestSequence.current");
    expect(admin).toContain("requestSequence === readinessRequestSequence.current && selectedIdRef.current === deviceId");
  });

  it("retains a readiness refresh after successful registry mutations", () => {
    const mutation = admin.slice(admin.indexOf("async function callDeviceRpc"), admin.indexOf("function identityBody"));
    expect(mutation).toContain("await loadRegistry()");
    expect(mutation).toContain("await loadPhysicalReadiness(selectedIdRef.current)");
  });
});
