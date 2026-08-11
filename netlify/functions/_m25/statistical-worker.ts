export const M25_STATISTICAL_QUEUE_BATCH_SIZE = 50;
export const M25_STATISTICAL_WORKER_MAX_CONCURRENCY = 4;
export const M25_STATISTICAL_QUEUE_MAX_ITERATIONS = 4;
export const M25_STATISTICAL_WORKER_TIMEOUT_MS = 8_000;
export const M25_STATISTICAL_WORKER_SOFT_DEADLINE_MS = 6_500;
export const M25_STATISTICAL_WORKER_COMPACTION_MIN_REMAINING_MS = 250;

export interface M25StatisticalWorkerSummaryV1 {
  readonly workerOk: boolean;
  readonly workerStatus: "disabled" | "ok" | "partial_failure";
  readonly queueClaimed: number;
  readonly featureSnapshotsBuilt: number;
  readonly baselinesEvaluated: number;
  readonly signalsEvaluated: number;
  readonly readinessAssessments: number;
  readonly queueRetryOrFailed: number;
  readonly compacted: number;
  readonly compactionFailed: boolean;
}

function emptySummary(): M25StatisticalWorkerSummaryV1 {
  return {
    workerOk: true,
    workerStatus: "ok",
    queueClaimed: 0,
    featureSnapshotsBuilt: 0,
    baselinesEvaluated: 0,
    signalsEvaluated: 0,
    readinessAssessments: 0,
    queueRetryOrFailed: 0,
    compacted: 0,
    compactionFailed: false,
  };
}

export function failedM25StatisticalWorkerSummary(): M25StatisticalWorkerSummaryV1 {
  return { ...emptySummary(), workerOk: false, workerStatus: "partial_failure" };
}

export class M25StatisticalWorkerRuntimeV1 {
  public constructor(private readonly url: string, private readonly serviceRoleKey: string) {}

  public async call(name: string, body: Record<string, unknown>, signal: AbortSignal): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.url.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: this.serviceRoleKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) throw new Error("m25_rpc_failed");
    const value = await response.json() as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("m25_rpc_contract_invalid");
    return value as Record<string, unknown>;
  }
}

function numberField(value: Record<string, unknown>, key: string): number {
  const result = value[key];
  return typeof result === "number" && Number.isFinite(result) && result >= 0 ? result : 0;
}

async function processPage(runtime: M25StatisticalWorkerRuntimeV1, signal: AbortSignal): Promise<M25StatisticalWorkerSummaryV1> {
  const result = await runtime.call("m25_process_statistical_queue", { p_batch_size: M25_STATISTICAL_QUEUE_BATCH_SIZE, p_now: new Date().toISOString() }, signal);
  return {
    ...emptySummary(),
    queueClaimed: numberField(result, "claimed"),
    featureSnapshotsBuilt: numberField(result, "feature_snapshots_built"),
    baselinesEvaluated: numberField(result, "baselines_evaluated"),
    signalsEvaluated: numberField(result, "signals_evaluated"),
    readinessAssessments: numberField(result, "readiness_assessments"),
    queueRetryOrFailed: numberField(result, "retry_or_failed"),
    workerOk: numberField(result, "retry_or_failed") === 0,
    workerStatus: numberField(result, "retry_or_failed") === 0 ? "ok" : "partial_failure",
  };
}

export async function runM25StatisticalWorkerV1(
  runtime: M25StatisticalWorkerRuntimeV1,
  now: () => number = Date.now,
): Promise<M25StatisticalWorkerSummaryV1> {
  const startedAt = now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), M25_STATISTICAL_WORKER_TIMEOUT_MS);
  const summary = emptySummary();
  let compactionFailed = false;
  try {
    for (let iteration = 0; iteration < M25_STATISTICAL_QUEUE_MAX_ITERATIONS; iteration += 1) {
      if (now() - startedAt >= M25_STATISTICAL_WORKER_SOFT_DEADLINE_MS) break;
      const wave = await Promise.allSettled(Array.from({ length: M25_STATISTICAL_WORKER_MAX_CONCURRENCY }, () => processPage(runtime, controller.signal)));
      for (const item of wave) {
        if (item.status === "fulfilled") {
          summary.queueClaimed += item.value.queueClaimed;
          summary.featureSnapshotsBuilt += item.value.featureSnapshotsBuilt;
          summary.baselinesEvaluated += item.value.baselinesEvaluated;
          summary.signalsEvaluated += item.value.signalsEvaluated;
          summary.readinessAssessments += item.value.readinessAssessments;
          summary.queueRetryOrFailed += item.value.queueRetryOrFailed;
          if (!item.value.workerOk) {
            summary.workerOk = false;
            summary.workerStatus = "partial_failure";
          }
        } else {
          summary.workerOk = false;
          summary.workerStatus = "partial_failure";
        }
      }
      if (summary.queueRetryOrFailed > 0 || summary.queueClaimed === 0) break;
    }
    if (now() - startedAt < M25_STATISTICAL_WORKER_SOFT_DEADLINE_MS - M25_STATISTICAL_WORKER_COMPACTION_MIN_REMAINING_MS) {
      try {
        const compaction = await runtime.call("m25_compact_operational_rows", { p_batch_size: 100, p_now: new Date().toISOString() }, controller.signal);
        summary.compacted = numberField(compaction, "deleted_rows");
      } catch {
        compactionFailed = true;
      }
    }
    summary.compactionFailed = compactionFailed;
    if (compactionFailed) {
      summary.workerOk = false;
      summary.workerStatus = "partial_failure";
    }
    return summary;
  } finally {
    clearTimeout(timeout);
  }
}

export function safeM25StatisticalWorkerResponseV1(summary: M25StatisticalWorkerSummaryV1, status = 200): Response {
  return new Response(JSON.stringify({
    workerOk: summary.workerOk,
    workerStatus: summary.workerStatus,
    queueClaimed: summary.queueClaimed,
    featureSnapshotsBuilt: summary.featureSnapshotsBuilt,
    baselinesEvaluated: summary.baselinesEvaluated,
    signalsEvaluated: summary.signalsEvaluated,
    readinessAssessments: summary.readinessAssessments,
    queueRetryOrFailed: summary.queueRetryOrFailed,
    compacted: summary.compacted,
    compactionFailed: summary.compactionFailed,
  }), { status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
