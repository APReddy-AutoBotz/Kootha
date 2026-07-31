import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  M22RuleWorkerRuntime,
  M22_RULE_QUEUE_BATCH_SIZE,
  M22_RULE_QUEUE_MAX_ITERATIONS,
  M22_RULE_THEORETICAL_CAPACITY_PER_MINUTE,
  M22_RULE_WORKER_TIMEOUT_MS,
  runM22RuleWorker,
} from "../netlify/functions/_m22/rule-worker";
import {
  classifyM22AdapterRejection,
  classifyM22AuthenticationFailure,
  recordM22AdapterRejectionBatch,
  recordM22AuthenticationFailure,
  safeM22AuthenticationFingerprint,
} from "../netlify/functions/_m22/safe-signals";
import { SupabaseServerRuntimeV1 } from "../netlify/functions/_telemetry/supabase-runtime-v2";

const root = resolve(import.meta.dirname, "..");
const adminSource = readFileSync(resolve(root, "apps/web/src/admin-m22.tsx"), "utf8");
const migration = readFileSync(resolve(root, "supabase/migrations/20260728010000_m22_tracking_health_deterministic_alerts.sql"), "utf8");
const workerSource = readFileSync(resolve(root, "netlify/functions/m22-rule-worker.ts"), "utf8");

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("M22 worker v1 contract and capacity", () => {
  it("keeps the scheduled worker private, disabled by default, and inside the 8 second boundary", () => {
    expect(workerSource).toContain('process.env.M22_RULE_ENGINE_ENABLED !== "true"');
    expect(workerSource).toContain('schedule: "* * * * *"');
    expect(workerSource).not.toContain("path:");
    expect(M22_RULE_WORKER_TIMEOUT_MS).toBe(8_000);
    expect(M22_RULE_QUEUE_BATCH_SIZE).toBe(200);
    expect(M22_RULE_QUEUE_MAX_ITERATIONS).toBe(4);
    expect(M22_RULE_THEORETICAL_CAPACITY_PER_MINUTE).toBe(800);
  });

  it("consumes the exact SQL response shapes, sweeps first, and reports retry activity as partial failure", async () => {
    const requests: Array<{ name: string; body: Record<string, unknown> }> = [];
    const replies = [
      { devices_considered: 250, signals_enqueued: 13 },
      { claimed: 200, completed: 199, retry_or_failed: 1 },
      { claimed: 17, completed: 17, retry_or_failed: 0 },
      { queue_rows_deleted: 4, signal_rows_deleted: 3, auth_rows_deleted: 2, assessment_rows_deleted: 1, state_rows_deleted: 5 },
    ];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ name: String(input).split("/").at(-1)!, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify(replies[requests.length - 1]), { status: 200 });
    }));
    const result = await runM22RuleWorker(
      new M22RuleWorkerRuntime("https://example.invalid", "service-role-test-only"),
      { M22_HEALTH_SWEEP_BATCH_SIZE: "9999", M22_RETENTION_BATCH_SIZE: "9999" },
    );
    expect(requests.map((request) => request.name)).toEqual([
      "m22_run_health_sweep", "m22_process_rule_queue", "m22_process_rule_queue", "m22_compact_operational_rows",
    ]);
    expect(requests[0]?.body.p_batch_size).toBe(500);
    expect(requests[1]?.body.p_batch_size).toBe(200);
    expect(result).toEqual({
      contractVersion: "m22-worker-v1", workerOk: false, workerStatus: "partial_failure",
      queueClaimed: 217, queueCompleted: 216, queueRetryOrFailed: 1,
      devicesConsidered: 250, sweepSignalsEnqueued: 13, operationalRowsCompacted: 15,
    });
  });

  it.each([
    { claimed: 1, completed: 1 },
    { claimed: -1, completed: 0, retry_or_failed: 0 },
    { claimed: 1, completed: 0, retry_or_failed: 0 },
    { claimed: 1.5, completed: 1.5, retry_or_failed: 0 },
  ])("fails closed for malformed queue result %#", async (invalid) => {
    const replies = [{ devices_considered: 1, signals_enqueued: 0 }, invalid]; let index = 0;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(replies[index++]), { status: 200 })));
    await expect(runM22RuleWorker(
      new M22RuleWorkerRuntime("https://example.invalid", "service-role-test-only"), {},
    )).rejects.toThrow(/contract_invalid/);
  });

  it("models sustained load, sweep overhead, retry rows, a 10x burst, and one interrupted invocation", () => {
    const capacity = M22_RULE_THEORETICAL_CAPACITY_PER_MINUTE;
    const sustainedPerMinute = 100 + 25 + 5;
    let backlog = 0; let oldestAgeMinutes = 0;
    for (let minute = 0; minute < 60; minute += 1) {
      backlog += sustainedPerMinute;
      backlog = Math.max(0, backlog - capacity);
      oldestAgeMinutes = backlog === 0 ? 0 : oldestAgeMinutes + 1;
    }
    expect(backlog).toBe(0);
    backlog += 1_000 + 25 + 100;
    backlog = Math.max(0, backlog - capacity);
    expect(backlog).toBe(325);
    backlog += sustainedPerMinute; oldestAgeMinutes += 1; // interrupted worker
    backlog += sustainedPerMinute; oldestAgeMinutes += 1;
    backlog = Math.max(0, backlog - capacity);
    expect(backlog).toBe(0);
    expect(oldestAgeMinutes).toBeLessThanOrEqual(2);
    expect(capacity - sustainedPerMinute).toBe(670);
  });
});

