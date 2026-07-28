const DEFAULT_QUEUE_BATCH = 50;
const DEFAULT_SWEEP_BATCH = 100;
const MAX_QUEUE_BATCH = 100;
const MAX_SWEEP_BATCH = 250;
export const M22_RULE_WORKER_TIMEOUT_MS = 8_000;

type SafeWorkerSummary = {
  ok: boolean;
  queueProcessed: number;
  sweepEvaluated: number;
  failures: number;
};

type JsonRecord = Record<string, unknown>;

function boundedInteger(value: unknown, fallback: number, maximum: number): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isSafeInteger(parsed)
    ? Math.max(1, Math.min(maximum, parsed))
    : fallback;
}

function safeCount(value: unknown, names: readonly string[]): number {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return 0;
  const record = value as JsonRecord;
  for (const name of names) {
    const count = record[name];
    if (typeof count === "number" && Number.isSafeInteger(count) && count >= 0) return count;
  }
  return 0;
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
      signal: AbortSignal.any([signal, AbortSignal.timeout(M22_RULE_WORKER_TIMEOUT_MS)]),
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
  const timeout = setTimeout(() => controller.abort(), M22_RULE_WORKER_TIMEOUT_MS);
  const queueBatch = boundedInteger(environment.M22_RULE_QUEUE_BATCH_SIZE, DEFAULT_QUEUE_BATCH, MAX_QUEUE_BATCH);
  const sweepBatch = boundedInteger(environment.M22_HEALTH_SWEEP_BATCH_SIZE, DEFAULT_SWEEP_BATCH, MAX_SWEEP_BATCH);
  const now = new Date().toISOString();
  try {
    const queue = await runtime.rpc("m22_process_rule_queue", { p_batch_size: queueBatch, p_now: now }, controller.signal);
    const sweep = await runtime.rpc("m22_run_health_sweep", { p_batch_size: sweepBatch, p_now: now }, controller.signal);
    return {
      ok: true,
      queueProcessed: safeCount(queue, ["processed", "processed_count", "queue_processed"]),
      sweepEvaluated: safeCount(sweep, ["evaluated", "evaluated_count", "devices_evaluated"]),
      failures: safeCount(queue, ["failed", "failure_count"]) + safeCount(sweep, ["failed", "failure_count"]),
    };
  } finally {
    clearTimeout(timeout);
  }
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
