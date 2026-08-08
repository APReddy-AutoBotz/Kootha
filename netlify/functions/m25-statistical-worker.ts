import {
  failedM25StatisticalWorkerSummary,
  M25StatisticalWorkerRuntimeV1,
  runM25StatisticalWorkerV1,
  safeM25StatisticalWorkerResponseV1,
} from "./_m25/statistical-worker";

export default async function handler(): Promise<Response> {
  if (process.env.M25_STATISTICAL_ENGINE_ENABLED !== "true") return new Response(null, { status: 204 });
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return safeM25StatisticalWorkerResponseV1(failedM25StatisticalWorkerSummary(), 503);
  try {
    const summary = await runM25StatisticalWorkerV1(new M25StatisticalWorkerRuntimeV1(url, serviceRoleKey));
    return safeM25StatisticalWorkerResponseV1(summary, summary.workerOk ? 200 : 207);
  } catch {
    return safeM25StatisticalWorkerResponseV1(failedM25StatisticalWorkerSummary(), 503);
  }
}

export const config = { schedule: "* * * * *" };
