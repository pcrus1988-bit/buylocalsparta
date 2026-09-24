import type { MetadataRoute } from "next";
import { INDEXABLE_STATIC_ROUTES } from "../../../lib/site-navigation";
import { researchVendorIndexEligibility } from "../../../lib/seo-visibility-policy";
import { getSeoGlobalSettingsSnapshot } from "../../../lib/seo-settings";
import { getSeoEntityOverridesSnapshot } from "../../../lib/seo-entity-overrides";
import { absoluteSeoCanonical, findSeoEntityOverride, resolveSeoEntityControl, type SeoEntityReference } from "../../../lib/seo-entity-policy";
import { STOREFRONT_CATEGORIES } from "../../../lib/storefront-taxonomy";
import { getPublicCmsSitemapEntries } from "../../../lib/public-cms";
import { EDITORIAL_COLLECTIONS } from "../../../lib/editorial-collections";
import { getPublicVendorSitemapInventory } from "../../../lib/vendor-sitemap-inventory";

export const dynamic = "force-dynamic";

function safeLastModified(value: string | undefined): Date | undefined { if (!value) return undefined; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? undefined : parsed; }
function cmsLastModified(value: number): Date | undefined { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? undefined : parsed; }

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ settings }, overrideSnapshot] = await Promise.all([getSeoGlobalSettingsSnapshot(), getSeoEntityOverridesSnapshot()]);
  if (!settings.indexingEnabled) return [];
  const cmsEntries = settings.sitemap.staticPages ? await getPublicCmsSitemapEntries().catch((error) => { console.error(JSON.stringify({ level: "error", event: "seo.sitemap_cms_failed", message: String(error) })); return []; }) : [];
  const categories = settings.sitemap.categories ? STOREFRONT_CATEGORIES : [];
  const origin = settings.canonicalOrigin;
  const governed = (reference: SeoEntityReference, entityEligible: boolean, defaultIndexAllowed: boolean) => { const override = findSeoEntityOverride(overrideSnapshot.entries, reference); const control = resolveSeoEntityControl({ settings, kind: reference.kind, entityEligible, defaultIndexAllowed, override }); return { override, control }; };
  // Only explicitly indexable static routes belong in the XML sitemap. Legal/
  // utility pages may stay publicly linked without being advertised to Google as
  // indexable; adding /terms here while request policy says noindex produced a
  // direct sitemap-versus-X-Robots contradiction.
  const staticRoutes = INDEXABLE_STATIC_ROUTES;
  const fixed: MetadataRoute.Sitemap = [
    ...(settings.sitemap.staticPages ? staticRoutes.flatMap((route) => { const reference: SeoEntityReference = { kind: "static", id: route.href }; const { override, control } = governed(reference, true, true); return control.sitemapAllowed ? [{ url: absoluteSeoCanonical(origin, reference, override), changeFrequency: route.changeFrequency, priority: route.priority, lastModified: safeLastModified(override?.lastReviewedAt) }] : []; }) : []),
    ...(settings.sitemap.staticPages ? EDITORIAL_COLLECTIONS.map((collection) => ({ url: new URL(`/collections/${collection.slug}`, `${origin}/`).toString(), changeFrequency: "weekly" as const, priority: 0.78 })) : []),
    ...(settings.sitemap.categories ? categories.flatMap((category) => { const reference: SeoEntityReference = { kind: "category", id: category.slug }; const { override, control } = governed(reference, true, true); return control.sitemapAllowed ? [{ url: absoluteSeoCanonical(origin, reference, override), changeFrequency: "daily" as const, priority: 0.8, lastModified: safeLastModified(override?.lastReviewedAt) }] : []; }) : []),
    ...(settings.sitemap.staticPages ? cmsEntries.flatMap((entry) => { const reference: SeoEntityReference = { kind: "static", id: entry.path }; const { override, control } = governed(reference, true, true); if (!control.sitemapAllowed) return []; const languages = entry.alternates ? Object.fromEntries(Object.entries(entry.alternates).map(([locale, path]) => [locale, new URL(path!, `${origin}/`).toString()])) : undefined; return [{ url: new URL(override?.canonicalPath ?? entry.path, `${origin}/`).toString(), changeFrequency: entry.changeFrequency, priority: entry.priority, lastModified: safeLastModified(override?.lastReviewedAt) ?? cmsLastModified(entry.lastModified), alternates: languages && Object.keys(languages).length ? { languages } : undefined }]; }) : [])
  ];
  let vendors: Awaited<ReturnType<typeof getPublicVendorSitemapInventory>> | null = null;
  if (settings.sitemap.partnerVendors || settings.sitemap.researchVendors) { try { vendors = await getPublicVendorSitemapInventory(); } catch (error) { console.error(JSON.stringify({ level: "error", event: "seo.sitemap_vendors_failed", message: String(error) })); throw error; } }
  const entries: MetadataRoute.Sitemap = [...fixed, ...(vendors ? vendors.flatMap((vendor) => { const isPartner = vendor.directoryStatus === "partner"; if (isPartner && !settings.sitemap.partnerVendors) return []; if (!isPartner && !settings.sitemap.researchVendors) return []; const reference: SeoEntityReference = { kind: isPartner ? "partner_vendor" : "research_vendor", id: vendor.id }; const quality = researchVendorIndexEligibility(vendor, { enabled: true, minimumScore: settings.researchVendorMinimumScore }); const { override, control } = governed(reference, isPartner || quality.blockingReasons.length === 0, isPartner || (settings.researchVendorIndexingEnabled && quality.eligible)); return control.sitemapAllowed ? [{ url: absoluteSeoCanonical(origin, reference, override), changeFrequency: isPartner ? "weekly" as const : "monthly" as const, priority: isPartner ? 0.7 : 0.6, lastModified: safeLastModified(override?.lastReviewedAt ?? vendor.research?.checkedAt) }] : []; }) : [])];
  return [...new Map(entries.map((entry) => [entry.url, entry])).values()];
}
