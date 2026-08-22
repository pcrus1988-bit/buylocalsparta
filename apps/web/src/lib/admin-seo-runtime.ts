import type { SessionPrincipal } from "@buy-local-sparta/core";
import { assertAdminPermission } from "./admin-runtime";
import { getPublicCatalogProducts } from "./catalog-view";
import { approvedCatalogImages, governedPublicMediaEnabled } from "./public-media-service";
import { getPublicVendorDirectory } from "./public-vendor-directory";
import { publicOrigin } from "./public-origin";
import { INDEXABLE_STATIC_ROUTES, NON_INDEXABLE_PAGE_ROUTES } from "./site-navigation";
import { researchVendorIndexEligibility, SEO_ROUTE_POLICIES, type SeoVisibilityClass } from "./seo-visibility-policy";
import { getSeoGlobalSettingsSnapshot, getSeoSettingsAuditHistory } from "./seo-settings";
import { STOREFRONT_CATEGORIES } from "./storefront-taxonomy";
import { getSeoEntityOverrideAuditHistory, getSeoEntityOverridesSnapshot } from "./seo-entity-overrides";
import { getSeoDiagnosticReportsSnapshot } from "./seo-diagnostic-reports";
import {
  findSeoEntityOverride,
  resolveSeoEntityControl,
  routeForSeoEntity,
  seoEntityKey,
  type SeoEntityKind,
  type SeoEntityReference
} from "./seo-entity-policy";

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
  overrideDecision?: string;
}>;

