export const M22_RULE_VERSION_V1 = "m22-pilot-v1" as const;

export type M22RuleVersionV1 = typeof M22_RULE_VERSION_V1;

export const m22RuleIdsV1 = [
  "heartbeat_missing",
  "location_update_missing",
  "device_offline",
  "battery_low",
  "external_power_removed",
  "gps_fix_missing",
  "gsm_signal_weak",
  "long_stop",
  "impossible_speed",
  "identity_conflict",
  "sequence_conflict",
  "sequence_gap",
  "out_of_order",
  "invalid_coordinate",
  "unsupported_sensor_observation",
  "delayed_backfill_expired",
  "captured_after_end_work",
  "off_work_location_attempt",
  "vehicle_link_not_effective",
  "assignment_not_effective",
  "authority_ambiguous",
  "unknown_device_or_credential",
  "reconnect_or_live_recovery",
] as const;

export type M22RuleIdV1 = (typeof m22RuleIdsV1)[number];

export const m22AlertSeveritiesV1 = [
  "info",
  "warning",
  "critical",
] as const;

export type M22AlertSeverityV1 = (typeof m22AlertSeveritiesV1)[number];

export const m22AlertStatusesV1 = [
  "new",
  "acknowledged",
  "investigating",
  "resolved",
  "false_alarm",
  "ignored",
] as const;

export type M22AlertStatusV1 = (typeof m22AlertStatusesV1)[number];

export const m22AlertSourcesV1 = [
  "legacy",
  "physical_device_live",
  "physical_device_delayed",
  "health_sweep",
  "adapter_rejection",
  "authentication_failure",
  "recovery",
] as const;

export type M22AlertSourceV1 = (typeof m22AlertSourcesV1)[number];

export type M22RuleEvaluationSourceV1 =
  | "telemetry_receipt"
  | "identity_conflict"
  | "device_health"
  | "location_points"
  | "authority_receipt"
  | "adapter_rejection"
  | "authentication_failure"
  | "health_sweep"
  | "recovery";

export type M22EvidenceFreshnessV1 =
  | "live"
  | "delayed_historical"
  | "not_applicable";

/**
 * Stable, bounded reasons accepted by the service-only rule pipeline.
 * They describe evidence classification, not policy formulas.
 */
export type M22RuleSignalReasonCodeV1 =
  | "accepted_live_telemetry"
  | "accepted_delayed_telemetry"
  | "live_health_only"
  | "changed_content_identity_reuse"
  | "changed_content_sequence_reuse"
  | "sequence_gap_observed"
  | "out_of_order_observed"
  | "invalid_coordinate_rejected"
  | "unsupported_sensor_rejected"
  | "delayed_backfill_window_expired"
  | "captured_after_work_end"
  | "captured_outside_running_work"
  | "device_vehicle_link_not_resolved"
  | "ad_work_assignment_not_resolved"
  | "event_time_authority_ambiguous"
  | "authentication_failure_aggregated"
  | "monitoring_sweep_due"
  | "live_recovery_observed";

export type M22RuleEvaluationReasonCodeV1 =
  | "condition_opened"
  | "active_episode_updated"
  | "condition_cleared"
  | "condition_remains_clear"
  | "below_opening_policy"
  | "above_clearing_policy"
  | "insufficient_evidence"
  | "policy_disabled"
  | "not_monitoring_eligible"
  | "not_expected_during_break"
  | "not_expected_after_work_end"
  | "identical_duplicate_ignored"
  | "delayed_evidence_not_live_recovery"
  | "historical_assessment_only"
  | "recovery_alert_suppressed";

export interface M22SafeRuleContextV1 {
  readonly gpsDeviceId?: string;
  readonly vehicleId?: string;
  readonly adWorkId?: string;
  readonly adWorkDayId?: string;
  readonly assignmentId?: string;
  readonly trackingSessionId?: string;
  readonly telemetryReceiptId?: string;
  readonly deviceLinkHistoryId?: string;
  readonly assignmentHistoryId?: string;
  readonly executionHistoryId?: string;
  /** Keyed, server-generated value. Never a raw device hint or credential. */
  readonly safeAuthenticationFingerprint?: string;
}

