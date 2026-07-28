import { isIP } from "node:net";

import type { AdapterAuthenticationContextV1 } from "../../../packages/shared/src/physicalTelemetry/contracts";
import {
  authenticateTelemetryCredentialV1,
  type ServerAuthenticationResultV1,
  type TelemetryCredentialRecordV1,
  type TelemetryCredentialStoreV1,
} from "./credential-verifier";
import type {
  RateLimitResultV1,
  UnauthenticatedRateLimitReservationV1,
} from "./http-host-v2";
import { keyedRequestFingerprintV1 } from "./server-crypto";

type JsonRecord = Record<string, unknown>;

function firstRecord(value: unknown): JsonRecord | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "object" && first !== null && !Array.isArray(first)
    ? (first as JsonRecord)
    : undefined;
}

export class SupabaseServerRuntimeV1 {
  readonly #baseUrl: string;
  readonly #serviceRoleKey: string;

  constructor(baseUrl: string, serviceRoleKey: string) {
    this.#baseUrl = baseUrl.replace(/\/$/, "");
    this.#serviceRoleKey = serviceRoleKey;
  }

  async rpc(
    name: string,
    parameters: JsonRecord,
    signal: AbortSignal,
  ): Promise<unknown> {
    const response = await fetch(`${this.#baseUrl}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: this.#serviceRoleKey,
        authorization: `Bearer ${this.#serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(parameters),
      signal: AbortSignal.any([signal, AbortSignal.timeout(7_000)]),
    });
    if (!response.ok) throw new Error("server_rpc_failed");
    return response.json();
  }
}

class SupabaseTelemetryCredentialStoreV1
  implements TelemetryCredentialStoreV1
{
  readonly #runtime: SupabaseServerRuntimeV1;
  readonly #receivedAt: string;
  readonly #unauthenticatedReservationId: string;
  readonly #signal: AbortSignal;

  constructor(
    runtime: SupabaseServerRuntimeV1,
    receivedAt: string,
    unauthenticatedReservationId: string,
    signal: AbortSignal,
  ) {
    this.#runtime = runtime;
    this.#receivedAt = receivedAt;
    this.#unauthenticatedReservationId = unauthenticatedReservationId;
    this.#signal = signal;
  }

  async lookup(
    deviceExternalId: string,
    credentialKeyId: string,
  ): Promise<TelemetryCredentialRecordV1 | undefined> {
    const row = firstRecord(
      await this.#runtime.rpc(
        "m21_lookup_device_credential",
        {
          p_claimed_device_code: deviceExternalId,
          p_credential_key_id: credentialKeyId,
          p_received_at: this.#receivedAt,
        },
        this.#signal,
      ),
    );
    return row !== undefined &&
      typeof row.gps_device_id === "string" &&
      typeof row.credential_id === "string" &&
      (typeof row.verification_material_hash === "string" ||
        row.verification_material_hash === null) &&
      typeof row.eligible === "boolean"
      ? {
          deviceId: row.gps_device_id,
          credentialId: row.credential_id,
          verificationMaterialHash: row.verification_material_hash,
          eligible: row.eligible,
        }
      : undefined;
  }

  async markVerified(credentialId: string, verifiedAt: string): Promise<void> {
    const result = await this.#runtime.rpc(
      "m21_mark_credential_verified",
      {
        p_credential_id: credentialId,
        p_received_at: verifiedAt,
        p_reservation_id: this.#unauthenticatedReservationId,
      },
      this.#signal,
    );
    if ((Array.isArray(result) ? result[0] : result) !== true) {
      throw new Error("verification_update_failed");
    }
  }
}

export function authenticateWithSupabaseV1(
  request: Request,
  receivedAt: Date,
  runtime: SupabaseServerRuntimeV1,
  pepper: string,
  unauthenticatedReservationId: string,
  signal: AbortSignal,
): Promise<ServerAuthenticationResultV1> {
  return authenticateTelemetryCredentialV1(
    request.headers.get("authorization"),
    new SupabaseTelemetryCredentialStoreV1(
      runtime,
      receivedAt.toISOString(),
      unauthenticatedReservationId,
      signal,
    ),
    pepper,
    receivedAt,
  );
}

export function trustedNetlifyClientAddressV1(request: Request): string {
  const value = request.headers.get("x-nf-client-connection-ip")?.trim() ?? "";
  return value.length <= 45 && isIP(value) !== 0 ? value : "unknown";
}

export async function reserveSupabaseUnauthenticatedRateLimitV1(
  request: Request,
  receivedAt: Date,
  runtime: SupabaseServerRuntimeV1,
  fingerprintKey: string,
  signal: AbortSignal,
): Promise<UnauthenticatedRateLimitReservationV1> {
  const material = `netlify-http-v1\0${trustedNetlifyClientAddressV1(request)}`;
  const row = firstRecord(
    await runtime.rpc(
      "m21_reserve_unauthenticated_rate_limit",
      {
        p_key_fingerprint: keyedRequestFingerprintV1(material, fingerprintKey),
        p_observed_at: receivedAt.toISOString(),
      },
      signal,
    ),
  );
  if (
    row === undefined ||
    typeof row.allowed !== "boolean" ||
    (row.reservation_id !== null && typeof row.reservation_id !== "string")
  ) {
    throw new Error("rate_limit_failed");
  }
  return {
    allowed: row.allowed,
    retryAfterSeconds:
      typeof row.retry_after_seconds === "number" ? row.retry_after_seconds : 60,
    ...(typeof row.reservation_id === "string"
      ? { reservationId: row.reservation_id }
      : {}),
  };
}

export async function consumeSupabaseAuthenticatedRateLimitsV1(
  authentication: AdapterAuthenticationContextV1,
  requestCount: number,
  eventCount: number,
  receivedAt: Date,
  runtime: SupabaseServerRuntimeV1,
  fingerprintKey: string,
  signal: AbortSignal,
): Promise<RateLimitResultV1> {
  const internalDeviceId = (
    authentication as { authenticatedDeviceId?: unknown }
  ).authenticatedDeviceId;
  if (typeof internalDeviceId !== "string") {
    throw new Error("authentication_context_invalid");
  }
  const row = firstRecord(
    await runtime.rpc(
      "m21_consume_authenticated_rate_limits",
      {
        p_device_fingerprint: keyedRequestFingerprintV1(
          `device-v1\0${internalDeviceId}`,
          fingerprintKey,
        ),
        p_global_fingerprint: keyedRequestFingerprintV1(
          "global-v1",
          fingerprintKey,
        ),
        p_request_count: requestCount,
        p_event_count: eventCount,
        p_observed_at: receivedAt.toISOString(),
      },
      signal,
    ),
  );
  if (row === undefined || typeof row.allowed !== "boolean") {
    throw new Error("rate_limit_failed");
  }
  return {
    allowed: row.allowed,
    retryAfterSeconds:
      typeof row.retry_after_seconds === "number" ? row.retry_after_seconds : 60,
    reasonCode:
      typeof row.reason_code === "string" ? row.reason_code : "limit_exceeded",
    policyVersion:
      typeof row.policy_version === "string"
        ? row.policy_version
        : "m21-provisional-v1",
  };
}
