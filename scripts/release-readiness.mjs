import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const RELEASE_MODES = ["preview", "production"];
export const CONFIG_SOURCES = ["repository", "environment"];
export const EXTERNAL_STATUSES = ["blocked-not-run", "passed", "failed"];

const PLACEHOLDER_FRAGMENTS = ["your-project", "replace-with", "placeholder", "example.com", "change-me", "todo"];
const PUBLIC_PREFIXES = ["VITE_", "EXPO_PUBLIC_"];
const PUBLIC_AUTHORITY_PATTERN = /(?:SERVICE_ROLE|SECRET|PEPPER|CREDENTIAL|RATE_LIMIT_KEY)/i;
const BUILTIN_RUNTIME_ENV_NAMES = new Set(["BASE_URL", "DEV", "MODE", "NODE_ENV", "PROD", "SSR"]);
const PLACEHOLDER_EXPECTED_PUBLIC_NAMES = new Set([
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_CONTACT_PHONE",
  "VITE_CONTACT_PHONE_DISPLAY",
  "VITE_TURNSTILE_SITE_KEY",
  "VITE_SENTRY_DSN",
  "VITE_APP_RELEASE",
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  "EXPO_PUBLIC_ADMIN_PHONE",
  "EXPO_PUBLIC_SENTRY_DSN",
  "EXPO_PUBLIC_APP_RELEASE",
]);

export const ENVIRONMENT_CONTRACT = Object.freeze([
  { name: "VITE_PRODUCT_NAME", exposure: "public", scope: "web", preview: true, production: true },
  { name: "VITE_SUPABASE_URL", exposure: "public", scope: "web", preview: true, production: true },
  { name: "VITE_SUPABASE_ANON_KEY", exposure: "public", scope: "web", preview: true, production: true },
  { name: "VITE_SENTRY_ENVIRONMENT", exposure: "public", scope: "web", preview: true, production: true },
  { name: "VITE_APP_RELEASE", exposure: "public", scope: "web", preview: true, production: true },
  { name: "VITE_CONTACT_PHONE", exposure: "public", scope: "web", preview: false, production: true },
  { name: "VITE_CONTACT_PHONE_DISPLAY", exposure: "public", scope: "web", preview: false, production: true },
  { name: "VITE_TURNSTILE_SITE_KEY", exposure: "public", scope: "web", preview: false, production: true },
  { name: "VITE_SENTRY_DSN", exposure: "public", scope: "web", preview: false, production: true },
  { name: "EXPO_PUBLIC_PRODUCT_NAME", exposure: "public", scope: "driver", preview: false, production: true },
  { name: "EXPO_PUBLIC_SUPABASE_URL", exposure: "public", scope: "driver", preview: false, production: true },
  { name: "EXPO_PUBLIC_SUPABASE_ANON_KEY", exposure: "public", scope: "driver", preview: false, production: true },
  { name: "EXPO_PUBLIC_ADMIN_PHONE", exposure: "public", scope: "driver", preview: false, production: true },
  { name: "EXPO_PUBLIC_SENTRY_DSN", exposure: "public", scope: "driver", preview: false, production: true },
  { name: "EXPO_PUBLIC_SENTRY_ENVIRONMENT", exposure: "public", scope: "driver", preview: false, production: true },
  { name: "EXPO_PUBLIC_APP_RELEASE", exposure: "public", scope: "driver", preview: false, production: true },
  { name: "SUPABASE_URL", exposure: "server", scope: "server", preview: true, production: true },
  { name: "SUPABASE_SERVICE_ROLE_KEY", exposure: "server", scope: "server", secret: true, minLength: 20, preview: false, production: true },
  { name: "TURNSTILE_SECRET_KEY", exposure: "server", scope: "server", secret: true, minLength: 20, preview: false, production: true },
  { name: "ENQUIRY_RATE_LIMIT_SALT", exposure: "server", scope: "server", secret: true, minLength: 32, preview: false, production: true },
  { name: "ENQUIRY_INTAKE_ENABLED", exposure: "server", scope: "server", switchPolicy: "must-false", preview: false, production: true },
  { name: "RETENTION_DELETION_ENABLED", exposure: "server", scope: "server", switchPolicy: "must-false", preview: false, production: true },
  { name: "TELEMETRY_INGEST_ENABLED", exposure: "server", scope: "server", switchPolicy: "feature", preview: false, production: false },
  { name: "TELEMETRY_CREDENTIAL_PEPPER", exposure: "server", scope: "server", secret: true, minLength: 32, conditionalOn: "TELEMETRY_INGEST_ENABLED", preview: false, production: false },
  { name: "TELEMETRY_RATE_LIMIT_KEY", exposure: "server", scope: "server", secret: true, minLength: 32, conditionalOn: "TELEMETRY_INGEST_ENABLED", preview: false, production: false },
  { name: "M22_RULE_ENGINE_ENABLED", exposure: "server", scope: "server", switchPolicy: "feature", preview: false, production: false },
  { name: "M23_COMPARISON_ENGINE_ENABLED", exposure: "server", scope: "server", switchPolicy: "feature", preview: false, production: false },
  { name: "M25_STATISTICAL_ENGINE_ENABLED", exposure: "server", scope: "server", switchPolicy: "feature", preview: false, production: false },
  { name: "M22_HEALTH_SWEEP_BATCH_SIZE", exposure: "server", scope: "server", optionalTuning: true, preview: false, production: false },
  { name: "M22_RETENTION_BATCH_SIZE", exposure: "server", scope: "server", optionalTuning: true, preview: false, production: false },
]);

