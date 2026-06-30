import { hasDuplicateValues } from "./statuses";

export function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function isPhoneLike(value: unknown): value is string {
  if (!isNonEmptyText(value)) {
    return false;
  }

  return /^[+()0-9 -]{7,20}$/.test(value.trim());
}

export function validateUniqueValues(values: readonly string[]): string[] {
  if (!hasDuplicateValues(values)) {
    return [];
  }

  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
      continue;
    }
    seen.add(value);
  }

  return [...duplicates];
}
