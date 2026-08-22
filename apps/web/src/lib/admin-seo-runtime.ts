import type { SessionPrincipal } from "@buy-local-sparta/core";
import { assertAdminPermission } from "./admin-runtime";
import { getPublicCatalogProducts } from "./catalog-view";
import { approvedCatalogImages, governedPublicMediaEnabled } from "./public-media-service";
import { getPublicVendorDirectory } from "./public-vendor-directory";
import { publicOrigin } from "./public-origin";
import { INDEXABLE_STATIC_ROUTES, NON_INDEXABLE_PAGE_ROUTES } from "./site-navigation";
import { researchVendorIndexEligibility, SEO_ROUTE_POLICIES, vendorIndexEligible, type SeoVisibilityClass } from "./seo-visibility-policy";
import { getSeoGlobalSettingsSnapshot, getSeoSettingsAuditHistory } from "./seo-settings";
import { STOREFRONT_CATEGORIES } from "./storefront-taxonomy";

export type AdminSeoDiagnostic = Readonly<{
  id: string;
  severity: "critical" | "warning" | "info" | "good";
  title: string;
  detail: string;
  count?: number;
}>;

export type AdminSeoResearchVendorRow = Readonly<{
  id: string;
  name: string;
  eligible: boolean;
  score: number;
  minimumScore: number;
  reasons: readonly string[];
  blockingReasons: readonly string[];
  checkedAt?: string;
}>;

function duplicateValues(values: readonly string[]): readonly string[] {
  const counts = new Map<string, number>();
  for (const value of values.map((entry) => entry.trim().toLocaleLowerCase("el"))) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value);
}

async function approvedCatalogImageIds(productIds: readonly string[]): Promise<ReadonlySet<string>> {
  if (!governedPublicMediaEnabled() || productIds.length === 0) return new Set();
  const mediaIds = new Set<string>();
  for (let index = 0; index < productIds.length; index += 250) {
    const batch = productIds.slice(index, index + 250).map((canonicalVariantId) => ({ canonicalVariantId }));
    const images = await approvedCatalogImages(batch);
    for (const image of images) mediaIds.add(image.canonicalVariantId);
  }
  return mediaIds;
}

