import type {
  AdapterAuthenticationContextV1,
  CanonicalTelemetryEventV1,
  IngressMessageV1,
} from "../../../packages/shared/src/physicalTelemetry/contracts";
import type { ServerAuthenticationResultV1 } from "./credential-verifier";
import {
  GenericHttpTelemetryAdapterV1,
  MAX_HTTP_EVENTS,
} from "./generic-http-adapter";

export const MAX_HTTP_BODY_BYTES = 256 * 1024;
export const HTTP_PROCESSING_TIMEOUT_MS = 8_000;

export interface SafeTelemetryEventResultV1 {
  readonly clientEventId?: string;
  readonly sourceEventId?: string;
  readonly disposition:
    | "accepted_live"
    | "accepted_delayed"
    | "health_only"
    | "duplicate"
    | "duplicate_conflict"
    | "rejected";
  readonly reasonCode: string;
  readonly retryable: boolean;
}

export interface RateLimitResultV1 {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
  readonly reasonCode: string;
  readonly policyVersion: string;
}

export interface TelemetryHttpHostDependenciesV1 {
  readonly now: () => Date;
  readonly correlationId: () => string;
  readonly authenticate: (
    request: Request,
    receivedAt: Date,
    signal: AbortSignal,
  ) => Promise<ServerAuthenticationResultV1>;
  readonly consumeRateLimit: (
    scope: "unauthenticated" | "device" | "global",
    request: Request,
    authentication: AdapterAuthenticationContextV1 | undefined,
    eventCount: number,
    receivedAt: Date,
    signal: AbortSignal,
  ) => Promise<RateLimitResultV1>;
  readonly persist: (
    event: CanonicalTelemetryEventV1,
    authentication: AdapterAuthenticationContextV1,
    correlationId: string,
    signal: AbortSignal,
  ) => Promise<SafeTelemetryEventResultV1>;
}

function json(
  status: number,
  body: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extraHeaders,
    },
  });
}

function error(
  status: number,
  correlationId: string,
  reasonCode: string,
  retryable = false,
  headers: Record<string, string> = {},
): Response {
  return json(
    status,
    {
      contractVersion: "1",
      correlationId,
      status: "rejected",
      acceptedCount: 0,
      rejectedCount: 0,
      retryable,
      reasonCode,
    },
    headers,
  );
}

function contentTypeIsJson(value: string | null): boolean {
  if (value === null) return false;
  const [mediaType, ...parameters] = value
    .split(";")
    .map((part) => part.trim().toLowerCase());
  return (
    mediaType === "application/json" &&
    parameters.every((parameter) => parameter === "charset=utf-8")
  );
}

function retryAfter(value: number): string {
  return String(
    Number.isFinite(value)
      ? Math.min(3_600, Math.max(1, Math.ceil(value)))
      : 60,
  );
}

async function readJsonBody(
  request: Request,
  signal: AbortSignal,
): Promise<
  | { readonly ok: true; readonly value: unknown; readonly byteLength: number }
  | { readonly ok: false; readonly reason: "too_large" | "malformed" }
> {
  if (request.body === null) return { ok: false, reason: "malformed" };
  const reader = request.body.getReader();
  const buffer = new Uint8Array(MAX_HTTP_BODY_BYTES);
  let byteLength = 0;
  let rejectAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", rejectAbort, { once: true });
  });
  try {
    while (true) {
      signal.throwIfAborted();
      const next = await Promise.race([reader.read(), aborted]);
      if (next.done) break;
      if (byteLength + next.value.byteLength > MAX_HTTP_BODY_BYTES) {
        await reader.cancel();
        return { ok: false, reason: "too_large" };
      }
      buffer.set(next.value, byteLength);
      byteLength += next.value.byteLength;
    }
  } finally {
    if (rejectAbort !== undefined) {
      signal.removeEventListener("abort", rejectAbort);
    }
    reader.releaseLock();
  }
  if (byteLength === 0) return { ok: false, reason: "malformed" };
  try {
    return {
      ok: true,
      value: JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          buffer.subarray(0, byteLength),
        ),
      ),
      byteLength,
    };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}

function safeReference(
  event: unknown,
  key: "clientEventId" | "sourceEventId",
): string | undefined {
  if (typeof event !== "object" || event === null) return undefined;
  const value = (event as Record<string, unknown>)[key];
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    !/[\u0000-\u001f\u007f]/.test(value)
    ? value
    : undefined;
}

function safeResult(
  result: SafeTelemetryEventResultV1,
): SafeTelemetryEventResultV1 {
  return {
    ...(result.clientEventId === undefined
      ? {}
      : { clientEventId: result.clientEventId.slice(0, 128) }),
    ...(result.sourceEventId === undefined
      ? {}
      : { sourceEventId: result.sourceEventId.slice(0, 128) }),
    disposition: result.disposition,
    reasonCode: result.reasonCode.slice(0, 64),
    retryable: result.retryable,
  };
}

function estimatedEventCount(payload: unknown): number {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !Array.isArray((payload as Record<string, unknown>).events)
  ) {
    return 1;
  }
  return Math.max(
    1,
    Math.min(
      MAX_HTTP_EVENTS,
      (payload as { events: readonly unknown[] }).events.length,
    ),
  );
}

