import type { MetadataRoute } from "next";
import { getPublicCatalogProducts } from "../lib/catalog-view";
import { getAvailableStorefrontCategories } from "../lib/available-catalog-taxonomy";
import { INDEXABLE_STATIC_ROUTES } from "../lib/site-navigation";
import { publicOrigin } from "../lib/public-origin";
import { getPublicVendorDirectory } from "../lib/public-vendor-directory";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = publicOrigin();
  const [categories, products, vendors] = await Promise.allSettled([
    getAvailableStorefrontCategories("23100"),
    getPublicCatalogProducts(),
    getPublicVendorDirectory()
  ]);

  if (categories.status === "rejected") console.error(JSON.stringify({ level: "error", event: "seo.sitemap_categories_failed", message: String(categories.reason) }));
  if (products.status === "rejected") console.error(JSON.stringify({ level: "error", event: "seo.sitemap_products_failed", message: String(products.reason) }));
  if (vendors.status === "rejected") console.error(JSON.stringify({ level: "error", event: "seo.sitemap_vendors_failed", message: String(vendors.reason) }));

  const fixed: MetadataRoute.Sitemap = [
    ...INDEXABLE_STATIC_ROUTES.map((route) => ({
      url: `${origin}${route.href === "/" ? "/" : route.href}`,
      changeFrequency: route.changeFrequency,
      priority: route.priority
    })),
    ...(categories.status === "fulfilled" ? categories.value.map((category) => ({
      url: `${origin}/category/${category.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.8
    })) : [])
  ];

  const entries: MetadataRoute.Sitemap = [
    ...fixed,
    ...(products.status === "fulfilled" ? products.value.map((product) => ({ url: `${origin}/product/${encodeURIComponent(product.id)}`, changeFrequency: "daily" as const, priority: 0.75 })) : []),
    ...(vendors.status === "fulfilled" ? vendors.value
      .filter((vendor) => vendor.directoryStatus === "partner")
      .map((vendor) => ({ url: `${origin}/vendor/${encodeURIComponent(vendor.id)}`, changeFrequency: "weekly" as const, priority: 0.7 })) : [])
  ];

  return [...new Map(entries.map((entry) => [entry.url, entry])).values()];
}
