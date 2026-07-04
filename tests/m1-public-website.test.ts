import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const webAppSource = readFileSync(path.resolve("apps/web/src/App.tsx"), "utf8");
const sharedEnquirySource = readFileSync(path.resolve("packages/shared/src/enquiry.ts"), "utf8");
const driverConfig = readFileSync(path.resolve("apps/driver/app.json"), "utf8");
const envExample = readFileSync(path.resolve(".env.example"), "utf8");
const packageJson = readFileSync(path.resolve("package.json"), "utf8");
const webPackageJson = readFileSync(path.resolve("apps/web/package.json"), "utf8");
const driverPackageJson = readFileSync(path.resolve("apps/driver/package.json"), "utf8");
const m0Migration = readFileSync(path.resolve("supabase/migrations/20260630000000_m0_foundation.sql"), "utf8");
const m1Migration = readFileSync(path.resolve("supabase/migrations/20260630010000_m1_public_enquiries.sql"), "utf8");

describe("M1 public website", () => {
  it("uses the centralized product name on the public website", () => {
    expect(webAppSource).toContain("resolveProductName");
    expect(webAppSource).toContain("productName");
    expect(webAppSource).toContain("publicWebsiteText.heroHeadline");
    expect(sharedEnquirySource).toContain("Advertisement work with clear proof");
    expect(sharedEnquirySource).toContain("Kootha team");
  });

  it("keeps public copy customer-facing and broad", () => {
    expect(webAppSource).toContain("Tell us about your advertisement work");
    expect(webAppSource).toContain("Advertisement message");
    expect(webAppSource).not.toContain("Service areas");
    expect(webAppSource).not.toContain("not fixed prices");
    expect(webAppSource).not.toContain("Pilot area");
    expect(webAppSource).not.toContain("Payment collection is not part of the current setup");
    expect(webAppSource).not.toContain("Mic announcement proof");
  });

  it("ships original Kootha logo and explanation assets", () => {
    expect(existsSync(path.resolve("apps/web/public/assets/kootha-logo.svg"))).toBe(true);
    expect(existsSync(path.resolve("apps/web/public/assets/kootha-mark.svg"))).toBe(true);
    expect(webAppSource).toContain("/assets/illustration-enquiry.svg");
    expect(webAppSource).toContain("/assets/illustration-summary.svg");
  });

  it("keeps env example values as placeholders only", () => {
    expect(envExample).toContain("https://your-project.supabase.co");
    expect(envExample).toContain("replace-with-public-anon-key");
    expect(envExample).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  });

  it("allows public enquiry insert only through the M1 policy", () => {
    expect(m1Migration).toContain("for insert");
    expect(m1Migration).toContain("to anon");
    expect(m1Migration).toContain("grant insert");
    expect(m1Migration.toLowerCase()).not.toMatch(/for\s+select\s+to\s+anon/);
    expect(m1Migration.toLowerCase()).not.toMatch(/for\s+update\s+to\s+anon/);
    expect(m1Migration.toLowerCase()).not.toMatch(/for\s+delete\s+to\s+anon/);
    expect(m1Migration.toLowerCase()).not.toMatch(/grant\s+select|grant\s+update|grant\s+delete/);
  });

  it("keeps customer live sharing disabled by default", () => {
    expect(m0Migration).toMatch(/customer_live_enabled\s+boolean\s+not null\s+default false/i);
  });

  it("does not add GPS permissions", () => {
    expect(driverConfig).not.toContain("ACCESS_COARSE_LOCATION");
    expect(driverConfig).not.toContain("ACCESS_BACKGROUND_LOCATION");
    expect(driverConfig).not.toContain("RECORD_AUDIO");
    expect(driverConfig).not.toContain("CAMERA");
  });

  it("does not add Google Maps usage", () => {
    const combined = `${packageJson}\n${webPackageJson}\n${webAppSource}`.toLowerCase();
    expect(combined).not.toContain("maps.googleapis");
    expect(combined).not.toContain("google maps");
    expect(combined).not.toContain("mapbox");
    expect(combined).not.toContain("leaflet");
  });

  it("does not add payment integration", () => {
    const combined = `${packageJson}\n${webPackageJson}`.toLowerCase();
    expect(combined).not.toContain("stripe");
    expect(combined).not.toContain("razorpay");
    expect(combined).not.toContain("cashfree");
  });

  it("does not add WhatsApp or SMS provider integration", () => {
    const combined = `${packageJson}\n${webPackageJson}`.toLowerCase();
    expect(combined).not.toContain("twilio");
    expect(combined).not.toContain("whatsapp");
    expect(combined).not.toContain("sms");
  });

  it("does not add PWA files", () => {
    expect(existsSync(path.resolve("apps/web/public/manifest.webmanifest"))).toBe(false);
    expect(existsSync(path.resolve("apps/web/src/service-worker.ts"))).toBe(false);
  });
});