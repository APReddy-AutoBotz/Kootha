import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import {
  adWorkExecutionDayStatusLabels,
  businessLabels,
  canEndWork,
  canResumeWork,
  canStartMobileLocationProof,
  canStartWork,
  canTakeBreak,
  canUploadPhotoProof,
  executionProofNoteTypeLabels,
  executionProofNoteTypeOptions,
  getLocationQualityFromAccuracy,
  getTrackingHealthStatusLabel,
  getTrackingSessionStatusLabel,
  initialDriverApplication,
  mobileLocationProofConsentText,
  proofPhotoBucketName,
  resolveProductName,
  validateDriverApplication,
  validateDriverExecutionAction,
  validatePhotoProofInput,
  vehicleOwnershipLabels,
  vehicleOwnershipOptions,
  vehicleTypeLabels,
  vehicleTypeOptions,
  yesNoNotSureLabels,
  yesNoNotSureOptions
} from "@kootha/shared";
import type {
  AdWorkExecutionDayStatus,
  DriverApplicationInput,
  DriverExecutionAction,
  ExecutionProofNoteType,
  TrackingHealthStatus,
  TrackingSessionStatus,
  TrackingStopReason,
  VehicleOwnership,
  VehicleType,
  YesNoNotSure
} from "@kootha/shared";
import {
  Image,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";
import {
  DriverApiError,
  getForegroundLocationDecision,
  getLocationStatusAfterSuccessfulSync,
  getLocationStatusAfterWorkAction,
  isPointForLocationScope,
  markLocationPointsFailed,
  maxLocationSyncRetries,
  mergeBufferedLocationPoint,
  parseBufferedLocationPoints,
  removeAcceptedLocationPoints,
  selectLocationPointsForSync,
  shouldBufferLocationFailure,
  shouldReconcileWorkMutationFailure,
  withDriverApiTimeout,
} from "./src/locationProof";
import type { BufferedLocationPoint } from "./src/locationProof";

const productName = resolveProductName({
  productName: process.env.EXPO_PUBLIC_PRODUCT_NAME
});
const driverLabels = businessLabels.driver;
const publicKeyHeader = ["api", "key"].join("");
const locationBufferStorageKey = "kootha-driver-location-buffer-v1";
const proofUploadRequestTimeoutMs = 60_000;

type DriverScreen = "work" | "register";
type WorkPanel = "work" | "proof" | "help";
type DriverIconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

type ProofUploadSlot = {
  proof_upload_id: string;
  file_bucket: string;
  file_path: string;
  upload_status: string;
  result_message: string;
};

type DriverWorkRow = {
  ad_work_id: string;
  ad_work_day_id: string;
  assignment_id: string;
  driver_id: string;
  vehicle_id: string | null;
  business_name: string | null;
  city: string | null;
  areas_to_cover: string | null;
  advertisement_details: string | null;
  planned_date: string;
  planned_start_time: string | null;
  planned_end_time: string | null;
  execution_status: AdWorkExecutionDayStatus;
  vehicle_number: string | null;
  special_instructions: string | null;
  mobile_location_proof_required: boolean;
  mobile_location_proof_note: string | null;
  mobile_location_tracking_mode: string | null;
  mobile_tracking_session_id: string | null;
  mobile_tracking_status: TrackingSessionStatus;
  mobile_location_point_count: number;
  mobile_last_location_update_at: string | null;
  mobile_tracking_health_status: TrackingHealthStatus;
  mobile_pending_point_count: number;
  mobile_last_successful_sync_at: string | null;
  mobile_last_capture_at: string | null;
};

type MobileTrackingResult = {
  tracking_session_id: string;
  status: TrackingSessionStatus;
  point_count?: number;
  quality_status?: string;
  tracking_health_status?: TrackingHealthStatus;
  client_point_id?: string;
  stop_reason?: TrackingStopReason;
  result_message: string;
};

type MobileSyncResult = {
  tracking_session_id: string;
  synced_count: number;
  duplicate_count: number;
  failed_count: number;
  accepted_client_point_ids: string[];
  point_count: number;
  tracking_health_status: TrackingHealthStatus;
  last_successful_sync_at: string | null;
  result_message: string;
};

function getDriverSupabaseConfig() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

  if (!url || !anonKey || url.includes("your-project") || anonKey.includes("replace-with")) {
    return null;
  }

  return {
    url: url.replace(/\/$/, ""),
    anonKey
  };
}

function createPublicHeaders(config: { anonKey: string }, json = false) {
  return {
    [publicKeyHeader]: config.anonKey,
    Authorization: "Bearer " + config.anonKey,
    ...(json ? { "Content-Type": "application/json" } : {})
  };
}

function fetchDriverApi(url: string, init: RequestInit, timeoutMs?: number) {
  return withDriverApiTimeout(
    (signal) => fetch(url, { ...init, signal }),
    timeoutMs,
  );
}

async function submitDriverApplication(input: DriverApplicationInput) {
  const config = getDriverSupabaseConfig();

  if (!config) {
    throw new Error("Driver registration is not configured in this environment.");
  }

  const response = await fetchDriverApi(config.url + "/rest/v1/driver_applications", {
    method: "POST",
    headers: {
      ...createPublicHeaders(config, true),
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      driver_name: input.driverName.trim(),
      phone: input.mobileNumber.trim(),
      city: input.cityTown.trim(),
      service_areas: input.serviceAreas.trim() || null,
      vehicle_ownership: input.vehicleOwnership,
      vehicle_type: input.vehicleType,
      vehicle_number: input.vehicleNumber.trim() || null,
      mic_system_available: input.micSystemAvailable,
      gps_device_available: input.gpsDeviceAvailable,
      preferred_working_cities: input.preferredWorkingCities.trim() || null,
      notes: input.notes.trim() || null,
      contact_consent: input.consentToContact,
      status: "new",
      company_website: input.companyWebsite?.trim() || null
    })
  });

  if (!response.ok) {
    throw new Error("Could not submit details right now.");
  }
}

async function loadAssignedWork(mobileNumber: string, workCode: string): Promise<DriverWorkRow[]> {
  const config = getDriverSupabaseConfig();

  if (!config) {
    throw new Error("Driver work access is not configured in this environment.");
  }

  const response = await fetchDriverApi(config.url + "/rest/v1/rpc/driver_get_assigned_work", {
    method: "POST",
    headers: createPublicHeaders(config, true),
    body: JSON.stringify({
      p_mobile: mobileNumber.trim(),
      p_work_code: workCode.trim()
    })
  });

  if (!response.ok) {
    throw new DriverApiError("Could not open assigned work. Check mobile number and Work Code.", response.status);
  }

  return await response.json() as DriverWorkRow[];
}

async function saveWorkAction(input: {
  mobileNumber: string;
  workCode: string;
  dayId: string;
  action: DriverExecutionAction;
  note?: string;
  areaPlaceName?: string;
  proofType?: ExecutionProofNoteType;
}) {
  const config = getDriverSupabaseConfig();

  if (!config) {
    throw new Error("Driver work access is not configured in this environment.");
  }

  const response = await fetchDriverApi(config.url + "/rest/v1/rpc/driver_update_work_day", {
    method: "POST",
    headers: createPublicHeaders(config, true),
    body: JSON.stringify({
      p_mobile: input.mobileNumber.trim(),
      p_work_code: input.workCode.trim(),
      p_ad_work_day_id: input.dayId,
      p_action: input.action,
      p_note: input.note?.trim() || null,
      p_area_place_name: input.areaPlaceName?.trim() || null,
      p_proof_type: input.proofType ?? null
    })
  });

  if (!response.ok) {
    throw new DriverApiError("Could not save work update.", response.status);
  }
}
async function startMobileTracking(input: {
  mobileNumber: string;
  workCode: string;
  dayId: string;
  driverConsent: boolean;
}): Promise<MobileTrackingResult> {
  const config = getDriverSupabaseConfig();

  if (!config) {
    throw new Error("Driver work access is not configured in this environment.");
  }

  const response = await fetchDriverApi(config.url + "/rest/v1/rpc/driver_start_mobile_tracking", {
    method: "POST",
    headers: createPublicHeaders(config, true),
    body: JSON.stringify({
      p_mobile: input.mobileNumber.trim(),
      p_work_code: input.workCode.trim(),
      p_ad_work_day_id: input.dayId,
      p_driver_consent: input.driverConsent
    })
  });

  if (!response.ok) {
    throw new DriverApiError("Could not start Location Proof.", response.status);
  }

  const rows = await response.json() as MobileTrackingResult[];
  return rows[0];
}

async function markMobileLocationPermissionMissing(input: {
  mobileNumber: string;
  workCode: string;
  dayId: string;
}): Promise<MobileTrackingResult> {
  const config = getDriverSupabaseConfig();

  if (!config) {
    throw new Error("Driver work access is not configured in this environment.");
  }

  const response = await fetchDriverApi(config.url + "/rest/v1/rpc/driver_mark_mobile_location_permission_missing", {
    method: "POST",
    headers: createPublicHeaders(config, true),
    body: JSON.stringify({
      p_mobile: input.mobileNumber.trim(),
      p_work_code: input.workCode.trim(),
      p_ad_work_day_id: input.dayId
    })
  });

  if (!response.ok) {
    throw new Error("Location Permission Needed.");
  }

  const rows = await response.json() as MobileTrackingResult[];
  return rows[0];
}

