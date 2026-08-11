import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isApApprovedAdapterCandidateV1 } from "../packages/shared/src/physicalTelemetry/m24fContracts";
import {
  M24F_CERTIFICATION_COMMAND,
  REFERENCE_VENDOR_ADAPTER_ID,
  REFERENCE_VENDOR_CAPABILITY_MANIFEST_V1,
  renderM24fCertificationSummaryV1,
  runM24fAdapterCertificationV1,
} from "../netlify/functions/_m24f/certification";

describe("M24F synthetic adapter certification", () => {
  it("enforces the safe-metadata predicate at persistent write constraints", () => {
    const migration = readFileSync("supabase/migrations/20260807010000_m24f_adapter_certification_foundation.sql", "utf8");
    expect(migration).toContain("create or replace function public.m24f_is_safe_metadata");
    for (const prohibitedPattern of ["bearer", "api[_ -]?key", "https?", "raw[_ -]?payload"]) {
      expect(migration).toContain(prohibitedPattern);
    }
    for (const field of ["data_residency_note", "support_escalation_note", "blocking_reason", "safe_notes", "safe_summary", "safe_note"]) {
      expect(migration).toContain(`public.m24f_is_safe_metadata(${field})`);
    }
  });

  it("keeps forward closure migrations portable to the managed migration role", () => {
    const closurePaths = [
      "supabase/migrations/20260808010000_m24f_m25_release_closure.sql",
      "supabase/migrations/20260808030000_m24f_m25_compatibility_closure.sql",
      "supabase/migrations/20260808040000_m24f_m25_authoritative_generation_closure.sql",
    ];
    const superuserOnlyDdl = /\b(?:leakproof|superuser|bypassrls|alter\s+system|event\s+trigger|language\s+c)\b/i;

    for (const path of closurePaths) {
      expect(readFileSync(path, "utf8"), path).not.toMatch(superuserOnlyDdl);
    }

    const authoritativeClosure = readFileSync(closurePaths[2], "utf8");
    expect(authoritativeClosure).not.toMatch(/\\u[0-9a-f]{4}/i);
    expect(authoritativeClosure).toContain("chr(1) || '-' || chr(8)");
    expect(authoritativeClosure).toContain("chr(11) || chr(12) || chr(14) || '-' || chr(31)");

    const finalClosure = readFileSync("supabase/migrations/20260808050000_m24f_m25_watermark_privacy_retry_closure.sql", "utf8");
    expect(finalClosure).toContain("chr(127) || '-' || chr(159)");
    expect(finalClosure).not.toMatch(/\\u[0-9a-f]{4}/i);
  });

  it("rejects pathless hostname endpoints and extended control characters", () => {
    const closure = readFileSync("supabase/migrations/20260808050000_m24f_m25_watermark_privacy_retry_closure.sql", "utf8");
    expect(closure).toContain("[a-z]{2,}(:[0-9]{1,5})?(/[^[:space:]]*)?");
    expect(closure).toContain("chr(127) || '-' || chr(159)");
  });

  it("closes hostname endpoint and certification-scenario append channels", () => {
    const closure = readFileSync("supabase/migrations/20260808040000_m24f_m25_authoritative_generation_closure.sql", "utf8");
    expect(closure).toContain("[a-z]{2,}(:[0-9]{1,5})?(/[^[:space:]]*)");
    expect(closure).toContain("v_existing>=v_declared or v_existing+v_count>v_declared");
    expect(closure).toContain("m24f_certification_scenario_immutability");
    expect(closure).toContain("before insert or update or delete");
  });

  it("binds certification and approval to a frozen candidate manifest", () => {
    const closure = readFileSync("supabase/migrations/20260808070000_m24f_m25_authority_statistical_parity_closure.sql", "utf8");
    expect(closure).toContain("add column manifest_id uuid");
    expect(closure).toContain("trim(p_adapter_id)<>v_manifest.adapter_id");
    expect(closure).toContain("v_latest.manifest_id is distinct from v_manifest_id");
    expect(closure).toContain("certification_run_id uuid references");
    expect(closure).toContain("Authorizing manifest identity is frozen");
  });

  it("records certification audit evidence for the exact candidate and run", () => {
    const closure = readFileSync("supabase/migrations/20260808080000_m24f_m25_final_closure.sql", "utf8");
    expect(closure).toContain("'m24f_certification_recorded'");
    expect(closure).toContain("'candidate_id',p_candidate_id,'manifest_id',v_manifest.id,'certification_run_id',v_id");
    expect(closure).toContain("v_actor:=public.m20a_require_admin()");
    expect(closure.match(/m24f_certification_recorded/g)).toHaveLength(1);
  });

  it("runs the complete synthetic certification matrix without a production claim", () => {
    const result = runM24fAdapterCertificationV1();
    expect(M24F_CERTIFICATION_COMMAND).toBe("test:m24f-adapter-certification");
    expect(result.adapterId).toBe(REFERENCE_VENDOR_ADAPTER_ID);
    expect(result.synthetic).toBe(true);
    expect(result.certificationState).toBe("passed");
    expect(result.failedCount).toBe(0);
    expect(result.scenarioCount).toBeGreaterThanOrEqual(35);
    expect(renderM24fCertificationSummaryV1(result)).toContain("Synthetic-only");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("m24f-synthetic-certification-only");
    expect(serialized).not.toContain("12.9716");
    expect(serialized).not.toContain("77.5946");
  });

  it("keeps the capability manifest bounded and explicitly synthetic", () => {
    expect(REFERENCE_VENDOR_CAPABILITY_MANIFEST_V1.transport.type).toBe("vendor_webhook");
    expect(REFERENCE_VENDOR_CAPABILITY_MANIFEST_V1.authentication.serverOnlySecretRequired).toBe(true);
    expect(REFERENCE_VENDOR_CAPABILITY_MANIFEST_V1.syntheticState).toBe("synthetic_only");
    expect(REFERENCE_VENDOR_CAPABILITY_MANIFEST_V1.certificationLevel).toBe("synthetic_conformance");
  });

  it("requires both the AP decision and current passing certification for authority", () => {
    expect(isApApprovedAdapterCandidateV1({ decisionStatus: "approved_by_ap", certificationStatus: "passed" })).toBe(true);
    expect(isApApprovedAdapterCandidateV1({ decisionStatus: "approved_by_ap", certificationStatus: "failed" })).toBe(false);
    expect(isApApprovedAdapterCandidateV1({ decisionStatus: "approved_by_ap", certificationStatus: "expired" })).toBe(false);
    expect(isApApprovedAdapterCandidateV1({ decisionStatus: "technically_compatible", certificationStatus: "passed" })).toBe(false);

    const closure = readFileSync("supabase/migrations/20260808140000_m24f_m25_authority_readiness_closure.sql", "utf8");
    expect(closure).toContain("after insert on public.m24f_certification_runs");
    expect(closure).toContain("new.certification_state not in ('failed','expired')");
    expect(closure).toContain("v_previous='approved_by_ap'");
    expect(closure).toContain("new_status,actor_admin_id,reason,safe_note,manifest_id,certification_run_id");
  });

  it("invalidates prior authority for every genuinely new certification run", () => {
    const closure = readFileSync("supabase/migrations/20260808150000_m24f_m25_certification_authority_support_parity.sql", "utf8");
    expect(closure).not.toContain("new.certification_state not in ('failed','expired')");
    expect(closure).toContain("v_previous in ('technically_compatible','approved_by_ap')");
    expect(closure).toContain("certification_evidence_superseded");
    expect(closure).toContain("public.m24f_assert_persisted_scenario_truth(v_latest.id)");
    expect(closure).toContain("h.certification_run_id=v_latest.id");
    expect(closure.indexOf("return v_latest.id")).toBeLessThan(closure.indexOf("insert into public.m24f_certification_runs"));
  });

  it("rejects credential and hardware value shapes while retaining safe identifiers", () => {
    const closure = readFileSync("supabase/migrations/20260808170000_m24f_m25_catalog_privacy_manifest_closure.sql", "utf8");
    expect(closure).toContain("m24f_is_credential_shaped_v1");
    expect(closure).toContain("m24f_is_luhn15_identifier_v1");
    expect(closure).toContain("([0-9a-f]{2}:){5}[0-9a-f]{2}");
    expect(closure).toContain("!~* '^[0-9a-f]{32,160}$'");
    expect(closure).toContain("m24f-reference-manifest-v1");
    expect(closure).toContain("select id into v_id from public.m24f_adapter_capability_manifests");
  });

  it("requires current, nonvacuous certification evidence for approval", () => {
    const closure = readFileSync("supabase/migrations/20260808010000_m24f_m25_release_closure.sql", "utf8");
    expect(closure).toContain("scenario_count > 0 and passed_count = scenario_count and failed_count = 0");
    expect(closure).toContain("p_new_status in ('technically_compatible','approved_by_ap')");
    expect(closure).toContain("order by completed_at desc nulls last, id desc limit 1");
  });
});
