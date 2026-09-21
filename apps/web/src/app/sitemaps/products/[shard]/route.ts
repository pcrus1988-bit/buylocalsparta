import { unstable_cache } from "next/cache";
import { getSeoGlobalSettingsSnapshot } from "../../../../lib/seo-settings";
import { getSeoEntityOverridesSnapshot } from "../../../../lib/seo-entity-overrides";
import { findSeoEntityOverride, resolveSeoEntityControl, type SeoEntityReference } from "../../../../lib/seo-entity-policy";
import { productPublicPath } from "../../../../lib/product-url";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../../../lib/postgres-runtime";
import { PRODUCT_SITEMAP_SHARD_COUNT } from "../../../../lib/product-sitemap-inventory";

export const dynamic = "force-dynamic";

type RouteContext = Readonly<{ params: Promise<{ shard: string }> }>;
type SitemapRouteCandidate = Readonly<{ id: string; slug: string; entityEligible: boolean; defaultIndexAllowed: boolean }>;
type SitemapRouteRow = Readonly<{ id: string; slug: string; entity_eligible: boolean; default_index_allowed: boolean }>;
type SitemapProjectionHealthRow = Readonly<{ sellable_count: string; fresh_sellable_count: string }>;

const HEX_SHARDS = "0123456789abcdef";

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function safeLastModified(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function assertShard(shard: number): void {
  if (!Number.isSafeInteger(shard) || shard < 0 || shard >= PRODUCT_SITEMAP_SHARD_COUNT) throw new RangeError(`Invalid product sitemap shard: ${shard}`);
}

function shardBounds(shard: number): readonly [string, string] {
  assertShard(shard);
  const lower = HEX_SHARDS[shard];
  const upper = shard === PRODUCT_SITEMAP_SHARD_COUNT - 1 ? "g" : HEX_SHARDS[shard + 1];
  return [lower, upper];
}

async function readPublicProductSitemapRouteShard(shard: number): Promise<readonly SitemapRouteCandidate[]> {
  if (!productionDatabaseConfigured()) return [];
  const [lowerBound, upperBound] = shardBounds(shard);
  const result = await getProductionPostgresRuntime().nativePool.query<SitemapRouteRow>(`
    SELECT rm.canonical_public_id AS id, rm.slug,
      (length(BTRIM(rm.title))>=3 AND BTRIM(rm.title) !~* '^(test|demo|dummy|sample|placeholder|δοκιμ(ή|η)|δοκιμαστικ(ό|ο))(\\s|[-_:/#]|$)' AND length(BTRIM(rm.category_code))>=2) AS entity_eligible,
      (length(BTRIM(rm.title))>=3 AND BTRIM(rm.title) !~* '^(test|demo|dummy|sample|placeholder|δοκιμ(ή|η)|δοκιμαστικ(ό|ο))(\\s|[-_:/#]|$)' AND length(BTRIM(rm.category_code))>=2 AND (length(BTRIM(rm.description))>=60 OR length(BTRIM(COALESCE(rm.brand_name,'')))>=2 OR length(BTRIM(COALESCE(rm.gtin,'')))>=8 OR length(BTRIM(COALESCE(rm.mpn,'')))>=2 OR length(BTRIM(COALESCE(rm.color,'')))>=2 OR (jsonb_typeof(rm.sizes)='array' AND jsonb_array_length(rm.sizes)>0))) AS default_index_allowed
    FROM public.storefront_catalog_read_model rm
    WHERE rm.canonical_public_id >= $1 AND rm.canonical_public_id < $2 AND rm.eligible_offer_count>0
      AND ((rm.local_sellable=true AND rm.local_available_until>now()) OR (rm.dropship_sellable=true AND rm.dropship_available_until>now()))
    ORDER BY rm.canonical_public_id
  `, [lowerBound, upperBound]);
  return result.rows.map((row) => ({ id: row.id, slug: row.slug, entityEligible: row.entity_eligible, defaultIndexAllowed: row.default_index_allowed }));
}

async function readProductSitemapProjectionHealth(): Promise<Readonly<{ sellableCount: number; freshSellableCount: number }>> {
  if (!productionDatabaseConfigured()) return { sellableCount: 0, freshSellableCount: 0 };
  const result = await getProductionPostgresRuntime().nativePool.query<SitemapProjectionHealthRow>(`
    SELECT
      COUNT(*) FILTER (WHERE rm.local_sellable=true OR rm.dropship_sellable=true)::text AS sellable_count,
      COUNT(*) FILTER (WHERE (rm.local_sellable=true AND rm.local_available_until>now()) OR (rm.dropship_sellable=true AND rm.dropship_available_until>now()))::text AS fresh_sellable_count
    FROM public.storefront_catalog_read_model rm
    WHERE rm.eligible_offer_count>0
  `);
  const row = result.rows[0];
  return { sellableCount: Number(row?.sellable_count ?? 0), freshSellableCount: Number(row?.fresh_sellable_count ?? 0) };
}

const cachedPublicProductSitemapRouteShard = unstable_cache((shard: number) => readPublicProductSitemapRouteShard(shard), ["public-product-sitemap-route-shard-v4"], { revalidate: 900 });
const cachedProductSitemapProjectionHealth = unstable_cache(() => readProductSitemapProjectionHealth(), ["public-product-sitemap-projection-health-v1"], { revalidate: 60 });

export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const { shard: shardSegment } = await params;
  const rawShard = shardSegment.endsWith(".xml") ? shardSegment.slice(0, -4) : shardSegment;
  const shard = Number(rawShard);
  if (!/^\d+$/.test(rawShard) || !Number.isSafeInteger(shard) || shard < 0 || shard >= PRODUCT_SITEMAP_SHARD_COUNT) return new Response("Not found", { status: 404 });

  const [{ settings }, overrideSnapshot] = await Promise.all([getSeoGlobalSettingsSnapshot(), getSeoEntityOverridesSnapshot()]);
  if (!settings.indexingEnabled || !settings.sitemap.products) {
    return new Response('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', { status: 200, headers: { "Content-Type": "application/xml; charset=utf-8" } });
  }

  let products: readonly SitemapRouteCandidate[];
  try {
    products = await cachedPublicProductSitemapRouteShard(shard);
    if (products.length === 0) {
      const health = await cachedProductSitemapProjectionHealth();
      if (health.sellableCount > 0 && health.freshSellableCount === 0) {
        console.error(JSON.stringify({ level: "error", event: "seo.product_sitemap_projection_stale", shard, sellableCount: health.sellableCount, freshSellableCount: health.freshSellableCount }));
        return new Response("Sitemap temporarily unavailable", { status: 503, headers: { "Retry-After": "300", "Cache-Control": "private, no-store" } });
      }
    }
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "seo.product_sitemap_shard_failed", shard, message: String(error) }));
    return new Response("Sitemap temporarily unavailable", { status: 503, headers: { "Retry-After": "60", "Cache-Control": "private, no-store" } });
  }

  const origin = settings.canonicalOrigin;
  const urls = products.flatMap((product) => {
    const reference: SeoEntityReference = { kind: "product", id: product.id };
    const override = findSeoEntityOverride(overrideSnapshot.entries, reference);
    const control = resolveSeoEntityControl({ settings, kind: reference.kind, entityEligible: product.entityEligible, defaultIndexAllowed: product.defaultIndexAllowed, override });
    if (!control.sitemapAllowed) return [];
    const url = new URL(override?.canonicalPath ?? productPublicPath(product), `${origin}/`).toString();
    return [{ url, lastModified: safeLastModified(override?.lastReviewedAt) }];
  });

  const deduped = [...new Map(urls.map((entry) => [entry.url, entry])).values()];
  const body = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...deduped.map((entry) => ["  <url>", `    <loc>${escapeXml(entry.url)}</loc>`, ...(entry.lastModified ? [`    <lastmod>${entry.lastModified}</lastmod>`] : []), "    <changefreq>daily</changefreq>", "    <priority>0.75</priority>", "  </url>"].join("\n")), "</urlset>"].join("\n");
  return new Response(body, { status: 200, headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" } });
}
