import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  "supabase/migrations/20260725010000_m20a_device_registry_history.sql",
);
const adminPath = path.resolve("apps/web/src/admin.tsx");
const sharedPath = path.resolve("packages/shared/src/deviceRegistry.ts");
const sharedIndexPath = path.resolve("packages/shared/src/index.ts");
const physicalTasksPath = path.resolve(
  ".kiro/specs/kootha-physical-gps-iot/tasks.md",
);
const mvpTasksPath = path.resolve(".kiro/specs/kootha-prachar-mvp/tasks.md");

function read(filePath: string): string {
  return readFileSync(filePath, "utf8");
}

const sql = read(migrationPath);
const lowerSql = sql.toLowerCase();
const adminSource = read(adminPath);
const sharedSource = read(sharedPath);
const sharedIndex = read(sharedIndexPath);
const physicalTasks = read(physicalTasksPath);
const mvpTasks = read(mvpTasksPath);
const packageSources = [
  "package.json",
  "apps/web/package.json",
  "apps/driver/package.json",
]
  .map((file) => read(path.resolve(file)))
  .join("\n");

const deviceStatuses = [
  "pending_setup",
  "active",
  "offline",
  "not_working",
  "suspended",
  "removed",
  "retired",
] as const;
const lifecycleEvents = [
  "registered",
  "installation_planned",
  "installed",
  "removed",
  "replaced",
  "lost",
  "stolen",
  "suspended",
  "reactivated",
  "marked_not_working",
  "retired",
] as const;
const credentialStatuses = [
  "pending",
  "active",
  "rotating",
  "revoked",
  "expired",
] as const;

function expectAll(text: string, values: readonly string[]): void {
  for (const value of values) {
    expect(text, `missing ${value}`).toContain(value);
  }
}

function functionBody(functionName: string): string {
  const start = lowerSql.indexOf(
    `create or replace function public.${functionName}`,
  );
  expect(start, `${functionName} is missing`).toBeGreaterThanOrEqual(0);
  const next = lowerSql.indexOf("create or replace function public.", start + 1);
  return lowerSql.slice(start, next === -1 ? undefined : next);
}