export type AdminSeoEntityCandidate = Readonly<{
  key: string;
  kind: SeoEntityKind;
  id: string;
  label: string;
  route: string;
  generatedTitle: string;
  generatedDescription?: string;
  indexAllowed: boolean;
  sitemapAllowed: boolean;
  schemaAllowed: boolean;
  hasOverride: boolean;
  entityAvailable: boolean;
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

  const [inventory, settingsSnapshot, settingsAudit, entityOverrides, entityAudit, reports] = await Promise.all([
    Promise.allSettled([getPublicCatalogProducts(), getPublicVendorDirectory()]),
    getSeoGlobalSettingsSnapshot(),
    getSeoSettingsAuditHistory(),
    getSeoEntityOverridesSnapshot(),
    getSeoEntityOverrideAuditHistory(),
    getSeoDiagnosticReportsSnapshot()
  ]);
  const [productsResult, vendorsResult] = inventory;
  const settings = settingsSnapshot.settings;
  const products = productsResult.status === "fulfilled" ? productsResult.value : [];
  const vendors = vendorsResult.status === "fulfilled" ? vendorsResult.value : [];
  const partners = vendors.filter((vendor) => vendor.directoryStatus === "partner");
  const research = vendors.filter((vendor) => vendor.directoryStatus === "research");
  const candidates: AdminSeoEntityCandidate[] = [];
  const addCandidate = (input: {
    reference: SeoEntityReference;
    label: string;
    generatedTitle: string;
    generatedDescription?: string;
    entityEligible: boolean;
    defaultIndexAllowed: boolean;
    defaultSchemaAllowed?: boolean;
    entityAvailable?: boolean;
  }) => {
    const override = findSeoEntityOverride(entityOverrides.entries, input.reference);
    const control = resolveSeoEntityControl({
      settings,
      kind: input.reference.kind,
      entityEligible: input.entityEligible,
      defaultIndexAllowed: input.defaultIndexAllowed,
      defaultSchemaAllowed: input.defaultSchemaAllowed,
      override
    });
    candidates.push({
      key: seoEntityKey(input.reference),
      kind: input.reference.kind,
      id: input.reference.id,
      label: input.label,
      route: routeForSeoEntity(input.reference),
      generatedTitle: input.generatedTitle,
      generatedDescription: input.generatedDescription,
      indexAllowed: control.indexAllowed,
      sitemapAllowed: control.sitemapAllowed,
      schemaAllowed: control.schemaAllowed,
      hasOverride: Boolean(override),
      entityAvailable: input.entityAvailable ?? true
    });
  };

  for (const route of INDEXABLE_STATIC_ROUTES) addCandidate({
    reference: { kind: "static", id: route.href },
    label: `Static · ${route.label}`,
    generatedTitle: route.label,
    generatedDescription: route.description,
    entityEligible: true,
    defaultIndexAllowed: true
  });
  for (const category of STOREFRONT_CATEGORIES) addCandidate({
    reference: { kind: "category", id: category.slug },
    label: `Category · ${category.label}`,
    generatedTitle: category.label,
    generatedDescription: `${category.description} Ανακάλυψε τοπικά διαθέσιμα προϊόντα στη Σπάρτη.`,
    entityEligible: true,
    defaultIndexAllowed: true
  });
  for (const product of products) addCandidate({
    reference: { kind: "product", id: product.id },
    label: `Product · ${product.title}`,
    generatedTitle: product.title,
    generatedDescription: `${product.title} στο ΚΟΝΤΑ ΜΟΥ Sparta — τοπική διαθεσιμότητα, πραγματική συμβουλή και μία καθαρή εμπειρία αγοράς.`,
    entityEligible: true,
    defaultIndexAllowed: true,
    defaultSchemaAllowed: true
  });
  for (const vendor of vendors) {
    const reference: SeoEntityReference = { kind: vendor.directoryStatus === "partner" ? "partner_vendor" : "research_vendor", id: vendor.id };
    const quality = researchVendorIndexEligibility(vendor, { enabled: true, minimumScore: settings.researchVendorMinimumScore });
    const isPartner = vendor.directoryStatus === "partner";
    addCandidate({
      reference,
      label: `${isPartner ? "Partner" : "Research"} vendor · ${vendor.name}`,
      generatedTitle: `${vendor.name} · ${isPartner ? "Τοπικό κατάστημα" : "Τοπική επιχείρηση"}`,
      generatedDescription: vendor.story?.excerpt ?? `Δημόσια καταχώριση για το ${vendor.name} στη χαρτογραφημένη αγορά της Σπάρτης.`,
      entityEligible: isPartner || quality.blockingReasons.length === 0,
      defaultIndexAllowed: isPartner || (settings.researchVendorIndexingEnabled && quality.eligible),
      defaultSchemaAllowed: true
    });
  }
  const candidateKeys = new Set(candidates.map((candidate) => candidate.key));
  for (const override of entityOverrides.entries) {
    const key = seoEntityKey(override);
    if (candidateKeys.has(key)) continue;
    addCandidate({
      reference: { kind: override.kind, id: override.id },
      label: `Missing public entity · ${key}`,
      generatedTitle: override.title ?? override.editorialLabel ?? override.id,
      generatedDescription: "The source entity is no longer present in the public projection. Keep only if the disappearance is temporary; otherwise delete the override.",
      entityEligible: false,
      defaultIndexAllowed: false,
      defaultSchemaAllowed: false,
      entityAvailable: false
    });
  }
  candidates.sort((left, right) => left.label.localeCompare(right.label, "el"));
  const candidateByKey = new Map(candidates.map((candidate) => [candidate.key, candidate]));
  const researchRows: readonly AdminSeoResearchVendorRow[] = research.map((vendor) => {
    const eligibility = researchVendorIndexEligibility(vendor, { enabled: true, minimumScore: settings.researchVendorMinimumScore });
    const reference: SeoEntityReference = { kind: "research_vendor", id: vendor.id };
    const override = findSeoEntityOverride(entityOverrides.entries, reference);
    return {
      id: vendor.id,
      name: vendor.name,
      eligible: candidateByKey.get(seoEntityKey(reference))?.indexAllowed ?? false,
      score: eligibility.score,
      minimumScore: eligibility.minimumScore,
      reasons: eligibility.reasons,
      blockingReasons: eligibility.blockingReasons,
      checkedAt: vendor.research?.checkedAt,
      overrideDecision: override && (override.indexDecision !== "inherit" || override.qualityStatus !== "unreviewed")
        ? `${override.indexDecision} · ${override.qualityStatus}`
        : undefined
    };
  });

  const eligibleResearch = researchRows.filter((vendor) => vendor.eligible).length;
  const eligibleVendors = candidates.filter((candidate) => (candidate.kind === "partner_vendor" || candidate.kind === "research_vendor") && candidate.indexAllowed).length;
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

  const sitemapEstimatedCount = candidates.filter((candidate) => candidate.sitemapAllowed).length;
  const diagnostics: AdminSeoDiagnostic[] = [];

  if (!settings.indexingEnabled) diagnostics.push({ id: "global-indexing-disabled", severity: "critical", title: "Site-wide indexing is disabled", detail: "The emergency master switch removes sitemap promotion and publishes a global noindex signal. Public HTML remains crawlable so search engines can process that directive." });
  if (!settingsSnapshot.persistenceAvailable) diagnostics.push({ id: "seo-settings-persistence", severity: "warning", title: "SEO settings are using safe defaults", detail: "The settings store is unavailable in this runtime. Reads remain safe, but edits cannot be persisted here." });
  if (!entityOverrides.persistenceAvailable) diagnostics.push({ id: "seo-entity-persistence", severity: "warning", title: "SEO entity registry is using safe defaults", detail: "Page/entity overrides cannot be persisted in this runtime; generated metadata remains authoritative." });
  if (!reports.persistenceAvailable) diagnostics.push({ id: "seo-report-persistence", severity: "warning", title: "SEO report history is unavailable", detail: "Live diagnostics remain visible, but snapshots and governed exports cannot be persisted in this runtime." });
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
  const suppressedOverrides = entityOverrides.entries.filter((entry) => entry.qualityStatus === "suppressed").length;
  if (suppressedOverrides > 0) diagnostics.push({ id: "entity-suppression", severity: "info", title: "Entities intentionally suppressed", detail: "Governed entity overrides are actively keeping these public records out of indexing, sitemap promotion and schema output.", count: suppressedOverrides });
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
    entityOverrides,
    entityAudit,
    reports,
    entityCandidates: candidates,
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
      knownNonIndexablePages: NON_INDEXABLE_PAGE_ROUTES.length,
      entityOverrides: entityOverrides.entries.length
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
