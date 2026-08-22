import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationSource = readFileSync(
  "supabase/migrations/20260822083000_m28_authority_replay_closure.sql",
  "utf8",
);

describe("M28 authority and replay closure", () => {
  it("records one canonical result for response-loss replay without opening direct table authority", () => {
    expect(migrationSource).toContain("create table if not exists public.m28_mutation_operations");
    expect(migrationSource).toContain("primary key (actor_id, ad_work_id, mutation_type, request_key)");
    expect(migrationSource).toContain("m28_claim_replay_v1");
    expect(migrationSource).toContain("m28_record_result_v1");
    expect(migrationSource).toContain("Operation identity conflicts with a different request");
    expect(migrationSource).toContain("revoke all on public.m28_mutation_operations");
    expect(migrationSource).toContain("'payment_update'");
    expect(migrationSource).toContain("'initial_schedule'");
    expect(migrationSource).toContain("'day_schedule'");
    expect(migrationSource).toContain("'whole_reschedule'");
    expect(migrationSource).toContain("'day_reschedule'");
    expect(migrationSource).toContain("'cancel'");
  });

  it("closes null-version, issued-authority and cancellation-metadata bypasses", () => {
    expect(migrationSource.match(/if p_expected_version is null then/g)?.length).toBeGreaterThanOrEqual(6);
    expect(migrationSource).toContain("v_work.assignment_status <> 'not_assigned'");
    expect(migrationSource).toContain("v_work.execution_release_status <> 'not_released'");
    expect(migrationSource).toContain("v_work.execution_overall_status <> 'not_started'");
    expect(migrationSource).toContain("new.cancellation_reason");
    expect(migrationSource).toContain("new.cancellation_internal_note");
    expect(migrationSource).toContain("new.cancelled_at");
    expect(migrationSource).toContain("new.cancelled_by");
    expect(migrationSource).toContain("Another work day is actively executing; finish or stop it before rescheduling");
  });

  it("bounds embedded commercial history and exposes deterministic cursor metadata", () => {
    expect(migrationSource).toContain("limit 20");
    expect(migrationSource).toContain("'commercialEventsPage'");
    expect(migrationSource).toContain("'nextBeforeVersion'");
    expect(migrationSource).toContain("admin_list_ad_work_commercial_events_v1");
    expect(migrationSource).toContain("Commercial history page size must be between 1 and 100");
    const snapshotSection = migrationSource.match(
      /create or replace function public\.m28_build_snapshot_v1[\s\S]*?create or replace function public\.admin_list_ad_work_commercial_events_v1/,
    )?.[0] ?? "";
    expect(snapshotSection).not.toContain("'note', e.note");
  });
});
