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

function trustedSourceImageAvailable(
  sourceCode: string | null,
  sourceWebsite: string | null,
  sourceImageUrl: string | null
): boolean {
  return Boolean(trustedCatalogSourceHttpsUrl(sourceCode, sourceWebsite, sourceImageUrl));
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
        rm.sizes
      FROM public.storefront_catalog_read_model rm
      WHERE (
          $1::integer IS NULL
          OR mod(get_byte(decode(md5(rm.canonical_public_id), 'hex'), 0), $2::integer)=$1::integer
        )
        AND (
          (rm.local_sellable=true AND rm.local_available_until>now())
          OR (
            rm.dropship_sellable=true
            AND rm.dropship_available_until>now()
            AND NOT EXISTS (
              SELECT 1
              FROM bls_private.storefront_dropship_live_family live_shadow
              WHERE live_shadow.supplier_id::text=rm.dropship_supplier_id
                AND live_shadow.external_product_id=rm.dropship_external_product_id
                AND live_shadow.available_until>now()
            )
          )
          OR EXISTS (
            SELECT 1
            FROM bls_private.storefront_dropship_live_family live
            WHERE live.supplier_id::text=rm.dropship_supplier_id
              AND live.external_product_id=rm.dropship_external_product_id
              AND live.sellable=true
              AND live.available_until>now()
          )
        )
    ), title_counts AS MATERIALIZED (
      SELECT lower(BTRIM(rm.title)) AS title_key,
             GREATEST(1,COUNT(*))::int AS duplicate_title_count
      FROM public.storefront_catalog_read_model rm
      GROUP BY lower(BTRIM(rm.title))
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
    ), source_media AS MATERIALIZED (
      SELECT DISTINCT ON (csl.canonical_variant_id)
             csl.canonical_variant_id,sp.source_image_url,cs.website AS source_website,cs.code AS source_code
      FROM public_base base
      JOIN catalog_source_product_links csl
        ON csl.canonical_variant_id=base.id
       AND csl.link_status='approved'
      JOIN catalog_source_products sp
        ON sp.id=csl.source_product_id
       AND sp.source_image_url IS NOT NULL
      JOIN catalog_sources cs ON cs.id=sp.source_id AND cs.active=true
      ORDER BY csl.canonical_variant_id,csl.confidence DESC,csl.updated_at DESC,csl.id DESC
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
      source.source_image_url,
      source.source_website,
      source.source_code,
      base.color,
      base.sizes,
      counts.duplicate_title_count
    FROM public_base base
    JOIN title_counts counts ON counts.title_key=lower(BTRIM(base.title))
    LEFT JOIN approved_media media ON media.canonical_variant_id=base.id
    LEFT JOIN source_media source ON source.canonical_variant_id=base.id
    ORDER BY base.id_public
  `, [shard, PRODUCT_SITEMAP_SHARD_COUNT]);

  return result.rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    categoryCode: row.category_code,
    description: text(row.description),
    brand: text(row.brand),
    gtin: text(row.gtin),
    mpn: text(row.mpn),
    mediaId: text(row.media_id),
    sourceImageAvailable: trustedSourceImageAvailable(row.source_code, row.source_website, row.source_image_url),
    offerAvailable: true as const,
    color: text(row.color),
    sizes: stringArray(row.sizes),
    duplicateTitleCount: safeCount(row.duplicate_title_count)
  }));
}

const cachedPublicProductSitemapInventory = unstable_cache(
  () => readPublicProductSitemapInventory(null),
  ["public-product-sitemap-inventory-v4"],
  { revalidate: 900 }
);

const cachedPublicProductSitemapShard = unstable_cache(
  (shard: number) => readPublicProductSitemapInventory(shard),
  ["public-product-sitemap-inventory-shard-v6-read-model-live-overlay-64"],
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
