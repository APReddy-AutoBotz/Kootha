import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const operations = readFileSync("apps/web/src/admin-operations.tsx", "utf8");
const admin = readFileSync("apps/web/src/admin.tsx", "utf8");
const shared = readFileSync("packages/shared/src/operationsExport.ts", "utf8");

describe("M27 governed operations UI guardrails", () => {
  it("uses only sanctioned server RPCs for export receipts and audit history", () => {
    expect(operations).toContain('admin_export_operations_v1');
    expect(operations).toContain('admin_list_operations_export_receipts_v1');
    expect(operations).toContain('admin_get_operations_audit_v1');
    expect(operations).not.toContain('/rest/v1/audit_logs?');
  });

  it("request-fences stale export and audit responses", () => {
    expect(operations.match(/requestSequence/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(operations).toContain("requestId !== requestSequence.current");
  });

  it("downloads only a validated authoritative envelope", () => {
    expect(operations).toContain("validateOperationsExportEnvelope");
    expect(operations).toContain("downloadEnvelope(result)");
    expect(operations).toContain("serializeOperationsCsv");
    expect(operations).toContain("serializeOperationsJson");
  });

  it("warns about PII and payload retention boundaries", () => {
    expect(operations).toContain("contains contact PII");
    expect(operations).toContain("Export payloads are never stored in Kootha");
    expect(operations).toContain("coordinates, proof paths and secrets");
  });

  it("does not add forbidden location or proof payload surfaces", () => {
    expect(operations).not.toMatch(/location_points|proof_uploads|file_path|service_role|ingest_token_hash|verification_material_hash/u);
  });

  it("wires Operations and upgraded Activity into the existing admin shell", () => {
    expect(admin).toContain('"operations"');
    expect(admin).toContain('Operations & Exports');
    expect(admin).toContain('<OperationsExportView');
    expect(admin).toContain('<OperationsAuditWorkbench');
  });

  it("neutralizes spreadsheet formulas in the shared CSV serializer", () => {
    expect(shared).toContain("neutralizeSpreadsheetFormula");
    expect(shared).toMatch(/\^\[=\+\\-@\\t\\r\]/u);
  });
});
