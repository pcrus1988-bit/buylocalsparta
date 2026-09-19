import { formatMoney, money, type SqlRow } from "@buy-local-sparta/core";
import { unstable_cache } from "next/cache";
import { isPublicCatalogueTitle } from "./public-data-integrity";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import {
  normalizeHex,
  type ColorFinderProduct,
  type ColorFinish,
  type ColorProductType
} from "./color-finder";

const CACHE_SECONDS = 900;
const MAX_CANDIDATES = 3_000;

type ColorFinderReadRow = SqlRow & Readonly<{
  canonical_public_id: string;
  slug: string;
  title: string;
  storefront_brand_name: string | null;
  storefront_color: string | null;
  min_price_minor: number | string;
  eligible_offer_count: number | string;
  profile_brand_name: string | null;
  shade_code: string | null;
  brand_shade_name: string | null;
  color_family: string | null;
  color_detail: string | null;
  finish: string;
  product_type: string;
  canonical_hex: string;
  match_precision: string;
  confidence: number | string;
}>;

async function loadColorFinderProductsUncached(): Promise<readonly ColorFinderProduct[]> {
  if (!productionDatabaseConfigured()) return [];

  const result = await getProductionPostgresRuntime().nativePool.query<ColorFinderReadRow>(`
    SELECT
      rm.canonical_public_id,
      rm.slug,
      rm.title,
      rm.brand_name AS storefront_brand_name,
      rm.color AS storefront_color,
      rm.min_price_minor,
      rm.eligible_offer_count,
      pcp.brand_name AS profile_brand_name,
      pcp.shade_code,
      pcp.brand_shade_name,
      pcp.color_family,
      pcp.color_detail,
      pcp.finish,
      pcp.product_type,
      pcp.canonical_hex,
      pcp.match_precision,
      pcp.confidence
    FROM public.product_color_profiles pcp
    JOIN public.storefront_catalog_read_model rm
      ON rm.canonical_variant_id=pcp.canonical_variant_id
    WHERE pcp.canonical_hex IS NOT NULL
      AND pcp.match_precision IN ('exact','canonicalized','family_estimate')
      AND (
        rm.category_code='nail-care-colour'
        OR pcp.product_type IN ('gel','regular')
        OR lower(rm.title) LIKE '%nail polish%'
        OR lower(rm.title) LIKE '%nail lacquer%'
      )
      AND (
        (rm.local_sellable=true AND rm.local_available_until>now())
        OR
        (rm.dropship_sellable=true AND rm.dropship_available_until>now())
      )
      AND rm.min_price_minor IS NOT NULL
      AND rm.min_price_minor>0
    ORDER BY pcp.confidence DESC,rm.created_at DESC,rm.canonical_public_id
    LIMIT $1
  `, [MAX_CANDIDATES]);

  return result.rows.flatMap((row) => {
    const id = optionalText(row.canonical_public_id);
    const slug = optionalText(row.slug);
    const title = optionalText(row.title);
    const colorHex = normalizeHex(optionalText(row.canonical_hex) ?? "");
    const finish = validFinish(row.finish);
    const productType = validProductType(row.product_type);
    const profilePrecision = validPrecision(row.match_precision);
    const priceMinor = positiveInteger(row.min_price_minor);
    const profileConfidence = boundedConfidence(row.confidence);

    if (
      !id
      || !slug
      || !title
      || !isPublicCatalogueTitle(title)
      || !colorHex
      || !finish
      || !productType
      || !profilePrecision
      || priceMinor === undefined
      || profileConfidence === undefined
    ) {
      return [];
    }

    const offerCount = nonNegativeInteger(row.eligible_offer_count) ?? 1;
    const formattedPrice = formatMoney(money(priceMinor, "EUR"));
    const colorDetail = optionalText(row.color_detail) ?? optionalText(row.color_family);
    const brandShade = optionalText(row.brand_shade_name) ?? optionalText(row.storefront_color);

    return [{
      id,
      slug,
      title,
      brand: optionalText(row.profile_brand_name) ?? optionalText(row.storefront_brand_name),
      brandShade,
      shadeCode: optionalText(row.shade_code),
      colorDetail,
      profilePrecision,
      profileConfidence,
      colorHex,
      colorLabel: colorDetail ?? brandShade ?? colorHex,
      finish,
      productType,
      priceMinor,
      price: offerCount > 1 ? `από ${formattedPrice}` : formattedPrice,
      imageSrc: `/api/catalog-source-image/${encodeURIComponent(id)}`,
      mediaAlt: title
    } satisfies ColorFinderProduct];
  });
}

export const getColorFinderProducts = unstable_cache(
  loadColorFinderProductsUncached,
  ["color-finder-profiled-storefront-v1"],
  { revalidate: CACHE_SECONDS }
);

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
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
