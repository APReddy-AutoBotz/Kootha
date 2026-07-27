import {
  createTelemetryHttpHandlerV1,
  type TelemetryHttpHostDependenciesV1,
} from "./_telemetry/http-host-v2";
import { persistWithSupabaseV1 } from "./_telemetry/supabase-persistence-v2";
import {
  authenticateWithSupabaseV1,
  consumeSupabaseAuthenticatedRateLimitsV1,
  reserveSupabaseUnauthenticatedRateLimitV1,
  SupabaseServerRuntimeV1,
} from "./_telemetry/supabase-runtime-v2";
import { createCorrelationId } from "./_telemetry/server-crypto";

function unavailable(correlationId: string): Response {
  return new Response(
    JSON.stringify({
      contractVersion: "1",
      correlationId,
      status: "rejected",
      acceptedCount: 0,
      rejectedCount: 0,
      retryable: true,
      reasonCode: "temporarily_unavailable",
    }),
    {
      status: 503,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    },
  );
}

function environment():
  | {
      readonly runtime: SupabaseServerRuntimeV1;
      readonly credentialPepper: string;
      readonly rateLimitKey: string;
    }
  | undefined {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const credentialPepper = process.env.TELEMETRY_CREDENTIAL_PEPPER;
  const rateLimitKey = process.env.TELEMETRY_RATE_LIMIT_KEY;
  if (
    process.env.TELEMETRY_INGEST_ENABLED !== "true" ||
    !url ||
    !serviceRoleKey ||
    !credentialPepper ||
    credentialPepper.length < 32 ||
    !rateLimitKey ||
    rateLimitKey.length < 32
  ) {
    return undefined;
  }
  return {
    runtime: new SupabaseServerRuntimeV1(url, serviceRoleKey),
    credentialPepper,
    rateLimitKey,
  };
}

export default async function handler(request: Request): Promise<Response> {
  const correlationId = createCorrelationId();
  const server = environment();
  if (server === undefined) return unavailable(correlationId);
  const dependencies: TelemetryHttpHostDependenciesV1 = {
    now: () => new Date(),
    correlationId: createCorrelationId,
    authenticate: (
      incoming,
      receivedAt,
      unauthenticatedReservationId,
      signal,
    ) =>
      authenticateWithSupabaseV1(
        incoming,
        receivedAt,
        server.runtime,
        server.credentialPepper,
        unauthenticatedReservationId,
        signal,
      ),
    reserveUnauthenticated: (incoming, receivedAt, signal) =>
      reserveSupabaseUnauthenticatedRateLimitV1(
        incoming,
        receivedAt,
        server.runtime,
        server.rateLimitKey,
        signal,
      ),
    consumeAuthenticatedRateLimits: (
      authentication,
      requestCount,
      eventCount,
      receivedAt,
      signal,
    ) =>
      consumeSupabaseAuthenticatedRateLimitsV1(
        authentication,
        requestCount,
        eventCount,
        receivedAt,
        server.runtime,
        server.rateLimitKey,
        signal,
      ),
    persist: (event, authentication, _correlationId, signal) =>
      persistWithSupabaseV1(event, authentication, server.runtime, signal),
  };
  return createTelemetryHttpHandlerV1(dependencies)(request);
}

export const config = { path: "/api/telemetry/v1" };
