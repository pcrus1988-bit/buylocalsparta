import { formatMoney, money, type SqlRow } from "@buy-local-sparta/core";
import { unstable_cache } from "next/cache";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { isPublicCatalogueTitle } from "./public-data-integrity";
import { trustedCatalogSourceHttpsUrl } from "./trusted-catalog-source-url";
import {
  inferColorFinish,
  inferColorProductType,
  normalizeHex,
  resolveCatalogColor,
  type ColorFinderProduct,
  type ColorFinish,
  type ColorProductType
} from "./color-finder";

const CACHE_SECONDS = 900;
const MAX_PRODUCTS = 5_000;
const MIN_PROFILE_CONFIDENCE = 0.5;

type ColorFinderRow = SqlRow & Readonly<{
  public_id: string;
  slug: string;
  title: string;
  brand_name: string | null;
  brand_shade_name: string | null;
  shade_code: string | null;
  color_detail: string | null;
  color_family: string | null;
  finish: string | null;
  product_type: string | null;
  canonical_hex: string | null;
  match_precision: string | null;
  confidence: number | string | null;
  raw_color: string | null;
  customer_price_minor: number | string;
  source_code: string | null;
  source_website: string | null;
  source_title: string | null;
  source_image_url: string | null;
}>;

async function loadColorFinderProductsUncached(): Promise<readonly ColorFinderProduct[]> {
  if (!productionDatabaseConfigured()) return [];

  const pool = getProductionPostgresRuntime().nativePool;
  const result = await pool.query<ColorFinderRow>(`
    WITH RECURSIVE hidden_categories(vendor_id,category_id) AS (
      SELECT vendor_id,category_id
      FROM public.vendor_category_visibility
      WHERE visible=false

      UNION

      SELECT hidden.vendor_id,child.id
      FROM hidden_categories hidden
      JOIN public.categories child ON child.parent_id=hidden.category_id
    ),
    eligible AS MATERIALIZED (
      SELECT DISTINCT ON (cv.id)
        cv.public_id,
        cv.slug,
        COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
        b.name AS brand_name,
        pcp.brand_shade_name,
        pcp.shade_code,
        pcp.color_detail,
        pcp.color_family,
        pcp.finish,
        pcp.product_type,
        pcp.canonical_hex,
        pcp.match_precision,
        pcp.confidence,
        COALESCE(
          el.specifications->>'color',
          en.specifications->>'color',
          cv.variant_attributes->>'color'
        ) AS raw_color,
        vo.customer_price_minor,
        cs.code AS source_code,
        cs.website AS source_website,
        csp.title AS source_title,
        COALESCE(
          primary_image.image->>'src',
          primary_image.image->>'url',
          primary_image.image->>'image',
          csp.source_image_url
        ) AS source_image_url
      FROM public.canonical_variants cv
      JOIN public.markets m ON m.id=cv.market_id
      JOIN public.categories c ON c.id=cv.category_id
      LEFT JOIN public.product_families pf ON pf.id=cv.family_id
      LEFT JOIN public.brands b ON b.id=COALESCE(cv.brand_id,pf.brand_id)
      LEFT JOIN public.product_translations el
        ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN public.product_translations en
        ON en.canonical_variant_id=cv.id AND en.locale='en'
      LEFT JOIN public.product_color_profiles pcp
        ON pcp.canonical_variant_id=cv.id
      JOIN public.vendor_offers vo
        ON vo.canonical_variant_id=cv.id
      JOIN public.vendor_businesses v
        ON v.id=vo.vendor_id
      JOIN public.vendor_locations l
        ON l.id=vo.location_id
      JOIN public.dropship_supplier_offers dso
        ON dso.vendor_offer_id=vo.id
      JOIN public.dropship_suppliers ds
        ON ds.id=dso.supplier_id
      LEFT JOIN public.catalog_source_products csp
        ON csp.id=dso.source_product_id
      LEFT JOIN public.catalog_sources cs
        ON cs.id=csp.source_id
      LEFT JOIN LATERAL (
        SELECT image
        FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(csp.normalized_payload->'images')='array'
              THEN csp.normalized_payload->'images'
            ELSE '[]'::jsonb
          END
        ) WITH ORDINALITY AS source_images(image,ordinality)
        ORDER BY
          CASE
            WHEN COALESCE(image->>'position','') ~ '^[0-9]+([.][0-9]+)?$'
              THEN (image->>'position')::numeric
            ELSE ordinality - 1
          END,
          ordinality
        LIMIT 1
      ) primary_image ON true
      WHERE m.code='sparta'
        AND c.code='nail-care-colour'
        AND COALESCE(cv.commerce_channel,'normal')='normal'
        AND cv.active=true
        AND cv.suppressed=false
        AND cv.recalled=false
        AND vo.status='approved'
        AND vo.merchant_visible=true
        AND vo.merchant_pause_active=false
        AND vo.customer_price_minor>0
        AND v.status='active'
        AND l.active=true
        AND dso.active=true
        AND ds.active=true
        AND ds.api_authoritative_availability=true
        AND dso.cached_available=true
        AND (dso.cached_quantity IS NULL OR dso.cached_quantity>=1)
        AND dso.availability_expires_at IS NOT NULL
        AND dso.availability_expires_at>now()
        AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
        AND NOT EXISTS (
          SELECT 1
          FROM hidden_categories hidden
          WHERE hidden.vendor_id=vo.vendor_id
            AND hidden.category_id=cv.category_id
        )
      ORDER BY
        cv.id,
        vo.customer_price_minor ASC,
        dso.availability_checked_at DESC NULLS LAST,
        vo.updated_at DESC,
        vo.public_id
    )
    SELECT *
    FROM eligible
    ORDER BY
      CASE WHEN canonical_hex IS NOT NULL AND confidence >= $1 THEN 0 ELSE 1 END,
      confidence DESC NULLS LAST,
      public_id
    LIMIT $2
  `, [MIN_PROFILE_CONFIDENCE, MAX_PRODUCTS]);

  const products: ColorFinderProduct[] = [];

  for (const row of result.rows) {
    const id = requiredText(row.public_id);
    const title = requiredText(row.title);
    const slug = optionalText(row.slug) ?? id;
    const priceMinor = positiveInteger(row.customer_price_minor);
    if (!id || !title || !priceMinor || !isPublicCatalogueTitle(title)) continue;

    const storedConfidence = finiteNumber(row.confidence);
    const storedHex = normalizeHex(optionalText(row.canonical_hex) ?? "");
    const storedPrecision = validPrecision(row.match_precision);
    const rawColor = optionalText(row.raw_color);
    const storedUsable = Boolean(
      storedHex
      && storedPrecision
      && storedPrecision !== "family_estimate"
      && storedConfidence !== undefined
      && storedConfidence >= MIN_PROFILE_CONFIDENCE
    );

    const fallback = !storedUsable && rawColor
      ? resolveCatalogColor({ color: rawColor, title })
      : undefined;
    const colorHex = storedUsable ? storedHex : fallback?.hex;
    if (!colorHex) continue;

    const profilePrecision = storedUsable ? storedPrecision : "canonicalized";
    const profileConfidence = storedUsable ? storedConfidence : 0.68;
    const brandShade = optionalText(row.brand_shade_name) ?? rawColor;
    const colorDetail = optionalText(row.color_detail) ?? optionalText(row.color_family) ?? fallback?.label;
    const descriptiveText = [
      title,
      rawColor,
      brandShade,
      colorDetail,
      optionalText(row.finish),
      optionalText(row.product_type)
    ].filter(Boolean).join(" ");

    const sourceImage = trustedCatalogSourceHttpsUrl(
      optionalText(row.source_code),
      optionalText(row.source_website),
      optionalText(row.source_image_url)
    );

    products.push({
      id,
      slug,
      title,
      brand: optionalText(row.brand_name),
      brandShade,
      shadeCode: optionalText(row.shade_code),
      colorDetail,
      profilePrecision,
      profileConfidence,
      colorHex,
      colorLabel: colorDetail ?? rawColor ?? colorHex,
      finish: validFinish(row.finish) ?? inferColorFinish(descriptiveText),
      productType: validProductType(row.product_type) ?? inferColorProductType(descriptiveText),
      priceMinor,
      price: formatMoney(money(priceMinor)),
      imageSrc: sourceImage ?? `/api/catalog-source-image/${encodeURIComponent(id)}`,
      mediaAlt: optionalText(row.source_title) ?? title
    });
  }

  console.info(JSON.stringify({
    level: "info",
    event: "color_finder.catalogue_ready",
    rows: result.rowCount ?? result.rows.length,
    products: products.length,
    exactProfiles: products.filter((product) => product.profilePrecision === "exact").length,
    canonicalizedProfiles: products.filter((product) => product.profilePrecision === "canonicalized").length
  }));

  return products;
}

export const getColorFinderProducts = unstable_cache(
  loadColorFinderProductsUncached,
  ["color-finder-nail-products-v7"],
  { revalidate: CACHE_SECONDS }
);

function requiredText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalText(value: unknown): string | undefined {
  return requiredText(value);
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function validPrecision(value: unknown): ColorFinderProduct["profilePrecision"] | undefined {
  return ["exact","canonicalized","family_estimate"].includes(String(value))
    ? String(value) as ColorFinderProduct["profilePrecision"]
    : undefined;
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
