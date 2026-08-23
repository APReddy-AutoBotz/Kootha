import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONTRACT_NAMES,
  EXTERNAL_ATTESTATION_REQUIRED,
  buildReleaseManifest,
  evaluateEnvironment,
  evaluateRepository,
  evaluateSourceProvenance,
  findRuntimeEnvironmentNames,
  findUnclassifiedRuntimeEnvironmentNames,
  migrationProvenance,
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

const productionEnvironment = {
  ...previewEnvironment,
  VITE_CONTACT_PHONE: "+910000000000",
  VITE_CONTACT_PHONE_DISPLAY: "+91 00000 00000",
  VITE_TURNSTILE_SITE_KEY: "public-turnstile-site-key",
  VITE_SENTRY_DSN: "https://public@sentry.invalid/1",
  EXPO_PUBLIC_PRODUCT_NAME: "Kootha",
  EXPO_PUBLIC_SUPABASE_URL: "https://kootha.supabase.co",
  EXPO_PUBLIC_SUPABASE_ANON_KEY: "public-anon-value",
  EXPO_PUBLIC_ADMIN_PHONE: "+910000000000",
  EXPO_PUBLIC_SENTRY_DSN: "https://public@sentry.invalid/2",
  EXPO_PUBLIC_SENTRY_ENVIRONMENT: "production",
  EXPO_PUBLIC_APP_RELEASE: "m29-production",
  SUPABASE_SERVICE_ROLE_KEY: "server-only-service-role-value",
  TURNSTILE_SECRET_KEY: "server-only-turnstile-secret",
  ENQUIRY_RATE_LIMIT_SALT: "0123456789abcdef0123456789abcdef",
};

