import { cache } from "react";
import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type PublicTechnicalAttribute = Readonly<{
  key: string;
  label: string;
  value: string;
}>;

export type PublicProductDetail = Readonly<{
  canonicalVariantId: string;
  description?: string;
  brand?: string;
  model?: string;
  supplierCode?: string;
  sourceGtin?: string;
  sourceImageUrl?: string;
  manualUrl?: string;
  technicalAttributes: readonly PublicTechnicalAttribute[];
  variantFamilyId?: string;
  variantGroupSize: number;
}>;

type ProductDetailRow = SqlRow & {
  canonical_public_id: string;
  model: string | null;
  variant_attributes: unknown;
  specifications: unknown;
  source_supplier_code: string | null;
  source_normalized_payload: unknown;
  source_raw_payload: unknown;
  source_image_url: string | null;
  source_website: string | null;
};

const ATTRIBUTE_LABELS: Readonly<Record<string, string>> = {
  power_w: "Ισχύς",
  flow_l_h: "Παροχή",
  capacity_l: "Χωρητικότητα",
  voltage_v: "Τάση",
  voltage_family: "Οικογένεια τάσης",
  battery_capacity_ah: "Χωρητικότητα μπαταρίας",
  battery_requirement_qty: "Αριθμός μπαταριών",
  pressure_bar: "Πίεση",
  pressure_psi: "Πίεση",
  speed_rpm: "Στροφές",
  rpm: "Στροφές",
  diameter: "Διάμετρος",
  diameter_mm: "Διάμετρος",
  dimensions: "Διαστάσεις",
  dimensions_mm: "Διαστάσεις",
  dimensions_cm: "Διαστάσεις",
  length_m: "Μήκος",
  length_cm: "Μήκος",
  length_mm: "Μήκος",
  width_mm: "Πλάτος",
  height_mm: "Ύψος",
  min_height_mm: "Ελάχιστο ύψος",
  max_height_mm: "Μέγιστο ύψος",
  weight_kg: "Βάρος",
  net_weight_kg: "Καθαρό βάρος",
  engine_cc: "Κυβισμός",
  engine_type: "Τύπος κινητήρα",
  horsepower_hp: "Ιπποδύναμη",
  apparent_power_kva: "Φαινόμενη ισχύς",
  nominal_output_kva: "Ονομαστική ισχύς",
  maximum_output_kva: "Μέγιστη ισχύς",
  luminous_flux_lm: "Φωτεινή ροή",
  color_temperature_k: "Θερμοκρασία χρώματος",
  chain_pitch: "Βήμα αλυσίδας",
  chain_gauge: "Πάχος οδηγού",
  drive_links: "Οδηγοί αλυσίδας",
  pack_qty: "Ποσότητα συσκευασίας",
  material: "Υλικό",
  color: "Χρώμα",
  size: "Μέγεθος",
  features: "Χαρακτηριστικά",
  platform: "Πλατφόρμα",
  included_items: "Περιλαμβάνονται",
  compatible_models: "Συμβατά μοντέλα",
  compatible_brands: "Συμβατές μάρκες",
  compatible_platforms: "Συμβατές πλατφόρμες",
  compatibility_type: "Τύπος συμβατότητας",
  load_ton: "Μέγιστο φορτίο",
  μεγιστο_φορτιο_kg: "Μέγιστο φορτίο",
  μεγιστο_υψος_ανυψωσης_m: "Ύψος ανύψωσης",
  τεμαχια_κιβωτιο: "Τεμάχια / κιβώτιο",
  package_dimensions_cm: "Διαστάσεις συσκευασίας",
  package_weight_kg: "Βάρος συσκευασίας"
};

const ATTRIBUTE_UNIT_OVERRIDES: Readonly<Record<string, string>> = {
  // Nikolaou's Greek source label ends in "M" but values such as 260-400 are millimetres.
  // Keep immutable crawl evidence untouched and correct only the public projection.
  μεγιστο_υψος_ανυψωσης_m: "mm"
};

