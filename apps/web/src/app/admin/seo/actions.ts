"use server";

import { revalidatePath } from "next/cache";
import { assertAdminCsrf, assertAdminPermission } from "../../../lib/admin-runtime";
import { adminSeoWorkspace } from "../../../lib/admin-seo-runtime";
import { adminSeoCrawlGraph } from "../../../lib/seo-crawl-graph";
import { getAdminSession } from "../../../lib/admin-session";
import { getCanonicalProductSummary } from "../../../lib/catalog-view";
import { getPublicVendorDirectoryEntry } from "../../../lib/public-vendor-directory";
import { INDEXABLE_STATIC_ROUTES } from "../../../lib/site-navigation";
import { updateSeoEntityOverride } from "../../../lib/seo-entity-overrides";
import { createSeoDiagnosticReport } from "../../../lib/seo-diagnostic-reports";
import { isSeoEntityKind, routeForSeoEntity, type SeoEntityKind } from "../../../lib/seo-entity-policy";
import { productPublicPath } from "../../../lib/product-url";
import { updateSeoGlobalSettings } from "../../../lib/seo-settings";
import { storefrontCategoryBySlug } from "../../../lib/storefront-taxonomy";

export type SeoSettingsActionState = Readonly<{
  status: "idle" | "success" | "error";
  message?: string;
}>;

export type SeoEntityOverrideActionState = SeoSettingsActionState;
export type SeoDiagnosticReportActionState = SeoSettingsActionState;

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function checked(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}

function keywords(formData: FormData): readonly string[] {
  return field(formData, "keywords").split(/[\n,]+/).map((value) => value.trim()).filter(Boolean);
}

async function assertSeoEntityExists(kind: SeoEntityKind, id: string): Promise<string> {
  if (kind === "static") {
    if (!INDEXABLE_STATIC_ROUTES.some((route) => route.href === id)) throw new Error("The selected static page is not in the governed public registry.");
    return id;
  }
  if (kind === "category") {
    if (!storefrontCategoryBySlug(id)) throw new Error("The selected public category no longer exists.");
    return routeForSeoEntity({ kind, id });
  }
  if (kind === "product") {
    const product = await getCanonicalProductSummary(id);
    if (!product) throw new Error("The selected canonical product is not publicly admitted.");
    return productPublicPath(product);
  }
  const vendor = await getPublicVendorDirectoryEntry(id);
  if (!vendor) throw new Error("The selected public vendor dossier no longer exists.");
  const expected = vendor.directoryStatus === "partner" ? "partner_vendor" : "research_vendor";
  if (kind !== expected) throw new Error("The selected vendor classification changed. Refresh the registry before saving.");
  return routeForSeoEntity({ kind, id });
}

