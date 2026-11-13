// End-to-end flow check against a LOCAL Supabase stack.
//
// Runs one fake advertisement job from enquiry to closure through the same
// HTTP calls the website function, the admin page and the driver app make:
// PostgREST, GoTrue and Storage, with the same roles (service role for the
// enquiry gateway, an authenticated admin, and the anonymous driver app).
//
// It is not a browser or phone test. It proves that the database, RLS, RPC
// signatures and storage policies accept the requests the apps send.
//
// Usage (after `supabase start`):
//   FLOW_E2E_API_URL=http://127.0.0.1:54321 \
//   FLOW_E2E_ANON_KEY=... FLOW_E2E_SERVICE_ROLE_KEY=... node scripts/flow-e2e.mjs
//
// The script refuses to run against anything but a local address.

import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";

const apiUrl = (process.env.FLOW_E2E_API_URL ?? "").replace(/\/$/, "");
const anonKey = process.env.FLOW_E2E_ANON_KEY ?? "";
const serviceKey = process.env.FLOW_E2E_SERVICE_ROLE_KEY ?? "";

if (!apiUrl || !anonKey || !serviceKey) {
  console.error("FLOW_E2E_API_URL, FLOW_E2E_ANON_KEY and FLOW_E2E_SERVICE_ROLE_KEY are required.");
  process.exit(2);
}

const apiHost = new URL(apiUrl).hostname;
if (!["127.0.0.1", "localhost", "[::1]"].includes(apiHost)) {
  console.error("Refusing to run: this check creates fake users and data and only runs against a local Supabase stack.");
  process.exit(2);
}

const runId = Date.now().toString(36) + randomBytes(3).toString("hex");
const today = new Date().toISOString().slice(0, 10);
const results = [];
let currentStep = "startup";

class StepFailure extends Error {}

function fail(message, detail) {
  const suffix = detail === undefined ? "" : "\n    " + String(detail).slice(0, 1200);
  throw new StepFailure(message + suffix);
}

function expect(condition, message, detail) {
  if (!condition) {
    fail(message, detail);
  }
}

async function step(name, run) {
  currentStep = name;
  const started = Date.now();
  const value = await run();
  results.push({ name, ms: Date.now() - started });
  console.log("ok   " + name);
  return value;
}

function note(message) {
  console.log("     " + message);
}

async function readBody(response) {
  const text = await response.text();
  try {
    return { text, json: text ? JSON.parse(text) : null };
  } catch {
    return { text, json: null };
  }
}

