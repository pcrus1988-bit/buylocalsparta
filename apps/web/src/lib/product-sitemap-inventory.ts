import { unstable_cache } from "next/cache";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { trustedCatalogSourceHttpsUrl } from "./trusted-catalog-source-url";

// Keep each cached projection comfortably below Next.js' 2 MB unstable_cache value ceiling.
// At ~97k active variants, 16 shards produced ~3.2 MB cache entries and therefore never cached.
export const PRODUCT_SITEMAP_SHARD_COUNT = 64;

export type PublicProductSitemapCandidate = Readonly<{
  id: string;
  slug: string;
  title: string;
  categoryCode: string;
  description?: string;
  brand?: string;
  gtin?: string;
  mpn?: string;
  mediaId?: string;
  sourceImageUrl?: string;
  sourceImageAvailable: boolean;
  offerAvailable: true;
  color?: string;
  sizes: readonly string[];
  duplicateTitleCount: number;
}>;

type SitemapCandidateRow = Readonly<{
  id: string;
  slug: string;
  title: string;
  category_code: string;
  description: string | null;
  brand: string | null;
  gtin: string | null;
  mpn: string | null;
  media_id: string | null;
  source_image_url: string | null;
  source_website: string | null;
  source_code: string | null;
  color: string | null;
  sizes: unknown;
  duplicate_title_count: number | string;
}>;

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function safeCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function stringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => typeof entry === "string" && entry.trim() ? [entry.trim()] : []);
}

function assertShard(shard: number): void {
  if (!Number.isSafeInteger(shard) || shard < 0 || shard >= PRODUCT_SITEMAP_SHARD_COUNT) {
    throw new RangeError(`Invalid product sitemap shard: ${shard}`);
  }
}

/**
 * Lightweight sitemap-only SEO projection.
 *
 * The catalogue is split into deterministic shards, but crawler requests must not
 * rescan the complete live offer/inventory graph. The sitemap reads the governed
 * storefront projection and overlays the incremental live supplier availability
 * table, including fresh-unavailable tombstones, before doing bounded media work.
 *
 * Commerce still revalidates authoritative stock at checkout; this path is only an
 * organic-discovery projection. The expression index on the stable 64-way shard key
 * keeps individual Google sitemap fetches bounded under supplier-ingestion load.
 */
async function readPublicProductSitemapInventory(shard: number | null): Promise<readonly PublicProductSitemapCandidate[]> {
  if (!productionDatabaseConfigured()) return [];
  if (shard !== null) assertShard(shard);

  const result = await getProductionPostgresRuntime().nativePool.query<SitemapCandidateRow>(`
    WITH public_base AS MATERIALIZED (
      SELECT
        rm.canonical_variant_id AS id,
        rm.canonical_public_id AS id_public,
        rm.slug,
        rm.category_code,
        rm.title,
        COALESCE(rm.description,'') AS description,
        rm.brand_name AS brand,
        rm.gtin,
        rm.mpn,
        rm.color,
        rm.sizes,
        COUNT(*) OVER (
          PARTITION BY lower(BTRIM(rm.title))
        )::int AS duplicate_title_count
      FROM public.storefront_catalog_read_model rm
      LEFT JOIN bls_private.storefront_dropship_live_family live
        ON rm.dropship_supplier_id IS NOT NULL
       AND live.supplier_id=rm.dropship_supplier_id::uuid
       AND live.external_product_id=rm.dropship_external_product_id
       AND live.available_until>now()
      WHERE (
          $1::integer IS NULL
          OR mod(get_byte(decode(md5(rm.canonical_public_id), 'hex'), 0), $2::integer)=$1::integer
        )
        AND (
          (rm.local_sellable=true AND rm.local_available_until>now())
          OR (live.supplier_id IS NOT NULL AND live.sellable=true)
          OR (
            live.supplier_id IS NULL
            AND rm.dropship_sellable=true
            AND rm.dropship_available_until>now()
          )
        )
    ), approved_media AS MATERIALIZED (
      SELECT DISTINCT ON (pm.canonical_variant_id)
             pm.canonical_variant_id,pm.public_id AS media_id
      FROM public_base base
      JOIN product_media pm ON pm.canonical_variant_id=base.id
      WHERE pm.kind='image'
        AND pm.scan_status='clean'
        AND pm.rights_status='approved'
        AND pm.moderation_status='approved'
        AND pm.object_key IS NOT NULL
        AND pm.content_type IN ('image/jpeg','image/png','image/webp')
      ORDER BY pm.canonical_variant_id,pm.reviewed_at DESC NULLS LAST,pm.created_at DESC,pm.public_id
    ), approved_source_media AS MATERIALIZED (
      SELECT DISTINCT ON (pm.canonical_variant_id)
             pm.canonical_variant_id,
             pm.source_url AS source_image_url,
             cs.website AS source_website,
             cs.code AS source_code
      FROM public_base base
      JOIN product_media pm ON pm.canonical_variant_id=base.id
      JOIN catalog_sources cs ON cs.id=pm.source_id AND cs.active=true
      WHERE pm.kind='image'
        AND pm.scan_status='clean'
        AND pm.rights_status='approved'
        AND pm.moderation_status='approved'
        AND pm.source_url IS NOT NULL
      ORDER BY pm.canonical_variant_id,pm.sort_order ASC,pm.reviewed_at DESC NULLS LAST,pm.created_at ASC,pm.id
    )
    SELECT
      base.id_public AS id,
      base.slug,
      base.title,
      base.category_code,
      NULLIF(BTRIM(base.description),'') AS description,
      base.brand,
      base.gtin,
      base.mpn,
      media.media_id,
      source_media.source_image_url,
      source_media.source_website,
      source_media.source_code,
      base.color,
      base.sizes,
      base.duplicate_title_count
    FROM public_base base
    LEFT JOIN approved_media media ON media.canonical_variant_id=base.id
    LEFT JOIN approved_source_media source_media ON source_media.canonical_variant_id=base.id
    ORDER BY base.id_public
  `, [shard, PRODUCT_SITEMAP_SHARD_COUNT]);

  return result.rows.map((row) => {
    const sourceImageUrl = trustedCatalogSourceHttpsUrl(row.source_code, row.source_website, row.source_image_url);
    return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    categoryCode: row.category_code,
    description: text(row.description),
    brand: text(row.brand),
    gtin: text(row.gtin),
    mpn: text(row.mpn),
    mediaId: text(row.media_id),
    sourceImageUrl,
    sourceImageAvailable: Boolean(sourceImageUrl),
    offerAvailable: true as const,
    color: text(row.color),
    sizes: stringArray(row.sizes),
    duplicateTitleCount: safeCount(row.duplicate_title_count)
    };
  });
}

const cachedPublicProductSitemapInventory = unstable_cache(
  () => readPublicProductSitemapInventory(null),
  ["public-product-sitemap-inventory-v4"],
  { revalidate: 900 }
);

const cachedPublicProductSitemapShard = unstable_cache(
  (shard: number) => readPublicProductSitemapInventory(shard),
  ["public-product-sitemap-inventory-shard-v8-direct-source-images-64"],
  { revalidate: 3600 }
);

/** Legacy full projection retained for existing verifier/admin contracts. */
export function getPublicProductSitemapInventory(): Promise<readonly PublicProductSitemapCandidate[]> {
  return cachedPublicProductSitemapInventory();
}

/** Scale-safe projection used by the production product sitemap shards. */
export function getPublicProductSitemapInventoryShard(shard: number): Promise<readonly PublicProductSitemapCandidate[]> {
  assertShard(shard);
  return cachedPublicProductSitemapShard(shard);
}
