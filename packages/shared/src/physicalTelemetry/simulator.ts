import type { CanonicalTelemetryEventV1 } from "./contracts";

const DEFAULT_INTERVAL_MS = 15_000;
const SYNTHETIC_LATITUDE = 1.2345;
const SYNTHETIC_LONGITUDE = 2.3456;

export interface DeterministicTelemetrySimulatorConfigV1 {
  seed: number;
  startAt: string;
  intervalMs?: number;
  deviceClockOffsetMs?: number;
  networkDelayMs?: number;
  deviceExternalId?: string;
  maximumEventCount?: number;
}

export interface DeterministicTelemetrySimulatorSnapshotV1 {
  running: boolean;
  now: string;
  nextSequence: number;
  queuedEventCount: number;
}

export type SyntheticTelemetrySinkV1 = (event: CanonicalTelemetryEventV1) => void;

/**
 * A manually controlled clock. It intentionally owns no timer and never reads
 * the host clock, which keeps simulator output reproducible in any runtime.
 */
export class VirtualTelemetryClockV1 {
  private currentTimeMs: number;

  public constructor(startAt: string) {
    const parsed = Date.parse(startAt);
    if (!Number.isFinite(parsed)) {
      throw new Error("SIM_INVALID_START_TIME");
    }
    this.currentTimeMs = parsed;
  }

  public nowMs(): number {
    return this.currentTimeMs;
  }

  public now(): string {
    return new Date(this.currentTimeMs).toISOString();
  }

  public set(timeMs: number): void {
    if (!Number.isFinite(timeMs) || timeMs < this.currentTimeMs) {
      throw new Error("SIM_CLOCK_CANNOT_MOVE_BACKWARD");
    }
    this.currentTimeMs = timeMs;
  }

  public advance(durationMs: number): string {
    assertNonNegativeFiniteInteger(durationMs, "SIM_INVALID_ADVANCE");
    this.currentTimeMs += durationMs;
    return this.now();
  }
}

/**
 * Small deterministic generator suitable only for synthetic fixtures. It is
 * not a security or identity primitive.
 */
export class SeededSyntheticGeneratorV1 {
  private state: number;

  public constructor(seed: number) {
    if (!Number.isSafeInteger(seed)) {
      throw new Error("SIM_INVALID_SEED");
    }
    this.state = seed >>> 0;
  }

  public next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }
}

/**
 * Host-neutral simulator with explicit lifecycle and virtual scheduling.
 * Events remain in memory until flush() and are never sent or persisted.
 */
export class DeterministicTelemetrySimulatorV1 {
  private readonly clock: VirtualTelemetryClockV1;
  private readonly random: SeededSyntheticGeneratorV1;
  private readonly intervalMs: number;
  private readonly deviceClockOffsetMs: number;
  private readonly networkDelayMs: number;
  private readonly deviceExternalId: string;
  private readonly seed: number;
  private readonly maximumEventCount?: number;
  private readonly sink?: SyntheticTelemetrySinkV1;
  private readonly queue: CanonicalTelemetryEventV1[] = [];
  private running = false;
  private sequence = 1;
  private nextEmissionAtMs: number | null = null;

  public constructor(
    config: DeterministicTelemetrySimulatorConfigV1,
    sink?: SyntheticTelemetrySinkV1,
  ) {
    assertNonNegativeFiniteInteger(config.intervalMs ?? DEFAULT_INTERVAL_MS, "SIM_INVALID_INTERVAL");
    if ((config.intervalMs ?? DEFAULT_INTERVAL_MS) === 0) {
      throw new Error("SIM_INVALID_INTERVAL");
    }
    assertFiniteInteger(config.deviceClockOffsetMs ?? 0, "SIM_INVALID_CLOCK_OFFSET");
    assertNonNegativeFiniteInteger(config.networkDelayMs ?? 0, "SIM_INVALID_NETWORK_DELAY");
    if (
      config.deviceExternalId !== undefined &&
      !isSyntheticDeviceId(config.deviceExternalId)
    ) {
      throw new Error("SIM_INVALID_DEVICE_ID");
    }
    if (config.maximumEventCount !== undefined) {
      assertNonNegativeFiniteInteger(config.maximumEventCount, "SIM_INVALID_EVENT_COUNT");
    }

    this.seed = config.seed;
    this.clock = new VirtualTelemetryClockV1(config.startAt);
    this.random = new SeededSyntheticGeneratorV1(config.seed);
    this.intervalMs = config.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.deviceClockOffsetMs = config.deviceClockOffsetMs ?? 0;
    this.networkDelayMs = config.networkDelayMs ?? 0;
    this.deviceExternalId = config.deviceExternalId ?? `synthetic-device-${config.seed}`;
    this.maximumEventCount = config.maximumEventCount;
    this.sink = sink;
  }