function headersFor(role, token, json) {
  const key = role === "service" ? serviceKey : anonKey;
  const headers = { apikey: key, Authorization: "Bearer " + (token ?? key) };
  if (json) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

async function call(role, token, method, path, body, extraHeaders = {}) {
  const response = await fetch(apiUrl + path, {
    method,
    headers: { ...headersFor(role, token, body !== undefined), ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const parsed = await readBody(response);
  return { ok: response.ok, status: response.status, ...parsed };
}

async function mustCall(label, role, token, method, path, body, extraHeaders) {
  const result = await call(role, token, method, path, body, extraHeaders);
  expect(result.ok, label + " failed with HTTP " + result.status, result.text);
  return result.json;
}

async function rpc(label, role, token, name, body) {
  return mustCall(label, role, token, "POST", "/rest/v1/rpc/" + name, body);
}

async function expectRefused(label, role, token, method, path, body) {
  const result = await call(role, token, method, path, body);
  const refused = !result.ok || (Array.isArray(result.json) && result.json.length === 0);
  expect(refused, label + " was expected to be refused or empty but returned HTTP " + result.status, result.text);
  return result;
}

// The admin page builds its list queries from column lists in admin.tsx. Read
// those lists from the source so this check fails when the page asks for a
// column the database does not have.
function readAdminListQueries() {
  const source = readFileSync(new URL("../apps/web/src/admin.tsx", import.meta.url), "utf8");
  const columns = new Map();
  for (const match of source.matchAll(/const (\w+SelectColumns) = \[([\s\S]*?)\]/g)) {
    columns.set(match[1], [...match[2].matchAll(/"([^"]+)"/g)].map((item) => item[1]));
  }
  const queries = new Map();
  for (const match of source.matchAll(/"\/rest\/v1\/(\w+)\?select=" \+ (\w+SelectColumns)/g)) {
    const list = columns.get(match[2]);
    if (list && list.length > 0) {
      queries.set(match[1], list.join(","));
    }
  }
  return queries;
}

// Not a viewable picture: JPEG start and end markers around filler bytes. The
// check only needs to upload bytes and read the same bytes back.
function tinyJpeg() {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.alloc(256, 7),
    Buffer.from([0xff, 0xd9]),
  ]);
}

function clientId(prefix) {
  return (prefix + "-" + runId + "-" + randomBytes(6).toString("hex")).toLowerCase();
}

async function createUser(email, password) {
  const user = await mustCall("Create fake auth user", "service", undefined, "POST", "/auth/v1/admin/users", {
    email,
    password,
    email_confirm: true,
  });
  expect(typeof user?.id === "string", "Fake auth user was not returned", JSON.stringify(user));
  return user.id;
}

async function login(email, password) {
  const session = await mustCall("Password login", "anon", undefined, "POST", "/auth/v1/token?grant_type=password", {
    email,
    password,
  });
  expect(typeof session?.access_token === "string", "Login did not return an access token");
  return session.access_token;
}

async function main() {
  const listQueries = readAdminListQueries();
  expect(listQueries.size >= 10, "Could not read the admin list queries from admin.tsx", [...listQueries.keys()].join(","));

  const adminEmail = "fake-admin-" + runId + "@example.test";
  const adminPassword = randomBytes(18).toString("base64url");
  const outsiderEmail = "fake-outsider-" + runId + "@example.test";
  const outsiderPassword = randomBytes(18).toString("base64url");
  const driverPhone = "90000" + String(Date.now()).slice(-5);
  const vehicleNumber = "E2E-" + runId.slice(-6).toUpperCase();

  // ---------------------------------------------------------------- setup
  const adminToken = await step("Admin: create fake admin login and sign in", async () => {
    const adminId = await createUser(adminEmail, adminPassword);
    await mustCall("Mark fake user as admin", "service", undefined, "POST", "/rest/v1/user_profiles", {
      auth_user_id: adminId,
      display_name: "Fake Flow Admin",
      role: "admin",
    }, { Prefer: "return=minimal" });
    const token = await login(adminEmail, adminPassword);
    const profiles = await mustCall(
      "Read admin profile", "anon", token, "GET",
      "/rest/v1/user_profiles?select=auth_user_id,display_name,role&auth_user_id=eq." + adminId + "&limit=1",
    );
    expect(profiles?.[0]?.role === "admin", "Admin profile is not readable by the admin", JSON.stringify(profiles));
    return token;
  });

  const outsiderToken = await step("Outsider: create a signed-in user with no admin profile", async () => {
    await createUser(outsiderEmail, outsiderPassword);
    return login(outsiderEmail, outsiderPassword);
  });

  // -------------------------------------------------------------- enquiry
  const enquiryId = await step("Website: enquiry gateway stores an enquiry with the server key", async () => {
    // The gateway sends a 64-character HMAC of the caller's address, never the address itself.
    const requestHash = createHash("sha256").update("flow-e2e-" + runId).digest("hex");
    const rate = await rpc("Enquiry rate limit", "service", undefined, "consume_public_enquiry_rate_limit", {
      p_request_hash: requestHash,
      p_max_requests: 5,
      p_window_seconds: 900,
    });
    expect(rate?.[0]?.allowed === true, "Enquiry rate limit did not allow the first request", JSON.stringify(rate));

    const burstHash = createHash("sha256").update("flow-e2e-burst-" + runId).digest("hex");
    const burst = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const limited = await rpc("Enquiry rate limit burst", "service", undefined, "consume_public_enquiry_rate_limit", {
        p_request_hash: burstHash,
        p_max_requests: 2,
        p_window_seconds: 900,
      });
      burst.push(limited?.[0]?.allowed);
    }
    expect(burst[0] === true && burst[1] === true && burst[2] === false, "Enquiry rate limit did not block the third request in a window", JSON.stringify(burst));
    const anonLimit = await call("anon", undefined, "POST", "/rest/v1/rpc/consume_public_enquiry_rate_limit", {
      p_request_hash: burstHash, p_max_requests: 2, p_window_seconds: 900,
    });
    expect(!anonLimit.ok, "An anonymous caller could run the enquiry rate limiter", anonLimit.text);
    const created = await mustCall("Insert enquiry", "service", undefined, "POST", "/rest/v1/enquiries?select=id", {
      customer_name: "Fake Flow Customer",
      business_name: "Fake Flow Stores " + runId,
      phone: "9000011111",
      city: "Ongole",
      required_areas: "Fake Main Road, Fake Market",
      preferred_start_date: today,
      number_of_days: 1,
      source: "website",
      status: "new",
      message: "Fake festival offer announcement",
      package_interest: "standard",
      live_tracking_needed: "no",
      notes: null,
      consent_to_contact: true,
      locale: "en",
      consent_notice_version: "2026-07-12",
    }, { Prefer: "return=representation" });
    expect(typeof created?.[0]?.id === "string", "Enquiry id was not returned", JSON.stringify(created));
    return created[0].id;
  });

  await step("Website: anonymous visitors cannot insert or read enquiries directly", async () => {
    const insert = await call("anon", undefined, "POST", "/rest/v1/enquiries", {
      customer_name: "Direct", business_name: "Direct", phone: "9000022222", city: "Ongole",
      required_areas: "x", preferred_start_date: today, number_of_days: 1, message: "x", consent_to_contact: true,
    });
    expect(!insert.ok, "Anonymous direct enquiry insert was accepted", insert.text);
    await expectRefused("Anonymous enquiry read", "anon", undefined, "GET", "/rest/v1/enquiries?select=id&limit=1");
  });

  // ------------------------------------------------------ admin: planning
  await step("Admin: every list query used by the admin page works", async () => {
    for (const [table, select] of listQueries) {
      const rows = await mustCall("Admin list " + table, "anon", adminToken, "GET", "/rest/v1/" + table + "?select=" + select + "&limit=5");
      expect(Array.isArray(rows), "Admin list " + table + " did not return rows");
    }
    note(listQueries.size + " list queries: " + [...listQueries.keys()].join(", "));
  });

  await step("Admin: update the enquiry", async () => {
    await mustCall("Update enquiry", "anon", adminToken, "PATCH", "/rest/v1/enquiries?id=eq." + enquiryId, {
      status: "new",
      internal_note: "Fake flow check",
      follow_up_date: null,
      package_interest: "standard",
      admin_remark: null,
      updated_at: new Date().toISOString(),
    }, { Prefer: "return=minimal" });
  });

  const adWorkId = await step("Admin: create Ad Work from the enquiry", async () => {
    const created = await rpc("Create Ad Work", "anon", adminToken, "create_ad_work_from_enquiry", { p_enquiry_id: enquiryId });
    expect(typeof created?.[0]?.ad_work_id === "string", "Ad Work id was not returned", JSON.stringify(created));
    const again = await rpc("Create Ad Work again", "anon", adminToken, "create_ad_work_from_enquiry", { p_enquiry_id: enquiryId });
    expect(again?.[0]?.ad_work_id === created[0].ad_work_id, "Creating Ad Work twice produced a duplicate", JSON.stringify(again));
    return created[0].ad_work_id;
  });

  async function readAdWork() {
    const rows = await mustCall(
      "Read Ad Work", "anon", adminToken, "GET",
      "/rest/v1/ad_works?select=" + listQueries.get("ad_works") + "&id=eq." + adWorkId,
    );
    expect(rows?.length === 1, "Ad Work is not readable by the admin", JSON.stringify(rows));
    return rows[0];
  }

  await step("Admin: save planning details and the day-wise schedule", async () => {
    const adWork = await readAdWork();
    await mustCall("Save Ad Work", "anon", adminToken, "PATCH", "/rest/v1/ad_works?id=eq." + adWorkId, {
      customer_name: adWork.customer_name ?? "Fake Flow Customer",
      business_name: adWork.business_name ?? null,
      customer_phone: adWork.customer_phone ?? null,
      delivery_method: "vehicle_announcement",
      execution_mode: "driver_app",
      driver_required: true,
      vehicle_required: true,
      speaker_required: true,
      areas_required: true,
      customer_updates_required: true,
      city: adWork.city ?? "Ongole",
      title: adWork.title ?? "Ad Work",
      advertisement_details: adWork.advertisement_details ?? "Fake festival offer announcement",
      package_interest: "standard",
      live_tracking_requested: adWork.live_tracking_requested ?? "no",
      live_tracking_enabled: false,
      customer_live_enabled: false,
      special_instructions: "Fake instructions",
      internal_planning_note: "Fake planning note",
      photo_proof_needed: true,
      audio_video_proof_needed: false,
      area_update_needed: true,
      final_report_needed: true,
      customer_update_scheduled: true,
      customer_update_started: true,
      customer_update_in_progress: false,
      customer_update_area_covered: true,
      customer_update_completed: true,
      customer_update_report_ready: true,
      updated_at: new Date().toISOString(),
    }, { Prefer: "return=minimal" });
    await rpc("Sync day-wise schedule", "anon", adminToken, "admin_sync_ad_work_days_v2", {
      p_ad_work_id: adWorkId,
      p_start_date: today,
      p_number_of_days: 1,
      p_daily_start_time: "09:00",
      p_daily_end_time: "18:00",
      p_areas_to_cover: "Fake Main Road, Fake Market",
      p_expected_version: adWork.schedule_version,
    });
    const days = await mustCall(
      "Read work days", "anon", adminToken, "GET",
      "/rest/v1/ad_work_days?select=" + listQueries.get("ad_work_days") + "&ad_work_id=eq." + adWorkId,
    );
    expect(days?.length === 1 && days[0].work_date === today, "Day-wise schedule does not hold exactly today's day", JSON.stringify(days));
  });

  // ------------------------------------------------- driver: registration
  const applicationId = await step("Driver app: submit registration, and a retry does not duplicate it", async () => {
    const submission = {
      p_client_submission_id: clientId("application"),
      p_driver_name: "Fake Flow Driver",
      p_phone: driverPhone,
      p_city: "Ongole",
      p_service_areas: "Fake Main Road, Fake Market",
      p_vehicle_ownership: "own_vehicle",
      p_vehicle_type: "van",
      p_vehicle_number: vehicleNumber,
      p_mic_system_available: true,
      p_gps_device_available: "no",
      p_preferred_working_cities: "Ongole",
      p_notes: null,
      p_contact_consent: true,
      p_company_website: null,
    };
    const first = await rpc("Submit driver application", "anon", undefined, "submit_driver_application", submission);
    const second = await rpc("Retry driver application", "anon", undefined, "submit_driver_application", submission);
    expect(typeof first?.[0]?.application_id === "string", "Application id was not returned", JSON.stringify(first));
    expect(second?.[0]?.application_id === first[0].application_id, "Retrying the application created a second row", JSON.stringify(second));
    await expectRefused("Anonymous application read", "anon", undefined, "GET", "/rest/v1/driver_applications?select=id&limit=1");
    return first[0].application_id;
  });

  const { driverId, vehicleId } = await step("Admin: approve the driver application", async () => {
    const reviewed = await rpc("Review driver application", "anon", adminToken, "review_driver_application", {
      p_application_id: applicationId,
      p_status: "approved",
      p_admin_note: "Fake approval",
      p_follow_up_date: null,
      p_rejection_reason: null,
      p_approval_note: "Fake approval",
    });
    const row = reviewed?.[0];
    expect(typeof row?.driver_id === "string" && typeof row?.vehicle_id === "string", "Approval did not create a driver and a vehicle", JSON.stringify(reviewed));
    return { driverId: row.driver_id, vehicleId: row.vehicle_id };
  });

  // ---------------------------------------------- admin: assign + release
  await step("Admin: assign the driver and vehicle", async () => {
    const saved = await rpc("Save assignment", "anon", adminToken, "save_ad_work_assignment", {
      p_ad_work_id: adWorkId,
      p_driver_id: driverId,
      p_vehicle_id: vehicleId,
      p_assignment_note: "Fake assignment",
      p_readiness_warnings: [],
      p_change_confirmed: false,
    });
    expect(saved?.[0]?.status === "ready_for_execution", "Assignment did not become Ready for Execution", JSON.stringify(saved));
  });

  await step("Admin: require Phone Location Proof", async () => {
    const saved = await rpc("Set location proof", "anon", adminToken, "set_mobile_location_proof", {
      p_ad_work_id: adWorkId,
      p_required: true,
      p_note: "Fake location note",
    });
    expect(saved?.[0]?.mobile_location_proof_required === true, "Location Proof was not marked required", JSON.stringify(saved));
  });

  await step("Outsider: a signed-in non-admin cannot read or release work", async () => {
    await expectRefused("Non-admin Ad Work read", "anon", outsiderToken, "GET", "/rest/v1/ad_works?select=id&limit=1");
    const release = await call("anon", outsiderToken, "POST", "/rest/v1/rpc/release_flexible_ad_work_to_driver", {
      p_ad_work_id: adWorkId, p_plain_work_code: null, p_revoke: false,
    });
    expect(!release.ok, "A non-admin released work to a driver", release.text);
  });

  const workCode = await step("Admin: release the work and receive a Work Code", async () => {
    const released = await rpc("Release to driver", "anon", adminToken, "release_flexible_ad_work_to_driver", {
      p_ad_work_id: adWorkId,
      p_plain_work_code: null,
      p_revoke: false,
    });
    const code = released?.[0]?.work_access_code;
    expect(typeof code === "string" && code.length >= 8, "A Work Code was not returned", JSON.stringify(released));
    expect(released[0].release_status === "released_to_driver", "Work was not released", JSON.stringify(released));
    note("Work Code length: " + code.length);
    return code;
  });

  // ------------------------------------------------------ driver: the job
  const driverAuth = { p_mobile: driverPhone, p_work_code: workCode };

  const { dayId, assignmentId } = await step("Driver app: open assigned work; a wrong code is refused", async () => {
    const wrong = await call("anon", undefined, "POST", "/rest/v1/rpc/driver_get_assigned_work", {
      p_mobile: driverPhone, p_work_code: "WRONG" + runId.slice(-5).toUpperCase(),
    });
    expect(!wrong.ok, "A wrong Work Code opened assigned work", wrong.text);
    const rows = await rpc("Open assigned work", "anon", undefined, "driver_get_assigned_work", driverAuth);
    expect(rows?.length === 1 && rows[0].planned_date === today, "Assigned work did not return today's day", JSON.stringify(rows));
    expect(rows[0].mobile_location_proof_required === true, "Driver does not see Location Proof as required", JSON.stringify(rows));
    return { dayId: rows[0].ad_work_day_id, assignmentId: rows[0].assignment_id };
  });

  async function workAction(action, extra = {}) {
    return rpc("Work action " + action, "anon", undefined, "driver_update_work_day", {
      ...driverAuth,
      p_ad_work_day_id: dayId,
      p_action: action,
      p_note: null,
      p_area_place_name: null,
      p_proof_type: null,
      ...extra,
    });
  }

  await step("Driver app: Start Work", async () => {
    const started = await workAction("start");
    expect(started?.[0]?.execution_status === "running", "Work day is not Running after Start Work", JSON.stringify(started));
  });

  function locationPoint(sessionId) {
    const id = clientId("phone");
    return {
      local_id: id,
      client_point_id: id,
      tracking_session_id: sessionId,
      ad_work_id: adWorkId,
      ad_work_day_id: dayId,
      assignment_id: assignmentId,
      driver_id: driverId,
      vehicle_id: vehicleId,
      latitude: 15.5 + Math.random() / 1000,
      longitude: 80.05 + Math.random() / 1000,
      accuracy: 12,
      speed: null,
      heading: null,
      captured_at: new Date().toISOString(),
      sync_status: "pending",
      retry_count: 0,
      last_sync_attempt_at: null,
    };
  }

  const sessionId = await step("Driver app: Start Location Proof, save a point, sync a buffered batch twice", async () => {
    const noConsent = await call("anon", undefined, "POST", "/rest/v1/rpc/driver_start_mobile_tracking", {
      ...driverAuth, p_ad_work_day_id: dayId, p_driver_consent: false,
    });
    expect(!noConsent.ok, "Location Proof started without driver consent", noConsent.text);

    const startedRows = await rpc("Start Location Proof", "anon", undefined, "driver_start_mobile_tracking", {
      ...driverAuth, p_ad_work_day_id: dayId, p_driver_consent: true,
    });
    const session = startedRows?.[0]?.tracking_session_id;
    expect(typeof session === "string", "Tracking session was not returned", JSON.stringify(startedRows));

    const live = locationPoint(session);
    const recorded = await rpc("Record location point", "anon", undefined, "driver_record_mobile_location_point", {
      ...driverAuth,
      p_tracking_session_id: session,
      p_lat: live.latitude,
      p_lng: live.longitude,
      p_accuracy: live.accuracy,
      p_speed: null,
      p_heading: null,
      p_captured_at: live.captured_at,
      p_client_point_id: live.client_point_id,
    });
    expect(recorded?.[0]?.tracking_session_id === session, "Location point was not saved", JSON.stringify(recorded));

    // With the right session id and mobile number, an empty or short Work Code must still be refused.
    for (const badCode of ["", "AB", null]) {
      const probe = locationPoint(session);
      const refused = await call("anon", undefined, "POST", "/rest/v1/rpc/driver_record_mobile_location_point", {
        p_mobile: driverPhone,
        p_work_code: badCode,
        p_tracking_session_id: session,
        p_lat: probe.latitude,
        p_lng: probe.longitude,
        p_accuracy: probe.accuracy,
        p_speed: null,
        p_heading: null,
        p_captured_at: probe.captured_at,
        p_client_point_id: probe.client_point_id,
      });
      expect(!refused.ok, "A location point was saved with Work Code " + JSON.stringify(badCode), refused.text);
    }

    const buffered = [locationPoint(session), locationPoint(session)];
    const synced = await rpc("Sync buffered points", "anon", undefined, "driver_sync_mobile_location_points_v2", {
      ...driverAuth, p_tracking_session_id: session, p_points: buffered, p_client_pending_count: buffered.length,
    });
    const accepted = synced?.[0]?.accepted_client_point_ids ?? [];
    expect(accepted.length === 2, "Both buffered points were not accepted", JSON.stringify(synced));

    const resynced = await rpc("Sync the same points again", "anon", undefined, "driver_sync_mobile_location_points_v2", {
      ...driverAuth, p_tracking_session_id: session, p_points: buffered, p_client_pending_count: 0,
    });
    expect(resynced?.[0]?.point_count === synced[0].point_count, "Re-sending the same points created duplicates", JSON.stringify(resynced));
    note("Points after sync: " + synced[0].point_count + "; duplicate_count on retry: " + resynced?.[0]?.duplicate_count);
    return session;
  });

  await step("Admin: Stop Phone Location Proof; the driver can start it again", async () => {
    const stopped = await rpc("Admin stop Location Proof", "anon", adminToken, "admin_stop_mobile_tracking", {
      p_tracking_session_id: sessionId,
    });
    expect(stopped?.[0]?.status === "stopped", "Admin stop did not stop Location Proof", JSON.stringify(stopped));
    const late = locationPoint(sessionId);
    const refusedPoint = await call("anon", undefined, "POST", "/rest/v1/rpc/driver_record_mobile_location_point", {
      ...driverAuth,
      p_tracking_session_id: sessionId,
      p_lat: late.latitude,
      p_lng: late.longitude,
      p_accuracy: late.accuracy,
      p_speed: null,
      p_heading: null,
      p_captured_at: late.captured_at,
      p_client_point_id: late.client_point_id,
    });
    expect(!refusedPoint.ok, "A location point was saved after the admin stopped Location Proof", refusedPoint.text);
    const restarted = await rpc("Start Location Proof again", "anon", undefined, "driver_start_mobile_tracking", {
      ...driverAuth, p_ad_work_day_id: dayId, p_driver_consent: true,
    });
    expect(typeof restarted?.[0]?.tracking_session_id === "string", "Driver could not start Location Proof again", JSON.stringify(restarted));
    note("Session after restart is " + (restarted[0].tracking_session_id === sessionId ? "the same" : "a new") + " session; status " + restarted[0].status);
  });

  await step("Driver app: add a Proof Note", async () => {
    await workAction("add_proof_note", {
      p_note: "Fake announcement done near the market",
      p_area_place_name: "Fake Market",
      p_proof_type: "announcement_done",
    });
  });

  const proofUploadId = await step("Driver app: upload a photo proof; a retry reuses the same record", async () => {
    const photo = tinyJpeg();
    const request = {
      ...driverAuth,
      p_ad_work_day_id: dayId,
      p_proof_type: "area_covered",
      p_area_place_name: "Fake Main Road",
      p_note_text: "Fake photo of the vehicle on the main road",
      p_file_mime_type: "image/jpeg",
      p_file_size_bytes: photo.length,
      p_client_request_id: clientId("proof"),
    };
    const slots = await rpc("Request proof upload", "anon", undefined, "request_driver_proof_upload", request);
    const slot = slots?.[0];
    expect(slot?.file_bucket === "proof-photos" && typeof slot?.file_path === "string", "Upload slot was not returned", JSON.stringify(slots));
    const retry = await rpc("Retry proof upload request", "anon", undefined, "request_driver_proof_upload", request);
    expect(retry?.[0]?.proof_upload_id === slot.proof_upload_id, "Retrying the proof request created a second record", JSON.stringify(retry));

    const objectPath = "/storage/v1/object/" + slot.file_bucket + "/" + slot.file_path.split("/").map(encodeURIComponent).join("/");
    const upload = await fetch(apiUrl + objectPath, {
      method: "POST",
      headers: { ...headersFor("anon"), "Content-Type": "image/jpeg", "x-upsert": "false" },
      body: photo,
    });
    expect(upload.ok, "Photo upload failed with HTTP " + upload.status, await upload.text());

    const stray = await fetch(apiUrl + "/storage/v1/object/proof-photos/stray-" + runId + ".jpg", {
      method: "POST",
      headers: { ...headersFor("anon"), "Content-Type": "image/jpeg", "x-upsert": "false" },
      body: photo,
    });
    expect(!stray.ok, "An anonymous upload to an unapproved path was accepted", await stray.text());

    const anonRead = await fetch(apiUrl + objectPath, { headers: headersFor("anon") });
    expect(!anonRead.ok, "An anonymous caller downloaded a proof photo");
    await anonRead.arrayBuffer();

    const completed = await rpc("Complete proof upload", "anon", undefined, "complete_driver_proof_upload", {
      ...driverAuth, p_proof_upload_id: slot.proof_upload_id,
    });
    expect(completed?.[0]?.upload_status === "uploaded", "Proof upload was not completed", JSON.stringify(completed));
    return slot.proof_upload_id;
  });

  await step("Driver app: Take Break, Resume Work, End Work", async () => {
    const onBreak = await workAction("take_break");
    expect(onBreak?.[0]?.execution_status === "on_break", "Work day is not On Break", JSON.stringify(onBreak));
    const resumed = await workAction("resume");
    expect(resumed?.[0]?.execution_status === "running", "Work day is not Running after Resume", JSON.stringify(resumed));
    const noNote = await call("anon", undefined, "POST", "/rest/v1/rpc/driver_update_work_day", {
      ...driverAuth, p_ad_work_day_id: dayId, p_action: "end", p_note: null, p_area_place_name: null, p_proof_type: null,
    });
    expect(!noNote.ok, "End Work was accepted without a completion note", noNote.text);
    const ended = await workAction("end", { p_note: "Fake work completed in all areas" });
    expect(ended?.[0]?.execution_status === "completed", "Work day is not Completed after End Work", JSON.stringify(ended));
  });

  // --------------------------------------------------- admin: review/close
  await step("Admin: sees the session, points, proof note and proof photo", async () => {
    const sessions = await mustCall(
      "Read tracking sessions", "anon", adminToken, "GET",
      "/rest/v1/tracking_sessions?select=" + listQueries.get("tracking_sessions") + "&ad_work_id=eq." + adWorkId,
    );
    expect(sessions?.some((row) => row.id === sessionId), "Admin cannot see the tracking session", JSON.stringify(sessions));
    expect(sessions.every((row) => row.status !== "running"), "Location Proof is still running after End Work", JSON.stringify(sessions.map((row) => row.status)));
    note("Tracking session statuses after End Work: " + sessions.map((row) => row.status).join(", "));

    const points = await mustCall(
      "Read location points", "anon", adminToken, "GET",
      "/rest/v1/location_points?select=" + listQueries.get("location_points") + "&ad_work_id=eq." + adWorkId,
    );
    expect(points?.length === 3, "Admin does not see exactly the three saved points", "points: " + points?.length);

    const notes = await mustCall(
      "Read proof notes", "anon", adminToken, "GET",
      "/rest/v1/execution_proof_notes?select=" + listQueries.get("execution_proof_notes") + "&ad_work_id=eq." + adWorkId,
    );
    expect(notes?.length >= 1, "Admin does not see the driver's Proof Note", JSON.stringify(notes));

    const proofs = await mustCall(
      "Read proof uploads", "anon", adminToken, "GET",
      "/rest/v1/proof_uploads?select=" + listQueries.get("proof_uploads") + "&ad_work_id=eq." + adWorkId,
    );
    const proof = proofs?.find((row) => row.id === proofUploadId);
    expect(Boolean(proof), "Admin does not see the uploaded proof", JSON.stringify(proofs));

    const signed = await mustCall(
      "Sign proof photo URL", "anon", adminToken, "POST",
      "/storage/v1/object/sign/" + proof.file_bucket + "/" + proof.file_path.split("/").map(encodeURIComponent).join("/"),
      { expiresIn: 300 },
    );
    const signedPath = signed?.signedURL ?? signed?.signedUrl;
    expect(typeof signedPath === "string", "Signed preview link was not returned", JSON.stringify(signed));
    const preview = await fetch(signedPath.startsWith("http") ? signedPath : apiUrl + "/storage/v1" + signedPath);
    const bytes = Buffer.from(await preview.arrayBuffer());
    expect(preview.ok && bytes.equals(tinyJpeg()), "Signed preview did not return the uploaded photo", "HTTP " + preview.status + ", bytes " + bytes.length);
  });

  await step("Admin: approve proof, share a Customer Update, review Location Proof", async () => {
    const reviewed = await rpc("Review proof upload", "anon", adminToken, "review_proof_upload", {
      p_proof_upload_id: proofUploadId,
      p_review_status: "approved",
      p_admin_review_note: "Fake approval",
    });
    expect(reviewed?.[0]?.review_status === "approved", "Proof was not approved", JSON.stringify(reviewed));

    const updates = await mustCall(
      "Read customer updates", "anon", adminToken, "GET",
      "/rest/v1/customer_updates?select=" + listQueries.get("customer_updates") + "&ad_work_id=eq." + adWorkId,
    );
    note("Customer Update records created by the flow: " + updates.length);
    for (const update of updates) {
      await rpc("Mark customer update shared", "anon", adminToken, "mark_customer_update_shared", {
        p_customer_update_id: update.id,
        p_sharing_method: "phone_call",
        p_sharing_note: "Fake call",
      });
    }

    const review = await rpc("Review Location Proof", "anon", adminToken, "update_location_proof_review", {
      p_ad_work_id: adWorkId,
      p_review_status: "reviewed",
      p_review_note: "Fake review",
    });
    expect(review?.[0]?.review_status === "reviewed", "Location Proof Review was not saved", JSON.stringify(review));
  });

  await step("Admin: prepare the Final Proof Summary and close the Ad Work", async () => {
    const summaryArgs = {
      p_ad_work_id: adWorkId,
      p_proof_not_required: false,
      p_customer_updates_reviewed: true,
      p_internal_admin_note: "Fake closure",
      p_include_phone_location_proof: false,
      p_phone_location_proof_customer_note: null,
      p_phone_location_proof_customer_safe_confirmed: false,
    };
    const prepared = await rpc("Prepare final summary", "anon", adminToken, "prepare_flexible_final_proof_summary", {
      ...summaryArgs,
      p_final_summary_reviewed: true,
    });
    const summary = prepared?.[0];
    expect(typeof summary?.final_summary_id === "string", "Final Proof Summary was not created", JSON.stringify(prepared));
    note("Closure status after review: " + summary.closure_status + "; warnings: " + JSON.stringify(summary.warnings ?? []));
    expect(typeof summary.summary_text === "string" && summary.summary_text.length > 0, "Final Proof Summary text is empty");
    // The fake points sit near 15.5, 80.05. Neither value may reach customer-facing text.
    expect(!/\b(15\.5\d{2,}|80\.05\d{2,})/.test(summary.summary_text), "Final Proof Summary text contains the phone's coordinates", summary.summary_text);

    const closed = await rpc("Close Ad Work", "anon", adminToken, "close_flexible_ad_work_with_final_summary", {
      ...summaryArgs,
      p_closure_reason: null,
      p_closure_note: "Fake closure note",
      p_customer_accepted: "yes",
    });
    const status = closed?.[0]?.closure_status;
    expect(status === "closed" || status === "closed_with_issues", "Ad Work was not closed", JSON.stringify(closed));
    note("Final closure status: " + status + "; warnings: " + JSON.stringify(closed[0].warnings ?? []));

    const shared = await rpc("Mark final summary shared", "anon", adminToken, "mark_final_summary_shared", {
      p_ad_work_id: adWorkId,
      p_share_method: "phone_call",
      p_share_note: "Fake call",
    });
    expect(shared?.[0]?.shared_status === "shared_manually", "Final summary was not marked shared", JSON.stringify(shared));
  });

  await step("After closure: driver and anonymous access", async () => {
    const afterClose = await call("anon", undefined, "POST", "/rest/v1/rpc/driver_get_assigned_work", driverAuth);
    note("Driver opening closed work with the old code: " + (afterClose.ok ? "still allowed" : "refused (HTTP " + afterClose.status + ")"));
    const lateStart = await call("anon", undefined, "POST", "/rest/v1/rpc/driver_start_mobile_tracking", {
      ...driverAuth, p_ad_work_day_id: dayId, p_driver_consent: true,
    });
    expect(!lateStart.ok, "Location Proof could be started after the work was closed", lateStart.text);
    for (const table of ["ad_works", "ad_work_days", "drivers", "vehicles", "location_points", "tracking_sessions", "proof_uploads", "customer_updates", "final_proof_summaries", "user_profiles"]) {
      await expectRefused("Anonymous read of " + table, "anon", undefined, "GET", "/rest/v1/" + table + "?select=*&limit=1");
    }
  });
}

function writeSummary(error) {
  const lines = ["## End-to-end flow check", ""];
  for (const result of results) {
    lines.push("- ok: " + result.name + " (" + result.ms + " ms)");
  }
  if (error) {
    lines.push("- FAILED: " + currentStep, "", "```", String(error.message).slice(0, 1500), "```");
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
  }
}

try {
  await main();
  writeSummary(null);
  console.log("\nEnd-to-end flow check passed: " + results.length + " steps.");
} catch (error) {
  writeSummary(error);
  console.error("\nFAIL " + currentStep);
  console.error("    " + (error instanceof Error ? error.message : String(error)));
  if (!(error instanceof StepFailure) && error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
}
