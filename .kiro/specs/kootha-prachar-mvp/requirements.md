# Kootha / Prachar MVP Requirements

Spec ID: `kootha-prachar-mvp`

This workspace keeps the full imported specification at `kootha-prachar-complete-specification.md`. These split Kiro files are the working spec files used by Codex implementation.

## M0 Requirements

### FR-001 Product Surfaces

The product should have a public website, an admin dashboard, and a driver Android app. Customers should not need a customer app in v1, and customer live tracking remains premium-only and disabled by default.

### FR-002 Configurable Product Name

The product name must come from one shared source and default to `Prachar`. The same shared resolver must support switching to `Kootha`.

### FR-058 Simple UI Language

Driver and customer-facing labels should use simple words such as Start Work, End Work, Upload Photo, Take Break, and Call Admin. Avoid unnecessary technical words in customer and driver views.

### FR-065 Development Completion Tracking

Tasks are marked complete only after implementation and verification evidence exists. Partial work is not marked complete.

## M0 Data Baseline Coverage

M0 defines schema tables and status vocabulary needed by later requirements FR-010 through FR-065, but it does not implement their UI workflows yet.

## Explicit M0 Exclusions

- Live tracking.
- GPS permissions.
- Background location.
- Maps.
- GPS device ingestion.
- Customer live tracking link.
- Enquiry form submission.
- Admin CRUD.
- Driver approval workflow.
- Reports.
- Payments.
- Notifications.
- WhatsApp/SMS integration.
