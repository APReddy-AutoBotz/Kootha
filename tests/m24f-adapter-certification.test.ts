import { describe, expect, it } from "vitest";
import {
  M24F_CERTIFICATION_COMMAND,
  REFERENCE_VENDOR_ADAPTER_ID,
  REFERENCE_VENDOR_CAPABILITY_MANIFEST_V1,
  renderM24fCertificationSummaryV1,
  runM24fAdapterCertificationV1,
} from "../netlify/functions/_m24f/certification";

describe("M24F synthetic adapter certification", () => {
  it("runs the complete synthetic certification matrix without a production claim", () => {
    const result = runM24fAdapterCertificationV1();
    expect(M24F_CERTIFICATION_COMMAND).toBe("test:m24f-adapter-certification");
    expect(result.adapterId).toBe(REFERENCE_VENDOR_ADAPTER_ID);
    expect(result.synthetic).toBe(true);
    expect(result.certificationState).toBe("passed");
    expect(result.failedCount).toBe(0);
    expect(result.scenarioCount).toBeGreaterThanOrEqual(35);
    expect(renderM24fCertificationSummaryV1(result)).toContain("Synthetic-only");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("m24f-synthetic-certification-only");
    expect(serialized).not.toContain("12.9716");
    expect(serialized).not.toContain("77.5946");
  });

  it("keeps the capability manifest bounded and explicitly synthetic", () => {
    expect(REFERENCE_VENDOR_CAPABILITY_MANIFEST_V1.transport.type).toBe("vendor_webhook");
    expect(REFERENCE_VENDOR_CAPABILITY_MANIFEST_V1.authentication.serverOnlySecretRequired).toBe(true);
    expect(REFERENCE_VENDOR_CAPABILITY_MANIFEST_V1.syntheticState).toBe("synthetic_only");
    expect(REFERENCE_VENDOR_CAPABILITY_MANIFEST_V1.certificationLevel).toBe("synthetic_conformance");
  });
});
