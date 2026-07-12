import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  deliveryMethods,
  deriveAdWorkNextAction,
  getDeliveryMethodRequirements
} from "../packages/shared/src";

const adminSource = readFileSync(new URL("../apps/web/src/admin.tsx", import.meta.url), "utf8");
const workflowMigration = readFileSync(new URL("../supabase/migrations/20260711010000_simplified_generic_ad_workflow.sql", import.meta.url), "utf8");
const compatibilityMigration = readFileSync(new URL("../supabase/migrations/20260711020000_flexible_execution_and_closure.sql", import.meta.url), "utf8");
const warningClosureMigration = readFileSync(new URL("../supabase/migrations/20260711030000_warning_only_flexible_closure.sql", import.meta.url), "utf8");
const adminProofMigration = readFileSync(new URL("../supabase/migrations/20260711040000_admin_managed_proof_upload.sql", import.meta.url), "utf8");

describe("generic advertisement work workflow", () => {
  it("supports common delivery methods plus unrestricted custom work", () => {
    expect(deliveryMethods).toEqual([
      "vehicle_announcement",
      "field_promotion",
      "print_placement",
      "digital_media",
      "event_campaign",
      "custom"
    ]);
  });

  it("does not require driver resources for team-managed work", () => {
    const requirements = getDeliveryMethodRequirements("digital_media");
    expect(requirements).toMatchObject({ executionMode: "admin_managed", driverRequired: false, vehicleRequired: false });
    expect(deriveAdWorkNextAction({
      title: "Political media campaign",
      startDate: "2026-07-20",
      deliveryMethod: "digital_media",
      requirements,
      assignmentReady: false,
      releaseStatus: "not_released",
      dayStatuses: ["planned"],
      pendingProofCount: 0,
      closureStatus: "not_ready"
    }).action).toBe("start_work");
  });

  it("uses one guided action and hides manual operational statuses", () => {
    expect(adminSource).toContain("workflow-phase-bar");
    expect(adminSource).toContain("next-action-card");
    expect(adminSource).toContain("Back to all advertisement work");
    expect(adminSource).not.toContain("Assignment status");
    expect(adminSource).not.toContain("Live tracking enabled");
  });

  it("keeps flexible assignment and execution RPCs admin-only", () => {
    const sql = workflowMigration + compatibilityMigration + warningClosureMigration;
    expect(sql).toContain("if not public.is_admin()");
    expect(sql).toContain("alter column vehicle_id drop not null");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain("revoke all on function public.save_ad_work_assignment");
    expect(sql).toContain("revoke all on function public.admin_update_ad_work_day");
    expect(sql).not.toMatch(/grant execute on function public\.(save_ad_work_assignment|admin_update_ad_work_day|close_flexible_ad_work_with_final_summary)[^;]+to anon/i);
  });

  it("allows private admin proof uploads only for team-managed running work", () => {
    expect(adminSource).toContain("Add proof photo");
    expect(adminSource).toContain("request_admin_proof_upload");
    expect(adminProofMigration).toContain("if not public.is_admin()");
    expect(adminProofMigration).toContain("aw.execution_mode = 'admin_managed'");
    expect(adminProofMigration).toContain("bucket_id = 'proof-photos'");
    expect(adminProofMigration).toContain("proof.uploaded_by = auth.uid()");
    expect(adminProofMigration).toContain("set search_path = public");
    expect(adminProofMigration).not.toMatch(/grant execute on function public\.(request_admin_proof_upload|complete_admin_proof_upload)[^;]+to anon/i);
  });

  it("keeps non-driver jobs out of driver Work Code access", () => {
    expect(compatibilityMigration).toContain("aw.execution_mode = 'driver_app'");
    expect(compatibilityMigration).toContain("left join public.vehicles vehicle_record");
    expect(compatibilityMigration).toContain("assignment.status = 'ready_for_execution'");
  });
});
