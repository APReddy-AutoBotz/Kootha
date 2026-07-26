import type { TelemetryContractVersionV1 } from "./contracts";

export interface EventTimeWorkResolutionRequestV1 {
  readonly contractVersion: TelemetryContractVersionV1;
  readonly authenticatedDeviceExternalId: string;
  readonly capturedAt: string;
}

export interface ResolvedEventTimeWorkContextV1 {
  readonly deviceId: string;
  readonly authenticatedDeviceExternalId: string;
  readonly deviceVehicleLinkId: string;
  readonly vehicleId: string;
  readonly adWorkAssignmentId: string;
  readonly adWorkId: string;
  readonly driverId: string;
  readonly driverAuthority: "ad_work_assignment";
  readonly workReleaseId: string;
  readonly releasedAt: string;
  readonly workDayId: string;
  readonly actualWorkStartedAt: string;
  readonly actualWorkEndedAt?: string;
  readonly physicalTrackingSessionId?: string;
}

export type EventTimeWorkResolutionNoMatchReasonCodeV1 =
  | "device_not_resolved"
  | "device_vehicle_link_not_resolved"
  | "ad_work_assignment_not_resolved"
  | "work_not_released"
  | "work_day_not_resolved"
  | "work_not_started";

export type EventTimeWorkResolutionAmbiguousReasonCodeV1 =
  | "device_resolution_ambiguous"
  | "device_vehicle_link_ambiguous"
  | "ad_work_assignment_ambiguous"
  | "work_release_ambiguous"
  | "work_day_ambiguous";

export type EventTimeWorkResolutionResultV1 =
  | {
      readonly contractVersion: TelemetryContractVersionV1;
      readonly outcome: "resolved";
      readonly reasonCode: "unique_event_time_match";
      readonly context: ResolvedEventTimeWorkContextV1;
    }
  | {
      readonly contractVersion: TelemetryContractVersionV1;
      readonly outcome: "no_match";
      readonly reasonCode: EventTimeWorkResolutionNoMatchReasonCodeV1;
    }
  | {
      readonly contractVersion: TelemetryContractVersionV1;
      readonly outcome: "ambiguous";
      readonly reasonCode: EventTimeWorkResolutionAmbiguousReasonCodeV1;
    };

/**
 * Host-neutral future boundary. Implementations resolve server-owned history;
 * callers cannot supply vehicle, driver, work, assignment, or session IDs.
 */
export interface EventTimeWorkResolverV1 {
  readonly contractVersion: TelemetryContractVersionV1;
  resolve(
    request: EventTimeWorkResolutionRequestV1,
  ): Promise<EventTimeWorkResolutionResultV1>;
}
