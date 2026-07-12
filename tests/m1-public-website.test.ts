import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const webAppSource = readFileSync(path.resolve("apps/web/src/App.tsx"), "utf8") + readFileSync(path.resolve("apps/web/src/PublicWebsite.tsx"), "utf8");
const publicCss = readFileSync(path.resolve("apps/web/src/public-v2.css"), "utf8");
const sharedEnquirySource = readFileSync(path.resolve("packages/shared/src/enquiry.ts"), "utf8");
const driverConfig = readFileSync(path.resolve("apps/driver/app.json"), "utf8");
const envExample = readFileSync(path.resolve(".env.example"), "utf8");
const packageJson = readFileSync(path.resolve("package.json"), "utf8");
const webPackageJson = readFileSync(path.resolve("apps/web/package.json"), "utf8");
const driverPackageJson = readFileSync(path.resolve("apps/driver/package.json"), "utf8");
const m0Migration = readFileSync(path.resolve("supabase/migrations/20260630000000_m0_foundation.sql"), "utf8");
const m1Migration = readFileSync(path.resolve("supabase/migrations/20260630010000_m1_public_enquiries.sql"), "utf8");
const protectedIntakeMigration = readFileSync(path.resolve("supabase/migrations/20260712010000_protected_enquiry_intake.sql"), "utf8");

describe("M1 public website", () => {
  it("uses the centralized product name on the public website", () => {
    expect(webAppSource).toContain("resolveProductName");
    expect(webAppSource).toContain("productName");
    expect(webAppSource).toContain("Work planned clearly. Proof shared simply.");
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
    expect(webAppSource).toContain("Step {step} of 2");
    expect(webAppSource).toContain("function next");
    expect(webAppSource).not.toContain("Choose the proof level");
    expect(webAppSource).not.toContain("Phone Location Proof?");
  });

  it("ships original Kootha logo and explanation assets", () => {
    expect(existsSync(path.resolve("apps/web/public/assets/kootha-logo.svg"))).toBe(true);
    expect(existsSync(path.resolve("apps/web/public/assets/kootha-mark.svg"))).toBe(true);
    expect(existsSync(path.resolve("apps/web/public/assets/kootha-logo-tagline.svg"))).toBe(true);
    expect(existsSync(path.resolve("apps/web/public/assets/kootha-logo-bird-approved.png"))).toBe(true);
    expect(webAppSource).toContain("Your message. Everywhere.");
    expect(existsSync(path.resolve("apps/web/public/assets/kootha-town-road-static.webp"))).toBe(true);
    expect(publicCss).toContain("kootha-town-road-static.webp");
    expect(publicCss).not.toContain("kootha-vehicle-drive");
    expect(webAppSource).not.toContain("kootha-motion-vehicle");
    expect(publicCss).not.toContain("padding: 72px 48%");
    expect(publicCss).toContain("overflow-wrap: normal");
    expect(webAppSource).toContain("/assets/illustration-enquiry.svg");
    expect(webAppSource).toContain("/assets/illustration-summary.svg");
  });

  it("keeps env example values as placeholders only", () => {
    expect(envExample).toContain("https://your-project.supabase.co");
    expect(envExample).toContain("replace-with-public-anon-key");
    expect(envExample).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  });

  it("moves public enquiry creation behind the protected gateway", () => {
    expect(m1Migration).toContain("Public website can insert enquiries");
    expect(protectedIntakeMigration).toContain("drop policy if exists \"Public website can insert enquiries\"");
    expect(protectedIntakeMigration).toContain("revoke insert on public.enquiries from anon");
    expect(webAppSource).toContain("/api/enquiries");
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