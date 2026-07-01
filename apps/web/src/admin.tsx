import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  adWorkAssignmentStatusOptions,
  adWorkExecutionDayStatusOptions,
  adWorkStatusOptions,
  buildAssignmentReadiness,
  buildExecutionReleaseReadiness,
  businessLabels,
  customerUpdateSharingMethodOptions,
  driverCanBeAssigned,
  driverApplicationStatusOptions,
  driverAvailabilityStatusOptions,
  driverStatusOptions,
  enquiryStatusOptions,
  getAdWorkAssignmentStatusLabel,
  getAdWorkExecutionDayStatusLabel,
  getAdWorkStatusLabel,
  getDriverApplicationStatusLabel,
  getDriverAvailabilityStatusLabel,
  getDriverStatusLabel,
  getEnquiryStatusLabel,
  getExecutionProofNoteTypeLabel,
  getExecutionReleaseStatusLabel,
  getCustomerUpdateSharingMethodLabel,
  getCustomerUpdateSharingStatusLabel,
  getPlannedEndDate,
  getProofReviewStatusLabel,
  getProofUploadStatusLabel,
  getVehicleGpsDeviceStatusLabel,
  getVehicleStatusLabel,
  liveTrackingNeedLabels,
  liveTrackingNeedOptions,
  packageInterestLabels,
  packageInterestOptions,
  proofReviewStatusOptions,
  executionProofNoteTypeOptions,
  vehicleCanBeAssigned,
  vehicleGpsDeviceStatusOptions,
  vehicleStatusOptions,
  vehicleTypeLabels,
  vehicleTypeOptions,
  yesNoNotSureLabels,
  yesNoNotSureOptions
} from "@kootha/shared";
import type {
  AdWorkAssignmentStatus,
  AdWorkExecutionDayStatus,
  AdWorkStatus,
  AssignmentDriverCandidate,
  AssignmentVehicleCandidate,
  CustomerUpdateSharingMethod,
  CustomerUpdateSharingStatus,
  DriverApplicationStatus,
  DriverAvailabilityStatus,
  DriverStatus,
  EnquiryStatus,
  ExecutionProofNoteType,
  ExecutionReleaseStatus,
  LiveTrackingNeed,
  PackageInterest,
  ProofReviewStatus,
  ProofUploadStatus,
  VehicleGpsDeviceStatus,
  VehicleStatus,
  VehicleType,
  YesNoNotSure
} from "@kootha/shared";

type SupabaseConfig = {
  url: string;
  anonKey: string;
};

type AuthSession = {
  accessToken: string;
  refreshToken?: string;
  user: {
    id: string;
    email?: string;
  };
};

type AdminProfile = {
  auth_user_id: string;
  display_name: string | null;
  role: string;
};

type EnquiryRecord = {
  id: string;
  customer_name: string;
  business_name: string;
  phone: string;
  city: string;
  required_areas: string | null;
  preferred_start_date: string | null;
  number_of_days: number;
  source: string;
  status: EnquiryStatus;
  message: string | null;
  created_at: string;
  package_interest: PackageInterest;
  live_tracking_needed: LiveTrackingNeed;
  notes: string | null;
  consent_to_contact: boolean;
  internal_note: string | null;
  follow_up_date: string | null;
  admin_remark: string | null;
  updated_at: string | null;
};

type AdWorkRecord = {
  id: string;
  customer_id: string | null;
  enquiry_id: string | null;
  title: string;
  city_id: string | null;
  start_date: string | null;
  end_date: string | null;
  customer_live_enabled: boolean;
  created_at: string;
  customer_name: string;
  business_name: string | null;
  customer_phone: string | null;
  city: string | null;
  areas_to_cover: string | null;
  advertisement_details: string | null;
  package_interest: PackageInterest;
  live_tracking_requested: LiveTrackingNeed;
  live_tracking_enabled: boolean;
  planning_status: AdWorkStatus;
  number_of_days: number;
  daily_start_time: string | null;
  daily_end_time: string | null;
  special_instructions: string | null;
  internal_planning_note: string | null;
  photo_proof_needed: boolean;
  audio_video_proof_needed: boolean;
  area_update_needed: boolean;
  final_report_needed: boolean;
  customer_update_scheduled: boolean;
  customer_update_started: boolean;
  customer_update_in_progress: boolean;
  customer_update_area_covered: boolean;
  customer_update_completed: boolean;
  customer_update_report_ready: boolean;
  updated_at: string | null;
  assignment_status: AdWorkAssignmentStatus;
  assignment_note: string | null;
  assignment_updated_at: string | null;
  execution_release_status: ExecutionReleaseStatus;
  execution_overall_status: string;
  work_access_code_hint: string | null;
  work_access_code_created_at: string | null;
  work_access_revoked_at: string | null;
  execution_completed_at: string | null;
};

type AdWorkDayRecord = {
  id: string;
  ad_work_id: string;
  work_date: string;
  planned_start_time: string | null;
  planned_end_time: string | null;
  planning_status: "planned";
  areas_to_cover: string | null;
  day_note: string | null;
  execution_status: AdWorkExecutionDayStatus;
  execution_started_at: string | null;
  break_started_at: string | null;
  last_resumed_at: string | null;
  execution_completed_at: string | null;
  completion_note: string | null;
  issue_note: string | null;
  execution_updated_at: string | null;
  created_at: string;
  updated_at: string | null;
};

type CityRecord = {
  id: string;
  name: string;
  active: boolean;
};

type AreaRecord = {
  id: string;
  city_id: string;
  name: string;
  active: boolean;
};

type AdminView = "enquiries" | "adWorks" | "driverApplications" | "drivers" | "vehicles" | "dashboard";

type AdminFilters = {
  status: string;
  city: string;
  packageInterest: string;
  liveTracking: string;
  search: string;
};

type AdWorkFilters = AdminFilters & {
  startDate: string;
  endDate: string;
};

type AdminDraft = {
  status: EnquiryStatus;
  internalNote: string;
  followUpDate: string;
  packageInterest: PackageInterest;
  adminRemark: string;
};

type AdWorkDraft = {
  customerName: string;
  businessName: string;
  mobileNumber: string;
  cityTown: string;
  title: string;
  advertisementDetails: string;
  packageInterest: PackageInterest;
  liveTrackingRequested: LiveTrackingNeed;
  liveTrackingEnabled: boolean;
  customerLiveEnabled: boolean;
  planningStatus: AdWorkStatus;
  startDate: string;
  endDate: string;
  numberOfDays: number;
  dailyStartTime: string;
  dailyEndTime: string;
  areasToCover: string;
  specialInstructions: string;
  internalPlanningNote: string;
  photoProofNeeded: boolean;
  audioVideoProofNeeded: boolean;
  areaUpdateNeeded: boolean;
  finalReportNeeded: boolean;
  customerUpdateScheduled: boolean;
  customerUpdateStarted: boolean;
  customerUpdateInProgress: boolean;
  customerUpdateAreaCovered: boolean;
  customerUpdateCompleted: boolean;
  customerUpdateReportReady: boolean;
};

type DayDraft = {
  id: string;
  workDate: string;
  plannedStartTime: string;
  plannedEndTime: string;
  areasToCover: string;
  dayNote: string;
  planningStatus: "planned";
  executionStatus: AdWorkExecutionDayStatus;
  executionStartedAt: string | null;
  breakStartedAt: string | null;
  lastResumedAt: string | null;
  executionCompletedAt: string | null;
  completionNote: string;
  issueNote: string;
};

type AdWorkAssignmentRecord = {
  id: string;
  ad_work_id: string;
  driver_id: string;
  vehicle_id: string;
  status: AdWorkAssignmentStatus;
  assignment_note: string | null;
  readiness_warnings: string[] | null;
  warning_confirmation: boolean;
  created_at: string;
  updated_at: string | null;
};



type ProofUploadRecord = {
  id: string;
  ad_work_id: string | null;
  ad_work_day_id: string | null;
  assignment_id: string | null;
  driver_id: string | null;
  vehicle_id: string | null;
  proof_type: ExecutionProofNoteType;
  area_place_name: string | null;
  note_text: string | null;
  file_bucket: string;
  file_path: string;
  file_mime_type: string | null;
  file_size_bytes: number | null;
  upload_status: ProofUploadStatus;
  review_status: ProofReviewStatus;
  admin_review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string | null;
};

type ExecutionProofNoteRecord = {
  id: string;
  ad_work_id: string;
  ad_work_day_id: string;
  driver_id: string;
  proof_type: ExecutionProofNoteType;
  area_place_name: string | null;
  note_text: string;
  created_at: string;
};

type CustomerUpdateRecord = {
  id: string;
  ad_work_id: string | null;
  ad_work_day_id: string | null;
  type: string;
  message: string;
  channel: string;
  sent_status: string;
  sharing_status: CustomerUpdateSharingStatus;
  sharing_method: CustomerUpdateSharingMethod | null;
  sharing_note: string | null;
  shared_at: string | null;
  created_at: string;
  updated_at: string | null;
};

type DriverApplicationRecord = {
  id: string;
  driver_name: string;
  phone: string;
  city: string;
  service_areas: string | null;
  vehicle_ownership: string;
  vehicle_type: VehicleType;
  vehicle_number: string | null;
  mic_system_available: boolean;
  gps_device_available: YesNoNotSure;
  preferred_working_cities: string | null;
  notes: string | null;
  contact_consent: boolean;
  status: DriverApplicationStatus;
  admin_note: string | null;
  follow_up_date: string | null;
  rejection_reason: string | null;
  approval_note: string | null;
  linked_driver_id: string | null;
  linked_vehicle_id: string | null;
  created_at: string;
  updated_at: string | null;
};

type DriverRecord = {
  id: string;
  source_application_id: string | null;
  name: string;
  phone: string;
  city: string | null;
  service_areas: string[] | null;
  approval_status: string;
  availability_status: string;
  onboarding_status: DriverStatus;
  availability_status_text: DriverAvailabilityStatus;
  admin_note: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
};

type VehicleRecord = {
  id: string;
  source_application_id: string | null;
  driver_id: string | null;
  vehicle_number: string;
  vehicle_type: VehicleType;
  mic_available: boolean;
  mic_system_available: boolean;
  active: boolean;
  city: string | null;
  onboarding_status: VehicleStatus;
  gps_device_available: YesNoNotSure;
  gps_device_status: VehicleGpsDeviceStatus;
  gps_provider_name: string | null;
  gps_device_identifier: string | null;
  admin_note: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
};

type DriverApplicationFilters = {
  status: string;
  city: string;
  vehicleType: string;
  gpsDeviceAvailable: string;
  search: string;
};

type DriverFilters = {
  status: string;
  availability: string;
  search: string;
};

type VehicleFilters = {
  status: string;
  vehicleType: string;
  gpsDeviceStatus: string;
  search: string;
};

type DriverApplicationReviewDraft = {
  status: DriverApplicationStatus;
  adminNote: string;
  followUpDate: string;
  rejectionReason: string;
  approvalNote: string;
};

type DriverDraft = {
  onboardingStatus: DriverStatus;
  availabilityStatusText: DriverAvailabilityStatus;
  adminNote: string;
};

type VehicleDraft = {
  onboardingStatus: VehicleStatus;
  vehicleType: VehicleType;
  micSystemAvailable: boolean;
  gpsDeviceAvailable: YesNoNotSure;
  gpsDeviceStatus: VehicleGpsDeviceStatus;
  gpsProviderName: string;
  gpsDeviceIdentifier: string;
  adminNote: string;
};

type AdWorkAssignmentDraft = {
  driverId: string;
  vehicleId: string;
  status: AdWorkAssignmentStatus;
  note: string;
  confirmAssignmentChange: boolean;
};

type DriverCandidateFilters = {
  city: string;
  serviceArea: string;
  availability: string;
  status: string;
  search: string;
};

type VehicleCandidateFilters = {
  city: string;
  vehicleType: string;
  micSystem: string;
  gpsDevice: string;
  status: string;
  search: string;
};

const adminSessionKey = "kootha-admin-session";
const publicKeyHeader = ["api", "key"].join("");
const adminRoles = new Set(["admin"]);
const emptyFilters: AdminFilters = {
  status: "all",
  city: "all",
  packageInterest: "all",
  liveTracking: "all",
  search: ""
};
const emptyAdWorkFilters: AdWorkFilters = {
  ...emptyFilters,
  startDate: "",
  endDate: ""
};
const emptyDriverApplicationFilters: DriverApplicationFilters = {
  status: "all",
  city: "all",
  vehicleType: "all",
  gpsDeviceAvailable: "all",
  search: ""
};
const emptyDriverFilters: DriverFilters = {
  status: "all",
  availability: "all",
  search: ""
};
const emptyVehicleFilters: VehicleFilters = {
  status: "all",
  vehicleType: "all",
  gpsDeviceStatus: "all",
  search: ""
};
const emptyDriverCandidateFilters: DriverCandidateFilters = {
  city: "all",
  serviceArea: "",
  availability: "all",
  status: "approved",
  search: ""
};
const emptyVehicleCandidateFilters: VehicleCandidateFilters = {
  city: "all",
  vehicleType: "all",
  micSystem: "all",
  gpsDevice: "all",
  status: "approved",
  search: ""
};

const enquirySelectColumns = [
  "id",
  "customer_name",
  "business_name",
  "phone",
  "city",
  "required_areas",
  "preferred_start_date",
  "number_of_days",
  "source",
  "status",
  "message",
  "created_at",
  "package_interest",
  "live_tracking_needed",
  "notes",
  "consent_to_contact",
  "internal_note",
  "follow_up_date",
  "admin_remark",
  "updated_at"
].join(",");

const adWorkSelectColumns = [
  "id",
  "customer_id",
  "enquiry_id",
  "title",
  "city_id",
  "start_date",
  "end_date",
  "customer_live_enabled",
  "created_at",
  "customer_name",
  "business_name",
  "customer_phone",
  "city",
  "areas_to_cover",
  "advertisement_details",
  "package_interest",
  "live_tracking_requested",
  "live_tracking_enabled",
  "planning_status",
  "number_of_days",
  "daily_start_time",
  "daily_end_time",
  "special_instructions",
  "internal_planning_note",
  "photo_proof_needed",
  "audio_video_proof_needed",
  "area_update_needed",
  "final_report_needed",
  "customer_update_scheduled",
  "customer_update_started",
  "customer_update_in_progress",
  "customer_update_area_covered",
  "customer_update_completed",
  "customer_update_report_ready",
  "updated_at",
  "assignment_status",
  "assignment_note",
  "assignment_updated_at",
  "execution_release_status",
  "execution_overall_status",
  "work_access_code_hint",
  "work_access_code_created_at",
  "work_access_revoked_at",
  "execution_completed_at"
].join(",");

const adWorkDaySelectColumns = [
  "id",
  "ad_work_id",
  "work_date",
  "planned_start_time",
  "planned_end_time",
  "planning_status",
  "areas_to_cover",
  "day_note",
  "execution_status",
  "execution_started_at",
  "break_started_at",
  "last_resumed_at",
  "execution_completed_at",
  "completion_note",
  "issue_note",
  "execution_updated_at",
  "created_at",
  "updated_at"
].join(",");

const adWorkAssignmentSelectColumns = [
  "id",
  "ad_work_id",
  "driver_id",
  "vehicle_id",
  "status",
  "assignment_note",
  "readiness_warnings",
  "warning_confirmation",
  "created_at",
  "updated_at"
].join(",");


const proofUploadSelectColumns = [
  "id",
  "ad_work_id",
  "ad_work_day_id",
  "assignment_id",
  "driver_id",
  "vehicle_id",
  "proof_type",
  "area_place_name",
  "note_text",
  "file_bucket",
  "file_path",
  "file_mime_type",
  "file_size_bytes",
  "upload_status",
  "review_status",
  "admin_review_note",
  "reviewed_at",
  "created_at",
  "updated_at"
].join(",");

const executionProofNoteSelectColumns = [
  "id",
  "ad_work_id",
  "ad_work_day_id",
  "driver_id",
  "proof_type",
  "area_place_name",
  "note_text",
  "created_at"
].join(",");

const customerUpdateSelectColumns = [
  "id",
  "ad_work_id",
  "ad_work_day_id",
  "type",
  "message",
  "channel",
  "sent_status",
  "sharing_status",
  "sharing_method",
  "sharing_note",
  "shared_at",
  "created_at",
  "updated_at"
].join(",");

const driverApplicationSelectColumns = [
  "id",
  "driver_name",
  "phone",
  "city",
  "service_areas",
  "vehicle_ownership",
  "vehicle_type",
  "vehicle_number",
  "mic_system_available",
  "gps_device_available",
  "preferred_working_cities",
  "notes",
  "contact_consent",
  "status",
  "admin_note",
  "follow_up_date",
  "rejection_reason",
  "approval_note",
  "linked_driver_id",
  "linked_vehicle_id",
  "created_at",
  "updated_at"
].join(",");

const driverSelectColumns = [
  "id",
  "source_application_id",
  "name",
  "phone",
  "city",
  "service_areas",
  "approval_status",
  "availability_status",
  "onboarding_status",
  "availability_status_text",
  "admin_note",
  "notes",
  "created_at",
  "updated_at"
].join(",");

const vehicleSelectColumns = [
  "id",
  "source_application_id",
  "driver_id",
  "vehicle_number",
  "vehicle_type",
  "mic_available",
  "mic_system_available",
  "active",
  "city",
  "onboarding_status",
  "gps_device_available",
  "gps_device_status",
  "gps_provider_name",
  "gps_device_identifier",
  "admin_note",
  "notes",
  "created_at",
  "updated_at"
].join(",");

function getAdminSupabaseConfig(): SupabaseConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";

  if (!url || !anonKey || url.includes("your-project") || anonKey.includes("replace-with")) {
    return null;
  }

  return {
    url: url.replace(/\/$/, ""),
    anonKey
  };
}

function createHeaders(config: SupabaseConfig, accessToken?: string, includeJson = false) {
  const headers: Record<string, string> = {
    [publicKeyHeader]: config.anonKey,
    Authorization: "Bearer " + (accessToken ?? config.anonKey)
  };

  if (includeJson) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}


