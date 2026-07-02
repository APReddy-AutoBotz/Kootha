import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const m14DocPaths = [
  "docs/pilot/m14-controlled-pilot-dry-run.md",
  "docs/pilot/m14-end-to-end-dry-run-checklist.md",
  "docs/pilot/m14-dry-run-results-template.md",
  "docs/pilot/m14-dry-run-blockers-and-limitations.md",
  "docs/pilot/m14-local-fake-data-guide.md",
  "docs/pilot/m14-go-no-go-checklist.md"
] as const;

const read = (filePath: string) => readFileSync(path.resolve(filePath), "utf8");
const m14Docs = m14DocPaths.map(read).join("\n");
const dryRunScenario = read("docs/pilot/m14-controlled-pilot-dry-run.md");
const checklist = read("docs/pilot/m14-end-to-end-dry-run-checklist.md");
const resultsTemplate = read("docs/pilot/m14-dry-run-results-template.md");
const blockers = read("docs/pilot/m14-dry-run-blockers-and-limitations.md");
const fakeDataGuide = read("docs/pilot/m14-local-fake-data-guide.md");
const goNoGo = read("docs/pilot/m14-go-no-go-checklist.md");
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

describe("M14 controlled pilot dry run", () => {
  it("adds the required controlled dry-run docs and checklists", () => {
    for (const docPath of m14DocPaths) {
      expect(existsSync(path.resolve(docPath)), docPath).toBe(true);
    }

    expect(dryRunScenario).toContain("Public Website Enquiry -> Admin Lead Management -> Ad Work Planning");
    expect(dryRunScenario).toContain("Demo Customer One");
    expect(dryRunScenario).toContain("Demo Driver One");
    expect(dryRunScenario).toContain("AP00DR0001");
    expect(checklist).toContain("Public Website");
    expect(checklist).toContain("Driver app opens");
    expect(resultsTemplate).toContain("| Step number | Area | Action | Expected result | Actual result | Pass/Fail | Issue found | Owner | Fix needed before pilot |");
    expect(blockers).toContain("What Cannot Be Validated In Codex Or Container");
    expect(fakeDataGuide).toContain("Use this guide when creating manual dry-run records.");
    expect(goNoGo).toContain("Phone Location Proof starts correctly on a real Android device after consent.");
  });

  it("keeps dry-run docs fake-data-only and free of secrets, Work Codes, and real GPS traces", () => {
    expect(m14Docs).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    expect(m14Docs).not.toMatch(/(?:secret|token|password|work code)\s*[:=]\s*[A-Za-z0-9_-]{6,}/i);
    expect(m14Docs).not.toMatch(/\b(?:1[0-7]|[1-9])\.\d{4,}\s*,\s*(?:7[0-9]|8[0-4])\.\d{4,}\b/);
    expect(m14Docs).not.toContain("SUPABASE_SERVICE_ROLE");
    expect(m14Docs).not.toContain("service_role");
    expect(m14Docs).toContain("fake data only");
    expect(m14Docs).toContain("Do not record exact coordinate values");
    expect(m14Docs).toContain("do not write a Work Code in this document");
  });

  it("does not claim real pilot completion or real-device GPS verification", () => {
    expect(m14Docs).not.toMatch(/real customer pilot (completed|passed|verified)/i);
    expect(m14Docs).not.toMatch(/real device GPS (verified|passed|completed)/i);
    expect(m14Docs).not.toMatch(/actual pilot (completed|passed|verified)/i);
    expect(m14Docs).toContain("Phone Location Proof testing on a real Android device is pending unless AP records that it was manually performed.");
    expect(resultsTemplate).toContain("Pending Manual Device Test");
    expect(blockers).toContain("Real Android device GPS permission behavior.");
  });

  it("keeps customer wording safe and avoids unsupported proof claims", () => {
    expect(m14Docs).not.toMatch(/route verified/i);
    expect(m14Docs).not.toMatch(/map verified/i);
    expect(m14Docs).not.toMatch(/distance certified/i);
    expect(m14Docs).not.toMatch(/gps-certified/i);
    expect(m14Docs).not.toMatch(/customer can watch live/i);
    expect(m14Docs).not.toMatch(/live tracking link is available/i);
    expect(m14Docs).toContain("Customer live tracking remains unavailable.");
    expect(goNoGo).toContain("No live tracking is exposed to the customer.");
  });

  it("keeps committed environment examples placeholder-only and avoids privileged keys in web or driver source", () => {
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

  it("marks M14 complete in the milestone ledger", () => {
    expect(readme).toContain("M14 controlled pilot dry run preparation");
    expect(readme).toContain("docs/pilot/m14-controlled-pilot-dry-run.md");
    expect(readme).toContain("M14 does not add a Supabase migration");
    expect(taskBlock("M14 - Controlled Pilot Dry Run")).toContain("- [x]");
  });
});
