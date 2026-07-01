import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  driverApplicationStatusLabels,
  driverApplicationStatusOptions,
  driverAvailabilityStatusLabels,
  driverAvailabilityStatusOptions,
  driverStatusLabels,
  driverStatusOptions,
  flattenLabels,
  hasBlockedCustomerDriverWord,
  hasDuplicateValues,
  initialDriverApplication,
  validateDriverApplication,
  vehicleStatusLabels,
  vehicleStatusOptions
} from "@kootha/shared";

const driverAppSource = readFileSync(path.resolve("apps/driver/App.tsx"), "utf8");
const webAdminSource = readFileSync(path.resolve("apps/web/src/admin.tsx"), "utf8");
const envExample = readFileSync(path.resolve(".env.example"), "utf8");
const packageJson = readFileSync(path.resolve("package.json"), "utf8");
const webPackageJson = readFileSync(path.resolve("apps/web/package.json"), "utf8");
const driverPackageJson = readFileSync(path.resolve("apps/driver/package.json"), "utf8");
const driverConfig = readFileSync(path.resolve("apps/driver/app.json"), "utf8");
const m4Migration = readFileSync(path.resolve("supabase/migrations/20260630040000_m4_driver_vehicle_onboarding.sql"), "utf8");
const tasks = readFileSync(path.resolve(".kiro/specs/kootha-prachar-mvp/tasks.md"), "utf8");

const validApplication = {
  ...initialDriverApplication,
  driverName: "Ravi Kumar",
  mobileNumber: "9876543210",
  cityTown: "Ongole",
  serviceAreas: "Main Road, Market Area",
  vehicleOwnership: "own_vehicle" as const,
  vehicleType: "auto" as const,
  vehicleNumber: "AP00AB1234",
  micSystemAvailable: true,
  gpsDeviceAvailable: "yes" as const,
  preferredWorkingCities: "Ongole",
  notes: "Morning work preferred",
  consentToContact: true
};

