import { paymentStatuses } from "./statuses";

export type PaymentStatus = (typeof paymentStatuses)[number];

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  not_paid: "Not Paid",
  advance_paid: "Advance Paid",
  partially_paid: "Partially Paid",
  fully_paid: "Fully Paid",
  refund_adjustment: "Refund / Adjustment",
};

export type CommercialScheduleDay = {
  id: string;
  workDate: string;
  status: string;
  planningStatus: string;
  executionStatus: string;
};

export type CommercialEvent = {
  id: string;
  paymentStatus: PaymentStatus;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  note: string | null;
  version: number;
  createdAt: string;
};

export type ScheduleEvent = {
  id: string;
  eventType: "ad_work_rescheduled" | "day_rescheduled" | "ad_work_cancelled";
  adWorkDayId: string | null;
  fromStartDate: string | null;
  fromEndDate: string | null;
  toStartDate: string | null;
  toEndDate: string | null;
  reason: string;
  customerMessage: string;
  version: number;
  createdAt: string;
};

export type CommercialScheduleSnapshot = {
  adWork: {
    id: string;
    title: string;
    businessName: string | null;
    customerName: string | null;
    startDate: string | null;
    endDate: string | null;
    planningStatus: string;
    executionReleaseStatus: string;
    executionOverallStatus: string;
    closureStatus: string;
    paymentStatus: PaymentStatus;
    totalAmount: number;
    paidAmount: number;
    balanceAmount: number;
    commercialNote: string | null;
    commercialVersion: number;
    scheduleVersion: number;
    cancellationReason: string | null;
    cancelledAt: string | null;
  };
  days: CommercialScheduleDay[];
  commercialEvents: CommercialEvent[];
  scheduleEvents: ScheduleEvent[];
};

export type PaymentDraft = {
  paymentStatus: PaymentStatus;
  totalAmount: number;
  paidAmount: number;
};

export function validatePaymentDraft(draft: PaymentDraft): string | null {
  if (!Number.isFinite(draft.totalAmount) || !Number.isFinite(draft.paidAmount)) {
    return "Amounts must be valid numbers.";
  }
  if (draft.totalAmount < 0 || draft.paidAmount < 0) {
    return "Amounts cannot be negative.";
  }
  if (draft.paidAmount > draft.totalAmount) {
    return "Paid amount cannot exceed total amount.";
  }
  if (draft.paymentStatus === "not_paid" && draft.paidAmount !== 0) {
    return "Not Paid requires a paid amount of zero.";
  }
  if ((draft.paymentStatus === "advance_paid" || draft.paymentStatus === "partially_paid")
    && !(draft.totalAmount > 0 && draft.paidAmount > 0 && draft.paidAmount < draft.totalAmount)) {
    return `${paymentStatusLabels[draft.paymentStatus]} requires a positive partial payment below the total.`;
  }
  if (draft.paymentStatus === "fully_paid"
    && !(draft.totalAmount > 0 && draft.paidAmount === draft.totalAmount)) {
    return "Fully Paid requires paid amount to equal a positive total amount.";
  }
  return null;
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function commercialScheduleFingerprint(
  adWorkId: string,
  commercialVersion: number,
  scheduleVersion: number,
): string {
  return `${adWorkId}:${commercialVersion}:${scheduleVersion}`;
}

export function buildCustomerRescheduleMessage(
  title: string,
  fromDate: string,
  toDate: string,
  reason: string,
): string {
  return `Kootha update: ${title} has been rescheduled from ${fromDate} to ${toDate}. Reason: ${reason}. Please contact us if you need any clarification.`;
}

export function buildCustomerCancellationMessage(title: string, reason: string): string {
  return `Kootha update: ${title} has been cancelled. Reason: ${reason}. Please contact us if you would like to plan a new date.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPaymentStatus(value: unknown): value is PaymentStatus {
  return typeof value === "string" && (paymentStatuses as readonly string[]).includes(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function validateCommercialScheduleSnapshot(value: unknown): value is CommercialScheduleSnapshot {
  if (!isRecord(value) || !isRecord(value.adWork)) return false;
  const work = value.adWork;
  if (typeof work.id !== "string" || work.id.length < 10 || typeof work.title !== "string") return false;
  if (!isPaymentStatus(work.paymentStatus)) return false;
  if (!isFiniteNumber(work.totalAmount) || !isFiniteNumber(work.paidAmount) || !isFiniteNumber(work.balanceAmount)) return false;
  if (!Number.isInteger(work.commercialVersion) || Number(work.commercialVersion) < 0) return false;
  if (!Number.isInteger(work.scheduleVersion) || Number(work.scheduleVersion) < 0) return false;
  if (!Array.isArray(value.days) || !Array.isArray(value.commercialEvents) || !Array.isArray(value.scheduleEvents)) return false;
  return value.days.every((day) => isRecord(day)
      && typeof day.id === "string"
      && typeof day.workDate === "string"
      && typeof day.planningStatus === "string"
      && typeof day.executionStatus === "string")
    && value.commercialEvents.every((event) => isRecord(event)
      && typeof event.id === "string"
      && isPaymentStatus(event.paymentStatus)
      && isFiniteNumber(event.totalAmount)
      && isFiniteNumber(event.paidAmount)
      && isFiniteNumber(event.balanceAmount)
      && Number.isInteger(event.version))
    && value.scheduleEvents.every((event) => isRecord(event)
      && typeof event.id === "string"
      && ["ad_work_rescheduled", "day_rescheduled", "ad_work_cancelled"].includes(String(event.eventType))
      && typeof event.reason === "string"
      && typeof event.customerMessage === "string"
      && Number.isInteger(event.version));
}
