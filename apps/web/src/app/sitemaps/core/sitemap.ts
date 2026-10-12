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
import { getIndexableBrandGuideSitemapInventory } from "../../../lib/brand-guide-runtime";
import { listPublicClaimHubSlugs } from "../../../lib/hub-claim-runtime";
import { listVerifiedHubPartnerSlugs } from "../../../lib/hub-verified-partners";
import { getExpansionHubBySlug } from "../../../lib/expansion-hubs";
import { listVerifiedHubBusinessSitemapPaths } from "../../../lib/hub-business-sitemap";
import { listIndexReadyHubGemiSitemapSlugs } from "../../../lib/hub-gemi-sitemap";

export const dynamic = "force-dynamic";

function safeLastModified(value: string | undefined): Date | undefined { if (!value) return undefined; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? undefined : parsed; }
function cmsLastModified(value: number): Date | undefined { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? undefined : parsed; }

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ settings }, overrideSnapshot, brandGuides] = await Promise.all([
    getSeoGlobalSettingsSnapshot(),
    getSeoEntityOverridesSnapshot(),
    getIndexableBrandGuideSitemapInventory().catch((error) => {
      console.error(JSON.stringify({ level: "error", event: "seo.sitemap_brand_guides_failed", message: String(error) }));
      return [];
    })
  ]);
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
  // Hub pages qualify through Sparta, verified owner membership, or >=10 independently
  // published + SEO-approved GEMI directory records. Raw GEMI imports never qualify.
  const claimHubSlugs = settings.sitemap.staticPages
    ? await listPublicClaimHubSlugs().catch((error) => {
      console.error(JSON.stringify({ level: "error", event: "seo.sitemap_claim_hubs_failed", message: String(error) }));
      return [] as string[];
    })
    : [];
  const paidPlanHubSlugs = settings.sitemap.staticPages
    ? await listVerifiedHubPartnerSlugs().catch((error) => {
      console.error(JSON.stringify({ level: "error", event: "seo.sitemap_verified_hub_partners_failed", message: String(error) }));
      return [] as string[];
    })
    : [];
  const gemiHubSlugs = settings.sitemap.staticPages
    ? await listIndexReadyHubGemiSitemapSlugs().catch((error) => {
      console.error(JSON.stringify({ level: "error", event: "seo.sitemap_reviewed_gemi_hubs_failed", message: String(error) }));
      return [] as string[];
    })
    : [];
  const eligibleHubSlugs = settings.sitemap.staticPages
    ? [...new Set(["sparti", ...claimHubSlugs, ...paidPlanHubSlugs, ...gemiHubSlugs])]
        .filter((slug) => Boolean(getExpansionHubBySlug(slug)))
    : [];
  const hubEntries: MetadataRoute.Sitemap = eligibleHubSlugs.flatMap((slug) =>
    [`/hubs/${slug}`, ...(slug === "sparti" ? [] : [`/hubs/${slug}/business`])]
      .flatMap((path) => {
        const reference: SeoEntityReference = { kind: "static", id: path };
        const { override, control } = governed(reference, true, true);
        return control.sitemapAllowed ? [{
          url: absoluteSeoCanonical(origin, reference, override),
          changeFrequency: "weekly" as const,
          priority: slug === "sparti" ? 0.75 : 0.65
        }] : [];
      })
  );
  // Individually verified owner-controlled HUB pages must also be discoverable.
  // This inventory explicitly excludes unpublished or unreviewed GEMI census.
  const verifiedBusinessPaths = settings.sitemap.staticPages
    ? await listVerifiedHubBusinessSitemapPaths().catch((error) => {
      console.error(JSON.stringify({ level: "error", event: "seo.sitemap_verified_hub_businesses_failed", message: String(error) }));
      return [] as string[];
    })
    : [];
  const verifiedBusinessEntries: MetadataRoute.Sitemap = verifiedBusinessPaths.flatMap((path) => {
    const reference: SeoEntityReference = { kind: "static", id: path };
    const { override, control } = governed(reference, true, true);
    return control.sitemapAllowed ? [{
      url: absoluteSeoCanonical(origin, reference, override),
      changeFrequency: "weekly" as const,
      priority: 0.65
    }] : [];
  });
  const brandEntries: MetadataRoute.Sitemap = brandGuides.map((brand) => ({
    url: new URL(`/brands/${brand.slug}`, `${origin}/`).toString(),
    changeFrequency: "weekly" as const,
    priority: 0.72,
    lastModified: safeLastModified(brand.updatedAt)
  }));
  const entries: MetadataRoute.Sitemap = [...fixed, ...hubEntries, ...verifiedBusinessEntries, ...brandEntries, ...(vendors ? vendors.flatMap((vendor) => { const isPartner = vendor.directoryStatus === "partner"; if (isPartner && !settings.sitemap.partnerVendors) return []; if (!isPartner && !settings.sitemap.researchVendors) return []; const reference: SeoEntityReference = { kind: isPartner ? "partner_vendor" : "research_vendor", id: vendor.id }; const quality = researchVendorIndexEligibility(vendor, { enabled: true, minimumScore: settings.researchVendorMinimumScore }); const { override, control } = governed(reference, isPartner || quality.blockingReasons.length === 0, isPartner || (settings.researchVendorIndexingEnabled && quality.eligible)); return control.sitemapAllowed ? [{ url: new URL(override?.canonicalPath ?? `/vendor/${encodeURIComponent(vendor.slug)}`, `${origin}/`).toString(), changeFrequency: isPartner ? "weekly" as const : "monthly" as const, priority: isPartner ? 0.7 : 0.6, lastModified: safeLastModified(override?.lastReviewedAt ?? vendor.research?.checkedAt) }] : []; }) : [])];
  return [...new Map(entries.map((entry) => [entry.url, entry])).values()];
}
