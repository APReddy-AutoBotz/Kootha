# Kootha / Prachar MVP — Complete Specification Pack



---

# README

# Kootha / Prachar Spec Pack

This pack contains a Kiro-style, Codex-ready specification for a low-cost MVP of a local mic advertisement vehicle proof platform.

## Files

```text
.kiro/
  specs/
    kootha-prachar-mvp/
      requirements.md
      design.md
      tasks.md
      codex-implementation-prompt.md
  steering/
    product.md
    tech.md
    implementation-rules.md
```

## How to use

1. Create a new repo or project folder.
2. Copy the `.kiro` folder into the repo.
3. Give `codex-implementation-prompt.md` to Codex.
4. Start only with Milestone M0.
5. Make Codex update `tasks.md` as tasks are completed.
6. Do not allow Codex to skip privacy rules:
   - no customer live tracking by default,
   - no tracking after work completed,
   - no hidden audio recording,
   - no PWA,
   - no customer app in v1.

## Product direction

- Website for customers.
- Admin dashboard for your team.
- Driver Android app for GPS/location proof.
- Customer gets milestone updates and final report.
- Customer live tracking is premium only.
- Phone GPS first, device GPS optional/integration-ready.


---

# Product Steering

# Product Steering — Kootha / Prachar

## Product purpose

Kootha / Prachar helps local businesses verify that mic advertisement vehicles actually completed the promised work.

The product should feel:

- trustworthy,
- simple,
- local-business friendly,
- low-cost,
- practical for small towns,
- usable by non-technical drivers and customers.

## Main customer promise

“You pay for local announcement. We give you proof that it was really done.”

## User experience rules

1. Customers should not need to install an app in v1.
2. Customers should receive simple updates and final proof report.
3. Admin should control what is shared with customers.
4. Drivers should use very simple buttons.
5. Use plain English.
6. Prepare for Telugu labels later.
7. Do not overbuild premium features before the core proof flow works.

## Business rules

1. Customer live tracking is premium only.
2. Driver consent is required if customer live tracking is enabled.
3. Phone location is the default low-cost tracking method.
4. Vehicle GPS device is optional and useful for premium/high-trust work.
5. Tracking stops after work is completed.
6. Manual proof photos are important.
7. Manual audio/video proof can be added when needed.
8. Do not secretly record audio.

## MVP focus

The first successful pilot should prove:

1. Customer can enquire.
2. Admin can create ad work.
3. Driver can start/end assigned work.
4. Location proof is captured only during work.
5. Customer gets updates.
6. Customer receives final report.


---

# Tech Steering

# Technology Steering — Kootha / Prachar

## Recommended approach

Keep the technology low-cost and simple.

Preferred direction:

- Website/Admin: React + Vite or equivalent simple web stack.
- Backend: Supabase/Postgres or simple managed backend.
- Driver app: Android-first React Native or Flutter.
- Maps: keep low-cost; admin live map only in v1.
- Storage: use simple object storage for proof photos/videos.
- Reports: HTML report page with print/download PDF style first.
- Notifications v1: generate copy/share messages for WhatsApp.
- Notifications later: integrate WhatsApp Business/SMS provider.
- Device GPS: create modular ingest endpoint and adapter pattern.

## Hard rules

1. Do not build PWA.
2. Do not build customer mobile app in v1.
3. Do not hardcode secrets in frontend.
4. Do not expose GPS device ingest tokens.
5. Do not collect driver location outside active work.
6. Do not implement hidden audio recording.
7. Keep customer live tracking disabled by default.

## Architecture rules

1. Keep product name configurable.
2. Keep tracking logic separate from UI.
3. Keep phone and device location sources behind a common interface.
4. Keep report generation deterministic and repeatable.
5. Keep statuses as enums.
6. Add tests for core business rules.
7. Use clear database constraints where possible.
8. Use audit logs for important state changes.


---

# Implementation Rules

# Implementation Rules — Kootha / Prachar

## Task completion

Codex may mark a task complete only when:

1. Code/config/docs are implemented.
2. Relevant tests or verification steps are run.
3. `tasks.md` status is updated.
4. Completion summary mentions requirement IDs.
5. No known blocker remains.

## Privacy rules

1. Location starts only after Start Work.
2. Location stops after End Work or admin stop.
3. No tracking outside active work.
4. No hidden audio recording.
5. Driver consent is required before active location proof.
6. Customer live tracking requires admin approval and driver consent.

## Low-cost rules

1. Do not add paid APIs unless AP approves.
2. Use copy/share WhatsApp message flow first.
3. Do not add iOS until AP approves.
4. Do not add customer app until AP approves.
5. Build mobile GPS first; keep device GPS modular.

## UI rules

1. Use simple words.
2. Driver screens must have large buttons.
3. Avoid technical words in customer/driver UI.
4. Admin can have more detail, but still keep it clean.
5. Use product name from config.

## Verification rules

Every milestone should verify:

1. Build passes.
2. Tests pass.
3. Access control is checked.
4. Tracking privacy is checked.
5. Customer live tracking remains disabled by default unless task explicitly enables it.


---

# Requirements

# Kootha / Prachar MVP — Requirements Specification

**Working product names:** Kootha or Prachar  
**Spec ID:** `kootha-prachar-mvp`  
**Version:** 0.1  
**Owner:** AP / Product Owner  
**Development mode:** Low-cost, MVP-first, Codex/Kiro-style specification-driven build  
**Main goal:** Help local businesses verify that mic advertisement vehicles actually completed the promised work, without forcing customers to understand live maps or technical tracking.

---

## 0. How to use this file

This file is written so Codex can implement feature by feature and mark progress.

Each requirement has:

- **Requirement ID**
- **Plain English meaning**
- **Priority**
- **Build phase**
- **Status**
- **Acceptance criteria**

Codex should update the **Status** field only after implementation and verification.

Allowed status values:

- `[ ] Not started`
- `[~] In progress`
- `[x] Completed`
- `[!] Blocked`
- `[?] Needs AP decision`

---

## 1. Product summary in plain English

Kootha / Prachar is a service platform for local mic advertisements.

A business owner pays for an advertisement vehicle to go around selected towns, villages, colonies, markets, or roads. Today, the customer cannot easily know whether the vehicle actually went to the promised places or not.

This product gives proof.

The system helps your team:

1. Collect customer enquiries.
2. Register and approve drivers or ad vehicle owners.
3. Create advertisement jobs.
4. Assign a driver and vehicle.
5. Track the vehicle during the advertisement work.
6. Stop tracking after the work is completed.
7. Send simple customer updates like Started, Running, Completed, and Report Ready.
8. Generate a proof report at the end.
9. Offer live customer tracking only as a paid premium option.

---

## 2. Low-cost MVP decisions

These decisions are mandatory for the first version.

| Decision | Rule |
|---|---|
| Customer app | Do not build a customer mobile app in v1. |
| PWA | Do not build or position this as a PWA. |
| Website | Build a simple public website for trust and enquiries. |
| Admin | Build a web dashboard for your team. |
| Driver app | Build Android-first driver app for location proof and photo proof. |
| iOS | Do not build iOS in v1. |
| Customer live tracking | Not default. Premium only. |
| Customer updates | Use simple milestone updates. |
| WhatsApp/SMS automation | Do not depend on paid automation in v1. Generate shareable message text and links first. |
| Mobile GPS | Must support phone location tracking during active work. |
| Device GPS | Design the system to support device tracking. Pilot can start with phone GPS and add real device feed when hardware is ready. |
| Audio proof | Manual short audio/video/photo proof only in v1. No hidden or automatic background audio recording. |
| Maps cost | Use low-cost map rendering where possible. Avoid expensive customer live map by default. |
| Reports | Generate simple web report and printable/downloadable PDF-style report. |
| Language | Keep all UI labels simple. Prepare for Telugu labels later. |

---

## 3. User types

| User type | Meaning | Main need |
|---|---|---|
| Customer / Business Owner | Shop, showroom, school, hospital, real estate person, local campaign owner | Book mic advertisement and receive proof |
| Admin | Your internal team | Manage enquiries, jobs, drivers, tracking, payments, reports |
| Driver / Vehicle Owner | Person driving or owning mic advertisement vehicle | Register, receive work, start/end work, share proof |
| Field Coordinator | Optional internal person | Handle calls, driver follow-up, local operations |
| Premium Customer | Customer paying extra | May receive live tracking link if enabled |

---

## 4. Glossary: simple words to use in the app

Use these simple words in the UI.

| Avoid technical word | Use this simple word |
|---|---|
| Campaign | Ad Work |
| GPS Tracking | Location Proof |
| Geofence | Area Boundary |
| Milestone | Update |
| Evidence | Proof |
| Tracking Session | Work Tracking |
| Device GPS | Vehicle GPS Device |
| Mobile GPS | Phone Location |
| Route Deviation | Missed Area |
| Offline Buffer | Saved Offline Route |
| Coordinates | Location Points |
| Completion Metrics | Work Summary |

---

# 5. Functional requirements

---

## Requirement FR-001: Product surfaces

**Plain English meaning:** The product should have a website, admin dashboard, and driver Android app.  
**Priority:** Must Have  
**Build phase:** M0  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN the product is opened by a public visitor, THE SYSTEM SHALL show a simple public website.
2. WHEN an admin logs in, THE SYSTEM SHALL show an admin dashboard.
3. WHEN a driver opens the Android app, THE SYSTEM SHALL show driver login or registration.
4. WHEN a customer wants updates, THE SYSTEM SHALL not require them to install a customer app in v1.
5. WHEN customer live tracking is needed, THE SYSTEM SHALL support it only as a premium enabled option.

---

## Requirement FR-002: Configurable product name

**Plain English meaning:** The app name should be easy to change between Kootha and Prachar.  
**Priority:** Must Have  
**Build phase:** M0  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN the app displays the product name, THE SYSTEM SHALL use a single configurable product name.
2. WHEN AP changes the product name setting, THE SYSTEM SHALL reflect the selected name across website, admin dashboard, driver app headings, report pages, and message templates.
3. WHEN no name is configured, THE SYSTEM SHALL default to `Prachar` or another AP-approved fallback.

---

## Requirement FR-003: Simple public website

