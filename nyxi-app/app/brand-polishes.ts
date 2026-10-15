/**
 * Source-backed NYXI polish atlas (pilot). The FINISH and SHADE NAME are
 * supported by the linked manufacturer listing. The HEX is an uncalibrated
 * visual estimate, NOT a spectrophotometer measurement or official RGB.
 * Do not silently expand profiles from AI, search, or unaudited feeds.
 */
export type PolishMaterial = "sheer" | "cream" | "jelly" | "pearl" | "shimmer" | "glitter" | "chrome" | "cat-eye" | "matte";
export type PolishEvidence = {
  sourceUrl: string;
  sourceType: "manufacturer";
  verifiedFinish: true;
  calibratedColor: false;
  checkedOn: string;
};
export type BrandPolishProfile = {
  id: string;
  brand: string;
  collection: string;
  shadeName: string;
  approximateHex: string;
  material: PolishMaterial;
  coverage: number;       // estimated opacity in two thin coats (0..1)
  reflectivity: number;   // conservative artist approximation (0..1)
  notes: string;
  evidence: PolishEvidence;
};

export const BRAND_POLISHES: readonly BrandPolishProfile[] = [
  {
    id: "opi-nl-bubble-bath", brand: "OPI", collection: "Nail Lacquer", shadeName: "Bubble Bath",
    approximateHex: "#E6C3C8", material: "sheer", coverage: 0.43, reflectivity: 0.34,
    notes: "Απαλό, διάφανο ροζ με φυσική λάμψη, όχι chrome ή cat-eye.",
    evidence: { sourceUrl: "https://www.opi.com/en-GB/products/shop-products/nail-lacquer-bubble-bath", sourceType: "manufacturer", verifiedFinish: true, calibratedColor: false, checkedOn: "2026-10-12" },
  },
  {
    id: "opi-nl-bubble-bunny", brand: "OPI", collection: "Nail Lacquer", shadeName: "OPI’m a Bubble Bunny",
    approximateHex: "#EDD5D6", material: "sheer", coverage: 0.46, reflectivity: 0.36,
    notes: "Γαλακτερό διάφανο ροζ. Όχι μεταλλική ή μαγνητική σύνθεση.",
    evidence: { sourceUrl: "https://www.opi.com/products/nail-lacquer-opim-a-bubble-bunny", sourceType: "manufacturer", verifiedFinish: true, calibratedColor: false, checkedOn: "2026-10-12" },
  },
  {
    id: "opi-nl-big-apple-red", brand: "OPI", collection: "Nail Lacquer", shadeName: "Big Apple Red",
    approximateHex: "#B51D34", material: "cream", coverage: 0.93, reflectivity: 0.39,
    notes: "Κλασικό έντονο γυαλιστερό κόκκινο χωρίς ανεπιβεβαίωτα ειδικά εφέ.",
    evidence: { sourceUrl: "https://www.opi.com/products/nail-lacquer-big-apple-red", sourceType: "manufacturer", verifiedFinish: true, calibratedColor: false, checkedOn: "2026-10-12" },
  },
  {
    id: "essie-original-ballet-slippers", brand: "essie", collection: "Original", shadeName: "Ballet Slippers",
    approximateHex: "#EDD5D9", material: "sheer", coverage: 0.4, reflectivity: 0.33,
    notes: "Απαλό ημιδιάφανο ροζ. Μία στρώση πιο φυσική, δύο πιο αισθητές.",
    evidence: { sourceUrl: "https://www.essie.com/nail-polish/enamel/pinks/ballet-slippers", sourceType: "manufacturer", verifiedFinish: true, calibratedColor: false, checkedOn: "2026-10-12" },
  },
] as const;

const TRUSTED_ORIGINS = new Set(["www.opi.com", "www.essie.com"]);
export function validManufacturerProfile(profile: BrandPolishProfile): boolean {
  try {
    const url = new URL(profile.evidence.sourceUrl);
    return (
      profile.evidence.sourceType === "manufacturer" &&
      profile.evidence.verifiedFinish === true &&
      profile.evidence.calibratedColor === false &&
      url.protocol === "https:" &&
      TRUSTED_ORIGINS.has(url.hostname) &&
      /^#[0-9a-f]{6}$/i.test(profile.approximateHex) &&
      Number.isFinite(profile.coverage) && profile.coverage >= 0.1 && profile.coverage <= 1 &&
      Number.isFinite(profile.reflectivity) && profile.reflectivity >= 0 && profile.reflectivity <= 0.8 &&
      (!["chrome", "cat-eye", "glitter"].includes(profile.material) || /chrome|cat-eye|glitter/i.test(profile.notes))
    );
  } catch { return false; }
}
export const AVAILABLE_POLISHES = BRAND_POLISHES.filter(validManufacturerProfile);
export const AVAILABLE_BRANDS = [...new Set(AVAILABLE_POLISHES.map(p => p.brand))];
export function findBrandPolish(id: string): BrandPolishProfile | null {
  return AVAILABLE_POLISHES.find(p => p.id === id) ?? null;
}
