import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  buildFinalProofSummaryText,
  buildFinalSummaryLocationProofLines,
  finalSummaryLocationProofActiveLabels,
  finalSummaryLocationProofActiveOptions,
  finalSummaryLocationProofStatusLabels,
  finalSummaryLocationProofStatusOptions,
  finalSummaryLocationProofSyncLabels,
  finalSummaryLocationProofSyncOptions,
  getFinalSummaryLocationProofActiveLabel,
  getFinalSummaryLocationProofStatusLabel,
  getFinalSummaryLocationProofSyncLabel,
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
const m12Migration = readFileSync(path.resolve("supabase/migrations/20260701120000_m12_location_proof_in_final_summary.sql"), "utf8");
const tasks = readFileSync(path.resolve(".kiro/specs/kootha-prachar-mvp/tasks.md"), "utf8");

const lowerM12 = m12Migration.toLowerCase();

describe("M12 location proof in final summary", () => {
  it("defines customer-safe final summary location proof labels", () => {
    expect(hasDuplicateValues(finalSummaryLocationProofStatusOptions)).toBe(false);
    expect(hasDuplicateValues(finalSummaryLocationProofActiveOptions)).toBe(false);
    expect(hasDuplicateValues(finalSummaryLocationProofSyncOptions)).toBe(false);
    expect(Object.values(finalSummaryLocationProofStatusLabels)).toEqual([
      "Reviewed by Team",
      "Needs Follow-up",
      "Not Required",
      "Not Available",
      "Not Reviewed"
    ]);
    expect(Object.values(finalSummaryLocationProofActiveLabels)).toEqual(["Yes", "No", "Not Confirmed"]);
    expect(Object.values(finalSummaryLocationProofSyncLabels)).toEqual(["Synced", "Pending", "Not Applicable", "Not Available"]);
    expect(getFinalSummaryLocationProofStatusLabel("reviewed_by_team")).toBe("Reviewed by Team");
    expect(getFinalSummaryLocationProofActiveLabel("not_confirmed")).toBe("Not Confirmed");
    expect(getFinalSummaryLocationProofSyncLabel("not_applicable")).toBe("Not Applicable");
  });

  it("builds a customer-safe Phone Location Proof section without raw technical values", () => {
    const locationLines = buildFinalSummaryLocationProofLines({
      include: true,
      status: "reviewed_by_team",
      required: true,
      activeDuringWork: "yes",
      firstLocationReceived: "01 Jul 2026, 10:00 am",
      lastLocationReceived: "01 Jul 2026, 01:30 pm",
      offlineSync: "synced",
      teamReviewNote: "Team reviewed the phone location proof."
    });
    const summary = buildFinalProofSummaryText({
      customerName: "Customer",
      businessName: "Shop",
      mobileNumber: "9999999999",
      cityTown: "Ongole",
      advertisementDetails: "Festival offer",
      adWorkReference: "AW-12345678",
      packageLabel: "Standard",
      plannedStartDate: "2026-07-01",
      plannedEndDate: "2026-07-01",
      assignedDriver: "Driver",
      assignedVehicle: "AP00AA0000",
      micSystemStatus: "Available",
      days: [{ date: "2026-07-01", status: "completed" }],
      proofs: [{ status: "approved", areaPlaceName: "Main Road", noteText: "Proof checked" }],
      customerUpdatesShared: true,
      locationProof: {
        include: true,
        status: "reviewed_by_team",
        required: true,
        activeDuringWork: "yes",
        firstLocationReceived: "01 Jul 2026, 10:00 am",
        lastLocationReceived: "01 Jul 2026, 01:30 pm",
        offlineSync: "synced",
        teamReviewNote: "Team reviewed the phone location proof."
      },
      closureStatusLabel: "Ready to Close",
      customerAccepted: "yes",
      closureNote: "Customer accepted"
    });

    expect(locationLines).toEqual([
      "Phone Location Proof",
      "Phone Location Proof Status: Reviewed by Team",
      "Location Proof Required: Yes",
      "Location Proof Active During Work: Yes",
      "First Location Received: 01 Jul 2026, 10:00 am",
      "Last Location Received: 01 Jul 2026, 01:30 pm",
      "Offline Location Sync: Synced",
      "Team Review Note: Team reviewed the phone location proof.",
      "Phone Location Proof is supporting evidence only. It does not certify route, map, distance, or full area coverage."
    ]);
    expect(summary).toContain("Phone Location Proof Status: Reviewed by Team");
    expect(summary).toContain("First Location Received: 01 Jul 2026, 10:00 am");
    expect(summary).not.toMatch(/\b(lat|lng|latitude|longitude|accuracy_meters|tracking_session_id|location_points)\b/i);
    expect(summary).not.toContain("Customer live tracking");
  });

  it("adds admin-only M12 final summary fields and closure warnings", () => {
    expect(lowerM12).toContain("include_phone_location_proof boolean not null default false");
    expect(lowerM12).toContain("phone_location_proof_customer_note text");
    expect(lowerM12).toContain("phone_location_proof_customer_safe_confirmed boolean not null default false");
    expect(lowerM12).toContain("phone_location_proof_status text not null default 'not_available'");
    expect(lowerM12).toContain("phone_location_proof_status in ('reviewed_by_team', 'needs_follow_up', 'not_required', 'not_available', 'not_reviewed')");
    expect(lowerM12).toContain("phone_location_proof_active_during_work in ('yes', 'no', 'not_confirmed')");
    expect(lowerM12).toContain("phone_location_offline_sync_status in ('synced', 'pending', 'not_applicable', 'not_available')");
    expect(lowerM12).toContain("create or replace function public.m12_assert_customer_safe_location_note");
    expect(m12Migration).toContain("Phone Location Proof is not reviewed.");
    expect(m12Migration).toContain("No phone location updates were received.");
    expect(m12Migration).toContain("Some location updates need follow-up.");
    expect(m12Migration).toContain("Phone Location Proof must be reviewed before it can be included in the customer summary");
    expect(m12Migration).toContain("Confirm customer-safe Phone Location Proof wording before including it");
    expect(m12Migration).toContain("Closure Reason or customer-safe Phone Location Proof note is required when location proof warnings remain");
  });

  it("keeps final summaries, tracking sessions, and location points admin-only", () => {
    expect(lowerM12).toContain("alter table public.final_proof_summaries enable row level security");
    expect(lowerM12).toContain("alter table public.tracking_sessions enable row level security");
    expect(lowerM12).toContain("alter table public.location_points enable row level security");
    expect(lowerM12).toContain("security definer");
    expect(lowerM12).toContain("set search_path = public");
    expect(lowerM12).toContain("if not public.is_admin() then");
    expect(lowerM12).toContain("revoke all on function public.prepare_final_proof_summary");
    expect(lowerM12).toContain("grant execute on function public.prepare_final_proof_summary");
    expect(lowerM12).toContain("grant execute on function public.close_ad_work_with_final_summary");
    expect(m12Migration).not.toMatch(/grant execute on function public\.(prepare_final_proof_summary|close_ad_work_with_final_summary)[\s\S]*to anon/i);
    expect(m12Migration).not.toContain("using (true)");
    expect(m0Migration).toMatch(/customer_live_enabled\s+boolean\s+not null\s+default false/i);
    expect(m3Migration).toMatch(/live_tracking_enabled boolean not null default false/i);
  });

  it("adds admin controls and preview without public sharing links", () => {
    expect(webAdminSource).toContain("Phone Location Proof in Final Summary");
    expect(webAdminSource).toContain("Phone Location Proof Status");
    expect(webAdminSource).toContain("Location Proof Active During Work");
    expect(webAdminSource).toContain("Offline Location Sync");
    expect(webAdminSource).toContain("Customer-safe location proof note");
    expect(webAdminSource).toContain("I confirm this Phone Location Proof wording is customer-safe.");
    expect(webAdminSource).toContain("Customer-safe wording preview");
    expect(webAdminSource).toContain("p_include_phone_location_proof");
    expect(webAdminSource).toContain("p_phone_location_proof_customer_note");
    expect(webAdminSource).toContain("p_phone_location_proof_customer_safe_confirmed");
    expect(webAdminSource).toContain("fetchTrackingSessions(config, session, adWork.id)");
    expect(webAdminSource).toContain("fetchLocationPoints(config, session, adWork.id, 1000)");
    expect(webAdminSource).toContain("fetchLocationProofReviews(config, session, adWork.id)");
    expect(webAdminSource).not.toContain("customer_live_tracking_link");
    expect(webAdminSource).not.toMatch(/href=[{\"'][^\n]*location/i);
  });

  it("keeps proof photos private and secrets placeholder-only", () => {
    const forbiddenKeyName = ["service", "role"].join("_");
    const forbiddenEnvName = ["SUPABASE", "SERVICE", "ROLE"].join("_");
    const source = driverAppSource + "\n" + webAdminSource;

    expect(source).not.toContain(forbiddenKeyName);
    expect(source).not.toContain(forbiddenEnvName);
    expect(envExample).toContain("https://your-project.supabase.co");
    expect(envExample).toContain("replace-with-public-anon-key");
    expect(envExample).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    expect(m7Migration).toContain("'proof-photos', 'proof-photos', false, 5242880");
  });

  it("does not add maps, route drawing, public tracking, providers, payments, customer apps, iOS, or PWA", () => {
    const source = (driverAppSource + "\n" + webAdminSource + "\n" + packageJson + "\n" + webPackageJson + "\n" + driverPackageJson + "\n" + m12Migration).toLowerCase();

    expect(driverConfig).toContain("android.permission.ACCESS_FINE_LOCATION");
    expect(driverConfig).not.toContain("ACCESS_BACKGROUND_LOCATION");
    expect(source).not.toContain("requestbackgroundpermissionsasync");
    expect(source).not.toContain("startlocationupdatesasync");
    expect(source).not.toContain("expo-task-manager");
    expect(source).not.toContain("maps.googleapis");
    expect(source).not.toContain("google.maps");
    expect(source).not.toContain("mapbox");
    expect(source).not.toContain("leaflet");
    expect(source).not.toContain("polyline");
    expect(source).not.toContain("gps_device_ingest");
    expect(source).not.toContain("public_location_access");
    expect(source).not.toContain("stripe");
    expect(source).not.toContain("razorpay");
    expect(source).not.toContain("cashfree");
    expect(source).not.toContain("twilio");
    expect(source).not.toContain("whatsapp business");
    expect(source).not.toContain("sms provider");
    expect(existsSync(path.resolve("apps/customer"))).toBe(false);
    expect(existsSync(path.resolve("apps/web/public/manifest.webmanifest"))).toBe(false);
    expect(existsSync(path.resolve("apps/web/src/service-worker.ts"))).toBe(false);
    expect(existsSync(path.resolve("apps/driver/ios"))).toBe(false);
  });

  it("marks M12 complete and leaves M13 not started", () => {
    expect(tasks).toMatch(/## Milestone M12 - Location Proof in Final Summary[\s\S]*- \[x\]/);
    expect(tasks).toMatch(/## Milestone M13 - Pilot Readiness and Deployment Preparation[\s\S]*- \[ \] Not started\./);
    expect(tasks).not.toMatch(/## Milestone M13 - Pilot Readiness and Deployment Preparation[\s\S]*- \[x\]/);
  });
});