export const CONTRACT_NAMES = new Set(ENVIRONMENT_CONTRACT.map((entry) => entry.name));

function check(scope, name, ok, severity, status) {
  return { scope, name, ok, severity, status };
}

function isPlaceholder(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized.length > 0 && PLACEHOLDER_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

function isRequired(entry, mode) {
  return mode === "production" ? entry.production === true : entry.preview === true;
}

function relevantScopes(mode) {
  return mode === "production" ? new Set(["web", "driver", "server"]) : new Set(["web", "server"]);
}

function safeBoolean(value) {
  if (value === undefined || String(value).trim() === "") return "missing";
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true" || normalized === "false") return normalized;
  return "invalid";
}

export function findUnsafePublicAuthorityNames(env = {}) {
  return Object.keys(env)
    .filter((name) => PUBLIC_PREFIXES.some((prefix) => name.startsWith(prefix)))
    .filter((name) => PUBLIC_AUTHORITY_PATTERN.test(name))
    .sort();
}

export function evaluateEnvironment({ mode = "preview", env = process.env } = {}) {
  if (!RELEASE_MODES.includes(mode)) throw new Error(`Unsupported release mode: ${mode}`);
  const checks = [];
  const scopes = relevantScopes(mode);
  for (const unsafeName of findUnsafePublicAuthorityNames(env)) {
    checks.push(check("environment", unsafeName, false, "error", "unsafe_public_authority_name"));
  }
  for (const entry of ENVIRONMENT_CONTRACT) {
    if (!scopes.has(entry.scope)) continue;
    const value = env[entry.name];
    const required = isRequired(entry, mode);
    if (entry.switchPolicy === "must-false") {
      const state = safeBoolean(value);
      if (state === "true") checks.push(check(entry.scope, entry.name, false, "error", "unsafe_enabled"));
      else if (state === "invalid") checks.push(check(entry.scope, entry.name, false, "error", "invalid_boolean"));
      else if (required && state === "missing") checks.push(check(entry.scope, entry.name, false, "error", "missing_explicit_fail_closed_switch"));
      else checks.push(check(entry.scope, entry.name, true, "info", "safe_disabled"));
      continue;
    }
    if (entry.switchPolicy === "feature") {
      const state = safeBoolean(value);
      if (state === "invalid") checks.push(check(entry.scope, entry.name, false, "error", "invalid_boolean"));
      else checks.push(check(entry.scope, entry.name, true, "info", state === "true" ? "enabled" : "safe_disabled"));
      continue;
    }
    const conditionEnabled = entry.conditionalOn && safeBoolean(env[entry.conditionalOn]) === "true";
    const requiredNow = required || conditionEnabled;
    if (value === undefined || String(value).trim() === "") {
      checks.push(check(entry.scope, entry.name, !requiredNow, requiredNow ? "error" : "info", requiredNow ? "missing" : "not_required"));
      continue;
    }
    if (isPlaceholder(value)) {
      checks.push(check(entry.scope, entry.name, !requiredNow, requiredNow ? "error" : "warning", "placeholder"));
      continue;
    }
    if (entry.minLength && String(value).trim().length < entry.minLength) {
      checks.push(check(entry.scope, entry.name, false, "error", "below_minimum_length"));
      continue;
    }
    checks.push(check(entry.scope, entry.name, true, "info", "configured"));
  }
  for (const feature of ["M22_RULE_ENGINE_ENABLED", "M23_COMPARISON_ENGINE_ENABLED", "M25_STATISTICAL_ENGINE_ENABLED"]) {
    if (safeBoolean(env[feature]) !== "true") continue;
    for (const dependency of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
      const value = env[dependency];
      const ok = typeof value === "string" && value.trim().length > 0 && !isPlaceholder(value);
      checks.push(check("feature-dependency", `${feature}:${dependency}`, ok, ok ? "info" : "error", ok ? "configured" : "missing"));
    }
  }
  return summarizeChecks(checks);
}

function walkFiles(root, relativeDir) {
  const absoluteDir = path.join(root, relativeDir);
  if (!existsSync(absoluteDir)) return [];
  const result = [];
  for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
    const relative = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "dist", "build", ".expo"].includes(entry.name)) continue;
      result.push(...walkFiles(root, relative));
    } else if (/\.(?:js|mjs|cjs|ts|tsx|jsx)$/.test(entry.name) && !/\.(?:test|spec)\./.test(entry.name)) {
      result.push(relative);
    }
  }
  return result;
}

