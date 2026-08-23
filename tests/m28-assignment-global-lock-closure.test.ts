import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationSource = readFileSync(
  "supabase/migrations/20260822113000_m28_assignment_global_lock_closure.sql",
  "utf8",
).replace(/\r\n/g, "\n");
const legacyAssignmentClosureSource = readFileSync(
  "supabase/migrations/20260822114500_m28_legacy_assignment_authority_closure.sql",
  "utf8",
).replace(/\r\n/g, "\n");

describe("M28 assignment and global authority-lock closure", () => {
  it("uses the canonical M21 authority lock for every M28 replay claim before authority rows", () => {
    const lockAt = migrationSource.indexOf("m21-authority-global");
    const workLookupAt = migrationSource.indexOf("if not exists (select 1 from public.ad_works");

    expect(lockAt).toBeGreaterThan(0);
    expect(workLookupAt).toBeGreaterThan(lockAt);
    expect(migrationSource).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(migrationSource).toContain("pg_catalog.hashtextextended('m21-authority-global', 2100)");
    expect(migrationSource).not.toContain("if p_mutation_type = 'cancel' then");
  });

  it("preserves established replay conflict contracts", () => {
    expect(migrationSource).toContain("if p_mutation_type = 'payment_update' then");
    expect(migrationSource).toContain("Commercial record changed; refresh and retry");
    expect(migrationSource).toContain("Schedule changed; refresh and retry");
    expect(migrationSource).toContain("for update;");
  });

  it("database-fences assignment writes once parent cancellation is authoritative", () => {
    expect(migrationSource).toContain("create or replace function public.m28_guard_cancelled_assignment_write_v1()");
    expect(migrationSource).toContain("aw.planning_status = 'cancelled'");
    expect(migrationSource).toContain("aw.assignment_status = 'cancelled'");
    expect(migrationSource).toContain("aw.execution_overall_status = 'cancelled'");
    expect(migrationSource).toContain("aw.cancelled_at is not null");
    expect(migrationSource).toContain("Cancelled Ad Work assignments are immutable outside governed cancellation authority");
    expect(migrationSource).toContain("before insert or update on public.ad_work_assignments");
  });

  it("keeps the retained assignment RPC on the same M21 lock-before-row order", () => {
    const lockAt = legacyAssignmentClosureSource.indexOf("m21-authority-global");
    const parentLockAt = legacyAssignmentClosureSource.indexOf(
      "from public.ad_works\n  where id = p_ad_work_id\n  for update;",
    );

    expect(lockAt).toBeGreaterThan(0);
    expect(parentLockAt).toBeGreaterThan(lockAt);
    expect(legacyAssignmentClosureSource).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(legacyAssignmentClosureSource).toContain(
      "pg_catalog.hashtextextended('m21-authority-global', 2100)",
    );
  });

  it("uses the named assignment uniqueness constraint so RETURNS TABLE output names cannot make the upsert ambiguous", () => {
    expect(legacyAssignmentClosureSource).toContain(
      "on conflict on constraint ad_work_assignments_ad_work_id_key do update",
    );
    expect(legacyAssignmentClosureSource).not.toContain("on conflict (ad_work_id) do update");
  });
});