function git(cwd: string, args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function jwtWithRole(role: string) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role })}.test-signature`;
}

describe("M29 hosted release readiness", () => {
  it("accepts the fail-closed preview contract without production-only secrets", () => {
    const result = evaluateEnvironment({ mode: "preview", env: previewEnvironment });
    expect(result.ok).toBe(true);
    expect(result.checks.some((item) => item.name === "SUPABASE_SERVICE_ROLE_KEY" && item.status === "not_required")).toBe(true);
  });

  it("requires the full production configuration and explicit disabled destructive switches", () => {
    const incomplete = evaluateEnvironment({ mode: "production", env: previewEnvironment });
    expect(incomplete.ok).toBe(false);
    expect(incomplete.checks.some((item) => item.name === "SUPABASE_SERVICE_ROLE_KEY" && item.status === "missing")).toBe(true);
    expect(evaluateEnvironment({ mode: "production", env: productionEnvironment }).ok).toBe(true);
  });

  it("rejects premature enquiry or retention activation", () => {
    for (const name of ["ENQUIRY_INTAKE_ENABLED", "RETENTION_DELETION_ENABLED"]) {
      const result = evaluateEnvironment({ mode: "production", env: { ...productionEnvironment, [name]: "true" } });
      expect(result.ok).toBe(false);
      expect(result.checks).toContainEqual(expect.objectContaining({ name, status: "unsafe_enabled", severity: "error" }));
    }
  });

  it("rejects public-prefixed server authority without exposing its value", () => {
    const secretMarker = "DO_NOT_LEAK_THIS_SECRET_MARKER";
    const result = evaluateEnvironment({
      mode: "preview",
      env: { ...previewEnvironment, VITE_SUPABASE_SERVICE_ROLE_KEY: secretMarker },
    });
    expect(result.ok).toBe(false);
    expect(result.checks.some((item) => item.name === "VITE_SUPABASE_SERVICE_ROLE_KEY")).toBe(true);
    expect(JSON.stringify(result)).not.toContain(secretMarker);
  });

  it("rejects privileged server secret values copied into public client variables without disclosure", () => {
    const collisions = [
      ["VITE_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
      ["EXPO_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
      ["VITE_TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"],
    ];

    for (const [publicName, secretName] of collisions) {
      const secretMarker = `DO_NOT_DISCLOSE_${secretName}_VALUE_0123456789`;
      const result = evaluateEnvironment({
        mode: "production",
        env: {
          ...productionEnvironment,
          [secretName]: secretMarker,
          [publicName]: `public-prefix-${secretMarker}-public-suffix`,
        },
      });
      expect(result.ok).toBe(false);
      expect(result.checks).toContainEqual(expect.objectContaining({
        name: `${publicName}:${secretName}`,
        status: "public_value_contains_privileged_server_secret",
        severity: "error",
      }));
      expect(JSON.stringify(result)).not.toContain(secretMarker);
    }
  });

  it("rejects privileged Supabase browser credentials without relying on a server-side copy", () => {
    const privileged = [
      jwtWithRole("service_role"),
      ["sb", "secret", "stale", "rotated", "credential"].join("_"),
      "legacy-service-role-value",
    ];
    for (const publicName of ["VITE_SUPABASE_ANON_KEY", "EXPO_PUBLIC_SUPABASE_ANON_KEY"]) {
      for (const secretMarker of privileged) {
        const result = evaluateEnvironment({
          mode: publicName.startsWith("EXPO_") ? "production" : "preview",
          env: {
            ...(publicName.startsWith("EXPO_") ? productionEnvironment : previewEnvironment),
            [publicName]: secretMarker,
            ...(publicName.startsWith("EXPO_") ? { SUPABASE_SERVICE_ROLE_KEY: "different-current-server-key" } : {}),
          },
        });
        expect(result.ok).toBe(false);
        expect(result.checks).toContainEqual(expect.objectContaining({
          name: publicName,
          status: "privileged_supabase_credential",
        }));
        expect(JSON.stringify(result)).not.toContain(secretMarker);
      }
    }
  });

  it("preserves valid Supabase anon and publishable browser credentials", () => {
    for (const credential of [jwtWithRole("anon"), "sb_publishable_public-client-value"]) {
      expect(evaluateEnvironment({
        mode: "preview",
        env: { ...previewEnvironment, VITE_SUPABASE_ANON_KEY: credential },
      }).ok).toBe(true);
    }
  });

  it("requires valid URLs identifying one Supabase project authority", () => {
    const invalidUrls = [
      "definitely-not-a-url",
      "https://supabase.co",
      "https:///missing-hostname",
      "https://user:pass@kootha.supabase.co",
      "https://kootha.supabase.co:8443",
      "https://kootha.supabase.co/rest/v1",
      "https://kootha.supabase.co?query=yes",
      "https://kootha.supabase.co#fragment",
    ];
    for (const value of invalidUrls) {
      const result = evaluateEnvironment({ mode: "preview", env: { ...previewEnvironment, VITE_SUPABASE_URL: value } });
      expect(result.ok).toBe(false);
      expect(result.checks).toContainEqual(expect.objectContaining({
        name: "VITE_SUPABASE_URL",
        status: "invalid_supabase_project_url",
      }));
    }
    expect(evaluateEnvironment({
      mode: "preview",
      env: { ...previewEnvironment, VITE_SUPABASE_URL: "https://example.com" },
    }).ok).toBe(false);

    const previewSplit = evaluateEnvironment({
      mode: "preview",
      env: { ...previewEnvironment, SUPABASE_URL: "https://another-project.supabase.co" },
    });
    expect(previewSplit.ok).toBe(false);
    expect(previewSplit.checks).toContainEqual(expect.objectContaining({ status: "cross_project_authority" }));

    const productionSplit = evaluateEnvironment({
      mode: "production",
      env: { ...productionEnvironment, EXPO_PUBLIC_SUPABASE_URL: "https://another-project.supabase.co" },
    });
    expect(productionSplit.ok).toBe(false);
    expect(productionSplit.checks).toContainEqual(expect.objectContaining({ status: "cross_project_authority" }));

    expect(evaluateEnvironment({
      mode: "production",
      env: {
        ...productionEnvironment,
        VITE_SUPABASE_URL: "https://KOOTHA.supabase.co/",
        SUPABASE_URL: "https://kootha.supabase.co",
        EXPO_PUBLIC_SUPABASE_URL: "https://kootha.supabase.co/",
      },
    }).ok).toBe(true);
  });

  it("uses the exact lowercase runtime wire values for every feature switch", () => {
    const featureSwitches = [
      "TELEMETRY_INGEST_ENABLED",
      "M22_RULE_ENGINE_ENABLED",
      "M23_COMPARISON_ENGINE_ENABLED",
      "M25_STATISTICAL_ENGINE_ENABLED",
    ];
    const malformedValues = ["TRUE", " true ", "False", " false ", "1"];

    for (const feature of featureSwitches) {
      for (const value of malformedValues) {
        const result = evaluateEnvironment({ mode: "preview", env: { ...previewEnvironment, [feature]: value } });
        expect(result.ok).toBe(false);
        expect(result.checks).toContainEqual(expect.objectContaining({
          name: feature,
          status: "invalid_boolean",
          severity: "error",
        }));
      }

      const disabled = evaluateEnvironment({ mode: "preview", env: { ...previewEnvironment, [feature]: "false" } });
      expect(disabled.ok).toBe(true);
      expect(disabled.checks).toContainEqual(expect.objectContaining({ name: feature, status: "safe_disabled" }));

      const enabled = evaluateEnvironment({
        mode: "preview",
        env: {
          ...previewEnvironment,
          [feature]: "true",
          SUPABASE_SERVICE_ROLE_KEY: "server-only-service-role-value",
          ...(feature === "TELEMETRY_INGEST_ENABLED"
            ? {
                TELEMETRY_CREDENTIAL_PEPPER: "0123456789abcdef0123456789abcdef",
                TELEMETRY_RATE_LIMIT_KEY: "fedcba9876543210fedcba9876543210",
              }
            : {}),
        },
      });
      expect(enabled.ok).toBe(true);
      expect(enabled.checks).toContainEqual(expect.objectContaining({ name: feature, status: "enabled" }));
    }
  });

  it("uses exact fail-closed runtime wire values for intake and retention switches", () => {
    for (const feature of ["ENQUIRY_INTAKE_ENABLED", "RETENTION_DELETION_ENABLED"]) {
      for (const value of ["FALSE", " false ", "TRUE", " true "]) {
        const result = evaluateEnvironment({ mode: "production", env: { ...productionEnvironment, [feature]: value } });
        expect(result.ok).toBe(false);
        expect(result.checks).toContainEqual(expect.objectContaining({ name: feature, status: "invalid_boolean" }));
      }
      expect(evaluateEnvironment({ mode: "production", env: { ...productionEnvironment, [feature]: "false" } }).ok).toBe(true);
    }
  });

  it("requires complete minimum-strength telemetry server authority when telemetry is enabled", () => {
    const missing = evaluateEnvironment({
      mode: "preview",
      env: {
        ...previewEnvironment,
        TELEMETRY_INGEST_ENABLED: "true",
        TELEMETRY_CREDENTIAL_PEPPER: "0123456789abcdef0123456789abcdef",
        TELEMETRY_RATE_LIMIT_KEY: "fedcba9876543210fedcba9876543210",
      },
    });
    expect(missing.ok).toBe(false);
    expect(missing.checks).toContainEqual(expect.objectContaining({
      name: "TELEMETRY_INGEST_ENABLED:SUPABASE_SERVICE_ROLE_KEY",
      status: "missing",
    }));

    const weak = evaluateEnvironment({
      mode: "preview",
      env: {
        ...previewEnvironment,
        TELEMETRY_INGEST_ENABLED: "true",
        SUPABASE_SERVICE_ROLE_KEY: "short",
        TELEMETRY_CREDENTIAL_PEPPER: "0123456789abcdef0123456789abcdef",
        TELEMETRY_RATE_LIMIT_KEY: "fedcba9876543210fedcba9876543210",
      },
    });
    expect(weak.ok).toBe(false);
    expect(weak.checks).toContainEqual(expect.objectContaining({
      name: "TELEMETRY_INGEST_ENABLED:SUPABASE_SERVICE_ROLE_KEY",
      status: "below_minimum_length",
    }));

    const enabled = evaluateEnvironment({
      mode: "preview",
      env: {
        ...previewEnvironment,
        TELEMETRY_INGEST_ENABLED: "true",
        SUPABASE_SERVICE_ROLE_KEY: "server-only-service-role-value",
        TELEMETRY_CREDENTIAL_PEPPER: "0123456789abcdef0123456789abcdef",
        TELEMETRY_RATE_LIMIT_KEY: "fedcba9876543210fedcba9876543210",
      },
    });
    expect(enabled.ok).toBe(true);
  });

  it("requires minimum-strength Supabase server authority when a scheduled engine is enabled", () => {
    const missing = evaluateEnvironment({ mode: "preview", env: { ...previewEnvironment, M22_RULE_ENGINE_ENABLED: "true" } });
    expect(missing.ok).toBe(false);
    expect(missing.checks).toContainEqual(expect.objectContaining({
      name: "M22_RULE_ENGINE_ENABLED:SUPABASE_SERVICE_ROLE_KEY",
      status: "missing",
    }));

    const weak = evaluateEnvironment({
      mode: "preview",
      env: { ...previewEnvironment, M22_RULE_ENGINE_ENABLED: "true", SUPABASE_SERVICE_ROLE_KEY: "short" },
    });
    expect(weak.ok).toBe(false);
    expect(weak.checks).toContainEqual(expect.objectContaining({
      name: "M22_RULE_ENGINE_ENABLED:SUPABASE_SERVICE_ROLE_KEY",
      status: "below_minimum_length",
    }));
  });

  it("keeps runtime environment authority classified so future drift is detected", () => {
    const runtimeNames = findRuntimeEnvironmentNames();
    expect(runtimeNames.length).toBeGreaterThan(0);
    expect(findUnclassifiedRuntimeEnvironmentNames()).toEqual([]);
    for (const name of runtimeNames.filter((name) => !["BASE_URL", "DEV", "MODE", "NODE_ENV", "PROD", "SSR"].includes(name))) {
      expect(CONTRACT_NAMES.has(name)).toBe(true);
    }
  });

  it("computes stable migration provenance", () => {
    const first = migrationProvenance();
    expect(first.count).toBeGreaterThan(0);
    expect(first).toEqual(migrationProvenance());
    expect(first.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("batch-reads tracked migration blobs without changing the canonical fingerprint", () => {
    const root = mkdtempSync(path.join(tmpdir(), "kootha-m29-migration-batch-"));
    const migrations = [
      ["supabase/migrations/20260101000000_first.sql", "select 'first';\n"],
      ["supabase/migrations/20260102000000_second.sql", "select 'second';\n"],
    ] as const;
    try {
      git(root, ["init"]);
      git(root, ["config", "user.email", "m29@example.invalid"]);
      git(root, ["config", "user.name", "M29 Test"]);
      mkdirSync(path.join(root, "supabase", "migrations"), { recursive: true });
      for (const [relative, contents] of migrations) {
        writeFileSync(path.join(root, relative), contents, "utf8");
      }
      git(root, ["add", "supabase/migrations"]);
      git(root, ["commit", "-m", "fake migrations"]);

      const hash = createHash("sha256");
      for (const [relative, contents] of migrations) {
        hash.update(relative);
        hash.update("\0");
        hash.update(contents);
        hash.update("\0");
      }
      expect(migrationProvenance(root)).toEqual({
        count: migrations.length,
        fingerprint: `sha256:${hash.digest("hex")}`,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("binds source provenance to Git HEAD and rejects a mismatched expected SHA", () => {
    const source = sourceProvenance();
    expect(source.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(source.cleanWorktree).toBe(true);
    expect(source.expectedShaMatches).toBe(true);

    const mismatch = evaluateSourceProvenance({ expectedSha: "0".repeat(40) });
    expect(mismatch.ok).toBe(false);
    expect(mismatch.checks).toContainEqual(expect.objectContaining({
      name: "expected-sha",
      status: "expected_sha_mismatch",
    }));
  });

  it("rejects tracked dirty source state", () => {
    const root = mkdtempSync(path.join(tmpdir(), "kootha-m29-source-"));
    try {
      git(root, ["init"]);
      git(root, ["config", "user.email", "m29@example.invalid"]);
      git(root, ["config", "user.name", "M29 Test"]);
      writeFileSync(path.join(root, "tracked.txt"), "clean\n", "utf8");
      git(root, ["add", "tracked.txt"]);
      git(root, ["commit", "-m", "initial"]);
      expect(evaluateSourceProvenance({ root }).ok).toBe(true);
      writeFileSync(path.join(root, "tracked.txt"), "dirty\n", "utf8");
      const dirty = evaluateSourceProvenance({ root });
      expect(dirty.ok).toBe(false);
      expect(dirty.checks).toContainEqual(expect.objectContaining({
        name: "worktree-state",
        status: "dirty_or_untracked_state",
      }));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("derives evidence only from tracked HEAD while rejecting visible untracked inputs", () => {
    const root = mkdtempSync(path.join(tmpdir(), "kootha-m29-untracked-"));
    try {
      git(root, ["init"]);
      git(root, ["config", "user.email", "m29@example.invalid"]);
      git(root, ["config", "user.name", "M29 Test"]);
      mkdirSync(path.join(root, "supabase", "migrations"), { recursive: true });
      mkdirSync(path.join(root, "apps", "web", "src"), { recursive: true });
      writeFileSync(path.join(root, ".gitignore"), "output/\n", "utf8");
      writeFileSync(path.join(root, "supabase", "migrations", "20260101000000_base.sql"), "select 1;\n", "utf8");
      writeFileSync(path.join(root, "apps", "web", "src", "tracked.ts"), "export const product = import.meta.env.VITE_PRODUCT_NAME;\n", "utf8");
      git(root, ["add", ".gitignore", "supabase/migrations/20260101000000_base.sql", "apps/web/src/tracked.ts"]);
      git(root, ["commit", "-m", "initial"]);

      const baselineMigration = migrationProvenance(root);
      const baselineRuntime = findRuntimeEnvironmentNames(root);
      expect(baselineMigration.count).toBe(1);
      expect(baselineRuntime).toEqual(["VITE_PRODUCT_NAME"]);

      mkdirSync(path.join(root, "output"), { recursive: true });
      writeFileSync(path.join(root, "output", "manifest.json"), "{}\n", "utf8");
      expect(evaluateSourceProvenance({ root }).ok).toBe(true);

      writeFileSync(
        path.join(root, ".git", "info", "exclude"),
        "supabase/migrations/20990101000000_ignored.sql\napps/web/src/ignored-runtime.ts\n",
        "utf8",
      );
      writeFileSync(path.join(root, "supabase", "migrations", "20990101000000_ignored.sql"), "select 2;\n", "utf8");
      writeFileSync(path.join(root, "apps", "web", "src", "ignored-runtime.ts"), "export const leaked = process.env.VITE_UNCLASSIFIED_AUTHORITY;\n", "utf8");
      expect(evaluateSourceProvenance({ root }).ok).toBe(true);
      expect(migrationProvenance(root)).toEqual(baselineMigration);
      expect(findRuntimeEnvironmentNames(root)).toEqual(baselineRuntime);

      const visibleMigration = path.join(root, "supabase", "migrations", "20990102000000_visible.sql");
      writeFileSync(visibleMigration, "select 3;\n", "utf8");
      let unsafe = evaluateSourceProvenance({ root });
      expect(unsafe.ok).toBe(false);
      expect(unsafe.checks).toContainEqual(expect.objectContaining({
        name: "worktree-state",
        status: "dirty_or_untracked_state",
      }));
      rmSync(visibleMigration);

      const visibleRuntime = path.join(root, "apps", "web", "src", "visible-runtime.ts");
      writeFileSync(visibleRuntime, "export const authority = process.env.VITE_VISIBLE_AUTHORITY;\n", "utf8");
      unsafe = evaluateSourceProvenance({ root });
      expect(unsafe.ok).toBe(false);
      expect(unsafe.checks).toContainEqual(expect.objectContaining({
        name: "worktree-state",
        status: "dirty_or_untracked_state",
      }));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("cannot self-attest external checks or promotion from plain environment strings", () => {
    const evaluation = evaluateEnvironment({ mode: "preview", env: previewEnvironment });
    const source = sourceProvenance();
    const env = {
      ...previewEnvironment,
      RELEASE_SUPABASE_STATUS: "passed",
      RELEASE_NETLIFY_PREVIEW_STATUS: "passed",
      RELEASE_ROLLBACK_STATUS: "passed",
      SUPABASE_SERVICE_ROLE_KEY: "DO_NOT_LEAK_SERVICE_ROLE",
    };
    const manifest = buildReleaseManifest({
      mode: "preview",
      configSource: "environment",
      evaluation,
      migration: migrationProvenance(),
      source,
      env,
      timestamp: "1970-01-01T00:00:00.000Z",
    });
    expect(manifest.external).toEqual({
      supabase: EXTERNAL_ATTESTATION_REQUIRED,
      netlifyPreview: EXTERNAL_ATTESTATION_REQUIRED,
      rollback: EXTERNAL_ATTESTATION_REQUIRED,
    });
    expect(manifest.promotionReady).toBe(false);
    expect(manifest.promotionDecision).toBe("external-attestation-required");
    expect(JSON.stringify(manifest)).not.toContain("DO_NOT_LEAK_SERVICE_ROLE");
  });

  it("builds deterministic manifest content for the same evaluated source", () => {
    const evaluation = evaluateEnvironment({ mode: "preview", env: previewEnvironment });
    const source = sourceProvenance();
    const args = {
      mode: "preview",
      configSource: "environment",
      evaluation,
      migration: migrationProvenance(),
      source,
      env: previewEnvironment,
      timestamp: "1970-01-01T00:00:00.000Z",
    };
    const first = buildReleaseManifest(args);
    expect(first).toEqual(buildReleaseManifest(args));
    expect(first.sourceSha).toBe(source.sha);
  });

  it("passes repository policy checks while leaving hosted evidence outside local authority", () => {
    const result = evaluateRepository({ mode: "production" });
    expect(result.ok).toBe(true);
    expect(result.migration.count).toBeGreaterThan(0);
  });
});
