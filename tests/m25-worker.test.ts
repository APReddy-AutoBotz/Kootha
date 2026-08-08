import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
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
  it("requires immutable review evidence and exposes promotions through M22", () => {
    const closure = readFileSync("supabase/migrations/20260808010000_m24f_m25_release_closure.sql", "utf8");
    expect(closure).toContain("from public.m25_signal_review_history h");
    expect(closure).toContain("h.new_state=s.state");
    expect(closure).toContain("a.rule_id is not null or a.source='statistical_signal'");
    expect(closure).not.toContain("values('m25-statistical-signal-rule'");
  });

  it("keeps the database worker exact-scoped, unavailable-aware, and review-only", () => {
    const migration = readFileSync("supabase/migrations/20260807020000_m25_statistical_intelligence_foundation.sql", "utf8");
    expect(migration).toContain("r.ad_work_day_id=j.ad_work_day_id");
    expect(migration).toContain("r.adapter_version=j.adapter_version");
    expect(migration).toContain("d.model=j.device_model");
    expect(migration).toContain("then 'unavailable'");
    expect(migration).toContain("on conflict(baseline_version) do nothing");
    expect(migration).toContain("on conflict(source_snapshot_id) do nothing");
    const workerBody = migration.slice(migration.indexOf("create or replace function public.m25_process_statistical_queue"), migration.indexOf("create or replace function public.m25_compact_operational_rows"));
    expect(workerBody).not.toContain("insert into public.alerts");
  });

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
