import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import {
  DriverApiError, getLocationStatusAfterSuccessfulSync, getUnacceptedLocationPoints,
  selectLocationPointsForSync, shouldBufferLocationFailure,
} from "../apps/driver/src/locationProof";

// Run the actual sync helper with controlled network/storage boundaries.
// This is software evidence, not a physical Android permission/GPS test.
const source = ts.createSourceFile("App.tsx", readFileSync("apps/driver/App.tsx", "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler = "";
function collect(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "syncBufferedLocationPointsForWork") {
    if (handler) throw new Error("Duplicate sync handler");
    handler = node.getText(source);
  }
  ts.forEachChild(node, collect);
}
collect(source);
if (!handler) throw new Error("Sync handler binding changed");
const handlerJs = ts.transpileModule(handler, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
function harness() {
  const visible = Object.fromEntries([
    "setPendingOfflineCount", "setLocationPointCount", "setLocationStatus",
    "setLocationHealthStatus", "setLastSyncTime", "setLocationMessage",
  ].map((key) => [key, vi.fn()]));
  const point = { client_point_id: "fake-point", retry_count: 0, sync_status: "pending" };
  const response = {
    accepted_client_point_ids: ["fake-point"], failed_count: 0, point_count: 1,
    tracking_health_status: "healthy", last_successful_sync_at: "2026-09-12T00:00:00Z",
    result_message: "Location Synced.",
  };
  const deps = {
    ...visible, mobileNumber: "9000000000", workCode: "FAKE00", locationStatus: "running",
    locationPointCount: 0, locationSyncInFlight: { current: false },
    locationCaptureGeneration: { current: 1 }, locationWorkDay: { current: "fake-day" },
    getLocationStatusAfterSuccessfulSync, getUnacceptedLocationPoints,
    selectLocationPointsForSync, shouldBufferLocationFailure,
    setIsLocationSyncing: vi.fn(),
    pruneBufferedLocationPointsForWork: vi.fn().mockResolvedValue([point]),
    syncMobileLocationPoints: vi.fn().mockResolvedValue(response),
    removeAcceptedBufferedLocationPoints: vi.fn().mockResolvedValue(undefined),
    markBufferedLocationPointsFailed: vi.fn().mockResolvedValue(undefined),
    driverLabels: { locationSynced: "Location Synced", syncFailed: "Sync Failed", trySyncAgain: "Try Again" },
  };
  const run = new Function(...Object.keys(deps), handlerJs + "\nreturn syncBufferedLocationPointsForWork;")(
    ...Object.values(deps),
  ) as (work: { ad_work_day_id: string; execution_status: string }, session: string, force: boolean) => Promise<void>;
  return { deps, visible, point, response, run: () => run({ ad_work_day_id: "fake-day", execution_status: "running" }, "fake-session", true) };
}

describe("sync UI ownership across asynchronous cancellation", () => {
  for (const stage of ["initial-read", "network", "accepted-cleanup", "rejected-mark", "remaining-read", "failed-mark", "failed-read", "new-work"] as const) {
    it("does not publish old-session state after cancellation at " + stage, async () => {
      const { deps, visible, point, response, run } = harness();
      const entered = deferred();
      const held = deferred();
      const hold = async () => { entered.resolve(); await held.promise; };
      if (stage === "initial-read") {
        deps.pruneBufferedLocationPointsForWork.mockImplementation(async () => { await hold(); return [point]; });
      } else if (stage === "network" || stage === "new-work") {
        deps.syncMobileLocationPoints.mockImplementation(async () => { await hold(); return response; });
      } else if (stage === "accepted-cleanup") {
        deps.removeAcceptedBufferedLocationPoints.mockImplementation(hold);
      } else if (stage === "rejected-mark") {
        deps.syncMobileLocationPoints.mockResolvedValue({ ...response, accepted_client_point_ids: [], failed_count: 1 });
        deps.markBufferedLocationPointsFailed.mockImplementation(hold);
      } else if (stage === "failed-mark") {
        deps.syncMobileLocationPoints.mockRejectedValue(new TypeError("offline"));
        deps.markBufferedLocationPointsFailed.mockImplementation(hold);
      } else {
        if (stage === "failed-read") deps.syncMobileLocationPoints.mockRejectedValue(new DriverApiError("revoked", 403));
        let reads = 0;
        deps.pruneBufferedLocationPointsForWork.mockImplementation(async () => {
          if (++reads === 2) await hold();
          return [point];
        });
      }
      const pending = run();
      await entered.promise;
      if (stage === "new-work") deps.locationWorkDay.current = "another-fake-day";
      else deps.locationCaptureGeneration.current += 1;
      for (const setter of Object.values(visible)) setter.mockClear();
      held.resolve();
      await pending;
      for (const setter of Object.values(visible)) expect(setter).not.toHaveBeenCalled();
      expect(deps.locationSyncInFlight.current).toBe(false);
      expect(deps.setIsLocationSyncing).toHaveBeenLastCalledWith(false);
      if (stage === "initial-read") expect(deps.syncMobileLocationPoints).not.toHaveBeenCalled();
      if (stage === "network") expect(deps.removeAcceptedBufferedLocationPoints).toHaveBeenCalledWith(["fake-point"]);
    });
  }

  it("keeps normal authorized sync feedback", async () => {
    const { deps, visible, run } = harness();
    await run();
    expect(visible.setLocationPointCount).toHaveBeenCalledWith(1);
    expect(visible.setLocationMessage).toHaveBeenCalledWith("Location Synced.");
    expect(deps.locationSyncInFlight.current).toBe(false);
  });
});
