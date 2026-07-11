const MAX_BODY_BYTES = 16_384;
const CONSENT_VERSION = "2026-07-12";
const genericUnavailable = "Enquiry service is unavailable right now. Please try again later.";

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders
    }
  });
}

function cleanText(value, maxLength) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

function validate(body) {
  const record = {
    customer_name: cleanText(body.customerName, 80),
    business_name: cleanText(body.businessName, 120),
    phone: cleanText(body.mobileNumber, 20),
    city: cleanText(body.cityTown, 80),
    required_areas: cleanText(body.areasToCover, 500),
    preferred_start_date: cleanText(body.preferredDate, 10),
    number_of_days: Number(body.numberOfDays),
    source: "website",
    status: "new",
    message: cleanText(body.advertisementDetails, 1000),
    package_interest: ["basic", "standard", "premium", "not_sure"].includes(body.packageInterest) ? body.packageInterest : "not_sure",
    live_tracking_needed: ["yes", "no", "not_sure"].includes(body.liveTrackingNeeded) ? body.liveTrackingNeeded : "not_sure",
    notes: cleanText(body.notes, 600) || null,
    consent_to_contact: body.consentToContact === true,
    locale: body.locale === "te" ? "te" : "en",
    consent_notice_version: cleanText(body.consentNoticeVersion, 40)
  };

  const valid =
    !cleanText(body.companyWebsite, 200) &&
    record.customer_name.length > 0 &&
    record.business_name.length > 0 &&
    /^\+?[0-9][0-9\s-]{7,18}$/.test(record.phone) &&
    record.city.length > 0 &&
    record.required_areas.length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(record.preferred_start_date) &&
    Number.isInteger(record.number_of_days) &&
    record.number_of_days >= 1 &&
    record.number_of_days <= 30 &&
    record.message.length > 0 &&
    record.consent_to_contact &&
    record.consent_notice_version === CONSENT_VERSION;

  return valid ? record : null;
}

async function hmac(value, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyTurnstile(token, secret, remoteIp) {
  const form = new URLSearchParams({ secret, response: token });
  if (remoteIp) form.set("remoteip", remoteIp);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(8_000)
  });
  if (!response.ok) return false;
  const result = await response.json();
  return result.success === true;
}

export default async function handler(request) {
  if (request.method !== "POST") return json(405, { message: "Method not allowed." }, { allow: "POST" });
  if (process.env.ENQUIRY_INTAKE_ENABLED !== "true") return json(503, { message: genericUnavailable });

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > MAX_BODY_BYTES) return json(413, { message: "Enquiry details are too large." });

  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serverKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  const rateSalt = process.env.ENQUIRY_RATE_LIMIT_SALT;
  if (!supabaseUrl || !serverKey || !turnstileSecret || !rateSalt) return json(503, { message: genericUnavailable });

  let body;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json(413, { message: "Enquiry details are too large." });
    body = JSON.parse(raw);
  } catch {
    return json(400, { message: "Please check the enquiry details and try again." });
  }

  const record = validate(body);
  if (!record) return json(400, { message: "Please check the enquiry details and try again." });

  const remoteIp = request.headers.get("x-nf-client-connection-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const requestHash = await hmac(`${remoteIp}|${request.headers.get("user-agent") || "unknown"}`, rateSalt);

  try {
    const turnstileOk = await verifyTurnstile(cleanText(body.turnstileToken, 2048), turnstileSecret, remoteIp);
    if (!turnstileOk) return json(400, { message: "Verification failed. Please try again." });

    const headers = { apikey: serverKey, authorization: `Bearer ${serverKey}`, "content-type": "application/json" };
    const rateResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/consume_public_enquiry_rate_limit`, {
      method: "POST",
      headers,
      body: JSON.stringify({ p_request_hash: requestHash, p_max_requests: 5, p_window_seconds: 900 })
    });
    if (!rateResponse.ok) return json(503, { message: genericUnavailable });
    const [rate] = await rateResponse.json();
    if (!rate?.allowed) return json(429, { message: "Too many enquiries. Please wait and try again." }, { "retry-after": String(rate?.retry_after_seconds || 900) });

    const insertResponse = await fetch(`${supabaseUrl}/rest/v1/enquiries?select=id`, {
      method: "POST",
      headers: { ...headers, prefer: "return=representation" },
      body: JSON.stringify(record)
    });
    if (!insertResponse.ok) return json(503, { message: genericUnavailable });
    const [created] = await insertResponse.json();
    return json(202, { message: "Enquiry received.", reference: String(created?.id || "").slice(0, 8).toUpperCase() });
  } catch {
    return json(503, { message: genericUnavailable });
  }
}

export const config = { path: "/api/enquiries" };