/**
 * Queue-safe signal contract. It intentionally has no raw payload, coordinate,
 * credential, authorization value, customer data, Work Code, or free-form text.
 */
export interface M22RuleSignalV1 {
  readonly contractVersion: "1";
  readonly signalId: string;
  readonly ruleId: M22RuleIdV1;
  readonly ruleVersion: M22RuleVersionV1;
  readonly source: M22RuleEvaluationSourceV1;
  readonly reasonCode: M22RuleSignalReasonCodeV1;
  readonly occurredAt: string;
  readonly freshness: M22EvidenceFreshnessV1;
  readonly synthetic: boolean;
  readonly context: M22SafeRuleContextV1;
}

export type M22RuleEvaluationDispositionV1 =
  | "no_alert"
  | "alert_opened"
  | "active_alert_updated"
  | "condition_cleared";

export interface M22RuleEvaluationResultV1 {
  readonly contractVersion: "1";
  readonly signalId: string;
  readonly ruleId: M22RuleIdV1;
  readonly ruleVersion: M22RuleVersionV1;
  readonly source: M22AlertSourceV1;
  readonly disposition: M22RuleEvaluationDispositionV1;
  readonly reasonCode: M22RuleEvaluationReasonCodeV1;
  readonly freshness: M22EvidenceFreshnessV1;
  readonly severity?: M22AlertSeverityV1;
  readonly conditionActive: boolean;
  readonly synthetic: boolean;
  readonly evaluatedAt: string;
}

export const m22RuleSafeLabelsV1: Readonly<Record<M22RuleIdV1, string>> = {
  heartbeat_missing: "Heartbeat missing",
  location_update_missing: "Location update missing",
  device_offline: "Device offline",
  battery_low: "Battery low",
  external_power_removed: "External power removed",
  gps_fix_missing: "GPS fix missing",
  gsm_signal_weak: "GSM signal weak",
  long_stop: "Long stop",
  impossible_speed: "Implausible movement speed",
  identity_conflict: "Telemetry identity conflict",
  sequence_conflict: "Telemetry sequence conflict",
  sequence_gap: "Telemetry sequence gap",
  out_of_order: "Out-of-order telemetry",
  invalid_coordinate: "Invalid coordinate rejected",
  unsupported_sensor_observation: "Unsupported sensor observation",
  delayed_backfill_expired: "Delayed backfill expired",
  captured_after_end_work: "Telemetry captured after End Work",
  off_work_location_attempt: "Off-work location attempt",
  vehicle_link_not_effective: "Device and vehicle link not effective",
  assignment_not_effective: "Assignment not effective",
  authority_ambiguous: "Telemetry authority ambiguous",
  unknown_device_or_credential: "Unknown device or credential activity",
  reconnect_or_live_recovery: "Live telemetry recovery",
};

export const m22AlertSeveritySafeLabelsV1: Readonly<
  Record<M22AlertSeverityV1, string>
> = {
  info: "Information",
  warning: "Warning",
  critical: "Critical",
};

export const m22AlertStatusSafeLabelsV1: Readonly<
  Record<M22AlertStatusV1, string>
> = {
  new: "New",
  acknowledged: "Acknowledged",
  investigating: "Investigating",
  resolved: "Resolved",
  false_alarm: "False alarm",
  ignored: "Ignored",
};

export const m22AlertSourceSafeLabelsV1: Readonly<
  Record<M22AlertSourceV1, string>
> = {
  legacy: "Legacy alert",
  physical_device_live: "Physical device live",
  physical_device_delayed: "Physical device delayed evidence",
  health_sweep: "Scheduled health check",
  adapter_rejection: "Authenticated adapter rejection",
  authentication_failure: "Authentication activity",
  recovery: "Live recovery",
};
