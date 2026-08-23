# Kootha / Prachar MVP Implementation Tasks

Spec ID: kootha-prachar-mvp

Status values:

- [ ] Not started
- [~] In progress
- [x] Completed
- [!] Blocked
- [?] Needs AP decision

## Milestone M0 - Project Foundation

- [x] M0-T001 Create project/repo structure for website/admin and driver Android app.
  - Requirements: FR-001
  - Done when: project runs locally and has clear folders.

- [x] M0-T002 Add configurable product name setting.
  - Requirements: FR-002
  - Done when: name can switch between Kootha/Prachar in one place.

- [x] M0-T003 Define shared status enums and business terms.
  - Requirements: FR-058
  - Done when: statuses are consistent across code and UI.

- [x] M0-T004 Create database/schema baseline.
  - Requirements: FR-010 to FR-065
  - Done when: base tables exist or migrations are defined.

- [x] M0-T005 Add seed/demo data for Ongole and Addanki.
  - Requirements: FR-016
  - Done when: demo cities and sample areas are available.

- [x] M0-T006 Add basic tests and lint/typecheck/build commands.
  - Requirements: FR-065
  - Done when: Codex can run verification before completion.

## Milestone M1 - Public Website and Enquiries

- [x] Build public home page, website sections, contact CTA, enquiry form, and source tracking.

## Milestone M2 - Admin Foundation

- [x] Build admin login, admin role checks, dashboard cards, enquiry list, filters, enquiry detail updates, follow-up dates, package interest updates, and internal notes.

## Milestone M3 - Ad Work Creation and Scheduling

- [x] Build enquiry-to-ad-work creation, customer linking, planned ad work list/detail, package selection, live tracking request planning, areas to cover, proof needed, customer update plan, and one-day or multi-day schedules.

## Milestone M4 - Driver and Vehicle Onboarding

- [x] Build driver registration interest, driver application review, driver approval records, vehicle approval records, Mic System details, Vehicle GPS Device readiness fields, and admin onboarding management.

## Milestone M5 - Driver and Vehicle Assignment to Ad Work

- [x] Build admin assignment of approved drivers and approved vehicles to planned Ad Works, assignment status, readiness checklist, warnings, and dashboard assignment summaries.

## Milestone M6 - Ad Work Execution Without GPS

- [x] Build admin release, Work Code driver access, Start Work, Take Break, Resume Work, End Work, text-only Proof Notes, execution monitoring, and customer update records without GPS tracking, maps, background location, or customer live links.

## Milestone M7 - Proof Upload and Customer Update Sharing

- [x] Build secure proof upload and manual customer update sharing without live maps, payment gateway, or provider auto-send.

## Milestone M8 - Final Proof Summary and Campaign Closure

- [x] Build final proof summary and campaign closure without GPS tracking, provider auto-send, payments, customer app, iOS app, or PWA.

## Milestone M9 - Mobile GPS Tracking Foundation

- [x] Build admin Phone Location Proof control, foreground driver consent, Start/Stop Location Proof, location point saving during running assigned work, tracking health, and admin-only RLS without background location, maps, customer live tracking links, reports, payments, provider auto-send, customer app, iOS app, or PWA.

## Milestone M10 - Mobile GPS Reliability and Offline Buffer

- [x] Build foreground-only Phone Location Proof reliability, offline point buffering, retry sync, idempotent point upload, driver sync status, and admin tracking health warnings without background location, maps, customer live tracking links, GPS device ingestion, reports, payments, provider auto-send, customer app, iOS app, or PWA.

## Milestone M11 - Admin Tracking Review Without Maps

- [x] Build admin-only Location Proof Review without maps, including day-wise review, warning summaries, review status/note, safe final summary wording, admin-only RLS, and no public/customer tracking surfaces.

## Milestone M12 - Location Proof in Final Summary

- [x] Build customer-safe Phone Location Proof in the Final Proof Summary, including admin include control, customer-safe note, wording preview, closure warnings, admin-only fields/RPCs, and no coordinates, maps, route proof, public links, provider sending, payments, customer app, iOS app, or PWA.

## Milestone M13 - Pilot Readiness and Deployment Preparation

- [x] Build pilot readiness docs, deployment preparation guide, smoke checklist, operations runbook, driver consent text, customer communication text, pilot environment validation helper, and guardrail tests without adding future product features.

## Milestone M14 - Controlled Pilot Dry Run

- [x] Build controlled pilot dry-run scenario, end-to-end checklist, results template, blocker and limitation notes, fake data guide, go/no-go checklist, README updates, task ledger update, and guardrail tests without adding future product features.

## Milestone M15 - Real Device Pilot Setup and Deployment

- [x] Build real-device pilot setup docs, deployment runbook, Android testing checklist, Supabase target checklist, pilot operator checklist, real-device evidence template, safe pilot environment check, README updates, and guardrail tests without adding future product features.

