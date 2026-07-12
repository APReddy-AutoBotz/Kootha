import { readdirSync, readFileSync } from "node:fs";

const directory = new URL("../supabase/migrations/", import.meta.url);
const files = readdirSync(directory).filter((name) => name.endsWith(".sql")).sort();
const timestamps = files.map((name) => name.split("_")[0]);
if (new Set(timestamps).size !== timestamps.length) throw new Error("Duplicate migration timestamp detected.");

for (const name of files) {
  const sql = readFileSync(new URL(name, directory), "utf8");
  if (/security definer/i.test(sql) && !/set search_path/i.test(sql)) throw new Error(`${name}: SECURITY DEFINER without search_path`);
  if (/grant\s+all\s+on[^;]+to\s+(anon|authenticated)/i.test(sql)) throw new Error(`${name}: broad client grant`);
}
console.log(`Migration guardrails: passed (${files.length} files)`);
