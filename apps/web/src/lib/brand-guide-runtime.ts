import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";
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
  updated_at: string;
}>;

type RelatedBrandRow = Readonly<{
  id: string;
  name: string;
  public_slug: string;
  logo_object_key: string | null;
  logo_external_url: string | null;
  shared_category_count: number | string;
  live_product_count: number | string;
}>;

export type PublicBrandCategory = Readonly<{
  code: string;
  label: string;
  departmentSlug: string;
  departmentLabel: string;
  productCount: number;
  href: string;
}>;

export type PublicBrandDepartment = Readonly<{
  slug: string;
  label: string;
  productCount: number;
  categoryCount: number;
  href: string;
}>;

export type PublicRelatedBrand = Readonly<{
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  sharedCategoryCount: number;
  liveProductCount: number;
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
  departments: readonly PublicBrandDepartment[];
  categories: readonly PublicBrandCategory[];
  relatedBrands: readonly PublicRelatedBrand[];
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

function brandShopHref(name: string): string {
  return `/shop?brand=${encodeURIComponent(name)}`;
}

function departmentHref(name: string, departmentSlug: string): string {
  const query = new URLSearchParams({
    brand: name,
    category: departmentSlug
  });
  return `/shop?${query.toString()}`;
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

function departmentSummaries(categories: readonly PublicBrandCategory[], brandName: string): readonly PublicBrandDepartment[] {
  const groups = new Map<string, { label: string; productCount: number; categoryCount: number }>();
  for (const category of categories) {
    const current = groups.get(category.departmentSlug) ?? {
      label: category.departmentLabel,
      productCount: 0,
      categoryCount: 0
    };
    current.productCount += category.productCount;
    current.categoryCount += 1;
    groups.set(category.departmentSlug, current);
  }
  return [...groups.entries()]
    .map(([slug, group]) => ({
      slug,
      label: group.label,
      productCount: group.productCount,
      categoryCount: group.categoryCount,
      href: departmentHref(brandName, slug)
    }))
    .sort((a, b) => b.productCount - a.productCount || a.label.localeCompare(b.label, "el"));
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

const BRAND_GUIDE_CACHE_SECONDS = 300;
const BRAND_DIRECTORY_CACHE_SECONDS = 900;

const cachedPublicBrandGuide = unstable_cache(
  async (cleanSlug: string): Promise<PublicBrandGuide | undefined> => {
    if (!productionDatabaseConfigured()) return undefined;

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

    let liveProductCount = 0;
    let allCategories: PublicBrandCategory[] = [];

    try {
      const inventoryResult = await runtime.nativePool.query<{ live_product_count: number | string }>(`
        SELECT COUNT(*)::integer AS live_product_count
        FROM bls_private.storefront_dropship_live_family lf
        WHERE lf.sellable=true
          AND lf.available_until>now()
          AND lf.brand_names_normalized @> ARRAY[$1::text]
      `, [row.normalized_name]);
      liveProductCount = count(inventoryResult.rows[0]?.live_product_count);

      const categoryResult = await runtime.nativePool.query<BrandCategoryRow>(`
        SELECT
          category_code,
          NULL::text AS department_code,
          NULL::text AS label,
          COUNT(*)::integer AS product_count
        FROM bls_private.storefront_dropship_live_family lf
        CROSS JOIN LATERAL unnest(lf.category_codes) category_code
        WHERE lf.sellable=true
          AND lf.available_until>now()
          AND lf.brand_names_normalized @> ARRAY[$1::text]
        GROUP BY category_code
        ORDER BY product_count DESC, category_code
      `, [row.normalized_name]);
      allCategories = categoryResult.rows.map((category) => mapCategory(category, row.name));
    } catch (error) {
      console.warn(JSON.stringify({
        level: "warn",
        event: "brand_guide.live_family_projection_degraded",
        slug: cleanSlug,
        message: error instanceof Error ? error.message : String(error)
      }));
    }

    let relatedBrands: PublicRelatedBrand[] = [];
    const targetCategories = allCategories.slice(0, 10).map((category) => category.code);
    if (targetCategories.length > 0) {
      try {
        const relatedResult = await runtime.nativePool.query<RelatedBrandRow>(`
          WITH live_totals AS MATERIALIZED (
            SELECT
              brand_key,
              COUNT(*)::integer AS live_product_count
            FROM bls_private.storefront_dropship_live_family lf
            CROSS JOIN LATERAL unnest(lf.brand_names_normalized) brand_key
            WHERE lf.sellable=true
              AND lf.available_until>now()
            GROUP BY brand_key
          ),
          overlap AS MATERIALIZED (
            SELECT
              brand_key,
              COUNT(DISTINCT category_code)::integer AS shared_category_count
            FROM bls_private.storefront_dropship_live_family lf
            CROSS JOIN LATERAL unnest(lf.brand_names_normalized) brand_key
            CROSS JOIN LATERAL unnest(lf.category_codes) category_code
            WHERE lf.sellable=true
              AND lf.available_until>now()
              AND lf.category_codes && $2::text[]
              AND brand_key<>$1
            GROUP BY brand_key
            ORDER BY shared_category_count DESC
            LIMIT 24
          )
          SELECT
            b.id,
            b.name,
            b.public_slug,
            b.logo_object_key,
            b.metadata->>'logo_external_url' AS logo_external_url,
            o.shared_category_count,
            t.live_product_count
          FROM overlap o
          JOIN live_totals t ON t.brand_key=o.brand_key
          JOIN public.brands b ON b.normalized_name=o.brand_key
          WHERE b.status='active'
          ORDER BY o.shared_category_count DESC,t.live_product_count DESC,lower(b.name)
          LIMIT 6
        `, [row.normalized_name, targetCategories]);

        relatedBrands = relatedResult.rows.map((related) => ({
          id: related.id,
          name: related.name,
          slug: related.public_slug,
          logoUrl: publicBrandLogoUrl(related.logo_object_key, related.logo_external_url),
          sharedCategoryCount: count(related.shared_category_count),
          liveProductCount: count(related.live_product_count)
        }));
      } catch (error) {
        console.warn(JSON.stringify({
          level: "warn",
          event: "brand_guide.related_brands_degraded",
          slug: cleanSlug,
          message: error instanceof Error ? error.message : String(error)
        }));
      }
    }

    const products = await getCachedCrawlerCatalogCards("23100", "", "", { brand: row.name }, 8)
      .catch((error) => {
        console.warn(JSON.stringify({
          level: "warn",
          event: "brand_guide.products_degraded",
          slug: cleanSlug,
          message: error instanceof Error ? error.message : String(error)
        }));
        return [];
      });

    // Local-only branded inventory is currently rare, but a bounded product
    // projection is authoritative. Preserve indexability if such a brand has
    // sellable local products even when it has no supplier-family row.
    liveProductCount = Math.max(liveProductCount, products.length);

    const signals = guideSignals(row, liveProductCount);
    const categories = allCategories.slice(0, 10);

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
      departments: departmentSummaries(allCategories, row.name),
      categories,
      relatedBrands,
      products,
      shopHref: brandShopHref(row.name)
    };
  },
  ["public-brand-guide-v3-live-family"],
  { revalidate: BRAND_GUIDE_CACHE_SECONDS }
);

export const getPublicBrandGuide = cache(async (slug: string): Promise<PublicBrandGuide | undefined> => {
  const cleanSlug = slug.trim().toLowerCase().slice(0, 180);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(cleanSlug)) return undefined;
  return cachedPublicBrandGuide(cleanSlug);
});

const cachedBrandDirectoryInventory = unstable_cache(
  async (): Promise<readonly BrandDirectoryRow[]> => {
    if (!productionDatabaseConfigured()) return [];
    const result = await getProductionPostgresRuntime().nativePool.query<BrandDirectoryRow>(`
      WITH live_counts AS (
        SELECT
          brand_key,
          COUNT(*)::integer AS live_product_count
        FROM bls_private.storefront_dropship_live_family lf
        CROSS JOIN LATERAL unnest(lf.brand_names_normalized) brand_key
        WHERE lf.sellable=true
          AND lf.available_until>now()
        GROUP BY brand_key
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
        counts.live_product_count
      FROM live_counts counts
      JOIN public.brands b ON b.normalized_name=counts.brand_key
      WHERE b.status='active'
      ORDER BY counts.live_product_count DESC,lower(b.name),b.id
    `);
    return result.rows;
  },
  ["public-brand-directory-v5-live-family-15m"],
  { revalidate: BRAND_DIRECTORY_CACHE_SECONDS }
);

export async function getPublicBrandDirectory(options: Readonly<{
  q?: string;
  letter?: string;
  limit?: number;
  offset?: number;
}> = {}): Promise<PublicBrandDirectory> {
  const limit = Math.max(12, Math.min(72, Math.trunc(options.limit ?? 48)));
  const offset = Math.max(0, Math.trunc(options.offset ?? 0));
  if (!productionDatabaseConfigured()) return { items: [], total: 0, limit, offset, hasMore: false };

  const query = options.q?.trim().slice(0, 100).toLocaleLowerCase("el-GR") ?? "";
  const letterCandidate = options.letter?.trim().toUpperCase();
  const letter = letterCandidate && /^[A-Z0-9]$/.test(letterCandidate) ? letterCandidate : "";

  const inventory = await cachedBrandDirectoryInventory();
  const filtered = inventory.filter((row) => {
    const queryMatch = !query
      || row.name.toLocaleLowerCase("el-GR").includes(query)
      || row.normalized_name.toLocaleLowerCase("el-GR").includes(query);
    const letterMatch = !letter || row.name.slice(0, 1).toUpperCase() === letter;
    return queryMatch && letterMatch;
  });

  const total = filtered.length;
  const page = filtered.slice(offset, offset + limit);
  const items = page.map((row) => {
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


export type PublicBrandSitemapEntry = Readonly<{
  slug: string;
  updatedAt: string;
}>;

export async function getIndexableBrandGuideSitemapInventory(): Promise<readonly PublicBrandSitemapEntry[]> {
  if (!productionDatabaseConfigured()) return [];
  const inventory = await cachedBrandDirectoryInventory();
  return inventory.flatMap((row) => {
    const liveProductCount = count(row.live_product_count);
    const signals = guideSignals(row, liveProductCount);
    return signals.indexable
      ? [{ slug: row.public_slug, updatedAt: row.updated_at }]
      : [];
  });
}
