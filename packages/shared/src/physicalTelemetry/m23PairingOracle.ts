/**
 * Test oracle only. This is intentionally not used by the runtime or SQL.
 * It independently checks the PostgreSQL m23-pairing-v1 ordering contract.
 */
export interface M23PairingOraclePointV1 {
  readonly id: string;
  readonly capturedAtMilliseconds: number;
}

export interface M23PairingOracleResultV1 {
  readonly phonePointId: string;
  readonly physicalPointId: string;
  readonly timeDifferenceMilliseconds: number;
}

export function pairM23PointsForTestOracleV1(
  phonePoints: readonly M23PairingOraclePointV1[],
  physicalPoints: readonly M23PairingOraclePointV1[],
  windowMilliseconds: number,
): M23PairingOracleResultV1[] {
  if (!Number.isSafeInteger(windowMilliseconds) || windowMilliseconds < 0) {
    throw new Error("Invalid M23 pairing window");
  }
  const phones = [...phonePoints].sort((a, b) =>
    a.capturedAtMilliseconds - b.capturedAtMilliseconds || a.id.localeCompare(b.id));
  const physical = [...physicalPoints].sort((a, b) =>
    a.capturedAtMilliseconds - b.capturedAtMilliseconds || a.id.localeCompare(b.id));
  const used = new Set<string>();
  const pairs: M23PairingOracleResultV1[] = [];
  for (const phone of phones) {
    const candidates = physical
      .filter((point) => !used.has(point.id))
      .map((point) => ({ point, difference: Math.abs(point.capturedAtMilliseconds - phone.capturedAtMilliseconds) }))
      .filter(({ difference }) => difference <= windowMilliseconds)
      .sort((left, right) =>
        left.difference - right.difference
        || left.point.capturedAtMilliseconds - right.point.capturedAtMilliseconds
        || left.point.id.localeCompare(right.point.id));
    const selected = candidates[0];
    if (!selected) continue;
    used.add(selected.point.id);
    pairs.push({
      phonePointId: phone.id,
      physicalPointId: selected.point.id,
      timeDifferenceMilliseconds: selected.difference,
    });
  }
  return pairs;
}