function encodeStoragePath(path: string): string {
  return path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function readStoredSession(): AuthSession | null {
  try {
    const rawSession = window.localStorage.getItem(adminSessionKey);
    if (!rawSession) {
      return null;
    }

    const parsedSession = JSON.parse(rawSession) as AuthSession;
    if (!parsedSession.accessToken || !parsedSession.user?.id) {
      return null;
    }

    return parsedSession;
  } catch {
    return null;
  }
}

function writeStoredSession(session: AuthSession) {
  window.localStorage.setItem(adminSessionKey, JSON.stringify(session));
}

function clearStoredSession() {
  window.localStorage.removeItem(adminSessionKey);
}

async function loginAdmin(config: SupabaseConfig, email: string, password: string): Promise<AuthSession> {
  const response = await fetch(config.url + "/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: createHeaders(config, undefined, true),
    body: JSON.stringify({ email: email.trim(), password })
  });

  if (!response.ok) {
    throw new Error("Login failed. Check the email and password.");
  }

  const payload = await response.json() as {
    access_token?: string;
    refresh_token?: string;
    user?: {
      id?: string;
      email?: string;
    };
  };

  if (!payload.access_token || !payload.user?.id) {
    throw new Error("Login did not return a valid admin session.");
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    user: {
      id: payload.user.id,
      email: payload.user.email
    }
  };
}

async function logoutAdmin(config: SupabaseConfig, session: AuthSession) {
  await fetch(config.url + "/auth/v1/logout", {
    method: "POST",
    headers: createHeaders(config, session.accessToken)
  });
}

async function fetchAdminProfile(config: SupabaseConfig, session: AuthSession): Promise<AdminProfile> {
  const response = await fetch(
    config.url + "/rest/v1/user_profiles?select=auth_user_id,display_name,role&auth_user_id=eq." + encodeURIComponent(session.user.id) + "&limit=1",
    {
      headers: createHeaders(config, session.accessToken)
    }
  );

  if (!response.ok) {
    throw new Error("Could not verify admin access.");
  }

  const profiles = await response.json() as AdminProfile[];
  const profile = profiles[0];

  if (!profile || !adminRoles.has(profile.role)) {
    throw new Error("This account is not marked as an admin.");
  }

  return profile;
}

async function fetchAdminEnquiries(config: SupabaseConfig, session: AuthSession): Promise<EnquiryRecord[]> {
  const response = await fetch(config.url + "/rest/v1/enquiries?select=" + enquirySelectColumns + "&order=created_at.desc", {
    headers: createHeaders(config, session.accessToken)
  });

  if (!response.ok) {
    throw new Error("Could not load enquiries.");
  }

  return await response.json() as EnquiryRecord[];
}

async function fetchAdminAdWorks(config: SupabaseConfig, session: AuthSession): Promise<AdWorkRecord[]> {
  const response = await fetch(config.url + "/rest/v1/ad_works?select=" + adWorkSelectColumns + "&order=created_at.desc", {
    headers: createHeaders(config, session.accessToken)
  });

  if (!response.ok) {
    throw new Error("Could not load ad works.");
  }

  return await response.json() as AdWorkRecord[];
}

async function fetchAdminAdWorkDays(config: SupabaseConfig, session: AuthSession): Promise<AdWorkDayRecord[]> {
  const response = await fetch(config.url + "/rest/v1/ad_work_days?select=" + adWorkDaySelectColumns + "&order=work_date.asc", {
    headers: createHeaders(config, session.accessToken)
  });

  if (!response.ok) {
    throw new Error("Could not load ad work days.");
  }

  return await response.json() as AdWorkDayRecord[];
}

async function fetchAdWorkAssignments(config: SupabaseConfig, session: AuthSession, adWorkId?: string): Promise<AdWorkAssignmentRecord[]> {
  const filter = adWorkId ? "&ad_work_id=eq." + encodeURIComponent(adWorkId) : "";
  const response = await fetch(config.url + "/rest/v1/ad_work_assignments?select=" + adWorkAssignmentSelectColumns + filter + "&order=created_at.desc", {
    headers: createHeaders(config, session.accessToken)
  });

  if (!response.ok) {
    throw new Error("Could not load ad work assignments.");
  }

  return await response.json() as AdWorkAssignmentRecord[];
}


async function fetchAdminProofUploads(config: SupabaseConfig, session: AuthSession, adWorkId?: string): Promise<ProofUploadRecord[]> {
  const filter = adWorkId ? "&ad_work_id=eq." + encodeURIComponent(adWorkId) : "";
  const response = await fetch(config.url + "/rest/v1/proof_uploads?select=" + proofUploadSelectColumns + filter + "&order=created_at.desc", {
    headers: createHeaders(config, session.accessToken)
  });

  if (!response.ok) {
    throw new Error("Could not load proof uploads.");
  }

  return await response.json() as ProofUploadRecord[];
}

async function fetchExecutionProofNotes(config: SupabaseConfig, session: AuthSession, adWorkId: string): Promise<ExecutionProofNoteRecord[]> {
  const response = await fetch(config.url + "/rest/v1/execution_proof_notes?select=" + executionProofNoteSelectColumns + "&ad_work_id=eq." + encodeURIComponent(adWorkId) + "&order=created_at.desc", {
    headers: createHeaders(config, session.accessToken)
  });

  if (!response.ok) {
    throw new Error("Could not load proof notes.");
  }

  return await response.json() as ExecutionProofNoteRecord[];
}

async function fetchCustomerUpdates(config: SupabaseConfig, session: AuthSession, adWorkId?: string): Promise<CustomerUpdateRecord[]> {
  const filter = adWorkId ? "&ad_work_id=eq." + encodeURIComponent(adWorkId) : "";
  const response = await fetch(config.url + "/rest/v1/customer_updates?select=" + customerUpdateSelectColumns + filter + "&order=created_at.desc", {
    headers: createHeaders(config, session.accessToken)
  });

  if (!response.ok) {
    throw new Error("Could not load customer update records.");
  }

  return await response.json() as CustomerUpdateRecord[];
}


async function fetchProofPhotoSignedUrl(config: SupabaseConfig, session: AuthSession, bucket: string, path: string): Promise<string> {
  const response = await fetch(config.url + "/storage/v1/object/sign/" + bucket + "/" + encodeStoragePath(path), {
    method: "POST",
    headers: createHeaders(config, session.accessToken, true),
    body: JSON.stringify({ expiresIn: 300 })
  });

  if (!response.ok) {
    throw new Error("Could not open proof photo preview.");
  }

  const payload = await response.json() as { signedURL?: string; signedUrl?: string };
  const signedPath = payload.signedURL ?? payload.signedUrl;

  if (!signedPath) {
    throw new Error("Could not open proof photo preview.");
  }

  return signedPath.startsWith("http") ? signedPath : config.url + "/storage/v1" + signedPath;
}

async function reviewProofUpload(
  config: SupabaseConfig,
  session: AuthSession,
  proofUploadId: string,
  reviewStatus: ProofReviewStatus,
  reviewNote: string
) {
  const response = await fetch(config.url + "/rest/v1/rpc/review_proof_upload", {
    method: "POST",
    headers: createHeaders(config, session.accessToken, true),
    body: JSON.stringify({
      p_proof_upload_id: proofUploadId,
      p_review_status: reviewStatus,
      p_admin_review_note: reviewNote.trim() || null
    })
  });

  if (!response.ok) {
    throw new Error("Could not save proof review.");
  }
}

async function markCustomerUpdateShared(
  config: SupabaseConfig,
  session: AuthSession,
  customerUpdateId: string,
  sharingMethod: CustomerUpdateSharingMethod,
  sharingNote: string
) {
  const response = await fetch(config.url + "/rest/v1/rpc/mark_customer_update_shared", {
    method: "POST",
    headers: createHeaders(config, session.accessToken, true),
    body: JSON.stringify({
      p_customer_update_id: customerUpdateId,
      p_sharing_method: sharingMethod,
      p_sharing_note: sharingNote.trim() || null
    })
  });

  if (!response.ok) {
    throw new Error("Could not mark Customer Update as shared.");
  }
}

async function releaseAdWorkToDriver(
  config: SupabaseConfig,
  session: AuthSession,
  adWorkId: string,
  revoke: boolean
) {
  const response = await fetch(config.url + "/rest/v1/rpc/release_ad_work_to_driver", {
    method: "POST",
    headers: createHeaders(config, session.accessToken, true),
    body: JSON.stringify({
      p_ad_work_id: adWorkId,
      p_plain_work_code: null,
      p_revoke: revoke
    })
  });

  if (!response.ok) {
    throw new Error(revoke ? "Could not revoke work access." : "Could not release Ad Work.");
  }

  return await response.json() as {
    ad_work_id: string;
    work_access_code: string | null;
    work_access_code_hint: string | null;
    release_status: ExecutionReleaseStatus;
    result_message: string;
  }[];
}

async function fetchDriverApplications(config: SupabaseConfig, session: AuthSession): Promise<DriverApplicationRecord[]> {
  const response = await fetch(config.url + "/rest/v1/driver_applications?select=" + driverApplicationSelectColumns + "&order=created_at.desc", {
    headers: createHeaders(config, session.accessToken)
  });

  if (!response.ok) {
    throw new Error("Could not load driver applications.");
  }

  return await response.json() as DriverApplicationRecord[];
}

async function fetchDrivers(config: SupabaseConfig, session: AuthSession): Promise<DriverRecord[]> {
  const response = await fetch(config.url + "/rest/v1/drivers?select=" + driverSelectColumns + "&order=created_at.desc", {
    headers: createHeaders(config, session.accessToken)
  });

  if (!response.ok) {
    throw new Error("Could not load drivers.");
  }

  return await response.json() as DriverRecord[];
}

async function fetchVehicles(config: SupabaseConfig, session: AuthSession): Promise<VehicleRecord[]> {
  const response = await fetch(config.url + "/rest/v1/vehicles?select=" + vehicleSelectColumns + "&order=created_at.desc", {
    headers: createHeaders(config, session.accessToken)
  });

  if (!response.ok) {
    throw new Error("Could not load vehicles.");
  }

  return await response.json() as VehicleRecord[];
}

async function fetchCities(config: SupabaseConfig, session: AuthSession): Promise<CityRecord[]> {
  const response = await fetch(config.url + "/rest/v1/cities?select=id,name,active&active=eq.true&order=name.asc", {
    headers: createHeaders(config, session.accessToken)
  });

  if (!response.ok) {
    throw new Error("Could not load cities.");
  }

  return await response.json() as CityRecord[];
}

async function fetchAreas(config: SupabaseConfig, session: AuthSession): Promise<AreaRecord[]> {
  const response = await fetch(config.url + "/rest/v1/areas?select=id,city_id,name,active&active=eq.true&order=name.asc", {
    headers: createHeaders(config, session.accessToken)
  });

  if (!response.ok) {
    throw new Error("Could not load areas.");
  }

  return await response.json() as AreaRecord[];
}

async function updateAdminEnquiry(
  config: SupabaseConfig,
  session: AuthSession,
  enquiryId: string,
  draft: AdminDraft
) {
  const response = await fetch(config.url + "/rest/v1/enquiries?id=eq." + encodeURIComponent(enquiryId), {
    method: "PATCH",
    headers: {
      ...createHeaders(config, session.accessToken, true),
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      status: draft.status,
      internal_note: draft.internalNote.trim() || null,
      follow_up_date: draft.followUpDate || null,
      package_interest: draft.packageInterest,
      admin_remark: draft.adminRemark.trim() || null,
      updated_at: new Date().toISOString()
    })
  });

  if (!response.ok) {
    throw new Error("Could not save enquiry changes.");
  }
}

async function createAdWorkFromEnquiry(
  config: SupabaseConfig,
  session: AuthSession,
  enquiryId: string
): Promise<{ adWorkId: string; wasCreated: boolean }> {
  const response = await fetch(config.url + "/rest/v1/rpc/create_ad_work_from_enquiry", {
    method: "POST",
    headers: createHeaders(config, session.accessToken, true),
    body: JSON.stringify({ p_enquiry_id: enquiryId })
  });

  if (!response.ok) {
    throw new Error("Could not create ad work from this enquiry.");
  }

  const payload = await response.json() as { ad_work_id: string; was_created: boolean }[];
  const result = payload[0];

  if (!result?.ad_work_id) {
    throw new Error("Ad work was not returned.");
  }

  return {
    adWorkId: result.ad_work_id,
    wasCreated: result.was_created
  };
}

async function updateAdminAdWork(
  config: SupabaseConfig,
  session: AuthSession,
  adWorkId: string,
  draft: AdWorkDraft
) {
  const response = await fetch(config.url + "/rest/v1/ad_works?id=eq." + encodeURIComponent(adWorkId), {
    method: "PATCH",
    headers: {
      ...createHeaders(config, session.accessToken, true),
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      customer_name: draft.customerName.trim(),
      business_name: draft.businessName.trim() || null,
      customer_phone: draft.mobileNumber.trim() || null,
      city: draft.cityTown.trim() || null,
      title: draft.title.trim() || "Ad Work",
      advertisement_details: draft.advertisementDetails.trim() || null,
      package_interest: draft.packageInterest,
      live_tracking_requested: draft.liveTrackingRequested,
      live_tracking_enabled: false,
      customer_live_enabled: false,
      planning_status: draft.planningStatus,
      start_date: draft.startDate || null,
      end_date: draft.endDate || null,
      number_of_days: Math.max(1, draft.numberOfDays),
      daily_start_time: draft.dailyStartTime || null,
      daily_end_time: draft.dailyEndTime || null,
      areas_to_cover: draft.areasToCover.trim() || null,
      special_instructions: draft.specialInstructions.trim() || null,
      internal_planning_note: draft.internalPlanningNote.trim() || null,
      photo_proof_needed: draft.photoProofNeeded,
      audio_video_proof_needed: draft.audioVideoProofNeeded,
      area_update_needed: draft.areaUpdateNeeded,
      final_report_needed: draft.finalReportNeeded,
      customer_update_scheduled: draft.customerUpdateScheduled,
      customer_update_started: draft.customerUpdateStarted,
      customer_update_in_progress: draft.customerUpdateInProgress,
      customer_update_area_covered: draft.customerUpdateAreaCovered,
      customer_update_completed: draft.customerUpdateCompleted,
      customer_update_report_ready: draft.customerUpdateReportReady,
      updated_at: new Date().toISOString()
    })
  });

  if (!response.ok) {
    throw new Error("Could not save ad work changes.");
  }
}

async function syncAdWorkDays(
  config: SupabaseConfig,
  session: AuthSession,
  adWorkId: string,
  draft: AdWorkDraft
) {
  const response = await fetch(config.url + "/rest/v1/rpc/sync_ad_work_days", {
    method: "POST",
    headers: createHeaders(config, session.accessToken, true),
    body: JSON.stringify({
      p_ad_work_id: adWorkId,
      p_start_date: draft.startDate,
      p_number_of_days: Math.max(1, draft.numberOfDays),
      p_daily_start_time: draft.dailyStartTime || null,
      p_daily_end_time: draft.dailyEndTime || null,
      p_areas_to_cover: draft.areasToCover.trim() || null
    })
  });

  if (!response.ok) {
    throw new Error("Could not sync day-wise schedule.");
  }
}

async function saveAdWorkAssignment(
  config: SupabaseConfig,
  session: AuthSession,
  adWorkId: string,
  draft: AdWorkAssignmentDraft,
  warnings: string[]
) {
  const response = await fetch(config.url + "/rest/v1/rpc/assign_driver_vehicle_to_ad_work", {
    method: "POST",
    headers: createHeaders(config, session.accessToken, true),
    body: JSON.stringify({
      p_ad_work_id: adWorkId,
      p_driver_id: draft.driverId,
      p_vehicle_id: draft.vehicleId,
      p_status: draft.status,
      p_assignment_note: draft.note.trim() || null,
      p_readiness_warnings: warnings,
      p_warning_confirmation: draft.confirmAssignmentChange
    })
  });

  if (!response.ok) {
    throw new Error("Could not save assignment.");
  }

  return await response.json() as {
    assignment_id: string;
    ad_work_id: string;
    driver_id: string;
    vehicle_id: string;
    status: AdWorkAssignmentStatus;
    result_message: string;
  }[];
}

async function updateAdminAdWorkDay(
  config: SupabaseConfig,
  session: AuthSession,
  day: DayDraft
) {
  const response = await fetch(config.url + "/rest/v1/ad_work_days?id=eq." + encodeURIComponent(day.id), {
    method: "PATCH",
    headers: {
      ...createHeaders(config, session.accessToken, true),
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      work_date: day.workDate,
      planned_start_time: day.plannedStartTime || null,
      planned_end_time: day.plannedEndTime || null,
      areas_to_cover: day.areasToCover.trim() || null,
      day_note: day.dayNote.trim() || null,
      planning_status: "planned",
      updated_at: new Date().toISOString()
    })
  });

  if (!response.ok) {
    throw new Error("Could not save a day-wise schedule row.");
  }
}

async function reviewDriverApplication(
  config: SupabaseConfig,
  session: AuthSession,
  applicationId: string,
  draft: DriverApplicationReviewDraft
) {
  const response = await fetch(config.url + "/rest/v1/rpc/review_driver_application", {
    method: "POST",
    headers: createHeaders(config, session.accessToken, true),
    body: JSON.stringify({
      p_application_id: applicationId,
      p_status: draft.status,
      p_admin_note: draft.adminNote.trim() || null,
      p_follow_up_date: draft.followUpDate || null,
      p_rejection_reason: draft.rejectionReason.trim() || null,
      p_approval_note: draft.approvalNote.trim() || null
    })
  });

  if (!response.ok) {
    throw new Error("Could not save driver application review.");
  }

  return await response.json() as {
    application_id: string;
    driver_id: string | null;
    vehicle_id: string | null;
    duplicate_found: boolean;
    result_message: string;
  }[];
}

async function updateDriverRecord(
  config: SupabaseConfig,
  session: AuthSession,
  driverId: string,
  draft: DriverDraft
) {
  const response = await fetch(config.url + "/rest/v1/drivers?id=eq." + encodeURIComponent(driverId), {
    method: "PATCH",
    headers: {
      ...createHeaders(config, session.accessToken, true),
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      onboarding_status: draft.onboardingStatus,
      availability_status_text: draft.availabilityStatusText,
      admin_note: draft.adminNote.trim() || null,
      updated_at: new Date().toISOString()
    })
  });

  if (!response.ok) {
    throw new Error("Could not save driver record.");
  }
}

