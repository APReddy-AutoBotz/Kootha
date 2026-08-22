import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationSource = readFileSync(
  "supabase/migrations/20260822102000_m28_cancelled_day_and_lock_order_closure.sql",
  "utf8",
);

describe("M28 cancelled-day and telemetry lock-order closure", () => {
  it("takes M21 global authority before cancellation can touch Ad Work/session authority", () => {
    const lockAt = migrationSource.indexOf("m21-authority-global");
    const workLookupAt = migrationSource.indexOf("if not exists (select 1 from public.ad_works");
    expect(lockAt).toBeGreaterThan(0);
    expect(workLookupAt).toBeGreaterThan(lockAt);
    expect(migrationSource).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(migrationSource).toContain("pg_catalog.hashtextextended('m21-authority-global', 2100)");
  });

  it("freezes execution state and evidence metadata after governed parent cancellation", () => {
    expect(migrationSource).toContain("new.execution_status");
    expect(migrationSource).toContain("new.execution_started_at");
    expect(migrationSource).toContain("new.execution_completed_at");
    expect(migrationSource).toContain("new.completion_note");
    expect(migrationSource).toContain("new.issue_note");
    expect(migrationSource).toContain("new.driver_id");
    expect(migrationSource).toContain("new.vehicle_id");
    expect(migrationSource).toContain("aw.execution_overall_status = 'cancelled'");
    expect(migrationSource).toContain("aw.cancelled_at is not null");
    expect(migrationSource).toContain("Cancelled Ad Work day execution state is immutable outside governed cancellation authority");
  });

  it("retains the existing schedule/topology guard in the same trigger", () => {
    expect(migrationSource).toContain("row(new.status, new.work_date, new.planned_start_time, new.planned_end_time");
    expect(migrationSource).toContain("Work-day schedule fields must be changed through governed M28 authority");
  });
});
