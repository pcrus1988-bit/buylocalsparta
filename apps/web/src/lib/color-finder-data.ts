import { unstable_cache } from "next/cache";
import type { SqlRow } from "@buy-local-sparta/core";
import { getPublishedDropshipCatalogPage } from "./published-dropship-catalog-page";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import {
  inferColorFinish,
  inferColorProductType,
  resolveCatalogColor,
  type ColorFinderProduct,
  type ColorFinish,
  type ColorProductType
} from "./color-finder";

const PAGE_SIZE = 36;
const MAX_WINDOWS = 2;
const CACHE_SECONDS = 900;

type StoredProfile = Readonly<{
  brandName?: string;
  shadeCode?: string;
  brandShadeName?: string;
  colorFamily?: string;
  colorDetail?: string;
  finish?: ColorFinish;
  productType?: ColorProductType;
  canonicalHex?: string;
  matchPrecision?: "exact" | "canonicalized" | "family_estimate";
  confidence?: number;
}>;

async function loadCandidatePages() {
  const products: Awaited<ReturnType<typeof getPublishedDropshipCatalogPage>>["products"][number][] = [];
  let primaryError: unknown;

  for (let window = 0; window < MAX_WINDOWS; window += 1) {
    try {
      const page = await getPublishedDropshipCatalogPage({
        category: "beauty",
        filters: { subcategory: "nail-care-colour" },
        limit: PAGE_SIZE,
        offset: window * PAGE_SIZE
      });
      products.push(...page.products);
      if (!page.hasMore) break;
    } catch (error) {
      primaryError = error;
      warnColorFinderDataFailure("catalogue_window", error, { window });
      break;
    }
  }

  if (products.length > 0) return products;

  try {
    const fallback = await getPublishedDropshipCatalogPage({
      category: "beauty",
      query: "nail",
      limit: PAGE_SIZE,
      offset: 0
    });
    return [...fallback.products];
  } catch (error) {
    warnColorFinderDataFailure("catalogue_fallback", error);
    throw primaryError ?? error;
  }
}

async function loadStoredProfiles(publicIds: readonly string[]): Promise<ReadonlyMap<string, StoredProfile>> {
  if (!productionDatabaseConfigured() || publicIds.length === 0) return new Map();

  try {
    const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
      SELECT
        cv.public_id,
        pcp.brand_name,
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
      JOIN public.canonical_variants cv ON cv.id=pcp.canonical_variant_id
      WHERE cv.public_id=ANY($1::text[])
    `, [[...new Set(publicIds)]]);

    return new Map(result.rows.map((row) => {
      const publicId = String(row.public_id);
      const precision = ["exact","canonicalized","family_estimate"].includes(String(row.match_precision))
        ? String(row.match_precision) as StoredProfile["matchPrecision"]
        : undefined;
      const confidence = Number(row.confidence);
      return [publicId, {
        brandName: optionalText(row.brand_name),
        shadeCode: optionalText(row.shade_code),
        brandShadeName: optionalText(row.brand_shade_name),
        colorFamily: optionalText(row.color_family),
        colorDetail: optionalText(row.color_detail),
        finish: validFinish(row.finish),
        productType: validProductType(row.product_type),
        canonicalHex: optionalText(row.canonical_hex),
        matchPrecision: precision,
        confidence: Number.isFinite(confidence) ? confidence : undefined
      }] as const;
    }));
  } catch (error) {
    warnColorFinderDataFailure("stored_profiles", error, { requestedProfiles: publicIds.length });
    return new Map();
  }
}

async function loadColorFinderProductsUncached(): Promise<readonly ColorFinderProduct[]> {
  const candidates = await loadCandidatePages();
  const profiles = await loadStoredProfiles(candidates.map((product) => product.id));
  const seen = new Set<string>();
  const products: ColorFinderProduct[] = [];

  for (const product of candidates) {
    if (seen.has(product.id)) continue;
    seen.add(product.id);

    const profile = profiles.get(product.id);
    const resolved = profile?.canonicalHex
      ? { hex: profile.canonicalHex, label: profile.colorDetail ?? profile.colorFamily ?? profile.canonicalHex }
      : resolveCatalogColor({ color: product.color, title: product.title });
    if (!resolved) continue;

    const fallbackPrecision = product.color?.trim() ? "canonicalized" as const : "family_estimate" as const;
    const fallbackConfidence = product.color?.trim() ? 0.68 : 0.42;
    const productText = [product.title, product.categoryLabel, product.color].filter(Boolean).join(" ");
    const imageSrc = product.mediaId
      ? `/api/media/${encodeURIComponent(product.mediaId)}`
      : product.previewImageSrc ?? `/api/catalog-source-image/${encodeURIComponent(product.id)}`;

    products.push({
      id: product.id,
      slug: product.slug,
      title: product.title,
      brand: profile?.brandName ?? product.brand,
      brandShade: profile?.brandShadeName ?? product.color,
      shadeCode: profile?.shadeCode,
      colorDetail: profile?.colorDetail ?? profile?.colorFamily,
      profilePrecision: profile?.matchPrecision ?? fallbackPrecision,
      profileConfidence: profile?.confidence ?? fallbackConfidence,
      colorHex: resolved.hex,
      colorLabel: resolved.label,
      finish: profile?.finish ?? inferColorFinish(productText),
      productType: profile?.productType ?? inferColorProductType(productText),
      priceMinor: product.priceMinor,
      price: product.price,
      imageSrc,
      mediaAlt: product.mediaAlt
    });
  }

  return products;
}

export const getColorFinderProducts = unstable_cache(
  loadColorFinderProductsUncached,
  ["color-finder-nail-products-v6"],
  { revalidate: CACHE_SECONDS }
);

function warnColorFinderDataFailure(
  stage: string,
  error: unknown,
  details: Readonly<Record<string, unknown>> = {}
) {
  console.warn(JSON.stringify({
    level: "warn",
    event: "color_finder.catalogue_degraded",
    stage,
    ...details,
    message: error instanceof Error ? error.message : String(error)
  }));
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
