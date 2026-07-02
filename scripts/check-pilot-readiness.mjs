import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const requiredDocs = [
  "docs/pilot/m17-real-device-pilot-blocker-remediation.md",
  "docs/pilot/m17-android-real-device-setup-guide.md",
  "docs/deployment/m17-driver-app-real-device-build-guide.md",
  "docs/deployment/m17-supabase-target-remediation-guide.md",
  "docs/deployment/m17-web-admin-preview-deployment-guide.md",
  "docs/pilot/m17-blocker-remediation-evidence-template.md"
];

const requiredEnvNames = [
  "VITE_PRODUCT_NAME",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "EXPO_PUBLIC_PRODUCT_NAME",
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY"
];

const placeholderRequiredEnvNames = new Set([
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY"
]);

const placeholderFragments = ["your-project", "replace-with", "placeholder", "example.com"];
const unsafeEnvPattern = /(?:VITE|EXPO_PUBLIC)_[A-Z0-9_]*(?:SERVICE_ROLE|SUPABASE_SERVICE)[A-Z0-9_]*/;
const checks = [];

function readSafe(filePath) {
  return readFileSync(path.resolve(filePath), "utf8");
}

function add(scope, ok, status) {
  checks.push({ scope, ok, severity: ok ? "info" : "error", status });
}

function lineValue(contents, name) {
  const line = contents.split(/\r?\n/).find((candidate) => candidate.startsWith(name + "="));
  return line?.slice(name.length + 1).trim();
}

for (const docPath of requiredDocs) {
  const exists = existsSync(path.resolve(docPath));
  add("m17-docs", exists, exists ? "present" : "missing");
}

const docsText = requiredDocs.filter((docPath) => existsSync(path.resolve(docPath))).map(readSafe).join("\n");
for (const envName of requiredEnvNames) {
  const documented = docsText.includes(envName);
  add("m17-env-docs", documented, documented ? "documented" : "missing");
}

const envExample = readSafe(".env.example");
for (const envName of requiredEnvNames) {
  const value = lineValue(envExample, envName);
  const present = typeof value === "string" && value.length > 0;
  if (!present) {
    add("env-example", false, "missing");
    continue;
  }

  const requiresPlaceholder = placeholderRequiredEnvNames.has(envName);
  const isPlaceholder = placeholderFragments.some((fragment) => value.toLowerCase().includes(fragment));
  add(
    "env-example",
    requiresPlaceholder ? isPlaceholder : true,
    requiresPlaceholder ? (isPlaceholder ? "placeholder" : "unsafe_default") : "configured"
  );
}

const frontendEnvSources = [
  ".env.example",
  "apps/web/src/admin.tsx",
  "apps/web/src/App.tsx",
  "apps/driver/App.tsx",
  "apps/driver/app.json"
].map(readSafe).join("\n");

const hasUnsafeFrontendEnvName = unsafeEnvPattern.test(frontendEnvSources);
add("frontend-env", !hasUnsafeFrontendEnvName, hasUnsafeFrontendEnvName ? "unsafe_key_name_detected" : "safe");

console.log("pilot-readiness mode: local");
for (const check of checks) {
  console.log(check.scope + ": " + check.status + " (" + check.severity + ")");
}

if (checks.some((check) => check.ok === false && check.severity === "error")) {
  process.exit(1);
}
