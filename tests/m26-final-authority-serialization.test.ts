import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const closure = readFileSync(
  "supabase/migrations/20260814020000_m26_observation_chronology_replay_closure.sql",
  "utf8",
);
const foundation = readFileSync(
  "supabase/migrations/20260811010000_m26_pre_device_commissioning_readiness.sql",
  "utf8",
);

describe("M26 final authority serialization", () => {
  it("serializes real commissioning mutations after exact replay handling", () => {
    const transition = closure.slice(
      closure.indexOf("admin_transition_physical_pilot_commissioning_v1"),
      closure.indexOf("admin_get_physical_pilot_readiness_v1"),
    );
    const replay = transition.indexOf("if v_receipt.id is not null");
    const deviceLock = transition.indexOf("m26_lock_device_authority_v1(p_device_id)");
    const mutableRead = transition.indexOf("select * into v_candidate");
    expect(replay).toBeGreaterThan(-1);
    expect(deviceLock).toBeGreaterThan(replay);
    expect(mutableRead).toBeGreaterThan(deviceLock);
  });

  it("serializes repository rotation with readiness before repository state is read", () => {
    const readiness = closure.slice(closure.indexOf("admin_get_physical_pilot_readiness_v1"));
    const deviceLock = readiness.indexOf("m26_lock_device_authority_v1(p_device_id)");
    const repoLock = readiness.indexOf("pg_advisory_xact_lock(hashtext('m26_repository_authority'))");
    const repoRead = readiness.indexOf("select * into r");
    expect(deviceLock).toBeGreaterThan(-1);
    expect(repoLock).toBeGreaterThan(deviceLock);
    expect(repoRead).toBeGreaterThan(repoLock);
    expect(foundation).toContain("pg_advisory_xact_lock(hashtext('m26_repository_authority'))");
  });
});
