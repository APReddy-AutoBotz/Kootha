import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "vitest";

const repositoryRoot = process.cwd();
const sharedRoot = join(
  repositoryRoot,
  "packages",
  "shared",
  "src",
  "physicalTelemetry",
);
const planningGuide = join(
  repositoryRoot,
  "docs",
  "planning",
  "m20b-canonical-contracts-deterministic-simulator.md",
);
const physicalGpsTasks = join(
  repositoryRoot,
  ".kiro",
  "specs",
  "kootha-physical-gps-iot",
  "tasks.md",
);
const mvpTasks = join(
  repositoryRoot,
  ".kiro",
  "specs",
  "kootha-prachar-mvp",
  "tasks.md",
);

const requiredImplementationFiles = [
  "contracts.ts",
  "contentIdentity.ts",
  "validation.ts",
  "identity.ts",
  "eventTime.ts",
  "simulator.ts",
  "timestamp.ts",
  "scenarios.ts",
] as const;

const requiredScenarioIds = [
  "healthy-movement",
  "long-stop",
  "missing-heartbeat",
  "duplicate-retry",
  "changed-content-duplicate",
  "out-of-order-event",
  "delayed-offline-backfill",
  "invalid-coordinate",
  "impossible-speed",
  "low-battery",
  "poor-gps",
  "poor-gsm",
  "offline-reconnect",
  "telemetry-before-start-work",
  "telemetry-after-end-work",
  "phone-and-physical-device-together",
  "phone-device-mismatch",
  "approved-sensor-observations",
  "unsupported-sensor-metric",
] as const;

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function listFiles(root: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(root)) {
    if ([".git", ".turbo", "dist", "node_modules"].includes(entry)) {
      continue;
    }
    const path = join(root, entry);
    if (statSync(path).isDirectory()) {
      result.push(...listFiles(path));
    } else {
      result.push(path);
    }
  }
  return result;
}

test("M20B implementation and concise guide exist", () => {
  for (const file of requiredImplementationFiles) {
    assert.equal(existsSync(join(sharedRoot, file)), true, `missing ${file}`);
  }
  assert.equal(existsSync(planningGuide), true, "missing concise M20B guide");
  assert.ok(read(planningGuide).trim().length > 0, "empty M20B guide");
});

test("M20B exports the approved host-neutral contract surface", () => {
  const text = requiredImplementationFiles
    .map((file) => read(join(sharedRoot, file)))
    .join("\n");

  for (const symbol of [
    "IngressHostV1",
    "TelemetryAdapterV1",
    "CanonicalTelemetryEventV1",
    "CanonicalSensorObservationV1",
    "TelemetryProcessingResultV1",
    "validateCanonicalTelemetryEventV1",
    "validateCanonicalSensorObservationV1",
    "canonicalizeIdentityMaterialV1",
    "createCanonicalEventIdentityV1",
    "createCanonicalEventContentIdentityV1",
    "classifyDuplicateIdentityV1",
    "decideCaptureWindowV1",
    "VirtualTelemetryClockV1",
    "DeterministicTelemetrySimulatorV1",
    "requiredTelemetryScenarioIdsV1",
    "createRequiredTelemetryScenariosV1",
  ]) {
    assert.match(text, new RegExp(`\\b${symbol}\\b`), `missing ${symbol}`);
  }

  assert.match(read(join(sharedRoot, "contracts.ts")), /\bunknown\b/);
});

test.each(requiredScenarioIds)(
  "M20B scenario catalog includes %s individually",
  (scenarioId) => {
    const scenarios = read(join(sharedRoot, "scenarios.ts"));
    assert.match(
      scenarios,
      new RegExp(`["']${scenarioId}["']`),
      `missing required scenario ${scenarioId}`,
    );
  },
);

test.each(["M20B-T001", "M20B-T002", "M20B-T003", "M20B-T004"])(
  "M20B task ledger retains %s individually",
  (taskId) => {
    assert.match(read(physicalGpsTasks), new RegExp(`\\b${taskId}\\b`));
  },
);

test("milestone status is honest while the M20B PR is a draft", () => {
  const physicalTasks = read(physicalGpsTasks);
  const mvpLedger = read(mvpTasks);
  const guide = read(planningGuide);
  const statusText = `${physicalTasks}\n${mvpLedger}\n${guide}`;

  assert.match(statusText, /M18[\s\S]{0,300}(incomplete|in progress)/i);
  assert.match(statusText, /M20A[\s\S]{0,100}(complete|completed)/i);
  assert.match(statusText, /M20B[\s\S]{0,200}in progress/i);
  assert.match(statusText, /M20B[\s\S]{0,250}(not complete|not completed)/i);
  assert.match(statusText, /M21 through M26 remain Not Started/i);
  assert.doesNotMatch(mvpLedger, /## Milestone M18[\s\S]{0,200}- \[x\]/i);
});

test("host-neutral shared modules do not import host, framework, or database runtimes", () => {
  const source = requiredImplementationFiles
    .map((file) => read(join(sharedRoot, file)))
    .join("\n");

  assert.doesNotMatch(
    source,
    /from\s+["'](?:node:|react(?:-native)?|expo|@supabase\/|@netlify\/|express|mqtt|net|dgram)/i,
  );
  assert.doesNotMatch(source, /(?:\bas\s+any\b|:\s*any\b|<any>)/);
  assert.doesNotMatch(source, /\b(?:eval|Function)\s*\(/);
});

test("M20B adds no endpoint, migration, persistence, vendor, map, alert, comparison, or AI runtime", () => {
  const repositoryFiles = listFiles(repositoryRoot)
    .map((path) => relative(repositoryRoot, path).replaceAll("\\", "/"))
    .filter((path) => !path.startsWith(".git/"));

  assert.equal(
    repositoryFiles.some(
      (path) =>
        /^supabase\/migrations\/.*(?:m20b|telemetry)/i.test(path) ||
        /^(?:netlify\/functions|supabase\/functions)\/.*telemetr/i.test(path),
    ),
    false,
  );

  const source = requiredImplementationFiles
    .map((file) => read(join(sharedRoot, file)))
    .join("\n");

  for (const forbidden of [
    /\.from\s*\(\s*["']location_points["']/i,
    /\binsert\s+into\s+(?:public\.)?location_points\b/i,
    /\.from\s*\(\s*["']tracking_sessions["']/i,
    /\bcreate\s+tracking\s+session\b/i,
    /\bfetch\s*\(/i,
    /\bWebSocket\s*\(/i,
    /\bSupabaseClient\b/i,
  ]) {
    assert.doesNotMatch(source, forbidden);
  }

  const guide = read(planningGuide);
  for (const nonGoal of [
    "no Supabase migration",
    "telemetry endpoint",
    "location_points",
    "tracking-session creation",
    "vendor adapter",
    "hardware connection",
    "maps",
    "customer live tracking",
    "operational alert runtime",
    "production phone/device comparison",
    "AI runtime",
    "Phone Location Proof",
  ]) {
    assert.match(guide, new RegExp(nonGoal.replace("/", "\\/"), "i"));
  }
});
