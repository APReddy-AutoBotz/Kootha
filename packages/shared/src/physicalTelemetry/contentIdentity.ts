import type { CanonicalTelemetryEventV1 } from "./contracts";
import type { DigestProviderV1 } from "./identity";
import { canonicalizeIdentityMaterialV1 } from "./identity";
import type { ValidationResultV1 } from "./validation";

export interface CanonicalEventContentIdentityV1 {
  readonly contentIdentityVersion: "1";
  readonly identity: string;
  readonly canonicalMaterial: string;
}

export type DuplicateIdentityClassificationV1 =
  | {
      readonly classification: "not_duplicate";
    }
  | {
      readonly classification: "duplicate_identical_content";
      readonly disposition: "duplicate";
    }
  | {
      readonly classification: "duplicate_changed_content";
      readonly disposition: "duplicate_conflict";
    };

/**
 * Receipt/normalization times and generated canonical IDs are intentionally
 * excluded: they may differ between delivery attempts for the same captured
 * device event. All authenticated namespace and measured content remains.
 */
export function createCanonicalEventContentIdentityV1(
  event: CanonicalTelemetryEventV1,
  digestProvider: DigestProviderV1,
): ValidationResultV1<CanonicalEventContentIdentityV1> {
  const canonical = canonicalizeIdentityMaterialV1({
    contentIdentityVersion: "1",
    contractVersion: event.contractVersion,
    vendorEventId: event.vendorEventId ?? null,
    deviceExternalId: event.deviceExternalId,
    adapter: event.adapter,
    stream: event.stream ?? null,
    capturedAt: event.capturedAt,
    observedClockOffsetMs: event.observedClockOffsetMs ?? null,
    position: event.position ?? null,
    health: event.health ?? null,
    observations: event.observations ?? [],
    provenance: event.provenance,
  });
  if (!canonical.ok) {
    return canonical;
  }

  const digest = digestProvider.digestUtf8(canonical.value);
  if (
    digestProvider.algorithm.trim().length === 0 ||
    digestProvider.algorithm.length > 32 ||
    digest.trim().length === 0 ||
    digest.length > 256
  ) {
    return {
      ok: false,
      issues: [{ path: "$.digest", code: "invalid_value" }],
    };
  }

  return {
    ok: true,
    value: {
      contentIdentityVersion: "1",
      identity: `telemetry-content:v1:${digestProvider.algorithm}:${digest}`,
      canonicalMaterial: canonical.value,
    },
  };
}

export function classifyDuplicateIdentityV1(
  knownEventIdentity: string,
  incomingEventIdentity: string,
  knownContentIdentity: string,
  incomingContentIdentity: string,
): DuplicateIdentityClassificationV1 {
  if (knownEventIdentity !== incomingEventIdentity) {
    return { classification: "not_duplicate" };
  }
  if (knownContentIdentity === incomingContentIdentity) {
    return {
      classification: "duplicate_identical_content",
      disposition: "duplicate",
    };
  }
  return {
    classification: "duplicate_changed_content",
    disposition: "duplicate_conflict",
  };
}
