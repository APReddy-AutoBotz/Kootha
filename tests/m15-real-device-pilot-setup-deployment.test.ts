import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  formatPilotReadinessCheck,
  hasBlockingPilotReadinessIssue,
  validatePilotReadinessEnvironment
} from "@kootha/shared";

const m15DocPaths = [
  "docs/pilot/m15-real-device-pilot-setup.md",
  "docs/deployment/m15-deployment-runbook.md",
  "docs/pilot/m15-real-android-testing-checklist.md",
  "docs/deployment/m15-supabase-target-setup-checklist.md",
  "docs/pilot/m15-pilot-operator-checklist.md",
  "docs/pilot/m15-real-device-evidence-template.md"
] as const;

const read = (filePath: string) => readFileSync(path.resolve(filePath), "utf8");
const m15Docs = m15DocPaths.map(read).join("\n");
const setupDoc = read("docs/pilot/m15-real-device-pilot-setup.md");
const deploymentRunbook = read("docs/deployment/m15-deployment-runbook.md");
const androidChecklist = read("docs/pilot/m15-real-android-testing-checklist.md");
const supabaseChecklist = read("docs/deployment/m15-supabase-target-setup-checklist.md");
const operatorChecklist = read("docs/pilot/m15-pilot-operator-checklist.md");
const evidenceTemplate = read("docs/pilot/m15-real-device-evidence-template.md");
const envExample = read(".env.example");
const readme = read("README.md");
const tasks = read(".kiro/specs/kootha-prachar-mvp/tasks.md");
const scriptSource = read("scripts/check-pilot-env.mjs");
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

