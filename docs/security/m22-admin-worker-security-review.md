# M22 Admin and Worker Security Review

Status: final evidence reconciliation for the corrected M22 source diff on draft PR #27. M22 remains **In Progress** pending merge, post-merge verification, and AP review.

## Scope

The review covers the final M22 diff from base `641dcb963569ebf8b8f36e39cd4dcf46fd5ac64a` through sealed head `2585cf35a863702d05307295909a115597f7ff86`, including:

- the once-per-minute scheduled worker and server-only service-role RPC boundary;
- effective-dated deterministic rule policies, queue processing, bounded operational retention, and fair health sweeping;
- alert deduplication, episode evidence, condition clearing, recurrence, and admin lifecycle transitions;
- bounded `m22-admin-v1` tracking-health, alert-list, alert-detail, and technical-value contracts;
- sanitized telemetry adapter-rejection and authentication-failure signals; and
- customer-effect, Phone Location Proof, and M23 separation boundaries.

The reviewed high-risk data classes were the service-role key, authorization presentation, external device hints and key IDs, coordinates, raw telemetry bodies, internal correlation references, technical values, customer/work data, audit notes, and alert evidence.

## Scheduled worker and service boundary

The worker contract is `m22-worker-v1`. Its exact safe output is limited to:

- `workerOk`
- `workerStatus`
- `queueClaimed`
- `queueCompleted`
- `queueRetryOrFailed`
- `devicesConsidered`
- `sweepSignalsEnqueued`
- `operationalRowsCompacted`

The function is disabled unless `M22_RULE_ENGINE_ENABLED=true`, runs once per minute, and executes the health sweep before draining the evaluation queue so existing queue load cannot starve health progression. Queue page size is fixed at 200 rows and the worker starts no more than four pages per invocation, giving a theoretical ceiling of 800 queue rows per minute. It stops starting new queue pages at the 6.5-second soft deadline and aborts outstanding work at the 8-second hard deadline.

RPC response objects are checked for exact non-negative integer count fields. Malformed or inconsistent responses fail closed. Claimed queue rows must equal completed plus retry/failed rows. Any retry/failure work returns `workerStatus: "partial_failure"` and `workerOk: false`, rather than reporting a false success. Responses and logs contain counts only; they contain no identifiers, coordinates, customer data, exception text, or secrets.

The service-role key is read only from server-side configuration and is never accepted through request input or returned in output. Worker RPC names, queue size, page count, and timeout boundaries are fixed. Service functions revoke execution from `PUBLIC`, `anon`, and `authenticated`, grant only `service_role`, perform bounded work, and use fixed `search_path` declarations.

The 800-row figure is a theoretical bounded drain ceiling, not a hosted-performance result. Hosted RPC p95/p99 duration, oldest pending-row age, cancellation propagation, worker concurrency, timeout rate, compaction age, cost, and reconnect-burst recovery remain AP-approved pilot measurements.

## Safe telemetry and authentication signals

No raw authorization presentation is hashed or persisted by M22. The server-only keyed digest input distinguishes only bounded reason scope and whether a presentation was present or missing. It does not include the presentation value.

The raw secret, external device hint, key ID, token, authorization header, IP address, request body, and coordinates are not persisted in M22 signals or authentication aggregates. Authentication failures use allowlisted reason codes, a five-minute bucket, and a keyed 64-lowerhex safe fingerprint. Each adapter/reason bucket admits at most 256 distinct fingerprints; additional cardinality folds into a keyed overflow aggregate. A signal is emitted only at the configured threshold crossing and each bounded 100-occurrence refresh.

Authenticated adapter rejections inspect at most ten rejected events and collapse them into one bounded, best-effort service RPC with at most two deterministic categories: `invalid_coordinate` and `unsupported_sensor_observation`. The signal budget is 400 milliseconds. Rejected coordinates and raw rejected events are not sent to the M22 RPC.

M22 signaling is observational and best-effort. A signal failure does not change the existing M21 authentication decision, telemetry persistence result, or ingestion response.

## Operational lifecycle and retention

The health sweep advances a transactionally locked persisted cursor across active installed devices and wraps fairly. Missing-location evaluation is pinned to the exact active physical-device session, work day, vehicle, and execution-authority episode. Its baseline is the latest of session start, execution start, and accepted-live location evidence in that same episode. Delayed evidence, health-only evidence, break/end state, phone sessions, and a different physical session cannot mask or clear that episode.

Operational compaction is service-only, fixed-batch, age- and state-constrained, and uses `FOR UPDATE SKIP LOCKED`. It may remove eligible completed or exhausted queue rows, transient unreferenced signals, authentication aggregates, unattached assessments, and inactive unattached rule state. The transaction-local immutable-evidence bypass is restored to `off` before return.

