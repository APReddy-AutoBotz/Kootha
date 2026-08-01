import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, HeartPulse, RefreshCw, ShieldCheck } from "lucide-react";
import "./admin-m22.css";

export type M22AdminConnection = { url: string; anonKey: string; accessToken: string };
type AlertStatus = "new" | "acknowledged" | "investigating" | "resolved" | "false_alarm" | "ignored";
type AlertSeverity = "info" | "warning" | "critical";
const CONTRACT_VERSION = "m22-admin-v1";

type TrackingHealthRow = {
  adWorkDayId: string; adWorkId: string; workLabel: string;
  phoneSessionCount: number; physicalSessionCount: number;
  phonePointCount: number; physicalPointCount: number;
  phoneFirstUpdateAt: string | null; phoneLastUpdateAt: string | null;
  physicalFirstUpdateAt: string | null; physicalLastUpdateAt: string | null;
  latestAcceptedLivePhysicalUpdateAt: string | null;
  delayedPhysicalCount: number; offlineBackfillCount: number;
  phoneHealth: string; physicalHealth: string;
  heartbeatAgeSeconds: number | null; physicalLocationUpdateAgeSeconds: number | null;
  activeAlertCount: number; highestActiveSeverity: AlertSeverity | null;
  latestHealthEpisode: { alertId: string; ruleId: string; status: AlertStatus; severity: AlertSeverity; lastDetectedAt: string } | null;
  comparisonSnapshotId?: string | null;
  comparisonStatus: "not_evaluated" | "not_available" | "planned_for_m23" | string;
};

type AlertRow = {
  id: string; ruleId: string; ruleVersion: string | null; title: string | null; message: string;
  severity: AlertSeverity; status: AlertStatus; source: string;
  deviceLabel: string | null; vehicleLabel: string | null; workLabel: string | null;
  firstDetectedAt: string; lastDetectedAt: string; conditionActive: boolean;
  conditionClearedAt: string | null; occurrenceCount: number; synthetic: boolean;
};
type AlertDetailEnvelope = {
  contractVersion: typeof CONTRACT_VERSION; alert: AlertRow;
  statusHistory: Array<{ id: string; previousStatus: AlertStatus | null; newStatus: AlertStatus; reason: string; note: string; transitionAt: string }>;
  notes: Array<{ id: string; reason: string; note: string; createdAt: string }>;
  assessments: Array<{ id: string; ruleId: string; ruleVersion: string; outcome: string; reasonCode: string; evidenceTiming: string; assessedAt: string }>;
  auditHistory: Array<{ id: string; action: string; createdAt: string }>;
  allowedTransitions: AlertStatus[]; technicalValuesAvailable: boolean;
};
type TechnicalValues = {
  contractVersion: typeof CONTRACT_VERSION; alertId: string; ruleVersion: string | null;
  observedValue: number | null; thresholdValue: number | null; unit: string | null;
  evidenceTiming: string | null; assessedAt: string | null;
};
type Envelope<T> = { contractVersion: typeof CONTRACT_VERSION; rows: T[] };

const statusOptions: readonly AlertStatus[] = ["new", "acknowledged", "investigating", "resolved", "false_alarm", "ignored"];
const severityOptions: readonly AlertSeverity[] = ["info", "warning", "critical"];
const actionLabels: Record<AlertStatus, string> = {
  new: "New", acknowledged: "Acknowledge", investigating: "Start investigation",
  resolved: "Resolve", false_alarm: "Mark false alarm", ignored: "Ignore",
};