  public start(): void {
    if (!this.running) {
      this.running = true;
      this.nextEmissionAtMs = this.clock.nowMs();
    }
  }

  public stop(): void {
    this.running = false;
    this.nextEmissionAtMs = null;
  }

  public step(count = 1): readonly CanonicalTelemetryEventV1[] {
    assertNonNegativeFiniteInteger(count, "SIM_INVALID_STEP_COUNT");
    if (!this.running) {
      throw new Error("SIM_NOT_RUNNING");
    }

    const emitted: CanonicalTelemetryEventV1[] = [];
    for (let index = 0; index < count; index += 1) {
      if (this.reachedEventLimit()) {
        this.stop();
        break;
      }
      const dueAt = this.nextEmissionAtMs ?? this.clock.nowMs();
      if (dueAt > this.clock.nowMs()) {
        this.clock.set(dueAt);
      }
      emitted.push(this.emitAt(dueAt));
      this.nextEmissionAtMs = dueAt + this.intervalMs;
    }
    return emitted;
  }

  public advance(durationMs: number): readonly CanonicalTelemetryEventV1[] {
    assertNonNegativeFiniteInteger(durationMs, "SIM_INVALID_ADVANCE");
    const targetTimeMs = this.clock.nowMs() + durationMs;
    const emitted: CanonicalTelemetryEventV1[] = [];

    if (this.running) {
      while (this.nextEmissionAtMs !== null && this.nextEmissionAtMs <= targetTimeMs) {
        if (this.reachedEventLimit()) {
          this.stop();
          break;
        }
        const dueAt = this.nextEmissionAtMs;
        if (dueAt > this.clock.nowMs()) {
          this.clock.set(dueAt);
        }
        emitted.push(this.emitAt(dueAt));
        this.nextEmissionAtMs = dueAt + this.intervalMs;
      }
    }

    this.clock.set(targetTimeMs);
    return emitted;
  }

  public flush(): readonly CanonicalTelemetryEventV1[] {
    const flushed = this.queue.slice();
    this.queue.length = 0;
    return flushed;
  }

  public snapshot(): DeterministicTelemetrySimulatorSnapshotV1 {
    return {
      running: this.running,
      now: this.clock.now(),
      nextSequence: this.sequence,
      queuedEventCount: this.queue.length,
    };
  }

  private emitAt(scheduledAtMs: number): CanonicalTelemetryEventV1 {
    const sequence = this.sequence;
    const coordinateJitter = (this.random.next() - 0.5) * 0.001;
    const capturedAtMs = scheduledAtMs + this.deviceClockOffsetMs;
    const receivedAtMs = scheduledAtMs + this.networkDelayMs;
    const stableSuffix = `${this.seed}-${sequence}`;
    const event: CanonicalTelemetryEventV1 = {
      contractVersion: "1",
      canonicalEventId: `synthetic-canonical-${stableSuffix}`,
      vendorEventId: `synthetic-vendor-${stableSuffix}`,
      idempotencyIdentity: `synthetic-idempotency-${stableSuffix}`,
      deviceExternalId: this.deviceExternalId,
      adapter: { id: "deterministic_simulator", version: "1.0.0" },
      stream: { epoch: `synthetic-epoch-${this.seed}`, sequence },
      capturedAt: new Date(capturedAtMs).toISOString(),
      receivedAt: new Date(receivedAtMs).toISOString(),
      normalizedAt: new Date(receivedAtMs).toISOString(),
      observedClockOffsetMs: this.deviceClockOffsetMs,
      position: {
        latitude: SYNTHETIC_LATITUDE + sequence * 0.0001 + coordinateJitter,
        longitude: SYNTHETIC_LONGITUDE + sequence * 0.0001 - coordinateJitter,
        accuracyMeters: 8,
        speedMetersPerSecond: 24 / 3.6,
        headingDegrees: 45,
        satellites: 9,
      },
      health: {
        heartbeat: true,
        externalPower: true,
        batteryPercent: 88,
        gsmSignalDbm: -72,
        gpsFix: "three_dimensional",
      },
      provenance: {
        source: "simulator",
        normalizationVersion: "1",
        synthetic: true,
        canonicalPayloadHash: `synthetic-payload-${stableSuffix}`,
      },
    };

    this.sequence += 1;
    this.queue.push(event);
    this.sink?.(event);
    return event;
  }
  private reachedEventLimit(): boolean {
    return this.maximumEventCount !== undefined && this.sequence > this.maximumEventCount;
  }
}

function isSyntheticDeviceId(value: string): boolean {
  return (
    value.length <= 128 &&
    /^(?:sim|synthetic)-[A-Za-z0-9._:-]+$/.test(value)
  );
}

function assertFiniteInteger(value: number, reason: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(reason);
  }
}

function assertNonNegativeFiniteInteger(value: number, reason: string): void {
  assertFiniteInteger(value, reason);
  if (value < 0) {
    throw new Error(reason);
  }
}
