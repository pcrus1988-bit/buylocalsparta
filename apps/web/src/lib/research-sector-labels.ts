/**
 * Canonical Greek presentation labels for the Greek Retail Observatory.
 * Segment identifiers stay stable in the DB, analysis and CSV data model.
 * This file intentionally has no server-only imports, so it can be used
 * by the public results, authorized preview and admin geography views.
 */
export const GREEK_RETAIL_SECTOR_CODES = [
  "fashion_footwear",
  "home_living",
  "beauty_personal_care",
  "diy_building",
  "other_non_food_retail",
  "sports_books_hobby",
  "automotive_trade",
  "electronics",
  "flowers_pets",
  "jewellery_watches",
  "second_hand"
] as const;

export const RESEARCH_SECTOR_LABELS: Readonly<Record<string, string>> = {
  fashion_footwear: "Ένδυση και υπόδηση",
  home_living: "Σπίτι και είδη οικιακής χρήσης",
  beauty_personal_care: "Ομορφιά και προσωπική φροντίδα",
  diy_building: "Εργαλεία και οικοδομικά υλικά",
  other_non_food_retail: "Λοιπό λιανεμπόριο εκτός τροφίμων",
  sports_books_hobby: "Αθλητικά, βιβλία και είδη χόμπι",
  automotive_trade: "Αυτοκίνητο και συναφή είδη",
  electronics: "Ηλεκτρονικά και τεχνολογία",
  flowers_pets: "Άνθη και είδη κατοικιδίων",
  jewellery_watches: "Κοσμήματα και ρολόγια",
  second_hand: "Μεταχειρισμένα είδη",
  // Historical / other supported result segments retain Greek display labels.
  food_groceries: "Τρόφιμα και παντοπωλεία",
  retail_intermediation: "Εμπορικοί διαμεσολαβητές",
  health_beauty: "Υγεία και ομορφιά",
  unknown: "Μη ταξινομημένος κλάδος",
  unclassified: "Μη ταξινομημένος κλάδος"
};

export function researchSectorLabel(code: string): string {
  const key = code.trim();
  return RESEARCH_SECTOR_LABELS[key] ?? "Άλλος κλάδος λιανεμπορίου";
}

export function sortResearchSectors<T extends string>(codes: readonly T[]): T[] {
  return [...codes].sort((a, b) => researchSectorLabel(a).localeCompare(researchSectorLabel(b), "el"));
}
