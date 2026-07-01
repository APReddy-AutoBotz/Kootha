import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  businessLabels,
  canStartMobileLocationProof,
  getLocationQualityFromAccuracy,
  hasDuplicateValues,
  locationQualityLabels,
  locationQualityOptions,
  mobileLocationProofConsentText,
  trackingSessionStatusLabels,
  trackingSessionStatusOptions,
  trackingSources,
  trackingStopReasonLabels,
  trackingStopReasonOptions
} from "@kootha/shared";

const driverAppSource = readFileSync(path.resolve("apps/driver/App.tsx"), "utf8");
const driverConfig = readFileSync(path.resolve("apps/driver/app.json"), "utf8");
const webAdminSource = readFileSync(path.resolve("apps/web/src/admin.tsx"), "utf8");
const envExample = readFileSync(path.resolve(".env.example"), "utf8");
const packageJson = readFileSync(path.resolve("package.json"), "utf8");
const webPackageJson = readFileSync(path.resolve("apps/web/package.json"), "utf8");
const driverPackageJson = readFileSync(path.resolve("apps/driver/package.json"), "utf8");
const m0Migration = readFileSync(path.resolve("supabase/migrations/20260630000000_m0_foundation.sql"), "utf8");
const m3Migration = readFileSync(path.resolve("supabase/migrations/20260630030000_m3_campaign_planning_scheduling.sql"), "utf8");
const m9Migration = readFileSync(path.resolve("supabase/migrations/20260701090000_m9_mobile_gps_tracking_foundation.sql"), "utf8");
const tasks = readFileSync(path.resolve(".kiro/specs/kootha-prachar-mvp/tasks.md"), "utf8");

