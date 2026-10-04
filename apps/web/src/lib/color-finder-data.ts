import { formatMoney, money, type SqlRow } from "@buy-local-sparta/core";
import { unstable_cache } from "next/cache";
import { isPublicCatalogueTitle } from "./public-data-integrity";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import {
  colorMatchPercent,
  deltaE2000,
  hexToLab,
  inferColorFinish,
  inferColorProductType,
  normalizeHex,
  resolveCatalogColor,
  type ColorFinderProduct,
  type ColorFinish,
  type ColorProductType
} from "./color-finder";

const CACHE_SECONDS = 900;
const MAX_RESULTS = 600;
const MIN_MATCH_PERCENT = 49;
const MIN_PROFILE_CONFIDENCE = 0.5;
const SAFE_SCOPE = /^[a-z0-9][a-z0-9_-]{1,95}$/i;
const SAFE_VENDOR = /^[A-Za-z0-9_-]{3,128}$/;

export type ColorFinderCatalogueScope = Readonly<{
  categoryCode?: string;
  vendorPublicId?: string;
  targetHex?: string;
}>;

type ColorFinderMediaRow = SqlRow & Readonly<{
  canonical_public_id: string;
  media_public_id: string;
  alt_text: string | null;
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
}>;

async function loadColorFinderProductsUncached(
  categoryCode: string,
  vendorPublicId: string,
  targetHexInput: string
): Promise<readonly ColorFinderProduct[]> {
  if (!productionDatabaseConfigured()) return [];

  const targetHex = normalizeHex(targetHexInput);
  if (!targetHex) return [];
  const targetLab = hexToLab(targetHex);
  const pool = getProductionPostgresRuntime().nativePool;

  const result = await pool.query<ColorFinderCandidateRow>(`
    SELECT
      rm.canonical_public_id,
      rm.slug,
      rm.title,
      rm.brand_name,
      NULLIF(btrim(rm.color), '') AS raw_color,
      rm.min_price_minor AS customer_price_minor,
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
    FROM public.storefront_catalog_read_model rm
    LEFT JOIN public.product_color_profiles pcp
      ON pcp.canonical_variant_id=rm.canonical_variant_id
    WHERE (
      ($1='studio-nails' AND rm.category_code='nail-care-colour')
      OR ($1='studio-lips' AND rm.category_code='lip-makeup')
      OR ($1='studio-eye-makeup' AND rm.category_code='eye-makeup')
      OR ($1='studio-makeup' AND rm.category_code IN ('face-makeup','makeup'))
      OR ($1='studio-hair-color' AND rm.category_code ~* 'hair')
      OR ($1='studio-shoes' AND rm.category_code ~* '(shoe|footwear|sneaker|boot|sandal|loafer)')
      OR ($1='studio-bags' AND rm.category_code ~* '(bag|handbag|backpack|wallet|luggage)')
      OR (
        $1='studio-fashion'
        AND rm.category_code ~* '(fashion|dress|top|shirt|trouser|jean|jacket|coat|short|skirt|activewear|clothing|apparel|belt|scarf|hat|glove|sunglass|jewell|earring|necklace|bracelet|ring|watch)'
        AND rm.category_code !~* '(shoe|footwear|sneaker|boot|sandal|loafer|bag|handbag|backpack|wallet|luggage)'
      )
      OR ($1='studio-home' AND rm.category_code ~* '(home|decor|candle|tableware|glassware|kitchen|furniture|lighting|houseware)')
      OR ($1 NOT LIKE 'studio-%' AND rm.category_code=$1)
    )
      AND (
        $2::text=''
        OR EXISTS (
          SELECT 1
          FROM public.vendor_offers vo
          JOIN public.vendor_businesses v
            ON v.id=vo.vendor_id
           AND v.public_id=$2
           AND v.status='active'
          JOIN public.vendor_locations l
            ON l.id=vo.location_id
           AND l.active=true
          LEFT JOIN public.inventory_balances ib
            ON ib.offer_id=vo.id
          LEFT JOIN public.dropship_supplier_offers dso
            ON dso.vendor_offer_id=vo.id
          LEFT JOIN public.dropship_suppliers ds
            ON ds.id=dso.supplier_id
          WHERE vo.canonical_variant_id=rm.canonical_variant_id
            AND vo.status='approved'
            AND vo.merchant_visible=true
            AND vo.merchant_pause_active=false
            AND vo.customer_price_minor>0
            AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
            AND bls_private.vendor_category_effectively_visible(vo.vendor_id,rm.category_id)
            AND (
              (
                dso.id IS NULL
                AND ib.offer_id IS NOT NULL
                AND 'pickup'::fulfilment_mode=ANY(vo.fulfilment_modes)
                AND GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)>=1
                AND ib.stock_confirmed_at IS NOT NULL
                AND (ib.stock_confirmed_at + make_interval(secs => ib.freshness_ttl_seconds::double precision))>now()
              )
              OR (
                dso.id IS NOT NULL
                AND ds.active=true
                AND ds.api_authoritative_availability=true
                AND dso.active=true
                AND dso.cached_available=true
                AND (dso.cached_quantity IS NULL OR dso.cached_quantity>=1)
                AND dso.availability_expires_at IS NOT NULL
                AND dso.availability_expires_at>now()
              )
            )
        )
      )
    ORDER BY rm.min_price_minor,rm.canonical_public_id
  `, [categoryCode, vendorPublicId]);

  const ranked = result.rows.flatMap((row) => {
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
      && (storedConfidence ?? 0) >= MIN_PROFILE_CONFIDENCE
    );
    const profileBrand = optionalText(row.profile_brand_name);
    const canonicalBrand = optionalText(row.brand_name);
    const brand = profileBrand ?? canonicalBrand;
    const inferenceTitle = stripLeadingBrand(title, brand);
    const resolved = storedUsable && storedResolved
      ? storedResolved
      : resolveCatalogColor({
          color: rawColor,
          title: inferenceTitle
        });
    if (!resolved) return [];

    const directColorEvidence = Boolean(rawColor);
    const profilePrecision = storedUsable && storedPrecision
      ? storedPrecision
      : directColorEvidence
        ? "canonicalized" as const
        : "family_estimate" as const;
    const profileConfidence = storedUsable && storedConfidence !== undefined
      ? storedConfidence
      : directColorEvidence
        ? resolved.precision === "reference" ? 0.86 : 0.76
        : resolved.precision === "reference"
          ? 0.62
          : 0.56;

    const deltaE = deltaE2000(targetLab, hexToLab(resolved.hex));
    const match = colorMatchPercent(deltaE);
    if (match < MIN_MATCH_PERCENT || profileConfidence < MIN_PROFILE_CONFIDENCE) return [];

    const productText = [
      title,
      rawColor,
      optionalText(row.color_detail),
      optionalText(row.brand_shade_name)
    ].filter(Boolean).join(" ");

    return [{
      product: {
        id,
        slug,
        title,
        brand,
        brandShade: optionalText(row.brand_shade_name) ?? rawColor,
        shadeCode: optionalText(row.shade_code),
        colorDetail: optionalText(row.color_detail) ?? optionalText(row.color_family),
        profilePrecision,
        profileConfidence,
        colorHex: resolved.hex,
        colorLabel: optionalText(row.brand_shade_name) ?? optionalText(row.color_detail) ?? resolved.label,
        finish: validFinish(row.profile_finish) ?? inferColorFinish(productText),
        productType: validProductType(row.profile_product_type) ?? inferColorProductType(productText),
        priceMinor,
        price: formatMoney(money(priceMinor, "EUR")),
        imageSrc: `/api/catalog-source-image/${encodeURIComponent(id)}`,
        mediaAlt: title
      } satisfies ColorFinderProduct,
      deltaE
    }];
  });

  const selected = ranked
    .sort((left, right) =>
      left.deltaE - right.deltaE
      || (right.product.profileConfidence ?? 0) - (left.product.profileConfidence ?? 0)
      || left.product.priceMinor - right.product.priceMinor
    )
    .slice(0, MAX_RESULTS);

  if (selected.length === 0) return [];

  try {
    const mediaResult = await pool.query<ColorFinderMediaRow>(`
      SELECT DISTINCT ON (cv.public_id)
        cv.public_id AS canonical_public_id,
        pm.public_id AS media_public_id,
        pm.alt_text
      FROM public.canonical_variants cv
      JOIN public.product_media pm
        ON pm.canonical_variant_id=cv.id
       AND pm.kind='image'
       AND pm.scan_status='clean'
       AND pm.rights_status='approved'
       AND pm.moderation_status='approved'
       AND pm.object_key IS NOT NULL
       AND pm.content_type IN ('image/jpeg','image/png','image/webp')
      WHERE cv.public_id=ANY($1::text[])
      ORDER BY
        cv.public_id,
        pm.sort_order ASC,
        pm.reviewed_at DESC NULLS LAST,
        pm.created_at DESC,
        pm.public_id
    `, [selected.map((entry) => entry.product.id)]);

    const mediaByProduct = new Map(
      mediaResult.rows.map((row) => [
        row.canonical_public_id,
        { mediaId: row.media_public_id, altText: optionalText(row.alt_text) }
      ] as const)
    );

    return selected.map((entry) => {
      const media = mediaByProduct.get(entry.product.id);
      return media
        ? {
            ...entry.product,
            imageSrc: `/api/media/${encodeURIComponent(media.mediaId)}`,
            mediaAlt: media.altText ?? entry.product.mediaAlt
          }
        : entry.product;
    });
  } catch (error) {
    console.warn(JSON.stringify({
      level: "warn",
      event: "color_finder.catalogue_media_projection_degraded",
      selectedCount: selected.length,
      message: error instanceof Error ? error.message : String(error)
    }));
    return selected.map((entry) => entry.product);
  }
}

