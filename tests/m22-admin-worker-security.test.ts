import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  M22RuleWorkerRuntime,
  M22_RULE_WORKER_TIMEOUT_MS,
  runM22RuleWorker,
} from "../netlify/functions/_m22/rule-worker";
import {
  classifyM22AdapterRejection,
  classifyM22AuthenticationFailure,
  recordM22AdapterRejection,
  recordM22AuthenticationFailure,
  safeM22AuthenticationFingerprint,
} from "../netlify/functions/_m22/safe-signals";
import { SupabaseServerRuntimeV1 } from "../netlify/functions/_telemetry/supabase-runtime-v2";

const root = resolve(import.meta.dirname, "..");
const adminM22 = readFileSync(resolve(root, "apps/web/src/admin-m22.tsx"), "utf8");
const adminM22Css = readFileSync(resolve(root, "apps/web/src/admin-m22.css"), "utf8");
const workerSource = readFileSync(resolve(root, "netlify/functions/m22-rule-worker.ts"), "utf8");
const workerRuntime = readFileSync(resolve(root, "netlify/functions/_m22/rule-worker.ts"), "utf8");
const safeSignals = readFileSync(resolve(root, "netlify/functions/_m22/safe-signals.ts"), "utf8");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("M22 scheduled deterministic rule worker", () => {
  it("is disabled by default and has no public application route", () => {
    expect(workerSource).toContain('process.env.M22_RULE_ENGINE_ENABLED !== "true"');
    expect(workerSource).toContain("status: 204");
    expect(workerSource).toContain('schedule: "*/2 * * * *"');
    expect(workerSource).not.toContain("path:");
  });

  it("uses only service-role server credentials, bounded batches, timeout, and safe summaries", () => {
    expect(workerSource).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(workerSource).not.toContain("VITE_");
    expect(workerRuntime).toContain("p_batch_size");
    expect(workerRuntime).toContain("MAX_QUEUE_BATCH = 100");
    expect(workerRuntime).toContain("MAX_SWEEP_BATCH = 250");
    expect(M22_RULE_WORKER_TIMEOUT_MS).toBe(8_000);
    for (const forbidden of ["latitude", "longitude", "authorizationHeader", "customer", "raw_payload"]) {
      expect(workerRuntime.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it("calls queue before sweep with capped settings and returns counts only", async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return new Response(
        requests.length === 1
          ? JSON.stringify({ processed_count: 17, failed: 1, ignored_identifier: "never returned" })
          : JSON.stringify({ evaluated_count: 23, failure_count: 2 }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }));
    const result = await runM22RuleWorker(
      new M22RuleWorkerRuntime("https://example.invalid", "service-role-test-only"),
      { M22_RULE_QUEUE_BATCH_SIZE: "9999", M22_HEALTH_SWEEP_BATCH_SIZE: "9999" },
    );
    expect(requests.map((request) => request.url.split("/").at(-1))).toEqual([
      "m22_process_rule_queue", "m22_run_health_sweep",
    ]);
    expect(requests[0]?.body.p_batch_size).toBe(100);
    expect(requests[1]?.body.p_batch_size).toBe(250);
    expect(result).toEqual({ ok: true, queueProcessed: 17, sweepEvaluated: 23, failures: 3 });
    expect(JSON.stringify(result)).not.toContain("identifier");
  });
});

describe("M22 sanitized ingestion signals", () => {
  it("classifies only authenticated rule-worthy adapter rejections without retaining evidence", () => {
    expect(classifyM22AdapterRejection(
      { position: { latitude: 91, longitude: 10 } },
      "canonical_event_invalid",
    )).toBe("invalid_coordinate");
    expect(classifyM22AdapterRejection(
      { observations: [{ metric: "vendor-private" }] },
      "sensor_observation_unsupported",
    )).toBe("unsupported_sensor_observation");
    expect(classifyM22AdapterRejection(
      { position: { latitude: 10, longitude: 20 } },
      "canonical_event_invalid",
    )).toBeUndefined();
  });

  it("maps bounded authentication categories while preserving a keyed 64-hex fingerprint", () => {
    expect(classifyM22AuthenticationFailure({
      ok: false, externalReasonCode: "authentication_failed", internalReasonCode: "credential_secret_invalid",
    })).toBe("secret_invalid");
    const fingerprint = safeM22AuthenticationFingerprint(
      "Bearer raw-material-never-persisted",
      "test-only-fingerprint-key-with-at-least-thirty-two-characters",
    );
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprint).not.toContain("raw-material");
  });

  it("sends only constrained RPC fields and no body, coordinate, hint, key ID, token, or IP", async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify("00000000-0000-0000-0000-000000000001"), { status: 200 });
    }));
    const runtime = new SupabaseServerRuntimeV1("https://example.invalid", "service-role-test-only");
    const signal = new AbortController().signal;
    await recordM22AdapterRejection(
      runtime,
      {
        authenticatedDeviceId: "00000000-0000-0000-0000-000000000002",
        authenticatedDeviceExternalId: "not-forwarded",
        authenticationMethod: "bearer_digest",
        credentialKeyId: "not-forwarded",
      } as never,
      "invalid_coordinate",
      "2026-07-28T00:00:00.000Z",
      signal,
    );
    await recordM22AuthenticationFailure(
      runtime,
      "credential_unknown",
      "a".repeat(64),
      "2026-07-28T00:00:01.000Z",
      signal,
    );
    expect(bodies[0]).toEqual({
      p_signal_kind: "adapter_rejection",
      p_reason_code: "invalid_coordinate",
      p_adapter_id: "kootha.generic_http",
      p_occurred_at: "2026-07-28T00:00:00.000Z",
      p_gps_device_id: "00000000-0000-0000-0000-000000000002",
      p_telemetry_receipt_id: null,
      p_safe_fingerprint: null,
    });
    const serialized = JSON.stringify(bodies);
    for (const forbidden of ["not-forwarded", "latitude", "longitude", "raw", "token", "ip_address", "credential_key_id"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe("M22 admin health and alerts", () => {
  it("keeps source health separate and labels delayed/live evidence explicitly", () => {
    for (const required of [
      "Tracking Health", "Physical-device health", "Phone Location Proof health",
      "Current device health only", "Live", "Last live evidence is delayed",
      "Comparison", "Not evaluated", "Planned for M23",
    ]) expect(adminM22).toContain(required);
    expect(adminM22).toContain("Sources are not paired.");
  });

  it("implements bounded alert queues, filters, detail, and validated lifecycle actions", () => {
    for (const required of [
      "New", "Critical active", "Investigating", "Cleared, awaiting review", "Resolved recently",
      "Rule/type", "Source", "Condition", "Synthetic", "Rule version",
      "Acknowledge", "Start investigation", "Resolve", "Mark false alarm", "Ignore",
      "A safe reason and note are required.", "Confirm alert lifecycle change",
      "Lifecycle history", "Admin notes", "Audit history",
    ]) expect(adminM22).toContain(required);
    expect(adminM22).toContain("p_limit: 100");
    expect(adminM22).toContain("admin_transition_alert");
  });

  it("hides technical values behind explicit access and never requests coordinates", () => {
    expect(adminM22).toContain("Show technical values");
    expect(adminM22).toContain("Hide technical values");
    expect(adminM22).toContain("Coordinates, credentials, raw payloads, and authentication hints are not available");
    expect(adminM22).not.toMatch(/\b(lat|lng|latitude|longitude)\b\s*[:,]/);
  });

  it("adds Device Detail health without equating lifecycle, health, and proof readiness", () => {
    for (const required of [
      "Current Tracking Health", "Active registry status is not the same as Healthy or Proof Ready",
      "Latest live heartbeat", "Latest live telemetry", "Battery / power", "GPS / GSM",
      "Active alerts", "Highest severity", "Recent alert episodes", "Delayed evidence summary",
    ]) expect(adminM22).toContain(required);
  });

  it("contains no map, M23 comparison runtime, or customer-facing behavior", () => {
    expect(adminM22Css).not.toContain("@import");
    for (const forbidden of [
      "mapbox", "google.maps", "leaflet", "haversine", "customer_updates",
      "sendEmail", "sendSms", "sendWhatsApp", "pushNotification", "mismatch alert",
    ]) expect(adminM22.toLowerCase()).not.toContain(forbidden.toLowerCase());
    expect(adminM22).toContain("No customer notification is sent.");
  });

  it("keeps server signal and worker modules free of customer, map, and notification side effects", () => {
    const combined = `${workerSource}\n${workerRuntime}\n${safeSignals}`.toLowerCase();
    for (const forbidden of [
      "customer_updates", "final_proof_summaries", "public tracking", "mapbox",
      "leaflet", "haversine", "twilio", "sendgrid", "whatsapp", "mqtt", "udp", "tcp",
    ]) expect(combined).not.toContain(forbidden);
  });
});
