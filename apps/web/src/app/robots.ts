import type { MetadataRoute } from "next";
import { getSeoGlobalSettingsSnapshot } from "../lib/seo-settings";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const { settings } = await getSeoGlobalSettingsSnapshot();
  const origin = settings.canonicalOrigin;
  return {
    rules: {
      userAgent: "*",
      // Private HTML is protected by authentication/authorization and carries
      // noindex directives/headers. Let crawlers reach those responses so the
      // noindex signal can actually be processed instead of relying on robots.txt
      // as a privacy mechanism.
      allow: settings.publicMediaCrawlEnabled ? ["/", "/api/media/"] : "/",
      // Keep system/API surfaces out of the crawl graph while explicitly allowing
      // approved public media used by Product/LocalBusiness structured data.
      disallow: ["/api/"]
    },
    // When the emergency indexing switch is off, crawlers must still be able to
    // fetch public HTML and process its global noindex signal. We therefore remove
    // sitemap promotion but do not hide those pages behind a site-wide Disallow.
    sitemap: settings.indexingEnabled ? `${origin}/sitemap.xml` : undefined,
    host: origin
  };
}
