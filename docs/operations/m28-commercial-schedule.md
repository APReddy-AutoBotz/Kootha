# M28 — Commercial & Schedule Operations Control

Status: In Progress until the Draft PR is merged and post-merge verification is complete.

## Purpose

M28 closes two original Must-Have operating gaps without turning Kootha into a payment processor or external messaging platform:

- FR-044 Payment Status becomes a governed admin-only commercial ledger.
- FR-056 Cancellation & Reschedule becomes a reasoned, versioned lifecycle operation for whole Ad Works and individual unstarted days.

## Commercial authority

`admin_update_ad_work_payment_v1` is the supported payment-tracking mutation authority. It requires the existing admin role, row-locks the Ad Work, checks an exact `commercial_version`, validates status/amount coherence, records immutable admin-only history, and increments the commercial version.

The milestone tracks business state only. It does not collect money, initiate refunds, issue invoices, connect UPI/cards/banks, or trigger driver/customer payouts.

Commercial values are deliberately excluded from the general M27 export/audit payloads. The ordinary audit log records only the commercial authority version; detailed amounts/status/note remain in the RLS-protected `ad_work_commercial_events` history.

## Schedule authority

The supported lifecycle mutations are:

- `admin_reschedule_ad_work_v1` — shifts an entire unstarted, unobserved schedule while preserving each day identity;
- `admin_reschedule_ad_work_day_v1` — moves one unstarted, unobserved day;
- `admin_cancel_ad_work_v1` — cancels non-closed/non-completed work and revokes executable authority.

Every schedule mutation requires an exact `schedule_version` and a bounded reason.

### Evidence preservation

Reschedule fails closed if an affected day has any of the following:

- execution already started/completed/issue-reported;
- saved phone/location points;
- accepted M21 physical telemetry;
- uploaded proof;
- execution proof notes.

M28 never rewrites telemetry, proof or M21 authority history. Assignment/release/execution changes continue through the existing M21 effective-history triggers.

### Readiness invalidation

A successful reschedule:

- stops any inconsistent still-active tracking session for the work;
- revokes a released Work Code;
- downgrades `ready_for_execution` assignment/readiness to `needs_review`;
- returns `ready` days to `planned` before moving them;
- recomputes authoritative Ad Work start/end bounds from day rows.

A successful cancellation:

- stops active tracking;
- revokes Work Code access;
- cancels assignment authority;
- cancels non-completed day execution/planning state;
- marks the Ad Work cancellation/closure state;
- preserves any already-completed day history.

## Customer communication

Cancellation/reschedule operations create a customer-safe **draft** update for manual copy/share. They never auto-send through WhatsApp/SMS/email providers. The customer message contains the work title, changed date/cancellation and the explicitly supplied customer-safe reason only; payment values and internal cancellation notes are excluded.

## Admin workbench

The modular **Commercial & Schedule** admin surface provides:

- payment state / total / paid / outstanding view;
- governed payment edit;
- whole-work reschedule;
- individual-day reschedule;
- cancellation with explicit confirmation;
- customer-safe message copy;
- immutable commercial and schedule history.

Requests are fenced by request sequence, selected Ad Work identity and exact commercial/schedule version fingerprint. Auth/session failures fail closed.

## Hosted and physical boundaries

M28 does not alter the existing hosted boundary. Kootha Supabase remains inactive because the organization is at the two-active-free-project limit; unrelated projects are not paused. No public launch switch is enabled.

M18 physical Android execution, selected-device M24, and real physical M26 remain separate AP/hardware/evidence gates.

## Completion gates

Before merge:

1. focused M28 shared/UI tests pass;
2. full retained Vitest passes;
3. lint and typecheck pass;
4. migration/security guardrails pass;
5. production build passes;
6. a fresh disposable Supabase instance replays every migration and the full pgTAP/RLS suite;
7. exact-head `Quality and security` is green;
8. all current P1/P2 review threads are resolved;
9. final exact-head Codex review is clean.
