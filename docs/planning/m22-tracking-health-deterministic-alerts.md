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
- processes at most 100 queued items per invocation and sweeps at most 250 devices;
- has an eight-second server timeout;
- calls the queue before the absence/recovery sweep;
- returns and logs counts only, with no identifiers, coordinates, customer data, or secrets;
- exposes no public application route and has no Supabase Realtime dependency.

Server-only placeholder names are `M22_RULE_ENGINE_ENABLED`, `M22_RULE_QUEUE_BATCH_SIZE`, and `M22_HEALTH_SWEEP_BATCH_SIZE`. No hosted function or migration is deployed by this milestone task.

An active alert episode is keyed by the deterministic database-owned dedupe context. Repetition updates the same episode, last-detected time, occurrence count, severity, and safe last evidence. Clearing records `condition_active=false` and `condition_cleared_at` without deleting the alert. Recovery clears applicable live conditions once and does not create a noisy recovery alert. A recurrence before terminal admin closure reactivates the same episode; a recurrence after a terminal state creates the next episode.

Lifecycle transitions are admin-only RPC actions: acknowledge, start investigation, resolve, mark false alarm, and ignore. Every action requires a bounded safe reason and note, appends immutable status history, and writes the existing audit platform. Direct browser mutation of the alert master, history, policies, signal queue, and service worker functions is not permitted.

## Admin behavior

Tracking Health shows Phone Location Proof and physical-device health as separate sources. It labels live versus delayed evidence and states **Comparison: Not evaluated — Planned for M23**. It performs no phone/device time pairing or distance calculation.

Alerts provides bounded operational queues, safe filters, list/detail review, explicit lifecycle confirmation, history, notes, and audit context. Observed and threshold technical values are hidden until an admin chooses **Show technical values**. Coordinates, credentials, raw payloads, and authentication hints are never fetched by the view.

Device Detail adds latest current health, latest live heartbeat and telemetry, battery/power/GPS/GSM state, active alert count, highest severity, recent episodes, rule version, and a delayed-evidence summary. Registry `Active`, current `Healthy`, and `Proof Ready` remain distinct.

## Customer and M23 boundary

M22 does not write customer updates, reports, public tracking surfaces, notification providers, or customer-live flags. Phone Location Proof customer behavior remains unchanged. M22 adds no map, route drawing, distance billing, mismatch runtime, phone/device Haversine pairing, vendor adapter, hardware connection, MQTT/TCP/UDP listener, or AI/ML runtime. Phone/device comparison, mismatch persistence, and comparison review belong to M23.

## Local verification and limitations

Focused tests cover worker disablement, bounded batches, safe status output, adapter-rejection classification, safe authentication aggregation, source-specific health labels, delayed/live labels, explicit technical access, lifecycle validation, Device Detail health, no-map scope, and customer-notification guardrails. M20B synthetic scenarios and the 60,000-event deterministic evidence command provide local correctness and scale-shape evidence only; they do not claim PostgreSQL throughput, hosted Netlify latency, or production concurrency.
