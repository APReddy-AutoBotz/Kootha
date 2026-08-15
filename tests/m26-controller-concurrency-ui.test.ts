import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const admin = readFileSync("apps/web/src/admin.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20260814040000_m26_telemetry_snapshot_serialization.sql", "utf8");
const truthMigration = readFileSync("supabase/migrations/20260812020000_m26_physical_telemetry_truth_convergence.sql", "utf8");
const acceptance = readFileSync("supabase/tests/m26_commissioning_authority.test.sql", "utf8");

describe("M26 accepted telemetry snapshot serialization", () => {
  it("serializes every telemetry receipt write under the shared device authority lock", () => {
    expect(migration).toContain("drop trigger if exists telemetry_receipts_m26_rejected_serialize");
    expect(migration).toContain("drop function if exists public.m26_serialize_rejected_receipt_authority_v1()");
    expect(migration).toContain("create trigger telemetry_receipts_m26_serialize");
    expect(migration).toContain("before insert or update on public.telemetry_receipts");
    expect(migration).toContain("m26_lock_device_authority_v1(new.gps_device_id)");
    expect(migration.toLowerCase()).not.toContain("when (new.disposition='rejected')");
    expect(truthMigration).toContain("telemetry_identity_conflicts_m26_serialize");
    expect(acceptance).toContain("telemetry_receipts_m26_serialize");
    expect(acceptance).not.toContain("telemetry_receipts_m26_rejected_serialize");
  });
});

describe("M26 commissioning current-device fencing", () => {
  it("binds a transition to the selected device readiness before consuming commissioning data", () => {
    expect(admin).toContain("deviceId: string | null");
    const transition = admin.slice(admin.indexOf("async function transitionCommissioning"), admin.indexOf("function identityBody"));
    const readinessCapture = transition.indexOf("const readiness = physicalReadiness");
    const deviceGuard = transition.indexOf("if (!readiness || readiness.deviceId !== deviceId)");
    const commissioningRead = transition.indexOf("const current = readiness.commissioning");
    expect(readinessCapture).toBeGreaterThan(-1);
    expect(deviceGuard).toBeGreaterThan(readinessCapture);
    expect(commissioningRead).toBeGreaterThan(deviceGuard);
    expect(transition).not.toContain("physicalReadiness?.commissioning");
  });

  it("clears and invalidates stale readiness synchronously when selecting another device", () => {
    const listStart = admin.indexOf('<div className="device-list">');
    const listEnd = admin.indexOf('No devices match these filters.', listStart);
    const deviceList = admin.slice(listStart, listEnd);
    const invalidate = deviceList.indexOf("++readinessRequestSequence.current");
    const clear = deviceList.indexOf("setPhysicalReadiness(null)");
    const select = deviceList.indexOf("setSelectedId(device.id)");
    expect(invalidate).toBeGreaterThan(-1);
    expect(clear).toBeGreaterThan(invalidate);
    expect(select).toBeGreaterThan(clear);
  });
});
