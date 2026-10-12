import { getSeoGlobalSettingsSnapshot } from "../../../../../lib/seo-settings";
import { getExpansionHubBySlug } from "../../../../../lib/expansion-hubs";
import {
  GEMI_HUB_SITEMAP_MAX_SHARDS_PER_HUB,
  listIndexableHubGemiSitemapPage
} from "../../../../../lib/hub-gemi-sitemap";

export const dynamic = "force-dynamic";
type Context = Readonly<{ params: Promise<{ hubSlug: string; shard: string }> }>;
const EMPTY = '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>';

function xml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

/** Approved GEMI registry profiles only, deliberately not research imports. */
export async function GET(_request: Request, { params }: Context): Promise<Response> {
  const { hubSlug, shard: segment } = await params;
  const raw = segment.endsWith(".xml") ? segment.slice(0, -4) : segment;
  const shard = Number(raw);
  if (!getExpansionHubBySlug(hubSlug) || !/^(0|[1-9][0-9]*)$/.test(raw) ||
      !Number.isSafeInteger(shard) || shard >= GEMI_HUB_SITEMAP_MAX_SHARDS_PER_HUB) {
    return new Response("Not found", { status: 404 });
  }

  try {
    // Sequential reads avoid queueing small runtime PostgreSQL pools.
    const { settings } = await getSeoGlobalSettingsSnapshot();
    if (!settings.indexingEnabled || !settings.sitemap.staticPages) {
      return new Response(EMPTY, { status: 200, headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, s-maxage=900"
      } });
    }
    const paths = await listIndexableHubGemiSitemapPage(hubSlug, shard);
    const body = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...paths.map(path => "  <url><loc>" +
        xml(new URL(path, settings.canonicalOrigin + "/").toString()) +
        "</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>"),
      "</urlset>"
    ].join("\n");
    return new Response(body, { status: 200, headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600"
    } });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error", event: "seo.hub_gemi_sitemap_degraded",
      hub: hubSlug, shard, message: String(error)
    }));
    return new Response(EMPTY, { status: 200, headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": "60",
      "X-Konta-Sitemap-Degraded": "1"
    } });
  }
}
