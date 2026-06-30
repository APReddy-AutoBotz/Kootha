import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  businessLabels,
  enquiryStatusLabels,
  enquiryStatusOptions,
  getAudienceLabels,
  hasDuplicateValues
} from "@kootha/shared";

const webAppSource = readFileSync(path.resolve("apps/web/src/App.tsx"), "utf8");
const webAdminSource = readFileSync(path.resolve("apps/web/src/admin.tsx"), "utf8");
const envExample = readFileSync(path.resolve(".env.example"), "utf8");
const packageJson = readFileSync(path.resolve("package.json"), "utf8");
const webPackageJson = readFileSync(path.resolve("apps/web/package.json"), "utf8");
const driverPackageJson = readFileSync(path.resolve("apps/driver/package.json"), "utf8");
const driverConfig = readFileSync(path.resolve("apps/driver/app.json"), "utf8");
const m1Migration = readFileSync(path.resolve("supabase/migrations/20260630010000_m1_public_enquiries.sql"), "utf8");
const m2Migration = readFileSync(path.resolve("supabase/migrations/20260630020000_m2_admin_lead_management.sql"), "utf8");
const tasks = readFileSync(path.resolve(".kiro/specs/kootha-prachar-mvp/tasks.md"), "utf8");

describe("M2 admin lead management", () => {
  it("defines simple admin lead labels", () => {
    const adminLabels = getAudienceLabels("admin");

    expect(adminLabels).toContain(businessLabels.admin.leadManagement);
    expect(adminLabels).toContain("Follow-up Date");
    expect(adminLabels).toContain("Internal Note");
    expect(adminLabels).toContain("Live Tracking Interest");
  });

  it("defines M2 enquiry status labels without duplicates", () => {
    expect(hasDuplicateValues(enquiryStatusOptions)).toBe(false);
    expect(Object.keys(enquiryStatusLabels).sort()).toEqual([...enquiryStatusOptions].sort());
    expect(Object.values(enquiryStatusLabels)).toContain("Follow-up Needed");
    expect(Object.values(enquiryStatusLabels)).toContain("Invalid / Spam");
  });

  it("keeps anonymous enquiry access insert-only", () => {
    const combined = `${m1Migration}\n${m2Migration}`.toLowerCase();

    expect(m1Migration).toContain("for insert");
    expect(m1Migration).toContain("to anon");
    expect(m1Migration).toContain("grant insert");
    expect(combined).not.toMatch(/for\s+select\s+to\s+anon/);
    expect(combined).not.toMatch(/for\s+update\s+to\s+anon/);
    expect(combined).not.toMatch(/for\s+delete\s+to\s+anon/);
    expect(combined).not.toMatch(/grant\s+select[\s\S]*to\s+anon/);
    expect(combined).not.toMatch(/grant\s+update[\s\S]*to\s+anon/);
    expect(combined).not.toMatch(/grant\s+delete[\s\S]*to\s+anon/);
  });

  it("allows only admin-role authenticated users to select and update enquiries", () => {
    expect(m2Migration).toContain("create or replace function public.is_admin()");
    expect(m2Migration).toContain("role = 'admin'");
    expect(m2Migration).not.toContain("role in ('owner', 'admin')");
    expect(m2Migration).toMatch(/for\s+select\s+to\s+authenticated/i);
    expect(m2Migration).toMatch(/for\s+update\s+to\s+authenticated/i);
    expect(m2Migration).toMatch(/using\s+\(public\.is_admin\(\)\)/i);
    expect(m2Migration).toMatch(/with check\s+\(public\.is_admin\(\)\)/i);
  });

  it("does not use privileged Supabase keys in frontend code", () => {
    const forbiddenKeyName = ["service", "role"].join("_");
    const forbiddenEnvName = ["SUPABASE", "SERVICE", "ROLE"].join("_");
    const frontendSource = `${webAppSource}\n${webAdminSource}`;

    expect(frontendSource).not.toContain(forbiddenKeyName);
    expect(frontendSource).not.toContain(forbiddenEnvName);
  });

  it("keeps env example values as placeholders only", () => {
    expect(envExample).toContain("https://your-project.supabase.co");
    expect(envExample).toContain("replace-with-public-anon-key");
    expect(envExample).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  });

  it("shows a safe admin message when Supabase config is missing", () => {
    expect(webAdminSource).toContain("Admin login is not configured in this environment.");
    expect(webAdminSource).toContain("url.includes(\"your-project\")");
    expect(webAdminSource).toContain("anonKey.includes(\"replace-with\")");
  });

  it("does not add GPS permissions or map usage", () => {
    const combinedPackages = `${packageJson}\n${webPackageJson}\n${driverPackageJson}`.toLowerCase();
    const webSource = `${webAppSource}\n${webAdminSource}`.toLowerCase();

    expect(driverConfig).toContain('"permissions": []');
    expect(combinedPackages).not.toContain("expo-location");
    expect(webSource).not.toContain("maps.googleapis");
    expect(webSource).not.toContain("google maps");
    expect(webSource).not.toContain("mapbox");
    expect(webSource).not.toContain("leaflet");
  });

  it("does not add payment or message provider integrations", () => {
    const combined = `${packageJson}\n${webPackageJson}\n${webAppSource}\n${webAdminSource}`.toLowerCase();

    expect(combined).not.toContain("stripe");
    expect(combined).not.toContain("razorpay");
    expect(combined).not.toContain("cashfree");
    expect(combined).not.toContain("twilio");
    expect(combined).not.toContain("whatsapp business");
    expect(combined).not.toContain("sms provider");
  });

  it("does not add customer live links, customer app, iOS app, or PWA files", () => {
    const source = `${webAppSource}\n${webAdminSource}`.toLowerCase();

    expect(source).not.toMatch(/href=["'][^"']*live/);
    expect(existsSync(path.resolve("apps/customer"))).toBe(false);
    expect(existsSync(path.resolve("apps/web/public/manifest.webmanifest"))).toBe(false);
    expect(existsSync(path.resolve("apps/web/src/service-worker.ts"))).toBe(false);
    expect(existsSync(path.resolve("apps/driver/ios"))).toBe(false);
  });

  it("does not mark future milestone tasks complete", () => {
    expect(tasks).toMatch(/## Milestone M2 - Admin Foundation[\s\S]*- \[x\]/);
    expect(tasks).toMatch(/## Milestone M3 - Ad Work Creation and Scheduling[\s\S]*- \[x\]/);
    expect(tasks).toMatch(/## Milestone M4 - Driver App and Active Tracking[\s\S]*- \[ \]/);
    expect(tasks).toMatch(/## Milestone M5 - Customer Updates, Reports, and Operations[\s\S]*- \[ \]/);
    expect(tasks).toMatch(/## Milestone M6 - Device GPS and Data Export[\s\S]*- \[ \]/);
    expect(tasks).toMatch(/## Milestone M7 - Premium Features[\s\S]*- \[ \]/);
    expect(tasks).toMatch(/## Milestone M8 - Security, Privacy, and Release Readiness[\s\S]*- \[ \]/);
  });
});
