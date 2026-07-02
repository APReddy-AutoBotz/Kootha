import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  hasBlockingPilotReadinessIssue,
  validatePilotReadinessEnvironment
} from "@kootha/shared";

const m13DocPaths = [
  "docs/pilot/m13-pilot-readiness-and-deployment-preparation.md",
  "docs/deployment/deployment-preparation.md",
  "docs/pilot/m13-pilot-smoke-test-checklist.md",
  "docs/pilot/m13-pilot-operations-runbook.md",
  "docs/pilot/m13-driver-consent-text.md",
  "docs/pilot/m13-customer-communication-text.md"
] as const;

const read = (filePath: string) => readFileSync(path.resolve(filePath), "utf8");
const m13Docs = m13DocPaths.map(read).join("\n");
const customerCommunication = read("docs/pilot/m13-customer-communication-text.md");
const envExample = read(".env.example");
const readme = read("README.md");
const tasks = read(".kiro/specs/kootha-prachar-mvp/tasks.md");
const driverAppSource = read("apps/driver/App.tsx");
const driverConfig = read("apps/driver/app.json");
const webAdminSource = read("apps/web/src/admin.tsx");
const packageJson = read("package.json");
const webPackageJson = read("apps/web/package.json");
const driverPackageJson = read("apps/driver/package.json");
const m0Migration = read("supabase/migrations/20260630000000_m0_foundation.sql");
const m3Migration = read("supabase/migrations/20260630030000_m3_campaign_planning_scheduling.sql");
const m7Migration = read("supabase/migrations/20260701070000_m7_proof_upload_customer_update_sharing.sql");
const m9Migration = read("supabase/migrations/20260701090000_m9_mobile_gps_tracking_foundation.sql");
const m11Migration = read("supabase/migrations/20260701110000_m11_admin_tracking_review_without_maps.sql");
const m12Migration = read("supabase/migrations/20260701120000_m12_location_proof_in_final_summary.sql");

const taskBlock = (milestone: string): string => {
  const match = tasks.match(new RegExp(`## Milestone ${milestone}[\\s\\S]*?(?=\\n## Milestone|$)`));
  return match?.[0] ?? "";
};

