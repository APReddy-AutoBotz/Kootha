export const M22_RULE_WORKER_CONTRACT_VERSION = "m22-worker-v1" as const;
export const M22_RULE_WORKER_TIMEOUT_MS = 8_000;
export const M22_RULE_WORKER_SOFT_DEADLINE_MS = 6_500;
export const M22_RULE_WORKER_INVOCATIONS_PER_MINUTE = 1;
export const M22_RULE_QUEUE_BATCH_SIZE = 200;
export const M22_RULE_QUEUE_MAX_ITERATIONS = 4;
export const M22_RULE_THEORETICAL_CAPACITY_PER_MINUTE =
  M22_RULE_WORKER_INVOCATIONS_PER_MINUTE * M22_RULE_QUEUE_BATCH_SIZE * M22_RULE_QUEUE_MAX_ITERATIONS;

const DEFAULT_SWEEP_BATCH = 250;
const DEFAULT_RETENTION_BATCH = 250;
const MAX_SWEEP_BATCH = 500;
const MAX_RETENTION_BATCH = 500;

export type SafeWorkerSummary = {
  contractVersion: typeof M22_RULE_WORKER_CONTRACT_VERSION;
  workerOk: boolean;
  workerStatus: "ok" | "partial_failure" | "failed";
  queueClaimed: number;
  queueCompleted: number;
  queueRetryOrFailed: number;
  devicesConsidered: number;
  sweepSignalsEnqueued: number;
  operationalRowsCompacted: number;
};

type JsonRecord = Record<string, unknown>;

function boundedInteger(value: unknown, fallback: number, maximum: number): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isSafeInteger(parsed)
    ? Math.max(1, Math.min(maximum, parsed))
    : fallback;
}

function exactCounts<T extends readonly string[]>(
  value: unknown,
  names: T,
  contractName: string,
): Record<T[number], number> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`m22_${contractName}_contract_invalid`);
  }
  const record = value as JsonRecord;
  const result: Record<string, number> = {};
  for (const name of names) {
    const count = record[name];
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
      throw new Error(`m22_${contractName}_contract_invalid`);
    }
    result[name] = count;
  }
  return result as Record<T[number], number>;
}

export class M22RuleWorkerRuntime {
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
    if (!response.ok) throw new Error("m22_worker_rpc_failed");
    return response.json();
  }
}

export async function runM22RuleWorker(
  runtime: M22RuleWorkerRuntime,
  environment: NodeJS.ProcessEnv,
): Promise<SafeWorkerSummary> {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeout = setTimeout(() => controller.abort(), M22_RULE_WORKER_TIMEOUT_MS);
  const sweepBatch = boundedInteger(
    environment.M22_HEALTH_SWEEP_BATCH_SIZE,
    DEFAULT_SWEEP_BATCH,
    MAX_SWEEP_BATCH,
  );
  const retentionBatch = boundedInteger(
    environment.M22_RETENTION_BATCH_SIZE,
    DEFAULT_RETENTION_BATCH,
    MAX_RETENTION_BATCH,
  );
  const now = new Date().toISOString();
  try {
    // Sweep first so a busy evaluation queue cannot starve health progression.
    const sweep = exactCounts(
      await runtime.rpc("m22_run_health_sweep", { p_batch_size: sweepBatch, p_now: now }, controller.signal),
      ["devices_considered", "signals_enqueued"] as const,
      "health_sweep",
    );

    let queueClaimed = 0;
    let queueCompleted = 0;
    let queueRetryOrFailed = 0;
    for (let iteration = 0; iteration < M22_RULE_QUEUE_MAX_ITERATIONS; iteration += 1) {
      if (Date.now() - startedAt >= M22_RULE_WORKER_SOFT_DEADLINE_MS) break;
      const queue = exactCounts(
        await runtime.rpc(
          "m22_process_rule_queue",
          { p_batch_size: M22_RULE_QUEUE_BATCH_SIZE, p_now: now },
          controller.signal,
        ),
        ["claimed", "completed", "retry_or_failed"] as const,
        "queue",
      );
      if (queue.claimed !== queue.completed + queue.retry_or_failed) {
        throw new Error("m22_queue_contract_invalid");
      }
      queueClaimed += queue.claimed;
      queueCompleted += queue.completed;
      queueRetryOrFailed += queue.retry_or_failed;
      if (queue.claimed < M22_RULE_QUEUE_BATCH_SIZE) break;
    }

    const retention = exactCounts(
      await runtime.rpc(
        "m22_compact_operational_rows",
        { p_batch_size: retentionBatch, p_now: now },
        controller.signal,
      ),
      ["queue_rows_deleted", "signal_rows_deleted", "auth_rows_deleted", "assessment_rows_deleted", "state_rows_deleted"] as const,
      "retention",
    );
    const operationalRowsCompacted = Object.values(retention).reduce((sum, count) => sum + count, 0);
    const workerOk = queueRetryOrFailed === 0;
    return {
      contractVersion: M22_RULE_WORKER_CONTRACT_VERSION,
      workerOk,
      workerStatus: workerOk ? "ok" : "partial_failure",
      queueClaimed,
      queueCompleted,
      queueRetryOrFailed,
      devicesConsidered: sweep.devices_considered,
      sweepSignalsEnqueued: sweep.signals_enqueued,
      operationalRowsCompacted,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function failedM22WorkerSummary(): SafeWorkerSummary {
  return {
    contractVersion: M22_RULE_WORKER_CONTRACT_VERSION,
    workerOk: false,
    workerStatus: "failed",
    queueClaimed: 0,
    queueCompleted: 0,
    queueRetryOrFailed: 0,
    devicesConsidered: 0,
    sweepSignalsEnqueued: 0,
    operationalRowsCompacted: 0,
  };
}

export function safeM22WorkerResponse(summary: SafeWorkerSummary, status = 200): Response {
  return new Response(JSON.stringify(summary), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
