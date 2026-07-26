import { describe, expect, it, vi } from "vitest";
import {
  DeterministicTelemetrySimulatorV1,
  SeededSyntheticGeneratorV1,
  VirtualTelemetryClockV1,
} from "./simulator";

const config = {
  seed: 42,
  startAt: "2030-01-01T08:00:00.000Z",
  intervalMs: 15_000,
  deviceClockOffsetMs: -2_000,
  networkDelayMs: 1_000,
} as const;

describe("DeterministicTelemetrySimulatorV1", () => {
  it("produces byte-for-byte-equivalent output for the same seed and controls", () => {
    const first = new DeterministicTelemetrySimulatorV1(config);
    const second = new DeterministicTelemetrySimulatorV1(config);
    first.start();
    second.start();
    first.advance(30_000);
    second.advance(30_000);

    expect(first.flush()).toEqual(second.flush());
  });

  it("changes the deterministic route when the seed changes", () => {
    const first = new DeterministicTelemetrySimulatorV1(config);
    const second = new DeterministicTelemetrySimulatorV1({ ...config, seed: 43 });
    first.start();
    second.start();

    expect(first.step()[0]?.position?.latitude).not.toBe(second.step()[0]?.position?.latitude);
  });

  it("supports start, step, advance, flush, and stop without real sleeping", () => {
    const sink = vi.fn();
    const simulator = new DeterministicTelemetrySimulatorV1(config, sink);
    simulator.start();

    expect(simulator.step()).toHaveLength(1);
    expect(simulator.advance(30_000)).toHaveLength(2);
    expect(simulator.snapshot()).toMatchObject({
      running: true,
      queuedEventCount: 3,
      nextSequence: 4,
    });
    expect(simulator.flush()).toHaveLength(3);
    expect(simulator.flush()).toEqual([]);
    simulator.stop();
    expect(simulator.advance(60_000)).toEqual([]);
    expect(simulator.snapshot().running).toBe(false);
    expect(sink).toHaveBeenCalledTimes(3);
  });

  it("does not emit before it is started and rejects manual steps while stopped", () => {
    const simulator = new DeterministicTelemetrySimulatorV1(config);
    expect(simulator.advance(60_000)).toEqual([]);
    expect(() => simulator.step()).toThrow("SIM_NOT_RUNNING");
  });

  it("marks every event synthetic and uses no customer, work, driver, or vehicle identifiers", () => {
    const simulator = new DeterministicTelemetrySimulatorV1(config);
    simulator.start();
    const result = simulator.step()[0];
    expect(result?.provenance.synthetic).toBe(true);
    expect(result?.provenance.source).toBe("simulator");
    expect(result?.adapter).toEqual({
      id: "deterministic_simulator",
      version: "1.0.0",
    });
    expect(result?.deviceExternalId).toContain("synthetic");
    expect(result).not.toHaveProperty("customerId");
    expect(result).not.toHaveProperty("workId");
    expect(result).not.toHaveProperty("driverId");
    expect(result).not.toHaveProperty("vehicleId");
  });

  it("applies explicit device-clock offset and network delay", () => {
    const simulator = new DeterministicTelemetrySimulatorV1(config);
    simulator.start();
    const result = simulator.step()[0];
    expect(result?.capturedAt).toBe("2030-01-01T07:59:58.000Z");
    expect(result?.receivedAt).toBe("2030-01-01T08:00:01.000Z");
  });

  it("stops deterministically at the configured event-count bound", () => {
    const simulator = new DeterministicTelemetrySimulatorV1({
      ...config,
      maximumEventCount: 2,
    });
    simulator.start();
    expect(simulator.step(5)).toHaveLength(2);
    expect(simulator.snapshot()).toMatchObject({ running: false, nextSequence: 3 });
    expect(simulator.advance(60_000)).toEqual([]);
  });
  it("validates lifecycle configuration and never permits time reversal", () => {
    expect(() => new DeterministicTelemetrySimulatorV1({ ...config, intervalMs: 0 })).toThrow("SIM_INVALID_INTERVAL");
    expect(() => new DeterministicTelemetrySimulatorV1({ ...config, networkDelayMs: -1 })).toThrow("SIM_INVALID_NETWORK_DELAY");
    expect(() =>
      new DeterministicTelemetrySimulatorV1({
        ...config,
        deviceExternalId: "production-device-1",
      }),
    ).toThrow("SIM_INVALID_DEVICE_ID");
    const clock = new VirtualTelemetryClockV1(config.startAt);
    expect(() => clock.set(clock.nowMs() - 1)).toThrow("SIM_CLOCK_CANNOT_MOVE_BACKWARD");
  });

  it("uses a reproducible seeded generator intended only for fixtures", () => {
    const first = new SeededSyntheticGeneratorV1(7);
    const second = new SeededSyntheticGeneratorV1(7);
    expect([first.next(), first.next(), first.next()]).toEqual([
      second.next(),
      second.next(),
      second.next(),
    ]);
  });
});