describe("M15 real device pilot setup and deployment", () => {
  it("adds the required real-device pilot setup and deployment docs", () => {
    for (const docPath of m15DocPaths) {
      expect(existsSync(path.resolve(docPath)), docPath).toBe(true);
    }

    expect(setupDoc).toContain("No real customer pilot should start until all M15 checks pass");
    expect(setupDoc).toContain("Driver app opens on the real Android phone.");
    expect(setupDoc).toContain("Photo proof upload works against the target Supabase project.");
    expect(deploymentRunbook).toContain("Do not deploy automatically unless AP explicitly asks.");
    expect(deploymentRunbook).toContain("pnpm check:pilot-env");
    expect(androidChecklist).toContain("Foreground location permission appears only during assigned work flow.");
    expect(androidChecklist).toContain("App does not request background location.");
    expect(supabaseChecklist).toContain("Confirm `proof-photos` bucket is private.");
    expect(operatorChecklist).toContain("If Location Permission Is Denied");
    expect(evidenceTemplate).toContain("| Test step | Device used | Environment | Expected result | Actual result | Pass/Fail | Screenshot/evidence reference | Issue | Owner | Fix needed | Retest result |");
  });

  it("keeps M15 docs as templates without real secrets, work codes, coordinates, or pilot completion claims", () => {
    expect(m15Docs).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    expect(m15Docs).not.toMatch(/(?:secret|token|password|work code)\s*[:=]\s*[A-Za-z0-9_-]{4,}/i);
    expect(m15Docs).not.toMatch(/\b(?:1[0-7]|[1-9])\.\d{4,}\s*,\s*(?:7[0-9]|8[0-4])\.\d{4,}\b/);
    expect(m15Docs).not.toMatch(/real customer pilot (completed|passed|verified)/i);
    expect(m15Docs).not.toMatch(/actual pilot (completed|passed|verified)/i);
    expect(m15Docs).toContain("Do not commit real screenshots");
    expect(m15Docs).toContain("Do not commit admin email, password, auth user id, or project-specific identifiers.");
  });

  it("avoids unsupported customer proof claims and live-location promises", () => {
    expect(m15Docs).not.toMatch(/route verified/i);
    expect(m15Docs).not.toMatch(/map verified/i);
    expect(m15Docs).not.toMatch(/distance certified/i);
    expect(m15Docs).not.toMatch(/gps-certified/i);
    expect(m15Docs).not.toMatch(/customer can watch live/i);
    expect(m15Docs).not.toMatch(/live tracking link is available/i);
    expect(setupDoc).toContain("Customers do not receive live location access by default.");
  });

  it("validates environment readiness with safe statuses and without exposing values", () => {
    const unsafeWebKey = ["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_");
    const checks = validatePilotReadinessEnvironment({
      mode: "production",
      webEnv: {
        VITE_PRODUCT_NAME: "Kootha",
        VITE_SUPABASE_URL: "https://your-project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "replace-with-public-anon-key",
        [unsafeWebKey]: "do-not-print-this-value"
      },
      driverEnv: {
        EXPO_PUBLIC_PRODUCT_NAME: "Kootha",
        EXPO_PUBLIC_SUPABASE_URL: "https://pilot.supabase.co",
        EXPO_PUBLIC_SUPABASE_ANON_KEY: "public-anon-value"
      },
      schemaDefaults: {
        customerLiveEnabledDefault: true,
        liveTrackingEnabledDefault: false
      }
    });

    expect(hasBlockingPilotReadinessIssue(checks)).toBe(true);
    expect(checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "placeholder", severity: "error" }),
      expect.objectContaining({ status: "unsafe_key_name_detected", severity: "error" }),
      expect.objectContaining({ status: "unsafe_default", severity: "error" })
    ]));
    expect(checks.map(formatPilotReadinessCheck).join("\n")).not.toContain("do-not-print-this-value");
    expect(checks.map(formatPilotReadinessCheck).join("\n")).toContain("web: placeholder (error)");
  });

  it("runs the pilot env check script with safe output only", () => {
    const result = spawnSync(process.execPath, ["scripts/check-pilot-env.mjs"], {
      cwd: path.resolve("."),
      encoding: "utf8",
      env: {
        ...process.env,
        PILOT_ENV_MODE: "production",
        VITE_PRODUCT_NAME: "Kootha",
        VITE_SUPABASE_URL: "https://pilot.supabase.co",
        VITE_SUPABASE_ANON_KEY: "public-anon-key",
        VITE_SUPABASE_SERVICE_ROLE_KEY: "do-not-print-this-value",
        EXPO_PUBLIC_PRODUCT_NAME: "Kootha",
        EXPO_PUBLIC_SUPABASE_URL: "https://pilot.supabase.co",
        EXPO_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
        CUSTOMER_LIVE_ENABLED_DEFAULT: "true"
      }
    });
    const combinedOutput = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(1);
    expect(combinedOutput).toContain("unsafe_key_name_detected");
    expect(combinedOutput).toContain("unsafe_default");
    expect(combinedOutput).not.toContain("do-not-print-this-value");
    expect(combinedOutput).not.toContain("VITE_SUPABASE_SERVICE_ROLE_KEY");
    expect(scriptSource).not.toContain("console.log(process.env");
  });

  it("keeps committed env examples placeholder-only and avoids privileged keys in web or driver source", () => {
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

  it("keeps proof photos private, tracking admin-only, and live flags false", () => {
    const trackingMigrations = `${m9Migration}\n${m11Migration}\n${m12Migration}`;

    expect(m7Migration).toContain("'proof-photos', 'proof-photos', false, 5242880");
    expect(m7Migration).toContain("Admin users can read proof photo objects");
    expect(m7Migration).not.toMatch(/create policy[\s\S]{0,220}on storage\.objects[\s\S]{0,220}for select[\s\S]{0,220}to anon/i);
    expect(trackingMigrations).toContain("alter table public.tracking_sessions enable row level security");
    expect(trackingMigrations).toContain("alter table public.location_points enable row level security");
    expect(m11Migration).toContain("alter table public.location_proof_reviews enable row level security");
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

  it("marks M15 complete in the milestone ledger", () => {
    expect(readme).toContain("M15 real device pilot setup and deployment preparation");
    expect(readme).toContain("docs/pilot/m15-real-device-pilot-setup.md");
    expect(readme).toContain("pnpm check:pilot-env");
    expect(readme).toContain("M15 does not add a Supabase migration");
    expect(taskBlock("M15 - Real Device Pilot Setup and Deployment")).toContain("- [x]");
  });
});