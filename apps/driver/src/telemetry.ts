import * as Sentry from "@sentry/react-native";

const sensitiveKey = /(authorization|token|password|phone|mobile|work.?code|lat|lng|coordinate|file.?path|proof|message|customer|supabase)/i;

function scrub(value: unknown, key = ""): unknown {
  if (sensitiveKey.test(key)) return "[Filtered]";
  if (typeof value === "string") return value.replace(/(eyJ[A-Za-z0-9_-]{20,}|\+?\d[\d\s-]{7,}|-?\d{1,3}\.\d{4,})/g, "[Filtered]");
  if (Array.isArray(value)) return value.map((item) => scrub(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, scrub(item, name)]));
  return value;
}

export function initializeDriverTelemetry(): boolean {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
  if (!dsn || dsn.includes("replace-with")) return false;
  Sentry.init({
    dsn,
    environment: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT || "development",
    release: process.env.EXPO_PUBLIC_APP_RELEASE || "local",
    sendDefaultPii: false,
    enableAutoSessionTracking: false,
    beforeBreadcrumb: () => null,
    beforeSend(event) {
      const safe = scrub(event) as typeof event;
      delete safe.user;
      if (safe.request) { delete safe.request.headers; delete safe.request.data; delete safe.request.cookies; }
      return safe;
    }
  });
  return true;
}