**Plain English meaning:** Customers should understand the service without technical knowledge.  
**Priority:** Must Have  
**Build phase:** M1  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN a visitor opens the home page, THE SYSTEM SHALL explain the service in simple business language.
2. WHEN a visitor reads the home page, THE SYSTEM SHALL clearly say that the service gives advertisement proof.
3. WHEN a visitor wants to contact the team, THE SYSTEM SHALL show phone/WhatsApp/contact options.
4. WHEN a visitor wants to submit interest, THE SYSTEM SHALL show an enquiry button.
5. WHEN a visitor views the website, THE SYSTEM SHALL not show complicated technical terms like GPS, geofence, API, or tracking engine as main marketing words.

---

## Requirement FR-004: Website pages

**Plain English meaning:** The website should have only necessary pages.  
**Priority:** Must Have  
**Build phase:** M1  
**Status:** [ ] Not started

### Acceptance criteria

1. THE SYSTEM SHALL provide a Home page.
2. THE SYSTEM SHALL provide a How It Works page or section.
3. THE SYSTEM SHALL provide a Packages/Pricing page or section.
4. THE SYSTEM SHALL provide a Cities Covered section.
5. THE SYSTEM SHALL provide an Enquiry page/form.
6. THE SYSTEM SHALL provide a Sample Report page or section.
7. THE SYSTEM SHALL provide Contact details.

---

## Requirement FR-005: Customer enquiry form

**Plain English meaning:** A customer can ask for advertisement service from the website.  
**Priority:** Must Have  
**Build phase:** M1  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN a customer submits an enquiry, THE SYSTEM SHALL collect name, business name, phone number, city/town, required areas, preferred date, number of days, and message.
2. WHEN a customer submits an enquiry, THE SYSTEM SHALL save the enquiry in the admin dashboard.
3. WHEN a required field is missing, THE SYSTEM SHALL show a simple error message.
4. WHEN the enquiry is submitted successfully, THE SYSTEM SHALL show a confirmation message.
5. WHEN an admin views enquiries, THE SYSTEM SHALL show new enquiries first.

---

## Requirement FR-006: Enquiry source tracking

**Plain English meaning:** Admin should know where each enquiry came from.  
**Priority:** Should Have  
**Build phase:** M1  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN an enquiry is submitted from the website, THE SYSTEM SHALL mark source as `Website`.
2. WHEN admin manually adds an enquiry from a phone call, THE SYSTEM SHALL mark source as `Phone Call`.
3. WHEN admin manually adds an enquiry from WhatsApp, THE SYSTEM SHALL mark source as `WhatsApp`.
4. WHEN admin filters enquiries by source, THE SYSTEM SHALL show matching records.

---

## Requirement FR-007: Admin login

**Plain English meaning:** Only your team should access business operations.  
**Priority:** Must Have  
**Build phase:** M1  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN an admin opens the admin dashboard, THE SYSTEM SHALL require login.
2. WHEN login details are wrong, THE SYSTEM SHALL deny access.
3. WHEN an admin logs out, THE SYSTEM SHALL return to login page.
4. WHEN a non-admin tries to access admin pages, THE SYSTEM SHALL block access.

---

## Requirement FR-008: Admin roles

**Plain English meaning:** Different team members can have different access.  
**Priority:** Should Have  
**Build phase:** M2  
**Status:** [ ] Not started

### Acceptance criteria

1. THE SYSTEM SHALL support at least Owner/Admin and Staff roles.
2. WHEN a Staff user logs in, THE SYSTEM SHALL restrict sensitive settings if not allowed.
3. WHEN an Owner/Admin logs in, THE SYSTEM SHALL allow full control.
4. WHEN a user action changes business records, THE SYSTEM SHALL record who made the change.

---

## Requirement FR-009: Admin dashboard summary

**Plain English meaning:** Admin should see today’s business status in one place.  
**Priority:** Must Have  
**Build phase:** M2  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN admin opens dashboard, THE SYSTEM SHALL show today’s ad works.
2. THE SYSTEM SHALL show running ad works.
3. THE SYSTEM SHALL show completed ad works.
4. THE SYSTEM SHALL show pending enquiries.
5. THE SYSTEM SHALL show pending payments.
6. THE SYSTEM SHALL show important alerts like long stop, GPS stopped, network lost, or missed area.

---

## Requirement FR-010: Customer record

**Plain English meaning:** Admin should keep customer details for repeat business.  
**Priority:** Must Have  
**Build phase:** M2  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN admin creates a customer, THE SYSTEM SHALL save name, business name, phone number, city/town, address/area, and notes.
2. WHEN the same customer returns, THE SYSTEM SHALL allow admin to reuse the customer record.
3. WHEN admin opens a customer record, THE SYSTEM SHALL show past ad works.
4. WHEN admin edits customer details, THE SYSTEM SHALL keep the latest details.

---

## Requirement FR-011: Driver registration

**Plain English meaning:** Drivers or vehicle owners should be able to register.  
**Priority:** Must Have  
**Build phase:** M2  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN a driver opens the driver app, THE SYSTEM SHALL allow driver registration.
2. WHEN driver registers, THE SYSTEM SHALL collect name, phone number, city/town, vehicle type, vehicle number, mic/speaker availability, and service areas.
3. WHEN driver submits registration, THE SYSTEM SHALL show status as `Waiting for Approval`.
4. WHEN driver is not approved, THE SYSTEM SHALL not allow them to accept or start ad work.
5. WHEN admin approves driver, THE SYSTEM SHALL allow the driver to log in and see assigned work.

---

## Requirement FR-012: Driver approval

**Plain English meaning:** Admin should approve drivers before assigning work.  
**Priority:** Must Have  
**Build phase:** M2  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN a new driver registers, THE SYSTEM SHALL show the driver in admin approval list.
2. WHEN admin approves the driver, THE SYSTEM SHALL mark driver as approved.
3. WHEN admin rejects the driver, THE SYSTEM SHALL mark driver as rejected and not available for work.
4. WHEN admin needs more information, THE SYSTEM SHALL allow admin to mark driver as `Need More Details`.
5. WHEN driver is approved, THE SYSTEM SHALL allow admin to assign ad work to that driver.

---

## Requirement FR-013: Driver profile

**Plain English meaning:** Admin should know driver and vehicle details.  
**Priority:** Must Have  
**Build phase:** M2  
**Status:** [ ] Not started

### Acceptance criteria

1. THE SYSTEM SHALL store driver phone number.
2. THE SYSTEM SHALL store driver main city/town.
3. THE SYSTEM SHALL store driver service areas.
4. THE SYSTEM SHALL store vehicle number.
5. THE SYSTEM SHALL store vehicle type.
6. THE SYSTEM SHALL store whether mic/speaker system is available.
7. THE SYSTEM SHALL allow optional upload of driver/vehicle photo or document proof.

---

## Requirement FR-014: Driver availability

**Plain English meaning:** Driver should say whether he is free for work.  
**Priority:** Should Have  
**Build phase:** M2  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN driver is free, THE SYSTEM SHALL allow driver to mark `Available`.
2. WHEN driver is busy or not working, THE SYSTEM SHALL allow driver to mark `Not Available`.
3. WHEN admin assigns work, THE SYSTEM SHALL show driver availability.
4. WHEN driver is not available, THE SYSTEM SHALL warn admin before assignment.

---

## Requirement FR-015: Vehicle record

**Plain English meaning:** Admin should know which vehicle is used.  
**Priority:** Must Have  
**Build phase:** M2  
**Status:** [ ] Not started

### Acceptance criteria

1. THE SYSTEM SHALL allow admin to create vehicle records.
2. THE SYSTEM SHALL store vehicle number, vehicle type, owner/driver, city, mic availability, and active/inactive status.
3. THE SYSTEM SHALL allow one driver to have one or more vehicles if needed.
4. THE SYSTEM SHALL allow admin to assign a vehicle to ad work.

---

## Requirement FR-016: City and area setup

**Plain English meaning:** Admin should prepare towns, villages, and important areas.  
**Priority:** Must Have  
**Build phase:** M2  
**Status:** [ ] Not started

### Acceptance criteria

1. THE SYSTEM SHALL allow admin to create city/town records such as Ongole and Addanki.
2. THE SYSTEM SHALL allow admin to create named areas such as Main Road, Market Area, Bus Stand, Colony, Village, or Junction.
3. THE SYSTEM SHALL allow admin to mark an area as active or inactive.
4. WHEN creating ad work, THE SYSTEM SHALL allow admin to select required areas.

---

## Requirement FR-017: Simple area boundary

**Plain English meaning:** The system should know whether the vehicle entered the promised place.  
**Priority:** Must Have  
**Build phase:** M3  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN admin creates an area, THE SYSTEM SHALL allow a simple map point and radius OR simple boundary option.
2. WHEN tracking location enters the area boundary, THE SYSTEM SHALL mark the area as visited.
3. WHEN an area is not visited, THE SYSTEM SHALL keep it as pending.
4. WHEN the day is completed, THE SYSTEM SHALL show covered and missed areas.
5. WHEN boundary setup is not available, THE SYSTEM SHALL allow admin to manually mark area coverage with a reason.

---

## Requirement FR-018: Advertisement job creation

**Plain English meaning:** Admin creates one ad work record for each customer job.  
**Priority:** Must Have  
**Build phase:** M3  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN admin creates ad work, THE SYSTEM SHALL require customer, city/town, title, start date, end date, selected areas, driver, vehicle, tracking type, and package.
2. WHEN required details are missing, THE SYSTEM SHALL show simple validation messages.
3. WHEN ad work is saved, THE SYSTEM SHALL set status to `Scheduled`.
4. WHEN ad work is scheduled, THE SYSTEM SHALL show it in driver assigned work list.
5. WHEN ad work has more than one day, THE SYSTEM SHALL create day-wise work schedule.

---

## Requirement FR-019: Single-day ad work

**Plain English meaning:** Some advertisements happen only for one day.  
**Priority:** Must Have  
**Build phase:** M3  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN start date and end date are same, THE SYSTEM SHALL treat it as one-day ad work.
2. WHEN one-day ad work is completed, THE SYSTEM SHALL allow final report generation.
3. WHEN driver starts work, THE SYSTEM SHALL create a tracking session for that day.
4. WHEN driver ends work, THE SYSTEM SHALL close the tracking session for that day.