const FEATURE_VALUE_LABELS: Readonly<Record<string, string>> = {
  solo_tool: "Μόνο εργαλείο",
  brushless: "Χωρίς ψήκτρες",
  adjustable: "Ρυθμιζόμενο",
  foldable: "Πτυσσόμενο",
  telescopic: "Τηλεσκοπικό",
  sds_plus: "SDS Plus",
  stainless: "Ανοξείδωτο",
  sds_max: "SDS Max",
  "2_stroke": "Δίχρονο",
  universal: "Γενικής χρήσης",
  avr: "AVR",
  "4_stroke": "Τετράχρονο",
  inverter: "Inverter"
};

const HIDDEN_ATTRIBUTE_KEYS = new Set([
  "sizes",
  "sizes_observed",
  "brand",
  "made_in",
  "fit",
  "composition",
  "title",
  "description",
  "description_el",
  "description_en",
  "source_url",
  "source_image_url",
  "image_url",
  "manual_url",
  "price",
  "price_minor",
  "recommended_price_minor",
  "price_status",
  "price_match_confidence",
  "price_review_required"
]);

const EXTRA_SPECIFICATION_KEYS = [
  "included_items",
  "platform",
  "voltage_family",
  "battery_requirement_qty",
  "compatibility_type",
  "compatible_models",
  "compatible_brands",
  "compatible_platforms",
  "features",
  "material",
  "pack_qty"
] as const;

const text = (value: unknown): string => typeof value === "string" ? value : String(value ?? "");

function optionalText(value: unknown): string | undefined {
  const result = text(value).trim();
  return result || undefined;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function numeric(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function humanizeKey(key: string): string {
  return ATTRIBUTE_LABELS[key] ?? key
    .replaceAll("_", " ")
    .replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase("el"));
}

function attributeValue(key: string, value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "boolean") return value ? "Ναι" : "Όχι";
  if (Array.isArray(value)) {
    const parts = value.map((entry) => attributeValue(key, entry)).filter((entry): entry is string => Boolean(entry));
    return parts.length ? [...new Set(parts)].join(", ") : undefined;
  }
  if (typeof value === "object") return undefined;
  const raw = text(value).trim();
  if (!raw) return undefined;
  if (key === "features") return FEATURE_VALUE_LABELS[raw.toLowerCase()] ?? raw;
  const overrideUnit = ATTRIBUTE_UNIT_OVERRIDES[key];
  if (overrideUnit && !/[\p{L}%°/×]/iu.test(raw)) return `${raw} ${overrideUnit}`;
  if (/\p{L}|%|°|\/|×|x/iu.test(raw)) return raw;
  if (key === "power_w") return `${raw} W`;
  if (key === "capacity_l") return `${raw} L`;
  if (key === "voltage_v") return `${raw} V`;
  if (key === "battery_capacity_ah") return `${raw} Ah`;
  if (key === "pressure_bar") return `${raw} bar`;
  if (key === "pressure_psi") return `${raw} psi`;
  if (key === "speed_rpm" || key === "rpm") return `${raw} rpm`;
  if (key.endsWith("_mm")) return `${raw} mm`;
  if (key.endsWith("_cm")) return `${raw} cm`;
  if (key.endsWith("_m")) return `${raw} m`;
  if (key.endsWith("_kg")) return `${raw} kg`;
  if (key.endsWith("_cc")) return `${raw} cc`;
  if (key.endsWith("_hp")) return `${raw} HP`;
  if (key.endsWith("_kva")) return `${raw} kVA`;
  if (key.endsWith("_lm")) return `${raw} lm`;
  if (key.endsWith("_k")) return `${raw} K`;
  return raw;
}

function numberToken(value: unknown): string | undefined {
  const match = text(value).match(/\d+(?:[.,]\d+)?/);
  return match?.[0]?.replace(",", ".");
}

function loadKg(key: string, value: unknown): number | undefined {
  const token = numberToken(value);
  if (!token) return undefined;
  const parsed = Number(token);
  if (!Number.isFinite(parsed)) return undefined;
  return key === "load_ton" ? parsed * 1000 : parsed;
}

function parsedRangeMaximums(sourceNormalized: Record<string, unknown>): readonly string[] {
  const ranges = objectValue(sourceNormalized.priceDrivers).ranges;
  if (!Array.isArray(ranges)) return [];
  return ranges
    .map((entry) => numberToken(objectValue(entry).max))
    .filter((entry): entry is string => Boolean(entry));
}

