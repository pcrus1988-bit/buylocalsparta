/**
 * The "pg" driver deserializes timestamptz columns to Date instances.
 * Preserve those timestamps as ISO 8601 strings when crossing the
 * server-component data boundary; do not silently treat them as missing.
 * Other optional string fields retain their previous string-only behavior.
 */
export function optionalResearchText(value: unknown): string | undefined {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : undefined;
  }
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || undefined;
}

/** Always display Research admin instants in the study's Athens timezone. */
export function formatResearchAthensDateTime(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return undefined;
  return date.toLocaleString("el-GR", {
    dateStyle: "medium",
    timeStyle: "short",
    hourCycle: "h23",
    timeZone: "Europe/Athens"
  });
}
