import { existsSync, readFileSync, renameSync } from "node:fs";
import { spawnSync } from "node:child_process";

const preFixture = readFileSync("supabase/fixtures/m22_upgrade_pre.sql", "utf8");
const postFixture = readFileSync("supabase/fixtures/m22_upgrade_post.sql", "utf8");
const databaseContainer = "supabase_db_kootha-prachar";
const m22Migration =
  "supabase/migrations/20260728010000_m22_tracking_health_deterministic_alerts.sql";
const heldMigration = "supabase/.m22-upgrade-held.sql";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: options.input ? ["pipe", "pipe", "pipe"] : "inherit",
    input: options.input,
    shell: process.platform === "win32",
  });
  if (options.input) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}`);
  }
}

function psql(sql) {
  run(
    "docker",
    ["exec", "-i", databaseContainer, "psql", "-U", "postgres", "-d", "postgres"],
    { input: sql },
  );
}

let failure;
let migrationHeld = false;
try {
  if (existsSync(heldMigration) && !existsSync(m22Migration)) {
    renameSync(heldMigration, m22Migration);
  }
  console.log("Resetting local database to the completed M21 migration...");
  renameSync(m22Migration, heldMigration);
  migrationHeld = true;
  run("supabase", ["db", "reset", "--local", "--no-seed", "--yes"]);
  renameSync(heldMigration, m22Migration);
  migrationHeld = false;
  console.log("Staging representative pre-M22 records...");
  psql(preFixture);
  console.log("Applying pending M22 migrations...");
  run("supabase", ["migration", "up", "--local"]);
  console.log("Verifying M21 and legacy evidence after M22...");
  psql(postFixture);
} catch (error) {
  failure = error;
} finally {
  if (migrationHeld && existsSync(heldMigration)) {
    renameSync(heldMigration, m22Migration);
    migrationHeld = false;
  }
}

if (failure) throw failure;
console.log("M22 representative upgrade test passed.");
