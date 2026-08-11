# Combined M24F-M25 Foundation

This release is a software-only preparation stream. AP has not selected a physical device, vendor cloud, protocol,
SIM/network, installation method, compliance position, or commercial commitment, so the original M24 selected-adapter
and physical-evidence tasks remain open.

## M24F boundary

`AdapterCapabilityManifestV1` describes transport, authentication, event identity, timestamps, replay, health,
location, approved sensor metrics, secret storage, sandbox, residency, support, certification, and evidence using
bounded typed fields. `m24f_adapter_candidates` stores only safe assessment metadata and decision history. It never
stores vendor API secrets, SIM credentials, contracts, raw payloads, or unrestricted notes. Only an explicit AP-approved
candidate decision can authorize future M24B work; this release does not perform that work.

`reference-vendor-webhook-v1` is a synthetic reference vendor-cloud webhook adapter. Its HMAC signature, timestamp,
key rotation/revocation, strict schema, stable event identity, sequence, health, and approved observation mapping are
tested in memory. Signature verification happens before normalization. Normalization produces the existing canonical
M21 telemetry contract and then remains subject to M21 work, identity, replay, and privacy authority. No production
endpoint is added and no physical device is connected.

## M25 statistical foundation

The feature catalog contains safe numeric aggregates for device/work-day, device-day, device-model-day,
adapter-version-day, and fleet-day scopes. Features are derived from M21 receipts and authority outcomes, M22 health
evidence, M23 comparison snapshots, and adapter metadata. Rows contain no latitude, longitude, raw payload, credential,
Work Code, customer data, or unrestricted identifier.

Baselines use deterministic robust statistics:

`robust_z = 0.6745 * (observed - median) / MAD`

If MAD is zero, a meaningful IQR fallback uses `IQR / 1.349` as the scale. If both are zero, the result is
`insufficient_variation`; no divide-by-zero score is manufactured. Baseline selection is exact cohort, broader
model/adapter cohort, fleet cohort, then `insufficient_data`. Synthetic and non-synthetic evidence never share a
baseline.

The signal catalog contains explainable shifts for telemetry gaps, delayed backfill, rejection, duplicates, sequence
disorder, accuracy, battery, GPS, GSM, heartbeat, location coverage, long stops, impossible speed, comparison quality,
mismatch candidates, missing sources, adapter versions, and device-model cohorts. Support is a coverage/data-quality
level, not a probability that wrongdoing occurred. Deterministic M21–M23 rules remain the fallback.

Signals are `insufficient_data`, `normal`, `watch`, `investigate`, `suppressed`, or `reviewed`. Reviews are immutable
and admin-only. A signal never automatically suspends a device, stops work, notifies a customer/driver, accuses a
driver, changes Final Proof Summary, or alters M22/M23 evidence. An admin may explicitly promote a reviewed signal to the
existing `public.alerts` master, with one deduplicated `statistical_signal` episode and an audit row. Promotion does not
auto-resolve.

Readiness reports provisional indicators of 4-8 weeks, 30 reviewed device-model days, and 1,000 reviewed work-day
sessions. They are not authorization gates. With synthetic-only or insufficient reviewed real evidence the truthful
decision is `production_ml_not_authorized`. The database guard rejects activation of ML analysis versions in this
milestone. No model artifact, model training, inference route, or point-by-point LLM processing exists.

The statistical worker is server-only, bounded, disabled unless `M25_STATISTICAL_ENGINE_ENABLED=true`, uses
`SKIP LOCKED`/generation protection, recovers stale claims, and returns count-only status. Compaction is fixed-batch
and never deletes source telemetry, points, sessions, M22/M23 evidence, reviewed signals, readiness assessments, current
baselines, AP decisions, or audit logs. No hosted migration or deployment was performed.

## Operational and security limitations

The local certification, statistical, and scale evidence is deterministic correctness/scale-shape evidence, not hosted
throughput or physical-pilot evidence. The integrated Codex Security Workbench scan is intentionally deferred to the
pre-M26 physical-pilot gate because the current exact-range scanner cannot seal due to its snapshot-digest defect.
Repository security guardrails, RLS review, secret-boundary checks, privacy/customer-boundary tests, and concurrency
tests remain required for this release.
