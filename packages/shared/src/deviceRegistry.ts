export const gpsDeviceStatuses = [
  "pending_setup",
  "active",
  "offline",
  "not_working",
  "suspended",
  "removed",
  "retired"
] as const;

export const gpsDeviceLifecycleEventTypes = [
  "registered",
  "installation_planned",
  "installed",
  "removed",
  "replaced",
  "lost",
  "stolen",
  "marked_not_working",
  "marked_offline",
  "suspended",
  "reactivated",
  "retired",
  "setup_reopened",
] as const;

export const gpsDeviceCredentialStatuses = ["pending", "active", "rotating", "revoked", "expired"] as const;
export const gpsDeviceInstallationStatuses = ["pending", "planned", "installed", "removed", "not_working"] as const;
export const gpsDeviceSignalStatuses = ["unknown", "ready", "degraded", "unavailable"] as const;
export const gpsDevicePowerStatuses = ["unknown", "connected", "disconnected", "not_applicable"] as const;
export const gpsDeviceAdapterTypes = ["generic_http", "vendor_cloud", "other"] as const;
export const gpsDeviceProtocolTypes = ["https", "vendor_managed", "other"] as const;

export type GpsDeviceStatus = (typeof gpsDeviceStatuses)[number];
export type GpsDeviceLifecycleEventType = (typeof gpsDeviceLifecycleEventTypes)[number];
export type GpsDeviceCredentialStatus = (typeof gpsDeviceCredentialStatuses)[number];
export type GpsDeviceInstallationStatus = (typeof gpsDeviceInstallationStatuses)[number];
export type GpsDeviceSignalStatus = (typeof gpsDeviceSignalStatuses)[number];
export type GpsDevicePowerStatus = (typeof gpsDevicePowerStatuses)[number];
export type GpsDeviceAdapterType = (typeof gpsDeviceAdapterTypes)[number];
export type GpsDeviceProtocolType = (typeof gpsDeviceProtocolTypes)[number];

export const gpsDeviceStatusLabels: Record<GpsDeviceStatus, string> = {
  pending_setup: "Pending Setup",
  active: "Active",
  offline: "Offline",
  not_working: "Not Working",
  suspended: "Suspended",
  removed: "Removed",
  retired: "Retired"
};

export const gpsDeviceLifecycleEventLabels: Record<GpsDeviceLifecycleEventType, string> = {
  registered: "Registered",
  installation_planned: "Installation Planned",
  installed: "Installed",
  removed: "Removed",
  replaced: "Replaced",
  lost: "Lost",
  stolen: "Stolen",
  marked_not_working: "Marked Not Working",
  marked_offline: "Marked Offline",
  suspended: "Suspended",
  reactivated: "Reactivated",
  retired: "Retired",
  setup_reopened: "Setup Reopened",
};

export const gpsDeviceCredentialStatusLabels: Record<GpsDeviceCredentialStatus, string> = {
  pending: "Pending",
  active: "Active",
  rotating: "Rotating",
  revoked: "Revoked",
  expired: "Expired"
};

export const gpsDeviceStatusOptions = gpsDeviceStatuses;
export const gpsDeviceLifecycleEventOptions = gpsDeviceLifecycleEventTypes;
export const gpsDeviceCredentialStatusOptions = gpsDeviceCredentialStatuses;
export const gpsDeviceInstallationStatusOptions = gpsDeviceInstallationStatuses;

export function getGpsDeviceStatusLabel(status: string): string {
  return gpsDeviceStatusLabels[status as GpsDeviceStatus] ?? status.replaceAll("_", " ");
}

export function getGpsDeviceLifecycleEventLabel(eventType: string): string {
  return gpsDeviceLifecycleEventLabels[eventType as GpsDeviceLifecycleEventType] ?? eventType.replaceAll("_", " ");
}

export function getGpsDeviceCredentialStatusLabel(status: string): string {
  return gpsDeviceCredentialStatusLabels[status as GpsDeviceCredentialStatus] ?? status.replaceAll("_", " ");
}

const transitions: Record<GpsDeviceStatus, readonly GpsDeviceStatus[]> = {
  pending_setup: ["active", "suspended", "removed", "retired"],
  active: ["offline", "not_working", "suspended", "removed", "retired"],
  offline: ["active", "not_working", "suspended", "removed", "retired"],
  not_working: ["active", "suspended", "removed", "retired"],
  suspended: ["active", "removed", "retired"],
  removed: ["pending_setup", "retired"],
  retired: []
};

export function getAllowedGpsDeviceStatusTransitions(status: GpsDeviceStatus): readonly GpsDeviceStatus[] {
  return transitions[status];
}

export function canTransitionGpsDeviceStatus(from: GpsDeviceStatus, to: GpsDeviceStatus): boolean {
  return from === to || transitions[from].includes(to);
}

export function isGpsDeviceProofReady(input: {
  status: GpsDeviceStatus;
  vehicleId?: string | null;
  credentialStatus?: GpsDeviceCredentialStatus | null;
  installationStatus?: GpsDeviceInstallationStatus | null;
  gpsReadiness?: GpsDeviceSignalStatus | null;
  gsmReadiness?: GpsDeviceSignalStatus | null;
  serverProofReady: boolean;
}): boolean {
  return input.serverProofReady
    && input.status === "active"
    && Boolean(input.vehicleId)
    && input.credentialStatus === "active"
    && input.installationStatus === "installed"
    && input.gpsReadiness === "ready"
    && (input.gsmReadiness === "ready" || input.gsmReadiness === "degraded");
}

