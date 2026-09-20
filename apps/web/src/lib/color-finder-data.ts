import { formatMoney, money, type SqlRow } from "@buy-local-sparta/core";
import { unstable_cache } from "next/cache";
import { isPublicCatalogueTitle } from "./public-data-integrity";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { trustedCatalogSourceHttpsUrl } from "./trusted-catalog-source-url";
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
const SAFE_SCOPE = /^[a-z0-9][a-z0-9_-]{1,95}$/i;
const SAFE_VENDOR = /^[A-Za-z0-9_-]{3,128}$/;

export type ColorFinderCatalogueScope = Readonly<{
  categoryCode?: string;
  vendorPublicId?: string;
}>;

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
  source_code: string | null;
  source_website: string | null;
  source_image_url: string | null;
}>;

async function loadColorFinderProductsUncached(
  categoryCode: string,
  vendorPublicId: string
): Promise<readonly ColorFinderProduct[]> {
  if (!productionDatabaseConfigured()) return [];

  const vendorPredicate = vendorPublicId ? "AND v.public_id=$2" : "";
  const limitPlaceholder = vendorPublicId ? "$3" : "$2";
  const queryParams = vendorPublicId
    ? [categoryCode, vendorPublicId, MAX_CANDIDATES]
    : [categoryCode, MAX_CANDIDATES];

  const result = await getProductionPostgresRuntime().nativePool.query<ColorFinderCandidateRow>(`
    WITH live_color_variants AS MATERIALIZED (
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
        vo.customer_price_minor,
        cs.code AS source_code,
        cs.website AS source_website,
        csp.source_image_url
      FROM public.dropship_supplier_offers dso
      JOIN public.dropship_suppliers ds
        ON ds.id=dso.supplier_id
       AND ds.active=true
       AND ds.api_authoritative_availability=true
      JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
      JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
      JOIN public.categories c ON c.id=cv.category_id
      JOIN public.markets m ON m.id=cv.market_id AND m.code='sparta'
      JOIN public.vendor_businesses v ON v.id=vo.vendor_id AND v.status='active'
      JOIN public.vendor_locations l ON l.id=vo.location_id AND l.active=true
      LEFT JOIN public.product_families pf ON pf.id=cv.family_id
      LEFT JOIN public.brands b ON b.id=COALESCE(cv.brand_id,pf.brand_id)
      LEFT JOIN public.product_translations el
        ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN public.product_translations en
        ON en.canonical_variant_id=cv.id AND en.locale='en'
      LEFT JOIN public.catalog_source_products csp
        ON csp.id=dso.source_product_id
      LEFT JOIN public.catalog_sources cs
        ON cs.id=csp.source_id
      WHERE dso.active=true
        AND dso.cached_available=true
        AND COALESCE(dso.cached_quantity,0)>=1
        AND dso.availability_expires_at IS NOT NULL
        AND dso.availability_expires_at>now()
        AND (
          ($1='studio-nails' AND c.code='nail-care-colour')
          OR ($1='studio-lips' AND c.code='lip-makeup')
          OR ($1='studio-eye-makeup' AND c.code='eye-makeup')
          OR ($1='studio-makeup' AND c.code IN ('face-makeup','makeup'))
          OR ($1='studio-hair-color' AND c.code ~* 'hair')
          OR ($1='studio-shoes' AND c.code ~* '(shoe|footwear|sneaker|boot|sandal|loafer)')
          OR ($1='studio-bags' AND c.code ~* '(bag|handbag|backpack|wallet|luggage)')
          OR (
            $1='studio-fashion'
            AND c.code ~* '(fashion|dress|top|shirt|trouser|jean|jacket|coat|short|skirt|activewear|clothing|apparel|belt|scarf|hat|glove|sunglass|jewell|earring|necklace|bracelet|ring|watch)'
            AND c.code !~* '(shoe|footwear|sneaker|boot|sandal|loafer|bag|handbag|backpack|wallet|luggage)'
          )
          OR ($1='studio-home' AND c.code ~* '(home|decor|candle|tableware|glassware|kitchen|furniture|lighting|houseware)')
          OR ($1 NOT LIKE 'studio-%' AND c.code=$1)
        )
        ${vendorPredicate}
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
      LIMIT ${limitPlaceholder}
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
      pcp.confidence,
      candidate.source_code,
      candidate.source_website,
      candidate.source_image_url
    FROM live_color_variants candidate
    LEFT JOIN public.product_color_profiles pcp
      ON pcp.canonical_variant_id=candidate.canonical_variant_id
    ORDER BY candidate.customer_price_minor,candidate.canonical_public_id
  `, queryParams);

  return result.rows.flatMap((row) => {
    const id = optionalText(row.canonical_public_id);
    const slug = optionalText(row.slug);
    const title = optionalText(row.title);
    const rawColor = optionalText(row.raw_color);
    const priceMinor = positiveInteger(row.customer_price_minor);

    if (!id || !slug || !title || !priceMinor || !isPublicCatalogueTitle(title)) return [];

    const storedHex = optionalText(row.canonical_hex);
    const storedResolved = storedHex ? resolveCatalogColor({ color: storedHex }) : undefined;
    const storedPrecision = storedResolved ? validPrecision(row.match_precision) : undefined;
    const storedConfidence = storedResolved ? boundedConfidence(row.confidence) : undefined;
    const storedUsable = Boolean(
      storedResolved
      && storedPrecision
      && storedPrecision !== "family_estimate"
      && (storedConfidence ?? 0) >= 0.5
    );
    const resolved = storedUsable && storedResolved
      ? storedResolved
      : rawColor
        ? resolveCatalogColor({ color: rawColor })
        : undefined;
    if (!resolved) return [];

    const profilePrecision = storedUsable && storedPrecision ? storedPrecision : "canonicalized" as const;
    const profileConfidence = storedUsable && storedConfidence !== undefined ? storedConfidence : 0.68;
    const productText = [
      title,
      rawColor,
      optionalText(row.color_detail),
      optionalText(row.brand_shade_name)
    ].filter(Boolean).join(" ");
    const directImageSrc = trustedCatalogSourceHttpsUrl(
      row.source_code,
      row.source_website,
      row.source_image_url
    );

    return [{
      id,
      slug,
      title,
      brand: optionalText(row.profile_brand_name) ?? optionalText(row.brand_name),
      brandShade: optionalText(row.brand_shade_name) ?? rawColor,
      shadeCode: optionalText(row.shade_code),
      colorDetail: optionalText(row.color_detail) ?? optionalText(row.color_family),
      profilePrecision,
      profileConfidence,
      colorHex: resolved.hex,
      colorLabel: optionalText(row.color_detail) ?? optionalText(row.color_family) ?? resolved.label,
      finish: validFinish(row.profile_finish) ?? inferColorFinish(productText),
      productType: validProductType(row.profile_product_type) ?? inferColorProductType(productText),
      priceMinor,
      price: formatMoney(money(priceMinor, "EUR")),
      imageSrc: directImageSrc ?? `/api/catalog-source-image/${encodeURIComponent(id)}`,
      mediaAlt: title
    } satisfies ColorFinderProduct];
  });
}

const getCachedColorFinderProducts = unstable_cache(
  loadColorFinderProductsUncached,
  ["color-finder-contextual-catalogue-v4"],
  { revalidate: CACHE_SECONDS }
);

export function getColorFinderProducts(
  scope: ColorFinderCatalogueScope = {}
): Promise<readonly ColorFinderProduct[]> {
  const requestedCategory = scope.categoryCode?.trim() ?? "";
  const requestedVendor = scope.vendorPublicId?.trim() ?? "";
  const categoryCode = SAFE_SCOPE.test(requestedCategory) ? requestedCategory : "nail-care-colour";
  const vendorPublicId = SAFE_VENDOR.test(requestedVendor) ? requestedVendor : "";
  return getCachedColorFinderProducts(categoryCode, vendorPublicId);
}

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
