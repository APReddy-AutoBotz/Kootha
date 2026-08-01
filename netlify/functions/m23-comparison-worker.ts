import {
  failedM23ComparisonWorkerSummary,
  M23ComparisonWorkerRuntime,
  runM23ComparisonWorker,
  safeM23ComparisonWorkerResponse,
} from "./_m23/comparison-worker";

export default async function handler(): Promise<Response> {
  if (process.env.M23_COMPARISON_ENGINE_ENABLED !== "true") {
    return new Response(null, { status: 204 });
  }
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return safeM23ComparisonWorkerResponse(failedM23ComparisonWorkerSummary(), 503);
  }
  try {
    const summary = await runM23ComparisonWorker(
      new M23ComparisonWorkerRuntime(url, serviceRoleKey),
    );
    return safeM23ComparisonWorkerResponse(summary, summary.workerOk ? 200 : 207);
  } catch {
    return safeM23ComparisonWorkerResponse(failedM23ComparisonWorkerSummary(), 503);
  }
}

export const config = { schedule: "* * * * *" };
