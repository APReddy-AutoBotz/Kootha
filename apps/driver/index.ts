import { registerRootComponent } from "expo";
import * as Sentry from "@sentry/react-native";
import { App } from "./App";
import { initializeDriverTelemetry } from "./src/telemetry";

initializeDriverTelemetry();
registerRootComponent(Sentry.wrap(App));
