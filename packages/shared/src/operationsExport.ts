export const operationsExportScopes = [
  "enquiries",
  "ad_works",
  "drivers",
  "vehicles",
  "devices",
  "audit",
] as const;

export const operationsExportFormats = ["csv", "json"] as const;

export type OperationsExportScope = (typeof operationsExportScopes)[number];
export type OperationsExportFormat = (typeof operationsExportFormats)[number];
export type OperationsExportCell = string | number | boolean | null | unknown;
export type OperationsExportRow = Record<string, OperationsExportCell>;

export interface OperationsExportEnvelope {
  contractVersion: "m27.operations-export.v1";
  receiptId: string;
  scope: OperationsExportScope;
  format: OperationsExportFormat;
  rowCount: number;
  truncated: boolean;
  containsPii: boolean;
  generatedAt: string;
  columns: string[];
  filters: Record<string, unknown>;
  rows: OperationsExportRow[];
}

export interface OperationsExportReceipt {
  id: string;
  actor_id: string;
  scope: OperationsExportScope;
  format: OperationsExportFormat;
  filter_summary: Record<string, unknown>;
  row_limit: number;
  row_count: number;
  contains_pii: boolean;
  truncated: boolean;
  status: "completed";
  created_at: string;
  contract_version: "m27.operations-export.v1";
}

export const operationsExportScopeLabels: Record<OperationsExportScope, string> = {
  enquiries: "Enquiries",
  ad_works: "Ad works",
  drivers: "Drivers",
  vehicles: "Vehicles",
  devices: "Physical devices",
  audit: "Activity history",
};

export const operationsExportScopeContainsPii: Record<OperationsExportScope, boolean> = {
  enquiries: true,
  ad_works: true,
  drivers: true,
  vehicles: false,
  devices: false,
  audit: false,
};

export const operationsExportScopeColumns: Record<OperationsExportScope, readonly string[]> = {
  enquiries: [
    "id",
    "customer_name",
    "business_name",
    "phone",
    "city",
    "required_areas",
    "preferred_start_date",
    "number_of_days",
    "source",
    "status",
    "package_interest",
    "live_tracking_needed",
    "follow_up_date",
    "created_at",
    "updated_at",
  ],
  ad_works: [
    "id",
    "title",
    "customer_name",
    "business_name",
    "customer_phone",
    "city",
    "start_date",
    "end_date",
    "planning_status",
    "assignment_status",
    "execution_overall_status",
    "closure_status",
    "package_interest",
    "number_of_days",
    "created_at",
    "updated_at",
  ],
  drivers: [
    "id",
    "name",
    "phone",
    "city",
    "service_areas",
    "onboarding_status",
    "availability_status_text",
    "created_at",
    "updated_at",
  ],
  vehicles: [
    "id",
    "vehicle_number",
    "vehicle_type",
    "city",
    "onboarding_status",
    "mic_system_available",
    "gps_device_available",
    "gps_device_status",
    "active",
    "created_at",
    "updated_at",
  ],
  devices: [
    "id",
    "device_code",
    "status",
    "vendor",
    "model",
    "adapter_type",
    "protocol_type",
    "serial_number",
    "imei",
    "vendor_device_identifier",
    "installation_state",
    "gps_readiness",
    "gsm_readiness",
    "external_power_status",
    "battery_status",
    "last_heartbeat_at",
    "last_telemetry_at",
    "created_at",
    "updated_at",
  ],
  audit: [
    "id",
    "actor_type",
    "action",
    "entity_type",
    "entity_id",
    "created_at",
    "safe_details",
  ],
};

export function isOperationsExportScope(value: unknown): value is OperationsExportScope {
  return typeof value === "string" && operationsExportScopes.includes(value as OperationsExportScope);
}

export function isOperationsExportFormat(value: unknown): value is OperationsExportFormat {
  return typeof value === "string" && operationsExportFormats.includes(value as OperationsExportFormat);
}

export function normalizeOperationsExportLimit(value: unknown, fallback = 200): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(numberValue)) return fallback;
  return Math.min(500, Math.max(1, numberValue));
}

function stringifyExportCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function neutralizeSpreadsheetFormula(value: string): string {
  if (/^[=+\-@\t\r]/u.test(value)) return "'" + value;
  return value;
}

function escapeCsvCell(value: unknown): string {
  const neutralized = neutralizeSpreadsheetFormula(stringifyExportCell(value));
  if (/[",\r\n]/u.test(neutralized)) {
    return '"' + neutralized.replaceAll('"', '""') + '"';
  }
  return neutralized;
}

export function serializeOperationsCsv(
  columns: readonly string[],
  rows: readonly OperationsExportRow[],
): string {
  const header = columns.map(escapeCsvCell).join(",");
  const data = rows.map((row) => columns.map((column) => escapeCsvCell(row[column])).join(","));
  return "\uFEFF" + [header, ...data].join("\r\n") + "\r\n";
}

export function serializeOperationsJson(
  envelope: Pick<
    OperationsExportEnvelope,
    | "contractVersion"
    | "receiptId"
    | "scope"
    | "format"
    | "rowCount"
    | "truncated"
    | "containsPii"
    | "generatedAt"
    | "columns"
    | "filters"
    | "rows"
  >,
): string {
  return JSON.stringify(envelope, null, 2) + "\n";
}

export function validateOperationsExportEnvelope(value: unknown): value is OperationsExportEnvelope {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<OperationsExportEnvelope>;
  if (candidate.contractVersion !== "m27.operations-export.v1") return false;
  if (!isOperationsExportScope(candidate.scope) || !isOperationsExportFormat(candidate.format)) return false;
  if (
    typeof candidate.receiptId !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(candidate.receiptId)
  ) return false;
  if (!Number.isInteger(candidate.rowCount) || (candidate.rowCount ?? -1) < 0 || (candidate.rowCount ?? 501) > 500) return false;
  if (typeof candidate.truncated !== "boolean" || typeof candidate.containsPii !== "boolean") return false;
  if (candidate.containsPii !== operationsExportScopeContainsPii[candidate.scope]) return false;
  if (typeof candidate.generatedAt !== "string" || Number.isNaN(Date.parse(candidate.generatedAt))) return false;
  if (!Array.isArray(candidate.columns) || !Array.isArray(candidate.rows)) return false;
  if (!candidate.filters || typeof candidate.filters !== "object" || Array.isArray(candidate.filters)) return false;
  const allowedColumns = operationsExportScopeColumns[candidate.scope];
  if (
    candidate.columns.length !== allowedColumns.length
    || candidate.columns.some((column, index) => column !== allowedColumns[index])
  ) return false;
  if (candidate.rows.length !== candidate.rowCount) return false;
  const allowedColumnSet = new Set(allowedColumns);
  return candidate.rows.every((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return false;
    const keys = Object.keys(row);
    return keys.length === allowedColumns.length
      && keys.every((key) => allowedColumnSet.has(key))
      && allowedColumns.every((column) => Object.prototype.hasOwnProperty.call(row, column));
  });
}
