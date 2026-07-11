import * as Sentry from "@sentry/react";

const sensitiveKey = /(authorization|token|password|phone|mobile|work.?code|lat|lng|coordinate|file.?path|proof|message|customer|supabase)/i;
const sensitiveValue = /(eyJ[A-Za-z0-9_-]{20,}|\+?\d[\d\s-]{7,}|-?\d{1,3}\.\d{4,})/g;

function scrub(value: unknown, key = ""): unknown {
  if (sensitiveKey.test(key)) return "[Filtered]";
  if (typeof value === "string") return value.replace(sensitiveValue, "[Filtered]");
  if (Array.isArray(value)) return value.map((item) => scrub(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, scrub(item, name)]));
  return value;
}

export function initializeWebTelemetry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (!dsn || dsn.includes("replace-with")) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || "development",
    release: import.meta.env.VITE_APP_RELEASE || "local",
    sendDefaultPii: false,
    beforeBreadcrumb: () => null,
    beforeSend(event) {
      const safe = scrub(event) as typeof event;
      if (safe.request) { delete safe.request.headers; delete safe.request.data; delete safe.request.cookies; }
      delete safe.user;
      return safe;
    }
  });
}