---

## Requirement FR-020: Multi-day ad work

**Plain English meaning:** Some advertisements happen for many days.  
**Priority:** Must Have  
**Build phase:** M3  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN admin selects more than one date, THE SYSTEM SHALL create day-wise schedule.
2. WHEN one day is completed, THE SYSTEM SHALL keep the full ad work open until all days are completed.
3. WHEN a day is missed, THE SYSTEM SHALL allow admin to reschedule that day.
4. WHEN all days are completed, THE SYSTEM SHALL allow final combined report generation.
5. WHEN viewing report, THE SYSTEM SHALL show day-wise summary and full campaign summary.

---

## Requirement FR-021: Assign driver and vehicle

**Plain English meaning:** Admin should assign the right person and vehicle.  
**Priority:** Must Have  
**Build phase:** M3  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN admin creates ad work, THE SYSTEM SHALL allow selecting approved driver.
2. WHEN admin creates ad work, THE SYSTEM SHALL allow selecting active vehicle.
3. WHEN driver is not approved, THE SYSTEM SHALL not allow assignment.
4. WHEN vehicle is inactive, THE SYSTEM SHALL warn admin.
5. WHEN driver and vehicle are assigned, THE SYSTEM SHALL show assignment in admin and driver app.

---

## Requirement FR-022: Tracking type selection

**Plain English meaning:** Admin decides whether to use phone location, vehicle GPS device, or both.  
**Priority:** Must Have  
**Build phase:** M3  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN admin creates ad work, THE SYSTEM SHALL allow tracking type `Phone Location`.
2. THE SYSTEM SHALL allow tracking type `Vehicle GPS Device`.
3. THE SYSTEM SHALL allow tracking type `Phone + Vehicle GPS Device`.
4. WHEN selected tracking type requires a GPS device, THE SYSTEM SHALL require an assigned device record.
5. WHEN selected tracking type is phone-only, THE SYSTEM SHALL not require device record.
6. WHEN ad work is active, THE SYSTEM SHALL show which tracking type is being used.

---

## Requirement FR-023: GPS device record

**Plain English meaning:** System should be ready for vehicle GPS devices without forcing them for every job.  
**Priority:** Should Have  
**Build phase:** M3/M6  
**Status:** [ ] Not started

### Acceptance criteria

1. THE SYSTEM SHALL allow admin to create a GPS device record.
2. THE SYSTEM SHALL store device name, device ID, provider name, assigned vehicle, active/inactive status, and notes.
3. THE SYSTEM SHALL allow admin to assign a device to a vehicle.
4. WHEN device is inactive, THE SYSTEM SHALL not use it for new ad work.
5. WHEN device data is not yet integrated, THE SYSTEM SHALL show device status as `Not Connected` or `Integration Pending`.

---

## Requirement FR-024: Driver assigned work list

**Plain English meaning:** Driver should see the work assigned to him.  
**Priority:** Must Have  
**Build phase:** M3  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN an approved driver logs in, THE SYSTEM SHALL show assigned upcoming work.
2. WHEN driver has no assigned work, THE SYSTEM SHALL show a simple empty message.
3. WHEN driver opens an assigned job, THE SYSTEM SHALL show customer area, city, date, start time, selected areas, and action buttons.
4. THE SYSTEM SHALL not show customer payment details to driver unless AP approves later.

---

## Requirement FR-025: Driver start work

**Plain English meaning:** Driver starts advertisement work from the app.  
**Priority:** Must Have  
**Build phase:** M4  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN driver presses `Start Work`, THE SYSTEM SHALL ask for required location permission if not already granted.
2. WHEN driver confirms start, THE SYSTEM SHALL set day status to `Running`.
3. WHEN work starts, THE SYSTEM SHALL start location proof only for that active work session.
4. WHEN work starts, THE SYSTEM SHALL record start time.
5. WHEN work starts, THE SYSTEM SHALL create a customer update event `Started`.
6. WHEN work is already running, THE SYSTEM SHALL not create duplicate start sessions.

---

## Requirement FR-026: Stop tracking after completion

**Plain English meaning:** Driver should not be tracked after work is finished.  
**Priority:** Must Have  
**Build phase:** M4  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN driver presses `End Work`, THE SYSTEM SHALL stop phone location tracking for that work session.
2. WHEN admin marks work as completed, THE SYSTEM SHALL stop active tracking for that work session.
3. WHEN the work session is completed, THE SYSTEM SHALL not collect new phone location points for that session.
4. WHEN tracking is stopped, THE SYSTEM SHALL show tracking status as `Stopped`.
5. WHEN driver opens app after completion, THE SYSTEM SHALL not continue tracking unless a new assigned work session is started.

---

## Requirement FR-027: Admin stop tracking control

**Plain English meaning:** Admin can stop tracking if driver forgets.  
**Priority:** Must Have  
**Build phase:** M4  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN work is running, THE SYSTEM SHALL allow admin to stop tracking with a reason.
2. WHEN admin stops tracking, THE SYSTEM SHALL record who stopped it and why.
3. WHEN admin stops tracking, THE SYSTEM SHALL notify or show driver that tracking was stopped.
4. WHEN tracking is stopped by admin, THE SYSTEM SHALL not collect further location points for that session.

---

## Requirement FR-028: Phone location proof

**Plain English meaning:** The driver phone should send location during active work.  
**Priority:** Must Have  
**Build phase:** M4  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN work is running and phone tracking is selected, THE SYSTEM SHALL collect location points from driver phone.
2. WHEN work is not running, THE SYSTEM SHALL not collect phone location points.
3. WHEN phone location permission is missing, THE SYSTEM SHALL show driver a clear message.
4. WHEN phone location is weak, THE SYSTEM SHALL mark tracking quality as weak.
5. WHEN phone sends location, THE SYSTEM SHALL save latitude, longitude, time, accuracy if available, speed if available, and source as `mobile`.

---

## Requirement FR-029: Offline location saving

**Plain English meaning:** Route proof should not be lost when internet is weak.  
**Priority:** Must Have  
**Build phase:** M4  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN internet is unavailable during running work, THE SYSTEM SHALL save location points locally on the driver phone.
2. WHEN internet returns, THE SYSTEM SHALL upload saved offline points.
3. WHEN offline points are uploaded, THE SYSTEM SHALL preserve original recorded time.
4. WHEN offline sync succeeds, THE SYSTEM SHALL mark points as synced.
5. WHEN offline sync fails, THE SYSTEM SHALL retry safely without losing data.
6. WHEN admin views active work, THE SYSTEM SHALL show `Network Lost / Offline Saving` if recent location is not received.

---

## Requirement FR-030: Tracking status

**Plain English meaning:** Admin should know if tracking is working or not.  
**Priority:** Must Have  
**Build phase:** M4  
**Status:** [ ] Not started

### Acceptance criteria

1. THE SYSTEM SHALL show tracking status as `Not Started`, `Running`, `Paused`, `Offline Saving`, `GPS Weak`, `Device Not Responding`, `Stopped`, or `Completed`.
2. WHEN no location is received for a configured time during active work, THE SYSTEM SHALL show warning status.
3. WHEN location resumes, THE SYSTEM SHALL return to normal status.
4. WHEN tracking is stopped after completion, THE SYSTEM SHALL show stopped/completed status.

---

## Requirement FR-031: Long stop alert

**Plain English meaning:** Admin should know if the vehicle waits too long.  
**Priority:** Must Have  
**Build phase:** M4  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN vehicle remains within a small area for longer than configured limit, THE SYSTEM SHALL create a long stop alert.
2. WHEN driver has marked a break, THE SYSTEM SHALL show the stop as break-related.
3. WHEN long stop alert is created, THE SYSTEM SHALL show it in admin dashboard.
4. WHEN admin resolves the alert, THE SYSTEM SHALL record resolution note.
5. WHEN final report is generated, THE SYSTEM SHALL include stop summary.

---

## Requirement FR-032: Driver break option

**Plain English meaning:** Driver can explain genuine stops.  
**Priority:** Must Have  
**Build phase:** M4  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN driver needs a break, THE SYSTEM SHALL allow selecting break reason such as Tea, Lunch, Fuel, Vehicle Issue, Rain, Police/Traffic, Customer Instruction, Other.
2. WHEN break starts, THE SYSTEM SHALL record break start time.
3. WHEN break ends, THE SYSTEM SHALL record break end time.
4. WHEN break is active, THE SYSTEM SHALL show status as `Paused`.
5. WHEN report is generated, THE SYSTEM SHALL show break duration and reason.

---

## Requirement FR-033: Area coverage

**Plain English meaning:** The system should show which promised areas were covered.  
**Priority:** Must Have  
**Build phase:** M4  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN tracking points enter a planned area boundary, THE SYSTEM SHALL mark that area as covered.
2. WHEN area is covered, THE SYSTEM SHALL record first entry time.
3. WHEN area is not covered by end of work, THE SYSTEM SHALL mark it as missed.
4. WHEN admin views active work, THE SYSTEM SHALL show covered and pending areas.
5. WHEN report is generated, THE SYSTEM SHALL show covered and missed areas.

---

## Requirement FR-034: Valid distance summary

**Plain English meaning:** Distance should count mainly in required places, not random roads.  
**Priority:** Should Have  
**Build phase:** M5  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN location points are available, THE SYSTEM SHALL calculate approximate total distance.
2. WHEN planned areas have boundaries, THE SYSTEM SHALL separately calculate approximate distance inside planned areas if feasible.
3. WHEN distance cannot be accurately calculated, THE SYSTEM SHALL show it as approximate.
4. THE SYSTEM SHALL not use distance alone as proof of completion.
5. THE SYSTEM SHALL combine distance, time, area coverage, and proof uploads for work summary.

---

## Requirement FR-035: Manual photo proof

**Plain English meaning:** Driver can upload photos from important places.  
**Priority:** Must Have  
**Build phase:** M4  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN work is running, THE SYSTEM SHALL allow driver to upload photo proof.
2. WHEN photo is uploaded, THE SYSTEM SHALL save photo time and location if available.
3. WHEN photo upload fails due to network, THE SYSTEM SHALL queue upload and retry later.
4. WHEN admin views the work, THE SYSTEM SHALL show proof photos.
5. WHEN report is generated, THE SYSTEM SHALL include selected proof photos.

