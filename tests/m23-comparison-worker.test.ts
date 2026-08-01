import { afterEach, describe, expect, it, vi } from "vitest";
import {
  M23_COMPARISON_QUEUE_BATCH_SIZE,
  M23_COMPARISON_QUEUE_MAX_ITERATIONS,
  M23_COMPARISON_WORKER_TIMEOUT_MS,
  M23ComparisonWorkerRuntime,
  runM23ComparisonWorker,
} from "../netlify/functions/_m23/comparison-worker";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("M23 bounded comparison worker", () => {
  it("is disabled by the handler by default and stays within the bounded queue contract", () => {
    expect(M23_COMPARISON_QUEUE_BATCH_SIZE).toBe(50);
    expect(M23_COMPARISON_QUEUE_MAX_ITERATIONS).toBe(4);
    expect(M23_COMPARISON_WORKER_TIMEOUT_MS).toBe(8_000);
  });

  it("drains bounded pages and reports retry activity without leaking evidence", async () => {
    const requests: Array<{ name: string; body: Record<string, unknown> }> = [];
    const replies = [
      { claimed: 50, completed: 50, retry_or_failed: 0 },
      { claimed: 3, completed: 2, retry_or_failed: 1 },
    ];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ name: String(input).split("/").at(-1) ?? "", body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify(replies[requests.length - 1]), { status: 200 });
    }));
    const result = await runM23ComparisonWorker(
      new M23ComparisonWorkerRuntime("https://example.invalid", "service-role-test-only"),
    );
    expect(requests).toHaveLength(2);
    expect(requests[0]?.name).toBe("m23_process_comparison_queue");
    expect(requests[0]?.body.p_batch_size).toBe(50);
    expect(result).toMatchObject({ workerOk: false, workerStatus: "partial_failure", queueClaimed: 53, queueCompleted: 52, queueRetryOrFailed: 1 });
    expect(JSON.stringify(requests)).not.toMatch(/latitude|longitude|raw_payload|credential/i);
  });

  it("fails closed when SQL returns an inconsistent count contract", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ claimed: 2, completed: 1, retry_or_failed: 0 }), { status: 200 })));
    await expect(runM23ComparisonWorker(
      new M23ComparisonWorkerRuntime("https://example.invalid", "service-role-test-only"),
    )).rejects.toThrow("m23_queue_contract_invalid");
  });
});
