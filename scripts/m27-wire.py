from pathlib import Path

index_path = Path("packages/shared/src/index.ts")
index = index_path.read_text()
export_line = 'export * from "./operationsExport";'
if export_line not in index:
    index = index.rstrip() + "\n" + export_line + "\n"
index_path.write_text(index)

admin_path = Path("apps/web/src/admin.tsx")
admin = admin_path.read_text()

marker = 'import { IntelligenceAdapterReadinessView } from "./admin-intelligence";'
addition = marker + '\nimport { OperationsAuditWorkbench, OperationsExportView } from "./admin-operations";'
if 'from "./admin-operations"' not in admin:
    if marker not in admin:
        raise SystemExit("admin operations import marker not found")
    admin = admin.replace(marker, addition, 1)

old_view = 'type AdminView = "enquiries" | "adWorks" | "driverApplications" | "drivers" | "vehicles" | "devices" | "trackingHealth" | "alerts" | "intelligence" | "audit" | "dashboard";'
new_view = 'type AdminView = "enquiries" | "adWorks" | "driverApplications" | "drivers" | "vehicles" | "devices" | "trackingHealth" | "alerts" | "intelligence" | "operations" | "audit" | "dashboard";'
if old_view not in admin and new_view not in admin:
    raise SystemExit("AdminView marker not found")
admin = admin.replace(old_view, new_view, 1)

audit_start = admin.find("function AuditView(")
shell_start = admin.find("\nfunction AdminShell(", audit_start)
if audit_start == -1 or shell_start == -1:
    raise SystemExit("AuditView replacement markers not found")
audit_wrapper = (
    'function AuditView({ config, session }: { config: SupabaseConfig; session: AuthSession }) {\n'
    '  return <OperationsAuditWorkbench connection={{ url: config.url, anonKey: config.anonKey, accessToken: session.accessToken }} />;\n'
    '}\n'
)
admin = admin[:audit_start] + audit_wrapper + admin[shell_start + 1:]

nav_marker = (
    '    { id: "intelligence", label: "Intelligence & Adapters", icon: BrainCircuit },\n'
    '    { id: "audit", label: "Activity", icon: FileClock }'
)
nav_replacement = (
    '    { id: "intelligence", label: "Intelligence & Adapters", icon: BrainCircuit },\n'
    '    { id: "operations", label: "Operations & Exports", icon: ClipboardCheck },\n'
    '    { id: "audit", label: "Activity", icon: FileClock }'
)
if nav_marker not in admin and '"Operations & Exports"' not in admin:
    raise SystemExit("Navigation marker not found")
admin = admin.replace(nav_marker, nav_replacement, 1)

title_marker = (
    '              {activeView === "intelligence" && "Intelligence and Adapter Readiness"}\n'
    '              {activeView === "audit" && "Activity history"}'
)
title_replacement = (
    '              {activeView === "intelligence" && "Intelligence and Adapter Readiness"}\n'
    '              {activeView === "operations" && "Operations and governed exports"}\n'
    '              {activeView === "audit" && "Activity history"}'
)
if title_marker not in admin and 'activeView === "operations" && "Operations and governed exports"' not in admin:
    raise SystemExit("Title marker not found")
admin = admin.replace(title_marker, title_replacement, 1)

description_marker = (
    '              {activeView === "intelligence" && "Review vendor-neutral adapter readiness, data quality, explainable statistical signals, and model-governance gates."}\n'
    '              {activeView === "audit" && "Review safe operational changes without exposing private values."}'
)
description_replacement = (
    '              {activeView === "intelligence" && "Review vendor-neutral adapter readiness, data quality, explainable statistical signals, and model-governance gates."}\n'
    '              {activeView === "operations" && "Preview and download allowlisted operational data with immutable export receipts and privacy-safe boundaries."}\n'
    '              {activeView === "audit" && "Review safe operational changes without exposing private values."}'
)
if description_marker not in admin and 'activeView === "operations" && "Preview and download' not in admin:
    raise SystemExit("Description marker not found")
