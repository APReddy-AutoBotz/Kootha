import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { test } from "vitest";

const root = process.cwd();
const isM24fM25Scope = (path: string) => /(?:m24f|m25|admin-intelligence)/i.test(path);

test("M21 changed implementation stays inside the approved HTTP telemetry scope", () => {
  const changed = execFileSync(
    "git",
    ["ls-files", "--modified", "--others", "--exclude-standard"],
    { cwd: root, encoding: "utf8" },
  )
    .split(/\r?\n/)
    .filter(Boolean)
    .map((path) => path.replaceAll("\\", "/"));

  for (const path of changed) {
    if (isM24fM25Scope(path)) continue;
    assert.doesNotMatch(path, /(?:^|\/)(?:ios|customer-app|pwa)(?:\/|$)/i);
    assert.doesNotMatch(path, /(?:mqtt|udp|tcp).*(?:listener|gateway)/i);
    assert.doesNotMatch(path, /(?:vendor).*(?:adapter)/i);
    assert.doesNotMatch(path, /(?:map|route).*(?:component|screen|view)/i);
    assert.doesNotMatch(path, /(?:alert-engine|fraud|machine-learning|haversine)/i);
  }
});

test("M21 runtime sources add no forbidden protocol, alert, comparison, map, or AI implementation", () => {
  const changed = execFileSync(
    "git",
    ["ls-files", "--modified", "--others", "--exclude-standard"],
    { cwd: root, encoding: "utf8" },
  )
    .split(/\r?\n/)
    .filter((path) => /\.(?:ts|tsx|mjs|sql)$/.test(path))
    .filter((path) => !/^(?:tests|scripts)\//.test(path.replaceAll("\\", "/")))
    .filter((path) => !isM24fM25Scope(path))
    .filter((path) => !/(?:^|\/)m23(?:-|\/|\.)/i.test(path.replaceAll("\\", "/")));

  const source = changed
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");

  assert.doesNotMatch(source, /\b(?:mqtt|dgram|udp4|udp6)\b/i);
  assert.doesNotMatch(source, /\b(?:haversine|fraud classification|machine learning|LLM)\b/i);
  assert.doesNotMatch(source, /\bcreate\s+(?:operational\s+)?alert\b/i);
  assert.doesNotMatch(source, /\bcustomer_live_enabled\s*=\s*true\b/i);
});

test("M21 evidence explicitly remains local-only", () => {
  const guide = readFileSync(
    "docs/planning/m21-generic-secure-http-telemetry-ingestion.md",
    "utf8",
  );
  assert.match(guide, /local-only/i);
  assert.match(guide, /no hosted Supabase migration/i);
  assert.match(guide, /no Netlify deployment/i);
  assert.match(guide, /M21 is Completed/i);
  assert.match(guide, /M22.*Completed/i);
  assert.match(guide, /M23 are Completed/i);
  assert.match(guide, /M24F\/M25 are In Progress/i);
  assert.match(guide, /original M24 remains AP-gated/i);
  assert.match(guide, /M26 remains Not Started/i);
});