describe("M9 mobile GPS tracking foundation", () => {
  it("defines Phone Location Proof statuses, labels, and helper rules", () => {
    expect(hasDuplicateValues(trackingSessionStatusOptions)).toBe(false);
    expect(hasDuplicateValues(trackingStopReasonOptions)).toBe(false);
    expect(hasDuplicateValues(locationQualityOptions)).toBe(false);
    expect(trackingSources).toEqual(["phone"]);
    expect(Object.values(trackingSessionStatusLabels)).toEqual([
      "Not Started",
      "Running",
      "Paused",
      "Stopped",
      "Completed",
      "Failed",
      "Permission Missing"
    ]);
    expect(Object.values(trackingStopReasonLabels)).toEqual([
      "Work Ended",
      "Break Started",
      "Admin Stopped",
      "Permission Removed",
      "App Error",
      "Other"
    ]);
    expect(Object.values(locationQualityLabels)).toEqual(["Good", "Weak", "Unknown"]);
    expect(getLocationQualityFromAccuracy(12)).toBe("good");
    expect(getLocationQualityFromAccuracy(75)).toBe("weak");
    expect(getLocationQualityFromAccuracy(null)).toBe("unknown");
    expect(canStartMobileLocationProof({
      mobileLocationProofRequired: true,
      assignmentStatus: "ready_for_execution",
      releaseStatus: "released_to_driver",
      dayStatus: "running",
      closureStatus: null
    })).toBe(true);
    expect(canStartMobileLocationProof({
      mobileLocationProofRequired: false,
      assignmentStatus: "ready_for_execution",
      releaseStatus: "released_to_driver",
      dayStatus: "running",
      closureStatus: null
    })).toBe(false);
    expect(canStartMobileLocationProof({
      mobileLocationProofRequired: true,
      assignmentStatus: "ready_for_execution",
      releaseStatus: "released_to_driver",
      dayStatus: "planned",
      closureStatus: null
    })).toBe(false);
    expect(canStartMobileLocationProof({
      mobileLocationProofRequired: true,
      assignmentStatus: "ready_for_execution",
      releaseStatus: "released_to_driver",
      dayStatus: "running",
      closureStatus: "closed"
    })).toBe(false);
  });

  it("adds admin-controlled tracking schema with admin-only RLS", () => {
    const lowerSql = m9Migration.toLowerCase();

    expect(m9Migration).toContain("alter type public.tracking_session_status add value if not exists 'failed'");
    expect(m9Migration).toContain("alter type public.tracking_session_status add value if not exists 'permission_missing'");
    expect(m9Migration).toContain("alter type public.tracking_source add value if not exists 'phone'");
    expect(m9Migration).toContain("mobile_location_proof_required boolean not null default false");
    expect(m9Migration).toContain("mobile_location_tracking_mode text not null default 'phone_location'");
    expect(m9Migration).toContain("add column if not exists ad_work_id uuid references public.ad_works");
    expect(m9Migration).toContain("add column if not exists assignment_id uuid references public.ad_work_assignments");
    expect(m9Migration).toContain("add column if not exists last_update_at timestamptz");
    expect(m9Migration).toContain("add column if not exists point_count integer not null default 0");
    expect(m9Migration).toContain("add column if not exists quality_status public.location_quality not null default 'unknown'");
    expect(m9Migration).toContain("add column if not exists heading numeric(8, 2)");
    expect(lowerSql).toContain("alter table public.tracking_sessions enable row level security");
    expect(lowerSql).toContain("alter table public.location_points enable row level security");
    expect(lowerSql).toContain("revoke all on public.tracking_sessions from anon");
    expect(lowerSql).toContain("revoke all on public.location_points from anon");
    expect(lowerSql).toContain("using (public.is_admin())");
    expect(m9Migration).not.toMatch(/for select\s+to anon/i);
  });

  it("adds driver tracking RPCs with mobile, Work Code, release, status, and closure checks", () => {
    const lowerSql = m9Migration.toLowerCase();

    expect(m9Migration).toContain("create or replace function public.set_mobile_location_proof");
    expect(m9Migration).toContain("create or replace function public.driver_start_mobile_tracking");
    expect(m9Migration).toContain("create or replace function public.driver_mark_mobile_location_permission_missing");
    expect(m9Migration).toContain("create or replace function public.driver_record_mobile_location_point");
    expect(m9Migration).toContain("create or replace function public.driver_stop_mobile_tracking");
    expect(m9Migration).toContain("create or replace function public.admin_stop_mobile_tracking");
    expect(m9Migration).toContain("if not public.is_admin() then");
    expect(m9Migration).toContain("public.m6_normalize_mobile(driver_record.phone) = public.m6_normalize_mobile(p_mobile)");
    expect(m9Migration).toContain("aw.execution_release_status = 'released_to_driver'");
    expect(m9Migration).toContain("assignment.status = 'ready_for_execution'");
    expect(m9Migration).toContain("v_day.execution_status <> 'running'");
    expect(m9Migration).toContain("v_day.work_date <> current_date");
    expect(m9Migration).toContain("Location Proof is not available after work is closed");
    expect(m9Migration).toContain("'phone'");
    expect(m9Migration).toContain("customer_live_enabled = false");
    expect(m9Migration).toContain("live_tracking_enabled = false");
    expect(lowerSql).toContain("security definer");
    expect(lowerSql).toContain("set search_path = public");
    expect(m9Migration).toContain("grant execute on function public.driver_start_mobile_tracking(text, text, uuid, boolean) to anon");
    expect(m9Migration).toContain("grant execute on function public.driver_record_mobile_location_point(text, text, uuid, numeric, numeric, numeric, numeric, numeric, timestamptz) to anon");
    expect(m9Migration).toContain("grant execute on function public.set_mobile_location_proof(uuid, boolean, text) to authenticated");
  });

  it("stops Phone Location Proof on break, end, revoke, admin stop, and closure", () => {
    expect(m9Migration).toContain("create or replace function public.m9_stop_tracking_for_day_status");
    expect(m9Migration).toContain("create trigger m9_stop_tracking_for_day_status_trigger");
    expect(m9Migration).toContain("new.execution_status = 'on_break'");
    expect(m9Migration).toContain("new.execution_status in ('completed', 'cancelled', 'issue_reported')");
    expect(m9Migration).toContain("create or replace function public.m9_stop_tracking_for_ad_work_lock");
    expect(m9Migration).toContain("new.execution_release_status = 'access_revoked'");
    expect(m9Migration).toContain("coalesce(new.closure_status, 'not_ready') in ('closed', 'closed_with_issues', 'cancelled')");
    expect(m9Migration).toContain("stop_reason = 'admin_stopped'");
    expect(m9Migration).toContain("stop_reason = case when new.execution_status = 'completed' then 'work_ended' else 'other' end");
  });

  it("adds admin and driver UI for foreground-only Phone Location Proof", () => {
    expect(webAdminSource).toContain("AdminMobileLocationProofPanel");
    expect(webAdminSource).toContain("M9SummaryCards");
    expect(webAdminSource).toContain("set_mobile_location_proof");
    expect(webAdminSource).toContain("admin_stop_mobile_tracking");
    expect(webAdminSource).toContain("Phone Location Proof");
    expect(driverPackageJson).toContain("expo-location");
    expect(driverConfig).toContain("android.permission.ACCESS_FINE_LOCATION");
    expect(driverConfig).not.toContain("ACCESS_BACKGROUND_LOCATION");
    expect(driverConfig).not.toContain("ACCESS_COARSE_LOCATION");
    expect(driverAppSource).toContain("requestForegroundPermissionsAsync");
    expect(driverAppSource).toContain("getCurrentPositionAsync");
    expect(driverAppSource).not.toContain("requestBackgroundPermissionsAsync");
    expect(driverAppSource).toContain("driver_start_mobile_tracking");
    expect(driverAppSource).toContain("driver_record_mobile_location_point");
    expect(driverAppSource).toContain("driver_stop_mobile_tracking");
    expect(mobileLocationProofConsentText).toContain("phone location only during this assigned advertisement work");
    expect(driverAppSource).toContain("mobileLocationProofConsentText");
    expect(Object.values(businessLabels.driver)).toEqual(expect.arrayContaining([
      "Allow Location Proof",
      "Start Location Proof",
      "Stop Location Proof",
      "Location Proof Running",
      "Location Permission Needed"
    ]));
    expect(Object.values(businessLabels.admin)).toEqual(expect.arrayContaining([
      "Phone Location Proof",
      "Location Proof Required",
      "Driver Must Allow Location",
      "Tracking Starts Only During Work",
      "Tracking Stops After Work"
    ]));
  });

  it("does not add maps, background location, device ingestion, customer live links, providers, payments, apps, iOS, or PWA", () => {
    const source = (driverAppSource + "\n" + webAdminSource + "\n" + packageJson + "\n" + webPackageJson + "\n" + driverPackageJson + "\n" + m9Migration).toLowerCase();

    expect(source).not.toContain("access_background_location");
    expect(source).not.toContain("maps.googleapis");
    expect(source).not.toContain("google maps");
    expect(source).not.toContain("mapbox");
    expect(source).not.toContain("leaflet");
    expect(source).not.toContain("gps_device_ingest");
    expect(source).not.toContain("device location ingest");
    expect(source).not.toMatch(/href=["'][^"']*live/);
    expect(source).not.toContain("public_token");
    expect(source).not.toContain("stripe");
    expect(source).not.toContain("razorpay");
    expect(source).not.toContain("cashfree");
    expect(source).not.toContain("twilio");
    expect(source).not.toContain("whatsapp business");
    expect(source).not.toContain("sms provider");
    expect(source).not.toContain("report_snapshot");
    expect(existsSync(path.resolve("apps/customer"))).toBe(false);
    expect(existsSync(path.resolve("apps/web/public/manifest.webmanifest"))).toBe(false);
    expect(existsSync(path.resolve("apps/web/src/service-worker.ts"))).toBe(false);
    expect(existsSync(path.resolve("apps/driver/ios"))).toBe(false);
  });

  it("does not use privileged keys and keeps live customer tracking disabled", () => {
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

  it("marks M9 complete without starting M10", () => {
    expect(tasks).toMatch(/## Milestone M9 - Mobile GPS Tracking Foundation[\s\S]*- \[x\]/);
    expect(tasks).not.toMatch(/## Milestone M10[\s\S]*- \[x\]/);
  });
});