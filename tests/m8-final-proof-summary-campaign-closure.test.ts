import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  buildCampaignClosureReadiness,
  buildFinalProofSummaryText,
  businessLabels,
  campaignClosureStatusLabels,
  campaignClosureStatusOptions,
  finalSummaryShareMethodLabels,
  finalSummaryShareMethodOptions,
  getApprovedFinalProofs,
  hasDuplicateValues
} from "@kootha/shared";

const driverAppSource = readFileSync(path.resolve("apps/driver/App.tsx"), "utf8");
const driverConfig = readFileSync(path.resolve("apps/driver/app.json"), "utf8");
const webAdminSource = readFileSync(path.resolve("apps/web/src/admin.tsx"), "utf8");
const envExample = readFileSync(path.resolve(".env.example"), "utf8");
const packageJson = readFileSync(path.resolve("package.json"), "utf8");
const webPackageJson = readFileSync(path.resolve("apps/web/package.json"), "utf8");
const driverPackageJson = readFileSync(path.resolve("apps/driver/package.json"), "utf8");
const m0Migration = readFileSync(path.resolve("supabase/migrations/20260630000000_m0_foundation.sql"), "utf8");
const m3Migration = readFileSync(path.resolve("supabase/migrations/20260630030000_m3_campaign_planning_scheduling.sql"), "utf8");
const m7Migration = readFileSync(path.resolve("supabase/migrations/20260701070000_m7_proof_upload_customer_update_sharing.sql"), "utf8");
const m8Migration = readFileSync(path.resolve("supabase/migrations/20260701080000_m8_final_proof_summary_campaign_closure.sql"), "utf8");
const tasks = readFileSync(path.resolve(".kiro/specs/kootha-prachar-mvp/tasks.md"), "utf8");

