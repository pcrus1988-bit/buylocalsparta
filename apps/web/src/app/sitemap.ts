import type { MetadataRoute } from "next";
import { getPublicCatalogProducts } from "../lib/catalog-view";
import { publicOrigin } from "../lib/public-origin";
import { getPublicVendorDirectory } from "../lib/public-vendor-directory";
import { STOREFRONT_CATEGORIES } from "../lib/storefront-taxonomy";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = publicOrigin();
  const fixed: MetadataRoute.Sitemap = [
    { url: `${origin}/`, changeFrequency: "daily", priority: 1 },
    { url: `${origin}/shop`, changeFrequency: "daily", priority: 0.9 },
    { url: `${origin}/shops`, changeFrequency: "daily", priority: 0.85 },
    { url: `${origin}/advice`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${origin}/ask-local`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${origin}/join`, changeFrequency: "monthly", priority: 0.6 },
    ...STOREFRONT_CATEGORIES.map((category) => ({ url: `${origin}/category/${category.slug}`, changeFrequency: "daily" as const, priority: 0.8 }))
  ];
  const [products, vendors] = await Promise.allSettled([getPublicCatalogProducts(), getPublicVendorDirectory()]);
  if (products.status === "rejected") console.error(JSON.stringify({ level: "error", event: "seo.sitemap_products_failed", message: String(products.reason) }));
  if (vendors.status === "rejected") console.error(JSON.stringify({ level: "error", event: "seo.sitemap_vendors_failed", message: String(vendors.reason) }));
  return [
    ...fixed,
    ...(products.status === "fulfilled" ? products.value.map((product) => ({ url: `${origin}/product/${encodeURIComponent(product.id)}`, changeFrequency: "daily" as const, priority: 0.75 })) : []),
    ...(vendors.status === "fulfilled" ? vendors.value.map((vendor) => ({ url: `${origin}/vendor/${encodeURIComponent(vendor.id)}`, changeFrequency: "weekly" as const, priority: 0.7 })) : [])
  ];
}
