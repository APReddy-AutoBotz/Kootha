import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260814090000_m26_commissioning_certification_lock_closure.sql",
  "utf8",
);

describe("M26 commissioning certification lock closure", () => {
  it("preserves receipt-first replay before mutable authority locks", () => {
    const replay = migration.indexOf("where transition_key=p_transition_key");
    const device = migration.indexOf("m26_lock_device_authority_v1(p_device_id)");
    expect(replay).toBeGreaterThan(-1);
    expect(device).toBeGreaterThan(replay);
  });

  it("uses device then repository authority before certification and commissioning reads", () => {
    const device = migration.indexOf("m26_lock_device_authority_v1(p_device_id)");
    const repository = migration.indexOf("pg_advisory_xact_lock(hashtext('m26_repository_authority'))", device);
    const candidate = migration.indexOf("select * into v_candidate", repository);
    const certification = migration.indexOf("m26_current_certification_run_v1(p_candidate_id,p_manifest_id)", repository);
    const commissioning = migration.indexOf("where gps_device_id=p_device_id", certification);
    expect(device).toBeGreaterThan(-1);
    expect(repository).toBeGreaterThan(device);
    expect(candidate).toBeGreaterThan(repository);
    expect(certification).toBeGreaterThan(repository);
    expect(commissioning).toBeGreaterThan(certification);
  });
});
