import { afterEach, describe, expect, it, vi } from "vitest";

import {
  authenticateTelemetryCredentialV1,
  type TelemetryCredentialStoreV1,
} from "../netlify/functions/_telemetry/credential-verifier";
import {
  createTelemetryHttpHandlerV1,
  HTTP_PROCESSING_TIMEOUT_MS,
  MAX_HTTP_BODY_BYTES,
  type TelemetryHttpHostDependenciesV1,
} from "../netlify/functions/_telemetry/http-host-v2";
import {
  authenticateWithSupabaseV1,
  consumeSupabaseAuthenticatedRateLimitsV1,
  SupabaseServerRuntimeV1,
  trustedNetlifyClientAddressV1,
} from "../netlify/functions/_telemetry/supabase-runtime-v2";
import { persistWithSupabaseV1 } from "../netlify/functions/_telemetry/supabase-persistence-v2";
import { deriveCredentialVerificationHashV1 } from "../netlify/functions/_telemetry/server-crypto";
import telemetryV1Handler from "../netlify/functions/telemetry-v1";

const NOW = new Date("2026-07-27T10:00:00.000Z");
const DEVICE = "SYNTH_DEVICE_01";
const KEY = "synthetic_key_01";
const SECRET = "s".repeat(43);
const PEPPER = "synthetic-test-pepper-not-a-production-secret";
const HEADER = `Bearer kt1.${Buffer.from(DEVICE).toString("base64url")}.${Buffer.from(KEY).toString("base64url")}.${SECRET}`;
const validEvent = {
  clientEventId: "client-001",
  capturedAt: "2026-07-27T09:59:45.000Z",
  streamEpoch: "boot-001",
  sequence: 1,
  health: { heartbeat: true },
};

function dependencies(
  overrides: Partial<TelemetryHttpHostDependenciesV1> = {},
): TelemetryHttpHostDependenciesV1 {
  return {
    now: () => NOW,
    correlationId: () => "00000000-0000-4000-8000-000000000021",
    authenticate: vi.fn(async () => ({
      ok: true as const,
      context: {
        authenticatedDeviceId: "00000000-0000-4000-8000-000000000022",
        authenticatedDeviceExternalId: DEVICE,
        authenticationMethod: "bearer_digest" as const,
        credentialKeyId: KEY,
        credentialId: "00000000-0000-4000-8000-000000000023",
      },
    })),
    reserveUnauthenticated: vi.fn(async () => ({
      allowed: true,
      retryAfterSeconds: 0,
      reservationId: "00000000-0000-4000-8000-000000000024",
    })),
    consumeAuthenticatedRateLimits: vi.fn(async () => ({
      allowed: true,
      retryAfterSeconds: 0,
      reasonCode: "allowed",
      policyVersion: "m21-provisional-v1",
    })),
    persist: vi.fn(async (event) => ({
      clientEventId: event.clientEventId,
      disposition: "accepted_live" as const,
      reasonCode: "inside_live_freshness_window",
      retryable: false,
    })),
    ...overrides,
  };
}

