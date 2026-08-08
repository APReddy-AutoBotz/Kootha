import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Activity, BrainCircuit, CheckCircle2, Database, FlaskConical, RefreshCw, ShieldCheck } from "lucide-react";
import "./admin-intelligence.css";

export type IntelligenceAdminConnection = { url: string; anonKey: string; accessToken: string };

type CandidateRow = {
  candidateId: string;
  safeDisplayName: string;
  deviceFamily: string;
  transportType: string;
  authenticationType: string;
  hostingExpectation: string;
  offlineBuffering: string;
  eventIdentityCapability: string;
  vendorSandboxStatus: string;
  documentationStatus: string;
  dataResidencyStatus: string;
  commercialStatus: string;
  costEvidenceStatus: string;
  complianceEvidenceStatus: string;
  certificationStatus: string;
  decisionStatus: string;
  blockingReason: string | null;
  lastCertificationAt: string | null;
  lastCertificationState: string | null;
  lastCertificationPassedCount: number | null;
  lastCertificationScenarioCount: number | null;
  adapterVersion: string | null;
};

type SignalRow = {
  id: string;
  signal_id: string;
  metric: string;
  scope: string;
  state: string;
  observed_value: number | null;
  baseline_median: number | null;
  robust_score: number | null;
  support_level: string;
  coverage_score: number;
  baseline_version: string | null;
  explanation_code: string;
  rule_fallback: string;
  synthetic: boolean;
  promoted_alert_id: string | null;
  generated_at: string;
};

type ReadinessRow = {
  decision?: string;
  reviewed_calendar_days?: number;
  reviewed_device_model_days?: number;
  reviewed_work_day_sessions?: number;
  device_count?: number;
  device_model_diversity?: number;
  adapter_version_diversity?: number;
  feature_completeness?: number;
  missingness?: number;
  synthetic_evidence?: boolean;
  real_reviewed_evidence?: boolean;
  security_status?: string;
  pilot_status?: string;
};

type IntelligenceEnvelope = {
  contractVersion: "m25-admin-v1";
  readiness: ReadinessRow;
  baselines: Array<Record<string, unknown>>;
  signals: SignalRow[];
  governance: Array<Record<string, unknown>>;
  mlStatus: string;
};

const candidateStatuses = ["not_assessed", "candidate", "technically_compatible", "technically_blocked", "awaiting_commercial_review", "awaiting_compliance_review", "approved_by_ap", "rejected", "retired"] as const;

