/**
 * Greek Retail Observatory — canonical B2C retail coverage for KAD 2025
 * (active from 1 March 2026). The official GEMI activity metadata determines
 * the exact child KAD identifiers; this module never invents individual IDs.
 *
 * The retail study is restricted to division 47 (sale of goods to consumers).
 * Food service, hospitality, repairs and other consumer services require a
 * separately approved questionnaire / population definition.
 */
export const RETAIL_ACTIVITY_GROUP_IDS = ["retail-all"] as const;
export const RETAIL_CLASSIFICATION_VERSION = "greek-retail-kad-2025-all-retail-v2";
export const RETAIL_SOURCE_REFERENCE = "gemi-opendata:retail-all:active:all-greece";

export function kadMatches(code: string, prefix: string): boolean {
  const normalized = code.trim().replace(/\s+/g, "");
  const wanted = prefix.trim().replace(/\s+/g, "");
  if (normalized === wanted || normalized.startsWith(wanted + ".")) return true;
  const digits = normalized.replace(/\D/g, "");
  const wantedDigits = wanted.replace(/\D/g, "");
  // GEMI sometimes returns an undotted 8-digit code.
  return Boolean(digits && wantedDigits && digits.startsWith(wantedDigits));
}

export function isRetailKad(code: string): boolean {
  return kadMatches(code, "47");
}

/** An exhaustive, ordered partition of current division 47. */
export function greekRetailSector(activityCodes: readonly string[]): string {
  const has = (...prefixes: string[]) => activityCodes.some((code) =>
    prefixes.some((prefix) => kadMatches(code, prefix))
  );
  if (has("47.11", "47.2")) return "food_groceries";
  if (has("47.30", "47.3")) return "fuel_retail";
  if (has("47.8")) return "automotive_trade";
  if (has("47.9")) return "retail_intermediation";
  if (has("47.73", "47.74")) return "pharmacy_medical";
  if (has("47.71", "47.72")) return "fashion_footwear";
  if (has("47.75")) return "beauty_personal_care";
  if (has("47.51", "47.53", "47.54", "47.55", "47.59")) return "home_living";
  if (has("47.52")) return "diy_building";
  if (has("47.40", "47.41", "47.42", "47.43")) return "electronics";
  if (has("47.61", "47.62", "47.63", "47.64", "47.65", "47.69")) return "sports_books_hobby";
  if (has("47.77")) return "jewellery_watches";
  if (has("47.76")) return "flowers_pets";
  if (has("47.79")) return "second_hand";
  if (has("47.19")) return "general_merchandise";
  // Includes remaining division-47 classes: no B2C retail is silently discarded.
  return "other_retail";
}
