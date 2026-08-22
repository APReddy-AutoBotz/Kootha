import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260822110000_m28_execution_lock_schedule_history_closure.sql", "utf8");
const shared = readFileSync("packages/shared/src/commercialSchedule.ts", "utf8");
const ui = readFileSync("apps/web/src/admin-commercial.tsx", "utf8");

describe("M28 execution lock and schedule-history closure", () => {
  it("serializes legacy admin execution before row locking", () => {
    const fn = migration.slice(migration.indexOf("create or replace function public.admin_update_ad_work_day"), migration.indexOf("revoke all on function public.admin_update_ad_work_day"));
    expect(fn.indexOf("m21-authority-global")).toBeGreaterThan(0);
    expect(fn.indexOf("for update")).toBeGreaterThan(fn.indexOf("m21-authority-global"));
    expect(fn).toContain("pg_catalog.pg_advisory_xact_lock");
  });

  it("bounds schedule history and exposes an admin cursor RPC", () => {
    expect(migration).toContain("recent_schedule");
    expect(migration).toContain("limit 20");
    expect(migration).toContain("'scheduleEventsPage'");
    expect(migration).toContain("admin_list_ad_work_schedule_events_v1");
    expect(migration).toContain("Schedule history page size must be between 1 and 100");
  });

  it("validates and renders request-bound schedule-history pagination", () => {
    expect(shared).toContain("scheduleEventsPage: CommercialEventPageMetadata");
    expect(shared).toContain("validateScheduleHistoryPage");
    expect(ui).toContain("scheduleHistoryEvents");
    expect(ui).toContain("admin_list_ad_work_schedule_events_v1");
    expect(ui).toContain("validateScheduleHistoryPage");
    expect(ui).toContain("expectedFingerprint !== snapshotFingerprint");
    expect(ui).toContain("adWorkId !== selectedAdWorkRef.current");
    expect(ui).toContain("Load older schedule history");
  });
});
