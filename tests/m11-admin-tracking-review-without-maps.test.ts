import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  getLocationProofReviewStatusLabel,
  getLocationProofWarningLabel,
  hasDuplicateValues,
  locationProofReviewStatusLabels,
  locationProofReviewStatusOptions,
  locationProofWarningLabels,
  locationProofWarningOptions
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
const m7Migration = readFileSync(path.resolve("supabase/migrations/20260701070000_m7_proof_upload_customer_update_sharing.sql"), "utf8");
const m11Migration = readFileSync(path.resolve("supabase/migrations/20260701110000_m11_admin_tracking_review_without_maps.sql"), "utf8");
const tasks = readFileSync(path.resolve(".kiro/specs/kootha-prachar-mvp/tasks.md"), "utf8");

const lowerM11 = m11Migration.toLowerCase();

describe("M11 admin tracking review without maps", () => {
  it("defines Location Proof Review statuses and warning labels", () => {
    expect(hasDuplicateValues(locationProofReviewStatusOptions)).toBe(false);
    expect(hasDuplicateValues(locationProofWarningOptions)).toBe(false);
    expect(Object.values(locationProofReviewStatusLabels)).toEqual([
      "Not Reviewed",
      "Reviewed",
      "Needs Follow-up",
      "Accepted",
      "Rejected",
      "Not Required"
    ]);
    expect(Object.values(locationProofWarningLabels)).toEqual([
      "No Location Points",
      "Late First Location",
      "Long Gap",
      "Stopped Early",
      "Permission Missing",
      "Sync Failed",
      "Points After Work End"
    ]);
    expect(getLocationProofReviewStatusLabel("needs_follow_up")).toBe("Needs Follow-up");
    expect(getLocationProofWarningLabel("points_after_work_end")).toBe("Points After Work End");
  });

  it("adds admin-only Location Proof Review storage and an explicit admin-check RPC", () => {
    expect(lowerM11).toContain("create table if not exists public.location_proof_reviews");
    expect(lowerM11).toContain("review_status text not null default 'not_reviewed'");
    expect(lowerM11).toContain("unique(ad_work_id)");
    expect(lowerM11).toContain("alter table public.location_proof_reviews enable row level security");
    expect(lowerM11).toContain("using (public.is_admin())");
    expect(lowerM11).toContain("with check (public.is_admin())");
    expect(lowerM11).toContain("revoke all on public.location_proof_reviews from anon");
    expect(lowerM11).toContain("revoke all on public.location_proof_reviews from authenticated");
    expect(lowerM11).toContain("grant select, insert, update, delete on public.location_proof_reviews to authenticated");
    expect(lowerM11).toContain("create or replace function public.update_location_proof_review");
    expect(lowerM11).toContain("security definer");
    expect(lowerM11).toContain("set search_path = public");
    expect(lowerM11).toContain("if not public.is_admin() then");
    expect(lowerM11).toContain("grant execute on function public.update_location_proof_review(uuid, text, text) to authenticated");
    expect(m11Migration).not.toMatch(/grant\s+.*location_proof_reviews\s+to\s+anon/i);
    expect(m11Migration).not.toMatch(/grant execute on function public\.update_location_proof_review[\s\S]*to anon/i);
    expect(m11Migration).not.toContain("using (true)");
  });

  it("adds the no-map admin review UI, dashboard queues, and hidden technical values", () => {
    expect(webAdminSource).toContain("Location Proof Review");
    expect(webAdminSource).toContain("Mobile Location Proof Required");
    expect(webAdminSource).toContain("First Location Received");
    expect(webAdminSource).toContain("Last Location Received");
    expect(webAdminSource).toContain("Points Received");
    expect(webAdminSource).toContain("Offline Points Synced");
    expect(webAdminSource).toContain("Review Location Proof");
    expect(webAdminSource).toContain("Mark as Reviewed");
    expect(webAdminSource).toContain("Needs Follow-up");
    expect(webAdminSource).toContain("Show technical location values");
    expect(webAdminSource).toContain("Technical Location Values");
    expect(webAdminSource).toContain("M11SummaryCards");
    expect(webAdminSource).toContain("Location Proof Waiting Review");
    expect(webAdminSource).toContain("Ad Works with No Location Points");
    expect(webAdminSource).toContain("Ad Works with Offline Sync");
    expect(webAdminSource).toContain("Location Proof Reviewed Today");
  });

  it("shows day-wise tracking review and expected warning names", () => {
    expect(webAdminSource).toContain("Day-wise Tracking Review");
    expect(webAdminSource).toContain("Planned Start / End");
    expect(webAdminSource).toContain("First Point");
    expect(webAdminSource).toContain("Last Point");
    expect(webAdminSource).toContain("Warning Count");
    expect(webAdminSource).toContain("Offline Sync Status");
    expect(webAdminSource).toContain("getLocationProofWarningLabel");
    expect(Object.values(locationProofWarningLabels)).toEqual(expect.arrayContaining([
      "No Location Points",
      "Late First Location",
      "Long Gap",
      "Stopped Early",
      "Permission Missing",
      "Sync Failed",
      "Points After Work End"
    ]));
  });

  it("adds safe Phone Location Proof wording to final summaries without route, map, distance, or live claims", () => {
    expect(m11Migration).toContain("Phone Location Proof: Reviewed by admin");
    expect(m11Migration).toContain("Phone Location Proof: Needs follow-up");
    expect(m11Migration).toContain("Phone Location Proof: Not required");
    expect(m11Migration).toContain("Phone Location Proof: Not available");
    expect(m11Migration).toContain("Location proof summary:");
    expect(lowerM11).not.toContain("route verified");
    expect(lowerM11).not.toContain("area verified by gps");
    expect(lowerM11).not.toContain("map verified");
    expect(lowerM11).not.toContain("distance certified");
    expect(lowerM11).not.toContain("customer watched live");
  });

  it("keeps proof photos private, live flags false, and committed environment values placeholder-only", () => {
    const forbiddenKeyName = ["service", "role"].join("_");
    const forbiddenEnvName = ["SUPABASE", "SERVICE", "ROLE"].join("_");
    const source = driverAppSource + "\n" + webAdminSource;

    expect(source).not.toContain(forbiddenKeyName);
    expect(source).not.toContain(forbiddenEnvName);
    expect(envExample).toContain("https://your-project.supabase.co");
    expect(envExample).toContain("replace-with-public-anon-key");
    expect(envExample).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    expect(m7Migration).toContain("'proof-photos', 'proof-photos', false, 5242880");
    expect(m0Migration).toMatch(/customer_live_enabled\s+boolean\s+not null\s+default false/i);
    expect(m3Migration).toMatch(/live_tracking_enabled boolean not null default false/i);
  });

  it("does not add background location, maps, public tracking, providers, payments, customer apps, iOS, or PWA", () => {
    const source = (driverAppSource + "\n" + webAdminSource + "\n" + packageJson + "\n" + webPackageJson + "\n" + driverPackageJson + "\n" + m11Migration).toLowerCase();

    expect(driverConfig).toContain("android.permission.ACCESS_FINE_LOCATION");
    expect(driverConfig).not.toContain("ACCESS_BACKGROUND_LOCATION");
    expect(source).not.toContain("requestbackgroundpermissionsasync");
    expect(source).not.toContain("startlocationupdatesasync");
    expect(source).not.toContain("expo-task-manager");
    expect(source).not.toContain("maps.googleapis");
    expect(source).not.toContain("google.maps");
    expect(source).not.toContain("mapbox");
    expect(source).not.toContain("leaflet");
    expect(source).not.toContain("gps_device_ingest");
    expect(source).not.toContain("public_location_access");
    expect(source).not.toContain("customer_live_tracking_link");
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

  it("marks M11 complete and leaves M12 not started", () => {
    expect(tasks).toMatch(/## Milestone M11 - Admin Tracking Review Without Maps[\s\S]*- \[x\]/);
    expect(tasks).toMatch(/## Milestone M12 - Location Proof in Final Summary[\s\S]*- \[ \] Not started\./);
  });
});