---

## Requirement FR-036: Manual audio/video proof

**Plain English meaning:** Driver can upload short mic proof when needed.  
**Priority:** Should Have  
**Build phase:** M5  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN work is running, THE SYSTEM SHALL allow driver to upload short audio or video proof if enabled.
2. WHEN audio/video proof is uploaded, THE SYSTEM SHALL save proof time and location if available.
3. THE SYSTEM SHALL not secretly record audio.
4. THE SYSTEM SHALL not continuously record background audio in v1.
5. WHEN admin asks for proof, THE SYSTEM SHALL show driver a clear request.

---

## Requirement FR-037: Admin live map

**Plain English meaning:** Your team should see live work status.  
**Priority:** Must Have  
**Build phase:** M4  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN work is running, THE SYSTEM SHALL show latest known vehicle/driver location to admin.
2. WHEN location is old, THE SYSTEM SHALL show last updated time.
3. WHEN offline saving is active, THE SYSTEM SHALL show that live location may be delayed.
4. WHEN work is completed, THE SYSTEM SHALL show final route history.
5. THE SYSTEM SHALL not expose admin live map to customer by default.

---

## Requirement FR-038: Customer milestone updates

**Plain English meaning:** Customer gets simple updates instead of live tracking by default.  
**Priority:** Must Have  
**Build phase:** M5  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN ad work is scheduled, THE SYSTEM SHALL create an update message `Your advertisement is scheduled`.
2. WHEN ad work starts, THE SYSTEM SHALL create an update message `Your advertisement has started`.
3. WHEN ad work is running, THE SYSTEM SHALL allow admin to send simple in-progress update.
4. WHEN important area is covered, THE SYSTEM SHALL allow admin to send area update if needed.
5. WHEN ad work is completed, THE SYSTEM SHALL create an update message `Your advertisement is completed`.
6. WHEN report is ready, THE SYSTEM SHALL create an update message `Your proof report is ready`.

---

## Requirement FR-039: Low-cost customer message sharing

**Plain English meaning:** Do not depend on paid WhatsApp/SMS APIs in first version.  
**Priority:** Must Have  
**Build phase:** M5  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN an update is ready, THE SYSTEM SHALL generate simple message text.
2. WHEN admin wants to send update, THE SYSTEM SHALL provide copy/share option.
3. WHEN WhatsApp sharing is supported on the device/browser, THE SYSTEM SHALL open a share link or allow copy message.
4. THE SYSTEM SHALL record whether admin marked the update as sent.
5. THE SYSTEM SHALL allow future automated SMS/WhatsApp integration without changing the main customer update model.

---

## Requirement FR-040: Report-ready notification

**Plain English meaning:** Customer should know when proof is ready.  
**Priority:** Must Have  
**Build phase:** M5  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN final report is generated, THE SYSTEM SHALL create report-ready message.
2. THE SYSTEM SHALL allow admin to copy/share the report link.
3. WHEN customer opens report link, THE SYSTEM SHALL show a simple report page.
4. WHEN report link is invalid or expired, THE SYSTEM SHALL show a safe error message.

---

## Requirement FR-041: Daily summary report

**Plain English meaning:** Each day’s work should have a simple summary.  
**Priority:** Must Have  
**Build phase:** M5  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN a day’s work ends, THE SYSTEM SHALL generate day summary.
2. Day summary SHALL include start time, end time, total duration, break duration, covered areas, missed areas, distance estimate, proof count, and alerts.
3. WHEN admin edits summary note, THE SYSTEM SHALL save admin note.
4. WHEN final report is generated, THE SYSTEM SHALL include day summary.

---

## Requirement FR-042: Final proof report

**Plain English meaning:** The report is the main proof sold to customers.  
**Priority:** Must Have  
**Build phase:** M5  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN ad work is completed, THE SYSTEM SHALL allow admin to generate final proof report.
2. Final report SHALL include customer name, business name, ad work title, city/town, dates, selected areas, covered areas, missed areas, start/end times, duration, stops, proof photos, and admin notes.
3. WHEN ad work is multi-day, final report SHALL include day-wise summaries.
4. WHEN customer opens final report, THE SYSTEM SHALL use simple language.
5. WHEN admin downloads report, THE SYSTEM SHALL provide print/download PDF style output.

---

## Requirement FR-043: Report privacy

**Plain English meaning:** Report should show proof but not expose unnecessary personal data.  
**Priority:** Must Have  
**Build phase:** M5  
**Status:** [ ] Not started

### Acceptance criteria

1. THE SYSTEM SHALL not show full raw location point list to customer by default.
2. THE SYSTEM SHALL not show driver personal details beyond AP-approved fields.
3. THE SYSTEM SHALL not show admin internal notes to customer unless marked shareable.
4. THE SYSTEM SHALL allow report link access only through secure or hard-to-guess token.
5. THE SYSTEM SHALL allow admin to disable a report link.

---

## Requirement FR-044: Payment status

**Plain English meaning:** Admin should track money collection.  
**Priority:** Must Have  
**Build phase:** M3  
**Status:** [ ] Not started

### Acceptance criteria

1. THE SYSTEM SHALL allow payment status `Not Paid`, `Advance Paid`, `Partially Paid`, `Fully Paid`, and `Refund/Adjustment`.
2. THE SYSTEM SHALL allow admin to enter amount, paid amount, balance, and notes.
3. WHEN report is generated, THE SYSTEM SHALL not show payment details unless AP approves.
4. WHEN admin dashboard opens, THE SYSTEM SHALL show pending payment count or amount.

---

## Requirement FR-045: Packages

**Plain English meaning:** Admin can sell simple packages.  
**Priority:** Should Have  
**Build phase:** M3  
**Status:** [ ] Not started

### Acceptance criteria

1. THE SYSTEM SHALL allow package records such as Basic, Standard, Premium.
2. Basic package SHALL include updates and final report.
3. Standard package MAY include more proof photos and area updates.
4. Premium package MAY include customer live tracking if enabled.
5. WHEN admin creates ad work, THE SYSTEM SHALL allow selecting package.

---

## Requirement FR-046: Optional customer live tracking

**Plain English meaning:** Customer live map is an extra paid feature, not default.  
**Priority:** Should Have  
**Build phase:** M6/M7  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN customer live tracking is not enabled, THE SYSTEM SHALL not show live map to customer.
2. WHEN premium live tracking is enabled, THE SYSTEM SHALL require admin approval.
3. WHEN premium live tracking is enabled, THE SYSTEM SHALL require driver consent for that work.
4. WHEN work is completed, THE SYSTEM SHALL stop live customer tracking.
5. WHEN live tracking link is shared, THE SYSTEM SHALL expire or disable it after work completion.
6. WHEN customer opens live link, THE SYSTEM SHALL show view-only location and simple status only.

---

## Requirement FR-047: Driver consent for tracking

**Plain English meaning:** Driver should clearly know when he is being tracked.  
**Priority:** Must Have  
**Build phase:** M4  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN driver starts work, THE SYSTEM SHALL show a simple location consent message.
2. Consent message SHALL say tracking is only for assigned ad work.
3. Consent message SHALL say tracking stops after completion.
4. WHEN customer live tracking is enabled, THE SYSTEM SHALL show that customer may see live location.
5. WHEN driver does not agree to required consent, THE SYSTEM SHALL not start tracking and SHALL show admin warning.

---

## Requirement FR-048: Location privacy rule

**Plain English meaning:** The system must not track outside work.  
**Priority:** Must Have  
**Build phase:** M4  
**Status:** [ ] Not started

### Acceptance criteria

1. THE SYSTEM SHALL collect driver phone location only during active work session.
2. THE SYSTEM SHALL stop collection after work is completed, cancelled, or stopped by admin.
3. THE SYSTEM SHALL show active tracking indicator to driver while tracking is active.
4. THE SYSTEM SHALL store tracking records linked to the ad work session only.
5. THE SYSTEM SHALL not use driver location for unrelated purposes.

---

## Requirement FR-049: GPS disconnected alert

**Plain English meaning:** Admin should know if proof collection stops.  
**Priority:** Must Have  
**Build phase:** M4  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN no mobile location is received within configured time during active phone tracking, THE SYSTEM SHALL create alert.
2. WHEN no device location is received within configured time during active device tracking, THE SYSTEM SHALL create alert.
3. WHEN location resumes, THE SYSTEM SHALL mark alert as recovered or allow admin to resolve.
4. THE SYSTEM SHALL show alert time and last known location time.

---

## Requirement FR-050: Low battery warning

**Plain English meaning:** Phone tracking can fail if driver phone battery dies.  
**Priority:** Should Have  
**Build phase:** M4/M5  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN driver phone battery is low during active work, THE SYSTEM SHALL warn driver.
2. WHEN battery is very low, THE SYSTEM SHALL create admin alert if supported by the platform.
3. WHEN final report is generated, THE SYSTEM SHALL show if tracking was affected by low battery.

---

## Requirement FR-051: Vehicle GPS device ingestion

**Plain English meaning:** GPS device should be able to send location to the server.  
**Priority:** Should Have  
**Build phase:** M6  
**Status:** [ ] Not started

### Acceptance criteria

1. THE SYSTEM SHALL provide a secure location ingest endpoint or integration layer for GPS device data.
2. Device location event SHALL include device ID, time, latitude, longitude, and optional speed/accuracy/ignition fields if available.
3. WHEN device event is received, THE SYSTEM SHALL match it to active device, vehicle, and running ad work.
4. WHEN no matching active ad work exists, THE SYSTEM SHALL store or reject event according to AP-approved rule.
5. THE SYSTEM SHALL not expose device API tokens in frontend code.

---

## Requirement FR-052: Phone and device comparison

**Plain English meaning:** If both phone and GPS device are used, the system checks if they are near each other.  
**Priority:** Later / Premium  
**Build phase:** M7  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN tracking type is `Phone + Vehicle GPS Device`, THE SYSTEM SHALL compare latest phone and device locations.
2. WHEN locations are too far apart for longer than configured time, THE SYSTEM SHALL create mismatch alert.
3. THE SYSTEM SHALL not create mismatch alert for short GPS errors.
4. THE SYSTEM SHALL show mismatch as admin alert, not automatic customer complaint.
5. THE SYSTEM SHALL include mismatch summary in internal report if applicable.