admin = admin.replace(description_marker, description_replacement, 1)

render_marker = (
    '        {activeView === "intelligence" && <IntelligenceAdapterReadinessView connection={{ url: config.url, anonKey: config.anonKey, accessToken: session.accessToken }} />}\n'
    '        {activeView === "audit" && <AuditView config={config} session={session} />}'
)
render_replacement = (
    '        {activeView === "intelligence" && <IntelligenceAdapterReadinessView connection={{ url: config.url, anonKey: config.anonKey, accessToken: session.accessToken }} />}\n'
    '        {activeView === "operations" && <OperationsExportView connection={{ url: config.url, anonKey: config.anonKey, accessToken: session.accessToken }} />}\n'
    '        {activeView === "audit" && <AuditView config={config} session={session} />}'
)
if render_marker not in admin and '<OperationsExportView connection=' not in admin:
    raise SystemExit("Render marker not found")
admin = admin.replace(render_marker, render_replacement, 1)
admin_path.write_text(admin)

readme_path = Path("README.md")
readme = readme_path.read_text()
old_status = (
    "M18 remains incomplete/in progress; M20A–M23, M24F and M25 are completed; "
    "the original selected-device M24 and physical M26 remain AP/hardware/evidence-gated."
)
new_status = (
    "M18 remains incomplete/in progress; M20A–M23, M24F, M25, and the software-only M26 "
    "commissioning/evidence layer are completed; M27 Governed Operations Export & Audit Workbench "
    "is in progress; the original selected-device M24 and real physical M26 remain AP/hardware/evidence-gated."
)
if old_status in readme:
    readme = readme.replace(old_status, new_status, 1)

old_current = (
    "Current milestone status on this branch: M18 remains incomplete; M20A–M23, M24F and M25 are completed; "
    "the original M24 physical selection and M26 physical execution remain incomplete pending AP selection and real evidence. "
    "No hosted migration, deployment, hardware, real vendor credential, or production ML action is included."
)
new_current = (
    "Current milestone status on this branch: M18 remains incomplete; M20A–M23, M24F, M25, and the software-only M26 layer "
    "are completed; M27 governed export/audit work is in progress; original M24 physical selection and real M26 physical execution "
    "remain incomplete pending AP selection and real evidence. The existing Kootha Supabase project is inactive and currently "
    "blocked by the organization free-project quota; no unrelated project was paused. No hosted migration, public production deployment, "
    "hardware, real vendor credential, or production ML action is included."
)
if old_current in readme:
    readme = readme.replace(old_current, new_current, 1)

bullet_marker = "- Admin login at /admin with role checks."
bullet = (
    "- Admin login at /admin with role checks.\n"
    "- Admin Operations & Exports workbench with server-authoritative allowlisted CSV/JSON exports, immutable metadata receipts, "
    "masked device identities, spreadsheet-formula hardening, and cursor-paginated safe Activity history."
)
if bullet_marker in readme and "Admin Operations & Exports workbench" not in readme:
    readme = readme.replace(bullet_marker, bullet, 1)
readme_path.write_text(readme)

tasks_path = Path(".kiro/specs/kootha-prachar-mvp/tasks.md")
tasks = tasks_path.read_text()
tasks_marker = "## Milestone M20B - Canonical Contracts and Deterministic Simulator"
if tasks_marker not in tasks:
    raise SystemExit("M20B task marker not found")
prefix = tasks.split(tasks_marker, 1)[0].rstrip()
tail = """
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

- [~] In progress.
  - Admin-only static allowlisted exports for enquiries, ad works, drivers, vehicles, masked devices, and safe activity history.
  - Immutable export receipt metadata; exported row payloads are never persisted.
  - UTF-8 CSV/JSON download with spreadsheet-formula neutralization.
  - Cursor-paginated, filterable safe Activity workbench through sanctioned RPCs.
  - Hosted Kootha activation remains separately blocked by the active-free-project quota; do not pause unrelated projects.
""".strip()
tasks_path.write_text(prefix + "\n\n" + tail + "\n")

print("M27 wiring complete")
