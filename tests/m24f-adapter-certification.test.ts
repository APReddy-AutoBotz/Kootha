import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
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
    ];
    const superuserOnlyDdl = /\b(?:leakproof|superuser|bypassrls|alter\s+system|event\s+trigger|language\s+c)\b/i;

    for (const path of closurePaths) {
      expect(readFileSync(path, "utf8"), path).not.toMatch(superuserOnlyDdl);
    }
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

  it("requires current, nonvacuous certification evidence for approval", () => {
    const closure = readFileSync("supabase/migrations/20260808010000_m24f_m25_release_closure.sql", "utf8");
    expect(closure).toContain("scenario_count > 0 and passed_count = scenario_count and failed_count = 0");
    expect(closure).toContain("p_new_status in ('technically_compatible','approved_by_ap')");
    expect(closure).toContain("order by completed_at desc nulls last, id desc limit 1");
  });
});
