import { createHash } from "node:crypto";
import type { SymphonyaSourceProduct } from "./symphonya-v1.ts";
import { symphonyaMeaningfulContentProjection } from "./symphonya-v1.ts";

export const SYMPHONYA_CATALOGUE_SOURCE_CODE = "symphonya" as const;
export const SYMPHONYA_SUPPLIER_CODE = "symphonya" as const;

export type SymphonyaSourceEvidence = Readonly<{
  sourceProductKey: string;
  supplierCode: string | null;
  title: string;
  sourceImageUrl: string | null;
  sourceIdentity: Readonly<Record<string, unknown>>;
  sourceContentHash: string;
  rawPayload: Readonly<Record<string, unknown>>;
  normalizedPayload: Readonly<Record<string, unknown>>;
  qualityPayload: Readonly<Record<string, unknown>>;
  priceState: "unpriced" | "review_required";
  classificationStatus: "raw";
}>;

export type SymphonyaBeautyCandidate = Readonly<{
  matched: boolean;
  ancestor: "Beauty" | null;
  path: readonly string[];
  confidence: "high" | "medium" | "none";
  evidence: readonly string[];
}>;

/**
 * Convert one supplier-scoped Symphonya row into the generic catalogue evidence
 * shape already consumed by KONTA MOY. This does not create a canonical product,
 * publish an offer, or write product_translations; those remain downstream gates.
 */
