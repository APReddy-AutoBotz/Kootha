import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("M26 evidence repository lock closure", () => {
  const migration = readFileSync(
    "supabase/migrations/20260814080000_m26_evidence_repository_lock_closure.sql",
    "utf8",
  );

  it("keeps exact evidence replay before mutable authority", () => {
    const receipt = migration.indexOf("pg_advisory_xact_lock(hashtext(p_receipt_id::text))");
    const replayRead = migration.indexOf("select * into e from public.physical_pilot_evidence_receipts", receipt);
    const replayReturn = migration.indexOf("return e.id", replayRead);
    const device = migration.indexOf("m26_lock_device_authority_v1(p_device_id)", replayReturn);
    expect(receipt).toBeGreaterThan(-1);
    expect(replayRead).toBeGreaterThan(receipt);
    expect(replayReturn).toBeGreaterThan(replayRead);
    expect(device).toBeGreaterThan(replayReturn);
  });

  it("locks device then repository before current authority reads", () => {
    const device = migration.indexOf("m26_lock_device_authority_v1(p_device_id)");
    const repository = migration.indexOf("pg_advisory_xact_lock(hashtext('m26_repository_authority'))", device);
    const commissioning = migration.indexOf("physical_pilot_commissioning where id=p_commissioning_id", repository);
    const repositoryRead = migration.indexOf("physical_pilot_repository_authority", repository);
    const certificationRead = migration.indexOf("m26_current_certification_run_v1", repository);
    expect(device).toBeGreaterThan(-1);
    expect(repository).toBeGreaterThan(device);
    expect(commissioning).toBeGreaterThan(repository);
    expect(repositoryRead).toBeGreaterThan(repository);
    expect(certificationRead).toBeGreaterThan(repository);
  });

  it("retains service-only execution and evidence anti-fake logic", () => {
    expect(migration).toContain("Service authority required");
    expect(migration).toContain("Physical evidence receipt replay conflict");
    expect(migration).toContain("m26_has_authoritative_failure_v1");
    expect(migration).toContain("physical_pilot_evidence_telemetry_receipts");
    expect(migration).toContain("grant execute on function public.service_record_physical_pilot_evidence_v1");
  });
});