---

## Requirement FR-053: Route replay/history

**Plain English meaning:** Admin can check where the vehicle went after work.  
**Priority:** Should Have  
**Build phase:** M5  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN work is completed, THE SYSTEM SHALL show route history to admin.
2. WHEN location points are offline-synced later, THE SYSTEM SHALL update route history.
3. WHEN route data is missing, THE SYSTEM SHALL show reason if known.
4. Customer report SHALL show simple route summary, not complicated raw route data by default.

---

## Requirement FR-054: Alert management

**Plain English meaning:** Admin should handle problems during work.  
**Priority:** Must Have  
**Build phase:** M4/M5  
**Status:** [ ] Not started

### Acceptance criteria

1. THE SYSTEM SHALL create alerts for long stop, GPS disconnected, network lost, missed area, device not responding, and phone/device mismatch if enabled.
2. THE SYSTEM SHALL show open alerts in dashboard.
3. THE SYSTEM SHALL allow admin to mark alert as resolved with note.
4. THE SYSTEM SHALL keep alert history.
5. Final report SHALL show customer-safe alert summary only if AP decides it should be shared.

---

## Requirement FR-055: Manual admin update

**Plain English meaning:** Admin can add real-life updates that system may not know.  
**Priority:** Must Have  
**Build phase:** M5  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN admin needs to inform customer, THE SYSTEM SHALL allow manual update note.
2. Manual update SHALL be saved with time and admin name.
3. Manual update SHALL be shareable as customer message.
4. Internal-only notes SHALL not appear in customer report unless marked shareable.

---

## Requirement FR-056: Cancellation and reschedule

**Plain English meaning:** Real-life work may be cancelled or moved.  
**Priority:** Should Have  
**Build phase:** M5  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN ad work cannot happen, THE SYSTEM SHALL allow admin to cancel with reason.
2. WHEN ad work date changes, THE SYSTEM SHALL allow admin to reschedule.
3. WHEN one day in multi-day work is missed, THE SYSTEM SHALL allow reschedule for that day.
4. THE SYSTEM SHALL record cancellation or reschedule reason.
5. THE SYSTEM SHALL allow customer update message for cancellation/reschedule.

---

## Requirement FR-057: Basic audit log

**Plain English meaning:** Important changes should be recorded.  
**Priority:** Must Have  
**Build phase:** M5  
**Status:** [ ] Not started

### Acceptance criteria

1. THE SYSTEM SHALL record who created or changed ad work.
2. THE SYSTEM SHALL record status changes.
3. THE SYSTEM SHALL record driver assignment changes.
4. THE SYSTEM SHALL record tracking start and stop events.
5. THE SYSTEM SHALL record report generation.
6. THE SYSTEM SHALL record customer live tracking enable/disable.

---

## Requirement FR-058: Simple UI language

**Plain English meaning:** The app should be understandable by common users.  
**Priority:** Must Have  
**Build phase:** All  
**Status:** [ ] Not started

### Acceptance criteria

1. THE SYSTEM SHALL use simple labels like Start Work, End Work, Upload Photo, Take Break, Call Admin.
2. THE SYSTEM SHALL avoid unnecessary technical words in customer and driver views.
3. THE SYSTEM SHALL use large buttons for driver actions.
4. THE SYSTEM SHALL show clear success and error messages.
5. THE SYSTEM SHALL keep driver work flow within minimum taps where possible.

---

## Requirement FR-059: Telugu-ready labels

**Plain English meaning:** The app should be ready for Telugu later.  
**Priority:** Should Have  
**Build phase:** M5  
**Status:** [ ] Not started

### Acceptance criteria

1. THE SYSTEM SHALL keep UI labels in a structure that can support translation later.
2. THE SYSTEM SHALL not hardcode all labels deep inside business logic.
3. WHEN Telugu language is enabled later, THE SYSTEM SHALL be able to show key driver/customer labels in Telugu.
4. v1 MAY ship English-only if AP approves.

---

## Requirement FR-060: Support contact

**Plain English meaning:** Driver and customer should easily contact your team.  
**Priority:** Must Have  
**Build phase:** M2/M3  
**Status:** [ ] Not started

### Acceptance criteria

1. Website SHALL show contact phone/WhatsApp.
2. Driver app SHALL show Call Admin button.
3. Admin dashboard SHALL show customer phone and driver phone.
4. Report page SHALL show customer support contact if AP approves.

---

## Requirement FR-061: Data export

**Plain English meaning:** Your team should not be locked in.  
**Priority:** Should Have  
**Build phase:** M6  
**Status:** [ ] Not started

### Acceptance criteria

1. THE SYSTEM SHALL allow admin to export enquiries.
2. THE SYSTEM SHALL allow admin to export customers.
3. THE SYSTEM SHALL allow admin to export ad work summary.
4. THE SYSTEM SHALL not export sensitive raw location data unless Owner/Admin role allows it.
5. Export files SHALL not include secrets or internal system tokens.

---

## Requirement FR-062: Search and filters

**Plain English meaning:** Admin should find records easily.  
**Priority:** Should Have  
**Build phase:** M5  
**Status:** [ ] Not started

### Acceptance criteria

1. Admin SHALL be able to search customers by name, business name, or phone number.
2. Admin SHALL be able to filter ad works by date, city, status, driver, and payment status.
3. Admin SHALL be able to filter drivers by city, availability, and approval status.
4. Search results SHALL be easy to read.

---

## Requirement FR-063: Basic security

**Plain English meaning:** Business and tracking data should be protected.  
**Priority:** Must Have  
**Build phase:** All  
**Status:** [ ] Not started

### Acceptance criteria

1. THE SYSTEM SHALL require authentication for admin dashboard.
2. THE SYSTEM SHALL restrict driver access to only assigned work.
3. THE SYSTEM SHALL protect report links using unguessable tokens or equivalent safe access.
4. THE SYSTEM SHALL keep device ingest tokens secret.
5. THE SYSTEM SHALL not expose database keys or secrets in frontend code.
6. THE SYSTEM SHALL validate server-side permissions for sensitive operations.

---

## Requirement FR-064: Basic data retention

**Plain English meaning:** Do not keep unnecessary location data forever without a business reason.  
**Priority:** Should Have  
**Build phase:** M6  
**Status:** [ ] Not started

### Acceptance criteria

1. THE SYSTEM SHALL define how long location proof is kept.
2. THE SYSTEM SHALL allow Owner/Admin to archive old ad works.
3. THE SYSTEM SHALL keep final reports available while business needs them.
4. THE SYSTEM SHALL support future deletion or masking of old raw location points.

---

## Requirement FR-065: Development completion tracking

**Plain English meaning:** Codex should mark requirements and tasks as completed only after proof.  
**Priority:** Must Have  
**Build phase:** All  
**Status:** [ ] Not started

### Acceptance criteria

1. WHEN Codex implements a requirement, Codex SHALL update the matching task status in `tasks.md`.
2. WHEN Codex marks a task completed, Codex SHALL include verification evidence in the PR or commit summary.
3. WHEN a requirement is only partially done, Codex SHALL not mark it completed.
4. WHEN a requirement needs AP decision, Codex SHALL mark it as `[?] Needs AP decision`.

---

# 6. Out of scope for v1

The following are not part of first version unless AP explicitly approves.

| Item | Reason |
|---|---|
| Customer mobile app | Not needed for first pilot. |
| iOS app | Extra cost and not needed for local pilot. |
| Full automated WhatsApp Business API | Paid/approval dependency; start with share/copy messages. |
| Hidden audio recording | Privacy and trust risk. |
| Automatic jingle recognition | Too advanced for MVP. |
| Customer live tracking by default | Can create confusion/disputes; keep premium. |
| AI route judgment | Not needed; rule-based proof is enough. |
| Complex polygon drawing for every road | Start with simple area/radius boundaries. |
| Full accounting system | Payment status is enough. |
| Marketplace payments to drivers | Can be manual first. |

---

# 7. MVP completion definition

The MVP is complete only when:

1. Website accepts enquiries.
2. Admin can manage customers, drivers, vehicles, cities, areas, and ad work.
3. Driver can register and be approved.
4. Driver can start/end assigned work.
5. Phone location tracking works only during active work.
6. Tracking stops after work completion.
7. Offline location saving and later sync works.
8. Admin can see live status and alerts.
9. Customer gets simple update messages through copy/share flow.
10. Final report is generated and shareable.
11. Single-day and multi-day work are supported.
12. Device GPS is at least data-model-ready and integration-ready.
13. Customer live tracking is available only as disabled-by-default premium setting or deferred task.
14. Basic security and privacy rules are enforced.
15. Codex task checklist is updated with implementation evidence.

---

# 8. AP decision points

Codex should ask AP only when required for these decisions. If AP is not available, use the default listed below.

| Decision | Default |
|---|---|
| Product name | Prachar |
| First pilot city | Ongole |
| Second pilot city | Addanki |
| Customer live tracking | Disabled by default |
| Driver live sharing to customer | Requires per-work consent |
| Tracking source default | Phone Location |
| Device GPS | Integration-ready, not mandatory for every job |
| Report link expiry | 30 days default |
| Location retention | 90 days raw route, reports retained longer |
| Notification method | Copy/share WhatsApp message first |
| Customer app | Not in v1 |
| PWA | Not in v1 |


---

# Design

# Kootha / Prachar MVP — Design Document

**Spec ID:** `kootha-prachar-mvp`  
**Version:** 0.1  
**Purpose:** Low-cost design for a realistic local mic advertisement proof platform.

---

## 1. Design goals

1. Keep first build affordable.
2. Avoid unnecessary paid APIs in v1.
3. Give customers a strong proof experience without forcing them to install an app.
4. Give admin full control over live tracking, drivers, reports, and payments.
5. Give drivers a simple Android app with big buttons.
6. Track only during active ad work.
7. Support both phone location and vehicle GPS device location.
8. Keep device GPS integration flexible so any practical device/vendor can be added later.
9. Make every important feature testable and markable as complete.

---

## 2. Recommended product structure

