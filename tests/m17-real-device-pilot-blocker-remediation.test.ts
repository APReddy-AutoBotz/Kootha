import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const m17DocPaths = [
  "docs/pilot/m17-real-device-pilot-blocker-remediation.md",
  "docs/pilot/m17-android-real-device-setup-guide.md",
  "docs/deployment/m17-driver-app-real-device-build-guide.md",
  "docs/deployment/m17-supabase-target-remediation-guide.md",
  "docs/deployment/m17-web-admin-preview-deployment-guide.md",
  "docs/pilot/m17-blocker-remediation-evidence-template.md"
] as const;

const read = (filePath: string) => readFileSync(path.resolve(filePath), "utf8");
const m17Docs = m17DocPaths.map(read).join("\n");
const remediationDoc = read("docs/pilot/m17-real-device-pilot-blocker-remediation.md");
const androidGuide = read("docs/pilot/m17-android-real-device-setup-guide.md");
const buildGuide = read("docs/deployment/m17-driver-app-real-device-build-guide.md");
const supabaseGuide = read("docs/deployment/m17-supabase-target-remediation-guide.md");
const previewGuide = read("docs/deployment/m17-web-admin-preview-deployment-guide.md");
const evidenceTemplate = read("docs/pilot/m17-blocker-remediation-evidence-template.md");
const readinessScript = read("scripts/check-pilot-readiness.mjs");
const envExample = read(".env.example");
const readme = read("README.md");
const tasks = read(".kiro/specs/kootha-prachar-mvp/tasks.md");
const driverAppSource = read("apps/driver/App.tsx");
const driverConfig = read("apps/driver/app.json");
const webAdminSource = read("apps/web/src/admin.tsx");
const packageJson = read("package.json");
const webPackageJson = read("apps/web/package.json");
const driverPackageJson = read("apps/driver/package.json");

const taskBlock = (milestone: string): string => {
  const match = tasks.match(new RegExp(`## Milestone ${milestone}[\\s\\S]*?(?=\\n## Milestone|$)`));
  return match?.[0] ?? "";
};

describe("M17 real device pilot blocker remediation", () => {
  it("adds the required M17 remediation docs and evidence template", () => {
    for (const docPath of m17DocPaths) {
      expect(existsSync(path.resolve(docPath)), docPath).toBe(true);
    }

    expect(remediationDoc).toContain("| Blocker | Required action | Can Codex do it? | Requires AP/manual action? | Evidence needed | Status |");
    expect(remediationDoc).toContain("M16 recorded `Result: Blocked`");
    expect(androidGuide).toContain("foreground location permission appears at this point only.");
    expect(androidGuide).toContain("Do not record raw latitude or longitude in committed docs.");
    expect(buildGuide).toContain("Do not commit APK files.");
    expect(supabaseGuide).toContain("Verify Public Enquiry Insert-Only");
    expect(previewGuide).toContain("M17 does not deploy automatically.");
    expect(evidenceTemplate).toContain("| Blocker | Remediation action performed | Environment/device | Expected result | Actual result | Pass/Fail | Evidence reference | Remaining issue | Owner | Retest needed |");
  });

  it("keeps the blocker status honest and manual/AP-owned", () => {
    expect(remediationDoc).toContain("M17 converts the M16 blocked result into a concrete remediation package.");
    expect(remediationDoc).toContain("Do not mark the real-device pilot as passed unless AP provides the real environment");
    expect(remediationDoc).toContain("Providing a physical Android phone.");
    expect(remediationDoc).toContain("Providing a target Supabase project.");
    expect(remediationDoc).toContain("Providing a deployed preview or production-like web/admin environment.");
    expect(m17Docs).not.toMatch(/Result:\s*Pass/i);
    expect(m17Docs).not.toMatch(/real-device pilot (passed|completed|verified)/i);
    expect(m17Docs).not.toMatch(/real customer pilot (completed|passed|verified)/i);
    expect(m17Docs).not.toMatch(/all blockers (fixed|resolved)/i);
  });

  it("runs the pilot readiness script with safe output only", () => {
    const result = spawnSync(process.execPath, ["scripts/check-pilot-readiness.mjs"], {
      cwd: path.resolve("."),
      encoding: "utf8",
      env: {
        ...process.env,
        VITE_SUPABASE_SERVICE_ROLE_KEY: "do-not-print-this-value"
      }
    });
    const combinedOutput = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(0);
    expect(combinedOutput).toContain("pilot-readiness mode: local");
    expect(combinedOutput).toContain("m17-docs: present (info)");
    expect(combinedOutput).toContain("m17-env-docs: documented (info)");
    expect(combinedOutput).toContain("env-example: configured (info)");
    expect(combinedOutput).toContain("env-example: placeholder (info)");
    expect(combinedOutput).toContain("frontend-env: safe (info)");
    expect(combinedOutput).not.toContain("do-not-print-this-value");
    expect(combinedOutput).not.toContain("VITE_SUPABASE_SERVICE_ROLE_KEY");
    expect(readinessScript).not.toContain("process.env[");
    expect(readinessScript).not.toContain("fetch(");
  });

  it("keeps M17 docs free of secrets, real data, real Work Codes, proof paths, and raw coordinates", () => {
    expect(m17Docs).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    expect(m17Docs).not.toMatch(/(?:secret|token|password|work code)\s*[:=]\s*[A-Za-z0-9_-]{4,}/i);
    expect(m17Docs).not.toMatch(/\b(?:1[0-7]|[1-9])\.\d{4,}\s*,\s*(?:7[0-9]|8[0-4])\.\d{4,}\b/);
    expect(m17Docs).not.toMatch(/proof-photos\/[A-Za-z0-9/_-]+\.(jpg|jpeg|png|webp)/i);
    expect(m17Docs).not.toContain("SUPABASE_SERVICE_ROLE");
    expect(m17Docs).not.toContain("service_role");
    expect(m17Docs).toContain("Use fake customer, driver, vehicle, and Ad Work data only.");
    expect(m17Docs).toContain("Do not write real Work Codes in this file.");
    expect(m17Docs).toContain("Do not write raw GPS coordinates in this file.");
  });

  it("does not add unsupported proof claims or customer live tracking promises", () => {
    expect(m17Docs).not.toMatch(/route verified/i);
    expect(m17Docs).not.toMatch(/map verified/i);
    expect(m17Docs).not.toMatch(/distance certified/i);
    expect(m17Docs).not.toMatch(/gps-certified/i);
    expect(m17Docs).not.toMatch(/customer can watch live/i);
    expect(m17Docs).not.toMatch(/live tracking link is available/i);
    expect(previewGuide).toContain("Customer live tracking remains unavailable.");
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

  it("updates README and marks only M17 complete while leaving M18 not started", () => {
    expect(readme).toContain("M17 real device pilot blocker remediation");
    expect(readme).toContain("docs/pilot/m17-real-device-pilot-blocker-remediation.md");
    expect(readme).toContain("pnpm check:pilot-readiness");
    expect(readme).toContain("M17 does not add a Supabase migration");
    expect(taskBlock("M17 - Real Device Pilot Blocker Remediation")).toContain("- [x]");
    expect(taskBlock("M18 - Real Device Pilot Evidence Retry")).toContain("- [ ] Not started.");
    expect(taskBlock("M18 - Real Device Pilot Evidence Retry")).not.toContain("- [x]");
  });
});
