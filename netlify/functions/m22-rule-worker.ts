import {
  failedM22WorkerSummary,
  M22RuleWorkerRuntime,
  runM22RuleWorker,
  safeM22WorkerResponse,
} from "./_m22/rule-worker";

export default async function handler(): Promise<Response> {
  if (process.env.M22_RULE_ENGINE_ENABLED !== "true") return new Response(null, { status: 204 });
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return safeM22WorkerResponse(failedM22WorkerSummary(), 503);
  }
  try {
    const summary = await runM22RuleWorker(new M22RuleWorkerRuntime(url, serviceRoleKey), process.env);
    return safeM22WorkerResponse(summary, summary.workerOk ? 200 : 207);
  } catch {
    return safeM22WorkerResponse(failedM22WorkerSummary(), 503);
  }
}

export const config = { schedule: "* * * * *" };
