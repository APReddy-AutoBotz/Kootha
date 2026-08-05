import { afterEach, describe, expect, it, vi } from "vitest";
import {
  M23_COMPARISON_QUEUE_BATCH_SIZE,
  M23_COMPARISON_WORKER_MAX_CONCURRENCY,
  M23_COMPARISON_QUEUE_MAX_ITERATIONS,
  M23_COMPARISON_WORKER_TIMEOUT_MS,
  M23ComparisonWorkerRuntime,
  runM23ComparisonWorker,
} from "../netlify/functions/_m23/comparison-worker";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("M23 bounded comparison worker", () => {
  it("is disabled by the handler by default and stays within the bounded queue contract", () => {
    expect(M23_COMPARISON_QUEUE_BATCH_SIZE).toBe(1);
    expect(M23_COMPARISON_WORKER_MAX_CONCURRENCY).toBe(5);
    expect(M23_COMPARISON_QUEUE_MAX_ITERATIONS).toBe(4);
    expect(M23_COMPARISON_WORKER_TIMEOUT_MS).toBe(8_000);
  });

  it("drains bounded pages and reports retry activity without leaking evidence", async () => {
    const requests: Array<{ name: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const request = { name: String(input).split("/").at(-1) ?? "", body: JSON.parse(String(init?.body)) };
      requests.push(request);
      if (request.name === "m23_compact_comparison_detail") {
        return new Response(JSON.stringify({ deletedDetailRows: 7, batchSize: 100 }), { status: 200 });
      }
      const queueRequestCount = requests.filter((item) => item.name === "m23_process_comparison_queue").length;
      return new Response(JSON.stringify(
        queueRequestCount <= M23_COMPARISON_WORKER_MAX_CONCURRENCY
          ? { claimed: 1, completed: 1, retry_or_failed: 0 }
          : { claimed: 0, completed: 0, retry_or_failed: 0 },
      ), { status: 200 });
    }));
    const result = await runM23ComparisonWorker(
      new M23ComparisonWorkerRuntime("https://example.invalid", "service-role-test-only"),
    );
    expect(requests.filter((item) => item.name === "m23_process_comparison_queue")).toHaveLength(10);
    expect(requests.at(-1)?.name).toBe("m23_compact_comparison_detail");
    expect(requests[0]?.body.p_batch_size).toBe(1);
    expect(result).toMatchObject({ workerOk: true, workerStatus: "ok", queueClaimed: 5, queueCompleted: 5, queueRetryOrFailed: 0, compacted: 7, compactionFailed: false });
    expect(JSON.stringify(requests)).not.toMatch(/latitude|longitude|raw_payload|credential/i);
  });

  it("keeps comparison success separate from a best-effort compaction failure", async () => {
    const names: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const name = String(input).split("/").at(-1) ?? "";
      names.push(name);
      if (name === "m23_compact_comparison_detail") return new Response("not-json", { status: 503 });
      return new Response(JSON.stringify({ claimed: 0, completed: 0, retry_or_failed: 0 }), { status: 200 });
    }));
    const result = await runM23ComparisonWorker(
      new M23ComparisonWorkerRuntime("https://example.invalid", "service-role-test-only"),
    );
    expect(names.filter((name) => name === "m23_process_comparison_queue")).toHaveLength(5);
    expect(names.at(-1)).toBe("m23_compact_comparison_detail");
    expect(result).toMatchObject({ workerOk: true, workerStatus: "ok", compacted: 0, compactionFailed: true });
  });

  it("fails closed when SQL returns an inconsistent count contract", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ claimed: 2, completed: 1, retry_or_failed: 0 }), { status: 200 })));
    await expect(runM23ComparisonWorker(
      new M23ComparisonWorkerRuntime("https://example.invalid", "service-role-test-only"),
    )).rejects.toThrow("m23_queue_contract_invalid");
  });
});
