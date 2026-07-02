export type PilotReadinessMode = "local" | "preview" | "production";
export type PilotReadinessSeverity = "error" | "warning" | "info";
export type PilotReadinessScope = "web" | "driver" | "database" | "general";
export type PilotReadinessStatus =
  | "configured"
  | "missing"
  | "placeholder"
  | "unsafe_key_name_detected"
  | "unsafe_default";

export interface PilotReadinessEnvInput {
  mode?: PilotReadinessMode;
  webEnv?: Record<string, string | undefined>;
  driverEnv?: Record<string, string | undefined>;
  schemaDefaults?: {
    customerLiveEnabledDefault?: boolean;
    liveTrackingEnabledDefault?: boolean;
  };
}

export interface PilotReadinessCheck {
  id: string;
  scope: PilotReadinessScope;
  ok: boolean;
  severity: PilotReadinessSeverity;
  status: PilotReadinessStatus;
  message: string;
}

const webRequiredVariables = ["VITE_PRODUCT_NAME", "VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"] as const;
const driverRequiredVariables = [
  "EXPO_PUBLIC_PRODUCT_NAME",
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY"
] as const;

const placeholderFragments = [
  "your-project",
  "replace-with",
  "placeholder",
  "example.com",
  "change-me",
  "todo"
] as const;

function isProductionLike(mode: PilotReadinessMode): boolean {
  return mode === "preview" || mode === "production";
}

function isPlaceholderValue(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }

  const normalizedValue = value.trim().toLowerCase();
  if (normalizedValue.length === 0) {
    return false;
  }

  return placeholderFragments.some((fragment) => normalizedValue.includes(fragment));
}

function addRequiredVariableChecks(
  checks: PilotReadinessCheck[],
  scope: "web" | "driver",
  env: Record<string, string | undefined>,
  variables: readonly string[],
  mode: PilotReadinessMode
): void {
  for (const variableName of variables) {
    const value = env[variableName];
    const hasValue = typeof value === "string" && value.trim().length > 0;
    if (hasValue === false) {
      checks.push({
        id: `${scope}-${variableName}-present`,
        scope,
        ok: false,
        severity: isProductionLike(mode) ? "error" : "warning",
        status: "missing",
        message: `${variableName} is required for pilot deployment readiness.`
      });
      continue;
    }

    if (isPlaceholderValue(value)) {
      checks.push({
        id: `${scope}-${variableName}-placeholder`,
        scope,
        ok: false,
        severity: isProductionLike(mode) ? "error" : "warning",
        status: "placeholder",
        message: `${variableName} still looks like a placeholder.`
      });
      continue;
    }

    checks.push({
      id: `${scope}-${variableName}-ready`,
      scope,
      ok: true,
      severity: "info",
      status: "configured",
      message: `${variableName} is present.`
    });
  }
}

function addPrivilegedKeyChecks(
  checks: PilotReadinessCheck[],
  scope: "web" | "driver",
  env: Record<string, string | undefined>
): void {
  const unsafeNeedles = [["SERVICE", "ROLE"].join("_"), ["SUPABASE", "SERVICE"].join("_")];

  for (const variableName of Object.keys(env)) {
    const normalizedName = variableName.toUpperCase();
    if (unsafeNeedles.some((needle) => normalizedName.includes(needle))) {
      checks.push({
        id: `${scope}-${variableName}-privileged-key`,
        scope,
        ok: false,
        severity: "error",
        status: "unsafe_key_name_detected",
        message: `${variableName} must not be exposed to browser or driver app environments.`
      });
    }
  }
}

function addFeatureFlagDefaultChecks(
  checks: PilotReadinessCheck[],
  schemaDefaults: PilotReadinessEnvInput["schemaDefaults"]
): void {
  const customerLiveDefault = schemaDefaults?.customerLiveEnabledDefault ?? false;
  const liveTrackingDefault = schemaDefaults?.liveTrackingEnabledDefault ?? false;

  checks.push({
    id: "database-customer-live-enabled-default",
    scope: "database",
    ok: customerLiveDefault === false,
    severity: customerLiveDefault === false ? "info" : "error",
    status: customerLiveDefault === false ? "configured" : "unsafe_default",
    message: "customer_live_enabled must default to false for the pilot."
  });

  checks.push({
    id: "database-live-tracking-enabled-default",
    scope: "database",
    ok: liveTrackingDefault === false,
    severity: liveTrackingDefault === false ? "info" : "error",
    status: liveTrackingDefault === false ? "configured" : "unsafe_default",
    message: "live_tracking_enabled must default to false for the pilot."
  });
}

export function validatePilotReadinessEnvironment(input: PilotReadinessEnvInput = {}): PilotReadinessCheck[] {
  const mode = input.mode ?? "local";
  const webEnv = input.webEnv ?? {};
  const driverEnv = input.driverEnv ?? {};
  const checks: PilotReadinessCheck[] = [];

  addRequiredVariableChecks(checks, "web", webEnv, webRequiredVariables, mode);
  addRequiredVariableChecks(checks, "driver", driverEnv, driverRequiredVariables, mode);
  addPrivilegedKeyChecks(checks, "web", webEnv);
  addPrivilegedKeyChecks(checks, "driver", driverEnv);
  addFeatureFlagDefaultChecks(checks, input.schemaDefaults);

  return checks;
}

export function hasBlockingPilotReadinessIssue(checks: readonly PilotReadinessCheck[]): boolean {
  return checks.some((check) => check.ok === false && check.severity === "error");
}

export function formatPilotReadinessCheck(check: PilotReadinessCheck): string {
  return `${check.scope}: ${check.status} (${check.severity})`;
}