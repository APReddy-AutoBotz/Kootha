import { describe, expect, it } from "vitest";
import { evaluateEnvironment, findUnsafePublicAuthorityNames } from "../scripts/release-readiness.mjs";

const safePreviewEnvironment = {
  VITE_PRODUCT_NAME: "Kootha",
  VITE_SUPABASE_URL: "https://kootha.supabase.co",
  VITE_SUPABASE_ANON_KEY: "public-anon-value",
  VITE_SENTRY_ENVIRONMENT: "preview",
  VITE_APP_RELEASE: "m29-preview",
  SUPABASE_URL: "https://kootha.supabase.co",
  ENQUIRY_INTAKE_ENABLED: "false",
  RETENTION_DELETION_ENABLED: "false",
};

describe("M29 public environment allowlist", () => {
  it("accepts only the canonical public preview names", () => {
    const result = evaluateEnvironment({ mode: "preview", env: safePreviewEnvironment });
    expect(result.ok).toBe(true);
    expect(findUnsafePublicAuthorityNames(safePreviewEnvironment)).toEqual([]);
  });

  it.each([
    "VITE_API_TOKEN",
    "VITE_DATABASE_PASSWORD",
    "VITE_API_KEY",
    "EXPO_PUBLIC_PRIVATE_KEY",
    "EXPO_PUBLIC_AUTH_TOKEN",
  ])("rejects credential-like public variable %s without exposing its value", (name) => {
    const secretMarker = `DO_NOT_LEAK_${name}`;
    const result = evaluateEnvironment({
      mode: "preview",
      env: { ...safePreviewEnvironment, [name]: secretMarker },
    });

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(expect.objectContaining({
      name,
      severity: "error",
      status: "unsafe_or_unclassified_public_name",
    }));
    expect(JSON.stringify(result)).not.toContain(secretMarker);
  });

  it("fails closed for any future public-prefixed name until it is explicitly classified", () => {
    const result = evaluateEnvironment({
      mode: "preview",
      env: { ...safePreviewEnvironment, VITE_FUTURE_PUBLIC_SETTING: "harmless-looking" },
    });

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(expect.objectContaining({
      name: "VITE_FUTURE_PUBLIC_SETTING",
      status: "unsafe_or_unclassified_public_name",
    }));
  });
});
