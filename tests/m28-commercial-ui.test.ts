import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("apps/web/src/admin-commercial.tsx", "utf8");
const adminSource = readFileSync("apps/web/src/admin.tsx", "utf8");

describe("M28 Commercial & Schedule admin request fencing", () => {
  it("uses sanctioned RPCs only for the new workbench", () => {
    for (const rpc of [
      "admin_get_commercial_schedule_v1",
      "admin_update_ad_work_payment_v1",
      "admin_reschedule_ad_work_v1",
      "admin_reschedule_ad_work_day_v1",
      "admin_cancel_ad_work_v1",
    ]) expect(source).toContain(rpc);
    expect(source).not.toMatch(/rest\/v1\/(ad_works|ad_work_days|ad_work_commercial_events|ad_work_schedule_events)/);
  });

  it("fences stale responses by request sequence, selected work and exact version fingerprint", () => {
    expect(source).toContain("requestSequence");
    expect(source).toContain("selectedAdWorkRef");
    expect(source).toContain("commercialScheduleFingerprint");
    expect(source).toContain("expectedFingerprint !== snapshotFingerprint");
    expect(source).toContain("requestId !== requestSequence.current");
  });

  it("fails closed on expired admin sessions", () => {
    expect(source).toContain("kootha:admin-session-expired");
    expect(source).toContain("response.status === 401 || response.status === 403");
  });

  it("requires explicit cancellation confirmation and keeps customer copy separate from internal note", () => {
    expect(source).toContain("window.confirm");
    expect(source).toContain("Internal note (never copied to customer)");
    expect(source).toContain("customerMessage");
    expect(source).not.toContain("commercialNote.trim() || cancellationInternalNote");
  });

  it("is wired as a modular admin surface", () => {
    expect(adminSource).toContain('from "./admin-commercial"');
    expect(adminSource).toContain('id: "commercial"');
    expect(adminSource).toContain('activeView === "commercial"');
    expect(adminSource).toContain("CommercialScheduleWorkbench");
    expect(adminSource).toContain("Commercial and schedule operations");
    expect(adminSource).toContain("Track payment status and perform governed cancellation or rescheduling");
  });

  it("routes legacy planning chronology through the versioned M28 authority", () => {
    expect(adminSource).toContain('"schedule_version"');
    expect(adminSource).toContain("admin_sync_ad_work_days_v2");
    expect(adminSource).toContain("admin_update_ad_work_days_v2");
    expect(adminSource).toContain("selectedAdWork.schedule_version");
    const workUpdate = adminSource.match(/async function updateAdminAdWork[\s\S]*?async function syncAdWorkDays/)?.[0] ?? "";
    expect(workUpdate).not.toContain("start_date:");
    expect(workUpdate).not.toContain("end_date:");
    expect(workUpdate).not.toContain("number_of_days:");
    expect(workUpdate).not.toContain("planning_status:");
    expect(adminSource).not.toContain('rest/v1/ad_work_days?id=eq.');
    expect(workUpdate).not.toContain("areas_to_cover:");
  });

});
