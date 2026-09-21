import { getSeoGlobalSettingsSnapshot } from "../../lib/seo-settings";
import { PRODUCT_SITEMAP_SHARD_COUNT } from "../../lib/product-sitemap-inventory";

export const dynamic = "force-dynamic";

const SITEMAP_BROWSER_CACHE = "public, max-age=300";
const SITEMAP_CDN_CACHE = "public, s-maxage=900, stale-while-revalidate=3600, stale-if-error=86400";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export async function GET(): Promise<Response> {
  const { settings } = await getSeoGlobalSettingsSnapshot();
  const origin = settings.canonicalOrigin;
  const sitemapUrls = settings.indexingEnabled
    ? [
        new URL("/sitemaps/core/sitemap.xml", `${origin}/`).toString(),
        ...(settings.sitemap.products
          ? Array.from({ length: PRODUCT_SITEMAP_SHARD_COUNT }, (_, shard) =>
              new URL(`/sitemaps/products/${shard}.xml`, `${origin}/`).toString()
            )
          : [])
      ]
    : [];

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...sitemapUrls.map((url) => `  <sitemap><loc>${escapeXml(url)}</loc></sitemap>`),
    "</sitemapindex>"
  ].join("\n");

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": SITEMAP_BROWSER_CACHE,
      "CDN-Cache-Control": SITEMAP_CDN_CACHE,
      "Vercel-CDN-Cache-Control": SITEMAP_CDN_CACHE
    }
  });
}
