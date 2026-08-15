import { useEffect, useMemo, useRef, useState } from "react";
import { Download, RefreshCw, ShieldCheck } from "lucide-react";
import {
  normalizeOperationsExportLimit,
  operationsExportFormats,
  operationsExportScopeContainsPii,
  operationsExportScopeLabels,
  operationsExportScopes,
  serializeOperationsCsv,
  serializeOperationsJson,
  validateOperationsExportEnvelope,
} from "@kootha/shared";
import type {
  OperationsExportEnvelope,
  OperationsExportFormat,
  OperationsExportReceipt,
  OperationsExportScope,
} from "@kootha/shared";

export type AdminOperationsConnection = {
  url: string;
  anonKey: string;
  accessToken: string;
};

type AuditRecord = {
  id: string;
  actor_type: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
  safe_details: Record<string, unknown>;
};

type AuditEnvelope = {
  records: AuditRecord[];
  nextCursor: { createdAt: string; id: string } | null;
};

const statusOptions: Record<OperationsExportScope, readonly string[]> = {
  enquiries: ["new", "contacted", "converted", "rejected", "quoted", "follow_up_needed", "not_interested", "invalid_spam"],
  ad_works: ["draft", "planned", "ready_for_driver_assignment", "on_hold", "cancelled"],
  drivers: ["pending_review", "approved", "inactive", "blocked"],
  vehicles: ["pending_review", "approved", "inactive", "blocked"],
  devices: ["pending_setup", "active", "offline", "not_working", "suspended", "removed", "retired"],
  audit: [],
};

function headers(connection: AdminOperationsConnection) {
  return {
    apikey: connection.anonKey,
    Authorization: `Bearer ${connection.accessToken}`,
    "Content-Type": "application/json",
  };
}

function expireSessionIfNeeded(response: Response) {
  if (response.status === 401 || response.status === 403) {
    window.dispatchEvent(new Event("kootha:admin-session-expired"));
  }
}

