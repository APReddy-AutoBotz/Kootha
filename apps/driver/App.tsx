import { useMemo, useState } from "react";
import {
  businessLabels,
  initialDriverApplication,
  resolveProductName,
  validateDriverApplication,
  vehicleOwnershipLabels,
  vehicleOwnershipOptions,
  vehicleTypeLabels,
  vehicleTypeOptions,
  yesNoNotSureLabels,
  yesNoNotSureOptions
} from "@kootha/shared";
import type { DriverApplicationInput, VehicleOwnership, VehicleType, YesNoNotSure } from "@kootha/shared";
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

async function submitDriverApplication(input: DriverApplicationInput) {
  const config = getDriverSupabaseConfig();

  if (!config) {
    throw new Error("Driver registration is not configured in this environment.");
  }

  const response = await fetch(config.url + "/rest/v1/driver_applications", {
    method: "POST",
    headers: {
      [publicKeyHeader]: config.anonKey,
      Authorization: "Bearer " + config.anonKey,
      "Content-Type": "application/json",
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

export function App() {
  const [form, setForm] = useState<DriverApplicationInput>(initialDriverApplication);
  const [errors, setErrors] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const configured = useMemo(() => Boolean(getDriverSupabaseConfig()), []);

  function updateField<K extends keyof DriverApplicationInput>(field: K, value: DriverApplicationInput[K]) {
    setForm((current) => ({ ...current, [field]: value }));
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
        <Text style={styles.title}>{driverLabels.registerAsDriver}</Text>
        <Text style={styles.body}>
          Share your driver and vehicle details. The {productName} team will contact you after review.
        </Text>

        {!configured && (
          <Text style={styles.notice}>Driver registration is not configured in this environment.</Text>
        )}

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
    fontSize: 38,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 42
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
  hiddenField: {
    position: "absolute",
    left: -10000,
    width: 1,
    height: 1,
    overflow: "hidden"
  }
});
