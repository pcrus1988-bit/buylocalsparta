import { resolveCatalogColor, type ResolvedCatalogColor, type SqlRow } from "@buy-local-sparta/core";
import { cache } from "react";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type PublicProductVariantKind = "color" | "size" | "capacity" | "material" | "length" | "width" | "height" | "diameter" | "voltage" | "quantity" | "style" | "other";

export type PublicProductVariantColor = Readonly<Pick<ResolvedCatalogColor,
  "key" | "displayNameEl" | "displayNameEn" | "hex" | "ralApprox" | "rgb" | "hsl" | "cmyk" | "swatchKind"
>>;

export type PublicProductVariantAttribute = Readonly<{
  key: string;
  label: string;
  value: string;
  kind: PublicProductVariantKind;
  color?: PublicProductVariantColor;
}>;

export type PublicProductVariantOption = Readonly<{
  canonicalVariantId: string;
  slug: string;
  attributes: readonly PublicProductVariantAttribute[];
  available: boolean;
  fromPriceMinor?: number;
  imageSrc?: string;
  imageAlt?: string;
}>;

type VariantOptionRow = SqlRow & {
  canonical_public_id: string;
  slug: string;
  variant_attributes: unknown;
  from_price_minor: string | number | null;
  available: boolean;
  media_public_id: string | null;
  media_alt_text: string | null;
  source_image_candidate: string | null;
  source_website: string | null;
};

type VariantDimension = Readonly<{
  key: string;
  label: string;
  kind: PublicProductVariantKind;
}>;

const VARIANT_DIMENSIONS: readonly VariantDimension[] = [
  { key: "color", label: "Χρώμα", kind: "color" },
  { key: "colour", label: "Χρώμα", kind: "color" },
  { key: "color name", label: "Χρώμα", kind: "color" },
  { key: "colour name", label: "Χρώμα", kind: "color" },
  { key: "variant color", label: "Χρώμα", kind: "color" },
  { key: "χρωμα", label: "Χρώμα", kind: "color" },
  { key: "size", label: "Μέγεθος", kind: "size" },
  { key: "sizes", label: "Μέγεθος", kind: "size" },
  { key: "size name", label: "Μέγεθος", kind: "size" },
  { key: "μεγεθος", label: "Μέγεθος", kind: "size" },
  { key: "capacity", label: "Χωρητικότητα", kind: "capacity" },
  { key: "capacity l", label: "Χωρητικότητα", kind: "capacity" },
  { key: "volume", label: "Χωρητικότητα", kind: "capacity" },
  { key: "χωρητικοτητα", label: "Χωρητικότητα", kind: "capacity" },
  { key: "material", label: "Υλικό", kind: "material" },
  { key: "υλικο", label: "Υλικό", kind: "material" },
  { key: "length", label: "Μήκος", kind: "length" },
  { key: "length cm", label: "Μήκος", kind: "length" },
  { key: "length mm", label: "Μήκος", kind: "length" },
  { key: "μηκος", label: "Μήκος", kind: "length" },
  { key: "width", label: "Πλάτος", kind: "width" },
  { key: "width cm", label: "Πλάτος", kind: "width" },
  { key: "width mm", label: "Πλάτος", kind: "width" },
  { key: "πλατος", label: "Πλάτος", kind: "width" },
  { key: "height", label: "Ύψος", kind: "height" },
  { key: "height cm", label: "Ύψος", kind: "height" },
  { key: "height mm", label: "Ύψος", kind: "height" },
  { key: "υψος", label: "Ύψος", kind: "height" },
  { key: "diameter", label: "Διάμετρος", kind: "diameter" },
  { key: "diameter mm", label: "Διάμετρος", kind: "diameter" },
  { key: "διαμετρος", label: "Διάμετρος", kind: "diameter" },
  { key: "voltage", label: "Τάση", kind: "voltage" },
  { key: "voltage v", label: "Τάση", kind: "voltage" },
  { key: "voltage family", label: "Τάση", kind: "voltage" },
  { key: "ταση", label: "Τάση", kind: "voltage" },
  { key: "pack qty", label: "Ποσότητα", kind: "quantity" },
  { key: "quantity", label: "Ποσότητα", kind: "quantity" },
  { key: "ποσοτητα", label: "Ποσότητα", kind: "quantity" },
  { key: "style", label: "Στυλ", kind: "style" },
  { key: "pattern", label: "Σχέδιο", kind: "style" },
  { key: "finish", label: "Φινίρισμα", kind: "style" },
  { key: "σχεδιο", label: "Σχέδιο", kind: "style" }
] as const;

