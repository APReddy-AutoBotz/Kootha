import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  allowedProofPhotoMimeTypes,
  businessLabels,
  canUploadPhotoProof,
  customerUpdateSharingMethodLabels,
  customerUpdateSharingMethodOptions,
  customerUpdateSharingStatusLabels,
  customerUpdateSharingStatusOptions,
  hasDuplicateValues,
  maxProofPhotoBytes,
  proofPhotoBucketName,
  proofReviewStatusLabels,
  proofReviewStatusOptions,
  proofUploadStatusLabels,
  proofUploadStatusOptions,
  validatePhotoProofInput,
  validateProofPhotoFile
} from "@kootha/shared";

const driverAppSource = readFileSync(path.resolve("apps/driver/App.tsx"), "utf8");
const webAdminSource = readFileSync(path.resolve("apps/web/src/admin.tsx"), "utf8");
const envExample = readFileSync(path.resolve(".env.example"), "utf8");
const packageJson = readFileSync(path.resolve("package.json"), "utf8");
const webPackageJson = readFileSync(path.resolve("apps/web/package.json"), "utf8");
const driverPackageJson = readFileSync(path.resolve("apps/driver/package.json"), "utf8");
const driverConfig = readFileSync(path.resolve("apps/driver/app.json"), "utf8");
const m0Migration = readFileSync(path.resolve("supabase/migrations/20260630000000_m0_foundation.sql"), "utf8");
const m3Migration = readFileSync(path.resolve("supabase/migrations/20260630030000_m3_campaign_planning_scheduling.sql"), "utf8");
const m7Migration = readFileSync(path.resolve("supabase/migrations/20260701070000_m7_proof_upload_customer_update_sharing.sql"), "utf8");
const tasks = readFileSync(path.resolve(".kiro/specs/kootha-prachar-mvp/tasks.md"), "utf8");