export function findRuntimeEnvironmentNames(root = process.cwd()) {
  const files = [...walkFiles(root, "apps/web/src"), ...walkFiles(root, "apps/driver"), ...walkFiles(root, "netlify/functions")].sort();
  const names = new Set();
  for (const relative of files) {
    const source = readFileSync(path.join(root, relative), "utf8");
    for (const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) names.add(match[1]);
    for (const match of source.matchAll(/import\.meta\.env\.([A-Z][A-Z0-9_]*)/g)) names.add(match[1]);
  }
  return [...names].sort();
}

export function findUnclassifiedRuntimeEnvironmentNames(root = process.cwd()) {
  return findRuntimeEnvironmentNames(root).filter((name) => !CONTRACT_NAMES.has(name) && !BUILTIN_RUNTIME_ENV_NAMES.has(name));
}

export function migrationProvenance(root = process.cwd()) {
  const directory = path.join(root, "supabase", "migrations");
  const files = readdirSync(directory).filter((name) => name.endsWith(".sql")).sort();
  const timestamps = files.map((name) => name.split("_")[0]);
  if (new Set(timestamps).size !== timestamps.length) throw new Error("Duplicate migration timestamp detected.");
  const hash = createHash("sha256");
  for (const name of files) {
    hash.update(name);
    hash.update("\0");
    hash.update(readFileSync(path.join(directory, name)));
    hash.update("\0");
  }
  return { count: files.length, fingerprint: `sha256:${hash.digest("hex")}` };
}

function parseEnvExample(root) {
  const file = path.join(root, ".env.example");
  if (!existsSync(file)) return new Map();
  const values = new Map();
  for (const rawLine of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    values.set(line.slice(0, index).trim(), line.slice(index + 1).trim());
  }
  return values;
}

export function evaluateRepository({ mode = "preview", root = process.cwd() } = {}) {
  if (!RELEASE_MODES.includes(mode)) throw new Error(`Unsupported release mode: ${mode}`);
  const checks = [];
  const envExample = parseEnvExample(root);
  for (const entry of ENVIRONMENT_CONTRACT.filter((candidate) => candidate.exposure === "public")) {
    const present = envExample.has(entry.name);
    checks.push(check("env-example", entry.name, present, present ? "info" : "error", present ? "documented" : "missing"));
    if (present && PLACEHOLDER_EXPECTED_PUBLIC_NAMES.has(entry.name) && !isPlaceholder(envExample.get(entry.name))) {
      checks.push(check("env-example", entry.name, false, "error", "non_placeholder_public_in_example"));
    }
  }
  const unclassified = findUnclassifiedRuntimeEnvironmentNames(root);
  if (unclassified.length === 0) checks.push(check("runtime-env-coverage", "contract", true, "info", "complete"));
  for (const name of unclassified) checks.push(check("runtime-env-coverage", name, false, "error", "unclassified"));
  const unsafeNames = findUnsafePublicAuthorityNames(Object.fromEntries([...envExample.keys()].map((name) => [name, "present"])));
  if (unsafeNames.length === 0) checks.push(check("env-example", "public-authority-boundary", true, "info", "safe"));
  for (const name of unsafeNames) checks.push(check("env-example", name, false, "error", "unsafe_public_authority_name"));
  const migration = migrationProvenance(root);
  checks.push(check("migrations", "timestamp-uniqueness", true, "info", "verified"));
  checks.push(check("migrations", "fingerprint", true, "info", "computed"));
  return { ...summarizeChecks(checks), migration };
}

export function summarizeChecks(checks) {
  const errors = checks.filter((item) => item.severity === "error" && item.ok === false).length;
  const warnings = checks.filter((item) => item.severity === "warning" && item.ok === false).length;
  return { ok: errors === 0, errors, warnings, checks };
}

export function normalizeExternalStatus(value) {
  return EXTERNAL_STATUSES.includes(value) ? value : "blocked-not-run";
}

export function releaseTimestamp(env = process.env) {
  const raw = env.SOURCE_DATE_EPOCH;
  if (raw !== undefined && /^\d+$/.test(String(raw))) return new Date(Number(raw) * 1000).toISOString();
  return new Date().toISOString();
}

export function buildReleaseManifest({ mode, configSource, evaluation, migration, env = process.env, timestamp = releaseTimestamp(env) } = {}) {
  const external = {
    supabase: normalizeExternalStatus(env.RELEASE_SUPABASE_STATUS),
    netlifyPreview: normalizeExternalStatus(env.RELEASE_NETLIFY_PREVIEW_STATUS),
    rollback: normalizeExternalStatus(env.RELEASE_ROLLBACK_STATUS),
  };
  const sourceSha = String(env.RELEASE_SOURCE_SHA || env.GITHUB_SHA || "unknown").trim() || "unknown";
  const releaseId = String(env.VITE_APP_RELEASE || env.EXPO_PUBLIC_APP_RELEASE || "unversioned").trim() || "unversioned";
  const externalReady = Object.values(external).every((status) => status === "passed");
  return {
    schemaVersion: "m29-release-manifest-v1",
    mode,
    configSource,
    sourceSha,
    releaseId,
    migration,
    checks: { ok: evaluation.ok, errors: evaluation.errors, warnings: evaluation.warnings, results: evaluation.checks },
    external,
    promotionReady: evaluation.ok && externalReady,
    timestamp,
  };
}
