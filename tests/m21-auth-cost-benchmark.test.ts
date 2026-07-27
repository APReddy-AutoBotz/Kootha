import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { test } from "vitest";
import {
  authenticateTelemetryCredentialV1,
  type TelemetryCredentialRecordV1,
  type TelemetryCredentialStoreV1,
} from "../netlify/functions/_telemetry/credential-verifier";
import {
  constantTimeHexDigestEqual,
  deriveCredentialVerificationHashV1,
} from "../netlify/functions/_telemetry/server-crypto";

const SYNTHETIC_DEVICE = "synthetic-device-m21-auth-cost";
const SYNTHETIC_KEY = "synthetic-key-m21-auth-cost";
const SYNTHETIC_SECRET = "s".repeat(43);
const SYNTHETIC_INVALID_SECRET = "i".repeat(43);
const SYNTHETIC_PEPPER = "synthetic-local-only-m21-auth-cost-pepper";
const NOW = new Date("2030-01-01T08:00:00.000Z");

interface TimingSummary {
  readonly sampleCount: number;
  readonly elapsedMs: number;
  readonly averageMicroseconds: number;
  readonly p50Microseconds: number;
  readonly p95Microseconds: number;
  readonly p99Microseconds: number;
}

function percentile(sorted: readonly number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function measureSync(sampleCount: number, operation: () => void): TimingSummary {
  const samples: number[] = [];
  const started = performance.now();
  for (let index = 0; index < sampleCount; index += 1) {
    const sampleStarted = performance.now();
    operation();
    samples.push((performance.now() - sampleStarted) * 1_000);
  }
  const elapsedMs = performance.now() - started;
  samples.sort((left, right) => left - right);
  return {
    sampleCount,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    averageMicroseconds: Number(((elapsedMs * 1_000) / sampleCount).toFixed(3)),
    p50Microseconds: Number(percentile(samples, 0.5).toFixed(3)),
    p95Microseconds: Number(percentile(samples, 0.95).toFixed(3)),
    p99Microseconds: Number(percentile(samples, 0.99).toFixed(3)),
  };
}

async function measureAsync(
  sampleCount: number,
  operation: () => Promise<void>,
): Promise<TimingSummary> {
  const samples: number[] = [];
  const started = performance.now();
  for (let index = 0; index < sampleCount; index += 1) {
    const sampleStarted = performance.now();
    await operation();
    samples.push((performance.now() - sampleStarted) * 1_000);
  }
  const elapsedMs = performance.now() - started;
  samples.sort((left, right) => left - right);
  return {
    sampleCount,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    averageMicroseconds: Number(((elapsedMs * 1_000) / sampleCount).toFixed(3)),
    p50Microseconds: Number(percentile(samples, 0.5).toFixed(3)),
    p95Microseconds: Number(percentile(samples, 0.95).toFixed(3)),
    p99Microseconds: Number(percentile(samples, 0.99).toFixed(3)),
  };
}

function presentation(secret: string): string {
  return `Bearer kt1.${Buffer.from(SYNTHETIC_DEVICE).toString("base64url")}.${Buffer.from(SYNTHETIC_KEY).toString("base64url")}.${secret}`;
}

function record(_status: "active" | "rotating"): TelemetryCredentialRecordV1 {
  return {
    deviceId: "00000000-0000-4000-8000-000000000021",
    credentialId: "00000000-0000-4000-8000-000000000022",
    verificationMaterialHash: deriveCredentialVerificationHashV1(
      SYNTHETIC_PEPPER,
      SYNTHETIC_DEVICE,
      SYNTHETIC_KEY,
      SYNTHETIC_SECRET,
    ),
    eligible: true,
  };
}

function storeFor(
  credential: TelemetryCredentialRecordV1,
): TelemetryCredentialStoreV1 {
  return {
    async lookup() {
      return credential;
    },
    async markVerified() {},
  };
}
test("M21 selected authentication mechanism has measured synthetic local cost", async () => {
  const expected = deriveCredentialVerificationHashV1(
    SYNTHETIC_PEPPER,
    SYNTHETIC_DEVICE,
    SYNTHETIC_KEY,
    SYNTHETIC_SECRET,
  );
  const invalid = deriveCredentialVerificationHashV1(
    SYNTHETIC_PEPPER,
    SYNTHETIC_DEVICE,
    SYNTHETIC_KEY,
    SYNTHETIC_INVALID_SECRET,
  );

  const single = measureSync(1, () => {
    const candidate = deriveCredentialVerificationHashV1(
      SYNTHETIC_PEPPER,
      SYNTHETIC_DEVICE,
      SYNTHETIC_KEY,
      SYNTHETIC_SECRET,
    );
    assert.equal(constantTimeHexDigestEqual(candidate, expected), true);
  });
  const sustained = measureSync(60_000, () => {
    constantTimeHexDigestEqual(
      deriveCredentialVerificationHashV1(
        SYNTHETIC_PEPPER,
        SYNTHETIC_DEVICE,
        SYNTHETIC_KEY,
        SYNTHETIC_SECRET,
      ),
      expected,
    );
  });
  const tenTimesBurst = measureSync(12_000, () => {
    constantTimeHexDigestEqual(
      deriveCredentialVerificationHashV1(
        SYNTHETIC_PEPPER,
        SYNTHETIC_DEVICE,
        SYNTHETIC_KEY,
        SYNTHETIC_SECRET,
      ),
      expected,
    );
  });
  const validComparison = measureSync(20_000, () => {
    assert.equal(constantTimeHexDigestEqual(expected, expected), true);
  });
  const invalidComparison = measureSync(20_000, () => {
    assert.equal(constantTimeHexDigestEqual(invalid, expected), false);
  });

  const activeStore = storeFor(record("active"));
  const rotatingStore = storeFor(record("rotating"));
  const activeLookupPath = await measureAsync(5_000, async () => {
    const result = await authenticateTelemetryCredentialV1(
      presentation(SYNTHETIC_SECRET),
      activeStore,
      SYNTHETIC_PEPPER,
      NOW,
    );
    assert.equal(result.ok, true);
  });
  const rotatingLookupPath = await measureAsync(5_000, async () => {
    const result = await authenticateTelemetryCredentialV1(
      presentation(SYNTHETIC_SECRET),
      rotatingStore,
      SYNTHETIC_PEPPER,
      NOW,
    );
    assert.equal(result.ok, true);
  });

  console.log(
    "M21_AUTH_COST_EVIDENCE",
    JSON.stringify(
      {
        algorithm:
          "HMAC-SHA-256 with v1 domain separation and constant-time 32-byte digest comparison",
        environment: {
          runtime: process.version,
          platform: process.platform,
          architecture: process.arch,
        },
        localTimings: {
          single,
          sustainedPilotEquivalent: sustained,
          tenTimesBurstEquivalent: tenTimesBurst,
          validComparison,
          invalidComparison,
          activeCredentialLookupPath: activeLookupPath,
          rotatingCredentialLookupPath: rotatingLookupPath,
        },
        estimatedPilotContribution: {
          verificationsPerDay: 60_000,
          modeledEventsPerSecond: 2,
          note: "Multiply the sustained local average by request count; batching authenticates once per request.",
        },
        conclusion:
          "Supported for the provisional pilot frequency by local CPU-cost evidence; no hosted latency claim.",
      },
      null,
      2,
    ),
  );
}, 60_000);
