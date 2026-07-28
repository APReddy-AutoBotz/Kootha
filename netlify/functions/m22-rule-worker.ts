import { M22RuleWorkerRuntime, runM22RuleWorker, safeM22WorkerResponse } from "./_m22/rule-worker";

export default async function handler(): Promise<Response> {
  if (process.env.M22_RULE_ENGINE_ENABLED !== "true") return new Response(null, { status: 204 });
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return safeM22WorkerResponse({ ok: false, queueProcessed: 0, sweepEvaluated: 0, failures: 1 }, 503);
  }
  try {
    return safeM22WorkerResponse(
      await runM22RuleWorker(new M22RuleWorkerRuntime(url, serviceRoleKey), process.env),
    );
  } catch {
    return safeM22WorkerResponse({ ok: false, queueProcessed: 0, sweepEvaluated: 0, failures: 1 }, 503);
  }
}

export const config = { schedule: "*/2 * * * *" };
