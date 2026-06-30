import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const migrationPath = path.resolve(
  "supabase/migrations/20260630000000_m0_foundation.sql"
);
const seedPath = path.resolve("supabase/seed.sql");

describe("M0 Supabase baseline", () => {
  const migrationSql = readFileSync(migrationPath, "utf8");
  const seedSql = readFileSync(seedPath, "utf8");

  it("includes Ongole and Addanki seed data in Supabase SQL", () => {
    const combinedSql = `${migrationSql}\n${seedSql}`;

    expect(combinedSql).toContain("Ongole");
    expect(combinedSql).toContain("Addanki");
  });

  it("defaults customer live sharing to false", () => {
    expect(migrationSql).toMatch(/customer_live_enabled\s+boolean\s+not null\s+default false/i);
  });

  it("defaults proof uploads to customer hidden", () => {
    expect(migrationSql).toMatch(/customer_visible\s+boolean\s+not null\s+default false/i);
  });

  it("enables RLS for business tables without permissive public policies", () => {
    expect(migrationSql).toContain("enable row level security");
    expect(migrationSql.toLowerCase()).not.toContain("create policy");
  });
});
