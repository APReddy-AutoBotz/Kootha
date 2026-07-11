import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const modeValues = new Set(["local", "preview", "production"]);
const mode = modeValues.has(process.env.PILOT_ENV_MODE) ? process.env.PILOT_ENV_MODE : "local";
const productionLike = mode === "preview" || mode === "production";
const placeholders = ["your-project", "replace-with", "placeholder", "example.com", "change-me", "todo"];
const unsafeNeedles = ["SERVICE_ROLE", "SUPABASE_SERVICE"];
const checks = [];

function parseEnvFile(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, "utf8").split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
  }));
}

const webEnv = { ...parseEnvFile(path.resolve("apps/web/.env.local")), ...process.env };
const driverEnv = { ...parseEnvFile(path.resolve("apps/driver/.env.local")), ...process.env };
const required = {
  web: ["VITE_PRODUCT_NAME", "VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"],
  driver: ["EXPO_PUBLIC_PRODUCT_NAME", "EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_ANON_KEY"]
};
const productionRequired = {
  web: ["VITE_TURNSTILE_SITE_KEY", "VITE_SENTRY_DSN"],
  driver: ["EXPO_PUBLIC_SENTRY_DSN"]
};

function add(scope, ok, severity, status) { checks.push({ scope, ok, severity, status }); }
function isPlaceholder(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized.length > 0 && placeholders.some((placeholder) => normalized.includes(placeholder));
}
function checkNames(scope, names, values, requiredNow) {
  for (const name of names) {
    const value = values[name];
    if (typeof value !== "string" || value.trim().length === 0) { add(scope, false, requiredNow ? "error" : "warning", "missing"); continue; }
    if (isPlaceholder(value)) { add(scope, false, requiredNow ? "error" : "warning", "placeholder"); continue; }
    add(scope, true, "info", "configured");
  }
}

checkNames("web", required.web, webEnv, productionLike);
checkNames("driver", required.driver, driverEnv, productionLike);
checkNames("web-production", productionRequired.web, webEnv, productionLike);
checkNames("driver-production", productionRequired.driver, driverEnv, productionLike);

for (const [scope, prefix, values] of [["web", "VITE_", webEnv], ["driver", "EXPO_PUBLIC_", driverEnv]]) {
  const unsafeFound = Object.keys(values).some((name) => name.startsWith(prefix) && unsafeNeedles.some((needle) => name.toUpperCase().includes(needle)));
  if (unsafeFound) add(scope, false, "error", "unsafe_key_name_detected");
}
for (const [name, scope] of [["CUSTOMER_LIVE_ENABLED_DEFAULT", "database"], ["LIVE_TRACKING_ENABLED_DEFAULT", "database"]]) {
  const value = process.env[name];
  add(scope, value === undefined || value.trim().toLowerCase() === "false", value === undefined || value.trim().toLowerCase() === "false" ? "info" : "error", value === undefined || value.trim().toLowerCase() === "false" ? "configured" : "unsafe_default");
}

console.log("pilot-env mode: " + mode);
for (const check of checks) console.log(check.scope + ": " + check.status + " (" + check.severity + ")");
if (checks.some((check) => !check.ok && check.severity === "error")) process.exit(1);
