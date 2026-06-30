import {
  vehicleOwnershipOptions,
  vehicleTypes,
  yesNoNotSureOptions
} from "./statuses";
import type { VehicleOwnership, VehicleType, YesNoNotSure } from "./statuses";
import { isNonEmptyText, isPhoneLike } from "./validation";

export interface DriverApplicationInput {
  driverName: string;
  mobileNumber: string;
  cityTown: string;
  serviceAreas: string;
  vehicleOwnership: VehicleOwnership;
  vehicleType: VehicleType;
  vehicleNumber: string;
  micSystemAvailable: boolean;
  gpsDeviceAvailable: YesNoNotSure;
  preferredWorkingCities: string;
  notes: string;
  consentToContact: boolean;
  companyWebsite?: string;
}

export const initialDriverApplication: DriverApplicationInput = {
  driverName: "",
  mobileNumber: "",
  cityTown: "",
  serviceAreas: "",
  vehicleOwnership: "own_vehicle",
  vehicleType: "auto",
  vehicleNumber: "",
  micSystemAvailable: false,
  gpsDeviceAvailable: "not_sure",
  preferredWorkingCities: "",
  notes: "",
  consentToContact: false,
  companyWebsite: ""
};

const maxLengths = {
  driverName: 100,
  mobileNumber: 20,
  cityTown: 80,
  serviceAreas: 600,
  vehicleNumber: 40,
  preferredWorkingCities: 400,
  notes: 800
} as const;

export function vehicleNumberIsRequired(vehicleOwnership: VehicleOwnership): boolean {
  return vehicleOwnership === "own_vehicle" || vehicleOwnership === "hired_vehicle";
}

export function validateDriverApplication(input: DriverApplicationInput): string[] {
  const errors: string[] = [];

  if (isNonEmptyText(input.companyWebsite)) {
    errors.push("Please leave the hidden field empty.");
  }

  if (!isNonEmptyText(input.driverName)) {
    errors.push("Enter driver name");
  }

  if (!isNonEmptyText(input.mobileNumber)) {
    errors.push("Enter mobile number");
  } else if (!isPhoneLike(input.mobileNumber)) {
    errors.push("Enter valid mobile number");
  }

  if (!isNonEmptyText(input.cityTown)) {
    errors.push("Enter city or town");
  }

  if (!vehicleTypes.includes(input.vehicleType)) {
    errors.push("Choose vehicle type");
  }

  if (!vehicleOwnershipOptions.includes(input.vehicleOwnership)) {
    errors.push("Choose vehicle ownership");
  }

  if (vehicleNumberIsRequired(input.vehicleOwnership) && !isNonEmptyText(input.vehicleNumber)) {
    errors.push("Enter vehicle number");
  }

  if (!yesNoNotSureOptions.includes(input.gpsDeviceAvailable)) {
    errors.push("Choose Vehicle GPS Device answer");
  }

  if (!input.consentToContact) {
    errors.push("Please agree before submitting");
  }

  for (const [fieldName, maxLength] of Object.entries(maxLengths)) {
    const value = input[fieldName as keyof typeof maxLengths];
    if (typeof value === "string" && value.length > maxLength) {
      errors.push(fieldName + " is too long.");
    }
  }

  return errors;
}
