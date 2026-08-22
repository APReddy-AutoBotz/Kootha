import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260822121500_m28_release_rpc_ambiguity_closure.sql",
  "utf8",
);

describe("M28 active release RPC ambiguity closure", () => {
  it("retains the M21 lock before the parent row", () => {
    expect(migration).toContain("m21-authority-global");
    expect(migration.indexOf("pg_advisory_xact_lock")).toBeLessThan(
      migration.indexOf("select * into v_ad_work"),
    );
  });

  it("qualifies work-day authority columns that collide with RETURNS TABLE output names", () => {
    expect(migration).toContain("update public.ad_work_days as day_row");
    expect(migration).toContain("where day_row.ad_work_id = p_ad_work_id");
    expect(migration).toContain("and day_row.execution_status = 'planned'");
    expect(migration).not.toContain("where ad_work_id = p_ad_work_id\n    and execution_status = 'planned'");
  });
});
