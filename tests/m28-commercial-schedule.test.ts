import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCustomerCancellationMessage,
  buildCustomerRescheduleMessage,
  commercialScheduleFingerprint,
  validateCommercialScheduleSnapshot,
  validatePaymentDraft,
} from "../packages/shared/src/commercialSchedule";

const migrationName = readdirSync("supabase/migrations")
  .filter((name) => name.endsWith("_m28_commercial_schedule_operations.sql"))
  .sort()
  .at(-1);

if (!migrationName) {
  throw new Error("M28 generated migration is missing");
}

const migrationSource = readFileSync(`supabase/migrations/${migrationName}`, "utf8");

describe("M28 commercial and schedule contract", () => {
  it("enforces coherent payment states", () => {
    expect(validatePaymentDraft({ paymentStatus: "not_paid", totalAmount: 1000, paidAmount: 0 })).toBeNull();
    expect(validatePaymentDraft({ paymentStatus: "fully_paid", totalAmount: 1000, paidAmount: 1000 })).toBeNull();
    expect(validatePaymentDraft({ paymentStatus: "partially_paid", totalAmount: 1000, paidAmount: 300 })).toBeNull();
    expect(validatePaymentDraft({ paymentStatus: "not_paid", totalAmount: 1000, paidAmount: 1 })).toMatch(/zero/i);
    expect(validatePaymentDraft({ paymentStatus: "fully_paid", totalAmount: 1000, paidAmount: 999 })).toMatch(/equal/i);
    expect(validatePaymentDraft({ paymentStatus: "partially_paid", totalAmount: 1000, paidAmount: 0 })).toMatch(/partial/i);
    expect(validatePaymentDraft({ paymentStatus: "refund_adjustment", totalAmount: 100, paidAmount: 101 })).toMatch(/exceed/i);
    expect(validatePaymentDraft({ paymentStatus: "not_paid", totalAmount: -1, paidAmount: 0 })).toMatch(/negative/i);
  });

  it("keeps customer-safe schedule text free of commercial values and internal notes", () => {
    const reason = "Customer requested a new date";
    const reschedule = buildCustomerRescheduleMessage("Market Campaign", "2026-08-20", "2026-08-22", reason);
    const cancellation = buildCustomerCancellationMessage("Market Campaign", reason);
    for (const message of [reschedule, cancellation]) {
      expect(message).toContain(reason);
      expect(message).not.toContain("₹");
      expect(message).not.toMatch(/paid|payment|balance|internal note/i);
    }
  });

  it("binds state to exact work and independent commercial/schedule versions", () => {
    expect(commercialScheduleFingerprint("work-1", 4, 7)).toBe("work-1:4:7");
    expect(commercialScheduleFingerprint("work-1", 5, 7)).not.toBe(commercialScheduleFingerprint("work-1", 4, 7));
    expect(commercialScheduleFingerprint("work-2", 4, 7)).not.toBe(commercialScheduleFingerprint("work-1", 4, 7));
  });

  it("validates the authoritative snapshot shape", () => {
    const snapshot = {
      adWork: {
        id: "28000000-0000-4000-8000-000000000101",
        title: "M28 work",
        businessName: "Business",
        customerName: "Customer",
        startDate: "2026-08-20",
        endDate: "2026-08-21",
        planningStatus: "planned",
        executionReleaseStatus: "not_released",
        executionOverallStatus: "not_started",
        closureStatus: "not_ready",
        paymentStatus: "not_paid",
        totalAmount: 1000,
        paidAmount: 0,
        balanceAmount: 1000,
        commercialNote: null,
        commercialVersion: 0,
        scheduleVersion: 0,
        cancellationReason: null,
        cancelledAt: null,
      },
      days: [{
        id: "28000000-0000-4000-8000-000000000201",
        workDate: "2026-08-20",
        status: "scheduled",
        planningStatus: "planned",
        executionStatus: "planned",
      }],
      commercialEvents: [],
      scheduleEvents: [],
    };
    expect(validateCommercialScheduleSnapshot(snapshot)).toBe(true);
    expect(validateCommercialScheduleSnapshot({ ...snapshot, adWork: { ...snapshot.adWork, paymentStatus: "paid_somehow" } })).toBe(false);
    expect(validateCommercialScheduleSnapshot({ ...snapshot, adWork: { ...snapshot.adWork, scheduleVersion: -1 } })).toBe(false);
  });

  it("keeps database authority static, versioned and evidence-preserving", () => {
    expect(migrationSource).toContain("admin_update_ad_work_payment_v1");
    expect(migrationSource).toContain("admin_reschedule_ad_work_v1");
    expect(migrationSource).toContain("admin_reschedule_ad_work_day_v1");
    expect(migrationSource).toContain("admin_cancel_ad_work_v1");
    expect(migrationSource).toContain("Commercial record changed; refresh and retry");
    expect(migrationSource).toContain("Schedule changed; refresh and retry");
    expect(migrationSource).toContain("telemetry_receipts");
    expect(migrationSource).toContain("location_points");
    expect(migrationSource).toContain("proof_uploads");
    expect(migrationSource).toContain("execution_proof_notes");
    expect(migrationSource).toContain("execution_release_status = case when execution_release_status = 'released_to_driver' then 'access_revoked'");
    expect(migrationSource).not.toMatch(/execute\s+format/i);
  });

  it("protects commercial history from the general M27 export/audit path", () => {
    expect(migrationSource).toContain("m28_commercial_updated");
    const auditSnippet = migrationSource.match(/values \('admin', v_actor, 'm28_commercial_updated'[\s\S]*?;\n/)?.[0] ?? "";
    expect(auditSnippet).toContain("commercialVersion");
    expect(auditSnippet).not.toMatch(/paidAmount|paymentStatus|totalAmount|paid_amount|payment_status|total_amount/);
  });
});
