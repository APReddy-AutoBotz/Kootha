import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260822124500_m28_driver_execution_lock_closure.sql",
  "utf8",
);

describe("M28 driver execution lock closure", () => {
  it("authenticates before locking, then serializes before the day row lock", () => {
    const firstAuth = migration.indexOf("select aw.* into v_ad_work");
    const lock = migration.indexOf("pg_advisory_xact_lock");
    const secondAuth = migration.indexOf("select aw.* into v_ad_work", firstAuth + 1);
    const dayLock = migration.indexOf("select day_row.* into v_day");

    expect(firstAuth).toBeGreaterThan(0);
    expect(lock).toBeGreaterThan(firstAuth);
    expect(secondAuth).toBeGreaterThan(lock);
    expect(dayLock).toBeGreaterThan(secondAuth);
    expect(migration).toContain("m21-authority-global");
    expect(migration.indexOf("pg_advisory_xact_lock")).toBeLessThan(
      migration.indexOf("for update;"),
    );
  });

  it("revalidates released work-code/mobile authority after acquiring the global lock", () => {
    expect((migration.match(/execution_release_status = 'released_to_driver'/g) ?? [])).toHaveLength(2);
    expect((migration.match(/m6_hash_work_code\(p_work_code\)/g) ?? [])).toHaveLength(2);
    expect((migration.match(/m6_normalize_mobile\(driver_record\.phone\)/g) ?? [])).toHaveLength(2);
  });

  it("keeps final-day completion predicates qualified against RETURNS TABLE output names", () => {
    expect(migration).toContain("from public.ad_work_days other_day");
    expect(migration).toContain("other_day.ad_work_id = v_ad_work.id");
    expect(migration).toContain("other_day.execution_status <> 'completed'");
  });
});
