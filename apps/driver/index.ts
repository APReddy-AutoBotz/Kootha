import { registerRootComponent } from "expo";
import * as Sentry from "@sentry/react-native";
import { App } from "./App";
import { initializeDriverTelemetry } from "./src/telemetry";

const telemetryEnabled = initializeDriverTelemetry();
registerRootComponent(telemetryEnabled ? Sentry.wrap(App) : App);