describe("M8 final proof summary and campaign closure", () => {
  it("defines closure statuses and final summary share methods without duplicates", () => {
    expect(hasDuplicateValues(campaignClosureStatusOptions)).toBe(false);
    expect(hasDuplicateValues(finalSummaryShareMethodOptions)).toBe(false);
    expect(Object.values(campaignClosureStatusLabels)).toEqual([
      "Not Ready",
      "Ready for Review",
      "Ready to Close",
      "Closed",
      "Closed with Issues",
      "Cancelled"
    ]);
    expect(Object.values(finalSummaryShareMethodLabels)).toEqual([
      "Manual WhatsApp",
      "Manual SMS",
      "Phone Call",
      "Printed Copy",
      "In Person",
      "Other"
    ]);
  });

  it("blocks closure warnings unless admin provides a closure reason", () => {
    const missingReason = buildCampaignClosureReadiness({
      assignmentStatus: "ready_for_execution",
      releaseStatus: "released_to_driver",
      dayStatuses: ["issue_reported"],
      proofNeeded: true,
      proofReviewStatuses: ["rejected"],
      customerUpdateSharingStatuses: ["pending_sharing"],
      liveTrackingRequested: "no",
      liveTrackingEnabled: false,
      finalSummaryReviewed: true,
      customerUpdatesReviewed: true,
      proofNotRequiredConfirmed: false,
      closureReason: ""
    });
    const withReason = buildCampaignClosureReadiness({
      ...missingReason,
      assignmentStatus: "ready_for_execution",
      releaseStatus: "released_to_driver",
      dayStatuses: ["issue_reported"],
      proofNeeded: true,
      proofReviewStatuses: ["rejected"],
      customerUpdateSharingStatuses: ["pending_sharing"],
      liveTrackingRequested: "no",
      liveTrackingEnabled: false,
      finalSummaryReviewed: true,
      customerUpdatesReviewed: true,
      proofNotRequiredConfirmed: false,
      closureReason: "customer_accepted_partial_work"
    });

    expect(missingReason.canClose).toBe(false);
    expect(missingReason.blockingWarnings).toEqual(expect.arrayContaining([
      "Some planned days are not completed.",
      "Issue Reported and not resolved.",
      "Some proof was rejected.",
      "Customer updates are not marked shared."
    ]));
    expect(withReason.canClose).toBe(true);
  });

  it("allows completed reviewed work to be ready to close", () => {
    const readiness = buildCampaignClosureReadiness({
      assignmentStatus: "ready_for_execution",
      releaseStatus: "released_to_driver",
      dayStatuses: ["completed", "completed"],
      proofNeeded: true,
      proofReviewStatuses: ["approved"],
      customerUpdateSharingStatuses: ["shared_manually"],
      liveTrackingRequested: "yes",
      liveTrackingEnabled: false,
      finalSummaryReviewed: true,
      customerUpdatesReviewed: true,
      proofNotRequiredConfirmed: false,
      closureReason: ""
    });

    expect(readiness.status).toBe("ready_to_close");
    expect(readiness.canClose).toBe(true);
    expect(readiness.warnings).toContain("Premium live tracking was requested but not enabled in this MVP.");
    expect(readiness.warnings).toContain("GPS proof is not available in this version.");
  });

  it("shows waiting, rejected, and missing proof warnings", () => {
    const baseInput = {
      assignmentStatus: "ready_for_execution",
      releaseStatus: "released_to_driver",
      dayStatuses: ["completed"],
      proofNeeded: true,
      proofReviewStatuses: ["waiting_review"],
      customerUpdateSharingStatuses: ["shared_manually"],
      liveTrackingRequested: "no",
      liveTrackingEnabled: false,
      finalSummaryReviewed: true,
      customerUpdatesReviewed: true,
      proofNotRequiredConfirmed: false,
      closureReason: ""
    } as const;
    const waiting = buildCampaignClosureReadiness(baseInput);
    const missing = buildCampaignClosureReadiness({
      ...baseInput,
      proofReviewStatuses: []
    });

    expect(waiting.warnings).toContain("Proof is waiting for review.");
    expect(missing.warnings).toContain("Missing Proof.");
  });

  it("uses approved proof in the final summary and excludes rejected proof as customer-approved", () => {
    const proofs = [
      { status: "approved" as const, areaPlaceName: "Main Road", noteText: "Shop announcements completed" },
      { status: "rejected" as const, areaPlaceName: "Old Road", noteText: "Blurred image" }
    ];
    const summary = buildFinalProofSummaryText({
      customerName: "Customer",
      businessName: "Shop",
      mobileNumber: "9999999999",
      cityTown: "Ongole",
      advertisementDetails: "Festival offer",
      adWorkReference: "AW-12345678",
      packageLabel: "Standard",
      plannedStartDate: "2026-07-01",
      plannedEndDate: "2026-07-02",
      assignedDriver: "Driver",
      assignedVehicle: "AP00AA0000",
      micSystemStatus: "Available",
      days: [{ date: "2026-07-01", status: "completed", completionNote: "Work Completed" }],
      proofs,
      customerUpdatesShared: true,
      closureStatusLabel: "Ready to Close",
      customerAccepted: "yes",
      closureNote: "Customer Accepted"
    });

    expect(getApprovedFinalProofs(proofs)).toHaveLength(1);
    expect(summary).toContain("Main Road - Shop announcements completed");
    expect(summary).not.toContain("Old Road - Blurred image");
    expect(summary).toContain("GPS, route, map, and live tracking proof are not included in this version.");
  });

  it("adds admin-only final summary storage and closure RPCs", () => {
    const lowerSql = m8Migration.toLowerCase();

    expect(lowerSql).toContain("create table if not exists public.final_proof_summaries");
    expect(lowerSql).toContain("alter table public.final_proof_summaries enable row level security");
    expect(lowerSql).toContain("revoke all on public.final_proof_summaries from anon");
    expect(lowerSql).toContain("revoke all on public.final_proof_summaries from authenticated");
    expect(lowerSql).toContain("using (public.is_admin())");
    expect(lowerSql).toContain("with check (public.is_admin())");
    expect(m8Migration).toContain("create or replace function public.prepare_final_proof_summary");
    expect(m8Migration).toContain("create or replace function public.close_ad_work_with_final_summary");
    expect(m8Migration).toContain("create or replace function public.mark_final_summary_shared");
    expect(m8Migration).toContain("if not public.is_admin() then");
    expect(lowerSql).toContain("security definer");
    expect(lowerSql).toContain("set search_path = public");
    expect(m8Migration).not.toMatch(/for select\s+to anon/i);
    expect(m8Migration).not.toMatch(/public\s*=\s*true/i);
  });

  it("keeps proof photo storage private and only uses approved proof for summaries", () => {
    expect(m7Migration).toContain("'proof-photos', 'proof-photos', false, 5242880");
    expect(m7Migration).toContain("bucket_id = 'proof-photos' and public.is_admin()");
    expect(m8Migration).toContain("proof.review_status = 'approved'");
    expect(m8Migration).toContain("proof.upload_status = 'uploaded'");
    expect(m8Migration).not.toContain("public_token");
  });

  it("adds expected admin UI surfaces", () => {
    expect(webAdminSource).toContain("Final Proof Summary");
    expect(webAdminSource).toContain("Mark Ready for Closure");
    expect(webAdminSource).toContain("Close Ad Work");
    expect(webAdminSource).toContain("Copy Final Summary");
    expect(webAdminSource).toContain("Print Summary");
    expect(webAdminSource).toContain("Mark Final Summary as Shared");
    expect(webAdminSource).toContain("M8SummaryCards");
    expect(Object.values(businessLabels.admin)).toEqual(expect.arrayContaining([
      "Final Proof Summary",
      "Ready to Close",
      "Close Ad Work",
      "Closed with Issues",
      "Closure Note",
      "Customer Accepted"
    ]));
  });

  it("does not add GPS tracking, maps, provider sending, payments, customer apps, iOS, or PWA", () => {
    const source = (driverAppSource + "\n" + webAdminSource + "\n" + packageJson + "\n" + webPackageJson + "\n" + driverPackageJson + "\n" + m8Migration).toLowerCase();

    expect(driverConfig).not.toContain("ACCESS_FINE_LOCATION");
    expect(driverConfig).not.toContain("ACCESS_COARSE_LOCATION");
    expect(driverConfig).not.toContain("ACCESS_BACKGROUND_LOCATION");
    expect(source).not.toContain("expo-location");
    expect(source).not.toContain("maps.googleapis");
    expect(source).not.toContain("google maps");
    expect(source).not.toContain("mapbox");
    expect(source).not.toContain("leaflet");
    expect(m8Migration).not.toContain("tracking_sessions");
    expect(m8Migration).not.toContain("location_points");
    expect(source).not.toContain("stripe");
    expect(source).not.toContain("razorpay");
    expect(source).not.toContain("cashfree");
    expect(source).not.toContain("twilio");
    expect(source).not.toContain("whatsapp business");
    expect(source).not.toContain("sms provider");
    expect(source).not.toMatch(/href=["'][^"']*live/);
    expect(existsSync(path.resolve("apps/customer"))).toBe(false);
    expect(existsSync(path.resolve("apps/web/public/manifest.webmanifest"))).toBe(false);
    expect(existsSync(path.resolve("apps/web/src/service-worker.ts"))).toBe(false);
    expect(existsSync(path.resolve("apps/driver/ios"))).toBe(false);
  });

  it("does not use privileged keys and keeps env placeholders", () => {
    const forbiddenKeyName = ["service", "role"].join("_");
    const forbiddenEnvName = ["SUPABASE", "SERVICE", "ROLE"].join("_");
    const source = driverAppSource + "\n" + webAdminSource;

    expect(source).not.toContain(forbiddenKeyName);
    expect(source).not.toContain(forbiddenEnvName);
    expect(envExample).toContain("https://your-project.supabase.co");
    expect(envExample).toContain("replace-with-public-anon-key");
    expect(envExample).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    expect(m0Migration).toMatch(/customer_live_enabled\s+boolean\s+not null\s+default false/i);
    expect(m3Migration).toMatch(/live_tracking_enabled boolean not null default false/i);
  });

  it("marks M8 complete without starting future milestones", () => {
    expect(tasks).toMatch(/## Milestone M8 - Final Proof Summary and Campaign Closure[\s\S]*- \[x\]/);
    expect(tasks).not.toMatch(/## Milestone M9[\s\S]*- \[x\]/);
  });
});