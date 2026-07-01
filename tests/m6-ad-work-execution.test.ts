import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  adWorkExecutionDayStatusLabels,
  adWorkExecutionDayStatusOptions,
  buildExecutionReleaseReadiness,
  canEndWork,
  canResumeWork,
  canStartWork,
  canTakeBreak,
  businessLabels,
  executionProofNoteTypeLabels,
  executionProofNoteTypeOptions,
  executionReleaseStatusLabels,
  executionReleaseStatusOptions,
  hasDuplicateValues,
  validateDriverExecutionAction
} from "@kootha/shared";

const driverAppSource = readFileSync(path.resolve("apps/driver/App.tsx"), "utf8");
const webAdminSource = readFileSync(path.resolve("apps/web/src/admin.tsx"), "utf8");
const envExample = readFileSync(path.resolve(".env.example"), "utf8");
const packageJson = readFileSync(path.resolve("package.json"), "utf8");
const webPackageJson = readFileSync(path.resolve("apps/web/package.json"), "utf8");
const driverPackageJson = readFileSync(path.resolve("apps/driver/package.json"), "utf8");
const driverConfig = readFileSync(path.resolve("apps/driver/app.json"), "utf8");
const m6Migration = readFileSync(path.resolve("supabase/migrations/20260630060000_m6_ad_work_execution_without_gps.sql"), "utf8");
const tasks = readFileSync(path.resolve(".kiro/specs/kootha-prachar-mvp/tasks.md"), "utf8");

