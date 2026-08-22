import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const replayClosureSource = readFileSync(
  "supabase/migrations/20260822130000_m28_replay_current_snapshot_closure.sql",
  "utf8",
);
const workbenchSource = readFileSync("apps/web/src/admin-commercial.tsx", "utf8");

describe("M28 replay current-snapshot closure", () => {
  it("keeps replay identity and receipt semantics while rebuilding only the returned snapshot", () => {
    expect(replayClosureSource).toContain("m28_claim_replay_v1");
    expect(replayClosureSource).toContain("pg_advisory_xact_lock");
    expect(replayClosureSource).toContain("hashtextextended('m21-authority-global', 2100)");
    expect(replayClosureSource).toContain("v_current_snapshot := public.m28_build_snapshot_v1(p_ad_work_id);");
    expect(replayClosureSource).toContain("return pg_catalog.jsonb_set(");
    expect(replayClosureSource).toContain("'{snapshot}'::text[]");
    expect(replayClosureSource).not.toContain("update public.m28_mutation_operations");
    expect(replayClosureSource).toContain("Commercial record changed; refresh and retry");
    expect(replayClosureSource).toContain("Schedule changed; refresh and retry");
  });

  it("keeps the Admin workbench bound to the authoritative snapshot returned by a mutation", () => {
    expect(workbenchSource).toContain("const envelope = await postRpc<MutationEnvelope>(connection, rpc, body);");
    expect(workbenchSource).toContain("expectedFingerprint !== snapshotFingerprint");
    expect(workbenchSource).toContain("applySnapshot(envelope.snapshot, requestId, adWorkId)");
    expect(workbenchSource).toContain("validateCommercialScheduleSnapshot(next)");
  });
});
