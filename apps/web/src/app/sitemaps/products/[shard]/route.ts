import { getSeoGlobalSettingsSnapshot } from "../../../../lib/seo-settings";
import { getSeoEntityOverridesSnapshot } from "../../../../lib/seo-entity-overrides";
import { findSeoEntityOverride, resolveSeoEntityControl, type SeoEntityReference } from "../../../../lib/seo-entity-policy";
import { productPublicPath } from "../../../../lib/product-url";
import { getPublicProductSitemapInventoryShard, PRODUCT_SITEMAP_SHARD_COUNT } from "../../../../lib/product-sitemap-inventory";
import { productIndexEligibility } from "../../../../lib/seo-visibility-policy";

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

function emptySitemap(): string {
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
    + 'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"></urlset>';
}

/**
 * Product + image sitemap.
 *
 * Admission uses the authoritative live-offer projection from
 * product-sitemap-inventory rather than storefront read-model freshness. This keeps
 * organic indexability aligned with the same stock evidence used by commerce and
 * Merchant Center while exposing stable same-origin image URLs to Googlebot-Image.
 */
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
    return new Response(emptySitemap(), {
      status: 200,
      headers: { "Content-Type": "application/xml; charset=utf-8" }
    });
  }

  let products: Awaited<ReturnType<typeof getPublicProductSitemapInventoryShard>>;
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
    const override = findSeoEntityOverride(overrideSnapshot.entries, reference);
    const quality = productIndexEligibility(product);
    const control = resolveSeoEntityControl({
      settings,
      kind: reference.kind,
      entityEligible: quality.blockingReasons.length === 0,
      defaultIndexAllowed: quality.eligible,
      override
    });
    if (!control.sitemapAllowed) return [];

    const url = new URL(override?.canonicalPath ?? productPublicPath(product), `${origin}/`).toString();
    const imageUrl = product.mediaId
      ? new URL(`/api/media/${encodeURIComponent(product.mediaId)}`, `${origin}/`).toString()
      : product.sourceImageAvailable
        ? new URL(`/api/catalog-source-image/${encodeURIComponent(product.id)}`, `${origin}/`).toString()
        : undefined;

    return [{
      url,
      imageUrl,
      lastModified: safeLastModified(override?.lastReviewedAt)
    }];
  });

  const deduped = [...new Map(urls.map((entry) => [entry.url, entry])).values()];
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ...deduped.map((entry) => [
      "  <url>",
      `    <loc>${escapeXml(entry.url)}</loc>`,
      ...(entry.lastModified ? [`    <lastmod>${entry.lastModified}</lastmod>`] : []),
      ...(entry.imageUrl ? [
        "    <image:image>",
        `      <image:loc>${escapeXml(entry.imageUrl)}</image:loc>`,
        "    </image:image>"
      ] : []),
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
