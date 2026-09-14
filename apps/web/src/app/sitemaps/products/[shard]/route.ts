import { getSeoGlobalSettingsSnapshot } from "../../../../lib/seo-settings";
import { getSeoEntityOverridesSnapshot } from "../../../../lib/seo-entity-overrides";
import { findSeoEntityOverride, resolveSeoEntityControl, type SeoEntityReference } from "../../../../lib/seo-entity-policy";
import { productIndexEligibility } from "../../../../lib/seo-visibility-policy";
import { productPublicPath } from "../../../../lib/product-url";
import { getPublicProductSitemapInventoryShard, PRODUCT_SITEMAP_SHARD_COUNT } from "../../../../lib/product-sitemap-inventory";

export const dynamic = "force-dynamic";

type RouteContext = Readonly<{ params: Promise<{ shard: string }> }>;

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

  let products;
  try {
    products = await getPublicProductSitemapInventoryShard(shard);
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
    const quality = productIndexEligibility(product);
    const override = findSeoEntityOverride(overrideSnapshot.entries, reference);
    const control = resolveSeoEntityControl({
      settings,
      kind: reference.kind,
      entityEligible: quality.blockingReasons.length === 0,
      defaultIndexAllowed: quality.eligible,
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
