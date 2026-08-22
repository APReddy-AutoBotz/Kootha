import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationSource = readFileSync(
  "supabase/migrations/20260822094500_m28_cancellation_lifecycle_authority_closure.sql",
  "utf8",
);

describe("M28 cancellation lifecycle authority closure", () => {
  it("removes direct authenticated lifecycle PATCH authority from canonical Ad Work columns", () => {
    expect(migrationSource).toContain("new.status");
    expect(migrationSource).toContain("new.assignment_status");
    expect(migrationSource).toContain("new.execution_release_status");
    expect(migrationSource).toContain("new.execution_overall_status");
    expect(migrationSource).toContain("new.closure_status");
    expect(migrationSource).toContain("current_user = 'authenticated'");
    expect(migrationSource).toContain("Ad Work lifecycle fields must be changed through governed authority");
  });

  it("makes a governed whole-work cancellation immutable to older lifecycle authorities", () => {
    expect(migrationSource).toContain("v_old_cancelled");
    expect(migrationSource).toContain("old.cancelled_at is not null");
    expect(migrationSource).toContain("Cancelled Ad Work lifecycle is immutable outside governed cancellation authority");
    expect(migrationSource).toContain("new.status = 'cancelled'");
    expect(migrationSource).toContain("new.execution_overall_status = 'cancelled'");
    expect(migrationSource).toContain("new.closure_status = 'cancelled'");
    expect(migrationSource).toContain("Whole-work cancellation must use governed M28 authority");
  });
});