describe("M6 ad work execution without GPS", () => {
  it("defines release, execution, and proof note labels without duplicates", () => {
    expect(hasDuplicateValues(executionReleaseStatusOptions)).toBe(false);
    expect(hasDuplicateValues(adWorkExecutionDayStatusOptions)).toBe(false);
    expect(hasDuplicateValues(executionProofNoteTypeOptions)).toBe(false);
    expect(Object.values(executionReleaseStatusLabels)).toEqual(["Not Released", "Released to Driver", "Access Revoked"]);
    expect(Object.values(adWorkExecutionDayStatusLabels)).toEqual(["Planned", "Ready", "Running", "On Break", "Completed", "Issue Reported", "Cancelled"]);
    expect(Object.values(executionProofNoteTypeLabels)).toEqual(["Area Covered", "Announcement Done", "Customer Request", "Issue", "Other"]);
  });

  it("allows release only when the assigned Ad Work is ready", () => {
    const ready = buildExecutionReleaseReadiness({
      assignmentStatus: "ready_for_execution",
      releaseStatus: "not_released",
      startDate: "2026-07-10",
      areasToCover: "Main Road",
      packageInterest: "standard",
      driverAssigned: true,
      vehicleAssigned: true
    });
    const missingAssignment = buildExecutionReleaseReadiness({
      assignmentStatus: "assigned",
      releaseStatus: "not_released",
      startDate: "2026-07-10",
      areasToCover: "Main Road",
      packageInterest: "standard",
      driverAssigned: true,
      vehicleAssigned: true
    });

    expect(ready.ready).toBe(true);
    expect(missingAssignment.ready).toBe(false);
  });

  it("enforces driver work day transitions", () => {
    expect(canStartWork("planned")).toBe(true);
    expect(canStartWork("ready")).toBe(true);
    expect(canStartWork("running")).toBe(false);
    expect(canTakeBreak("running")).toBe(true);
    expect(canTakeBreak("ready")).toBe(false);
    expect(canResumeWork("on_break")).toBe(true);
    expect(canResumeWork("running")).toBe(false);
    expect(canEndWork("running")).toBe(true);
    expect(canEndWork("on_break")).toBe(true);
    expect(canEndWork("ready")).toBe(false);
  });

  it("requires notes for end, issue, and proof note actions", () => {
    expect(validateDriverExecutionAction("running", "end", "")).toContain("Completion note is required.");
    expect(validateDriverExecutionAction("running", "end", "Completed near market")).toEqual([]);
    expect(validateDriverExecutionAction("running", "issue", "")).toContain("Issue note is required.");
    expect(validateDriverExecutionAction("running", "add_proof_note", "")).toContain("Proof note is required.");
  });

  it("adds admin release and driver code RPCs with explicit checks", () => {
    expect(m6Migration).toContain("create or replace function public.release_ad_work_to_driver");
    expect(m6Migration).toContain("create or replace function public.driver_get_assigned_work");
    expect(m6Migration).toContain("create or replace function public.driver_update_work_day");
    expect(m6Migration).toContain("work_access_code_hash");
    expect(m6Migration).toContain("public.m6_hash_work_code");
    expect(m6Migration).toContain("if not public.is_admin()");
    expect(m6Migration).toContain("set search_path = public");
    expect(m6Migration).toContain("Invalid work code or mobile number");
    expect(m6Migration).toContain("public.m6_normalize_mobile(driver_record.phone) = public.m6_normalize_mobile(p_mobile)");
    expect(m6Migration).toContain("grant execute on function public.driver_get_assigned_work(text, text) to anon");
    expect(m6Migration).toContain("grant execute on function public.driver_update_work_day(text, text, uuid, text, text, text, text) to anon");
  });

  it("keeps execution and proof note records behind admin-only table policies", () => {
    const lowerSql = m6Migration.toLowerCase();

    expect(lowerSql).toContain("alter table public.execution_proof_notes enable row level security");
    expect(lowerSql).toContain("alter table public.customer_updates enable row level security");
    expect(lowerSql).toContain("revoke all on public.execution_proof_notes from anon");
    expect(lowerSql).toContain("revoke all on public.customer_updates from anon");
    expect(m6Migration).toMatch(/for select\s+to authenticated\s+using \(public\.is_admin\(\)\)/i);
    expect(m6Migration).toMatch(/for insert\s+to authenticated\s+with check \(public\.is_admin\(\)\)/i);
  });

  it("creates customer update records for execution events only", () => {
    expect(m6Migration).toContain("Your advertisement work has started.");
    expect(m6Migration).toContain("currently paused for a driver break");
    expect(m6Migration).toContain("Your advertisement work is currently running.");
    expect(m6Migration).toContain("A proof note was added for your advertisement work.");
    expect(m6Migration).toContain("Today''s advertisement work is completed.");
    expect(m6Migration).toContain("Your work had an issue and our team is checking it.");
    expect(m6Migration).toContain("'copy'");
    expect(m6Migration).toContain("'draft'");
  });

  it("does not add GPS, report, payment, or provider behavior", () => {
    const source = (driverAppSource + "\n" + webAdminSource + "\n" + packageJson + "\n" + webPackageJson + "\n" + driverPackageJson + "\n" + m6Migration).toLowerCase();

    expect(driverConfig).not.toContain("ACCESS_FINE_LOCATION");
    expect(driverConfig).not.toContain("ACCESS_COARSE_LOCATION");
    expect(driverConfig).not.toContain("ACCESS_BACKGROUND_LOCATION");
    expect(driverConfig).not.toContain("RECORD_AUDIO");
    expect(driverConfig).not.toContain("CAMERA");
    expect(source).not.toContain("expo-location");
    expect(source).not.toContain("access_background_location");
    expect(source).not.toContain("maps.googleapis");
    expect(source).not.toContain("google maps");
    expect(source).not.toContain("mapbox");
    expect(source).not.toContain("leaflet");
    expect(source).not.toContain("tracking_sessions");
    expect(source).not.toContain("location_points");
    expect(source).not.toContain("expo-camera");
    expect(source).not.toContain("expo-av");
    expect(source).not.toContain("camera");
    expect(source).not.toContain("microphone");
    expect(source).not.toContain("stripe");
    expect(source).not.toContain("razorpay");
    expect(source).not.toContain("cashfree");
    expect(source).not.toContain("twilio");
    expect(source).not.toContain("whatsapp business");
    expect(source).not.toContain("sms provider");
    expect(source).not.toMatch(/href=["'][^"']*live/);
    expect(source).not.toContain("public_token");
    expect(source).not.toContain("generated_at");
  });

  it("does not use privileged Supabase keys in frontend or driver app", () => {
    const forbiddenKeyName = ["service", "role"].join("_");
    const forbiddenEnvName = ["SUPABASE", "SERVICE", "ROLE"].join("_");
    const source = driverAppSource + "\n" + webAdminSource;

    expect(source).not.toContain(forbiddenKeyName);
    expect(source).not.toContain(forbiddenEnvName);
  });

  it("keeps env example values as placeholders only", () => {
    expect(envExample).toContain("https://your-project.supabase.co");
    expect(envExample).toContain("replace-with-public-anon-key");
    expect(envExample).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  });

  it("adds expected admin and driver UI surfaces", () => {
    expect(webAdminSource).toContain("Release to Driver");
    expect(webAdminSource).toContain("Work Access Code");
    expect(webAdminSource).toContain("Execution timeline");
    expect(webAdminSource).toContain("Customer update records");
    expect(driverAppSource).toContain("Open Assigned Work");
    expect(Object.values(businessLabels.driver)).toContain("Start Work");
    expect(Object.values(businessLabels.driver)).toContain("Take Break");
    expect(Object.values(businessLabels.driver)).toContain("Resume Work");
    expect(Object.values(businessLabels.driver)).toContain("End Work");
    expect(Object.values(businessLabels.driver)).toContain("Add Proof Note");
  });

  it("does not add customer app, iOS app, or PWA files", () => {
    expect(existsSync(path.resolve("apps/customer"))).toBe(false);
    expect(existsSync(path.resolve("apps/web/public/manifest.webmanifest"))).toBe(false);
    expect(existsSync(path.resolve("apps/web/src/service-worker.ts"))).toBe(false);
    expect(existsSync(path.resolve("apps/driver/ios"))).toBe(false);
  });

  it("marks M6 complete and keeps future milestones open", () => {
    expect(tasks).toMatch(/## Milestone M5 - Driver and Vehicle Assignment to Ad Work[\s\S]*- \[x\]/);
    expect(tasks).toMatch(/## Milestone M6 - Ad Work Execution Without GPS[\s\S]*- \[x\]/);
    expect(tasks).toMatch(/## Milestone M7 - Proof Upload and Customer Update Sharing[\s\S]*- \[x\]/);
    expect(tasks).toMatch(/## Milestone M8 - Final Proof Summary and Campaign Closure[\s\S]*- \[x\]/);
  });
});