```text
Public Website
  -> explains service
  -> collects enquiries
  -> shows sample report
  -> shows contact/WhatsApp

Admin Web Dashboard
  -> manages customers, drivers, vehicles, cities, areas
  -> creates ad work
  -> selects tracking type
  -> sees live work status
  -> handles alerts
  -> sends/copies customer updates
  -> generates reports

Driver Android App
  -> driver registration
  -> driver approval status
  -> assigned work list
  -> start work
  -> stop work
  -> take break
  -> upload photo/audio/video proof
  -> phone location proof
  -> offline saving and sync

GPS Device Integration Layer
  -> device records
  -> secure ingest endpoint
  -> maps device data to vehicle/ad work
  -> later vendor-specific protocol adapters

Customer Report Link
  -> customer sees simple status/report
  -> no login required in v1 if tokenized
  -> no live tracking unless premium enabled
```

---

## 3. Recommended low-cost technology direction

This is not mandatory, but it is a sensible starting point for Codex.

| Layer | Low-cost recommendation |
|---|---|
| Website/Admin frontend | React + Vite |
| Admin UI | Simple component library or custom clean CSS |
| Backend/database | Supabase/Postgres or another simple managed Postgres |
| Auth | Supabase Auth or similar |
| Driver app | Android-first React Native or Flutter |
| Maps | Low-cost web map approach for admin; avoid customer live map by default |
| File storage | Supabase Storage or compatible object storage |
| Reports | HTML report page + browser print/download PDF first |
| Notifications v1 | Message generation + copy/share to WhatsApp |
| Notifications later | WhatsApp Business/SMS provider integration |
| Device GPS later | Secure HTTP endpoint first, vendor adapter later |

---

## 4. High-level architecture

```text
[Customer Website]
      |
      v
[Enquiry Database] ----> [Admin Dashboard]
                              |
                              v
                       [Ad Work / Schedule]
                              |
                              v
                    [Driver Android App]
                              |
                 Phone Location / Proof Uploads
                              |
                              v
                       [Tracking Store]
                              |
          [Alerts + Area Coverage + Report Builder]
                              |
                              v
                 [Customer Updates + Report Link]


[Vehicle GPS Device] ---> [Device Ingest API] ---> [Tracking Store]
```

---

## 5. Core data model

The exact schema can change during implementation, but these business entities should exist.

### 5.1 `customers`

| Field | Meaning |
|---|---|
| id | Customer ID |
| name | Person name |
| business_name | Shop/company name |
| phone | Phone number |
| city | Main city/town |
| address | Address or locality |
| notes | Admin notes |
| created_at | Created time |

### 5.2 `enquiries`

| Field | Meaning |
|---|---|
| id | Enquiry ID |
| customer_name | Person name |
| business_name | Business name |
| phone | Phone |
| city | City/town |
| required_areas | Requested areas |
| preferred_start_date | Preferred start |
| number_of_days | Days requested |
| source | Website/Phone/WhatsApp/Admin |
| status | New/Contacted/Converted/Rejected |
| message | Customer message |
| created_at | Created time |

### 5.3 `drivers`

| Field | Meaning |
|---|---|
| id | Driver ID |
| name | Driver name |
| phone | Driver phone |
| city | Driver city |
| service_areas | Areas driver can cover |
| approval_status | Waiting/Approved/Rejected/Need More Details |
| availability_status | Available/Not Available |
| notes | Admin notes |
| created_at | Created time |

### 5.4 `vehicles`

| Field | Meaning |
|---|---|
| id | Vehicle ID |
| driver_id | Linked driver |
| vehicle_number | Vehicle number |
| vehicle_type | Auto/Van/Car/Other |
| mic_available | Yes/No |
| active | Active/inactive |
| city | City/town |
| notes | Notes |

### 5.5 `gps_devices`

| Field | Meaning |
|---|---|
| id | Internal ID |
| device_code | Unique device identifier |
| provider_name | Device vendor/provider |
| vehicle_id | Assigned vehicle |
| status | Active/Inactive/Not Connected |
| ingest_token_hash | Server-side secret/token hash |
| notes | Notes |

### 5.6 `cities`

| Field | Meaning |
|---|---|
| id | City ID |
| name | Ongole/Addanki/etc. |
| district | Optional |
| state | Optional |
| active | Active/inactive |

### 5.7 `areas`

| Field | Meaning |
|---|---|
| id | Area ID |
| city_id | City |
| name | Market, Main Road, Village, etc. |
| center_lat | Optional map center |
| center_lng | Optional map center |
| radius_meters | Simple boundary radius |
| boundary_polygon | Later optional polygon |
| active | Active/inactive |

### 5.8 `ad_works`

| Field | Meaning |
|---|---|
| id | Ad work ID |
| customer_id | Customer |
| title | Ad work title |
| city_id | Main city |
| package_type | Basic/Standard/Premium |
| start_date | Start date |
| end_date | End date |
| status | Enquiry/Scheduled/Running/Paused/Completed/Cancelled |
| tracking_type | mobile/device/both |
| customer_live_enabled | true/false |
| payment_status | Not Paid/Advance Paid/Partially Paid/Fully Paid |
| total_amount | Quoted amount |
| paid_amount | Paid amount |
| notes | Admin notes |

### 5.9 `ad_work_days`

| Field | Meaning |
|---|---|
| id | Day ID |
| ad_work_id | Parent ad work |
| work_date | Date |
| planned_start_time | Planned start |
| planned_end_time | Planned end |
| actual_start_time | Actual start |
| actual_end_time | Actual end |
| status | Scheduled/Running/Paused/Completed/Missed/Rescheduled |
| driver_id | Assigned driver |
| vehicle_id | Assigned vehicle |
| gps_device_id | Optional GPS device |
| summary_note | Admin summary |

### 5.10 `ad_work_areas`

| Field | Meaning |
|---|---|
| id | Record ID |
| ad_work_id | Parent ad work |
| ad_work_day_id | Optional day |
| area_id | Area |
| status | Pending/Covered/Missed/Manual |
| first_covered_at | First covered time |
| manual_note | Manual coverage note |

### 5.11 `tracking_sessions`

| Field | Meaning |
|---|---|
| id | Session ID |
| ad_work_day_id | Linked day |
| source_type | mobile/device/both |
| status | Not Started/Running/Paused/Stopped/Completed |
| started_at | Start |
| ended_at | End |
| stopped_by | Driver/Admin/System |
| stop_reason | Reason |

### 5.12 `location_points`

| Field | Meaning |
|---|---|
| id | Point ID |
| tracking_session_id | Session |
| source | mobile/device |
| device_id | Optional GPS device |
| driver_id | Optional driver |
| recorded_at | Actual recorded time |
| received_at | Server received time |
| lat | Latitude |
| lng | Longitude |
| accuracy_meters | Optional |
| speed | Optional |
| offline_synced | true/false |
| quality | good/weak/unknown |

### 5.13 `proof_uploads`

| Field | Meaning |
|---|---|
| id | Proof ID |
| ad_work_day_id | Linked day |
| type | photo/audio/video |
| file_url | Storage path |
| uploaded_by | Driver/admin |
| recorded_at | Time |
| lat/lng | Optional location |
| note | Note |
| customer_visible | true/false |

### 5.14 `alerts`

| Field | Meaning |
|---|---|
| id | Alert ID |
| ad_work_day_id | Work day |
| type | Long Stop/GPS Lost/Network Lost/Missed Area/Device Not Responding/Mismatch |
| severity | Info/Warning/Critical |
| status | Open/Resolved |
| message | Simple alert message |
| created_at | Created |
| resolved_at | Resolved |
| resolved_by | Admin |
| resolution_note | Note |

### 5.15 `customer_updates`

| Field | Meaning |
|---|---|
| id | Update ID |
| ad_work_id | Ad work |
| ad_work_day_id | Optional day |
| type | Scheduled/Started/In Progress/Area Covered/Completed/Report Ready/Manual |
| message | Customer-safe message |
| channel | Copy/WhatsApp/SMS/API later |
| sent_status | Draft/Copied/Sent/Failed |
| sent_at | Sent time |
| created_by | System/Admin |

### 5.16 `reports`

| Field | Meaning |
|---|---|
| id | Report ID |
| ad_work_id | Ad work |
| public_token | Secure token |
| status | Draft/Generated/Shared/Disabled |
| generated_at | Generated time |
| generated_by | Admin |
| report_snapshot | Saved summary JSON |

### 5.17 `audit_logs`

| Field | Meaning |
|---|---|
| id | Log ID |
| actor_type | Admin/Driver/System |
| actor_id | Actor |
| action | Action name |
| entity_type | Entity type |
| entity_id | Entity ID |
| created_at | Time |
| safe_details | Non-sensitive details |

---

## 6. Main workflows

### 6.1 Customer enquiry workflow

```text
Customer visits website
  -> submits enquiry form
  -> enquiry saved as New
  -> admin calls customer
  -> admin converts enquiry to customer/ad work
```

### 6.2 Driver onboarding workflow

```text
Driver opens Android app
  -> registers with name, phone, city, vehicle
  -> status = Waiting for Approval
  -> admin reviews driver
  -> admin approves
  -> driver can receive work
```

### 6.3 Ad work creation workflow

```text
Admin creates customer/ad work
  -> selects city, areas, dates, package
  -> chooses tracking type: Phone / Device / Both
  -> assigns driver and vehicle
  -> status = Scheduled
  -> driver sees assigned work
```

### 6.4 Work execution workflow

```text
Driver opens assigned work
  -> sees simple details
  -> taps Start Work
  -> app asks/validates location permission
  -> location proof starts
  -> admin sees Running
  -> customer Started update generated
  -> driver uploads photo/audio/video proof if needed
  -> driver marks break if needed
  -> driver taps End Work
  -> tracking stops
  -> daily summary generated
  -> customer Completed update generated
```

### 6.5 Multi-day workflow

```text
Ad work has many dates
  -> each day has its own start/end
  -> each day gets daily summary
  -> if one day missed, admin can reschedule
  -> final report includes all days
```

### 6.6 Report workflow

```text
Admin reviews daily summary
  -> admin adds note if needed
  -> admin generates final report
  -> secure report link created
  -> customer report-ready message generated
  -> admin shares link/PDF through WhatsApp/copy/share
```

### 6.7 Premium live tracking workflow

