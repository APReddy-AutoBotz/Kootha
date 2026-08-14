import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260814030000_m26_tied_observation_failure_dominance.sql",
  "utf8",
);

describe("M26 tied physical observation authority", () => {
  it("rejects contradictory physical receipts for identical authority and observation bounds", () => {
    expect(migration).toContain(
      "create unique index physical_pilot_evidence_physical_window_authority_unique",
    );
    for (const binding of [
      "commissioning_id",
      "commissioning_version",
      "selected_candidate_id",
      "certification_run_id",
      "repository_authority_generation",
      "manifest_id",
      "gps_device_id",
      "installation_receipt_id",
      "vehicle_link_id",
      "credential_id",
      "network_validation_receipt_id",
      "observation_started_at",
      "observation_ended_at",
    ]) {
      expect(migration).toContain(binding);
    }
    expect(migration).toContain("where classification = 'physical'");
    expect(migration).not.toContain("disposition,");
  });
});
