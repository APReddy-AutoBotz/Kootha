import type { LiveTrackingNeed, PackageInterest } from "./enquiry";
import type {
  AdWorkAssignmentStatus,
  DriverAvailabilityStatus,
  DriverStatus,
  VehicleGpsDeviceStatus,
  VehicleStatus,
  YesNoNotSure
} from "./statuses";

export interface AssignmentDriverCandidate {
  id: string;
  name: string;
  phone: string;
  city?: string | null;
  serviceAreas?: readonly string[] | null;
  approvalStatus?: string | null;
  onboardingStatus: DriverStatus;
  availabilityStatus: DriverAvailabilityStatus;
}

export interface AssignmentVehicleCandidate {
  id: string;
  vehicleNumber: string;
  vehicleType: string;
  city?: string | null;
  active?: boolean | null;
  onboardingStatus: VehicleStatus;
  micSystemAvailable: boolean;
  gpsDeviceAvailable: YesNoNotSure;
  gpsDeviceStatus: VehicleGpsDeviceStatus;
}

export interface AssignmentAdWorkReadinessInput {
  city?: string | null;
  areasToCover?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  numberOfDays?: number | null;
  packageInterest: PackageInterest;
  liveTrackingRequested: LiveTrackingNeed;
  proofPlanSelected: boolean;
  driverRequired?: boolean;
  vehicleRequired?: boolean;
  speakerRequired?: boolean;
  areasRequired?: boolean;
}

export interface AssignmentReadinessCheck {
  label: string;
  passed: boolean;
  required: boolean;
}

export interface AssignmentReadinessResult {
  status: AdWorkAssignmentStatus;
  ready: boolean;
  checks: AssignmentReadinessCheck[];
  warnings: string[];
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function driverCanBeAssigned(driver: AssignmentDriverCandidate | null | undefined): boolean {
  if (!driver) {
    return false;
  }

  return driver.onboardingStatus === "approved" && (driver.approvalStatus ?? "approved") === "approved";
}

export function vehicleCanBeAssigned(vehicle: AssignmentVehicleCandidate | null | undefined): boolean {
  if (!vehicle) {
    return false;
  }

  return vehicle.onboardingStatus === "approved" && vehicle.active !== false;
}

export function vehicleHasMicSystem(vehicle: AssignmentVehicleCandidate | null | undefined): boolean {
  return Boolean(vehicle?.micSystemAvailable);
}

export function vehicleHasGpsReadiness(vehicle: AssignmentVehicleCandidate | null | undefined): boolean {
  if (!vehicle) {
    return false;
  }

  return vehicle.gpsDeviceAvailable === "yes" || vehicle.gpsDeviceStatus === "planned" || vehicle.gpsDeviceStatus === "installed";
}

export function driverServiceAreaMatches(driver: AssignmentDriverCandidate | null | undefined, areasToCover: string | null | undefined): boolean {
  const normalizedAreas = normalizeText(areasToCover);
  const serviceAreas = driver?.serviceAreas ?? [];

  if (!normalizedAreas || serviceAreas.length === 0) {
    return false;
  }

  return serviceAreas.some((area) => {
    const normalizedArea = normalizeText(area);
    return Boolean(normalizedArea) && (normalizedAreas.includes(normalizedArea) || normalizedArea.includes(normalizedAreas));
  });
}

export function cityMatches(left: string | null | undefined, right: string | null | undefined): boolean {
  const leftCity = normalizeText(left);
  const rightCity = normalizeText(right);
  return Boolean(leftCity && rightCity && leftCity === rightCity);
}

export function buildAssignmentReadiness(input: {
  adWork: AssignmentAdWorkReadinessInput;
  driver?: AssignmentDriverCandidate | null;
  vehicle?: AssignmentVehicleCandidate | null;
  requestedStatus?: AdWorkAssignmentStatus;
}): AssignmentReadinessResult {
  const checks: AssignmentReadinessCheck[] = [
    {
      label: "Planned dates",
      passed: Boolean(input.adWork.startDate),
      required: true
    },
    {
      label: "Areas to cover",
      passed: Boolean(normalizeText(input.adWork.areasToCover)),
      required: input.adWork.areasRequired ?? true
    },
    {
      label: "Approved driver assigned",
      passed: driverCanBeAssigned(input.driver),
      required: input.adWork.driverRequired ?? true
    },
    {
      label: "Approved vehicle assigned",
      passed: vehicleCanBeAssigned(input.vehicle),
      required: input.adWork.vehicleRequired ?? true
    },
    {
      label: "Speaker equipment available",
      passed: vehicleHasMicSystem(input.vehicle),
      required: input.adWork.speakerRequired ?? true
    },
    {
      label: "Package selected",
      passed: input.adWork.packageInterest !== "not_sure",
      required: false
    },
    {
      label: "Proof plan selected",
      passed: input.adWork.proofPlanSelected,
      required: false
    }
  ];

  const warnings: string[] = [];

  if (input.adWork.driverRequired && (!input.driver || input.driver.availabilityStatus === "unknown")) {
    warnings.push("Driver availability is unknown.");
  }

  if (input.vehicle && input.adWork.city && input.vehicle.city && !cityMatches(input.vehicle.city, input.adWork.city)) {
    warnings.push("Vehicle city differs from Ad Work city.");
  }

  if (input.driver && input.adWork.areasToCover && !driverServiceAreaMatches(input.driver, input.adWork.areasToCover)) {
    warnings.push("Driver Service Area does not clearly match Ad Work area.");
  }

  if (input.adWork.liveTrackingRequested === "yes" && !vehicleHasGpsReadiness(input.vehicle)) {
    warnings.push("Premium live tracking request needs Vehicle GPS Device readiness.");
  }

  const ready = checks.every((check) => !check.required || check.passed);

  return {
    status: input.requestedStatus ?? (ready ? "ready_for_execution" : "needs_review"),
    ready,
    checks,
    warnings
  };
}
