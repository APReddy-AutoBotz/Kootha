import { describe, expect, it } from "vitest";
import {
  CONTRACT_NAMES,
  buildReleaseManifest,
  evaluateEnvironment,
  evaluateRepository,
  findRuntimeEnvironmentNames,
  findUnclassifiedRuntimeEnvironmentNames,
  migrationProvenance,
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

    const complete = evaluateEnvironment({ mode: "production", env: productionEnvironment });
    expect(complete.ok).toBe(true);
  });

  it("rejects premature enquiry or retention activation", () => {
    for (const name of ["ENQUIRY_INTAKE_ENABLED", "RETENTION_DELETION_ENABLED"]) {
      const result = evaluateEnvironment({
        mode: "production",
        env: { ...productionEnvironment, [name]: "true" },
      });
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

  it("requires telemetry secrets only when telemetry ingest is explicitly enabled", () => {
    const disabled = evaluateEnvironment({ mode: "preview", env: previewEnvironment });
    expect(disabled.ok).toBe(true);

    const missing = evaluateEnvironment({
      mode: "preview",
      env: { ...previewEnvironment, TELEMETRY_INGEST_ENABLED: "true" },
    });
    expect(missing.ok).toBe(false);
    expect(missing.checks.some((item) => item.name === "TELEMETRY_CREDENTIAL_PEPPER" && item.status === "missing")).toBe(true);

    const enabled = evaluateEnvironment({
      mode: "preview",
      env: {
        ...previewEnvironment,
        TELEMETRY_INGEST_ENABLED: "true",
        TELEMETRY_CREDENTIAL_PEPPER: "0123456789abcdef0123456789abcdef",
        TELEMETRY_RATE_LIMIT_KEY: "fedcba9876543210fedcba9876543210",
      },
    });
    expect(enabled.ok).toBe(true);
  });

  it("requires Supabase server authority when a scheduled engine is enabled", () => {
    const result = evaluateEnvironment({
      mode: "preview",
      env: { ...previewEnvironment, M22_RULE_ENGINE_ENABLED: "true" },
    });
    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(expect.objectContaining({
      name: "M22_RULE_ENGINE_ENABLED:SUPABASE_SERVICE_ROLE_KEY",
      status: "missing",
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
    const second = migrationProvenance();
    expect(first.count).toBeGreaterThan(0);
    expect(first).toEqual(second);
    expect(first.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("builds a deterministic secret-free manifest and preserves blocked external truth", () => {
    const evaluation = evaluateEnvironment({ mode: "preview", env: previewEnvironment });
    const migration = migrationProvenance();
    const env = {
      ...previewEnvironment,
      RELEASE_SOURCE_SHA: "abc123",
      SOURCE_DATE_EPOCH: "0",
      SUPABASE_SERVICE_ROLE_KEY: "DO_NOT_LEAK_SERVICE_ROLE",
    };
    const first = buildReleaseManifest({
      mode: "preview",
      configSource: "environment",
      evaluation,
      migration,
      env,
      timestamp: "1970-01-01T00:00:00.000Z",
    });
    const second = buildReleaseManifest({
      mode: "preview",
      configSource: "environment",
      evaluation,
      migration,
      env,
      timestamp: "1970-01-01T00:00:00.000Z",
    });
    expect(first).toEqual(second);
    expect(first.external).toEqual({
      supabase: "blocked-not-run",
      netlifyPreview: "blocked-not-run",
      rollback: "blocked-not-run",
    });
    expect(first.promotionReady).toBe(false);
    expect(JSON.stringify(first)).not.toContain("DO_NOT_LEAK_SERVICE_ROLE");
  });

  it("passes repository policy checks while leaving hosted evidence blocked", () => {
    const result = evaluateRepository({ mode: "production" });
    expect(result.ok).toBe(true);
    expect(result.migration.count).toBeGreaterThan(0);
  });
});