async function updateVehicleRecord(
  config: SupabaseConfig,
  session: AuthSession,
  vehicleId: string,
  draft: VehicleDraft
) {
  const response = await fetch(config.url + "/rest/v1/vehicles?id=eq." + encodeURIComponent(vehicleId), {
    method: "PATCH",
    headers: {
      ...createHeaders(config, session.accessToken, true),
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      onboarding_status: draft.onboardingStatus,
      vehicle_type: draft.vehicleType,
      mic_available: draft.micSystemAvailable,
      mic_system_available: draft.micSystemAvailable,
      gps_device_available: draft.gpsDeviceAvailable,
      gps_device_status: draft.gpsDeviceStatus,
      gps_provider_name: draft.gpsProviderName.trim() || null,
      gps_device_identifier: draft.gpsDeviceIdentifier.trim() || null,
      admin_note: draft.adminNote.trim() || null,
      active: draft.onboardingStatus === "approved",
      updated_at: new Date().toISOString()
    })
  });

  if (!response.ok) {
    throw new Error("Could not save vehicle record.");
  }
}

function toDraft(enquiry: EnquiryRecord): AdminDraft {
  return {
    status: enquiry.status,
    internalNote: enquiry.internal_note ?? "",
    followUpDate: enquiry.follow_up_date ?? "",
    packageInterest: enquiry.package_interest,
    adminRemark: enquiry.admin_remark ?? ""
  };
}

function toTimeInput(value: string | null | undefined) {
  return value ? value.slice(0, 5) : "";
}

function toAdWorkDraft(adWork: AdWorkRecord): AdWorkDraft {
  return {
    customerName: adWork.customer_name ?? "",
    businessName: adWork.business_name ?? "",
    mobileNumber: adWork.customer_phone ?? "",
    cityTown: adWork.city ?? "",
    title: adWork.title ?? "",
    advertisementDetails: adWork.advertisement_details ?? "",
    packageInterest: adWork.package_interest ?? "not_sure",
    liveTrackingRequested: adWork.live_tracking_requested ?? "not_sure",
    liveTrackingEnabled: false,
    customerLiveEnabled: false,
    planningStatus: adWork.planning_status ?? "draft",
    startDate: adWork.start_date ?? "",
    endDate: adWork.end_date ?? "",
    numberOfDays: adWork.number_of_days || 1,
    dailyStartTime: toTimeInput(adWork.daily_start_time),
    dailyEndTime: toTimeInput(adWork.daily_end_time),
    areasToCover: adWork.areas_to_cover ?? "",
    specialInstructions: adWork.special_instructions ?? "",
    internalPlanningNote: adWork.internal_planning_note ?? "",
    photoProofNeeded: adWork.photo_proof_needed,
    audioVideoProofNeeded: adWork.audio_video_proof_needed,
    areaUpdateNeeded: adWork.area_update_needed,
    finalReportNeeded: adWork.final_report_needed,
    customerUpdateScheduled: adWork.customer_update_scheduled,
    customerUpdateStarted: adWork.customer_update_started,
    customerUpdateInProgress: adWork.customer_update_in_progress,
    customerUpdateAreaCovered: adWork.customer_update_area_covered,
    customerUpdateCompleted: adWork.customer_update_completed,
    customerUpdateReportReady: adWork.customer_update_report_ready
  };
}

function toAdWorkAssignmentDraft(assignment: AdWorkAssignmentRecord | null): AdWorkAssignmentDraft {
  return {
    driverId: assignment?.driver_id ?? "",
    vehicleId: assignment?.vehicle_id ?? "",
    status: assignment?.status ?? "not_assigned",
    note: assignment?.assignment_note ?? "",
    confirmAssignmentChange: false
  };
}

function toDriverAssignmentCandidate(driver: DriverRecord): AssignmentDriverCandidate {
  return {
    id: driver.id,
    name: driver.name,
    phone: driver.phone,
    city: driver.city,
    serviceAreas: driver.service_areas ?? [],
    approvalStatus: driver.approval_status,
    onboardingStatus: driver.onboarding_status,
    availabilityStatus: driver.availability_status_text
  };
}

function toVehicleAssignmentCandidate(vehicle: VehicleRecord): AssignmentVehicleCandidate {
  return {
    id: vehicle.id,
    vehicleNumber: vehicle.vehicle_number,
    vehicleType: vehicle.vehicle_type,
    city: vehicle.city,
    active: vehicle.active,
    onboardingStatus: vehicle.onboarding_status,
    micSystemAvailable: vehicle.mic_system_available || vehicle.mic_available,
    gpsDeviceAvailable: vehicle.gps_device_available,
    gpsDeviceStatus: vehicle.gps_device_status
  };
}

function toUniqueCitiesFromDrivers(drivers: DriverRecord[]) {
  return [...new Set(drivers.map((driver) => driver.city ?? "").filter(Boolean))].sort();
}

function toUniqueCitiesFromVehicles(vehicles: VehicleRecord[]) {
  return [...new Set(vehicles.map((vehicle) => vehicle.city ?? "").filter(Boolean))].sort();
}

function filterDriverCandidates(drivers: DriverRecord[], filters: DriverCandidateFilters) {
  const search = filters.search.trim().toLowerCase();
  const serviceArea = filters.serviceArea.trim().toLowerCase();

  return drivers.filter((driver) => {
    const candidate = toDriverAssignmentCandidate(driver);
    if (!driverCanBeAssigned(candidate)) {
      return false;
    }

    if (filters.city !== "all" && driver.city !== filters.city) {
      return false;
    }

    if (filters.availability !== "all" && driver.availability_status_text !== filters.availability) {
      return false;
    }

    if (filters.status !== "all" && driver.onboarding_status !== filters.status) {
      return false;
    }

    if (serviceArea && !(driver.service_areas ?? []).some((area) => area.toLowerCase().includes(serviceArea))) {
      return false;
    }

    if (!search) {
      return true;
    }

    return [
      driver.name,
      driver.phone,
      driver.city ?? "",
      (driver.service_areas ?? []).join(" ")
    ].join(" ").toLowerCase().includes(search);
  });
}

function filterVehicleCandidates(vehicles: VehicleRecord[], filters: VehicleCandidateFilters) {
  const search = filters.search.trim().toLowerCase();

  return vehicles.filter((vehicle) => {
    const candidate = toVehicleAssignmentCandidate(vehicle);
    if (!vehicleCanBeAssigned(candidate)) {
      return false;
    }

    if (filters.city !== "all" && vehicle.city !== filters.city) {
      return false;
    }

    if (filters.vehicleType !== "all" && vehicle.vehicle_type !== filters.vehicleType) {
      return false;
    }

    if (filters.status !== "all" && vehicle.onboarding_status !== filters.status) {
      return false;
    }

    if (filters.micSystem === "yes" && !(vehicle.mic_system_available || vehicle.mic_available)) {
      return false;
    }

    if (filters.micSystem === "no" && (vehicle.mic_system_available || vehicle.mic_available)) {
      return false;
    }

    if (filters.gpsDevice !== "all" && vehicle.gps_device_status !== filters.gpsDevice && vehicle.gps_device_available !== filters.gpsDevice) {
      return false;
    }

    if (!search) {
      return true;
    }

    return [
      vehicle.vehicle_number,
      vehicle.city ?? "",
      vehicle.gps_provider_name ?? "",
      vehicle.gps_device_identifier ?? ""
    ].join(" ").toLowerCase().includes(search);
  });
}

function toAdWorkAssignmentReadiness(adWork: AdWorkRecord) {
  return {
    city: adWork.city,
    areasToCover: adWork.areas_to_cover,
    startDate: adWork.start_date,
    endDate: adWork.end_date,
    numberOfDays: adWork.number_of_days,
    packageInterest: adWork.package_interest,
    liveTrackingRequested: adWork.live_tracking_requested,
    proofPlanSelected: adWork.photo_proof_needed || adWork.audio_video_proof_needed || adWork.area_update_needed || adWork.final_report_needed
  };
}

function toAssignmentForAdWork(assignments: AdWorkAssignmentRecord[], adWorkId: string) {
  return assignments.find((assignment) => assignment.ad_work_id === adWorkId) ?? null;
}

function toDayDraft(day: AdWorkDayRecord): DayDraft {
  return {
    id: day.id,
    workDate: day.work_date,
    plannedStartTime: toTimeInput(day.planned_start_time),
    plannedEndTime: toTimeInput(day.planned_end_time),
    areasToCover: day.areas_to_cover ?? "",
    dayNote: day.day_note ?? "",
    planningStatus: "planned",
    executionStatus: day.execution_status ?? "planned",
    executionStartedAt: day.execution_started_at,
    breakStartedAt: day.break_started_at,
    lastResumedAt: day.last_resumed_at,
    executionCompletedAt: day.execution_completed_at,
    completionNote: day.completion_note ?? "",
    issueNote: day.issue_note ?? ""
  };
}

function toDriverApplicationDraft(application: DriverApplicationRecord): DriverApplicationReviewDraft {
  return {
    status: application.status,
    adminNote: application.admin_note ?? "",
    followUpDate: application.follow_up_date ?? "",
    rejectionReason: application.rejection_reason ?? "",
    approvalNote: application.approval_note ?? ""
  };
}

function toDriverDraft(driver: DriverRecord): DriverDraft {
  return {
    onboardingStatus: driver.onboarding_status ?? "pending_review",
    availabilityStatusText: driver.availability_status_text ?? "unknown",
    adminNote: driver.admin_note ?? ""
  };
}

