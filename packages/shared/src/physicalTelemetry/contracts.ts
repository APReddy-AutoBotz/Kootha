export const PHYSICAL_TELEMETRY_CONTRACT_VERSION_V1 = "1" as const;

export type TelemetryContractVersionV1 =
  typeof PHYSICAL_TELEMETRY_CONTRACT_VERSION_V1;

export type TelemetryTransportV1 =
  | "http"
  | "vendor_webhook"
  | "vendor_poll"
  | "mqtt"
  | "tcp"
  | "udp"
  | "simulator";

export interface IngressMessageV1 {
  readonly contractVersion: TelemetryContractVersionV1;
  readonly correlationId: string;
  readonly transport: TelemetryTransportV1;
  readonly receivedAt: string;
  readonly contentLengthBytes: number;
  readonly payload: unknown;
}

export interface IngressAcknowledgementV1 {
  readonly contractVersion: TelemetryContractVersionV1;
  readonly correlationId: string;
  readonly status: "accepted" | "partially_accepted" | "rejected";
  readonly acceptedCount: number;
  readonly rejectedCount: number;
  readonly retryable: boolean;
}

export interface IngressHostV1 {
  readonly contractVersion: TelemetryContractVersionV1;
  readonly hostKind:
    | "serverless_http"
    | "always_on_http"
    | "vendor_integration"
    | "protocol_gateway"
    | "simulator";
  acquire(): Promise<IngressMessageV1 | undefined>;
  acknowledge(acknowledgement: IngressAcknowledgementV1): Promise<void>;
}

export interface AdapterAuthenticationContextV1 {
  readonly authenticatedDeviceExternalId: string;
  readonly authenticationMethod:
    | "bearer_digest"
    | "hmac"
    | "vendor_signature"
    | "mutual_tls"
    | "synthetic";
  readonly credentialKeyId?: string;
}

export type AdapterAuthenticationResultV1 =
  | {
      readonly ok: true;
      readonly context: AdapterAuthenticationContextV1;
    }
  | {
      readonly ok: false;
      readonly reasonCode:
        | "authentication_missing"
        | "authentication_invalid"
        | "device_unknown"
        | "device_inactive";
    };

export type AdapterParseResultV1 =
  | {
      readonly ok: true;
      readonly events: readonly unknown[];
    }
  | {
      readonly ok: false;
      readonly reasonCode:
        | "payload_malformed"
        | "payload_too_large"
        | "batch_too_large"
        | "vendor_schema_invalid";
    };

export type AdapterNormalizationResultV1 =
  | {
      readonly ok: true;
      readonly event: CanonicalTelemetryEventV1;
    }
  | {
      readonly ok: false;
      readonly reasonCode: TelemetryRejectionReasonCodeV1;
    };

export interface TelemetryAdapterV1 {
  readonly contractVersion: TelemetryContractVersionV1;
  readonly adapterId: string;
  readonly adapterVersion: string;
  authenticate(message: IngressMessageV1): Promise<AdapterAuthenticationResultV1>;
  parse(message: IngressMessageV1): AdapterParseResultV1;
  normalize(
    vendorEvent: unknown,
    authentication: AdapterAuthenticationContextV1,
    receivedAt: string,
  ): AdapterNormalizationResultV1;
  acknowledge(
    results: readonly TelemetryProcessingResultV1[],
    correlationId: string,
  ): IngressAcknowledgementV1;
}

export interface CanonicalPositionV1 {
  readonly latitude: number;
  readonly longitude: number;
  readonly altitudeMeters?: number;
  readonly accuracyMeters?: number;
  readonly speedMetersPerSecond?: number;
  readonly headingDegrees?: number;
  readonly satellites?: number;
}

export interface CanonicalDeviceHealthV1 {
  readonly heartbeat: boolean;
  readonly batteryPercent?: number;
  readonly externalPower?: boolean;
  readonly firmwareVersion?: string;
  readonly gpsFix?: "none" | "two_dimensional" | "three_dimensional";
  readonly gsmSignalDbm?: number;
}

export type SensorObservationQualityV1 =
  | "good"
  | "degraded"
  | "unknown"
  | "invalid";

