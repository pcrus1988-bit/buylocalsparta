import { resolveCatalogColor, type SqlRow } from "@buy-local-sparta/core";
import { cache } from "react";
import type {
  PublicProductVariantAttribute,
  PublicProductVariantKind,
  PublicProductVariantOption,
} from "./public-product-variants";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type PublicSemanticVariantPresentation = Readonly<{
  options: readonly PublicProductVariantOption[];
  varyingKeys: ReadonlySet<string>;
  title: string;
}>;

type SemanticVariantRow = SqlRow & {
  canonical_public_id: string;
  slug: string;
  title: string;
  brand: string | null;
  category_code: string;
  variant_attributes: unknown;
  source_normalized_payload: unknown;
  source_raw_payload: unknown;
  from_price_minor: string | number | null;
  available: boolean;
  media_public_id: string | null;
  media_alt_text: string | null;
  source_image_candidate: string | null;
  source_website: string | null;
};

type VariantDimension = Readonly<{
  label: string;
  kind: PublicProductVariantKind;
  unit?: string;
}>;

/**
 * Conservative source-family fallback dimensions.
 *
 * Canonical product families remain the primary variant authority. This list is
 * only used when older imported catalogue data split a genuine product range into
 * separate canonical families. Compatibility/platform/voltage signals are
 * intentionally absent: sharing a battery system or voltage is never sufficient
 * evidence that two products are variants of one another.
 */
const SAFE_SOURCE_VARIANT_DIMENSIONS: Readonly<Record<string, VariantDimension>> = {
  color: { label: "Χρώμα", kind: "color" },
  colour: { label: "Χρώμα", kind: "color" },
  size: { label: "Μέγεθος", kind: "size" },
  sizes: { label: "Μέγεθος", kind: "size" },
  capacity: { label: "Χωρητικότητα", kind: "capacity" },
  capacity_l: { label: "Χωρητικότητα", kind: "capacity", unit: "L" },
  capacity_ml: { label: "Χωρητικότητα", kind: "capacity", unit: "ml" },
  battery_capacity_ah: { label: "Χωρητικότητα", kind: "capacity", unit: "Ah" },
  volume: { label: "Χωρητικότητα", kind: "capacity" },
  volume_l: { label: "Χωρητικότητα", kind: "capacity", unit: "L" },
  volume_ml: { label: "Χωρητικότητα", kind: "capacity", unit: "ml" },
  material: { label: "Υλικό", kind: "material" },
  length: { label: "Μήκος", kind: "length" },
  length_m: { label: "Μήκος", kind: "length", unit: "m" },
  length_cm: { label: "Μήκος", kind: "length", unit: "cm" },
  length_mm: { label: "Μήκος", kind: "length", unit: "mm" },
  width: { label: "Πλάτος", kind: "width" },
  width_m: { label: "Πλάτος", kind: "width", unit: "m" },
  width_cm: { label: "Πλάτος", kind: "width", unit: "cm" },
  width_mm: { label: "Πλάτος", kind: "width", unit: "mm" },
  height: { label: "Ύψος", kind: "height" },
  height_m: { label: "Ύψος", kind: "height", unit: "m" },
  height_cm: { label: "Ύψος", kind: "height", unit: "cm" },
  height_mm: { label: "Ύψος", kind: "height", unit: "mm" },
  diameter: { label: "Διάμετρος", kind: "diameter" },
  diameter_cm: { label: "Διάμετρος", kind: "diameter", unit: "cm" },
  diameter_mm: { label: "Διάμετρος", kind: "diameter", unit: "mm" },
  weight: { label: "Βάρος", kind: "other" },
  weight_g: { label: "Βάρος", kind: "other", unit: "g" },
  weight_kg: { label: "Βάρος", kind: "other", unit: "kg" },
  net_weight_kg: { label: "Βάρος", kind: "other", unit: "kg" },
  pack_qty: { label: "Ποσότητα", kind: "quantity" },
  quantity: { label: "Ποσότητα", kind: "quantity" },
  pieces: { label: "Ποσότητα", kind: "quantity" },
  style: { label: "Στυλ", kind: "style" },
  pattern: { label: "Σχέδιο", kind: "style" },
  finish: { label: "Φινίρισμα", kind: "style" },
};

