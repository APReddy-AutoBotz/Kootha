import { describe, expect, it } from "vitest";
import { pairM23PointsForTestOracleV1 } from "./m23PairingOracle";

const point = (id: string, capturedAtMilliseconds: number) => ({ id, capturedAtMilliseconds });

describe("M23 pairing v1 independent test oracle", () => {
  it("pairs nearest time in stable order and never reuses a point", () => {
    expect(pairM23PointsForTestOracleV1(
      [point("phone-b", 2_000), point("phone-a", 1_000)],
      [point("physical-b", 2_050), point("physical-a", 950)],
      100,
    )).toEqual([
      { phonePointId: "phone-a", physicalPointId: "physical-a", timeDifferenceMilliseconds: 50 },
      { phonePointId: "phone-b", physicalPointId: "physical-b", timeDifferenceMilliseconds: 50 },
    ]);
  });

  it("uses earlier capture time then stable ID for exact time ties", () => {
    expect(pairM23PointsForTestOracleV1(
      [point("phone-1", 1_000)],
      [point("physical-z", 900), point("physical-a", 1_100), point("physical-b", 1_100)],
      100,
    )).toEqual([{ phonePointId: "phone-1", physicalPointId: "physical-z", timeDifferenceMilliseconds: 100 }]);
    expect(pairM23PointsForTestOracleV1(
      [point("phone-1", 1_000)],
      [point("physical-b", 1_100), point("physical-a", 1_100)],
      100,
    )).toEqual([{ phonePointId: "phone-1", physicalPointId: "physical-a", timeDifferenceMilliseconds: 100 }]);
  });

  it("respects the inclusive window boundary and remains deterministic for large ordered input", () => {
    const phones = Array.from({ length: 2_000 }, (_, index) => point(`phone-${index}`, index * 15_000));
    const physical = Array.from({ length: 2_000 }, (_, index) => point(`physical-${index}`, index * 15_000 + 60_000));
    expect(pairM23PointsForTestOracleV1([point("phone", 0)], [point("physical", 60_000)], 60_000)).toHaveLength(1);
    expect(pairM23PointsForTestOracleV1(phones, physical, 60_000)).toHaveLength(2_000);
    expect(pairM23PointsForTestOracleV1(phones.slice(0, 20), physical.slice(0, 20), 60_000)).toEqual(
      pairM23PointsForTestOracleV1(phones.slice(0, 20), physical.slice(0, 20), 60_000),
    );
  });
});