function request(payload: unknown, headers: HeadersInit = {}): Request {
  return new Request("https://example.test/api/telemetry/v1", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}

function requestWithBodyProbe(payload: unknown): {
  readonly incoming: Request;
  readonly bodyAccess: ReturnType<typeof vi.fn>;
} {
  const incoming = request(payload);
  const body = incoming.body;
  const bodyAccess = vi.fn(() => body);
  Object.defineProperty(incoming, "body", {
    configurable: true,
    get: bodyAccess,
  });
  return { incoming, bodyAccess };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("M21 DB-authoritative credential verification", () => {
  function store(eligible: boolean): TelemetryCredentialStoreV1 {
    return {
      lookup: vi.fn(async () => ({
        deviceId: "00000000-0000-4000-8000-000000000022",
        credentialId: "00000000-0000-4000-8000-000000000023",
        verificationMaterialHash: deriveCredentialVerificationHashV1(
          PEPPER,
          DEVICE,
          KEY,
          SECRET,
        ),
        eligible,
      })),
      markVerified: vi.fn(async () => undefined),
    };
  }

  it("accepts only a matching DB-eligible credential", async () => {
    expect(
      (
        await authenticateTelemetryCredentialV1(
          HEADER,
          store(true),
          PEPPER,
          NOW,
        )
      ).ok,
    ).toBe(true);
    expect(
      (
        await authenticateTelemetryCredentialV1(
          HEADER,
          store(false),
          PEPPER,
          NOW,
        )
      ).ok,
    ).toBe(false);
  });

  it("passes the exact one-shot reservation to the verification/refund RPC", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "m21_lookup_device_credential") {
        return [{
          gps_device_id: "00000000-0000-4000-8000-000000000022",
          credential_id: "00000000-0000-4000-8000-000000000023",
          verification_material_hash: deriveCredentialVerificationHashV1(
            PEPPER, DEVICE, KEY, SECRET,
          ),
          eligible: true,
        }];
      }
      if (name === "m21_mark_credential_verified") return true;
      throw new Error(`unexpected RPC: ${name}`);
    });
    const runtime = { rpc } as unknown as SupabaseServerRuntimeV1;
    const result = await authenticateWithSupabaseV1(
      request({}, { authorization: HEADER }), NOW, runtime, PEPPER,
      "00000000-0000-4000-8000-000000000024",
      new AbortController().signal,
    );
    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "m21_mark_credential_verified",
      {
        p_credential_id: "00000000-0000-4000-8000-000000000023",
        p_received_at: NOW.toISOString(),
        p_reservation_id: "00000000-0000-4000-8000-000000000024",
      },
      expect.any(AbortSignal),
    );
  });
  it("sends one atomic device/global limiter RPC with exact staged counts", async () => {
    const rpc = vi.fn(async () => [{
      allowed: true,
      retry_after_seconds: 0,
      reason_code: "rate_limit_ok",
      policy_version: "m21-pilot-v1",
    }]);
    const runtime = { rpc } as unknown as SupabaseServerRuntimeV1;
    await consumeSupabaseAuthenticatedRateLimitsV1(
      {
        authenticatedDeviceId: "00000000-0000-4000-8000-000000000022",
        authenticatedDeviceExternalId: DEVICE,
        authenticationMethod: "bearer_digest",
        credentialKeyId: KEY,
      },
      1,
      0,
      NOW,
      runtime,
      "synthetic-rate-limit-key-at-least-32-characters",
      new AbortController().signal,
    );
    expect(rpc).toHaveBeenCalledWith(
      "m21_consume_authenticated_rate_limits",
      {
        p_device_fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
        p_global_fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
        p_request_count: 1,
        p_event_count: 0,
        p_observed_at: NOW.toISOString(),
      },
      expect.any(AbortSignal),
    );
    const parameters = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(parameters.p_device_fingerprint).not.toBe(
      parameters.p_global_fingerprint,
    );
  });
  it("returns one external failure for missing, unknown, and invalid secrets", async () => {
    const unknown: TelemetryCredentialStoreV1 = {
      lookup: vi.fn(async () => undefined),
      markVerified: vi.fn(async () => undefined),
    };
    const results = await Promise.all([
      authenticateTelemetryCredentialV1(null, unknown, PEPPER, NOW),
      authenticateTelemetryCredentialV1(HEADER, unknown, PEPPER, NOW),
      authenticateTelemetryCredentialV1(
        HEADER.replace(SECRET, "x".repeat(43)),
        store(true),
        PEPPER,
        NOW,
      ),
    ]);
    for (const result of results) {
      expect(result).toMatchObject({
        ok: false,
        externalReasonCode: "authentication_failed",
      });
    }
  });
});

