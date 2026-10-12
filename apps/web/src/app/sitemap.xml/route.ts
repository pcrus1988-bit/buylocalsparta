import { getSeoGlobalSettingsSnapshot } from "../../lib/seo-settings";
import { PRODUCT_SITEMAP_SHARD_COUNT } from "../../lib/product-sitemap-inventory";
import { listIndexableHubGemiSitemapPaths } from "../../lib/hub-gemi-sitemap";

export const dynamic = "force-dynamic";

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
  // Include only GEMI profiles independently published and approved for SEO.
  // Temporary DB failures must not make the central sitemap index a 5xx.
  const hubGemiPaths = settings.indexingEnabled && settings.sitemap.staticPages
    ? await listIndexableHubGemiSitemapPaths().catch((error) => {
        console.error(JSON.stringify({ level: "error", event: "seo.hub_gemi_sitemap_index_degraded", message: String(error) }));
        return [] as string[];
      })
    : [];
  const sitemapUrls = settings.indexingEnabled
    ? [
        new URL("/sitemaps/core/sitemap.xml", `${origin}/`).toString(),
        ...(settings.sitemap.products
          ? Array.from({ length: PRODUCT_SITEMAP_SHARD_COUNT }, (_, shard) =>
              new URL(`/sitemaps/products/${shard}.xml`, `${origin}/`).toString()
            )
          : []),
        ...hubGemiPaths.map((path) => new URL(path, `${origin}/`).toString())
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
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600"
    }
  });
}
