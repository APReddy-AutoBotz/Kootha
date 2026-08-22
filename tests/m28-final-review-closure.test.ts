import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const guardMigration = readFileSync(
  "supabase/migrations/20260822090000_m28_day_status_history_ui_closure.sql",
  "utf8",
);
const sharedSource = readFileSync("packages/shared/src/commercialSchedule.ts", "utf8");
const workbenchSource = readFileSync("apps/web/src/admin-commercial.tsx", "utf8");

describe("M28 final review closure", () => {
  it("guards canonical day status behind governed schedule authority", () => {
    expect(guardMigration).toContain("row(new.status, new.work_date");
    expect(guardMigration).toContain("row(old.status, old.work_date");
    expect(guardMigration).toContain("Work-day schedule fields must be changed through governed M28 authority");
  });

  it("preserves bounded commercial-history metadata in the shared contract", () => {
    expect(sharedSource).toContain("export type CommercialEventPageMetadata");
    expect(sharedSource).toContain("commercialEventsPage: CommercialEventPageMetadata");
    expect(sharedSource).toContain("validateCommercialHistoryPage");
    expect(sharedSource).toContain("value.events.length === value.page.returned");
  });

  it("exposes older commercial history through the bounded cursor RPC", () => {
    expect(workbenchSource).toContain("admin_list_ad_work_commercial_events_v1");
    expect(workbenchSource).toContain("p_before_version: beforeVersion");
    expect(workbenchSource).toContain("p_limit: 20");
    expect(workbenchSource).toContain("Older entries are available.");
    expect(workbenchSource).toContain("Load older history");
  });
});
