# M27 — Governed Operations Export & Audit Workbench

Status: In Progress until the Draft PR is merged and post-merge verification is complete.

## Purpose

M27 closes the operational data-portability and history-review gap without widening Kootha into live maps, customer tracking, hardware selection, external provider automation, payments, or production AI.

The milestone adds one database-owned export authority, immutable metadata receipts, a bounded Operations & Exports admin surface, and a cursor-paginated Activity workbench.

## Authority model

`admin_export_operations_v1` is the only supported export authority. It:

- requires the existing `m20a_require_admin()` authority;
- supports only the static scopes `enquiries`, `ad_works`, `drivers`, `vehicles`, `devices`, and `audit`;
- uses static SQL and exact server-side column allowlists;
- caps each result at 500 rows and orders deterministically;
- accepts only bounded, scope-valid filters;
- never accepts caller-chosen tables, columns, sort expressions, receipt IDs, or SQL fragments;
- returns device identifiers masked with the existing last-four law;
- excludes GPS coordinates, route data, proof file paths, raw vendor payloads, credential verification material, tokens, and server secrets.

Contact PII appears only in the explicitly named enquiries, ad-work, and driver scopes. The returned envelope marks those scopes with `containsPii: true`.

## Immutable export receipts

Each successful export generates a server-owned `operations_export_receipts` row containing metadata only:

- actor;
- export scope and format;
- a normalized filter summary that records only whether search/city filters were applied, not their raw values;
- row cap and returned row count;
- PII and truncation flags;
- contract version and completion timestamp.

The database never stores the exported rows in the receipt. Direct API-role access to the receipt table is revoked and update/delete is rejected by immutable-history triggers.

## CSV and JSON download safety

The browser downloads only a validated server envelope. CSV output is UTF-8 with a BOM and CRLF rows, quotes RFC-style delimiter/newline/quote cells, and prefixes spreadsheet-formula values beginning with `=`, `+`, `-`, `@`, tab, or carriage return with an apostrophe.

JSON downloads retain the contract metadata, columns, filters, receipt ID, and rows.

## Activity history

The old flat latest-200 audit read is replaced by `admin_get_operations_audit_v1`.

The workbench supports bounded filters for actor type, exact action, exact entity type, safe reference search, and date range. Pagination uses the deterministic `(created_at, id)` cursor and each page is capped at 100 rows. Only canonical `safe_details` are returned.

## Hosted environment note

The existing `kootha-preview` Netlify site remains safely gated. The connected Kootha Supabase project is inactive and cannot currently be restored because the organization is already at the two-active-free-project limit. M27 does not pause unrelated projects to bypass that quota and does not enable enquiry or retention kill switches.

## Completion gates

Before merge:

1. focused M27 TypeScript tests pass;
2. full Vitest passes;
3. lint and typecheck pass;
4. migration and security guardrails pass;
5. production build passes;
6. a fresh disposable Supabase instance replays every migration and the full pgTAP/RLS suite;
7. exact-head `Quality and security` is green;
8. all current P1/P2 review threads are resolved;
9. final exact-head Codex review is clean.

M18, selected-device M24, and real physical M26 remain separate physical/hardware/evidence gates.
