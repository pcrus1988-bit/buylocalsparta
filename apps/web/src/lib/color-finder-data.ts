import { formatMoney, money, type SqlRow } from "@buy-local-sparta/core";
import { unstable_cache } from "next/cache";
import { isPublicCatalogueTitle } from "./public-data-integrity";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import {
  inferColorFinish,
  inferColorProductType,
  resolveCatalogColor,
  type ColorFinderProduct,
  type ColorFinish,
  type ColorProductType
} from "./color-finder";

const CACHE_SECONDS = 900;
const MAX_CANDIDATES = 2_000;

type ColorFinderCandidateRow = SqlRow & Readonly<{
  canonical_public_id: string;
  slug: string;
  title: string;
  brand_name: string | null;
  raw_color: string | null;
  customer_price_minor: number | string;
  profile_brand_name: string | null;
  shade_code: string | null;
  brand_shade_name: string | null;
  color_family: string | null;
  color_detail: string | null;
  profile_finish: string | null;
  profile_product_type: string | null;
  canonical_hex: string | null;
  match_precision: string | null;
  confidence: number | string | null;
}>;

async function loadColorFinderProductsUncached(): Promise<readonly ColorFinderProduct[]> {
  if (!productionDatabaseConfigured()) return [];

  const result = await getProductionPostgresRuntime().nativePool.query<ColorFinderCandidateRow>(`
    WITH live_nail_variants AS MATERIALIZED (
      SELECT DISTINCT ON (cv.id)
        cv.id AS canonical_variant_id,
        cv.public_id AS canonical_public_id,
        cv.slug,
        cv.variant_attributes,
        COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
        b.name AS brand_name,
        NULLIF(btrim(COALESCE(
          el.specifications->>'color',
          en.specifications->>'color',
          cv.variant_attributes->>'color',
          ''
        )), '') AS raw_color,
        vo.customer_price_minor
      FROM public.dropship_supplier_offers dso
      JOIN public.dropship_suppliers ds
        ON ds.id=dso.supplier_id
       AND ds.active=true
       AND ds.api_authoritative_availability=true
      JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
      JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
      JOIN public.markets m ON m.id=cv.market_id AND m.code='sparta'
      JOIN public.categories c ON c.id=cv.category_id AND c.code='nail-care-colour'
      JOIN public.vendor_businesses v ON v.id=vo.vendor_id AND v.status='active'
      JOIN public.vendor_locations l ON l.id=vo.location_id AND l.active=true
      LEFT JOIN public.product_families pf ON pf.id=cv.family_id
      LEFT JOIN public.brands b ON b.id=COALESCE(cv.brand_id,pf.brand_id)
      LEFT JOIN public.product_translations el
        ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN public.product_translations en
        ON en.canonical_variant_id=cv.id AND en.locale='en'
      WHERE dso.active=true
        AND dso.cached_available=true
        AND COALESCE(dso.cached_quantity,0)>=1
        AND dso.availability_expires_at IS NOT NULL
        AND dso.availability_expires_at>now()
        AND vo.status='approved'
        AND vo.merchant_visible=true
        AND vo.merchant_pause_active=false
        AND vo.customer_price_minor>0
        AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
        AND COALESCE(cv.commerce_channel,'normal')='normal'
        AND cv.active=true
        AND cv.suppressed=false
        AND cv.recalled=false
        AND bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id)
      ORDER BY
        cv.id,
        vo.customer_price_minor ASC,
        dso.availability_checked_at DESC NULLS LAST,
        vo.updated_at DESC,
        vo.public_id
      LIMIT $1
    )
    SELECT
      candidate.canonical_public_id,
      candidate.slug,
      candidate.title,
      candidate.brand_name,
      candidate.raw_color,
      candidate.customer_price_minor,
      pcp.brand_name AS profile_brand_name,
      pcp.shade_code,
      pcp.brand_shade_name,
      pcp.color_family,
      pcp.color_detail,
      pcp.finish AS profile_finish,
      pcp.product_type AS profile_product_type,
      pcp.canonical_hex,
      pcp.match_precision,
      pcp.confidence
    FROM live_nail_variants candidate
    LEFT JOIN public.product_color_profiles pcp
      ON pcp.canonical_variant_id=candidate.canonical_variant_id
    ORDER BY candidate.customer_price_minor,candidate.canonical_public_id
  `, [MAX_CANDIDATES]);

  return result.rows.flatMap((row) => {
    const id = optionalText(row.canonical_public_id);
    const slug = optionalText(row.slug);
    const title = optionalText(row.title);
    const rawColor = optionalText(row.raw_color);
    const priceMinor = positiveInteger(row.customer_price_minor);

    if (!id || !slug || !title || !priceMinor || !isPublicCatalogueTitle(title)) return [];

    const storedHex = optionalText(row.canonical_hex);
    const storedResolved = storedHex ? resolveCatalogColor({ color: storedHex }) : undefined;
    const resolved = storedResolved ?? resolveCatalogColor({ color: rawColor, title });
    if (!resolved) return [];

    const storedPrecision = storedResolved ? validPrecision(row.match_precision) : undefined;
    const storedConfidence = storedResolved ? boundedConfidence(row.confidence) : undefined;
    const fallbackPrecision = rawColor ? "canonicalized" as const : "family_estimate" as const;
    const fallbackConfidence = rawColor ? 0.68 : 0.42;
    const productText = [
      title,
      rawColor,
      optionalText(row.color_detail),
      optionalText(row.brand_shade_name)
    ].filter(Boolean).join(" ");

    return [{
      id,
      slug,
      title,
      brand: optionalText(row.profile_brand_name) ?? optionalText(row.brand_name),
      brandShade: optionalText(row.brand_shade_name) ?? rawColor,
      shadeCode: optionalText(row.shade_code),
      colorDetail: optionalText(row.color_detail) ?? optionalText(row.color_family),
      profilePrecision: storedPrecision ?? fallbackPrecision,
      profileConfidence: storedConfidence ?? fallbackConfidence,
      colorHex: resolved.hex,
      colorLabel: optionalText(row.color_detail) ?? optionalText(row.color_family) ?? resolved.label,
      finish: validFinish(row.profile_finish) ?? inferColorFinish(productText),
      productType: validProductType(row.profile_product_type) ?? inferColorProductType(productText),
      priceMinor,
      price: formatMoney(money(priceMinor, "EUR")),
      imageSrc: `/api/catalog-source-image/${encodeURIComponent(id)}`,
      mediaAlt: title
    } satisfies ColorFinderProduct];
  });
}

export const getColorFinderProducts = unstable_cache(
  loadColorFinderProductsUncached,
  ["color-finder-authoritative-live-nails-v2"],
  { revalidate: CACHE_SECONDS }
);

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function boundedConfidence(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : undefined;
}

function validFinish(value: unknown): ColorFinish | undefined {
  return ["cream","pearly","shimmer","metallic","glitter","matte","jelly","classic"].includes(String(value))
    ? String(value) as ColorFinish
    : undefined;
}

function validProductType(value: unknown): ColorProductType | undefined {
  return ["gel","regular","other"].includes(String(value))
    ? String(value) as ColorProductType
    : undefined;
}

function validPrecision(value: unknown): ColorFinderProduct["profilePrecision"] {
  return ["exact","canonicalized","family_estimate"].includes(String(value))
    ? String(value) as NonNullable<ColorFinderProduct["profilePrecision"]>
    : undefined;
}
