import type { SessionPrincipal } from "@buy-local-sparta/core";
import { assertAdminPermission } from "./admin-runtime";
import { getPublicProductSeoInventory } from "./catalog-view";
import { getPublicVendorDirectory } from "./public-vendor-directory";
import { getSeoEntityOverridesSnapshot } from "./seo-entity-overrides";
import { findSeoEntityOverride, resolveSeoEntityControl, type SeoEntityReference } from "./seo-entity-policy";
import { getSeoGlobalSettingsSnapshot } from "./seo-settings";
import { productPublicPath } from "./product-url";
import { productIndexEligibility, researchVendorIndexEligibility } from "./seo-visibility-policy";
import { FOOTER_NAVIGATION, HUMAN_SITEMAP_SECTIONS, INDEXABLE_STATIC_ROUTES, PRIMARY_NAVIGATION } from "./site-navigation";
import { STOREFRONT_CATEGORIES, storefrontCategoryForCode } from "./storefront-taxonomy";

export type SeoCrawlGraphNode = Readonly<{
  key: string;
  kind: "static" | "category" | "product" | "partner_vendor" | "research_vendor";
  label: string;
  route: string;
  indexAllowed: boolean;
  inboundSources: readonly string[];
}>;

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter(Boolean))];
}

function staticInboundSources(href: string): readonly string[] {
  if (href === "/") return ["Root entry point"];
  const sources: string[] = [];
  if (PRIMARY_NAVIGATION.some((link) => link.href === href)) sources.push("Global primary navigation");
  if (FOOTER_NAVIGATION.some((group) => group.links.some((link) => link.href === href))) sources.push("Global footer");
  if (HUMAN_SITEMAP_SECTIONS.some((section) => section.links.some((link) => link.href === href))) sources.push("/sitemap");
  return unique(sources);
}

export async function adminSeoCrawlGraph(principal: SessionPrincipal) {
  assertAdminPermission(principal, "content.read");
  const [[productResult, vendorResult], { settings }, overrides] = await Promise.all([
    Promise.allSettled([getPublicProductSeoInventory(), getPublicVendorDirectory()]),
    getSeoGlobalSettingsSnapshot(),
    getSeoEntityOverridesSnapshot()
  ]);
  const products = productResult.status === "fulfilled" ? productResult.value.products : [];
  const vendors = vendorResult.status === "fulfilled" ? vendorResult.value : [];
  const nodes: SeoCrawlGraphNode[] = [];

  const controlled = (reference: SeoEntityReference, entityEligible: boolean, defaultIndexAllowed: boolean) => {
    const override = findSeoEntityOverride(overrides.entries, reference);
    return resolveSeoEntityControl({ settings, kind: reference.kind, entityEligible, defaultIndexAllowed, override });
  };

  for (const route of INDEXABLE_STATIC_ROUTES) {
    const reference: SeoEntityReference = { kind: "static", id: route.href };
    nodes.push({
      key: `static:${route.href}`,
      kind: "static",
      label: route.label,
      route: route.href,
      indexAllowed: controlled(reference, true, true).indexAllowed,
      inboundSources: staticInboundSources(route.href)
    });
  }

  for (const category of STOREFRONT_CATEGORIES) {
    const reference: SeoEntityReference = { kind: "category", id: category.slug };
    nodes.push({
      key: `category:${category.slug}`,
      kind: "category",
      label: category.label,
      route: `/category/${category.slug}`,
      indexAllowed: controlled(reference, true, true).indexAllowed,
      inboundSources: ["Homepage category rail", "Category sibling discovery"]
    });
  }

  for (const product of products) {
    const reference: SeoEntityReference = { kind: "product", id: product.id };
    const quality = productIndexEligibility(product);
    const category = storefrontCategoryForCode(product.categoryCode);
    nodes.push({
      key: `product:${product.id}`,
      kind: "product",
      label: product.title,
      route: productPublicPath(product),
      indexAllowed: controlled(reference, quality.blockingReasons.length === 0, quality.eligible).indexAllowed,
      inboundSources: unique(["/shop catalogue", `/category/${category.slug}`])
    });
  }

  for (const vendor of vendors) {
    const isPartner = vendor.directoryStatus === "partner";
    const kind = isPartner ? "partner_vendor" as const : "research_vendor" as const;
    const reference: SeoEntityReference = { kind, id: vendor.id };
    const quality = researchVendorIndexEligibility(vendor, { enabled: true, minimumScore: settings.researchVendorMinimumScore });
    nodes.push({
      key: `${kind}:${vendor.id}`,
      kind,
      label: vendor.name,
      route: `/vendor/${encodeURIComponent(vendor.id)}`,
      indexAllowed: controlled(
        reference,
        isPartner || quality.blockingReasons.length === 0,
        isPartner || (settings.researchVendorIndexingEnabled && quality.eligible)
      ).indexAllowed,
      inboundSources: unique(["/shops directory", isPartner && vendor.adviser ? "/advice adviser discovery" : ""])
    });
  }

  const indexable = nodes.filter((node) => node.indexAllowed);
  const orphan = indexable.filter((node) => node.inboundSources.length === 0);
  const weak = indexable.filter((node) => node.inboundSources.length === 1 && node.route !== "/");
  const strong = indexable.filter((node) => node.inboundSources.length >= 2 || node.route === "/");

  return {
    generatedAt: new Date().toISOString(),
    csrfToken: principal.csrfToken,
    nodes: [...nodes].sort((a, b) => Number(b.indexAllowed) - Number(a.indexAllowed) || a.inboundSources.length - b.inboundSources.length || a.label.localeCompare(b.label, "el")),
    orphan,
    weak,
    metrics: {
      total: nodes.length,
      indexable: indexable.length,
      orphan: orphan.length,
      weak: weak.length,
      strong: strong.length
    },
    runtime: {
      productsAvailable: productResult.status === "fulfilled",
      vendorsAvailable: vendorResult.status === "fulfilled"
    }
  } as const;
}
