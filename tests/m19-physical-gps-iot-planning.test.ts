import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";

const repositoryRoot = process.cwd();
const specificationRoot = join(
  repositoryRoot,
  ".kiro",
  "specs",
  "kootha-physical-gps-iot",
);

const requiredFiles = [
  join(specificationRoot, "requirements.md"),
  join(specificationRoot, "design.md"),
  join(specificationRoot, "tasks.md"),
  join(specificationRoot, "implementation-roadmap.md"),
  join(specificationRoot, "decision-register.md"),
  join(
    repositoryRoot,
    "docs",
    "architecture",
    "physical-gps-iot-device-integration.md",
  ),
  join(
    repositoryRoot,
    "docs",
    "planning",
    "m19-physical-gps-iot-implementation-plan.md",
  ),
  join(
    repositoryRoot,
    "docs",
    "security",
    "physical-gps-iot-threat-model.md",
  ),
] as const;

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function combinedPlanningText(): string {
  return requiredFiles.map(read).join("\n");
}

test("M19 includes every required planning deliverable", () => {
  for (const path of requiredFiles) {
    assert.equal(existsSync(path), true, `missing planning deliverable: ${path}`);
    assert.ok(read(path).trim().length > 0, `empty planning deliverable: ${path}`);
  }
});

test("requirements use approved IDs and contain every structured field", () => {
  const requirements = read(join(specificationRoot, "requirements.md"));
  const approvedPrefixes = [
    "DEV-REG",
    "ING-SEC",
    "TEL-NORM",
    "ADAPTER",
    "SIM",
    "WORK-LINK",
    "HEALTH",
    "COMPARE",
    "PRIVACY",
    "ADMIN",
    "CUSTOMER",
    "RETENTION",
    "SCALE",
    "COST",
    "AI-READY",
  ];

  for (const prefix of approvedPrefixes) {
    assert.match(requirements, new RegExp(`### ${prefix}-\\d{3}`));
  }

  const entries = requirements.split(/^### /m).slice(1);
  assert.ok(entries.length >= approvedPrefixes.length);

  for (const entry of entries) {
    for (const field of [
      "Business purpose:",
      "User/actor:",
      "Requirement statement:",
      "Acceptance criteria:",
      "Priority:",
      "Dependencies:",
      "Security/privacy notes:",
      "Device required:",
      "Status:",
    ]) {
      assert.match(
        entry,
        new RegExp(`\\*\\*${field.replace("/", "\\/")}\\*\\*`),
        `missing ${field} in ${entry.slice(0, 40)}`,
      );
    }
    assert.match(entry, /WHEN .+ THEN /s);
    assert.match(entry, /\*\*Status:\*\* Not Started/);
  }
});

test("architecture remains portable and documents all three options", () => {
  const design = read(join(specificationRoot, "design.md"));
  const architecture = read(
    join(
      repositoryRoot,
      "docs",
      "architecture",
      "physical-gps-iot-device-integration.md",
    ),
  );
  const text = `${design}\n${architecture}`;

  assert.match(text, /A — Vendor cloud/i);
  assert.match(text, /B — Direct device/i);
  assert.match(text, /C — Hybrid adapter/i);
  assert.match(text, /IngressHostV1/);
  assert.match(text, /TelemetryAdapterV1/);
  assert.match(text, /CanonicalTelemetryEventV1/);
  assert.match(text, /TelemetryProcessingResultV1/);
  assert.match(text, /Netlify.{0,100}(pilot|low-volume)/is);
  assert.match(text, /(not|never).{0,80}(permanent|mandatory)/is);
  assert.match(text, /always-on HTTP/i);
  assert.match(text, /MQTT/i);
  assert.match(text, /TCP/i);
  assert.match(text, /UDP/i);
  assert.match(text, /vendor-cloud/i);
});

test("live freshness and delayed backfill are independent event-time policies", () => {
  const text = combinedPlanningText();

  assert.match(text, /live_freshness_window/);
  assert.match(text, /delayed_backfill_window/);
  assert.match(text, /two minutes/i);
  assert.match(text, /24 hours/i);
  assert.match(text, /accepted_delayed/);
  assert.match(text, /offline_backfill/);
  assert.match(text, /degraded_freshness/);
  assert.match(text, /actual execution start/i);
  assert.match(text, /actual (?:execution )?(?:end|start and end)/i);
  assert.match(text, /arrives? after End Work|post-End-Work/i);
  assert.match(
    text,
    /captured (during|inside|within).{0,100}(active|valid|execution|work) interval/is,
  );
  assert.match(text, /never.{0,120}(live missing-update|customer live tracking)/is);
});

test("sequence and replay design permits bounded legitimate reordering", () => {
  const text = combinedPlanningText();

  assert.match(text, /stream\/boot epoch/i);
  assert.match(text, /bounded replay\/reordering window/i);
  assert.match(text, /unseen lower sequence/i);
  assert.match(text, /out-of-order/i);
  assert.match(text, /reused sequence/i);
  assert.match(text, /reduced ordering confidence/i);
});

test("M20 stays reviewable and M21 contains a measurable Netlify gate", () => {
  const roadmap = read(join(specificationRoot, "implementation-roadmap.md"));
  const tasks = read(join(specificationRoot, "tasks.md"));
  const text = `${roadmap}\n${tasks}\n${combinedPlanningText()}`;

  assert.match(text, /M20A/);
  assert.match(text, /M20B/);
  assert.match(text, /separate PR/i);
  assert.match(text, /25 devices/i);
  assert.match(text, /15 seconds/i);
  assert.match(text, /60,000/i);
  assert.match(text, /1\.7 events\/second/i);
  assert.match(text, /17 events\/second retry\/burst/i);
  assert.match(text, /repeat batches three times with no duplicates/i);
  assert.match(text, /request\/compute cost/i);
  assert.match(text, /decide whether Netlify remains suitable/i);
  assert.match(text, /migration path/i);
});

test("AI readiness thresholds are provisional and human controlled", () => {
  const text = combinedPlanningText();

  assert.match(text, /4[–-]8 weeks/);
  assert.match(text, /30 reviewed days/);
  assert.match(text, /1,000 reviewed/i);
  assert.match(text, /initial planning assumptions/i);
  assert.match(text, /not contractual or universal/i);
  assert.match(text, /do not mean AI is implemented/i);
  assert.match(text, /human review/i);
  assert.match(text, /No model automatically accuses a driver of fraud/i);
  assert.match(text, /coordinate.{0,30}LLM|LLM.{0,30}coordinate/is);
});

test("M18 remains in progress while M19 is planning-only", () => {
  const ledger = read(
    join(repositoryRoot, ".kiro", "specs", "kootha-prachar-mvp", "tasks.md"),
  );
  const m18 = ledger.match(
    /## Milestone M18[\s\S]*?(?=\n## Milestone M19|\s*$)/,
  )?.[0];
  const m19 = ledger.match(/## Milestone M19[\s\S]*$/)?.[0];

  assert.ok(m18, "M18 ledger section is missing");
  assert.match(m18, /- \[~\] In progress/);
  assert.doesNotMatch(m18, /- \[x\] (?:Passed|Complete|Completed)/i);
  assert.ok(m19, "M19 ledger section is missing");
  assert.match(m19, /Planning\/specification completed/i);
  assert.match(m19, /M18 real-device evidence remains incomplete and in progress/i);
});

test("M19 adds no migration or runtime physical-device artifact", () => {
  const text = combinedPlanningText();
  const migrationDirectory = join(repositoryRoot, "supabase", "migrations");
  const migrations = existsSync(migrationDirectory)
    ? readdirSync(migrationDirectory)
    : [];

  assert.equal(
    migrations.some((name) => /m19|physical[_-]gps|iot[_-]device/i.test(name)),
    false,
    "M19 must not add a migration",
  );
  for (const prohibitedPath of [
    join(repositoryRoot, "netlify", "functions", "device-telemetry.mjs"),
    join(repositoryRoot, "netlify", "functions", "physical-gps.mjs"),
    join(repositoryRoot, "supabase", "functions", "device-telemetry"),
    join(repositoryRoot, "src", "telemetry", "physical-device"),
  ]) {
    assert.equal(
      existsSync(prohibitedPath),
      false,
      `runtime ingestion artifact must not exist: ${prohibitedPath}`,
    );
  }

  assert.match(text, /synthetic (?:route points|data)/i);
  assert.match(text, /No secret-like values, real coordinates/i);
  assert.match(
    text,
    /raw (?:vendor )?payload.{0,30}disabled/is,
  );
  assert.match(
    text,
    /customer live tracking.{0,80}(disabled|out of scope)/is,
  );
  assert.match(text, /Explicit Exclusions[\s\S]*Maps or map provider/i);
  assert.match(text, /no runtime physical-device feature/i);
});
