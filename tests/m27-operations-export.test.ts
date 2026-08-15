import { describe, expect, it } from "vitest";
import {
  neutralizeSpreadsheetFormula,
  operationsExportScopeColumns,
  serializeOperationsCsv,
  serializeOperationsJson,
  validateOperationsExportEnvelope,
} from "../packages/shared/src/operationsExport";

describe("M27 governed operations export contract", () => {
  it("escapes commas, quotes, CR/LF and preserves Unicode", () => {
    const csv = serializeOperationsCsv(
      ["name", "note"],
      [{ name: "రాము, Rao", note: 'Line 1\n"Line 2"' }],
    );
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"రాము, Rao"');
    expect(csv).toContain('"Line 1\n""Line 2"""');
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it.each(["=1+1", "+SUM(A1:A2)", "-2+3", "@cmd", "\tformula", "\rformula"])(
    "neutralizes spreadsheet formula prefix %s",
    (value) => expect(neutralizeSpreadsheetFormula(value)).toBe("'" + value),
  );

  it("serializes structured values as JSON text instead of object coercion", () => {
    const csv = serializeOperationsCsv(["value"], [{ value: ["a", "b"] }]);
    expect(csv).toContain('[""a"",""b""]');
  });

  it("accepts only the exact server allowlist for each scope", () => {
    const envelope = {
      contractVersion: "m27.operations-export.v1" as const,
      receiptId: "11111111-1111-4111-8111-111111111111",
      scope: "devices" as const,
      format: "csv" as const,
      rowCount: 1,
      truncated: false,
      containsPii: false,
      generatedAt: new Date().toISOString(),
      columns: [...operationsExportScopeColumns.devices],
      filters: { searchApplied: false },
      rows: [{
        id: "22222222-2222-4222-8222-222222222222",
        device_code: "D-1",
        status: "active",
      }],
    };
    expect(validateOperationsExportEnvelope(envelope)).toBe(true);
    expect(validateOperationsExportEnvelope({ ...envelope, columns: [...envelope.columns, "ingest_token_hash"] })).toBe(false);
  });

  it("rejects row-count and row-array disagreement", () => {
    const envelope = {
      contractVersion: "m27.operations-export.v1",
      receiptId: "11111111-1111-4111-8111-111111111111",
      scope: "audit",
      format: "json",
      rowCount: 1,
      truncated: false,
      containsPii: false,
      generatedAt: new Date().toISOString(),
      columns: [...operationsExportScopeColumns.audit],
      filters: {},
      rows: [],
    };
    expect(validateOperationsExportEnvelope(envelope)).toBe(false);
  });

  it("keeps JSON downloads self-describing", () => {
    const json = serializeOperationsJson({
      contractVersion: "m27.operations-export.v1",
      receiptId: "11111111-1111-4111-8111-111111111111",
      scope: "audit",
      format: "json",
      rowCount: 0,
      truncated: false,
      containsPii: false,
      generatedAt: "2026-08-15T00:00:00.000Z",
      columns: [...operationsExportScopeColumns.audit],
      filters: {},
      rows: [],
    });
    expect(JSON.parse(json)).toMatchObject({
      contractVersion: "m27.operations-export.v1",
      scope: "audit",
      rows: [],
    });
  });
});
