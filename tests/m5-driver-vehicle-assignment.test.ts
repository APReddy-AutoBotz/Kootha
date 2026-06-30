import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  adWorkAssignmentStatusLabels,
  adWorkAssignmentStatusOptions,
  buildAssignmentReadiness,
  driverCanBeAssigned,
  hasDuplicateValues,
  vehicleCanBeAssigned
} from "@kootha/shared";

const driverAppSource = readFileSync(path.resolve("apps/driver/App.tsx"), "utf8");
const webAdminSource = readFileSync(path.resolve("apps/web/src/admin.tsx"), "utf8");
const envExample = readFileSync(path.resolve(".env.example"), "utf8");
const packageJson = readFileSync(path.resolve("package.json"), "utf8");
const webPackageJson = readFileSync(path.resolve("apps/web/package.json"), "utf8");
const driverPackageJson = readFileSync(path.resolve("apps/driver/package.json"), "utf8");
const driverConfig = readFileSync(path.resolve("apps/driver/app.json"), "utf8");
const m5Migration = readFileSync(path.resolve("supabase/migrations/20260630050000_m5_driver_vehicle_assignment.sql"), "utf8");
const tasks = readFileSync(path.resolve(".kiro/specs/kootha-prachar-mvp/tasks.md"), "utf8");

const approvedDriver = {
  id: "driver-1",
  name: "Ravi",
  phone: "9876543210",
  city: "Ongole",
  serviceAreas: ["Main Road"],
  approvalStatus: "approved",
  onboardingStatus: "approved" as const,
  availabilityStatus: "available" as const
};

const approvedVehicle = {
  id: "vehicle-1",
  vehicleNumber: "AP00AB1234",
  vehicleType: "auto",
  city: "Ongole",
  active: true,
  onboardingStatus: "approved" as const,
  micSystemAvailable: true,
  gpsDeviceAvailable: "yes" as const,
  gpsDeviceStatus: "installed" as const
};

const readyAdWork = {
  city: "Ongole",
  areasToCover: "Main Road",
  startDate: "2026-07-10",
  endDate: "2026-07-10",
  numberOfDays: 1,
  packageInterest: "standard" as const,
  liveTrackingRequested: "no" as const,
  proofPlanSelected: true
};

