import type { MetadataRoute } from "next";
import { publicOrigin } from "../lib/public-origin";

export default function robots(): MetadataRoute.Robots {
  const origin = publicOrigin();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/account", "/admin", "/api", "/cart", "/checkout", "/login", "/vendor/advice", "/vendor/analytics", "/vendor/catalog", "/vendor/finance", "/vendor/login", "/vendor/returns", "/vendor/shipping", "/vendor/trust"]
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin
  };
}
