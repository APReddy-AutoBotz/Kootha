# M22 Admin and Worker Security Review

Scope: M22 admin Tracking Health/Alerts modules, the scheduled rule worker, safe telemetry-signal adapter, environment/config integration, and their focused tests. The integrated final-head scan is owned by the milestone controller after all workstreams land.

## Discovery receipt

Reviewed trust boundaries:

- browser admin session to admin-only list/detail/lifecycle RPCs;
- Netlify scheduled worker to service-role-only queue and sweep RPCs;
- authenticated telemetry normalization rejection to a constrained sanitized signal;
- unauthenticated credential rejection to keyed aggregation;
- database alert history/audit back to safe admin display.

Reviewed high-risk data classes: service-role key, credential presentation, external device hint and key ID, coordinate, raw telemetry body, customer/work data, audit notes, and alert technical values.

No M22 additive module sends customer content, mutates Phone Location Proof, introduces a public worker route, or contains a map/comparison/notification integration.

## Validation receipts

1. **Service-role exposure:** worker environment is read only server-side; no `VITE_` variable or response field carries credentials. The handler has schedule config only and no public `path`.
2. **Unbounded work/cost amplification:** queue and sweep batches are clamped to 100 and 250; the RPC client and invocation use an eight-second timeout. Database retry and attempt bounds remain authoritative.
3. **Unsafe status/log leakage:** responses contain only `ok`, `queueProcessed`, `sweepEvaluated`, and `failures`. Exceptions return the same generic shape. No identifier or exception text is logged.
4. **Authentication leakage:** the adapter hashes the presentation transiently with a server-only keyed digest. The database receives only an allowlisted category and 64-lowerhex fingerprint. It receives no token, raw hint, key ID, request body, IP, coordinate, or authorization header.
5. **Rejected-coordinate leakage:** classifier returns only `invalid_coordinate`; the signal RPC has no coordinate or raw-context parameter.
6. **Alert lifecycle bypass:** the browser uses admin RPCs and requires a safe reason, note, and confirmation. Lifecycle transition validity, locking, history immutability, and audit are database-owned.
7. **Technical values:** observed and threshold values are closed by default and need an explicit admin action. Coordinates are not selected.
8. **Cross-source comparison:** health sources are rendered separately. No point pairing, distance calculation, mismatch alert, or M23 logic exists.
9. **Customer side effects:** executable source guardrails reject customer update/report/public tracking/notification/provider references in M22 worker and signal modules.

## Attack paths

- A public caller cannot supply the service-role key to the scheduled handler through request parameters. Missing or disabled server configuration fails closed.
- An attacker sending many bad credentials reaches the existing unauthenticated rate limiter before authentication. M22 stores only a keyed aggregation signal and database thresholding prevents one request from opening alert noise.
- An authenticated device submitting invalid coordinates cannot place coordinates into the queue or alert message through the M22 signal hook.
- A non-admin browser cannot rely on UI hiding as authorization; RLS, grants, and admin RPC checks are the enforcement boundary.
- A delayed event cannot clear live missing-update health through the worker adapter; live/delayed semantics remain in authoritative database evaluation.

## Result

The additive admin/worker workstream has no validated reportable security finding in focused review. Focused automated coverage has 12 passing assertion groups, the complete repository security guardrail script passes, and the database behavior/RLS suite passes. The optional Codex Deep Security Scan was explicitly waived for this task after its local worker could not start (`spawn EPERM`); therefore this implementation does not claim a sealed deep-scan ID or complete deep-scan coverage.
