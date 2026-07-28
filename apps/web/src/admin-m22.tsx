import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, HeartPulse, RefreshCw, ShieldCheck } from "lucide-react";
import "./admin-m22.css";

export type M22AdminConnection = {
  url: string;
  anonKey: string;
  accessToken: string;
};

type AlertStatus = "new" | "acknowledged" | "investigating" | "resolved" | "false_alarm" | "ignored";
type AlertSeverity = "info" | "warning" | "critical";

type AlertRow = {
  id: string;
  rule_id: string | null;
  rule_version: string | null;
  title: string | null;
  message: string;
  severity: AlertSeverity;
  status: AlertStatus;
  source: string;
  gps_device_id: string | null;
  device_label?: string | null;
  vehicle_id: string | null;
  vehicle_label?: string | null;
  ad_work_id: string | null;
  work_label?: string | null;
  first_detected_at: string;
  last_detected_at: string;
  condition_active: boolean;
  condition_cleared_at: string | null;
  occurrence_count: number;
  synthetic: boolean;
  observed_value: number | null;
  threshold_value: number | null;
  value_unit: string | null;
};

type AlertDetail = AlertRow & {
  status_history?: Array<{
    id: string;
    previous_status: AlertStatus | null;
    new_status: AlertStatus;
    reason: string;
    note: string;
    transition_at: string;
  }>;
  admin_notes?: Array<{ id: string; reason: string; note: string; created_at: string }>;
  audit_history?: Array<{ id: string; action: string; created_at: string }>;
};

type PhysicalHealth = {
  id: string;
  device_code: string;
  status: string;
  gps_readiness: string | null;
  gsm_readiness: string | null;
  external_power_status: string | null;
  battery_status: string | null;
  last_heartbeat_at: string | null;
  last_telemetry_at: string | null;
};

type PhoneHealth = {
  id: string;
  status: string;
  tracking_health_status: string;
  last_update_at: string | null;
  last_successful_sync_at: string | null;
  client_pending_point_count: number;
};

const statusOptions: readonly AlertStatus[] = [
  "new", "acknowledged", "investigating", "resolved", "false_alarm", "ignored",
];
const severityOptions: readonly AlertSeverity[] = ["info", "warning", "critical"];

