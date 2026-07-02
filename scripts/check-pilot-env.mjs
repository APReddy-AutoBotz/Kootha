const modeValues = new Set(["local", "preview", "production"]);
const mode = modeValues.has(process.env.PILOT_ENV_MODE) ? process.env.PILOT_ENV_MODE : "local";
const productionLike = mode === "preview" || mode === "production";

const required = {
  web: ["VITE_PRODUCT_NAME", "VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"],
  driver: ["EXPO_PUBLIC_PRODUCT_NAME", "EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_ANON_KEY"]
};

const placeholders = ["your-project", "replace-with", "placeholder", "example.com", "change-me", "todo"];
const unsafeNeedles = ["SERVICE_ROLE", "SUPABASE_SERVICE"];
const checks = [];

function add(scope, ok, severity, status) {
  checks.push({ scope, ok, severity, status });
}

function isPlaceholder(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized.length > 0 && placeholders.some((placeholder) => normalized.includes(placeholder));
}

for (const [scope, names] of Object.entries(required)) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value !== "string" || value.trim().length === 0) {
      add(scope, false, productionLike ? "error" : "warning", "missing");
      continue;
    }
    if (isPlaceholder(value)) {
      add(scope, false, productionLike ? "error" : "warning", "placeholder");
      continue;
    }
    add(scope, true, "info", "configured");
  }
}

for (const [scope, prefix] of [["web", "VITE_"], ["driver", "EXPO_PUBLIC_"]]) {
  const unsafeFound = Object.keys(process.env).some((name) => {
    const normalized = name.toUpperCase();
    return normalized.startsWith(prefix) && unsafeNeedles.some((needle) => normalized.includes(needle));
  });
  if (unsafeFound) {
    add(scope, false, "error", "unsafe_key_name_detected");
  }
}

for (const [name, scope] of [
  ["CUSTOMER_LIVE_ENABLED_DEFAULT", "database"],
  ["LIVE_TRACKING_ENABLED_DEFAULT", "database"]
]) {
  const value = process.env[name];
  if (value === undefined || value.trim().toLowerCase() === "false") {
    add(scope, true, "info", "configured");
  } else {
    add(scope, false, "error", "unsafe_default");
  }
}

console.log(`pilot-env mode: ${mode}`);
for (const check of checks) {
  console.log(`${check.scope}: ${check.status} (${check.severity})`);
}

if (checks.some((check) => check.ok === false && check.severity === "error")) {
  process.exit(1);
}