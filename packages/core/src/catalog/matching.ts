import { jaccardSimilarity, normalizeText, tokenSet } from "../common/text.ts";
import type { MatchResult, ProductIdentity } from "./types.ts";

const BLOCKING_VARIANT_KEYS = new Set([
  "size",
  "colour",
  "color",
  "capacity",
  "pack_count",
  "packcount",
  "condition",
  "regional_model",
  "included_accessory",
  "regulated_identifier"
]);

export function matchProducts(a: ProductIdentity, b: ProductIdentity): MatchResult {
  const reasons: string[] = [];

  const conflict = materialVariantConflict(a, b);
  if (conflict) {
    return {
      level: "different",
      confidence: 0,
      reasons: [`Material variant conflict: ${conflict}`],
      autoMergeAllowed: false
    };
  }

  if (a.condition !== b.condition) {
    return { level: "different", confidence: 0, reasons: ["Condition differs"], autoMergeAllowed: false };
  }

  if (a.gtin && b.gtin) {
    if (normalizeCode(a.gtin) !== normalizeCode(b.gtin)) {
      return { level: "different", confidence: 0.02, reasons: ["GTIN/EAN differs"], autoMergeAllowed: false };
    }
    reasons.push("Same GTIN/EAN");
    if (brandCompatible(a.brand, b.brand)) reasons.push("Brand compatible");
    return { level: "exact", confidence: 1, reasons, autoMergeAllowed: true };
  }

  const brand = normalizedEqual(a.brand, b.brand);
  const mpn = normalizedEqual(a.mpn ?? a.model, b.mpn ?? b.model);
  if (brand && mpn && governedAttributesEqual(a, b)) {
    return {
      level: "high_confidence",
      confidence: 0.985,
      reasons: ["Normalized brand matches", "MPN/model matches", "Governed variant attributes match"],
      autoMergeAllowed: true
    };
  }

  let score = 0;
  let weight = 0;

  score += similarityForOptional(a.brand, b.brand) * 0.2;
  weight += 0.2;
  score += similarityForOptional(a.model ?? a.mpn, b.model ?? b.mpn) * 0.25;
  weight += 0.25;
  score += jaccardSimilarity(tokenSet(a.title), tokenSet(b.title)) * 0.35;
  weight += 0.35;
  score += attributeSimilarity(a.attributes, b.attributes) * 0.2;
  weight += 0.2;

  const confidence = weight === 0 ? 0 : score / weight;
  reasons.push(`Identity similarity ${(confidence * 100).toFixed(1)}%`);

  if (confidence >= 0.98) {
    return { level: "high_confidence", confidence, reasons, autoMergeAllowed: true };
  }
  if (confidence >= 0.75) {
    return { level: "requires_review", confidence, reasons, autoMergeAllowed: false };
  }
  if (confidence >= 0.55) {
    return { level: "possible", confidence, reasons, autoMergeAllowed: false };
  }
  return { level: "different", confidence, reasons, autoMergeAllowed: false };
}

function materialVariantConflict(a: ProductIdentity, b: ProductIdentity): string | undefined {
  const keys = new Set([...Object.keys(a.attributes), ...Object.keys(b.attributes)]);
  for (const key of keys) {
    const normalizedKey = normalizeText(key).replaceAll(" ", "_");
    if (!BLOCKING_VARIANT_KEYS.has(normalizedKey)) continue;
    const av = a.attributes[key];
    const bv = b.attributes[key];
    if (av !== undefined && bv !== undefined && normalizeText(av) !== normalizeText(bv)) {
      return `${key}: '${av}' vs '${bv}'`;
    }
  }
  if (a.warrantyBasis && b.warrantyBasis && normalizeText(a.warrantyBasis) !== normalizeText(b.warrantyBasis)) {
    return "materially different warranty basis";
  }
  return undefined;
}

function governedAttributesEqual(a: ProductIdentity, b: ProductIdentity): boolean {
  const keys = new Set([...Object.keys(a.attributes), ...Object.keys(b.attributes)]);
  for (const key of keys) {
    const av = a.attributes[key];
    const bv = b.attributes[key];
    if (av === undefined || bv === undefined) continue;
    if (normalizeText(av) !== normalizeText(bv)) return false;
  }
  return true;
}

function attributeSimilarity(a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>): number {
  const common = Object.keys(a).filter((key) => b[key] !== undefined);
  if (common.length === 0) return 0.5;
  let matched = 0;
  for (const key of common) if (normalizeText(a[key]) === normalizeText(b[key])) matched += 1;
  return matched / common.length;
}

function similarityForOptional(a?: string, b?: string): number {
  if (!a || !b) return 0.5;
  if (normalizeText(a) === normalizeText(b)) return 1;
  return jaccardSimilarity(tokenSet(a), tokenSet(b));
}

function normalizedEqual(a?: string, b?: string): boolean {
  return Boolean(a && b && normalizeText(a) === normalizeText(b));
}

function brandCompatible(a?: string, b?: string): boolean {
  if (!a || !b) return true;
  return normalizeText(a) === normalizeText(b);
}

function normalizeCode(value: string): string {
  return value.replace(/\D/g, "");
}