export function createTelemetryHttpHandlerV1(
  dependencies: TelemetryHttpHostDependenciesV1,
): (request: Request) => Promise<Response> {
  const adapter = new GenericHttpTelemetryAdapterV1();
  return async (request: Request): Promise<Response> => {
    const correlationId = dependencies.correlationId();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      HTTP_PROCESSING_TIMEOUT_MS,
    );
    try {
      const receivedAt = dependencies.now();
      if (request.method !== "POST") {
        return error(405, correlationId, "method_not_allowed", false, {
          allow: "POST",
        });
      }
      if (!contentTypeIsJson(request.headers.get("content-type"))) {
        return error(415, correlationId, "unsupported_media_type");
      }
      if (
        (request.headers.get("content-encoding") ?? "identity")
          .trim()
          .toLowerCase() !== "identity"
      ) {
        return error(415, correlationId, "content_encoding_unsupported");
      }
      const declaredLength = request.headers.get("content-length");
      if (declaredLength !== null) {
        const length = Number(declaredLength);
        if (!Number.isSafeInteger(length) || length < 0) {
          return error(400, correlationId, "request_malformed");
        }
        if (length > MAX_HTTP_BODY_BYTES) {
          return error(413, correlationId, "request_too_large");
        }
      }
      const authentication = await dependencies.authenticate(
        request,
        receivedAt,
        controller.signal,
      );
      if (!authentication.ok) {
        const unauthenticatedLimit = await dependencies.consumeRateLimit(
          "unauthenticated",
          request,
          undefined,
          1,
          receivedAt,
          controller.signal,
        );
        if (!unauthenticatedLimit.allowed) {
          return error(429, correlationId, "rate_limited", true, {
            "retry-after": retryAfter(unauthenticatedLimit.retryAfterSeconds),
          });
        }
        return error(401, correlationId, "authentication_failed");
      }
      const body = await readJsonBody(request, controller.signal);
      const eventEstimate = body.ok ? estimatedEventCount(body.value) : 1;
      const limits = await Promise.all([
        dependencies.consumeRateLimit(
          "device",
          request,
          authentication.context,
          eventEstimate,
          receivedAt,
          controller.signal,
        ),
        dependencies.consumeRateLimit(
          "global",
          request,
          authentication.context,
          eventEstimate,
          receivedAt,
          controller.signal,
        ),
      ]);
      const denied = limits.find((limit) => !limit.allowed);
      if (denied !== undefined) {
        return error(429, correlationId, "rate_limited", true, {
          "retry-after": retryAfter(denied.retryAfterSeconds),
        });
      }
      if (!body.ok) {
        return error(
          body.reason === "too_large" ? 413 : 400,
          correlationId,
          body.reason === "too_large"
            ? "request_too_large"
            : "request_malformed",
        );
      }
      const receipt = {
        contractVersion: "1" as const,
        correlationId,
        hostReceivedAt: receivedAt.toISOString(),
      };
      const ingress: IngressMessageV1 = {
        contractVersion: "1",
        receipt,
        transport: "http",
        contentLengthBytes: body.byteLength,
        payload: body.value,
      };
      const parsed = adapter.parse(ingress);
      if (parsed.ok === false) {
        return error(
          parsed.reasonCode === "batch_too_large" ? 413 : 400,
          correlationId,
          parsed.reasonCode === "batch_too_large"
            ? "event_limit_exceeded"
            : "request_schema_invalid",
        );
      }
      const results: SafeTelemetryEventResultV1[] = [];
      for (const rawEvent of parsed.events) {
        controller.signal.throwIfAborted();
        const normalized = adapter.normalize(
          rawEvent,
          authentication.context,
          receipt.hostReceivedAt,
        );
        if (normalized.ok === false) {
          results.push({
            ...(safeReference(rawEvent, "clientEventId") === undefined
              ? {}
              : { clientEventId: safeReference(rawEvent, "clientEventId") }),
            ...(safeReference(rawEvent, "sourceEventId") === undefined
              ? {}
              : { sourceEventId: safeReference(rawEvent, "sourceEventId") }),
            disposition: "rejected",
            reasonCode: normalized.reasonCode,
            retryable: false,
          });
          continue;
        }
        results.push(
          safeResult(
            await dependencies.persist(
              normalized.event,
              authentication.context,
              correlationId,
              controller.signal,
            ),
          ),
        );
      }
      const rejectedCount = results.filter(
        (result) =>
          result.disposition === "rejected" ||
          result.disposition === "duplicate_conflict",
      ).length;
      const acceptedCount = results.length - rejectedCount;
      return json(202, {
        contractVersion: "1",
        correlationId,
        status:
          rejectedCount === 0
            ? "accepted"
            : acceptedCount === 0
              ? "rejected"
              : "partially_accepted",
        acceptedCount,
        rejectedCount,
        retryable: results.some((result) => result.retryable),
        results,
      });
    } catch {
      return error(503, correlationId, "temporarily_unavailable", true);
    } finally {
      clearTimeout(timeout);
    }
  };
}
