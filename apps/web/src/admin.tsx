import { useEffect, useMemo, useState } from "react";
import "./admin-workflow.css";
import type { FormEvent, ReactNode } from "react";
import { BrainCircuit, CheckCircle2, ClipboardCheck, Cpu, FileClock, Globe2, Inbox, LayoutDashboard, LogOut, Megaphone, RefreshCw, Truck, UserRoundCheck, Users } from "lucide-react";
import {
  adWorkAssignmentStatusOptions,
  adWorkExecutionDayStatusOptions,
  adWorkStatusOptions,
  buildAssignmentReadiness,
  buildCampaignClosureReadiness,
  buildExecutionReleaseReadiness,
  buildFinalSummaryLocationProofLines,
  businessLabels,
  campaignClosureReasonOptions,
  customerAcceptanceStatusOptions,
  customerUpdateSharingMethodOptions,
  deliveryMethods,
  deliveryMethodTemplates,
  deriveAdWorkNextAction,
  driverCanBeAssigned,
  driverApplicationStatusOptions,
  driverAvailabilityStatusOptions,
  driverStatusOptions,
  enquiryStatusOptions,
  getAdWorkAssignmentStatusLabel,
  getAdWorkExecutionDayStatusLabel,
  getAdWorkStatusLabel,
  getApprovedFinalProofs,
  getCampaignClosureReasonLabel,
  getCampaignClosureStatusLabel,
  getCustomerAcceptanceStatusLabel,
  getDriverApplicationStatusLabel,
  getDriverAvailabilityStatusLabel,
  getDriverStatusLabel,
  getGpsDeviceCredentialStatusLabel,
  getGpsDeviceLifecycleEventLabel,
  getGpsDeviceStatusLabel,
  getAllowedGpsDeviceStatusTransitions,
  gpsDeviceCredentialStatusOptions,
  gpsDeviceInstallationStatusOptions,
  gpsDeviceStatusOptions,
  maskDeviceIdentifier,
  validateGpsDeviceCode,
  validateGpsDeviceReason,
  getEnquiryStatusLabel,
  getExecutionProofNoteTypeLabel,
  getExecutionReleaseStatusLabel,
  getCustomerUpdateSharingMethodLabel,
  getCustomerUpdateSharingStatusLabel,
  getFinalSummaryShareMethodLabel,
  getFinalSummaryLocationProofActiveLabel,
  getFinalSummaryLocationProofStatusLabel,
  getFinalSummaryLocationProofSyncLabel,
  getLocationQualityLabel,
  getLocationProofReviewStatusLabel,
  getLocationProofWarningLabel,
  getPlannedEndDate,
  getDeliveryMethodRequirements,
  getProofReviewStatusLabel,
  getProofUploadStatusLabel,
  getTrackingHealthStatusLabel,
  getTrackingSessionStatusLabel,
  getTrackingStopReasonLabel,
  getVehicleGpsDeviceStatusLabel,
  getVehicleStatusLabel,
  liveTrackingNeedLabels,
  liveTrackingNeedOptions,
  packageInterestLabels,
  packageInterestOptions,
  finalSummaryShareMethodOptions,
  locationProofReviewStatusOptions,
  proofReviewStatusOptions,
  proofPhotoBucketName,
  validateProofPhotoFile,
  executionProofNoteTypeOptions,
  vehicleCanBeAssigned,
  vehicleGpsDeviceStatusOptions,
  vehicleStatusOptions,
  vehicleTypeLabels,
  vehicleTypeOptions,
  yesNoNotSureLabels,
  yesNoNotSureOptions
} from "@kootha/shared";
import { AlertsView, DeviceM22HealthPanel, TrackingHealthView } from "./admin-m22";
import { IntelligenceAdapterReadinessView } from "./admin-intelligence";
import type {
  AdWorkAssignmentStatus,
  AdWorkExecutionDayStatus,
  AdWorkStatus,
  AssignmentDriverCandidate,
  AssignmentVehicleCandidate,
  CampaignClosureReason,
  CampaignClosureStatus,
  CustomerAcceptanceStatus,
  CustomerUpdateSharingMethod,
  CustomerUpdateSharingStatus,
  DeliveryMethod,
  DriverApplicationStatus,
  DriverAvailabilityStatus,
  DriverStatus,
  GpsDeviceAdapterType,
  GpsDeviceCredentialMetadataRecord,
  GpsDeviceCredentialStatus,
  GpsDeviceLifecycleEventRecord,
  GpsDeviceRegistryRecord,
  GpsDeviceStatus,
  GpsDeviceVehicleLinkRecord,
  AdminRegisterGpsDeviceRequest,
  EnquiryStatus,
  ExecutionProofNoteType,
  ExecutionReleaseStatus,
  FinalSummaryLocationProofActiveStatus,
  FinalSummaryLocationProofStatus,
  FinalSummaryLocationProofSyncStatus,
  FinalSummaryShareMethod,
  LiveTrackingNeed,
  LocationQuality,
  LocationProofReviewStatus,
  LocationProofWarningType,
  PackageInterest,
  ProofReviewStatus,
  ProofUploadStatus,
  TrackingHealthStatus,
  TrackingSessionStatus,
  TrackingStopReason,
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
  expiresAt?: number;
  user: {
    id: string;
    email?: string;
  };
};


type AuditLogRecord = {
  id: string;
  actor_type: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
  safe_details: Record<string, unknown>;
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
  delivery_method: DeliveryMethod;
  execution_mode: "driver_app" | "admin_managed";
  driver_required: boolean;
  vehicle_required: boolean;
  speaker_required: boolean;
  areas_required: boolean;
  customer_updates_required: boolean;
  city: string | null;
  areas_to_cover: string | null;
  advertisement_details: string | null;
  package_interest: PackageInterest;
  live_tracking_requested: LiveTrackingNeed;
  live_tracking_enabled: boolean;
  mobile_location_proof_required: boolean;
  mobile_location_proof_note: string | null;
  mobile_location_tracking_mode: string;
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
  closure_status: CampaignClosureStatus;
  closure_note: string | null;
  closure_reason: CampaignClosureReason | null;
  closure_customer_accepted: CustomerAcceptanceStatus;
  closure_internal_admin_note: string | null;
  closure_ready_at: string | null;
  closure_closed_at: string | null;
  closure_closed_by: string | null;
  final_summary_reviewed: boolean;
  final_summary_shared_status: CustomerUpdateSharingStatus;
  final_summary_shared_method: FinalSummaryShareMethod | null;
  final_summary_shared_at: string | null;
  final_summary_shared_by: string | null;
  final_summary_shared_note: string | null;
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

type AdminView = "enquiries" | "adWorks" | "driverApplications" | "drivers" | "vehicles" | "devices" | "trackingHealth" | "alerts" | "intelligence" | "audit" | "dashboard";
type AdWorkWorkflowStep = "plan" | "assign" | "release" | "proof" | "close";

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
  deliveryMethod: DeliveryMethod;
  executionMode: "driver_app" | "admin_managed";
  driverRequired: boolean;
  vehicleRequired: boolean;
  speakerRequired: boolean;
  areasRequired: boolean;
  customerUpdatesRequired: boolean;
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
  vehicle_id: string | null;
  status: AdWorkAssignmentStatus;
  assignment_note: string | null;
  readiness_warnings: string[] | null;
  warning_confirmation: boolean;
  created_at: string;
  updated_at: string | null;
};

type TrackingSessionRecord = {
  id: string;
  ad_work_id: string | null;
  ad_work_day_id: string | null;
  assignment_id: string | null;
  driver_id: string | null;
  vehicle_id: string | null;
  tracking_mode: string;
  status: TrackingSessionStatus;
  started_at: string | null;
  ended_at: string | null;
  stopped_by: string | null;
  stop_reason: TrackingStopReason | null;
  last_update_at: string | null;
  point_count: number;
  quality_status: LocationQuality;
  tracking_health_status: TrackingHealthStatus;
  client_pending_point_count: number;
  client_last_capture_at: string | null;
  last_successful_sync_at: string | null;
  last_sync_attempt_at: string | null;
  sync_failure_count: number;
  sync_error_message: string | null;
  created_at: string;
  updated_at: string | null;
};

type LocationPointRecord = {
  id: string;
  tracking_session_id: string | null;
  ad_work_id: string | null;
  ad_work_day_id: string | null;
  assignment_id: string | null;
  driver_id: string | null;
  vehicle_id: string | null;
  source: string;
  recorded_at: string;
  received_at: string;
  lat: number;
  lng: number;
  accuracy_meters: number | null;
  speed: number | null;
  heading: number | null;
  quality: LocationQuality;
  client_point_id: string | null;
  created_at: string;
};