export async function adminSeoWorkspace(principal: SessionPrincipal) {
  assertAdminPermission(principal, "content.read");

  const [inventory, settingsSnapshot, settingsAudit] = await Promise.all([
    Promise.allSettled([getPublicCatalogProducts(), getPublicVendorDirectory()]),
    getSeoGlobalSettingsSnapshot(),
    getSeoSettingsAuditHistory()
  ]);
  const [productsResult, vendorsResult] = inventory;
  const settings = settingsSnapshot.settings;
  const researchPolicy = {
    enabled: settings.researchVendorIndexingEnabled,
    minimumScore: settings.researchVendorMinimumScore
  };

  const products = productsResult.status === "fulfilled" ? productsResult.value : [];
  const vendors = vendorsResult.status === "fulfilled" ? vendorsResult.value : [];
  const partners = vendors.filter((vendor) => vendor.directoryStatus === "partner");
  const research = vendors.filter((vendor) => vendor.directoryStatus === "research");
  const researchRows: readonly AdminSeoResearchVendorRow[] = research.map((vendor) => {
    const eligibility = researchVendorIndexEligibility(vendor, researchPolicy);
    return {
      id: vendor.id,
      name: vendor.name,
      eligible: eligibility.eligible,
      score: eligibility.score,
      minimumScore: eligibility.minimumScore,
      reasons: eligibility.reasons,
      blockingReasons: eligibility.blockingReasons,
      checkedAt: vendor.research?.checkedAt
    };
  });

  const eligibleResearch = researchRows.filter((vendor) => vendor.eligible).length;
  const eligibleVendors = vendors.filter((vendor) => vendorIndexEligible(vendor, researchPolicy)).length;
  const duplicateProductTitles = duplicateValues(products.map((product) => product.title));
  const missingProductTitles = products.filter((product) => !product.title.trim()).length;
  const missingProductCategories = products.filter((product) => !product.categoryCode.trim()).length;

  let productsWithApprovedImage = 0;
  let imageProjectionFailed = false;
  if (products.length > 0 && governedPublicMediaEnabled()) {
    try {
      productsWithApprovedImage = (await approvedCatalogImageIds(products.map((product) => product.id))).size;
    } catch {
      imageProjectionFailed = true;
    }
  }
  const productsMissingApprovedImage = governedPublicMediaEnabled() ? Math.max(0, products.length - productsWithApprovedImage) : products.length;

  const routeClassCounts = SEO_ROUTE_POLICIES.reduce<Record<SeoVisibilityClass, number>>((counts, policy) => {
    counts[policy.visibility] += 1;
    return counts;
  }, {
    PUBLIC_INDEXABLE: 0,
    PUBLIC_NOINDEX: 0,
    AUTHENTICATED_PRIVATE: 0,
    INTERNAL_SYSTEM: 0
  });

  const sitemapEstimatedCount = settings.indexingEnabled
    ? (settings.sitemap.staticPages ? INDEXABLE_STATIC_ROUTES.length : 0)
      + (settings.sitemap.categories ? STOREFRONT_CATEGORIES.length : 0)
      + (settings.sitemap.products ? products.length : 0)
      + (settings.sitemap.partnerVendors ? partners.length : 0)
      + (settings.sitemap.researchVendors ? eligibleResearch : 0)
    : 0;
  const diagnostics: AdminSeoDiagnostic[] = [];

  if (!settings.indexingEnabled) diagnostics.push({ id: "global-indexing-disabled", severity: "critical", title: "Site-wide indexing is disabled", detail: "The emergency master switch removes sitemap promotion and publishes a global noindex signal. Public HTML remains crawlable so search engines can process that directive." });
  if (!settingsSnapshot.persistenceAvailable) diagnostics.push({ id: "seo-settings-persistence", severity: "warning", title: "SEO settings are using safe defaults", detail: "The settings store is unavailable in this runtime. Reads remain safe, but edits cannot be persisted here." });
  if (!settings.researchVendorIndexingEnabled) diagnostics.push({ id: "research-indexing-disabled", severity: "info", title: "Research-vendor indexing disabled", detail: "Research dossiers can remain public for people, but global policy currently keeps them out of index eligibility." });
  if (productsResult.status === "rejected") diagnostics.push({ id: "products-unavailable", severity: "critical", title: "Product SEO inventory unavailable", detail: "The public canonical-product projection could not be read. Sitemap/product diagnostics are degraded." });
  if (vendorsResult.status === "rejected") diagnostics.push({ id: "vendors-unavailable", severity: "critical", title: "Vendor SEO inventory unavailable", detail: "The public vendor-directory projection could not be read. LocalBusiness diagnostics are degraded." });
  if (imageProjectionFailed) diagnostics.push({ id: "media-unavailable", severity: "warning", title: "Public media diagnostic degraded", detail: "Approved catalog-image projection could not be read; image completeness cannot be trusted for this run." });
  if (!governedPublicMediaEnabled()) diagnostics.push({ id: "media-disabled", severity: "warning", title: "Governed public media is not enabled", detail: "Product rich-result imagery will remain incomplete until the governed media pipeline/object storage is enabled." });
  if (!settings.publicMediaCrawlEnabled) diagnostics.push({ id: "media-crawling-disabled", severity: "warning", title: "Public-media crawling disabled", detail: "Approved public media can still be served to people, but robots.txt does not currently grant the /api/media/ crawler exception." });
  if (productsMissingApprovedImage > 0 && governedPublicMediaEnabled()) diagnostics.push({ id: "product-images", severity: "warning", title: "Products without approved public image", detail: "Public products should have an approved crawlable image before being treated as fully SEO-ready.", count: productsMissingApprovedImage });
  if (duplicateProductTitles.length > 0) diagnostics.push({ id: "duplicate-product-titles", severity: "warning", title: "Duplicate product titles", detail: "Duplicate titles weaken page differentiation and should be reviewed before catalogue scale-up.", count: duplicateProductTitles.length });
  if (missingProductTitles > 0 || missingProductCategories > 0) diagnostics.push({ id: "product-core-fields", severity: "critical", title: "Products missing core SEO fields", detail: `${missingProductTitles} missing title · ${missingProductCategories} missing category.`, count: missingProductTitles + missingProductCategories });
  if (research.length > eligibleResearch) diagnostics.push({ id: "research-quality", severity: "info", title: "Research vendors held back by quality gate", detail: "Model C is active, but records below the minimum local-search quality threshold are intentionally excluded from the sitemap.", count: research.length - eligibleResearch });
  if (settings.publicMediaCrawlEnabled) diagnostics.push({ id: "robots-media", severity: "good", title: "Approved public media crawler exception configured", detail: "robots.txt allows /api/media/ while keeping the broader API namespace out of the crawl graph." });
  diagnostics.push({ id: "private-noindex", severity: "good", title: "Private workspace search exclusion centralized", detail: `${NON_INDEXABLE_PAGE_ROUTES.length} known non-indexable page routes remain catalogued, with central X-Robots-Tag coverage for the main private route families.` });

  return {
    csrfToken: principal.csrfToken,
    generatedAt: new Date().toISOString(),
    origin: settings.canonicalOrigin || publicOrigin(),
    sitemapUrl: `${settings.canonicalOrigin || publicOrigin()}/sitemap.xml`,
    robotsUrl: `${settings.canonicalOrigin || publicOrigin()}/robots.txt`,
    settings: settingsSnapshot,
    settingsAudit,
    metrics: {
      staticIndexable: INDEXABLE_STATIC_ROUTES.length,
      categories: STOREFRONT_CATEGORIES.length,
      products: products.length,
      partners: partners.length,
      research: research.length,
      researchIndexEligible: eligibleResearch,
      vendorIndexEligible: eligibleVendors,
      sitemapEstimatedCount,
      productsWithApprovedImage,
      productsMissingApprovedImage,
      knownNonIndexablePages: NON_INDEXABLE_PAGE_ROUTES.length
    },
    routeClassCounts,
    researchVendors: [...researchRows].sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score || a.name.localeCompare(b.name, "el")),
    diagnostics,
    duplicateProductTitles,
    runtime: {
      databaseProductsAvailable: productsResult.status === "fulfilled",
      databaseVendorsAvailable: vendorsResult.status === "fulfilled",
      governedPublicMediaEnabled: governedPublicMediaEnabled()
    }
  } as const;
}