const getCachedColorFinderProducts = unstable_cache(
  loadColorFinderProductsUncached,
  ["color-finder-contextual-catalogue-v7-full-hub"],
  { revalidate: CACHE_SECONDS }
);

export function getColorFinderProducts(
  scope: ColorFinderCatalogueScope = {}
): Promise<readonly ColorFinderProduct[]> {
  const requestedCategory = scope.categoryCode?.trim() ?? "";
  const requestedVendor = scope.vendorPublicId?.trim() ?? "";
  const requestedTargetHex = normalizeHex(scope.targetHex?.trim() ?? "") ?? "#B52E2E";
  const categoryCode = SAFE_SCOPE.test(requestedCategory) ? requestedCategory : "nail-care-colour";
  const vendorPublicId = SAFE_VENDOR.test(requestedVendor) ? requestedVendor : "";
  return getCachedColorFinderProducts(categoryCode, vendorPublicId, requestedTargetHex);
}

function stripLeadingBrand(value: string, brand?: string): string {
  if (!brand) return value;
  const cleanValue = value.trim();
  const cleanBrand = brand.trim();
  if (!cleanBrand) return cleanValue;
  if (!cleanValue.toLocaleLowerCase("en").startsWith(cleanBrand.toLocaleLowerCase("en"))) return cleanValue;
  return cleanValue.slice(cleanBrand.length).replace(/^[\s,.:;|/\\\-–—]+/, "").trim();
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