function mergeObject(target: Map<string, unknown>, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    if (value !== null && value !== undefined && value !== "") target.set(key, value);
  }
}

function sameSourceHttpsUrl(sourceWebsite: unknown, candidate: unknown): string | undefined {
  const website = optionalText(sourceWebsite);
  const value = optionalText(candidate);
  if (!website || !value) return undefined;
  try {
    const source = new URL(website);
    const asset = new URL(value, source);
    if (asset.protocol !== "https:") return undefined;
    const normalizeHost = (host: string) => host.toLowerCase().replace(/^www\./, "");
    if (normalizeHost(source.hostname) !== normalizeHost(asset.hostname)) return undefined;
    return asset.toString();
  } catch {
    return undefined;
  }
}

function technicalAttributes(
  specifications: Record<string, unknown>,
  canonicalAttributes: Record<string, unknown>,
  sourceNormalized: Record<string, unknown>,
  sourceRaw: Record<string, unknown>
): readonly PublicTechnicalAttribute[] {
  const combined = new Map<string, unknown>();
  mergeObject(combined, objectValue(sourceNormalized.priceDrivers));
  mergeObject(combined, objectValue(sourceNormalized.variantAttributes));
  mergeObject(combined, objectValue(sourceNormalized.specifications));
  mergeObject(combined, objectValue(sourceNormalized.attributes));
  mergeObject(combined, canonicalAttributes);
  mergeObject(combined, specifications);

  for (const key of EXTRA_SPECIFICATION_KEYS) {
    const value = sourceRaw[key];
    if (value !== null && value !== undefined && value !== "") combined.set(key, value);
  }

  // Historical title parsing occasionally emitted the same flow value as both
  // capacity_l and flow_l_h. Avoid turning that parser artefact into a public claim.
  if (combined.has("capacity_l") && combined.has("flow_l_h") && numberToken(combined.get("capacity_l")) === numberToken(combined.get("flow_l_h"))) {
    combined.delete("capacity_l");
  }

  // The title range parser can also mistake a range maximum for a standalone
  // product length (for example 260-400 mm -> length_mm=400). Preserve a real
  // source length when one exists, otherwise suppress the duplicate range maximum.
  const directSourceSpecifications = {
    ...jsonObject(sourceRaw.specifications_json),
    ...objectValue(sourceNormalized.specifications)
  };
  const lengthToken = numberToken(combined.get("length_mm"));
  if (!directSourceSpecifications.length_mm && lengthToken && parsedRangeMaximums(sourceNormalized).includes(lengthToken)) {
    combined.delete("length_mm");
  }

  // Prefer the source specification in kg when the title-derived tonne value is
  // mathematically equivalent, rather than exposing the same load twice.
  const titleLoadKg = loadKg("load_ton", combined.get("load_ton"));
  const specificationLoadKg = loadKg("μεγιστο_φορτιο_kg", combined.get("μεγιστο_φορτιο_kg"));
  if (titleLoadKg !== undefined && specificationLoadKg !== undefined && Math.abs(titleLoadKg - specificationLoadKg) < 0.5) {
    combined.delete("load_ton");
  }

  return [...combined.entries()]
    .filter(([key]) => !HIDDEN_ATTRIBUTE_KEYS.has(key))
    .map(([key, value]) => ({ key, label: humanizeKey(key), value: attributeValue(key, value) }))
    .filter((entry): entry is PublicTechnicalAttribute => Boolean(entry.value))
    .slice(0, 40);
}

