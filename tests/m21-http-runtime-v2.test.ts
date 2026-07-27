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
import { trustedNetlifyClientAddressV1 } from "../netlify/functions/_telemetry/supabase-runtime-v2";
import { deriveCredentialVerificationHashV1 } from "../netlify/functions/_telemetry/server-crypto";

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
    consumeRateLimit: vi.fn(async () => ({
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

afterEach(() => {
  vi.useRealTimers();
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

  it("charges authenticated malformed requests to device and global limits", async () => {
    const fixture = dependencies();
    const response = await createTelemetryHttpHandlerV1(fixture)(
      request({
        contractVersion: "1",
        events: [{ ...validEvent, vehicleId: "spoofed" }],
      }),
    );
    expect(response.status).toBe(400);
    const scopes = vi
      .mocked(fixture.consumeRateLimit)
      .mock.calls.map((call) => call[0]);
    expect(scopes).toEqual(["device", "global"]);
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
