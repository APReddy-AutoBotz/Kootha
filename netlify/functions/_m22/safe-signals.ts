import type { AdapterAuthenticationContextV1 } from "../../../packages/shared/src/physicalTelemetry/contracts";
import type { ServerAuthenticationResultV1 } from "../_telemetry/credential-verifier";
import { keyedRequestFingerprintV1 } from "../_telemetry/server-crypto";
import { SupabaseServerRuntimeV1 } from "../_telemetry/supabase-runtime-v2";

export type M22AdapterSignalReason = "invalid_coordinate" | "unsupported_sensor_observation";
export type M22AuthenticationSignalReason =
  | "presentation_missing"
  | "presentation_malformed"
  | "credential_unknown"
  | "secret_invalid"
  | "device_ineligible";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positionIsInvalid(rawEvent: unknown): boolean {
  if (!isRecord(rawEvent) || !isRecord(rawEvent.position)) return false;
  const latitude = rawEvent.position.latitude;
  const longitude = rawEvent.position.longitude;
  return typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180;
}

export function classifyM22AdapterRejection(
  rawEvent: unknown,
  reasonCode: string,
): M22AdapterSignalReason | undefined {
  if (reasonCode === "sensor_observation_unsupported") return "unsupported_sensor_observation";
  return reasonCode === "canonical_event_invalid" && positionIsInvalid(rawEvent)
    ? "invalid_coordinate"
    : undefined;
}

export function classifyM22AuthenticationFailure(
  result: ServerAuthenticationResultV1,
): M22AuthenticationSignalReason | undefined {
  if (result.ok) return undefined;
  switch (result.internalReasonCode) {
    case "presentation_missing":
    case "presentation_malformed":
    case "credential_unknown":
    case "device_ineligible":
      return result.internalReasonCode;
    case "credential_secret_invalid":
      return "secret_invalid";
    default:
      return undefined;
  }
}

export function safeM22AuthenticationFingerprint(
  authorization: string | null,
  fingerprintKey: string,
): string {
  return keyedRequestFingerprintV1(
    `m22-auth-v1\0${authorization ?? "presentation-missing"}`,
    fingerprintKey,
  );
}

export async function recordM22AdapterRejection(
  runtime: SupabaseServerRuntimeV1,
  authentication: AdapterAuthenticationContextV1,
  reasonCode: M22AdapterSignalReason,
  occurredAt: string,
  signal: AbortSignal,
): Promise<void> {
  const gpsDeviceId = (authentication as { authenticatedDeviceId?: unknown }).authenticatedDeviceId;
  if (typeof gpsDeviceId !== "string") return;
  await runtime.rpc("m22_record_sanitized_signal", {
    p_signal_kind: "adapter_rejection",
    p_reason_code: reasonCode,
    p_adapter_id: "kootha.generic_http",
    p_occurred_at: occurredAt,
    p_gps_device_id: gpsDeviceId,
    p_telemetry_receipt_id: null,
    p_safe_fingerprint: null,
  }, signal);
}

export async function recordM22AuthenticationFailure(
  runtime: SupabaseServerRuntimeV1,
  reasonCode: M22AuthenticationSignalReason,
  safeFingerprint: string,
  occurredAt: string,
  signal: AbortSignal,
): Promise<void> {
  if (!/^[0-9a-f]{64}$/.test(safeFingerprint)) throw new Error("m22_fingerprint_invalid");
  await runtime.rpc("m22_record_sanitized_signal", {
    p_signal_kind: "authentication_failure",
    p_reason_code: reasonCode,
    p_adapter_id: "kootha.generic_http",
    p_occurred_at: occurredAt,
    p_gps_device_id: null,
    p_telemetry_receipt_id: null,
    p_safe_fingerprint: safeFingerprint,
  }, signal);
}