```text
Customer pays/request premium live tracking
  -> admin enables live tracking for that ad work
  -> driver consent required
  -> view-only customer link generated
  -> customer can view live status during active work
  -> link stops/ expires after completion
```

---

## 7. Tracking design

### 7.1 Tracking session rule

Tracking must be session-based.

Location collection starts only when:

1. driver has assigned work,
2. work day is scheduled,
3. driver presses Start Work or admin starts it,
4. driver consent is recorded,
5. location permission is available,
6. tracking type requires phone location.

Location collection stops when:

1. driver presses End Work,
2. admin stops tracking,
3. work is cancelled,
4. day is marked completed,
5. system detects invalid/closed session.

### 7.2 Location sampling

For low-cost MVP:

- Do not over-sample if not needed.
- Use practical interval such as 15–30 seconds during active movement.
- Reduce frequency when paused or not moving if safely possible.
- Save accuracy and timestamp.
- Mark weak GPS quality if accuracy is poor.

### 7.3 Offline saving

Driver app should store unsynced location points locally when internet is not available.

Rules:

1. Store recorded time, lat/lng, accuracy, and session ID.
2. Retry sync when internet comes back.
3. Do not duplicate points.
4. Preserve original recorded time.
5. Show admin that app is offline or delayed.

### 7.4 Device GPS

For v1, device GPS should be integration-ready.

Minimum:

1. GPS device records.
2. Device assigned to vehicle.
3. Tracking type can select device.
4. Secure ingest endpoint can accept events later.
5. Admin sees device connection status.

Do not force buying hardware before pilot unless AP decides.

### 7.5 Phone + device comparison

Later premium feature.

Rule:

1. Only compare when tracking type is Both.
2. Compare latest phone and device location.
3. Alert only if mismatch continues for configured duration.
4. Do not create customer-facing blame automatically.

---

## 8. Customer experience design

### 8.1 Default customer experience

Customer gets simple updates:

1. Scheduled
2. Started
3. Running / In progress
4. Important area covered
5. Completed
6. Report ready

Customer does not see live map by default.

### 8.2 Customer report experience

Customer report should answer:

1. When did the work happen?
2. Which areas were planned?
3. Which areas were covered?
4. How long did it run?
5. Was there any delay?
6. What proof is available?
7. Is there a day-wise summary?

### 8.3 Customer live tracking

Only premium.

Live tracking link should:

1. be view-only,
2. show simple status,
3. not show admin controls,
4. not show driver personal info unless approved,
5. stop after work completion.

---

## 9. Driver app design

Driver screen should be extremely simple.

### Main buttons

1. Start Work
2. Take Break
3. Upload Photo
4. Upload Mic Proof
5. Call Admin
6. End Work

### Driver home screen

Shows:

1. Today’s assigned work.
2. Status.
3. Start button if not started.
4. Running controls if started.
5. Approval status if driver not approved.

### Driver language style

Use:

- “Start Work”
- “End Work”
- “Take Break”
- “Upload Photo”
- “Call Admin”
- “Location Proof is ON”
- “Location Proof stopped”

Avoid:

- “Geofence”
- “Telemetry”
- “Session”
- “Coordinates”
- “Ingestion”
- “Deviation”

---

## 10. Admin dashboard design

Admin should have these left menu items:

1. Dashboard
2. Enquiries
3. Customers
4. Ad Works
5. Today’s Work
6. Drivers
7. Vehicles
8. Cities & Areas
9. Alerts
10. Reports
11. Payments
12. Settings

### Admin dashboard cards

1. New enquiries
2. Today’s ad works
3. Running ad works
4. Completed today
5. Open alerts
6. Pending payments

---

## 11. Report design

### Report sections

1. Header: Product name, report title, date.
2. Customer details.
3. Ad work details.
4. Planned areas.
5. Covered areas.
6. Missed areas.
7. Day-wise summary.
8. Time and distance summary.
9. Breaks/stops summary.
10. Proof photos.
11. Admin note.
12. Disclaimer: route/distance is based on available location proof.

### Report wording

Use simple wording:

- “Advertisement work started at…”
- “Advertisement work completed at…”
- “These areas were covered…”
- “These areas were not covered or need review…”
- “Photos added as proof…”

---

## 12. Security and privacy design

### Basic principles

1. Admin dashboard requires login.
2. Driver can see only assigned work.
3. Customer report link is tokenized.
4. Customer live tracking is off by default.
5. Driver location is collected only during active work.
6. Tracking stops after completion.
7. Secrets are never placed in frontend code.
8. Device ingest API requires server-side secret/token.
9. Audit important actions.

### Driver consent text draft

“Location Proof will start only for this assigned advertisement work. It helps prove that the vehicle covered the promised areas. Location Proof will stop after you end the work or admin closes the work.”

For premium live customer tracking:

“The customer may see live vehicle location during this work because premium live tracking is enabled. Tracking will stop after work is completed.”

---

## 13. Validation and testing strategy

### Required tests

1. Website enquiry submission works.
2. Admin login blocks unauthorized access.
3. Driver cannot start work before approval.
4. Admin can create one-day ad work.
5. Admin can create multi-day ad work.
6. Driver can start work.
7. Location points save only during running session.
8. Location stops after completion.
9. Offline points sync later.
10. Long stop alert is created.
11. Covered/missed areas are calculated.
12. Customer update messages are generated.
13. Final report shows correct summary.
14. Customer live tracking remains disabled by default.
15. Device GPS ingest does not expose secrets.
16. Report link works and can be disabled.
17. Driver cannot see another driver’s work.
18. Customer cannot access admin dashboard.

---

## 14. Known trade-offs

| Trade-off | Decision |
|---|---|
| Fully automated customer notifications | Delay to reduce cost |
| Customer app | Delay to reduce friction |
| Device GPS hardware | Support later/optional to reduce pilot cost |
| Automatic audio verification | Delay due to privacy and complexity |
| Complex route polygons | Start simple with city/area boundaries |
| Perfect distance calculation | Use approximate distance and clear wording |
| Live customer map | Premium only |

---

## 15. Implementation notes for Codex

1. Keep code modular.
2. Do not hardcode product name everywhere.
3. Keep tracking logic separate from UI.
4. Keep mobile tracking source and device tracking source behind a common interface.
5. Use enums for statuses.
6. Make report generation repeatable.
7. Keep all customer-facing text simple.
8. Create seed/demo data for Ongole and Addanki.
9. Add tests for business rules before marking tasks complete.
10. Do not implement PWA.

---

## 16. External policy notes for developers

Background location on Android must be handled carefully. The app should clearly explain why location is needed, request only needed permissions, and collect location only when the ad work is active. The first version should avoid hidden audio recording and unnecessary sensitive permissions.


---

# Tasks

# Kootha / Prachar MVP — Implementation Tasks

**Spec ID:** `kootha-prachar-mvp`  
**Version:** 0.1  
**Rule:** Codex should mark a task completed only after implementation and verification.

Status values:

- `[ ]` Not started
- `[~]` In progress
- `[x]` Completed
- `[!]` Blocked
- `[?]` Needs AP decision

---

## Milestone M0 — Project foundation

- [ ] M0-T001 Create project/repo structure for website/admin and driver Android app.
  - Requirements: FR-001
  - Done when: project runs locally and has clear folders.

- [ ] M0-T002 Add configurable product name setting.
  - Requirements: FR-002
  - Done when: name can switch between Kootha/Prachar in one place.

- [ ] M0-T003 Define shared status enums and business terms.
  - Requirements: FR-058
  - Done when: statuses are consistent across code and UI.

- [ ] M0-T004 Create database/schema baseline.
  - Requirements: FR-010 to FR-065
  - Done when: base tables exist or migrations are defined.

- [ ] M0-T005 Add seed/demo data for Ongole and Addanki.
  - Requirements: FR-016
  - Done when: demo cities and sample areas are available.

- [ ] M0-T006 Add basic tests and lint/typecheck/build commands.
  - Requirements: FR-065
  - Done when: Codex can run verification before completion.

---

## Milestone M1 — Public website and enquiries

- [ ] M1-T001 Build public home page.
  - Requirements: FR-003
  - Done when: visitor understands service in plain English.

- [ ] M1-T002 Build How It Works section.
  - Requirements: FR-004
  - Done when: Book -> Run -> Updates -> Report is shown.

- [ ] M1-T003 Build Packages/Pricing section.
  - Requirements: FR-004, FR-045
  - Done when: Basic/Standard/Premium can be displayed.

- [ ] M1-T004 Build Cities Covered section.
  - Requirements: FR-004, FR-016
  - Done when: Ongole/Addanki can be shown.

- [ ] M1-T005 Build enquiry form.
  - Requirements: FR-005
  - Done when: customer enquiry saves successfully.

- [ ] M1-T006 Add enquiry source tracking.
  - Requirements: FR-006
  - Done when: Website/Phone/WhatsApp/Admin source is stored.

- [ ] M1-T007 Build contact/WhatsApp call-to-action.
  - Requirements: FR-003, FR-060
  - Done when: customer can contact team easily.

---

## Milestone M2 — Admin foundation

- [ ] M2-T001 Build admin login.
  - Requirements: FR-007, FR-063
  - Done when: admin dashboard is protected.

- [ ] M2-T002 Add admin roles.
  - Requirements: FR-008
  - Done when: Owner/Admin and Staff roles exist.

- [ ] M2-T003 Build dashboard summary cards.
  - Requirements: FR-009
  - Done when: dashboard shows enquiries, today’s work, running work, alerts, payments.

- [ ] M2-T004 Build customer management.
  - Requirements: FR-010
  - Done when: admin can create/edit/view customers and history.

- [ ] M2-T005 Build driver registration review screen.
  - Requirements: FR-011, FR-012
  - Done when: admin can approve/reject drivers.

- [ ] M2-T006 Build driver profile management.
  - Requirements: FR-013, FR-014
  - Done when: driver details and availability are visible.

- [ ] M2-T007 Build vehicle management.
  - Requirements: FR-015
  - Done when: vehicles can be created and assigned to drivers.

- [ ] M2-T008 Build city and area setup.
  - Requirements: FR-016
  - Done when: admin can manage cities and named areas.

---

## Milestone M3 — Ad work creation and scheduling

- [ ] M3-T001 Build package records.
  - Requirements: FR-045
  - Done when: Basic/Standard/Premium packages exist.

