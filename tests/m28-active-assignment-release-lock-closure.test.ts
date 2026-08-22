import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260822120000_m28_active_assignment_release_lock_closure.sql",
  "utf8",
);

function functionSlice(name: string, nextMarker: string) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  const end = migration.indexOf(nextMarker, start);
  return migration.slice(start, end);
}

describe("M28 active assignment/release authority closure", () => {
  it("serializes the actual Admin assignment RPC before its first parent row lock", () => {
    const source = functionSlice(
      "save_ad_work_assignment",
      "revoke all on function public.save_ad_work_assignment",
    );
    expect(source).toContain("m21-authority-global");
    expect(source).toContain("pg_advisory_xact_lock");
    expect(source.indexOf("pg_advisory_xact_lock")).toBeLessThan(
      source.indexOf("select * into v_ad_work"),
    );
    expect(source).toContain(
      "on conflict on constraint ad_work_assignments_ad_work_id_key do update",
    );
  });

  it("serializes the actual Admin release RPC before its first parent row lock", () => {
    const source = functionSlice(
      "release_flexible_ad_work_to_driver",
      "revoke all on function public.release_flexible_ad_work_to_driver",
    );
    expect(source).toContain("m21-authority-global");
    expect(source).toContain("pg_advisory_xact_lock");
    expect(source.indexOf("pg_advisory_xact_lock")).toBeLessThan(
      source.indexOf("select * into v_ad_work"),
    );
    expect(source).toContain("execution_release_status = 'released_to_driver'");
    expect(source).toContain("execution_release_status = 'access_revoked'");
  });

  it("distinguishes assignment-only cancellation from whole-work cancellation", () => {
    const source = functionSlice(
      "m28_guard_cancelled_assignment_write_v1",
      "revoke all on function public.m28_guard_cancelled_assignment_write_v1",
    );
    expect(source).not.toContain("aw.assignment_status = 'cancelled'");
    expect(source).toContain("aw.planning_status = 'cancelled'");
    expect(source).toContain("aw.status = 'cancelled'");
    expect(source).toContain("aw.execution_overall_status = 'cancelled'");
    expect(source).toContain("aw.closure_status = 'cancelled'");
    expect(source).toContain("aw.cancelled_at is not null");
    expect(source).toContain("aw.cancellation_reason is not null");
  });
});
