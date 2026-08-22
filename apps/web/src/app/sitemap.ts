import type { MetadataRoute } from "next";
import { getPublicCatalogProducts } from "../lib/catalog-view";
import { INDEXABLE_STATIC_ROUTES } from "../lib/site-navigation";
import { getPublicVendorDirectory } from "../lib/public-vendor-directory";
import { researchVendorIndexEligibility } from "../lib/seo-visibility-policy";
import { getSeoGlobalSettingsSnapshot } from "../lib/seo-settings";
import { getSeoEntityOverridesSnapshot } from "../lib/seo-entity-overrides";
import { absoluteSeoCanonical, findSeoEntityOverride, resolveSeoEntityControl, type SeoEntityReference } from "../lib/seo-entity-policy";
import { STOREFRONT_CATEGORIES } from "../lib/storefront-taxonomy";

export const dynamic = "force-dynamic";

function safeLastModified(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ settings }, overrideSnapshot] = await Promise.all([
    getSeoGlobalSettingsSnapshot(),
    getSeoEntityOverridesSnapshot()
  ]);
  if (!settings.indexingEnabled) return [];
  const origin = settings.canonicalOrigin;
  const governed = (reference: SeoEntityReference, entityEligible: boolean, defaultIndexAllowed: boolean) => {
    const override = findSeoEntityOverride(overrideSnapshot.entries, reference);
    const control = resolveSeoEntityControl({ settings, kind: reference.kind, entityEligible, defaultIndexAllowed, override });
    return { override, control };
  };
  const fixed: MetadataRoute.Sitemap = [
    ...INDEXABLE_STATIC_ROUTES.flatMap((route) => {
      const reference: SeoEntityReference = { kind: "static", id: route.href };
      const { override, control } = governed(reference, true, true);
      return control.sitemapAllowed ? [{
        url: absoluteSeoCanonical(origin, reference, override),
        changeFrequency: route.changeFrequency,
        priority: route.priority,
        lastModified: safeLastModified(override?.lastReviewedAt)
      }] : [];
    }),
    ...STOREFRONT_CATEGORIES.flatMap((category) => {
      const reference: SeoEntityReference = { kind: "category", id: category.slug };
      const { override, control } = governed(reference, true, true);
      return control.sitemapAllowed ? [{
        url: absoluteSeoCanonical(origin, reference, override),
        changeFrequency: "daily" as const,
        priority: 0.8,
        lastModified: safeLastModified(override?.lastReviewedAt)
      }] : [];
    })
  ];

  const [products, vendors] = await Promise.allSettled([getPublicCatalogProducts(), getPublicVendorDirectory()]);
  if (products.status === "rejected") console.error(JSON.stringify({ level: "error", event: "seo.sitemap_products_failed", message: String(products.reason) }));
  if (vendors.status === "rejected") console.error(JSON.stringify({ level: "error", event: "seo.sitemap_vendors_failed", message: String(vendors.reason) }));

  const entries: MetadataRoute.Sitemap = [
    ...fixed,
    ...(products.status === "fulfilled" ? products.value.flatMap((product) => {
      const reference: SeoEntityReference = { kind: "product", id: product.id };
      const { override, control } = governed(reference, true, true);
      return control.sitemapAllowed ? [{
        url: absoluteSeoCanonical(origin, reference, override),
        changeFrequency: "daily" as const,
        priority: 0.75,
        lastModified: safeLastModified(override?.lastReviewedAt)
      }] : [];
    }) : []),
    ...(vendors.status === "fulfilled" ? vendors.value
      .flatMap((vendor) => {
        const isPartner = vendor.directoryStatus === "partner";
        const reference: SeoEntityReference = { kind: isPartner ? "partner_vendor" : "research_vendor", id: vendor.id };
        const quality = researchVendorIndexEligibility(vendor, { enabled: true, minimumScore: settings.researchVendorMinimumScore });
        const { override, control } = governed(
          reference,
          isPartner || quality.blockingReasons.length === 0,
          isPartner || (settings.researchVendorIndexingEnabled && quality.eligible)
        );
        return control.sitemapAllowed ? [{
          url: absoluteSeoCanonical(origin, reference, override),
          changeFrequency: isPartner ? "weekly" as const : "monthly" as const,
          priority: isPartner ? 0.7 : 0.6,
          lastModified: safeLastModified(override?.lastReviewedAt ?? vendor.research?.checkedAt)
        }] : [];
      }) : [])
  ];

  return [...new Map(entries.map((entry) => [entry.url, entry])).values()];
}