async function callRpc<T>(connection: IntelligenceAdminConnection, name: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${connection.url.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: connection.anonKey, Authorization: `Bearer ${connection.accessToken}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Intelligence admin request failed.");
  const value = await response.json() as T;
  return value;
}

function label(value: string | null | undefined): string {
  return value ? value.replaceAll("_", " ") : "Not recorded";
}

function time(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : "Not recorded";
}

function percent(value: number | undefined): string {
  return value === undefined ? "Not recorded" : `${Math.round(value * 100)}%`;
}

export function IntelligenceAdapterReadinessView({ connection }: { connection: IntelligenceAdminConnection }) {
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [intelligence, setIntelligence] = useState<IntelligenceEnvelope | null>(null);
  const [technicalCandidate, setTechnicalCandidate] = useState<Record<string, unknown> | null>(null);
  const [technicalSignal, setTechnicalSignal] = useState<Record<string, unknown> | null>(null);
  const [candidateForm, setCandidateForm] = useState({ safeDisplayName: "", deviceFamily: "", transportType: "vendor_webhook", authenticationType: "hmac_signature" });
  const [decision, setDecision] = useState({ candidateId: "", status: "technically_blocked", reason: "", note: "" });
  const [review, setReview] = useState({ signalId: "", state: "reviewed", label: "requires_more_observation", reason: "", note: "" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const selectedCandidate = useMemo(() => candidates.find((candidate) => candidate.candidateId === decision.candidateId) ?? null, [candidates, decision.candidateId]);

  async function load() {
    setLoading(true); setError("");
    try {
      const [candidateEnvelope, intelligenceEnvelope] = await Promise.all([
        callRpc<{ rows: CandidateRow[] }>(connection, "admin_list_m24f_adapter_readiness_v1", { p_limit: 100 }),
        callRpc<IntelligenceEnvelope>(connection, "admin_get_m25_intelligence_readiness_v1", { p_limit: 100 }),
      ]);
      setCandidates(candidateEnvelope.rows ?? []);
      setIntelligence(intelligenceEnvelope);
      setDecision((current) => ({ ...current, candidateId: current.candidateId && (candidateEnvelope.rows ?? []).some((row) => row.candidateId === current.candidateId) ? current.candidateId : candidateEnvelope.rows?.[0]?.candidateId ?? "" }));
      setReview((current) => ({ ...current, signalId: current.signalId && (intelligenceEnvelope.signals ?? []).some((row) => row.id === current.signalId) ? current.signalId : intelligenceEnvelope.signals?.[0]?.id ?? "" }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Intelligence readiness could not be loaded.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [connection.url, connection.accessToken]);

  async function createCandidate(event: FormEvent) {
    event.preventDefault();
    if (!candidateForm.safeDisplayName.trim() || !candidateForm.deviceFamily.trim()) { setError("Candidate name and device family are required."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      await callRpc(connection, "admin_create_m24f_candidate_v1", {
        p_safe_display_name: candidateForm.safeDisplayName.trim(), p_device_family: candidateForm.deviceFamily.trim(),
        p_transport_type: candidateForm.transportType, p_authentication_type: candidateForm.authenticationType,
      });
      setCandidateForm({ safeDisplayName: "", deviceFamily: "", transportType: "vendor_webhook", authenticationType: "hmac_signature" });
      setMessage("Adapter candidate created. AP selection remains pending."); await load();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Candidate could not be created."); }
    finally { setBusy(false); }
  }

  async function attachSyntheticManifest() {
    if (!selectedCandidate) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const manifestId = await callRpc<string>(connection, "admin_create_m24f_capability_manifest_v1", {
        p_adapter_id: "reference-vendor-webhook-v1", p_adapter_version: "1.0.0", p_vendor_device_family_label: "Synthetic reference vendor-cloud webhook",
        p_transport_type: "vendor_webhook", p_authentication_type: "hmac_signature", p_stable_event_id_available: true, p_sequence_available: true,
        p_stream_epoch_available: true, p_device_timestamp_available: true, p_offline_buffering_supported: true, p_batching_supported: true,
        p_heartbeat_supported: true, p_location_supported: true, p_approved_sensor_metrics: ["temperature"],
        p_data_residency_note: "Synthetic fixture only; no vendor residency claim.", p_support_escalation_note: "Repository test owner only.",
      });
      await callRpc(connection, "admin_update_m24f_candidate_metadata_v1", { p_candidate_id: selectedCandidate.candidateId, p_manifest_id: manifestId });
      setMessage("Synthetic capability manifest attached. No production adapter was activated."); await load();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Capability manifest could not be attached."); }
    finally { setBusy(false); }
  }

  async function saveDecision(event: FormEvent) {
    event.preventDefault();
    if (!decision.candidateId || !decision.reason.trim() || !decision.note.trim()) { setError("Decision reason and safe note are required."); return; }
    setBusy(true); setError(""); setMessage("");
    try { await callRpc(connection, "admin_decide_m24f_candidate_v1", { p_candidate_id: decision.candidateId, p_new_status: decision.status, p_reason: decision.reason.trim(), p_safe_note: decision.note.trim() }); setMessage("Adapter candidate decision recorded and audited."); await load(); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Candidate decision could not be recorded."); }
    finally { setBusy(false); }
  }

  async function showCandidateTechnical() {
    if (!decision.candidateId) return;
    try { setTechnicalCandidate(await callRpc(connection, "admin_get_m24f_adapter_technical_values_v1", { p_candidate_id: decision.candidateId })); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Technical values could not be loaded."); }
  }

  async function showSignalTechnical() {
    if (!review.signalId) return;
    try { setTechnicalSignal(await callRpc(connection, "admin_get_m25_signal_technical_values_v1", { p_signal_id: review.signalId })); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Statistical technical values could not be loaded."); }
  }

  async function saveReview(event: FormEvent) {
    event.preventDefault();
    if (!review.signalId || !review.reason.trim() || !review.note.trim()) { setError("Signal review reason and note are required."); return; }
    setBusy(true); setError(""); setMessage("");
    try { await callRpc(connection, "admin_transition_m25_signal_review_v1", { p_signal_id: review.signalId, p_new_state: review.state, p_review_label: review.label, p_reason: review.reason.trim(), p_note: review.note.trim() }); setMessage("Statistical signal review recorded. No automatic operational action was taken."); await load(); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Signal review could not be recorded."); }
    finally { setBusy(false); }
  }

  async function promoteSignal() {
    if (!review.signalId || !window.confirm("Promote this reviewed signal to the existing operational alert platform?")) return;
    setBusy(true); setError(""); setMessage("");
    try { await callRpc(connection, "admin_promote_m25_signal_to_alert_v1", { p_signal_id: review.signalId, p_reason: "Admin explicitly promoted statistical signal", p_note: "Operational review remains separate from statistical recovery." }); setMessage("Signal promoted to one deduplicated alert episode. Alert lifecycle remains explicit."); await load(); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Signal could not be promoted."); }
    finally { setBusy(false); }
  }

  const readiness = intelligence?.readiness ?? {};
  return <section className="intelligence-admin-view" aria-labelledby="intelligence-readiness-title">
    <div className="panel-heading"><div><p className="eyebrow">Intelligence and Adapter Readiness</p><h2 id="intelligence-readiness-title">Adapter Readiness and Statistical Intelligence</h2><p>Vendor-neutral preparation and explainable statistical review. No production ML is activated.</p></div><button className="secondary-button" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={18} /> Refresh</button></div>
    {error && <p className="form-alert" role="alert">{error}</p>}{message && <p className="form-status" role="status">{message}</p>}
    <p className="intelligence-boundary"><ShieldCheck size={18} /> Candidates, signals, readiness, technical values, coordinates, secrets, raw payloads, customers, and drivers are not exposed outside this admin view. Statistical support is coverage quality, not a wrongdoing probability.</p>
    <div className="intelligence-summary"><article><Database size={20} /><span>Readiness</span><strong>{label(readiness.decision)}</strong><small>{readiness.real_reviewed_evidence ? "Reviewed real evidence present" : "Synthetic-only or insufficient reviewed real evidence"}</small></article><article><FlaskConical size={20} /><span>Adapter candidates</span><strong>{candidates.length}</strong><small>AP decision remains separate</small></article><article><Activity size={20} /><span>Statistical signals</span><strong>{intelligence?.signals?.length ?? 0}</strong><small>Human review queue</small></article><article><BrainCircuit size={20} /><span>ML status</span><strong>Not activated</strong><small>{intelligence?.mlStatus ?? "Production ML not authorized"}</small></article></div>
    <section className="intelligence-panel" aria-labelledby="adapter-readiness-heading"><div className="panel-heading"><div><h3 id="adapter-readiness-heading">A. Adapter Readiness</h3><p>Safe candidate metadata, typed capabilities, certification state, blockers, and AP decision.</p></div></div>
      <form className="form-section" onSubmit={createCandidate}><h4>Create candidate</h4><div className="admin-filter-grid"><label>Safe display name<input value={candidateForm.safeDisplayName} maxLength={160} onChange={(event) => setCandidateForm({ ...candidateForm, safeDisplayName: event.target.value })} /></label><label>Device family<input value={candidateForm.deviceFamily} maxLength={160} onChange={(event) => setCandidateForm({ ...candidateForm, deviceFamily: event.target.value })} /></label><label>Transport<select value={candidateForm.transportType} onChange={(event) => setCandidateForm({ ...candidateForm, transportType: event.target.value })}><option value="vendor_webhook">Vendor webhook</option><option value="vendor_polling">Vendor polling</option><option value="direct_http">Direct HTTP</option><option value="mqtt">MQTT</option><option value="tcp">TCP</option><option value="udp">UDP</option></select></label><label>Authentication<select value={candidateForm.authenticationType} onChange={(event) => setCandidateForm({ ...candidateForm, authenticationType: event.target.value })}><option value="hmac_signature">HMAC/signature</option><option value="bearer">Bearer</option><option value="api_key">API key</option><option value="mutual_tls">Mutual TLS</option><option value="protocol_native">Protocol native</option></select></label></div><button className="primary-button" disabled={busy}>{busy ? "Saving..." : "Create candidate"}</button></form>
      <div className="intelligence-candidate-layout"><div className="intelligence-list">{candidates.map((candidate) => <button className={candidate.candidateId === decision.candidateId ? "is-selected" : ""} key={candidate.candidateId} type="button" onClick={() => { setDecision((current) => ({ ...current, candidateId: candidate.candidateId })); setTechnicalCandidate(null); }}><strong>{candidate.safeDisplayName}</strong><span>{label(candidate.transportType)} · {label(candidate.authenticationType)}</span><small>{label(candidate.decisionStatus)} · certification {label(candidate.certificationStatus)}</small></button>)}{!loading && candidates.length === 0 && <p className="empty-state">No adapter candidates recorded.</p>}</div><div className="intelligence-detail">{selectedCandidate ? <><h4>{selectedCandidate.safeDisplayName}</h4><dl className="detail-grid"><div><dt>Device family</dt><dd>{selectedCandidate.deviceFamily}</dd></div><div><dt>Transport</dt><dd>{label(selectedCandidate.transportType)}</dd></div><div><dt>Authentication</dt><dd>{label(selectedCandidate.authenticationType)}</dd></div><div><dt>Capabilities</dt><dd>{label(selectedCandidate.eventIdentityCapability)} · offline {label(selectedCandidate.offlineBuffering)}</dd></div><div><dt>Certification</dt><dd>{label(selectedCandidate.certificationStatus)} {selectedCandidate.lastCertificationPassedCount !== null ? `· ${selectedCandidate.lastCertificationPassedCount}/${selectedCandidate.lastCertificationScenarioCount} scenarios` : ""}</dd></div><div><dt>AP decision</dt><dd>{label(selectedCandidate.decisionStatus)}</dd></div><div><dt>Blocking reason</dt><dd>{selectedCandidate.blockingReason || "None recorded"}</dd></div><div><dt>Last certification</dt><dd>{time(selectedCandidate.lastCertificationAt)}</dd></div></dl><div className="admin-action-row"><button className="secondary-button" type="button" onClick={() => void attachSyntheticManifest()} disabled={busy}>Attach synthetic manifest</button><button className="secondary-button" type="button" onClick={() => void showCandidateTechnical()}>Show capability values</button></div>{technicalCandidate && <pre className="technical-values" aria-label="Adapter capability values">{JSON.stringify(technicalCandidate, null, 2)}</pre>}<form className="form-section" onSubmit={saveDecision}><h4>Record bounded decision</h4><label>Decision<select value={decision.status} onChange={(event) => setDecision({ ...decision, status: event.target.value })}>{candidateStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select></label><label>Reason<input value={decision.reason} maxLength={160} onChange={(event) => setDecision({ ...decision, reason: event.target.value })} /></label><label>Safe note<textarea value={decision.note} maxLength={500} onChange={(event) => setDecision({ ...decision, note: event.target.value })} /></label><button className="primary-button" disabled={busy}>Record decision</button></form></> : <p className="empty-state">Select an adapter candidate.</p>}</div></div>
    </section>
    <section className="intelligence-panel" aria-labelledby="data-readiness-heading"><h3 id="data-readiness-heading">B. Data Readiness</h3><div className="readiness-grid"><div><span>Reviewed calendar days</span><strong>{readiness.reviewed_calendar_days ?? 0} / 28–56 provisional</strong></div><div><span>Device/model days</span><strong>{readiness.reviewed_device_model_days ?? 0} / 30 provisional</strong></div><div><span>Work-day sessions</span><strong>{readiness.reviewed_work_day_sessions ?? 0} / 1,000 provisional</strong></div><div><span>Feature completeness</span><strong>{percent(readiness.feature_completeness)}</strong></div><div><span>Missingness</span><strong>{percent(readiness.missingness)}</strong></div><div><span>Diversity</span><strong>{readiness.device_model_diversity ?? 0} models · {readiness.adapter_version_diversity ?? 0} adapter versions</strong></div></div><p className="quiet-note">Thresholds are planning indicators only: 4–8 calendar weeks, 30 reviewed days per device/model, and 1,000 reviewed work-day sessions. Synthetic-only or insufficient reviewed real data produces a truthful production_ml_not_authorized outcome.</p></section>
    <section className="intelligence-panel" aria-labelledby="baseline-heading"><h3 id="baseline-heading">C. Statistical Baselines</h3><p>Active robust-statistical versions use median/MAD, with bounded IQR fallback and explicit cohort fallback.</p><div className="table-scroll"><table><thead><tr><th>Metric</th><th>Cohort</th><th>Sample</th><th>Coverage</th><th>Median/MAD</th><th>Period</th></tr></thead><tbody>{(intelligence?.baselines ?? []).map((baseline, index) => <tr key={`${String(baseline.metric)}-${index}`}><td>{label(String(baseline.metric ?? ""))}</td><td>{label(String(baseline.cohort_key ?? ""))} · {label(String(baseline.fallback_used ?? ""))}</td><td>{String(baseline.sample_count ?? 0)}</td><td>{String(baseline.coverage_count ?? 0)}</td><td>{String(baseline.median ?? "—")} / {String(baseline.median_absolute_deviation ?? "—")}</td><td>{time(String(baseline.effective_from ?? ""))}</td></tr>)}</tbody></table></div></section>
    <section className="intelligence-panel" aria-labelledby="signal-heading"><h3 id="signal-heading">D. Statistical Signals</h3><p>Signals are explainable review prompts. They do not make customer, driver, work, device, or fraud decisions.</p><div className="intelligence-signal-list">{(intelligence?.signals ?? []).map((signal) => <article key={signal.id} className={signal.id === review.signalId ? "is-selected" : ""}><button type="button" onClick={() => { setReview((current) => ({ ...current, signalId: signal.id })); setTechnicalSignal(null); }}><strong>{label(signal.signal_id)}</strong><span>{label(signal.metric)} · {label(signal.scope)} · {label(signal.state)}</span><small>{label(signal.support_level)} support · {percent(signal.coverage_score)} coverage · {signal.synthetic ? "Synthetic" : "Non-synthetic"}</small><em>{signal.explanation_code}</em></button>{signal.id === review.signalId && <div className="signal-detail"><p>{signal.rule_fallback}</p><div className="admin-action-row"><button className="secondary-button" type="button" onClick={() => void showSignalTechnical()}>Show technical values</button><button className="primary-button" type="button" onClick={() => void promoteSignal()} disabled={busy || Boolean(signal.promoted_alert_id)}>Promote to operational alert</button></div>{technicalSignal && <pre className="technical-values">{JSON.stringify(technicalSignal, null, 2)}</pre>}<form className="form-section" onSubmit={saveReview}><h4>Human review</h4><label>Review state<select value={review.state} onChange={(event) => setReview({ ...review, state: event.target.value })}><option value="reviewed">Reviewed</option><option value="suppressed">Suppressed</option><option value="watch">Watch</option><option value="investigate">Investigate</option><option value="normal">Normal</option></select></label><label>Review label<select value={review.label} onChange={(event) => setReview({ ...review, label: event.target.value })}><option value="requires_more_observation">Requires more observation</option><option value="expected_behavior">Expected behavior</option><option value="false_positive">False positive</option><option value="data_quality_problem">Data quality problem</option><option value="confirmed_operational_issue">Confirmed operational issue</option><option value="insufficient_evidence">Insufficient evidence</option></select></label><label>Reason<input value={review.reason} maxLength={160} onChange={(event) => setReview({ ...review, reason: event.target.value })} /></label><label>Safe note<textarea value={review.note} maxLength={500} onChange={(event) => setReview({ ...review, note: event.target.value })} /></label><button className="primary-button" disabled={busy}>Save signal review</button></form></div>}</article>)}{!loading && (intelligence?.signals ?? []).length === 0 && <p className="empty-state">No statistical signals recorded.</p>}</div></section>
    <section className="intelligence-panel" aria-labelledby="governance-heading"><h3 id="governance-heading">E. Analysis Governance</h3><div className="governance-grid"><div><strong>Active deterministic/statistical versions</strong><span>{(intelligence?.governance ?? []).filter((item) => item.status === "active").map((item) => String(item.analysis_version)).join(", ") || "m25-statistical-v1"}</span></div><div><strong>ML status</strong><span>Not activated</span></div><div><strong>Fallback</strong><span>M21/M22/M23 deterministic evidence remains authoritative.</span></div><div><strong>Approval gates</strong><span>AP, security, pilot, and human review remain required for any future ML.</span></div></div></section>
  </section>;
}