describe("M5 driver and vehicle assignment", () => {
  it("defines assignment labels without duplicates", () => {
    expect(hasDuplicateValues(adWorkAssignmentStatusOptions)).toBe(false);
    expect(Object.values(adWorkAssignmentStatusLabels)).toEqual([
      "Not Assigned",
      "Assigned",
      "Needs Review",
      "Ready for Execution",
      "Cancelled"
    ]);
  });

  it("allows only approved drivers to be assigned", () => {
    expect(driverCanBeAssigned(approvedDriver)).toBe(true);
    expect(driverCanBeAssigned({ ...approvedDriver, onboardingStatus: "pending_review" })).toBe(false);
    expect(driverCanBeAssigned({ ...approvedDriver, onboardingStatus: "inactive" })).toBe(false);
    expect(driverCanBeAssigned({ ...approvedDriver, onboardingStatus: "blocked" })).toBe(false);
  });

  it("allows only approved vehicles to be assigned", () => {
    expect(vehicleCanBeAssigned(approvedVehicle)).toBe(true);
    expect(vehicleCanBeAssigned({ ...approvedVehicle, onboardingStatus: "pending_review" })).toBe(false);
    expect(vehicleCanBeAssigned({ ...approvedVehicle, onboardingStatus: "inactive" })).toBe(false);
    expect(vehicleCanBeAssigned({ ...approvedVehicle, onboardingStatus: "blocked" })).toBe(false);
    expect(vehicleCanBeAssigned({ ...approvedVehicle, active: false })).toBe(false);
  });

  it("builds readiness checks for approved driver and vehicle", () => {
    const readiness = buildAssignmentReadiness({
      adWork: readyAdWork,
      driver: approvedDriver,
      vehicle: approvedVehicle,
      requestedStatus: "ready_for_execution"
    });

    expect(readiness.ready).toBe(true);
    expect(readiness.checks.every((check) => check.passed)).toBe(true);
  });

  it("requires approved driver and vehicle for readiness", () => {
    const readiness = buildAssignmentReadiness({
      adWork: readyAdWork,
      driver: null,
      vehicle: null
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.checks.find((check) => check.label === "Approved driver assigned")?.passed).toBe(false);
    expect(readiness.checks.find((check) => check.label === "Approved vehicle assigned")?.passed).toBe(false);
  });

  it("requires Mic System or shows a readiness gap", () => {
    const readiness = buildAssignmentReadiness({
      adWork: readyAdWork,
      driver: approvedDriver,
      vehicle: { ...approvedVehicle, micSystemAvailable: false }
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.checks.find((check) => check.label === "Mic System available")?.passed).toBe(false);
  });

  it("warns when premium tracking request lacks Vehicle GPS Device readiness", () => {
    const readiness = buildAssignmentReadiness({
      adWork: { ...readyAdWork, liveTrackingRequested: "yes" },
      driver: approvedDriver,
      vehicle: { ...approvedVehicle, gpsDeviceAvailable: "no", gpsDeviceStatus: "none" }
    });

    expect(readiness.warnings).toContain("Premium live tracking request needs Vehicle GPS Device readiness.");
  });

  it("stores assignment through admin-only RLS and RPC", () => {
    const lowerSql = m5Migration.toLowerCase();

    expect(m5Migration).toContain("create table if not exists public.ad_work_assignments");
    expect(m5Migration).toContain("assign_driver_vehicle_to_ad_work");
    expect(m5Migration).toContain("grant execute on function public.assign_driver_vehicle_to_ad_work(uuid, uuid, uuid, text, text, text[], boolean) to authenticated;");
    expect(m5Migration).not.toContain("assign_driver_vehicle_to_ad_work(uuid, uuid, uuid, text, text[], boolean)");
    expect(lowerSql).toContain("alter table public.ad_work_assignments enable row level security");
    expect(lowerSql).toContain("revoke all on public.ad_work_assignments from anon");
    expect(lowerSql).toContain("revoke all on public.ad_work_assignments from authenticated");
    expect(m5Migration).toMatch(/for select\s+to authenticated\s+using \(public\.is_admin\(\)\)/i);
    expect(m5Migration).toMatch(/for insert\s+to authenticated\s+with check \(public\.is_admin\(\)\)/i);
    expect(m5Migration).toMatch(/for update\s+to authenticated\s+using \(public\.is_admin\(\)\)\s+with check \(public\.is_admin\(\)\)/i);
  });

  it("blocks invalid assignment targets and duplicate replacement without confirmation", () => {
    expect(m5Migration).toContain("Only approved drivers can be assigned");
    expect(m5Migration).toContain("Only approved vehicles can be assigned");
    expect(m5Migration).toContain("Existing assignment requires confirmation");
  });

  it("keeps Ready for Execution as readiness only", () => {
    expect(m5Migration).toContain("Ready for Execution");
    expect(m5Migration).not.toContain("tracking_sessions");
    expect(m5Migration).not.toContain("location_points");
    expect(m5Migration).not.toContain("actual_start_time");
    expect(m5Migration).not.toContain("actual_end_time");
  });

  it("shows one assignment for multi-day Ad Work", () => {
    expect(webAdminSource).toContain("Same driver and vehicle will be used for all planned days.");
  });

  it("does not use privileged Supabase keys in frontend or driver app", () => {
    const forbiddenKeyName = ["service", "role"].join("_");
    const forbiddenEnvName = ["SUPABASE", "SERVICE", "ROLE"].join("_");
    const source = driverAppSource + "\n" + webAdminSource;

    expect(source).not.toContain(forbiddenKeyName);
    expect(source).not.toContain(forbiddenEnvName);
  });

  it("keeps env example values as placeholders only", () => {
    expect(envExample).toContain("https://your-project.supabase.co");
    expect(envExample).toContain("replace-with-public-anon-key");
    expect(envExample).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  });

  it("does not add forbidden future milestone integrations", () => {
    const source = (driverAppSource + "\n" + webAdminSource + "\n" + packageJson + "\n" + webPackageJson + "\n" + driverPackageJson + "\n" + m5Migration).toLowerCase();

    expect(driverConfig).toContain('"permissions": []');
    expect(source).not.toContain("expo-location");
    expect(source).not.toContain("access_background_location");
    expect(source).not.toContain("maps.googleapis");
    expect(source).not.toContain("google maps");
    expect(source).not.toContain("mapbox");
    expect(source).not.toContain("leaflet");
    expect(source).not.toContain("stripe");
    expect(source).not.toContain("razorpay");
    expect(source).not.toContain("cashfree");
    expect(source).not.toContain("twilio");
    expect(source).not.toContain("whatsapp business");
    expect(source).not.toContain("sms provider");
    expect(source).not.toContain("tracking_sessions");
    expect(source).not.toContain("location_points");
    expect(source).not.toMatch(/href=["'][^"']*live/);
    expect(source).not.toContain("generated_at");
    expect(source).not.toContain("public_token");
    expect(driverAppSource).not.toContain("Start Work");
    expect(driverAppSource).not.toContain("End Work");
  });

  it("does not add customer app, iOS app, or PWA files", () => {
    expect(existsSync(path.resolve("apps/customer"))).toBe(false);
    expect(existsSync(path.resolve("apps/web/public/manifest.webmanifest"))).toBe(false);
    expect(existsSync(path.resolve("apps/web/src/service-worker.ts"))).toBe(false);
    expect(existsSync(path.resolve("apps/driver/ios"))).toBe(false);
  });

  it("marks only M5 complete after previous milestones", () => {
    expect(tasks).toMatch(/## Milestone M4 - Driver and Vehicle Onboarding[\s\S]*- \[x\]/);
    expect(tasks).toMatch(/## Milestone M5 - Driver and Vehicle Assignment to Ad Work[\s\S]*- \[x\]/);
    expect(tasks).toMatch(/## Milestone M6 - Ad Work Execution Without GPS[\s\S]*- \[ \]/);
    expect(tasks).toMatch(/## Milestone M7 - Premium Features[\s\S]*- \[ \]/);
    expect(tasks).toMatch(/## Milestone M8 - Security, Privacy, and Release Readiness[\s\S]*- \[ \]/);
  });
});
