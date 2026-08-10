import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  M25_STATISTICAL_QUEUE_BATCH_SIZE,
  M25_STATISTICAL_QUEUE_MAX_ITERATIONS,
  M25_STATISTICAL_WORKER_MAX_CONCURRENCY,
  M25StatisticalWorkerRuntimeV1,
  runM25StatisticalWorkerV1,
  safeM25StatisticalWorkerResponseV1,
} from "../netlify/functions/_m25/statistical-worker";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("M25 bounded statistical worker", () => {
  it("requires immutable review evidence and exposes promotions through M22", () => {
    const closure = readFileSync("supabase/migrations/20260808010000_m24f_m25_release_closure.sql", "utf8");
    expect(closure).toContain("from public.m25_signal_review_history h");
    expect(closure).toContain("h.new_state=s.state");
    expect(closure).toContain("a.rule_id is not null or a.source='statistical_signal'");
    expect(closure).not.toContain("values('m25-statistical-signal-rule'");
  });

  it("keeps the database worker exact-scoped, unavailable-aware, and review-only", () => {
    const migration = readFileSync("supabase/migrations/20260807020000_m25_statistical_intelligence_foundation.sql", "utf8");
    expect(migration).toContain("r.ad_work_day_id=j.ad_work_day_id");
    expect(migration).toContain("r.adapter_version=j.adapter_version");
    expect(migration).toContain("d.model=j.device_model");
    expect(migration).toContain("then 'unavailable'");
    expect(migration).toContain("on conflict(baseline_version) do nothing");
    expect(migration).toContain("on conflict(source_snapshot_id) do nothing");
    const workerBody = migration.slice(migration.indexOf("create or replace function public.m25_process_statistical_queue"), migration.indexOf("create or replace function public.m25_compact_operational_rows"));
    expect(workerBody).not.toContain("insert into public.alerts");
  });

  it("uses one authoritative generation per period and stable readiness sessions", () => {
    const closure = readFileSync("supabase/migrations/20260808040000_m24f_m25_authoritative_generation_closure.sql", "utf8");
    expect(closure).toContain("newer.generation>fs.generation");
    expect(closure).toContain("supersedes_snapshot_id");
    expect(closure).toContain("generated_at = excluded.generated_at");
    expect(closure).toContain("source_generation < excluded.source_generation");
    expect(closure).toContain("count(distinct (fs.scope_key_hash,fs.period_start,fs.period_end))");
    expect(closure).not.toContain("count(distinct fs.id) filter(where fs.scope='device_work_day')");
  });

  it("watermarks conflict evidence and resets retries per generation", () => {
    const closure = readFileSync("supabase/migrations/20260808050000_m24f_m25_watermark_privacy_retry_closure.sql", "utf8");
    for (const evidence of ["telemetry_identity_conflicts", "c.incoming_content_hash", "c.last_seen_at", "c.attempt_count::text"]) {
      expect(closure).toContain(evidence);
    }
    expect(closure).toContain("attempt_count=case when public.m25_feature_extraction_jobs.input_watermark<>excluded.input_watermark");
    expect(closure).toContain("safe_failure_reason_code=case when public.m25_feature_extraction_jobs.input_watermark<>excluded.input_watermark");
  });

  it("aligns conflict evidence to receipt periods and bounds conflict rates", () => {
    const closure = readFileSync("supabase/migrations/20260808060000_m25_identity_conflict_evidence_closure.sql", "utf8");
    const enqueueBody = closure.slice(
      closure.indexOf("create or replace function public.m25_enqueue_feature_scope_v1"),
      closure.indexOf("create or replace function public.m25_process_statistical_queue"),
    );
    const workerBody = closure.slice(closure.indexOf("create or replace function public.m25_process_statistical_queue"));

    expect(enqueueBody).toContain("where r.captured_at>=p_period_start and r.captured_at<p_period_end");
    expect(enqueueBody).not.toContain("c.first_seen_at>=p_period_start");
    expect(workerBody).toContain("select count(distinct r.id)::integer into v_conflicts");
    expect(workerBody).toContain("where r.captured_at >= j.period_start and r.captured_at < j.period_end");
    expect(workerBody).not.toContain("where c.first_seen_at >= j.period_start");
  });

  it("requeues historical dependents once and uses canonical MAD/IQR scoring", () => {
    const closure = readFileSync("supabase/migrations/20260808070000_m24f_m25_authority_statistical_parity_closure.sql", "utf8");
    expect(closure).toContain("authoritative_correction_pending");
    expect(closure).toContain("later.period_end>j.period_end");
    expect(closure).toContain("dependency_cause_snapshot_id is distinct from s_id");
    expect(closure).toContain("sig.generated_at>j.period_end");
    expect(closure).toContain("(p_p75-p_p25)/1.349");
    expect(closure).toContain("0.6745*(p_observed-p_median)");
  });

  it("orders and cascades historical corrections by evidence period", () => {
    const closure = readFileSync("supabase/migrations/20260808080000_m24f_m25_final_closure.sql", "utf8");
    expect(closure).toContain("order by authoritative_correction_pending desc,period_end,period_start,next_attempt_at,created_at,id");
    expect(closure).toContain("later.period_end=(select min(next_period.period_end)");
    expect(closure).toContain("authoritative_correction_pending=true,dependency_cause_snapshot_id=s_id");
    expect(closure).not.toContain("order by next_attempt_at,created_at");
  });

  it("preserves dirty correction cascades and matches deterministic hysteresis", () => {
    const closure = readFileSync("supabase/migrations/20260808090000_m24f_m25_deterministic_correction_closure.sql", "utf8");
    expect(closure).toContain("else authoritative_correction_pending end");
    expect(closure).toContain("p_previous_state='investigate' and p_score>=p_clearing_threshold");
    expect(closure).toContain("p_consecutive_windows<p_required_windows");
    expect(closure).toContain("v_definition.opening_threshold,v_definition.clearing_threshold");
    expect(closure).toContain("order by authoritative_correction_pending desc,period_end,period_start");
    expect(closure).toContain("for update skip locked");
  });

  it("re-reads same-batch claims and reconstructs prior-period hysteresis", () => {
    const closure = readFileSync("supabase/migrations/20260808100000_m24f_m25_correction_propagation_closure.sql", "utf8");
    expect(closure).toContain("select * into strict j from public.m25_feature_extraction_jobs where id=j.id for update");
    expect(closure).toContain("select * into strict j from public.m25_feature_extraction_jobs where id=j.id;");
    expect(closure).toContain("from public.m25_signal_evaluations prior");
    expect(closure).toContain("prior.period_end<j.period_end");
    expect(closure).toContain("order by prior.period_end desc,prior.source_generation desc");
    expect(closure).not.toContain("select sig.state into v_previous_state from public.m25_statistical_signals sig");
  });

  it("reopens same-period reviewed evidence for a generation-bound fresh review", () => {
    const closure = readFileSync("supabase/migrations/20260808110000_m25_same_period_review_authority_closure.sql", "utf8");
    expect(closure).toContain("j.period_end::text,j.generation::text,v_baseline_version");
    expect(closure).toContain("generated_at = excluded.generated_at");
    expect(closure).toContain("source_generation < excluded.source_generation");
    expect(closure).not.toContain("state not in ('reviewed','suppressed') and (public.m25_statistical_signals.generated_at");
    expect(closure).toContain("promoted_alert_id is null");
  });

  it("advances reviewed signals to the newest authoritative period", () => {
    const closure = readFileSync("supabase/migrations/20260808120000_m25_authority_cohort_integrity_closure.sql", "utf8");
    expect(closure).toContain("generated_at < excluded.generated_at");
    expect(closure).not.toContain("generated_at < excluded.generated_at\n              and public.m25_statistical_signals.state not in ('reviewed','suppressed')");
    expect(closure).toContain("newer.period_end>s.generated_at");
    expect(closure).toContain("newer.source_generation>s.source_generation");
    expect(closure).toContain("h.evaluation_id=s.evaluation_id");
  });

  it("serializes promotion with authoritative evaluation publication", () => {
    const closure = readFileSync("supabase/migrations/20260808130000_m25_promotion_evaluation_serialization.sql", "utf8");
    expect(closure).toContain("before insert or update on public.m25_signal_evaluations");
    expect(closure).toContain("m25_signal_authority_lock_v1(new.signal_id,new.scope_key_hash,new.synthetic)");
    expect(closure).toContain("perform public.m25_signal_authority_lock_v1(s.signal_id,s.scope_key_hash,s.synthetic)");
    expect(closure.indexOf("perform public.m25_signal_authority_lock_v1(s.signal_id,s.scope_key_hash,s.synthetic)")).toBeLessThan(
      closure.indexOf("where id=p_signal_id for update"),
    );
    expect(closure).toContain("current_evaluation.evaluation_id=s.evaluation_id");
    expect(closure).toContain("current_evaluation.period_end=s.generated_at");
    expect(closure).toContain("current_evaluation.source_generation=s.source_generation");
    expect(closure).toContain("h.evaluation_id=s.evaluation_id");
    expect(closure).toContain("newer.source_generation>s.source_generation");
    expect(closure.indexOf("newer.source_generation>s.source_generation")).toBeLessThan(
      closure.indexOf("insert into public.alerts"),
    );
  });

  it("counts only authoritative qualifying evidence in readiness", () => {
    const closure = readFileSync("supabase/migrations/20260808140000_m24f_m25_authority_readiness_closure.sql", "utf8");
    expect(closure).toContain("fs.scope='device_model_day' and fs.device_model is not null");
    expect(closure).toContain("fs.scope='device_work_day' and exists");
    expect(closure).toContain("observed.observation_status='observed'");
    expect(closure).toContain("observed.sample_count>0 and observed.coverage_score>0");
    expect(closure).toContain("newer.generation>fs.generation");
    expect(closure).toContain("count(distinct (fs.scope_key_hash,fs.period_start,fs.period_end))");
  });

  it("requires observed evidence for calendar and model-day readiness", () => {
    const closure = readFileSync("supabase/migrations/20260808160000_m25_observed_readiness_closure.sql", "utf8");
    const calendarStart = closure.indexOf("count(distinct fs.period_start::date) filter(");
    const modelStart = closure.indexOf("count(distinct (fs.device_model,fs.period_start::date)) filter(");
    const workDayStart = closure.indexOf("reviewed_work_day_sessions", modelStart);
    const calendarLaw = closure.slice(calendarStart, modelStart);
    const modelLaw = closure.slice(modelStart, workDayStart);

    for (const law of [calendarLaw, modelLaw]) {
      expect(law).toContain("observed.observation_status='observed'");
      expect(law).toContain("observed.sample_count>0 and observed.coverage_score>0");
    }
    expect(modelLaw).toContain("fs.scope='device_model_day' and fs.device_model is not null");
    expect(closure).toContain("newer.generation>fs.generation");
  });

  it("keeps the active catalog limited to authoritative implemented extraction", () => {
    const closure = readFileSync("supabase/migrations/20260808170000_m24f_m25_catalog_privacy_manifest_closure.sql", "utf8");
    expect(closure).toContain("availability_status in ('implemented','unavailable')");
    expect(closure).toContain("active and availability_status='implemented'");
    expect(closure).toContain("not active and availability_status='unavailable'");
    expect(closure).toContain("'identity_conflict_rate'");
    expect(closure).toContain("Inactive until deterministic exact-scoped source extraction is implemented; no covered zero is emitted.");
    expect(closure).toContain("update public.m25_statistical_signal_definitions s set active=f.active");
  });

  it("uses the shared 3/20 support threshold contract in SQL", () => {
    const closure = readFileSync("supabase/migrations/20260808150000_m24f_m25_certification_authority_support_parity.sql", "utf8");
    expect(closure).toContain("when p_sample_count<3 then 'low'");
    expect(closure).toContain("when p_sample_count<20 then 'moderate'");
    expect(closure).toContain("v_support:=public.m25_support_level_v1(v_feature.sample_count,j.synthetic)");
    expect(closure).not.toContain("v_feature.sample_count>=8 then 'strong'");
  });

  it("uses bounded queue waves and count-only output", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const name = String(input).split("/").at(-1)!; calls.push(name);
      if (name === "m25_compact_operational_rows") return new Response(JSON.stringify({ deleted_rows: 2 }), { status: 200 });
      return new Response(JSON.stringify({ claimed: 1, feature_snapshots_built: 1, baselines_evaluated: 0, signals_evaluated: 1, readiness_assessments: 1, retry_or_failed: 0 }), { status: 200 });
    }));
    const result = await runM25StatisticalWorkerV1(new M25StatisticalWorkerRuntimeV1("https://example.invalid", "service-role-test-only"));
    expect(M25_STATISTICAL_QUEUE_BATCH_SIZE).toBe(50);
    expect(M25_STATISTICAL_QUEUE_MAX_ITERATIONS).toBe(4);
    expect(M25_STATISTICAL_WORKER_MAX_CONCURRENCY).toBe(4);
    expect(calls.filter((name) => name === "m25_process_statistical_queue").length).toBeGreaterThan(0);
    expect(result).toMatchObject({ workerOk: true, featureSnapshotsBuilt: expect.any(Number), compacted: 2 });
    const response = safeM25StatisticalWorkerResponseV1(result);
    expect(await response.text()).not.toMatch(/latitude|longitude|secret|credential/i);
  });

  it("surfaces retry rows and compaction failures as partial failure", async () => {
    const names: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const name = String(input).split("/").at(-1)!; names.push(name);
      if (name === "m25_compact_operational_rows") throw new Error("compaction_unavailable");
      return new Response(JSON.stringify({ claimed: 1, feature_snapshots_built: 0, baselines_evaluated: 0, signals_evaluated: 0, readiness_assessments: 0, retry_or_failed: 1 }), { status: 200 });
    }));
    const result = await runM25StatisticalWorkerV1(new M25StatisticalWorkerRuntimeV1("https://example.invalid", "service-role-test-only"));
    expect(names.filter((name) => name === "m25_process_statistical_queue").length).toBe(4);
    expect(names).toContain("m25_compact_operational_rows");
    expect(result).toMatchObject({ workerOk: false, workerStatus: "partial_failure", queueRetryOrFailed: 4, compactionFailed: true });
  });
});
