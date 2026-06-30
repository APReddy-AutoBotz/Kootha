import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  adWorkStatusLabels,
  adWorkStatusOptions,
  buildPlannedWorkDays,
  canCreateAdWorkFromEnquiry,
  createPlannedAdWorkFromEnquiry,
  flattenLabels,
  hasBlockedCustomerAdminWord,
  hasDuplicateValues
} from "@kootha/shared";

const webAppSource = readFileSync(path.resolve("apps/web/src/App.tsx"), "utf8");
const webAdminSource = readFileSync(path.resolve("apps/web/src/admin.tsx"), "utf8");
const sharedSource = readFileSync(path.resolve("packages/shared/src/campaign.ts"), "utf8");
const envExample = readFileSync(path.resolve(".env.example"), "utf8");
const packageJson = readFileSync(path.resolve("package.json"), "utf8");
const webPackageJson = readFileSync(path.resolve("apps/web/package.json"), "utf8");
const driverPackageJson = readFileSync(path.resolve("apps/driver/package.json"), "utf8");
const driverConfig = readFileSync(path.resolve("apps/driver/app.json"), "utf8");
const m3Migration = readFileSync(path.resolve("supabase/migrations/20260630030000_m3_campaign_planning_scheduling.sql"), "utf8");
const tasks = readFileSync(path.resolve(".kiro/specs/kootha-prachar-mvp/tasks.md"), "utf8");

const sampleEnquiry = {
  id: "enquiry-1",
  customerName: "Asha",
  businessName: "Asha Stores",
  mobileNumber: "9876543210",
  cityTown: "Ongole",
  areasToCover: "Main Road and Market Area",
  advertisementDetails: "Opening announcement",
  packageInterest: "premium" as const,
  liveTrackingNeeded: "yes" as const,
  preferredDate: "2026-07-10",
  numberOfDays: 2
};

