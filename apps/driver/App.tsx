import { useMemo, useState } from "react";
import {
  adWorkExecutionDayStatusLabels,
  businessLabels,
  canEndWork,
  canResumeWork,
  canStartWork,
  canTakeBreak,
  executionProofNoteTypeLabels,
  executionProofNoteTypeOptions,
  initialDriverApplication,
  resolveProductName,
  validateDriverApplication,
  validateDriverExecutionAction,
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
  VehicleOwnership,
  VehicleType,
  YesNoNotSure
} from "@kootha/shared";
import {
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

type DriverWorkRow = {
  ad_work_id: string;
  ad_work_day_id: string;
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
  const configured = useMemo(() => Boolean(getDriverSupabaseConfig()), []);
  const today = new Date().toISOString().slice(0, 10);
  const currentWork = workRows.find((row) => row.planned_date === today)
    ?? workRows.find((row) => row.execution_status !== "completed")
    ?? workRows[0]
    ?? null;
  const currentStatus = currentWork?.execution_status ?? "planned";

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

            <Text style={styles.label}>Proof Note type</Text>
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
            <Text style={styles.label}>Area/place name</Text>
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
