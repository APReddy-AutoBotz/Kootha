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
  });
});