const FALLBACK_LABEL_KEYS = new Set(["variant label", "variantlabel", "option label", "option", "option name"]);

function objectValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
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

function dimensionForKey(key: string): VariantDimension | undefined {
  const normalized = normalizeKey(key);
  return VARIANT_DIMENSIONS.find((dimension) => dimension.key === normalized);
}

function colorAttribute(key: string, label: string, rawValue: string): PublicProductVariantAttribute {
  const resolved = resolveCatalogColor(rawValue);
  if (!resolved) return { key, label, value: rawValue, kind: "color" };
  const { sourceValue: _sourceValue, matchedAlias: _matchedAlias, ...publicColor } = resolved;
  return {
    key,
    label,
    value: resolved.displayNameEl,
    kind: "color",
    color: publicColor
  };
}

function variantAttributes(value: unknown): readonly PublicProductVariantAttribute[] {
  const entries = Object.entries(objectValue(value));
  const publicAttributes = entries
    .map(([rawKey, rawValue]) => {
      const value = displayValue(rawValue);
      if (!value) return undefined;
      const dimension = dimensionForKey(rawKey);
      if (!dimension) return undefined;
      const key = normalizeKey(rawKey).replaceAll(" ", "_");
      return dimension.kind === "color"
        ? colorAttribute(key, dimension.label, value)
        : { key, label: dimension.label, value, kind: dimension.kind } satisfies PublicProductVariantAttribute;
    })
    .filter((entry): entry is PublicProductVariantAttribute => Boolean(entry));

  if (publicAttributes.length) {
    const seen = new Set<string>();
    return publicAttributes.filter((attribute) => {
      const identity = `${attribute.kind}:${attribute.value.toLocaleLowerCase("el")}`;
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    }).slice(0, 5);
  }

  // Some supplier feeds only expose a human variant label plus internal codes.
  // Use that label only when it is genuinely customer-facing; never leak VariantCode,
  // SupplierCode, SKU, GTIN or other identifiers into the selector.
  for (const [rawKey, rawValue] of entries) {
    if (!FALLBACK_LABEL_KEYS.has(normalizeKey(rawKey))) continue;
    const fallback = displayValue(rawValue);
    if (!fallback) continue;
    const color = resolveCatalogColor(fallback);
    if (color) {
      const { sourceValue: _sourceValue, matchedAlias: _matchedAlias, ...publicColor } = color;
      return [{ key: "color", label: "Χρώμα", value: color.displayNameEl, kind: "color", color: publicColor }];
    }
    if (/^[A-Z0-9][A-Z0-9._/-]{3,}$/i.test(fallback) && /\d/.test(fallback)) continue;
    return [{ key: "choice", label: "Επιλογή", value: fallback, kind: "other" }];
  }

  return [];
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
    const normalizeHost = (host: string) => host.toLowerCase().replace(/^www\./, "");
    return image.protocol === "https:" && normalizeHost(image.hostname) === normalizeHost(source.hostname);
  } catch {
    return false;
  }
}

function variantImage(row: VariantOptionRow): Pick<PublicProductVariantOption, "imageSrc" | "imageAlt"> {
  if (row.media_public_id) {
    return {
      imageSrc: `/api/media/${encodeURIComponent(String(row.media_public_id))}`,
      imageAlt: row.media_alt_text?.trim() || undefined
    };
  }
  if (safeSameSourceImage(row.source_website, row.source_image_candidate)) {
    return { imageSrc: `/api/catalog-source-image/${encodeURIComponent(String(row.canonical_public_id))}` };
  }
  return {};
}