async function postRpc<T>(connection: AdminOperationsConnection, rpc: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${connection.url}/rest/v1/rpc/${rpc}`, {
    method: "POST",
    headers: headers(connection),
    body: JSON.stringify(body),
  });
  expireSessionIfNeeded(response);
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: unknown; details?: unknown; hint?: unknown } | null;
    const message = typeof payload?.message === "string"
      ? payload.message
      : typeof payload?.details === "string"
        ? payload.details
        : typeof payload?.hint === "string"
          ? payload.hint
          : "The governed operations request failed.";
    throw new Error(message);
  }
  return await response.json() as T;
}

function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function displayCell(value: unknown) {
  if (value == null || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function dateBoundary(value: string, endOfDay: boolean): string | null {
  if (!value) return null;
  const parsed = new Date(value + (endOfDay ? "T23:59:59.999" : "T00:00:00.000"));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function downloadEnvelope(envelope: OperationsExportEnvelope) {
  const now = new Date();
  const day = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const content = envelope.format === "csv"
    ? serializeOperationsCsv(envelope.columns, envelope.rows)
    : serializeOperationsJson(envelope);
  const mime = envelope.format === "csv"
    ? "text/csv;charset=utf-8"
    : "application/json;charset=utf-8";
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `kootha-${envelope.scope}-${day}.${envelope.format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function OperationsExportView({ connection }: { connection: AdminOperationsConnection }) {
  const [scope, setScope] = useState<OperationsExportScope>("enquiries");
  const [format, setFormat] = useState<OperationsExportFormat>("csv");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [city, setCity] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [limit, setLimit] = useState(200);
  const [result, setResult] = useState<OperationsExportEnvelope | null>(null);
  const [receipts, setReceipts] = useState<OperationsExportReceipt[]>([]);
  const [busy, setBusy] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);
  const receiptSequence = useRef(0);

  const statuses = statusOptions[scope];
  const supportsCity = scope !== "devices" && scope !== "audit";
  const containsPii = operationsExportScopeContainsPii[scope];

  useEffect(() => {
    requestSequence.current += 1;
    setResult(null);
    setError("");
    setStatus("");
    if (!supportsCity) setCity("");
  }, [scope, format, supportsCity]);

  async function loadReceipts() {
    const requestId = ++receiptSequence.current;
    setReceiptBusy(true);
    try {
      const rows = await postRpc<OperationsExportReceipt[]>(
        connection,
        "admin_list_operations_export_receipts_v1",
        { p_limit: 50, p_cursor_created_at: null, p_cursor_id: null },
      );
      if (requestId === receiptSequence.current) setReceipts(rows);
    } catch (loadError) {
      if (requestId === receiptSequence.current) {
        setError(loadError instanceof Error ? loadError.message : "Could not load export receipts.");
      }
    } finally {
      if (requestId === receiptSequence.current) setReceiptBusy(false);
    }
  }

  useEffect(() => {
    void loadReceipts();
    return () => {
      receiptSequence.current += 1;
    };
  }, [connection.accessToken, connection.anonKey, connection.url]);

  async function generatePreview() {
    const requestId = ++requestSequence.current;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const envelope = await postRpc<unknown>(connection, "admin_export_operations_v1", {
        p_scope: scope,
        p_format: format,
        p_search: search.trim() || null,
        p_status: status || null,
        p_city: supportsCity ? city.trim() || null : null,
        p_date_from: dateBoundary(dateFrom, false),
        p_date_to: dateBoundary(dateTo, true),
        p_limit: normalizeOperationsExportLimit(limit),
      });
      if (requestId !== requestSequence.current) return;
      if (!validateOperationsExportEnvelope(envelope)) {
        throw new Error("The server returned an invalid governed-export contract.");
      }
      setResult(envelope);
      void loadReceipts();
    } catch (exportError) {
      if (requestId === requestSequence.current) {
        setError(exportError instanceof Error ? exportError.message : "Could not generate export preview.");
      }
    } finally {
      if (requestId === requestSequence.current) setBusy(false);
    }
  }

  return (
    <section className="admin-operations-view" aria-labelledby="operations-export-title">
      <div className="panel-heading">
        <div>
          <h2 id="operations-export-title">Governed operations export</h2>
          <p>Generate an admin-authorized preview first. Export payloads are never stored in Kootha.</p>
        </div>
        <ShieldCheck size={22} aria-hidden="true" />
      </div>

      <div className="admin-filter-grid" aria-label="Governed export filters">
        <label>
          Scope
          <select value={scope} onChange={(event) => setScope(event.target.value as OperationsExportScope)}>
            {operationsExportScopes.map((option) => (
              <option value={option} key={option}>{operationsExportScopeLabels[option]}</option>
            ))}
          </select>
        </label>
        <label>
          Format
          <select value={format} onChange={(event) => setFormat(event.target.value as OperationsExportFormat)}>
            {operationsExportFormats.map((option) => <option value={option} key={option}>{option.toUpperCase()}</option>)}
          </select>
        </label>
        <label>
          Search
          <input value={search} maxLength={120} onChange={(event) => setSearch(event.target.value)} placeholder="Server-filtered search" />
        </label>
        {statuses.length > 0 && (
          <label>
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">All statuses</option>
              {statuses.map((option) => <option value={option} key={option}>{option.replaceAll("_", " ")}</option>)}
            </select>
          </label>
        )}
        {supportsCity && (
          <label>
            City / town
            <input value={city} maxLength={120} onChange={(event) => setCity(event.target.value)} />
          </label>
        )}
        <label>
          From date
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        </label>
        <label>
          To date
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </label>
        <label>
          Row limit
          <input type="number" min="1" max="500" value={limit} onChange={(event) => setLimit(normalizeOperationsExportLimit(event.target.value))} />
        </label>
      </div>

      <p className="quiet-note">
        {containsPii
          ? "This scope contains contact PII. Every generated export is receipt-audited."
          : "This scope is privacy-bounded and excludes contact PII, coordinates, proof paths and secrets."}
      </p>

      <div className="admin-action-row">
        <button className="primary-button" type="button" onClick={() => void generatePreview()} disabled={busy}>
          {busy ? "Generating..." : "Generate preview"}
        </button>
        <button className="secondary-button" type="button" disabled={!result || busy} onClick={() => result && downloadEnvelope(result)}>
          <Download size={18} aria-hidden="true" /> Download current result
        </button>
      </div>

      {error && <p className="form-alert admin-message" role="alert">{error}</p>}

      {result && (
        <section className="form-section">
          <div className="panel-heading">
            <div>
              <h3>Authoritative preview</h3>
              <p>{result.rowCount} row{result.rowCount === 1 ? "" : "s"} · {result.truncated ? "more rows exist beyond the server cap" : "complete within the selected cap"}</p>
            </div>
            <span className="status-pill">{result.format.toUpperCase()}</span>
          </div>
          <div className="admin-table-scroll">
            <table className="admin-data-table">
              <thead>
                <tr>{result.columns.map((column) => <th key={column}>{column.replaceAll("_", " ")}</th>)}</tr>
              </thead>
              <tbody>
                {result.rows.slice(0, 25).map((row, rowIndex) => (
                  <tr key={`${result.receiptId}-${rowIndex}`}>
                    {result.columns.map((column) => <td key={column}>{displayCell(row[column])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.rowCount > 25 && <p className="quiet-note">Preview shows the first 25 rows; download contains all {result.rowCount} returned rows.</p>}
          <p className="quiet-note">Receipt {result.receiptId} · generated {formatTime(result.generatedAt)}</p>
        </section>
      )}

      <section className="form-section">
        <div className="panel-heading">
          <div><h3>Recent export receipts</h3><p>Metadata only; exported rows are never retained here.</p></div>
          <button className="secondary-button" type="button" disabled={receiptBusy} onClick={() => void loadReceipts()}>
            <RefreshCw size={18} aria-hidden="true" /> Refresh
          </button>
        </div>
        <div className="audit-list">
          {receipts.map((receipt) => (
            <article key={receipt.id}>
              <div>
                <strong>{operationsExportScopeLabels[receipt.scope]} · {receipt.format.toUpperCase()}</strong>
                <span>{receipt.row_count} rows{receipt.contains_pii ? " · PII scope" : ""}{receipt.truncated ? " · truncated" : ""}</span>
              </div>
              <time dateTime={receipt.created_at}>{formatTime(receipt.created_at)}</time>
            </article>
          ))}
          {!receiptBusy && receipts.length === 0 && <p className="empty-state">No governed exports have been generated yet.</p>}
        </div>
      </section>
    </section>
  );
}

export function OperationsAuditWorkbench({ connection }: { connection: AdminOperationsConnection }) {
  const [actorType, setActorType] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<AuditEnvelope["nextCursor"]>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);

  const normalizedSummary = useMemo(
    () => [actorType, action.trim(), entityType.trim(), search.trim(), dateFrom, dateTo].filter(Boolean).length,
    [actorType, action, entityType, search, dateFrom, dateTo],
  );

  async function loadAudit(append = false) {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError("");
    try {
      const envelope = await postRpc<AuditEnvelope>(connection, "admin_get_operations_audit_v1", {
        p_actor_type: actorType || null,
        p_action: action.trim() || null,
        p_entity_type: entityType.trim() || null,
        p_search: search.trim() || null,
        p_date_from: dateBoundary(dateFrom, false),
        p_date_to: dateBoundary(dateTo, true),
        p_limit: 50,
        p_cursor_created_at: append ? nextCursor?.createdAt ?? null : null,
        p_cursor_id: append ? nextCursor?.id ?? null : null,
      });
      if (requestId !== requestSequence.current) return;
      const page = Array.isArray(envelope.records) ? envelope.records : [];
      setRecords((current) => append ? [...current, ...page] : page);
      setNextCursor(envelope.nextCursor ?? null);
    } catch (loadError) {
      if (requestId === requestSequence.current) {
        setError(loadError instanceof Error ? loadError.message : "Could not load activity history.");
      }
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }

  useEffect(() => {
    void loadAudit(false);
    return () => {
      requestSequence.current += 1;
    };
  }, [connection.accessToken, connection.anonKey, connection.url]);

  return (
    <section className="admin-audit-view" aria-labelledby="audit-title">
      <div className="panel-heading">
        <div>
          <h2 id="audit-title">Activity history</h2>
          <p>Safe operational metadata only. {normalizedSummary ? `${normalizedSummary} filter${normalizedSummary === 1 ? "" : "s"} active.` : "No filters active."}</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void loadAudit(false)} disabled={loading}>
          <RefreshCw size={18} aria-hidden="true" /> Refresh
        </button>
      </div>
      <div className="admin-filter-grid" aria-label="Activity history filters">
        <label>
          Actor type
          <select value={actorType} onChange={(event) => setActorType(event.target.value)}>
            <option value="">All actors</option>
            <option value="admin">Admin</option>
            <option value="driver">Driver</option>
            <option value="system">System</option>
          </select>
        </label>
        <label>Action<input value={action} maxLength={120} onChange={(event) => setAction(event.target.value)} /></label>
        <label>Entity type<input value={entityType} maxLength={120} onChange={(event) => setEntityType(event.target.value)} /></label>
        <label>Reference search<input value={search} maxLength={120} onChange={(event) => setSearch(event.target.value)} placeholder="Action, entity or UUID" /></label>
        <label>From date<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
        <label>To date<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
      </div>
      <div className="admin-action-row">
        <button className="primary-button" type="button" onClick={() => void loadAudit(false)} disabled={loading}>
          {loading ? "Loading..." : "Apply filters"}
        </button>
      </div>
      {error && <p className="form-alert" role="alert">{error}</p>}
      {!loading && records.length === 0 && <p className="empty-state">No recorded activity matches these filters.</p>}
      <div className="audit-list">
        {records.map((record) => (
          <article key={record.id}>
            <div>
              <strong>{record.action.replaceAll("_", " ")}</strong>
              <span>{record.actor_type} · {record.entity_type}{record.entity_id ? ` · ${record.entity_id}` : ""}</span>
              {record.safe_details && Object.keys(record.safe_details).length > 0 && (
                <details>
                  <summary>Safe details</summary>
                  <pre>{JSON.stringify(record.safe_details, null, 2)}</pre>
                </details>
              )}
            </div>
            <time dateTime={record.created_at}>{formatTime(record.created_at)}</time>
          </article>
        ))}
      </div>
      {nextCursor && (
        <button className="secondary-button" type="button" onClick={() => void loadAudit(true)} disabled={loading}>
          Load older activity
        </button>
      )}
    </section>
  );
}
