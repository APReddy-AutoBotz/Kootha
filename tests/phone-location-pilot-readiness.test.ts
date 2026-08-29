import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DriverApiError,
  getForegroundLocationDecision,
  getLocationStatusAfterSuccessfulSync,
  getLocationStatusAfterWorkAction,
  isPointForLocationScope,
  markLocationPointsFailed,
  maxLocationSyncRetries,
  mergeBufferedLocationPoint,
  parseBufferedLocationPoints,
  removeAcceptedLocationPoints,
  selectLocationPointsForSync,
  shouldBufferLocationFailure,
  shouldReconcileWorkMutationFailure,
  withDriverApiTimeout,
} from "../apps/driver/src/locationProof";
import type { BufferedLocationPoint } from "../apps/driver/src/locationProof";

const driverAppSource = readFileSync("apps/driver/App.tsx", "utf8");
const driverReactNativeConfigSource = readFileSync("apps/driver/react-native.config.js", "utf8");
const permissionClosureMigrationSource = readFileSync(
  "supabase/migrations/20260823154500_m29_phone_permission_missing_rpc_ambiguity_closure.sql",
  "utf8",
);
const driverAppConfig = JSON.parse(readFileSync("apps/driver/app.json", "utf8")) as {
  expo: {
    android?: { permissions?: string[] };
    plugins?: unknown[];
  };
};

function fakePoint(
  clientPointId: string,
  overrides: Partial<BufferedLocationPoint> = {},
): BufferedLocationPoint {
  return {
    local_id: clientPointId,
    client_point_id: clientPointId,
    tracking_session_id: "session-fake-1",
    ad_work_id: "work-fake-1",
    ad_work_day_id: "day-fake-1",
    assignment_id: "assignment-fake-1",
    driver_id: "driver-fake-1",
    vehicle_id: "vehicle-fake-1",
    latitude: 0,
    longitude: 0,
    accuracy: 10,
    speed: null,
    heading: null,
    captured_at: "2026-08-23T00:00:00.000Z",
    sync_status: "pending",
    retry_count: 0,
    last_sync_attempt_at: null,
    ...overrides,
  };
}

