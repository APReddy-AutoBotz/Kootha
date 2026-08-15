import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260814100000_m26_network_receipt_canonical_selection.sql",
  "utf8",
);
const acceptance = readFileSync(
  "supabase/tests/m26_commissioning_authority.test.sql",
  "utf8",
);

describe("M26 canonical network receipt selection", () => {
  it("uses validated chronology plus a stable UUID tie-breaker", () => {
    expect(migration).toContain("m26_current_network_validation_receipt_v1");
    expect(migration).toContain("order by x.validated_at desc,x.id desc");
  });

  it("requires evidence to bind to the same canonical current receipt", () => {
    expect(migration).toContain("n.id is distinct from public.m26_current_network_validation_receipt_v1(");
    expect(acceptance).toContain("a second current network receipt with the same validated_at is retained immutably");
    expect(acceptance).toContain("new evidence cannot bind to the non-canonical member of a tied network receipt set");
  });
});