- [ ] M3-T002 Build ad work creation form.
  - Requirements: FR-018
  - Done when: admin can create ad work with customer, city, dates, areas, driver, vehicle, package, tracking type.

- [ ] M3-T003 Support single-day ad work.
  - Requirements: FR-019
  - Done when: one-day ad work creates one work day.

- [ ] M3-T004 Support multi-day ad work.
  - Requirements: FR-020
  - Done when: date range creates day-wise schedule.

- [ ] M3-T005 Build driver and vehicle assignment.
  - Requirements: FR-021
  - Done when: only approved drivers and active vehicles can be assigned.

- [ ] M3-T006 Build tracking type selection.
  - Requirements: FR-022
  - Done when: Phone, Device, and Both options are available.

- [ ] M3-T007 Build GPS device records.
  - Requirements: FR-023
  - Done when: devices can be added and assigned to vehicles.

- [ ] M3-T008 Build payment status.
  - Requirements: FR-044
  - Done when: payment status and amount fields work.

---

## Milestone M4 — Driver app and active tracking

- [ ] M4-T001 Build driver registration screen.
  - Requirements: FR-011, FR-013
  - Done when: driver can submit registration.

- [ ] M4-T002 Build driver approval status screen.
  - Requirements: FR-011, FR-012
  - Done when: unapproved driver cannot start work.

- [ ] M4-T003 Build driver assigned work list.
  - Requirements: FR-024
  - Done when: driver sees assigned work.

- [ ] M4-T004 Build Start Work flow.
  - Requirements: FR-025, FR-047
  - Done when: driver can start approved assigned work with consent.

- [ ] M4-T005 Implement phone location proof.
  - Requirements: FR-028, FR-048
  - Done when: phone location points save only during active session.

- [ ] M4-T006 Implement stop tracking after completion.
  - Requirements: FR-026
  - Done when: location collection stops after End Work.

- [ ] M4-T007 Implement admin stop tracking.
  - Requirements: FR-027
  - Done when: admin can stop active tracking with reason.

- [ ] M4-T008 Implement offline location saving.
  - Requirements: FR-029
  - Done when: offline points are stored and synced later.

- [ ] M4-T009 Implement tracking status.
  - Requirements: FR-030
  - Done when: admin sees Running/Paused/Offline/GPS Weak/Stopped statuses.

- [ ] M4-T010 Implement long stop alerts.
  - Requirements: FR-031
  - Done when: long stop creates admin alert.

- [ ] M4-T011 Implement driver break option.
  - Requirements: FR-032
  - Done when: driver can start/end break with reason.

- [ ] M4-T012 Implement area coverage.
  - Requirements: FR-017, FR-033
  - Done when: covered and missed areas are tracked.

- [ ] M4-T013 Build admin live map/status view.
  - Requirements: FR-037
  - Done when: admin sees latest location and active status.

- [ ] M4-T014 Implement GPS disconnected alert.
  - Requirements: FR-049
  - Done when: missing location creates warning.

- [ ] M4-T015 Add low battery warning if supported.
  - Requirements: FR-050
  - Done when: driver/admin warning appears where supported.

- [ ] M4-T016 Build manual photo proof upload.
  - Requirements: FR-035
  - Done when: driver can upload photo with time/location.

---

## Milestone M5 — Customer updates, reports, and operations

- [ ] M5-T001 Build customer update event system.
  - Requirements: FR-038
  - Done when: Scheduled/Started/Running/Completed/Report Ready updates are generated.

- [ ] M5-T002 Build low-cost message sharing.
  - Requirements: FR-039
  - Done when: admin can copy/share customer update messages.

- [ ] M5-T003 Build report-ready notification.
  - Requirements: FR-040
  - Done when: final report link message is generated.

- [ ] M5-T004 Build daily summary report.
  - Requirements: FR-041
  - Done when: each completed day has summary.

- [ ] M5-T005 Build final proof report page.
  - Requirements: FR-042, FR-043
  - Done when: customer can open secure report link.

- [ ] M5-T006 Add print/download PDF-style report.
  - Requirements: FR-042
  - Done when: admin/customer can print or download report.

- [ ] M5-T007 Add manual audio/video proof.
  - Requirements: FR-036
  - Done when: driver can upload short manual proof if enabled.

- [ ] M5-T008 Build route history for admin.
  - Requirements: FR-053
  - Done when: admin can view completed route history.

- [ ] M5-T009 Build alert management.
  - Requirements: FR-054
  - Done when: alerts can be opened/resolved with notes.

- [ ] M5-T010 Build manual admin updates.
  - Requirements: FR-055
  - Done when: admin can create customer-safe updates.

- [ ] M5-T011 Build cancellation and reschedule.
  - Requirements: FR-056
  - Done when: ad work/day can be cancelled or rescheduled.

- [ ] M5-T012 Build audit log.
  - Requirements: FR-057
  - Done when: important actions are recorded.

- [ ] M5-T013 Add search and filters.
  - Requirements: FR-062
  - Done when: admin can search/filter records.

- [ ] M5-T014 Prepare Telugu-ready label structure.
  - Requirements: FR-059
  - Done when: labels are not deeply hardcoded.

---

## Milestone M6 — Device GPS and data export

- [ ] M6-T001 Implement secure device ingest endpoint.
  - Requirements: FR-051, FR-063
  - Done when: device can send location events securely.

- [ ] M6-T002 Match device location to active work.
  - Requirements: FR-051
  - Done when: device events map to active device/vehicle/ad work.

- [ ] M6-T003 Show device status.
  - Requirements: FR-023, FR-030
  - Done when: admin sees Connected/Not Responding/Integration Pending.

- [ ] M6-T004 Add data export.
  - Requirements: FR-061
  - Done when: admin can export non-sensitive summaries.

- [ ] M6-T005 Add data retention controls.
  - Requirements: FR-064
  - Done when: retention policy is documented/configurable.

---

## Milestone M7 — Premium features

- [ ] M7-T001 Build optional customer live tracking setting.
  - Requirements: FR-046
  - Done when: live tracking is disabled by default and admin-controlled.

- [ ] M7-T002 Add driver consent for customer live tracking.
  - Requirements: FR-046, FR-047
  - Done when: driver must accept premium live sharing.

- [ ] M7-T003 Build customer live tracking link.
  - Requirements: FR-046
  - Done when: customer sees view-only live status during active work only.

- [ ] M7-T004 Disable customer live link after completion.
  - Requirements: FR-046, FR-048
  - Done when: live tracking stops after work ends.

- [ ] M7-T005 Implement phone + device comparison.
  - Requirements: FR-052
  - Done when: mismatch alert works for Both tracking type.

- [ ] M7-T006 Add valid distance summary.
  - Requirements: FR-034
  - Done when: approximate total/valid distance appears in report.

---

## Milestone M8 — Security, privacy, and release readiness

- [ ] M8-T001 Verify admin access control.
  - Requirements: FR-063
  - Done when: non-admin cannot access admin data.

- [ ] M8-T002 Verify driver access control.
  - Requirements: FR-063
  - Done when: driver cannot access other drivers’ work.

- [ ] M8-T003 Verify report token access.
  - Requirements: FR-043, FR-063
  - Done when: report link is tokenized and can be disabled.

- [ ] M8-T004 Verify no tracking outside active work.
  - Requirements: FR-026, FR-048
  - Done when: tests prove location stops after work completion.

- [ ] M8-T005 Verify no hidden audio recording.
  - Requirements: FR-036
  - Done when: code has no background/secret audio recording behavior.

- [ ] M8-T006 Verify no secrets in frontend.
  - Requirements: FR-063
  - Done when: no server/device secrets are exposed to client code.

- [ ] M8-T007 Verify customer live tracking is disabled by default.
  - Requirements: FR-046
  - Done when: new ad work does not expose live link by default.

- [ ] M8-T008 Create demo script for pilot.
  - Requirements: MVP completion
  - Done when: AP can demo enquiry -> ad work -> driver start -> tracking -> report.

- [ ] M8-T009 Create pilot readiness checklist.
  - Requirements: MVP completion
  - Done when: operational checklist exists for Ongole/Addanki pilot.

---

## Suggested first Codex implementation order

1. M0-T001 to M0-T006
2. M1 website/enquiry
3. M2 admin foundation
4. M3 ad work creation
5. M4 driver start/end and phone tracking
6. M5 customer updates and reports
7. M6 device integration
8. M7 premium live tracking
9. M8 final hardening

Do not start with premium live tracking or device hardware before core phone-location proof works.


---

# Codex Implementation Prompt

# Codex Implementation Prompt — Kootha / Prachar MVP

You are working on a new product called Kootha / Prachar.

Goal:
Build a low-cost MVP for local mic advertisement vehicle proof. Customers should get simple updates and final proof reports. Admin should manage work and see live tracking. Drivers should use an Android app to start/end work and provide location/photo proof. Customer live tracking is premium only and disabled by default.

Use the spec files:
- `.kiro/specs/kootha-prachar-mvp/requirements.md`
- `.kiro/specs/kootha-prachar-mvp/design.md`
- `.kiro/specs/kootha-prachar-mvp/tasks.md`
- `.kiro/steering/product.md`
- `.kiro/steering/tech.md`
- `.kiro/steering/implementation-rules.md`

Critical rules:
1. Do not build a PWA.
2. Do not build a customer mobile app in v1.
3. Build website + admin web dashboard + driver Android app.
4. Keep customer live tracking disabled by default.
5. Tracking starts only when driver/admin starts assigned work.
6. Tracking stops after work is completed or admin stops it.
7. Do not collect driver location outside active work.
8. Do not secretly record audio.
9. Use manual photo/audio/video proof only.
10. Keep UI language simple and understandable for non-technical users.
11. Keep device GPS integration modular and optional.
12. Prefer low-cost implementation: no paid SMS/WhatsApp API dependency in v1.
13. Codex must update `tasks.md` status only after implementation and verification.
14. Codex must not mark partial work as completed.
15. Each PR/commit must say which requirements and tasks were completed.

Start with Milestone M0 only unless AP explicitly approves moving ahead.

For every task:
- implement the smallest safe change,
- add/adjust tests,
- run relevant checks,
- update `tasks.md`,
- return summary with changed files, verification, and next task recommendation.
