import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  businessLabels,
  getTrackingHealthStatusLabel,
  hasDuplicateValues,
  trackingHealthStatusLabels,
  trackingHealthStatusOptions
} from "@kootha/shared";

const driverAppSource = readFileSync(path.resolve("apps/driver/App.tsx"), "utf8");
const driverPackageJson = readFileSync(path.resolve("apps/driver/package.json"), "utf8");
const driverConfig = readFileSync(path.resolve("apps/driver/app.json"), "utf8");
const webAdminSource = readFileSync(path.resolve("apps/web/src/admin.tsx"), "utf8");
const packageJson = readFileSync(path.resolve("package.json"), "utf8");
const webPackageJson = readFileSync(path.resolve("apps/web/package.json"), "utf8");
const envExample = readFileSync(path.resolve(".env.example"), "utf8");
const m0Migration = readFileSync(path.resolve("supabase/migrations/20260630000000_m0_foundation.sql"), "utf8");
const m3Migration = readFileSync(path.resolve("supabase/migrations/20260630030000_m3_campaign_planning_scheduling.sql"), "utf8");
const m10Migration = readFileSync(path.resolve("supabase/migrations/20260701100000_m10_mobile_gps_reliability_offline_buffer.sql"), "utf8");
const tasks = readFileSync(path.resolve(".kiro/specs/kootha-prachar-mvp/tasks.md"), "utf8");

