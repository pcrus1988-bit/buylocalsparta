import "server-only";

import { cache } from "react";
import type { CatalogCard } from "./catalog-view";
import { getCachedCrawlerCatalogCards } from "./cached-public-shop-page";
import { publicBrandLogoUrl } from "./brand-logo";
import {
  brandGuideCanIndex,
  brandGuideQualityScore,
  parseBrandGuide,
  type BrandGuideContent
} from "./brand-guide";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { storefrontCategoryForCode, storefrontLeafForSubcategory } from "./storefront-taxonomy";

type BrandRow = Readonly<{
  id: string;
  name: string;
  normalized_name: string;
  public_slug: string;
  website: string | null;
  logo_object_key: string | null;
  logo_external_url: string | null;
  country_code: string | null;
  description: string | null;
  metadata: unknown;
}>;

type BrandCategoryRow = Readonly<{
  category_code: string;
  department_code: string | null;
  label: string | null;
  product_count: number | string;
}>;

type BrandDirectoryRow = BrandRow & Readonly<{
  live_product_count: number | string;
  total_count: number | string;
}>;

export type PublicBrandCategory = Readonly<{
  code: string;
  label: string;
  departmentSlug: string;
  departmentLabel: string;
  productCount: number;
  href: string;
}>;

export type PublicBrandGuide = Readonly<{
  id: string;
  name: string;
  normalizedName: string;
  slug: string;
  website?: string;
  logoUrl?: string;
  countryCode?: string;
  description?: string;
  guide: BrandGuideContent;
  qualityScore: number;
  indexable: boolean;
  liveProductCount: number;
  categories: readonly PublicBrandCategory[];
  products: readonly CatalogCard[];
  shopHref: string;
}>;

export type PublicBrandDirectoryItem = Readonly<{
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  liveProductCount: number;
  guideStatus: BrandGuideContent["status"];
  indexable: boolean;
}>;

export type PublicBrandDirectory = Readonly<{
  items: readonly PublicBrandDirectoryItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}>;

function count(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function optional(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function liveInventoryPredicate(alias = "rm"): string {
  return `(
    (${alias}.local_sellable = true AND ${alias}.local_available_until > now())
    OR
    (${alias}.dropship_sellable = true AND ${alias}.dropship_available_until > now())
  )`;
}

function brandShopHref(name: string): string {
  return `/shop?brand=${encodeURIComponent(name)}`;
}

function categoryHref(name: string, departmentSlug: string, code: string): string {
  const query = new URLSearchParams({
    brand: name,
    category: departmentSlug,
    subcategory: code
  });
  return `/shop?${query.toString()}`;
}

function mapCategory(row: BrandCategoryRow, brandName: string): PublicBrandCategory {
  const department = storefrontCategoryForCode(row.category_code, row.department_code ?? undefined);
  const leaf = storefrontLeafForSubcategory(department.slug, row.category_code, row.label ?? "");
  return {
    code: row.category_code,
    label: optional(row.label) ?? leaf?.label ?? department.label,
    departmentSlug: department.slug,
    departmentLabel: department.label,
    productCount: count(row.product_count),
    href: categoryHref(brandName, department.slug, row.category_code)
  };
}

function guideSignals(row: BrandRow, liveProductCount: number) {
  const guide = parseBrandGuide(row.metadata);
  const logoUrl = publicBrandLogoUrl(row.logo_object_key, row.logo_external_url);
  const input = {
    guide,
    description: optional(row.description),
    countryCode: optional(row.country_code),
    website: optional(row.website),
    hasLogo: Boolean(logoUrl),
    liveProductCount
  };
  return {
    guide,
    logoUrl,
    qualityScore: brandGuideQualityScore(input),
    indexable: brandGuideCanIndex(input)
  };
}

export const getPublicBrandGuide = cache(async (slug: string): Promise<PublicBrandGuide | undefined> => {
  if (!productionDatabaseConfigured()) return undefined;
  const cleanSlug = slug.trim().toLowerCase().slice(0, 180);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(cleanSlug)) return undefined;

  const runtime = getProductionPostgresRuntime();
  const brandResult = await runtime.nativePool.query<BrandRow>(`
    SELECT
      b.id,
      b.name,
      b.normalized_name,
      b.public_slug,
      b.website,
      b.logo_object_key,
      b.metadata->>'logo_external_url' AS logo_external_url,
      b.country_code,
      b.description,
      b.metadata
    FROM public.brands b
    WHERE b.public_slug = $1
      AND b.status = 'active'
    LIMIT 1
  `, [cleanSlug]);

  const row = brandResult.rows[0];
  if (!row) return undefined;

  const [inventoryResult, categoryResult, products] = await Promise.all([
    runtime.nativePool.query<{ live_product_count: number | string }>(`
      SELECT COUNT(DISTINCT rm.canonical_variant_id)::integer AS live_product_count
      FROM public.storefront_catalog_read_model rm
      WHERE rm.brand_id = $1::uuid
        AND ${liveInventoryPredicate("rm")}
    `, [row.id]),
    runtime.nativePool.query<BrandCategoryRow>(`
      SELECT
        rm.category_code,
        rm.department_code,
        COALESCE(el.name, en.name, c.slug, rm.category_code) AS label,
        COUNT(DISTINCT rm.canonical_variant_id)::integer AS product_count
      FROM public.storefront_catalog_read_model rm
      LEFT JOIN public.categories c ON c.id = rm.category_id
      LEFT JOIN public.category_translations el
        ON el.category_id = rm.category_id AND el.locale = 'el'
      LEFT JOIN public.category_translations en
        ON en.category_id = rm.category_id AND en.locale = 'en'
      WHERE rm.brand_id = $1::uuid
        AND ${liveInventoryPredicate("rm")}
      GROUP BY rm.category_code, rm.department_code, c.slug, el.name, en.name
      ORDER BY product_count DESC, COALESCE(el.name, en.name, c.slug, rm.category_code)
      LIMIT 10
    `, [row.id]),
    getCachedCrawlerCatalogCards("23100", "", "", { brand: row.name }, 8).catch(() => [])
  ]);

  const liveProductCount = count(inventoryResult.rows[0]?.live_product_count);
  const signals = guideSignals(row, liveProductCount);

  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    slug: row.public_slug,
    website: optional(row.website),
    logoUrl: signals.logoUrl,
    countryCode: optional(row.country_code),
    description: optional(row.description),
    guide: signals.guide,
    qualityScore: signals.qualityScore,
    indexable: signals.indexable,
    liveProductCount,
    categories: categoryResult.rows.map((category) => mapCategory(category, row.name)),
    products,
    shopHref: brandShopHref(row.name)
  };
});

