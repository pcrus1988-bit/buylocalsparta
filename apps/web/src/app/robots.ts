import type { MetadataRoute } from "next";
import { publicOrigin } from "../lib/public-origin";
import { ROBOTS_DISALLOW_PATHS } from "../lib/site-navigation";

export default function robots(): MetadataRoute.Robots {
  const origin = publicOrigin();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...ROBOTS_DISALLOW_PATHS]
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin
  };
}
