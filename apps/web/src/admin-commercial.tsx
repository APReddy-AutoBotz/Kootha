import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Copy, RefreshCw, ShieldCheck } from "lucide-react";
import {
  commercialScheduleFingerprint,
  formatMoney,
  paymentStatusLabels,
  paymentStatuses,
  validateCommercialHistoryPage,
  validateCommercialScheduleSnapshot,
  validatePaymentDraft,
} from "@kootha/shared";
import type {
  CommercialEvent,
  CommercialEventPageMetadata,
  CommercialScheduleSnapshot,
  PaymentStatus,
} from "@kootha/shared";

export type CommercialScheduleConnection = {
  url: string;
  anonKey: string;
  accessToken: string;
};

export type CommercialScheduleAdWorkOption = {
  id: string;
  title: string;
  businessName?: string | null;
};

type MutationEnvelope = {
  snapshot: unknown;
  customerMessage?: unknown;
};

function headers(connection: CommercialScheduleConnection) {
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

async function postRpc<T>(
  connection: CommercialScheduleConnection,
  rpc: string,
  body: Record<string, unknown>,
): Promise<T> {
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
          : "The commercial and schedule request failed.";
    throw new Error(message);
  }
  return await response.json() as T;
}

function toAmount(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function displayDate(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

function displayTime(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

export function CommercialScheduleWorkbench({
  connection,
  adWorks,
}: {
  connection: CommercialScheduleConnection;
  adWorks: CommercialScheduleAdWorkOption[];
}) {
  const [selectedAdWorkId, setSelectedAdWorkId] = useState("");
  const [snapshot, setSnapshot] = useState<CommercialScheduleSnapshot | null>(null);
  const [commercialHistoryEvents, setCommercialHistoryEvents] = useState<CommercialEvent[]>([]);
  const [commercialHistoryPage, setCommercialHistoryPage] = useState<CommercialEventPageMetadata | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [customerMessage, setCustomerMessage] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("not_paid");
  const [totalAmount, setTotalAmount] = useState("0");
  const [paidAmount, setPaidAmount] = useState("0");
  const [commercialNote, setCommercialNote] = useState("");
  const [newStartDate, setNewStartDate] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [selectedDayId, setSelectedDayId] = useState("");
  const [newDayDate, setNewDayDate] = useState("");
  const [dayReason, setDayReason] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");
  const [cancellationInternalNote, setCancellationInternalNote] = useState("");
  const requestSequence = useRef(0);
  const selectedAdWorkRef = useRef(selectedAdWorkId);

  useEffect(() => {
    selectedAdWorkRef.current = selectedAdWorkId;
    requestSequence.current += 1;
    setSnapshot(null);
    setCommercialHistoryEvents([]);
    setCommercialHistoryPage(null);
    setError("");
    setCustomerMessage("");
    setSelectedDayId("");
    setNewDayDate("");
  }, [selectedAdWorkId]);

  const snapshotFingerprint = useMemo(() => snapshot
    ? commercialScheduleFingerprint(snapshot.adWork.id, snapshot.adWork.commercialVersion, snapshot.adWork.scheduleVersion)
    : null, [snapshot]);

  function applySnapshot(next: unknown, requestId: number, adWorkId: string) {
    if (requestId !== requestSequence.current || adWorkId !== selectedAdWorkRef.current) return false;
    if (!validateCommercialScheduleSnapshot(next)) {
      throw new Error("The server returned an invalid commercial/schedule contract.");
    }
    setSnapshot(next);
    setCommercialHistoryEvents(next.commercialEvents);
    setCommercialHistoryPage(next.commercialEventsPage);
    setPaymentStatus(next.adWork.paymentStatus);
    setTotalAmount(String(next.adWork.totalAmount));
    setPaidAmount(String(next.adWork.paidAmount));
    setCommercialNote(next.adWork.commercialNote ?? "");
    setNewStartDate("");
    return true;
  }

  async function loadSnapshot() {
    if (!selectedAdWorkId) return;
    const adWorkId = selectedAdWorkId;
    const requestId = ++requestSequence.current;
    setBusy(true);
    setError("");
    setCustomerMessage("");
    try {
      const next = await postRpc<unknown>(connection, "admin_get_commercial_schedule_v1", {
        p_ad_work_id: adWorkId,
      });
      applySnapshot(next, requestId, adWorkId);
    } catch (loadError) {
      if (requestId === requestSequence.current && adWorkId === selectedAdWorkRef.current) {
        setError(loadError instanceof Error ? loadError.message : "Could not load commercial/schedule state.");
      }
    } finally {
      if (requestId === requestSequence.current && adWorkId === selectedAdWorkRef.current) setBusy(false);
    }
  }

  useEffect(() => {
    if (selectedAdWorkId) void loadSnapshot();
    return () => {
      requestSequence.current += 1;
    };
  }, [selectedAdWorkId, connection.accessToken, connection.anonKey, connection.url]);

  async function loadOlderCommercialHistory() {
    if (!snapshot || !commercialHistoryPage?.hasMore || commercialHistoryPage.nextBeforeVersion === null) return;
    const adWorkId = snapshot.adWork.id;
    const expectedFingerprint = snapshotFingerprint;
    const beforeVersion = commercialHistoryPage.nextBeforeVersion;
    const requestId = ++requestSequence.current;
    setBusy(true);
    setError("");
    try {
      const next = await postRpc<unknown>(connection, "admin_list_ad_work_commercial_events_v1", {
        p_ad_work_id: adWorkId,
        p_before_version: beforeVersion,
        p_limit: 20,
      });
      if (requestId !== requestSequence.current
        || adWorkId !== selectedAdWorkRef.current
        || expectedFingerprint !== snapshotFingerprint) return;
      if (!validateCommercialHistoryPage(next)) {
        throw new Error("The server returned an invalid commercial-history page.");
      }
      setCommercialHistoryEvents((current) => {
        const seen = new Set(current.map((event) => event.id));
        return [...current, ...next.events.filter((event) => !seen.has(event.id))];
      });
      setCommercialHistoryPage(next.page);
    } catch (historyError) {
      if (requestId === requestSequence.current && adWorkId === selectedAdWorkRef.current) {
        setError(historyError instanceof Error ? historyError.message : "Could not load older commercial history.");
      }
    } finally {
      if (requestId === requestSequence.current && adWorkId === selectedAdWorkRef.current) setBusy(false);
    }
  }

  async function runMutation(rpc: string, body: Record<string, unknown>) {
    if (!snapshot) return;
    const adWorkId = snapshot.adWork.id;
    const expectedFingerprint = snapshotFingerprint;
    const requestId = ++requestSequence.current;
    setBusy(true);
    setError("");
    setCustomerMessage("");
    try {
      const envelope = await postRpc<MutationEnvelope>(connection, rpc, body);
      if (requestId !== requestSequence.current
        || adWorkId !== selectedAdWorkRef.current
        || expectedFingerprint !== snapshotFingerprint) return;
      if (!applySnapshot(envelope.snapshot, requestId, adWorkId)) return;
      if (typeof envelope.customerMessage === "string") setCustomerMessage(envelope.customerMessage);
    } catch (mutationError) {
      if (requestId === requestSequence.current && adWorkId === selectedAdWorkRef.current) {
        setError(mutationError instanceof Error ? mutationError.message : "The change could not be saved.");
      }
    } finally {
      if (requestId === requestSequence.current && adWorkId === selectedAdWorkRef.current) setBusy(false);
    }
  }

  async function savePayment() {
    if (!snapshot) return;
    const draft = {
      paymentStatus,
      totalAmount: toAmount(totalAmount),
      paidAmount: toAmount(paidAmount),
    };
    const validation = validatePaymentDraft(draft);
    if (validation) {
      setError(validation);
      return;
    }
    await runMutation("admin_update_ad_work_payment_v1", {
      p_ad_work_id: snapshot.adWork.id,
      p_payment_status: paymentStatus,
      p_total_amount: draft.totalAmount,
      p_paid_amount: draft.paidAmount,
      p_note: commercialNote.trim() || null,
      p_expected_version: snapshot.adWork.commercialVersion,
    });
  }

  async function rescheduleWork() {
    if (!snapshot || !newStartDate || !rescheduleReason.trim()) {
      setError("Choose a new start date and enter a reschedule reason.");
      return;
    }
    await runMutation("admin_reschedule_ad_work_v1", {
      p_ad_work_id: snapshot.adWork.id,
      p_new_start_date: newStartDate,
      p_reason: rescheduleReason.trim(),
      p_expected_version: snapshot.adWork.scheduleVersion,
    });
    setRescheduleReason("");
  }

  async function rescheduleDay() {
    if (!snapshot || !selectedDayId || !newDayDate || !dayReason.trim()) {
      setError("Choose a work day, new date and reason.");
      return;
    }
    await runMutation("admin_reschedule_ad_work_day_v1", {
      p_ad_work_id: snapshot.adWork.id,
      p_ad_work_day_id: selectedDayId,
      p_new_date: newDayDate,
      p_reason: dayReason.trim(),
      p_expected_version: snapshot.adWork.scheduleVersion,
    });
    setDayReason("");
    setNewDayDate("");
  }

  async function cancelWork() {
    if (!snapshot || !cancellationReason.trim()) {
      setError("Cancellation reason is required.");
      return;
    }
    if (!window.confirm(`Cancel ${snapshot.adWork.title}? This revokes executable access and cannot be undone in this workbench.`)) return;
    await runMutation("admin_cancel_ad_work_v1", {
      p_ad_work_id: snapshot.adWork.id,
      p_reason: cancellationReason.trim(),
      p_internal_note: cancellationInternalNote.trim() || null,
      p_expected_version: snapshot.adWork.scheduleVersion,
    });
    setCancellationReason("");
    setCancellationInternalNote("");
  }

  async function copyCustomerMessage() {
    if (!customerMessage) return;
    try {
      await navigator.clipboard.writeText(customerMessage);
    } catch {
      setError("Could not copy the customer-safe message. Copy it manually instead.");
    }
  }

  return (
    <section className="admin-operations-view" aria-labelledby="commercial-schedule-title">
      <div className="panel-heading">
        <div>
          <h2 id="commercial-schedule-title">Commercial & Schedule control</h2>
          <p>Admin-authorized payment tracking, cancellation and rescheduling. No payment collection or provider auto-send.</p>
        </div>
        <ShieldCheck size={22} aria-hidden="true" />
      </div>

      <div className="admin-filter-grid">
        <label>
          Ad Work
          <select value={selectedAdWorkId} onChange={(event) => setSelectedAdWorkId(event.target.value)}>
            <option value="">Choose Ad Work</option>
            {adWorks.map((work) => (
              <option value={work.id} key={work.id}>{work.title}{work.businessName ? ` — ${work.businessName}` : ""}</option>
            ))}
          </select>
        </label>
        <div className="admin-action-row">
          <button type="button" className="secondary-button" disabled={!selectedAdWorkId || busy} onClick={() => void loadSnapshot()}>
            <RefreshCw size={16} aria-hidden="true" /> Refresh
          </button>
        </div>
      </div>

      {error && <div className="form-error" role="alert">{error}</div>}
      {busy && <p className="quiet-note">Applying authoritative checks…</p>}

      {snapshot && (
        <>
          <div className="summary-grid">
            <div><span>Work</span><strong>{snapshot.adWork.title}</strong></div>
            <div><span>Schedule</span><strong>{displayDate(snapshot.adWork.startDate)} → {displayDate(snapshot.adWork.endDate)}</strong></div>
            <div><span>Payment</span><strong>{paymentStatusLabels[snapshot.adWork.paymentStatus]}</strong></div>
            <div><span>Outstanding</span><strong>{formatMoney(snapshot.adWork.balanceAmount)}</strong></div>
          </div>

          <section className="form-section">
            <h3>Payment tracking</h3>
            <p className="quiet-note">Admin-only business tracking. These values are not payment processing and are excluded from customer/driver/export surfaces.</p>
            <div className="admin-filter-grid">
              <label>
                Status
                <select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value as PaymentStatus)}>
                  {paymentStatuses.map((status) => <option value={status} key={status}>{paymentStatusLabels[status]}</option>)}
                </select>
              </label>
              <label>
                Total amount (INR)
                <input type="number" min="0" step="0.01" value={totalAmount} onChange={(event) => setTotalAmount(event.target.value)} />
              </label>
              <label>
                Paid amount (INR)
                <input type="number" min="0" step="0.01" value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} />
              </label>
              <label>
                Admin note
                <input maxLength={500} value={commercialNote} onChange={(event) => setCommercialNote(event.target.value)} />
              </label>
            </div>
            <button type="button" className="primary-button" disabled={busy} onClick={() => void savePayment()}>Save payment status</button>
          </section>

          <section className="form-section">
            <h3><CalendarClock size={18} aria-hidden="true" /> Reschedule whole work</h3>
            <p className="quiet-note">Available only before execution and before any phone/physical evidence exists. Prior release/readiness is invalidated.</p>
            <div className="admin-filter-grid">
              <label>New start date<input type="date" value={newStartDate} onChange={(event) => setNewStartDate(event.target.value)} /></label>
              <label>Customer-safe reason<input maxLength={500} value={rescheduleReason} onChange={(event) => setRescheduleReason(event.target.value)} /></label>
            </div>
            <button type="button" className="secondary-button" disabled={busy} onClick={() => void rescheduleWork()}>Reschedule work</button>
          </section>

          <section className="form-section">
            <h3>Reschedule one unstarted day</h3>
            <div className="admin-filter-grid">
              <label>
                Work day
                <select value={selectedDayId} onChange={(event) => setSelectedDayId(event.target.value)}>
                  <option value="">Choose day</option>
                  {snapshot.days.map((day) => <option value={day.id} key={day.id}>{displayDate(day.workDate)} — {day.executionStatus}</option>)}
                </select>
              </label>
              <label>New date<input type="date" value={newDayDate} onChange={(event) => setNewDayDate(event.target.value)} /></label>
              <label>Customer-safe reason<input maxLength={500} value={dayReason} onChange={(event) => setDayReason(event.target.value)} /></label>
            </div>
            <button type="button" className="secondary-button" disabled={busy} onClick={() => void rescheduleDay()}>Reschedule day</button>
          </section>

          <section className="form-section">
            <h3>Cancel Ad Work</h3>
            <p className="quiet-note">Cancellation revokes work access, cancels non-completed days and stops active tracking. Closed/completed work cannot be cancelled here.</p>
            <div className="admin-filter-grid">
              <label>Customer-safe reason<input maxLength={500} value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} /></label>
              <label>Internal note (never copied to customer)<input maxLength={500} value={cancellationInternalNote} onChange={(event) => setCancellationInternalNote(event.target.value)} /></label>
            </div>
            <button type="button" className="danger-button" disabled={busy || snapshot.adWork.planningStatus === "cancelled"} onClick={() => void cancelWork()}>Cancel Ad Work</button>
          </section>

          {customerMessage && (
            <section className="form-section">
              <h3>Customer-safe update</h3>
              <textarea readOnly rows={4} value={customerMessage} />
              <button type="button" className="secondary-button" onClick={() => void copyCustomerMessage()}><Copy size={16} aria-hidden="true" /> Copy update</button>
            </section>
          )}

          <section className="form-section">
            <h3>Commercial history</h3>
            {commercialHistoryEvents.length === 0 ? <p className="quiet-note">No commercial changes recorded yet.</p> : (
              <>
                <p className="quiet-note">
                  Showing {commercialHistoryEvents.length} commercial change{commercialHistoryEvents.length === 1 ? "" : "s"}.
                  {commercialHistoryPage?.hasMore ? " Older entries are available." : " Complete available history is loaded."}
                </p>
                <div className="table-scroll"><table className="data-table"><thead><tr><th>When</th><th>Status</th><th>Total</th><th>Paid</th><th>Balance</th><th>Version</th></tr></thead><tbody>
                  {commercialHistoryEvents.map((event) => <tr key={event.id}><td>{displayTime(event.createdAt)}</td><td>{paymentStatusLabels[event.paymentStatus]}</td><td>{formatMoney(event.totalAmount)}</td><td>{formatMoney(event.paidAmount)}</td><td>{formatMoney(event.balanceAmount)}</td><td>{event.version}</td></tr>)}
                </tbody></table></div>
                {commercialHistoryPage?.hasMore && (
                  <button type="button" className="secondary-button" disabled={busy} onClick={() => void loadOlderCommercialHistory()}>
                    Load older history
                  </button>
                )}
              </>
            )}
          </section>

          <section className="form-section">
            <h3>Schedule lifecycle history</h3>
            {snapshot.scheduleEvents.length === 0 ? <p className="quiet-note">No cancellation/reschedule changes recorded yet.</p> : (
              <div className="table-scroll"><table className="data-table"><thead><tr><th>When</th><th>Change</th><th>Reason</th><th>Version</th></tr></thead><tbody>
                {snapshot.scheduleEvents.map((event) => <tr key={event.id}><td>{displayTime(event.createdAt)}</td><td>{event.eventType.replaceAll("_", " ")}</td><td>{event.reason}</td><td>{event.version}</td></tr>)}
              </tbody></table></div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