export async function updateSeoGlobalSettingsAction(
  _previous: SeoSettingsActionState,
  formData: FormData
): Promise<SeoSettingsActionState> {
  try {
    const principal = await getAdminSession();
    if (!principal) throw new Error("ADMIN_AUTH_REQUIRED");
    assertAdminPermission(principal, "content.write");
    assertAdminCsrf(principal, field(formData, "csrfToken"));

    await updateSeoGlobalSettings({
      principal,
      expectedVersion: Number(field(formData, "expectedVersion")),
      reason: field(formData, "reason"),
      emergencyConfirmation: field(formData, "emergencyConfirmation") || undefined,
      settings: {
        canonicalOrigin: field(formData, "canonicalOrigin"),
        siteName: field(formData, "siteName"),
        defaultTitle: field(formData, "defaultTitle"),
        titleTemplate: field(formData, "titleTemplate"),
        defaultDescription: field(formData, "defaultDescription"),
        defaultOpenGraphTitle: field(formData, "defaultOpenGraphTitle"),
        defaultOpenGraphDescription: field(formData, "defaultOpenGraphDescription"),
        defaultOpenGraphImage: field(formData, "defaultOpenGraphImage") || undefined,
        googleSiteVerification: field(formData, "googleSiteVerification") || undefined,
        indexingEnabled: checked(formData, "indexingEnabled"),
        researchVendorIndexingEnabled: checked(formData, "researchVendorIndexingEnabled"),
        researchVendorMinimumScore: Number(field(formData, "researchVendorMinimumScore")),
        publicMediaCrawlEnabled: checked(formData, "publicMediaCrawlEnabled"),
        sitemap: {
          staticPages: checked(formData, "sitemapStaticPages"),
          categories: checked(formData, "sitemapCategories"),
          products: checked(formData, "sitemapProducts"),
          partnerVendors: checked(formData, "sitemapPartnerVendors"),
          researchVendors: checked(formData, "sitemapResearchVendors")
        }
      }
    });

    revalidatePath("/", "layout");
    revalidatePath("/robots.txt");
    revalidatePath("/sitemap.xml");
    revalidatePath("/admin/seo");
    return { status: "success", message: "SEO settings saved and audit evidence recorded." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to save SEO settings." };
  }
}

export async function updateSeoEntityOverrideAction(
  _previous: SeoEntityOverrideActionState,
  formData: FormData
): Promise<SeoEntityOverrideActionState> {
  try {
    const principal = await getAdminSession();
    if (!principal) throw new Error("ADMIN_AUTH_REQUIRED");
    assertAdminPermission(principal, "content.write");
    assertAdminCsrf(principal, field(formData, "csrfToken"));
    const kindValue = field(formData, "kind");
    if (!isSeoEntityKind(kindValue)) throw new Error("SEO entity kind is invalid.");
    const id = field(formData, "entityId");
    const deleting = field(formData, "intent") === "delete";
    let publicRoute = routeForSeoEntity({ kind: kindValue, id });
    if (!deleting) publicRoute = await assertSeoEntityExists(kindValue, id);
    else if (kindValue === "product") {
      const product = await getCanonicalProductSummary(id);
      if (product) publicRoute = productPublicPath(product);
    }

    await updateSeoEntityOverride({
      principal,
      expectedVersion: Number(field(formData, "expectedVersion")),
      reason: field(formData, "reason"),
      delete: deleting,
      draft: {
        kind: kindValue,
        id,
        indexDecision: field(formData, "indexDecision"),
        sitemapDecision: field(formData, "sitemapDecision"),
        schemaDecision: field(formData, "schemaDecision"),
        title: field(formData, "title") || undefined,
        description: field(formData, "description") || undefined,
        canonicalPath: field(formData, "canonicalPath") || undefined,
        openGraphTitle: field(formData, "openGraphTitle") || undefined,
        openGraphDescription: field(formData, "openGraphDescription") || undefined,
        openGraphImage: field(formData, "openGraphImage") || undefined,
        keywords: keywords(formData),
        editorialLabel: field(formData, "editorialLabel") || undefined,
        qualityStatus: field(formData, "qualityStatus")
      }
    });

    revalidatePath(publicRoute);
    if (publicRoute !== routeForSeoEntity({ kind: kindValue, id })) revalidatePath(routeForSeoEntity({ kind: kindValue, id }));
    revalidatePath("/sitemap.xml");
    revalidatePath("/admin/seo");
    return { status: "success", message: deleting ? "SEO entity override deleted; generated defaults are authoritative again." : "SEO entity override saved and audit evidence recorded." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to save the SEO entity override." };
  }
}

export async function createSeoDiagnosticReportAction(
  _previous: SeoDiagnosticReportActionState,
  formData: FormData
): Promise<SeoDiagnosticReportActionState> {
  try {
    const principal = await getAdminSession();
    if (!principal) throw new Error("ADMIN_AUTH_REQUIRED");
    assertAdminPermission(principal, "content.write");
    assertAdminCsrf(principal, field(formData, "csrfToken"));

    const [workspace, crawl] = await Promise.all([
      adminSeoWorkspace(principal),
      adminSeoCrawlGraph(principal)
    ]);
    const crawlDiagnostics = [
      ...(crawl.metrics.orphan > 0 ? [{
        id: "crawl-orphans",
        severity: "warning" as const,
        title: "Indexable orphan pages detected",
        detail: "These governed indexable pages currently have no stable internal discovery source in the crawl graph. Add a meaningful internal link or intentionally remove index eligibility.",
        count: crawl.metrics.orphan
      }] : []),
      ...(crawl.metrics.weak > 0 ? [{
        id: "crawl-weak-links",
        severity: "info" as const,
        title: "Weakly linked indexable pages detected",
        detail: "These indexable pages currently depend on only one stable internal discovery source. Strengthening contextual internal links can improve crawl resilience.",
        count: crawl.metrics.weak
      }] : []),
      ...(crawl.metrics.orphan === 0 && crawl.metrics.weak === 0 ? [{
        id: "crawl-link-health",
        severity: "good" as const,
        title: "Indexable crawl graph has resilient internal links",
        detail: "No governed indexable page is currently orphaned or dependent on a single stable internal discovery source."
      }] : [])
    ];
    const report = await createSeoDiagnosticReport({
      principal,
      reason: field(formData, "reason"),
      sourceGeneratedAt: workspace.generatedAt,
      origin: workspace.origin,
      metrics: {
        ...workspace.metrics,
        crawlIndexable: crawl.metrics.indexable,
        crawlOrphans: crawl.metrics.orphan,
        crawlWeak: crawl.metrics.weak
      },
      routeClassCounts: workspace.routeClassCounts,
      runtime: workspace.runtime,
      diagnostics: [...workspace.diagnostics, ...crawlDiagnostics]
    });

    revalidatePath("/admin/seo");
    revalidatePath("/admin/seo/crawl");
    return { status: "success", message: `SEO diagnostic report ${report.id} saved with crawl-graph health and audit evidence recorded.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to save the SEO diagnostic report." };
  }
}
