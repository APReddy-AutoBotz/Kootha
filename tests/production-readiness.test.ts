import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("production enquiry boundary", () => {
  const migration = read("supabase/migrations/20260712010000_protected_enquiry_intake.sql");
  const endpoint = read("netlify/functions/enquiries.mjs");

  it("removes direct anonymous inserts and keeps rate limiting server-only", () => {
    expect(migration).toContain('drop policy if exists "Public website can insert enquiries"');
    expect(migration).toContain("revoke insert on public.enquiries from anon");
    expect(migration).toContain("grant execute on function public.consume_public_enquiry_rate_limit");
    expect(migration).not.toMatch(/grant execute[^;]+to (anon|authenticated)/i);
  });

  it("verifies Turnstile, limits input, supports a kill switch, and never returns backend details", () => {
    expect(endpoint).toContain("ENQUIRY_INTAKE_ENABLED");
    expect(endpoint).toContain("MAX_BODY_BYTES");
    expect(endpoint).toContain("siteverify");
    expect(endpoint).toContain("consume_public_enquiry_rate_limit");
    expect(endpoint).not.toContain("console.log");
  });

  it("keeps the privileged key out of browser and driver source", () => {
    expect(read("apps/web/src/PublicWebsite.tsx")).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(read("apps/driver/App.tsx")).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});

describe("production privacy and reliability", () => {
  it("has bilingual legal routes and customer-safe proof wording", () => {
    const legal = read("apps/web/src/LegalPage.tsx");
    expect(legal).toContain("గోప్యతా నోటీసు");
    expect(legal).toContain("Customers do not receive raw coordinates");
    expect(legal).toContain("Background location is not used");
  });

  it("refreshes admin sessions and retries a 401 once", () => {
    const admin = read("apps/web/src/admin.tsx");
    expect(admin).toContain("refreshAdminSession");
    expect(admin).toContain("response.status !== 401");
    expect(admin).toContain("kootha:admin-session-expired");
  });

  it("scrubs telemetry and keeps replay absent", () => {
    const web = read("apps/web/src/telemetry.ts");
    const driver = read("apps/driver/src/telemetry.ts");
    for (const source of [web, driver]) {
      expect(source).toContain("beforeSend");
      expect(source).toContain("beforeBreadcrumb");
      expect(source).not.toMatch(/replay/i);
    }
  });

  it("keeps Android background location absent", () => {
    const app = read("apps/driver/app.json");
    expect(app).toContain("android.permission.ACCESS_FINE_LOCATION");
    expect(app).not.toContain("ACCESS_BACKGROUND_LOCATION");
  });
});
