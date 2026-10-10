import { EXPANSION_HUBS } from "./expansion-hubs.ts";

export const HUB_LOCALITY_COOKIE = "km_locality";
export const PRIMARY_LOCATION_GATEWAY_PATH = "/choose-location";

const LIVE_LOCALITY_SELECTIONS = new Set([
  ...EXPANSION_HUBS.filter((hub) => hub.isLive).map((hub) => hub.slug),
  // Compatibility with the pre-HUB English Sparta locality alias.
  "sparta"
]);

function normaliseLocality(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Malformed cookie input is not a valid locality selection.
  }
  const normalized = decoded.trim().toLocaleLowerCase("en-US");
  return normalized || undefined;
}

export function isLiveLocalitySelection(value: string | null | undefined): boolean {
  const normalized = normaliseLocality(value);
  return Boolean(normalized && LIVE_LOCALITY_SELECTIONS.has(normalized));
}

/** @deprecated Prefer isLiveLocalitySelection; retained for compatibility with the initial Sparta gateway tests. */
export function isLegacySpartaLocality(value: string | null | undefined): boolean {
  return isLiveLocalitySelection(value);
}
