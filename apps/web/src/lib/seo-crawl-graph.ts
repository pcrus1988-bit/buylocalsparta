import { localePath, type SessionPrincipal } from "@buy-local-sparta/core";
import { assertAdminPermission } from "./admin-runtime";
import { getPublicCmsPages } from "./public-cms";
import { getPublicProductSitemapInventory } from "./product-sitemap-inventory";
import { getPublicVendorSitemapInventory } from "./vendor-sitemap-inventory";
import { getSeoEntityOverridesSnapshot } from "./seo-entity-overrides";
import { absoluteSeoCanonical, findSeoEntityOverride, resolveSeoEntityControl, type SeoEntityReference } from "./seo-entity-policy";
import { getSeoGlobalSettingsSnapshot } from "./seo-settings";
import { productPublicPath } from "./product-url";
import { productIndexEligibility, researchVendorIndexEligibility } from "./seo-visibility-policy";
import { FOOTER_NAVIGATION, HUMAN_SITEMAP_SECTIONS, INDEXABLE_STATIC_ROUTES, PRIMARY_NAVIGATION } from "./site-navigation";
import { STOREFRONT_CATEGORIES, storefrontCategoryForCode } from "./storefront-taxonomy";

export type SeoCrawlGraphNode = Readonly<{
  key: string;
  kind: "static" | "cms" | "category" | "product" | "partner_vendor" | "research_vendor";
  label: string;
  route: string;
  canonicalUrl: string;
  indexAllowed: boolean;
  sitemapAllowed: boolean;
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
  const [[productResult, vendorResult, cmsResult], { settings }, overrides] = await Promise.all([
    Promise.allSettled([
      getPublicProductSitemapInventory(),
      getPublicVendorSitemapInventory(),
      getPublicCmsPages()
    ]),
    getSeoGlobalSettingsSnapshot(),
    getSeoEntityOverridesSnapshot()
  ]);
  const products = productResult.status === "fulfilled" ? productResult.value : [];
  const vendors = vendorResult.status === "fulfilled" ? vendorResult.value : [];
  const cmsPages = cmsResult.status === "fulfilled" ? cmsResult.value : [];
  const nodes: SeoCrawlGraphNode[] = [];

  const controlled = (reference: SeoEntityReference, entityEligible: boolean, defaultIndexAllowed: boolean, defaultSitemapAllowed?: boolean) => {
    const override = findSeoEntityOverride(overrides.entries, reference);
    const control = resolveSeoEntityControl({ settings, kind: reference.kind, entityEligible, defaultIndexAllowed, defaultSitemapAllowed, override });
    return { override, control };
  };

  for (const route of INDEXABLE_STATIC_ROUTES) {
    const reference: SeoEntityReference = { kind: "static", id: route.href };
    const { override, control } = controlled(reference, true, true);
    nodes.push({
      key: `static:${route.href}`,
      kind: "static",
      label: route.label,
      route: route.href,
      canonicalUrl: absoluteSeoCanonical(settings.canonicalOrigin, reference, override),
      indexAllowed: control.indexAllowed,
      sitemapAllowed: control.sitemapAllowed,
      inboundSources: staticInboundSources(route.href)
    });
  }

  for (const page of cmsPages) {
    for (const locale of ["el", "en"] as const) {
      const translation = page.translations[locale];
      if (!translation) continue;
      const route = localePath(locale, page.slug);
      const reference: SeoEntityReference = { kind: "static", id: route };
      const { override, control } = controlled(reference, true, !translation.seo.noindex);
      nodes.push({
        key: `cms:${page.id}:${locale}`,
        kind: "cms",
        label: translation.title,
        route,
        canonicalUrl: absoluteSeoCanonical(settings.canonicalOrigin, reference, override),
        indexAllowed: control.indexAllowed,
        sitemapAllowed: control.sitemapAllowed,
        inboundSources: control.sitemapAllowed ? ["/sitemap governed CMS directory"] : []
      });
    }
  }

  // Categories are governed landing pages. Their crawl/index inventory must not
  // disappear merely because a live catalogue facet aggregation is slow or empty.
  // This mirrors the production core sitemap and keeps Admin SEO diagnostics stable.
  for (const category of STOREFRONT_CATEGORIES) {
    const reference: SeoEntityReference = { kind: "category", id: category.slug };
    const { override, control } = controlled(reference, true, true, true);
    nodes.push({
      key: `category:${category.slug}`,
      kind: "category",
      label: category.label,
      route: `/category/${category.slug}`,
      canonicalUrl: absoluteSeoCanonical(settings.canonicalOrigin, reference, override),
      indexAllowed: control.indexAllowed,
      sitemapAllowed: control.sitemapAllowed,
      inboundSources: ["Homepage category rail", "Category sibling discovery"]
    });
  }

  // Use the same scale-safe, sellable product projection that drives product XML
  // sitemaps. This keeps the SEO registry representative of the current catalogue
  // instead of loading the older storefront-heavy projection that stalled after the
  // dropshipping catalogue expansion.
  for (const product of products) {
    const reference: SeoEntityReference = { kind: "product", id: product.id };
    const quality = productIndexEligibility(product);
    const category = storefrontCategoryForCode(product.categoryCode);
    const { override, control } = controlled(reference, quality.blockingReasons.length === 0, quality.eligible);
    const route = productPublicPath(product);
    nodes.push({
      key: `product:${product.id}`,
      kind: "product",
      label: product.title,
      route,
      canonicalUrl: new URL(override?.canonicalPath ?? route, `${settings.canonicalOrigin}/`).toString(),
      indexAllowed: control.indexAllowed,
      sitemapAllowed: control.sitemapAllowed,
      inboundSources: unique(["/shop catalogue", `/category/${category.slug}`])
    });
  }

  // Use the dedicated lightweight sitemap/vendor SEO projection rather than the
  // storefront UI projection with stories, advisers, media and assortment joins.
  for (const vendor of vendors) {
    const isPartner = vendor.directoryStatus === "partner";
    const kind = isPartner ? "partner_vendor" as const : "research_vendor" as const;
    const reference: SeoEntityReference = { kind, id: vendor.id };
    const quality = researchVendorIndexEligibility(vendor, { enabled: true, minimumScore: settings.researchVendorMinimumScore });
    const { override, control } = controlled(
      reference,
      isPartner || quality.blockingReasons.length === 0,
      isPartner || (settings.researchVendorIndexingEnabled && quality.eligible)
    );
    nodes.push({
      key: `${kind}:${vendor.id}`,
      kind,
      label: vendor.name,
      route: `/vendor/${encodeURIComponent(vendor.id)}`,
      canonicalUrl: absoluteSeoCanonical(settings.canonicalOrigin, reference, override),
      indexAllowed: control.indexAllowed,
      sitemapAllowed: control.sitemapAllowed,
      inboundSources: unique([
        "/shops directory",
        control.sitemapAllowed ? "/sitemap governed vendor directory" : ""
      ])
    });
  }

  const indexable = nodes.filter((node) => node.indexAllowed);
  const orphan = indexable.filter((node) => node.inboundSources.length === 0);
  const weak = indexable.filter((node) => node.inboundSources.length === 1 && node.route !== "/");
  const strong = indexable.filter((node) => node.inboundSources.length >= 2 || node.route === "/");

  return {
    generatedAt: new Date().toISOString(),
    csrfToken: principal.csrfToken,
    origin: settings.canonicalOrigin,
    nodes: [...nodes].sort((a, b) => Number(b.indexAllowed) - Number(a.indexAllowed) || a.inboundSources.length - b.inboundSources.length || a.label.localeCompare(b.label, "el")),
    orphan,
    weak,
    metrics: {
      total: nodes.length,
      indexable: indexable.length,
      sitemap: nodes.filter((node) => node.sitemapAllowed).length,
      orphan: orphan.length,
      weak: weak.length,
      strong: strong.length
    },
    runtime: {
      productsAvailable: productResult.status === "fulfilled",
      vendorsAvailable: vendorResult.status === "fulfilled",
      cmsAvailable: cmsResult.status === "fulfilled",
      categoriesAvailable: true
    }
  } as const;
}
