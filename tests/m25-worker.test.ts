import { afterEach, describe, expect, it, vi } from "vitest";
import {
  M25_STATISTICAL_QUEUE_BATCH_SIZE,
  M25_STATISTICAL_QUEUE_MAX_ITERATIONS,
  M25_STATISTICAL_WORKER_MAX_CONCURRENCY,
  M25StatisticalWorkerRuntimeV1,
  runM25StatisticalWorkerV1,
  safeM25StatisticalWorkerResponseV1,
} from "../netlify/functions/_m25/statistical-worker";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("M25 bounded statistical worker", () => {
  it("uses bounded queue waves and count-only output", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const name = String(input).split("/").at(-1)!; calls.push(name);
      if (name === "m25_compact_operational_rows") return new Response(JSON.stringify({ deleted_rows: 2 }), { status: 200 });
      return new Response(JSON.stringify({ claimed: 1, feature_snapshots_built: 1, baselines_evaluated: 0, signals_evaluated: 1, readiness_assessments: 1, retry_or_failed: 0 }), { status: 200 });
    }));
    const result = await runM25StatisticalWorkerV1(new M25StatisticalWorkerRuntimeV1("https://example.invalid", "service-role-test-only"));
    expect(M25_STATISTICAL_QUEUE_BATCH_SIZE).toBe(50);
    expect(M25_STATISTICAL_QUEUE_MAX_ITERATIONS).toBe(4);
    expect(M25_STATISTICAL_WORKER_MAX_CONCURRENCY).toBe(4);
    expect(calls.filter((name) => name === "m25_process_statistical_queue").length).toBeGreaterThan(0);
    expect(result).toMatchObject({ workerOk: true, featureSnapshotsBuilt: expect.any(Number), compacted: 2 });
    const response = safeM25StatisticalWorkerResponseV1(result);
    expect(await response.text()).not.toMatch(/latitude|longitude|secret|credential/i);
  });

  it("surfaces retry rows and compaction failures as partial failure", async () => {
    const names: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const name = String(input).split("/").at(-1)!; names.push(name);
      if (name === "m25_compact_operational_rows") throw new Error("compaction_unavailable");
      return new Response(JSON.stringify({ claimed: 1, feature_snapshots_built: 0, baselines_evaluated: 0, signals_evaluated: 0, readiness_assessments: 0, retry_or_failed: 1 }), { status: 200 });
    }));
    const result = await runM25StatisticalWorkerV1(new M25StatisticalWorkerRuntimeV1("https://example.invalid", "service-role-test-only"));
    expect(names.filter((name) => name === "m25_process_statistical_queue").length).toBe(4);
    expect(names).toContain("m25_compact_operational_rows");
    expect(result).toMatchObject({ workerOk: false, workerStatus: "partial_failure", queueRetryOrFailed: 4, compactionFailed: true });
  });
});
