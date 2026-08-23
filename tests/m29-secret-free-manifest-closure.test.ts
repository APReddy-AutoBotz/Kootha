import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  buildReleaseManifest,
  evaluateEnvironment,
  migrationProvenance,
  sourceProvenance,
} from "../scripts/release-readiness.mjs";

const previewEnvironment = {
  VITE_PRODUCT_NAME: "Kootha",
  VITE_SUPABASE_URL: "https://kootha.supabase.co",
  VITE_SUPABASE_ANON_KEY: "public-anon-value",
  VITE_SENTRY_ENVIRONMENT: "preview",
  VITE_APP_RELEASE: "environment-release-marker",
  SUPABASE_URL: "https://kootha.supabase.co",
  ENQUIRY_INTAKE_ENABLED: "false",
  RETENTION_DELETION_ENABLED: "false",
};

const privilegedMarker = "server-only-service-role-value-1234567890";

describe("M29 secret-free manifest closure", () => {
  it("rejects direct manifest construction for a failed evaluation", () => {
    const source = sourceProvenance();
    expect(() => buildReleaseManifest({
      mode: "preview",
      configSource: "environment",
      evaluation: { ok: false, errors: 1, warnings: 0, checks: [] },
      migration: migrationProvenance(),
      source,
      env: previewEnvironment,
    })).toThrow(/successful release-readiness evaluation/i);
  });

  it("derives releaseId only from evaluated Git source provenance", () => {
    const evaluation = evaluateEnvironment({ mode: "preview", env: previewEnvironment });
    expect(evaluation.ok).toBe(true);
    const source = sourceProvenance();
    const manifest = buildReleaseManifest({
      mode: "preview",
      configSource: "environment",
      evaluation,
      migration: migrationProvenance(),
      source,
      env: {
        ...previewEnvironment,
        VITE_APP_RELEASE: "DO_NOT_SERIALIZE_THIS_PUBLIC_RELEASE_VALUE",
      },
    });

    expect(manifest.sourceSha).toBe(source.sha);
    expect(manifest.releaseId).toBe(`source-${source.sha}`);
    expect(JSON.stringify(manifest)).not.toContain("DO_NOT_SERIALIZE_THIS_PUBLIC_RELEASE_VALUE");
  });

  it("rejects Vite and Expo release metadata that collides with a server secret without exposing the value", () => {
    for (const publicName of ["VITE_APP_RELEASE", "EXPO_PUBLIC_APP_RELEASE"]) {
      const result = evaluateEnvironment({
        mode: "preview",
        env: {
          ...previewEnvironment,
          SUPABASE_SERVICE_ROLE_KEY: privilegedMarker,
          [publicName]: privilegedMarker,
        },
      });

      expect(result.ok).toBe(false);
      expect(result.checks).toContainEqual(expect.objectContaining({
        name: `${publicName}:SUPABASE_SERVICE_ROLE_KEY`,
        status: "public_value_contains_privileged_server_secret",
        severity: "error",
      }));
      expect(JSON.stringify(result)).not.toContain(privilegedMarker);
    }
  });

  it("emits no manifest file or secret value when CLI environment validation fails", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "kootha-m29-secret-free-"));
    const output = path.join(directory, "rejected-manifest.json");
    try {
      const result = spawnSync(
        process.execPath,
        [
          "scripts/check-release-readiness.mjs",
          "--mode",
          "preview",
          "--config-source",
          "environment",
          "--output",
          output,
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            ...process.env,
            ...previewEnvironment,
            VITE_APP_RELEASE: privilegedMarker,
            SUPABASE_SERVICE_ROLE_KEY: privilegedMarker,
          },
        },
      );

      expect(result.status).toBe(1);
      expect(existsSync(output)).toBe(false);
      expect(`${result.stdout}\n${result.stderr}`).not.toContain(privilegedMarker);
      expect(result.stderr).toContain("configuration check failed");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