describe("phone location pilot software readiness", () => {
  it("requests foreground location without unused camera, microphone, or background-location permissions", () => {
    expect(driverAppConfig.expo.android?.permissions).toContain("android.permission.ACCESS_FINE_LOCATION");
    expect(driverAppConfig.expo.android?.permissions).not.toContain("android.permission.ACCESS_BACKGROUND_LOCATION");
    expect(driverAppConfig.expo.android?.permissions).not.toContain("android.permission.CAMERA");
    expect(driverAppConfig.expo.android?.permissions).not.toContain("android.permission.RECORD_AUDIO");

    const imagePickerPlugin = driverAppConfig.expo.plugins?.find(
      (plugin): plugin is [string, Record<string, unknown>] => (
        Array.isArray(plugin) && plugin[0] === "expo-image-picker"
      ),
    );
    expect(imagePickerPlugin?.[1]).toMatchObject({
      cameraPermission: false,
      microphonePermission: false,
    });
  });

  it("pins the Expo Android autolinking import to the class provided by SDK 52", () => {
    expect(driverReactNativeConfigSource).toContain("import expo.modules.ExpoModulesPackage;");
    expect(driverReactNativeConfigSource).not.toContain("import expo.core.ExpoModulesPackage;");
  });

  it("allows a foreground capture only for required, running proof during running work", () => {
    const active = {
      locationProofRequired: true,
      trackingSessionId: "session-fake-1",
      trackingStatus: "running" as const,
      executionStatus: "running" as const,
    };

    expect(getForegroundLocationDecision(active, true)).toBe("capture");
    expect(getForegroundLocationDecision({ ...active, locationProofRequired: false }, true)).toBe("inactive");
    expect(getForegroundLocationDecision({ ...active, trackingSessionId: null }, true)).toBe("inactive");
    expect(getForegroundLocationDecision({ ...active, trackingStatus: "paused" }, true)).toBe("inactive");
    expect(getForegroundLocationDecision({ ...active, executionStatus: "on_break" }, true)).toBe("inactive");
    expect(getForegroundLocationDecision({ ...active, executionStatus: "completed" }, true)).toBe("inactive");
  });

  it("turns denied or revoked foreground permission into a stop decision without requesting a position", () => {
    expect(getForegroundLocationDecision({
      locationProofRequired: true,
      trackingSessionId: "session-fake-1",
      trackingStatus: "running",
      executionStatus: "running",
    }, false)).toBe("permission_missing");

    expect(getForegroundLocationDecision({
      locationProofRequired: true,
      trackingSessionId: "session-fake-1",
      trackingStatus: "paused",
      executionStatus: "on_break",
    }, false)).toBe("inactive");

    expect(driverAppSource).toContain("Location.getForegroundPermissionsAsync()");
    expect(driverAppSource).toContain("markLocationPermissionMissingOnDevice");
    expect(driverAppSource).toContain("refreshActiveLocationAuthorization");
  });

  it("requires fresh Location Proof consent whenever the assigned work changes", () => {
    expect(driverAppSource).toMatch(
      /useEffect\(\(\) => \{\s*setLocationUnderstanding\(false\);\s*setLocationAgreement\(false\);\s*\}, \[currentWork\?\.ad_work_day_id\]\);/,
    );
  });

  it("revalidates active work before asking Android for permission and clears revoked work", () => {
    const startHandler = driverAppSource.slice(
      driverAppSource.indexOf("async function handleStartLocationProof()"),
      driverAppSource.indexOf("async function handleStopLocationProof"),
    );

    expect(startHandler.indexOf("await refreshAssignedWork()")).toBeGreaterThan(-1);
    expect(startHandler.indexOf("await refreshAssignedWork()")).toBeLessThan(
      startHandler.indexOf("Location.requestForegroundPermissionsAsync()"),
    );
    expect(startHandler).toContain("authorizedWork.ad_work_day_id");
    expect(driverAppSource).toMatch(
      /setWorkRows\(\[\]\);\s*setWorkMessage\("No assigned work found for this Work Code\."\);\s*setLocationStatus\("stopped"\);/,
    );
  });

  it("persists permission-missing tracking health for denied and revoked devices", () => {
    expect(permissionClosureMigrationSource).toMatch(
      /set status = 'permission_missing',[\s\S]{0,160}tracking_health_status = 'permission_missing'/,
    );
    expect(permissionClosureMigrationSource).toMatch(
      /status,\s+tracking_health_status,\s+stopped_by[\s\S]{0,500}'permission_missing',\s+'permission_missing',\s+'driver'/,
    );
  });

  it("buffers only network and transient HTTP failures, not authoritative rejections", () => {
    for (const status of [400, 401, 403, 404, 409, 422]) {
      expect(shouldBufferLocationFailure(new DriverApiError("rejected", status))).toBe(false);
    }
    for (const status of [408, 425, 429, 500, 503]) {
      expect(shouldBufferLocationFailure(new DriverApiError("retry", status))).toBe(true);
    }
    expect(shouldBufferLocationFailure(new DriverApiError("offline", null))).toBe(true);
    expect(shouldBufferLocationFailure(new TypeError("network unavailable"))).toBe(true);
  });

  it("bounds stalled API requests and keeps timeouts retryable for offline buffering", async () => {
    const stalledRequest = withDriverApiTimeout(
      (signal) => new Promise<never>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }),
      5,
    );

    await expect(stalledRequest).rejects.toMatchObject({
      name: "DriverApiError",
      message: "Request timed out. Check connection and retry.",
      status: null,
      retryable: true,
    });
    expect(driverAppSource).toContain("fetchDriverApi");
    expect(driverAppSource).not.toContain("await fetch(config.url");
  });

  it("preserves HTTP status for rejected tracking starts so revoked work is cleared", () => {
    const startRequest = driverAppSource.slice(
      driverAppSource.indexOf("async function startMobileTracking"),
      driverAppSource.indexOf("async function markMobileLocationPermissionMissing"),
    );

    expect(startRequest).toContain(
      'throw new DriverApiError("Could not start Location Proof.", response.status);',
    );
  });

  it("reconciles assigned work and tracking state after ambiguous work mutations", () => {
    expect(shouldReconcileWorkMutationFailure(new DriverApiError("timeout", null))).toBe(true);
    expect(shouldReconcileWorkMutationFailure(new DriverApiError("server", 503))).toBe(true);
    expect(shouldReconcileWorkMutationFailure(new TypeError("network unavailable"))).toBe(true);
    expect(shouldReconcileWorkMutationFailure(new DriverApiError("revoked", 403))).toBe(true);
    expect(shouldReconcileWorkMutationFailure(new DriverApiError("conflict", 409))).toBe(true);
    expect(shouldReconcileWorkMutationFailure(new Error("not configured"))).toBe(false);

    const reconciliation = driverAppSource.slice(
      driverAppSource.indexOf("async function reconcileAssignedWorkAfterMutationFailure"),
      driverAppSource.indexOf("async function handleOpenWork"),
    );
    const workActionHandler = driverAppSource.slice(
      driverAppSource.indexOf("async function handleWorkAction"),
      driverAppSource.indexOf("async function handleChooseProofPhoto"),
    );

    expect(reconciliation).toContain("await refreshAssignedWork()");
    expect(reconciliation).toContain('setLocationStatus(refreshedWork?.mobile_tracking_status ?? "stopped")');
    expect(workActionHandler).toContain("shouldReconcileWorkMutationFailure(error)");
    expect(workActionHandler).toContain("await reconcileAssignedWorkAfterMutationFailure(currentWork.ad_work_day_id)");
  });

  it("restores running UI state only after the server accepts a sync for active work", () => {
    const successfulSync = {
      executionStatus: "running" as const,
      requestTrackingStatus: "stopped" as const,
      currentTrackingStatus: "stopped" as const,
      failedCount: 0,
      acceptedCount: 1,
      trackingHealthStatus: "healthy" as const,
    };

    expect(getLocationStatusAfterSuccessfulSync(successfulSync)).toBe("running");
    expect(getLocationStatusAfterSuccessfulSync({ ...successfulSync, executionStatus: "completed" })).toBe("stopped");
    expect(getLocationStatusAfterSuccessfulSync({ ...successfulSync, failedCount: 1 })).toBe("stopped");
    expect(getLocationStatusAfterSuccessfulSync({ ...successfulSync, acceptedCount: 0 })).toBe("stopped");
    expect(getLocationStatusAfterSuccessfulSync({ ...successfulSync, trackingHealthStatus: "sync_failed" })).toBe("stopped");

    expect(getLocationStatusAfterSuccessfulSync({
      ...successfulSync,
      requestTrackingStatus: "running",
      currentTrackingStatus: "permission_missing",
    })).toBe("permission_missing");
    expect(getLocationStatusAfterSuccessfulSync({
      ...successfulSync,
      requestTrackingStatus: "running",
      currentTrackingStatus: "stopped",
    })).toBe("stopped");

    expect(driverAppSource).toContain("setLocationStatus((currentTrackingStatus) => getLocationStatusAfterSuccessfulSync({");
    expect(driverAppSource).toContain("requestTrackingStatus: locationStatus");
    expect(driverAppSource).toContain("if (captureRemainsActive && currentWork)");
  });

  it("stops the local capture loop immediately after authoritative break, end, or issue actions", () => {
    expect(getLocationStatusAfterWorkAction("take_break", "running")).toBe("paused");
    expect(getLocationStatusAfterWorkAction("end", "running")).toBe("stopped");
    expect(getLocationStatusAfterWorkAction("issue", "running")).toBe("stopped");
    expect(getLocationStatusAfterWorkAction("add_proof_note", "running")).toBe("running");
    expect(getLocationStatusAfterWorkAction("resume", "paused")).toBe("paused");

    expect(driverAppSource).not.toContain('await handleStopLocationProof("work_ended")');
    expect(driverAppSource).not.toContain('await handleStopLocationProof("break_started")');
  });

  it("offers manual capture only while both work and Location Proof are running", () => {
    expect(driverAppSource).toContain('async function handleSaveLocationNow()');
    expect(driverAppSource).toContain('if (!locationSessionId || locationStatus !== "running" || currentStatus !== "running")');
    expect(driverAppSource).toContain('locationSessionId && locationStatus === "running" && currentStatus === "running" ? <SecondaryButton');
    expect(driverAppSource).toContain('onPress={() => void handleSaveLocationNow()}');
  });

  it("keeps offline points scoped to the exact fake work, day, assignment, driver, vehicle, and session", () => {
    const point = fakePoint("point-fake-1");
    const scope = {
      trackingSessionId: point.tracking_session_id,
      adWorkId: point.ad_work_id,
      adWorkDayId: point.ad_work_day_id,
      assignmentId: point.assignment_id,
      driverId: point.driver_id,
      vehicleId: point.vehicle_id,
    };

    expect(isPointForLocationScope(point, scope)).toBe(true);
    expect(isPointForLocationScope(point, { ...scope, trackingSessionId: "session-fake-2" })).toBe(false);
    expect(isPointForLocationScope(point, { ...scope, adWorkId: "work-fake-2" })).toBe(false);
    expect(isPointForLocationScope(point, { ...scope, driverId: "driver-fake-2" })).toBe(false);
  });

  it("keeps the first payload for a client id and removes accepted duplicates idempotently", () => {
    const original = fakePoint("point-fake-1");
    const changedDuplicate = fakePoint("point-fake-1", { accuracy: 999 });
    const buffered = mergeBufferedLocationPoint([], original);
    const deduplicated = mergeBufferedLocationPoint(buffered, changedDuplicate);

    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0]).toEqual(original);
    expect(removeAcceptedLocationPoints(deduplicated, ["point-fake-1", "point-fake-1"])).toEqual([]);
  });

  it("bounds automatic retry, supports explicit Sync Now, and handles response-loss duplicates", () => {
    let buffered = [fakePoint("point-fake-1")];
    for (let retry = 0; retry < maxLocationSyncRetries; retry += 1) {
      buffered = markLocationPointsFailed(buffered, ["point-fake-1"], `2026-08-23T00:00:0${retry}.000Z`);
    }

    expect(selectLocationPointsForSync(buffered, false)).toEqual([]);
    expect(selectLocationPointsForSync(buffered, true)).toEqual(buffered);

    const afterServerDuplicateAcknowledgement = removeAcceptedLocationPoints(
      buffered,
      ["point-fake-1"],
    );
    expect(afterServerDuplicateAcknowledgement).toEqual([]);
  });

  it("drops malformed buffer entries instead of retrying untrusted local data", () => {
    const valid = fakePoint("point-fake-1");
    const invalidRetry = fakePoint("point-fake-2", { retry_count: -1 });
    const parsed = parseBufferedLocationPoints(JSON.stringify([valid, invalidRetry, { unexpected: true }]));

    expect(parsed).toEqual([valid]);
    expect(parseBufferedLocationPoints("not-json")).toEqual([]);
    expect(parseBufferedLocationPoints(JSON.stringify({ point: valid }))).toEqual([]);
  });
});
