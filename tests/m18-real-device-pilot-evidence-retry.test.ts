import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const read = (filePath: string) => readFileSync(path.resolve(filePath), "utf8");
const m18RetryPath = "docs/pilot/m18-real-device-pilot-evidence-retry.md";
const m18PreflightPath = "docs/pilot/m18-supabase-env-preflight-check.md";
const m18RetryDoc = read(m18RetryPath);
const m18PreflightDoc = read(m18PreflightPath);
const readme = read("README.md");
const tasks = read(".kiro/specs/kootha-prachar-mvp/tasks.md");
const envExample = read(".env.example");
const driverAppSource = read("apps/driver/App.tsx");
const driverConfig = read("apps/driver/app.json");
const webAdminSource = read("apps/web/src/admin.tsx");
const packageJson = read("package.json");
const webPackageJson = read("apps/web/package.json");
const driverPackageJson = read("apps/driver/package.json");
const m7Migration = read("supabase/migrations/20260701070000_m7_proof_upload_customer_update_sharing.sql");
const m9Migration = read("supabase/migrations/20260701090000_m9_mobile_gps_tracking_foundation.sql");
const m11Migration = read("supabase/migrations/20260701110000_m11_admin_tracking_review_without_maps.sql");
const m12Migration = read("supabase/migrations/20260701120000_m12_location_proof_in_final_summary.sql");

const taskBlock = (milestone: string): string => {
  const match = tasks.match(new RegExp(`## Milestone ${milestone}[\\s\\S]*?(?=\\n## Milestone|$)`));
  return match?.[0] ?? "";
};

describe("M18 real device pilot evidence retry", () => {
  it("records target setup as passed while keeping phone execution in progress", () => {
    expect(existsSync(path.resolve(m18RetryPath))).toBe(true);
    expect(existsSync(path.resolve(m18PreflightPath))).toBe(true);
    expect(m18RetryDoc).toContain("Result: In progress.");
    expect(m18RetryDoc).toContain("Target environment readiness has passed.");
    expect(m18RetryDoc).toContain("Physical Android execution evidence is still pending");
    expect(m18RetryDoc).toContain("| Target Supabase project linked | passed |");
    expect(m18RetryDoc).toContain("| Migrations applied | passed |");
    expect(m18RetryDoc).toContain("| `proof-photos` bucket private | passed |");
    expect(m18RetryDoc).toContain("| `public.user_profiles.role = 'admin'` | passed |");
    expect(m18RetryDoc).toContain("| Admin login | passed |");
    expect(m18RetryDoc).toContain("| Driver app opened on physical Android | pending |");
    expect(m18RetryDoc).not.toMatch(/Result:\s*Pass/i);
    expect(m18RetryDoc).not.toMatch(/real-device pilot (passed|completed|verified)/i);
    expect(m18RetryDoc).not.toMatch(/real customer pilot (passed|completed|verified)/i);
  });

  it("updates the Supabase preflight evidence after admin setup is verified", () => {
    expect(m18PreflightDoc).toContain("| Bucket private flag | passed |");
    expect(m18PreflightDoc).toContain("Current result: passed because an admin profile with `role = 'admin'` was found");
    expect(m18PreflightDoc).toContain("Admin login was verified by AP");
    expect(m18PreflightDoc).not.toContain("Current result: blocked because no admin profile");
  });

  it("keeps M18 evidence fake-data-only and free of secrets or private values", () => {
    const m18Docs = `${m18RetryDoc}\n${m18PreflightDoc}`;

    expect(m18Docs).toContain("fake data only");
    expect(m18Docs).not.toMatch(/https:\/\/[a-z0-9-]+\.supabase\.co/i);
    expect(m18Docs).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    expect(m18Docs).not.toMatch(/(?:secret|token|password|work code)\s*[:=]\s*[A-Za-z0-9_-]{4,}/i);
    expect(m18Docs).not.toMatch(/\b(?:1[0-7]|[1-9])\.\d{4,}\s*,\s*(?:7[0-9]|8[0-4])\.\d{4,}\b/);
    expect(m18Docs).not.toMatch(/proof-photos\/[A-Za-z0-9/_-]+\.(jpg|jpeg|png|webp)/i);
    expect(m18Docs).toContain("No service role key is requested, used, or included.");
    expect(m18Docs).toContain("No real Work Codes are included.");
    expect(m18Docs).toContain("No raw GPS coordinates are included.");
  });

  it("keeps storage and tracking privacy guardrails intact", () => {
    const trackingMigrations = `${m9Migration}\n${m11Migration}\n${m12Migration}`;

    expect(m7Migration).toContain("'proof-photos', 'proof-photos', false, 5242880");
    expect(m7Migration).toContain("bucket_id = 'proof-photos' and public.is_admin()");
    expect(m7Migration).not.toMatch(/create policy[\s\S]{0,220}on storage\.objects[\s\S]{0,220}for select[\s\S]{0,220}to anon/i);
    expect(trackingMigrations).toContain("alter table public.tracking_sessions enable row level security");
    expect(trackingMigrations).toContain("alter table public.location_points enable row level security");
    expect(m11Migration).toContain("alter table public.location_proof_reviews enable row level security");
    expect(trackingMigrations).not.toMatch(/create policy[\s\S]{0,220}on public\.(tracking_sessions|location_points|location_proof_reviews)[\s\S]{0,220}to anon/i);
  });

  it("does not add maps, public tracking, providers, payments, customer app, iOS, or PWA code", () => {
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

  it("keeps committed env examples placeholder-only and marks M18 in progress", () => {
    const forbiddenEnvName = ["SUPABASE", "SERVICE", "ROLE"].join("_");
    const source = driverAppSource + "\n" + webAdminSource;

    expect(envExample).toContain("https://your-project.supabase.co");
    expect(envExample).toContain("replace-with-public-anon-key");
    expect(envExample).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    expect(envExample).not.toContain(forbiddenEnvName);
    expect(source).not.toContain(forbiddenEnvName);
    expect(readme).toContain("M18 Real Device Pilot Evidence Retry");
    expect(readme).toContain("docs/pilot/m18-real-device-pilot-evidence-retry.md");
    expect(readme).toContain("M18 result: in progress.");
    expect(taskBlock("M18 - Real Device Pilot Evidence Retry")).toContain("- [~] In progress.");
    expect(taskBlock("M18 - Real Device Pilot Evidence Retry")).not.toContain("- [x]");
  });
});
