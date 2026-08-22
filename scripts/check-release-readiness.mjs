import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  CONFIG_SOURCES,
  RELEASE_MODES,
  buildReleaseManifest,
  evaluateEnvironment,
  evaluateRepository,
  migrationProvenance,
} from "./release-readiness.mjs";

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const mode = argument("--mode", process.env.RELEASE_READINESS_MODE || "preview");
const configSource = argument("--config-source", process.env.RELEASE_CONFIG_SOURCE || "repository");
const output = argument("--output", process.env.RELEASE_READINESS_OUTPUT || "");

if (!RELEASE_MODES.includes(mode)) {
  console.error(`release-readiness: unsupported mode ${mode}`);
  process.exit(2);
}
if (!CONFIG_SOURCES.includes(configSource)) {
  console.error(`release-readiness: unsupported config source ${configSource}`);
  process.exit(2);
}

const root = process.cwd();
const evaluation = configSource === "repository"
  ? evaluateRepository({ mode, root })
  : evaluateEnvironment({ mode, env: process.env });
const migration = evaluation.migration ?? migrationProvenance(root);
const manifest = buildReleaseManifest({ mode, configSource, evaluation, migration, env: process.env });

console.log(`release-readiness mode=${mode} source=${configSource}`);
for (const item of evaluation.checks) {
  console.log(`${item.scope}:${item.name}: ${item.status} (${item.severity})`);
}
console.log(`migration-count: ${migration.count}`);
console.log(`migration-fingerprint: ${migration.fingerprint}`);
console.log(`external-supabase: ${manifest.external.supabase}`);
console.log(`external-netlify-preview: ${manifest.external.netlifyPreview}`);
console.log(`external-rollback: ${manifest.external.rollback}`);
console.log(`promotion-ready: ${manifest.promotionReady ? "yes" : "no"}`);

if (output) {
  const absolute = path.resolve(output);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`release-manifest: ${path.relative(root, absolute) || absolute}`);
}

if (!evaluation.ok) process.exit(1);
