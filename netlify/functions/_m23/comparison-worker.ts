export const M23_COMPARISON_WORKER_CONTRACT_VERSION = "m23-comparison-worker-v1" as const;
export const M23_COMPARISON_WORKER_TIMEOUT_MS = 8_000;
export const M23_COMPARISON_WORKER_SOFT_DEADLINE_MS = 6_500;
export const M23_COMPARISON_QUEUE_BATCH_SIZE = 1;
export const M23_COMPARISON_WORKER_MAX_CONCURRENCY = 5;
export const M23_COMPARISON_QUEUE_MAX_ITERATIONS = 4;
export const M23_COMPARISON_WORKER_COMPACTION_MIN_REMAINING_MS = 250;

type JsonRecord = Record<string, unknown>;

export type M23ComparisonWorkerSummary = {
  readonly contractVersion: typeof M23_COMPARISON_WORKER_CONTRACT_VERSION;
  readonly workerOk: boolean;
  readonly workerStatus: "ok" | "partial_failure" | "failed";
  readonly queueClaimed: number;
  readonly queueCompleted: number;
  readonly queueRetryOrFailed: number;
  readonly compactionAttempted: boolean;
  readonly compacted: number;
  readonly evidenceCompacted: number;
  readonly compactionFailed: boolean;
};

function exactCounts(value: unknown): { claimed: number; completed: number; retry_or_failed: number } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("m23_queue_contract_invalid");
  }
  const row = value as JsonRecord;
  const counts = [row.claimed, row.completed, row.retry_or_failed];
  if (counts.some((count) => typeof count !== "number" || !Number.isSafeInteger(count) || count < 0)) {
    throw new Error("m23_queue_contract_invalid");
  }
  return {
    claimed: counts[0] as number,
    completed: counts[1] as number,
    retry_or_failed: counts[2] as number,
  };
}

export class M23ComparisonWorkerRuntime {
  readonly #baseUrl: string;
  readonly #serviceRoleKey: string;

  constructor(baseUrl: string, serviceRoleKey: string) {
    this.#baseUrl = baseUrl.replace(/\/$/, "");
    this.#serviceRoleKey = serviceRoleKey;
  }

  async rpc(name: string, parameters: JsonRecord, signal: AbortSignal): Promise<unknown> {
    const response = await fetch(`${this.#baseUrl}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: this.#serviceRoleKey,
        authorization: `Bearer ${this.#serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(parameters),
      signal,
    });
    if (!response.ok) throw new Error("m23_worker_rpc_failed");
    return response.json();
  }
}

export async function runM23ComparisonWorker(
  runtime: M23ComparisonWorkerRuntime,
): Promise<M23ComparisonWorkerSummary> {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeout = setTimeout(() => controller.abort(), M23_COMPARISON_WORKER_TIMEOUT_MS);
  let queueClaimed = 0;
  let queueCompleted = 0;
  let queueRetryOrFailed = 0;
  try {
    const now = new Date().toISOString();
    for (let iteration = 0; iteration < M23_COMPARISON_QUEUE_MAX_ITERATIONS; iteration += 1) {
      if (Date.now() - startedAt >= M23_COMPARISON_WORKER_SOFT_DEADLINE_MS) break;
      const settled = await Promise.allSettled(Array.from(
        { length: M23_COMPARISON_WORKER_MAX_CONCURRENCY },
        async () => exactCounts(await runtime.rpc(
          "m23_process_comparison_queue",
          { p_batch_size: M23_COMPARISON_QUEUE_BATCH_SIZE, p_now: now },
          controller.signal,
        )),
      ));
      const counts = settled.flatMap((result) => {
        if (result.status === "rejected") return [];
        return [result.value];
      });
      if (settled.some((result) => result.status === "rejected")) {
        // Promise.allSettled has observed every sibling before this failure is
        // surfaced, so no queue RPC can continue after worker closeout.
        throw new Error("m23_queue_wave_failed");
      }
      for (const count of counts) {
        if (count.claimed !== count.completed + count.retry_or_failed) {
          throw new Error("m23_queue_contract_invalid");
        }
        queueClaimed += count.claimed;
        queueCompleted += count.completed;
        queueRetryOrFailed += count.retry_or_failed;
      }
      if (counts.reduce((total, count) => total + count.claimed, 0)
        < M23_COMPARISON_WORKER_MAX_CONCURRENCY * M23_COMPARISON_QUEUE_BATCH_SIZE) break;
    }
    let compacted = 0;
    let evidenceCompacted = 0;
    let compactionAttempted = false;
    let compactionFailed = false;
    const remainingBudget = M23_COMPARISON_WORKER_SOFT_DEADLINE_MS - (Date.now() - startedAt);
    if (remainingBudget > M23_COMPARISON_WORKER_COMPACTION_MIN_REMAINING_MS) {
      compactionAttempted = true;
      try {
        const compactedResponse = await runtime.rpc(
          "m23_compact_comparison_detail",
          { p_batch_size: 100 },
          controller.signal,
        );
        if (typeof compactedResponse !== "object" || compactedResponse === null || Array.isArray(compactedResponse)) {
          throw new Error("m23_compaction_contract_invalid");
        }
        const deleted = (compactedResponse as JsonRecord).deletedDetailRows;
        if (typeof deleted !== "number" || !Number.isSafeInteger(deleted) || deleted < 0) {
          throw new Error("m23_compaction_contract_invalid");
        }
        const deletedEvidence = (compactedResponse as JsonRecord).deletedEvidenceRows;
        if (typeof deletedEvidence !== "number" || !Number.isSafeInteger(deletedEvidence) || deletedEvidence < 0) {
          throw new Error("m23_compaction_contract_invalid");
        }
        compacted = deleted;
        evidenceCompacted = deletedEvidence;
      } catch {
        // Compaction is explicitly best effort.  The shared controller bounds
        // it to this invocation; an abort or HTTP failure must not rewrite a
        // successful queue result as worker failure.
        compactionFailed = true;
      }
    }
    const workerOk = queueRetryOrFailed === 0;
    return {
      contractVersion: M23_COMPARISON_WORKER_CONTRACT_VERSION,
      workerOk,
      workerStatus: workerOk ? "ok" : "partial_failure",
      queueClaimed,
      queueCompleted,
      queueRetryOrFailed,
      compactionAttempted,
      compacted,
      evidenceCompacted,
      compactionFailed,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function failedM23ComparisonWorkerSummary(): M23ComparisonWorkerSummary {
  return {
    contractVersion: M23_COMPARISON_WORKER_CONTRACT_VERSION,
    workerOk: false,
    workerStatus: "failed",
    queueClaimed: 0,
    queueCompleted: 0,
    queueRetryOrFailed: 0,
    compactionAttempted: false,
    compacted: 0,
    evidenceCompacted: 0,
    compactionFailed: false,
  };
}

export function safeM23ComparisonWorkerResponse(
  summary: M23ComparisonWorkerSummary,
  status = 200,
): Response {
  return new Response(JSON.stringify(summary), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
