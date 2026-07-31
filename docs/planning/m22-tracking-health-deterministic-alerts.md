# M22 Tracking Health and Deterministic Alerts

M22 extends the existing device, telemetry, alert, audit, and admin platforms. The milestone remains **In Progress** pending merge, post-merge verification, and AP review. All pilot thresholds are provisional, effective-dated, and configurable; they are not AP-approved production policy.

## Rule and evidence boundaries

The versioned catalog contains 23 deterministic rules: `heartbeat_missing`, `location_update_missing`, `device_offline`, `battery_low`, `external_power_removed`, `gps_fix_missing`, `gsm_signal_weak`, `long_stop`, `impossible_speed`, `identity_conflict`, `sequence_conflict`, `sequence_gap`, `out_of_order`, `invalid_coordinate`, `unsupported_sensor_observation`, `delayed_backfill_expired`, `captured_after_end_work`, `off_work_location_attempt`, `vehicle_link_not_effective`, `assignment_not_effective`, `authority_ambiguous`, `unknown_device_or_credential`, and `reconnect_or_live_recovery`.

PostgreSQL is authoritative for effective policy selection, deterministic evaluation, alert deduplication, condition state, and lifecycle transactions. Shared TypeScript exposes stable identifiers, results, labels, and UI-safe contracts without copying policy formulas.

Live evidence can update current device health and clear the live condition it proves recovered. A fresh `health_only` heartbeat can clear heartbeat-related conditions, but not missing location. Delayed evidence is explicitly historical: it cannot clear heartbeat, missing-location, or offline conditions; mark a device healthy; or reopen work. Identical retries create no signal or alert occurrence. Changed-content reuse can create one deduplicated conflict episode.

## Queue, sweep, and recovery

Telemetry receipts and changed-content conflicts enqueue bounded, idempotent evaluations. Authenticated adapter rejections may enqueue only `invalid_coordinate` or `unsupported_sensor_observation`, without retaining rejected coordinates or raw input. Authentication failure aggregation uses a keyed 64-hex fingerprint and a bounded internal category; no raw token, hint, key ID, body, IP address, or coordinate is retained.

The scheduled Netlify worker calls service-role-only database RPCs. It:

- is disabled unless `M22_RULE_ENGINE_ENABLED=true`;
- runs once per minute, sweeps first, and drains up to four 200-row queue pages;
- provides 800 evaluations/minute of theoretical bounded capacity against a 130/minute conservative sustained model (100 expected receipts, 25 sweep signals, and 5 retries), leaving 670/minute headroom;
- has an eight-second server timeout;
- stops starting queue pages at a 6.5-second soft deadline so cleanup retains time inside the host boundary;
- returns and logs counts only, with no identifiers, coordinates, customer data, or secrets;
- exposes no public application route and has no Supabase Realtime dependency.

Server-only placeholder names are `M22_RULE_ENGINE_ENABLED`, `M22_HEALTH_SWEEP_BATCH_SIZE`, and `M22_RETENTION_BATCH_SIZE`. Queue page size and iteration count are fixed safe constants. No hosted function or migration is deployed by this milestone task.

The sweep advances a transactionally locked cursor through active installed devices and wraps fairly. Missing-location decisions are pinned to the exact running physical session and execution-authority episode, using the later of session start, running-interval start, and latest accepted-live point in that same episode. Break, end, delayed evidence, health-only evidence, and a different session cannot mask or clear the episode.

Authentication failures aggregate transactionally by keyed safe fingerprint, adapter, reason, and five-minute policy bucket. A bucket admits at most 256 distinct fingerprints per adapter/reason and folds additional cardinality into one keyed overflow aggregate. Only threshold crossing and each bounded 100-occurrence refresh enqueue a signal. Adapter rejection batches produce at most one service RPC and two deterministic category signals per request. Completed queue rows age out after 7 days; exhausted rows, transient unreferenced signals, authentication aggregates, and unattached assessments use a provisional 30-day operational window. The service-only compactor is fixed-batch, uses no cascade, and preserves retained alert evidence and all alert/history/note/audit/receipt/session/point records.

An active alert episode is keyed by the deterministic database-owned dedupe context. Repetition updates the same episode, last-detected time, occurrence count, severity, and safe last evidence. Clearing records `condition_active=false` and `condition_cleared_at` without deleting the alert. Recovery clears applicable live conditions once and does not create a noisy recovery alert. A recurrence before terminal admin closure reactivates the same episode; a recurrence after a terminal state creates the next episode.

Lifecycle transitions are admin-only RPC actions: acknowledge, start investigation, resolve, mark false alarm, and ignore. Every action requires a bounded safe reason and note, appends immutable status history, and writes the existing audit platform. Direct browser mutation of the alert master, history, policies, signal queue, and service worker functions is not permitted.

## Admin behavior

Tracking Health uses one bounded versioned admin projection per work day. It shows Phone Location Proof and physical-device health as separate sources, labels live versus delayed evidence, and reports comparison as `not_available`, `not_evaluated`, or `planned_for_m23`. It performs no phone/device time pairing or distance calculation.

Alerts uses explicit `m22-admin-v1` list and nested detail envelopes with server-side safe labels, state-specific allowed transitions, bounded lifecycle/note/assessment/audit history, and no internal correlation fields. Observed and threshold technical values are absent from list/detail and fetched only through a separate audited RPC after an admin chooses **Show technical values**. Coordinates, credentials, raw payloads, and authentication hints are never fetched by the view.

Device Detail adds latest current health, latest live heartbeat and telemetry, battery/power/GPS/GSM state, active alert count, highest severity, recent episodes, rule version, and a delayed-evidence summary. Registry `Active`, current `Healthy`, and `Proof Ready` remain distinct.

## Customer and M23 boundary

M22 does not write customer updates, reports, public tracking surfaces, notification providers, or customer-live flags. Phone Location Proof customer behavior remains unchanged. M22 adds no map, route drawing, distance billing, mismatch runtime, phone/device Haversine pairing, vendor adapter, hardware connection, MQTT/TCP/UDP listener, or AI/ML runtime. Phone/device comparison, mismatch persistence, and comparison review belong to M23.

## Local verification and limitations

Focused tests cover worker disablement, bounded batches, safe status output, adapter-rejection classification, safe authentication aggregation, source-specific health labels, delayed/live labels, explicit technical access, lifecycle validation, Device Detail health, no-map scope, and customer-notification guardrails.

The final local verification includes:

- 32 focused rule-contract and M20B scenario tests plus 15 focused admin/worker runtime tests;
- 483 passing TypeScript tests;
- 12 pgTAP files with 305 assertions, including focused fair-sweep, retention-preservation, admin-contract, RLS, behavioral-boundary, lifecycle, and real `dblink` concurrency coverage;
- a representative M21-to-M22 upgrade test preserving legacy open/resolved alerts, phone and physical tracking evidence, an M21 receipt/conflict, and active/terminal device states;
- a fresh complete migration reset, production RLS checks, lint, typecheck, production build, migration guardrails, and repository security guardrails;
- the 60,000-event deterministic evidence profile with zero unexpected healthy alerts, zero identical-duplicate occurrences, one 250-occurrence changed-content alert, one recovery clear, no errors, and deterministic rerun equality.

The scale evidence is local correctness and scale-shape evidence only; it does not claim PostgreSQL throughput, hosted Netlify latency, hosted concurrency, or AP production-policy approval.
