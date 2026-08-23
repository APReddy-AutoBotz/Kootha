import type { AdWorkExecutionDayStatus, TrackingSessionStatus } from "@kootha/shared";

export const maxLocationSyncRetries = 5;

export type BufferedLocationPoint = {
  local_id: string;
  client_point_id: string;
  tracking_session_id: string;
  ad_work_id: string;
  ad_work_day_id: string;
  assignment_id: string;
  driver_id: string;
  vehicle_id: string | null;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  captured_at: string;
  sync_status: "pending" | "sync_failed";
  retry_count: number;
  last_sync_attempt_at: string | null;
};

export type LocationPointScope = {
  trackingSessionId: string;
  adWorkId: string;
  adWorkDayId: string;
  assignmentId: string;
  driverId: string;
  vehicleId: string | null;
};

export type ForegroundLocationContext = {
  locationProofRequired: boolean;
  trackingSessionId: string | null;
  trackingStatus: TrackingSessionStatus;
  executionStatus: AdWorkExecutionDayStatus;
};

export type ForegroundLocationDecision = "capture" | "inactive" | "permission_missing";

export class DriverApiError extends Error {
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = "DriverApiError";
    this.status = status;
    this.retryable = status === null || isRetryableDriverApiStatus(status);
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isRetryableDriverApiStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function shouldBufferLocationFailure(error: unknown): boolean {
  return !(error instanceof DriverApiError) || error.retryable;
}

export function getForegroundLocationDecision(
  context: ForegroundLocationContext,
  permissionGranted: boolean,
): ForegroundLocationDecision {
  const active = context.locationProofRequired
    && Boolean(context.trackingSessionId)
    && context.trackingStatus === "running"
    && context.executionStatus === "running";

  if (!active) {
    return "inactive";
  }

  return permissionGranted ? "capture" : "permission_missing";
}

export function parseBufferedLocationPoints(value: string | null): BufferedLocationPoint[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((point): point is BufferedLocationPoint => {
      if (!point || typeof point !== "object") {
        return false;
      }

      const candidate = point as Partial<BufferedLocationPoint>;
      return typeof candidate.local_id === "string"
        && typeof candidate.client_point_id === "string"
        && typeof candidate.tracking_session_id === "string"
        && typeof candidate.ad_work_id === "string"
        && typeof candidate.ad_work_day_id === "string"
        && typeof candidate.assignment_id === "string"
        && typeof candidate.driver_id === "string"
        && (candidate.vehicle_id === null || typeof candidate.vehicle_id === "string")
        && isFiniteNumber(candidate.latitude)
        && isFiniteNumber(candidate.longitude)
        && (candidate.accuracy === null || isFiniteNumber(candidate.accuracy))
        && (candidate.speed === null || isFiniteNumber(candidate.speed))
        && (candidate.heading === null || isFiniteNumber(candidate.heading))
        && typeof candidate.captured_at === "string"
        && (candidate.sync_status === "pending" || candidate.sync_status === "sync_failed")
        && typeof candidate.retry_count === "number"
        && Number.isInteger(candidate.retry_count)
        && candidate.retry_count >= 0
        && (candidate.last_sync_attempt_at === null || typeof candidate.last_sync_attempt_at === "string");
    });
  } catch {
    return [];
  }
}

export function isPointForLocationScope(point: BufferedLocationPoint, scope: LocationPointScope): boolean {
  return point.tracking_session_id === scope.trackingSessionId
    && point.ad_work_id === scope.adWorkId
    && point.ad_work_day_id === scope.adWorkDayId
    && point.assignment_id === scope.assignmentId
    && point.driver_id === scope.driverId
    && point.vehicle_id === scope.vehicleId;
}

export function mergeBufferedLocationPoint(
  points: BufferedLocationPoint[],
  point: BufferedLocationPoint,
): BufferedLocationPoint[] {
  if (points.some((existing) => existing.client_point_id === point.client_point_id)) {
    return points;
  }

  return [...points, point];
}

export function markLocationPointsFailed(
  points: BufferedLocationPoint[],
  clientPointIds: Iterable<string>,
  attemptedAt: string,
): BufferedLocationPoint[] {
  const failedClientIds = new Set(clientPointIds);
  return points.map((point) => failedClientIds.has(point.client_point_id)
    ? {
        ...point,
        sync_status: "sync_failed",
        retry_count: point.retry_count + 1,
        last_sync_attempt_at: attemptedAt,
      }
    : point);
}

export function removeAcceptedLocationPoints(
  points: BufferedLocationPoint[],
  acceptedClientPointIds: Iterable<string>,
): BufferedLocationPoint[] {
  const accepted = new Set(acceptedClientPointIds);
  return points.filter((point) => !accepted.has(point.client_point_id));
}

export function selectLocationPointsForSync(
  points: BufferedLocationPoint[],
  force: boolean,
): BufferedLocationPoint[] {
  return points.filter((point) => force || point.retry_count < maxLocationSyncRetries);
}
