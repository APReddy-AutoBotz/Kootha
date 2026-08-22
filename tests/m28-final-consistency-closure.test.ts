import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const commercialWorkbench = readFileSync("apps/web/src/admin-commercial.tsx", "utf8");
const legacyAdmin = readFileSync("apps/web/src/admin.tsx", "utf8");
const webIndex = readFileSync("apps/web/index.html", "utf8");
const legacyScheduleClosureCss = readFileSync(
  "apps/web/public/m28-legacy-schedule-closure.css",
  "utf8",
);
const finalClosureMigration = readFileSync(
  "supabase/migrations/20260822133000_m28_final_closure_lock_order_closure.sql",
  "utf8",
);

describe("M28 final consistency closures", () => {
  it("serializes final-summary closure before parent row authority", () => {
    const advisory = finalClosureMigration.indexOf("pg_advisory_xact_lock");
    const firstRowLock = finalClosureMigration.toLowerCase().indexOf("for update");
    expect(advisory).toBeGreaterThan(-1);
    expect(firstRowLock).toBeGreaterThan(advisory);
    expect(finalClosureMigration).toContain("prepare_flexible_final_proof_summary");
    expect(finalClosureMigration).toContain("update public.final_proof_summaries");
  });

  it("prevents Ad Work switching while authoritative Commercial/Schedule work is busy", () => {
    expect(commercialWorkbench).toContain(
      '<select value={selectedAdWorkId} disabled={busy} onChange={(event) => setSelectedAdWorkId(event.target.value)}>',
    );
    expect(commercialWorkbench).toContain("async function runMutation(rpc: string, body: Record<string, unknown>): Promise<boolean>");
    expect(commercialWorkbench).toContain('if (saved) {\n      setDayReason("");\n      setNewDayDate("");');
  });

  it("removes the stale legacy End-date editor without restoring direct schedule authority", () => {
    expect(webIndex).toContain('<link rel="stylesheet" href="/m28-legacy-schedule-closure.css" />');
    expect(legacyScheduleClosureCss).toContain(
      '.form-section[aria-labelledby="schedule-title"] > .form-grid > label:nth-child(2)',
    );
    expect(legacyScheduleClosureCss).toContain("display: none;");
    expect(legacyScheduleClosureCss).toContain("silently ignored on save");

    expect(legacyAdmin).toContain("getPlannedEndDate(value, current.numberOfDays)");
    expect(legacyAdmin).toContain("getPlannedEndDate(current.startDate, nextDays)");

    const directUpdateStart = legacyAdmin.indexOf("async function updateAdminAdWork(");
    const governedScheduleStart = legacyAdmin.indexOf("async function syncAdWorkDays(", directUpdateStart);
    const directUpdateSource = legacyAdmin.slice(directUpdateStart, governedScheduleStart);
    expect(directUpdateSource).not.toContain("start_date");
    expect(directUpdateSource).not.toContain("end_date");
    expect(legacyAdmin).toContain('"/rest/v1/rpc/admin_sync_ad_work_days_v2"');
  });
});
