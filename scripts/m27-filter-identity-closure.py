from pathlib import Path

ops_path = Path("apps/web/src/admin-operations.tsx")
ops = ops_path.read_text()

old = '  const [result, setResult] = useState<OperationsExportEnvelope | null>(null);\n  const [receipts, setReceipts] = useState<OperationsExportReceipt[]>([]);'
new = '  const [result, setResult] = useState<OperationsExportEnvelope | null>(null);\n  const [resultKey, setResultKey] = useState<string | null>(null);\n  const [receipts, setReceipts] = useState<OperationsExportReceipt[]>([]);'
assert old in ops
ops = ops.replace(old, new, 1)

old = '''  const statuses = statusOptions[scope];
  const supportsCity = scope !== "devices" && scope !== "audit";
  const containsPii = operationsExportScopeContainsPii[scope];

  useEffect(() => {
    requestSequence.current += 1;
    setResult(null);
    setError("");
    setStatus("");
    if (!supportsCity) setCity("");
  }, [scope, format, supportsCity]);
'''
new = '''  const statuses = statusOptions[scope];
  const supportsCity = scope !== "devices" && scope !== "audit";
  const containsPii = operationsExportScopeContainsPii[scope];
  const exportFilterKey = useMemo(() => JSON.stringify({
    scope,
    format,
    search: search.trim(),
    status,
    city: supportsCity ? city.trim() : "",
    dateFrom,
    dateTo,
    limit: normalizeOperationsExportLimit(limit),
  }), [scope, format, search, status, city, supportsCity, dateFrom, dateTo, limit]);
  const exportFilterKeyRef = useRef(exportFilterKey);

  useEffect(() => {
    exportFilterKeyRef.current = exportFilterKey;
    requestSequence.current += 1;
    setResult(null);
    setResultKey(null);
    setError("");
  }, [exportFilterKey]);
'''
assert old in ops
ops = ops.replace(old, new, 1)

old = '''  async function generatePreview() {
    const requestId = ++requestSequence.current;
    setBusy(true);'''
new = '''  async function generatePreview() {
    const requestFilterKey = exportFilterKey;
    const requestId = ++requestSequence.current;
    setBusy(true);'''
assert old in ops
ops = ops.replace(old, new, 1)

old = '''      if (requestId !== requestSequence.current) return;
      if (!validateOperationsExportEnvelope(envelope)) {
        throw new Error("The server returned an invalid governed-export contract.");
      }
      setResult(envelope);
      void loadReceipts();'''
new = '''      if (requestId !== requestSequence.current || requestFilterKey !== exportFilterKeyRef.current) return;
      if (!validateOperationsExportEnvelope(envelope)) {
        throw new Error("The server returned an invalid governed-export contract.");
      }
      setResult(envelope);
      setResultKey(requestFilterKey);
      void loadReceipts();'''
assert old in ops
ops = ops.replace(old, new, 1)

old = '''  return (
    <section className="admin-operations-view" aria-labelledby="operations-export-title">'''
new = '''  const resultIsCurrent = result !== null && resultKey === exportFilterKey;

  return (
    <section className="admin-operations-view" aria-labelledby="operations-export-title">'''
assert old in ops
ops = ops.replace(old, new, 1)

old = '''          <select value={scope} onChange={(event) => setScope(event.target.value as OperationsExportScope)}>'''
new = '''          <select value={scope} onChange={(event) => {
            const nextScope = event.target.value as OperationsExportScope;
            setScope(nextScope);
            setStatus("");
            if (nextScope === "devices" || nextScope === "audit") setCity("");
          }}>'''
assert old in ops
ops = ops.replace(old, new, 1)

old = '''        <button className="secondary-button" type="button" disabled={!result || busy} onClick={() => result && downloadEnvelope(result)}>
          <Download size={18} aria-hidden="true" /> Download current result
        </button>'''
new = '''        <button className="secondary-button" type="button" disabled={!resultIsCurrent || busy} onClick={() => resultIsCurrent && result && downloadEnvelope(result)}>
          <Download size={18} aria-hidden="true" /> Download current result
        </button>'''
assert old in ops
ops = ops.replace(old, new, 1)

old = '''      {result && (
        <section className="form-section">'''
new = '''      {resultIsCurrent && result && (
        <section className="form-section">'''
assert old in ops
ops = ops.replace(old, new, 1)

old = '''  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<AuditEnvelope["nextCursor"]>(null);'''
new = '''  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [recordsKey, setRecordsKey] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<AuditEnvelope["nextCursor"]>(null);'''
assert old in ops
ops = ops.replace(old, new, 1)

old = '''  const normalizedSummary = useMemo(
    () => [actorType, action.trim(), entityType.trim(), search.trim(), dateFrom, dateTo].filter(Boolean).length,
    [actorType, action, entityType, search, dateFrom, dateTo],
  );

  async function loadAudit(append = false) {
    const requestId = ++requestSequence.current;'''