describe("M20A physical device registry and history", () => {
  it("extends the existing canonical gps_devices master with safe registry fields", () => {
    expect(lowerSql).toMatch(/alter table\s+public\.gps_devices/);
    expectAll(lowerSql, [
      "device_code",
      "vendor",
      "model",
      "adapter_type",
      "protocol_type",
      "serial_number",
      "imei",
      "vendor_device_identifier",
      "installation_state",
      "sim_provider_name",
      "firmware_version",
      "gps_readiness",
      "gsm_readiness",
      "external_power_status",
      "battery_status",
      "last_heartbeat_at",
      "last_telemetry_at",
      "admin_note",
      "updated_at",
    ]);
    expectAll(lowerSql, deviceStatuses);
    expect(lowerSql).not.toMatch(
      /create table\s+(?:if not exists\s+)?public\.(?:physical_)?devices\b/,
    );
    expect(lowerSql).toContain(
      "gps_device_vehicle_links is authoritative",
    );
  });

  it("blocks duplicate active identifiers while permitting blank optional values", () => {
    for (const indexName of [
      "gps_devices_active_serial_unique",
      "gps_devices_active_imei_unique",
      "gps_devices_active_vendor_identifier_unique",
    ]) {
      expect(lowerSql).toContain(`create unique index if not exists ${indexName}`);
    }
    expect(lowerSql).toMatch(
      /gps_devices_active_serial_unique[\s\S]{0,350}nullif\(trim\(serial_number\), ''\) is not null/,
    );
    expect(lowerSql).toMatch(
      /gps_devices_active_imei_unique[\s\S]{0,350}nullif\(trim\(imei\), ''\) is not null/,
    );
    expect(lowerSql).toMatch(
      /gps_devices_active_vendor_identifier_unique[\s\S]{0,450}nullif\(trim\(vendor_device_identifier\), ''\) is not null/,
    );
  });

  it("preserves retired devices and history instead of hard deleting them", () => {
    expect(lowerSql).toContain("gps_devices_m20a_no_delete");
    expect(lowerSql).toContain("gps_device_vehicle_links_no_delete");
    expect(lowerSql).toContain("gps_device_lifecycle_events_no_delete");
    expect(lowerSql).toContain("gps_device_credential_metadata_no_delete");
    expect(lowerSql).toContain("history cannot be deleted");
    expect(lowerSql).not.toMatch(/delete\s+from\s+public\.gps_devices/);
  });

  it("enforces one current primary link for each device and vehicle", () => {
    expect(lowerSql).toContain("public.gps_device_vehicle_links");
    expectAll(lowerSql, [
      "gps_device_id",
      "vehicle_id",
      "is_primary",
      "effective_from",
      "effective_until",
      "installation_reference_note",
      "change_reason",
      "created_by_admin",
      "closed_by_admin",
      "closed_at",
    ]);
    expect(lowerSql).toMatch(
      /gps_device_vehicle_links_current_device_unique[\s\S]{0,180}effective_until is null/,
    );
    expect(lowerSql).toMatch(
      /gps_device_vehicle_links_current_vehicle_unique[\s\S]{0,180}effective_until is null/,
    );

    const linkBody = functionBody("admin_link_gps_device_vehicle");
    expect(linkBody).toContain("for update");
    expect(linkBody).toContain("effective_until is null");
    expect(linkBody).toContain("update public.gps_device_vehicle_links");
    expect(linkBody).toContain("insert into public.gps_device_vehicle_links");
  });

  it("allows one-way link closure and prevents historical rewrites", () => {
    const protection = functionBody("m20a_protect_vehicle_link_history");
    for (const immutableField of [
      "new.gps_device_id is distinct from old.gps_device_id",
      "new.vehicle_id is distinct from old.vehicle_id",
      "new.effective_from is distinct from old.effective_from",
      "new.change_reason is distinct from old.change_reason",
      "new.created_by_admin is distinct from old.created_by_admin",
    ]) {
      expect(protection).toContain(immutableField);
    }
    expect(protection).toContain("only an open link may be closed once");
    expect(lowerSql).toContain(
      "payload vehicle ids have no authority",
    );
    expect(lowerSql).toContain(
      "never overrides the active ad work assignment",
    );
  });

  it("records the required lifecycle and replacement history safely", () => {
    expect(lowerSql).toContain("public.gps_device_lifecycle_events");
    expectAll(lowerSql, lifecycleEvents);
    expectAll(lowerSql, [
      "effective_at",
      "reason",
      "related_replacement_device_id",
      "created_by_admin",
      "created_at",
      "safe_note",
    ]);
    expect(lowerSql).toContain("device lifecycle events are immutable");

    const eventBody = functionBody("admin_record_gps_device_event");
    expect(eventBody).toMatch(/p_event_type in \(\s*'lost', 'stolen', 'suspended'/);
    expect(eventBody).toContain("set status = 'suspended'");
    expect(eventBody).toContain("set status = 'revoked'");
  });

  it("locks established hardware identity to the replacement workflow", () => {
    const updateBody = functionBody("admin_update_gps_device");
    expect(updateBody).toContain("hardware identity cannot be edited after installation or vehicle linking");
    expect(updateBody).toContain("gps_device_vehicle_links");
    expect(updateBody).toContain("v_device.status <> 'pending_setup'");
    expect(updateBody).toContain("v_device.installation_state <> 'pending'");
    expect(adminSource).toContain("p_related_device_id: null");
    expect(adminSource).not.toContain("p_related_replacement_device_id");
  });

  it("performs replacement as one locked transaction and preserves old history", () => {
    const replacement = functionBody("admin_replace_gps_device");
    expect(replacement).toContain("for update");
    expect(replacement).toContain("update public.gps_device_vehicle_links");
    expect(replacement).toContain("set effective_until = p_effective_at");
    expect(replacement).toContain("insert into public.gps_device_vehicle_links");
    expect(replacement).toContain("insert into public.gps_device_lifecycle_events");
    expect(replacement).toContain("'replaced'");
    expect(replacement).toContain("'installed'");
    expect(replacement).toContain("gps_device_replacement_recorded");
    expect(replacement).not.toContain("location_points");
  });

  it("uses an explicit transition matrix, required reasons, and proof-ready gate", () => {
    const statusBody = functionBody("admin_change_gps_device_status");
    expect(statusBody).toContain("blocked device lifecycle transition");
    expect(statusBody).toContain("m20a_require_reason");
    expect(statusBody).toContain("retired");

    const proofReady = functionBody("m20a_gps_device_is_proof_ready");
    expect(proofReady).toContain("d.status = 'active'");
    expect(proofReady).toContain("d.installation_state = 'installed'");
    expect(proofReady).toContain("gps_device_vehicle_links");


  });

  it("stores credential metadata without exposing verification material", () => {
    expect(lowerSql).toContain("public.gps_device_credential_metadata");
    expectAll(lowerSql, credentialStatuses);
    expectAll(lowerSql, [
      "credential_key_id",
      "verification_material_hash",
      "issued_at",
      "expires_at",
      "rotated_at",
      "revoked_at",
      "rotated_from_credential_id",
      "last_verified_at",
    ]);
    expect(lowerSql).not.toMatch(
      /\b(?:plaintext_token|plain_token|hmac_secret|vendor_api_secret|service_role_key)\b/,
    );
    const safeGrant = lowerSql.match(
      /grant select \([\s\S]*?\) on public\.gps_device_credential_metadata to authenticated;/,
    )?.[0];
    expect(safeGrant).toBeTruthy();
    expect(safeGrant).not.toContain("verification_material_hash");
    expect(adminSource).not.toMatch(
      /\b(?:ingest_token_hash|verification_material_hash|credential_hash|hmac_secret|vendor_api_secret|service_role_key)\b/i,
    );
  });

  it("applies default-deny RLS and admin-only reads to every operational table", () => {
    for (const table of [
      "gps_devices",
      "gps_device_vehicle_links",
      "gps_device_lifecycle_events",
      "gps_device_credential_metadata",
    ]) {
      expect(lowerSql).toContain(
        `alter table public.${table} enable row level security`,
      );
      expect(lowerSql).toMatch(
        new RegExp(
          `revoke all on public\\.${table} from (?:anon, authenticated|anon)[\\s\\S]{0,120}`,
        ),
      );
    }
    expect(lowerSql).not.toMatch(
      /to\s+(?:anon|public)[\s\S]{0,100}using\s*\(\s*true\s*\)/,
    );
    expect(lowerSql).toMatch(/using\s*\(\s*public\.is_admin\(\)\s*\)/);
  });

  it("protects every high-risk RPC with admin checks, locks, and safe grants", () => {
    const rpcNames = [
      "admin_register_gps_device",
      "admin_update_gps_device",
      "admin_change_gps_device_status",
      "admin_link_gps_device_vehicle",
      "admin_remove_gps_device_vehicle",
      "admin_record_gps_device_event",
      "admin_replace_gps_device",
      "admin_upsert_gps_device_credential_metadata",
    ];
    for (const name of rpcNames) {
      const body = functionBody(name);
      expect(body).toContain("security definer");
      expect(body).toContain("set search_path = pg_catalog, public");
      expect(body).toContain("m20a_require_admin");
      expect(lowerSql).toMatch(
        new RegExp(`revoke all on function public\\.${name}\\([\\s\\S]*?from public, anon`),
      );
    }
    expect(functionBody("m20a_require_admin")).toContain(
      "not public.is_admin()",
    );
    const executeGrants = [...lowerSql.matchAll(/grant execute[\s\S]*?;/g)].map(
      (match) => match[0],
    );
    expect(executeGrants.length).toBeGreaterThan(0);
    for (const grant of executeGrants) {
      expect(grant).not.toMatch(/\bto\s+(?:anon|public)\b/);
    }
  });

  it("writes safe audits for registry, status, links, lifecycle, replacement, and credentials", () => {
    expect(lowerSql).toContain("public.audit_logs");
    expectAll(lowerSql, [
      "gps_device_registered",
      "gps_device_identity_changed",
      "gps_device_status_changed",
      "gps_device_vehicle_linked",
      "gps_device_vehicle_reassigned",
      "gps_device_vehicle_link_removed",
      "gps_device_lifecycle_event_recorded",
      "gps_device_replacement_recorded",
      "gps_device_credential_metadata_changed",
      "gps_device_credential_metadata_revoked",
      "gps_device_credential_metadata_rotated",
    ]);
    expect(lowerSql).not.toMatch(
      /jsonb_build_object\([\s\S]{0,450}'(?:verification_material_hash|plaintext_token|coordinates|work_code|raw_payload)'/,
    );
  });

  it("shares canonical, duplicate-free values, simple labels, and validation helpers", () => {
    expect(sharedIndex).toContain('export * from "./deviceRegistry"');
    expectAll(sharedSource, deviceStatuses);
    expectAll(sharedSource, lifecycleEvents);
    expectAll(sharedSource, credentialStatuses);
    for (const label of [
      "Pending Setup",
      "Active",
      "Offline",
      "Not Working",
      "Suspended",
      "Removed",
      "Retired",
    ]) {
      expect(sharedSource).toContain(label);
    }
    expect(sharedSource).toContain("canTransitionGpsDeviceStatus");
    expect(sharedSource).toContain("isGpsDeviceProofReady");
    expect(sharedSource).toContain("serverProofReady");
    expect(sharedSource).toContain("validateGpsDeviceCode");
    expect(sharedSource).toContain("validateGpsDeviceReason");
    expect(new Set(deviceStatuses).size).toBe(deviceStatuses.length);
    expect(new Set(lifecycleEvents).size).toBe(lifecycleEvents.length);
    expect(new Set(credentialStatuses).size).toBe(credentialStatuses.length);
  });

  it("adds a safe Device Registry, detail views, filters, history, and actions", () => {
    for (const label of [
      "Devices",
      "Device Registry",
      "Device Detail",
      "Register Device",
      "Edit Device",
      "Link Vehicle",
      "Reassign Vehicle",
      "Remove from Vehicle",
      "Record Installation",
      "Mark Offline",
      "Mark Not Working",
      "Suspend",
      "Reactivate",
      "Record Replacement",
      "Retire",
      "Linked Vehicle",
      "Installation and lifecycle history",
      "Credential Status",
      "Last Heartbeat",
      "Last Update",
    ]) {
      expect(adminSource).toContain(label);
    }
    expect(adminSource).not.toMatch(
      /\b(?:ingest_token_hash|verification_material_hash|credential_hash|hmac_secret)\b/i,
    );
    expect(lowerSql).toContain("view public.gps_device_admin_list");
    expect(lowerSql).toContain("with (security_invoker = true)");
    expect(adminSource).toContain("gps_device_admin_list?select=");
    expect(adminSource).toMatch(/gps_devices\?select=[^"]+&id=eq\./);
  });

  it("adds no map, endpoint, simulator, secret, or physical telemetry runtime", () => {
    expect(packageSources).not.toMatch(
      /["'](?:@googlemaps|google-map-react|mapbox-gl|leaflet|mqtt|aedes|kafkajs)["']/i,
    );
    expect(adminSource).not.toMatch(/maps\.googleapis|mapbox|leaflet/i);
    for (const prohibitedPath of [
      "netlify/functions/device-telemetry.mjs",
      "netlify/functions/physical-gps.mjs",
      "supabase/functions/device-telemetry",
      "src/telemetry/physical-device",
    ]) {
      expect(existsSync(path.resolve(prohibitedPath))).toBe(false);
    }
    expect(lowerSql).not.toMatch(/insert\s+into\s+public\.location_points/);
    expect(lowerSql).not.toMatch(/insert\s+into\s+public\.tracking_sessions/);
  });

  it("preserves Phone Location Proof, disabled defaults, and milestone boundaries", () => {
    expect(lowerSql).not.toMatch(
      /alter table\s+public\.(?:tracking_sessions|location_points)/,
    );
    expect(lowerSql).not.toMatch(
      /create or replace function\s+public\.(?:start_driver_tracking_session|sync_driver_location_points|stop_driver_tracking_session|admin_stop_tracking_session)/,
    );
    expect(lowerSql).not.toMatch(
      /(?:customer_live_enabled|live_tracking_enabled)\s+(?:boolean\s+)?default\s+true/,
    );

    const m18 = mvpTasks.match(
      /## Milestone M18[\s\S]*?(?=\n## Milestone M19|\s*$)/,
    )?.[0];
    expect(m18).toBeTruthy();
    expect(m18).toMatch(/- \[~\] In progress/);
    expect(m18).not.toMatch(/- \[x\] (?:Passed|Complete|Completed)/i);

    const m20aTasks = physicalTasks.match(
      /## M20A[\s\S]*?(?=\n## M20B)/,
    )?.[0];
    expect(m20aTasks).toBeTruthy();
    for (const taskId of ["T001", "T002", "T003", "T004", "T005"]) {
      expect(m20aTasks).toMatch(
        new RegExp(`- \\[x\\] M20A-${taskId}\\b`),
      );
    }
    const m20bTasks = physicalTasks.match(
      /## M20B[\s\S]*?(?=\n## M21)/,
    )?.[0];
    expect(m20bTasks).toBeTruthy();
    for (const taskId of ["T001", "T002", "T003", "T004"]) {
      expect(m20bTasks).toMatch(
        new RegExp(`- \\[x\\] M20B-${taskId}\\b`),
      );
    }

    const m21Tasks = physicalTasks.match(
      /## M21[\s\S]*?(?=\n## M22)/,
    )?.[0];
    expect(m21Tasks).toBeTruthy();
    for (const taskId of ["T001", "T002", "T002A", "T003", "T004", "T005", "T006"]) {
      expect(m21Tasks).toMatch(
        new RegExp(`- \\[x\\] M21-${taskId}\\b`),
      );
    }

    const currentAndFutureTasks = physicalTasks.match(/## M22[\s\S]*$/)?.[0];
    expect(currentAndFutureTasks).toBeTruthy();
    for (const taskId of ["T001", "T002", "T003", "T004"]) {
      expect(currentAndFutureTasks).toMatch(
        new RegExp(`- \\[x\\] M22-${taskId}\\b`),
      );
    }
    for (const taskId of ["T001", "T002", "T003"]) {
      expect(currentAndFutureTasks).toMatch(
        new RegExp(`- \\[x\\] M23-${taskId}\\b`),
      );
    }
    expect(currentAndFutureTasks).toMatch(
      /M22[\s\S]*M23[\s\S]*M24[\s\S]*M25[\s\S]*M26/,
    );
  });
});