describe("M21 bounded HTTP runtime", () => {
  it.each(["GET", "PUT", "PATCH", "DELETE"])(
    "returns 405 for %s before disabled or missing server environment checks",
    async (method) => {
      vi.stubEnv("TELEMETRY_INGEST_ENABLED", "false");
      vi.stubEnv("SUPABASE_URL", "");
      vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
      vi.stubEnv("TELEMETRY_CREDENTIAL_PEPPER", "");
      vi.stubEnv("TELEMETRY_RATE_LIMIT_KEY", "");
      const response = await telemetryV1Handler(
        new Request("https://example.test/api/telemetry/v1", { method }),
      );
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
      expect(await response.json()).toMatchObject({
        status: "rejected",
        reasonCode: "method_not_allowed",
        retryable: false,
      });
    },
  );

  it("keeps unavailable POST responses safe when ingestion is disabled", async () => {
    vi.stubEnv("TELEMETRY_INGEST_ENABLED", "false");
    vi.stubEnv("SUPABASE_URL", "should-not-be-returned.example");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "should-not-be-returned");
    vi.stubEnv("TELEMETRY_CREDENTIAL_PEPPER", "should-not-be-returned");
    vi.stubEnv("TELEMETRY_RATE_LIMIT_KEY", "should-not-be-returned");
    const response = await telemetryV1Handler(request({}));
    const body = await response.text();
    expect(response.status).toBe(503);
    expect(JSON.parse(body)).toMatchObject({
      status: "rejected",
      reasonCode: "temporarily_unavailable",
      retryable: true,
    });
    expect(body).not.toContain("should-not-be-returned");
  });

  it("stops reading once the actual body exceeds 256 KiB", async () => {
    const response = await createTelemetryHttpHandlerV1(dependencies())(
      request("x".repeat(MAX_HTTP_BODY_BYTES + 1)),
    );
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      reasonCode: "request_too_large",
    });
  });

  it("persists valid siblings and returns a safe rejected result per invalid event", async () => {
    const fixture = dependencies();
    const response = await createTelemetryHttpHandlerV1(fixture)(
      request({
        contractVersion: "1",
        events: [
          validEvent,
          {
            ...validEvent,
            clientEventId: "invalid-coordinate",
            sequence: 2,
            position: { latitude: 999, longitude: 0 },
          },
        ],
      }),
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      status: "partially_accepted",
      acceptedCount: 1,
      rejectedCount: 1,
      results: [
        { clientEventId: "client-001", disposition: "accepted_live" },
        {
          clientEventId: "invalid-coordinate",
          disposition: "rejected",
          reasonCode: "canonical_event_invalid",
        },
      ],
    });
    expect(fixture.persist).toHaveBeenCalledOnce();
  });

  it("preserves a typed duplicate_conflict acknowledgement without unsafe fields", async () => {
    const fixture = dependencies({
      persist: vi.fn(async (event) => ({
        clientEventId: event.clientEventId,
        disposition: "duplicate_conflict" as const,
        reasonCode: "event_identity_conflict",
        retryable: false,
      })),
    });
    const response = await createTelemetryHttpHandlerV1(fixture)(
      request({ contractVersion: "1", events: [validEvent] }),
    );
    const body = await response.json();
    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      status: "rejected",
      acceptedCount: 0,
      rejectedCount: 1,
      results: [{
        clientEventId: "client-001",
        disposition: "duplicate_conflict",
        reasonCode: "event_identity_conflict",
        retryable: false,
      }],
    });
    expect(JSON.stringify(body)).not.toMatch(
      /(?:content_hash|raw_payload|latitude|longitude|receipt_id|credential_id|database_error)/i,
    );
  });

  it("decodes duplicate_conflict persistence results through the safe public type", async () => {
    const rpc = vi.fn(async () => [{
      disposition: "duplicate_conflict",
      reason_code: "event_identity_conflict",
      retryable: false,
      receipt_id: "00000000-0000-4000-8000-000000000099",
      content_hash: "must-not-escape",
      latitude: 17.385,
      database_error: "must-not-escape",
    }]);
    const runtime = { rpc } as unknown as SupabaseServerRuntimeV1;
    const result = await persistWithSupabaseV1(
      {
        adapter: { id: "generic-http", version: "1" },
        idempotencyIdentity: "synthetic-idempotency-identity",
        clientEventId: "client-001",
        capturedAt: "2026-07-27T09:59:45.000Z",
        receivedAt: "2026-07-27T10:00:00.000Z",
        normalizedAt: "2026-07-27T10:00:00.000Z",
        quality: "reported",
        provenance: {
          source: "physical_device",
          synthetic: true,
          normalizationVersion: "generic-http-v1",
          canonicalPayloadHash: "a".repeat(64),
          rawPayloadHash: "b".repeat(64),
        },
      },
      {
        authenticatedDeviceId: "00000000-0000-4000-8000-000000000022",
        authenticatedDeviceExternalId: DEVICE,
        authenticationMethod: "bearer_digest",
        credentialKeyId: KEY,
        credentialId: "00000000-0000-4000-8000-000000000023",
      },
      runtime,
      new AbortController().signal,
    );
    expect(result).toEqual({
      clientEventId: "client-001",
      disposition: "duplicate_conflict",
      reasonCode: "event_identity_conflict",
      retryable: false,
    });
  });

  it("retains invalid-auth reservations and never reaches authenticated limits", async () => {
    const fixture = dependencies({
      authenticate: vi.fn(async () => ({
        ok: false as const,
        externalReasonCode: "authentication_failed" as const,
        internalReasonCode: "credential_unknown" as const,
      })),
    });
    const response = await createTelemetryHttpHandlerV1(fixture)(request({}));
    expect(response.status).toBe(401);
    expect(fixture.reserveUnauthenticated).toHaveBeenCalledOnce();
    expect(fixture.authenticate).toHaveBeenCalledWith(
      expect.any(Request), NOW,
      "00000000-0000-4000-8000-000000000024",
      expect.any(AbortSignal),
    );
    expect(fixture.consumeAuthenticatedRateLimits).not.toHaveBeenCalled();
  });

  it("denies a preauth reservation before authentication or body access", async () => {
    const probed = requestWithBodyProbe({ contractVersion: "1", events: [validEvent] });
    const fixture = dependencies({
      reserveUnauthenticated: vi.fn(async () => ({
        allowed: false,
        retryAfterSeconds: 30,
      })),
    });
    const response = await createTelemetryHttpHandlerV1(fixture)(probed.incoming);
    expect(response.status).toBe(429);
    expect(fixture.authenticate).not.toHaveBeenCalled();
    expect(probed.bodyAccess).not.toHaveBeenCalled();
  });

  it("denies authenticated request limits before body access", async () => {
    const probed = requestWithBodyProbe({ contractVersion: "1", events: [validEvent] });
    const fixture = dependencies({
      consumeAuthenticatedRateLimits: vi.fn(async () => ({
        allowed: false,
        retryAfterSeconds: 15,
        reasonCode: "rate_limited",
        policyVersion: "m21-provisional-v1",
      })),
    });
    const response = await createTelemetryHttpHandlerV1(fixture)(probed.incoming);
    expect(response.status).toBe(429);
    expect(fixture.consumeAuthenticatedRateLimits).toHaveBeenCalledWith(
      expect.any(Object), 1, 0, NOW, expect.any(AbortSignal),
    );
    expect(probed.bodyAccess).not.toHaveBeenCalled();
  });

  it("charges request and event counts in exact staged order", async () => {
    const timeline: string[] = [];
    const fixture = dependencies({
      reserveUnauthenticated: vi.fn(async () => {
        timeline.push("reserve:unauthenticated:1:0");
        return {
          allowed: true,
          retryAfterSeconds: 0,
          reservationId: "00000000-0000-4000-8000-000000000024",
        };
      }),
      authenticate: vi.fn(async (_request, _receivedAt, reservationId) => {
        timeline.push(`authenticate:${reservationId}`);
        return {
          ok: true as const,
          context: {
            authenticatedDeviceId: "00000000-0000-4000-8000-000000000022",
            authenticatedDeviceExternalId: DEVICE,
            authenticationMethod: "bearer_digest" as const,
            credentialKeyId: KEY,
            credentialId: "00000000-0000-4000-8000-000000000023",
          },
        };
      }),
      consumeAuthenticatedRateLimits: vi.fn(
        async (_authentication, requestCount, eventCount) => {
          timeline.push(`authenticated:${requestCount}:${eventCount}`);
          return {
            allowed: true,
            retryAfterSeconds: 0,
            reasonCode: "allowed",
            policyVersion: "m21-provisional-v1",
          };
        },
      ),
    });
    const response = await createTelemetryHttpHandlerV1(fixture)(
      request({
        contractVersion: "1",
        events: [validEvent, { ...validEvent, sequence: 2 }],
      }),
    );
    expect(response.status).toBe(202);
    expect(timeline).toEqual([
      "reserve:unauthenticated:1:0",
      "authenticate:00000000-0000-4000-8000-000000000024",
      "authenticated:1:0",
      "authenticated:0:2",
    ]);
  });

  it("request-charges malformed bodies without event charging", async () => {
    const fixture = dependencies();
    const response = await createTelemetryHttpHandlerV1(fixture)(request("{"));
    expect(response.status).toBe(400);
    expect(fixture.consumeAuthenticatedRateLimits).toHaveBeenCalledTimes(1);
    expect(fixture.consumeAuthenticatedRateLimits).toHaveBeenCalledWith(
      expect.any(Object), 1, 0, NOW, expect.any(AbortSignal),
    );
  });

  it("bounds a slow multi-event request by the total processing deadline", async () => {
    vi.useFakeTimers();
    const fixture = dependencies({
      persist: vi.fn(
        async (_event, _authentication, _correlationId, signal) =>
          new Promise((resolve, reject) => {
            signal.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
            void resolve;
          }),
      ),
    });
    const pending = createTelemetryHttpHandlerV1(fixture)(
      request({
        contractVersion: "1",
        events: [validEvent, { ...validEvent, sequence: 2 }],
      }),
    );
    await vi.advanceTimersByTimeAsync(HTTP_PROCESSING_TIMEOUT_MS + 1);
    const response = await pending;
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      reasonCode: "temporarily_unavailable",
      retryable: true,
    });
    expect(fixture.persist).toHaveBeenCalledOnce();
  });

  it("uses only trusted Netlify client IP for unauthenticated buckets", () => {
    const first = request("{}", {
      "x-nf-client-connection-ip": "203.0.113.10",
      "x-forwarded-for": "198.51.100.1",
      "user-agent": "rotating-one",
    });
    const second = request("{}", {
      "x-nf-client-connection-ip": "203.0.113.10",
      "x-forwarded-for": "192.0.2.99",
      "user-agent": "rotating-two",
    });
    expect(trustedNetlifyClientAddressV1(first)).toBe(
      trustedNetlifyClientAddressV1(second),
    );
    expect(
      trustedNetlifyClientAddressV1(
        request("{}", { "x-forwarded-for": "198.51.100.1" }),
      ),
    ).toBe("unknown");
  });
});