function headers(connection: M22AdminConnection): Record<string, string> {
  return { apikey: connection.anonKey, authorization: `Bearer ${connection.accessToken}`, "content-type": "application/json" };
}
async function callRpc<T>(connection: M22AdminConnection, name: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${connection.url}/rest/v1/rpc/${name}`, {
    method: "POST", headers: headers(connection), body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("The M22 admin request could not be completed.");
  return response.json() as Promise<T>;
}
function requireContract<T extends { contractVersion: string }>(value: T): T {
  if (value.contractVersion !== CONTRACT_VERSION) throw new Error("The M22 admin response contract is not supported.");
  return value;
}
function label(value: string | null | undefined): string {
  return value ? value.replaceAll("_", " ").replace(/\b\w/g, (part) => part.toUpperCase()) : "Not recorded";
}
function time(value: string | null | undefined): string { return value ? new Date(value).toLocaleString() : "Not recorded"; }
function age(value: number | null): string { return value === null ? "Not available" : `${Math.floor(value / 60)} minute(s)`; }

type M23ComparisonSummary = {
  snapshotId: string; adWorkDayId: string; adWorkId: string; workLabel: string;
  policyVersion: string; pairingAlgorithmVersion: string; sourceExpectation: string;
  overallOutcome: string; reviewStatus: string; finality: string;
  phoneEligibleCount: number; physicalEligibleCount: number; pairCount: number;
  acceptablePairCount: number; matchCount: number; mismatchCandidateCount: number; insufficientQualityCount: number;
  unpairedPhoneCount: number; unpairedPhysicalCount: number; sustainedPairCount: number;
  sustainedFirstPairAt: string | null; sustainedLastPairAt: string | null;
  synthetic: boolean;
  generatedAt: string; inputWatermark?: string | null; technicalValuesAvailable?: boolean;
};
type M23ComparisonDetail = {
  contractVersion: "m23-admin-v1"; comparison: M23ComparisonSummary;
  reviewHistory: Array<{ id: string; previousStatus: string | null; newStatus: string; reason: string; note: string; createdAt: string }>;
  alert: { id: string; status: AlertStatus; conditionActive: boolean; occurrenceCount: number } | null;
};
type M23TechnicalValues = {
  contractVersion: "m23-admin-v1"; snapshotId: string; policyVersion: string;
  threshold: number; accessedAt: string; hasMore: boolean; nextCursor: string | null;
  pairs: Array<{ pairId: string; phoneCapturedAt: string; physicalCapturedAt: string; timeDifferenceMilliseconds: number; rawHaversineDistanceMeters: number | null; conservativeSeparationMeters: number | null; phoneAccuracyMeters: number | null; physicalDeviceAccuracyMeters: number | null; threshold: number; quality: string; outcome: string; policyVersion: string; synthetic: boolean }>;
};

function requireM23Contract<T extends { contractVersion: string }>(value: T): T {
  if (value.contractVersion !== "m23-admin-v1") throw new Error("The M23 comparison response contract is not supported.");
  return value;
}

function M23ComparisonDetailPanel({ connection, snapshotId, onChanged }: { connection: M22AdminConnection; snapshotId: string; onChanged: () => void }) {
  const [detail, setDetail] = useState<M23ComparisonDetail | null>(null);
  const [technical, setTechnical] = useState<M23TechnicalValues | null>(null);
  const [showTechnical, setShowTechnical] = useState(false);
  const [status, setStatus] = useState(""); const [reason, setReason] = useState(""); const [note, setNote] = useState("");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function load() {
    setError("");
    try { setDetail(requireM23Contract(await callRpc<M23ComparisonDetail>(connection, "admin_get_m23_comparison_detail_v1", { p_snapshot_id: snapshotId }))); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Comparison detail could not be loaded."); }
  }
  useEffect(() => { setDetail(null); setTechnical(null); setShowTechnical(false); void load(); }, [snapshotId, connection.accessToken]);
  async function toggleTechnical() {
    if (showTechnical) { setShowTechnical(false); return; }
    if (!technical) {
      try { setTechnical(requireM23Contract(await callRpc<M23TechnicalValues>(connection, "admin_get_m23_comparison_technical_values_v1", { p_snapshot_id: snapshotId, p_after_cursor: null, p_limit: 100 }))); }
      catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Comparison technical values could not be loaded."); return; }
    }
    setShowTechnical(true);
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); const safeReason = reason.trim(); const safeNote = note.trim();
    if (!status || !safeReason || !safeNote) { setError("A review status, reason, and note are required."); return; }
    setBusy(true); setError("");
    try { await callRpc(connection, "admin_transition_m23_comparison_review", { p_snapshot_id: snapshotId, p_new_status: status, p_reason: safeReason, p_note: safeNote }); setReason(""); setNote(""); await load(); onChanged(); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Comparison review could not be saved."); }
    finally { setBusy(false); }
  }
  if (!detail) return <section className="m22-alert-detail"><p role={error ? "alert" : undefined}>{error || "Loading comparison detail..."}</p></section>;
  const comparison = detail.comparison;
  const terminal = comparison.reviewStatus === "dismissed_insufficient_evidence";
  return <section className="m22-alert-detail m23-comparison-detail" aria-labelledby="m23-comparison-detail-title">
    <h3 id="m23-comparison-detail-title">Comparison detail</h3>
    <p>{label(comparison.overallOutcome)} · {label(comparison.finality)}</p>
    <dl className="detail-grid"><div><dt>Source expectation</dt><dd>{label(comparison.sourceExpectation)}</dd></div><div><dt>Review status</dt><dd>{label(comparison.reviewStatus)}</dd></div><div><dt>Policy</dt><dd>{comparison.policyVersion}</dd></div><div><dt>Pairing</dt><dd>{comparison.pairingAlgorithmVersion}</dd></div><div><dt>Eligible points</dt><dd>{comparison.phoneEligibleCount} phone / {comparison.physicalEligibleCount} physical</dd></div><div><dt>Pairs</dt><dd>{comparison.pairCount} ({comparison.acceptablePairCount} acceptable, {comparison.matchCount} match, {comparison.mismatchCandidateCount} isolated candidates)</dd></div><div><dt>Insufficient quality</dt><dd>{comparison.insufficientQualityCount}</dd></div><div><dt>Unpaired points</dt><dd>{comparison.unpairedPhoneCount} phone / {comparison.unpairedPhysicalCount} physical</dd></div><div><dt>Sustained evidence</dt><dd>{comparison.sustainedPairCount} pair(s) · {time(comparison.sustainedFirstPairAt)} to {time(comparison.sustainedLastPairAt)}</dd></div></dl>
    {comparison.technicalValuesAvailable && <button className="secondary-button" type="button" aria-expanded={showTechnical} onClick={() => void toggleTechnical()}>{showTechnical ? "Hide technical values" : "Show technical values"}</button>}
    {showTechnical && technical && <div className="m22-technical-values"><p>Explicit technical access was recorded for this comparison.</p>{technical.pairs.map((pair) => <article key={pair.pairId}><strong>{label(pair.outcome)}</strong><span>{time(pair.phoneCapturedAt)} · {pair.conservativeSeparationMeters ?? "Not recorded"} metres · {label(pair.quality)}</span></article>)}</div>}
    <p className="quiet-note">Coordinates, maps, raw payloads, customer fields, and source-attribution conclusions are not available in this view.</p>
    {!terminal && <form className="form-section" onSubmit={submit}><h4>Comparison review</h4><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Choose status</option><option value="reviewing">Reviewing</option><option value="reviewed_consistent">Reviewed as consistent</option><option value="reviewed_needs_follow_up">Needs operational follow-up</option><option value="dismissed_insufficient_evidence">Dismissed; insufficient evidence</option></select></label><label>Reason<input value={reason} maxLength={160} onChange={(event) => setReason(event.target.value)} required /></label><label>Safe admin note<textarea value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} required /></label>{error && <p className="form-alert" role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? "Saving..." : "Save comparison review"}</button></form>}
    {terminal && <p className="quiet-note">This comparison review is terminal. No further review transitions are allowed.</p>}
    <section><h4>Review history</h4>{detail.reviewHistory.map((entry) => <article key={entry.id}><strong>{label(entry.newStatus)}</strong><span>{time(entry.createdAt)}</span><p>{entry.reason}: {entry.note}</p></article>)}</section>
  </section>;
}

export function TrackingHealthView({ connection }: { connection: M22AdminConnection }) {
  const [rows, setRows] = useState<TrackingHealthRow[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true); setError("");
    try {
      const today = new Date(); const from = new Date(today); from.setUTCDate(today.getUTCDate() - 6);
      const result = requireContract(await callRpc<Envelope<TrackingHealthRow>>(connection, "admin_get_m22_tracking_health_v1", {
        p_ad_work_id: null, p_from_date: from.toISOString().slice(0, 10),
        p_to_date: today.toISOString().slice(0, 10), p_limit: 100, p_now: today.toISOString(),
      }));
      setRows(result.rows);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Tracking Health could not be loaded."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [connection.url, connection.accessToken]);
  const totals = rows.reduce((sum, row) => ({
    phone: sum.phone + row.phoneSessionCount, physical: sum.physical + row.physicalSessionCount,
    alerts: sum.alerts + row.activeAlertCount,
    critical: sum.critical + (row.highestActiveSeverity === "critical" ? row.activeAlertCount : 0),
  }), { phone: 0, physical: 0, alerts: 0, critical: 0 });
  const comparisonRows = rows.filter((row) => row.comparisonSnapshotId);
  return <section className="m22-admin-view" aria-labelledby="tracking-health-title">
    <div className="panel-heading"><div><h2 id="tracking-health-title">Tracking Health</h2><p>Phone and physical-device evidence stay source-specific by work day.</p></div><button className="secondary-button" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={18} /> Refresh</button></div>
    <div className="m22-health-summary" aria-label="Tracking Health summary">
      <article><span>Physical sessions</span><strong>{totals.physical}</strong><small>Current device health only</small></article>
      <article><span>Phone sessions</span><strong>{totals.phone}</strong><small>Phone Location Proof only</small></article>
      <article><span>Active alerts</span><strong>{totals.alerts}</strong><small>{totals.critical} critical</small></article>
      <article><span>Comparison</span><strong>{rows[0] ? label(rows[0].comparisonStatus) : "Not evaluated"}</strong><small>{comparisonRows.length} comparison snapshot(s)</small></article>
    </div>
    <p className="m22-boundary"><ShieldCheck size={18} /> {comparisonRows.length === 0 ? "Sources are not paired until a bounded M23 comparison is evaluated." : "Comparison is admin-only, source-separated, and never a misconduct or route conclusion."}</p>
    {error && <p className="form-alert" role="alert">{error}</p>}
    <div className="m22-source-grid">{rows.map((row) => <article className="m22-health-row" key={row.adWorkDayId}>
      <div><strong>{row.workLabel}</strong><span className="status-pill">{label(row.comparisonStatus)}</span></div>
      <h3>Physical-device health</h3><dl>
        <div><dt>Sessions / points</dt><dd>{row.physicalSessionCount} / {row.physicalPointCount}</dd></div>
        <div><dt>Latest accepted-live update</dt><dd>{time(row.latestAcceptedLivePhysicalUpdateAt)}</dd></div>
        <div><dt>Heartbeat age</dt><dd>{age(row.heartbeatAgeSeconds)}</dd></div>
        <div><dt>Location age</dt><dd>{age(row.physicalLocationUpdateAgeSeconds)}</dd></div>
        <div><dt>Delayed / backfill</dt><dd>{row.delayedPhysicalCount} / {row.offlineBackfillCount}</dd></div>
        <div><dt>Current source health</dt><dd>{label(row.physicalHealth)}</dd></div>
      </dl><h3>Phone Location Proof health</h3><dl>
        <div><dt>Sessions / points</dt><dd>{row.phoneSessionCount} / {row.phonePointCount}</dd></div>
        <div><dt>First update</dt><dd>{time(row.phoneFirstUpdateAt)}</dd></div>
        <div><dt>Last update</dt><dd>{time(row.phoneLastUpdateAt)}</dd></div>
        <div><dt>Current source health</dt><dd>{label(row.phoneHealth)}</dd></div>
        <div><dt>Active alerts</dt><dd>{row.activeAlertCount}</dd></div>
        <div><dt>Latest alert episode</dt><dd>{row.latestHealthEpisode ? `${label(row.latestHealthEpisode.ruleId)} · ${time(row.latestHealthEpisode.lastDetectedAt)}` : "None"}</dd></div>
      </dl><h3>Phone versus physical-device comparison</h3><dl><div><dt>Status</dt><dd>{label(row.comparisonStatus)}</dd></div><div><dt>Snapshot</dt><dd>{row.comparisonSnapshotId ? <button className="text-button" type="button" onClick={() => setSelectedSnapshotId(row.comparisonSnapshotId ?? null)}>Review comparison</button> : "Not evaluated"}</dd></div></dl>
    </article>)}{!loading && rows.length === 0 && <p className="empty-state">No bounded Tracking Health rows are available.</p>}</div>
    {selectedSnapshotId && <M23ComparisonDetailPanel connection={connection} snapshotId={selectedSnapshotId} onChanged={() => void load()} />}
  </section>;
}

export function AlertDetailPanel({ connection, alertId, onChanged }: { connection: M22AdminConnection; alertId: string; onChanged: () => void }) {
  const [detail, setDetail] = useState<AlertDetailEnvelope | null>(null);
  const [technical, setTechnical] = useState<TechnicalValues | null>(null);
  const [showTechnical, setShowTechnical] = useState(false);
  const [targetStatus, setTargetStatus] = useState<AlertStatus | "">("");
  const [reason, setReason] = useState(""); const [note, setNote] = useState("");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function load() {
    setError("");
    try {
      const result = requireContract(await callRpc<AlertDetailEnvelope>(connection, "admin_get_m22_alert_detail_v1", { p_alert_id: alertId }));
      setDetail(result); setTargetStatus(result.allowedTransitions[0] ?? "");
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Alert detail could not be loaded."); }
  }
  useEffect(() => { setTechnical(null); setShowTechnical(false); setDetail(null); void load(); }, [alertId, connection.accessToken]);
  async function toggleTechnical() {
    if (showTechnical) { setShowTechnical(false); return; }
    if (!technical) {
      try { setTechnical(requireContract(await callRpc<TechnicalValues>(connection, "admin_get_m22_alert_technical_values_v1", { p_alert_id: alertId }))); }
      catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Technical values could not be loaded."); return; }
    }
    setShowTechnical(true);
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); const safeReason = reason.trim(); const safeNote = note.trim();
    if (!targetStatus || !safeReason || !safeNote) { setError("A safe reason and note are required."); return; }
    if (!window.confirm(`Confirm alert lifecycle change to ${label(targetStatus)}?`)) return;
    setBusy(true); setError("");
    try {
      await callRpc(connection, "admin_transition_alert", { p_alert_id: alertId, p_new_status: targetStatus, p_reason: safeReason, p_note: safeNote });
      setReason(""); setNote(""); await load(); onChanged();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Alert lifecycle change failed."); }
    finally { setBusy(false); }
  }
  if (!detail) return <section className="m22-alert-detail"><p role={error ? "alert" : undefined}>{error || "Loading alert detail..."}</p></section>;
  const alert = detail.alert;
  return <section className="m22-alert-detail" aria-labelledby="m22-alert-detail-title">
    <h3 id="m22-alert-detail-title">{alert.title || label(alert.ruleId)}</h3><p>{alert.message}</p>
    <dl className="detail-grid"><div><dt>Status</dt><dd>{label(alert.status)}</dd></div><div><dt>Severity</dt><dd>{label(alert.severity)}</dd></div><div><dt>Source</dt><dd>{label(alert.source)}</dd></div><div><dt>Rule version</dt><dd>{alert.ruleVersion || "Legacy"}</dd></div><div><dt>First detected</dt><dd>{time(alert.firstDetectedAt)}</dd></div><div><dt>Last detected</dt><dd>{time(alert.lastDetectedAt)}</dd></div><div><dt>Occurrences</dt><dd>{alert.occurrenceCount}</dd></div><div><dt>Condition</dt><dd>{alert.conditionActive ? "Active" : `Cleared ${time(alert.conditionClearedAt)}`}</dd></div></dl>
    {detail.technicalValuesAvailable && <button className="secondary-button" type="button" aria-expanded={showTechnical} onClick={() => void toggleTechnical()}>{showTechnical ? "Hide technical values" : "Show technical values"}</button>}
    {showTechnical && technical && <dl className="detail-grid m22-technical-values"><div><dt>Observed value</dt><dd>{technical.observedValue ?? "Not recorded"} {technical.unit ?? ""}</dd></div><div><dt>Policy threshold</dt><dd>{technical.thresholdValue ?? "Not recorded"} {technical.unit ?? ""}</dd></div><div><dt>Evidence timing</dt><dd>{label(technical.evidenceTiming)}</dd></div><div><dt>Assessed</dt><dd>{time(technical.assessedAt)}</dd></div></dl>}
    <p className="quiet-note">Coordinates, credentials, raw payloads, and authentication hints are not available in this view.</p>
    {detail.allowedTransitions.length > 0 ? <form className="form-section" onSubmit={submit}><h4>Lifecycle action</h4><label>Action<select value={targetStatus} onChange={(event) => setTargetStatus(event.target.value as AlertStatus)}>{detail.allowedTransitions.map((status) => <option key={status} value={status}>{actionLabels[status]}</option>)}</select></label><label>Reason<input value={reason} maxLength={160} onChange={(event) => setReason(event.target.value)} required /></label><label>Safe admin note<textarea value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} required /></label>{error && <p className="form-alert" role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? "Saving..." : "Confirm lifecycle action"}</button></form> : <p className="quiet-note">This alert is terminal. No further lifecycle transitions are allowed.</p>}
    <section><h4>Lifecycle history</h4>{detail.statusHistory.map((entry) => <article key={entry.id}><strong>{label(entry.newStatus)}</strong><span>{time(entry.transitionAt)}</span><p>{entry.reason}: {entry.note}</p></article>)}</section>
    <section><h4>Admin notes</h4>{detail.notes.map((entry) => <article key={entry.id}><strong>{entry.reason}</strong><span>{time(entry.createdAt)}</span><p>{entry.note}</p></article>)}</section>
    <section><h4>Audit history</h4>{detail.auditHistory.map((entry) => <article key={entry.id}><strong>{label(entry.action)}</strong><span>{time(entry.createdAt)}</span></article>)}</section>
  </section>;
}

export function AlertsView({ connection }: { connection: M22AdminConnection }) {
  const [alerts, setAlerts] = useState<AlertRow[]>([]); const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState("all"); const [severity, setSeverity] = useState("all"); const [rule, setRule] = useState("");
  const [source, setSource] = useState("all"); const [condition, setCondition] = useState("all"); const [synthetic, setSynthetic] = useState("all");
  const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true); setError("");
    try {
      const result = requireContract(await callRpc<Envelope<AlertRow>>(connection, "admin_list_m22_alerts_v1", {
        p_status: status === "all" ? null : status, p_severity: severity === "all" ? null : severity,
        p_rule_id: rule.trim() || null, p_source: source === "all" ? null : source,
        p_gps_device_id: null, p_vehicle_id: null, p_ad_work_id: null,
        p_synthetic: synthetic === "all" ? null : synthetic === "yes",
        p_condition_active: condition === "all" ? null : condition === "active", p_limit: 100,
      }));
      setAlerts(result.rows); setSelectedId((current) => current && result.rows.some((row) => row.id === current) ? current : result.rows[0]?.id ?? null);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Alerts could not be loaded."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [connection.accessToken, status, severity, source, condition, synthetic]);
  const queues = useMemo(() => ({ new: alerts.filter((row) => row.status === "new").length, critical: alerts.filter((row) => row.severity === "critical" && row.conditionActive).length, investigating: alerts.filter((row) => row.status === "investigating").length, cleared: alerts.filter((row) => !row.conditionActive && !["resolved", "false_alarm", "ignored"].includes(row.status)).length, recent: alerts.filter((row) => row.status === "resolved").length }), [alerts]);
  return <section className="m22-admin-view" aria-labelledby="alerts-title"><div className="panel-heading"><div><h2 id="alerts-title">Alerts</h2><p>Internal deterministic operational review. No customer notification is sent.</p></div><button className="secondary-button" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={18} /> Refresh</button></div>
    <div className="m22-alert-queues" aria-label="Alert queues"><article><span>New</span><strong>{queues.new}</strong></article><article><span>Critical active</span><strong>{queues.critical}</strong></article><article><span>Investigating</span><strong>{queues.investigating}</strong></article><article><span>Cleared, awaiting review</span><strong>{queues.cleared}</strong></article><article><span>Resolved recently</span><strong>{queues.recent}</strong></article></div>
    <div className="admin-filter-grid" aria-label="Alert filters"><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All</option>{statusOptions.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label><label>Severity<select value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="all">All</option>{severityOptions.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label><label>Rule/type<input value={rule} onChange={(event) => setRule(event.target.value)} onBlur={() => void load()} placeholder="Rule ID" /></label><label>Source<select value={source} onChange={(event) => setSource(event.target.value)}><option value="all">All</option><option value="comparison">Phone versus physical comparison</option><option value="physical_device_live">Physical device · live</option><option value="physical_device_delayed">Physical device · delayed/historical</option><option value="health_sweep">Health sweep</option><option value="adapter_rejection">Adapter rejection</option><option value="authentication_failure">Authentication failure</option></select></label><label>Condition<select value={condition} onChange={(event) => setCondition(event.target.value)}><option value="all">All</option><option value="active">Active</option><option value="cleared">Cleared</option></select></label><label>Evidence<select value={synthetic} onChange={(event) => setSynthetic(event.target.value)}><option value="all">All</option><option value="no">Non-synthetic</option><option value="yes">Synthetic</option></select></label></div>
    {error && <p className="form-alert" role="alert">{error}</p>}<div className="m22-alert-layout"><section className="m22-alert-list">{alerts.map((row) => <button key={row.id} className={selectedId === row.id ? "is-selected" : ""} type="button" onClick={() => setSelectedId(row.id)}><div><AlertTriangle size={17} /><strong>{row.title || label(row.ruleId)}</strong><span className={`m22-severity ${row.severity}`}>{label(row.severity)}</span></div><p>{label(row.source)} · {row.deviceLabel || "Device not recorded"} · {row.vehicleLabel || "Vehicle not recorded"}</p><small>{label(row.status)} · {row.conditionActive ? "Condition active" : "Condition cleared"} · {row.occurrenceCount} occurrence(s) · {row.ruleVersion || "Legacy"}</small><time>{time(row.lastDetectedAt)}</time></button>)}{!loading && alerts.length === 0 && <p className="empty-state">No alerts match these filters.</p>}</section>{selectedId ? <AlertDetailPanel connection={connection} alertId={selectedId} onChanged={() => void load()} /> : <section className="m22-alert-detail empty-state">Select an alert to review it.</section>}</div>
  </section>;
}

export function DeviceM22HealthPanel({ connection, deviceId }: { connection: M22AdminConnection; deviceId: string }) {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  useEffect(() => { void callRpc<Envelope<AlertRow>>(connection, "admin_list_m22_alerts_v1", { p_status: null, p_severity: null, p_rule_id: null, p_source: null, p_gps_device_id: deviceId, p_vehicle_id: null, p_ad_work_id: null, p_synthetic: null, p_condition_active: null, p_limit: 20 }).then((result) => setAlerts(requireContract(result).rows)).catch(() => undefined); }, [connection.accessToken, deviceId]);
  const active = alerts.filter((row) => row.conditionActive); const highest = active.some((row) => row.severity === "critical") ? "Critical" : active.some((row) => row.severity === "warning") ? "Warning" : active.length ? "Info" : "None"; const delayed = alerts.filter((row) => row.source === "physical_device_delayed").length;
  return <section className="form-section m22-device-health" aria-labelledby="m22-device-health-title"><h3 id="m22-device-health-title"><HeartPulse size={19} /> Current Tracking Health</h3><p>Active registry status is not the same as Healthy or Proof Ready.</p><dl className="detail-grid"><div><dt>Current health</dt><dd>See bounded Tracking Health by work day</dd></div><div><dt>Latest live heartbeat</dt><dd>See Tracking Health</dd></div><div><dt>Latest live telemetry</dt><dd>See Tracking Health</dd></div><div><dt>Battery / power</dt><dd>Current source projection</dd></div><div><dt>GPS / GSM</dt><dd>Current source projection</dd></div><div><dt>Active alerts</dt><dd>{active.length}</dd></div><div><dt>Highest severity</dt><dd>{highest}</dd></div><div><dt>Delayed evidence summary</dt><dd>{delayed} recent alert episode(s); delayed evidence is historical and never marks current health healthy.</dd></div></dl><h4>Recent alert episodes</h4>{alerts.slice(0, 5).map((row) => <article key={row.id}><strong>{row.title || label(row.ruleId)}</strong><span>{label(row.status)} · {row.ruleVersion || "Legacy"} · {time(row.lastDetectedAt)}</span></article>)}</section>;
}
