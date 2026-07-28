import type { AdapterAuthenticationContextV1 } from "../../../packages/shared/src/physicalTelemetry/contracts";
import {
  constantTimeHexDigestEqual,
  deriveCredentialVerificationHashV1,
} from "./server-crypto";

const PREFIX = "Bearer kt1.";
const IDENTIFIER = /^[A-Za-z0-9_-]+$/;
const SECRET = /^[A-Za-z0-9_-]{43,128}$/;

export interface TelemetryCredentialRecordV1 {
  readonly deviceId: string;
  readonly credentialId: string;
  readonly verificationMaterialHash: string | null;
  readonly eligible: boolean;
}

export interface TelemetryCredentialStoreV1 {
  lookup(
    deviceExternalId: string,
    credentialKeyId: string,
  ): Promise<TelemetryCredentialRecordV1 | undefined>;
  markVerified(credentialId: string, verifiedAt: string): Promise<void>;
}

export type ServerAuthenticationResultV1 =
  | {
      readonly ok: true;
      readonly context: AdapterAuthenticationContextV1 & {
        readonly authenticatedDeviceId: string;
        readonly credentialId: string;
      };
    }
  | {
      readonly ok: false;
      readonly externalReasonCode: "authentication_failed";
      readonly internalReasonCode:
        | "presentation_missing"
        | "presentation_malformed"
        | "credential_unknown"
        | "credential_secret_invalid"
        | "device_ineligible"
        | "verification_update_failed";
    };

function decode(value: string, maximumLength: number): string | undefined {
  if (!IDENTIFIER.test(value) || value.length > maximumLength * 2) {
    return undefined;
  }
  const decoded = Buffer.from(value, "base64url").toString("utf8");
  return decoded.length > 0 &&
    decoded.length <= maximumLength &&
    IDENTIFIER.test(decoded) &&
    Buffer.from(decoded).toString("base64url") === value
    ? decoded
    : undefined;
}

export function parseTelemetryCredentialPresentationV1(
  authorization: string | null,
):
  | {
      readonly deviceExternalId: string;
      readonly credentialKeyId: string;
      readonly bearerSecret: string;
    }
  | undefined {
  if (
    authorization === null ||
    authorization.length > 512 ||
    !authorization.startsWith(PREFIX) ||
    /[\u0000-\u001f\u007f]/.test(authorization)
  ) {
    return undefined;
  }
  const parts = authorization.slice(PREFIX.length).split(".");
  if (parts.length !== 3 || !SECRET.test(parts[2])) return undefined;
  const deviceExternalId = decode(parts[0], 64);
  const credentialKeyId = decode(parts[1], 128);
  return deviceExternalId === undefined || credentialKeyId === undefined
    ? undefined
    : { deviceExternalId, credentialKeyId, bearerSecret: parts[2] };
}

function reject(
  internalReasonCode: Extract<
    ServerAuthenticationResultV1,
    { readonly ok: false }
  >["internalReasonCode"],
): ServerAuthenticationResultV1 {
  return {
    ok: false,
    externalReasonCode: "authentication_failed",
    internalReasonCode,
  };
}

export async function authenticateTelemetryCredentialV1(
  authorization: string | null,
  store: TelemetryCredentialStoreV1,
  pepper: string,
  now: Date,
): Promise<ServerAuthenticationResultV1> {
  const presentation = parseTelemetryCredentialPresentationV1(authorization);
  if (presentation === undefined) {
    return reject(
      authorization === null ? "presentation_missing" : "presentation_malformed",
    );
  }
  const candidateHash = deriveCredentialVerificationHashV1(
    pepper,
    presentation.deviceExternalId,
    presentation.credentialKeyId,
    presentation.bearerSecret,
  );
  const credential = await store.lookup(
    presentation.deviceExternalId,
    presentation.credentialKeyId,
  );
  if (credential === undefined) {
    constantTimeHexDigestEqual(candidateHash, "0".repeat(64));
    return reject("credential_unknown");
  }
  if (
    !constantTimeHexDigestEqual(
      candidateHash,
      credential.verificationMaterialHash ?? "",
    )
  ) {
    return reject("credential_secret_invalid");
  }
  if (!credential.eligible) return reject("device_ineligible");
  try {
    await store.markVerified(credential.credentialId, now.toISOString());
  } catch {
    return reject("verification_update_failed");
  }
  return {
    ok: true,
    context: {
      authenticatedDeviceId: credential.deviceId,
      authenticatedDeviceExternalId: presentation.deviceExternalId,
      authenticationMethod: "bearer_digest",
      credentialKeyId: presentation.credentialKeyId,
      credentialId: credential.credentialId,
    },
  };
}
