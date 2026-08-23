import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  CONFIG_SOURCES,
  RELEASE_MODES,
  buildReleaseManifest,
  evaluateEnvironment,
  evaluateRepository,
  evaluateSourceProvenance,
  migrationProvenance,
  summarizeChecks,
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
const outputPath = output ? path.resolve(output) : "";
if (outputPath) rmSync(outputPath, { force: true });

const sourceEvaluation = evaluateSourceProvenance({
  root,
  expectedSha: process.env.RELEASE_SOURCE_SHA || "",
});

console.log(`release-readiness mode=${mode} source=${configSource}`);
for (const item of sourceEvaluation.checks) {
  console.log(`${item.scope}:${item.name}: ${item.status} (${item.severity})`);
}
console.log(`evaluated-source-sha: ${sourceEvaluation.source.sha}`);

if (!sourceEvaluation.ok) {
  console.error("release-readiness: source provenance check failed; release inputs were not evaluated and no manifest was emitted");
  process.exit(1);
}

const configurationEvaluation = configSource === "repository"
  ? evaluateRepository({ mode, root })
  : evaluateEnvironment({ mode, env: process.env });
const evaluation = summarizeChecks([
  ...sourceEvaluation.checks,
  ...configurationEvaluation.checks,
]);

for (const item of configurationEvaluation.checks) {
  console.log(`${item.scope}:${item.name}: ${item.status} (${item.severity})`);
}

if (!configurationEvaluation.ok || !evaluation.ok) {
  console.error("release-readiness: configuration check failed; no release manifest was emitted");
  process.exit(1);
}

const migration = configurationEvaluation.migration ?? migrationProvenance(root);
console.log(`migration-count: ${migration.count}`);
console.log(`migration-fingerprint: ${migration.fingerprint}`);

const manifest = buildReleaseManifest({
  mode,
  configSource,
  evaluation,
  migration,
  source: sourceEvaluation.source,
  env: process.env,
});
console.log(`external-supabase: ${manifest.external.supabase}`);
console.log(`external-netlify-preview: ${manifest.external.netlifyPreview}`);
console.log(`external-rollback: ${manifest.external.rollback}`);
console.log(`promotion-ready: ${manifest.promotionReady ? "yes" : "no"}`);
console.log(`promotion-decision: ${manifest.promotionDecision}`);

if (outputPath) {
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`release-manifest: ${path.relative(root, outputPath) || outputPath}`);
}
