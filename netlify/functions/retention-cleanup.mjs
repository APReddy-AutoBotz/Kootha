function serverHeaders(key) {
  return { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };
}

export default async function handler() {
  if (process.env.RETENTION_DELETION_ENABLED !== "true") return new Response(null, { status: 204 });
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return new Response(null, { status: 503 });

  try {
    const headers = serverHeaders(key);
    const candidatesResponse = await fetch(`${url}/rest/v1/rpc/get_expired_private_proof_candidates`, { method: "POST", headers, body: "{}" });
    if (!candidatesResponse.ok) return new Response(null, { status: 503 });
    const candidates = await candidatesResponse.json();
    const deletedIds = [];
    for (const candidate of candidates) {
      const path = String(candidate.file_path || "").split("/").map(encodeURIComponent).join("/");
      const bucket = encodeURIComponent(String(candidate.file_bucket || ""));
      if (!path || !bucket) continue;
      const deletion = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, { method: "DELETE", headers });
      if (deletion.ok) deletedIds.push(candidate.proof_upload_id);
    }

    const retention = await fetch(`${url}/rest/v1/rpc/run_data_retention`, { method: "POST", headers, body: JSON.stringify({ p_deleted_proof_ids: deletedIds }) });
    return new Response(null, { status: retention.ok ? 204 : 503 });
  } catch {
    return new Response(null, { status: 503 });
  }
}

export const config = { schedule: "@daily" };
