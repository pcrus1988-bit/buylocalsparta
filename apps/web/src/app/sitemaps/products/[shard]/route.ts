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
 * Admission uses the bounded sitemap projection from product-sitemap-inventory.
 * It consumes the public read model plus the incremental live-availability overlay,
 * avoiding repeated scans of the full live offer graph when Google fetches shards.
 */
export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const { shard: shardSegment } = await params;
  const rawShard = shardSegment.endsWith(".xml") ? shardSegment.slice(0, -4) : shardSegment;
  const shard = Number(rawShard);
  if (!/^\d+$/.test(rawShard) || !Number.isSafeInteger(shard) || shard < 0 || shard >= PRODUCT_SITEMAP_SHARD_COUNT) {
    return new Response("Not found", { status: 404 });
  }

  let settings: Awaited<ReturnType<typeof getSeoGlobalSettingsSnapshot>>["settings"];
  let overrideSnapshot: Awaited<ReturnType<typeof getSeoEntityOverridesSnapshot>>;
  let products: Awaited<ReturnType<typeof getPublicProductSitemapInventoryShard>>;

  try {
    // Keep crawler-facing reads sequential. The Vercel web runtime deliberately
    // uses a tiny PostgreSQL pool, so three parallel reads can queue behind each
    // other during catalogue pressure and turn a cache miss into a connection timeout.
    const settingsSnapshot = await getSeoGlobalSettingsSnapshot();
    settings = settingsSnapshot.settings;
    overrideSnapshot = await getSeoEntityOverridesSnapshot();
    products = await getPublicProductSitemapInventoryShard(shard);
  } catch (error) {
    // A public sitemap endpoint must remain fetchable even during temporary database
    // connection pressure. Return an empty, explicitly degraded sitemap rather than
    // a 5xx so crawlers can retry later without recording a server-error URL.
    console.error(JSON.stringify({ level: "error", event: "seo.product_sitemap_shard_degraded", shard, message: String(error) }));
    return new Response(emptySitemap(), {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "no-store",
        "Retry-After": "60",
        "X-Konta-Sitemap-Degraded": "1"
      }
    });
  }

  if (!settings.indexingEnabled || !settings.sitemap.products) {
    return new Response(emptySitemap(), {
      status: 200,
      headers: { "Content-Type": "application/xml; charset=utf-8" }
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
    // Prefer the governed supplier URL directly. During recovery the local image
    // proxy has produced intermittent Next runtime packaging failures and DB
    // connection timeouts; omitting a proxy-only image is safer than advertising
    // a crawler URL that can return 5xx. Product pages and Merchant feeds retain
    // their independent media projections.
    const imageUrl = product.sourceImageUrl;

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
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400"
    }
  });
}
