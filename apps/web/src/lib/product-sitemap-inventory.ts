import { unstable_cache } from "next/cache";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { trustedCatalogSourceHttpsUrl } from "./trusted-catalog-source-url";

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
 * The catalogue is intentionally split into deterministic shards. Every canonical
 * public product is assigned by a stable MD5 byte derived from its public ID, so
 * adding or removing products does not renumber the rest of the sitemap. The shard
 * predicate is applied inside the live-offer branches so each request only performs
 * expensive availability/media work for its own slice. Duplicate-title counts are
 * then looked up globally only for the titles present in that slice.
 *
 * Work is ordered from the selective sellable-offer gate outward. Safety,
 * publication, merchant visibility, category visibility, stock freshness, cost
 * ceiling and governed media/source-image gates remain authoritative.
 */
async function readPublicProductSitemapInventory(shard: number | null): Promise<readonly PublicProductSitemapCandidate[]> {
  if (!productionDatabaseConfigured()) return [];
  if (shard !== null) assertShard(shard);

  const result = await getProductionPostgresRuntime().nativePool.query<SitemapCandidateRow>(`
    WITH eligible_offer AS MATERIALIZED (
      SELECT DISTINCT vo.canonical_variant_id
      FROM vendor_offers vo
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
      JOIN vendor_businesses v ON v.id=vo.vendor_id AND v.status='active'
      JOIN vendor_locations l ON l.id=vo.location_id AND l.active=true
      JOIN inventory_balances ib ON ib.offer_id=vo.id
      WHERE vo.status='approved'
        AND vo.merchant_visible=true
        AND vo.merchant_pause_active=false
        AND vo.customer_price_minor>0
        AND (
          $1::integer IS NULL
          OR mod(get_byte(decode(md5(cv.public_id), 'hex'), 0), $2::integer)=$1::integer
        )
        AND 'pickup'::fulfilment_mode=ANY(vo.fulfilment_modes)
        AND bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id)
        AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
        AND GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)>=1
        AND ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds)>now()

      UNION

      SELECT DISTINCT vo.canonical_variant_id
      FROM vendor_offers vo
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
      JOIN vendor_businesses v ON v.id=vo.vendor_id AND v.status='active'
      JOIN vendor_locations l ON l.id=vo.location_id AND l.active=true
      JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
      JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
        AND ds.active=true
        AND ds.api_authoritative_availability=true
      WHERE vo.status='approved'
        AND vo.merchant_visible=true
        AND vo.merchant_pause_active=false
        AND vo.customer_price_minor>0
        AND (
          $1::integer IS NULL
          OR mod(get_byte(decode(md5(cv.public_id), 'hex'), 0), $2::integer)=$1::integer
        )
        AND bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id)
        AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
        AND dso.active=true
        AND dso.cached_available=true
        AND (dso.cached_quantity IS NULL OR dso.cached_quantity>=1)
        AND dso.availability_expires_at IS NOT NULL
        AND dso.availability_expires_at>now()
    ), public_base AS MATERIALIZED (
      SELECT
        cv.id,
        cv.public_id AS id_public,
        cv.slug,
        c.code AS category_code,
        COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
        COALESCE(el.description,en.description,'') AS description,
        b.name AS brand,
        cv.gtin,
        cv.mpn,
        NULLIF(BTRIM(COALESCE(
          el.specifications->>'color',
          en.specifications->>'color',
          cv.variant_attributes->>'color',
          ''
        )),'') AS color,
        CASE
          WHEN jsonb_typeof(COALESCE(el.specifications->'sizes',en.specifications->'sizes',cv.variant_attributes->'sizes_observed','[]'::jsonb))='array'
          THEN COALESCE(el.specifications->'sizes',en.specifications->'sizes',cv.variant_attributes->'sizes_observed','[]'::jsonb)
          ELSE '[]'::jsonb
        END AS sizes
      FROM eligible_offer eo
      JOIN canonical_variants cv ON cv.id=eo.canonical_variant_id
      JOIN markets m ON m.id=cv.market_id AND m.code='sparta'
      JOIN categories c ON c.id=cv.category_id
      LEFT JOIN product_families pf ON pf.id=cv.family_id
      LEFT JOIN brands b ON b.id=COALESCE(cv.brand_id,pf.brand_id)
      LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      WHERE COALESCE(cv.commerce_channel,'normal')='normal'
        AND cv.active=true
        AND cv.suppressed=false
        AND cv.recalled=false
    ), selected_titles AS MATERIALIZED (
      SELECT DISTINCT lower(BTRIM(title)) AS title_key
      FROM public_base
    ), title_counts AS MATERIALIZED (
      SELECT selected.title_key,
             GREATEST(1,COUNT(rm.canonical_public_id))::int AS duplicate_title_count
      FROM selected_titles selected
      LEFT JOIN public.storefront_catalog_read_model rm
        ON lower(BTRIM(rm.title))=selected.title_key
      GROUP BY selected.title_key
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
  ["public-product-sitemap-inventory-shard-v3"],
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
