import type { MetadataRoute } from "next";
import { getPublicProductSeoInventory } from "../lib/catalog-view";
import { INDEXABLE_STATIC_ROUTES } from "../lib/site-navigation";
import { getPublicVendorDirectory } from "../lib/public-vendor-directory";
import { productIndexEligibility, researchVendorIndexEligibility } from "../lib/seo-visibility-policy";
import { getSeoGlobalSettingsSnapshot } from "../lib/seo-settings";
import { getSeoEntityOverridesSnapshot } from "../lib/seo-entity-overrides";
import { absoluteSeoCanonical, findSeoEntityOverride, resolveSeoEntityControl, type SeoEntityReference } from "../lib/seo-entity-policy";
import { getAvailableStorefrontCategories } from "../lib/available-catalog-taxonomy";
import { productPublicPath } from "../lib/product-url";
import { getPublicCmsSitemapEntries } from "../lib/public-cms";

export const dynamic = "force-dynamic";

function safeLastModified(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function cmsLastModified(value: number): Date | undefined {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ settings }, overrideSnapshot] = await Promise.all([
    getSeoGlobalSettingsSnapshot(),
    getSeoEntityOverridesSnapshot()
  ]);
  if (!settings.indexingEnabled) return [];
  const [categories, cmsEntries] = await Promise.all([
    getAvailableStorefrontCategories("23100").catch((error) => {
      console.error(JSON.stringify({ level: "error", event: "seo.sitemap_categories_failed", message: String(error) }));
      return [];
    }),
    getPublicCmsSitemapEntries().catch((error) => {
      console.error(JSON.stringify({ level: "error", event: "seo.sitemap_cms_failed", message: String(error) }));
      return [];
    })
  ]);
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
    ...categories.flatMap((category) => {
      const reference: SeoEntityReference = { kind: "category", id: category.slug };
      const { override, control } = governed(reference, true, true);
      return control.sitemapAllowed ? [{
        url: absoluteSeoCanonical(origin, reference, override),
        changeFrequency: "daily" as const,
        priority: 0.8,
        lastModified: safeLastModified(override?.lastReviewedAt)
      }] : [];
    }),
    ...cmsEntries.flatMap((entry) => {
      const reference: SeoEntityReference = { kind: "static", id: entry.path };
      const { override, control } = governed(reference, true, true);
      if (!control.sitemapAllowed) return [];
      const languages = entry.alternates
        ? Object.fromEntries(Object.entries(entry.alternates).map(([locale, path]) => [locale, new URL(path!, `${origin}/`).toString()]))
        : undefined;
      return [{
        url: new URL(override?.canonicalPath ?? entry.path, `${origin}/`).toString(),
        changeFrequency: entry.changeFrequency,
        priority: entry.priority,
        lastModified: safeLastModified(override?.lastReviewedAt) ?? cmsLastModified(entry.lastModified),
        alternates: languages && Object.keys(languages).length ? { languages } : undefined
      }];
    })
  ];

  const [products, vendors] = await Promise.allSettled([getPublicProductSeoInventory(), getPublicVendorDirectory()]);
  if (products.status === "rejected") console.error(JSON.stringify({ level: "error", event: "seo.sitemap_products_failed", message: String(products.reason) }));
  if (vendors.status === "rejected") console.error(JSON.stringify({ level: "error", event: "seo.sitemap_vendors_failed", message: String(vendors.reason) }));

  const entries: MetadataRoute.Sitemap = [
    ...fixed,
    ...(products.status === "fulfilled" ? products.value.products.flatMap((product) => {
      const reference: SeoEntityReference = { kind: "product", id: product.id };
      const quality = productIndexEligibility(product);
      const { override, control } = governed(reference, quality.blockingReasons.length === 0, quality.eligible);
      // Product content spans canonical_variants, translations and approved media. The
      // current schema does not expose one trustworthy public-content update clock across
      // all three, so do not manufacture freshness from Date.now(), deployment time or
      // canonical_variants.updated_at alone. An explicit governed review date is honest.
      return control.sitemapAllowed ? [{
        url: new URL(override?.canonicalPath ?? productPublicPath(product), `${origin}/`).toString(),
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
