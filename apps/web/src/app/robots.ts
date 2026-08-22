import type { MetadataRoute } from "next";
import { publicOrigin } from "../lib/public-origin";

export default function robots(): MetadataRoute.Robots {
  const origin = publicOrigin();
  return {
    rules: {
      userAgent: "*",
      // Private HTML is protected by authentication/authorization and carries
      // noindex directives/headers. Let crawlers reach those responses so the
      // noindex signal can actually be processed instead of relying on robots.txt
      // as a privacy mechanism.
      allow: ["/", "/api/media/"],
      // Keep system/API surfaces out of the crawl graph while explicitly allowing
      // approved public media used by Product/LocalBusiness structured data.
      disallow: ["/api/"]
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin
  };
}
