import type { LiveTrackingNeed, PackageInterest } from "./enquiry";
import type { AdWorkStatus } from "./statuses";

export type PlannedWorkDayStatus = "planned";

export interface EnquiryForAdWorkSeed {
  id: string;
  customerName: string;
  businessName: string;
  mobileNumber: string;
  cityTown: string;
  areasToCover: string;
  advertisementDetails: string;
  packageInterest: PackageInterest;
  liveTrackingNeeded: LiveTrackingNeed;
  preferredDate: string;
  numberOfDays: number;
}

export interface PlannedWorkDay {
  date: string;
  plannedStartTime: string;
  plannedEndTime: string;
  areasToCover: string;
  dayNote: string;
  status: PlannedWorkDayStatus;
}

export interface PlannedAdWorkSeed {
  enquiryId: string;
  customerName: string;
  businessName: string;
  mobileNumber: string;
  cityTown: string;
  title: string;
  advertisementDetails: string;
  packageInterest: PackageInterest;
  liveTrackingRequested: LiveTrackingNeed;
  liveTrackingEnabled: false;
  customerLiveEnabled: false;
  status: AdWorkStatus;
  startDate: string;
  endDate: string;
  numberOfDays: number;
  days: PlannedWorkDay[];
}

export function normalizePlannedDays(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return 1;
  }

  return value;
}

export function addCalendarDays(dateKey: string, daysToAdd: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);

  if (!year || !month || !day) {
    return dateKey;
  }

  const date = new Date(Date.UTC(year, month - 1, day + daysToAdd));
  return date.toISOString().slice(0, 10);
}

export function getPlannedEndDate(startDate: string, numberOfDays: number): string {
  if (!startDate) {
    return "";
  }

  return addCalendarDays(startDate, normalizePlannedDays(numberOfDays) - 1);
}

export function buildPlannedWorkDays(input: {
  startDate: string;
  numberOfDays: number;
  plannedStartTime?: string;
  plannedEndTime?: string;
  areasToCover?: string;
}): PlannedWorkDay[] {
  if (!input.startDate) {
    return [];
  }

  const days = normalizePlannedDays(input.numberOfDays);

  return Array.from({ length: days }, (_, index) => ({
    date: addCalendarDays(input.startDate, index),
    plannedStartTime: input.plannedStartTime ?? "",
    plannedEndTime: input.plannedEndTime ?? "",
    areasToCover: input.areasToCover ?? "",
    dayNote: "",
    status: "planned"
  }));
}

export function createPlannedAdWorkFromEnquiry(enquiry: EnquiryForAdWorkSeed): PlannedAdWorkSeed {
  const numberOfDays = normalizePlannedDays(enquiry.numberOfDays);
  const startDate = enquiry.preferredDate;

  return {
    enquiryId: enquiry.id,
    customerName: enquiry.customerName.trim(),
    businessName: enquiry.businessName.trim(),
    mobileNumber: enquiry.mobileNumber.trim(),
    cityTown: enquiry.cityTown.trim(),
    title: enquiry.businessName.trim() + " Ad Work",
    advertisementDetails: enquiry.advertisementDetails.trim(),
    packageInterest: enquiry.packageInterest,
    liveTrackingRequested: enquiry.liveTrackingNeeded,
    liveTrackingEnabled: false,
    customerLiveEnabled: false,
    status: "planned",
    startDate,
    endDate: getPlannedEndDate(startDate, numberOfDays),
    numberOfDays,
    days: buildPlannedWorkDays({
      startDate,
      numberOfDays,
      areasToCover: enquiry.areasToCover.trim()
    })
  };
}

export function canCreateAdWorkFromEnquiry(
  enquiryId: string,
  existingAdWorks: readonly { enquiryId: string | null }[]
): boolean {
  return !existingAdWorks.some((adWork) => adWork.enquiryId === enquiryId);
}
