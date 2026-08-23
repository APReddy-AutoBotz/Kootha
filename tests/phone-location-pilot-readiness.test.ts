import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DriverApiError,
  getForegroundLocationDecision,
  isPointForLocationScope,
  markLocationPointsFailed,
  maxLocationSyncRetries,
  mergeBufferedLocationPoint,
  parseBufferedLocationPoints,
  removeAcceptedLocationPoints,
  selectLocationPointsForSync,
  shouldBufferLocationFailure,
} from "../apps/driver/src/locationProof";
import type { BufferedLocationPoint } from "../apps/driver/src/locationProof";

const driverAppSource = readFileSync("apps/driver/App.tsx", "utf8");
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
