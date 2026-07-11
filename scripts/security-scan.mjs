import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
const errors = [];
const secretPatterns = [
  [/sb_secret_[A-Za-z0-9_-]{16,}/, "Supabase secret key"],
  [/eyJ[A-Za-z0-9_-]{60,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, "JWT-like value"],
  [/sk_(live|test)_[A-Za-z0-9]{16,}/, "provider secret"],
  [/AIza[0-9A-Za-z_-]{30,}/, "Google API key"]
];

for (const file of files) {
  if (/\.env(\.|$)/.test(file) && !file.endsWith(".env.example") && file !== ".env.example") errors.push(`${file}: committed environment file`);
  if (/\.(png|webp|jpg|jpeg|gif|ico|woff2?)$/i.test(file)) continue;
  let text;
  try { text = readFileSync(file, "utf8"); } catch { continue; }
  for (const [pattern, label] of secretPatterns) if (pattern.test(text)) errors.push(`${file}: possible ${label}`);
  if (/^(apps\/web\/src|apps\/driver)\//.test(file) && /SUPABASE_SERVICE_ROLE_KEY|service.?role.?key/i.test(text)) errors.push(`${file}: server key reference in client code`);
  if (/^(apps\/driver)\//.test(file) && /ACCESS_BACKGROUND_LOCATION/.test(text)) errors.push(`${file}: background location permission`);
  if (/^(apps\/web\/src|apps\/driver|packages\/shared\/src)\//.test(file) && /(route verified|gps-certified|map verified|distance certified)/i.test(text)) errors.push(`${file}: forbidden customer claim`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("Security guardrails: passed");
