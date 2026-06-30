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

- [ ] Build admin-controlled work execution steps without GPS tracking, maps, background location, or customer live links.

## Milestone M7 - Premium Features

- [ ] Build optional premium customer live tracking with admin control and driver consent.

## Milestone M8 - Security, Privacy, and Release Readiness

- [ ] Verify access control, privacy, no hidden audio, no exposed secrets, and pilot readiness.
