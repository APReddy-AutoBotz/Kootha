import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const read = (filePath: string) => readFileSync(path.resolve(filePath), "utf8");
const m16DocPath = "docs/pilot/m16-real-device-pilot-execution-evidence.md";
const m16Doc = read(m16DocPath);
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

describe("M16 real device pilot execution evidence", () => {
  it("adds the M16 evidence document with a blocked real-device result", () => {
    expect(existsSync(path.resolve(m16DocPath))).toBe(true);
    expect(m16Doc).toContain("Real-device pilot execution was not completed because required environment/device was unavailable.");
    expect(m16Doc).toContain("Result: Blocked.");
    expect(m16Doc).toContain("Repo HEAD reviewed for M16 evidence: `e71c1031b5a1e8f7dcdf05f4ceca0a5cd265f7b2`");
    expect(m16Doc).toContain("The M15 real-device checklist was not executed because the required physical device and target environment were unavailable.");
    expect(m16Doc).toContain("Recommended next milestone: M17 Real Device Pilot Blocker Remediation.");
  });

  it("does not claim a real-device pass while blockers exist", () => {
    expect(m16Doc).toContain("## Blockers");
    expect(m16Doc).toContain("Android device not connected.");
    expect(m16Doc).toContain("Target Supabase environment not configured in this workspace.");
    expect(m16Doc).not.toMatch(/Result:\s*Pass/i);
    expect(m16Doc).not.toMatch(/real-device pilot execution (completed|passed|verified)/i);
    expect(m16Doc).not.toMatch(/real customer pilot (completed|passed|verified)/i);
    expect(m16Doc).not.toMatch(/actual pilot (completed|passed|verified)/i);
  });

  it("keeps M16 evidence free of secrets, work codes, proof paths, screenshots, and coordinates", () => {
    expect(m16Doc).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    expect(m16Doc).not.toMatch(/(?:secret|token|password|work code)\s*[:=]\s*[A-Za-z0-9_-]{4,}/i);
    expect(m16Doc).not.toMatch(/\b(?:1[0-7]|[1-9])\.\d{4,}\s*,\s*(?:7[0-9]|8[0-4])\.\d{4,}\b/);
    expect(m16Doc).not.toMatch(/https:\/\/[a-z0-9-]+\.supabase\.co/i);
    expect(m16Doc).not.toMatch(/proof-photos\/[A-Za-z0-9/_-]+\.(jpg|jpeg|png|webp)/i);
    expect(m16Doc).toContain("No screenshots are included.");
    expect(m16Doc).toContain("No real Work Codes are included.");
    expect(m16Doc).toContain("No raw GPS coordinates are included.");
  });

  it("does not add unsupported proof claims or customer live tracking promises", () => {
    expect(m16Doc).not.toMatch(/route verified/i);
    expect(m16Doc).not.toMatch(/map verified/i);
    expect(m16Doc).not.toMatch(/distance certified/i);
    expect(m16Doc).not.toMatch(/gps-certified/i);
    expect(m16Doc).not.toMatch(/customer can watch live/i);
    expect(m16Doc).not.toMatch(/live tracking link is available/i);
    expect(m16Doc).toContain("No customer live tracking is promised.");
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

  it("updates README and marks only M16 complete while leaving M17 not started", () => {
    expect(readme).toContain("M16 real device pilot execution evidence");
    expect(readme).toContain("docs/pilot/m16-real-device-pilot-execution-evidence.md");
    expect(readme).toContain("M16 result: blocked.");
    expect(readme).toContain("M16 does not add a Supabase migration");
    expect(taskBlock("M16 - Real Device Pilot Execution Evidence")).toContain("- [x]");
    expect(taskBlock("M17 - Real Device Pilot Blocker Remediation")).toContain("- [ ] Not started.");
    expect(taskBlock("M17 - Real Device Pilot Blocker Remediation")).not.toContain("- [x]");
  });
});