Compaction uses no cascade deletion and preserves alert-linked evidence. Telemetry receipts, tracking sessions, location points, alerts, alert status history, alert notes, and audit logs are not deleted. No proof-retention or customer-retention deletion was activated.

Deterministic episode keys and transactional locks prevent duplicate active alerts. Clearing records condition state without deleting the alert. Applicable live recovery clears once without creating a noisy recovery alert. Recurrence before terminal closure reactivates the same episode; recurrence after a terminal state creates the next episode. Admin transitions require bounded reason and note fields, append immutable history, write the existing audit ledger, and are validated server-side against the current state.

## Admin security

Admin reads use explicit versioned `m22-admin-v1` projections guarded by the existing server-side admin requirement:

- `admin_get_m22_tracking_health_v1`
- `admin_list_m22_alerts_v1`
- `admin_get_m22_alert_detail_v1`
- `admin_get_m22_alert_technical_values_v1`

The bounded list response excludes internal evidence references, safe authentication fingerprints, and observed/threshold technical values. Detail uses the shared nested versioned contract and exposes only bounded lifecycle, note, assessment, and audit projections. Technical values require a separate admin-only RPC that creates an `alert_technical_values_viewed` audit record. No list, detail, or technical-value response returns coordinates, credentials, raw payloads, or authentication hints.

Allowed lifecycle transitions are calculated server-side from the current alert state. Broad legacy M22 list/detail functions are explicitly revoked from authenticated clients. RLS, table grants, explicit function grants, server-side admin checks, and fixed `search_path` declarations remain the enforcement boundary; UI hiding is not treated as authorization.

## Customer and M23 boundaries

M22 sends no customer content, notifications, reports, or updates; creates no public tracking surface; and does not change Phone Location Proof sessions or customer behavior. Phone and physical-device evidence remain source-separated. M22 performs no time pairing, Haversine distance calculation, mismatch persistence, mismatch alerting, map/route rendering, vendor integration, hardware connection, or M23 comparison runtime.

## Final verification

The final corrected implementation evidence records:

- Vitest: **483 passed**
- pgTAP: **305 passed** across 12 files
- fresh complete Supabase reset: **passed**
- representative M21-to-M22 upgrade: **passed**
- lint: **passed**
- typecheck: **passed**
- production build: **passed**
- migration guardrails: **passed**
- repository security guardrails: **passed**
- GitHub Quality and Security workflow: **passed**

No hosted Supabase migration, Netlify deployment, real credential, customer data, production data, or physical hardware was used.

## Completed Codex Security scan

The final current-head scan was completed and sealed; no security scan was waived.

| Field | Confirmed value |
| --- | --- |
| Scan ID | `8b892ebb-330a-4a9a-8071-4bd8e2352b61` |
| Scan type | branch diff (`git_diff`) |
| Base SHA | `641dcb963569ebf8b8f36e39cd4dcf46fd5ac64a` |
| Sealed head SHA | `2585cf35a863702d05307295909a115597f7ff86` |
| Snapshot digest | `codex-security-snapshot/v1:sha256:1d74df0bc5da366ec7aad16a4841552de3d91d1cb5319d4e849096130ccb54eb` |
| Coverage | complete; 18/18 changed source-like review rows |
| Deferred rows | 0 |
| Reportable findings | 0 |

Canonical artifacts:

- report: `C:\Users\mailt\AppData\Local\Temp\codex-security-scans-VTVbml\kootha\2585cf35a863702d05307295909a115597f7ff86_20260731T164610Z_o3us_1ii\report.md`
- manifest: `C:\Users\mailt\AppData\Local\Temp\codex-security-scans-VTVbml\kootha\2585cf35a863702d05307295909a115597f7ff86_20260731T164610Z_o3us_1ii\scan-manifest.json`
- coverage: `C:\Users\mailt\AppData\Local\Temp\codex-security-scans-VTVbml\kootha\2585cf35a863702d05307295909a115597f7ff86_20260731T164610Z_o3us_1ii\coverage.json`
- findings: `C:\Users\mailt\AppData\Local\Temp\codex-security-scans-VTVbml\kootha\2585cf35a863702d05307295909a115597f7ff86_20260731T164610Z_o3us_1ii\findings.json`

One bounded worker deadline/backlog candidate was validated and rejected as a security vulnerability because the path is private, rate-limited, fixed-batch, time-bounded, retry-safe, and non-destructive. Hosted queue age, RPC duration, and compaction cadence remain operational launch observations, not unresolved security findings.
