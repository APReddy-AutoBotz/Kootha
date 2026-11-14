import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { validatePhotoProofInput } from "@kootha/shared";

// Fixes from the 14 Nov 2026 phone test. See docs/pilot/m30-real-device-results-2026-11-14.md.
const driverAppSource = readFileSync(path.resolve("apps/driver/App.tsx"), "utf8");
const webAdminSource = readFileSync(path.resolve("apps/web/src/admin.tsx"), "utf8");
const offlineSyncedMigration = readFileSync(
  path.resolve("supabase/migrations/20261114120000_m30_offline_synced_location_points.sql"),
  "utf8"
);

describe("M30 phone test fixes", () => {
  it("lets the admin choose a package on the Ad Work form", () => {
    expect(webAdminSource).toContain("updateAdWorkDraft(\"packageInterest\"");
  });

  it("captures location with GPS and never drops a missing fix silently", () => {
    expect(driverAppSource).toContain("Location.Accuracy.High");
    expect(driverAppSource).not.toContain("Location.Accuracy.Balanced");
    expect(driverAppSource).toContain("if (locationFix.timedOut || !bufferedPoint) {");
  });

  it("marks only buffered points as offline synced", () => {
    expect(offlineSyncedMigration).toContain("create or replace function public.driver_sync_mobile_location_points(");
    expect(offlineSyncedMigration).toMatch(/quality,\s+offline_synced\s+\) values \(/);
    expect(offlineSyncedMigration).toMatch(/v_quality,\s+true\s+\) on conflict do nothing/);
    expect(webAdminSource).toContain("points.filter((point) => point.offline_synced).length");
    expect(webAdminSource).not.toContain("points.filter((point) => Boolean(point.client_point_id)).length");
  });

  it("counts work with a photo waiting review on the dashboard", () => {
    expect(webAdminSource).toContain("review_status=eq.waiting_review");
    expect(webAdminSource).toContain("value: proofReviewWork.length");
  });

  it("shows drivers plain messages", () => {
    expect(driverAppSource).toContain("No internet connection. Check mobile data or Wi-Fi and try again.");
    expect(driverAppSource).not.toMatch(/error instanceof Error \? error\.message : "/);
    expect(driverAppSource).toContain("await refreshAssignedWork().catch(() => undefined);\n      setWorkMessage(driverLabels.proofSent");
  });

  it("names the proof note field in its error", () => {
    const errors = validatePhotoProofInput("running", {
      areaPlaceName: "Fake Main Road",
      note: "",
      mimeType: "image/png",
      fileSize: 1000
    });
    expect(errors).toContain("Proof note is required. Write what was done.");
  });
});