describe("M22 bounded sanitized signals", () => {
  it("classifies only rule-worthy safe categories", () => {
    expect(classifyM22AdapterRejection({ position: { latitude: 91, longitude: 10 } }, "canonical_event_invalid")).toBe("invalid_coordinate");
    expect(classifyM22AdapterRejection({ observations: [{ metric: "vendor-private" }] }, "sensor_observation_unsupported")).toBe("unsupported_sensor_observation");
    expect(classifyM22AuthenticationFailure({ ok: false, externalReasonCode: "authentication_failed", internalReasonCode: "credential_secret_invalid" })).toBe("secret_invalid");
  });

  it("does not fingerprint raw presented secrets and scopes the safe digest by reason", () => {
    const key = "test-only-fingerprint-key-with-at-least-thirty-two-characters";
    const first = safeM22AuthenticationFingerprint("Bearer first-secret", key, "secret_invalid");
    const second = safeM22AuthenticationFingerprint("Bearer second-secret", key, "secret_invalid");
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).toBe(second);
    expect(first).not.toContain("secret");
    expect(safeM22AuthenticationFingerprint(null, key, "presentation_missing")).not.toBe(first);
  });

  it("collapses up to ten adapter rejections into one bounded RPC", async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ signals_enqueued: 2 }), { status: 200 });
    }));
    await recordM22AdapterRejectionBatch(
      new SupabaseServerRuntimeV1("https://example.invalid", "service-role-test-only"),
      { authenticatedDeviceId: "00000000-0000-0000-0000-000000000002" } as never,
      Array.from({ length: 10 }, (_, index) => index % 2 === 0
        ? { rawEvent: { position: { latitude: 91, longitude: 10 } }, reasonCode: "canonical_event_invalid" }
        : { rawEvent: { observations: [{}] }, reasonCode: "sensor_observation_unsupported" }),
      "2026-07-28T00:00:00.000Z", new AbortController().signal,
    );
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ p_invalid_coordinate_count: 5, p_unsupported_sensor_count: 5 });
  });

  it("auth aggregation call contains no raw presentation, coordinate, IP, or credential identifier", async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify(null), { status: 200 });
    }));
    await recordM22AuthenticationFailure(
      new SupabaseServerRuntimeV1("https://example.invalid", "service-role-test-only"),
      "credential_unknown", "a".repeat(64), "2026-07-28T00:00:01.000Z", new AbortController().signal,
    );
    expect(JSON.stringify(bodies)).not.toMatch(/authorization|latitude|longitude|ip_address|credential_key_id/i);
  });
});

describe("M22 safe admin boundary", () => {
  it("uses only versioned bounded RPCs and does not prefetch technical values", () => {
    expect(adminSource).toContain("admin_get_m22_tracking_health_v1");
    expect(adminSource).toContain("admin_list_m22_alerts_v1");
    expect(adminSource).toContain("admin_get_m22_alert_detail_v1");
    expect(adminSource).toContain("admin_get_m22_alert_technical_values_v1");
    expect(adminSource).not.toContain("tracking_mode=eq.phone");
    expect(adminSource).not.toContain("Ã‚Â·");
    expect(migration).toContain("'contractVersion','m22-admin-v1'");
    expect(migration).toContain("'technicalValuesAvailable'");
    expect(migration).toContain("alert_technical_values_viewed");
  });
});