const COMPATIBILITY_SIGNAL_KEYS = new Set([
  "platform",
  "compatible_models",
  "compatible_model",
  "compatible_brands",
  "compatible_brand",
  "compatible_platforms",
  "compatible_platform",
  "compatibility",
  "compatibility_type",
  "compatibility_note",
  "compatibility_notes",
  "compatibility_claims_json",
  "compatibility_relationship_json",
  "compatibility_interface_json",
  "suitable_for",
  "suitable_for_model",
  "suitable_for_models",
  "supported_models",
  "supported_platforms",
  "works_with",
  "works_with_models",
  "designed_for",
  "explicit_fitment_models",
  "explicit_compatible_models",
  "explicit_compatible_models_all",
  "explicit_compatible_models_validated",
  "external_compatible_models",
  "platform_compatible_models",
  "reverse_compatible_accessories",
]);

function objectValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function normalizedKey(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizedValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el")
    .replace(/[^\p{L}\p{N}._/-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function displayValue(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (Array.isArray(value)) {
    const values = value.map(displayValue).filter((entry): entry is string => Boolean(entry));
    return values.length ? [...new Set(values)].join(" · ") : undefined;
  }
  if (typeof value === "boolean") return value ? "Ναι" : "Όχι";
  if (typeof value === "object") return undefined;
  const result = String(value).trim();
  return result || undefined;
}

function withUnit(value: string, unit: string | undefined): string {
  if (!unit) return value;
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return new RegExp(`(?:^|\\s)${unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i").test(trimmed)
    ? trimmed
    : `${trimmed} ${unit}`;
}

function colorAttribute(value: string): PublicProductVariantAttribute {
  const resolved = resolveCatalogColor(value);
  if (!resolved) return { key: "color", label: "Χρώμα", value, kind: "color" };
  const { sourceValue: _sourceValue, matchedAlias: _matchedAlias, ...publicColor } = resolved;
  return {
    key: "color",
    label: "Χρώμα",
    value: resolved.displayNameEl,
    kind: "color",
    color: publicColor,
  };
}

function socketSizeFromTitle(title: string): string | undefined {
  const size = title.match(/\bNo\.?\s*(\d+(?:[.,]\d+)?)\s*mm\b/i)?.[1]?.replace(",", ".");
  if (!size) return undefined;
  const drive = title.match(/\b(\d\s*\/\s*\d)\s*(?:\"|″)/u)?.[1]?.replace(/\s+/g, "");
  return drive ? `${drive}″ · ${size} mm` : `${size} mm`;
}

function mergedSourceAttributes(row: SemanticVariantRow): Record<string, unknown> {
  const normalized = objectValue(row.source_normalized_payload);
  const raw = objectValue(row.source_raw_payload);
  return {
    ...objectValue(raw.variant_attributes_json),
    ...objectValue(normalized.variantAttributes),
    ...objectValue(normalized.priceDrivers),
    ...objectValue(row.variant_attributes),
  };
}

function variantAttributes(row: SemanticVariantRow): readonly PublicProductVariantAttribute[] {
  const attributes: PublicProductVariantAttribute[] = [];
  const socketSize = socketSizeFromTitle(row.title);
  if (socketSize) attributes.push({ key: "size", label: "Μέγεθος", value: socketSize, kind: "size" });

  for (const [rawKey, rawValue] of Object.entries(mergedSourceAttributes(row))) {
    const key = normalizedKey(rawKey);
    const dimension = SAFE_SOURCE_VARIANT_DIMENSIONS[key];
    const value = displayValue(rawValue);
    if (!dimension || !value) continue;
    if (socketSize && (dimension.kind === "size" || dimension.kind === "length")) continue;
    if (dimension.kind === "color") {
      if (!attributes.some((entry) => entry.kind === "color")) attributes.push(colorAttribute(value));
      continue;
    }
    attributes.push({ key, label: dimension.label, value: withUnit(value, dimension.unit), kind: dimension.kind });
  }

  const seen = new Set<string>();
  return attributes.filter((attribute) => {
    const identity = `${attribute.kind}:${normalizedValue(attribute.value)}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  }).slice(0, 5);
}

function meaningful(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.some(meaningful);
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).some(meaningful);
  const text = String(value).trim().toLocaleLowerCase("el");
  return Boolean(text && text !== "false" && text !== "none" && text !== "null" && text !== "[]" && text !== "{}");
}

function objectHasCompatibilitySignal(value: Record<string, unknown>): boolean {
  return Object.entries(value).some(([rawKey, rawValue]) => {
    if (!meaningful(rawValue)) return false;
    const key = normalizedKey(rawKey);
    return COMPATIBILITY_SIGNAL_KEYS.has(key)
      || key.startsWith("compatible_")
      || key.startsWith("compatibility_")
      || key.startsWith("suitable_for")
      || key.startsWith("supported_")
      || key.startsWith("works_with")
      || key.startsWith("designed_for")
      || key.startsWith("explicit_fitment")
      || key.startsWith("explicit_compatible")
      || key.startsWith("external_compatible")
      || key.startsWith("platform_compatible")
      || key.includes("καταλληλο_για")
      || key.includes("συμβατ");
  });
}

function titleLooksFitmentDriven(title: string): boolean {
  return /(?:\bγια\b|\bfor\b)\s+(?:[\p{L}]{1,8}\s*)?[A-ZΑ-Ω]{1,8}[- ]?\d{3,6}/iu.test(title);
}

function sourceFamilyIsCompatibilityDriven(rows: readonly SemanticVariantRow[]): boolean {
  return rows.some((row) => {
    const normalized = objectValue(row.source_normalized_payload);
    const raw = objectValue(row.source_raw_payload);
    return objectHasCompatibilitySignal(objectValue(normalized.priceDrivers))
      || objectHasCompatibilitySignal(normalized)
      || objectHasCompatibilitySignal(raw)
      || titleLooksFitmentDriven(row.title);
  });
}

function safePriceMinor(value: string | number | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function safeSameSourceImage(sourceWebsite: string | null, sourceImage: string | null): boolean {
  if (!sourceWebsite || !sourceImage) return false;
  try {
    const source = new URL(sourceWebsite);
    const image = new URL(sourceImage, source);
    const host = (value: string) => value.toLowerCase().replace(/^www\./, "");
    return image.protocol === "https:" && host(image.hostname) === host(source.hostname);
  } catch {
    return false;
  }
}

function imageForRow(row: SemanticVariantRow): Pick<PublicProductVariantOption, "imageSrc" | "imageAlt"> {
  if (row.media_public_id) {
    return {
      imageSrc: `/api/media/${encodeURIComponent(String(row.media_public_id))}`,
      imageAlt: row.media_alt_text?.trim() || row.title,
    };
  }
  if (safeSameSourceImage(row.source_website, row.source_image_candidate)) {
    return {
      imageSrc: `/api/catalog-source-image/${encodeURIComponent(String(row.canonical_public_id))}`,
      imageAlt: row.title,
    };
  }
  return { imageAlt: row.title };
}

function presentation(options: readonly PublicProductVariantOption[]): PublicSemanticVariantPresentation {
  const values = new Map<PublicProductVariantKind, Set<string>>();
  for (const option of options) {
    for (const attribute of option.attributes) {
      const group = values.get(attribute.kind) ?? new Set<string>();
      group.add(normalizedValue(attribute.value));
      values.set(attribute.kind, group);
    }
  }

  const varyingKinds = new Set(
    [...values.entries()].filter(([, group]) => group.size > 1).map(([kind]) => kind),
  );
  const meaningfulOptions = options.filter((option) => option.attributes.some((attribute) => varyingKinds.has(attribute.kind)));
  if (meaningfulOptions.length < 2) return emptyPresentation();

  const varyingKeys = new Set(
    meaningfulOptions.flatMap((option) => option.attributes
      .filter((attribute) => varyingKinds.has(attribute.kind))
      .map((attribute) => attribute.key)),
  );
  const labels = [...new Set(meaningfulOptions.flatMap((option) => option.attributes
    .filter((attribute) => varyingKinds.has(attribute.kind))
    .map((attribute) => attribute.label)))];

  return {
    options: meaningfulOptions,
    varyingKeys,
    title: labels.length === 1 ? labels[0] : "Επιλογή παραλλαγής",
  };
}

function emptyPresentation(): PublicSemanticVariantPresentation {
  return { options: [], varyingKeys: new Set<string>(), title: "Επιλογή παραλλαγής" };
}

/**
 * Read-only semantic fallback for the live product page.
 *
 * It is intentionally independent of Fair Vendor Assignment: reading a sibling
 * choice must never assign exposure to a vendor. Exact price/stock are resolved
 * only after the customer navigates to that canonical product page.
 */
export const getPublicSemanticSourceVariantPresentation = cache(async (
  canonicalVariantId: string,
): Promise<PublicSemanticVariantPresentation> => {
  const canonicalId = canonicalVariantId.trim();
  if (!canonicalId || !productionDatabaseConfigured()) return emptyPresentation();

  try {
    const result = await getProductionPostgresRuntime().nativePool.query<SemanticVariantRow>(`
      WITH current_variant AS (
        SELECT cv.id,cv.market_id,cv.category_id,cv.brand_id
        FROM canonical_variants cv
        JOIN markets market ON market.id=cv.market_id AND market.code='sparta'
        WHERE cv.public_id=$1
          AND cv.active=true
          AND cv.suppressed=false
          AND cv.recalled=false
        LIMIT 1
      ),
      current_source_family AS (
        SELECT linked.source_id,
               COALESCE(
                 NULLIF(linked.normalized_payload->>'variantFamilyId',''),
                 NULLIF(linked.raw_payload->>'variant_family_id','')
               ) AS variant_family_id
        FROM current_variant current
        JOIN catalog_source_product_links csl ON csl.canonical_variant_id=current.id
        JOIN catalog_source_products linked ON linked.id=csl.source_product_id
        WHERE csl.link_status='approved'
          AND COALESCE(
                NULLIF(linked.normalized_payload->>'variantFamilyId',''),
                NULLIF(linked.raw_payload->>'variant_family_id','')
              ) IS NOT NULL
        ORDER BY csl.confidence DESC,csl.updated_at DESC,csl.id DESC
        LIMIT 1
      )
      SELECT sibling.public_id AS canonical_public_id,
             sibling.slug,
             COALESCE(el.title,en.title,sibling.model,sibling.slug) AS title,
             brand.name AS brand,
             category.code AS category_code,
             sibling.variant_attributes,
             source_family.normalized_payload AS source_normalized_payload,
             source_family.raw_payload AS source_raw_payload,
             eligible.from_price_minor,
             (eligible.from_price_minor IS NOT NULL) AS available,
             governed_media.media_public_id,
             governed_media.media_alt_text,
             COALESCE(
               source_family.source_image_url,
               source_family.normalized_payload->>'imageUrl',
               source_family.raw_payload->>'image_url'
             ) AS source_image_candidate,
             source_family.source_website
      FROM current_variant current
      JOIN current_source_family source_current ON true
      JOIN canonical_variants sibling
        ON sibling.market_id=current.market_id
       AND sibling.category_id=current.category_id
       AND (current.brand_id IS NULL OR sibling.brand_id=current.brand_id)
      JOIN categories category ON category.id=sibling.category_id
      LEFT JOIN brands brand ON brand.id=sibling.brand_id
      LEFT JOIN product_translations el ON el.canonical_variant_id=sibling.id AND el.locale='el'
      LEFT JOIN product_translations en ON en.canonical_variant_id=sibling.id AND en.locale='en'
      JOIN LATERAL (
        SELECT linked.normalized_payload,
               linked.raw_payload,
               linked.source_image_url,
               source.website AS source_website
        FROM catalog_source_product_links csl
        JOIN catalog_source_products linked ON linked.id=csl.source_product_id
        JOIN catalog_sources source ON source.id=linked.source_id AND source.active=true
        WHERE csl.canonical_variant_id=sibling.id
          AND csl.link_status='approved'
          AND linked.source_id=source_current.source_id
          AND COALESCE(
                NULLIF(linked.normalized_payload->>'variantFamilyId',''),
                NULLIF(linked.raw_payload->>'variant_family_id','')
              )=source_current.variant_family_id
        ORDER BY csl.confidence DESC,csl.updated_at DESC,csl.id DESC
        LIMIT 1
      ) source_family ON true
      LEFT JOIN LATERAL (
        SELECT MIN(vo.customer_price_minor)::bigint AS from_price_minor
        FROM vendor_offers vo
        JOIN vendor_businesses vendor ON vendor.id=vo.vendor_id
        JOIN vendor_locations location ON location.id=vo.location_id
        JOIN inventory_balances inventory ON inventory.offer_id=vo.id
        WHERE vo.canonical_variant_id=sibling.id
          AND vo.status='approved'
          AND vo.customer_price_minor>0
          AND vendor.status='active'
          AND location.active=true
          AND 'pickup'::fulfilment_mode=ANY(vo.fulfilment_modes)
          AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
          AND GREATEST(0,inventory.on_hand-inventory.active_reservations-inventory.safety_stock-inventory.blocked)>=1
          AND inventory.stock_confirmed_at + make_interval(secs=>inventory.freshness_ttl_seconds)>now()
      ) eligible ON true
      LEFT JOIN LATERAL (
        SELECT media.public_id AS media_public_id,
               media.alt_text AS media_alt_text
        FROM product_media media
        WHERE media.canonical_variant_id=sibling.id
          AND media.kind='image'
          AND media.scan_status='clean'
          AND media.rights_status='approved'
          AND media.moderation_status='approved'
          AND media.object_key IS NOT NULL
          AND media.content_type IN ('image/jpeg','image/png','image/webp')
        ORDER BY CASE WHEN media.vendor_id IS NULL THEN 0 ELSE 1 END,
                 media.reviewed_at DESC NULLS LAST,
                 media.created_at DESC,
                 media.public_id
        LIMIT 1
      ) governed_media ON true
      WHERE sibling.active=true
        AND sibling.suppressed=false
        AND sibling.recalled=false
      ORDER BY CASE WHEN sibling.public_id=$1 THEN 0 ELSE 1 END,sibling.slug
      LIMIT 100
    `, [canonicalId]);

    if (result.rows.length < 2 || sourceFamilyIsCompatibilityDriven(result.rows)) return emptyPresentation();

    const options = result.rows.slice(0, 24).map((row) => ({
      canonicalVariantId: String(row.canonical_public_id),
      slug: String(row.slug),
      attributes: variantAttributes(row),
      available: Boolean(row.available),
      fromPriceMinor: safePriceMinor(row.from_price_minor),
      ...imageForRow(row),
    } satisfies PublicProductVariantOption));

    return presentation(options);
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "storefront.semantic_source_variant_options_failed",
      canonicalVariantId: canonicalId,
      message: error instanceof Error ? error.message : String(error),
    }));
    return emptyPresentation();
  }
});
