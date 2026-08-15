import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260814020000_m26_observation_chronology_replay_closure.sql",
  "utf8",
);
const pgTap = readFileSync(
  "supabase/tests/m26_observation_chronology_replay.test.sql",
  "utf8",
);

describe("M26 exact-head review closure", () => {
  it("orders readiness by physical observation chronology before receipt arrival", () => {
    const physicalSelection = migration.slice(
      migration.indexOf("-- Physical observation chronology is authoritative"),
      migration.indexOf("if e_latest.id is null then"),
    );
    const ended = physicalSelection.indexOf("e.observation_ended_at desc");
    const started = physicalSelection.indexOf("e.observation_started_at desc");
    const recorded = physicalSelection.indexOf("e.recorded_at desc");
    expect(ended).toBeGreaterThan(-1);
    expect(started).toBeGreaterThan(ended);
    expect(recorded).toBeGreaterThan(started);
    expect(physicalSelection).toContain("and e.classification='physical'");
  });

  it("distinguishes a requested JSON null from the retained effective selector", () => {
    expect(migration).toContain("safe_receipt ? 'requested_network_configuration_class'");
    expect(migration).toContain("safe_receipt ? 'requested_expected_heartbeat_seconds'");
    expect(migration).toContain("then v_receipt.safe_receipt->>'requested_network_configuration_class'");
    expect(migration).toContain("then v_receipt.safe_receipt->>'requested_expected_heartbeat_seconds'");
    expect(migration).not.toContain("coalesce(\n            v_receipt.safe_receipt->>'requested_network_configuration_class'");
  });

  it("executes both review regressions in pgTAP", () => {
    expect(pgTap).toContain("exact state-only replay with null selectors returns the immutable receipt");
    expect(pgTap).toContain("fixture proves observation chronology and receipt arrival chronology disagree");
    expect(pgTap).toContain("physically newer blocked run outranks a later-arriving older partial run");
    expect(pgTap).toContain("receipt arrival order cannot replace physical-run chronology");
  });
});
