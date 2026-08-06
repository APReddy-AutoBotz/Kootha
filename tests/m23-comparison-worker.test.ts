import { afterEach, describe, expect, it, vi } from "vitest";
import {
  M23_COMPARISON_QUEUE_BATCH_SIZE,
  M23_COMPARISON_WORKER_MAX_CONCURRENCY,
  M23_COMPARISON_QUEUE_MAX_ITERATIONS,
  M23_COMPARISON_WORKER_TIMEOUT_MS,
  M23_COMPARISON_WORKER_COMPACTION_MIN_REMAINING_MS,
  M23ComparisonWorkerRuntime,
  runM23ComparisonWorker,
  safeM23ComparisonWorkerResponse,
} from "../netlify/functions/_m23/comparison-worker";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("M23 bounded comparison worker", () => {
  it("is disabled by the handler by default and stays within the bounded queue contract", () => {
    expect(M23_COMPARISON_QUEUE_BATCH_SIZE).toBe(1);
    expect(M23_COMPARISON_WORKER_MAX_CONCURRENCY).toBe(5);
    expect(M23_COMPARISON_QUEUE_MAX_ITERATIONS).toBe(4);
    expect(M23_COMPARISON_WORKER_TIMEOUT_MS).toBe(8_000);
    expect(M23_COMPARISON_WORKER_COMPACTION_MIN_REMAINING_MS).toBe(250);
  });

  it("drains bounded pages and reports retry activity without leaking evidence", async () => {
    const requests: Array<{ name: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const request = { name: String(input).split("/").at(-1) ?? "", body: JSON.parse(String(init?.body)) };
      requests.push(request);
      if (request.name === "m23_compact_comparison_detail") {
        return new Response(JSON.stringify({ deletedDetailRows: 7, deletedEvidenceRows: 3, batchSize: 100 }), { status: 200 });
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
    expect(result).toMatchObject({ workerOk: true, workerStatus: "ok", queueClaimed: 5, queueCompleted: 5, queueRetryOrFailed: 0, compacted: 7, evidenceCompacted: 3, compactionFailed: false });
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
    expect(result).toMatchObject({ workerOk: true, workerStatus: "ok", compacted: 0, evidenceCompacted: 0, compactionFailed: true });
  });

  it("keeps comparison success when compaction is aborted", async () => {
    const names: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const name = String(input).split("/").at(-1) ?? "";
      names.push(name);
      if (name === "m23_compact_comparison_detail") throw new DOMException("aborted", "AbortError");
      const queueRequestCount = names.filter((item) => item === "m23_process_comparison_queue").length;
      return new Response(JSON.stringify(
        queueRequestCount <= M23_COMPARISON_WORKER_MAX_CONCURRENCY
          ? { claimed: 1, completed: 1, retry_or_failed: 0 }
          : { claimed: 0, completed: 0, retry_or_failed: 0 },
      ), { status: 200 });
    }));
    const result = await runM23ComparisonWorker(
      new M23ComparisonWorkerRuntime("https://example.invalid", "service-role-test-only"),
    );
    expect(names.at(-1)).toBe("m23_compact_comparison_detail");
    expect(result).toMatchObject({
      workerOk: true,
      workerStatus: "ok",
      queueClaimed: 5,
      queueCompleted: 5,
      queueRetryOrFailed: 0,
      compactionAttempted: true,
      evidenceCompacted: 0,
      compactionFailed: true,
    });
  });

  it("skips compaction when the bounded soft-deadline budget is too small", async () => {
    const names: string[] = [];
    const now = vi.spyOn(Date, "now");
    now.mockImplementationOnce(() => 1_000)
      .mockImplementation(() => 1_000 + 6_500 - 1);
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const name = String(input).split("/").at(-1) ?? "";
      names.push(name);
      return new Response(JSON.stringify({ claimed: 0, completed: 0, retry_or_failed: 0 }), { status: 200 });
    }));
    const result = await runM23ComparisonWorker(
      new M23ComparisonWorkerRuntime("https://example.invalid", "service-role-test-only"),
    );
    expect(names.filter((name) => name === "m23_process_comparison_queue")).toHaveLength(M23_COMPARISON_WORKER_MAX_CONCURRENCY);
    expect(names).not.toContain("m23_compact_comparison_detail");
    expect(result).toMatchObject({ workerOk: true, workerStatus: "ok", compactionAttempted: false, compactionFailed: false });
    now.mockRestore();
  });

  it("returns a failed queue result without hiding its bounded counts", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ claimed: 1, completed: 0, retry_or_failed: 1 }), { status: 200 },
    )));
    const result = await runM23ComparisonWorker(
      new M23ComparisonWorkerRuntime("https://example.invalid", "service-role-test-only"),
    );
    expect(result).toMatchObject({ workerOk: false, workerStatus: "partial_failure", queueClaimed: 20, queueCompleted: 0, queueRetryOrFailed: 20 });
    const response = safeM23ComparisonWorkerResponse(result, 207);
    expect(await response.json()).toEqual(result);
  });

  it("fails closed when SQL returns an inconsistent count contract", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ claimed: 2, completed: 1, retry_or_failed: 0 }), { status: 200 })));
    await expect(runM23ComparisonWorker(
      new M23ComparisonWorkerRuntime("https://example.invalid", "service-role-test-only"),
    )).rejects.toThrow("m23_queue_contract_invalid");
  });

  it("observes every sibling request before failing a rejected queue wave", async () => {
    let queueCalls = 0;
    let delayedSettled = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      queueCalls += 1;
      if (queueCalls === 1) throw new Error("synthetic queue rejection");
      await new Promise((resolve) => setTimeout(resolve, 30));
      delayedSettled += 1;
      return new Response(JSON.stringify({ claimed: 1, completed: 1, retry_or_failed: 0 }), { status: 200 });
    }));
    await expect(runM23ComparisonWorker(
      new M23ComparisonWorkerRuntime("https://example.invalid", "service-role-test-only"),
    )).rejects.toThrow("m23_queue_wave_failed");
    expect(queueCalls).toBe(M23_COMPARISON_WORKER_MAX_CONCURRENCY);
    expect(delayedSettled).toBe(M23_COMPARISON_WORKER_MAX_CONCURRENCY - 1);
  });
});
