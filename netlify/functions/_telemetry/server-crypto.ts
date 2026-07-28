import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import type { DigestProviderV1 } from "../../../packages/shared/src/physicalTelemetry/identity";

const SHA256_HEX_LENGTH = 64;
const INVALID_DIGEST = "0".repeat(SHA256_HEX_LENGTH);
const CREDENTIAL_DOMAIN = "kootha-telemetry-credential:v1";

export class NodeSha256DigestProviderV1 implements DigestProviderV1 {
  readonly algorithm = "sha256";

  digestUtf8(value: string): string {
    return createHash("sha256").update(value, "utf8").digest("hex");
  }
}

export function createCorrelationId(): string {
  return randomUUID();
}

export function deriveCredentialVerificationHashV1(
  pepper: string,
  deviceExternalId: string,
  credentialKeyId: string,
  bearerSecret: string,
): string {
  const material = [
    CREDENTIAL_DOMAIN,
    deviceExternalId,
    credentialKeyId,
    bearerSecret,
  ].join("\0");
  return createHmac("sha256", pepper).update(material, "utf8").digest("hex");
}

export function constantTimeHexDigestEqual(
  candidateHex: string,
  expectedHex: string,
): boolean {
  const candidateValid = /^[a-f0-9]{64}$/i.test(candidateHex);
  const expectedValid = /^[a-f0-9]{64}$/i.test(expectedHex);
  const candidate = Buffer.from(
    candidateValid ? candidateHex : INVALID_DIGEST,
    "hex",
  );
  const expected = Buffer.from(
    expectedValid ? expectedHex : INVALID_DIGEST,
    "hex",
  );
  return timingSafeEqual(candidate, expected) && candidateValid && expectedValid;
}

export function keyedRequestFingerprintV1(
  value: string,
  key: string,
): string {
  return createHmac("sha256", key).update(value, "utf8").digest("hex");
}