new = '''  const normalizedSummary = useMemo(
    () => [actorType, action.trim(), entityType.trim(), search.trim(), dateFrom, dateTo].filter(Boolean).length,
    [actorType, action, entityType, search, dateFrom, dateTo],
  );
  const auditFilterKey = useMemo(() => JSON.stringify({
    actorType,
    action: action.trim(),
    entityType: entityType.trim(),
    search: search.trim(),
    dateFrom,
    dateTo,
  }), [actorType, action, entityType, search, dateFrom, dateTo]);
  const auditFilterKeyRef = useRef(auditFilterKey);

  useEffect(() => {
    auditFilterKeyRef.current = auditFilterKey;
    requestSequence.current += 1;
    setRecords([]);
    setRecordsKey(null);
    setNextCursor(null);
    setError("");
  }, [auditFilterKey]);

  async function loadAudit(append = false) {
    const requestFilterKey = auditFilterKey;
    if (append && recordsKey !== requestFilterKey) return;
    const requestId = ++requestSequence.current;'''
assert old in ops
ops = ops.replace(old, new, 1)

old = '''      if (requestId !== requestSequence.current) return;
      const page = Array.isArray(envelope.records) ? envelope.records : [];
      setRecords((current) => append ? [...current, ...page] : page);
      setNextCursor(envelope.nextCursor ?? null);'''
new = '''      if (requestId !== requestSequence.current || requestFilterKey !== auditFilterKeyRef.current) return;
      const page = Array.isArray(envelope.records) ? envelope.records : [];
      setRecords((current) => append ? [...current, ...page] : page);
      setRecordsKey(requestFilterKey);
      setNextCursor(envelope.nextCursor ?? null);'''
assert old in ops
ops = ops.replace(old, new, 1)

ops_path.write_text(ops)

shared_path = Path("packages/shared/src/operationsExport.ts")
shared = shared_path.read_text()
old = '''  if (typeof candidate.truncated !== "boolean" || typeof candidate.containsPii !== "boolean") return false;
  if (typeof candidate.generatedAt !== "string" || Number.isNaN(Date.parse(candidate.generatedAt))) return false;'''
new = '''  if (typeof candidate.truncated !== "boolean" || typeof candidate.containsPii !== "boolean") return false;
  if (candidate.containsPii !== operationsExportScopeContainsPii[candidate.scope]) return false;
  if (typeof candidate.generatedAt !== "string" || Number.isNaN(Date.parse(candidate.generatedAt))) return false;'''
assert old in shared
shared = shared.replace(old, new, 1)

old = '''  if (candidate.rows.length !== candidate.rowCount) return false;
  return candidate.rows.every((row) => row && typeof row === "object" && !Array.isArray(row));
}'''
new = '''  if (candidate.rows.length !== candidate.rowCount) return false;
  const allowedColumnSet = new Set(allowedColumns);
  return candidate.rows.every((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return false;
    const keys = Object.keys(row);
    return keys.length === allowedColumns.length
      && keys.every((key) => allowedColumnSet.has(key))
      && allowedColumns.every((column) => Object.prototype.hasOwnProperty.call(row, column));
  });
}'''
assert old in shared
shared = shared.replace(old, new, 1)
shared_path.write_text(shared)

test_path = Path("tests/m27-operations-export.test.ts")
test = test_path.read_text()
start = test.index('  it("accepts only the exact server allowlist for each scope", () => {')
end = test.index('  it("rejects row-count and row-array disagreement", () => {', start)
replacement = '''  it("accepts only exact scope columns, row keys and PII truth", () => {
    const envelope = {
      contractVersion: "m27.operations-export.v1" as const,
      receiptId: "11111111-1111-4111-8111-111111111111",
      scope: "audit" as const,
      format: "json" as const,
      rowCount: 1,
      truncated: false,
      containsPii: false,
      generatedAt: new Date().toISOString(),
      columns: [...operationsExportScopeColumns.audit],
      filters: { searchApplied: false },
      rows: [{
        id: "22222222-2222-4222-8222-222222222222",
        actor_type: "admin",
        action: "example",
        entity_type: "example",
        entity_id: null,
        created_at: new Date().toISOString(),
        safe_details: {},
      }],
    };
    expect(validateOperationsExportEnvelope(envelope)).toBe(true);
    expect(validateOperationsExportEnvelope({ ...envelope, containsPii: true })).toBe(false);
    expect(validateOperationsExportEnvelope({
      ...envelope,
      rows: [{ ...envelope.rows[0], ingest_token_hash: "forbidden" }],
    })).toBe(false);
    expect(validateOperationsExportEnvelope({ ...envelope, columns: [...envelope.columns, "ingest_token_hash"] })).toBe(false);
  });

'''
test = test[:start] + replacement + test[end:]
test_path.write_text(test)

ui_test_path = Path("tests/m27-operations-ui.test.ts")
ui_test = ui_test_path.read_text()
marker = '''  it("request-fences stale export and audit responses", () => {
    expect(operations.match(/requestSequence/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(operations).toContain("requestId !== requestSequence.current");
  });
'''
replacement = marker + '''
  it("binds preview/download and audit records to the currently displayed filter identity", () => {
    expect(operations).toContain("exportFilterKey");
    expect(operations).toContain("resultKey === exportFilterKey");
    expect(operations).toContain("requestFilterKey !== exportFilterKeyRef.current");
    expect(operations).toContain("auditFilterKey");
    expect(operations).toContain("recordsKey !== requestFilterKey");
    expect(operations).toContain("requestFilterKey !== auditFilterKeyRef.current");
  });
'''
assert marker in ui_test
ui_test = ui_test.replace(marker, replacement, 1)
ui_test_path.write_text(ui_test)

print("M27 filter identity and strict envelope closure applied")