async function recordMobileLocationPoint(input: {
  mobileNumber: string;
  workCode: string;
  trackingSessionId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  capturedAt: string;
  clientPointId: string;
}): Promise<MobileTrackingResult> {
  const config = getDriverSupabaseConfig();

  if (!config) {
    throw new Error("Driver work access is not configured in this environment.");
  }

  const response = await fetchDriverApi(config.url + "/rest/v1/rpc/driver_record_mobile_location_point", {
    method: "POST",
    headers: createPublicHeaders(config, true),
    body: JSON.stringify({
      p_mobile: input.mobileNumber.trim(),
      p_work_code: input.workCode.trim(),
      p_tracking_session_id: input.trackingSessionId,
      p_lat: input.latitude,
      p_lng: input.longitude,
      p_accuracy: input.accuracy,
      p_speed: input.speed,
      p_heading: input.heading,
      p_captured_at: input.capturedAt,
      p_client_point_id: input.clientPointId
    })
  });

  if (!response.ok) {
    throw new DriverApiError("Could not save location update.", response.status);
  }

  const rows = await response.json() as MobileTrackingResult[];
  return rows[0];
}

async function syncMobileLocationPoints(input: {
  mobileNumber: string;
  workCode: string;
  trackingSessionId: string;
  points: BufferedLocationPoint[];
  clientPendingCount: number;
}): Promise<MobileSyncResult> {
  const config = getDriverSupabaseConfig();

  if (!config) {
    throw new Error("Driver work access is not configured in this environment.");
  }

  const response = await fetchDriverApi(config.url + "/rest/v1/rpc/driver_sync_mobile_location_points", {
    method: "POST",
    headers: createPublicHeaders(config, true),
    body: JSON.stringify({
      p_mobile: input.mobileNumber.trim(),
      p_work_code: input.workCode.trim(),
      p_tracking_session_id: input.trackingSessionId,
      p_points: input.points,
      p_client_pending_count: input.clientPendingCount
    })
  });

  if (!response.ok) {
    throw new DriverApiError("Could not sync Location Proof.", response.status);
  }

  const rows = await response.json() as MobileSyncResult[];
  return rows[0];
}

async function stopMobileTracking(input: {
  mobileNumber: string;
  workCode: string;
  trackingSessionId: string;
  stopReason: TrackingStopReason;
}): Promise<MobileTrackingResult> {
  const config = getDriverSupabaseConfig();

  if (!config) {
    throw new Error("Driver work access is not configured in this environment.");
  }

  const response = await fetchDriverApi(config.url + "/rest/v1/rpc/driver_stop_mobile_tracking", {
    method: "POST",
    headers: createPublicHeaders(config, true),
    body: JSON.stringify({
      p_mobile: input.mobileNumber.trim(),
      p_work_code: input.workCode.trim(),
      p_tracking_session_id: input.trackingSessionId,
      p_stop_reason: input.stopReason
    })
  });

  if (!response.ok) {
    throw new Error("Could not stop Location Proof.");
  }

  const rows = await response.json() as MobileTrackingResult[];
  return rows[0];
}
function encodeStoragePath(path: string): string {
  return path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function guessProofPhotoMimeType(uri: string): string {
  const normalizedUri = uri.toLowerCase().split("?")[0] ?? "";

  if (normalizedUri.endsWith(".png")) {
    return "image/png";
  }

  if (normalizedUri.endsWith(".webp")) {
    return "image/webp";
  }

  return "image/jpeg";
}

async function requestProofUploadSlot(input: {
  mobileNumber: string;
  workCode: string;
  dayId: string;
  proofType: ExecutionProofNoteType;
  areaPlaceName: string;
  note: string;
  mimeType: string;
  fileSize: number;
}): Promise<ProofUploadSlot> {
  const config = getDriverSupabaseConfig();

  if (!config) {
    throw new Error("Driver work access is not configured in this environment.");
  }

  const response = await fetchDriverApi(config.url + "/rest/v1/rpc/request_driver_proof_upload", {
    method: "POST",
    headers: createPublicHeaders(config, true),
    body: JSON.stringify({
      p_mobile: input.mobileNumber.trim(),
      p_work_code: input.workCode.trim(),
      p_ad_work_day_id: input.dayId,
      p_proof_type: input.proofType,
      p_area_place_name: input.areaPlaceName.trim(),
      p_note_text: input.note.trim(),
      p_file_mime_type: input.mimeType,
      p_file_size_bytes: input.fileSize
    })
  });

  if (!response.ok) {
    throw new Error("Could not prepare photo proof upload.");
  }

  const slots = await response.json() as ProofUploadSlot[];
  const slot = slots[0];

  if (!slot?.proof_upload_id || slot.file_bucket !== proofPhotoBucketName) {
    throw new Error("Could not prepare photo proof upload.");
  }

  return slot;
}

async function uploadProofPhoto(input: { slot: ProofUploadSlot; photoUri: string; mimeType: string }) {
  const config = getDriverSupabaseConfig();

  if (!config) {
    throw new Error("Driver work access is not configured in this environment.");
  }

  const photoResponse = await fetch(input.photoUri);
  if (!photoResponse.ok) {
    throw new Error("Could not read selected photo.");
  }

  const photoBlob = await photoResponse.blob();
  const response = await fetchDriverApi(config.url + "/storage/v1/object/" + input.slot.file_bucket + "/" + encodeStoragePath(input.slot.file_path), {
    method: "POST",
    headers: {
      ...createPublicHeaders(config),
      "Content-Type": input.mimeType,
      "x-upsert": "false"
    },
    body: photoBlob
  }, proofUploadRequestTimeoutMs);

  if (!response.ok) {
    throw new Error("Could not upload photo proof.");
  }
}

async function completeProofUpload(input: { mobileNumber: string; workCode: string; proofUploadId: string }) {
  const config = getDriverSupabaseConfig();

  if (!config) {
    throw new Error("Driver work access is not configured in this environment.");
  }

  const response = await fetchDriverApi(config.url + "/rest/v1/rpc/complete_driver_proof_upload", {
    method: "POST",
    headers: createPublicHeaders(config, true),
    body: JSON.stringify({
      p_mobile: input.mobileNumber.trim(),
      p_work_code: input.workCode.trim(),
      p_proof_upload_id: input.proofUploadId
    })
  });

  if (!response.ok) {
    throw new Error("Could not finish photo proof upload.");
  }
}

function KoothaBrand({ name }: { name: string }) {
  return (
    <View style={styles.brandRow}>
      <Image source={require("./assets/kootha-icon.png")} style={styles.brandLogo} />
      <View>
        <Text style={styles.brand}>{name}</Text>
        <Text style={styles.brandTagline}>Driver work</Text>
      </View>
    </View>
  );
}
function OptionButton<T extends string>({
  label,
  value,
  selected,
  onSelect
}: {
  label: string;
  value: T;
  selected: boolean;
  onSelect: (value: T) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.optionButton,
        selected && styles.optionButtonSelected,
        pressed && styles.buttonPressed
      ]}
      onPress={() => onSelect(value)}
    >
      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function PrimaryButton({
  label,
  icon,
  disabled,
  onPress
}: {
  label: string;
  icon?: DriverIconName;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        disabled && styles.buttonDisabled,
        pressed && styles.buttonPressed
      ]}
      onPress={onPress}
    >
      <View style={styles.buttonContent}>
        {icon ? <MaterialCommunityIcons name={icon} size={24} color="#fffaf1" /> : null}
        <Text style={styles.buttonText}>{label}</Text>
      </View>
    </Pressable>
  );
}

function SecondaryButton({
  label,
  icon,
  disabled,
  onPress
}: {
  label: string;
  icon?: DriverIconName;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.secondaryButton,
        disabled && styles.buttonDisabled,
        pressed && styles.buttonPressed
      ]}
      onPress={onPress}
    >
      <View style={styles.buttonContent}>
        {icon ? <MaterialCommunityIcons name={icon} size={21} color="#b83f12" /> : null}
        <Text style={styles.secondaryButtonText}>{label}</Text>
      </View>
    </Pressable>
  );
}
function formatDate(value: string | null | undefined) {
  return value || "Not set";
}

function createClientPointId() {
  return "phone-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function toFiniteLocationValue(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function readBufferedLocationPoints() {
  return parseBufferedLocationPoints(await AsyncStorage.getItem(locationBufferStorageKey));
}

async function writeBufferedLocationPoints(points: BufferedLocationPoint[]) {
  if (points.length === 0) {
    await AsyncStorage.removeItem(locationBufferStorageKey);
    return;
  }

  await AsyncStorage.setItem(locationBufferStorageKey, JSON.stringify(points));
}

function isPointForWork(point: BufferedLocationPoint, work: DriverWorkRow, trackingSessionId: string) {
  return isPointForLocationScope(point, {
    trackingSessionId,
    adWorkId: work.ad_work_id,
    adWorkDayId: work.ad_work_day_id,
    assignmentId: work.assignment_id,
    driverId: work.driver_id,
    vehicleId: work.vehicle_id,
  });
}

async function saveBufferedLocationPoint(point: BufferedLocationPoint) {
  const current = await readBufferedLocationPoints();
  await writeBufferedLocationPoints(mergeBufferedLocationPoint(current, point));
}

