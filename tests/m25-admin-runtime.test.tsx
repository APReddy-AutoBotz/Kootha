// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntelligenceAdapterReadinessView, type IntelligenceAdminConnection } from "../apps/web/src/admin-intelligence";

const connection: IntelligenceAdminConnection = {
  url: "https://example.invalid", anonKey: "anon-test", accessToken: "admin-test",
};

function response(value: unknown, ok = true) {
  return new Response(JSON.stringify(value), { status: ok ? 200 : 500, headers: { "content-type": "application/json" } });
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("M25 rendered intelligence admin contracts", () => {
  it("keeps readiness safe by default and only fetches technical values after explicit access", async () => {
    const names: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const name = String(input).split("/").at(-1)!;
      names.push(name);
      if (name === "admin_list_m24f_adapter_readiness_v1") return response({ contractVersion: "m24f-admin-v1", rows: [{
        candidateId: "candidate-1", safeDisplayName: "Synthetic Reference Candidate", deviceFamily: "Synthetic family",
        transportType: "vendor_webhook", authenticationType: "hmac_signature", hostingExpectation: "vendor_cloud",
        offlineBuffering: "supported", eventIdentityCapability: "stable_event_id", vendorSandboxStatus: "documented",
        documentationStatus: "documented", dataResidencyStatus: "not_assessed", commercialStatus: "not_assessed",
        costEvidenceStatus: "unverified_assumption", complianceEvidenceStatus: "not_assessed", certificationStatus: "passed",
        decisionStatus: "candidate", blockingReason: null, lastCertificationAt: "2026-08-07T08:00:00Z",
        lastCertificationState: "passed", lastCertificationPassedCount: 36, lastCertificationScenarioCount: 36, adapterVersion: "1.0.0",
      }] });
      if (name === "admin_get_m25_intelligence_readiness_v1") return response({
        contractVersion: "m25-admin-v1", readiness: { decision: "production_ml_not_authorized", reviewed_calendar_days: 0, reviewed_device_model_days: 0, reviewed_work_day_sessions: 0, feature_completeness: 0, missingness: 1, real_reviewed_evidence: false },
        baselines: [], signals: [{ id: "signal-1", signal_id: "rejection_rate_shift", metric: "rejection_rate", scope: "fleet_day", state: "investigate", observed_value: 0.2, baseline_median: 0.02, robust_score: 4, support_level: "moderate", coverage_score: 0.9, baseline_version: "m25-baseline-v1", explanation_code: "rejection_rate_shift", rule_fallback: "M22 deterministic review remains authoritative.", synthetic: true, promoted_alert_id: null, generated_at: "2026-08-07T08:00:00Z" }],
        governance: [{ analysis_version: "m25-statistical-v1", status: "active" }], mlStatus: "Not activated",
      });
      if (name === "admin_get_m24f_adapter_technical_values_v1") return response({ contractVersion: "m24f-admin-v1", candidateId: "candidate-1", manifest: { adapterId: "reference-vendor-webhook-v1", syntheticState: "synthetic_only" } });
      throw new Error(`unexpected RPC ${name}`);
    }));

    render(<IntelligenceAdapterReadinessView connection={connection} />);
    expect(await screen.findByText("Adapter Readiness and Statistical Intelligence")).toBeTruthy();
    expect(screen.getByText(/production ml not authorized/i)).toBeTruthy();
    expect(screen.getAllByText("Synthetic Reference Candidate")).toHaveLength(2);
    expect(names).not.toContain("admin_get_m24f_adapter_technical_values_v1");
    expect(document.body.textContent).not.toMatch(/12\.9716|77\.5946|m24f-synthetic-certification-only/i);

    await userEvent.click(screen.getByRole("button", { name: "Show capability values" }));
    expect(await screen.findByText(/reference-vendor-webhook-v1/)).toBeTruthy();
    expect(names.filter((name) => name === "admin_get_m24f_adapter_technical_values_v1")).toHaveLength(1);
  });
});