export function normalizeSymphonyaProduct(product: SymphonyaSourceProduct): SymphonyaSourceEvidence {
  const externalProductId = required(product.productId, "Symphonya product id");
  const externalVariantId = clean(product.variantId) ?? externalProductId;
  const ean = normalizeGtin(product.ean);
  const sku = clean(product.sku) ?? ean ?? externalVariantId;
  const title = clean(product.name) ?? clean(product.localizedNameEl) ?? `Symphonya product ${externalProductId}`;
  const images = normalizeSourceImages(product.images ?? []);
  const stockQuantity = safeQuantity(product.stock);
  const buyingCostMinor = safeMoneyMinor(product.wholesaleCostMinor);
  const beauty = classifySymphonyaBeauty(product);
  const sourceProjection = symphonyaMeaningfulContentProjection({ ...product, images });
  const sourceContentHash = stableContentHash(sourceProjection);
  const missingIdentityFields: string[] = [];
  if (!ean) missingIdentityFields.push("ean");
  if (!clean(product.brand)) missingIdentityFields.push("brand");
  if (!clean(product.name) && !clean(product.localizedNameEl)) missingIdentityFields.push("name");

  return {
    sourceProductKey: externalProductId,
    supplierCode: sku,
    title,
    sourceImageUrl: images[0] ?? null,
    sourceIdentity: compact({
      provider: SYMPHONYA_CATALOGUE_SOURCE_CODE,
      externalProductId,
      externalVariantId,
      supplierCode: sku,
      gtinCandidate: ean,
      brand: clean(product.brand),
      identityMergePolicy: ean ? "gtin_high_confidence_candidate" : "supplier_scoped_only"
    }),
    sourceContentHash,
    rawPayload: product.raw,
    normalizedPayload: {
      provider: SYMPHONYA_CATALOGUE_SOURCE_CODE,
      externalProductId,
      sku,
      barcode: ean,
      mpn: null,
      name: clean(product.name),
      supplierGreekName: clean(product.localizedNameEl),
      description: clean(product.descriptionEn),
      howToUse: clean(product.howToUseEn),
      brand: { id: null, name: clean(product.brand) },
      vendor: { id: null, name: "Symphonya" },
      condition: { id: null, name: "new" },
      gender: { id: null, name: normalizeGender(product.gender) },
      type: clean(product.type),
      categories: compactArray([product.category, product.subcategory, product.subsubcategory]).map((name) => ({ name })),
      categoryDetails: compact({
        cat: clean(product.category),
        scat: clean(product.subcategory),
        sscat: clean(product.subsubcategory),
        beautyCandidate: beauty
      }),
      attributes: compactArray([
        normalizeGender(product.gender) ? { name: "gender", value: normalizeGender(product.gender) } : null,
        clean(product.type) ? { name: "type", value: clean(product.type) } : null
      ]),
      defaultAttributes: [],
      images: images.map((src, position) => ({ src, position })),
      variants: [{
        externalVariantId,
        sku,
        barcode: ean,
        mpn: null,
        regularPriceRaw: null,
        salePriceRaw: buyingCostMinor === null ? null : buyingCostMinor / 100,
        msrpRaw: null,
        buyingCostRaw: buyingCostMinor === null ? null : buyingCostMinor / 100,
        msrpMinor: null,
        buyingCostMinor,
        manageStock: true,
        inStock: stockQuantity !== null ? stockQuantity > 0 : false,
        stockStatus: stockQuantity !== null && stockQuantity > 0 ? "instock" : "outofstock",
        stockQuantity,
        available: stockQuantity !== null && stockQuantity > 0,
        backordersAllowed: false,
        weight: null,
        dimensions: null,
        hsCode: null,
        attributes: compact({
          gender: normalizeGender(product.gender),
          type: clean(product.type),
          warehouse: clean(product.warehouse)
        }),
        image: images[0] ? { src: images[0] } : null
      }],
      stock: {
        manageStock: true,
        inStock: stockQuantity !== null ? stockQuantity > 0 : false,
        stockStatus: stockQuantity !== null && stockQuantity > 0 ? "instock" : "outofstock",
        stockQuantity,
        available: stockQuantity !== null && stockQuantity > 0,
        warehouse: clean(product.warehouse),
        backordersAllowed: false,
        source: "symphonya_api_authoritative"
      },
      prices: {
        currency: clean(product.currency)?.toUpperCase() ?? "EUR",
        buyingCostRaw: buyingCostMinor === null ? null : buyingCostMinor / 100,
        buyingCostMinor,
        msrpRaw: null,
        msrpMinor: null,
        semanticsVerified: true,
        supplierPriceMeaning: "wholesale_buying_cost",
        customerSellingPriceSource: "konta_mou_structured_pricing"
      },
      localisationCandidates: {
        supplierGreekName: clean(product.localizedNameEl),
        englishName: clean(product.name),
        englishShortDescription: clean(product.descriptionEn),
        englishHowToUse: clean(product.howToUseEn),
        servingLayer: "product_translations",
        customerFacingDirectSupplierTextAllowed: false
      },
      sourceHash: sourceContentHash,
      sourceLocale: "mixed_supplier_source"
    },
    qualityPayload: {
      publicationState: "STAGED",
      publicEligible: false,
      priceReviewRequired: buyingCostMinor !== null,
      retailPriceRequired: true,
      pricingSemanticsVerified: true,
      pricingSource: "symphonya_wholesale_cost",
      availabilitySource: "symphonya_api_authoritative",
      backordersAllowed: false,
      missingIdentityFields,
      canonicalMergeCandidate: ean ? "ean_gtin" : "none",
      canonicalMergeAutomaticAllowed: Boolean(ean),
      conflictPolicy: "never_auto_merge_conflicting_gtin",
      sourceContentHash,
      supplierGreekCandidateAvailable: Boolean(clean(product.localizedNameEl)),
      pimEnglishContentAvailable: Boolean(clean(product.descriptionEn) || clean(product.howToUseEn)),
      beautyCandidate: beauty,
      aiRefreshPolicy: "meaningful_content_change_only"
    },
    priceState: buyingCostMinor !== null ? "review_required" : "unpriced",
    classificationStatus: "raw"
  };
}

/**
 * Conservative semantic hint only. Existing KONTA MOU taxonomy resolution owns
 * the final category IDs and can reject this candidate when evidence conflicts.
 */
