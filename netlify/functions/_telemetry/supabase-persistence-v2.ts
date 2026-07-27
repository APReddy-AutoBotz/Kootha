import type {
  AdapterAuthenticationContextV1,
  CanonicalTelemetryEventV1,
} from "../../../packages/shared/src/physicalTelemetry/contracts";
import type { SafeTelemetryEventResultV1 } from "./http-host-v2";
import { SupabaseServerRuntimeV1 } from "./supabase-runtime-v2";

const SAFE_DISPOSITIONS = new Set([
  "accepted_live",
  "accepted_delayed",
  "health_only",
  "duplicate",
  "duplicate_conflict",
  "rejected",
]);

function firstRecord(value: unknown): Record<string, unknown> | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "object" && first !== null && !Array.isArray(first)
    ? (first as Record<string, unknown>)
    : undefined;
}

export async function persistWithSupabaseV1(
  event: CanonicalTelemetryEventV1,
  authentication: AdapterAuthenticationContextV1,
  runtime: SupabaseServerRuntimeV1,
  signal: AbortSignal,
): Promise<SafeTelemetryEventResultV1> {
  const credentialId = (authentication as { credentialId?: unknown })
    .credentialId;
  if (typeof credentialId !== "string") {
    throw new Error("credential_context_invalid");
  }
  const row = firstRecord(
    await runtime.rpc(
      "m21_persist_telemetry_event",
      {
        p_credential_id: credentialId,
        p_adapter_id: event.adapter.id,
        p_adapter_version: event.adapter.version,
        p_idempotency_identity: event.idempotencyIdentity,
        p_content_hash: event.provenance.canonicalPayloadHash,
        p_raw_payload_hash: event.provenance.rawPayloadHash,
        p_client_event_id: event.clientEventId ?? event.vendorEventId ?? null,
        p_stream_epoch: event.stream?.epoch ?? null,
        p_sequence: event.stream?.sequence ?? null,
        p_captured_at: event.capturedAt,
        p_received_at: event.receivedAt,
        p_normalized_at: event.normalizedAt,
        p_latitude: event.position?.latitude ?? null,
        p_longitude: event.position?.longitude ?? null,
        p_altitude_meters: event.position?.altitudeMeters ?? null,
        p_accuracy_meters: event.position?.accuracyMeters ?? null,
        p_speed_mps: event.position?.speedMetersPerSecond ?? null,
        p_heading_degrees: event.position?.headingDegrees ?? null,
        p_satellites: event.position?.satellites ?? null,
        p_heartbeat: event.health?.heartbeat ?? null,
        p_battery_percent: event.health?.batteryPercent ?? null,
        p_external_power: event.health?.externalPower ?? null,
        p_firmware_version: event.health?.firmwareVersion ?? null,
        p_gps_fix: event.health?.gpsFix ?? null,
        p_gsm_signal_dbm: event.health?.gsmSignalDbm ?? null,
        p_observations: event.observations ?? [],
        p_quality: event.quality,
        p_source: event.provenance.source,
        p_synthetic: event.provenance.synthetic,
        p_processing_version: event.provenance.normalizationVersion,
      },
      signal,
    ),
  );
  const disposition =
    typeof row?.disposition === "string" && SAFE_DISPOSITIONS.has(row.disposition)
      ? (row.disposition as SafeTelemetryEventResultV1["disposition"])
      : undefined;
  const reasonCode =
    typeof row?.reason_code === "string" &&
    /^[a-z0-9_]{1,64}$/.test(row.reason_code)
      ? row.reason_code
      : undefined;
  if (
    disposition === undefined ||
    reasonCode === undefined ||
    typeof row?.retryable !== "boolean"
  ) {
    throw new Error("persistence_result_invalid");
  }
  return {
    ...(event.clientEventId === undefined
      ? {}
      : { clientEventId: event.clientEventId }),
    ...(event.vendorEventId === undefined
      ? {}
      : { sourceEventId: event.vendorEventId }),
    disposition,
    reasonCode,
    retryable: row.retryable,
  };
}
