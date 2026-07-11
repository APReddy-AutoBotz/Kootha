import { describe, expect, it } from "vitest";
import { deriveAdWorkNextAction, getDeliveryMethodRequirements } from "./workflow";

describe("advertisement work delivery requirements", () => {
  it("requires a driver, vehicle, and speaker only for vehicle announcements", () => {
    expect(getDeliveryMethodRequirements("vehicle_announcement")).toMatchObject({ driverRequired: true, vehicleRequired: true, speakerRequired: true });
    expect(getDeliveryMethodRequirements("digital_media")).toMatchObject({ driverRequired: false, vehicleRequired: false, speakerRequired: false, executionMode: "admin_managed" });
  });

  it("derives one next action instead of exposing workflow statuses", () => {
    expect(deriveAdWorkNextAction({
      title: "Market promotion", startDate: "2026-07-15", areasToCover: "Main market", deliveryMethod: "field_promotion",
      requirements: getDeliveryMethodRequirements("field_promotion"), assignmentReady: false, releaseStatus: "not_released",
      dayStatuses: ["planned"], pendingProofCount: 0, closureStatus: "not_ready"
    }).action).toBe("choose_resources");
  });

  it("skips assignment and driver release for team-managed work", () => {
    expect(deriveAdWorkNextAction({
      title: "Digital campaign", startDate: "2026-07-15", areasToCover: "", deliveryMethod: "digital_media",
      requirements: getDeliveryMethodRequirements("digital_media"), assignmentReady: false, releaseStatus: "not_released",
      dayStatuses: ["planned"], pendingProofCount: 0, closureStatus: "not_ready"
    }).action).toBe("start_work");
  });
});
