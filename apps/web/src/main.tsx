import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { initializeWebTelemetry } from "./telemetry";
import "./styles.css";
import "./public-v2.css";
import "./admin-v2.css";
import "./production.css";

initializeWebTelemetry();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
