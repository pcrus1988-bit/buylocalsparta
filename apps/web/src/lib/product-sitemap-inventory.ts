import { unstable_cache } from "next/cache";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export const PRODUCT_SITEMAP_SHARD_COUNT = 16;

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
  color: string | null;
  sizes: unknown;
  image_link: string | null;
}>;

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

function merchantImageSignals(id: string, imageLink: string | null): Readonly<{ mediaId?: string; sourceImageAvailable: boolean }> {
  const value = text(imageLink);
  if (!value) return { sourceImageAvailable: false };
  try {
    const image = new URL(value);
    if (image.protocol !== "https:") return { sourceImageAvailable: false };
    const normalizedHost = image.hostname.toLowerCase().replace(/^www\./, "");
    if (normalizedHost === "kontamou.site") {
      const mediaMatch = image.pathname.match(/^\/api\/media\/([^/]+)$/);
      if (mediaMatch?.[1]) return { mediaId: decodeURIComponent(mediaMatch[1]), sourceImageAvailable: false };
      if (image.pathname === `/api/catalog-source-image/${encodeURIComponent(id)}`) {
        return { sourceImageAvailable: true };
      }
    }
    // Merchant sync only persists a product after its image passed the governed
    // approved-media/catalogue-source resolver. External imageLink therefore means
    // the product has an approved catalogue-source image that our same-origin proxy
    // can expose without leaking the upstream supplier URL in the public sitemap.
    return { sourceImageAvailable: true };
  } catch {
    return { sourceImageAvailable: false };
  }
}

/**
 * Fast sitemap-only SEO projection.
 *
 * Google Merchant synchronization already does the expensive live-offer, price,
 * stock and governed-image admission work and persists the successful payload.
 * Recomputing the complete commerce graph on every Googlebot sitemap request made
 * each shard take tens of seconds and caused crawler timeouts. Sitemaps now read
 * that durable successful projection, prefer Greek copy when available, and keep
 * the public image URL on KONTA MOY through the existing media/source-image proxy.
 *
 * Availability on landing pages and Merchant Center is still reconciled separately;
 * a sitemap is a discovery document and must remain fast and stable.
 */
async function readPublicProductSitemapInventory(shard: number | null): Promise<readonly PublicProductSitemapCandidate[]> {
  if (!productionDatabaseConfigured()) return [];
  if (shard !== null) assertShard(shard);

  const result = await getProductionPostgresRuntime().nativePool.query<SitemapCandidateRow>(`
    WITH preferred AS MATERIALIZED (
      SELECT DISTINCT ON (mps.offer_id)
        mps.offer_id AS id,
        mps.canonical_variant_id,
        mps.last_submitted_payload
      FROM public.merchant_product_sync mps
      WHERE mps.merchant_account_id='5849642952'
        AND mps.feed_label='GR'
        AND mps.sync_status='synced'
        AND mps.content_language IN ('el','en')
        AND (mps.last_submitted_payload->'productAttributes'->>'availability')='IN_STOCK'
        AND (
          $1::integer IS NULL
          OR mod(get_byte(decode(md5(mps.offer_id),'hex'),0),$2::integer)=$1::integer
        )
      ORDER BY
        mps.offer_id,
        CASE WHEN mps.content_language='el' THEN 0 ELSE 1 END,
        mps.last_success_at DESC NULLS LAST
    )
    SELECT
      preferred.id,
      cv.slug,
      c.code AS category_code,
      preferred.last_submitted_payload->'productAttributes'->>'title' AS title,
      preferred.last_submitted_payload->'productAttributes'->>'description' AS description,
      preferred.last_submitted_payload->'productAttributes'->>'brand' AS brand,
      COALESCE(cv.gtin,preferred.last_submitted_payload->'productAttributes'->'gtins'->>0) AS gtin,
      COALESCE(cv.mpn,preferred.last_submitted_payload->'productAttributes'->>'mpn') AS mpn,
      NULLIF(BTRIM(COALESCE(
        preferred.last_submitted_payload->'productAttributes'->>'color',
        cv.variant_attributes->>'color',
        ''
      )),'') AS color,
      CASE
        WHEN jsonb_typeof(COALESCE(cv.variant_attributes->'sizes_observed','[]'::jsonb))='array'
        THEN COALESCE(cv.variant_attributes->'sizes_observed','[]'::jsonb)
        ELSE '[]'::jsonb
      END AS sizes,
      preferred.last_submitted_payload->'productAttributes'->>'imageLink' AS image_link
    FROM preferred
    JOIN public.canonical_variants cv ON cv.id=preferred.canonical_variant_id
    JOIN public.markets m ON m.id=cv.market_id AND m.code='sparta'
    JOIN public.categories c ON c.id=cv.category_id
    WHERE cv.active=true
      AND cv.suppressed=false
      AND cv.recalled=false
      AND COALESCE(cv.commerce_channel,'normal')='normal'
      AND NULLIF(BTRIM(preferred.last_submitted_payload->'productAttributes'->>'title'),'') IS NOT NULL
      AND NULLIF(BTRIM(preferred.last_submitted_payload->'productAttributes'->>'description'),'') IS NOT NULL
      AND NULLIF(BTRIM(preferred.last_submitted_payload->'productAttributes'->>'imageLink'),'') IS NOT NULL
    ORDER BY preferred.id
  `, [shard, PRODUCT_SITEMAP_SHARD_COUNT]);

  return result.rows.map((row) => {
    const image = merchantImageSignals(row.id, row.image_link);
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      categoryCode: row.category_code,
      description: text(row.description),
      brand: text(row.brand),
      gtin: text(row.gtin),
      mpn: text(row.mpn),
      mediaId: image.mediaId,
      sourceImageAvailable: image.sourceImageAvailable,
      offerAvailable: true as const,
      color: text(row.color),
      sizes: stringArray(row.sizes),
      // Merchant admission has already required differentiated product identity.
      // Avoid an expensive catalogue-wide duplicate-title regroup on every shard.
      duplicateTitleCount: 1
    };
  });
}

const cachedPublicProductSitemapInventory = unstable_cache(
  () => readPublicProductSitemapInventory(null),
  ["public-product-sitemap-inventory-v5"],
  { revalidate: 900 }
);

const cachedPublicProductSitemapShard = unstable_cache(
  (shard: number) => readPublicProductSitemapInventory(shard),
  ["public-product-sitemap-inventory-shard-v4"],
  { revalidate: 900 }
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
