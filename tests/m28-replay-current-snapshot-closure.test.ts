import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const replayClosureSource = readFileSync(
  "supabase/migrations/20260822130000_m28_replay_current_snapshot_closure.sql",
  "utf8",
);
const workbenchSource = readFileSync("apps/web/src/admin-commercial.tsx", "utf8");
const normalizedWorkbenchSource = workbenchSource.replace(/\r\n/g, "\n");

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
    expect(normalizedWorkbenchSource).toContain("const envelope = await postRpc<MutationEnvelope>(connection, rpc, body);");
    expect(normalizedWorkbenchSource).toContain("expectedFingerprint !== snapshotFingerprint");
    expect(normalizedWorkbenchSource).toContain("applySnapshot(envelope.snapshot, requestId, adWorkId)");
    expect(normalizedWorkbenchSource).toContain("validateCommercialScheduleSnapshot(next)");
  });

  it("preserves mutation inputs until a validated authoritative response succeeds", () => {
    expect(normalizedWorkbenchSource).toContain("async function runMutation(rpc: string, body: Record<string, unknown>): Promise<boolean>");
    expect(normalizedWorkbenchSource).toContain("if (!snapshot) return false;");
    expect(normalizedWorkbenchSource).toContain("expectedFingerprint !== snapshotFingerprint) return false;");
    expect(normalizedWorkbenchSource).toContain("if (!applySnapshot(envelope.snapshot, requestId, adWorkId)) return false;");
    expect(normalizedWorkbenchSource).toContain("return true;");
    expect(normalizedWorkbenchSource).toContain('const saved = await runMutation("admin_reschedule_ad_work_v1"');
    expect(normalizedWorkbenchSource).toContain('if (saved) setRescheduleReason("");');
    expect(normalizedWorkbenchSource).toContain('const saved = await runMutation("admin_reschedule_ad_work_day_v1"');
    expect(normalizedWorkbenchSource).toContain('if (saved) {\n      setDayReason("");\n      setNewDayDate("");');
    expect(normalizedWorkbenchSource).toContain('const saved = await runMutation("admin_cancel_ad_work_v1"');
    expect(normalizedWorkbenchSource).toContain('if (saved) {\n      setCancellationReason("");\n      setCancellationInternalNote("");');
  });
});
