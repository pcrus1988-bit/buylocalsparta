import { unstable_cache } from "next/cache";
import { getSeoGlobalSettingsSnapshot } from "../../../../lib/seo-settings";
import { getSeoEntityOverridesSnapshot } from "../../../../lib/seo-entity-overrides";
import { findSeoEntityOverride, resolveSeoEntityControl, type SeoEntityReference } from "../../../../lib/seo-entity-policy";
import { productPublicPath } from "../../../../lib/product-url";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../../../lib/postgres-runtime";
import { PRODUCT_SITEMAP_SHARD_COUNT } from "../../../../lib/product-sitemap-inventory";

export const dynamic = "force-dynamic";

type RouteContext = Readonly<{ params: Promise<{ shard: string }> }>;

type SitemapRouteCandidate = Readonly<{
  id: string;
  slug: string;
  entityEligible: boolean;
  defaultIndexAllowed: boolean;
}>;

type SitemapRouteRow = Readonly<{
  id: string;
  slug: string;
  entity_eligible: boolean;
  default_index_allowed: boolean;
}>;

const HEX_SHARDS = "0123456789abcdef";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function safeLastModified(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function assertShard(shard: number): void {
  if (!Number.isSafeInteger(shard) || shard < 0 || shard >= PRODUCT_SITEMAP_SHARD_COUNT) {
    throw new RangeError(`Invalid product sitemap shard: ${shard}`);
  }
}

function shardBounds(shard: number): readonly [string, string] {
  assertShard(shard);
  const lower = HEX_SHARDS[shard];
  const upper = shard === PRODUCT_SITEMAP_SHARD_COUNT - 1 ? "g" : HEX_SHARDS[shard + 1];
  return [lower, upper];
}

/**
 * Production sitemap projection.
 *
 * This deliberately starts from one UUID-prefix shard before touching offers,
 * inventory, translations or source media. The old sitemap path rebuilt the whole
 * catalogue, global duplicate-title analytics and media projections for every
 * crawler request. That work belongs in enrichment/admin verification, not in the
 * public XML request path.
 *
 * Hard public-admission rules remain here: active/safe canonical product, active
 * vendor/location, category visibility, valid price/cost ceiling, fresh positive
 * stock, a meaningful title/category, and a governed public image. The ordinary
 * quality score is reduced to its equivalent request-time minimum: once title,
 * category and image are present, description or a public identity/differentiator
 * is required to reach the normal product indexing threshold.
 */
async function readPublicProductSitemapRouteShard(shard: number): Promise<readonly SitemapRouteCandidate[]> {
  if (!productionDatabaseConfigured()) return [];
  const [lowerBound, upperBound] = shardBounds(shard);

  const result = await getProductionPostgresRuntime().nativePool.query<SitemapRouteRow>(`
    WITH RECURSIVE hidden_category AS (
      SELECT vcv.vendor_id, vcv.category_id
      FROM vendor_category_visibility vcv
      WHERE vcv.visible=false

      UNION

      SELECT hidden.vendor_id, child.id
      FROM hidden_category hidden
      JOIN categories child ON child.parent_id=hidden.category_id
    ), blocked_category AS MATERIALIZED (
      SELECT DISTINCT vendor_id, category_id
      FROM hidden_category
    ), shard_base AS MATERIALIZED (
      SELECT
        cv.id AS variant_id,
        cv.public_id AS id,
        cv.slug,
        cv.category_id,
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
          WHEN jsonb_typeof(COALESCE(
            el.specifications->'sizes',
            en.specifications->'sizes',
            cv.variant_attributes->'sizes_observed',
            '[]'::jsonb
          ))='array'
          THEN COALESCE(
            el.specifications->'sizes',
            en.specifications->'sizes',
            cv.variant_attributes->'sizes_observed',
            '[]'::jsonb
          )
          ELSE '[]'::jsonb
        END AS sizes
      FROM canonical_variants cv
      JOIN markets m ON m.id=cv.market_id AND m.code='sparta'
      JOIN categories c ON c.id=cv.category_id
      LEFT JOIN product_families pf ON pf.id=cv.family_id
      LEFT JOIN brands b ON b.id=COALESCE(cv.brand_id,pf.brand_id)
      LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      WHERE cv.public_id >= $1
        AND cv.public_id < $2
        AND COALESCE(cv.commerce_channel,'normal')='normal'
        AND cv.active=true
        AND cv.suppressed=false
        AND cv.recalled=false
    ), sellable AS MATERIALIZED (
      SELECT base.*
      FROM shard_base base
      JOIN vendor_offers vo ON vo.canonical_variant_id=base.variant_id
      JOIN vendor_businesses v ON v.id=vo.vendor_id AND v.status='active'
      JOIN vendor_locations l ON l.id=vo.location_id AND l.active=true
      JOIN inventory_balances ib ON ib.offer_id=vo.id
      WHERE vo.status='approved'
        AND vo.merchant_visible=true
        AND vo.merchant_pause_active=false
        AND vo.customer_price_minor>0
        AND 'pickup'::fulfilment_mode=ANY(vo.fulfilment_modes)
        AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
        AND GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)>=1
        AND ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds)>now()
        AND NOT EXISTS (
          SELECT 1
          FROM blocked_category blocked
          WHERE blocked.vendor_id=vo.vendor_id
            AND blocked.category_id=base.category_id
        )

      UNION

      SELECT base.*
      FROM shard_base base
      JOIN vendor_offers vo ON vo.canonical_variant_id=base.variant_id
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
        AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
        AND dso.active=true
        AND dso.cached_available=true
        AND dso.cached_quantity>=1
        AND dso.availability_expires_at IS NOT NULL
        AND dso.availability_expires_at>now()
        AND NOT EXISTS (
          SELECT 1
          FROM blocked_category blocked
          WHERE blocked.vendor_id=vo.vendor_id
            AND blocked.category_id=base.category_id
        )
    ), quality AS (
      SELECT
        product.*,
        (
          EXISTS (
            SELECT 1
            FROM product_media pm
            WHERE pm.canonical_variant_id=product.variant_id
              AND pm.kind='image'
              AND pm.scan_status='clean'
              AND pm.rights_status='approved'
              AND pm.moderation_status='approved'
              AND pm.object_key IS NOT NULL
              AND pm.content_type IN ('image/jpeg','image/png','image/webp')
          )
          OR EXISTS (
            SELECT 1
            FROM catalog_source_product_links csl
            JOIN catalog_source_products sp
              ON sp.id=csl.source_product_id
             AND sp.source_image_url IS NOT NULL
            JOIN catalog_sources cs
              ON cs.id=sp.source_id
             AND cs.active=true
            WHERE csl.canonical_variant_id=product.variant_id
              AND csl.link_status='approved'
              AND lower(cs.website) LIKE 'https://%'
              AND (
                (
                  sp.source_image_url !~* '^[a-z][a-z0-9+.-]*://'
                  AND sp.source_image_url !~ '^//'
                )
                OR (
                  lower(sp.source_image_url) LIKE 'https://%'
                  AND regexp_replace(split_part(split_part(lower(cs.website),'://',2),'/',1),'^www\\.','')
                    = regexp_replace(split_part(split_part(lower(sp.source_image_url),'://',2),'/',1),'^www\\.','')
                )
                OR (
                  sp.source_image_url LIKE '//%'
                  AND regexp_replace(split_part(split_part(lower(cs.website),'://',2),'/',1),'^www\\.','')
                    = regexp_replace(split_part(split_part(lower('https:' || sp.source_image_url),'://',2),'/',1),'^www\\.','')
                )
              )
          )
        ) AS has_image
      FROM sellable product
    )
    SELECT
      id,
      slug,
      (
        length(BTRIM(title))>=3
        AND BTRIM(title) !~* '^(test|demo|dummy|sample|placeholder|δοκιμ(ή|η)|δοκιμαστικ(ό|ο))(\\s|[-_:/#]|$)'
        AND length(BTRIM(category_code))>=2
        AND has_image
      ) AS entity_eligible,
      (
        length(BTRIM(title))>=3
        AND BTRIM(title) !~* '^(test|demo|dummy|sample|placeholder|δοκιμ(ή|η)|δοκιμαστικ(ό|ο))(\\s|[-_:/#]|$)'
        AND length(BTRIM(category_code))>=2
        AND has_image
        AND (
          length(BTRIM(description))>=60
          OR length(BTRIM(COALESCE(brand,'')))>=2
          OR length(BTRIM(COALESCE(gtin,'')))>=8
          OR length(BTRIM(COALESCE(mpn,'')))>=2
          OR length(BTRIM(COALESCE(color,'')))>=2
          OR jsonb_array_length(sizes)>0
        )
      ) AS default_index_allowed
    FROM quality
    ORDER BY id
  `, [lowerBound, upperBound]);

  return result.rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    entityEligible: row.entity_eligible,
    defaultIndexAllowed: row.default_index_allowed
  }));
}

