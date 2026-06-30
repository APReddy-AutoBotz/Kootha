import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const ignoredDirs = new Set([
  ".git",
  ".expo",
  ".turbo",
  ".vite",
  "android",
  "build",
  "coverage",
  "dist",
  "ios",
  "node_modules",
  "web-build"
]);
const scannedExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".css", ".json", ".md", ".sql"]);
const ignoredFiles = new Set(["kootha-prachar-complete-specification.md"]);
const blockedFiles = [/\.env$/, /\.env\.(?!example$)/];
const forbiddenCustomerDriverWords = ["geofence", "telemetry", "coordinates", "ingestion"];
const customerDriverLabelFiles = [
  path.join("packages", "shared", "src", "labels.ts"),
  path.join("apps", "driver", "App.tsx")
];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(root, fullPath);
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        files.push(...await walk(fullPath));
      }
      continue;
    }
    files.push(relativePath);
  }
  return files;
}

const files = await walk(root);
const failures = [];

for (const file of files) {
  const normalized = file.split(path.sep).join("/");
  if (ignoredFiles.has(normalized)) {
    continue;
  }
  if (blockedFiles.some((pattern) => pattern.test(normalized)) && normalized !== ".env.example") {
    failures.push(`Environment file must not be committed: ${normalized}`);
  }

  if (!scannedExtensions.has(path.extname(file))) {
    continue;
  }

  const contents = await readFile(path.join(root, file), "utf8");
  if (/\t/.test(contents)) {
    failures.push(`Tabs are not allowed in source files: ${normalized}`);
  }
  if (/[ \t]+$/m.test(contents)) {
    failures.push(`Trailing whitespace found: ${normalized}`);
  }

  const isCustomerDriverLabelFile = customerDriverLabelFiles.some((labelPath) => normalized === labelPath);
  if (isCustomerDriverLabelFile) {
    const lowerContents = contents.toLowerCase();
    for (const word of forbiddenCustomerDriverWords) {
      if (lowerContents.includes(word)) {
        failures.push(`Blocked technical word "${word}" found in customer/driver labels: ${normalized}`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Lint passed for ${files.length} files.`);
