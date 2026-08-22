import type { MetadataRoute } from "next";
import { getPublicCatalogProducts } from "../lib/catalog-view";
import { INDEXABLE_STATIC_ROUTES } from "../lib/site-navigation";
import { publicOrigin } from "../lib/public-origin";
import { getPublicVendorDirectory } from "../lib/public-vendor-directory";
import { vendorIndexEligible } from "../lib/seo-visibility-policy";
import { STOREFRONT_CATEGORIES } from "../lib/storefront-taxonomy";

export const dynamic = "force-dynamic";

function safeLastModified(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = publicOrigin();
  const fixed: MetadataRoute.Sitemap = [
    ...INDEXABLE_STATIC_ROUTES.map((route) => ({
      url: `${origin}${route.href === "/" ? "/" : route.href}`,
      changeFrequency: route.changeFrequency,
      priority: route.priority
    })),
    ...STOREFRONT_CATEGORIES.map((category) => ({
      url: `${origin}/category/${category.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.8
    }))
  ];

  const [products, vendors] = await Promise.allSettled([getPublicCatalogProducts(), getPublicVendorDirectory()]);
  if (products.status === "rejected") console.error(JSON.stringify({ level: "error", event: "seo.sitemap_products_failed", message: String(products.reason) }));
  if (vendors.status === "rejected") console.error(JSON.stringify({ level: "error", event: "seo.sitemap_vendors_failed", message: String(vendors.reason) }));

  const entries: MetadataRoute.Sitemap = [
    ...fixed,
    ...(products.status === "fulfilled" ? products.value.map((product) => ({
      url: `${origin}/product/${encodeURIComponent(product.id)}`,
      changeFrequency: "daily" as const,
      priority: 0.75
    })) : []),
    ...(vendors.status === "fulfilled" ? vendors.value
      .filter(vendorIndexEligible)
      .map((vendor) => ({
        url: `${origin}/vendor/${encodeURIComponent(vendor.id)}`,
        changeFrequency: vendor.directoryStatus === "partner" ? "weekly" as const : "monthly" as const,
        priority: vendor.directoryStatus === "partner" ? 0.7 : 0.6,
        lastModified: safeLastModified(vendor.research?.checkedAt)
      })) : [])
  ];

  return [...new Map(entries.map((entry) => [entry.url, entry])).values()];
}