interface CanonicalSensorObservationBaseV1 {
  readonly contractVersion: TelemetryContractVersionV1;
  readonly capturedAt: string;
  readonly deviceExternalId: string;
  readonly source: "physical_device" | "simulator";
  readonly normalizationVersion: string;
  readonly quality: SensorObservationQualityV1;
  readonly synthetic: boolean;
}

export type CanonicalSensorObservationV1 =
  | (CanonicalSensorObservationBaseV1 & {
      readonly metric: "fuel_level";
      readonly value: number;
      readonly unit: "percentage";
    })
  | (CanonicalSensorObservationBaseV1 & {
      readonly metric: "temperature";
      readonly value: number;
      readonly unit: "celsius";
    })
  | (CanonicalSensorObservationBaseV1 & {
      readonly metric: "door_state";
      readonly value: "open" | "closed" | "unknown";
      readonly unit: "state";
    })
  | (CanonicalSensorObservationBaseV1 & {
      readonly metric: "vibration";
      readonly value: number;
      readonly unit: "meters_per_second_squared";
    })
  | (CanonicalSensorObservationBaseV1 & {
      readonly metric: "external_power" | "ignition" | "tamper";
      readonly value: boolean;
      readonly unit: "boolean";
    });

export interface CanonicalTelemetryEventV1 {
  readonly contractVersion: TelemetryContractVersionV1;
  readonly canonicalEventId: string;
  readonly idempotencyIdentity: string;
  readonly vendorEventId?: string;
  readonly deviceExternalId: string;
  readonly adapter: {
    readonly id: string;
    readonly version: string;
  };
  readonly stream?: {
    readonly epoch: string;
    readonly sequence: number;
  };
  readonly capturedAt: string;
  readonly receivedAt: string;
  readonly normalizedAt: string;
  readonly observedClockOffsetMs?: number;
  readonly position?: CanonicalPositionV1;
  readonly health?: CanonicalDeviceHealthV1;
  readonly observations?: readonly CanonicalSensorObservationV1[];
  readonly provenance: {
    readonly source: "physical_device" | "simulator";
    readonly normalizationVersion: string;
    readonly synthetic: boolean;
    readonly canonicalPayloadHash: string;
  };
}

export type TelemetryRejectionReasonCodeV1 =
  | "authentication_failed"
  | "device_inactive"
  | "canonical_event_invalid"
  | "sensor_observation_unsupported"
  | "event_identity_invalid"
  | "event_identity_conflict"
  | "sequence_replay_invalid"
  | "captured_time_invalid"
  | "captured_time_future_skew"
  | "captured_before_work_start"
  | "captured_after_work_end"
  | "work_not_released"
  | "device_vehicle_link_invalid"
  | "ad_work_assignment_invalid"
  | "event_time_evidence_ambiguous"
  | "delayed_backfill_expired";

export type TelemetryProcessingResultV1 =
  | {
      readonly contractVersion: TelemetryContractVersionV1;
      readonly disposition: "canonicalized";
      readonly reasonCode: "canonical_validation_passed";
      readonly eligible: true;
    }
  | {      readonly contractVersion: TelemetryContractVersionV1;
      readonly disposition: "accepted_live";
      readonly reasonCode: "inside_live_freshness_window";
      readonly freshness: "live";
      readonly offlineBackfill: false;
    }
  | {
      readonly contractVersion: TelemetryContractVersionV1;
      readonly disposition: "accepted_delayed";
      readonly reasonCode: "inside_delayed_backfill_window";
      readonly freshness: "degraded_freshness";
      readonly delayed: true;
      readonly offlineBackfill: true;
    }
  | {
      readonly contractVersion: TelemetryContractVersionV1;
      readonly disposition: "health_only";
      readonly reasonCode: "outside_active_work_location_discarded";
    }
  | {
      readonly contractVersion: TelemetryContractVersionV1;
      readonly disposition: "duplicate";
      readonly reasonCode: "duplicate_identical_content";
    }
  | {
      readonly contractVersion: TelemetryContractVersionV1;
      readonly disposition: "duplicate_conflict";
      readonly reasonCode: "event_identity_conflict";
    }
  | {
      readonly contractVersion: TelemetryContractVersionV1;
      readonly disposition: "rejected";
      readonly reasonCode: TelemetryRejectionReasonCodeV1;
    };