const cachedPublicProductSitemapRouteShard = unstable_cache(
  (shard: number) => readPublicProductSitemapRouteShard(shard),
  ["public-product-sitemap-route-shard-v3"],
  { revalidate: 900 }
);

export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const { shard: shardSegment } = await params;
  const rawShard = shardSegment.endsWith(".xml") ? shardSegment.slice(0, -4) : shardSegment;
  const shard = Number(rawShard);
  if (!/^\d+$/.test(rawShard) || !Number.isSafeInteger(shard) || shard < 0 || shard >= PRODUCT_SITEMAP_SHARD_COUNT) {
    return new Response("Not found", { status: 404 });
  }

  const [{ settings }, overrideSnapshot] = await Promise.all([
    getSeoGlobalSettingsSnapshot(),
    getSeoEntityOverridesSnapshot()
  ]);

  if (!settings.indexingEnabled || !settings.sitemap.products) {
    return new Response('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', {
      status: 200,
      headers: { "Content-Type": "application/xml; charset=utf-8" }
    });
  }

  let products: readonly SitemapRouteCandidate[];
  try {
    products = await cachedPublicProductSitemapRouteShard(shard);
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "seo.product_sitemap_shard_failed", shard, message: String(error) }));
    return new Response("Sitemap temporarily unavailable", {
      status: 503,
      headers: { "Retry-After": "60" }
    });
  }

  const origin = settings.canonicalOrigin;
  const urls = products.flatMap((product) => {
    const reference: SeoEntityReference = { kind: "product", id: product.id };
    const override = findSeoEntityOverride(overrideSnapshot.entries, reference);
    const control = resolveSeoEntityControl({
      settings,
      kind: reference.kind,
      entityEligible: product.entityEligible,
      defaultIndexAllowed: product.defaultIndexAllowed,
      override
    });
    if (!control.sitemapAllowed) return [];

    const url = new URL(override?.canonicalPath ?? productPublicPath(product), `${origin}/`).toString();
    return [{ url, lastModified: safeLastModified(override?.lastReviewedAt) }];
  });

  const deduped = [...new Map(urls.map((entry) => [entry.url, entry])).values()];
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...deduped.map((entry) => [
      "  <url>",
      `    <loc>${escapeXml(entry.url)}</loc>`,
      ...(entry.lastModified ? [`    <lastmod>${entry.lastModified}</lastmod>`] : []),
      "    <changefreq>daily</changefreq>",
      "    <priority>0.75</priority>",
      "  </url>"
    ].join("\n")),
    "</urlset>"
  ].join("\n");

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600"
    }
  });
}
