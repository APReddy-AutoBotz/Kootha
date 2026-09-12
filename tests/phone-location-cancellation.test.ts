import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { canStartMobileLocationProof } from "@kootha/shared";
import {
  DriverApiError,
  getForegroundLocationDecision,
  maxLocationSyncRetries,
  shouldBufferLocationFailure,
} from "../apps/driver/src/locationProof";

// Execute the actual handlers with controlled async platform boundaries. These
// are software race tests, not Android permission or physical GPS evidence.
const source = ts.createSourceFile(
  "App.tsx", readFileSync("apps/driver/App.tsx", "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX,
);
const handlerNames = [
  "recordCurrentLocationPoint", "refreshBufferedLocationSummary", "handleStartLocationProof",
];
const handlers: string[] = [];
function collect(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name && handlerNames.includes(node.name.text)) {
    handlers.push(node.getText(source));
  }
  ts.forEachChild(node, collect);
}
collect(source);
if (handlers.length !== handlerNames.length) throw new Error("Driver handler test bindings changed.");
const handlerJs = ts.transpileModule(handlers.join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function harness() {
  const work = {
    ad_work_id: "fake-work", ad_work_day_id: "fake-day", assignment_id: "fake-assignment",
    driver_id: "fake-driver", vehicle_id: "fake-vehicle", mobile_tracking_status: "running",
    execution_status: "running", mobile_location_proof_required: true,
  };
  const state = Object.fromEntries([
    "setPendingOfflineCount", "setLastSavedLocationTime", "setLocationHealthStatus",
    "setLocationMessage", "setLocationPointCount", "setLastLocationUpdate", "setLastSyncTime",
    "setLocationStatus", "setIsLocationBusy", "setWorkRows", "setWorkMessage", "setLocationSessionId",
  ].map((key) => [key, vi.fn()]));
  const deps = {
    ...state,
    currentWork: work,
    mobileNumber: "9000000000", workCode: "FAKE00",
    locationStatus: "running", locationPointCount: 0,
    locationUnderstanding: true, locationAgreement: true, canStartLocationProof: true,
    workActionInFlight: { current: false }, locationCaptureInFlight: { current: false },
    locationCaptureGeneration: { current: 1 },
    getForegroundLocationDecision, canStartMobileLocationProof, DriverApiError,
    maxLocationSyncRetries, shouldBufferLocationFailure,
    refreshActiveLocationAuthorization: vi.fn().mockResolvedValue(work),
    loadAssignedWork: vi.fn().mockResolvedValue([work]),
    startMobileTracking: vi.fn().mockResolvedValue({ tracking_session_id: "fake-session", status: "running" }),
    Location: {
      Accuracy: { Balanced: 3 },
      getForegroundPermissionsAsync: vi.fn().mockResolvedValue({ granted: true }),
      requestForegroundPermissionsAsync: vi.fn().mockResolvedValue({ granted: true }),
      getCurrentPositionAsync: vi.fn().mockResolvedValue({
        timestamp: Date.now(), coords: { latitude: 0, longitude: 0, accuracy: 5, speed: null, heading: null },
      }),
    },
    markLocationPermissionMissingOnDevice: vi.fn(),
    toFiniteLocationValue: (value: number | null) => value,
    createClientPointId: () => "fake-point",
    getLocationQualityFromAccuracy: () => "good",
    recordMobileLocationPoint: vi.fn().mockRejectedValue(new TypeError("offline")),
    saveBufferedLocationPoint: vi.fn().mockResolvedValue(undefined),
    pruneBufferedLocationPointsForWork: vi.fn().mockResolvedValue([
      { captured_at: "2026-09-12T00:00:00.000Z", sync_status: "pending", retry_count: 0 },
    ]),
    syncBufferedLocationPointsForWork: vi.fn().mockResolvedValue(undefined),
    driverLabels: { locationSavedOffline: "Location Saved Offline", locationProofRunning: "Location Proof Running" },
  };
  const run = new Function(...Object.keys(deps), handlerJs + "\nreturn { " + handlerNames.join(",") + " };")(
    ...Object.values(deps),
  ) as {
    recordCurrentLocationPoint: (sessionId: string) => Promise<boolean>;
    handleStartLocationProof: () => Promise<void>;
  };
  return { deps, state, run };
}

describe("phone capture cancellation across asynchronous storage", () => {
  for (const stage of ["saveBufferedLocationPoint", "pruneBufferedLocationPointsForWork"] as const) {
    it(`does not publish state or request another sync after cancellation during ${stage}`, async () => {
      const { deps, state, run } = harness();
      const entered = deferred();
      const held = deferred();
      deps[stage].mockImplementation(async () => {
        entered.resolve();
        await held.promise;
        return [{ captured_at: "2026-09-12T00:00:00.000Z", sync_status: "pending", retry_count: 0 }];
      });
      const pending = run.recordCurrentLocationPoint("fake-session");
      await entered.promise;
      deps.locationCaptureGeneration.current += 1;
      held.resolve();
      expect(await pending).toBe(false);
      for (const setter of Object.values(state)) expect(setter).not.toHaveBeenCalled();
      expect(deps.syncBufferedLocationPointsForWork).not.toHaveBeenCalled();
      expect(deps.locationCaptureInFlight.current).toBe(false);
    });
  }

  it("retains offline saving and pending counts for a still-authorized capture", async () => {
    const { deps, state, run } = harness();
    expect(await run.recordCurrentLocationPoint("fake-session")).toBe(true);
    expect(deps.saveBufferedLocationPoint).toHaveBeenCalledOnce();
    expect(state.setPendingOfflineCount).toHaveBeenCalledWith(1);
    expect(state.setLocationHealthStatus).toHaveBeenLastCalledWith("offline_saving");
    expect(state.setLocationMessage).toHaveBeenCalledWith("Location Saved Offline.");
  });

  it("does not publish a saved message or request another sync after cancellation during sync", async () => {
    const { deps, state, run } = harness();
    const entered = deferred();
    const held = deferred();
    deps.recordMobileLocationPoint.mockResolvedValue({ point_count: 1, tracking_health_status: "healthy" });
    deps.syncBufferedLocationPointsForWork.mockImplementation(async () => {
      entered.resolve();
      await held.promise;
    });
    const pending = run.recordCurrentLocationPoint("fake-session");
    await entered.promise;
    deps.locationCaptureGeneration.current += 1;
    for (const setter of Object.values(state)) setter.mockClear();
    held.resolve();
    expect(await pending).toBe(false);
    for (const setter of Object.values(state)) expect(setter).not.toHaveBeenCalled();
  });

  it("ignores a successful Start response received after a lifecycle cancellation", async () => {
    const { deps, state, run } = harness();
    const entered = deferred();
    const held = deferred();
    deps.startMobileTracking.mockImplementation(async () => {
      entered.resolve();
      await held.promise;
      return { tracking_session_id: "fake-session", status: "running" };
    });
    const pending = run.handleStartLocationProof();
    await entered.promise;
    deps.locationCaptureGeneration.current += 1;
    for (const setter of Object.values(state)) setter.mockClear();
    held.resolve();
    await pending;
    expect(deps.Location.getCurrentPositionAsync).not.toHaveBeenCalled();
    expect(state.setLocationStatus).not.toHaveBeenCalled();
    expect(state.setLocationSessionId).not.toHaveBeenCalled();
    expect(state.setLocationMessage).not.toHaveBeenCalled();
    expect(state.setIsLocationBusy).toHaveBeenLastCalledWith(false);
  });
});