export function classifySymphonyaBeauty(product: SymphonyaSourceProduct): SymphonyaBeautyCandidate {
  const fields = [product.category, product.subcategory, product.subsubcategory, product.type, product.name]
    .map((value) => normalizeToken(value))
    .filter(Boolean);
  const haystack = fields.join(" ");
  const evidence: string[] = [];

  const rules: readonly Readonly<{ terms: readonly string[]; path: readonly string[] }>[] = [
    { terms: ["perfume", "parfum", "fragrance", "eau de parfum", "eau de toilette", "cologne"], path: ["Beauty", "Fragrance"] },
    { terms: ["makeup", "cosmetic", "mascara", "lipstick", "foundation", "eyeshadow", "blush"], path: ["Beauty", "Makeup"] },
    { terms: ["skin care", "skincare", "face cream", "serum", "cleanser", "toner", "sunscreen"], path: ["Beauty", "Skin Care"] },
    { terms: ["hair care", "haircare", "shampoo", "conditioner", "hair mask", "hair oil"], path: ["Beauty", "Hair Care"] },
    { terms: ["body care", "body lotion", "body cream", "shower gel", "bath"], path: ["Beauty", "Body Care"] },
    { terms: ["personal care", "deodorant", "oral care", "hygiene"], path: ["Beauty", "Personal Care"] },
    { terms: ["grooming", "shaving", "beard", "aftershave"], path: ["Beauty", "Grooming"] }
  ];

  for (const rule of rules) {
    const matches = rule.terms.filter((term) => haystack.includes(term));
    if (!matches.length) continue;
    evidence.push(...matches);
    return {
      matched: true,
      ancestor: "Beauty",
      path: rule.path,
      confidence: matches.length >= 2 || fields.slice(0, 3).some((field) => matches.some((term) => field.includes(term))) ? "high" : "medium",
      evidence: [...new Set(evidence)]
    };
  }

  return { matched: false, ancestor: null, path: [], confidence: "none", evidence: [] };
}

export function stableContentHash(value: Readonly<Record<string, unknown>>): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function normalizeSourceImages(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = clean(raw);
    if (!value || isPlaceholderImage(value)) continue;
    let normalized: string;
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" && url.protocol !== "http:") continue;
      url.hash = "";
      normalized = url.toString();
    } catch {
      continue;
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function normalizeGtin(value: string | undefined): string | null {
  const gtin = clean(value)?.replace(/\s+/g, "") ?? null;
  if (!gtin || !/^\d{8,14}$/.test(gtin)) return null;
  return gtin;
}

function normalizeGender(value: string | undefined): string | null {
  const token = normalizeToken(value);
  if (!token) return null;
  if (["female", "women", "woman", "femme", "donna", "lady", "ladies"].includes(token)) return "female";
  if (["male", "men", "man", "homme", "uomo", "gentlemen"].includes(token)) return "male";
  if (["unisex", "unisex adult", "unisex adults"].includes(token)) return "unisex";
  if (["girl", "girls"].includes(token)) return "girls";
  if (["boy", "boys"].includes(token)) return "boys";
  return clean(value);
}

function normalizeToken(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/[_/\\-]+/g, " ").replace(/\s+/g, " ");
}

function safeQuantity(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value)) return null;
  const quantity = Math.max(0, Math.floor(value));
  return Number.isSafeInteger(quantity) ? quantity : null;
}

function safeMoneyMinor(value: number | undefined): number | null {
  if (value === undefined || !Number.isSafeInteger(value) || value < 0) return null;
  return value;
}

function isPlaceholderImage(value: string): boolean {
  const token = value.toLowerCase();
  return /(?:^|[\/_\-.])(placeholder|no[-_ ]?image|image[-_ ]?not[-_ ]?available|coming[-_ ]?soon)(?:[\/_\-.]|$)/.test(token);
}

function compact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== ""));
}

function compactArray<T>(values: readonly (T | null | undefined | "")[]): T[] {
  return values.filter((value): value is T => value !== null && value !== undefined && value !== "");
}

function clean(value: string | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function required(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required`);
  return trimmed;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