/**
 * Read-only family projection for the product-page variant chooser.
 *
 * This deliberately does not invoke Fair Vendor Assignment for sibling variants:
 * merely viewing a selector must not create sticky assignments or exposure events
 * for products the customer has not chosen. Sibling availability and optional
 * from-price remain read-only hints; selecting a sibling navigates to its canonical
 * product page, where the normal sticky assigned offer and exact purchase state are
 * resolved. Variant images likewise come only from already approved governed media
 * or the existing same-source image proxy.
 */
export const getPublicProductVariantOptions = cache(async (
  canonicalVariantId: string
): Promise<readonly PublicProductVariantOption[]> => {
  const canonicalId = canonicalVariantId.trim();
  if (!canonicalId || !productionDatabaseConfigured()) return [];

  try {
    const result = await getProductionPostgresRuntime().nativePool.query<VariantOptionRow>(`
      WITH current_variant AS (
        SELECT cv.family_id
        FROM canonical_variants cv
        JOIN markets m ON m.id=cv.market_id
        WHERE cv.public_id=$1
          AND m.code='sparta'
          AND cv.active=true
          AND cv.suppressed=false
          AND cv.recalled=false
        LIMIT 1
      )
      SELECT sibling.public_id AS canonical_public_id,
             sibling.slug,
             sibling.variant_attributes,
             eligible.from_price_minor,
             (eligible.from_price_minor IS NOT NULL) AS available,
             governed_media.media_public_id,
             governed_media.media_alt_text,
             source_image.source_image_candidate,
             source_image.source_website
      FROM canonical_variants sibling
      JOIN markets m ON m.id=sibling.market_id
      JOIN current_variant current
        ON current.family_id IS NOT NULL
       AND sibling.family_id=current.family_id
      LEFT JOIN LATERAL (
        SELECT MIN(vo.customer_price_minor)::bigint AS from_price_minor
        FROM vendor_offers vo
        JOIN vendor_businesses v ON v.id=vo.vendor_id
        JOIN vendor_locations l ON l.id=vo.location_id
        JOIN inventory_balances ib ON ib.offer_id=vo.id
        WHERE vo.canonical_variant_id=sibling.id
          AND vo.status='approved'
          AND vo.customer_price_minor>0
          AND v.status='active'
          AND l.active=true
          AND 'pickup'::fulfilment_mode=ANY(vo.fulfilment_modes)
          AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
          AND GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)>=1
          AND ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds)>now()
      ) eligible ON true
      LEFT JOIN LATERAL (
        SELECT pm.public_id AS media_public_id,
               pm.alt_text AS media_alt_text
        FROM product_media pm
        WHERE pm.canonical_variant_id=sibling.id
          AND pm.kind='image'
          AND pm.scan_status='clean'
          AND pm.rights_status='approved'
          AND pm.moderation_status='approved'
          AND pm.object_key IS NOT NULL
          AND pm.content_type IN ('image/jpeg','image/png','image/webp')
        ORDER BY CASE WHEN pm.vendor_id IS NULL THEN 0 ELSE 1 END,
                 pm.reviewed_at DESC NULLS LAST,
                 pm.created_at DESC,
                 pm.public_id
        LIMIT 1
      ) governed_media ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(
                 latest.source_image_url,
                 latest.normalized_payload->>'imageUrl',
                 latest.raw_payload->>'image_url'
               ) AS source_image_candidate,
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
        WHERE csl.canonical_variant_id=sibling.id
          AND csl.link_status='approved'
        ORDER BY csl.confidence DESC,csl.updated_at DESC,csl.id DESC
        LIMIT 1
      ) source_image ON true
      WHERE m.code='sparta'
        AND sibling.active=true
        AND sibling.suppressed=false
        AND sibling.recalled=false
      ORDER BY sibling.slug
      LIMIT 100
    `, [canonicalId]);

    return result.rows.map((row) => ({
      canonicalVariantId: String(row.canonical_public_id),
      slug: String(row.slug),
      attributes: variantAttributes(row.variant_attributes),
      available: Boolean(row.available),
      fromPriceMinor: safePriceMinor(row.from_price_minor),
      ...variantImage(row)
    }));
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "storefront.product_variant_options_failed",
      canonicalVariantId: canonicalId,
      message: error instanceof Error ? error.message : String(error)
    }));
    return [];
  }
});