export async function getPublicBrandDirectory(options: Readonly<{
  q?: string;
  letter?: string;
  limit?: number;
  offset?: number;
}> = {}): Promise<PublicBrandDirectory> {
  const limit = Math.max(12, Math.min(72, Math.trunc(options.limit ?? 48)));
  const offset = Math.max(0, Math.trunc(options.offset ?? 0));
  if (!productionDatabaseConfigured()) return { items: [], total: 0, limit, offset, hasMore: false };

  const query = options.q?.trim().slice(0, 100) || null;
  const letterCandidate = options.letter?.trim().toUpperCase();
  const letter = letterCandidate && /^[A-Z0-9]$/.test(letterCandidate) ? letterCandidate : null;

  const result = await getProductionPostgresRuntime().nativePool.query<BrandDirectoryRow>(`
    WITH live AS MATERIALIZED (
      SELECT DISTINCT rm.brand_id, rm.canonical_variant_id
      FROM public.storefront_catalog_read_model rm
      WHERE rm.brand_id IS NOT NULL
        AND ${liveInventoryPredicate("rm")}
    ),
    totals AS (
      SELECT brand_id, COUNT(*)::integer AS live_product_count
      FROM live
      GROUP BY brand_id
    ),
    filtered AS (
      SELECT
        b.id,
        b.name,
        b.normalized_name,
        b.public_slug,
        b.website,
        b.logo_object_key,
        b.metadata->>'logo_external_url' AS logo_external_url,
        b.country_code,
        b.description,
        b.metadata,
        t.live_product_count
      FROM public.brands b
      JOIN totals t ON t.brand_id = b.id
      WHERE b.status = 'active'
        AND ($1::text IS NULL OR b.name ILIKE '%' || $1 || '%' OR b.normalized_name ILIKE '%' || $1 || '%')
        AND ($2::text IS NULL OR upper(left(b.name, 1)) = $2)
    )
    SELECT f.*, COUNT(*) OVER()::integer AS total_count
    FROM filtered f
    ORDER BY f.live_product_count DESC, lower(f.name), f.id
    LIMIT $3::integer OFFSET $4::integer
  `, [query, letter, limit, offset]);

  const total = count(result.rows[0]?.total_count);
  const items = result.rows.map((row) => {
    const liveProductCount = count(row.live_product_count);
    const signals = guideSignals(row, liveProductCount);
    return {
      id: row.id,
      name: row.name,
      slug: row.public_slug,
      logoUrl: signals.logoUrl,
      liveProductCount,
      guideStatus: signals.guide.status,
      indexable: signals.indexable
    };
  });

  return {
    items,
    total,
    limit,
    offset,
    hasMore: offset + items.length < total
  };
}


type BrandSitemapRow = BrandRow & Readonly<{
  live_product_count: number | string;
  updated_at: string;
}>;

export type PublicBrandSitemapEntry = Readonly<{
  slug: string;
  updatedAt: string;
}>;

export async function getIndexableBrandGuideSitemapInventory(): Promise<readonly PublicBrandSitemapEntry[]> {
  if (!productionDatabaseConfigured()) return [];
  const result = await getProductionPostgresRuntime().nativePool.query<BrandSitemapRow>(`
    WITH live AS MATERIALIZED (
      SELECT DISTINCT rm.brand_id, rm.canonical_variant_id
      FROM public.storefront_catalog_read_model rm
      WHERE rm.brand_id IS NOT NULL
        AND ${liveInventoryPredicate("rm")}
    ),
    totals AS (
      SELECT brand_id, COUNT(*)::integer AS live_product_count
      FROM live
      GROUP BY brand_id
    )
    SELECT
      b.id,
      b.name,
      b.normalized_name,
      b.public_slug,
      b.website,
      b.logo_object_key,
      b.metadata->>'logo_external_url' AS logo_external_url,
      b.country_code,
      b.description,
      b.metadata,
      b.updated_at::text AS updated_at,
      t.live_product_count
    FROM public.brands b
    JOIN totals t ON t.brand_id = b.id
    WHERE b.status='active'
      AND b.metadata->'brand_guide'->>'status'='published'
      AND COALESCE((b.metadata->'brand_guide'->>'seo_indexable')::boolean, false)=true
    ORDER BY b.updated_at DESC, b.id
  `);

  return result.rows.flatMap((row) => {
    const liveProductCount = count(row.live_product_count);
    const signals = guideSignals(row, liveProductCount);
    return signals.indexable
      ? [{ slug: row.public_slug, updatedAt: row.updated_at }]
      : [];
  });
}