describe("M7 proof upload and customer update sharing", () => {
  it("defines proof and sharing statuses without duplicates", () => {
    expect(hasDuplicateValues(proofUploadStatusOptions)).toBe(false);
    expect(hasDuplicateValues(proofReviewStatusOptions)).toBe(false);
    expect(hasDuplicateValues(customerUpdateSharingStatusOptions)).toBe(false);
    expect(hasDuplicateValues(customerUpdateSharingMethodOptions)).toBe(false);
    expect(Object.values(proofUploadStatusLabels)).toEqual(["Pending Upload", "Uploaded", "Failed", "Cancelled"]);
    expect(Object.values(proofReviewStatusLabels)).toEqual(["Waiting Review", "Approved", "Rejected", "Needs More Info"]);
    expect(Object.values(customerUpdateSharingStatusLabels)).toEqual(["Pending Sharing", "Shared Manually"]);
    expect(Object.values(customerUpdateSharingMethodLabels)).toEqual(["Phone Call", "Manual WhatsApp", "Manual SMS", "In Person", "Other"]);
  });

  it("validates photo proof upload timing, labels, MIME type, and size", () => {
    expect(proofPhotoBucketName).toBe("proof-photos");
    expect(maxProofPhotoBytes).toBe(5 * 1024 * 1024);
    expect(allowedProofPhotoMimeTypes).toEqual(["image/jpeg", "image/png", "image/webp"]);
    expect(canUploadPhotoProof("running")).toBe(true);
    expect(canUploadPhotoProof("on_break")).toBe(true);
    expect(canUploadPhotoProof("ready")).toBe(false);
    expect(validateProofPhotoFile({ mimeType: "image/jpeg", fileSize: maxProofPhotoBytes })).toEqual([]);
    expect(validateProofPhotoFile({ mimeType: "image/gif", fileSize: maxProofPhotoBytes + 1 })).toEqual([
      "Choose a JPG, PNG, or WebP photo.",
      "Photo must be 5 MB or smaller."
    ]);
    expect(validatePhotoProofInput("ready", { note: "", areaPlaceName: "", mimeType: "image/png", fileSize: 100 })).toEqual([
      "Upload Photo Proof is allowed only when work is Running or On Break.",
      "Area or Place Name is required.",
      "What happened? is required."
    ]);
    expect(Object.values(businessLabels.driver)).toEqual(expect.arrayContaining([
      "Upload Photo Proof",
      "Area or Place Name",
      "What happened?",
      "Submit Proof",
      "Proof Sent"
    ]));
  });

  it("creates private proof photo storage and driver upload RPCs", () => {
    const lowerSql = m7Migration.toLowerCase();

    expect(m7Migration).toContain("insert into storage.buckets");
    expect(m7Migration).toContain("'proof-photos', 'proof-photos', false, 5242880");
    expect(m7Migration).toContain("array['image/jpeg', 'image/png', 'image/webp']");
    expect(m7Migration).toContain("create or replace function public.request_driver_proof_upload");
    expect(m7Migration).toContain("create or replace function public.complete_driver_proof_upload");
    expect(m7Migration).toContain("grant execute on function public.request_driver_proof_upload(text, text, uuid, text, text, text, text, integer) to anon");
    expect(m7Migration).toContain("grant execute on function public.complete_driver_proof_upload(text, text, uuid) to anon");
    expect(m7Migration).toContain("public.m6_normalize_mobile(driver_record.phone) = public.m6_normalize_mobile(p_mobile)");
    expect(m7Migration).toContain("aw.execution_release_status = 'released_to_driver'");
    expect(m7Migration).toContain("v_assignment.status <> 'ready_for_execution'");
    expect(m7Migration).toContain("v_day.work_date <> current_date");
    expect(m7Migration).toContain("v_day.execution_status not in ('running', 'on_break')");
    expect(m7Migration).toContain("from storage.objects object_row");
    expect(m7Migration).toContain("object_row.bucket_id = v_proof.file_bucket");
    expect(m7Migration).toContain("object_row.name = v_proof.file_path");
    expect(m7Migration).toContain("Proof photo was not uploaded");
    expect(lowerSql).toContain("security definer");
    expect(lowerSql).toContain("set search_path = public");
  });

  it("keeps proof upload records and storage access admin-only after upload", () => {
    const lowerSql = m7Migration.toLowerCase();

    expect(lowerSql).toContain("alter table public.proof_uploads enable row level security");
    expect(lowerSql).toContain("revoke all on public.proof_uploads from anon");
    expect(lowerSql).toContain("create policy \"admin users can read proof photo objects\"");
    expect(lowerSql).toContain("for select");
    expect(lowerSql).toContain("to authenticated");
    expect(lowerSql).toContain("bucket_id = 'proof-photos' and public.is_admin()");
    expect(lowerSql).toContain("create policy \"validated driver app can upload proof photos\"");
    expect(lowerSql).toContain("for insert");
    expect(lowerSql).toContain("to anon");
    expect(lowerSql).toContain("public.is_valid_proof_upload_path(bucket_id, name)");
    expect(lowerSql).toContain("join public.ad_work_days day_record on day_record.id = proof.ad_work_day_id");
    expect(lowerSql).toContain("day_record.work_date = current_date");
    expect(lowerSql).toContain("day_record.execution_status in ('running', 'on_break')");
    expect(m7Migration).not.toMatch(/for select\s+to anon/i);
    expect(m7Migration).not.toMatch(/public\s*=\s*true/i);
  });

  it("adds admin proof review and manual Customer Update sharing", () => {
    expect(m7Migration).toContain("create or replace function public.review_proof_upload");
    expect(m7Migration).toContain("create or replace function public.mark_customer_update_shared");
    expect(m7Migration).toContain("if not public.is_admin() then");
    expect(m7Migration).toContain("p_sharing_method not in ('phone_call', 'manual_whatsapp', 'manual_sms', 'in_person', 'other')");
    expect(m7Migration).toContain("Photo proof was added for");
    expect(m7Migration).toContain("Proof from");
    expect(m7Migration).toContain("sharing_status = 'shared_manually'");
    expect(webAdminSource).toContain("Proof Uploads and Customer Updates");
    expect(webAdminSource).toContain("fetchProofPhotoSignedUrl");
    expect(webAdminSource).toContain("review_proof_upload");
    expect(webAdminSource).toContain("mark_customer_update_shared");
    expect(webAdminSource).toContain("businessLabels.admin.copyMessage");
    expect(webAdminSource).toContain("businessLabels.admin.markAsShared");
    expect(Object.values(businessLabels.admin)).toEqual(expect.arrayContaining(["Proof Uploads", "Copy Message", "Mark as Shared", "Customer Update"]));
  });

  it("adds driver photo proof upload without camera, audio, GPS, or maps", () => {
    const source = (driverAppSource + "\n" + webAdminSource + "\n" + packageJson + "\n" + webPackageJson + "\n" + driverPackageJson + "\n" + m7Migration).toLowerCase();

    expect(driverPackageJson).toContain("expo-image-picker");
    expect(driverAppSource).toContain("requestMediaLibraryPermissionsAsync");
    expect(driverAppSource).toContain("launchImageLibraryAsync");
    expect(driverAppSource).not.toContain("launchCameraAsync");
    expect(driverAppSource).toContain("request_driver_proof_upload");
    expect(driverAppSource).toContain("complete_driver_proof_upload");
    expect(driverAppSource).toContain("/storage/v1/object/");
    expect(driverConfig).toContain("android.permission.READ_MEDIA_IMAGES");
    expect(driverConfig).not.toContain("ACCESS_COARSE_LOCATION");
    expect(driverConfig).not.toContain("ACCESS_BACKGROUND_LOCATION");
    expect(driverConfig).not.toContain("CAMERA");
    expect(driverConfig).not.toContain("RECORD_AUDIO");
    expect(source).not.toContain("maps.googleapis");
    expect(source).not.toContain("google maps");
    expect(source).not.toContain("mapbox");
    expect(source).not.toContain("leaflet");
    expect(source).not.toContain("expo-camera");
    expect(source).not.toContain("expo-av");
  });

  it("does not add provider sending, reports, payments, customer apps, iOS, or PWA", () => {
    const source = (driverAppSource + "\n" + webAdminSource + "\n" + packageJson + "\n" + webPackageJson + "\n" + driverPackageJson + "\n" + m7Migration).toLowerCase();

    expect(source).not.toContain("stripe");
    expect(source).not.toContain("razorpay");
    expect(source).not.toContain("cashfree");
    expect(source).not.toContain("twilio");
    expect(source).not.toContain("whatsapp business");
    expect(source).not.toContain("sms provider");
    expect(source).not.toMatch(/href=["'][^"']*live/);
    expect(source).not.toContain("public_token");
    expect(source).not.toContain("report_snapshot");
    expect(existsSync(path.resolve("apps/customer"))).toBe(false);
    expect(existsSync(path.resolve("apps/web/public/manifest.webmanifest"))).toBe(false);
    expect(existsSync(path.resolve("apps/web/src/service-worker.ts"))).toBe(false);
    expect(existsSync(path.resolve("apps/driver/ios"))).toBe(false);
  });

  it("keeps secrets and live tracking disabled by default", () => {
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

  it("marks M7 and M8 complete", () => {
    expect(tasks).toMatch(/## Milestone M6 - Ad Work Execution Without GPS[\s\S]*- \[x\]/);
    expect(tasks).toMatch(/## Milestone M7 - Proof Upload and Customer Update Sharing[\s\S]*- \[x\]/);
    expect(tasks).toMatch(/## Milestone M8 - Final Proof Summary and Campaign Closure[\s\S]*- \[x\]/);
  });
});