async function markBufferedLocationPointsFailed(points: BufferedLocationPoint[]) {
  const attemptedAt = new Date().toISOString();
  const current = await readBufferedLocationPoints();
  await writeBufferedLocationPoints(markLocationPointsFailed(
    current,
    points.map((point) => point.client_point_id),
    attemptedAt,
  ));
}

async function removeAcceptedBufferedLocationPoints(acceptedClientPointIds: string[]) {
  if (acceptedClientPointIds.length === 0) {
    return;
  }

  const current = await readBufferedLocationPoints();
  await writeBufferedLocationPoints(removeAcceptedLocationPoints(current, acceptedClientPointIds));
}

async function pruneBufferedLocationPointsForWork(work: DriverWorkRow, trackingSessionId: string) {
  const current = await readBufferedLocationPoints();
  return current.filter((point) => isPointForWork(point, work, trackingSessionId));
}

export function App() {
  const [locale, setLocale] = useState<"en" | "te">("en");
  const [screen, setScreen] = useState<DriverScreen>("work");
  const [workPanel, setWorkPanel] = useState<WorkPanel>("work");
  const [form, setForm] = useState<DriverApplicationInput>(initialDriverApplication);
  const [errors, setErrors] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mobileNumber, setMobileNumber] = useState("");
  const [workCode, setWorkCode] = useState("");
  const [workRows, setWorkRows] = useState<DriverWorkRow[]>([]);
  const [workMessage, setWorkMessage] = useState("");
  const [isWorkLoading, setIsWorkLoading] = useState(false);
  const [completionNote, setCompletionNote] = useState("");
  const [issueNote, setIssueNote] = useState("");
  const [proofNote, setProofNote] = useState("");
  const [proofArea, setProofArea] = useState("");
  const [proofType, setProofType] = useState<ExecutionProofNoteType>("area_covered");
  const [proofPhoto, setProofPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [isProofSubmitting, setIsProofSubmitting] = useState(false);
  const [locationUnderstanding, setLocationUnderstanding] = useState(false);
  const [locationAgreement, setLocationAgreement] = useState(false);
  const [locationSessionId, setLocationSessionId] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<TrackingSessionStatus>("not_started");
  const [locationPointCount, setLocationPointCount] = useState(0);
  const [lastLocationUpdate, setLastLocationUpdate] = useState<string | null>(null);
  const [locationHealthStatus, setLocationHealthStatus] = useState<TrackingHealthStatus>("stopped");
  const [pendingOfflineCount, setPendingOfflineCount] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [lastSavedLocationTime, setLastSavedLocationTime] = useState<string | null>(null);
  const [locationMessage, setLocationMessage] = useState("");
  const [isLocationBusy, setIsLocationBusy] = useState(false);
  const [isLocationSyncing, setIsLocationSyncing] = useState(false);
  const locationCaptureInFlight = useRef(false);
  const locationSyncInFlight = useRef(false);
  const workActionInFlight = useRef(false);
  const configured = useMemo(() => Boolean(getDriverSupabaseConfig()), []);
  const today = new Date().toISOString().slice(0, 10);
  const currentWork = workRows.find((row) => row.planned_date === today)
    ?? workRows.find((row) => row.execution_status !== "completed")
    ?? workRows[0]
    ?? null;
  const currentStatus = currentWork?.execution_status ?? "planned";
  const mobileLocationProofRequired = Boolean(currentWork?.mobile_location_proof_required);
  const canStartLocationProof = currentWork ? canStartMobileLocationProof({
    mobileLocationProofRequired,
    assignmentStatus: "ready_for_execution",
    releaseStatus: "released_to_driver",
    dayStatus: currentStatus,
    closureStatus: null
  }) : false;

  useEffect(() => {
    setLocationSessionId(currentWork?.mobile_tracking_session_id ?? null);
    setLocationStatus(currentWork?.mobile_tracking_status ?? "not_started");
    setLocationPointCount(currentWork?.mobile_location_point_count ?? 0);
    setLastLocationUpdate(currentWork?.mobile_last_location_update_at ?? null);
    setLocationHealthStatus(currentWork?.mobile_tracking_health_status ?? "stopped");
    setPendingOfflineCount(currentWork?.mobile_pending_point_count ?? 0);
    setLastSyncTime(currentWork?.mobile_last_successful_sync_at ?? null);
    setLastSavedLocationTime(currentWork?.mobile_last_capture_at ?? currentWork?.mobile_last_location_update_at ?? null);
    setLocationMessage("");
    if (currentWork?.mobile_tracking_session_id) {
      void refreshBufferedLocationSummary(currentWork, currentWork.mobile_tracking_session_id);
      void syncBufferedLocationPointsForWork(currentWork, currentWork.mobile_tracking_session_id, false);
    }
  }, [currentWork?.ad_work_day_id, currentWork?.mobile_tracking_session_id, currentWork?.mobile_tracking_status, currentWork?.mobile_location_point_count, currentWork?.mobile_last_location_update_at, currentWork?.mobile_tracking_health_status, currentWork?.mobile_pending_point_count, currentWork?.mobile_last_successful_sync_at, currentWork?.mobile_last_capture_at]);

  useEffect(() => {
    setLocationUnderstanding(false);
    setLocationAgreement(false);
  }, [currentWork?.ad_work_day_id]);

  useEffect(() => {
    if (!locationSessionId || locationStatus !== "running" || currentStatus !== "running") {
      return undefined;
    }

    const timer = setInterval(() => {
      void recordCurrentLocationPoint(locationSessionId, false).then(async (captureRemainsActive) => {
        if (captureRemainsActive && currentWork) {
          await syncBufferedLocationPointsForWork(currentWork, locationSessionId, false);
        }
      });
    }, 60000);

    return () => clearInterval(timer);
  }, [locationSessionId, locationStatus, currentStatus, mobileNumber, workCode, currentWork?.ad_work_day_id]);

  function updateField<K extends keyof DriverApplicationInput>(field: K, value: DriverApplicationInput[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function refreshAssignedWork() {
    const rows = await loadAssignedWork(mobileNumber, workCode);
    setWorkRows(rows);
    setWorkMessage(rows.length === 0 ? "No assigned work found for this Work Code." : "Assigned Work opened.");
    return rows;
  }

  async function reconcileAssignedWorkAfterMutationFailure(workDayId: string) {
    const rows = await refreshAssignedWork();
    const refreshedWork = rows.find((row) => row.ad_work_day_id === workDayId) ?? null;

    setLocationSessionId(refreshedWork?.mobile_tracking_session_id ?? null);
    setLocationStatus(refreshedWork?.mobile_tracking_status ?? "stopped");
    setLocationPointCount(refreshedWork?.mobile_location_point_count ?? 0);
    setLastLocationUpdate(refreshedWork?.mobile_last_location_update_at ?? null);
    setLocationHealthStatus(refreshedWork?.mobile_tracking_health_status ?? "stopped");
    setPendingOfflineCount(refreshedWork?.mobile_pending_point_count ?? 0);
    setLastSyncTime(refreshedWork?.mobile_last_successful_sync_at ?? null);
    setLastSavedLocationTime(refreshedWork?.mobile_last_capture_at ?? refreshedWork?.mobile_last_location_update_at ?? null);

    if (!refreshedWork || refreshedWork.mobile_tracking_status !== "running") {
      setLocationMessage(refreshedWork?.mobile_tracking_status === "paused"
        ? "Location Proof paused during break."
        : "Location Proof stopped because active work authorization changed.");
    }
  }

  async function handleOpenWork() {
    setWorkMessage("");

    if (!mobileNumber.trim() || !workCode.trim()) {
      setWorkMessage("Enter mobile number and Work Code.");
      return;
    }

    try {
      setIsWorkLoading(true);
      await refreshAssignedWork();
    } catch (error) {
      setWorkRows([]);
      setWorkMessage(error instanceof Error ? error.message : "Could not open assigned work.");
    } finally {
      setIsWorkLoading(false);
    }
  }

  async function refreshBufferedLocationSummary(work: DriverWorkRow, trackingSessionId: string) {
    const buffered = await pruneBufferedLocationPointsForWork(work, trackingSessionId);
    setPendingOfflineCount(buffered.length);
    const sortedCaptures = buffered.map((point) => point.captured_at).sort();
    const latestCapture = sortedCaptures[sortedCaptures.length - 1] ?? null;
    if (latestCapture) {
      setLastSavedLocationTime(latestCapture);
    }
    if (buffered.some((point) => point.sync_status === "sync_failed" || point.retry_count >= maxLocationSyncRetries)) {
      setLocationHealthStatus("sync_failed");
    } else if (buffered.length > 0) {
      setLocationHealthStatus("sync_pending");
    }
  }

  async function syncBufferedLocationPointsForWork(work: DriverWorkRow, trackingSessionId: string, force: boolean) {
    if (locationSyncInFlight.current) {
      return;
    }

    locationSyncInFlight.current = true;

    try {
      const buffered = await pruneBufferedLocationPointsForWork(work, trackingSessionId);
      const retryable = selectLocationPointsForSync(buffered, force);
      setPendingOfflineCount(buffered.length);

      if (retryable.length === 0) {
        if (buffered.length > 0) {
          setLocationHealthStatus("sync_failed");
        }
        return;
      }

      setIsLocationSyncing(true);
      try {
        const result = await syncMobileLocationPoints({
          mobileNumber,
          workCode,
          trackingSessionId,
          points: retryable,
          clientPendingCount: buffered.length
        });
        await removeAcceptedBufferedLocationPoints(result.accepted_client_point_ids ?? []);
        const remaining = await pruneBufferedLocationPointsForWork(work, trackingSessionId);
        setPendingOfflineCount(remaining.length);
        setLocationPointCount(result.point_count ?? locationPointCount);
        setLocationStatus((currentTrackingStatus) => getLocationStatusAfterSuccessfulSync({
          executionStatus: work.execution_status,
          requestTrackingStatus: locationStatus,
          currentTrackingStatus,
          failedCount: result.failed_count ?? 0,
          acceptedCount: result.accepted_client_point_ids?.length ?? 0,
          trackingHealthStatus: result.tracking_health_status,
        }));
        setLocationHealthStatus(result.tracking_health_status ?? (remaining.length > 0 ? "sync_pending" : "healthy"));
        setLastSyncTime(result.last_successful_sync_at ?? new Date().toISOString());
        if (force || retryable.length > 0) {
          setLocationMessage(result.result_message || driverLabels.locationSynced + ".");
        }
      } catch (error) {
        if (shouldBufferLocationFailure(error)) {
          await markBufferedLocationPointsFailed(retryable);
        } else {
          setLocationStatus("stopped");
        }
        const failed = await pruneBufferedLocationPointsForWork(work, trackingSessionId);
        setPendingOfflineCount(failed.length);
        setLocationHealthStatus("sync_failed");
        if (force) {
          setLocationMessage(driverLabels.syncFailed + ". " + driverLabels.trySyncAgain + ".");
        }
      }
    } finally {
      setIsLocationSyncing(false);
      locationSyncInFlight.current = false;
    }
  }

  async function handleSyncNow() {
    if (!currentWork || !locationSessionId) {
      return;
    }

    setLocationMessage(driverLabels.syncingLocationProof + ".");
    await syncBufferedLocationPointsForWork(currentWork, locationSessionId, true);
  }

  async function handleSaveLocationNow() {
    if (!locationSessionId || locationStatus !== "running" || currentStatus !== "running") {
      return;
    }

    try {
      setIsLocationBusy(true);
      await recordCurrentLocationPoint(locationSessionId, true);
    } finally {
      setIsLocationBusy(false);
    }
  }

  async function markLocationPermissionMissingOnDevice(work: DriverWorkRow) {
    setLocationStatus("permission_missing");
    setLocationHealthStatus("permission_missing");
    setLocationMessage(driverLabels.locationPermissionNeeded + ". Location Proof stopped on this phone.");

    try {
      const missing = await markMobileLocationPermissionMissing({
        mobileNumber,
        workCode,
        dayId: work.ad_work_day_id,
      });
      setLocationSessionId(missing?.tracking_session_id ?? null);
    } catch {
      setLocationMessage(driverLabels.locationPermissionNeeded + ". Location Proof stopped on this phone; reopen the work when online.");
    }
  }

  async function refreshActiveLocationAuthorization(
    work: DriverWorkRow,
    trackingSessionId: string,
    trackingStatus: TrackingSessionStatus,
  ): Promise<DriverWorkRow | null> {
    try {
      const rows = await loadAssignedWork(mobileNumber, workCode);
      setWorkRows(rows);
      const refreshed = rows.find((row) => row.ad_work_day_id === work.ad_work_day_id) ?? null;
      const decision = getForegroundLocationDecision({
        locationProofRequired: Boolean(refreshed?.mobile_location_proof_required),
        trackingSessionId: refreshed?.mobile_tracking_session_id === trackingSessionId ? trackingSessionId : null,
        trackingStatus: refreshed?.mobile_tracking_status ?? "stopped",
        executionStatus: refreshed?.execution_status ?? "planned",
      }, true);

      if (!refreshed || decision !== "capture") {
        setLocationStatus(refreshed?.mobile_tracking_status ?? "stopped");
        setLocationHealthStatus(refreshed?.mobile_tracking_health_status ?? "stopped");
        setLocationMessage("Location Proof stopped because active work authorization changed.");
        return null;
      }

      return refreshed;
    } catch (error) {
      if (shouldBufferLocationFailure(error)) {
        const offlineDecision = getForegroundLocationDecision({
          locationProofRequired: work.mobile_location_proof_required,
          trackingSessionId,
          trackingStatus,
          executionStatus: work.execution_status,
        }, true);
        return offlineDecision === "capture" ? work : null;
      }

      setWorkRows([]);
      setWorkMessage("No assigned work found for this Work Code.");
      setLocationStatus("stopped");
      setLocationHealthStatus("stopped");
      setLocationMessage("Location Proof stopped because active work authorization changed.");
      return null;
    }
  }

  async function recordCurrentLocationPoint(
    trackingSessionId: string,
    showMessage = true,
    trackingStatusOverride: TrackingSessionStatus = locationStatus,
  ): Promise<boolean> {
    if (!currentWork || workActionInFlight.current || locationCaptureInFlight.current) {
      return false;
    }

    const localDecision = getForegroundLocationDecision({
      locationProofRequired: currentWork.mobile_location_proof_required,
      trackingSessionId,
      trackingStatus: trackingStatusOverride,
      executionStatus: currentWork.execution_status,
    }, true);

    if (localDecision !== "capture") {
      return false;
    }

    locationCaptureInFlight.current = true;
    let activeWork = currentWork;
    let bufferedPoint: BufferedLocationPoint | null = null;

    try {
      const authorizedWork = await refreshActiveLocationAuthorization(activeWork, trackingSessionId, trackingStatusOverride);
      if (!authorizedWork) {
        return false;
      }
      activeWork = authorizedWork;

      const permission = await Location.getForegroundPermissionsAsync();
      const permissionDecision = getForegroundLocationDecision({
        locationProofRequired: activeWork.mobile_location_proof_required,
        trackingSessionId,
        trackingStatus: activeWork.mobile_tracking_status,
        executionStatus: activeWork.execution_status,
      }, permission.granted);

      if (permissionDecision === "permission_missing") {
        await markLocationPermissionMissingOnDevice(activeWork);
        return false;
      }
      if (permissionDecision !== "capture") {
        return false;
      }

      let position: Location.LocationObject;
      try {
        position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      } catch (error) {
        const permissionAfterFailure = await Location.getForegroundPermissionsAsync().catch(() => null);
        if (permissionAfterFailure && !permissionAfterFailure.granted) {
          await markLocationPermissionMissingOnDevice(activeWork);
          return false;
        }
        throw error;
      }

      const capturedAt = new Date(position.timestamp).toISOString();
      const clientPointId = createClientPointId();
      const localQuality = getLocationQualityFromAccuracy(position.coords.accuracy);

      bufferedPoint = {
        local_id: clientPointId,
        client_point_id: clientPointId,
        tracking_session_id: trackingSessionId,
        ad_work_id: activeWork.ad_work_id,
        ad_work_day_id: activeWork.ad_work_day_id,
        assignment_id: activeWork.assignment_id,
        driver_id: activeWork.driver_id,
        vehicle_id: activeWork.vehicle_id,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: toFiniteLocationValue(position.coords.accuracy),
        speed: toFiniteLocationValue(position.coords.speed),
        heading: toFiniteLocationValue(position.coords.heading),
        captured_at: capturedAt,
        sync_status: "pending",
        retry_count: 0,
        last_sync_attempt_at: null
      };

      const result = await recordMobileLocationPoint({
        mobileNumber,
        workCode,
        trackingSessionId,
        latitude: bufferedPoint.latitude,
        longitude: bufferedPoint.longitude,
        accuracy: bufferedPoint.accuracy,
        speed: bufferedPoint.speed,
        heading: bufferedPoint.heading,
        capturedAt,
        clientPointId
      });
      setLocationPointCount(result?.point_count ?? locationPointCount + 1);
      setLastLocationUpdate(new Date().toISOString());
      setLastSavedLocationTime(capturedAt);
      setLastSyncTime(new Date().toISOString());
      setLocationHealthStatus(result?.tracking_health_status ?? "healthy");
      setLocationStatus("running");
      await syncBufferedLocationPointsForWork(activeWork, trackingSessionId, false);
      if (showMessage) {
        setLocationMessage("Location update saved (" + localQuality + ").");
      }
    } catch (error) {
      if (bufferedPoint && shouldBufferLocationFailure(error)) {
        await saveBufferedLocationPoint(bufferedPoint);
        await refreshBufferedLocationSummary(activeWork, trackingSessionId);
        setLastSavedLocationTime(bufferedPoint.captured_at);
        setLocationHealthStatus("offline_saving");
        if (showMessage) {
          setLocationMessage(driverLabels.locationSavedOffline + ".");
        }
        return true;
      }

      if (error instanceof DriverApiError && !error.retryable) {
        setLocationStatus("stopped");
        setLocationHealthStatus("stopped");
        setLocationMessage("Location Proof stopped because active work authorization changed.");
        return false;
      }

      if (showMessage) {
        setLocationMessage(error instanceof Error ? error.message : "Could not save location update.");
      }
      return true;
    } finally {
      locationCaptureInFlight.current = false;
    }

    return true;
  }

  async function handleStartLocationProof() {
    if (!currentWork) {
      return;
    }

    if (!locationUnderstanding || !locationAgreement) {
      setLocationMessage("Read and allow Location Proof first.");
      return;
    }

    if (!canStartLocationProof) {
      setLocationMessage("Start Work before Location Proof.");
      return;
    }

    try {
      setIsLocationBusy(true);
      setLocationMessage("");
      const rows = await refreshAssignedWork();
      const authorizedWork = rows.find((row) => row.ad_work_day_id === currentWork.ad_work_day_id) ?? null;

      if (!authorizedWork || !canStartMobileLocationProof({
        mobileLocationProofRequired: authorizedWork.mobile_location_proof_required,
        assignmentStatus: "ready_for_execution",
        releaseStatus: "released_to_driver",
        dayStatus: authorizedWork.execution_status,
        closureStatus: null,
      })) {
        setLocationStatus(authorizedWork?.mobile_tracking_status ?? "stopped");
        setLocationHealthStatus(authorizedWork?.mobile_tracking_health_status ?? "stopped");
        setLocationMessage("Location Proof stopped because active work authorization changed.");
        return;
      }

      const permission = await Location.requestForegroundPermissionsAsync();

      if (!permission.granted) {
        await markLocationPermissionMissingOnDevice(authorizedWork);
        return;
      }

      const result = await startMobileTracking({
        mobileNumber,
        workCode,
        dayId: authorizedWork.ad_work_day_id,
        driverConsent: true
      });
      setLocationSessionId(result.tracking_session_id);
      setLocationStatus(result.status);
      setLocationHealthStatus(result.tracking_health_status ?? "healthy");
      setLocationPointCount(result.point_count ?? 0);
      await recordCurrentLocationPoint(result.tracking_session_id, false, result.status);
      setLocationMessage(driverLabels.locationProofRunning + ".");
    } catch (error) {
      if (error instanceof DriverApiError && !error.retryable) {
        setWorkRows([]);
        setWorkMessage("No assigned work found for this Work Code.");
        setLocationStatus("stopped");
        setLocationHealthStatus("stopped");
      }
      setLocationMessage(error instanceof Error ? error.message : "Could not start Location Proof.");
    } finally {
      setIsLocationBusy(false);
    }
  }

  async function handleStopLocationProof(stopReason: TrackingStopReason = "other") {
    if (!locationSessionId) {
      return;
    }

    try {
      setIsLocationBusy(true);
      const result = await stopMobileTracking({ mobileNumber, workCode, trackingSessionId: locationSessionId, stopReason });
      setLocationStatus(result.status);
      setLocationHealthStatus(result.status === "paused" || pendingOfflineCount > 0 ? "sync_pending" : "stopped");
      setLocationMessage(result.result_message || driverLabels.locationProofStopped + ".");
    } catch (error) {
      setLocationMessage(error instanceof Error ? error.message : "Could not stop Location Proof.");
    } finally {
      setIsLocationBusy(false);
    }
  }
  async function handleWorkAction(action: DriverExecutionAction) {
    if (!currentWork) {
      return;
    }

    const note = action === "end"
      ? completionNote
      : action === "issue"
        ? issueNote
        : action === "add_proof_note"
          ? proofNote
          : "";
    const validationErrors = validateDriverExecutionAction(currentStatus, action, note);

    if (validationErrors.length > 0) {
      setWorkMessage(validationErrors.join(" "));
      return;
    }

    if (workActionInFlight.current) {
      return;
    }

    try {
      workActionInFlight.current = true;
      setIsWorkLoading(true);
      await saveWorkAction({
        mobileNumber,
        workCode,
        dayId: currentWork.ad_work_day_id,
        action,
        note,
        areaPlaceName: action === "add_proof_note" ? proofArea : undefined,
        proofType: action === "add_proof_note" ? proofType : undefined
      });
      const statusAfterAction = getLocationStatusAfterWorkAction(action, locationStatus);
      if (locationSessionId && statusAfterAction !== locationStatus) {
        setLocationStatus(statusAfterAction);
        setLocationHealthStatus(pendingOfflineCount > 0 ? "sync_pending" : "stopped");
        setLocationMessage(statusAfterAction === "paused"
          ? "Location Proof paused during break."
          : driverLabels.locationProofStopped + ".");
      }
      if ((action === "start" || action === "resume") && currentWork.mobile_location_proof_required) {
        setLocationMessage("Allow Location Proof, then choose Start Location Proof.");
      }
      await refreshAssignedWork();
      setWorkMessage(action === "end" ? driverLabels.workCompleted : "Work update saved.");
      if (action === "end") {
        setCompletionNote("");
      }
      if (action === "issue") {
        setIssueNote("");
      }
      if (action === "add_proof_note") {
        setProofNote("");
        setProofArea("");
      }
    } catch (error) {
      if (shouldReconcileWorkMutationFailure(error)) {
        try {
          await reconcileAssignedWorkAfterMutationFailure(currentWork.ad_work_day_id);
        } catch {
          // Preserve the original mutation error when the reconciliation read is also unavailable.
        }
      }
      setWorkMessage(error instanceof Error ? error.message : "Could not save work update.");
    } finally {
      workActionInFlight.current = false;
      setIsWorkLoading(false);
    }
  }

  async function handleChooseProofPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setWorkMessage("Photo access is needed to choose proof.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      allowsMultipleSelection: false,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.75
    });

    if (!result.canceled) {
      setProofPhoto(result.assets[0] ?? null);
      setWorkMessage("");
    }
  }

  async function handleSubmitPhotoProof() {
    if (!currentWork || !proofPhoto) {
      setWorkMessage("Choose a photo first.");
      return;
    }

    const photoResponse = await fetch(proofPhoto.uri);
    if (!photoResponse.ok) {
      setWorkMessage("Could not read selected photo.");
      return;
    }

    const photoBlob = await photoResponse.blob();
    const mimeType = proofPhoto.mimeType || photoBlob.type || guessProofPhotoMimeType(proofPhoto.uri);
    const fileSize = proofPhoto.fileSize ?? photoBlob.size;
    const validationErrors = validatePhotoProofInput(currentStatus, {
      note: proofNote,
      areaPlaceName: proofArea,
      mimeType,
      fileSize
    });

    if (validationErrors.length > 0) {
      setWorkMessage(validationErrors.join(" "));
      return;
    }

    try {
      setIsProofSubmitting(true);
      const slot = await requestProofUploadSlot({
        mobileNumber,
        workCode,
        dayId: currentWork.ad_work_day_id,
        proofType,
        areaPlaceName: proofArea,
        note: proofNote,
        mimeType,
        fileSize
      });
      await uploadProofPhoto({ slot, photoUri: proofPhoto.uri, mimeType });
      await completeProofUpload({ mobileNumber, workCode, proofUploadId: slot.proof_upload_id });
      setProofPhoto(null);
      setProofNote("");
      setProofArea("");
      setWorkMessage(driverLabels.proofSent + ".");
      await refreshAssignedWork();
    } catch (error) {
      setWorkMessage(error instanceof Error ? error.message : "Could not send proof.");
    } finally {
      setIsProofSubmitting(false);
    }
  }

  async function handleSubmit() {
    setStatusMessage("");

    const validationErrors = validateDriverApplication(form);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    if (!configured) {
      setErrors([]);
      setStatusMessage("Driver registration is not configured in this environment.");
      return;
    }

    try {
      setErrors([]);
      setIsSubmitting(true);
      await submitDriverApplication(form);
      setForm(initialDriverApplication);
      setStatusMessage(driverLabels.applicationSent + ". " + driverLabels.waitingForApproval + ".");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Could not submit details right now.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCallAdmin() {
    const adminPhone = process.env.EXPO_PUBLIC_ADMIN_PHONE?.trim() ?? "";
    if (!adminPhone || adminPhone.includes("replace-with")) {
      const message = "Admin phone number is not configured. Ask the Kootha team for help.";
      if (screen === "work") setWorkMessage(message);
      else setStatusMessage(message);
      return;
    }

    try {
      await Linking.openURL(`tel:${adminPhone}`);
    } catch {
      const message = "Could not open the phone app. Please call the Kootha admin directly.";
      if (screen === "work") setWorkMessage(message);
      else setStatusMessage(message);
    }
  }

  function handleChangeWorkCode() {
    setWorkRows([]);
    setWorkPanel("work");
    setWorkMessage("");
  }
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.shell} keyboardShouldPersistTaps="handled">
        <KoothaBrand name={productName} />

        <Pressable style={styles.languageButton} onPress={() => setLocale((current) => current === "en" ? "te" : "en")} accessibilityRole="button">
          <MaterialCommunityIcons name="translate" size={20} color="#b83f12" />
          <Text style={styles.languageButtonText}>{locale === "en" ? "తెలుగు" : "English"}</Text>
        </Pressable>

        <View style={styles.modeSwitch} accessibilityRole="tablist">
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: screen === "work" }}
            style={[styles.modeButton, screen === "work" && styles.modeButtonActive]}
            onPress={() => setScreen("work")}
          >
            <MaterialCommunityIcons name="briefcase-outline" size={22} color={screen === "work" ? "#fffaf1" : "#65594f"} />
            <Text style={[styles.modeButtonText, screen === "work" && styles.modeButtonTextActive]}>{locale === "te" ? "పని తెరవండి" : "Open Work"}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: screen === "register" }}
            style={[styles.modeButton, screen === "register" && styles.modeButtonActive]}
            onPress={() => setScreen("register")}
          >
            <MaterialCommunityIcons name="account-plus-outline" size={22} color={screen === "register" ? "#fffaf1" : "#65594f"} />
            <Text style={[styles.modeButtonText, screen === "register" && styles.modeButtonTextActive]}>{locale === "te" ? "నమోదు" : "Register"}</Text>
          </Pressable>
        </View>

        {screen === "work" ? (
          <>
            {!currentWork ? (
              <>
                <View style={styles.introBlock}>
                  <View style={styles.introIcon}><MaterialCommunityIcons name="briefcase-search-outline" size={32} color="#fffaf1" /></View>
                  <View style={styles.introCopy}>
                    <Text style={styles.title}>{locale === "te" ? "ఈరోజు పని తెరవండి" : "Open today's work"}</Text>
                    <Text style={styles.body}>Enter your mobile number and Work Code given by the Kootha admin.</Text>
                  </View>
                </View>

                {!configured ? <Text style={styles.notice}>Driver work access is not configured in this environment.</Text> : null}

                <View style={styles.accessForm}>
                  <Text style={styles.label}>Mobile number</Text>
                  <TextInput
                    style={styles.input}
                    value={mobileNumber}
                    maxLength={20}
                    keyboardType="phone-pad"
                    autoComplete="tel"
                    onChangeText={setMobileNumber}
                    placeholder="Enter mobile number"
                  />

                  <Text style={styles.label}>{driverLabels.workCode}</Text>
                  <TextInput
                    style={styles.input}
                    value={workCode}
                    maxLength={20}
                    autoCapitalize="characters"
                    onChangeText={setWorkCode}
                    placeholder="Enter Work Code"
                  />

                  <PrimaryButton
                    label={isWorkLoading ? (locale === "te" ? "తెరుస్తోంది..." : "Opening...") : (locale === "te" ? "కేటాయించిన పని తెరవండి" : "Open Assigned Work")}
                    icon="briefcase-search-outline"
                    disabled={isWorkLoading}
                    onPress={handleOpenWork}
                  />
                  {workMessage ? <Text style={styles.notice}>{workMessage}</Text> : null}
                </View>

                <Pressable style={styles.helpLink} onPress={() => void handleCallAdmin()}>
                  <MaterialCommunityIcons name="phone-outline" size={21} color="#b83f12" />
                  <Text style={styles.helpLinkText}>Need help? Call Kootha admin</Text>
                </Pressable>
              </>
            ) : (
              <View style={styles.workSurface}>
                <View style={styles.workHeader}>
                  <View style={styles.workHeaderCopy}>
                    <Text style={styles.kicker}>TODAY&apos;S ASSIGNED WORK</Text>
                    <Text style={styles.title}>{currentWork.business_name || "Advertisement work"}</Text>
                    <Text style={styles.body}>{currentWork.city || "Town not set"}</Text>
                  </View>
                  <Text style={styles.statusText}>{adWorkExecutionDayStatusLabels[currentStatus]}</Text>
                </View>

                <Pressable style={styles.changeCodeButton} onPress={handleChangeWorkCode}>
                  <MaterialCommunityIcons name="arrow-left" size={19} color="#65594f" />
                  <Text style={styles.changeCodeText}>Use a different Work Code</Text>
                </Pressable>

                <View style={styles.workSummary}>
                  <View style={styles.summaryItem}>
                    <MaterialCommunityIcons name="calendar-outline" size={22} color="#b83f12" />
                    <View><Text style={styles.summaryLabel}>Date and time</Text><Text style={styles.summaryValue}>{formatDate(currentWork.planned_date)} {currentWork.planned_start_time || ""} {currentWork.planned_end_time || ""}</Text></View>
                  </View>
                  <View style={styles.summaryItem}>
                    <MaterialCommunityIcons name="map-marker-outline" size={22} color="#b83f12" />
                    <View><Text style={styles.summaryLabel}>Areas to cover</Text><Text style={styles.summaryValue}>{currentWork.areas_to_cover || "Ask admin"}</Text></View>
                  </View>
                  <View style={styles.summaryItem}>
                    <MaterialCommunityIcons name="truck-outline" size={22} color="#b83f12" />
                    <View><Text style={styles.summaryLabel}>Vehicle</Text><Text style={styles.summaryValue}>{currentWork.vehicle_number || "Ask admin"}</Text></View>
                  </View>
                </View>

                <View style={styles.messageBlock}>
                  <Text style={styles.label}>Advertisement message</Text>
                  <Text style={styles.messageText}>{currentWork.advertisement_details || "No message provided."}</Text>
                  {currentWork.special_instructions ? <Text style={styles.instructionText}>{currentWork.special_instructions}</Text> : null}
                </View>

                <View style={styles.workTabs} accessibilityRole="tablist">
                  {([
                    { id: "work", label: "Work", icon: "play-circle-outline" },
                    { id: "proof", label: "Proof", icon: "camera-outline" },
                    { id: "help", label: "Help", icon: "lifebuoy" }
                  ] as { id: WorkPanel; label: string; icon: DriverIconName }[]).map((item) => (
                    <Pressable
                      key={item.id}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: workPanel === item.id }}
                      style={[styles.workTab, workPanel === item.id && styles.workTabActive]}
                      onPress={() => setWorkPanel(item.id)}
                    >
                      <MaterialCommunityIcons name={item.icon} size={22} color={workPanel === item.id ? "#fffaf1" : "#65594f"} />
                      <Text style={[styles.workTabText, workPanel === item.id && styles.workTabTextActive]}>{item.label}</Text>
                    </Pressable>
                  ))}
                </View>

                {workPanel === "work" ? (
                  <View style={styles.panelBody}>
                    <Text style={styles.panelTitle}>Next work action</Text>
                    {canStartWork(currentStatus) ? (
                      <PrimaryButton label={locale === "te" ? "పని ప్రారంభించండి" : driverLabels.startWork} icon="play-circle-outline" disabled={isWorkLoading} onPress={() => void handleWorkAction("start")} />
                    ) : null}
                    {canResumeWork(currentStatus) ? (
                      <PrimaryButton label={locale === "te" ? "పని కొనసాగించండి" : driverLabels.resumeWork} icon="play-circle-outline" disabled={isWorkLoading} onPress={() => void handleWorkAction("resume")} />
                    ) : null}
                    {canTakeBreak(currentStatus) ? (
                      <SecondaryButton label={locale === "te" ? "విరామం తీసుకోండి" : driverLabels.takeBreak} icon="pause-circle-outline" disabled={isWorkLoading} onPress={() => void handleWorkAction("take_break")} />
                    ) : null}
                    {currentStatus === "completed" ? (
                      <View style={styles.completeBox}>
                        <MaterialCommunityIcons name="check-circle" size={34} color="#247243" />
                        <Text style={styles.completeTitle}>Work completed</Text>
                        <Text style={styles.body}>The Kootha admin can now review your updates and proof.</Text>
                      </View>
                    ) : null}

                    {mobileLocationProofRequired ? (
                      <View style={styles.locationProofBox}>
                        <View style={styles.sectionHeadingIcon}>
                          <MaterialCommunityIcons name="crosshairs-gps" size={26} color="#b83f12" />
                          <Text style={styles.sectionTitle}>{driverLabels.allowLocationProof}</Text>
                        </View>
                        <Text style={styles.body}>{mobileLocationProofConsentText}</Text>
                        {currentWork.mobile_location_proof_note ? <Text style={styles.notice}>{currentWork.mobile_location_proof_note}</Text> : null}
                        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: locationUnderstanding }} style={styles.consentRow} onPress={() => setLocationUnderstanding((current) => !current)}>
                          <View style={[styles.checkbox, locationUnderstanding && styles.checkboxChecked]} />
                          <Text style={styles.consentText}>{locale === "te" ? "ఈ కేటాయించిన పని సమయంలో మాత్రమే లొకేషన్ ఆధారం ఉపయోగిస్తారని నాకు తెలుసు." : "I understand Location Proof is used only during this assigned work."}</Text>
                        </Pressable>
                        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: locationAgreement }} style={styles.consentRow} onPress={() => setLocationAgreement((current) => !current)}>
                          <View style={[styles.checkbox, locationAgreement && styles.checkboxChecked]} />
                          <Text style={styles.consentText}>{locale === "te" ? "ఈ పని కోసం లొకేషన్ ఆధారాన్ని అనుమతిస్తున్నాను." : "I allow Location Proof for this work."}</Text>
                        </Pressable>
                        <View style={styles.locationStatusRow}>
                          <Text style={styles.locationStatusText}>{getTrackingSessionStatusLabel(locationStatus)}</Text>
                          <Text style={styles.locationStatusText}>{pendingOfflineCount > 0 ? `${pendingOfflineCount} waiting to sync` : "Synced"}</Text>
                        </View>
                        <PrimaryButton label={driverLabels.startLocationProof} icon="crosshairs-gps" disabled={!canStartLocationProof || isLocationBusy} onPress={() => void handleStartLocationProof()} />
                        {locationSessionId && locationStatus === "running" && currentStatus === "running" ? <SecondaryButton label={locale === "te" ? "ఇప్పుడే లొకేషన్ సేవ్ చేయండి" : "Save Location Now"} icon="map-marker-plus-outline" disabled={isLocationBusy || isLocationSyncing} onPress={() => void handleSaveLocationNow()} /> : null}
                        {pendingOfflineCount > 0 ? <SecondaryButton label={isLocationSyncing ? driverLabels.syncingLocationProof : (locale === "te" ? "ఇప్పుడే సింక్ చేయండి" : "Sync Now")} icon="sync" disabled={!locationSessionId || isLocationSyncing} onPress={() => void handleSyncNow()} /> : null}
                        {locationSessionId && locationStatus !== "stopped" ? <SecondaryButton label={driverLabels.stopLocationProof} icon="stop-circle-outline" disabled={isLocationBusy} onPress={() => void handleStopLocationProof("other")} /> : null}
                        {locationMessage ? <Text style={styles.notice}>{locationMessage}</Text> : null}
                      </View>
                    ) : null}

                    {canEndWork(currentStatus) ? (
                      <View style={styles.finishBlock}>
                        <Text style={styles.label}>Completion note</Text>
                        <TextInput style={[styles.input, styles.textArea]} value={completionNote} maxLength={600} multiline onChangeText={setCompletionNote} placeholder="What was completed?" />
                        <PrimaryButton label={locale === "te" ? "పని ముగించండి" : driverLabels.endWork} icon="check-circle-outline" disabled={isWorkLoading} onPress={() => void handleWorkAction("end")} />
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {workPanel === "proof" ? (
                  <View style={styles.panelBody}>
                    <Text style={styles.panelTitle}>Add work proof</Text>
                    <Text style={styles.body}>Add a short note or one clear photo while work is running or on break.</Text>
                    <Text style={styles.label}>Proof type</Text>
                    <View style={styles.optionGrid}>
                      {executionProofNoteTypeOptions.map((option) => (
                        <OptionButton key={option} value={option} label={executionProofNoteTypeLabels[option]} selected={proofType === option} onSelect={(value: ExecutionProofNoteType) => setProofType(value)} />
                      ))}
                    </View>
                    <Text style={styles.label}>{driverLabels.areaOrPlaceName}</Text>
                    <TextInput style={styles.input} value={proofArea} maxLength={120} onChangeText={setProofArea} placeholder="Area or place" />
                    <Text style={styles.label}>{driverLabels.addProofNote}</Text>
                    <TextInput style={[styles.input, styles.textArea]} value={proofNote} maxLength={600} multiline onChangeText={setProofNote} placeholder="Write a simple proof note" />
                    <SecondaryButton label={driverLabels.addProofNote} icon="text-box-plus-outline" disabled={isWorkLoading} onPress={() => void handleWorkAction("add_proof_note")} />

                    <View style={styles.proofUploadBox}>
                      <View style={styles.sectionHeadingIcon}>
                        <MaterialCommunityIcons name="camera-outline" size={27} color="#b83f12" />
                        <Text style={styles.sectionTitle}>{driverLabels.uploadPhotoProof}</Text>
                      </View>
                      <SecondaryButton label={proofPhoto ? "Change Photo" : "Choose Photo"} icon="camera-outline" disabled={isProofSubmitting} onPress={() => void handleChooseProofPhoto()} />
                      {proofPhoto ? <View style={styles.photoPreviewBox}><Image source={{ uri: proofPhoto.uri }} style={styles.photoPreview} /><Text style={styles.body}>{proofPhoto.fileName || "Selected photo"}</Text></View> : null}
                      <PrimaryButton label={isProofSubmitting ? "Sending..." : driverLabels.submitProof} icon="cloud-upload-outline" disabled={!canUploadPhotoProof(currentStatus) || isProofSubmitting || !proofPhoto} onPress={() => void handleSubmitPhotoProof()} />
                    </View>
                    {workMessage ? <Text style={styles.notice}>{workMessage}</Text> : null}
                  </View>
                ) : null}

                {workPanel === "help" ? (
                  <View style={styles.panelBody}>
                    <Text style={styles.panelTitle}>Help with this work</Text>
                    <Text style={styles.label}>{driverLabels.issueReported}</Text>
                    <TextInput style={[styles.input, styles.textArea]} value={issueNote} maxLength={600} multiline onChangeText={setIssueNote} placeholder="Describe the problem in simple words" />
                    <SecondaryButton label="Send issue to admin" icon="alert-circle-outline" disabled={isWorkLoading} onPress={() => void handleWorkAction("issue")} />
                    <PrimaryButton label={driverLabels.callAdmin} icon="phone" onPress={() => void handleCallAdmin()} />
                    {workMessage ? <Text style={styles.notice}>{workMessage}</Text> : null}
                  </View>
                ) : null}
              </View>
            )}
          </>
        ) : (
          <>
            <View style={styles.introBlock}>
              <View style={styles.introIcon}><MaterialCommunityIcons name="account-plus-outline" size={32} color="#fffaf1" /></View>
              <View style={styles.introCopy}>
                <Text style={styles.title}>{driverLabels.registerAsDriver}</Text>
                <Text style={styles.body}>Share your details once. The Kootha team will call you after review.</Text>
              </View>
            </View>

            <View style={styles.hiddenField}>
              <TextInput value={form.companyWebsite} onChangeText={(value) => updateField("companyWebsite", value)} importantForAutofill="no" />
            </View>

            <View style={styles.registrationForm}>
              <Text style={styles.formSectionTitle}>Your details</Text>
              <Text style={styles.label}>Driver full name</Text>
              <TextInput style={styles.input} value={form.driverName} maxLength={100} onChangeText={(value) => updateField("driverName", value)} placeholder="Enter driver name" />
              <Text style={styles.label}>Mobile number</Text>
              <TextInput style={styles.input} value={form.mobileNumber} maxLength={20} keyboardType="phone-pad" onChangeText={(value) => updateField("mobileNumber", value)} placeholder="Enter mobile number" />
              <Text style={styles.label}>City or town</Text>
              <TextInput style={styles.input} value={form.cityTown} maxLength={80} onChangeText={(value) => updateField("cityTown", value)} placeholder="Enter city or town" />
              <Text style={styles.label}>Areas you can work in</Text>
              <TextInput style={[styles.input, styles.textArea]} value={form.serviceAreas} maxLength={600} multiline onChangeText={(value) => updateField("serviceAreas", value)} placeholder="Towns, villages, or areas" />

              <View style={styles.formDivider} />
              <Text style={styles.formSectionTitle}>Vehicle details</Text>
              <Text style={styles.label}>Vehicle ownership</Text>
              <View style={styles.optionGrid}>
                {vehicleOwnershipOptions.map((option) => <OptionButton key={option} value={option} label={vehicleOwnershipLabels[option]} selected={form.vehicleOwnership === option} onSelect={(value: VehicleOwnership) => updateField("vehicleOwnership", value)} />)}
              </View>
              <Text style={styles.label}>Vehicle type</Text>
              <View style={styles.optionGrid}>
                {vehicleTypeOptions.map((option) => <OptionButton key={option} value={option} label={vehicleTypeLabels[option]} selected={form.vehicleType === option} onSelect={(value: VehicleType) => updateField("vehicleType", value)} />)}
              </View>
              <Text style={styles.label}>Vehicle number</Text>
              <TextInput style={styles.input} value={form.vehicleNumber} maxLength={40} autoCapitalize="characters" onChangeText={(value) => updateField("vehicleNumber", value)} placeholder="Vehicle number" />
              <View style={styles.switchRow}><Text style={styles.labelInline}>Speaker system available</Text><Switch value={form.micSystemAvailable} onValueChange={(value) => updateField("micSystemAvailable", value)} /></View>

              <Text style={styles.label}>Vehicle GPS device</Text>
              <View style={styles.optionGrid}>
                {yesNoNotSureOptions.map((option) => <OptionButton key={option} value={option} label={yesNoNotSureLabels[option]} selected={form.gpsDeviceAvailable === option} onSelect={(value: YesNoNotSure) => updateField("gpsDeviceAvailable", value)} />)}
              </View>
              <Text style={styles.label}>Preferred working cities or towns</Text>
              <TextInput style={styles.input} value={form.preferredWorkingCities} maxLength={400} onChangeText={(value) => updateField("preferredWorkingCities", value)} placeholder="Cities or towns" />
              <Text style={styles.label}>Additional note</Text>
              <TextInput style={[styles.input, styles.textArea]} value={form.notes} maxLength={800} multiline onChangeText={(value) => updateField("notes", value)} placeholder="Any useful details for admin" />

              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: form.consentToContact }} style={styles.consentRow} onPress={() => updateField("consentToContact", !form.consentToContact)}>
                <View style={[styles.checkbox, form.consentToContact && styles.checkboxChecked]} />
                <Text style={styles.consentText}>I agree that the Kootha team may contact me about driver work.</Text>
              </Pressable>

              {errors.length > 0 ? <View style={styles.errorBox}>{errors.map((error) => <Text style={styles.errorText} key={error}>{error}</Text>)}</View> : null}
              {statusMessage ? <Text style={styles.notice}>{statusMessage}</Text> : null}

              <PrimaryButton label={isSubmitting ? "Sending..." : driverLabels.submitDetails} icon="account-check-outline" disabled={isSubmitting} onPress={handleSubmit} />
              <SecondaryButton label={driverLabels.callAdmin} icon="phone-outline" onPress={() => void handleCallAdmin()} />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#fff8ec"
  },
  shell: {
    padding: 22,
    gap: 16
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  brandLogo: {
    width: 56,
    height: 56,
    borderRadius: 8
  },
  logoMark: {
    width: 54,
    height: 54,
    borderRadius: 8,
    backgroundColor: "#d94f18",
    alignItems: "center",
    justifyContent: "center"
  },
  logoLetter: {
    color: "#fff8ec",
    fontSize: 28,
    fontWeight: "900"
  },
  brand: {
    color: "#24201c",
    fontSize: 26,
    fontWeight: "900"
  },
  brandTagline: {
    color: "#65594f",
    fontSize: 14,
    fontWeight: "800"
  },
  heroCard: {
    borderWidth: 2,
    borderColor: "#d8c3a9",
    borderRadius: 8,
    backgroundColor: "#fffdf8",
    padding: 16,
    gap: 8
  },
  title: {
    color: "#27231f",
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 38
  },
  sectionTitle: {
    color: "#27231f",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 0
  },
  body: {
    color: "#504840",
    fontSize: 17,
    lineHeight: 26
  },
  notice: {
    borderLeftWidth: 4,
    borderLeftColor: "#39834b",
    backgroundColor: "#f3fbf3",
    color: "#27231f",
    fontSize: 15,
    lineHeight: 22,
    padding: 12
  },
  form: {
    gap: 12
  },
  workCard: {
    borderColor: "#eadfce",
    borderRadius: 8,
    backgroundColor: "#fffdf8",
    borderWidth: 2,
    padding: 14,
    gap: 12
  },
  label: {
    color: "#332e29",
    fontSize: 15,
    fontWeight: "900"
  },
  labelInline: {
    flex: 1,
    color: "#332e29",
    fontSize: 15,
    fontWeight: "900"
  },
  statusText: {
    alignSelf: "flex-start",
    borderRadius: 8,
    backgroundColor: "#fff4e9",
    color: "#c84f20",
    fontSize: 15,
    fontWeight: "900",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#cfc1ad",
    borderRadius: 8,
    backgroundColor: "#fffdf8",
    color: "#27231f",
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16
  },
  textArea: {
    minHeight: 96,
    textAlignVertical: "top"
  },
  optionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  optionButton: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#cfc1ad",
    borderRadius: 8,
    backgroundColor: "#fffdf8",
    justifyContent: "center",
    paddingHorizontal: 14
  },
  optionButtonSelected: {
    borderColor: "#c84f20",
    backgroundColor: "#fff4e9"
  },
  optionText: {
    color: "#332e29",
    fontSize: 15,
    fontWeight: "800"
  },
  optionTextSelected: {
    color: "#c84f20"
  },
  switchRow: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: "#eadfce",
    borderRadius: 8,
    backgroundColor: "#fffdf8",
    paddingHorizontal: 14,
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  proofUploadBox: {
    borderWidth: 1,
    borderColor: "#eadfce",
    borderRadius: 8,
    backgroundColor: "#fffaf1",
    padding: 12,
    gap: 10
  },
  locationProofBox: {
    borderWidth: 1,
    borderColor: "#cfc1ad",
    borderRadius: 8,
    backgroundColor: "#f6fbff",
    padding: 12,
    gap: 10
  },
  photoPreviewBox: {
    gap: 8
  },
  photoPreview: {
    width: "100%",
    height: 220,
    borderRadius: 8,
    backgroundColor: "#eadfce"
  },
  consentRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    paddingVertical: 8
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: "#c84f20",
    borderRadius: 4,
    marginTop: 2
  },
  checkboxChecked: {
    backgroundColor: "#c84f20"
  },
  consentText: {
    flex: 1,
    color: "#332e29",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700"
  },
  errorBox: {
    borderLeftWidth: 4,
    borderLeftColor: "#c93f2d",
    backgroundColor: "#fff1ed",
    padding: 12,
    gap: 4
  },
  errorText: {
    color: "#27231f",
    fontSize: 15
  },
  button: {
    minHeight: 68,
    borderRadius: 8,
    backgroundColor: "#d94f18",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18
  },
  secondaryButton: {
    minHeight: 58,
    borderWidth: 2,
    borderColor: "#d94f18",
    borderRadius: 8,
    backgroundColor: "#fffdf8",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14
  },
  buttonDisabled: {
    opacity: 0.65
  },
  buttonPressed: {
    opacity: 0.82
  },
  buttonText: {
    color: "#fffaf1",
    fontSize: 20,
    fontWeight: "900"
  },
  secondaryButtonText: {
    color: "#d94f18",
    fontSize: 17,
    fontWeight: "900"
  },
  divider: {
    height: 1,
    backgroundColor: "#eadfce",
    marginVertical: 12
  },
  modeSwitch: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#d8c3a9",
    borderRadius: 8,
    backgroundColor: "#fffdf8",
    padding: 4,
    gap: 4
  },
  modeButton: {
    minHeight: 54,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 6
  },
  modeButtonActive: {
    backgroundColor: "#24201c"
  },
  modeButtonText: {
    color: "#65594f",
    fontSize: 16,
    fontWeight: "900"
  },
  modeButtonTextActive: {
    color: "#fffaf1"
  },
  introBlock: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    paddingVertical: 12
  },
  introIcon: {
    width: 58,
    height: 58,
    flexShrink: 0,
    borderRadius: 8,
    backgroundColor: "#d94f18",
    alignItems: "center",
    justifyContent: "center"
  },
  introCopy: {
    flex: 1,
    gap: 5
  },
  accessForm: {
    gap: 13,
    borderWidth: 1,
    borderColor: "#d8c3a9",
    borderRadius: 8,
    backgroundColor: "#fffdf8",
    padding: 18
  },
  helpLink: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9
  },
  helpLinkText: {
    color: "#b83f12",
    fontSize: 16,
    fontWeight: "900"
  },
  workSurface: {
    gap: 16
  },
  workHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 8
  },
  workHeaderCopy: {
    flex: 1,
    gap: 4
  },
  kicker: {
    color: "#b83f12",
    fontSize: 12,
    fontWeight: "900"
  },
  changeCodeButton: {
    minHeight: 44,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7
  },
  changeCodeText: {
    color: "#65594f",
    fontSize: 14,
    fontWeight: "800"
  },
  workSummary: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#d8c3a9"
  },
  summaryItem: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eadfce",
    paddingVertical: 13
  },
  summaryLabel: {
    color: "#65594f",
    fontSize: 13,
    fontWeight: "800"
  },
  summaryValue: {
    color: "#24201c",
    fontSize: 16,
    lineHeight: 23,
    fontWeight: "800"
  },
  messageBlock: {
    borderLeftWidth: 5,
    borderLeftColor: "#d94f18",
    backgroundColor: "#fff0dc",
    padding: 15,
    gap: 7
  },
  messageText: {
    color: "#24201c",
    fontSize: 18,
    lineHeight: 27,
    fontWeight: "800"
  },
  instructionText: {
    color: "#65594f",
    fontSize: 15,
    lineHeight: 22
  },
  workTabs: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#d8c3a9",
    borderRadius: 8,
    backgroundColor: "#fffdf8",
    padding: 4,
    gap: 4
  },
  workTab: {
    minHeight: 58,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderRadius: 6
  },
  workTabActive: {
    backgroundColor: "#d94f18"
  },
  workTabText: {
    color: "#65594f",
    fontSize: 13,
    fontWeight: "900"
  },
  workTabTextActive: {
    color: "#fffaf1"
  },
  panelBody: {
    gap: 14,
    borderWidth: 1,
    borderColor: "#d8c3a9",
    borderRadius: 8,
    backgroundColor: "#fffdf8",
    padding: 16
  },
  panelTitle: {
    color: "#24201c",
    fontSize: 23,
    fontWeight: "900"
  },
  completeBox: {
    alignItems: "center",
    gap: 8,
    backgroundColor: "#edf8ef",
    padding: 18
  },
  completeTitle: {
    color: "#247243",
    fontSize: 21,
    fontWeight: "900"
  },
  sectionHeadingIcon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9
  },
  locationStatusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  locationStatusText: {
    borderRadius: 6,
    backgroundColor: "#fff0dc",
    color: "#8e330f",
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    fontWeight: "900"
  },
  finishBlock: {
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#d8c3a9",
    paddingTop: 16
  },
  registrationForm: {
    gap: 13,
    borderWidth: 1,
    borderColor: "#d8c3a9",
    borderRadius: 8,
    backgroundColor: "#fffdf8",
    padding: 18
  },
  formSectionTitle: {
    color: "#24201c",
    fontSize: 22,
    fontWeight: "900"
  },
  formDivider: {
    height: 1,
    backgroundColor: "#d8c3a9",
    marginVertical: 8
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9
  },  languageButton: {
    alignSelf: "flex-end",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: 42,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#d8c3a9",
    borderRadius: 8,
    backgroundColor: "#fffdf8"
  },
  languageButtonText: {
    color: "#b83f12",
    fontSize: 16,
    fontWeight: "800"
  },
  hiddenField: {
    position: "absolute",
    left: -10000,
    width: 1,
    height: 1,
    overflow: "hidden"
  }
});
