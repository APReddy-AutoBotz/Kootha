// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  AlertDetailPanel,
  AlertsView,
  TrackingHealthView,
  type M22AdminConnection,
} from "../apps/web/src/admin-m22";

const connection: M22AdminConnection = {
  url: "https://example.invalid", anonKey: "anon-test", accessToken: "admin-test",
};
const alert = {
  id: "alert-1", ruleId: "location_update_missing", ruleVersion: "m22-pilot-v1",
  title: "Physical location update missing", message: "Review the source health.",
  severity: "warning", status: "new", source: "health_sweep",
  deviceLabel: "DEV-7", vehicleLabel: "AP-09-TEST", workLabel: "Campaign A · 2026-07-31",
  firstDetectedAt: "2026-07-31T08:00:00Z", lastDetectedAt: "2026-07-31T08:05:00Z",
  conditionActive: true, conditionClearedAt: null, occurrenceCount: 2, synthetic: false,
};
function response(value: unknown, ok = true) {
  return new Response(JSON.stringify(value), { status: ok ? 200 : 500, headers: { "content-type": "application/json" } });
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("M22 rendered admin contracts", () => {
  it("renders bounded work-day phone and physical health without coordinates or pairing", async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      return response({ contractVersion: "m22-admin-v1", rows: [{
        adWorkDayId: "day-1", adWorkId: "work-1", workLabel: "Campaign A · 2026-07-31",
        phoneSessionCount: 1, physicalSessionCount: 1, phonePointCount: 12, physicalPointCount: 18,
        phoneFirstUpdateAt: "2026-07-31T07:30:00Z", phoneLastUpdateAt: "2026-07-31T08:04:00Z",
        physicalFirstUpdateAt: "2026-07-31T07:31:00Z", physicalLastUpdateAt: "2026-07-31T08:03:00Z",
        latestAcceptedLivePhysicalUpdateAt: "2026-07-31T08:03:00Z",
        delayedPhysicalCount: 3, offlineBackfillCount: 2, phoneHealth: "healthy", physicalHealth: "healthy",
        heartbeatAgeSeconds: 20, physicalLocationUpdateAgeSeconds: 45,
        activeAlertCount: 1, highestActiveSeverity: "warning",
        latestHealthEpisode: { alertId: "alert-1", ruleId: "location_update_missing", status: "new", severity: "warning", lastDetectedAt: "2026-07-31T08:05:00Z" },
        comparisonStatus: "planned_for_m23",
      }] });
    }));
    render(<TrackingHealthView connection={connection} />);
    expect(await screen.findByText("Campaign A · 2026-07-31")).toBeTruthy();
    expect(screen.getByText("Phone Location Proof health")).toBeTruthy();
    expect(screen.getByText("Latest accepted-live update")).toBeTruthy();
    expect(screen.getByText("3 / 2")).toBeTruthy();
    expect(screen.getByText("Planned For M23")).toBeTruthy();
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toContain("admin_get_m22_tracking_health_v1");
    expect(JSON.stringify(requests)).not.toMatch(/latitude|longitude|\blat\b|\blng\b/i);
    expect(document.body.textContent).toContain("Sources are not paired");
  });

  it("renders list/detail histories and fetches technical values only after explicit access", async () => {
    const names: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const name = String(input).split("/").at(-1)!; names.push(name);
      if (name === "admin_list_m22_alerts_v1") return response({ contractVersion: "m22-admin-v1", rows: [alert] });
      if (name === "admin_get_m22_alert_detail_v1") return response({
        contractVersion: "m22-admin-v1", alert,
        statusHistory: [{ id: "h1", previousStatus: null, newStatus: "new", reason: "condition_opened", note: "Opened safely", transitionAt: "2026-07-31T08:00:00Z" }],
        notes: [{ id: "n1", reason: "triage", note: "Safe note", createdAt: "2026-07-31T08:06:00Z" }],
        assessments: [{ id: "a1", ruleId: alert.ruleId, ruleVersion: alert.ruleVersion, outcome: "opened", reasonCode: "threshold_met", evidenceTiming: "live", assessedAt: "2026-07-31T08:05:00Z" }],
        auditHistory: [{ id: "l1", action: "alert_opened", createdAt: "2026-07-31T08:05:00Z" }],
        allowedTransitions: ["acknowledged", "investigating", "resolved", "false_alarm", "ignored"],
        technicalValuesAvailable: true,
      });
      if (name === "admin_get_m22_alert_technical_values_v1") return response({
        contractVersion: "m22-admin-v1", alertId: alert.id, ruleVersion: alert.ruleVersion,
        observedValue: 301, thresholdValue: 300, unit: "seconds", evidenceTiming: "live", assessedAt: "2026-07-31T08:05:00Z",
      });
      throw new Error(`unexpected RPC ${name}`);
    }));
    render(<AlertsView connection={connection} />);
    expect(await screen.findByText("DEV-7", { exact: false })).toBeTruthy();
    expect(await screen.findByText("Lifecycle history")).toBeTruthy();
    expect(screen.getByText("Opened safely", { exact: false })).toBeTruthy();
    expect(screen.getByText("Safe note")).toBeTruthy();
    expect(screen.getByText("Alert Opened")).toBeTruthy();
    expect(names).not.toContain("admin_get_m22_alert_technical_values_v1");
    await userEvent.click(screen.getByRole("button", { name: "Show technical values" }));
    expect(await screen.findByText("301", { exact: false })).toBeTruthy();
    expect(names.filter((name) => name === "admin_get_m22_alert_technical_values_v1")).toHaveLength(1);
    expect(document.body.textContent).not.toMatch(/latitude|longitude/i);
  });

  it("renders terminal alert behavior from allowedTransitions and safe RPC errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({
      contractVersion: "m22-admin-v1", alert: { ...alert, status: "resolved", conditionActive: false },
      statusHistory: [], notes: [], assessments: [], auditHistory: [], allowedTransitions: [],
      technicalValuesAvailable: false,
    })));
    render(<AlertDetailPanel connection={connection} alertId="alert-1" onChanged={() => undefined} />);
    expect(await screen.findByText("This alert is terminal. No further lifecycle transitions are allowed.")).toBeTruthy();
    expect(screen.queryByText("Confirm lifecycle action")).toBeNull();
    cleanup();
    vi.stubGlobal("fetch", vi.fn(async () => response({}, false)));
    render(<TrackingHealthView connection={connection} />);
    expect((await screen.findByRole("alert")).textContent).toContain("The M22 admin request could not be completed.");
  });
});