describe("M10 mobile GPS reliability and offline buffer", () => {
  it("defines simple tracking health statuses and labels", () => {
    expect(hasDuplicateValues(trackingHealthStatusOptions)).toBe(false);
    expect(Object.values(trackingHealthStatusLabels)).toEqual([
      "Healthy",
      "No Recent Update",
      "Permission Missing",
      "Offline Saving",
      "Sync Pending",
      "Sync Failed",
      "Stopped"
    ]);
    expect(getTrackingHealthStatusLabel("sync_pending")).toBe("Sync Pending");
  });

  it("adds an AsyncStorage offline buffer in the driver app", () => {
    expect(driverPackageJson).toContain("@react-native-async-storage/async-storage");
    expect(driverAppSource).toContain("AsyncStorage");
    expect(driverAppSource).toContain("locationBufferStorageKey");
    expect(driverAppSource).toContain("saveBufferedLocationPoint");
    expect(driverAppSource).toContain("markBufferedLocationPointsFailed");
    expect(driverAppSource).toContain("removeAcceptedBufferedLocationPoints");
    expect(driverAppSource).toContain("retry_count");
    expect(driverAppSource).toContain("last_sync_attempt_at");
  });

  it("syncs pending points with client idempotency keys", () => {
    expect(driverAppSource).toContain("createClientPointId");
    expect(driverAppSource).toContain("client_point_id");
    expect(driverAppSource).toContain("driver_sync_mobile_location_points");
    expect(driverAppSource).toContain("accepted_client_point_ids");
    expect(driverAppSource).toContain("Sync Now");
    expect(driverAppSource).toContain("syncBufferedLocationPointsForWork");
    expect(m10Migration).toContain("client_point_id text");
    expect(m10Migration).toContain("location_points_session_client_point_idx");
    expect(m10Migration).toContain("on conflict (tracking_session_id, client_point_id) do nothing");
  });

  it("keeps buffered points scoped to active assigned work/session", () => {
    expect(driverAppSource).toContain("isPointForWork");
    expect(driverAppSource).toContain("point.ad_work_id === work.ad_work_id");
    expect(driverAppSource).toContain("point.assignment_id === work.assignment_id");
    expect(driverAppSource).toContain("point.driver_id === work.driver_id");
    expect(m10Migration).toContain("v_ad_work_id <> v_ad_work.id");
    expect(m10Migration).toContain("v_assignment_id <> v_assignment.id");
    expect(m10Migration).toContain("v_driver_id <> v_assignment.driver_id");
  });

  it("validates mobile, Work Code, released assignment, active/completed capture windows, and wrong-work rejection", () => {
    expect(m10Migration).toContain("public.m6_normalize_mobile(v_driver.phone) <> public.m6_normalize_mobile(p_mobile)");
    expect(m10Migration).toContain("v_ad_work.work_access_code_hash <> public.m6_hash_work_code(p_work_code)");
    expect(m10Migration).toContain("v_ad_work.execution_release_status <> 'released_to_driver'");
    expect(m10Migration).toContain("v_assignment.status <> 'ready_for_execution'");
    expect(m10Migration).toContain("v_day.execution_status = 'running'");
    expect(m10Migration).toContain("v_day.execution_status in ('completed', 'issue_reported')");
    expect(m10Migration).toContain("v_captured_at > v_day.execution_completed_at");
  });

  it("keeps tracking data admin-only through RLS and safe RPC grants", () => {
    expect(m10Migration).toContain("alter table public.tracking_sessions enable row level security");
    expect(m10Migration).toContain("alter table public.location_points enable row level security");
    expect(m10Migration).toContain("security definer");
    expect(m10Migration).toContain("set search_path = public");
    expect(m10Migration).toContain("grant execute on function public.driver_sync_mobile_location_points(text, text, uuid, jsonb, integer) to anon");
    expect(m10Migration).not.toMatch(/for select\s+to anon/i);
    expect(m10Migration).not.toContain("using (true)");
  });

  it("shows driver and admin sync health without maps or customer links", () => {
    expect(Object.values(businessLabels.driver)).toEqual(expect.arrayContaining([
      "Syncing Location Proof",
      "Location Saved Offline",
      "Location Synced",
      "Sync Failed",
      "Try Sync Again",
      "Unsynced Points"
    ]));
    expect(driverAppSource).toContain("pendingOfflineCount");
    expect(driverAppSource).toContain("waiting to sync");
    expect(driverAppSource).toContain("Sync Now");
    expect(webAdminSource).toContain("Offline points are pending sync");
    expect(webAdminSource).toContain("No recent location update");
    expect(webAdminSource).toContain("Location sync failed");
    expect(webAdminSource).toContain("getTrackingHealthStatusLabel");
  });

  it("keeps customer live tracking and secrets disabled", () => {
    const forbiddenKeyName = ["service", "role"].join("_");
    const forbiddenEnvName = ["SUPABASE", "SERVICE", "ROLE"].join("_");
    const source = driverAppSource + "\n" + webAdminSource;

    expect(source).not.toContain(forbiddenKeyName);
    expect(source).not.toContain(forbiddenEnvName);
    expect(envExample).toContain("https://your-project.supabase.co");
    expect(envExample).toContain("replace-with-public-anon-key");
    expect(envExample).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    expect(m0Migration).toMatch(/customer_live_enabled\s+boolean\s+not null\s+default false/i);
    expect(m3Migration).toMatch(/live_tracking_enabled boolean not null default false/i);
  });

  it("does not add background location, maps, device ingestion, providers, payments, apps, iOS, or PWA", () => {
    const source = (driverAppSource + "\n" + webAdminSource + "\n" + packageJson + "\n" + webPackageJson + "\n" + driverPackageJson + "\n" + m10Migration).toLowerCase();

    expect(driverConfig).toContain("android.permission.ACCESS_FINE_LOCATION");
    expect(driverConfig).not.toContain("ACCESS_BACKGROUND_LOCATION");
    expect(source).not.toContain("requestbackgroundpermissionsasync");
    expect(source).not.toContain("startlocationupdatesasync");
    expect(source).not.toContain("expo-task-manager");
    expect(source).not.toContain("maps.googleapis");
    expect(source).not.toContain("google maps");
    expect(source).not.toContain("mapbox");
    expect(source).not.toContain("leaflet");
    expect(source).not.toContain("gps_device_ingest");
    expect(source).not.toContain("stripe");
    expect(source).not.toContain("razorpay");
    expect(source).not.toContain("cashfree");
    expect(source).not.toContain("twilio");
    expect(source).not.toContain("whatsapp business");
    expect(source).not.toContain("sms provider");
    expect(existsSync(path.resolve("apps/customer"))).toBe(false);
    expect(existsSync(path.resolve("apps/web/public/manifest.webmanifest"))).toBe(false);
    expect(existsSync(path.resolve("apps/web/src/service-worker.ts"))).toBe(false);
    expect(existsSync(path.resolve("apps/driver/ios"))).toBe(false);
  });

  it("marks M10 complete in the milestone ledger", () => {
    expect(tasks).toMatch(/## Milestone M10 - Mobile GPS Reliability and Offline Buffer[\s\S]*- \[x\]/);
  });
});