describe("M4 driver and vehicle onboarding", () => {
  it("defines driver application labels without duplicates", () => {
    expect(hasDuplicateValues(driverApplicationStatusOptions)).toBe(false);
    expect(Object.keys(driverApplicationStatusLabels).sort()).toEqual([...driverApplicationStatusOptions].sort());
    expect(Object.values(driverApplicationStatusLabels)).toContain("Under Review");
    expect(Object.values(driverApplicationStatusLabels)).toContain("Needs More Info");
  });

  it("defines driver and vehicle status labels without duplicates", () => {
    expect(hasDuplicateValues(driverStatusOptions)).toBe(false);
    expect(hasDuplicateValues(driverAvailabilityStatusOptions)).toBe(false);
    expect(hasDuplicateValues(vehicleStatusOptions)).toBe(false);
    expect(Object.values(driverStatusLabels)).toEqual(["Pending Review", "Approved", "Inactive", "Blocked"]);
    expect(Object.values(driverAvailabilityStatusLabels)).toEqual(["Available", "Not Available", "Busy", "Unknown"]);
    expect(Object.values(vehicleStatusLabels)).toEqual(["Pending Review", "Approved", "Inactive", "Blocked"]);
  });

  it("validates required driver application fields", () => {
    const errors = validateDriverApplication({
      ...initialDriverApplication,
      consentToContact: false
    });

    expect(errors).toContain("Enter driver name");
    expect(errors).toContain("Enter mobile number");
    expect(errors).toContain("Enter city or town");
    expect(errors).toContain("Enter vehicle number");
    expect(errors).toContain("Please agree before submitting");
  });

  it("validates mobile number and consent", () => {
    expect(validateDriverApplication({ ...validApplication, mobileNumber: "abc" })).toContain("Enter valid mobile number");
    expect(validateDriverApplication({ ...validApplication, consentToContact: false })).toContain("Please agree before submitting");
    expect(validateDriverApplication(validApplication)).toEqual([]);
  });

  it("allows anonymous driver application insert only", () => {
    const lowerSql = m4Migration.toLowerCase();

    expect(m4Migration).toContain("Public driver app can insert applications");
    expect(m4Migration).toMatch(/for insert\s+to anon/i);
    expect(m4Migration).toMatch(/grant insert \([\s\S]*\) on public\.driver_applications to anon/i);
    expect(lowerSql).not.toMatch(/for\s+select\s+to\s+anon/);
    expect(lowerSql).not.toMatch(/for\s+update\s+to\s+anon/);
    expect(lowerSql).not.toMatch(/for\s+delete\s+to\s+anon/);
    expect(lowerSql).not.toMatch(/grant\s+select[\s\S]*to\s+anon/);
    expect(lowerSql).not.toMatch(/grant\s+update[\s\S]*to\s+anon/);
    expect(lowerSql).not.toMatch(/grant\s+delete[\s\S]*to\s+anon/);
  });

  it("keeps driver, vehicle, and GPS readiness records admin-only", () => {
    const lowerSql = m4Migration.toLowerCase();

    for (const tableName of ["driver_applications", "drivers", "vehicles", "gps_devices"]) {
      expect(lowerSql).toContain("alter table public." + tableName + " enable row level security");
      expect(lowerSql).toContain("revoke all on public." + tableName + " from anon");
      expect(lowerSql).toContain("revoke all on public." + tableName + " from authenticated");
    }

    expect(m4Migration).toMatch(/Admin users can view driver applications/i);
    expect(m4Migration).toMatch(/Admin users can insert drivers/i);
    expect(m4Migration).toMatch(/Admin users can update vehicles/i);
    expect(m4Migration).toMatch(/using \(public\.is_admin\(\)\)/i);
    expect(m4Migration).toMatch(/with check \(public\.is_admin\(\)\)/i);
  });

  it("approves applications by linking or creating driver and vehicle records safely", () => {
    expect(m4Migration).toContain("create or replace function public.review_driver_application");
    expect(m4Migration).toContain("select id into v_driver_id");
    expect(m4Migration).toContain("insert into public.drivers");
    expect(m4Migration).toContain("select id into v_vehicle_id");
    expect(m4Migration).toContain("insert into public.vehicles");
    expect(m4Migration).toContain("Existing driver or vehicle linked.");
    expect(m4Migration).toContain("vehicles_vehicle_number_unique");
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

  it("keeps driver and customer-facing labels free of blocked technical words", () => {
    for (const label of flattenLabels(["customer", "driver"])) {
      expect(hasBlockedCustomerDriverWord(label), label).toBe(false);
    }
  });

  it("does not add location permissions or maps", () => {
    const combinedPackages = (packageJson + "\n" + webPackageJson + "\n" + driverPackageJson).toLowerCase();
    const source = (driverAppSource + "\n" + webAdminSource).toLowerCase();

    expect(driverConfig).not.toContain("ACCESS_FINE_LOCATION");
    expect(driverConfig).not.toContain("ACCESS_COARSE_LOCATION");
    expect(driverConfig).not.toContain("ACCESS_BACKGROUND_LOCATION");
    expect(driverConfig).not.toContain("RECORD_AUDIO");
    expect(driverConfig).not.toContain("CAMERA");
    expect(combinedPackages).not.toContain("expo-location");
    expect(source).not.toContain("maps.googleapis");
    expect(source).not.toContain("google maps");
    expect(source).not.toContain("mapbox");
    expect(source).not.toContain("leaflet");
  });

  it("does not add forbidden future milestone integrations", () => {
    const source = (driverAppSource + "\n" + webAdminSource + "\n" + packageJson + "\n" + webPackageJson + "\n" + driverPackageJson + "\n" + m4Migration).toLowerCase();

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
  });

  it("keeps M4 driver onboarding separate from M6 execution controls", () => {
    const source = (driverAppSource + "\n" + webAdminSource + "\n" + m4Migration).toLowerCase();

      });

  it("does not add customer app, iOS app, or PWA files", () => {
    expect(existsSync(path.resolve("apps/customer"))).toBe(false);
    expect(existsSync(path.resolve("apps/web/public/manifest.webmanifest"))).toBe(false);
    expect(existsSync(path.resolve("apps/web/src/service-worker.ts"))).toBe(false);
    expect(existsSync(path.resolve("apps/driver/ios"))).toBe(false);
  });

  it("marks M4 through M6 complete after previous milestones", () => {
    expect(tasks).toMatch(/## Milestone M3 - Ad Work Creation and Scheduling[\s\S]*- \[x\]/);
    expect(tasks).toMatch(/## Milestone M4 - Driver and Vehicle Onboarding[\s\S]*- \[x\]/);
    expect(tasks).toMatch(/## Milestone M5 - Driver and Vehicle Assignment to Ad Work[\s\S]*- \[x\]/);
    expect(tasks).toMatch(/## Milestone M6 - Ad Work Execution Without GPS[\s\S]*- \[x\]/);
    expect(tasks).toMatch(/## Milestone M7 - Proof Upload and Customer Update Sharing[\s\S]*- \[x\]/);
    expect(tasks).toMatch(/## Milestone M8 - Final Proof Summary and Campaign Closure[\s\S]*- \[x\]/);
  });
});
