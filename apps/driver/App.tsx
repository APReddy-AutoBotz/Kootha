import { businessLabels, resolveProductName } from "@kootha/shared";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";

const productName = resolveProductName();
const driverLabels = businessLabels.driver;

function ActionButton({ label }: { label: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export function App() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.shell}>
        <Text style={styles.brand}>{productName}</Text>
        <Text style={styles.title}>{driverLabels.welcome}</Text>
        <Text style={styles.body}>
          M0 driver app placeholder for login and registration. Work controls start in later milestones.
        </Text>

        <View style={styles.actions}>
          <ActionButton label={driverLabels.login} />
          <ActionButton label={driverLabels.register} />
          <ActionButton label={driverLabels.callAdmin} />
        </View>

        <Text style={styles.note}>No GPS or background location permissions are requested in M0.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f7f5ef"
  },
  shell: {
    flex: 1,
    padding: 24,
    justifyContent: "center"
  },
  brand: {
    color: "#6d6258",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 14
  },
  title: {
    color: "#1d232a",
    fontSize: 42,
    fontWeight: "900",
    letterSpacing: 0,
    marginBottom: 16
  },
  body: {
    color: "#3f454b",
    fontSize: 18,
    lineHeight: 28,
    marginBottom: 28
  },
  actions: {
    gap: 14
  },
  button: {
    minHeight: 64,
    borderRadius: 8,
    backgroundColor: "#1d232a",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18
  },
  buttonPressed: {
    opacity: 0.82
  },
  buttonText: {
    color: "#fffdf8",
    fontSize: 20,
    fontWeight: "800"
  },
  note: {
    color: "#6d6258",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 28
  }
});