type LocationProofReviewRecord = {
  id: string;
  ad_work_id: string;
  review_status: LocationProofReviewStatus;
  review_note: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
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

type ProofUploadSlot = {
  proof_upload_id: string;
  file_bucket: string;
  file_path: string;
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

type FinalProofSummaryRecord = {
  id: string;
  ad_work_id: string;
  closure_status: CampaignClosureStatus;
  summary_text: string;
  warnings: string[] | null;
  reviewed_at: string | null;
  ready_at: string | null;
  closed_at: string | null;
  closure_reason: CampaignClosureReason | null;
  closure_note: string | null;
  customer_accepted: CustomerAcceptanceStatus;
  internal_admin_note: string | null;
  shared_status: CustomerUpdateSharingStatus;
  shared_method: FinalSummaryShareMethod | null;
  shared_at: string | null;
  shared_note: string | null;
  include_phone_location_proof: boolean;
  phone_location_proof_customer_note: string | null;
  phone_location_proof_customer_safe_confirmed: boolean;
  phone_location_proof_status: FinalSummaryLocationProofStatus;
  phone_location_proof_required: boolean;
  phone_location_proof_active_during_work: FinalSummaryLocationProofActiveStatus;
  phone_location_first_received_at: string | null;
  phone_location_last_received_at: string | null;
  phone_location_offline_sync_status: FinalSummaryLocationProofSyncStatus;
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
const adWorkWorkflowSteps: { id: AdWorkWorkflowStep; label: string; helper: string }[] = [
  { id: "plan", label: "Setup", helper: "Customer, dates, and delivery" },
  { id: "assign", label: "People", helper: "People and equipment" },
  { id: "release", label: "Work", helper: "Start or monitor work" },
  { id: "proof", label: "Proof", helper: "Photos and updates" },
  { id: "close", label: "Finish", helper: "Final summary" }
];

function getAdWorkRequirements(adWork: AdWorkRecord) {
  return {
    executionMode: adWork.execution_mode,
    driverRequired: adWork.driver_required,
    vehicleRequired: adWork.vehicle_required,
    speakerRequired: adWork.speaker_required,
    areasRequired: adWork.areas_required,
    photoProofRequired: adWork.photo_proof_needed,
    customerUpdatesRequired: adWork.customer_updates_required
  };
}

function getAdWorkNextAction(adWork: AdWorkRecord, days: readonly AdWorkDayRecord[]) {
  return deriveAdWorkNextAction({
    title: adWork.title,
    startDate: adWork.start_date,
    areasToCover: adWork.areas_to_cover,
    deliveryMethod: adWork.delivery_method,
    requirements: getAdWorkRequirements(adWork),
    assignmentReady: !adWork.driver_required || adWork.assignment_status === "ready_for_execution",
    releaseStatus: adWork.execution_release_status,
    dayStatuses: days.map((day) => day.execution_status),
    pendingProofCount: adWork.execution_overall_status === "completed" && !adWork.final_summary_reviewed ? 1 : 0,
    closureStatus: adWork.closure_status
  });
}

function getStepForAction(action: ReturnType<typeof getAdWorkNextAction>["action"]): AdWorkWorkflowStep {
  if (action === "complete_setup") return "plan";
  if (action === "choose_resources") return "assign";
  if (["send_to_driver", "start_work", "monitor_work"].includes(action)) return "release";
  if (action === "review_proof") return "proof";
  return "close";
}

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
  "delivery_method",
  "execution_mode",
  "driver_required",
  "vehicle_required",
  "speaker_required",
  "areas_required",
  "customer_updates_required",
  "city",
  "areas_to_cover",
  "advertisement_details",
  "package_interest",
  "live_tracking_requested",
  "live_tracking_enabled",
  "mobile_location_proof_required",
  "mobile_location_proof_note",
  "mobile_location_tracking_mode",
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
  "execution_completed_at",
  "closure_status",
  "closure_note",
  "closure_reason",
  "closure_customer_accepted",
  "closure_internal_admin_note",
  "closure_ready_at",
  "closure_closed_at",
  "closure_closed_by",
  "final_summary_reviewed",
  "final_summary_shared_status",
  "final_summary_shared_method",
  "final_summary_shared_at",
  "final_summary_shared_by",
  "final_summary_shared_note"
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

const trackingSessionSelectColumns = [
  "id",
  "ad_work_id",
  "ad_work_day_id",
  "assignment_id",
  "driver_id",
  "vehicle_id",
  "tracking_mode",
  "status",
  "started_at",
  "ended_at",
  "stopped_by",
  "stop_reason",
  "last_update_at",
  "point_count",
  "quality_status",
  "tracking_health_status",
  "client_pending_point_count",
  "client_last_capture_at",
  "last_successful_sync_at",
  "last_sync_attempt_at",
  "sync_failure_count",
  "sync_error_message",
  "created_at",
  "updated_at"
].join(",");

const locationPointSelectColumns = [
  "id",
  "tracking_session_id",
  "ad_work_id",
  "ad_work_day_id",
  "assignment_id",
  "driver_id",
  "vehicle_id",
  "source",
  "recorded_at",
  "received_at",
  "lat",
  "lng",
  "accuracy_meters",
  "speed",
  "heading",
  "quality",
  "client_point_id",
  "created_at"
].join(",");

const locationProofReviewSelectColumns = [
  "id",
  "ad_work_id",
  "review_status",
  "review_note",
  "reviewed_at",
  "reviewed_by",
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

const finalProofSummarySelectColumns = [
  "id",
  "ad_work_id",
  "closure_status",
  "summary_text",
  "warnings",
  "reviewed_at",
  "ready_at",
  "closed_at",
  "closure_reason",
  "closure_note",
  "customer_accepted",
  "internal_admin_note",
  "shared_status",
  "shared_method",
  "shared_at",
  "shared_note",
  "include_phone_location_proof",
  "phone_location_proof_customer_note",
  "phone_location_proof_customer_safe_confirmed",
  "phone_location_proof_status",
  "phone_location_proof_required",
  "phone_location_proof_active_during_work",
  "phone_location_first_received_at",
  "phone_location_last_received_at",
  "phone_location_offline_sync_status",
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


async function refreshAdminSession(config: SupabaseConfig, session: AuthSession): Promise<AuthSession> {
  if (!session.refreshToken) {
    throw new Error("Admin session expired.");
  }

  const response = await fetch(config.url + "/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    headers: createHeaders(config, undefined, true),
    body: JSON.stringify({ refresh_token: session.refreshToken })
  });

  if (!response.ok) {
    throw new Error("Admin session expired.");
  }

  const payload = await response.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    user?: { id?: string; email?: string };
  };

  if (!payload.access_token) {
    throw new Error("Admin session expired.");
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? session.refreshToken,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
    user: {
      id: payload.user?.id ?? session.user.id,
      email: payload.user?.email ?? session.user.email
    }
  };
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
    expires_in?: number;
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
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
    user: {
      id: payload.user.id,
      email: payload.user.email
    }
  };
}


async function adminFetch(config: SupabaseConfig, session: AuthSession, url: string, init: RequestInit = {}) {
  const request = async (activeSession: AuthSession) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", "Bearer " + activeSession.accessToken);
    return fetch(url, { ...init, headers });
  };

  const stored = readStoredSession();
  const activeSession = stored?.user.id === session.user.id ? stored : session;
  let response = await request(activeSession);
  if (response.status !== 401 || !activeSession.refreshToken) return response;

  try {
    const refreshed = await refreshAdminSession(config, activeSession);
    writeStoredSession(refreshed);
    window.dispatchEvent(new CustomEvent<AuthSession>("kootha:admin-session", { detail: refreshed }));
    response = await request(refreshed);
  } catch {
    clearStoredSession();
    window.dispatchEvent(new Event("kootha:admin-session-expired"));
  }
  return response;
}

async function logoutAdmin(config: SupabaseConfig, session: AuthSession) {
  await adminFetch(config, session, config.url + "/auth/v1/logout", {
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
  const response = await adminFetch(config, session, config.url + "/rest/v1/enquiries?select=" + enquirySelectColumns + "&order=created_at.desc", {
    headers: createHeaders(config, session.accessToken)
  });

  if (!response.ok) {
    throw new Error("Could not load enquiries.");
  }

  return await response.json() as EnquiryRecord[];
}

async function fetchAdminAdWorks(config: SupabaseConfig, session: AuthSession): Promise<AdWorkRecord[]> {
  const response = await adminFetch(config, session, config.url + "/rest/v1/ad_works?select=" + adWorkSelectColumns + "&order=created_at.desc", {
    headers: createHeaders(config, session.accessToken)
  });

  if (!response.ok) {
    throw new Error("Could not load ad works.");
  }

  return await response.json() as AdWorkRecord[];
}

async function fetchAdminAdWorkDays(config: SupabaseConfig, session: AuthSession): Promise<AdWorkDayRecord[]> {
  const response = await adminFetch(config, session, config.url + "/rest/v1/ad_work_days?select=" + adWorkDaySelectColumns + "&order=work_date.asc", {
    headers: createHeaders(config, session.accessToken)
  });

  if (!response.ok) {
    throw new Error("Could not load ad work days.");
  }

  return await response.json() as AdWorkDayRecord[];
}

async function fetchAdWorkAssignments(config: SupabaseConfig, session: AuthSession, adWorkId?: string): Promise<AdWorkAssignmentRecord[]> {
  const filter = adWorkId ? "&ad_work_id=eq." + encodeURIComponent(adWorkId) : "";
  const response = await adminFetch(config, session, config.url + "/rest/v1/ad_work_assignments?select=" + adWorkAssignmentSelectColumns + filter + "&order=created_at.desc", {
    headers: createHeaders(config, session.accessToken)
  });

  if (!response.ok) {
    throw new Error("Could not load ad work assignments.");
  }

  return await response.json() as AdWorkAssignmentRecord[];
}

async function fetchTrackingSessions(config: SupabaseConfig, session: AuthSession, adWorkId?: string): Promise<TrackingSessionRecord[]> {
  const filter = adWorkId ? "&ad_work_id=eq." + encodeURIComponent(adWorkId) : "";
  const response = await adminFetch(config, session, config.url + "/rest/v1/tracking_sessions?select=" + trackingSessionSelectColumns + filter + "&order=updated_at.desc", {
    headers: createHeaders(config, session.accessToken)
  });

  if (!response.ok) {
    throw new Error("Could not load Phone Location Proof sessions.");
  }

  return await response.json() as TrackingSessionRecord[];
}

async function fetchLocationPoints(config: SupabaseConfig, session: AuthSession, adWorkId?: string, limit = 20): Promise<LocationPointRecord[]> {
  const filter = adWorkId ? "&ad_work_id=eq." + encodeURIComponent(adWorkId) : "";
  const safeLimit = Math.max(1, Math.min(limit, 1000));
  const response = await adminFetch(config, session, config.url + "/rest/v1/location_points?select=" + locationPointSelectColumns + filter + "&order=received_at.desc&limit=" + safeLimit, {
    headers: createHeaders(config, session.accessToken)
  });

  if (!response.ok) {
    throw new Error("Could not load Phone Location Proof points.");
  }

  return await response.json() as LocationPointRecord[];
}

async function fetchLocationProofReviews(config: SupabaseConfig, session: AuthSession, adWorkId?: string): Promise<LocationProofReviewRecord[]> {
  const filter = adWorkId ? "&ad_work_id=eq." + encodeURIComponent(adWorkId) : "";
  const response = await adminFetch(config, session, config.url + "/rest/v1/location_proof_reviews?select=" + locationProofReviewSelectColumns + filter + "&order=updated_at.desc", {
    headers: createHeaders(config, session.accessToken)
  });

  if (!response.ok) {
    throw new Error("Could not load Location Proof Review records.");
  }

  return await response.json() as LocationProofReviewRecord[];
}
async function fetchAdminProofUploads(config: SupabaseConfig, session: AuthSession, adWorkId?: string): Promise<ProofUploadRecord[]> {
  const filter = adWorkId ? "&ad_work_id=eq." + encodeURIComponent(adWorkId) : "";
  const response = await adminFetch(config, session, config.url + "/rest/v1/proof_uploads?select=" + proofUploadSelectColumns + filter + "&order=created_at.desc", {
    headers: createHeaders(config, session.accessToken)
  });

  if (!response.ok) {
    throw new Error("Could not load proof uploads.");
  }

  return await response.json() as ProofUploadRecord[];
}

async function fetchExecutionProofNotes(config: SupabaseConfig, session: AuthSession, adWorkId: string): Promise<ExecutionProofNoteRecord[]> {
  const response = await adminFetch(config, session, config.url + "/rest/v1/execution_proof_notes?select=" + executionProofNoteSelectColumns + "&ad_work_id=eq." + encodeURIComponent(adWorkId) + "&order=created_at.desc", {
    headers: createHeaders(config, session.accessToken)
  });

  if (!response.ok) {
    throw new Error("Could not load proof notes.");
  }

  return await response.json() as ExecutionProofNoteRecord[];
}

async function fetchCustomerUpdates(config: SupabaseConfig, session: AuthSession, adWorkId?: string): Promise<CustomerUpdateRecord[]> {
  const filter = adWorkId ? "&ad_work_id=eq." + encodeURIComponent(adWorkId) : "";
  const response = await adminFetch(config, session, config.url + "/rest/v1/customer_updates?select=" + customerUpdateSelectColumns + filter + "&order=created_at.desc", {
    headers: createHeaders(config, session.accessToken)
  });

  if (!response.ok) {
    throw new Error("Could not load customer update records.");
  }

  return await response.json() as CustomerUpdateRecord[];
}

async function fetchFinalProofSummaries(config: SupabaseConfig, session: AuthSession, adWorkId?: string): Promise<FinalProofSummaryRecord[]> {
  const filter = adWorkId ? "&ad_work_id=eq." + encodeURIComponent(adWorkId) : "";
  const response = await adminFetch(config, session, config.url + "/rest/v1/final_proof_summaries?select=" + finalProofSummarySelectColumns + filter + "&order=updated_at.desc", {
    headers: createHeaders(config, session.accessToken)
  });

  if (!response.ok) {
    throw new Error("Could not load Final Proof Summary records.");
  }

  return await response.json() as FinalProofSummaryRecord[];
}


async function fetchProofPhotoSignedUrl(config: SupabaseConfig, session: AuthSession, bucket: string, path: string): Promise<string> {
  const response = await adminFetch(config, session, config.url + "/storage/v1/object/sign/" + bucket + "/" + encodeStoragePath(path), {
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

async function addAdminProofPhoto(
  config: SupabaseConfig,
  session: AuthSession,
  input: {
    dayId: string;
    proofType: ExecutionProofNoteType;
    areaPlaceName: string;
    note: string;
    file: File;
  }
) {
  const prepareResponse = await adminFetch(config, session, config.url + "/rest/v1/rpc/request_admin_proof_upload", {
    method: "POST",
    headers: createHeaders(config, session.accessToken, true),
    body: JSON.stringify({
      p_ad_work_day_id: input.dayId,
      p_proof_type: input.proofType,
      p_area_place_name: input.areaPlaceName.trim() || null,
      p_note_text: input.note.trim(),
      p_file_mime_type: input.file.type,
      p_file_size_bytes: input.file.size
    })
  });

  if (!prepareResponse.ok) {
    throw new Error("Could not prepare the proof photo.");
  }

  const slots = await prepareResponse.json() as ProofUploadSlot[];
  const slot = slots[0];
  if (!slot?.proof_upload_id || slot.file_bucket !== proofPhotoBucketName) {
    throw new Error("Could not prepare the proof photo.");
  }

  const uploadResponse = await adminFetch(config, session, config.url + "/storage/v1/object/" + slot.file_bucket + "/" + encodeStoragePath(slot.file_path), {
    method: "POST",
    headers: {
      ...createHeaders(config, session.accessToken),
      "Content-Type": input.file.type,
      "x-upsert": "false"
    },
    body: input.file
  });

  if (!uploadResponse.ok) {
    throw new Error("Could not upload the proof photo.");
  }

  const completeResponse = await adminFetch(config, session, config.url + "/rest/v1/rpc/complete_admin_proof_upload", {
    method: "POST",
    headers: createHeaders(config, session.accessToken, true),
    body: JSON.stringify({ p_proof_upload_id: slot.proof_upload_id })
  });

  if (!completeResponse.ok) {
    throw new Error("The photo uploaded, but could not be added to proof review.");
  }
}

async function reviewProofUpload(
  config: SupabaseConfig,
  session: AuthSession,
  proofUploadId: string,
  reviewStatus: ProofReviewStatus,
  reviewNote: string
) {
  const response = await adminFetch(config, session, config.url + "/rest/v1/rpc/review_proof_upload", {
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
  const response = await adminFetch(config, session, config.url + "/rest/v1/rpc/mark_customer_update_shared", {
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

async function prepareFinalProofSummary(
  config: SupabaseConfig,
  session: AuthSession,
  adWorkId: string,
  finalSummaryReviewed: boolean,
  proofNotRequired: boolean,
  customerUpdatesReviewed: boolean,
  internalAdminNote: string,
  includePhoneLocationProof: boolean,
  phoneLocationProofCustomerNote: string,
  phoneLocationProofCustomerSafeConfirmed: boolean
) {
  const response = await adminFetch(config, session, config.url + "/rest/v1/rpc/prepare_flexible_final_proof_summary", {
    method: "POST",
    headers: createHeaders(config, session.accessToken, true),
    body: JSON.stringify({
      p_ad_work_id: adWorkId,
      p_final_summary_reviewed: finalSummaryReviewed,
      p_proof_not_required: proofNotRequired,
      p_customer_updates_reviewed: customerUpdatesReviewed,
      p_internal_admin_note: internalAdminNote.trim() || null,
      p_include_phone_location_proof: includePhoneLocationProof,
      p_phone_location_proof_customer_note: phoneLocationProofCustomerNote.trim() || null,
      p_phone_location_proof_customer_safe_confirmed: phoneLocationProofCustomerSafeConfirmed
    })
  });

  if (!response.ok) {
    throw new Error("Could not save Final Proof Summary.");
  }

  return await response.json() as {
    ad_work_id: string;
    final_summary_id: string;
    closure_status: CampaignClosureStatus;
    warnings: string[];
    summary_text: string;
    result_message: string;
  }[];
}

async function closeAdWorkWithFinalSummary(
  config: SupabaseConfig,
  session: AuthSession,
  adWorkId: string,
  closureReason: CampaignClosureReason | "",
  closureNote: string,
  customerAccepted: CustomerAcceptanceStatus,
  internalAdminNote: string,
  proofNotRequired: boolean,
  customerUpdatesReviewed: boolean,
  includePhoneLocationProof: boolean,
  phoneLocationProofCustomerNote: string,
  phoneLocationProofCustomerSafeConfirmed: boolean
) {
  const response = await adminFetch(config, session, config.url + "/rest/v1/rpc/close_flexible_ad_work_with_final_summary", {
    method: "POST",
    headers: createHeaders(config, session.accessToken, true),
    body: JSON.stringify({
      p_ad_work_id: adWorkId,
      p_closure_reason: closureReason || null,
      p_closure_note: closureNote.trim() || null,
      p_customer_accepted: customerAccepted,
      p_internal_admin_note: internalAdminNote.trim() || null,
      p_proof_not_required: proofNotRequired,
      p_customer_updates_reviewed: customerUpdatesReviewed,
      p_include_phone_location_proof: includePhoneLocationProof,
      p_phone_location_proof_customer_note: phoneLocationProofCustomerNote.trim() || null,
      p_phone_location_proof_customer_safe_confirmed: phoneLocationProofCustomerSafeConfirmed
    })
  });

  if (!response.ok) {
    throw new Error("Could not close Ad Work.");
  }

  return await response.json() as {
    ad_work_id: string;
    final_summary_id: string;
    closure_status: CampaignClosureStatus;
    warnings: string[];
    result_message: string;
  }[];
}

async function markFinalSummaryShared(
  config: SupabaseConfig,
  session: AuthSession,
  adWorkId: string,
  shareMethod: FinalSummaryShareMethod,
  shareNote: string
) {
  const response = await adminFetch(config, session, config.url + "/rest/v1/rpc/mark_final_summary_shared", {
    method: "POST",
    headers: createHeaders(config, session.accessToken, true),
    body: JSON.stringify({
      p_ad_work_id: adWorkId,
      p_share_method: shareMethod,
      p_share_note: shareNote.trim() || null
    })
  });

  if (!response.ok) {
    throw new Error("Could not mark Final Proof Summary as shared.");
  }

  return await response.json() as {
    ad_work_id: string;
    final_summary_id: string;
    shared_status: CustomerUpdateSharingStatus;
    result_message: string;
  }[];
}

async function releaseAdWorkToDriver(
  config: SupabaseConfig,
  session: AuthSession,
  adWorkId: string,
  revoke: boolean
) {
  const response = await adminFetch(config, session, config.url + "/rest/v1/rpc/release_flexible_ad_work_to_driver", {
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
  const response = await adminFetch(config, session, config.url + "/rest/v1/driver_applications?select=" + driverApplicationSelectColumns + "&order=created_at.desc", {
    headers: createHeaders(config, session.accessToken)
  });

  if (!response.ok) {
    throw new Error("Could not load driver applications.");
  }

  return await response.json() as DriverApplicationRecord[];
}

async function fetchDrivers(config: SupabaseConfig, session: AuthSession): Promise<DriverRecord[]> {
  const response = await adminFetch(config, session, config.url + "/rest/v1/drivers?select=" + driverSelectColumns + "&order=created_at.desc", {
    headers: createHeaders(config, session.accessToken)
  });

  if (!response.ok) {
    throw new Error("Could not load drivers.");
  }

  return await response.json() as DriverRecord[];
}

async function fetchVehicles(config: SupabaseConfig, session: AuthSession): Promise<VehicleRecord[]> {
  const response = await adminFetch(config, session, config.url + "/rest/v1/vehicles?select=" + vehicleSelectColumns + "&order=created_at.desc", {
    headers: createHeaders(config, session.accessToken)
  });

  if (!response.ok) {
    throw new Error("Could not load vehicles.");
  }

  return await response.json() as VehicleRecord[];
}

async function fetchCities(config: SupabaseConfig, session: AuthSession): Promise<CityRecord[]> {
  const response = await adminFetch(config, session, config.url + "/rest/v1/cities?select=id,name,active&active=eq.true&order=name.asc", {
    headers: createHeaders(config, session.accessToken)
  });

  if (!response.ok) {
    throw new Error("Could not load cities.");
  }

  return await response.json() as CityRecord[];
}

async function fetchAreas(config: SupabaseConfig, session: AuthSession): Promise<AreaRecord[]> {
  const response = await adminFetch(config, session, config.url + "/rest/v1/areas?select=id,city_id,name,active&active=eq.true&order=name.asc", {
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
  const response = await adminFetch(config, session, config.url + "/rest/v1/enquiries?id=eq." + encodeURIComponent(enquiryId), {
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

async function setMobileLocationProof(
  config: SupabaseConfig,
  session: AuthSession,
  adWorkId: string,
  required: boolean,
  note: string
) {
  const response = await adminFetch(config, session, config.url + "/rest/v1/rpc/set_mobile_location_proof", {
    method: "POST",
    headers: createHeaders(config, session.accessToken, true),
    body: JSON.stringify({
      p_ad_work_id: adWorkId,
      p_required: required,
      p_note: note.trim() || null
    })
  });

  if (!response.ok) {
    throw new Error("Could not save Phone Location Proof settings.");
  }

  return await response.json() as {
    ad_work_id: string;
    mobile_location_proof_required: boolean;
    mobile_location_tracking_mode: string;
    result_message: string;
  }[];
}

async function adminStopMobileTracking(
  config: SupabaseConfig,
  session: AuthSession,
  trackingSessionId: string
) {
  const response = await adminFetch(config, session, config.url + "/rest/v1/rpc/admin_stop_mobile_tracking", {
    method: "POST",
    headers: createHeaders(config, session.accessToken, true),
    body: JSON.stringify({ p_tracking_session_id: trackingSessionId })
  });

  if (!response.ok) {
    throw new Error("Could not stop Phone Location Proof.");
  }

  return await response.json() as {
    tracking_session_id: string;
    status: TrackingSessionStatus;
    stop_reason: TrackingStopReason;
    result_message: string;
  }[];
}
async function updateLocationProofReview(
  config: SupabaseConfig,
  session: AuthSession,
  adWorkId: string,
  reviewStatus: LocationProofReviewStatus,
  reviewNote: string
) {
  const response = await adminFetch(config, session, config.url + "/rest/v1/rpc/update_location_proof_review", {
    method: "POST",
    headers: createHeaders(config, session.accessToken, true),
    body: JSON.stringify({
      p_ad_work_id: adWorkId,
      p_review_status: reviewStatus,
      p_review_note: reviewNote.trim() || null
    })
  });

  if (!response.ok) {
    throw new Error("Could not save Location Proof Review.");
  }

  return await response.json() as {
    review_id: string;
    ad_work_id: string;
    review_status: LocationProofReviewStatus;
    review_note: string | null;
    reviewed_at: string | null;
    reviewed_by: string | null;
    result_message: string;
  }[];
}
async function createAdWorkFromEnquiry(
  config: SupabaseConfig,
  session: AuthSession,
  enquiryId: string
): Promise<{ adWorkId: string; wasCreated: boolean }> {
  const response = await adminFetch(config, session, config.url + "/rest/v1/rpc/create_ad_work_from_enquiry", {
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
  const response = await adminFetch(config, session, config.url + "/rest/v1/ad_works?id=eq." + encodeURIComponent(adWorkId), {
    method: "PATCH",
    headers: {
      ...createHeaders(config, session.accessToken, true),
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      customer_name: draft.customerName.trim(),
      business_name: draft.businessName.trim() || null,
      customer_phone: draft.mobileNumber.trim() || null,
      delivery_method: draft.deliveryMethod,
      execution_mode: draft.executionMode,
      driver_required: draft.driverRequired,
      vehicle_required: draft.vehicleRequired,
      speaker_required: draft.speakerRequired,
      areas_required: draft.areasRequired,
      customer_updates_required: draft.customerUpdatesRequired,
      city: draft.cityTown.trim() || null,
      title: draft.title.trim() || "Ad Work",
      advertisement_details: draft.advertisementDetails.trim() || null,
      package_interest: draft.packageInterest,
      live_tracking_requested: draft.liveTrackingRequested,
      live_tracking_enabled: false,
      customer_live_enabled: false,
      planning_status: draft.startDate && (!draft.areasRequired || draft.areasToCover.trim()) ? "ready_for_driver_assignment" : "draft",
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
  const response = await adminFetch(config, session, config.url + "/rest/v1/rpc/sync_ad_work_days", {
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
  const response = await adminFetch(config, session, config.url + "/rest/v1/rpc/save_ad_work_assignment", {
    method: "POST",
    headers: createHeaders(config, session.accessToken, true),
    body: JSON.stringify({
      p_ad_work_id: adWorkId,
      p_driver_id: draft.driverId,
      p_vehicle_id: draft.vehicleId || null,
      p_assignment_note: draft.note.trim() || null,
      p_readiness_warnings: warnings,
      p_change_confirmed: draft.confirmAssignmentChange
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
  const response = await adminFetch(config, session, config.url + "/rest/v1/ad_work_days?id=eq." + encodeURIComponent(day.id), {
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
  const response = await adminFetch(config, session, config.url + "/rest/v1/rpc/review_driver_application", {
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
  const response = await adminFetch(config, session, config.url + "/rest/v1/drivers?id=eq." + encodeURIComponent(driverId), {
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
  const response = await adminFetch(config, session, config.url + "/rest/v1/vehicles?id=eq." + encodeURIComponent(vehicleId), {
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
    deliveryMethod: adWork.delivery_method ?? "custom",
    executionMode: adWork.execution_mode ?? "admin_managed",
    driverRequired: adWork.driver_required ?? false,
    vehicleRequired: adWork.vehicle_required ?? false,
    speakerRequired: adWork.speaker_required ?? false,
    areasRequired: adWork.areas_required ?? false,
    customerUpdatesRequired: adWork.customer_updates_required ?? true,
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
    proofPlanSelected: adWork.photo_proof_needed || adWork.audio_video_proof_needed || adWork.area_update_needed || adWork.final_report_needed,
    driverRequired: adWork.driver_required,
    vehicleRequired: adWork.vehicle_required,
    speakerRequired: adWork.speaker_required,
    areasRequired: adWork.areas_required
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

const locationProofLateFirstMinutes = 15;
const locationProofLongGapMinutes = 30;
const locationProofEndGraceMinutes = 5;

function timestampMs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value);
}

function getPointTime(point: LocationPointRecord): string | null {
  return point.recorded_at ?? point.received_at ?? null;
}

function sortLocationPointsAsc(points: LocationPointRecord[]): LocationPointRecord[] {
  return [...points].sort((left, right) => (timestampMs(getPointTime(left)) ?? 0) - (timestampMs(getPointTime(right)) ?? 0));
}

function getLatestSession(sessions: TrackingSessionRecord[]): TrackingSessionRecord | null {
  return [...sessions].sort((left, right) => {
    const rightMs = timestampMs(right.updated_at ?? right.last_update_at ?? right.created_at) ?? 0;
    const leftMs = timestampMs(left.updated_at ?? left.last_update_at ?? left.created_at) ?? 0;
    return rightMs - leftMs;
  })[0] ?? null;
}

function plannedDateTimeMs(day: DayDraft, time: string | null | undefined): number | null {
  if (!day.workDate || !time) {
    return null;
  }

  const normalizedTime = time.length === 5 ? time + ":00" : time;
  return timestampMs(day.workDate + "T" + normalizedTime);
}

function uniqueLocationProofWarnings(warnings: LocationProofWarningType[]): LocationProofWarningType[] {
  return [...new Set(warnings)];
}

function getDayLocationProofWarnings(
  day: DayDraft,
  sessions: TrackingSessionRecord[],
  points: LocationPointRecord[]
): LocationProofWarningType[] {
  const warnings: LocationProofWarningType[] = [];
  const sortedPoints = sortLocationPointsAsc(points);
  const firstPoint = sortedPoints[0] ?? null;
  const latestSession = getLatestSession(sessions);

  if (points.length === 0) {
    warnings.push("no_location_points");
  }

  if (sessions.some((sessionRow) => sessionRow.status === "permission_missing" || sessionRow.tracking_health_status === "permission_missing")) {
    warnings.push("permission_missing");
  }

  if (sessions.some((sessionRow) => sessionRow.tracking_health_status === "sync_failed" || sessionRow.sync_failure_count > 0 || Boolean(sessionRow.sync_error_message))) {
    warnings.push("sync_failed");
  }

  const plannedStart = plannedDateTimeMs(day, day.plannedStartTime);
  const firstPointMs = firstPoint ? timestampMs(getPointTime(firstPoint)) : null;
  if (plannedStart !== null && firstPointMs !== null && firstPointMs - plannedStart > locationProofLateFirstMinutes * 60 * 1000) {
    warnings.push("late_first_location");
  }

  for (let index = 1; index < sortedPoints.length; index += 1) {
    const previousMs = timestampMs(getPointTime(sortedPoints[index - 1]));
    const currentMs = timestampMs(getPointTime(sortedPoints[index]));
    if (previousMs !== null && currentMs !== null && currentMs - previousMs > locationProofLongGapMinutes * 60 * 1000) {
      warnings.push("long_gap");
      break;
    }
  }

  const plannedEnd = plannedDateTimeMs(day, day.plannedEndTime);
  const endedMs = timestampMs(latestSession?.ended_at);
  if (latestSession?.status === "stopped" && day.executionStatus !== "completed" && (plannedEnd === null || endedMs === null || endedMs < plannedEnd)) {
    warnings.push("stopped_early");
  }

  const workEndMs = timestampMs(day.executionCompletedAt) ?? plannedEnd;
  if (workEndMs !== null && sortedPoints.some((point) => {
    const pointMs = timestampMs(getPointTime(point));
    return pointMs !== null && pointMs - workEndMs > locationProofEndGraceMinutes * 60 * 1000;
  })) {
    warnings.push("points_after_work_end");
  }

  return uniqueLocationProofWarnings(warnings);
}

function getOverallLocationProofWarnings(
  required: boolean,
  dayDrafts: DayDraft[],
  sessions: TrackingSessionRecord[],
  points: LocationPointRecord[]
): LocationProofWarningType[] {
  if (!required) {
    return [];
  }

  const dayWarnings = dayDrafts.flatMap((day) => {
    const daySessions = sessions.filter((sessionRow) => sessionRow.ad_work_day_id === day.id);
    const dayPoints = points.filter((point) => point.ad_work_day_id === day.id);
    return getDayLocationProofWarnings(day, daySessions, dayPoints);
  });

  const warnings = [...dayWarnings];
  if (points.length === 0) {
    warnings.push("no_location_points");
  }

  return uniqueLocationProofWarnings(warnings);
}

function getLocationProofSummaryText(adWork: AdWorkRecord, review: LocationProofReviewRecord | null): string {
  if (!adWork.mobile_location_proof_required) {
    return "Phone Location Proof: Not required";
  }

  if (review?.review_status === "reviewed" || review?.review_status === "accepted") {
    return "Phone Location Proof: Reviewed by admin";
  }

  if (review?.review_status === "needs_follow_up" || review?.review_status === "rejected") {
    return "Phone Location Proof: Needs follow-up";
  }

  if (review?.review_status === "not_required") {
    return "Phone Location Proof: Not required";
  }

  return "Phone Location Proof: Not available";
}
function getFinalSummaryLocationProofStatusForAdWork(
  adWork: AdWorkRecord,
  review: LocationProofReviewRecord | null,
  pointCount: number
): FinalSummaryLocationProofStatus {
  if (!adWork.mobile_location_proof_required) {
    return "not_required";
  }

  if (review?.review_status === "not_required") {
    return "not_required";
  }

  if (review?.review_status === "needs_follow_up" || review?.review_status === "rejected") {
    return "needs_follow_up";
  }

  if ((review?.review_status === "reviewed" || review?.review_status === "accepted") && pointCount > 0) {
    return "reviewed_by_team";
  }

  if (review?.review_status === "reviewed" || review?.review_status === "accepted") {
    return "not_available";
  }

  return "not_reviewed";
}

function getFinalSummaryLocationProofActiveStatus(
  adWork: AdWorkRecord,
  sessions: TrackingSessionRecord[],
  points: LocationPointRecord[]
): FinalSummaryLocationProofActiveStatus {
  if (points.length > 0 || sessions.some((sessionRow) => Boolean(sessionRow.started_at))) {
    return "yes";
  }

  if (adWork.mobile_location_proof_required && sessions.length === 0) {
    return "no";
  }

  return "not_confirmed";
}

function getFinalSummaryLocationProofSyncStatus(
  adWork: AdWorkRecord,
  sessions: TrackingSessionRecord[],
  points: LocationPointRecord[]
): FinalSummaryLocationProofSyncStatus {
  if (!adWork.mobile_location_proof_required) {
    return "not_applicable";
  }

  if (sessions.some((sessionRow) => sessionRow.client_pending_point_count > 0 || sessionRow.sync_failure_count > 0 || Boolean(sessionRow.sync_error_message))) {
    return "pending";
  }

  if (sessions.some((sessionRow) => Boolean(sessionRow.last_successful_sync_at)) || points.some((point) => Boolean(point.client_point_id))) {
    return "synced";
  }

  return "not_available";
}

function getLocationProofFirstReceivedAt(points: LocationPointRecord[]): string | null {
  return sortLocationPointsAsc(points)[0]?.received_at ?? null;
}

function getLocationProofLastReceivedAt(points: LocationPointRecord[]): string | null {
  const sortedPoints = sortLocationPointsAsc(points);
  return sortedPoints[sortedPoints.length - 1]?.received_at ?? null;
}

function getFinalSummaryLocationProofWarnings(
  adWork: AdWorkRecord,
  status: FinalSummaryLocationProofStatus,
  sessions: TrackingSessionRecord[],
  points: LocationPointRecord[]
): string[] {
  if (!adWork.mobile_location_proof_required) {
    return [];
  }

  const warnings: string[] = [];

  if (status === "not_reviewed") {
    warnings.push("Phone Location Proof is not reviewed.");
  }

  if (points.length === 0) {
    warnings.push("No phone location updates were received.");
  }

  if (sessions.some((sessionRow) => sessionRow.client_pending_point_count > 0 || sessionRow.sync_failure_count > 0 || Boolean(sessionRow.sync_error_message))) {
    warnings.push("Some location updates need follow-up.");
  }

  return warnings;
}

function buildPhoneLocationProofPreview(
  include: boolean,
  adWork: AdWorkRecord,
  status: FinalSummaryLocationProofStatus,
  activeDuringWork: FinalSummaryLocationProofActiveStatus,
  offlineSync: FinalSummaryLocationProofSyncStatus,
  firstReceivedAt: string | null,
  lastReceivedAt: string | null,
  teamReviewNote: string
): string {
  if (!include) {
    return "Phone Location Proof is not included in the customer summary.";
  }

  return buildFinalSummaryLocationProofLines({
    include: true,
    status,
    required: adWork.mobile_location_proof_required,
    activeDuringWork,
    firstLocationReceived: firstReceivedAt ? formatDateTime(firstReceivedAt) : null,
    lastLocationReceived: lastReceivedAt ? formatDateTime(lastReceivedAt) : null,
    offlineSync,
    teamReviewNote
  }).join("\n");
}
function OperationsDashboard({
  enquiries,
  adWorks,
  adWorkDays,
  onOpen
}: {
  enquiries: EnquiryRecord[];
  adWorks: AdWorkRecord[];
  adWorkDays: AdWorkDayRecord[];
  onOpen: (view: AdminView, step?: AdWorkWorkflowStep, adWorkId?: string) => void;
}) {
  const actions = adWorks.map((adWork) => ({ adWork, next: getAdWorkNextAction(adWork, adWorkDays.filter((day) => day.ad_work_id === adWork.id)) }));
  const queueItems: {
    label: string;
    helper: string;
    value: number;
    icon: typeof Inbox;
    view: AdminView;
    step?: AdWorkWorkflowStep;
    adWorkId?: string;
  }[] = [
    {
      label: "New enquiries",
      helper: "Call the customer and confirm the requirement",
      value: enquiries.filter((enquiry) => enquiry.status === "new" || enquiry.status === "follow_up_needed").length,
      icon: Inbox,
      view: "enquiries"
    },
    {
      label: "Needs assignment",
      helper: "Choose only the people and equipment this work needs",
      value: actions.filter(({ next }) => next.action === "choose_resources").length,
      icon: Users,
      view: "adWorks",
      step: "assign",
      adWorkId: actions.find(({ next }) => next.action === "choose_resources")?.adWork.id
    },
    {
      label: "Ready to start",
      helper: "Send to a driver or start team-managed work",
      value: actions.filter(({ next }) => next.action === "send_to_driver" || next.action === "start_work").length,
      icon: ClipboardCheck,
      view: "adWorks",
      step: "release",
      adWorkId: actions.find(({ next }) => next.action === "send_to_driver" || next.action === "start_work")?.adWork.id
    },
    {
      label: "Proof to review",
      helper: "Review completed work, photos, and updates",
      value: actions.filter(({ next }) => next.action === "review_proof").length,
      icon: Megaphone,
      view: "adWorks",
      step: "proof",
      adWorkId: actions.find(({ next }) => next.action === "review_proof")?.adWork.id
    },
    {
      label: "Ready to close",
      helper: "Check the final summary and finish the work",
      value: actions.filter(({ next }) => next.action === "finish_work").length,
      icon: ClipboardCheck,
      view: "adWorks",
      step: "close",
      adWorkId: actions.find(({ next }) => next.action === "finish_work")?.adWork.id
    }
  ];

  const activeWork = adWorks
    .filter((adWork) => adWork.execution_overall_status === "running" || adWork.execution_overall_status === "on_break")
    .slice(0, 5);

  return (
    <div className="operations-dashboard">
      <section className="operations-queue" aria-labelledby="attention-title">
        <div className="operations-section-heading">
          <div>
            <p className="eyebrow">Next actions</p>
            <h2 id="attention-title">Work needing attention</h2>
          </div>
          <p>Open a queue and complete the next required step.</p>
        </div>
        <div className="operations-queue-list">
          {queueItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.label} type="button" onClick={() => onOpen(item.view, item.step, item.adWorkId)}>
                <span className="queue-icon"><Icon size={22} aria-hidden="true" /></span>
                <span className="queue-copy"><strong>{item.label}</strong><small>{item.helper}</small></span>
                <span className="queue-count">{item.value}</span>
                <span className="queue-open">Open</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="active-work-panel" aria-labelledby="active-work-title">
        <div className="operations-section-heading compact">
          <div>
            <p className="eyebrow">In progress</p>
            <h2 id="active-work-title">Active work today</h2>
          </div>
        </div>
        {activeWork.length === 0 ? (
          <div className="operations-empty"><CheckCircle2Icon /><p>No advertisement work is currently running.</p></div>
        ) : (
          <div className="active-work-list">
            {activeWork.map((adWork) => (
              <button key={adWork.id} type="button" onClick={() => onOpen("adWorks", "release")}>
                <span><strong>{adWork.business_name || adWork.title}</strong><small>{adWork.city || "Town not set"}</small></span>
                <span className="status-pill">{adWork.execution_overall_status.replace(/_/g, " ")}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CheckCircle2Icon() {
  return <CheckCircle2 className="empty-check" aria-hidden="true" />;
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
              <span>{application.mic_system_available ? "Speaker equipment" : "No speaker equipment"}</span>
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
                <dt>Speaker equipment</dt>
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
              <span>{vehicle.mic_system_available || vehicle.mic_available ? "Speaker equipment" : "No speaker equipment"}</span>
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
                <span>Speaker equipment available</span>
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
    if (!draft.driverId || (adWork.vehicle_required && !draft.vehicleId)) {
      setMessage(adWork.vehicle_required ? "Choose an approved driver and approved vehicle before saving." : "Choose an approved driver before saving.");
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
          <h3 id="assignment-title">Choose people and equipment</h3>
          <p>Choose only what this advertisement work needs.</p>
        </div>
        <span className="status-pill">{assignment ? "Assigned" : "Not assigned"}</span>
      </div>

      {message && <p className="form-status admin-message" role="status">{message}</p>}

      <div className="form-grid assignment-primary-fields">
        <label>
          Choose driver or field worker
          <select value={draft.driverId} onChange={(event) => setDraft((current) => ({ ...current, driverId: event.target.value }))}>
            <option value="">Choose approved person</option>
            {filteredDrivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name} - {driver.city || "Town not set"}</option>)}
          </select>
        </label>
        {adWork.vehicle_required && (
          <label>
            Choose vehicle
            <select value={draft.vehicleId} onChange={(event) => setDraft((current) => ({ ...current, vehicleId: event.target.value }))}>
              <option value="">Choose approved vehicle</option>
              {filteredVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.vehicle_number} - {vehicleTypeLabels[vehicle.vehicle_type]}</option>)}
            </select>
          </label>
        )}
      </div>

      <details className="more-details-block assignment-filters">
        <summary>Search and filters</summary>
        <div className="form-grid">
          <label>Driver search<input value={driverFilters.search} placeholder="Name or mobile" onChange={(event) => setDriverFilters((current) => ({ ...current, search: event.target.value }))} /></label>
          <label>Driver city/town<select value={driverFilters.city} onChange={(event) => setDriverFilters((current) => ({ ...current, city: event.target.value }))}><option value="all">All towns</option>{driverCityOptions.map((city) => <option key={city} value={city}>{city}</option>)}</select></label>
          <label>Service area<input value={driverFilters.serviceArea} placeholder="Area name" onChange={(event) => setDriverFilters((current) => ({ ...current, serviceArea: event.target.value }))} /></label>
          <label>Availability<select value={driverFilters.availability} onChange={(event) => setDriverFilters((current) => ({ ...current, availability: event.target.value }))}><option value="all">All</option>{driverAvailabilityStatusOptions.map((status) => <option key={status} value={status}>{getDriverAvailabilityStatusLabel(status)}</option>)}</select></label>
          {adWork.vehicle_required && <label>Vehicle search<input value={vehicleFilters.search} placeholder="Vehicle number" onChange={(event) => setVehicleFilters((current) => ({ ...current, search: event.target.value }))} /></label>}
          {adWork.vehicle_required && <label>Vehicle city/town<select value={vehicleFilters.city} onChange={(event) => setVehicleFilters((current) => ({ ...current, city: event.target.value }))}><option value="all">All towns</option>{vehicleCityOptions.map((city) => <option key={city} value={city}>{city}</option>)}</select></label>}
          {adWork.speaker_required && <label>Speaker equipment<select value={vehicleFilters.micSystem} onChange={(event) => setVehicleFilters((current) => ({ ...current, micSystem: event.target.value }))}><option value="all">All</option><option value="yes">Available</option><option value="no">Not available</option></select></label>}
        </div>
      </details>
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
        {adWork.vehicle_required && <div>
          <dt>Vehicle details</dt>
          <dd>{selectedVehicle ? selectedVehicle.vehicle_number + " - " + vehicleTypeLabels[selectedVehicle.vehicle_type] + " - " + (selectedVehicle.city || "City not set") : "Not selected"}</dd>
        </div>}
        {adWork.vehicle_required && <div>
          <dt>Vehicle status</dt>
          <dd>{selectedVehicle ? getVehicleStatusLabel(selectedVehicle.onboarding_status) : "Not selected"}</dd>
        </div>}
      </div>

      <label>
        Assignment note
        <textarea
          value={draft.note}
          maxLength={1000}
          onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
        />
      </label>

      {assignment && (assignment.driver_id !== draft.driverId || (assignment.vehicle_id ?? "") !== draft.vehicleId) && <div className="checkbox-grid">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={draft.confirmAssignmentChange}
            onChange={(event) => setDraft((current) => ({ ...current, confirmAssignmentChange: event.target.checked }))}
          />
          <span>Confirm assignment change</span>
        </label>
      </div>}

      <div className="lead-submitted-copy">
        <h3>Before saving</h3>
        {readiness.checks.filter((check) => check.required).map((check) => (
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
          <p>Same person{adWork.vehicle_required ? " and vehicle" : ""} will be used for all planned days.</p>
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

function M8SummaryCards({ config, session, adWorks }: { config: SupabaseConfig; session: AuthSession; adWorks: AdWorkRecord[] }) {
  const [proofUploads, setProofUploads] = useState<ProofUploadRecord[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      const proofRows = await fetchAdminProofUploads(config, session);
      if (!cancelled) {
        setProofUploads(proofRows);
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
      label: "Ready to Close",
      value: adWorks.filter((adWork) => adWork.closure_status === "ready_to_close").length
    },
    {
      label: "Closed Today",
      value: adWorks.filter((adWork) => Boolean(adWork.closure_closed_at?.startsWith(today))).length
    },
    {
      label: "Closed with Issues",
      value: adWorks.filter((adWork) => adWork.closure_status === "closed_with_issues").length
    },
    {
      label: "Proof Review Pending",
      value: proofUploads.filter((proof) => proof.upload_status === "uploaded" && (proof.review_status === "waiting_review" || proof.review_status === "needs_more_info")).length
    },
    {
      label: "Final Summary Not Shared",
      value: adWorks.filter((adWork) => (adWork.closure_status === "closed" || adWork.closure_status === "closed_with_issues") && adWork.final_summary_shared_status !== "shared_manually").length
    },
    {
      label: "Customer Accepted",
      value: adWorks.filter((adWork) => adWork.closure_customer_accepted === "yes").length
    }
  ];

  return (
    <div className="admin-summary-grid" aria-label="Final Proof Summary and closure summary">
      {cards.map((card) => (
        <div className="admin-summary-card" key={card.label}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
        </div>
      ))}
    </div>
  );
}

function M9SummaryCards({ config, session, adWorks }: { config: SupabaseConfig; session: AuthSession; adWorks: AdWorkRecord[] }) {
  const [sessions, setSessions] = useState<TrackingSessionRecord[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      const sessionRows = await fetchTrackingSessions(config, session);
      if (!cancelled) {
        setSessions(sessionRows);
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
      label: "Location Proof Required",
      value: adWorks.filter((adWork) => adWork.mobile_location_proof_required).length
    },
    {
      label: "Phone Proof Running",
      value: sessions.filter((sessionRow) => sessionRow.status === "running").length
    },
    {
      label: "Permission Needed",
      value: sessions.filter((sessionRow) => sessionRow.status === "permission_missing").length
    },
    {
      label: "Weak Location",
      value: sessions.filter((sessionRow) => sessionRow.quality_status === "weak").length
    },
    {
      label: "Updated Today",
      value: sessions.filter((sessionRow) => Boolean(sessionRow.last_update_at?.startsWith(today))).length
    },
    {
      label: "Stopped",
      value: sessions.filter((sessionRow) => sessionRow.status === "stopped" || sessionRow.status === "paused").length
    }
  ];

  return (
    <div className="admin-summary-grid" aria-label="Phone Location Proof summary">
      {cards.map((card) => (
        <div className="admin-summary-card" key={card.label}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
        </div>
      ))}
    </div>
  );
}
function M11SummaryCards({ config, session, adWorks }: { config: SupabaseConfig; session: AuthSession; adWorks: AdWorkRecord[] }) {
  const [sessions, setSessions] = useState<TrackingSessionRecord[]>([]);
  const [reviews, setReviews] = useState<LocationProofReviewRecord[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      const [sessionRows, reviewRows] = await Promise.all([
        fetchTrackingSessions(config, session),
        fetchLocationProofReviews(config, session)
      ]);
      if (!cancelled) {
        setSessions(sessionRows);
        setReviews(reviewRows);
      }
    }

    loadSummary().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [config, session]);

  const today = new Date().toISOString().slice(0, 10);
  const reviewsByAdWork = new Map(reviews.map((review) => [review.ad_work_id, review]));
  const pointCountsByAdWork = new Map<string, number>();
  sessions.forEach((sessionRow) => {
    if (!sessionRow.ad_work_id) {
      return;
    }

    pointCountsByAdWork.set(sessionRow.ad_work_id, (pointCountsByAdWork.get(sessionRow.ad_work_id) ?? 0) + (sessionRow.point_count ?? 0));
  });
  const offlineSyncAdWorkIds = new Set(sessions
    .filter((sessionRow) => sessionRow.ad_work_id && (sessionRow.client_pending_point_count > 0 || sessionRow.sync_failure_count > 0 || Boolean(sessionRow.last_successful_sync_at)))
    .map((sessionRow) => sessionRow.ad_work_id as string));
  const requiredAdWorks = adWorks.filter((adWork) => adWork.mobile_location_proof_required);
  const cards = [
    {
      label: "Location Proof Waiting Review",
      value: requiredAdWorks.filter((adWork) => {
        const review = reviewsByAdWork.get(adWork.id);
        return !review || review.review_status === "not_reviewed";
      }).length
    },
    {
      label: "Needs Follow-up",
      value: reviews.filter((review) => review.review_status === "needs_follow_up" || review.review_status === "rejected").length
    },
    {
      label: "Ad Works with No Location Points",
      value: requiredAdWorks.filter((adWork) => (pointCountsByAdWork.get(adWork.id) ?? 0) === 0).length
    },
    {
      label: "Ad Works with Offline Sync",
      value: offlineSyncAdWorkIds.size
    },
    {
      label: "Location Proof Reviewed Today",
      value: reviews.filter((review) => Boolean(review.reviewed_at?.startsWith(today))).length
    }
  ];

  return (
    <div className="admin-summary-grid" aria-label="Location Proof Review summary">
      {cards.map((card) => (
        <div className="admin-summary-card" key={card.label}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
        </div>
      ))}
    </div>
  );
}
function AdminFinalProofSummaryPanel({
  config,
  session,
  adWork,
  dayDrafts,
  onUpdated
}: {
  config: SupabaseConfig;
  session: AuthSession;
  adWork: AdWorkRecord;
  dayDrafts: DayDraft[];
  onUpdated: () => Promise<void>;
}) {
  const [assignment, setAssignment] = useState<AdWorkAssignmentRecord | null>(null);
  const [drivers, setDrivers] = useState<DriverRecord[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [proofUploads, setProofUploads] = useState<ProofUploadRecord[]>([]);
  const [customerUpdates, setCustomerUpdates] = useState<CustomerUpdateRecord[]>([]);
  const [summary, setSummary] = useState<FinalProofSummaryRecord | null>(null);
  const [locationProofSessions, setLocationProofSessions] = useState<TrackingSessionRecord[]>([]);
  const [locationProofPoints, setLocationProofPoints] = useState<LocationPointRecord[]>([]);
  const [locationProofReview, setLocationProofReview] = useState<LocationProofReviewRecord | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [finalSummaryReviewed, setFinalSummaryReviewed] = useState(adWork.final_summary_reviewed);
  const [proofNotRequired, setProofNotRequired] = useState(adWork.closure_reason === "proof_not_required_by_customer");
  const [customerUpdatesReviewed, setCustomerUpdatesReviewed] = useState(false);
  const [closureReason, setClosureReason] = useState<CampaignClosureReason | "">(adWork.closure_reason ?? "");
  const [closureNote, setClosureNote] = useState(adWork.closure_note ?? "");
  const [customerAccepted, setCustomerAccepted] = useState<CustomerAcceptanceStatus>(adWork.closure_customer_accepted ?? "not_confirmed");
  const [internalAdminNote, setInternalAdminNote] = useState(adWork.closure_internal_admin_note ?? "");
  const [shareMethod, setShareMethod] = useState<FinalSummaryShareMethod>(adWork.final_summary_shared_method ?? "manual_whatsapp");
  const [shareNote, setShareNote] = useState(adWork.final_summary_shared_note ?? "");
  const [includePhoneLocationProof, setIncludePhoneLocationProof] = useState(false);
  const [locationProofCustomerNote, setLocationProofCustomerNote] = useState("");
  const [locationProofCustomerSafeConfirmed, setLocationProofCustomerSafeConfirmed] = useState(false);
  const [summaryText, setSummaryText] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [savingKey, setSavingKey] = useState("");

  const assignedDriver = assignment ? drivers.find((driver) => driver.id === assignment.driver_id) ?? null : null;
  const assignedVehicle = assignment ? vehicles.find((vehicle) => vehicle.id === assignment.vehicle_id) ?? null : null;
  const approvedProofRecords = proofUploads.filter((proof) => proof.upload_status === "uploaded" && proof.review_status === "approved");
  const rejectedProofRecords = proofUploads.filter((proof) => proof.upload_status === "uploaded" && proof.review_status === "rejected");
  const approvedProofs = getApprovedFinalProofs(proofUploads.map((proof) => ({
    status: proof.review_status,
    areaPlaceName: proof.area_place_name,
    noteText: proof.note_text
  })));
  const locationProofStatus = getFinalSummaryLocationProofStatusForAdWork(adWork, locationProofReview, locationProofPoints.length);
  const locationProofActiveStatus = getFinalSummaryLocationProofActiveStatus(adWork, locationProofSessions, locationProofPoints);
  const locationProofSyncStatus = getFinalSummaryLocationProofSyncStatus(adWork, locationProofSessions, locationProofPoints);
  const locationProofFirstReceivedAt = getLocationProofFirstReceivedAt(locationProofPoints);
  const locationProofLastReceivedAt = getLocationProofLastReceivedAt(locationProofPoints);
  const locationProofWarnings = getFinalSummaryLocationProofWarnings(adWork, locationProofStatus, locationProofSessions, locationProofPoints);
  const canIncludePhoneLocationProof = locationProofStatus !== "not_reviewed";
  const effectiveIncludePhoneLocationProof = includePhoneLocationProof && canIncludePhoneLocationProof;
  const locationProofPreview = buildPhoneLocationProofPreview(
    effectiveIncludePhoneLocationProof,
    adWork,
    locationProofStatus,
    locationProofActiveStatus,
    locationProofSyncStatus,
    locationProofFirstReceivedAt,
    locationProofLastReceivedAt,
    locationProofCustomerNote
  );
  const readiness = buildCampaignClosureReadiness({
    assignmentStatus: adWork.assignment_status,
    releaseStatus: adWork.execution_release_status,
    dayStatuses: dayDrafts.map((day) => day.executionStatus),
    proofNeeded: adWork.photo_proof_needed,
    proofReviewStatuses: proofUploads.filter((proof) => proof.upload_status === "uploaded").map((proof) => proof.review_status),
    customerUpdateSharingStatuses: customerUpdates.map((update) => update.sharing_status),
    liveTrackingRequested: adWork.live_tracking_requested,
    liveTrackingEnabled: adWork.live_tracking_enabled,
    finalSummaryReviewed,
    customerUpdatesReviewed,
    proofNotRequiredConfirmed: proofNotRequired,
    closureReason,
    assignmentRequired: adWork.driver_required,
    releaseRequired: adWork.execution_mode === "driver_app"
  });
  const allClosureWarnings = [...readiness.hardStops, ...readiness.warnings, ...locationProofWarnings];

  async function loadClosureData() {
    setIsLoading(true);
    setMessage("");

    try {
      const [assignmentRows, driverRows, vehicleRows, proofRows, updateRows, summaryRows, sessionRows, pointRows, reviewRows] = await Promise.all([
        fetchAdWorkAssignments(config, session, adWork.id),
        fetchDrivers(config, session),
        fetchVehicles(config, session),
        fetchAdminProofUploads(config, session, adWork.id),
        fetchCustomerUpdates(config, session, adWork.id),
        fetchFinalProofSummaries(config, session, adWork.id),
        fetchTrackingSessions(config, session, adWork.id),
        fetchLocationPoints(config, session, adWork.id, 1000),
        fetchLocationProofReviews(config, session, adWork.id)
      ]);
      const activeSummary = summaryRows[0] ?? null;
      const activeReview = reviewRows[0] ?? null;
      const loadedStatus = getFinalSummaryLocationProofStatusForAdWork(adWork, activeReview, pointRows.length);
      const savedInclude = Boolean(activeSummary?.include_phone_location_proof) && loadedStatus !== "not_reviewed";
      const approvedRows = proofRows.filter((proof) => proof.upload_status === "uploaded" && proof.review_status === "approved");
      const previewEntries = await Promise.all(approvedRows.map(async (proof) => {
        try {
          const signedUrl = await fetchProofPhotoSignedUrl(config, session, proof.file_bucket, proof.file_path);
          return [proof.id, signedUrl] as const;
        } catch {
          return [proof.id, ""] as const;
        }
      }));

      setAssignment(assignmentRows[0] ?? null);
      setDrivers(driverRows);
      setVehicles(vehicleRows);
      setProofUploads(proofRows);
      setCustomerUpdates(updateRows);
      setSummary(activeSummary);
      setLocationProofSessions(sessionRows);
      setLocationProofPoints(pointRows);
      setLocationProofReview(activeReview);
      setSummaryText(activeSummary?.summary_text ?? "");
      setFinalSummaryReviewed(adWork.final_summary_reviewed || Boolean(activeSummary?.reviewed_at));
      setProofNotRequired(adWork.closure_reason === "proof_not_required_by_customer");
      setCustomerUpdatesReviewed(updateRows.length === 0 || updateRows.every((update) => update.sharing_status === "shared_manually"));
      setClosureReason(adWork.closure_reason ?? "");
      setClosureNote(activeSummary?.closure_note ?? adWork.closure_note ?? "");
      setCustomerAccepted(activeSummary?.customer_accepted ?? adWork.closure_customer_accepted ?? "not_confirmed");
      setInternalAdminNote(activeSummary?.internal_admin_note ?? adWork.closure_internal_admin_note ?? "");
      setShareMethod(activeSummary?.shared_method ?? adWork.final_summary_shared_method ?? "manual_whatsapp");
      setShareNote(activeSummary?.shared_note ?? adWork.final_summary_shared_note ?? "");
      setIncludePhoneLocationProof(savedInclude);
      setLocationProofCustomerNote(activeSummary?.phone_location_proof_customer_note ?? "");
      setLocationProofCustomerSafeConfirmed(savedInclude && Boolean(activeSummary?.phone_location_proof_customer_safe_confirmed));
      setPreviewUrls(Object.fromEntries(previewEntries.filter((entry) => Boolean(entry[1]))));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load Final Proof Summary.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadClosureData();
  }, [adWork.id]);

  async function handlePrepareSummary() {
    setSavingKey("prepare");
    setMessage("");

    try {
      const result = await prepareFinalProofSummary(
        config,
        session,
        adWork.id,
        finalSummaryReviewed,
        proofNotRequired,
        customerUpdatesReviewed,
        internalAdminNote,
        effectiveIncludePhoneLocationProof,
        locationProofCustomerNote,
        effectiveIncludePhoneLocationProof && locationProofCustomerSafeConfirmed
      );
      setSummaryText(result[0]?.summary_text ?? "");
      setMessage(result[0]?.result_message ?? "Final Proof Summary saved.");
      await onUpdated();
      await loadClosureData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save Final Proof Summary.");
    } finally {
      setSavingKey("");
    }
  }

  async function handleCloseAdWork() {
    setSavingKey("close");
    setMessage("");

    try {
      const result = await closeAdWorkWithFinalSummary(
        config,
        session,
        adWork.id,
        closureReason,
        closureNote,
        customerAccepted,
        internalAdminNote,
        proofNotRequired,
        customerUpdatesReviewed,
        effectiveIncludePhoneLocationProof,
        locationProofCustomerNote,
        effectiveIncludePhoneLocationProof && locationProofCustomerSafeConfirmed
      );
      setMessage(result[0]?.result_message ?? "Ad Work closed.");
      await onUpdated();
      await loadClosureData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not close Ad Work.");
    } finally {
      setSavingKey("");
    }
  }

  async function handleMarkSummaryShared() {
    setSavingKey("share");
    setMessage("");

    try {
      const result = await markFinalSummaryShared(config, session, adWork.id, shareMethod, shareNote);
      setMessage(result[0]?.result_message ?? "Final Proof Summary marked as shared.");
      await onUpdated();
      await loadClosureData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not mark Final Proof Summary as shared.");
    } finally {
      setSavingKey("");
    }
  }

  async function handleCopySummary() {
    try {
      await navigator.clipboard.writeText(summaryText || "Final Proof Summary is not prepared yet.");
      setMessage("Final Proof Summary copied.");
    } catch {
      setMessage("Could not copy Final Proof Summary in this browser.");
    }
  }

  function handlePrintSummary() {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setMessage("Could not open print view in this browser.");
      return;
    }

    const escapedSummary = (summaryText || "Final Proof Summary is not prepared yet.")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
    printWindow.document.write("<html><head><title>Final Proof Summary</title></head><body><pre>" + escapedSummary + "</pre><script>window.print()</script></body></html>");
    printWindow.document.close();
  }

  return (
    <section className="form-section final-summary-section" aria-labelledby="final-summary-title">
      <div className="panel-heading">
        <div>
          <h3 id="final-summary-title">Final Proof Summary</h3>
          <p>Review completed work, close Ad Work, and copy or print the customer-ready summary manually.</p>
        </div>
        <span className="status-pill">{getCampaignClosureStatusLabel(adWork.closure_status)}</span>
      </div>

      {message && <p className="form-status admin-message" role="status">{message}</p>}

      <div className="admin-action-row">
        <button className="secondary-button" type="button" onClick={() => void loadClosureData()} disabled={isLoading}>
          {isLoading ? "Loading..." : "Refresh final summary"}
        </button>
      </div>

      <div className="lead-submitted-copy">
        <h4>Closure warnings</h4>
        {allClosureWarnings.length === 0 ? (
          <p>Ready to Close.</p>
        ) : (
          allClosureWarnings.map((warning) => <p key={warning}>{warning}</p>)
        )}
      </div>

      <div className="form-grid">
        <label className="checkbox-row">
          <input type="checkbox" checked={finalSummaryReviewed} onChange={(event) => setFinalSummaryReviewed(event.target.checked)} />
          <span>Final Proof Summary reviewed</span>
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={customerUpdatesReviewed} onChange={(event) => setCustomerUpdatesReviewed(event.target.checked)} />
          <span>Customer update messages reviewed</span>
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={proofNotRequired} onChange={(event) => setProofNotRequired(event.target.checked)} />
          <span>Proof not required by customer</span>
        </label>
        <label>
          Closure reason
          <select value={closureReason} onChange={(event) => setClosureReason(event.target.value as CampaignClosureReason | "")}>
            <option value="">No reason needed</option>
            {campaignClosureReasonOptions.map((reason) => (
              <option key={reason} value={reason}>{getCampaignClosureReasonLabel(reason)}</option>
            ))}
          </select>
        </label>
        <label>
          Customer Accepted
          <select value={customerAccepted} onChange={(event) => setCustomerAccepted(event.target.value as CustomerAcceptanceStatus)}>
            {customerAcceptanceStatusOptions.map((status) => (
              <option key={status} value={status}>{getCustomerAcceptanceStatusLabel(status)}</option>
            ))}
          </select>
        </label>
        <label>
          Closure Note
          <textarea value={closureNote} maxLength={800} onChange={(event) => setClosureNote(event.target.value)} />
        </label>
        <label>
          Internal admin note
          <textarea value={internalAdminNote} maxLength={1200} onChange={(event) => setInternalAdminNote(event.target.value)} />
        </label>
      </div>

      <div className="lead-submitted-copy">
        <h4>Phone Location Proof in Final Summary</h4>
        <dl className="lead-detail-grid">
          <div>
            <dt>Phone Location Proof Status</dt>
            <dd>{getFinalSummaryLocationProofStatusLabel(locationProofStatus)}</dd>
          </div>
          <div>
            <dt>Location Proof Required</dt>
            <dd>{adWork.mobile_location_proof_required ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt>Location Proof Active During Work</dt>
            <dd>{getFinalSummaryLocationProofActiveLabel(locationProofActiveStatus)}</dd>
          </div>
          <div>
            <dt>First Location Received</dt>
            <dd>{formatDateTime(locationProofFirstReceivedAt)}</dd>
          </div>
          <div>
            <dt>Last Location Received</dt>
            <dd>{formatDateTime(locationProofLastReceivedAt)}</dd>
          </div>
          <div>
            <dt>Offline Location Sync</dt>
            <dd>{getFinalSummaryLocationProofSyncLabel(locationProofSyncStatus)}</dd>
          </div>
          <div>
            <dt>Points Received</dt>
            <dd>{formatCount(locationProofPoints.length)}</dd>
          </div>
          <div>
            <dt>Review</dt>
            <dd>{getLocationProofReviewStatusLabel(locationProofReview?.review_status)}</dd>
          </div>
        </dl>
        {locationProofWarnings.length > 0 && (
          <div className="admin-warning-list">
            {locationProofWarnings.map((warning) => <p key={warning}>{warning}</p>)}
          </div>
        )}
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={includePhoneLocationProof}
            disabled={!canIncludePhoneLocationProof}
            onChange={(event) => {
              setIncludePhoneLocationProof(event.target.checked);
              if (!event.target.checked) {
                setLocationProofCustomerSafeConfirmed(false);
              }
            }}
          />
          <span>Include Phone Location Proof in customer summary</span>
        </label>
        {!canIncludePhoneLocationProof && <p>Phone Location Proof must be reviewed before it can be included.</p>}
        <label>
          Customer-safe location proof note
          <textarea
            value={locationProofCustomerNote}
            maxLength={500}
            onChange={(event) => {
              setLocationProofCustomerNote(event.target.value);
              setLocationProofCustomerSafeConfirmed(false);
            }}
          />
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={locationProofCustomerSafeConfirmed}
            disabled={!effectiveIncludePhoneLocationProof}
            onChange={(event) => setLocationProofCustomerSafeConfirmed(event.target.checked)}
          />
          <span>I confirm this Phone Location Proof wording is customer-safe.</span>
        </label>
        <div className="lead-submitted-copy final-summary-preview">
          <h5>Customer-safe wording preview</h5>
          <pre>{locationProofPreview}</pre>
        </div>
      </div>

      <div className="admin-action-row">
        <button className="secondary-button" type="button" onClick={() => void handlePrepareSummary()} disabled={Boolean(savingKey)}>
          {savingKey === "prepare" ? "Saving..." : "Mark Ready for Closure"}
        </button>
        <button className="primary-button" type="button" onClick={() => void handleCloseAdWork()} disabled={Boolean(savingKey)}>
          {savingKey === "close" ? "Closing..." : "Close Ad Work"}
        </button>
      </div>

      <div className="final-summary-layout">
        <div className="lead-submitted-copy final-summary-preview">
          <h4>Customer-ready summary text</h4>
          <pre>{summaryText || "Prepare Final Proof Summary to create the customer-ready text."}</pre>
          <div className="admin-action-row">
            <button
              className="secondary-button"
              type="button"
              title="Copy Final Summary"
              onClick={() => void handleCopySummary()}
            >
              {businessLabels.admin.copyFinalSummary}
            </button>
            <button className="secondary-button" type="button" onClick={handlePrintSummary}>Print Summary</button>
          </div>
        </div>

        <div className="lead-submitted-copy">
          <h4>Approved proof uploads</h4>
          <p>{approvedProofs.length} approved proof upload{approvedProofs.length === 1 ? "" : "s"} shown in the customer summary.</p>
          {approvedProofRecords.length === 0 ? (
            <p>No approved proof uploads yet.</p>
          ) : approvedProofRecords.map((proof) => (
            <article className="proof-review-card" key={proof.id}>
              <h5>{proof.area_place_name || "Work area"}</h5>
              <p>{proof.note_text || "Proof Checked"}</p>
              {previewUrls[proof.id] ? <img className="proof-photo-preview" src={previewUrls[proof.id]} alt="Approved proof preview" /> : <p>Secure preview is not available yet.</p>}
            </article>
          ))}
          {rejectedProofRecords.length > 0 && (
            <p>Rejected proof is kept as an internal warning and is not treated as customer-approved proof.</p>
          )}
        </div>
      </div>

      <div className="lead-submitted-copy">
        <h4>Customer update summary</h4>
        {customerUpdates.length === 0 ? (
          <p>No customer update records yet.</p>
        ) : customerUpdates.map((update) => (
          <p key={update.id}>{update.type.replace(/_/g, " ")} - {getCustomerUpdateSharingStatusLabel(update.sharing_status)} - {update.sharing_method ? getCustomerUpdateSharingMethodLabel(update.sharing_method) : "Not shared"}</p>
        ))}
      </div>

      <div className="form-grid">
        <label>
          Final summary share method
          <select value={shareMethod} onChange={(event) => setShareMethod(event.target.value as FinalSummaryShareMethod)}>
            {finalSummaryShareMethodOptions.map((method) => (
              <option key={method} value={method}>{getFinalSummaryShareMethodLabel(method)}</option>
            ))}
          </select>
        </label>
        <label>
          Final summary share note
          <textarea value={shareNote} maxLength={500} onChange={(event) => setShareNote(event.target.value)} />
        </label>
      </div>
      <div className="admin-action-row">
        <button className="primary-button" type="button" onClick={() => void handleMarkSummaryShared()} disabled={Boolean(savingKey)}>
          {savingKey === "share" ? "Saving..." : "Mark Final Summary as Shared"}
        </button>
        <span className="status-pill">{getCustomerUpdateSharingStatusLabel(summary?.shared_status ?? adWork.final_summary_shared_status)}</span>
      </div>
    </section>
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

function AdminMobileLocationProofPanel({
  config,
  session,
  adWork,
  dayDrafts,
  onUpdated
}: {
  config: SupabaseConfig;
  session: AuthSession;
  adWork: AdWorkRecord;
  dayDrafts: DayDraft[];
  onUpdated: () => Promise<void>;
}) {
  const [required, setRequired] = useState(adWork.mobile_location_proof_required);
  const [note, setNote] = useState(adWork.mobile_location_proof_note ?? "");
  const [sessions, setSessions] = useState<TrackingSessionRecord[]>([]);
  const [points, setPoints] = useState<LocationPointRecord[]>([]);
  const [review, setReview] = useState<LocationProofReviewRecord | null>(null);
  const [reviewStatus, setReviewStatus] = useState<LocationProofReviewStatus>("not_reviewed");
  const [reviewNote, setReviewNote] = useState("");
  const [showTechnicalLocationValues, setShowTechnicalLocationValues] = useState(false);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const sortedPoints = sortLocationPointsAsc(points);
  const firstPoint = sortedPoints[0] ?? null;
  const latestPoint = sortedPoints[sortedPoints.length - 1] ?? null;
  const latestSession = getLatestSession(sessions);
  const activeSession = sessions.find((sessionRow) => ["running", "paused", "permission_missing", "failed", "not_started"].includes(sessionRow.status));
  const totalPointsReceived = sessions.reduce((total, sessionRow) => total + (sessionRow.point_count ?? 0), 0) || points.length;
  const offlinePointsSynced = points.filter((point) => Boolean(point.client_point_id)).length;
  const unsyncedPoints = sessions.reduce((total, sessionRow) => total + (sessionRow.client_pending_point_count ?? 0), 0);
  const syncFailureCount = sessions.reduce((total, sessionRow) => total + (sessionRow.sync_failure_count ?? 0), 0);
  const lastSuccessfulSync = sessions
    .map((sessionRow) => sessionRow.last_successful_sync_at)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;
  const warningTypes = getOverallLocationProofWarnings(required, dayDrafts, sessions, points);
  const setupWarnings = [
    required && adWork.execution_release_status !== "released_to_driver" ? "Release to driver before the driver can start Phone Location Proof." : "",
    required && !latestSession ? "No Phone Location Proof session yet." : "",
    latestSession?.tracking_health_status === "no_recent_update" ? "No recent location update received from the driver phone." : "",
    latestSession?.tracking_health_status === "sync_pending" || unsyncedPoints > 0 ? "Offline points are pending sync from the driver phone." : "",
    latestSession?.tracking_health_status === "sync_failed" || syncFailureCount > 0 ? "Location sync failed. Ask driver to try Sync Now." : ""
  ].filter(Boolean);
  const dayReviews = dayDrafts.map((day) => {
    const daySessions = sessions.filter((sessionRow) => sessionRow.ad_work_day_id === day.id);
    const dayPoints = points.filter((point) => point.ad_work_day_id === day.id);
    const sortedDayPoints = sortLocationPointsAsc(dayPoints);
    const dayLatestSession = getLatestSession(daySessions);
    const dayWarningTypes = getDayLocationProofWarnings(day, daySessions, dayPoints);
    const pendingSync = daySessions.reduce((total, sessionRow) => total + (sessionRow.client_pending_point_count ?? 0), 0);
    const failedSync = daySessions.reduce((total, sessionRow) => total + (sessionRow.sync_failure_count ?? 0), 0);

    return {
      day,
      sessionStatus: dayLatestSession ? getTrackingSessionStatusLabel(dayLatestSession.status) : "Not Started",
      firstPoint: sortedDayPoints[0] ?? null,
      lastPoint: sortedDayPoints[sortedDayPoints.length - 1] ?? null,
      pointCount: daySessions.reduce((total, sessionRow) => total + (sessionRow.point_count ?? 0), 0) || dayPoints.length,
      offlineSyncStatus: failedSync > 0 ? "Sync Failed" : pendingSync > 0 ? "Sync Pending" : offlinePointsSynced > 0 ? "Synced" : "No Offline Points",
      warningTypes: dayWarningTypes
    };
  });

  async function loadTrackingData() {
    try {
      const [sessionRows, pointRows, reviewRows] = await Promise.all([
        fetchTrackingSessions(config, session, adWork.id),
        fetchLocationPoints(config, session, adWork.id),
        fetchLocationProofReviews(config, session, adWork.id)
      ]);
      const loadedReview = reviewRows[0] ?? null;
      setSessions(sessionRows);
      setPoints(pointRows);
      setReview(loadedReview);
      setReviewStatus(loadedReview?.review_status ?? "not_reviewed");
      setReviewNote(loadedReview?.review_note ?? "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load Phone Location Proof.");
    }
  }

  useEffect(() => {
    setRequired(adWork.mobile_location_proof_required);
    setNote(adWork.mobile_location_proof_note ?? "");
    setMessage("");
    void loadTrackingData();
  }, [adWork.id, adWork.mobile_location_proof_required, adWork.mobile_location_proof_note]);

  async function handleSave() {
    setIsSaving(true);
    setMessage("");

    try {
      const result = await setMobileLocationProof(config, session, adWork.id, required, note);
      setMessage(result[0]?.result_message ?? "Phone Location Proof saved.");
      await onUpdated();
      await loadTrackingData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save Phone Location Proof.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveLocationProofReview(statusOverride?: LocationProofReviewStatus) {
    setIsSaving(true);
    setMessage("");

    try {
      const nextStatus = statusOverride ?? reviewStatus;
      const result = await updateLocationProofReview(config, session, adWork.id, nextStatus, reviewNote);
      setMessage(result[0]?.result_message ?? "Location Proof Review saved.");
      await onUpdated();
      await loadTrackingData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save Location Proof Review.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAdminStop(trackingSessionId: string) {
    setIsSaving(true);
    setMessage("");

    try {
      const result = await adminStopMobileTracking(config, session, trackingSessionId);
      setMessage(result[0]?.result_message ?? "Phone Location Proof stopped.");
      await loadTrackingData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not stop Phone Location Proof.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="form-section" aria-labelledby="mobile-location-proof-title">
      <div className="panel-heading">
        <div>
          <h3 id="mobile-location-proof-title">{businessLabels.admin.phoneLocationProof}</h3>
          <p>Admin-only Location Proof Review uses phone points without maps, routes, distance billing, or customer live tracking.</p>
        </div>
        <span className="status-pill">{required ? "Mobile Location Proof Required" : "Not Required"}</span>
      </div>

      {message && <p className="form-status admin-message" role="status">{message}</p>}

      <div className="checkbox-grid">
        <label className="checkbox-row">
          <input type="checkbox" checked={required} onChange={(event) => setRequired(event.target.checked)} />
          <span>{businessLabels.admin.locationProofRequired}</span>
        </label>
      </div>

      <label>
        Admin note for driver
        <textarea
          value={note}
          maxLength={500}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>

      <div className="lead-detail-grid">
        <div>
          <dt>Mode</dt>
          <dd>Phone Location</dd>
        </div>
        <div>
          <dt>Session Status</dt>
          <dd>{latestSession ? getTrackingSessionStatusLabel(latestSession.status) : "Not Started"}</dd>
        </div>
        <div>
          <dt>First Location Received</dt>
          <dd>{formatDateTime(firstPoint?.received_at)}</dd>
        </div>
        <div>
          <dt>Last Location Received</dt>
          <dd>{formatDateTime(latestSession?.last_update_at ?? latestPoint?.received_at)}</dd>
        </div>
        <div>
          <dt>Points Received</dt>
          <dd>{formatCount(totalPointsReceived)}</dd>
        </div>
        <div>
          <dt>Offline Points Synced</dt>
          <dd>{formatCount(offlinePointsSynced)}</dd>
        </div>
        <div>
          <dt>Unsynced Points</dt>
          <dd>{formatCount(unsyncedPoints)}</dd>
        </div>
        <div>
          <dt>Last Sync</dt>
          <dd>{formatDateTime(lastSuccessfulSync)}</dd>
        </div>
        <div>
          <dt>Sync Failures</dt>
          <dd>{formatCount(syncFailureCount)}</dd>
        </div>
        <div>
          <dt>Quality</dt>
          <dd>{latestSession ? getLocationQualityLabel(latestSession.quality_status) : "Unknown"}</dd>
        </div>
        <div>
          <dt>Customer Live Tracking</dt>
          <dd>No</dd>
        </div>
        <div>
          <dt>Live Tracking</dt>
          <dd>No</dd>
        </div>
      </div>

      <div className="admin-action-row">
        <button className="primary-button" type="button" onClick={() => void handleSave()} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Phone Location Proof"}
        </button>
        <button className="secondary-button" type="button" onClick={() => void loadTrackingData()} disabled={isSaving}>
          Refresh Location Health
        </button>
        <button className="secondary-button" type="button" onClick={() => activeSession && void handleAdminStop(activeSession.id)} disabled={isSaving || !activeSession}>
          Stop Phone Location Proof
        </button>
      </div>

      <div className="lead-submitted-copy">
        <h3>Location Proof Review</h3>
        <p>{getLocationProofSummaryText({ ...adWork, mobile_location_proof_required: required }, review)}</p>
        <p>Review Status: {getLocationProofReviewStatusLabel(review?.review_status ?? reviewStatus)}</p>
        <p>Reviewed: {formatDateTime(review?.reviewed_at)}</p>
        <p>Reviewed By: {review?.reviewed_by ?? "Not set"}</p>
        <label>
          Review Location Proof
          <select value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value as LocationProofReviewStatus)}>
            {locationProofReviewStatusOptions.map((status) => (
              <option value={status} key={status}>{getLocationProofReviewStatusLabel(status)}</option>
            ))}
          </select>
        </label>
        <label>
          Review note
          <textarea
            value={reviewNote}
            maxLength={1000}
            onChange={(event) => setReviewNote(event.target.value)}
          />
        </label>
        <div className="admin-action-row">
          <button className="primary-button" type="button" onClick={() => void handleSaveLocationProofReview()} disabled={isSaving}>
            Save Review
          </button>
          <button className="secondary-button" type="button" onClick={() => void handleSaveLocationProofReview("reviewed")} disabled={isSaving}>
            Mark as Reviewed
          </button>
          <button className="secondary-button" type="button" onClick={() => void handleSaveLocationProofReview("needs_follow_up")} disabled={isSaving}>
            Needs Follow-up
          </button>
        </div>
      </div>

      <div className="lead-submitted-copy">
        <h3>Readiness Warnings</h3>
        {setupWarnings.map((warning) => <p key={warning}>{warning}</p>)}
        {warningTypes.length === 0 && setupWarnings.length === 0 ? (
          <p>No warnings.</p>
        ) : warningTypes.map((warning) => <p key={warning}>{getLocationProofWarningLabel(warning)}</p>)}
      </div>

      <div className="lead-submitted-copy">
        <h3>Day-wise Tracking Review</h3>
        <table className="admin-data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Day Status</th>
              <th>Planned Start / End</th>
              <th>Session Status</th>
              <th>First Point</th>
              <th>Last Point</th>
              <th>Point Count</th>
              <th>Offline Sync Status</th>
              <th>Warning Count</th>
              <th>Review Status</th>
            </tr>
          </thead>
          <tbody>
            {dayReviews.length === 0 ? (
              <tr>
                <td colSpan={10}>No planned work days yet.</td>
              </tr>
            ) : dayReviews.map((dayReview) => (
              <tr key={dayReview.day.id}>
                <td>{formatDate(dayReview.day.workDate)}</td>
                <td>{getAdWorkExecutionDayStatusLabel(dayReview.day.executionStatus)}</td>
                <td>{dayReview.day.plannedStartTime || "Not set"} / {dayReview.day.plannedEndTime || "Not set"}</td>
                <td>{dayReview.sessionStatus}</td>
                <td>{formatDateTime(dayReview.firstPoint?.received_at)}</td>
                <td>{formatDateTime(dayReview.lastPoint?.received_at)}</td>
                <td>{formatCount(dayReview.pointCount)}</td>
                <td>{dayReview.offlineSyncStatus}</td>
                <td>{formatCount(dayReview.warningTypes.length)}</td>
                <td>{getLocationProofReviewStatusLabel(review?.review_status ?? reviewStatus)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {dayReviews.some((dayReview) => dayReview.warningTypes.length > 0) && (
          <div>
            <h4>Day Warning Details</h4>
            {dayReviews.map((dayReview) => dayReview.warningTypes.length > 0 ? (
              <p key={dayReview.day.id}>{formatDate(dayReview.day.workDate)}: {dayReview.warningTypes.map(getLocationProofWarningLabel).join(", ")}</p>
            ) : null)}
          </div>
        )}
      </div>

      <div className="lead-submitted-copy">
        <div className="panel-heading">
          <div>
            <h3>Internal Point Review</h3>
            <p>Coordinates stay hidden unless an admin opens technical location values.</p>
          </div>
          <button className="secondary-button" type="button" onClick={() => setShowTechnicalLocationValues((visible) => !visible)}>
            {showTechnicalLocationValues ? "Hide technical location values" : "Show technical location values"}
          </button>
        </div>
        <table className="admin-data-table">
          <thead>
            <tr>
              <th>Captured</th>
              <th>Received</th>
              <th>Accuracy</th>
              <th>Speed</th>
              <th>Source</th>
              <th>Sync Status</th>
              <th>Quality</th>
              {showTechnicalLocationValues && <th>Technical Location Values</th>}
            </tr>
          </thead>
          <tbody>
            {points.length === 0 ? (
              <tr>
                <td colSpan={showTechnicalLocationValues ? 8 : 7}>No location points saved yet.</td>
              </tr>
            ) : points.map((point) => (
              <tr key={point.id}>
                <td>{formatDateTime(point.recorded_at)}</td>
                <td>{formatDateTime(point.received_at)}</td>
                <td>{point.accuracy_meters === null ? "Not set" : point.accuracy_meters + " m"}</td>
                <td>{point.speed === null ? "Not set" : point.speed}</td>
                <td>Phone</td>
                <td>{point.client_point_id ? "Synced from offline buffer" : "Saved"}</td>
                <td>{getLocationQualityLabel(point.quality)}</td>
                {showTechnicalLocationValues && <td>{point.lat}, {point.lng}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="lead-submitted-copy">
        <h3>Phone Location Proof sessions</h3>
        {sessions.length === 0 ? (
          <p>No sessions yet.</p>
        ) : sessions.map((sessionRow) => (
          <p key={sessionRow.id}>
            {getTrackingSessionStatusLabel(sessionRow.status)} - {getTrackingHealthStatusLabel(sessionRow.tracking_health_status)} - {formatCount(sessionRow.point_count)} points - {formatCount(sessionRow.client_pending_point_count)} unsynced - Last received {formatDateTime(sessionRow.last_update_at)} - Last sync {formatDateTime(sessionRow.last_successful_sync_at)} - Stop {sessionRow.stop_reason ? getTrackingStopReasonLabel(sessionRow.stop_reason) : "not stopped"}
          </p>
        ))}
      </div>
    </section>
  );
}

function AdminManagedExecutionPanel({ config, session, adWork, dayDrafts, onUpdated }: {
  config: SupabaseConfig;
  session: AuthSession;
  adWork: AdWorkRecord;
  dayDrafts: DayDraft[];
  onUpdated: () => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [savingKey, setSavingKey] = useState("");
  const [proofType, setProofType] = useState<ExecutionProofNoteType>("other");
  const [proofArea, setProofArea] = useState("");
  const [proofNote, setProofNote] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);

  async function handleAction(dayId: string, action: "start" | "complete" | "report_issue") {
    setSavingKey(dayId + action);
    setMessage("");
    try {
      const response = await adminFetch(config, session, config.url + "/rest/v1/rpc/admin_update_ad_work_day", {
        method: "POST",
        headers: createHeaders(config, session.accessToken, true),
        body: JSON.stringify({ p_ad_work_day_id: dayId, p_action: action, p_note: note.trim() || null })
      });
      if (!response.ok) throw new Error("Could not update this work day.");
      setNote("");
      setMessage(action === "start" ? "Work started." : action === "complete" ? "Work completed." : "Issue recorded.");
      await onUpdated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update this work day.");
    } finally {
      setSavingKey("");
    }
  }

  async function handleProofUpload(dayId: string) {
    if (!proofFile) {
      setMessage("Choose a proof photo.");
      return;
    }

    const fileErrors = validateProofPhotoFile({ mimeType: proofFile.type, fileSize: proofFile.size });
    const inputErrors = [
      ...(adWork.areas_required && !proofArea.trim() ? ["Enter the area or place."] : []),
      ...(!proofNote.trim() ? ["Enter a short proof note."] : []),
      ...fileErrors
    ];
    if (inputErrors.length > 0) {
      setMessage(inputErrors[0]);
      return;
    }

    setSavingKey(dayId + "proof");
    setMessage("");
    try {
      await addAdminProofPhoto(config, session, {
        dayId,
        proofType,
        areaPlaceName: proofArea,
        note: proofNote,
        file: proofFile
      });
      setProofArea("");
      setProofNote("");
      setProofFile(null);
      setMessage("Photo proof added for review.");
      await onUpdated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add the proof photo.");
    } finally {
      setSavingKey("");
    }
  }

  const nextDayId = dayDrafts.find((day) => day.executionStatus !== "completed")?.id;

  return (
    <section className="form-section" aria-labelledby="team-execution-title">
      <div className="panel-heading">
        <div><h3 id="team-execution-title">Team-managed work</h3><p>No driver app or Work Code is needed.</p></div>
        <span className="status-pill">{adWork.execution_overall_status.replace(/_/g, " ")}</span>
      </div>
      {message && <p className="form-status admin-message" role="status">{message}</p>}
      <label>Work note (optional)<textarea value={note} maxLength={800} onChange={(event) => setNote(event.target.value)} placeholder="Completion detail or issue note" /></label>
      <div className="managed-day-list">
        {dayDrafts.map((day, index) => {
          const isCurrentDay = day.id === nextDayId;
          const isRunning = day.executionStatus === "running" || day.executionStatus === "on_break" || day.executionStatus === "issue_reported";
          return (
            <article className="managed-day-card" key={day.id}>
              <div><strong>Day {index + 1} - {formatDate(day.workDate)}</strong><span className="status-pill">{getAdWorkExecutionDayStatusLabel(day.executionStatus)}</span></div>
              <p>{day.areasToCover || adWork.areas_to_cover || "No location required"}</p>
              {isCurrentDay ? (
                <>
                  {isRunning && adWork.photo_proof_needed && (
                    <details className="admin-proof-capture">
                      <summary>Add proof photo</summary>
                      <div className="admin-form-grid">
                        <label>Proof type<select value={proofType} onChange={(event) => setProofType(event.target.value as ExecutionProofNoteType)}>{executionProofNoteTypeOptions.map((option) => <option key={option} value={option}>{getExecutionProofNoteTypeLabel(option)}</option>)}</select></label>
                        {adWork.areas_required && <label>Area or place<input value={proofArea} maxLength={160} onChange={(event) => setProofArea(event.target.value)} /></label>}
                        <label className="admin-form-wide">What was completed?<textarea value={proofNote} maxLength={800} onChange={(event) => setProofNote(event.target.value)} /></label>
                        <label className="admin-form-wide">Photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setProofFile(event.target.files?.[0] ?? null)} /></label>
                      </div>
                      <button className="secondary-button" type="button" disabled={Boolean(savingKey)} onClick={() => void handleProofUpload(day.id)}>{savingKey === day.id + "proof" ? "Adding..." : "Add photo proof"}</button>
                    </details>
                  )}
                  <div className="admin-action-row">
                    {(day.executionStatus === "planned" || day.executionStatus === "ready") && <button className="primary-button" type="button" disabled={Boolean(savingKey)} onClick={() => void handleAction(day.id, "start")}>Start work</button>}
                    {isRunning && <button className="primary-button" type="button" disabled={Boolean(savingKey)} onClick={() => void handleAction(day.id, "complete")}>Complete work</button>}
                    {day.executionStatus !== "completed" && <button className="secondary-button" type="button" disabled={Boolean(savingKey)} onClick={() => void handleAction(day.id, "report_issue")}>Report issue</button>}
                  </div>
                </>
              ) : day.executionStatus !== "completed" ? <small>Complete the earlier day first.</small> : null}
            </article>
          );
        })}
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


function DeviceRegistryView({ config, session }: { config: SupabaseConfig; session: AuthSession }) {
  type DeviceRow = GpsDeviceRegistryRecord & { current_vehicle_id?: string | null };
  type VehicleRow = { id: string; vehicle_number: string; city: string | null };
  type ReadinessRow = { contractVersion: string; stage: string; blockingReasons: string[]; selectedAdapter: { adapterId: string; adapterVersion: string } | null; credentialReady: boolean; installationReady: boolean; networkReady: boolean; physicalEvidence: boolean };
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [links, setLinks] = useState<GpsDeviceVehicleLinkRecord[]>([]);
  const [events, setEvents] = useState<GpsDeviceLifecycleEventRecord[]>([]);
  const [credentials, setCredentials] = useState<GpsDeviceCredentialMetadataRecord[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [physicalReadiness, setPhysicalReadiness] = useState<ReadinessRow | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all");
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [installationFilter, setInstallationFilter] = useState("all");
  const [linkFilter, setLinkFilter] = useState("all");
  const [gpsFilter, setGpsFilter] = useState("all");
  const [showRegistration, setShowRegistration] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [identity, setIdentity] = useState({
    deviceCode: "", vendor: "", model: "", connectionProfile: "other",
    serialNumber: "", imei: "", vendorIdentifier: "", custodianDriverId: "",
    simProvider: "", firmwareVersion: "", adminNote: ""
  });
  const [operation, setOperation] = useState({
    vehicleId: "", effectiveAt: new Date().toISOString().slice(0, 16),
    reason: "", note: "", replacementDeviceId: ""
  });
  const [credentialDraft, setCredentialDraft] = useState({
    keyId: "", status: "pending" as GpsDeviceCredentialStatus,
    issuedAt: new Date().toISOString().slice(0, 16), expiresAt: "", note: ""
  });

  const selected = devices.find((device) => device.id === selectedId) ?? null;
  const currentLink = links.find((link) => link.gps_device_id === selectedId && !link.effective_until) ?? null;
  const currentVehicle = vehicles.find((vehicle) => vehicle.id === currentLink?.vehicle_id) ?? null;
  const selectedEvents = events.filter((entry) => entry.gps_device_id === selectedId);
  const selectedLinks = links.filter((entry) => entry.gps_device_id === selectedId);
  const selectedCredentials = credentials.filter((entry) => entry.gps_device_id === selectedId);
  const allowedStatusTransitions = selected
    ? getAllowedGpsDeviceStatusTransitions(selected.status)
    : [];
  const replacementCandidates = devices.filter((device) =>
    device.id !== selected?.id
    && ["pending_setup", "offline"].includes(device.status)
    && !device.current_vehicle_id
    && Boolean(device.vendor && device.model && device.adapter_type && device.protocol_type)
  );
  const hardwareIdentityLocked = editing && selected !== null && (
    selected.status !== "pending_setup"
    || selected.installation_state !== "pending"
    || selectedLinks.length > 0
  );
  const vendors = [...new Set(devices.map((device) => device.vendor).filter((vendor): vendor is string => Boolean(vendor)))].sort();
  const models = [...new Set(devices.map((device) => device.model).filter((model): model is string => Boolean(model)))].sort();

  function formatTime(value: string | null | undefined): string {
    return value ? new Date(value).toLocaleString() : "Not recorded";
  }

  function vehicleLabel(vehicleId: string | null | undefined): string {
    return vehicles.find((vehicle) => vehicle.id === vehicleId)?.vehicle_number ?? "Unlinked";
  }

  const filtered = devices.filter((device) => {
    const link = links.find((entry) => entry.gps_device_id === device.id && !entry.effective_until);
    const vehicle = vehicles.find((entry) => entry.id === link?.vehicle_id);
    const query = search.trim().toLowerCase();
    if (statusFilter !== "all" && device.status !== statusFilter) return false;
    if (vendorFilter !== "all" && device.vendor !== vendorFilter) return false;
    if (modelFilter !== "all" && device.model !== modelFilter) return false;
    if (vehicleFilter !== "all" && link?.vehicle_id !== vehicleFilter) return false;
    if (installationFilter !== "all" && device.installation_state !== installationFilter) return false;
    if (gpsFilter !== "all" && device.gps_readiness !== gpsFilter) return false;
    if (linkFilter === "linked" && !link) return false;
    if (linkFilter === "unlinked" && link) return false;
    return !query || [
      device.device_code, device.vendor, device.model, device.serial_number,
      device.imei, device.vendor_device_identifier, vehicle?.vehicle_number
    ].some((value) => value?.toLowerCase().includes(query));
  });

  async function safeRead<T>(path: string): Promise<T[]> {
    const response = await adminFetch(config, session, config.url + "/rest/v1/" + path, {
      headers: createHeaders(config, session.accessToken)
    });
    if (!response.ok) throw new Error("Could not load Device Registry.");
    return response.json() as Promise<T[]>;
  }

  async function loadRegistry() {
    setError("");
    try {
      const [deviceRows, linkRows, eventRows, credentialRows, vehicleRows] = await Promise.all([
        safeRead<DeviceRow>("gps_device_admin_list?select=id,device_code,status,vendor,model,adapter_type,protocol_type,serial_number,imei,vendor_device_identifier,custodian_driver_id,installation_state,sim_provider_name,firmware_version,gps_readiness,gsm_readiness,external_power_status,battery_status,last_heartbeat_at,last_telemetry_at,admin_note,created_at,updated_at&order=created_at.desc"),
        safeRead<GpsDeviceVehicleLinkRecord>("gps_device_vehicle_links?select=id,gps_device_id,vehicle_id,is_primary,effective_from,effective_until,installation_reference_note,change_reason,created_by_admin,created_at,closed_by_admin,closed_at&order=effective_from.desc"),
        safeRead<GpsDeviceLifecycleEventRecord>("gps_device_lifecycle_events?select=id,gps_device_id,vehicle_id,event_type,effective_at,reason,related_replacement_device_id,created_by_admin,created_at,safe_note&order=effective_at.desc"),
        safeRead<GpsDeviceCredentialMetadataRecord>("gps_device_credential_metadata?select=id,gps_device_id,credential_key_id,status,issued_at,expires_at,rotated_at,revoked_at,rotated_from_credential_id,last_verified_at,admin_note,created_by_admin,created_at,updated_at&order=created_at.desc"),
        safeRead<VehicleRow>("vehicles?select=id,vehicle_number,city&order=vehicle_number.asc")
      ]);
      setDevices(deviceRows);
      setLinks(linkRows);
      setEvents(eventRows);
      setCredentials(credentialRows);
      setVehicles(vehicleRows);
      setSelectedId((current) => current && deviceRows.some((row) => row.id === current) ? current : deviceRows[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load Device Registry.");
    }
  }

  async function loadPhysicalReadiness(deviceId: string | null = selectedId) {
    if (!deviceId) { setPhysicalReadiness(null); return; }
    const response = await adminFetch(config, session, config.url + "/rest/v1/rpc/admin_get_physical_pilot_readiness_v1", {
      method: "POST", headers: createHeaders(config, session.accessToken, true), body: JSON.stringify({ p_device_id: deviceId })
    });
    if (!response.ok) throw new Error("Could not load physical-pilot readiness.");
    setPhysicalReadiness(await response.json() as ReadinessRow);
  }

  useEffect(() => { void loadRegistry(); }, [config, session.accessToken]);

  useEffect(() => {
    if (!selectedId) { setPhysicalReadiness(null); return; }
    let cancelled = false;
    void loadPhysicalReadiness(selectedId).catch((readinessError) => { if (!cancelled) setError(readinessError instanceof Error ? readinessError.message : "Could not load readiness."); });
    return () => { cancelled = true; };
  }, [config, session.accessToken, selectedId]);

  useEffect(() => {
    if (!selected || !editing) return;
    let cancelled = false;
    const detailPath = "gps_devices?select=id,device_code,status,vendor,model,adapter_type,protocol_type,serial_number,imei,vendor_device_identifier,custodian_driver_id,installation_state,sim_provider_name,firmware_version,gps_readiness,gsm_readiness,external_power_status,battery_status,last_heartbeat_at,last_telemetry_at,admin_note,created_at,updated_at&id=eq."
      + encodeURIComponent(selected.id) + "&limit=1";
    void safeRead<DeviceRow>(detailPath)
      .then(([detail]) => {
        if (cancelled || !detail) return;
        setIdentity({
          deviceCode: detail.device_code,
          vendor: detail.vendor ?? "",
          model: detail.model ?? "",
          connectionProfile: detail.adapter_type ?? "other",
          serialNumber: detail.serial_number ?? "",
          imei: detail.imei ?? "",
          vendorIdentifier: detail.vendor_device_identifier ?? "",
          custodianDriverId: detail.custodian_driver_id ?? "",
          simProvider: detail.sim_provider_name ?? "",
          firmwareVersion: detail.firmware_version ?? "",
          adminNote: detail.admin_note ?? ""
        });
      })
      .catch((detailError) => {
        if (!cancelled) setError(detailError instanceof Error ? detailError.message : "Could not load device detail.");
      });
    return () => { cancelled = true; };
  }, [editing, selectedId]);

  async function callDeviceRpc(name: string, body: object, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await adminFetch(config, session, config.url + "/rest/v1/rpc/" + name, {
        method: "POST",
        headers: createHeaders(config, session.accessToken, true),
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error("Device change could not be saved.");
      setMessage(success);
      setOperation((current) => ({ ...current, reason: "", note: "" }));
      await loadRegistry();
      await loadPhysicalReadiness(selectedId);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Device change could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  function identityBody(): AdminRegisterGpsDeviceRequest {
    const optional = (value: string) => value.trim() || null;
    return {
      p_device_code: identity.deviceCode.trim(),
      p_vendor: optional(identity.vendor),
      p_model: optional(identity.model),
      p_adapter_type: identity.connectionProfile as GpsDeviceAdapterType,
      p_protocol_type: identity.connectionProfile === "vendor_cloud" ? "vendor_managed" : identity.connectionProfile === "generic_http" ? "https" : "other",
      p_serial_number: optional(identity.serialNumber),
      p_imei: optional(identity.imei),
      p_vendor_device_identifier: optional(identity.vendorIdentifier),
      p_custodian_driver_id: optional(identity.custodianDriverId),
      p_sim_provider_name: optional(identity.simProvider),
      p_firmware_version: optional(identity.firmwareVersion),
      p_admin_note: optional(identity.adminNote)
    };
  }

  async function saveIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateGpsDeviceCode(identity.deviceCode);
    if (validationError) { setError(validationError); return; }
    const body = identityBody();
    if (editing && selected) {
      await callDeviceRpc("admin_update_gps_device", { p_device_id: selected.id, ...body }, "Device details updated.");
      setEditing(false);
    } else {
      await callDeviceRpc("admin_register_gps_device", body, "Device registered.");
      setShowRegistration(false);
      setIdentity({ deviceCode: "", vendor: "", model: "", connectionProfile: "other", serialNumber: "", imei: "", vendorIdentifier: "", custodianDriverId: "", simProvider: "", firmwareVersion: "", adminNote: "" });
    }
  }

  function requireReason(): string | null {
    const validationError = validateGpsDeviceReason(operation.reason);
    if (validationError) setError(validationError);
    return validationError;
  }

  async function changeStatus(status: GpsDeviceStatus) {
    if (!selected || requireReason()) return;
    await callDeviceRpc("admin_change_gps_device_status", {
      p_device_id: selected.id, p_status: status, p_reason: operation.reason.trim()
    }, `Device marked ${getGpsDeviceStatusLabel(status)}.`);
  }

  async function linkVehicle() {
    if (!selected || !operation.vehicleId || requireReason()) return;
    await callDeviceRpc("admin_link_gps_device_vehicle", {
      p_device_id: selected.id, p_vehicle_id: operation.vehicleId,
      p_effective_from: new Date(operation.effectiveAt).toISOString(),
      p_note: operation.note.trim() || null, p_reason: operation.reason.trim()
    }, currentLink ? "Vehicle reassigned." : "Vehicle linked.");
  }

  async function removeVehicle() {
    if (!selected || requireReason()) return;
    await callDeviceRpc("admin_remove_gps_device_vehicle", {
      p_device_id: selected.id, p_effective_until: new Date(operation.effectiveAt).toISOString(),
      p_reason: operation.reason.trim(), p_note: operation.note.trim() || null
    }, "Vehicle link removed.");
  }

  async function recordInstallation() {
    if (!selected) return;
    await callDeviceRpc("admin_record_gps_device_event", {
      p_device_id: selected.id, p_event_type: "installed",
      p_effective_at: new Date(operation.effectiveAt).toISOString(),
      p_vehicle_id: operation.vehicleId || currentLink?.vehicle_id || null,
      p_related_device_id: null, p_reason: operation.reason.trim() || null,
      p_note: operation.note.trim() || null
    }, "Installation recorded.");
  }

  async function replaceDevice() {
    if (!selected || !operation.replacementDeviceId || !(operation.vehicleId || currentLink?.vehicle_id) || requireReason()) return;
    await callDeviceRpc("admin_replace_gps_device", {
      p_old_device_id: selected.id, p_new_device_id: operation.replacementDeviceId,
      p_vehicle_id: operation.vehicleId || currentLink?.vehicle_id,
      p_effective_at: new Date(operation.effectiveAt).toISOString(),
      p_reason: operation.reason.trim(), p_note: operation.note.trim() || null
    }, "Replacement recorded.");
  }

  async function saveCredential(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !credentialDraft.keyId.trim()) { setError("Credential key ID is required."); return; }
    await callDeviceRpc("admin_upsert_gps_device_credential_metadata", {
      p_device_id: selected.id, p_credential_key_id: credentialDraft.keyId.trim(),
      p_status: credentialDraft.status,
      p_issued_at: new Date(credentialDraft.issuedAt).toISOString(),
      p_expires_at: credentialDraft.expiresAt ? new Date(credentialDraft.expiresAt).toISOString() : null,
      p_rotated_from_credential_id: null, p_admin_note: credentialDraft.note.trim() || null
    }, "Credential metadata updated.");
  }

  return <section className="device-registry" aria-labelledby="device-registry-title">
    <div className="panel-heading">
      <div><h2 id="device-registry-title">Device Registry</h2><p>Admin-only physical device identity, vehicle links, installation, and lifecycle history.</p></div>
      <button className="primary-button" type="button" onClick={() => { setEditing(false); setShowRegistration((value) => !value); }}>Register Device</button>
    </div>
    {error && <p className="form-alert admin-message" role="alert">{error}</p>}
    {message && <p className="form-status admin-message" role="status">{message}</p>}
    {showRegistration && <form className="form-section device-identity-form" onSubmit={saveIdentity}>
      <h3>{editing ? "Edit Device" : "Register Device"}</h3>
      {hardwareIdentityLocked && <p className="quiet-note">Hardware identity is locked after vehicle linking or installation. Use Record Replacement for different hardware; maintenance metadata remains editable.</p>}
      <div className="admin-filter-grid">
        <label>Device code<input value={identity.deviceCode} disabled={hardwareIdentityLocked} onChange={(event) => setIdentity({ ...identity, deviceCode: event.target.value })} required /></label>
        <label>Vendor<input value={identity.vendor} required disabled={hardwareIdentityLocked} onChange={(event) => setIdentity({ ...identity, vendor: event.target.value })} /></label>
        <label>Model<input value={identity.model} required disabled={hardwareIdentityLocked} onChange={(event) => setIdentity({ ...identity, model: event.target.value })} /></label>
        <label>Connection profile<select value={identity.connectionProfile} disabled={hardwareIdentityLocked} onChange={(event) => setIdentity({ ...identity, connectionProfile: event.target.value })}><option value="other">Not selected</option><option value="vendor_cloud">Vendor managed</option><option value="generic_http">Generic secure web (future setup)</option></select></label>
        <label>Serial number<input value={identity.serialNumber} disabled={hardwareIdentityLocked} onChange={(event) => setIdentity({ ...identity, serialNumber: event.target.value })} /></label>
        <label>IMEI<input value={identity.imei} disabled={hardwareIdentityLocked} onChange={(event) => setIdentity({ ...identity, imei: event.target.value })} /></label>
        <label>Vendor device ID<input value={identity.vendorIdentifier} disabled={hardwareIdentityLocked} onChange={(event) => setIdentity({ ...identity, vendorIdentifier: event.target.value })} /></label>
        <label>Optional custodian reference<input value={identity.custodianDriverId} onChange={(event) => setIdentity({ ...identity, custodianDriverId: event.target.value })} /><small>Non-authoritative; cannot override the active Ad Work assignment.</small></label>
        <label>SIM/network provider<input value={identity.simProvider} onChange={(event) => setIdentity({ ...identity, simProvider: event.target.value })} /></label>
        <label>Firmware version<input value={identity.firmwareVersion} onChange={(event) => setIdentity({ ...identity, firmwareVersion: event.target.value })} /></label>
      </div>
      <label>Admin note<textarea value={identity.adminNote} onChange={(event) => setIdentity({ ...identity, adminNote: event.target.value })} maxLength={500} /></label>
      <div className="admin-action-row"><button className="primary-button" disabled={busy}>{busy ? "Saving..." : "Save Device"}</button><button className="secondary-button" type="button" onClick={() => { setShowRegistration(false); setEditing(false); }}>Cancel</button></div>
    </form>}
    <div className="admin-filter-grid device-filters" aria-label="Device filters">
      <label>Search<input value={search} placeholder="Code, identifier, vehicle" onChange={(event) => setSearch(event.target.value)} /></label>
      <label>Device Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{gpsDeviceStatusOptions.map((status) => <option value={status} key={status}>{getGpsDeviceStatusLabel(status)}</option>)}</select></label>
      <label>Vendor<select value={vendorFilter} onChange={(event) => setVendorFilter(event.target.value)}><option value="all">All vendors</option>{vendors.map((vendor) => <option key={vendor}>{vendor}</option>)}</select></label>
      <label>Model<select value={modelFilter} onChange={(event) => setModelFilter(event.target.value)}><option value="all">All models</option>{models.map((model) => <option key={model}>{model}</option>)}</select></label>
      <label>Vehicle<select value={vehicleFilter} onChange={(event) => setVehicleFilter(event.target.value)}><option value="all">All vehicles</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.vehicle_number}</option>)}</select></label>
      <label>Installation<select value={installationFilter} onChange={(event) => setInstallationFilter(event.target.value)}><option value="all">All states</option>{gpsDeviceInstallationStatusOptions.map((status) => <option value={status} key={status}>{status.replaceAll("_", " ")}</option>)}</select></label>
      <label>Linked Vehicle<select value={linkFilter} onChange={(event) => setLinkFilter(event.target.value)}><option value="all">All</option><option value="linked">Linked</option><option value="unlinked">Unlinked</option></select></label>
      <label>GPS readiness<select value={gpsFilter} onChange={(event) => setGpsFilter(event.target.value)}><option value="all">All</option><option value="ready">Ready</option><option value="degraded">Degraded</option><option value="unavailable">Unavailable</option><option value="unknown">Unknown</option></select></label>
    </div>
    <div className="device-registry-layout">
      <section className="lead-list-panel">
        <div className="panel-heading"><h3>Devices</h3><span>{filtered.length} shown</span></div>
        <div className="device-list">{filtered.map((device) => {
          const link = links.find((entry) => entry.gps_device_id === device.id && !entry.effective_until);
          return <button type="button" key={device.id} className={selectedId === device.id ? "is-selected" : ""} onClick={() => setSelectedId(device.id)}>
            <span><strong>{device.device_code}</strong><small>{[device.vendor, device.model].filter(Boolean).join(" · ") || "Vendor/model not recorded"}</small></span>
            <span><small>{maskDeviceIdentifier(device.imei || device.serial_number || device.vendor_device_identifier)} · {vehicleLabel(link?.vehicle_id)}</small><small>Installation: {device.installation_state?.replaceAll("_", " ") ?? "unknown"} · GPS: {device.gps_readiness ?? "unknown"}</small><small>Heartbeat: {formatTime(device.last_heartbeat_at)}</small><small>Last Update: {formatTime(device.last_telemetry_at)} · Updated: {formatTime(device.updated_at)}</small></span>
            <span className="status-pill">{getGpsDeviceStatusLabel(device.status)}</span>
          </button>;
        })}{filtered.length === 0 && <p className="empty-state">No devices match these filters.</p>}</div>
      </section>
      <section className="lead-detail-panel device-detail" aria-labelledby="device-detail-title">
        {!selected ? <p className="empty-state">Select a device to view Device Detail.</p> : <>
          <div className="panel-heading"><div><h3 id="device-detail-title">Device Detail</h3><p>{selected.device_code}</p></div><button className="secondary-button" type="button" disabled={selected.status === "retired"} onClick={() => { setEditing(true); setShowRegistration(true); }}>Edit Device</button></div>
          <dl className="detail-grid">
            <div><dt>Device Status</dt><dd>{getGpsDeviceStatusLabel(selected.status)}</dd></div>
            <p className="form-help">Active is an operational registry state, not proof readiness. Proof readiness is decided server-side and also requires verified credential material.</p>
            <div><dt>Installation</dt><dd>{selected.installation_state?.replaceAll("_", " ") ?? "Not recorded"}</dd></div>
            <div><dt>Linked Vehicle</dt><dd>{currentVehicle?.vehicle_number ?? "Unlinked"}</dd></div>
            <div><dt>City/town</dt><dd>{currentVehicle?.city ?? "Not recorded"}</dd></div>
            <div><dt>Vendor / model</dt><dd>{[selected.vendor, selected.model].filter(Boolean).join(" / ") || "Not recorded"}</dd></div>
            <div><dt>Serial / IMEI</dt><dd>{maskDeviceIdentifier(selected.serial_number || selected.imei)}</dd></div>
            <div><dt>Adapter / protocol</dt><dd>{selected.adapter_type === "vendor_cloud" ? "Vendor managed" : selected.adapter_type === "generic_http" ? "Generic secure web (future setup)" : "Not selected"}</dd></div>
            <div><dt>GPS / GSM readiness</dt><dd>{selected.gps_readiness ?? "unknown"} / {selected.gsm_readiness ?? "unknown"}</dd></div>
            <div><dt>Power / battery</dt><dd>{selected.external_power_status?.replaceAll("_", " ") ?? "unknown"}{selected.battery_status == null ? "" : ` / ${selected.battery_status}`}</dd></div>
            <div><dt>Last Heartbeat</dt><dd>{formatTime(selected.last_heartbeat_at)}</dd></div>
            <div><dt>Last Update</dt><dd>{formatTime(selected.last_telemetry_at)}</dd></div>
            <div><dt>Updated</dt><dd>{formatTime(selected.updated_at)}</dd></div>
          </dl>
          <section className="form-section" aria-labelledby="physical-readiness-title">
            <h3 id="physical-readiness-title">Physical-pilot readiness</h3>
            {!physicalReadiness ? <p>Server readiness is loading.</p> : <>
              <p><strong>Stage:</strong> {physicalReadiness.stage.replaceAll("_", " ")}</p>
              <p><strong>Missing prerequisites:</strong> {physicalReadiness.blockingReasons.length ? physicalReadiness.blockingReasons.map((reason) => reason.replaceAll("_", " ")).join(", ") : "None"}</p>
              <p><strong>Selected adapter:</strong> {physicalReadiness.selectedAdapter ? `${physicalReadiness.selectedAdapter.adapterId} ${physicalReadiness.selectedAdapter.adapterVersion}` : "Not selected"}</p>
              <p>Credential: {physicalReadiness.credentialReady ? "ready" : "needed"} · Installation/link: {physicalReadiness.installationReady ? "ready" : "needed"} · Network: {physicalReadiness.networkReady ? "validated" : "not validated"}</p>
              <p><strong>Real-device evidence:</strong> {physicalReadiness.physicalEvidence ? "validated physical receipt" : "not recorded"}. Simulation and certification evidence never count as physical evidence.</p>
            </>}
          </section>
          <DeviceM22HealthPanel connection={{ url: config.url, anonKey: config.anonKey, accessToken: session.accessToken }} deviceId={selected.id} />
          {selected.admin_note && <p className="quiet-note"><strong>Admin note:</strong> {selected.admin_note}</p>}
          <fieldset className="form-section device-actions" disabled={busy || selected.status === "retired"}><legend>Admin actions</legend>
            <div className="admin-filter-grid">
              <label>Vehicle<select value={operation.vehicleId} onChange={(event) => setOperation({ ...operation, vehicleId: event.target.value })}><option value="">Select vehicle</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.vehicle_number}</option>)}</select></label>
              <label>Effective time<input type="datetime-local" value={operation.effectiveAt} onChange={(event) => setOperation({ ...operation, effectiveAt: event.target.value })} /></label>
              <label>Replacement Device<select value={operation.replacementDeviceId} onChange={(event) => setOperation({ ...operation, replacementDeviceId: event.target.value })}><option value="">Select replacement</option>{replacementCandidates.map((device) => <option value={device.id} key={device.id}>{device.device_code}</option>)}</select></label>
            </div>
            <label>Reason<textarea value={operation.reason} onChange={(event) => setOperation({ ...operation, reason: event.target.value })} maxLength={500} placeholder="Required for high-impact actions" /></label>
            <label>Safe note<textarea value={operation.note} onChange={(event) => setOperation({ ...operation, note: event.target.value })} maxLength={500} /></label>
            <div className="device-action-buttons">
              <button type="button" onClick={() => void linkVehicle()} disabled={busy}>{currentLink ? "Reassign Vehicle" : "Link Vehicle"}</button>
              <button type="button" onClick={() => void removeVehicle()} disabled={busy || !currentLink}>Remove from Vehicle</button>
              <button type="button" onClick={() => void recordInstallation()} disabled={busy}>Record Installation</button>
              <button type="button" onClick={() => void changeStatus("offline")} disabled={busy || !allowedStatusTransitions.includes("offline")}>Mark Offline</button>
              <button type="button" onClick={() => void changeStatus("not_working")} disabled={busy || !allowedStatusTransitions.includes("not_working")}>Mark Not Working</button>
              <button type="button" onClick={() => void changeStatus("suspended")} disabled={busy || !allowedStatusTransitions.includes("suspended")}>Suspend Device</button>
              <button type="button" onClick={() => void changeStatus("active")} disabled={busy || !allowedStatusTransitions.includes("active")}>Reactivate</button>
              <button type="button" onClick={() => void replaceDevice()} disabled={busy || replacementCandidates.length === 0}>Record Replacement</button>
              <button type="button" onClick={() => void changeStatus("retired")} disabled={busy || !allowedStatusTransitions.includes("retired")}>Retire Device</button>
            </div>
          </fieldset>
          <div className="device-history-grid">
            <section><h3>Vehicle link history</h3>{selectedLinks.map((link) => <article key={link.id}><strong>{vehicleLabel(link.vehicle_id)}</strong><span>{formatTime(link.effective_from)} – {link.effective_until ? formatTime(link.effective_until) : "Current"}</span>{link.installation_reference_note && <small>{link.installation_reference_note}</small>}</article>)}{selectedLinks.length === 0 && <p>No vehicle links recorded.</p>}</section>
            <section><h3>Installation and lifecycle history</h3>{selectedEvents.map((entry) => <article key={entry.id}><strong>{getGpsDeviceLifecycleEventLabel(entry.event_type)}</strong><span>{formatTime(entry.effective_at)}</span>{entry.reason && <small>{entry.reason}</small>}</article>)}{selectedEvents.length === 0 && <p>No lifecycle events recorded.</p>}</section>
          </div>
          <section className="form-section credential-metadata"><h3>Credential Status</h3><p>Safe metadata only. Secret or verification material is never shown here.</p>
            <div className="credential-list">{selectedCredentials.map((entry) => <article key={entry.id}><strong>{maskDeviceIdentifier(entry.credential_key_id)}</strong><span className="status-pill">{getGpsDeviceCredentialStatusLabel(entry.status)}</span><small>Issued {formatTime(entry.issued_at)} · Expires {formatTime(entry.expires_at)}</small></article>)}</div>
            <form onSubmit={saveCredential}><div className="admin-filter-grid">
              <label>Key ID<input maxLength={128} value={credentialDraft.keyId} onChange={(event) => setCredentialDraft({ ...credentialDraft, keyId: event.target.value })} required /></label>
              <label>Credential Status<select value={credentialDraft.status} onChange={(event) => setCredentialDraft({ ...credentialDraft, status: event.target.value as GpsDeviceCredentialStatus })}>{gpsDeviceCredentialStatusOptions.filter((status) => status !== "rotating").map((status) => <option value={status} key={status}>{getGpsDeviceCredentialStatusLabel(status)}</option>)}</select></label>
              <label>Issued<input type="datetime-local" value={credentialDraft.issuedAt} onChange={(event) => setCredentialDraft({ ...credentialDraft, issuedAt: event.target.value })} /></label>
              <label>Expires<input type="datetime-local" value={credentialDraft.expiresAt} onChange={(event) => setCredentialDraft({ ...credentialDraft, expiresAt: event.target.value })} /></label>
            </div><label>Safe note<input maxLength={500} value={credentialDraft.note} onChange={(event) => setCredentialDraft({ ...credentialDraft, note: event.target.value })} /></label><button className="secondary-button" disabled={busy || selected.status === "retired"}>Save metadata</button></form>
          </section>
          <section className="form-section"><h3>Audit summary</h3><p>Registration, identity, status, vehicle, installation, replacement, retirement, and credential-metadata changes are recorded in Activity history.</p></section>
        </>}
      </section>
    </div>
  </section>;
}


function AuditView({ config, session }: { config: SupabaseConfig; session: AuthSession }) {
  const [records, setRecords] = useState<AuditLogRecord[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadAudit() {
    setLoading(true);
    setError("");
    try {
      const response = await adminFetch(
        config,
        session,
        config.url + "/rest/v1/audit_logs?select=id,actor_type,action,entity_type,entity_id,created_at,safe_details&order=created_at.desc&limit=200",
        { headers: createHeaders(config, session.accessToken) }
      );
      if (!response.ok) throw new Error("Could not load activity history.");
      setRecords(await response.json() as AuditLogRecord[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load activity history.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadAudit(); }, [config, session.accessToken]);

  return <section className="admin-audit-view" aria-labelledby="audit-title">
    <div className="panel-heading"><div><h2 id="audit-title">Activity history</h2><p>Safe operational changes only. Private values are not displayed.</p></div><button className="secondary-button" type="button" onClick={() => void loadAudit()} disabled={loading}><RefreshCw size={18} /> Refresh</button></div>
    {error && <p className="form-alert" role="alert">{error}</p>}
    {!loading && records.length === 0 && <p className="empty-state">No recorded activity yet.</p>}
    <div className="audit-list">{records.map((record) => <article key={record.id}><div><strong>{record.action.replaceAll("_", " ")}</strong><span>{record.entity_type}</span></div><time dateTime={record.created_at}>{new Date(record.created_at).toLocaleString()}</time></article>)}</div>
  </section>;
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
  const navItems: { id: AdminView; label: string; icon: typeof LayoutDashboard }[] = [
    { id: "dashboard", label: "Today", icon: LayoutDashboard },
    { id: "enquiries", label: businessLabels.admin.enquiries, icon: Inbox },
    { id: "adWorks", label: businessLabels.admin.adWorks, icon: Megaphone },
    { id: "driverApplications", label: "Requests", icon: UserRoundCheck },
    { id: "drivers", label: businessLabels.admin.drivers, icon: Users },
    { id: "vehicles", label: businessLabels.admin.vehicles, icon: Truck },
    { id: "devices", label: businessLabels.admin.devices, icon: Cpu },
    { id: "trackingHealth", label: "Tracking Health", icon: Cpu },
    { id: "alerts", label: "Alerts", icon: FileClock },
    { id: "intelligence", label: "Intelligence & Adapters", icon: BrainCircuit },
    { id: "audit", label: "Activity", icon: FileClock }
  ];

  return (
    <main className="admin-app-shell">
      <aside className="admin-sidebar" aria-label="Admin navigation">
        <a className="admin-brand" href="/admin" aria-label={productName + " operations home"}>
          <img src="/assets/kootha-mark.svg" alt="" />
          <span className="admin-brand-copy">
            <strong>{productName}</strong>
            <small>Operations</small>
          </span>
        </a>

        {profile && activeView && onViewChange && (
          <nav className="admin-nav-list">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  className={item.id === activeView ? "is-active" : ""}
                  key={item.id}
                  type="button"
                  aria-current={item.id === activeView ? "page" : undefined}
                  onClick={() => onViewChange(item.id)}
                >
                  <Icon size={20} aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        )}

        <div className="admin-sidebar-footer">
          <a href="/">
            <Globe2 size={19} aria-hidden="true" />
            <span>Public website</span>
          </a>
          {profile && <span className="admin-profile-name">{profile.display_name || "Admin"}</span>}
          {onLogout && (
            <button type="button" onClick={onLogout}>
              <LogOut size={19} aria-hidden="true" />
              <span>Log out</span>
            </button>
          )}
        </div>
      </aside>

      <div className="admin-app-main">
        <header className="admin-mobile-header">
          <a href="/admin" aria-label="Kootha admin home">
            <img src="/assets/kootha-mark.svg" alt="" />
            <strong>Kootha Operations</strong>
          </a>
          {onLogout && <button type="button" onClick={onLogout} aria-label="Log out"><LogOut size={20} /></button>}
        </header>
        {children}
      </div>
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
  const [activeView, setActiveView] = useState<AdminView>("dashboard");
  const [enquiries, setEnquiries] = useState<EnquiryRecord[]>([]);
  const [adWorks, setAdWorks] = useState<AdWorkRecord[]>([]);
  const [adWorkDays, setAdWorkDays] = useState<AdWorkDayRecord[]>([]);
  const [cities, setCities] = useState<CityRecord[]>([]);
  const [areas, setAreas] = useState<AreaRecord[]>([]);
  const [filters, setFilters] = useState<AdminFilters>(emptyFilters);
  const [adWorkFilters, setAdWorkFilters] = useState<AdWorkFilters>(emptyAdWorkFilters);
  const [selectedEnquiryId, setSelectedEnquiryId] = useState<string | null>(null);
  const [selectedAdWorkId, setSelectedAdWorkId] = useState<string | null>(null);
  const [activeAdWorkStep, setActiveAdWorkStep] = useState<AdWorkWorkflowStep>("plan");
  const [isAdWorkListVisible, setIsAdWorkListVisible] = useState(true);
  const [draft, setDraft] = useState<AdminDraft | null>(null);
  const [adWorkDraft, setAdWorkDraft] = useState<AdWorkDraft | null>(null);
  const [dayDrafts, setDayDrafts] = useState<DayDraft[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingAdWork, setIsCreatingAdWork] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");



  useEffect(() => {
    const update = (event: Event) => setSession((event as CustomEvent<AuthSession>).detail);
    const expire = () => {
      clearStoredSession();
      setSession(null);
      setProfile(null);
    };
    window.addEventListener("kootha:admin-session", update);
    window.addEventListener("kootha:admin-session-expired", expire);
    return () => {
      window.removeEventListener("kootha:admin-session", update);
      window.removeEventListener("kootha:admin-session-expired", expire);
    };
  }, []);

  useEffect(() => {
    if (!config || !session?.refreshToken) return;

    let cancelled = false;
    const refreshIfNeeded = async () => {
      if (session.expiresAt && session.expiresAt - Date.now() > 120_000) return;
      try {
        const refreshed = await refreshAdminSession(config, session);
        if (!cancelled) {
          writeStoredSession(refreshed);
          setSession(refreshed);
        }
      } catch {
        if (!cancelled) {
          clearStoredSession();
          setSession(null);
          setProfile(null);
        }
      }
    };

    void refreshIfNeeded();
    const timer = window.setInterval(() => void refreshIfNeeded(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [config, session?.accessToken, session?.expiresAt, session?.refreshToken]);

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
      setProfile(adminProfile);

      const results = await Promise.allSettled([
        fetchAdminEnquiries(activeConfig, activeSession),
        fetchAdminAdWorks(activeConfig, activeSession),
        fetchAdminAdWorkDays(activeConfig, activeSession),
        fetchCities(activeConfig, activeSession),
        fetchAreas(activeConfig, activeSession)
      ]);
      const [enquiryResult, adWorkResult, dayResult, cityResult, areaResult] = results;

      if (enquiryResult.status === "fulfilled") {
        setEnquiries(enquiryResult.value);
        setSelectedEnquiryId((current) => current && enquiryResult.value.some((enquiry) => enquiry.id === current) ? current : enquiryResult.value[0]?.id ?? null);
      }
      if (adWorkResult.status === "fulfilled") {
        setAdWorks(adWorkResult.value);
        setSelectedAdWorkId((current) => current && adWorkResult.value.some((adWork) => adWork.id === current) ? current : adWorkResult.value[0]?.id ?? null);
      }
      if (dayResult.status === "fulfilled") setAdWorkDays(dayResult.value);
      if (cityResult.status === "fulfilled") setCities(cityResult.value);
      if (areaResult.status === "fulfilled") setAreas(areaResult.value);

      const failedSections = ["enquiries", "advertisement work", "work days", "cities", "areas"]
        .filter((_, index) => results[index]?.status === "rejected");
      if (failedSections.length > 0) {
        setLoadError("Could not load: " + failedSections.join(", ") + ". Refresh after checking the database setup.");
      }
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
      setIsAdWorkListVisible(false);
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
      setIsAdWorkListVisible(false);
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

  function applyDeliveryMethod(method: DeliveryMethod) {
    const requirements = getDeliveryMethodRequirements(method);
    setAdWorkDraft((current) => current && {
      ...current,
      deliveryMethod: method,
      executionMode: requirements.executionMode,
      driverRequired: requirements.driverRequired,
      vehicleRequired: requirements.vehicleRequired,
      speakerRequired: requirements.speakerRequired,
      areasRequired: requirements.areasRequired,
      photoProofNeeded: requirements.photoProofRequired,
      customerUpdatesRequired: requirements.customerUpdatesRequired,
      mobileLocationProofRequired: false
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
        if (view === "adWorks") setIsAdWorkListVisible(true);
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
              {activeView === "devices" && businessLabels.admin.devices}
              {activeView === "trackingHealth" && "Tracking Health"}
              {activeView === "alerts" && "Alerts"}
              {activeView === "intelligence" && "Intelligence and Adapter Readiness"}
              {activeView === "audit" && "Activity history"}
            </h1>
            <p>
              {activeView === "dashboard" && "See what needs attention and open the next action."}
              {activeView === "enquiries" && "View enquiries, follow up with customers, and create planned ad work."}
              {activeView === "adWorks" && "Plan advertisement work, schedules, areas, proof needed, and customer updates."}
              {activeView === "driverApplications" && "Review driver registrations, approve records, and handle duplicate submissions."}
              {activeView === "drivers" && "Manage approved drivers and onboarding status."}
              {activeView === "vehicles" && "Manage vehicle approval, Speaker equipment details, and Vehicle GPS Device readiness."}
              {activeView === "devices" && "Manage physical device identity, vehicle links, installation, lifecycle, and safe credential metadata."}
              {activeView === "trackingHealth" && "Review phone and physical-device health separately without maps or M23 comparison."}
              {activeView === "alerts" && "Review deterministic operational alerts and lifecycle history."}
              {activeView === "intelligence" && "Review vendor-neutral adapter readiness, data quality, explainable statistical signals, and model-governance gates."}
              {activeView === "audit" && "Review safe operational changes without exposing private values."}
            </p>
          </div>
          <button className="secondary-button refresh-button" type="button" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw size={18} aria-hidden="true" />
            <span>{isLoading ? "Loading..." : "Refresh"}</span>
          </button>
        </div>

        {activeView === "dashboard" && (
          <OperationsDashboard
            enquiries={enquiries}
            adWorks={adWorks}
            adWorkDays={adWorkDays}
            onOpen={(view, step, adWorkId) => {
              setActiveView(view);
              if (step) setActiveAdWorkStep(step);
              if (adWorkId) { setSelectedAdWorkId(adWorkId); setIsAdWorkListVisible(false); }
            }}
          />
        )}        {activeView === "enquiries" && <EnquirySummaryCards enquiries={enquiries} />}

        {loadError && <p className="form-alert admin-message" role="alert">{loadError}</p>}
        {saveMessage && <p className="form-status admin-message" role="status">{saveMessage}</p>}

        {activeView === "driverApplications" && <DriverApplicationsView config={config} session={session} />}
        {activeView === "drivers" && <DriversView config={config} session={session} />}
        {activeView === "vehicles" && <VehiclesView config={config} session={session} />}
        {activeView === "devices" && <DeviceRegistryView config={config} session={session} />}
        {activeView === "trackingHealth" && <TrackingHealthView connection={{ url: config.url, anonKey: config.anonKey, accessToken: session.accessToken }} />}
        {activeView === "alerts" && <AlertsView connection={{ url: config.url, anonKey: config.anonKey, accessToken: session.accessToken }} />}
        {activeView === "intelligence" && <IntelligenceAdapterReadinessView connection={{ url: config.url, anonKey: config.anonKey, accessToken: session.accessToken }} />}
        {activeView === "audit" && <AuditView config={config} session={session} />}

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
          <div className={isAdWorkListVisible ? "admin-lead-layout ad-work-layout show-list" : "admin-lead-layout ad-work-layout show-detail"}>
            <section className="lead-list-panel ad-work-list-panel" aria-labelledby="ad-work-list-title">
              <div className="panel-heading">
                <h2 id="ad-work-list-title">Ad Works</h2>
                <span>{filteredAdWorks.length} shown</span>
              </div>

              <div className="admin-filter-grid simplified-work-filters" aria-label="Ad work filters">
                <label>Search<input value={adWorkFilters.search} placeholder="Customer, business, or mobile" onChange={(event) => setAdWorkFilters((current) => ({ ...current, search: event.target.value }))} /></label>
                <label>City/town<select value={adWorkFilters.city} onChange={(event) => setAdWorkFilters((current) => ({ ...current, city: event.target.value }))}><option value="all">All towns</option>{adWorkCityOptions.map((city) => <option key={city} value={city}>{city}</option>)}</select></label>
                <details className="filter-date-options"><summary>Filter by date</summary><div className="form-grid"><label>From date<input type="date" value={adWorkFilters.startDate} onChange={(event) => setAdWorkFilters((current) => ({ ...current, startDate: event.target.value }))} /></label><label>To date<input type="date" value={adWorkFilters.endDate} onChange={(event) => setAdWorkFilters((current) => ({ ...current, endDate: event.target.value }))} /></label></div></details>
              </div>
              <div className="lead-list">
                {filteredAdWorks.map((adWork) => (
                  <button
                    className={adWork.id === selectedAdWorkId ? "ad-work-row is-selected" : "ad-work-row"}
                    type="button"
                    key={adWork.id}
                    onClick={() => { setSelectedAdWorkId(adWork.id); setActiveAdWorkStep(getStepForAction(getAdWorkNextAction(adWork, adWorkDays.filter((day) => day.ad_work_id === adWork.id)).action)); setIsAdWorkListVisible(false); }}
                  >
                    <span className="ad-work-row-main">
                      <strong>{adWork.business_name || adWork.title || "Advertisement work"}</strong>
                      <small>{getAdWorkReference(adWork.id)} - {adWork.customer_name}</small>
                    </span>
                    <span className="ad-work-row-meta">
                      <small>{adWork.city || "Town not set"}</small>
                      <small>{formatDate(adWork.start_date)} - {adWork.number_of_days} day{adWork.number_of_days === 1 ? "" : "s"}</small>
                    </span>
                    <span className="status-pill">{getAdWorkNextAction(adWork, adWorkDays.filter((day) => day.ad_work_id === adWork.id)).label}</span>
                    <span className="row-open">Open</span>
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
                  <button className="back-to-list-button" type="button" onClick={() => setIsAdWorkListVisible(true)}>Back to all advertisement work</button>
                  <div className="panel-heading">
                    <div>
                      <h2 id="ad-work-detail-title">{adWorkDraft.title || "Ad Work"}</h2>
                      <p>{getAdWorkReference(selectedAdWork.id)} - {adWorkDraft.customerName}</p>
                    </div>
                    <span className="status-pill">{deliveryMethodTemplates[adWorkDraft.deliveryMethod].label}</span>
                  </div>

                  {(() => {
                    const nextAction = getAdWorkNextAction(selectedAdWork, selectedAdWorkDays);
                    return (
                      <>
                        <div className="workflow-phase-bar" aria-label="Work progress">
                          {(["prepare", "do_work", "finish"] as const).map((phase, index) => (
                            <div className={nextAction.phase === phase ? "is-current" : ""} key={phase}>
                              <span>{index + 1}</span>
                              <strong>{phase === "prepare" ? "Prepare" : phase === "do_work" ? "Do Work" : "Finish"}</strong>
                            </div>
                          ))}
                        </div>
                        <section className="next-action-card" aria-labelledby="next-action-title">
                          <div>
                            <p className="eyebrow">Next action</p>
                            <h3 id="next-action-title">{nextAction.label}</h3>
                            <p>{nextAction.helper}</p>
                          </div>
                          {activeAdWorkStep !== getStepForAction(nextAction.action) && (
                            <button className="primary-button" type="button" onClick={() => setActiveAdWorkStep(getStepForAction(nextAction.action))}>{nextAction.label}</button>
                          )}
                        </section>
                        <details className="workflow-section-picker">
                          <summary>View or edit another section</summary>
                          <div className="admin-action-row">
                            {adWorkWorkflowSteps.map((step) => (
                              <button className={activeAdWorkStep === step.id ? "secondary-button is-active" : "secondary-button"} key={step.id} type="button" onClick={() => setActiveAdWorkStep(step.id)}>
                                {step.label}
                              </button>
                            ))}
                          </div>
                        </details>
                      </>
                    );
                  })()}

                  {activeAdWorkStep === "plan" && (
                    <div className="ad-work-step-panel">
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
                    <fieldset className="delivery-method-fieldset">
                      <legend>How will this work be delivered?</legend>
                      <p>Choose the closest option. The campaign subject can be anything.</p>
                      <div className="delivery-method-grid">
                        {deliveryMethods.map((method) => {
                          const template = deliveryMethodTemplates[method];
                          return (
                            <label className={adWorkDraft.deliveryMethod === method ? "delivery-method-card is-selected" : "delivery-method-card"} key={method}>
                              <input type="radio" name="delivery-method" checked={adWorkDraft.deliveryMethod === method} onChange={() => applyDeliveryMethod(method)} />
                              <span><strong>{template.label}</strong><small>{template.helper}</small></span>
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                    <div className="requirement-summary" aria-label="Selected work requirements">
                      <strong>Kootha will prepare:</strong>
                      <span>{adWorkDraft.driverRequired ? "Driver" : "Team managed"}</span>
                      {adWorkDraft.vehicleRequired && <span>Vehicle</span>}
                      {adWorkDraft.speakerRequired && <span>Speaker equipment</span>}
                      {adWorkDraft.photoProofNeeded && <span>Photo proof</span>}
                    </div>
                    <details className="more-details-block">
                      <summary>More planning details</summary>
                      <fieldset className="requirement-options">
                        <legend>Adjust job requirements</legend>
                        <label className="checkbox-row"><input type="checkbox" checked={adWorkDraft.driverRequired} onChange={(event) => updateAdWorkDraft("driverRequired", event.target.checked)} /><span>Driver or field worker needed</span></label>
                        <label className="checkbox-row"><input type="checkbox" checked={adWorkDraft.vehicleRequired} onChange={(event) => updateAdWorkDraft("vehicleRequired", event.target.checked)} /><span>Vehicle needed</span></label>
                        <label className="checkbox-row"><input type="checkbox" checked={adWorkDraft.speakerRequired} onChange={(event) => updateAdWorkDraft("speakerRequired", event.target.checked)} /><span>Speaker equipment needed</span></label>
                        <label className="checkbox-row"><input type="checkbox" checked={adWorkDraft.photoProofNeeded} onChange={(event) => updateAdWorkDraft("photoProofNeeded", event.target.checked)} /><span>Photo proof requested</span></label>
                        <label className="checkbox-row"><input type="checkbox" checked={adWorkDraft.customerUpdatesRequired} onChange={(event) => updateAdWorkDraft("customerUpdatesRequired", event.target.checked)} /><span>Customer work updates requested</span></label>
                      </fieldset>
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
                    </details>
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

                  <details className="more-details-block">
                    <summary>Day-wise schedule</summary>
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
                  </details>
                    </div>
                  )}

                  {activeAdWorkStep === "assign" && (
                    selectedAdWork.driver_required ? (
                      <AdWorkAssignmentPanel config={config} session={session} adWork={selectedAdWork} dayDrafts={dayDrafts} />
                    ) : (
                      <section className="form-section no-assignment-needed"><h3>No assignment needed</h3><p>This advertisement work is managed by the Kootha team.</p></section>
                    )
                  )}

                  {activeAdWorkStep === "release" && (
                    <div className="ad-work-step-panel">
                      {selectedAdWork.execution_mode === "admin_managed" ? (
                        <AdminManagedExecutionPanel config={config} session={session} adWork={selectedAdWork} dayDrafts={dayDrafts} onUpdated={loadData} />
                      ) : (
                        <>
                          <AdminExecutionPanel config={config} session={session} adWork={selectedAdWork} dayDrafts={dayDrafts} onReleased={loadData} />
                          {selectedAdWork.mobile_location_proof_required && <AdminMobileLocationProofPanel config={config} session={session} adWork={selectedAdWork} dayDrafts={dayDrafts} onUpdated={loadData} />}
                        </>
                      )}
                    </div>
                  )}

                  {activeAdWorkStep === "proof" && (
                  <AdminProofReviewPanel
                    config={config}
                    session={session}
                    adWork={selectedAdWork}
                    dayDrafts={dayDrafts}
                  />
                  )}

                  {activeAdWorkStep === "close" && (
                  <AdminFinalProofSummaryPanel
                    config={config}
                    session={session}
                    adWork={selectedAdWork}
                    dayDrafts={dayDrafts}
                    onUpdated={loadData}
                  />
                  )}

                  {activeAdWorkStep === "plan" && (
                    <details className="more-details-block proof-update-details">
                      <summary>More proof choices</summary>
                      <div className="checkbox-grid">
                        <label className="checkbox-row"><input type="checkbox" checked={adWorkDraft.audioVideoProofNeeded} onChange={(event) => updateAdWorkDraft("audioVideoProofNeeded", event.target.checked)} /><span>Audio or video proof</span></label>
                        <label className="checkbox-row"><input type="checkbox" checked={adWorkDraft.areaUpdateNeeded} onChange={(event) => updateAdWorkDraft("areaUpdateNeeded", event.target.checked)} /><span>Area progress updates</span></label>
                        <label className="checkbox-row"><input type="checkbox" checked={adWorkDraft.finalReportNeeded} onChange={(event) => updateAdWorkDraft("finalReportNeeded", event.target.checked)} /><span>Final proof summary</span></label>
                      </div>
                    </details>
                  )}
                  {activeAdWorkStep === "plan" && (
                    <div className="admin-action-row sticky-action-row">
                      <button className="primary-button" type="submit" disabled={isSaving}>{isSaving ? "Saving..." : "Save setup"}</button>
                    </div>
                  )}
                </form>
              )}
            </section>
          </div>
        )}
      </section>
    </AdminShell>
  );
}