export interface GpsDeviceRegistryRecord {
  id: string;
  device_code: string;
  status: GpsDeviceStatus;
  vendor: string | null;
  model: string | null;
  adapter_type: GpsDeviceAdapterType;
  protocol_type: GpsDeviceProtocolType;
  serial_number: string | null;
  imei: string | null;
  vendor_device_identifier: string | null;
  custodian_driver_id: string | null;
  sim_provider_name: string | null;
  firmware_version: string | null;
  last_heartbeat_at: string | null;
  last_telemetry_at: string | null;
  installation_state: GpsDeviceInstallationStatus | null;
  gps_readiness: GpsDeviceSignalStatus | null;
  gsm_readiness: GpsDeviceSignalStatus | null;
  external_power_status: GpsDevicePowerStatus | null;
  battery_status: "unknown" | "normal" | "low" | "critical" | "not_applicable" | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface GpsDeviceVehicleLinkRecord {
  id: string;
  gps_device_id: string;
  vehicle_id: string;
  is_primary: boolean;
  effective_from: string;
  effective_until: string | null;
  installation_reference_note: string | null;
  change_reason: string;
  created_by_admin: string;
  created_at: string;
  closed_by_admin: string | null;
  closed_at: string | null;
}

export interface GpsDeviceLifecycleEventRecord {
  id: string;
  gps_device_id: string;
  vehicle_id: string | null;
  event_type: GpsDeviceLifecycleEventType;
  effective_at: string;
  reason: string | null;
  related_replacement_device_id: string | null;
  created_by_admin: string;
  created_at: string;
  safe_note: string | null;
}

export interface GpsDeviceCredentialMetadataRecord {
  id: string;
  gps_device_id: string;
  credential_key_id: string;
  status: GpsDeviceCredentialStatus;
  issued_at: string | null;
  expires_at: string | null;
  rotated_at: string | null;
  revoked_at: string | null;
  rotated_from_credential_id: string | null;
  last_verified_at: string | null;
  admin_note: string | null;
  created_by_admin: string;
  created_at: string;
  updated_at: string | null;
}

export interface AdminRegisterGpsDeviceRequest {
  p_device_code: string;
  p_vendor: string | null;
  p_model: string | null;
  p_adapter_type: GpsDeviceAdapterType;
  p_protocol_type: GpsDeviceProtocolType;
  p_serial_number: string | null;
  p_imei: string | null;
  p_vendor_device_identifier: string | null;
  p_custodian_driver_id: string | null;
  p_sim_provider_name: string | null;
  p_firmware_version: string | null;
  p_admin_note: string | null;
}

export interface AdminUpdateGpsDeviceRequest extends AdminRegisterGpsDeviceRequest {
  p_device_id: string;
}

export interface AdminChangeGpsDeviceStatusRequest {
  p_device_id: string;
  p_status: GpsDeviceStatus;
  p_reason: string;
}

export interface AdminLinkGpsDeviceVehicleRequest {
  p_device_id: string;
  p_vehicle_id: string;
  p_effective_from: string;
  p_note: string | null;
  p_reason: string;
}

export interface AdminRemoveGpsDeviceVehicleRequest {
  p_device_id: string;
  p_effective_until: string;
  p_reason: string;
  p_note: string | null;
}

export interface AdminRecordGpsDeviceEventRequest {
  p_device_id: string;
  p_event_type: GpsDeviceLifecycleEventType;
  p_effective_at: string;
  p_vehicle_id: string | null;
  p_related_device_id: string | null;
  p_reason: string | null;
  p_note: string | null;
}

export interface AdminReplaceGpsDeviceRequest {
  p_old_device_id: string;
  p_new_device_id: string;
  p_vehicle_id: string;
  p_effective_at: string;
  p_reason: string;
  p_note: string | null;
}

export interface AdminUpsertGpsDeviceCredentialMetadataRequest {
  p_device_id: string;
  p_credential_key_id: string;
  p_status: GpsDeviceCredentialStatus;
  p_issued_at: string;
  p_expires_at: string | null;
  p_rotated_from_credential_id: string | null;
  p_admin_note: string | null;
}

export interface AdminGpsDeviceResult { gps_device_id: string; result_message: string; }
export interface AdminGpsDeviceLinkResult { link_id: string; result_message: string; }
export interface AdminGpsDeviceEventResult { event_id: string; result_message: string; }
export interface AdminGpsDeviceReplacementResult { old_device_id: string; new_device_id: string; new_link_id: string; result_message: string; }
export interface AdminGpsDeviceCredentialResult { credential_id: string; result_message: string; }

export function isGpsDeviceStatus(value: unknown): value is GpsDeviceStatus {
  return typeof value === "string" && gpsDeviceStatuses.includes(value as GpsDeviceStatus);
}

export function validateGpsDeviceCode(value: unknown): string | null {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(value.trim())) {
    return "Device code must be 3-64 letters, numbers, dots, dashes, or underscores.";
  }
  return null;
}

export function validateGpsDeviceReason(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length < 3 || value.trim().length > 500) {
    return "Reason must be between 3 and 500 characters.";
  }
  return null;
}

export function maskDeviceIdentifier(value: string | null | undefined): string {
  if (!value) return "Not recorded";
  if (value.length <= 4) return "****";
  return "****" + value.slice(-4);
}
