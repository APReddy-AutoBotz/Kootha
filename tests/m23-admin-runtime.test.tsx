// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TrackingHealthView, type M22AdminConnection } from "../apps/web/src/admin-m22";

const connection: M22AdminConnection = {
  url: "https://example.invalid", anonKey: "anon-test", accessToken: "admin-test",
};
const summary = {
  snapshotId: "snapshot-1", adWorkDayId: "day-1", adWorkId: "work-1", workLabel: "Campaign A",
  policyVersion: "m23-pilot-v1", pairingAlgorithmVersion: "m23-pairing-v1", sourceExpectation: "both_expected",
  overallOutcome: "sustained_mismatch", reviewStatus: "not_reviewed", finality: "provisional_backfill_open",
  phoneEligibleCount: 4, physicalEligibleCount: 4, pairCount: 4, acceptablePairCount: 4, matchCount: 0,
  mismatchCandidateCount: 4, insufficientQualityCount: 0, unpairedPhoneCount: 0, unpairedPhysicalCount: 0,
  sustainedPairCount: 4, sustainedFirstPairAt: "2026-07-31T08:00:00Z", sustainedLastPairAt: "2026-07-31T08:05:00Z",
  synthetic: true,
  generatedAt: "2026-07-31T08:06:00Z", technicalValuesAvailable: true,
};
function response(value: unknown, ok = true) {
  return new Response(JSON.stringify(value), { status: ok ? 200 : 500, headers: { "content-type": "application/json" } });
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("M23 admin comparison runtime", () => {
  it("keeps technical pair values behind explicit audited access and preserves neutral language", async () => {
    const names: string[] = [];
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const name = String(input).split("/").at(-1)!; names.push(name);
      if (init?.body) bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      if (name === "admin_get_m22_tracking_health_v1") return response({ contractVersion: "m22-admin-v1", rows: [{
        adWorkDayId: "day-1", adWorkId: "work-1", workLabel: "Campaign A", phoneSessionCount: 1, physicalSessionCount: 1,
        phonePointCount: 4, physicalPointCount: 4, phoneFirstUpdateAt: null, phoneLastUpdateAt: null,
        physicalFirstUpdateAt: null, physicalLastUpdateAt: null, latestAcceptedLivePhysicalUpdateAt: null,
        delayedPhysicalCount: 0, offlineBackfillCount: 0, phoneHealth: "healthy", physicalHealth: "healthy",
        heartbeatAgeSeconds: null, physicalLocationUpdateAgeSeconds: null, activeAlertCount: 0, highestActiveSeverity: null,
        latestHealthEpisode: null, comparisonSnapshotId: "snapshot-1", comparisonStatus: "sustained_mismatch",
      }] });
      if (name === "admin_get_m23_comparison_detail_v1") return response({ contractVersion: "m23-admin-v1", comparison: summary, reviewHistory: [], alert: null });
      if (name === "admin_get_m23_comparison_technical_values_v1") return response({
        contractVersion: "m23-admin-v1", snapshotId: "snapshot-1", policyVersion: "m23-pilot-v1", threshold: 300,
        accessedAt: "2026-07-31T08:07:00Z", hasMore: false, nextCursor: null, pairs: [{ pairId: "pair-1",
          phoneCapturedAt: "2026-07-31T08:00:00Z", physicalCapturedAt: "2026-07-31T08:00:01Z", timeDifferenceMilliseconds: 1000,
          rawHaversineDistanceMeters: 400, phoneAccuracyMeters: 10, physicalDeviceAccuracyMeters: 10,
          conservativeSeparationMeters: 380, threshold: 300, quality: "acceptable", outcome: "mismatch_candidate", policyVersion: "m23-pilot-v1", synthetic: true }],
      });
      if (name === "admin_transition_m23_comparison_review") return response({ contractVersion: "m23-admin-v1", snapshotId: "snapshot-1", reviewStatus: "reviewed_needs_follow_up" });
      throw new Error(`unexpected RPC ${name} ${String(init?.body)}`);
    }));
    render(<TrackingHealthView connection={connection} />);
    await userEvent.click(await screen.findByRole("button", { name: "Review comparison" }));
    expect((await screen.findAllByText("Sustained Mismatch", { exact: false })).length).toBeGreaterThan(0);
    expect(names).not.toContain("admin_get_m23_comparison_technical_values_v1");
    expect(document.body.textContent).toContain("source-attribution conclusions are not available");
    await userEvent.click(screen.getByRole("button", { name: "Show technical values" }));
    expect(await screen.findByText("380 metres", { exact: false })).toBeTruthy();
    expect(names.filter((name) => name === "admin_get_m23_comparison_technical_values_v1")).toHaveLength(1);
    const technicalRequest = bodies.find((body) => body.p_snapshot_id === "snapshot-1" && body.p_limit === 100);
    expect(technicalRequest?.p_limit).toBe(100);
    expect(technicalRequest?.p_after_cursor).toBeNull();
    expect(JSON.stringify(technicalRequest)).not.toMatch(/phonePointId|physicalPointId|latitude|longitude/i);
    await userEvent.selectOptions(screen.getByLabelText("Status"), "reviewed_needs_follow_up");
    await userEvent.type(screen.getByLabelText("Reason"), "Compare retained synthetic evidence");
    await userEvent.type(screen.getByLabelText("Safe admin note"), "Follow-up remains operational only");
    await userEvent.click(screen.getByRole("button", { name: "Save comparison review" }));
    expect(names).toContain("admin_transition_m23_comparison_review");
  });

  it("does not render a review form after the dismissal status becomes terminal", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const name = String(input).split("/").at(-1)!;
      if (name === "admin_get_m22_tracking_health_v1") return response({ contractVersion: "m22-admin-v1", rows: [{
        adWorkDayId: "day-1", adWorkId: "work-1", workLabel: "Campaign A", phoneSessionCount: 0, physicalSessionCount: 0,
        phonePointCount: 0, physicalPointCount: 0, phoneFirstUpdateAt: null, phoneLastUpdateAt: null,
        physicalFirstUpdateAt: null, physicalLastUpdateAt: null, latestAcceptedLivePhysicalUpdateAt: null,
        delayedPhysicalCount: 0, offlineBackfillCount: 0, phoneHealth: "unknown", physicalHealth: "unknown",
        heartbeatAgeSeconds: null, physicalLocationUpdateAgeSeconds: null, activeAlertCount: 0, highestActiveSeverity: null,
        latestHealthEpisode: null, comparisonSnapshotId: "snapshot-1", comparisonStatus: "insufficient_quality",
      }] });
      if (name === "admin_get_m23_comparison_detail_v1") return response({ contractVersion: "m23-admin-v1", comparison: { ...summary, overallOutcome: "insufficient_quality", reviewStatus: "dismissed_insufficient_evidence", technicalValuesAvailable: false }, reviewHistory: [], alert: null });
      throw new Error(`unexpected RPC ${name}`);
    }));
    render(<TrackingHealthView connection={connection} />);
    await userEvent.click(await screen.findByRole("button", { name: "Review comparison" }));
    expect(await screen.findByText("This comparison review is terminal.", { exact: false })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save comparison review" })).toBeNull();
  });
});
