const STRICT_UTC_ISO_PATTERN =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/;

/**
 * Parses only real UTC calendar instants. Date.parse alone is insufficient
 * because some runtimes normalize impossible dates such as February 30.
 */
export function parseStrictUtcIsoTimestampV1(
  value: unknown,
): number | undefined {
  if (typeof value !== "string" || value.length > 40) {
    return undefined;
  }
  const match = STRICT_UTC_ISO_PATTERN.exec(value);
  if (match === null) {
    return undefined;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  const normalizedInput = `${match[1]}.${(match[2] ?? "").padEnd(3, "0")}Z`;
  return new Date(parsed).toISOString() === normalizedInput
    ? parsed
    : undefined;
}