describe("M13 pilot readiness and deployment preparation", () => {
  it("adds the required pilot readiness, deployment, smoke, operations, consent, and customer communication docs", () => {
    for (const docPath of m13DocPaths) {
      expect(existsSync(path.resolve(docPath)), docPath).toBe(true);
    }

    expect(m13Docs).toContain("controlled pilot in Ongole and Addanki");
    expect(m13Docs).toContain("Enquiry -> Admin lead -> Planned Ad Work -> Driver/Vehicle onboarding -> Assignment -> Work execution -> Photo proof -> Phone Location Proof -> Final Proof Summary.");
    expect(m13Docs).toContain("proof-photos");
    expect(m13Docs).toContain("customer_live_enabled");
    expect(m13Docs).toContain("live_tracking_enabled");
    expect(m13Docs).toContain("M13 does not add a Supabase migration.");
    expect(m13Docs).toContain("Stop Conditions");
    expect(m13Docs).toContain("Driver Confirmation");
  });

  it("keeps pilot docs free of real secrets, work codes, and unsupported proof claims", () => {
    expect(m13Docs).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    expect(m13Docs).not.toMatch(/(?:secret|token|password|work code)\s*[:=]\s*[A-Za-z0-9_-]{6,}/i);
    expect(m13Docs).not.toMatch(/route verified/i);
    expect(m13Docs).not.toMatch(/map verified/i);
    expect(m13Docs).not.toMatch(/distance certified/i);
    expect(m13Docs).not.toMatch(/gps-certified/i);
    expect(m13Docs).not.toMatch(/exact coverage guaranteed/i);
  });

  it("uses customer-safe customer communication without a live tracking promise", () => {
    expect(customerCommunication).toContain("Phone Location Proof: Reviewed by admin");
    expect(customerCommunication).toContain("Phone Location Proof: Needs follow-up");
    expect(customerCommunication).toContain("Phone Location Proof: Not required");
    expect(customerCommunication).toContain("Phone Location Proof: Not available");
    expect(customerCommunication).toContain("not a live tracking link");
    expect(customerCommunication).toContain("not a public map");
    expect(customerCommunication).toContain("not certified route proof");
    expect(customerCommunication).not.toMatch(/live tracking is included/i);
    expect(customerCommunication).not.toMatch(/watch the driver live/i);
    expect(customerCommunication).not.toMatch(/raw latitude|raw longitude/i);
  });

  it("validates pilot environment readiness without exposing secret values", () => {
    const unsafeWebKey = ["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_");
    const checks = validatePilotReadinessEnvironment({
      mode: "production",
      webEnv: {
        VITE_PRODUCT_NAME: "Prachar",
        VITE_SUPABASE_URL: "https://your-project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "replace-with-public-anon-key",
        [unsafeWebKey]: "do-not-print-this-value"
      },
      driverEnv: {
        EXPO_PUBLIC_PRODUCT_NAME: "Prachar",
        EXPO_PUBLIC_SUPABASE_URL: "https://pilot.supabase.co",
        EXPO_PUBLIC_SUPABASE_ANON_KEY: "public-anon-value"
      },
      schemaDefaults: {
        customerLiveEnabledDefault: false,
        liveTrackingEnabledDefault: true
      }
    });

    expect(hasBlockingPilotReadinessIssue(checks)).toBe(true);
    expect(checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "web-VITE_SUPABASE_URL-placeholder",
        ok: false,
        severity: "error"
      }),
      expect.objectContaining({
        id: "web-VITE_SUPABASE_ANON_KEY-placeholder",
        ok: false,
        severity: "error"
      }),
      expect.objectContaining({
        id: `web-${unsafeWebKey}-privileged-key`,
        ok: false,
        severity: "error"
      }),
      expect.objectContaining({
        id: "database-live-tracking-enabled-default",
        ok: false,
        severity: "error"
      })
    ]));
    expect(checks.map((check) => check.message).join("\n")).not.toContain("do-not-print-this-value");
  });

  it("accepts placeholder-free pilot env names and false live defaults", () => {
    const checks = validatePilotReadinessEnvironment({
      mode: "preview",
      webEnv: {
        VITE_PRODUCT_NAME: "Prachar",
        VITE_SUPABASE_URL: "https://pilot-project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "public-anon-key"
      },
      driverEnv: {
        EXPO_PUBLIC_PRODUCT_NAME: "Prachar",
        EXPO_PUBLIC_SUPABASE_URL: "https://pilot-project.supabase.co",
        EXPO_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key"
      },
      schemaDefaults: {
        customerLiveEnabledDefault: false,
        liveTrackingEnabledDefault: false
      }
    });

    expect(hasBlockingPilotReadinessIssue(checks)).toBe(false);
  });

  it("keeps committed env examples placeholder-only and avoids privileged keys in web or driver app source", () => {
    const forbiddenKeyName = ["service", "role"].join("_");
    const forbiddenEnvName = ["SUPABASE", "SERVICE", "ROLE"].join("_");
    const source = driverAppSource + "\n" + webAdminSource;

    expect(envExample).toContain("https://your-project.supabase.co");
    expect(envExample).toContain("replace-with-public-anon-key");
    expect(envExample).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    expect(envExample).not.toContain(forbiddenEnvName);
    expect(source).not.toContain(forbiddenKeyName);
    expect(source).not.toContain(forbiddenEnvName);
  });

  it("confirms proof photos stay private and tracking review data remains admin-only", () => {
    const trackingMigrations = `${m9Migration}\n${m11Migration}\n${m12Migration}`;

    expect(m7Migration).toContain("'proof-photos', 'proof-photos', false, 5242880");
    expect(m7Migration).toContain("Admin users can read proof photo objects");
    expect(m7Migration).not.toMatch(/create policy[\s\S]{0,220}on storage\.objects[\s\S]{0,220}for select[\s\S]{0,220}to anon/i);
    expect(trackingMigrations).toContain("alter table public.tracking_sessions enable row level security");
    expect(trackingMigrations).toContain("alter table public.location_points enable row level security");
    expect(m11Migration).toContain("alter table public.location_proof_reviews enable row level security");
    expect(m11Migration).toContain("using (public.is_admin())");
    expect(m11Migration).toContain("if not public.is_admin() then");
    expect(trackingMigrations).not.toMatch(/create policy[\s\S]{0,220}on public\.(tracking_sessions|location_points|location_proof_reviews)[\s\S]{0,220}to anon/i);
    expect(m0Migration).toMatch(/customer_live_enabled\s+boolean\s+not null\s+default false/i);
    expect(m3Migration).toMatch(/live_tracking_enabled boolean not null default false/i);
  });

  it("does not add maps, route drawing, public tracking, providers, payments, customer apps, iOS, or PWA code", () => {
    const codeSource = `${driverAppSource}\n${webAdminSource}\n${packageJson}\n${webPackageJson}\n${driverPackageJson}`.toLowerCase();

    expect(driverConfig).toContain("android.permission.ACCESS_FINE_LOCATION");
    expect(driverConfig).not.toContain("ACCESS_BACKGROUND_LOCATION");
    expect(codeSource).not.toContain("requestbackgroundpermissionsasync");
    expect(codeSource).not.toContain("startlocationupdatesasync");
    expect(codeSource).not.toContain("expo-task-manager");
    expect(codeSource).not.toContain("maps.googleapis");
    expect(codeSource).not.toContain("google.maps");
    expect(codeSource).not.toContain("mapbox");
    expect(codeSource).not.toContain("leaflet");
    expect(codeSource).not.toContain("polyline");
    expect(codeSource).not.toContain("gps_device_ingest");
    expect(codeSource).not.toContain("public_location_access");
    expect(codeSource).not.toContain("customer_live_tracking_link");
    expect(codeSource).not.toContain("stripe");
    expect(codeSource).not.toContain("razorpay");
    expect(codeSource).not.toContain("cashfree");
    expect(codeSource).not.toContain("twilio");
    expect(codeSource).not.toContain("whatsapp business");
    expect(codeSource).not.toContain("sms provider");
    expect(existsSync(path.resolve("apps/customer"))).toBe(false);
    expect(existsSync(path.resolve("apps/web/public/manifest.webmanifest"))).toBe(false);
    expect(existsSync(path.resolve("apps/web/src/service-worker.ts"))).toBe(false);
    expect(existsSync(path.resolve("apps/driver/ios"))).toBe(false);
  });

  it("updates README and marks only M13 complete while leaving M14 not started", () => {
    expect(readme).toContain("M13 pilot readiness and deployment preparation");
    expect(readme).toContain("docs/pilot/m13-pilot-smoke-test-checklist.md");
    expect(readme).toContain("M13 does not add a Supabase migration");
    expect(taskBlock("M13 - Pilot Readiness and Deployment Preparation")).toContain("- [x]");
    expect(taskBlock("M14 - Controlled Pilot Dry Run")).toContain("- [ ] Not started.");
    expect(taskBlock("M14 - Controlled Pilot Dry Run")).not.toContain("- [x]");
  });
});