describe("M3 campaign planning and scheduling", () => {
  it("defines simple ad work planning status labels without duplicates", () => {
    expect(hasDuplicateValues(adWorkStatusOptions)).toBe(false);
    expect(Object.keys(adWorkStatusLabels).sort()).toEqual([...adWorkStatusOptions].sort());
    expect(Object.values(adWorkStatusLabels)).toEqual([
      "Draft",
      "Planned",
      "Ready for Driver Assignment",
      "On Hold",
      "Cancelled"
    ]);
  });

  it("converts an enquiry into one planned ad work seed", () => {
    const adWork = createPlannedAdWorkFromEnquiry(sampleEnquiry);

    expect(adWork.enquiryId).toBe(sampleEnquiry.id);
    expect(adWork.customerName).toBe(sampleEnquiry.customerName);
    expect(adWork.businessName).toBe(sampleEnquiry.businessName);
    expect(adWork.mobileNumber).toBe(sampleEnquiry.mobileNumber);
    expect(adWork.cityTown).toBe(sampleEnquiry.cityTown);
    expect(adWork.advertisementDetails).toBe(sampleEnquiry.advertisementDetails);
    expect(adWork.packageInterest).toBe("premium");
    expect(adWork.liveTrackingRequested).toBe("yes");
    expect(adWork.status).toBe("planned");
  });

  it("blocks duplicate ad work creation from the same enquiry", () => {
    expect(canCreateAdWorkFromEnquiry("enquiry-1", [])).toBe(true);
    expect(canCreateAdWorkFromEnquiry("enquiry-1", [{ enquiryId: "enquiry-1" }])).toBe(false);
    expect(m3Migration).toContain("ad_works_enquiry_id_unique");
    expect(m3Migration).toContain("return query select v_existing_id, false");
  });

  it("creates one planned day for one-day work", () => {
    expect(buildPlannedWorkDays({
      startDate: "2026-07-10",
      numberOfDays: 1,
      areasToCover: "Main Road"
    })).toEqual([{
      date: "2026-07-10",
      plannedStartTime: "",
      plannedEndTime: "",
      areasToCover: "Main Road",
      dayNote: "",
      status: "planned"
    }]);
  });

  it("creates planned rows for multi-day work", () => {
    const days = buildPlannedWorkDays({
      startDate: "2026-07-10",
      numberOfDays: 3,
      plannedStartTime: "09:00",
      plannedEndTime: "17:00",
      areasToCover: "Main Road"
    });

    expect(days).toHaveLength(3);
    expect(days.map((day) => day.date)).toEqual(["2026-07-10", "2026-07-11", "2026-07-12"]);
    expect(days.every((day) => day.status === "planned")).toBe(true);
  });

  it("keeps live sharing disabled by default", () => {
    const adWork = createPlannedAdWorkFromEnquiry(sampleEnquiry);

    expect(adWork.liveTrackingEnabled).toBe(false);
    expect(adWork.customerLiveEnabled).toBe(false);
    expect(m3Migration).toMatch(/live_tracking_enabled boolean not null default false/i);
    expect(m3Migration).toMatch(/customer_live_enabled[\s\S]*false/i);
  });

  it("allows only admin users to manage planning tables", () => {
    const lowerSql = m3Migration.toLowerCase();

    for (const tableName of ["customers", "ad_works", "ad_work_days", "ad_work_areas"]) {
      expect(lowerSql).toContain("alter table public." + tableName + " enable row level security");
      expect(lowerSql).toContain("revoke all on public." + tableName + " from anon");
    }

    expect(m3Migration).toMatch(/for select\s+to authenticated\s+using \(public\.is_admin\(\)\)/i);
    expect(m3Migration).toMatch(/for insert\s+to authenticated\s+with check \(public\.is_admin\(\)\)/i);
    expect(m3Migration).toMatch(/for update\s+to authenticated\s+using \(public\.is_admin\(\)\)\s+with check \(public\.is_admin\(\)\)/i);
    expect(lowerSql).not.toMatch(/for\s+select\s+to\s+anon/);
    expect(lowerSql).not.toMatch(/for\s+insert\s+to\s+anon/);
    expect(lowerSql).not.toMatch(/for\s+update\s+to\s+anon/);
    expect(lowerSql).not.toMatch(/for\s+delete\s+to\s+anon/);
  });

  it("does not use privileged Supabase keys in frontend code", () => {
    const forbiddenKeyName = ["service", "role"].join("_");
    const forbiddenEnvName = ["SUPABASE", "SERVICE", "ROLE"].join("_");
    const frontendSource = webAppSource + "\n" + webAdminSource;

    expect(frontendSource).not.toContain(forbiddenKeyName);
    expect(frontendSource).not.toContain(forbiddenEnvName);
  });

  it("keeps env example values as placeholders only", () => {
    expect(envExample).toContain("https://your-project.supabase.co");
    expect(envExample).toContain("replace-with-public-anon-key");
    expect(envExample).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  });

  it("keeps customer and admin labels free of blocked technical words", () => {
    for (const label of flattenLabels(["customer", "admin"])) {
      expect(hasBlockedCustomerAdminWord(label), label).toBe(false);
    }
  });

  it("does not add location permissions or map usage", () => {
    const combinedPackages = (packageJson + "\n" + webPackageJson + "\n" + driverPackageJson).toLowerCase();
    const frontendSource = (webAppSource + "\n" + webAdminSource).toLowerCase();

    expect(driverConfig).toContain('"permissions": []');
    expect(combinedPackages).not.toContain("expo-location");
    expect(frontendSource).not.toContain("maps.googleapis");
    expect(frontendSource).not.toContain("google maps");
    expect(frontendSource).not.toContain("mapbox");
    expect(frontendSource).not.toContain("leaflet");
  });

  it("does not add payment or message provider integrations", () => {
    const combined = (packageJson + "\n" + webPackageJson + "\n" + webAppSource + "\n" + webAdminSource).toLowerCase();

    expect(combined).not.toContain("stripe");
    expect(combined).not.toContain("razorpay");
    expect(combined).not.toContain("cashfree");
    expect(combined).not.toContain("twilio");
    expect(combined).not.toContain("whatsapp business");
    expect(combined).not.toContain("sms provider");
  });

  it("does not add customer live links, customer app, iOS app, or PWA files", () => {
    const source = (webAppSource + "\n" + webAdminSource).toLowerCase();

    expect(source).not.toMatch(/href=["'][^"']*live/);
    expect(existsSync(path.resolve("apps/customer"))).toBe(false);
    expect(existsSync(path.resolve("apps/web/public/manifest.webmanifest"))).toBe(false);
    expect(existsSync(path.resolve("apps/web/src/service-worker.ts"))).toBe(false);
    expect(existsSync(path.resolve("apps/driver/ios"))).toBe(false);
  });

  it("does not implement execution, tracking, reports, or assignment behavior", () => {
    const combined = (webAdminSource + "\n" + sharedSource + "\n" + m3Migration).toLowerCase();

    expect(combined).not.toContain("actual_start_time");
    expect(combined).not.toContain("actual_end_time");
    expect(combined).not.toContain("tracking_sessions");
    expect(combined).not.toContain("location_points");
    expect(combined).not.toContain("driver_id");
    expect(combined).not.toContain("vehicle_id");
    expect(combined).not.toContain("generated_at");
    expect(combined).not.toContain("public_token");
  });

  it("marks only M3 complete in the task list", () => {
    expect(tasks).toMatch(/## Milestone M3 - Ad Work Creation and Scheduling[\s\S]*- \[x\]/);
    expect(tasks).toMatch(/## Milestone M4 - Driver App and Active Tracking[\s\S]*- \[ \]/);
    expect(tasks).toMatch(/## Milestone M5 - Customer Updates, Reports, and Operations[\s\S]*- \[ \]/);
    expect(tasks).toMatch(/## Milestone M6 - Device GPS and Data Export[\s\S]*- \[ \]/);
    expect(tasks).toMatch(/## Milestone M7 - Premium Features[\s\S]*- \[ \]/);
    expect(tasks).toMatch(/## Milestone M8 - Security, Privacy, and Release Readiness[\s\S]*- \[ \]/);
  });
});
