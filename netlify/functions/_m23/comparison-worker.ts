export const M23_COMPARISON_WORKER_CONTRACT_VERSION = "m23-comparison-worker-v1" as const;
export const M23_COMPARISON_WORKER_TIMEOUT_MS = 8_000;
export const M23_COMPARISON_WORKER_SOFT_DEADLINE_MS = 6_500;
export const M23_COMPARISON_QUEUE_BATCH_SIZE = 50;
export const M23_COMPARISON_QUEUE_MAX_ITERATIONS = 4;
export const M23_COMPARISON_THEORETICAL_CAPACITY_PER_MINUTE =
  M23_COMPARISON_QUEUE_BATCH_SIZE * M23_COMPARISON_QUEUE_MAX_ITERATIONS;

type JsonRecord = Record<string, unknown>;

export type M23ComparisonWorkerSummary = {
  readonly contractVersion: typeof M23_COMPARISON_WORKER_CONTRACT_VERSION;
  readonly workerOk: boolean;
  readonly workerStatus: "ok" | "partial_failure" | "failed";
  readonly queueClaimed: number;
  readonly queueCompleted: number;
  readonly queueRetryOrFailed: number;
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
      const counts = exactCounts(await runtime.rpc(
        "m23_process_comparison_queue",
        { p_batch_size: M23_COMPARISON_QUEUE_BATCH_SIZE, p_now: now },
        controller.signal,
      ));
      if (counts.claimed !== counts.completed + counts.retry_or_failed) {
        throw new Error("m23_queue_contract_invalid");
      }
      queueClaimed += counts.claimed;
      queueCompleted += counts.completed;
      queueRetryOrFailed += counts.retry_or_failed;
      if (counts.claimed < M23_COMPARISON_QUEUE_BATCH_SIZE) break;
    }
    const workerOk = queueRetryOrFailed === 0;
    return {
      contractVersion: M23_COMPARISON_WORKER_CONTRACT_VERSION,
      workerOk,
      workerStatus: workerOk ? "ok" : "partial_failure",
      queueClaimed,
      queueCompleted,
      queueRetryOrFailed,
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
