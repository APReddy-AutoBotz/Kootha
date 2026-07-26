import type { ValidationResultV1 } from "./validation";

export interface DigestProviderV1 {
  readonly algorithm: string;
  digestUtf8(value: string): string;
}

export interface CanonicalEventIdentityInputV1 {
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly deviceExternalId: string;
  readonly vendorEventId?: string;
  readonly capturedAt: string;
  readonly streamEpoch?: string;
  readonly sequence?: number;
  readonly canonicalPayloadHash: string;
}

export interface CanonicalEventIdentityV1 {
  readonly identityVersion: "1";
  readonly kind: "vendor_event_id" | "derived_payload";
  readonly identity: string;
  readonly canonicalMaterial: string;
}

const MAX_CANONICAL_DEPTH = 16;
const MAX_CANONICAL_NODES = 512;
const MAX_CANONICAL_COLLECTION_ITEMS = 64;
const MAX_CANONICAL_STRING_LENGTH = 1_024;
const MAX_CANONICAL_KEY_LENGTH = 128;
const MAX_CANONICAL_OUTPUT_LENGTH = 65_536;

interface CanonicalizationStateV1 {
  readonly seen: Set<object>;
  nodeCount: number;
}

function canonicalizeValue(
  value: unknown,
  state: CanonicalizationStateV1,
  depth: number,
): string | undefined {
  state.nodeCount += 1;
  if (state.nodeCount > MAX_CANONICAL_NODES || depth > MAX_CANONICAL_DEPTH) {
    return undefined;
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return value.length <= MAX_CANONICAL_STRING_LENGTH
      ? JSON.stringify(value)
      : undefined;
  }
  if (typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? JSON.stringify(value) : undefined;
  }
  if (Array.isArray(value)) {
    const ownPropertyNames = Object.getOwnPropertyNames(value);
    if (
      state.seen.has(value) ||
      value.length > MAX_CANONICAL_COLLECTION_ITEMS ||
      Object.getOwnPropertySymbols(value).length > 0 ||
      ownPropertyNames.length !== value.length + 1 ||
      !ownPropertyNames.includes("length")
    ) {
      return undefined;
    }
    state.seen.add(value);
    const entries: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor === undefined || !("value" in descriptor)) {
        state.seen.delete(value);
        return undefined;
      }
      const canonicalItem = canonicalizeValue(
        descriptor.value,
        state,
        depth + 1,
      );
      if (canonicalItem === undefined) {
        state.seen.delete(value);
        return undefined;
      }
      entries.push(canonicalItem);
    }
    state.seen.delete(value);
    return `[${entries.join(",")}]`;
  }
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const prototype = Object.getPrototypeOf(value);
  const keys = Object.keys(value);
  if (
    (prototype !== Object.prototype && prototype !== null) ||
    state.seen.has(value) ||
    Object.getOwnPropertySymbols(value).length > 0 ||
    keys.length > MAX_CANONICAL_COLLECTION_ITEMS ||
    keys.some((key) => key.length > MAX_CANONICAL_KEY_LENGTH)
  ) {
    return undefined;
  }
  state.seen.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const entries: string[] = [];
  for (const key of keys.sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  )) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) {
      state.seen.delete(value);
      return undefined;
    }
    const canonicalItem = canonicalizeValue(
      descriptor.value,
      state,
      depth + 1,
    );
    if (canonicalItem === undefined) {
      state.seen.delete(value);
      return undefined;
    }
    entries.push(`${JSON.stringify(key)}:${canonicalItem}`);
  }
  state.seen.delete(value);
  return `{${entries.join(",")}}`;
}

export function canonicalizeStableJsonV1(
  value: unknown,
): ValidationResultV1<string> {
  const canonical = canonicalizeValue(
    value,
    { seen: new Set<object>(), nodeCount: 0 },
    0,
  );
  if (
    canonical === undefined ||
    canonical.length > MAX_CANONICAL_OUTPUT_LENGTH
  ) {
    return {
      ok: false,
      issues: [{ path: "$", code: "invalid_value" }],
    };
  }
  return { ok: true, value: canonical };
}

export const canonicalizeIdentityMaterialV1 = canonicalizeStableJsonV1;

function isBoundedText(value: string | undefined, maximumLength: number): boolean {
  return (
    value === undefined ||
    (value.trim().length > 0 && value.length <= maximumLength)
  );
}

export function createCanonicalEventIdentityV1(
  input: CanonicalEventIdentityInputV1,
  digestProvider: DigestProviderV1,
): ValidationResultV1<CanonicalEventIdentityV1> {
  const textFieldsValid =
    isBoundedText(input.adapterId, 64) &&
    isBoundedText(input.adapterVersion, 64) &&
    isBoundedText(input.deviceExternalId, 128) &&
    isBoundedText(input.vendorEventId, 128) &&
    isBoundedText(input.capturedAt, 40) &&
    isBoundedText(input.streamEpoch, 128) &&
    isBoundedText(input.canonicalPayloadHash, 256) &&
    isBoundedText(digestProvider.algorithm, 32);
  const sequenceValid =
    input.sequence === undefined ||
    (Number.isSafeInteger(input.sequence) && input.sequence >= 0);
  if (!textFieldsValid || !sequenceValid) {
    return {
      ok: false,
      issues: [{ path: "$", code: "invalid_value" }],
    };
  }

  const kind =
    input.vendorEventId === undefined ? "derived_payload" : "vendor_event_id";
  const material =
    kind === "vendor_event_id"
      ? {
          identityVersion: "1",
          kind,
          namespace: {
            adapterId: input.adapterId,
            adapterVersion: input.adapterVersion,
            deviceExternalId: input.deviceExternalId,
          },
          vendorEventId: input.vendorEventId,
        }
      : {
          identityVersion: "1",
          kind,
          namespace: {
            adapterId: input.adapterId,
            adapterVersion: input.adapterVersion,
            deviceExternalId: input.deviceExternalId,
          },
          capturedAt: input.capturedAt,
          streamEpoch: input.streamEpoch ?? null,
          sequence: input.sequence ?? null,
          canonicalPayloadHash: input.canonicalPayloadHash,
        };
  const canonical = canonicalizeStableJsonV1(material);
  if (!canonical.ok) {
    return canonical;
  }

  const digest = digestProvider.digestUtf8(canonical.value);
  if (!isBoundedText(digest, 256) || digest === undefined) {
    return {
      ok: false,
      issues: [{ path: "$.digest", code: "invalid_value" }],
    };
  }

  return {
    ok: true,
    value: {
      identityVersion: "1",
      kind,
      identity: `telemetry:v1:${digestProvider.algorithm}:${digest}`,
      canonicalMaterial: canonical.value,
    },
  };
}