function productDetailFromRow(row: ProductDetailRow): PublicProductDetail {
  const sourceNormalized = objectValue(row.source_normalized_payload);
  const sourceRaw = objectValue(row.source_raw_payload);
  const canonicalAttributes = {
    ...jsonObject(sourceRaw.variant_attributes_json),
    ...objectValue(row.variant_attributes)
  };
  const specifications = {
    ...jsonObject(sourceRaw.specifications_json),
    ...objectValue(row.specifications)
  };
  const description = optionalText(sourceNormalized.descriptionEl)
    ?? optionalText(sourceNormalized.description)
    ?? optionalText(sourceRaw.master_description_el)
    ?? optionalText(sourceRaw.description_el)
    ?? optionalText(sourceRaw.description);
  const variantGroupSize = Math.max(1, Math.trunc(numeric(sourceNormalized.variantGroupSize) ?? numeric(sourceRaw.variant_group_size) ?? 1));
  const sourceImageUrl = sameSourceHttpsUrl(
    row.source_website,
    row.source_image_url ?? sourceNormalized.imageUrl ?? sourceRaw.image_url
  );
  const manualUrl = sameSourceHttpsUrl(
    row.source_website,
    sourceNormalized.manualUrl ?? sourceNormalized.manual_url ?? sourceRaw.manual_url
  );

  return {
    canonicalVariantId: text(row.canonical_public_id),
    description,
    brand: optionalText(specifications.brand) ?? optionalText(sourceRaw.brand),
    model: optionalText(row.model) ?? optionalText(sourceRaw.model),
    supplierCode: optionalText(row.source_supplier_code) ?? optionalText(sourceRaw.supplier_code),
    sourceGtin: optionalText(sourceRaw.gtin13) ?? optionalText(sourceRaw.gtin) ?? optionalText(sourceNormalized.gtin13),
    sourceImageUrl,
    manualUrl,
    technicalAttributes: technicalAttributes(specifications, canonicalAttributes, sourceNormalized, sourceRaw),
    variantFamilyId: optionalText(sourceNormalized.variantFamilyId) ?? optionalText(sourceRaw.variant_family_id),
    variantGroupSize
  };
}

/**
 * Rich public product facts are projected from the canonical product plus its best
 * approved source-product identity link. Once an identity link is approved, the
 * storefront follows newer immutable snapshots with the same source/product key so
 * crawl enrichment can improve descriptions, images, manuals and specifications
 * without mutating the historical linked evidence row.
 */
export const getPublicProductDetail = cache(async (canonicalVariantId: string): Promise<PublicProductDetail | undefined> => {
  const canonicalId = canonicalVariantId.trim();
  if (!canonicalId || !productionDatabaseConfigured()) return undefined;

  try {
    const result = await getProductionPostgresRuntime().sqlPool.query<ProductDetailRow>(`
      SELECT cv.public_id AS canonical_public_id,cv.model,cv.variant_attributes,
             COALESCE(el.specifications,en.specifications,'{}'::jsonb) AS specifications,
             src.source_supplier_code,src.source_normalized_payload,src.source_raw_payload,
             src.source_image_url,src.source_website
      FROM canonical_variants cv
      JOIN markets m ON m.id=cv.market_id
      LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      LEFT JOIN LATERAL (
        SELECT latest.supplier_code AS source_supplier_code,
               latest.normalized_payload AS source_normalized_payload,
               latest.raw_payload AS source_raw_payload,
               latest.source_image_url,
               source.website AS source_website
        FROM catalog_source_product_links csl
        JOIN catalog_source_products linked ON linked.id=csl.source_product_id
        JOIN catalog_sources source ON source.id=linked.source_id AND source.active=true
        JOIN LATERAL (
          SELECT candidate.*
          FROM catalog_source_products candidate
          JOIN catalog_source_snapshots snapshot ON snapshot.id=candidate.snapshot_id
          WHERE candidate.source_id=linked.source_id
            AND candidate.source_product_key=linked.source_product_key
          ORDER BY snapshot.observed_at DESC NULLS LAST,candidate.created_at DESC,candidate.id DESC
          LIMIT 1
        ) latest ON true
        WHERE csl.canonical_variant_id=cv.id
          AND csl.link_status='approved'
        ORDER BY csl.confidence DESC,csl.updated_at DESC,csl.id DESC
        LIMIT 1
      ) src ON true
      WHERE cv.public_id=$1
        AND m.code='sparta'
        AND cv.active=true
        AND cv.suppressed=false
        AND cv.recalled=false
      LIMIT 1
    `, [canonicalId]);
    const row = result.rows[0];
    return row ? productDetailFromRow(row) : undefined;
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "storefront.product_detail_projection_failed",
      canonicalVariantId: canonicalId,
      message: error instanceof Error ? error.message : String(error)
    }));
    return undefined;
  }
});