## Milestone M16 - Real Device Pilot Execution Evidence

- [x] Record real-device pilot execution evidence as blocked because required physical Android device, target Supabase project, admin user, storage setup, and deployed environment were unavailable; add README updates and guardrail tests without adding future product features.

## Milestone M17 - Real Device Pilot Blocker Remediation

- [x] Build the real-device pilot blocker remediation package with M16 blocker summary, Android setup guide, driver app build guide, Supabase target remediation guide, web/admin preview guide, blank evidence template, safe readiness check, README updates, and guardrail tests without adding future product features.

## Milestone M18 - Real Device Pilot Evidence Retry

- [~] In progress.
  - Target Supabase migrations, public enquiry policy, proof bucket privacy, admin role, and admin login are verified with safe labels only.
  - Physical Android driver app execution, proof upload, Phone Location Proof, offline sync, and final summary retry remain pending with fake data only.

## Milestone M19 - Physical GPS and IoT architecture and requirements

- [x] Planning/specification completed as a separate stream.
  - Documented the portable ingress architecture, physical-device registry extensions, event-time work resolution, live freshness, authenticated delayed backfill, deterministic simulator path, security/privacy model, cost gate, implementation roadmap, and AP decision register.
  - Split the next implementation work into reviewable M20A registry/history and M20B canonical-contract/simulator pull requests.
  - Added no migration, endpoint, runtime adapter, credential, device connection, map, or physical-device runtime feature.
  - M18 real-device evidence remains incomplete and in progress; M19 does not change that conclusion.

## Milestone M20A - Physical Device Registry and History

- [x] Completed.

## Milestone M20B - Canonical Contracts and Deterministic Simulator

- [x] Completed and merged. Deterministic synthetic contracts remain non-physical evidence.

## Milestone M21 - Secure Physical Telemetry Ingestion

- [x] Completed and merged.

## Milestone M22 - Tracking Health and Deterministic Alerts

- [x] Completed and merged.

## Milestone M23 - Phone-versus-Physical Comparison

- [x] Completed and merged.

## Milestone M24 - Selected Physical Device Integration

- [?] AP/hardware decision gated.
  - Real vendor/device, protocol, SIM/network, installation, compliance and cost selection remain deliberately unchosen.
  - M24F vendor-neutral certification software is completed.

## Milestone M24F - Vendor-Neutral Adapter Certification

- [x] Completed and merged.

## Milestone M25 - Statistical Intelligence

- [x] Completed and merged.

## Milestone M26 - Physical Pilot Commissioning and Evidence

- [x] Software commissioning/control/evidence/readiness/field-handoff layer completed and merged in PR #32.
- [~] Real physical execution remains incomplete pending selected hardware/network and real field evidence.
- Synthetic/CI evidence can never satisfy physical readiness.

## Milestone M27 - Governed Operations Export & Audit Workbench

- [x] Completed.
  - Admin-only static allowlisted exports for enquiries, ad works, drivers, vehicles, masked devices, and safe activity history.
  - Immutable export receipt metadata; exported row payloads are never persisted.
  - UTF-8 CSV/JSON download with spreadsheet-formula neutralization.
  - Cursor-paginated, filterable safe Activity workbench through sanctioned RPCs.
  - Hosted Kootha activation remains separately blocked by the active-free-project quota; do not pause unrelated projects.

## Milestone M28 - Commercial & Schedule Operations Control

- [x] Completed.
  - Governed admin-only payment status/amount tracking with immutable commercial history and optimistic version checks.
  - Evidence-preserving whole-work and individual-day reschedule authority with stale release/readiness invalidation.
  - Governed cancellation with required reason, executable-access revocation, active-tracking stop and immutable lifecycle history.
  - Customer-safe cancellation/reschedule messages remain manual copy/share only; no payment gateway or provider auto-send.
  - M18, selected-device M24 and real physical M26 remain separately gated.

## Milestone M29 - Hosted Release Activation & Recovery Control

- [x] Software implementation completed on the M29 branch; merge remains gated by exact-head CI and independent review.
  - Canonical preview/production environment contract separates public values from server-only authority and never emits secret values.
  - Deterministic `check:release-readiness` produces secret-free source/migration provenance plus honest external-check status.
  - A separate Hosted release readiness workflow preserves the existing Quality workflow and uploads only secret-free manifests.
  - Production configuration remains fail-closed with enquiry intake and retention deletion explicitly disabled before promotion.
  - Exact capacity-approved activation, hosted fake-data acceptance and rollback rehearsal are documented.
  - Live Supabase/Netlify/rollback evidence remains `blocked-not-run` until capacity exists and those checks actually run.
  - No unrelated Supabase project may be paused/deleted to satisfy Kootha hosting.
  - M18, selected-device M24 and real physical M26 remain separately gated; M29 does not claim physical evidence.
