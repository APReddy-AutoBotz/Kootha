import { useEffect, useMemo, useState } from "react";
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
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";

const productName = resolveProductName({
  productName: process.env.EXPO_PUBLIC_PRODUCT_NAME
});
const driverLabels = businessLabels.driver;
const publicKeyHeader = ["api", "key"].join("");
const locationBufferStorageKey = "kootha-driver-location-buffer-v1";
const maxLocationSyncRetries = 5;

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

type BufferedLocationPoint = {
  local_id: string;
  client_point_id: string;
  tracking_session_id: string;
  ad_work_id: string;
  ad_work_day_id: string;
  assignment_id: string;
  driver_id: string;
  vehicle_id: string | null;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  captured_at: string;
  sync_status: "pending" | "sync_failed";
  retry_count: number;
  last_sync_attempt_at: string | null;
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

async function submitDriverApplication(input: DriverApplicationInput) {
  const config = getDriverSupabaseConfig();

  if (!config) {
    throw new Error("Driver registration is not configured in this environment.");
  }

  const response = await fetch(config.url + "/rest/v1/driver_applications", {
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

  const response = await fetch(config.url + "/rest/v1/rpc/driver_get_assigned_work", {
    method: "POST",
    headers: createPublicHeaders(config, true),
    body: JSON.stringify({
      p_mobile: mobileNumber.trim(),
      p_work_code: workCode.trim()
    })
  });

  if (!response.ok) {
    throw new Error("Could not open assigned work. Check mobile number and Work Code.");
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

  const response = await fetch(config.url + "/rest/v1/rpc/driver_update_work_day", {
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
    throw new Error("Could not save work update.");
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

  const response = await fetch(config.url + "/rest/v1/rpc/driver_start_mobile_tracking", {
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
    throw new Error("Could not start Location Proof.");
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

  const response = await fetch(config.url + "/rest/v1/rpc/driver_mark_mobile_location_permission_missing", {
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

  const response = await fetch(config.url + "/rest/v1/rpc/driver_record_mobile_location_point", {
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
    throw new Error("Could not save location update.");
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

  const response = await fetch(config.url + "/rest/v1/rpc/driver_sync_mobile_location_points", {
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
    throw new Error("Could not sync Location Proof.");
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

  const response = await fetch(config.url + "/rest/v1/rpc/driver_stop_mobile_tracking", {
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

  const response = await fetch(config.url + "/rest/v1/rpc/request_driver_proof_upload", {
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
  const response = await fetch(config.url + "/storage/v1/object/" + input.slot.file_bucket + "/" + encodeStoragePath(input.slot.file_path), {
    method: "POST",
    headers: {
      ...createPublicHeaders(config),
      "Content-Type": input.mimeType,
      "x-upsert": "false"
    },
    body: photoBlob
  });

  if (!response.ok) {
    throw new Error("Could not upload photo proof.");
  }
}

async function completeProofUpload(input: { mobileNumber: string; workCode: string; proofUploadId: string }) {
  const config = getDriverSupabaseConfig();

  if (!config) {
    throw new Error("Driver work access is not configured in this environment.");
  }

  const response = await fetch(config.url + "/rest/v1/rpc/complete_driver_proof_upload", {
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
  disabled,
  onPress
}: {
  label: string;
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
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress?: () => void }) {
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
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function formatDate(value: string | null | undefined) {
  return value || "Not set";
}

function createClientPointId() {
  return "phone-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseBufferedLocationPoints(value: string | null): BufferedLocationPoint[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((point): point is BufferedLocationPoint => {
      if (!point || typeof point !== "object") {
        return false;
      }

      const candidate = point as Partial<BufferedLocationPoint>;
      return typeof candidate.local_id === "string"
        && typeof candidate.client_point_id === "string"
        && typeof candidate.tracking_session_id === "string"
        && typeof candidate.ad_work_id === "string"
        && typeof candidate.ad_work_day_id === "string"
        && typeof candidate.assignment_id === "string"
        && typeof candidate.driver_id === "string"
        && (candidate.vehicle_id === null || typeof candidate.vehicle_id === "string")
        && isFiniteNumber(candidate.latitude)
        && isFiniteNumber(candidate.longitude)
        && (candidate.accuracy === null || isFiniteNumber(candidate.accuracy))
        && (candidate.speed === null || isFiniteNumber(candidate.speed))
        && (candidate.heading === null || isFiniteNumber(candidate.heading))
        && typeof candidate.captured_at === "string"
        && (candidate.sync_status === "pending" || candidate.sync_status === "sync_failed")
        && isFiniteNumber(candidate.retry_count)
        && (candidate.last_sync_attempt_at === null || typeof candidate.last_sync_attempt_at === "string");
    });
  } catch {
    return [];
  }
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
  return point.tracking_session_id === trackingSessionId
    && point.ad_work_id === work.ad_work_id
    && point.ad_work_day_id === work.ad_work_day_id
    && point.assignment_id === work.assignment_id
    && point.driver_id === work.driver_id
    && point.vehicle_id === work.vehicle_id;
}

async function saveBufferedLocationPoint(point: BufferedLocationPoint) {
  const current = await readBufferedLocationPoints();
  await writeBufferedLocationPoints([
    ...current.filter((existing) => existing.client_point_id !== point.client_point_id),
    point
  ]);
}

async function markBufferedLocationPointsFailed(points: BufferedLocationPoint[]) {
  const failedClientIds = new Set(points.map((point) => point.client_point_id));
  const attemptedAt = new Date().toISOString();
  const current = await readBufferedLocationPoints();

  await writeBufferedLocationPoints(current.map((point) => failedClientIds.has(point.client_point_id)
    ? {
        ...point,
        sync_status: "sync_failed",
        retry_count: point.retry_count + 1,
        last_sync_attempt_at: attemptedAt
      }
    : point
  ));
}

async function removeAcceptedBufferedLocationPoints(acceptedClientPointIds: string[]) {
  if (acceptedClientPointIds.length === 0) {
    return;
  }

  const accepted = new Set(acceptedClientPointIds);
  const current = await readBufferedLocationPoints();
  await writeBufferedLocationPoints(current.filter((point) => !accepted.has(point.client_point_id)));
}

async function pruneBufferedLocationPointsForWork(work: DriverWorkRow, trackingSessionId: string) {
  const current = await readBufferedLocationPoints();
  return current.filter((point) => isPointForWork(point, work, trackingSessionId));
}

export function App() {
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
  const canSaveLocationUpdate = Boolean(locationSessionId) && locationStatus === "running" && currentStatus === "running";

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
    if (!locationSessionId || locationStatus !== "running" || currentStatus !== "running") {
      return undefined;
    }

    const timer = setInterval(() => {
      void recordCurrentLocationPoint(locationSessionId, false);
      if (currentWork) {
        void syncBufferedLocationPointsForWork(currentWork, locationSessionId, false);
      }
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
    const buffered = await pruneBufferedLocationPointsForWork(work, trackingSessionId);
    const retryable = buffered.filter((point) => force || point.retry_count < maxLocationSyncRetries);
    setPendingOfflineCount(buffered.length);

    if (retryable.length === 0) {
      if (buffered.length > 0) {
        setLocationHealthStatus("sync_failed");
      }
      return;
    }

    try {
      setIsLocationSyncing(true);
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
      setLocationHealthStatus(result.tracking_health_status ?? (remaining.length > 0 ? "sync_pending" : "healthy"));
      setLastSyncTime(result.last_successful_sync_at ?? new Date().toISOString());
      if (force || retryable.length > 0) {
        setLocationMessage(result.result_message || driverLabels.locationSynced + ".");
      }
    } catch {
      await markBufferedLocationPointsFailed(retryable);
      const failed = await pruneBufferedLocationPointsForWork(work, trackingSessionId);
      setPendingOfflineCount(failed.length);
      setLocationHealthStatus("sync_failed");
      if (force) {
        setLocationMessage(driverLabels.syncFailed + ". " + driverLabels.trySyncAgain + ".");
      }
    } finally {
      setIsLocationSyncing(false);
    }
  }

  async function handleSyncNow() {
    if (!currentWork || !locationSessionId) {
      return;
    }

    setLocationMessage(driverLabels.syncingLocationProof + ".");
    await syncBufferedLocationPointsForWork(currentWork, locationSessionId, true);
  }

  async function recordCurrentLocationPoint(trackingSessionId: string, showMessage = true) {
    if (!currentWork) {
      return;
    }

    let bufferedPoint: BufferedLocationPoint | null = null;

    try {
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const capturedAt = new Date(position.timestamp).toISOString();
      const clientPointId = createClientPointId();
      const localQuality = getLocationQualityFromAccuracy(position.coords.accuracy);

      bufferedPoint = {
        local_id: clientPointId,
        client_point_id: clientPointId,
        tracking_session_id: trackingSessionId,
        ad_work_id: currentWork.ad_work_id,
        ad_work_day_id: currentWork.ad_work_day_id,
        assignment_id: currentWork.assignment_id,
        driver_id: currentWork.driver_id,
        vehicle_id: currentWork.vehicle_id,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: isFiniteNumber(position.coords.accuracy) ? position.coords.accuracy : null,
        speed: isFiniteNumber(position.coords.speed) ? position.coords.speed : null,
        heading: isFiniteNumber(position.coords.heading) ? position.coords.heading : null,
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
      await syncBufferedLocationPointsForWork(currentWork, trackingSessionId, false);
      if (showMessage) {
        setLocationMessage("Location update saved (" + localQuality + ").");
      }
    } catch (error) {
      if (bufferedPoint) {
        await saveBufferedLocationPoint(bufferedPoint);
        await refreshBufferedLocationSummary(currentWork, trackingSessionId);
        setLastSavedLocationTime(bufferedPoint.captured_at);
        setLocationHealthStatus("offline_saving");
        if (showMessage) {
          setLocationMessage(driverLabels.locationSavedOffline + ".");
        }
        return;
      }

      if (showMessage) {
        setLocationMessage(error instanceof Error ? error.message : "Could not save location update.");
      }
    }
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
      const permission = await Location.requestForegroundPermissionsAsync();

      if (!permission.granted) {
        const missing = await markMobileLocationPermissionMissing({ mobileNumber, workCode, dayId: currentWork.ad_work_day_id });
        setLocationSessionId(missing?.tracking_session_id ?? null);
        setLocationStatus("permission_missing");
        setLocationHealthStatus("permission_missing");
        setLocationMessage(driverLabels.locationPermissionNeeded + ".");
        return;
      }

      const result = await startMobileTracking({
        mobileNumber,
        workCode,
        dayId: currentWork.ad_work_day_id,
        driverConsent: true
      });
      setLocationSessionId(result.tracking_session_id);
      setLocationStatus(result.status);
      setLocationHealthStatus(result.tracking_health_status ?? "healthy");
      setLocationPointCount(result.point_count ?? 0);
      await recordCurrentLocationPoint(result.tracking_session_id, false);
      setLocationMessage(driverLabels.locationProofRunning + ".");
    } catch (error) {
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

    try {
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
      if (action === "take_break" && locationSessionId) {
        await handleStopLocationProof("break_started");
      }
      if (action === "end" && locationSessionId) {
        await handleStopLocationProof("work_ended");
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
      setWorkMessage(error instanceof Error ? error.message : "Could not save work update.");
    } finally {
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

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.shell} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>{productName}</Text>
        <Text style={styles.title}>{driverLabels.assignedWork}</Text>
        <Text style={styles.body}>Enter your mobile number and Work Code to open today&apos;s Ad Work.</Text>

        {!configured && (
          <Text style={styles.notice}>Driver work access is not configured in this environment.</Text>
        )}

        <View style={styles.form}>
          <Text style={styles.label}>Mobile number</Text>
          <TextInput
            style={styles.input}
            value={mobileNumber}
            maxLength={20}
            keyboardType="phone-pad"
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

          <PrimaryButton label={isWorkLoading ? "Loading..." : "Open Assigned Work"} disabled={isWorkLoading} onPress={handleOpenWork} />
          {workMessage ? <Text style={styles.notice}>{workMessage}</Text> : null}
        </View>

        {currentWork && (
          <View style={styles.workCard}>
            <Text style={styles.sectionTitle}>{currentWork.business_name || "Ad Work"}</Text>
            <Text style={styles.body}>{currentWork.city || "City not set"}</Text>
            <Text style={styles.label}>Areas to cover</Text>
            <Text style={styles.body}>{currentWork.areas_to_cover || "Not set"}</Text>
            <Text style={styles.label}>Advertisement message</Text>
            <Text style={styles.body}>{currentWork.advertisement_details || "Not set"}</Text>
            <Text style={styles.label}>Planned date</Text>
            <Text style={styles.body}>{formatDate(currentWork.planned_date)} {currentWork.planned_start_time || ""} {currentWork.planned_end_time || ""}</Text>
            <Text style={styles.label}>Vehicle number</Text>
            <Text style={styles.body}>{currentWork.vehicle_number || "Not set"}</Text>
            <Text style={styles.label}>Instructions</Text>
            <Text style={styles.body}>{currentWork.special_instructions || "Follow admin instructions."}</Text>
            <Text style={styles.statusText}>{adWorkExecutionDayStatusLabels[currentStatus]}</Text>

            <View style={styles.actionGrid}>
              <SecondaryButton label={driverLabels.startWork} disabled={!canStartWork(currentStatus) || isWorkLoading} onPress={() => void handleWorkAction("start")} />
              <SecondaryButton label={driverLabels.takeBreak} disabled={!canTakeBreak(currentStatus) || isWorkLoading} onPress={() => void handleWorkAction("take_break")} />
              <SecondaryButton label={driverLabels.resumeWork} disabled={!canResumeWork(currentStatus) || isWorkLoading} onPress={() => void handleWorkAction("resume")} />
            </View>
            {mobileLocationProofRequired && (
              <View style={styles.locationProofBox}>
                <Text style={styles.sectionTitle}>{driverLabels.allowLocationProof}</Text>
                <Text style={styles.body}>{mobileLocationProofConsentText}</Text>
                {currentWork.mobile_location_proof_note ? <Text style={styles.notice}>{currentWork.mobile_location_proof_note}</Text> : null}
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: locationUnderstanding }}
                  style={styles.consentRow}
                  onPress={() => setLocationUnderstanding((current) => !current)}
                >
                  <View style={[styles.checkbox, locationUnderstanding && styles.checkboxChecked]} />
                  <Text style={styles.consentText}>I understand Phone Location Proof starts after Start Work and stops after End Work or Break.</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: locationAgreement }}
                  style={styles.consentRow}
                  onPress={() => setLocationAgreement((current) => !current)}
                >
                  <View style={[styles.checkbox, locationAgreement && styles.checkboxChecked]} />
                  <Text style={styles.consentText}>I allow Location Proof for this assigned work.</Text>
                </Pressable>
                <Text style={styles.statusText}>{getTrackingSessionStatusLabel(locationStatus)} | {getTrackingHealthStatusLabel(locationHealthStatus)} | {locationPointCount} updates</Text>
                <Text style={styles.body}>Last Saved Location Time: {lastSavedLocationTime || lastLocationUpdate || "Not yet"}</Text>
                <Text style={styles.body}>{driverLabels.unsyncedPoints}: {pendingOfflineCount}</Text>
                <Text style={styles.body}>Last Sync Time: {lastSyncTime || "Not yet"}</Text>
                {locationStatus === "permission_missing" ? <Text style={styles.notice}>{driverLabels.locationPermissionNeeded}.</Text> : null}
                {pendingOfflineCount > 0 ? <Text style={styles.notice}>{driverLabels.locationSavedOffline}. {driverLabels.trySyncAgain}.</Text> : null}
                <View style={styles.actionGrid}>
                  <SecondaryButton label={driverLabels.startLocationProof} disabled={!canStartLocationProof || isLocationBusy} onPress={() => void handleStartLocationProof()} />
                  <SecondaryButton label="Save Location Update" disabled={!canSaveLocationUpdate || isLocationBusy} onPress={() => locationSessionId && void recordCurrentLocationPoint(locationSessionId)} />
                  <SecondaryButton label={isLocationSyncing ? driverLabels.syncingLocationProof : "Sync Now"} disabled={!locationSessionId || isLocationSyncing} onPress={() => void handleSyncNow()} />
                  <SecondaryButton label={driverLabels.stopLocationProof} disabled={!locationSessionId || isLocationBusy || locationStatus === "stopped"} onPress={() => void handleStopLocationProof("other")} />
                </View>
                {locationMessage ? <Text style={styles.notice}>{locationMessage}</Text> : null}
              </View>
            )}
            <Text style={styles.label}>Completion note</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={completionNote}
              maxLength={600}
              multiline
              onChangeText={setCompletionNote}
              placeholder="Short completion note"
            />
            <PrimaryButton label={driverLabels.endWork} disabled={!canEndWork(currentStatus) || isWorkLoading} onPress={() => void handleWorkAction("end")} />

            <Text style={styles.label}>Proof type</Text>
            <View style={styles.optionGrid}>
              {executionProofNoteTypeOptions.map((option) => (
                <OptionButton
                  key={option}
                  value={option}
                  label={executionProofNoteTypeLabels[option]}
                  selected={proofType === option}
                  onSelect={(value: ExecutionProofNoteType) => setProofType(value)}
                />
              ))}
            </View>
            <Text style={styles.label}>{driverLabels.areaOrPlaceName}</Text>
            <TextInput
              style={styles.input}
              value={proofArea}
              maxLength={120}
              onChangeText={setProofArea}
              placeholder="Area or place"
            />
            <Text style={styles.label}>{driverLabels.addProofNote}</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={proofNote}
              maxLength={600}
              multiline
              onChangeText={setProofNote}
              placeholder="Write a simple proof note"
            />
            <SecondaryButton label={driverLabels.addProofNote} disabled={isWorkLoading} onPress={() => void handleWorkAction("add_proof_note")} />

            <View style={styles.proofUploadBox}>
              <Text style={styles.sectionTitle}>{driverLabels.uploadPhotoProof}</Text>
              <Text style={styles.body}>Choose one photo after work is Running or On Break.</Text>
              <SecondaryButton label={proofPhoto ? "Change Photo" : "Choose Photo"} disabled={isProofSubmitting} onPress={() => void handleChooseProofPhoto()} />
              {proofPhoto ? (
                <View style={styles.photoPreviewBox}>
                  <Image source={{ uri: proofPhoto.uri }} style={styles.photoPreview} />
                  <Text style={styles.body}>{proofPhoto.fileName || "Selected photo"}</Text>
                </View>
              ) : null}
              <PrimaryButton
                label={isProofSubmitting ? "Submitting..." : driverLabels.submitProof}
                disabled={!canUploadPhotoProof(currentStatus) || isProofSubmitting || !proofPhoto}
                onPress={() => void handleSubmitPhotoProof()}
              />
            </View>

            <Text style={styles.label}>{driverLabels.issueReported}</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={issueNote}
              maxLength={600}
              multiline
              onChangeText={setIssueNote}
              placeholder="Describe the issue"
            />
            <SecondaryButton label={driverLabels.issueReported} disabled={isWorkLoading} onPress={() => void handleWorkAction("issue")} />

            <PrimaryButton label={driverLabels.callAdmin} />
          </View>
        )}

        <View style={styles.divider} />

        <Text style={styles.title}>{driverLabels.registerAsDriver}</Text>
        <Text style={styles.body}>
          Share your driver and vehicle details. The {productName} team will contact you after review.
        </Text>

        <View style={styles.hiddenField}>
          <TextInput
            value={form.companyWebsite}
            onChangeText={(value) => updateField("companyWebsite", value)}
            importantForAutofill="no"
          />
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Driver full name</Text>
          <TextInput
            style={styles.input}
            value={form.driverName}
            maxLength={100}
            onChangeText={(value) => updateField("driverName", value)}
            placeholder="Enter driver name"
          />

          <Text style={styles.label}>Mobile number</Text>
          <TextInput
            style={styles.input}
            value={form.mobileNumber}
            maxLength={20}
            keyboardType="phone-pad"
            onChangeText={(value) => updateField("mobileNumber", value)}
            placeholder="Enter mobile number"
          />

          <Text style={styles.label}>City/town</Text>
          <TextInput
            style={styles.input}
            value={form.cityTown}
            maxLength={80}
            onChangeText={(value) => updateField("cityTown", value)}
            placeholder="Enter city or town"
          />

          <Text style={styles.label}>Service areas</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={form.serviceAreas}
            maxLength={600}
            multiline
            onChangeText={(value) => updateField("serviceAreas", value)}
            placeholder="Areas you can serve"
          />

          <Text style={styles.label}>Vehicle ownership</Text>
          <View style={styles.optionGrid}>
            {vehicleOwnershipOptions.map((option) => (
              <OptionButton
                key={option}
                value={option}
                label={vehicleOwnershipLabels[option]}
                selected={form.vehicleOwnership === option}
                onSelect={(value: VehicleOwnership) => updateField("vehicleOwnership", value)}
              />
            ))}
          </View>

          <Text style={styles.label}>Vehicle type</Text>
          <View style={styles.optionGrid}>
            {vehicleTypeOptions.map((option) => (
              <OptionButton
                key={option}
                value={option}
                label={vehicleTypeLabels[option]}
                selected={form.vehicleType === option}
                onSelect={(value: VehicleType) => updateField("vehicleType", value)}
              />
            ))}
          </View>

          <Text style={styles.label}>Vehicle number</Text>
          <TextInput
            style={styles.input}
            value={form.vehicleNumber}
            maxLength={40}
            autoCapitalize="characters"
            onChangeText={(value) => updateField("vehicleNumber", value)}
            placeholder="Vehicle number"
          />

          <View style={styles.switchRow}>
            <Text style={styles.labelInline}>Mic/speaker system available</Text>
            <Switch
              value={form.micSystemAvailable}
              onValueChange={(value) => updateField("micSystemAvailable", value)}
            />
          </View>

          <Text style={styles.label}>Vehicle GPS Device</Text>
          <View style={styles.optionGrid}>
            {yesNoNotSureOptions.map((option) => (
              <OptionButton
                key={option}
                value={option}
                label={yesNoNotSureLabels[option]}
                selected={form.gpsDeviceAvailable === option}
                onSelect={(value: YesNoNotSure) => updateField("gpsDeviceAvailable", value)}
              />
            ))}
          </View>

          <Text style={styles.label}>Preferred working cities/towns</Text>
          <TextInput
            style={styles.input}
            value={form.preferredWorkingCities}
            maxLength={400}
            onChangeText={(value) => updateField("preferredWorkingCities", value)}
            placeholder="Cities or towns"
          />

          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={form.notes}
            maxLength={800}
            multiline
            onChangeText={(value) => updateField("notes", value)}
            placeholder="Any details for admin"
          />

          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: form.consentToContact }}
            style={styles.consentRow}
            onPress={() => updateField("consentToContact", !form.consentToContact)}
          >
            <View style={[styles.checkbox, form.consentToContact && styles.checkboxChecked]} />
            <Text style={styles.consentText}>I agree that the Prachar team may contact me about driver work.</Text>
          </Pressable>

          {errors.length > 0 && (
            <View style={styles.errorBox}>
              {errors.map((error) => <Text style={styles.errorText} key={error}>{error}</Text>)}
            </View>
          )}

          {statusMessage ? <Text style={styles.notice}>{statusMessage}</Text> : null}

          <PrimaryButton
            label={isSubmitting ? "Submitting..." : driverLabels.submitDetails}
            disabled={isSubmitting}
            onPress={handleSubmit}
          />
          <PrimaryButton label={driverLabels.callAdmin} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#fffaf1"
  },
  shell: {
    padding: 22,
    gap: 14
  },
  brand: {
    color: "#c84f20",
    fontSize: 18,
    fontWeight: "900"
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
    borderWidth: 1,
    borderColor: "#eadfce",
    borderRadius: 8,
    backgroundColor: "#fffdf8",
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
    minHeight: 62,
    borderRadius: 8,
    backgroundColor: "#c84f20",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18
  },
  secondaryButton: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#c84f20",
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
    color: "#c84f20",
    fontSize: 16,
    fontWeight: "900"
  },
  divider: {
    height: 1,
    backgroundColor: "#eadfce",
    marginVertical: 12
  },
  hiddenField: {
    position: "absolute",
    left: -10000,
    width: 1,
    height: 1,
    overflow: "hidden"
  }
});
