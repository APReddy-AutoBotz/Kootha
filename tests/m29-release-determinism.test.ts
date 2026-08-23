import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildReleaseManifest,
  evaluateEnvironment,
  migrationProvenance,
  releaseTimestamp,
  sourceProvenance,
} from "../scripts/release-readiness.mjs";

const previewEnvironment = {
  VITE_PRODUCT_NAME: "Kootha",
  VITE_SUPABASE_URL: "https://kootha.supabase.co",
  VITE_SUPABASE_ANON_KEY: "public-anon-value",
  VITE_SENTRY_ENVIRONMENT: "preview",
  VITE_APP_RELEASE: "m29-preview",
  SUPABASE_URL: "https://kootha.supabase.co",
  ENQUIRY_INTAKE_ENABLED: "false",
  RETENTION_DELETION_ENABLED: "false",
};

function git(cwd: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  return execFileSync("git", args, { cwd, encoding: "utf8", env }).trim();
}

describe("M29 deterministic release provenance", () => {
  it("uses canonical checked-out commit time and emits byte-stable default manifests", () => {
    const source = sourceProvenance();
    expect(source.commitTimestamp).toBe(
      new Date(Number(git(process.cwd(), ["show", "-s", "--format=%ct", "HEAD"])) * 1000).toISOString(),
    );
    const args = {
      mode: "preview",
      configSource: "environment",
      evaluation: evaluateEnvironment({ mode: "preview", env: previewEnvironment }),
      migration: migrationProvenance(),
      source,
      env: previewEnvironment,
    };
    const first = buildReleaseManifest(args);
    const second = buildReleaseManifest(args);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.sourceSha).toBe(source.sha);
    expect(first.timestamp).toBe(source.commitTimestamp);
  });

  it("validates explicit reproducible epochs and fails closed on invalid or missing source time", () => {
    expect(releaseTimestamp({ SOURCE_DATE_EPOCH: "0" }, "2001-01-01T00:00:00.000Z"))
      .toBe("1970-01-01T00:00:00.000Z");
    for (const value of ["", "-1", "1.5", "1e3", "not-an-epoch", "8640000000001"]) {
      expect(() => releaseTimestamp({ SOURCE_DATE_EPOCH: value }, "2001-01-01T00:00:00.000Z")).toThrow();
    }
    expect(() => releaseTimestamp({}, undefined)).toThrow(/source provenance/);
    expect(() => buildReleaseManifest({
      mode: "preview",
      configSource: "environment",
      evaluation: evaluateEnvironment({ mode: "preview", env: previewEnvironment }),
      migration: migrationProvenance(),
      source: { ...sourceProvenance(), commitTimestamp: "malformed" },
      env: previewEnvironment,
    })).toThrow(/source timestamp provenance/);
  });

  it("binds distinct commits to distinct SHA and timestamp provenance", () => {
    const root = mkdtempSync(path.join(tmpdir(), "kootha-m29-timestamp-"));
    try {
      git(root, ["init"]);
      git(root, ["config", "user.email", "m29@example.invalid"]);
      git(root, ["config", "user.name", "M29 Test"]);
      const commit = (contents: string, date: string) => {
        writeFileSync(path.join(root, "tracked.txt"), contents, "utf8");
        git(root, ["add", "tracked.txt"]);
        git(root, ["commit", "-m", contents.trim()], {
          ...process.env,
          GIT_AUTHOR_DATE: date,
          GIT_COMMITTER_DATE: date,
        });
        return sourceProvenance({ root });
      };
      const first = commit("first\n", "2001-01-01T00:00:00Z");
      const second = commit("second\n", "2002-01-01T00:00:00Z");
      expect(first.sha).not.toBe(second.sha);
      expect(first.commitTimestamp).toBe("2001-01-01T00:00:00.000Z");
      expect(second.commitTimestamp).toBe("2002-01-01T00:00:00.000Z");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
