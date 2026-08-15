import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("M26 network validation lock-order closure", () => {
  const migration = readFileSync(
    "supabase/migrations/20260814070000_m26_network_validation_lock_order_closure.sql",
    "utf8",
  );

  it("preserves receipt-first replay before mutable authority locks", () => {
    const replay = migration.indexOf("select * into n");
    const device = migration.indexOf("m26_lock_device_authority_v1(p_device_id)");
    expect(replay).toBeGreaterThan(-1);
    expect(device).toBeGreaterThan(replay);
    expect(migration.indexOf("return n.id", replay)).toBeLessThan(device);
  });

  it("uses device then repository before commissioning row lock", () => {
    const device = migration.indexOf("m26_lock_device_authority_v1(p_device_id)");
    const repository = migration.indexOf("pg_advisory_xact_lock(hashtext('m26_repository_authority'))", device);
    const commissioningRow = migration.indexOf("where id=p_commissioning_id", repository);
    const rowLock = migration.indexOf("for update", commissioningRow);
    expect(device).toBeGreaterThan(-1);
    expect(repository).toBeGreaterThan(device);
    expect(commissioningRow).toBeGreaterThan(repository);
    expect(rowLock).toBeGreaterThan(commissioningRow);
  });

  it("retains service-only execution and current-authority checks", () => {
    expect(migration).toContain("Service authority required");
    expect(migration).toContain("m26_current_certification_run_v1");
    expect(migration).toContain("Network validation is not bound to current authority");
    expect(migration).toContain("grant execute on function public.service_record_physical_pilot_network_validation_v1");
  });
});
