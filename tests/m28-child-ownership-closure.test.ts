import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260822123000_m28_child_ownership_closure.sql",
  "utf8",
).replace(/\r\n/g, "\n");

function slice(name: string, next: string) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  const end = migration.indexOf(next, start);
  return migration.slice(start, end);
}

describe("M28 child ownership closure", () => {
  it("makes assignment parent identity immutable before cancellation lookup", () => {
    const source = slice(
      "m28_guard_cancelled_assignment_write_v1",
      "revoke all on function public.m28_guard_cancelled_assignment_write_v1",
    );
    expect(source).toContain("new.ad_work_id is distinct from old.ad_work_id");
    expect(source).toContain("Ad Work assignment ownership is immutable");
    expect(source.indexOf("new.ad_work_id is distinct from old.ad_work_id")).toBeLessThan(
      source.indexOf("select\n    aw.planning_status"),
    );
  });

  it("makes work-day parent identity immutable even inside governed schedule writes", () => {
    const source = slice(
      "m28_guard_day_schedule_write_v1",
      "revoke all on function public.m28_guard_day_schedule_write_v1",
    );
    expect(source).toContain("new.ad_work_id is distinct from old.ad_work_id");
    expect(source).toContain("Ad Work day ownership is immutable");
    expect(source.indexOf("new.ad_work_id is distinct from old.ad_work_id")).toBeLessThan(
      source.indexOf("v_execution_changed :="),
    );
    expect(source).toContain("app.m28_schedule_write");
  });
});