function toVehicleDraft(vehicle: VehicleRecord): VehicleDraft {
  return {
    onboardingStatus: vehicle.onboarding_status ?? "pending_review",
    vehicleType: vehicle.vehicle_type ?? "other",
    micSystemAvailable: vehicle.mic_system_available ?? vehicle.mic_available,
    gpsDeviceAvailable: vehicle.gps_device_available ?? "not_sure",
    gpsDeviceStatus: vehicle.gps_device_status ?? "none",
    gpsProviderName: vehicle.gps_provider_name ?? "",
    gpsDeviceIdentifier: vehicle.gps_device_identifier ?? "",
    adminNote: vehicle.admin_note ?? ""
  };
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function uniqueCitiesFromEnquiries(enquiries: EnquiryRecord[]) {
  return [...new Set(enquiries.map((enquiry) => enquiry.city).filter(Boolean))].sort();
}

function uniqueCitiesFromAdWorks(adWorks: AdWorkRecord[]) {
  return [...new Set(adWorks.map((adWork) => adWork.city ?? "").filter(Boolean))].sort();
}

function filterEnquiries(enquiries: EnquiryRecord[], filters: AdminFilters) {
  const search = filters.search.trim().toLowerCase();

  return enquiries.filter((enquiry) => {
    if (filters.status !== "all" && enquiry.status !== filters.status) {
      return false;
    }

    if (filters.city !== "all" && enquiry.city !== filters.city) {
      return false;
    }

    if (filters.packageInterest !== "all" && enquiry.package_interest !== filters.packageInterest) {
      return false;
    }

    if (filters.liveTracking !== "all" && enquiry.live_tracking_needed !== filters.liveTracking) {
      return false;
    }

    if (!search) {
      return true;
    }

    return [
      enquiry.customer_name,
      enquiry.business_name,
      enquiry.phone,
      enquiry.city
    ].join(" ").toLowerCase().includes(search);
  });
}

function filterAdWorks(adWorks: AdWorkRecord[], filters: AdWorkFilters) {
  const search = filters.search.trim().toLowerCase();

  return adWorks.filter((adWork) => {
    if (filters.status !== "all" && adWork.planning_status !== filters.status) {
      return false;
    }

    if (filters.city !== "all" && adWork.city !== filters.city) {
      return false;
    }

    if (filters.packageInterest !== "all" && adWork.package_interest !== filters.packageInterest) {
      return false;
    }

    if (filters.liveTracking !== "all" && adWork.live_tracking_requested !== filters.liveTracking) {
      return false;
    }

    if (filters.startDate && (!adWork.start_date || adWork.start_date < filters.startDate)) {
      return false;
    }

    if (filters.endDate && (!adWork.end_date || adWork.end_date > filters.endDate)) {
      return false;
    }

    if (!search) {
      return true;
    }

    return [
      adWork.title,
      adWork.customer_name,
      adWork.business_name ?? "",
      adWork.customer_phone ?? "",
      adWork.city ?? ""
    ].join(" ").toLowerCase().includes(search);
  });
}

function filterDriverApplications(applications: DriverApplicationRecord[], filters: DriverApplicationFilters) {
  const search = filters.search.trim().toLowerCase();

  return applications.filter((application) => {
    if (filters.status !== "all" && application.status !== filters.status) {
      return false;
    }

    if (filters.city !== "all" && application.city !== filters.city) {
      return false;
    }

    if (filters.vehicleType !== "all" && application.vehicle_type !== filters.vehicleType) {
      return false;
    }

    if (filters.gpsDeviceAvailable !== "all" && application.gps_device_available !== filters.gpsDeviceAvailable) {
      return false;
    }

    if (!search) {
      return true;
    }

    return [
      application.driver_name,
      application.phone,
      application.city,
      application.vehicle_number ?? "",
      application.service_areas ?? ""
    ].join(" ").toLowerCase().includes(search);
  });
}

function filterDrivers(drivers: DriverRecord[], filters: DriverFilters) {
  const search = filters.search.trim().toLowerCase();

  return drivers.filter((driver) => {
    if (filters.status !== "all" && driver.onboarding_status !== filters.status) {
      return false;
    }

    if (filters.availability !== "all" && driver.availability_status_text !== filters.availability) {
      return false;
    }

    if (!search) {
      return true;
    }

    return [
      driver.name,
      driver.phone,
      driver.city ?? "",
      (driver.service_areas ?? []).join(" ")
    ].join(" ").toLowerCase().includes(search);
  });
}

function filterVehicles(vehicles: VehicleRecord[], filters: VehicleFilters) {
  const search = filters.search.trim().toLowerCase();

  return vehicles.filter((vehicle) => {
    if (filters.status !== "all" && vehicle.onboarding_status !== filters.status) {
      return false;
    }

    if (filters.vehicleType !== "all" && vehicle.vehicle_type !== filters.vehicleType) {
      return false;
    }

    if (filters.gpsDeviceStatus !== "all" && vehicle.gps_device_status !== filters.gpsDeviceStatus) {
      return false;
    }

    if (!search) {
      return true;
    }

    return [
      vehicle.vehicle_number,
      vehicle.city ?? "",
      vehicle.gps_provider_name ?? "",
      vehicle.gps_device_identifier ?? ""
    ].join(" ").toLowerCase().includes(search);
  });
}

function uniqueCitiesFromDriverApplications(applications: DriverApplicationRecord[]) {
  return [...new Set(applications.map((application) => application.city).filter(Boolean))].sort();
}

function getAdWorkReference(id: string) {
  return "AW-" + id.slice(0, 8).toUpperCase();
}

function getDriverReference(id: string) {
  return "DR-" + id.slice(0, 8).toUpperCase();
}

function getVehicleReference(id: string) {
  return "VH-" + id.slice(0, 8).toUpperCase();
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function DashboardCards({ adWorks }: { adWorks: AdWorkRecord[] }) {
  const cards = [
    {
      label: "Planned ad works",
      value: adWorks.filter((adWork) => adWork.planning_status === "planned").length
    },
    {
      label: "Ready for driver assignment",
      value: adWorks.filter((adWork) => adWork.planning_status === "ready_for_driver_assignment").length
    },
    {
      label: "Premium live tracking requests",
      value: adWorks.filter((adWork) => adWork.package_interest === "premium" && adWork.live_tracking_requested === "yes").length
    },
    {
      label: "Multi-day ad works",
      value: adWorks.filter((adWork) => adWork.number_of_days > 1).length
    },
    {
      label: "On-hold ad works",
      value: adWorks.filter((adWork) => adWork.planning_status === "on_hold").length
    }
  ];

  return (
    <div className="admin-summary-grid" aria-label="Admin ad work summary">
      {cards.map((card) => (
        <div className="admin-summary-card" key={card.label}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
        </div>
      ))}
    </div>
  );
}

function EnquirySummaryCards({ enquiries }: { enquiries: EnquiryRecord[] }) {
  const todayKey = new Date().toISOString().slice(0, 10);
  const cards = [
    {
      label: "New enquiries",
      value: enquiries.filter((enquiry) => enquiry.status === "new").length
    },
    {
      label: "Follow-up needed",
      value: enquiries.filter((enquiry) => enquiry.status === "follow_up_needed").length
    },
    {
      label: "Converted",
      value: enquiries.filter((enquiry) => enquiry.status === "converted").length
    },
    {
      label: "Premium interest",
      value: enquiries.filter((enquiry) => enquiry.package_interest === "premium").length
    },
    {
      label: "Today's enquiries",
      value: enquiries.filter((enquiry) => enquiry.created_at.startsWith(todayKey)).length
    }
  ];

  return (
    <div className="admin-summary-grid" aria-label="Admin enquiry summary">
      {cards.map((card) => (
        <div className="admin-summary-card" key={card.label}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
        </div>
      ))}
    </div>
  );
}


function M4SummaryCards({ config, session }: { config: SupabaseConfig; session: AuthSession }) {
  const [applications, setApplications] = useState<DriverApplicationRecord[]>([]);
  const [drivers, setDrivers] = useState<DriverRecord[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      const [applicationRows, driverRows, vehicleRows] = await Promise.all([
        fetchDriverApplications(config, session),
        fetchDrivers(config, session),
        fetchVehicles(config, session)
      ]);

      if (!cancelled) {
        setApplications(applicationRows);
        setDrivers(driverRows);
        setVehicles(vehicleRows);
      }
    }

    loadSummary().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [config, session]);

  const cards = [
    {
      label: "New driver applications",
      value: applications.filter((application) => application.status === "new").length
    },
    {
      label: "Approved drivers",
      value: drivers.filter((driver) => driver.onboarding_status === "approved").length
    },
    {
      label: "Approved vehicles",
      value: vehicles.filter((vehicle) => vehicle.onboarding_status === "approved").length
    },
    {
      label: "Vehicles with mic system",
      value: vehicles.filter((vehicle) => vehicle.mic_system_available || vehicle.mic_available).length
    },
    {
      label: "Vehicle GPS Device installed",
      value: vehicles.filter((vehicle) => vehicle.gps_device_status === "installed").length
    },
    {
      label: "Follow-up applications",
      value: applications.filter((application) => application.follow_up_date).length
    }
  ];

  return (
    <div className="admin-summary-grid" aria-label="Driver and vehicle onboarding summary">
      {cards.map((card) => (
        <div className="admin-summary-card" key={card.label}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
        </div>
      ))}
    </div>
  );
}

function DriverApplicationsView({ config, session }: { config: SupabaseConfig; session: AuthSession }) {
  const [applications, setApplications] = useState<DriverApplicationRecord[]>([]);
  const [filters, setFilters] = useState<DriverApplicationFilters>(emptyDriverApplicationFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DriverApplicationReviewDraft | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const selectedApplication = applications.find((application) => application.id === selectedId) ?? null;
  const filteredApplications = useMemo(() => filterDriverApplications(applications, filters), [applications, filters]);
  const cityOptions = useMemo(() => uniqueCitiesFromDriverApplications(applications), [applications]);

  async function loadApplications() {
    setIsLoading(true);
    setMessage("");

    try {
      const rows = await fetchDriverApplications(config, session);
      setApplications(rows);
      setSelectedId((current) => current ?? rows[0]?.id ?? null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load driver applications.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadApplications();
  }, [config, session]);

  useEffect(() => {
    setDraft(selectedApplication ? toDriverApplicationDraft(selectedApplication) : null);
  }, [selectedApplication]);

  async function handleReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedApplication || !draft) {
      return;
    }

    setIsSaving(true);
    setMessage("");

    try {
      const result = await reviewDriverApplication(config, session, selectedApplication.id, draft);
      await loadApplications();
      setMessage(result[0]?.result_message ?? "Driver application updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save driver application review.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="admin-lead-layout">
      <section className="lead-list-panel" aria-labelledby="driver-application-list-title">
        <div className="panel-heading">
          <h2 id="driver-application-list-title">Driver Applications</h2>
          <span>{filteredApplications.length} shown</span>
        </div>

        <div className="admin-filter-grid" aria-label="Driver application filters">
          <label>
            Search
            <input
              value={filters.search}
              placeholder="Name, mobile, vehicle"
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            />
          </label>
          <label>
            Status
            <select
              value={filters.status}
              onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
            >
              <option value="all">All statuses</option>
              {driverApplicationStatusOptions.map((status) => (
                <option key={status} value={status}>{getDriverApplicationStatusLabel(status)}</option>
              ))}
            </select>
          </label>
          <label>
            City/town
            <select
              value={filters.city}
              onChange={(event) => setFilters((current) => ({ ...current, city: event.target.value }))}
            >
              <option value="all">All cities</option>
              {cityOptions.map((city) => <option key={city} value={city}>{city}</option>)}
            </select>
          </label>
          <label>
            Vehicle type
            <select
              value={filters.vehicleType}
              onChange={(event) => setFilters((current) => ({ ...current, vehicleType: event.target.value }))}
            >
              <option value="all">All vehicle types</option>
              {vehicleTypeOptions.map((option) => (
                <option key={option} value={option}>{vehicleTypeLabels[option]}</option>
              ))}
            </select>
          </label>
          <label>
            Vehicle GPS Device
            <select
              value={filters.gpsDeviceAvailable}
              onChange={(event) => setFilters((current) => ({ ...current, gpsDeviceAvailable: event.target.value }))}
            >
              <option value="all">All answers</option>
              {yesNoNotSureOptions.map((option) => (
                <option key={option} value={option}>{yesNoNotSureLabels[option]}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="lead-list">
          {filteredApplications.map((application) => (
            <button
              className={application.id === selectedId ? "lead-row is-selected" : "lead-row"}
              type="button"
              key={application.id}
              onClick={() => setSelectedId(application.id)}
            >
              <span>
                <strong>{application.driver_name}</strong>
                <small>{application.vehicle_number || "No vehicle number"}</small>
              </span>
              <span>{application.phone}</span>
              <span>{application.city}</span>
              <span>{vehicleTypeLabels[application.vehicle_type]}</span>
              <span>{application.mic_system_available ? "Mic system" : "No mic system"}</span>
              <span>{yesNoNotSureLabels[application.gps_device_available]}</span>
              <span className="status-pill">{getDriverApplicationStatusLabel(application.status)}</span>
              <span>{formatDate(application.follow_up_date)}</span>
            </button>
          ))}
          {!isLoading && filteredApplications.length === 0 && (
            <p className="quiet-note">No driver applications match the current filters.</p>
          )}
        </div>
      </section>

      <section className="lead-detail-panel" aria-labelledby="driver-application-detail-title">
        {message && <p className="form-status admin-message" role="status">{message}</p>}
        {!selectedApplication || !draft ? (
          <div>
            <h2 id="driver-application-detail-title">Driver application details</h2>
            <p>Select a driver application to review.</p>
          </div>
        ) : (
          <>
            <div className="panel-heading">
              <div>
                <h2 id="driver-application-detail-title">{selectedApplication.driver_name}</h2>
                <p>{selectedApplication.phone} - {selectedApplication.city}</p>
              </div>
              <span className="status-pill">{getDriverApplicationStatusLabel(selectedApplication.status)}</span>
            </div>

            <dl className="lead-detail-grid">
              <div>
                <dt>Vehicle ownership</dt>
                <dd>{selectedApplication.vehicle_ownership.replace(/_/g, " ")}</dd>
              </div>
              <div>
                <dt>Vehicle type</dt>
                <dd>{vehicleTypeLabels[selectedApplication.vehicle_type]}</dd>
              </div>
              <div>
                <dt>Vehicle number</dt>
                <dd>{selectedApplication.vehicle_number || "Not provided"}</dd>
              </div>
              <div>
                <dt>Mic System</dt>
                <dd>{selectedApplication.mic_system_available ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt>Vehicle GPS Device</dt>
                <dd>{yesNoNotSureLabels[selectedApplication.gps_device_available]}</dd>
              </div>
              <div>
                <dt>Linked driver</dt>
                <dd>{selectedApplication.linked_driver_id ? getDriverReference(selectedApplication.linked_driver_id) : "Not linked"}</dd>
              </div>
              <div>
                <dt>Linked vehicle</dt>
                <dd>{selectedApplication.linked_vehicle_id ? getVehicleReference(selectedApplication.linked_vehicle_id) : "Not linked"}</dd>
              </div>
              <div>
                <dt>Received</dt>
                <dd>{formatDate(selectedApplication.created_at)}</dd>
              </div>
            </dl>

            <div className="lead-submitted-copy">
              <h3>{businessLabels.driver.serviceArea}</h3>
              <p>{selectedApplication.service_areas || "Not provided"}</p>
              <h3>Preferred working cities/towns</h3>
              <p>{selectedApplication.preferred_working_cities || "Not provided"}</p>
              <h3>Driver notes</h3>
              <p>{selectedApplication.notes || "No notes"}</p>
            </div>

            <form className="admin-edit-form" onSubmit={handleReview}>
              <div className="form-grid">
                <label>
                  Review status
                  <select
                    value={draft.status}
                    onChange={(event) => setDraft((current) => current && {
                      ...current,
                      status: event.target.value as DriverApplicationStatus
                    })}
                  >
                    {driverApplicationStatusOptions.map((status) => (
                      <option key={status} value={status}>{getDriverApplicationStatusLabel(status)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Follow-up date
                  <input
                    type="date"
                    value={draft.followUpDate}
                    onChange={(event) => setDraft((current) => current && {
                      ...current,
                      followUpDate: event.target.value
                    })}
                  />
                </label>
              </div>
              <label>
                Admin note
                <textarea
                  value={draft.adminNote}
                  maxLength={1200}
                  onChange={(event) => setDraft((current) => current && {
                    ...current,
                    adminNote: event.target.value
                  })}
                />
              </label>
              <label>
                Rejection reason
                <textarea
                  value={draft.rejectionReason}
                  maxLength={800}
                  onChange={(event) => setDraft((current) => current && {
                    ...current,
                    rejectionReason: event.target.value
                  })}
                />
              </label>
              <label>
                Approval note
                <textarea
                  value={draft.approvalNote}
                  maxLength={800}
                  onChange={(event) => setDraft((current) => current && {
                    ...current,
                    approvalNote: event.target.value
                  })}
                />
              </label>
              <div className="admin-action-row">
                <button className="primary-button" type="submit" disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save review"}
                </button>
                <button className="secondary-button" type="button" onClick={loadApplications} disabled={isLoading}>
                  {isLoading ? "Loading..." : "Refresh applications"}
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}

function DriversView({ config, session }: { config: SupabaseConfig; session: AuthSession }) {
  const [drivers, setDrivers] = useState<DriverRecord[]>([]);
  const [filters, setFilters] = useState<DriverFilters>(emptyDriverFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DriverDraft | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const selectedDriver = drivers.find((driver) => driver.id === selectedId) ?? null;
  const filteredDrivers = useMemo(() => filterDrivers(drivers, filters), [drivers, filters]);

  async function loadDrivers() {
    setIsLoading(true);
    setMessage("");

    try {
      const rows = await fetchDrivers(config, session);
      setDrivers(rows);
      setSelectedId((current) => current ?? rows[0]?.id ?? null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load drivers.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadDrivers();
  }, [config, session]);

  useEffect(() => {
    setDraft(selectedDriver ? toDriverDraft(selectedDriver) : null);
  }, [selectedDriver]);

  async function handleSaveDriver(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedDriver || !draft) {
      return;
    }

    setIsSaving(true);
    setMessage("");

    try {
      await updateDriverRecord(config, session, selectedDriver.id, draft);
      await loadDrivers();
      setMessage("Driver record updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save driver record.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="admin-lead-layout">
      <section className="lead-list-panel" aria-labelledby="driver-list-title">
        <div className="panel-heading">
          <h2 id="driver-list-title">Drivers</h2>
          <span>{filteredDrivers.length} shown</span>
        </div>
        <div className="admin-filter-grid" aria-label="Driver filters">
          <label>
            Search
            <input
              value={filters.search}
              placeholder="Name, mobile, city"
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            />
          </label>
          <label>
            Status
            <select
              value={filters.status}
              onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
            >
              <option value="all">All statuses</option>
              {driverStatusOptions.map((status) => (
                <option key={status} value={status}>{getDriverStatusLabel(status)}</option>
              ))}
            </select>
          </label>
          <label>
            Availability
            <select
              value={filters.availability}
              onChange={(event) => setFilters((current) => ({ ...current, availability: event.target.value }))}
            >
              <option value="all">All availability</option>
              {driverAvailabilityStatusOptions.map((status) => (
                <option key={status} value={status}>{getDriverAvailabilityStatusLabel(status)}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="lead-list">
          {filteredDrivers.map((driver) => (
            <button
              className={driver.id === selectedId ? "lead-row is-selected" : "lead-row"}
              type="button"
              key={driver.id}
              onClick={() => setSelectedId(driver.id)}
            >
              <span>
                <strong>{driver.name}</strong>
                <small>{getDriverReference(driver.id)}</small>
              </span>
              <span>{driver.phone}</span>
              <span>{driver.city || "City not set"}</span>
              <span>{getDriverAvailabilityStatusLabel(driver.availability_status_text)}</span>
              <span className="status-pill">{getDriverStatusLabel(driver.onboarding_status)}</span>
              <span>{formatDate(driver.created_at)}</span>
            </button>
          ))}
          {!isLoading && filteredDrivers.length === 0 && (
            <p className="quiet-note">No drivers match the current filters.</p>
          )}
        </div>
      </section>

      <section className="lead-detail-panel" aria-labelledby="driver-detail-title">
        {message && <p className="form-status admin-message" role="status">{message}</p>}
        {!selectedDriver || !draft ? (
          <div>
            <h2 id="driver-detail-title">Driver details</h2>
            <p>Select a driver to manage onboarding status.</p>
          </div>
        ) : (
          <form className="admin-edit-form" onSubmit={handleSaveDriver}>
            <div className="panel-heading">
              <div>
                <h2 id="driver-detail-title">{selectedDriver.name}</h2>
                <p>{selectedDriver.phone} - {selectedDriver.city || "City not set"}</p>
              </div>
              <span className="status-pill">{getDriverStatusLabel(draft.onboardingStatus)}</span>
            </div>

            <dl className="lead-detail-grid">
              <div>
                <dt>Approval status</dt>
                <dd>{selectedDriver.approval_status.replace(/_/g, " ")}</dd>
              </div>
              <div>
                <dt>Service areas</dt>
                <dd>{(selectedDriver.service_areas ?? []).join(", ") || "Not provided"}</dd>
              </div>
              <div>
                <dt>Source application</dt>
                <dd>{selectedDriver.source_application_id ? "Linked" : "Not linked"}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatDate(selectedDriver.created_at)}</dd>
              </div>
            </dl>

            <div className="form-grid">
              <label>
                Driver status
                <select
                  value={draft.onboardingStatus}
                  onChange={(event) => setDraft((current) => current && {
                    ...current,
                    onboardingStatus: event.target.value as DriverStatus
                  })}
                >
                  {driverStatusOptions.map((status) => (
                    <option key={status} value={status}>{getDriverStatusLabel(status)}</option>
                  ))}
                </select>
              </label>
              <label>
                Availability
                <select
                  value={draft.availabilityStatusText}
                  onChange={(event) => setDraft((current) => current && {
                    ...current,
                    availabilityStatusText: event.target.value as DriverAvailabilityStatus
                  })}
                >
                  {driverAvailabilityStatusOptions.map((status) => (
                    <option key={status} value={status}>{getDriverAvailabilityStatusLabel(status)}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Admin note
              <textarea
                value={draft.adminNote}
                maxLength={1200}
                onChange={(event) => setDraft((current) => current && {
                  ...current,
                  adminNote: event.target.value
                })}
              />
            </label>
            <div className="admin-action-row">
              <button className="primary-button" type="submit" disabled={isSaving}>
                {isSaving ? "Saving..." : "Save driver"}
              </button>
              <button className="secondary-button" type="button" onClick={loadDrivers} disabled={isLoading}>
                {isLoading ? "Loading..." : "Refresh drivers"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function VehiclesView({ config, session }: { config: SupabaseConfig; session: AuthSession }) {
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [filters, setFilters] = useState<VehicleFilters>(emptyVehicleFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<VehicleDraft | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === selectedId) ?? null;
  const filteredVehicles = useMemo(() => filterVehicles(vehicles, filters), [vehicles, filters]);

  async function loadVehicles() {
    setIsLoading(true);
    setMessage("");

    try {
      const rows = await fetchVehicles(config, session);
      setVehicles(rows);
      setSelectedId((current) => current ?? rows[0]?.id ?? null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load vehicles.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadVehicles();
  }, [config, session]);

  useEffect(() => {
    setDraft(selectedVehicle ? toVehicleDraft(selectedVehicle) : null);
  }, [selectedVehicle]);

  async function handleSaveVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedVehicle || !draft) {
      return;
    }

    setIsSaving(true);
    setMessage("");

    try {
      await updateVehicleRecord(config, session, selectedVehicle.id, draft);
      await loadVehicles();
      setMessage("Vehicle record updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save vehicle record.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="admin-lead-layout">
      <section className="lead-list-panel" aria-labelledby="vehicle-list-title">
        <div className="panel-heading">
          <h2 id="vehicle-list-title">Vehicles</h2>
          <span>{filteredVehicles.length} shown</span>
        </div>
        <div className="admin-filter-grid" aria-label="Vehicle filters">
          <label>
            Search
            <input
              value={filters.search}
              placeholder="Vehicle, city, device"
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            />
          </label>
          <label>
            Status
            <select
              value={filters.status}
              onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
            >
              <option value="all">All statuses</option>
              {vehicleStatusOptions.map((status) => (
                <option key={status} value={status}>{getVehicleStatusLabel(status)}</option>
              ))}
            </select>
          </label>
          <label>
            Vehicle type
            <select
              value={filters.vehicleType}
              onChange={(event) => setFilters((current) => ({ ...current, vehicleType: event.target.value }))}
            >
              <option value="all">All vehicle types</option>
              {vehicleTypeOptions.map((option) => (
                <option key={option} value={option}>{vehicleTypeLabels[option]}</option>
              ))}
            </select>
          </label>
          <label>
            Vehicle GPS Device status
            <select
              value={filters.gpsDeviceStatus}
              onChange={(event) => setFilters((current) => ({ ...current, gpsDeviceStatus: event.target.value }))}
            >
              <option value="all">All device statuses</option>
              {vehicleGpsDeviceStatusOptions.map((status) => (
                <option key={status} value={status}>{getVehicleGpsDeviceStatusLabel(status)}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="lead-list">
          {filteredVehicles.map((vehicle) => (
            <button
              className={vehicle.id === selectedId ? "lead-row is-selected" : "lead-row"}
              type="button"
              key={vehicle.id}
              onClick={() => setSelectedId(vehicle.id)}
            >
              <span>
                <strong>{vehicle.vehicle_number}</strong>
                <small>{getVehicleReference(vehicle.id)}</small>
              </span>
              <span>{vehicle.city || "City not set"}</span>
              <span>{vehicleTypeLabels[vehicle.vehicle_type]}</span>
              <span>{vehicle.mic_system_available || vehicle.mic_available ? "Mic system" : "No mic system"}</span>
              <span>{getVehicleGpsDeviceStatusLabel(vehicle.gps_device_status)}</span>
              <span className="status-pill">{getVehicleStatusLabel(vehicle.onboarding_status)}</span>
              <span>{formatDate(vehicle.created_at)}</span>
            </button>
          ))}
          {!isLoading && filteredVehicles.length === 0 && (
            <p className="quiet-note">No vehicles match the current filters.</p>
          )}
        </div>
      </section>

      <section className="lead-detail-panel" aria-labelledby="vehicle-detail-title">
        {message && <p className="form-status admin-message" role="status">{message}</p>}
        {!selectedVehicle || !draft ? (
          <div>
            <h2 id="vehicle-detail-title">Vehicle details</h2>
            <p>Select a vehicle to manage readiness.</p>
          </div>
        ) : (
          <form className="admin-edit-form" onSubmit={handleSaveVehicle}>
            <div className="panel-heading">
              <div>
                <h2 id="vehicle-detail-title">{selectedVehicle.vehicle_number}</h2>
                <p>{vehicleTypeLabels[selectedVehicle.vehicle_type]} - {selectedVehicle.city || "City not set"}</p>
              </div>
              <span className="status-pill">{getVehicleStatusLabel(draft.onboardingStatus)}</span>
            </div>

            <dl className="lead-detail-grid">
              <div>
                <dt>Linked driver</dt>
                <dd>{selectedVehicle.driver_id ? getDriverReference(selectedVehicle.driver_id) : "Not linked"}</dd>
              </div>
              <div>
                <dt>Source application</dt>
                <dd>{selectedVehicle.source_application_id ? "Linked" : "Not linked"}</dd>
              </div>
              <div>
                <dt>Active</dt>
                <dd>{selectedVehicle.active ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatDate(selectedVehicle.created_at)}</dd>
              </div>
            </dl>

            <div className="form-grid">
              <label>
                Vehicle status
                <select
                  value={draft.onboardingStatus}
                  onChange={(event) => setDraft((current) => current && {
                    ...current,
                    onboardingStatus: event.target.value as VehicleStatus
                  })}
                >
                  {vehicleStatusOptions.map((status) => (
                    <option key={status} value={status}>{getVehicleStatusLabel(status)}</option>
                  ))}
                </select>
              </label>
              <label>
                Vehicle type
                <select
                  value={draft.vehicleType}
                  onChange={(event) => setDraft((current) => current && {
                    ...current,
                    vehicleType: event.target.value as VehicleType
                  })}
                >
                  {vehicleTypeOptions.map((option) => (
                    <option key={option} value={option}>{vehicleTypeLabels[option]}</option>
                  ))}
                </select>
              </label>
              <label>
                Vehicle GPS Device
                <select
                  value={draft.gpsDeviceAvailable}
                  onChange={(event) => setDraft((current) => current && {
                    ...current,
                    gpsDeviceAvailable: event.target.value as YesNoNotSure
                  })}
                >
                  {yesNoNotSureOptions.map((option) => (
                    <option key={option} value={option}>{yesNoNotSureLabels[option]}</option>
                  ))}
                </select>
              </label>
              <label>
                Device readiness status
                <select
                  value={draft.gpsDeviceStatus}
                  onChange={(event) => setDraft((current) => current && {
                    ...current,
                    gpsDeviceStatus: event.target.value as VehicleGpsDeviceStatus
                  })}
                >
                  {vehicleGpsDeviceStatusOptions.map((status) => (
                    <option key={status} value={status}>{getVehicleGpsDeviceStatusLabel(status)}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="checkbox-grid">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={draft.micSystemAvailable}
                  onChange={(event) => setDraft((current) => current && {
                    ...current,
                    micSystemAvailable: event.target.checked
                  })}
                />
                <span>Mic System available</span>
              </label>
            </div>

            <div className="form-grid">
              <label>
                GPS provider name
                <input
                  value={draft.gpsProviderName}
                  maxLength={120}
                  onChange={(event) => setDraft((current) => current && {
                    ...current,
                    gpsProviderName: event.target.value
                  })}
                />
              </label>
              <label>
                GPS device identifier
                <input
                  value={draft.gpsDeviceIdentifier}
                  maxLength={160}
                  onChange={(event) => setDraft((current) => current && {
                    ...current,
                    gpsDeviceIdentifier: event.target.value
                  })}
                />
              </label>
            </div>

            <label>
              Admin note
              <textarea
                value={draft.adminNote}
                maxLength={1200}
                onChange={(event) => setDraft((current) => current && {
                  ...current,
                  adminNote: event.target.value
                })}
              />
            </label>
            <div className="admin-action-row">
              <button className="primary-button" type="submit" disabled={isSaving}>
                {isSaving ? "Saving..." : "Save vehicle"}
              </button>
              <button className="secondary-button" type="button" onClick={loadVehicles} disabled={isLoading}>
                {isLoading ? "Loading..." : "Refresh vehicles"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function M5SummaryCards({ config, session, adWorks }: { config: SupabaseConfig; session: AuthSession; adWorks: AdWorkRecord[] }) {
  const [assignments, setAssignments] = useState<AdWorkAssignmentRecord[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      const [assignmentRows, vehicleRows] = await Promise.all([
        fetchAdWorkAssignments(config, session),
        fetchVehicles(config, session)
      ]);

      if (!cancelled) {
        setAssignments(assignmentRows);
        setVehicles(vehicleRows);
      }
    }

    loadSummary().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [config, session]);

  const cards = [
    {
      label: "Ad Works not assigned",
      value: adWorks.filter((adWork) => {
        const assignment = toAssignmentForAdWork(assignments, adWork.id);
        return !assignment || assignment.status === "not_assigned" || assignment.status === "cancelled";
      }).length
    },
    {
      label: "Assigned Ad Works",
      value: assignments.filter((assignment) => assignment.status === "assigned").length
    },
    {
      label: "Ready for Execution",
      value: assignments.filter((assignment) => assignment.status === "ready_for_execution").length
    },
    {
      label: "Needs Review",
      value: assignments.filter((assignment) => assignment.status === "needs_review").length
    },
    {
      label: "Premium tracking requests needing review",
      value: adWorks.filter((adWork) => {
        const assignment = toAssignmentForAdWork(assignments, adWork.id);
        const vehicle = assignment ? vehicles.find((item) => item.id === assignment.vehicle_id) : null;
        return adWork.live_tracking_requested === "yes"
          && (!assignment || assignment.status !== "ready_for_execution" || !vehicle || (vehicle.gps_device_available !== "yes" && vehicle.gps_device_status !== "planned" && vehicle.gps_device_status !== "installed"));
      }).length
    }
  ];

  return (
    <div className="admin-summary-grid" aria-label="Driver and vehicle assignment summary">
      {cards.map((card) => (
        <div className="admin-summary-card" key={card.label}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
        </div>
      ))}
    </div>
  );
}

function AdWorkAssignmentPanel({
  config,
  session,
  adWork,
  dayDrafts
}: {
  config: SupabaseConfig;
  session: AuthSession;
  adWork: AdWorkRecord;
  dayDrafts: DayDraft[];
}) {
  const [drivers, setDrivers] = useState<DriverRecord[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [assignment, setAssignment] = useState<AdWorkAssignmentRecord | null>(null);
  const [draft, setDraft] = useState<AdWorkAssignmentDraft>(() => toAdWorkAssignmentDraft(null));
  const [driverFilters, setDriverFilters] = useState<DriverCandidateFilters>(emptyDriverCandidateFilters);
  const [vehicleFilters, setVehicleFilters] = useState<VehicleCandidateFilters>(emptyVehicleCandidateFilters);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  const filteredDrivers = useMemo(() => filterDriverCandidates(drivers, driverFilters), [drivers, driverFilters]);
  const filteredVehicles = useMemo(() => filterVehicleCandidates(vehicles, vehicleFilters), [vehicles, vehicleFilters]);
  const selectedDriver = drivers.find((driver) => driver.id === draft.driverId) ?? null;
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === draft.vehicleId) ?? null;
  const readiness = buildAssignmentReadiness({
    adWork: toAdWorkAssignmentReadiness(adWork),
    driver: selectedDriver ? toDriverAssignmentCandidate(selectedDriver) : null,
    vehicle: selectedVehicle ? toVehicleAssignmentCandidate(selectedVehicle) : null,
    requestedStatus: draft.status
  });
  const driverCityOptions = useMemo(() => toUniqueCitiesFromDrivers(drivers), [drivers]);
  const vehicleCityOptions = useMemo(() => toUniqueCitiesFromVehicles(vehicles), [vehicles]);

  async function loadAssignmentData() {
    setIsLoading(true);
    setMessage("");

    try {
      const [driverRows, vehicleRows, assignmentRows] = await Promise.all([
        fetchDrivers(config, session),
        fetchVehicles(config, session),
        fetchAdWorkAssignments(config, session, adWork.id)
      ]);
      const currentAssignment = assignmentRows[0] ?? null;
      setDrivers(driverRows);
      setVehicles(vehicleRows);
      setAssignment(currentAssignment);
      setDraft(toAdWorkAssignmentDraft(currentAssignment));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load assignment data.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadAssignmentData();
  }, [adWork.id]);

  async function handleSaveAssignment() {
    if (!draft.driverId || !draft.vehicleId) {
      setMessage("Choose an approved driver and approved vehicle before saving.");
      return;
    }

    setIsSaving(true);
    setMessage("");

    try {
      const result = await saveAdWorkAssignment(config, session, adWork.id, draft, readiness.warnings);
      await loadAssignmentData();
      setMessage(result[0]?.result_message ?? "Assignment saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save assignment.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="form-section" aria-labelledby="assignment-title">
      <div className="panel-heading">
        <div>
          <h3 id="assignment-title">Assign Driver and Vehicle</h3>
          <p>One approved driver and one approved vehicle apply to the full Ad Work.</p>
        </div>
        <span className="status-pill">{getAdWorkAssignmentStatusLabel(draft.status)}</span>
      </div>

      {message && <p className="form-status admin-message" role="status">{message}</p>}

      <div className="form-grid">
        <label>
          Driver search
          <input
            value={driverFilters.search}
            placeholder="Name or mobile"
            onChange={(event) => setDriverFilters((current) => ({ ...current, search: event.target.value }))}
          />
        </label>
        <label>
          Driver city/town
          <select
            value={driverFilters.city}
            onChange={(event) => setDriverFilters((current) => ({ ...current, city: event.target.value }))}
          >
            <option value="all">All cities</option>
            {driverCityOptions.map((city) => <option key={city} value={city}>{city}</option>)}
          </select>
        </label>
        <label>
          Service Area
          <input
            value={driverFilters.serviceArea}
            placeholder="Area name"
            onChange={(event) => setDriverFilters((current) => ({ ...current, serviceArea: event.target.value }))}
          />
        </label>
        <label>
          Availability
          <select
            value={driverFilters.availability}
            onChange={(event) => setDriverFilters((current) => ({ ...current, availability: event.target.value }))}
          >
            <option value="all">All availability</option>
            {driverAvailabilityStatusOptions.map((status) => (
              <option key={status} value={status}>{getDriverAvailabilityStatusLabel(status)}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="form-grid">
        <label>
          Assign Driver
          <select
            value={draft.driverId}
            onChange={(event) => setDraft((current) => ({ ...current, driverId: event.target.value }))}
          >
            <option value="">Choose approved driver</option>
            {filteredDrivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name} - {driver.phone} - {driver.city || "City not set"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Vehicle search
          <input
            value={vehicleFilters.search}
            placeholder="Vehicle number"
            onChange={(event) => setVehicleFilters((current) => ({ ...current, search: event.target.value }))}
          />
        </label>
        <label>
          Vehicle city/town
          <select
            value={vehicleFilters.city}
            onChange={(event) => setVehicleFilters((current) => ({ ...current, city: event.target.value }))}
          >
            <option value="all">All cities</option>
            {vehicleCityOptions.map((city) => <option key={city} value={city}>{city}</option>)}
          </select>
        </label>
        <label>
          Vehicle type
          <select
            value={vehicleFilters.vehicleType}
            onChange={(event) => setVehicleFilters((current) => ({ ...current, vehicleType: event.target.value }))}
          >
            <option value="all">All vehicle types</option>
            {vehicleTypeOptions.map((option) => (
              <option key={option} value={option}>{vehicleTypeLabels[option]}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="form-grid">
        <label>
          Mic System
          <select
            value={vehicleFilters.micSystem}
            onChange={(event) => setVehicleFilters((current) => ({ ...current, micSystem: event.target.value }))}
          >
            <option value="all">All</option>
            <option value="yes">Available</option>
            <option value="no">Not Available</option>
          </select>
        </label>
        <label>
          Vehicle GPS Device
          <select
            value={vehicleFilters.gpsDevice}
            onChange={(event) => setVehicleFilters((current) => ({ ...current, gpsDevice: event.target.value }))}
          >
            <option value="all">All device answers</option>
            {yesNoNotSureOptions.map((option) => (
              <option key={option} value={option}>{yesNoNotSureLabels[option]}</option>
            ))}
            {vehicleGpsDeviceStatusOptions.map((status) => (
              <option key={status} value={status}>{getVehicleGpsDeviceStatusLabel(status)}</option>
            ))}
          </select>
        </label>
        <label>
          Assign Vehicle
          <select
            value={draft.vehicleId}
            onChange={(event) => setDraft((current) => ({ ...current, vehicleId: event.target.value }))}
          >
            <option value="">Choose approved vehicle</option>
            {filteredVehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.vehicle_number} - {vehicleTypeLabels[vehicle.vehicle_type]} - {vehicle.city || "City not set"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Assignment status
          <select
            value={draft.status}
            onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as AdWorkAssignmentStatus }))}
          >
            {adWorkAssignmentStatusOptions.map((status) => (
              <option key={status} value={status}>{getAdWorkAssignmentStatusLabel(status)}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="lead-detail-grid">
        <div>
          <dt>Driver details</dt>
          <dd>{selectedDriver ? selectedDriver.name + " - " + selectedDriver.phone + " - " + (selectedDriver.city || "City not set") : "Not selected"}</dd>
        </div>
        <div>
          <dt>Driver status</dt>
          <dd>{selectedDriver ? getDriverStatusLabel(selectedDriver.onboarding_status) + " / " + getDriverAvailabilityStatusLabel(selectedDriver.availability_status_text) : "Not selected"}</dd>
        </div>
        <div>
          <dt>Service Area</dt>
          <dd>{selectedDriver ? (selectedDriver.service_areas ?? []).join(", ") || "Not provided" : "Not selected"}</dd>
        </div>
        <div>
          <dt>Vehicle details</dt>
          <dd>{selectedVehicle ? selectedVehicle.vehicle_number + " - " + vehicleTypeLabels[selectedVehicle.vehicle_type] + " - " + (selectedVehicle.city || "City not set") : "Not selected"}</dd>
        </div>
        <div>
          <dt>Vehicle status</dt>
          <dd>{selectedVehicle ? getVehicleStatusLabel(selectedVehicle.onboarding_status) : "Not selected"}</dd>
        </div>
        <div>
          <dt>Vehicle GPS Device</dt>
          <dd>{selectedVehicle ? yesNoNotSureLabels[selectedVehicle.gps_device_available] + " / " + getVehicleGpsDeviceStatusLabel(selectedVehicle.gps_device_status) : "Not selected"}</dd>
        </div>
      </div>

      <label>
        Assignment note
        <textarea
          value={draft.note}
          maxLength={1000}
          onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
        />
      </label>

      <div className="checkbox-grid">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={draft.confirmAssignmentChange}
            onChange={(event) => setDraft((current) => ({ ...current, confirmAssignmentChange: event.target.checked }))}
          />
          <span>Confirm assignment change</span>
        </label>
      </div>

      <div className="lead-submitted-copy">
        <h3>Readiness checklist</h3>
        {readiness.checks.map((check) => (
          <p key={check.label}>{check.passed ? "OK" : "Needed"} - {check.label}</p>
        ))}
        <h3>Warnings</h3>
        {readiness.warnings.length === 0 ? (
          <p>No warnings.</p>
        ) : (
          readiness.warnings.map((warning) => <p key={warning}>{warning}</p>)
        )}
      </div>

      {adWork.number_of_days > 1 && (
        <div className="lead-submitted-copy">
          <h3>Multi-day assignment</h3>
          <p>Same driver and vehicle will be used for all planned days.</p>
          {dayDrafts.map((day, index) => (
            <p key={day.id}>Day {index + 1}: {formatDate(day.workDate)} - {day.areasToCover || adWork.areas_to_cover || "Areas not set"}</p>
          ))}
        </div>
      )}

      <div className="admin-action-row">
        <button className="secondary-button" type="button" onClick={loadAssignmentData} disabled={isLoading}>
          {isLoading ? "Loading..." : "Refresh assignment"}
        </button>
        <button className="primary-button" type="button" onClick={handleSaveAssignment} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save assignment"}
        </button>
      </div>
    </section>
  );
}

function M6SummaryCards({ adWorks, adWorkDays }: { adWorks: AdWorkRecord[]; adWorkDays: AdWorkDayRecord[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const todayRows = adWorkDays.filter((day) => day.work_date === today);
  const cards = [
    {
      label: "Released Ad Works",
      value: adWorks.filter((adWork) => adWork.execution_release_status === "released_to_driver").length
    },
    {
      label: "Running Ad Works",
      value: adWorks.filter((adWork) => adWork.execution_overall_status === "running").length
    },
    {
      label: "On Break",
      value: adWorkDays.filter((day) => day.execution_status === "on_break").length
    },
    {
      label: "Completed Today",
      value: todayRows.filter((day) => day.execution_status === "completed").length
    },
    {
      label: "Issue Reported",
      value: adWorkDays.filter((day) => day.execution_status === "issue_reported").length
    },
    {
      label: "Not Started Today",
      value: todayRows.filter((day) => day.execution_status === "planned" || day.execution_status === "ready").length
    }
  ];

  return (
    <div className="admin-summary-grid" aria-label="Ad Work execution summary">
      {cards.map((card) => (
        <div className="admin-summary-card" key={card.label}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
        </div>
      ))}
    </div>
  );
}

function M7SummaryCards({ config, session }: { config: SupabaseConfig; session: AuthSession }) {
  const [proofUploads, setProofUploads] = useState<ProofUploadRecord[]>([]);
  const [customerUpdates, setCustomerUpdates] = useState<CustomerUpdateRecord[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      const [proofRows, updateRows] = await Promise.all([
        fetchAdminProofUploads(config, session),
        fetchCustomerUpdates(config, session)
      ]);

      if (!cancelled) {
        setProofUploads(proofRows);
        setCustomerUpdates(updateRows);
      }
    }

    loadSummary().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [config, session]);

  const today = new Date().toISOString().slice(0, 10);
  const cards = [
    {
      label: "Photo Proofs Today",
      value: proofUploads.filter((proof) => proof.created_at.startsWith(today)).length
    },
    {
      label: "Proofs Waiting Review",
      value: proofUploads.filter((proof) => proof.upload_status === "uploaded" && proof.review_status === "waiting_review").length
    },
    {
      label: "Approved Today",
      value: proofUploads.filter((proof) => proof.review_status === "approved" && Boolean(proof.reviewed_at?.startsWith(today))).length
    },
    {
      label: "Needs More Info",
      value: proofUploads.filter((proof) => proof.review_status === "needs_more_info").length
    },
    {
      label: "Updates Pending Sharing",
      value: customerUpdates.filter((update) => update.sharing_status === "pending_sharing").length
    },
    {
      label: "Updates Shared Today",
      value: customerUpdates.filter((update) => update.sharing_status === "shared_manually" && Boolean(update.shared_at?.startsWith(today))).length
    }
  ];

  return (
    <div className="admin-summary-grid" aria-label="Proof upload and customer update summary">
      {cards.map((card) => (
        <div className="admin-summary-card" key={card.label}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
        </div>
      ))}
    </div>
  );
}

function AdminProofReviewPanel({
  config,
  session,
  adWork,
  dayDrafts
}: {
  config: SupabaseConfig;
  session: AuthSession;
  adWork: AdWorkRecord;
  dayDrafts: DayDraft[];
}) {
  const [proofUploads, setProofUploads] = useState<ProofUploadRecord[]>([]);
  const [customerUpdates, setCustomerUpdates] = useState<CustomerUpdateRecord[]>([]);
  const [drivers, setDrivers] = useState<DriverRecord[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [sharingMethods, setSharingMethods] = useState<Record<string, CustomerUpdateSharingMethod>>({});
  const [sharingNotes, setSharingNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [savingKey, setSavingKey] = useState("");

  const daysById = useMemo(() => new Map(dayDrafts.map((day, index) => [day.id, { day, index }])), [dayDrafts]);
  const driversById = useMemo(() => new Map(drivers.map((driver) => [driver.id, driver])), [drivers]);
  const vehiclesById = useMemo(() => new Map(vehicles.map((vehicle) => [vehicle.id, vehicle])), [vehicles]);

  async function loadProofReviewData() {
    setIsLoading(true);
    setMessage("");

    try {
      const [proofRows, updateRows, driverRows, vehicleRows] = await Promise.all([
        fetchAdminProofUploads(config, session, adWork.id),
        fetchCustomerUpdates(config, session, adWork.id),
        fetchDrivers(config, session),
        fetchVehicles(config, session)
      ]);
      const nextReviewNotes: Record<string, string> = {};
      const nextSharingMethods: Record<string, CustomerUpdateSharingMethod> = {};
      const nextSharingNotes: Record<string, string> = {};

      for (const proof of proofRows) {
        nextReviewNotes[proof.id] = proof.admin_review_note ?? "";
      }

      for (const update of updateRows) {
        nextSharingMethods[update.id] = update.sharing_method ?? "manual_whatsapp";
        nextSharingNotes[update.id] = update.sharing_note ?? "";
      }

      const previewEntries = await Promise.all(proofRows
        .filter((proof) => proof.upload_status === "uploaded")
        .map(async (proof) => {
          try {
            const signedUrl = await fetchProofPhotoSignedUrl(config, session, proof.file_bucket, proof.file_path);
            return [proof.id, signedUrl] as const;
          } catch {
            return [proof.id, ""] as const;
          }
        }));

      setProofUploads(proofRows);
      setCustomerUpdates(updateRows);
      setDrivers(driverRows);
      setVehicles(vehicleRows);
      setReviewNotes(nextReviewNotes);
      setSharingMethods(nextSharingMethods);
      setSharingNotes(nextSharingNotes);
      setPreviewUrls(Object.fromEntries(previewEntries.filter((entry) => Boolean(entry[1]))));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load proof uploads.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadProofReviewData();
  }, [adWork.id]);

  async function handleReviewProof(proofUploadId: string, nextStatus: ProofReviewStatus) {
    setSavingKey("proof-" + proofUploadId + "-" + nextStatus);
    setMessage("");

    try {
      await reviewProofUpload(config, session, proofUploadId, nextStatus, reviewNotes[proofUploadId] ?? "");
      await loadProofReviewData();
      setMessage("Proof review saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save proof review.");
    } finally {
      setSavingKey("");
    }
  }

  async function handleCopyMessage(update: CustomerUpdateRecord) {
    try {
      await navigator.clipboard.writeText(update.message);
      setMessage("Customer Update copied.");
    } catch {
      setMessage("Could not copy message in this browser.");
    }
  }

  async function handleMarkShared(updateId: string) {
    setSavingKey("update-" + updateId);
    setMessage("");

    try {
      await markCustomerUpdateShared(config, session, updateId, sharingMethods[updateId] ?? "manual_whatsapp", sharingNotes[updateId] ?? "");
      await loadProofReviewData();
      setMessage("Customer Update marked as shared.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not mark Customer Update as shared.");
    } finally {
      setSavingKey("");
    }
  }

  const waitingCount = proofUploads.filter((proof) => proof.upload_status === "uploaded" && proof.review_status === "waiting_review").length;

  return (
    <section className="form-section" aria-labelledby="proof-review-title">
      <div className="panel-heading">
        <div>
          <h3 id="proof-review-title">Proof Uploads and Customer Updates</h3>
          <p>Review uploaded proof photos and manually share Customer Updates.</p>
        </div>
        <span className="status-pill">{waitingCount} waiting</span>
      </div>

      {message && <p className="form-status admin-message" role="status">{message}</p>}

      <div className="admin-action-row">
        <button className="secondary-button" type="button" onClick={() => void loadProofReviewData()} disabled={isLoading}>
          {isLoading ? "Loading..." : "Refresh proof uploads"}
        </button>
      </div>

      <div className="proof-review-layout">
        <div className="proof-review-column">
          <h4>{businessLabels.admin.proofUploads}</h4>
          <div className="proof-review-list">
            {proofUploads.length === 0 ? (
              <p className="quiet-note">No photo proof uploads yet.</p>
            ) : proofUploads.map((proof) => {
              const dayEntry = proof.ad_work_day_id ? daysById.get(proof.ad_work_day_id) : undefined;
              const driver = proof.driver_id ? driversById.get(proof.driver_id) : undefined;
              const vehicle = proof.vehicle_id ? vehiclesById.get(proof.vehicle_id) : undefined;
              const previewUrl = previewUrls[proof.id];

              return (
                <article className="proof-review-card" key={proof.id}>
                  <div className="panel-heading proof-card-heading">
                    <div>
                      <h5>{getExecutionProofNoteTypeLabel(proof.proof_type)} - {proof.area_place_name || "Area not set"}</h5>
                      <p>{formatDateTime(proof.created_at)}</p>
                    </div>
                    <span className="status-pill">{getProofReviewStatusLabel(proof.review_status)}</span>
                  </div>

                  <dl className="lead-detail-grid proof-detail-grid">
                    <div>
                      <dt>Upload status</dt>
                      <dd>{getProofUploadStatusLabel(proof.upload_status)}</dd>
                    </div>
                    <div>
                      <dt>Work day</dt>
                      <dd>{dayEntry ? "Day " + (dayEntry.index + 1) + " - " + formatDate(dayEntry.day.workDate) : "Not matched"}</dd>
                    </div>
                    <div>
                      <dt>Driver</dt>
                      <dd>{driver ? driver.name + " - " + driver.phone : "Not matched"}</dd>
                    </div>
                    <div>
                      <dt>Vehicle</dt>
                      <dd>{vehicle ? vehicle.vehicle_number : "Not matched"}</dd>
                    </div>
                    <div>
                      <dt>File</dt>
                      <dd>{proof.file_mime_type || "image"} / {proof.file_size_bytes ? Math.round(proof.file_size_bytes / 1024) + " KB" : "size not set"}</dd>
                    </div>
                    <div>
                      <dt>Reviewed</dt>
                      <dd>{formatDateTime(proof.reviewed_at)}</dd>
                    </div>
                  </dl>

                  {previewUrl ? (
                    <img className="proof-photo-preview" src={previewUrl} alt="Proof upload preview" />
                  ) : (
                    <p className="quiet-note">Secure preview is not available yet.</p>
                  )}

                  <p>{proof.note_text || "No driver note."}</p>

                  <label>
                    Admin review note
                    <textarea
                      value={reviewNotes[proof.id] ?? ""}
                      maxLength={500}
                      onChange={(event) => setReviewNotes((current) => ({ ...current, [proof.id]: event.target.value }))}
                    />
                  </label>

                  <div className="admin-action-row">
                    {proofReviewStatusOptions.filter((status) => status !== "waiting_review").map((status) => (
                      <button
                        className={status === "approved" ? "primary-button" : "secondary-button"}
                        type="button"
                        key={status}
                        disabled={Boolean(savingKey)}
                        onClick={() => void handleReviewProof(proof.id, status)}
                      >
                        {savingKey === "proof-" + proof.id + "-" + status ? "Saving..." : getProofReviewStatusLabel(status)}
                      </button>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div className="proof-review-column">
          <h4>{businessLabels.admin.customerUpdate}</h4>
          <div className="customer-update-list">
            {customerUpdates.length === 0 ? (
              <p className="quiet-note">No customer update records yet.</p>
            ) : customerUpdates.map((update) => (
              <article className="customer-update-card" key={update.id}>
                <div className="panel-heading proof-card-heading">
                  <div>
                    <h5>{update.type.replace(/_/g, " ")}</h5>
                    <p>{formatDateTime(update.created_at)}</p>
                  </div>
                  <span className="status-pill">{getCustomerUpdateSharingStatusLabel(update.sharing_status)}</span>
                </div>

                <p className="customer-update-message">{update.message}</p>

                <dl className="lead-detail-grid proof-detail-grid">
                  <div>
                    <dt>Method</dt>
                    <dd>{update.sharing_method ? getCustomerUpdateSharingMethodLabel(update.sharing_method) : "Not shared"}</dd>
                  </div>
                  <div>
                    <dt>Shared at</dt>
                    <dd>{formatDateTime(update.shared_at)}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{update.sent_status}</dd>
                  </div>
                </dl>

                <div className="admin-action-row">
                  <button className="secondary-button" type="button" onClick={() => void handleCopyMessage(update)}>
                    {businessLabels.admin.copyMessage}
                  </button>
                </div>

                <label>
                  Share method
                  <select
                    value={sharingMethods[update.id] ?? "manual_whatsapp"}
                    onChange={(event) => setSharingMethods((current) => ({ ...current, [update.id]: event.target.value as CustomerUpdateSharingMethod }))}
                  >
                    {customerUpdateSharingMethodOptions.map((method) => (
                      <option key={method} value={method}>{getCustomerUpdateSharingMethodLabel(method)}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Sharing note
                  <textarea
                    value={sharingNotes[update.id] ?? ""}
                    maxLength={500}
                    onChange={(event) => setSharingNotes((current) => ({ ...current, [update.id]: event.target.value }))}
                  />
                </label>

                <button
                  className="primary-button"
                  type="button"
                  disabled={Boolean(savingKey)}
                  onClick={() => void handleMarkShared(update.id)}
                >
                  {savingKey === "update-" + update.id ? "Saving..." : businessLabels.admin.markAsShared}
                </button>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function AdminExecutionPanel({
  config,
  session,
  adWork,
  dayDrafts,
  onReleased
}: {
  config: SupabaseConfig;
  session: AuthSession;
  adWork: AdWorkRecord;
  dayDrafts: DayDraft[];
  onReleased: () => Promise<void>;
}) {
  const [assignment, setAssignment] = useState<AdWorkAssignmentRecord | null>(null);
  const [drivers, setDrivers] = useState<DriverRecord[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [proofNotes, setProofNotes] = useState<ExecutionProofNoteRecord[]>([]);
  const [customerUpdates, setCustomerUpdates] = useState<CustomerUpdateRecord[]>([]);
  const [generatedCode, setGeneratedCode] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const assignedDriver = assignment ? drivers.find((driver) => driver.id === assignment.driver_id) ?? null : null;
  const assignedVehicle = assignment ? vehicles.find((vehicle) => vehicle.id === assignment.vehicle_id) ?? null : null;
  const readiness = buildExecutionReleaseReadiness({
    assignmentStatus: adWork.assignment_status,
    releaseStatus: adWork.execution_release_status,
    startDate: adWork.start_date,
    areasToCover: adWork.areas_to_cover,
    packageInterest: adWork.package_interest,
    driverAssigned: Boolean(assignedDriver),
    vehicleAssigned: Boolean(assignedVehicle)
  });

  async function loadExecutionData() {
    try {
      const [assignmentRows, driverRows, vehicleRows, proofRows, updateRows] = await Promise.all([
        fetchAdWorkAssignments(config, session, adWork.id),
        fetchDrivers(config, session),
        fetchVehicles(config, session),
        fetchExecutionProofNotes(config, session, adWork.id),
        fetchCustomerUpdates(config, session, adWork.id)
      ]);
      setAssignment(assignmentRows[0] ?? null);
      setDrivers(driverRows);
      setVehicles(vehicleRows);
      setProofNotes(proofRows);
      setCustomerUpdates(updateRows);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load execution details.");
    }
  }

  useEffect(() => {
    setGeneratedCode("");
    setMessage("");
    void loadExecutionData();
  }, [adWork.id]);

  async function handleRelease(revoke: boolean) {
    setIsSaving(true);
    setMessage("");

    try {
      const result = await releaseAdWorkToDriver(config, session, adWork.id, revoke);
      setGeneratedCode(result[0]?.work_access_code ?? "");
      setMessage(result[0]?.result_message ?? (revoke ? "Work access revoked." : "Ad Work released to driver."));
      await onReleased();
      await loadExecutionData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update execution release.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="form-section" aria-labelledby="execution-title">
      <div className="panel-heading">
        <div>
          <h3 id="execution-title">Execution Release</h3>
          <p>Release assigned work to the driver with a simple Work Code for manual sharing.</p>
        </div>
        <span className="status-pill">{getExecutionReleaseStatusLabel(adWork.execution_release_status)}</span>
      </div>

      {message && <p className="form-status admin-message" role="status">{message}</p>}

      <div className="lead-detail-grid">
        <div>
          <dt>Assigned driver</dt>
          <dd>{assignedDriver ? assignedDriver.name + " - " + assignedDriver.phone : "Not selected"}</dd>
        </div>
        <div>
          <dt>Assigned vehicle</dt>
          <dd>{assignedVehicle ? assignedVehicle.vehicle_number : "Not selected"}</dd>
        </div>
        <div>
          <dt>Planned dates</dt>
          <dd>{formatDate(adWork.start_date)} to {formatDate(adWork.end_date)}</dd>
        </div>
        <div>
          <dt>Work Access Code</dt>
          <dd>{generatedCode || (adWork.work_access_code_hint ? "Code ending " + adWork.work_access_code_hint : "Not generated")}</dd>
        </div>
      </div>

      <div className="lead-submitted-copy">
        <h3>Release readiness</h3>
        {readiness.checks.map((check) => (
          <p key={check.label}>{check.passed ? "OK" : "Needed"} - {check.label}</p>
        ))}
      </div>

      <div className="admin-action-row">
        <button className="primary-button" type="button" onClick={() => void handleRelease(false)} disabled={isSaving || !readiness.ready}>
          {isSaving ? "Saving..." : adWork.execution_release_status === "released_to_driver" ? "Regenerate Work Code" : "Release to Driver"}
        </button>
        <button className="secondary-button" type="button" onClick={() => void handleRelease(true)} disabled={isSaving || adWork.execution_release_status !== "released_to_driver"}>
          Revoke Work Code
        </button>
      </div>

      <div className="lead-submitted-copy">
        <h3>Execution timeline</h3>
        {dayDrafts.map((day, index) => (
          <p key={day.id}>
            Day {index + 1}: {formatDate(day.workDate)} - {getAdWorkExecutionDayStatusLabel(day.executionStatus)}
            {" | Start: "}{formatDateTime(day.executionStartedAt)}
            {" | Break: "}{formatDateTime(day.breakStartedAt)}
            {" | Resume: "}{formatDateTime(day.lastResumedAt)}
            {" | End: "}{formatDateTime(day.executionCompletedAt)}
          </p>
        ))}
      </div>

      <div className="lead-submitted-copy">
        <h3>Proof Notes</h3>
        {proofNotes.length === 0 ? (
          <p>No proof notes yet.</p>
        ) : (
          proofNotes.map((note) => (
            <p key={note.id}>{formatDateTime(note.created_at)} - {getExecutionProofNoteTypeLabel(note.proof_type)} - {note.area_place_name || "Area not set"} - {note.note_text}</p>
          ))
        )}
      </div>

      <div className="lead-submitted-copy">
        <h3>Customer update records</h3>
        {customerUpdates.length === 0 ? (
          <p>No customer update records yet.</p>
        ) : (
          customerUpdates.map((update) => (
            <p key={update.id}>{formatDateTime(update.created_at)} - {update.message}</p>
          ))
        )}
      </div>
    </section>
  );
}

function AdminShell({
  productName,
  children,
  profile,
  onLogout,
  activeView,
  onViewChange
}: {
  productName: string;
  children: ReactNode;
  profile?: AdminProfile | null;
  onLogout?: () => void;
  activeView?: AdminView;
  onViewChange?: (view: AdminView) => void;
}) {
  const navItems: { id: AdminView; label: string }[] = [
    { id: "enquiries", label: businessLabels.admin.enquiries },
    { id: "adWorks", label: businessLabels.admin.adWorks },
    { id: "driverApplications", label: businessLabels.admin.driverApplications },
    { id: "drivers", label: businessLabels.admin.drivers },
    { id: "vehicles", label: businessLabels.admin.vehicles },
    { id: "dashboard", label: businessLabels.admin.dashboard }
  ];

  return (
    <main className="page-shell admin-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label={productName + " home"}>
          {productName}
        </a>
        <div className="admin-top-actions">
          <a className="nav-link" href="/">
            Public website
          </a>
          {profile && (
            <span className="admin-user">
              {profile.display_name || "Admin"}
            </span>
          )}
          {onLogout && (
            <button className="secondary-button" type="button" onClick={onLogout}>
              Logout
            </button>
          )}
        </div>
      </header>
      {profile && activeView && onViewChange && (
        <nav className="admin-nav-tabs" aria-label="Admin navigation">
          {navItems.map((item) => (
            <button
              className={item.id === activeView ? "is-active" : ""}
              key={item.id}
              type="button"
              onClick={() => onViewChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}
      {children}
    </main>
  );
}

function AdminLogin({
  productName,
  config,
  onLogin
}: {
  productName: string;
  config: SupabaseConfig;
  onLogin: (session: AuthSession) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const session = await loginAdmin(config, email, password);
      writeStoredSession(session);
      onLogin(session);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AdminShell productName={productName}>
      <section className="work-surface admin-surface admin-login-surface" aria-labelledby="admin-login-title">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 id="admin-login-title">Admin Login</h1>
          <p>Log in to manage enquiries and planned ad works.</p>
        </div>
        <form className="admin-login-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && <p className="form-alert admin-message" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Logging in..." : "Log in"}
          </button>
        </form>
      </section>
    </AdminShell>
  );
}

export function AdminLeadManagement({ productName }: { productName: string }) {
  const config = useMemo(() => getAdminSupabaseConfig(), []);
  const [session, setSession] = useState<AuthSession | null>(() => readStoredSession());
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [activeView, setActiveView] = useState<AdminView>("enquiries");
  const [enquiries, setEnquiries] = useState<EnquiryRecord[]>([]);
  const [adWorks, setAdWorks] = useState<AdWorkRecord[]>([]);
  const [adWorkDays, setAdWorkDays] = useState<AdWorkDayRecord[]>([]);
  const [cities, setCities] = useState<CityRecord[]>([]);
  const [areas, setAreas] = useState<AreaRecord[]>([]);
  const [filters, setFilters] = useState<AdminFilters>(emptyFilters);
  const [adWorkFilters, setAdWorkFilters] = useState<AdWorkFilters>(emptyAdWorkFilters);
  const [selectedEnquiryId, setSelectedEnquiryId] = useState<string | null>(null);
  const [selectedAdWorkId, setSelectedAdWorkId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AdminDraft | null>(null);
  const [adWorkDraft, setAdWorkDraft] = useState<AdWorkDraft | null>(null);
  const [dayDrafts, setDayDrafts] = useState<DayDraft[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingAdWork, setIsCreatingAdWork] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  const selectedEnquiry = enquiries.find((enquiry) => enquiry.id === selectedEnquiryId) ?? null;
  const selectedAdWork = adWorks.find((adWork) => adWork.id === selectedAdWorkId) ?? null;
  const selectedAdWorkDays = useMemo(
    () => adWorkDays.filter((day) => day.ad_work_id === selectedAdWorkId).sort((left, right) => left.work_date.localeCompare(right.work_date)),
    [adWorkDays, selectedAdWorkId]
  );
  const enquiryCityOptions = useMemo(() => uniqueCitiesFromEnquiries(enquiries), [enquiries]);
  const adWorkCityOptions = useMemo(() => uniqueCitiesFromAdWorks(adWorks), [adWorks]);
  const filteredEnquiries = useMemo(() => filterEnquiries(enquiries, filters), [enquiries, filters]);
  const filteredAdWorks = useMemo(() => filterAdWorks(adWorks, adWorkFilters), [adWorks, adWorkFilters]);
  const existingAdWorkForSelectedEnquiry = selectedEnquiry
    ? adWorks.find((adWork) => adWork.enquiry_id === selectedEnquiry.id) ?? null
    : null;

  useEffect(() => {
    if (!selectedEnquiry) {
      setDraft(null);
      return;
    }

    setDraft(toDraft(selectedEnquiry));
  }, [selectedEnquiry]);

  useEffect(() => {
    if (!selectedAdWork) {
      setAdWorkDraft(null);
      setDayDrafts([]);
      return;
    }

    setAdWorkDraft(toAdWorkDraft(selectedAdWork));
    setDayDrafts(selectedAdWorkDays.map(toDayDraft));
  }, [selectedAdWork, selectedAdWorkDays]);

  async function loadData() {
    if (!config || !session) {
      return;
    }

    const activeConfig = config;
    const activeSession = session;

    setIsLoading(true);
    setLoadError("");

    try {
      const adminProfile = await fetchAdminProfile(activeConfig, activeSession);
      const [enquiryRows, adWorkRows, adWorkDayRows, cityRows, areaRows] = await Promise.all([
        fetchAdminEnquiries(activeConfig, activeSession),
        fetchAdminAdWorks(activeConfig, activeSession),
        fetchAdminAdWorkDays(activeConfig, activeSession),
        fetchCities(activeConfig, activeSession),
        fetchAreas(activeConfig, activeSession)
      ]);

      setProfile(adminProfile);
      setEnquiries(enquiryRows);
      setAdWorks(adWorkRows);
      setAdWorkDays(adWorkDayRows);
      setCities(cityRows);
      setAreas(areaRows);
      setSelectedEnquiryId((current) => current && enquiryRows.some((enquiry) => enquiry.id === current) ? current : enquiryRows[0]?.id ?? null);
      setSelectedAdWorkId((current) => current && adWorkRows.some((adWork) => adWork.id === current) ? current : adWorkRows[0]?.id ?? null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load admin data.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [config, session]);

  async function handleLogout() {
    if (config && session) {
      await logoutAdmin(config, session).catch(() => undefined);
    }
    clearStoredSession();
    setSession(null);
    setProfile(null);
    setEnquiries([]);
    setAdWorks([]);
    setAdWorkDays([]);
    setSelectedEnquiryId(null);
    setSelectedAdWorkId(null);
    setDraft(null);
    setAdWorkDraft(null);
    setDayDrafts([]);
    setLoadError("");
  }

  async function handleRefresh() {
    await loadData();
  }

  async function handleSaveEnquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!config || !session || !selectedEnquiry || !draft) {
      return;
    }

    setIsSaving(true);
    setSaveMessage("");

    try {
      await updateAdminEnquiry(config, session, selectedEnquiry.id, draft);
      await loadData();
      setSaveMessage("Enquiry updated.");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Could not save enquiry changes.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateAdWork() {
    if (!config || !session || !selectedEnquiry) {
      return;
    }

    if (existingAdWorkForSelectedEnquiry) {
      setSelectedAdWorkId(existingAdWorkForSelectedEnquiry.id);
      setActiveView("adWorks");
      setSaveMessage("Existing ad work opened.");
      return;
    }

    setIsCreatingAdWork(true);
    setSaveMessage("");

    try {
      const result = await createAdWorkFromEnquiry(config, session, selectedEnquiry.id);
      await loadData();
      setSelectedAdWorkId(result.adWorkId);
      setActiveView("adWorks");
      setSaveMessage(result.wasCreated ? "Ad work created." : "Existing ad work opened.");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Could not create ad work.");
    } finally {
      setIsCreatingAdWork(false);
    }
  }

  async function handleSaveAdWork(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!config || !session || !selectedAdWork || !adWorkDraft) {
      return;
    }

    const scheduleChanged =
      adWorkDraft.startDate !== (selectedAdWork.start_date ?? "") ||
      adWorkDraft.numberOfDays !== selectedAdWork.number_of_days ||
      adWorkDraft.dailyStartTime !== toTimeInput(selectedAdWork.daily_start_time) ||
      adWorkDraft.dailyEndTime !== toTimeInput(selectedAdWork.daily_end_time) ||
      adWorkDraft.areasToCover.trim() !== (selectedAdWork.areas_to_cover ?? "");

    setIsSaving(true);
    setSaveMessage("");

    try {
      await updateAdminAdWork(config, session, selectedAdWork.id, adWorkDraft);

      if (scheduleChanged && adWorkDraft.startDate) {
        await syncAdWorkDays(config, session, selectedAdWork.id, adWorkDraft);
      } else {
        await Promise.all(dayDrafts.map((day) => updateAdminAdWorkDay(config, session, day)));
      }

      await loadData();
      setSaveMessage("Ad work updated.");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Could not save ad work changes.");
    } finally {
      setIsSaving(false);
    }
  }

  function updateAdWorkDraft<K extends keyof AdWorkDraft>(field: K, value: AdWorkDraft[K]) {
    setAdWorkDraft((current) => current && { ...current, [field]: value });
  }

  function updateScheduleDate(field: "startDate" | "endDate", value: string) {
    setAdWorkDraft((current) => {
      if (!current) {
        return current;
      }

      if (field === "startDate") {
        return {
          ...current,
          startDate: value,
          endDate: getPlannedEndDate(value, current.numberOfDays)
        };
      }

      return {
        ...current,
        endDate: value
      };
    });
  }

  function updateNumberOfDays(value: number) {
    const nextDays = Number.isInteger(value) && value > 0 ? value : 1;
    setAdWorkDraft((current) => current && {
      ...current,
      numberOfDays: nextDays,
      endDate: getPlannedEndDate(current.startDate, nextDays)
    });
  }

  function updateDayDraft<K extends keyof DayDraft>(dayId: string, field: K, value: DayDraft[K]) {
    setDayDrafts((current) => current.map((day) => (
      day.id === dayId ? { ...day, [field]: value } : day
    )));
  }

  function appendAreaName(areaName: string) {
    if (!areaName) {
      return;
    }

    setAdWorkDraft((current) => current && {
      ...current,
      areasToCover: current.areasToCover.trim()
        ? current.areasToCover.trim() + ", " + areaName
        : areaName
    });
  }

  if (!config) {
    return (
      <AdminShell productName={productName}>
        <section className="work-surface admin-surface" aria-labelledby="admin-config-title">
          <p className="eyebrow">Admin</p>
          <h1 id="admin-config-title">{businessLabels.admin.leadManagement}</h1>
          <p className="form-status" role="status">Admin login is not configured in this environment.</p>
        </section>
      </AdminShell>
    );
  }

  if (!session) {
    return (
      <AdminLogin
        productName={productName}
        config={config}
        onLogin={(nextSession) => setSession(nextSession)}
      />
    );
  }

  return (
    <AdminShell
      productName={productName}
      profile={profile}
      onLogout={handleLogout}
      activeView={activeView}
      onViewChange={(view) => {
        setActiveView(view);
        setSaveMessage("");
      }}
    >
      <section className="work-surface admin-surface" aria-labelledby="admin-title">
        <div className="admin-heading">
          <div>
            <p className="eyebrow">Admin</p>
            <h1 id="admin-title">
              {activeView === "dashboard" && businessLabels.admin.dashboard}
              {activeView === "enquiries" && businessLabels.admin.enquiries}
              {activeView === "adWorks" && businessLabels.admin.adWorks}
              {activeView === "driverApplications" && businessLabels.admin.driverApplications}
              {activeView === "drivers" && businessLabels.admin.drivers}
              {activeView === "vehicles" && businessLabels.admin.vehicles}
            </h1>
            <p>
              {activeView === "dashboard" && "Review planned work and onboarding readiness before later operations."}
              {activeView === "enquiries" && "View enquiries, follow up with customers, and create planned ad work."}
              {activeView === "adWorks" && "Plan advertisement work, schedules, areas, proof needed, and customer updates."}
              {activeView === "driverApplications" && "Review driver registrations, approve records, and handle duplicate submissions."}
              {activeView === "drivers" && "Manage approved drivers and onboarding status."}
              {activeView === "vehicles" && "Manage vehicle approval, Mic System details, and Vehicle GPS Device readiness."}
            </p>
          </div>
          <button className="secondary-button" type="button" onClick={handleRefresh} disabled={isLoading}>
            {isLoading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {activeView === "dashboard" && <DashboardCards adWorks={adWorks} />}
        {activeView === "dashboard" && <M4SummaryCards config={config} session={session} />}
        {activeView === "dashboard" && <M5SummaryCards config={config} session={session} adWorks={adWorks} />}
        {activeView === "dashboard" && <M6SummaryCards adWorks={adWorks} adWorkDays={adWorkDays} />}
        {activeView === "dashboard" && <M7SummaryCards config={config} session={session} />}
        {activeView === "enquiries" && <EnquirySummaryCards enquiries={enquiries} />}

        {loadError && <p className="form-alert admin-message" role="alert">{loadError}</p>}
        {saveMessage && <p className="form-status admin-message" role="status">{saveMessage}</p>}

        {activeView === "dashboard" && (
          <section className="admin-dashboard-panel" aria-labelledby="dashboard-work-title">
            <h2 id="dashboard-work-title">Planning snapshot</h2>
            <div className="admin-dashboard-list">
              {adWorks.slice(0, 6).map((adWork) => (
                <button
                  className="dashboard-work-row"
                  type="button"
                  key={adWork.id}
                  onClick={() => {
                    setSelectedAdWorkId(adWork.id);
                    setActiveView("adWorks");
                  }}
                >
                  <span>
                    <strong>{getAdWorkReference(adWork.id)}</strong>
                    <small>{adWork.business_name || adWork.customer_name}</small>
                  </span>
                  <span>{adWork.city || "City not set"}</span>
                  <span>{formatDate(adWork.start_date)}</span>
                  <span className="status-pill">{getAdWorkStatusLabel(adWork.planning_status)}</span>
                </button>
              ))}
              {!isLoading && adWorks.length === 0 && (
                <p className="quiet-note">No ad works are planned yet.</p>
              )}
            </div>
          </section>
        )}

        {activeView === "driverApplications" && <DriverApplicationsView config={config} session={session} />}
        {activeView === "drivers" && <DriversView config={config} session={session} />}
        {activeView === "vehicles" && <VehiclesView config={config} session={session} />}

        {activeView === "enquiries" && (
          <div className="admin-lead-layout">
            <section className="lead-list-panel" aria-labelledby="lead-list-title">
              <div className="panel-heading">
                <h2 id="lead-list-title">Enquiries</h2>
                <span>{filteredEnquiries.length} shown</span>
              </div>

              <div className="admin-filter-grid" aria-label="Enquiry filters">
                <label>
                  Search
                  <input
                    value={filters.search}
                    placeholder="Name, shop, mobile"
                    onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                  />
                </label>
                <label>
                  Status
                  <select
                    value={filters.status}
                    onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
                  >
                    <option value="all">All statuses</option>
                    {enquiryStatusOptions.map((status) => (
                      <option key={status} value={status}>{getEnquiryStatusLabel(status)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  City/town
                  <select
                    value={filters.city}
                    onChange={(event) => setFilters((current) => ({ ...current, city: event.target.value }))}
                  >
                    <option value="all">All cities</option>
                    {enquiryCityOptions.map((city) => <option key={city} value={city}>{city}</option>)}
                  </select>
                </label>
                <label>
                  Package
                  <select
                    value={filters.packageInterest}
                    onChange={(event) => setFilters((current) => ({ ...current, packageInterest: event.target.value }))}
                  >
                    <option value="all">All packages</option>
                    {packageInterestOptions.map((option) => (
                      <option key={option} value={option}>{packageInterestLabels[option]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Live tracking interest
                  <select
                    value={filters.liveTracking}
                    onChange={(event) => setFilters((current) => ({ ...current, liveTracking: event.target.value }))}
                  >
                    <option value="all">All answers</option>
                    {liveTrackingNeedOptions.map((option) => (
                      <option key={option} value={option}>{liveTrackingNeedLabels[option]}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="lead-list">
                {filteredEnquiries.map((enquiry) => (
                  <button
                    className={enquiry.id === selectedEnquiryId ? "lead-row is-selected" : "lead-row"}
                    type="button"
                    key={enquiry.id}
                    onClick={() => setSelectedEnquiryId(enquiry.id)}
                  >
                    <span>
                      <strong>{enquiry.customer_name}</strong>
                      <small>{enquiry.business_name}</small>
                    </span>
                    <span>{enquiry.phone}</span>
                    <span>{enquiry.city}</span>
                    <span>{formatDate(enquiry.preferred_start_date)}</span>
                    <span>{enquiry.number_of_days} day{enquiry.number_of_days === 1 ? "" : "s"}</span>
                    <span>{packageInterestLabels[enquiry.package_interest]}</span>
                    <span>{liveTrackingNeedLabels[enquiry.live_tracking_needed]}</span>
                    <span className="status-pill">{getEnquiryStatusLabel(enquiry.status)}</span>
                    <span>{formatDate(enquiry.follow_up_date)}</span>
                  </button>
                ))}
                {!isLoading && filteredEnquiries.length === 0 && (
                  <p className="quiet-note">No enquiries match the current filters.</p>
                )}
              </div>
            </section>

            <section className="lead-detail-panel" aria-labelledby="lead-detail-title">
              {!selectedEnquiry || !draft ? (
                <div>
                  <h2 id="lead-detail-title">Lead details</h2>
                  <p>Select an enquiry to view details.</p>
                </div>
              ) : (
                <>
                  <div className="panel-heading">
                    <div>
                      <h2 id="lead-detail-title">{selectedEnquiry.business_name}</h2>
                      <p>{selectedEnquiry.customer_name} - {selectedEnquiry.phone}</p>
                    </div>
                    <span className="status-pill">{getEnquiryStatusLabel(selectedEnquiry.status)}</span>
                  </div>

                  <dl className="lead-detail-grid">
                    <div>
                      <dt>Received</dt>
                      <dd>{formatDate(selectedEnquiry.created_at)}</dd>
                    </div>
                    <div>
                      <dt>City/town</dt>
                      <dd>{selectedEnquiry.city}</dd>
                    </div>
                    <div>
                      <dt>Preferred date</dt>
                      <dd>{formatDate(selectedEnquiry.preferred_start_date)}</dd>
                    </div>
                    <div>
                      <dt>Number of days</dt>
                      <dd>{selectedEnquiry.number_of_days}</dd>
                    </div>
                    <div>
                      <dt>Package interest</dt>
                      <dd>{packageInterestLabels[selectedEnquiry.package_interest]}</dd>
                    </div>
                    <div>
                      <dt>Live tracking interest</dt>
                      <dd>{liveTrackingNeedLabels[selectedEnquiry.live_tracking_needed]}</dd>
                    </div>
                    <div>
                      <dt>Consent</dt>
                      <dd>{selectedEnquiry.consent_to_contact ? "Yes" : "No"}</dd>
                    </div>
                    <div>
                      <dt>Ad work</dt>
                      <dd>{existingAdWorkForSelectedEnquiry ? getAdWorkReference(existingAdWorkForSelectedEnquiry.id) : "Not created"}</dd>
                    </div>
                  </dl>

                  <div className="lead-submitted-copy">
                    <h3>Areas to cover</h3>
                    <p>{selectedEnquiry.required_areas || "Not provided"}</p>
                    <h3>Advertisement message/details</h3>
                    <p>{selectedEnquiry.message || "Not provided"}</p>
                    <h3>Customer notes</h3>
                    <p>{selectedEnquiry.notes || "No notes"}</p>
                  </div>

                  <form className="admin-edit-form" onSubmit={handleSaveEnquiry}>
                    <div className="form-grid">
                      <label>
                        Status
                        <select
                          value={draft.status}
                          onChange={(event) => setDraft((current) => current && {
                            ...current,
                            status: event.target.value as EnquiryStatus
                          })}
                        >
                          {enquiryStatusOptions.map((status) => (
                            <option key={status} value={status}>{getEnquiryStatusLabel(status)}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Follow-up date
                        <input
                          type="date"
                          value={draft.followUpDate}
                          onChange={(event) => setDraft((current) => current && {
                            ...current,
                            followUpDate: event.target.value
                          })}
                        />
                      </label>
                      <label>
                        Package interest
                        <select
                          value={draft.packageInterest}
                          onChange={(event) => setDraft((current) => current && {
                            ...current,
                            packageInterest: event.target.value as PackageInterest
                          })}
                        >
                          {packageInterestOptions.map((option) => (
                            <option key={option} value={option}>{packageInterestLabels[option]}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label>
                      Internal note
                      <textarea
                        value={draft.internalNote}
                        maxLength={1200}
                        onChange={(event) => setDraft((current) => current && {
                          ...current,
                          internalNote: event.target.value
                        })}
                      />
                    </label>
                    <label>
                      Admin remark
                      <textarea
                        value={draft.adminRemark}
                        maxLength={800}
                        onChange={(event) => setDraft((current) => current && {
                          ...current,
                          adminRemark: event.target.value
                        })}
                      />
                    </label>

                    <div className="admin-action-row">
                      <button className="primary-button" type="submit" disabled={isSaving}>
                        {isSaving ? "Saving..." : "Save enquiry"}
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={isCreatingAdWork}
                        onClick={handleCreateAdWork}
                      >
                        {existingAdWorkForSelectedEnquiry ? "Open Ad Work" : isCreatingAdWork ? "Creating..." : "Create Ad Work"}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </section>
          </div>
        )}

        {activeView === "adWorks" && (
          <div className="admin-lead-layout ad-work-layout">
            <section className="lead-list-panel" aria-labelledby="ad-work-list-title">
              <div className="panel-heading">
                <h2 id="ad-work-list-title">Ad Works</h2>
                <span>{filteredAdWorks.length} shown</span>
              </div>

              <div className="admin-filter-grid" aria-label="Ad work filters">
                <label>
                  Search
                  <input
                    value={adWorkFilters.search}
                    placeholder="Name, shop, mobile"
                    onChange={(event) => setAdWorkFilters((current) => ({ ...current, search: event.target.value }))}
                  />
                </label>
                <label>
                  Status
                  <select
                    value={adWorkFilters.status}
                    onChange={(event) => setAdWorkFilters((current) => ({ ...current, status: event.target.value }))}
                  >
                    <option value="all">All statuses</option>
                    {adWorkStatusOptions.map((status) => (
                      <option key={status} value={status}>{getAdWorkStatusLabel(status)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  City/town
                  <select
                    value={adWorkFilters.city}
                    onChange={(event) => setAdWorkFilters((current) => ({ ...current, city: event.target.value }))}
                  >
                    <option value="all">All cities</option>
                    {adWorkCityOptions.map((city) => <option key={city} value={city}>{city}</option>)}
                  </select>
                </label>
                <label>
                  Package
                  <select
                    value={adWorkFilters.packageInterest}
                    onChange={(event) => setAdWorkFilters((current) => ({ ...current, packageInterest: event.target.value }))}
                  >
                    <option value="all">All packages</option>
                    {packageInterestOptions.map((option) => (
                      <option key={option} value={option}>{packageInterestLabels[option]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Live tracking requested
                  <select
                    value={adWorkFilters.liveTracking}
                    onChange={(event) => setAdWorkFilters((current) => ({ ...current, liveTracking: event.target.value }))}
                  >
                    <option value="all">All answers</option>
                    {liveTrackingNeedOptions.map((option) => (
                      <option key={option} value={option}>{liveTrackingNeedLabels[option]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  From date
                  <input
                    type="date"
                    value={adWorkFilters.startDate}
                    onChange={(event) => setAdWorkFilters((current) => ({ ...current, startDate: event.target.value }))}
                  />
                </label>
                <label>
                  To date
                  <input
                    type="date"
                    value={adWorkFilters.endDate}
                    onChange={(event) => setAdWorkFilters((current) => ({ ...current, endDate: event.target.value }))}
                  />
                </label>
              </div>

              <div className="lead-list">
                {filteredAdWorks.map((adWork) => (
                  <button
                    className={adWork.id === selectedAdWorkId ? "ad-work-row is-selected" : "ad-work-row"}
                    type="button"
                    key={adWork.id}
                    onClick={() => setSelectedAdWorkId(adWork.id)}
                  >
                    <span>
                      <strong>{getAdWorkReference(adWork.id)}</strong>
                      <small>{adWork.business_name || adWork.customer_name}</small>
                    </span>
                    <span>{adWork.customer_name}</span>
                    <span>{adWork.city || "Not set"}</span>
                    <span>{packageInterestLabels[adWork.package_interest]}</span>
                    <span>{formatDate(adWork.start_date)}</span>
                    <span>{formatDate(adWork.end_date)}</span>
                    <span>{adWork.number_of_days} day{adWork.number_of_days === 1 ? "" : "s"}</span>
                    <span>{liveTrackingNeedLabels[adWork.live_tracking_requested]}</span>
                    <span className="status-pill">{getAdWorkStatusLabel(adWork.planning_status)}</span>
                    <span>{formatDate(adWork.created_at)}</span>
                  </button>
                ))}
                {!isLoading && filteredAdWorks.length === 0 && (
                  <p className="quiet-note">No ad works match the current filters.</p>
                )}
              </div>
            </section>

            <section className="lead-detail-panel ad-work-detail-panel" aria-labelledby="ad-work-detail-title">
              {!selectedAdWork || !adWorkDraft ? (
                <div>
                  <h2 id="ad-work-detail-title">Ad work details</h2>
                  <p>Select a planned ad work to view details.</p>
                </div>
              ) : (
                <form className="admin-edit-form ad-work-form" onSubmit={handleSaveAdWork}>
                  <div className="panel-heading">
                    <div>
                      <h2 id="ad-work-detail-title">{adWorkDraft.title || "Ad Work"}</h2>
                      <p>{getAdWorkReference(selectedAdWork.id)} - {adWorkDraft.customerName}</p>
                    </div>
                    <span className="status-pill">{getAdWorkStatusLabel(adWorkDraft.planningStatus)}</span>
                  </div>

                  <section className="form-section" aria-labelledby="customer-details-title">
                    <h3 id="customer-details-title">Customer details</h3>
                    <div className="form-grid">
                      <label>
                        Customer name
                        <input
                          value={adWorkDraft.customerName}
                          maxLength={80}
                          onChange={(event) => updateAdWorkDraft("customerName", event.target.value)}
                        />
                      </label>
                      <label>
                        Business/shop name
                        <input
                          value={adWorkDraft.businessName}
                          maxLength={120}
                          onChange={(event) => updateAdWorkDraft("businessName", event.target.value)}
                        />
                      </label>
                      <label>
                        Mobile number
                        <input
                          value={adWorkDraft.mobileNumber}
                          maxLength={20}
                          inputMode="tel"
                          onChange={(event) => updateAdWorkDraft("mobileNumber", event.target.value)}
                        />
                      </label>
                      <label>
                        City/town
                        <input
                          value={adWorkDraft.cityTown}
                          maxLength={80}
                          list="admin-city-options"
                          onChange={(event) => updateAdWorkDraft("cityTown", event.target.value)}
                        />
                      </label>
                    </div>
                    <datalist id="admin-city-options">
                      {cities.map((city) => <option key={city.id} value={city.name} />)}
                    </datalist>
                  </section>

                  <section className="form-section" aria-labelledby="work-details-title">
                    <h3 id="work-details-title">Work details</h3>
                    <label>
                      Ad work title
                      <input
                        value={adWorkDraft.title}
                        maxLength={160}
                        onChange={(event) => updateAdWorkDraft("title", event.target.value)}
                      />
                    </label>
                    <label>
                      Advertisement message/details
                      <textarea
                        value={adWorkDraft.advertisementDetails}
                        maxLength={1200}
                        onChange={(event) => updateAdWorkDraft("advertisementDetails", event.target.value)}
                      />
                    </label>
                    <div className="form-grid">
                      <label>
                        Package
                        <select
                          value={adWorkDraft.packageInterest}
                          onChange={(event) => updateAdWorkDraft("packageInterest", event.target.value as PackageInterest)}
                        >
                          {packageInterestOptions.map((option) => (
                            <option key={option} value={option}>{packageInterestLabels[option]}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Live tracking requested
                        <select
                          value={adWorkDraft.liveTrackingRequested}
                          onChange={(event) => updateAdWorkDraft("liveTrackingRequested", event.target.value as LiveTrackingNeed)}
                        >
                          {liveTrackingNeedOptions.map((option) => (
                            <option key={option} value={option}>{liveTrackingNeedLabels[option]}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Live tracking enabled
                        <select value="no" disabled>
                          <option value="no">No</option>
                        </select>
                      </label>
                      <label>
                        Planning status
                        <select
                          value={adWorkDraft.planningStatus}
                          onChange={(event) => updateAdWorkDraft("planningStatus", event.target.value as AdWorkStatus)}
                        >
                          {adWorkStatusOptions.map((status) => (
                            <option key={status} value={status}>{getAdWorkStatusLabel(status)}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label>
                      Special instructions
                      <textarea
                        value={adWorkDraft.specialInstructions}
                        maxLength={1000}
                        onChange={(event) => updateAdWorkDraft("specialInstructions", event.target.value)}
                      />
                    </label>
                    <label>
                      Internal planning note
                      <textarea
                        value={adWorkDraft.internalPlanningNote}
                        maxLength={1200}
                        onChange={(event) => updateAdWorkDraft("internalPlanningNote", event.target.value)}
                      />
                    </label>
                  </section>

                  <section className="form-section" aria-labelledby="schedule-title">
                    <h3 id="schedule-title">Schedule</h3>
                    <div className="form-grid">
                      <label>
                        Start date
                        <input
                          type="date"
                          value={adWorkDraft.startDate}
                          onChange={(event) => updateScheduleDate("startDate", event.target.value)}
                        />
                      </label>
                      <label>
                        End date
                        <input
                          type="date"
                          value={adWorkDraft.endDate}
                          onChange={(event) => updateScheduleDate("endDate", event.target.value)}
                        />
                      </label>
                      <label>
                        Number of days
                        <input
                          type="number"
                          min="1"
                          max="60"
                          value={adWorkDraft.numberOfDays}
                          onChange={(event) => updateNumberOfDays(Number(event.target.value))}
                        />
                      </label>
                      <label>
                        Daily start time
                        <input
                          type="time"
                          value={adWorkDraft.dailyStartTime}
                          onChange={(event) => updateAdWorkDraft("dailyStartTime", event.target.value)}
                        />
                      </label>
                      <label>
                        Daily end time
                        <input
                          type="time"
                          value={adWorkDraft.dailyEndTime}
                          onChange={(event) => updateAdWorkDraft("dailyEndTime", event.target.value)}
                        />
                      </label>
                    </div>
                  </section>

                  <section className="form-section" aria-labelledby="areas-title">
                    <h3 id="areas-title">Areas to Cover</h3>
                    <div className="form-grid">
                      <label>
                        Existing area
                        <select defaultValue="" onChange={(event) => {
                          appendAreaName(event.target.value);
                          event.target.value = "";
                        }}>
                          <option value="">Add existing area</option>
                          {areas.map((area) => {
                            const city = cities.find((cityOption) => cityOption.id === area.city_id);
                            return (
                              <option key={area.id} value={area.name}>
                                {city ? city.name + " - " + area.name : area.name}
                              </option>
                            );
                          })}
                        </select>
                      </label>
                      <label>
                        Custom area text
                        <input
                          value=""
                          placeholder="Type in Areas to Cover below"
                          readOnly
                        />
                      </label>
                    </div>
                    <label>
                      Areas to cover
                      <textarea
                        value={adWorkDraft.areasToCover}
                        maxLength={1000}
                        onChange={(event) => updateAdWorkDraft("areasToCover", event.target.value)}
                      />
                    </label>
                  </section>

                  <section className="form-section" aria-labelledby="day-wise-title">
                    <h3 id="day-wise-title">Day-wise schedule</h3>
                    <div className="day-schedule-list">
                      {dayDrafts.map((day, index) => (
                        <div className="day-schedule-row" key={day.id}>
                          <strong>Day {index + 1}</strong>
                          <label>
                            Date
                            <input
                              type="date"
                              value={day.workDate}
                              onChange={(event) => updateDayDraft(day.id, "workDate", event.target.value)}
                            />
                          </label>
                          <label>
                            Start time
                            <input
                              type="time"
                              value={day.plannedStartTime}
                              onChange={(event) => updateDayDraft(day.id, "plannedStartTime", event.target.value)}
                            />
                          </label>
                          <label>
                            End time
                            <input
                              type="time"
                              value={day.plannedEndTime}
                              onChange={(event) => updateDayDraft(day.id, "plannedEndTime", event.target.value)}
                            />
                          </label>
                          <label>
                            Areas to cover
                            <textarea
                              value={day.areasToCover}
                              onChange={(event) => updateDayDraft(day.id, "areasToCover", event.target.value)}
                            />
                          </label>
                          <label>
                            Day note
                            <textarea
                              value={day.dayNote}
                              onChange={(event) => updateDayDraft(day.id, "dayNote", event.target.value)}
                            />
                          </label>
                          <span className="status-pill">{day.planningStatus === "planned" ? "Planned" : day.planningStatus}</span>
                        </div>
                      ))}
                      {dayDrafts.length === 0 && (
                        <p className="quiet-note">Save a start date and number of days to create day-wise rows.</p>
                      )}
                    </div>
                  </section>

                  <AdWorkAssignmentPanel
                    config={config}
                    session={session}
                    adWork={selectedAdWork}
                    dayDrafts={dayDrafts}
                  />

                  <AdminExecutionPanel
                    config={config}
                    session={session}
                    adWork={selectedAdWork}
                    dayDrafts={dayDrafts}
                    onReleased={loadData}
                  />

                  <AdminProofReviewPanel
                    config={config}
                    session={session}
                    adWork={selectedAdWork}
                    dayDrafts={dayDrafts}
                  />

                  <section className="form-section" aria-labelledby="proof-plan-title">
                    <h3 id="proof-plan-title">Proof Needed</h3>
                    <div className="checkbox-grid">
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={adWorkDraft.photoProofNeeded}
                          onChange={(event) => updateAdWorkDraft("photoProofNeeded", event.target.checked)}
                        />
                        <span>Photo proof needed</span>
                      </label>
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={adWorkDraft.audioVideoProofNeeded}
                          onChange={(event) => updateAdWorkDraft("audioVideoProofNeeded", event.target.checked)}
                        />
                        <span>Audio/video proof needed</span>
                      </label>
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={adWorkDraft.areaUpdateNeeded}
                          onChange={(event) => updateAdWorkDraft("areaUpdateNeeded", event.target.checked)}
                        />
                        <span>Area update needed</span>
                      </label>
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={adWorkDraft.finalReportNeeded}
                          onChange={(event) => updateAdWorkDraft("finalReportNeeded", event.target.checked)}
                        />
                        <span>Final report needed</span>
                      </label>
                    </div>
                  </section>

                  <section className="form-section" aria-labelledby="customer-update-title">
                    <h3 id="customer-update-title">Customer Updates</h3>
                    <div className="checkbox-grid">
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={adWorkDraft.customerUpdateScheduled}
                          onChange={(event) => updateAdWorkDraft("customerUpdateScheduled", event.target.checked)}
                        />
                        <span>Scheduled update</span>
                      </label>
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={adWorkDraft.customerUpdateStarted}
                          onChange={(event) => updateAdWorkDraft("customerUpdateStarted", event.target.checked)}
                        />
                        <span>Started update</span>
                      </label>
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={adWorkDraft.customerUpdateInProgress}
                          onChange={(event) => updateAdWorkDraft("customerUpdateInProgress", event.target.checked)}
                        />
                        <span>In-progress update</span>
                      </label>
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={adWorkDraft.customerUpdateAreaCovered}
                          onChange={(event) => updateAdWorkDraft("customerUpdateAreaCovered", event.target.checked)}
                        />
                        <span>Area covered update</span>
                      </label>
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={adWorkDraft.customerUpdateCompleted}
                          onChange={(event) => updateAdWorkDraft("customerUpdateCompleted", event.target.checked)}
                        />
                        <span>Completed update</span>
                      </label>
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={adWorkDraft.customerUpdateReportReady}
                          onChange={(event) => updateAdWorkDraft("customerUpdateReportReady", event.target.checked)}
                        />
                        <span>Report ready update</span>
                      </label>
                    </div>
                  </section>

                  <div className="admin-action-row sticky-action-row">
                    <button className="primary-button" type="submit" disabled={isSaving}>
                      {isSaving ? "Saving..." : "Save ad work"}
                    </button>
                  </div>
                </form>
              )}
            </section>
          </div>
        )}
      </section>
    </AdminShell>
  );
}