function headers(connection: M22AdminConnection, json = false): Record<string, string> {
  return {
    apikey: connection.anonKey,
    authorization: `Bearer ${connection.accessToken}`,
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

async function readJson<T>(response: Response, message: string): Promise<T> {
  if (!response.ok) throw new Error(message);
  return response.json() as Promise<T>;
}

async function callRpc<T>(
  connection: M22AdminConnection,
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  return readJson<T>(
    await fetch(`${connection.url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: headers(connection, true),
      body: JSON.stringify(body),
    }),
    "The M22 admin request could not be completed.",
  );
}

function label(value: string | null | undefined): string {
  return value ? value.replaceAll("_", " ").replace(/\b\w/g, (part) => part.toUpperCase()) : "Not recorded";
}

function time(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : "Not recorded";
}

function liveLabel(value: string | null): string {
  if (!value) return "No live evidence";
  const age = Date.now() - Date.parse(value);
  return Number.isFinite(age) && age <= 120_000 ? "Live" : "Last live evidence is delayed";
}

export function TrackingHealthView({ connection }: { connection: M22AdminConnection }) {
  const [physical, setPhysical] = useState<PhysicalHealth[]>([]);
  const [phone, setPhone] = useState<PhoneHealth[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [physicalRows, phoneRows, alertRows] = await Promise.all([
        readJson<PhysicalHealth[]>(
          await fetch(
            `${connection.url}/rest/v1/gps_device_admin_list?select=id,device_code,status,gps_readiness,gsm_readiness,external_power_status,battery_status,last_heartbeat_at,last_telemetry_at&order=last_telemetry_at.desc.nullslast&limit=100`,
            { headers: headers(connection) },
          ),
          "Physical-device health could not be loaded.",
        ),
        readJson<PhoneHealth[]>(
          await fetch(
            `${connection.url}/rest/v1/tracking_sessions?select=id,status,tracking_health_status,last_update_at,last_successful_sync_at,client_pending_point_count&tracking_mode=eq.phone&order=last_update_at.desc.nullslast&limit=100`,
            { headers: headers(connection) },
          ),
          "Phone Location Proof health could not be loaded.",
        ),
        callRpc<AlertRow[]>(connection, "admin_list_m22_alerts", {
          p_status: null, p_severity: null, p_rule_id: null, p_source: null,
          p_gps_device_id: null, p_vehicle_id: null, p_ad_work_id: null,
          p_synthetic: null, p_condition_active: true, p_limit: 100,
        }),
      ]);
      setPhysical(physicalRows);
      setPhone(phoneRows);
      setAlerts(alertRows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Tracking Health could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [connection.url, connection.accessToken]);
  const critical = alerts.filter((row) => row.severity === "critical").length;
  return <section className="m22-admin-view" aria-labelledby="tracking-health-title">
    <div className="panel-heading">
      <div><h2 id="tracking-health-title">Tracking Health</h2><p>Phone and physical-device evidence stay source-specific.</p></div>
      <button className="secondary-button" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={18} /> Refresh</button>
    </div>
    <div className="m22-health-summary" aria-label="Tracking Health summary">
      <article><span>Physical devices</span><strong>{physical.length}</strong><small>Current device health only</small></article>
      <article><span>Phone sessions</span><strong>{phone.length}</strong><small>Phone Location Proof only</small></article>
      <article><span>Active alerts</span><strong>{alerts.length}</strong><small>{critical} critical</small></article>
      <article><span>Comparison</span><strong>Not evaluated</strong><small>Planned for M23</small></article>
    </div>
    <p className="m22-boundary"><ShieldCheck size={18} /> Sources are not paired. No phone/device distance or mismatch is calculated in M22.</p>
    {error && <p className="form-alert" role="alert">{error}</p>}
    <div className="m22-source-grid">
      <section><h3>Physical-device health</h3>{physical.map((row) => <article className="m22-health-row" key={row.id}>
        <div><strong>{row.device_code}</strong><span className="status-pill">{label(row.status)}</span></div>
        <dl><div><dt>Freshness</dt><dd>{liveLabel(row.last_heartbeat_at)}</dd></div><div><dt>Latest live heartbeat</dt><dd>{time(row.last_heartbeat_at)}</dd></div><div><dt>Latest live telemetry</dt><dd>{time(row.last_telemetry_at)}</dd></div><div><dt>Battery / power</dt><dd>{label(row.battery_status)} / {label(row.external_power_status)}</dd></div><div><dt>GPS / GSM</dt><dd>{label(row.gps_readiness)} / {label(row.gsm_readiness)}</dd></div></dl>
      </article>)}{!loading && physical.length === 0 && <p className="empty-state">No physical-device health is available.</p>}</section>
      <section><h3>Phone Location Proof health</h3>{phone.map((row) => <article className="m22-health-row" key={row.id}>
        <div><strong>Phone Location Proof</strong><span className="status-pill">{label(row.status)}</span></div>
        <dl><div><dt>Health</dt><dd>{label(row.tracking_health_status)}</dd></div><div><dt>Freshness</dt><dd>{liveLabel(row.last_update_at)}</dd></div><div><dt>Last update</dt><dd>{time(row.last_update_at)}</dd></div><div><dt>Last sync</dt><dd>{time(row.last_successful_sync_at)}</dd></div><div><dt>Pending updates</dt><dd>{row.client_pending_point_count}</dd></div></dl>
      </article>)}{!loading && phone.length === 0 && <p className="empty-state">No Phone Location Proof health is available.</p>}</section>
    </div>
  </section>;
}

function AlertDetailPanel({
  connection, alertId, onChanged,
}: { connection: M22AdminConnection; alertId: string; onChanged: () => void }) {
  const [detail, setDetail] = useState<AlertDetail | null>(null);
  const [showTechnical, setShowTechnical] = useState(false);
  const [targetStatus, setTargetStatus] = useState<AlertStatus>("acknowledged");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const rows = await callRpc<AlertDetail[] | AlertDetail>(connection, "admin_get_m22_alert_detail", { p_alert_id: alertId });
      setDetail(Array.isArray(rows) ? rows[0] ?? null : rows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Alert detail could not be loaded.");
    }
  }
  useEffect(() => { void load(); }, [alertId, connection.accessToken]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const safeReason = reason.trim();
    const safeNote = note.trim();
    if (!safeReason || !safeNote) {
      setError("A safe reason and note are required.");
      return;
    }
    if (!window.confirm(`Confirm alert lifecycle change to ${label(targetStatus)}?`)) return;
    setBusy(true);
    setError("");
    try {
      await callRpc(connection, "admin_transition_alert", {
        p_alert_id: alertId, p_new_status: targetStatus, p_reason: safeReason, p_note: safeNote,
      });
      setReason("");
      setNote("");
      await load();
      onChanged();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Alert lifecycle change failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!detail) return <section className="m22-alert-detail"><p>{error || "Loading alert detail..."}</p></section>;
  return <section className="m22-alert-detail" aria-labelledby="m22-alert-detail-title">
    <h3 id="m22-alert-detail-title">{detail.title || label(detail.rule_id)}</h3>
    <p>{detail.message}</p>
    <dl className="detail-grid">
      <div><dt>Status</dt><dd>{label(detail.status)}</dd></div><div><dt>Severity</dt><dd>{label(detail.severity)}</dd></div>
      <div><dt>Source</dt><dd>{label(detail.source)}</dd></div><div><dt>Rule version</dt><dd>{detail.rule_version || "Legacy"}</dd></div>
      <div><dt>First detected</dt><dd>{time(detail.first_detected_at)}</dd></div><div><dt>Last detected</dt><dd>{time(detail.last_detected_at)}</dd></div>
      <div><dt>Occurrences</dt><dd>{detail.occurrence_count}</dd></div><div><dt>Condition</dt><dd>{detail.condition_active ? "Active" : `Cleared ${time(detail.condition_cleared_at)}`}</dd></div>
    </dl>
    <button className="secondary-button" type="button" aria-expanded={showTechnical} onClick={() => setShowTechnical((value) => !value)}>
      {showTechnical ? "Hide technical values" : "Show technical values"}
    </button>
    {showTechnical && <dl className="detail-grid m22-technical-values">
      <div><dt>Observed value</dt><dd>{detail.observed_value ?? "Not recorded"} {detail.value_unit ?? ""}</dd></div>
      <div><dt>Policy threshold</dt><dd>{detail.threshold_value ?? "Not recorded"} {detail.value_unit ?? ""}</dd></div>
    </dl>}
    <p className="quiet-note">Coordinates, credentials, raw payloads, and authentication hints are not available in this view.</p>
    <form className="form-section" onSubmit={submit}><h4>Lifecycle action</h4>
      <label>Action<select value={targetStatus} onChange={(event) => setTargetStatus(event.target.value as AlertStatus)}>
        <option value="acknowledged">Acknowledge</option><option value="investigating">Start investigation</option>
        <option value="resolved">Resolve</option><option value="false_alarm">Mark false alarm</option><option value="ignored">Ignore</option>
      </select></label>
      <label>Reason<input value={reason} maxLength={160} onChange={(event) => setReason(event.target.value)} required /></label>
      <label>Safe admin note<textarea value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} required /></label>
      {error && <p className="form-alert" role="alert">{error}</p>}
      <button className="primary-button" disabled={busy}>{busy ? "Saving..." : "Confirm lifecycle action"}</button>
    </form>
    <section><h4>Lifecycle history</h4>{detail.status_history?.map((entry) => <article key={entry.id}><strong>{label(entry.new_status)}</strong><span>{time(entry.transition_at)}</span><p>{entry.reason}: {entry.note}</p></article>) ?? <p>No lifecycle history returned.</p>}</section>
    <section><h4>Admin notes</h4>{detail.admin_notes?.map((entry) => <article key={entry.id}><strong>{entry.reason}</strong><span>{time(entry.created_at)}</span><p>{entry.note}</p></article>) ?? <p>No admin notes returned.</p>}</section>
    <section><h4>Audit history</h4>{detail.audit_history?.map((entry) => <article key={entry.id}><strong>{label(entry.action)}</strong><span>{time(entry.created_at)}</span></article>) ?? <p>No audit history returned.</p>}</section>
  </section>;
}

export function AlertsView({ connection }: { connection: M22AdminConnection }) {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [rule, setRule] = useState("");
  const [source, setSource] = useState("all");
  const [condition, setCondition] = useState("all");
  const [synthetic, setSynthetic] = useState("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const rows = await callRpc<AlertRow[]>(connection, "admin_list_m22_alerts", {
        p_status: status === "all" ? null : status,
        p_severity: severity === "all" ? null : severity,
        p_rule_id: rule.trim() || null,
        p_source: source === "all" ? null : source,
        p_gps_device_id: null, p_vehicle_id: null, p_ad_work_id: null,
        p_synthetic: synthetic === "all" ? null : synthetic === "yes",
        p_condition_active: condition === "all" ? null : condition === "active",
        p_limit: 100,
      });
      setAlerts(rows);
      setSelectedId((current) => current && rows.some((row) => row.id === current) ? current : rows[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Alerts could not be loaded.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, [connection.accessToken, status, severity, source, condition, synthetic]);

  const queues = useMemo(() => ({
    new: alerts.filter((row) => row.status === "new").length,
    critical: alerts.filter((row) => row.severity === "critical" && row.condition_active).length,
    investigating: alerts.filter((row) => row.status === "investigating").length,
    cleared: alerts.filter((row) => !row.condition_active && !["resolved", "false_alarm", "ignored"].includes(row.status)).length,
    recent: alerts.filter((row) => row.status === "resolved").length,
  }), [alerts]);

  return <section className="m22-admin-view" aria-labelledby="alerts-title">
    <div className="panel-heading"><div><h2 id="alerts-title">Alerts</h2><p>Internal deterministic operational review. No customer notification is sent.</p></div><button className="secondary-button" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={18} /> Refresh</button></div>
    <div className="m22-alert-queues" aria-label="Alert queues">
      <article><span>New</span><strong>{queues.new}</strong></article><article><span>Critical active</span><strong>{queues.critical}</strong></article>
      <article><span>Investigating</span><strong>{queues.investigating}</strong></article><article><span>Cleared, awaiting review</span><strong>{queues.cleared}</strong></article>
      <article><span>Resolved recently</span><strong>{queues.recent}</strong></article>
    </div>
    <div className="admin-filter-grid" aria-label="Alert filters">
      <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All</option>{statusOptions.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
      <label>Severity<select value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="all">All</option>{severityOptions.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
      <label>Rule/type<input value={rule} onChange={(event) => setRule(event.target.value)} onBlur={() => void load()} placeholder="Rule ID" /></label>
      <label>Source<select value={source} onChange={(event) => setSource(event.target.value)}><option value="all">All</option><option value="physical_device_live">Physical device Â· live</option><option value="physical_device_delayed">Physical device Â· delayed/historical</option><option value="health_sweep">Health sweep</option><option value="adapter_rejection">Adapter rejection</option><option value="authentication_failure">Authentication failure</option></select></label>
      <label>Condition<select value={condition} onChange={(event) => setCondition(event.target.value)}><option value="all">All</option><option value="active">Active</option><option value="cleared">Cleared</option></select></label>
      <label>Evidence<select value={synthetic} onChange={(event) => setSynthetic(event.target.value)}><option value="all">All</option><option value="no">Non-synthetic</option><option value="yes">Synthetic</option></select></label>
    </div>
    {error && <p className="form-alert" role="alert">{error}</p>}
    <div className="m22-alert-layout"><section className="m22-alert-list">{alerts.map((row) => <button key={row.id} className={selectedId === row.id ? "is-selected" : ""} type="button" onClick={() => setSelectedId(row.id)}>
      <div><AlertTriangle size={17} /><strong>{row.title || label(row.rule_id)}</strong><span className={`m22-severity ${row.severity}`}>{label(row.severity)}</span></div>
      <p>{label(row.source)} Â· {row.device_label || "Device not recorded"} Â· {row.vehicle_label || "Vehicle not recorded"}</p>
      <small>{label(row.status)} Â· {row.condition_active ? "Condition active" : "Condition cleared"} Â· {row.occurrence_count} occurrence(s) Â· {row.rule_version || "Legacy"}</small>
      <time>{time(row.last_detected_at)}</time>
    </button>)}{!loading && alerts.length === 0 && <p className="empty-state">No alerts match these filters.</p>}</section>
    {selectedId ? <AlertDetailPanel connection={connection} alertId={selectedId} onChanged={() => void load()} /> : <section className="m22-alert-detail empty-state">Select an alert to review it.</section>}</div>
  </section>;
}

export function DeviceM22HealthPanel({
  connection, deviceId,
}: { connection: M22AdminConnection; deviceId: string }) {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [health, setHealth] = useState<PhysicalHealth | null>(null);
  useEffect(() => {
    void Promise.all([
      fetch(`${connection.url}/rest/v1/gps_device_admin_list?select=id,device_code,status,gps_readiness,gsm_readiness,external_power_status,battery_status,last_heartbeat_at,last_telemetry_at&id=eq.${encodeURIComponent(deviceId)}&limit=1`, { headers: headers(connection) })
        .then((response) => readJson<PhysicalHealth[]>(response, "Device health could not be loaded.")),
      callRpc<AlertRow[]>(connection, "admin_list_m22_alerts", {
        p_status: null, p_severity: null, p_rule_id: null, p_source: null,
        p_gps_device_id: deviceId, p_vehicle_id: null, p_ad_work_id: null,
        p_synthetic: null, p_condition_active: null, p_limit: 20,
      }),
    ]).then(([healthRows, alertRows]) => { setHealth(healthRows[0] ?? null); setAlerts(alertRows); }).catch(() => undefined);
  }, [connection.accessToken, deviceId]);
  const active = alerts.filter((row) => row.condition_active);
  const highest = active.some((row) => row.severity === "critical") ? "Critical" : active.some((row) => row.severity === "warning") ? "Warning" : active.length ? "Info" : "None";
  const delayed = alerts.filter((row) => row.source === "physical_device_delayed").length;
  return <section className="form-section m22-device-health" aria-labelledby="m22-device-health-title">
    <h3 id="m22-device-health-title"><HeartPulse size={19} /> Current Tracking Health</h3>
    <p>Active registry status is not the same as Healthy or Proof Ready.</p>
    <dl className="detail-grid">
      <div><dt>Current health</dt><dd>{health ? liveLabel(health.last_heartbeat_at) : "Not available"}</dd></div>
      <div><dt>Latest live heartbeat</dt><dd>{time(health?.last_heartbeat_at)}</dd></div>
      <div><dt>Latest live telemetry</dt><dd>{time(health?.last_telemetry_at)}</dd></div>
      <div><dt>Battery / power</dt><dd>{label(health?.battery_status)} / {label(health?.external_power_status)}</dd></div>
      <div><dt>GPS / GSM</dt><dd>{label(health?.gps_readiness)} / {label(health?.gsm_readiness)}</dd></div>
      <div><dt>Active alerts</dt><dd>{active.length}</dd></div><div><dt>Highest severity</dt><dd>{highest}</dd></div>
      <div><dt>Delayed evidence summary</dt><dd>{delayed} recent alert episode(s); delayed evidence is historical and never marks current health healthy.</dd></div>
    </dl>
    <h4>Recent alert episodes</h4>{alerts.slice(0, 5).map((row) => <article key={row.id}><strong>{row.title || label(row.rule_id)}</strong><span>{label(row.status)} Â· {row.rule_version || "Legacy"} Â· {time(row.last_detected_at)}</span></article>)}
  </section>;
}
